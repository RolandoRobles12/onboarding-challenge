/**
 * Acceso a Firestore del Pulso de Conocimiento para las rutas de /api (solo
 * servidor, con el Admin SDK). Es el equivalente de servidor de las funciones
 * del Pulso en src/lib/firestore-service.ts, que usa el navegador.
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import {
  addDaysStr,
  buildAutoPool,
  DEFAULT_PULSE_CONFIG,
  lastUsedByQuestion,
  pulseDateStr,
  RECENT_USE_WINDOW_DAYS,
} from '@/lib/pulse-utils';
import { withOptionIds } from '@/lib/question-options';
import type {
  DailyPulse,
  PulseConfig,
  PulseCronStatus,
  PulseSlackResult,
  Question,
  SlackNotificationConfig,
  UserProfile,
} from '@/lib/types-scalable';

export const DEFAULT_ORG_ID = 'aviva-credito';

/** Firestore limita cada batch a 500 escrituras. */
const BATCH_LIMIT = 450;

const db = (): Firestore => adminDb();
const pulseRef = (date: string, orgId: string) => db().collection('daily_pulses').doc(`${orgId}_${date}`);

// ── Configuración ──────────────────────────────────────────────────────────

export async function getOrgTokenValue(key: string, orgId = DEFAULT_ORG_ID): Promise<string | null> {
  const snap = await db().collection('org_tokens').doc(`${orgId}_${key}`).get();
  const value = snap.exists ? (snap.data()?.value as string | undefined) : undefined;
  return value?.trim() || null;
}

export async function getPulseConfig(orgId = DEFAULT_ORG_ID): Promise<PulseConfig> {
  const snap = await db().collection('pulse_config').doc(orgId).get();
  return { ...DEFAULT_PULSE_CONFIG, organizationId: orgId, ...(snap.exists ? snap.data() : {}) } as PulseConfig;
}

export async function getSlackConfig(orgId = DEFAULT_ORG_ID): Promise<SlackNotificationConfig | null> {
  const snap = await db().collection('slack_config').doc(orgId).get();
  return snap.exists ? (snap.data() as SlackNotificationConfig) : null;
}

export async function getPulseCronStatus(orgId = DEFAULT_ORG_ID): Promise<PulseCronStatus | null> {
  const snap = await db().collection('pulse_cron_status').doc(orgId).get();
  return snap.exists ? (snap.data() as PulseCronStatus) : null;
}

export async function savePulseCronStatus(
  status: { lastActions: string[]; lastError?: string; maintenanceDate?: string },
  orgId = DEFAULT_ORG_ID,
): Promise<void> {
  await db().collection('pulse_cron_status').doc(orgId).set({
    organizationId: orgId,
    lastRunAt: FieldValue.serverTimestamp(),
    lastActions: status.lastActions,
    lastError: status.lastError ?? null,
    ...(status.maintenanceDate ? { maintenanceDate: status.maintenanceDate } : {}),
  }, { merge: true });
}

// ── Pulsos ─────────────────────────────────────────────────────────────────

export async function getDailyPulse(date: string, orgId = DEFAULT_ORG_ID): Promise<DailyPulse | null> {
  const snap = await pulseRef(date, orgId).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as DailyPulse) : null;
}

export async function getDailyPulses(startDate: string, endDate: string, orgId = DEFAULT_ORG_ID): Promise<DailyPulse[]> {
  const snap = await db().collection('daily_pulses')
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'desc')
    .get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as DailyPulse))
    .filter(p => p.organizationId === orgId);
}

export async function updatePulseStatus(date: string, status: DailyPulse['status'], orgId = DEFAULT_ORG_ID): Promise<void> {
  await pulseRef(date, orgId).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
    ...(status === 'active' ? { sentAt: FieldValue.serverTimestamp() } : {}),
    ...(status === 'closed' ? { closedAt: FieldValue.serverTimestamp() } : {}),
  });
}

/** Crea el pulso del día solo si no existe. Devuelve true si lo creó. */
export async function createDailyPulseIfMissing(
  date: string,
  questionIds: string[],
  createdBy = 'auto',
  orgId = DEFAULT_ORG_ID,
): Promise<boolean> {
  try {
    await pulseRef(date, orgId).create({
      organizationId: orgId,
      date,
      questionIds,
      status: 'scheduled',
      totalResponses: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy,
    });
    return true;
  } catch (err) {
    // ALREADY_EXISTS (6): otro proceso lo creó primero.
    if ((err as { code?: number }).code === 6) return false;
    throw err;
  }
}

/**
 * Reserva el envío de Slack del pulso: pasa de 'scheduled' a 'active' en una
 * transacción para que dos ejecuciones simultáneas no manden el aviso dos veces.
 */
export async function claimPulseSlackSend(date: string, orgId = DEFAULT_ORG_ID): Promise<boolean> {
  const ref = pulseRef(date, orgId);
  return db().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as DailyPulse;
    if (data.status !== 'scheduled' || data.sentAt) return false;
    tx.update(ref, { status: 'active', sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

export async function recordPulseSlackResult(
  date: string,
  result: Omit<PulseSlackResult, 'at'>,
  orgId = DEFAULT_ORG_ID,
): Promise<void> {
  const slackResult: Record<string, unknown> = { ok: result.ok, failed: result.failed, trigger: result.trigger, at: FieldValue.serverTimestamp() };
  if (result.error) slackResult.error = result.error;
  await pulseRef(date, orgId).update({ slackResult, updatedAt: FieldValue.serverTimestamp() });
}

/** Marca como 'expired' los intentos que quedaron a medias en días anteriores. */
export async function expireStalePulseAttempts(today: string, lookbackStart: string, orgId = DEFAULT_ORG_ID): Promise<number> {
  const snap = await db().collection('pulse_attempts')
    .where('date', '>=', lookbackStart)
    .where('date', '<', today)
    .get();
  const stale = snap.docs.filter(d => d.data().organizationId === orgId && d.data().status === 'in_progress');
  for (let i = 0; i < stale.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const d of stale.slice(i, i + BATCH_LIMIT)) batch.update(d.ref, { status: 'expired' });
    await batch.commit();
  }
  return stale.length;
}

/** Arma el pool automático del día (ver `buildAutoPool`). */
export async function scheduleAutoPulse(date = pulseDateStr(), orgId = DEFAULT_ORG_ID): Promise<string[]> {
  const [snap, cfg, recentPulses] = await Promise.all([
    db().collection('questions').where('organizationId', '==', orgId).where('active', '==', true).get(),
    getPulseConfig(orgId),
    getDailyPulses(addDaysStr(date, -RECENT_USE_WINDOW_DAYS), addDaysStr(date, -1), orgId),
  ]);
  const questions = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Question);
  return buildAutoPool(questions, {
    activeModules: cfg.activeModules,
    lastUsed: lastUsedByQuestion(recentPulses, cfg.questionsPerPulse),
    date,
  });
}

// ── Usuarios y preguntas ───────────────────────────────────────────────────

export async function getAllUsers(): Promise<UserProfile[]> {
  const snap = await db().collection('users').get();
  return snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
}

export async function getQuestionTexts(): Promise<Set<string>> {
  const snap = await db().collection('questions').get();
  return new Set(snap.docs.map(d => String(d.data().text ?? '').trim()));
}

export async function createQuestion(
  question: Omit<Question, 'id' | 'createdAt' | 'updatedAt' | 'timesUsed' | 'averageCorrectRate' | 'createdBy'>,
  createdBy: string,
): Promise<string> {
  const ref = db().collection('questions').doc();
  await ref.set({
    ...question,
    options: withOptionIds(question.options),
    timesUsed: 0,
    timesCorrect: 0,
    averageCorrectRate: 0,
    createdBy,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
