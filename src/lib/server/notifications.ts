/**
 * Envío de avisos a los embajadores por Slack (DM del bot) y push (Web Push).
 * Solo servidor. La configuración vive en notification_config/{orgId} y cada
 * envío queda en notification_log; el id del registro evita duplicados.
 */

import { createHash } from 'crypto';
import webpush from 'web-push';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { getSlackToken, postSlackMessage, slackErrorText } from './pulse-slack';
import {
  resolveNotificationConfig,
  type NotificationConfig,
  type NotificationType,
} from '@/lib/notifications';
import type { UserProfile } from '@/lib/types-scalable';

const ORG_ID = 'aviva-credito';
const CONCURRENCY = 5;

export interface NotificationMessage {
  title: string;
  body: string;
  /** Ruta dentro de la app a la que lleva el aviso (ej. /courses/abc). */
  path: string;
}

export interface DeliveryResult {
  slack?: { ok: boolean; error?: string };
  push?: { sent: number; failed: number; error?: string };
}

// ── Configuración ──────────────────────────────────────────────────────────

export async function getNotificationConfig(): Promise<NotificationConfig> {
  const snap = await adminDb().collection('notification_config').doc(ORG_ID).get();
  return resolveNotificationConfig(snap.exists ? snap.data() : null);
}

async function appBaseUrl(): Promise<string> {
  const snap = await adminDb().collection('slack_config').doc(ORG_ID).get();
  const url = String((snap.exists && snap.data()?.appUrl) || process.env.APP_URL || '').trim();
  return url.replace(/\/$/, '');
}

// ── Push ───────────────────────────────────────────────────────────────────

let vapidCache: { publicKey: string; privateKey: string } | null = null;

/**
 * Llaves VAPID de Web Push. Se generan la primera vez y se guardan en
 * server_secrets (las reglas no dejan leer esa colección desde el navegador).
 */
async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (vapidCache) return vapidCache;
  const ref = adminDb().collection('server_secrets').doc('push_vapid');
  vapidCache = await adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data?.publicKey && data?.privateKey) return { publicKey: data.publicKey, privateKey: data.privateKey };
    const keys = webpush.generateVAPIDKeys();
    tx.set(ref, { ...keys, createdAt: FieldValue.serverTimestamp() });
    return keys;
  });
  return vapidCache;
}

export async function getPushPublicKey(): Promise<string> {
  return (await getVapidKeys()).publicKey;
}

const subscriptionId = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string,
): Promise<void> {
  const db = adminDb();
  await db.collection('push_subscriptions').doc(subscriptionId(sub.endpoint)).set({
    userId,
    endpoint: sub.endpoint,
    keys: sub.keys,
    userAgent: userAgent.slice(0, 300),
    organizationId: ORG_ID,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection('users').doc(userId).update({ pushEnabled: true });
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  const db = adminDb();
  const ref = db.collection('push_subscriptions').doc(subscriptionId(endpoint));
  const snap = await ref.get();
  if (snap.exists && snap.data()?.userId === userId) await ref.delete();
  await refreshPushFlag(userId);
}

/** `users.pushEnabled` refleja si le queda algún dispositivo suscrito (el panel lo cuenta). */
async function refreshPushFlag(userId: string): Promise<void> {
  const db = adminDb();
  const left = await db.collection('push_subscriptions').where('userId', '==', userId).limit(1).get();
  await db.collection('users').doc(userId).update({ pushEnabled: !left.empty }).catch(() => {});
}

async function sendPush(userId: string, message: NotificationMessage, url: string, tag: string): Promise<DeliveryResult['push']> {
  const db = adminDb();
  const subs = await db.collection('push_subscriptions').where('userId', '==', userId).get();
  if (subs.empty) return { sent: 0, failed: 0, error: 'sin dispositivos con notificaciones activadas' };

  const keys = await getVapidKeys();
  const subject = url.startsWith('https://') ? new URL(url).origin : 'mailto:no-reply@avivacredito.com';
  const payload = JSON.stringify({ title: message.title, body: message.body, url, tag });
  let sent = 0;
  let failed = 0;
  let lastError: string | undefined;
  let removed = false;
  for (const doc of subs.docs) {
    const sub = doc.data() as { endpoint: string; keys: { p256dh: string; auth: string } };
    try {
      await webpush.sendNotification(sub, payload, {
        vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60 * 24,
      });
      sent++;
    } catch (err) {
      failed++;
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: el navegador dio de baja la suscripción.
      if (status === 404 || status === 410) {
        await doc.ref.delete().catch(() => {});
        removed = true;
      }
      lastError = status ? `el servicio de push respondió ${status}` : (err instanceof Error ? err.message : String(err));
    }
  }
  if (removed) await refreshPushFlag(userId);
  return { sent, failed, ...(lastError && sent === 0 ? { error: lastError } : {}) };
}

// ── Slack ──────────────────────────────────────────────────────────────────

async function sendSlackDm(slackId: string | undefined, message: NotificationMessage, url: string): Promise<DeliveryResult['slack']> {
  if (!slackId?.trim()) return { ok: false, error: 'sin Slack ID en su perfil' };
  const token = await getSlackToken();
  if (!token) return { ok: false, error: 'falta el token del bot de Slack (Admin → Tokens)' };
  const text = `*${message.title}*\n${message.body}`;
  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text } },
    ...(url.startsWith('http') ? [{
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Abrir en la app →', emoji: true }, style: 'primary', url }],
    }] : []),
  ];
  try {
    const data = await postSlackMessage(token, slackId.trim(), url.startsWith('http') ? `${text} ${url}` : text, blocks);
    return data.ok ? { ok: true } : { ok: false, error: slackErrorText(data.error) };
  } catch (err) {
    return { ok: false, error: `no se pudo conectar con Slack (${err instanceof Error ? err.message : String(err)})` };
  }
}

// ── Envío ──────────────────────────────────────────────────────────────────

/** El id del registro hace de candado: con el mismo dedupeKey el aviso sale una sola vez. */
function logId(dedupeKey: string): string {
  return dedupeKey.replace(/[/\s]/g, '_').slice(0, 400);
}

/**
 * Manda un aviso a un usuario según la regla configurada. Devuelve null si la
 * regla está apagada o ese aviso ya se había mandado (mismo dedupeKey).
 */
export async function notifyUser(opts: {
  type: NotificationType;
  user: Pick<UserProfile, 'uid' | 'nombre' | 'slackId' | 'active'>;
  message: NotificationMessage;
  dedupeKey: string;
  config?: NotificationConfig;
}): Promise<DeliveryResult | null> {
  const config = opts.config ?? await getNotificationConfig();
  const rule = config.rules[opts.type];
  if (!rule?.enabled || (!rule.slack && !rule.push) || opts.user.active === false) return null;

  const ref = adminDb().collection('notification_log').doc(logId(opts.dedupeKey));
  try {
    await ref.create({
      type: opts.type,
      userId: opts.user.uid,
      userName: opts.user.nombre ?? '',
      title: opts.message.title,
      body: opts.message.body,
      organizationId: ORG_ID,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 6) return null; // ya se mandó
    throw err;
  }

  const result = await deliver(opts.user, opts.message, opts.type, { slack: rule.slack, push: rule.push });
  await ref.update(stripEmpty(result)).catch(() => {});
  return result;
}

/** Envía por los canales pedidos, sin revisar reglas (lo usan los avisos y la prueba). */
export async function deliver(
  user: Pick<UserProfile, 'uid' | 'slackId'>,
  message: NotificationMessage,
  tag: string,
  channels: { slack: boolean; push: boolean },
): Promise<DeliveryResult> {
  const base = await appBaseUrl();
  const url = base ? `${base}${message.path}` : message.path;
  const [slack, push] = await Promise.all([
    channels.slack ? sendSlackDm(user.slackId, message, url) : Promise.resolve(undefined),
    channels.push ? sendPush(user.uid, message, url, tag) : Promise.resolve(undefined),
  ]);
  return { ...(slack ? { slack } : {}), ...(push ? { push } : {}) };
}

/** notifyUser para varios usuarios, de pocos en pocos. Devuelve cuántos avisos salieron. */
export async function notifyUsers(
  type: NotificationType,
  users: Pick<UserProfile, 'uid' | 'nombre' | 'slackId' | 'active'>[],
  build: (user: Pick<UserProfile, 'uid' | 'nombre' | 'slackId' | 'active'>) => { message: NotificationMessage; dedupeKey: string },
): Promise<number> {
  const config = await getNotificationConfig();
  if (!config.rules[type]?.enabled) return 0;
  let count = 0;
  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const results = await Promise.all(users.slice(i, i + CONCURRENCY).map(user =>
      notifyUser({ type, user, config, ...build(user) }).catch(err => {
        console.error(`[notifications] ${type} → ${user.uid}:`, err);
        return null;
      })));
    count += results.filter(Boolean).length;
  }
  return count;
}

function stripEmpty<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
