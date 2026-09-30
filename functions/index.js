/**
 * Tareas programadas del Pulso de Conocimiento.
 *
 * `pulsoAvisoDiario` corre UNA vez al día, exactamente a la "Hora de envío" que
 * el admin configura en Gestión del Pulso → Slack. En esa ejecución la app
 * (/api/pulse/cron) crea el pulso si falta, manda el aviso de Slack y hace la
 * limpieza de días anteriores.
 *
 * Cuando el admin cambia la hora, `pulsoSincronizarHorario` mueve el
 * despertador (el job de Cloud Scheduler que crea el deploy) a la hora nueva.
 * Si un deploy regresa el despertador a su hora por defecto, la siguiente
 * ejecución o la apertura del panel lo vuelven a ajustar.
 *
 * Nada de esto requiere configuración de admins:
 *  - La URL de la app se toma de la configuración de Slack (`appUrl`), que la
 *    propia app llena sola; `APP_URL` en functions/.env es solo un respaldo.
 *  - El secreto que protege /api/pulse/cron se genera aquí la primera vez.
 */

const crypto = require('crypto');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const ORG_ID = 'aviva-credito';
const SECRET_KEY = 'pulse_cron_secret';
const REGION = 'us-central1';
const TIME_ZONE = 'America/Mexico_City';
const AVISO_FUNCTION = 'pulsoAvisoDiario';
/** Nombre que Firebase le da al job de Cloud Scheduler de `pulsoAvisoDiario`. */
const AVISO_JOB_ID = `firebase-schedule-${AVISO_FUNCTION}-${REGION}`;
const DEFAULT_SEND_AT = '08:00';

function db() {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
}

function statusRef(firestore) {
  return firestore.collection('pulse_cron_status').doc(ORG_ID);
}

function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId; } catch { return undefined; }
}

/** "08:30" → "30 8 * * *" (todos los días a esa hora). */
function cronFor(sendAt) {
  const [h, m] = sendAt.split(':').map(Number);
  return `${m || 0} ${h || 0} * * *`;
}

function validSendAt(value) {
  return typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value) ? value : DEFAULT_SEND_AT;
}

/** Devuelve el secreto del cron; si no existe, lo crea. */
async function ensureCronSecret(firestore) {
  const ref = firestore.collection('org_tokens').doc(`${ORG_ID}_${SECRET_KEY}`);
  const snap = await ref.get();
  const current = snap.exists ? snap.data().value : '';
  if (current) return current;
  const value = crypto.randomBytes(32).toString('hex');
  await ref.set({
    key: SECRET_KEY,
    label: 'Secreto del envío automático del Pulso (se genera solo)',
    value,
    organizationId: ORG_ID,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'system',
  });
  return value;
}

async function recordFailure(firestore, message) {
  await statusRef(firestore).set({
    organizationId: ORG_ID,
    lastError: message,
    lastErrorAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ── Ejecución diaria ───────────────────────────────────────────────────────

/** Llama a /api/pulse/cron de la app para hacer el trabajo del día. */
async function runPulseTick(options = {}) {
  const firestore = db();
  try {
    // Latido: deja constancia de que la función corrió, pase lo que pase después.
    await statusRef(firestore).set({
      organizationId: ORG_ID,
      lastTickAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return await tick(firestore, options);
  } catch (err) {
    const message = `Error inesperado en la función programada: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    await recordFailure(firestore, message).catch(() => {});
    return { ok: false, error: message };
  }
}

async function tick(firestore, { fetchImpl = fetch } = {}) {
  const slackSnap = await firestore.collection('slack_config').doc(ORG_ID).get();
  const appUrl = String((slackSnap.exists && slackSnap.data().appUrl) || process.env.APP_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (!appUrl) {
    const message = 'Aún no se conoce la URL de la app: se registra sola cuando un admin abre Gestión del Pulso.';
    logger.warn(message);
    await recordFailure(firestore, message);
    return { ok: false, error: message };
  }

  const secret = await ensureCronSecret(firestore);
  try {
    const res = await fetchImpl(`${appUrl}/api/pulse/cron`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(100_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = `La app respondió ${res.status}: ${body.error || 'sin detalle'}`;
      logger.error(message);
      await recordFailure(firestore, message);
      return { ok: false, error: message };
    }
    logger.info('Pulso: ejecución diaria completada', { actions: body.actions });
    return { ok: true, actions: body.actions || [] };
  } catch (err) {
    const message = `No se pudo contactar a la app (${appUrl}): ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    await recordFailure(firestore, message);
    return { ok: false, error: message };
  }
}

// ── Mover el despertador a la hora configurada ─────────────────────────────

/**
 * Ajusta el job de Cloud Scheduler de `pulsoAvisoDiario` a la hora de envío
 * guardada. Solo lo modifica si cambió. Registra el resultado en
 * pulse_cron_status (`scheduledSendAt` o `scheduleError`).
 */
async function syncSchedule({ client } = {}) {
  const firestore = db();
  const slackSnap = await firestore.collection('slack_config').doc(ORG_ID).get();
  const sendAt = validSendAt(slackSnap.exists ? slackSnap.data().sendAt : undefined);
  const schedule = cronFor(sendAt);
  try {
    const project = projectId();
    if (!project) throw new Error('No se pudo determinar el proyecto de Google Cloud.');
    let scheduler = client;
    if (!scheduler) {
      const { CloudSchedulerClient } = require('@google-cloud/scheduler');
      scheduler = new CloudSchedulerClient();
      // Inicializar aquí dentro del try: si faltan credenciales o permisos, el
      // error se registra en vez de escapar como rechazo no manejado.
      await scheduler.initialize();
    }
    const name = scheduler.jobPath(project, REGION, AVISO_JOB_ID);
    const [job] = await scheduler.getJob({ name });
    if (job.schedule !== schedule || job.timeZone !== TIME_ZONE) {
      await scheduler.updateJob({
        job: { name, schedule, timeZone: TIME_ZONE },
        updateMask: { paths: ['schedule', 'time_zone'] },
      });
      logger.info(`Pulso: aviso reprogramado a las ${sendAt}`);
    }
    await statusRef(firestore).set({
      organizationId: ORG_ID,
      scheduledSendAt: sendAt,
      scheduleSyncedAt: FieldValue.serverTimestamp(),
      scheduleError: null,
    }, { merge: true });
    return { ok: true, sendAt };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const message = /PERMISSION_DENIED|permission/i.test(raw)
      ? `La función no tiene permiso para mover su horario. El equipo técnico debe darle el rol «Cloud Scheduler Admin» a la cuenta de servicio de las funciones. (${raw})`
      : /NOT_FOUND/i.test(raw)
        ? `No se encontró el despertador del Pulso: vuelve a desplegar con «firebase deploy --only functions:pulso». (${raw})`
        : `No se pudo ajustar la hora del aviso: ${raw}`;
    logger.error(message);
    await statusRef(firestore).set({
      organizationId: ORG_ID,
      scheduleError: message,
      scheduleErrorAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});
    return { ok: false, error: message };
  }
}

// ── Funciones desplegadas ──────────────────────────────────────────────────

/**
 * Corre una vez al día. '0 8 * * *' es solo la hora inicial que pone el
 * deploy: `syncSchedule` la cambia a la hora que eligió el admin.
 */
exports.pulsoAvisoDiario = onSchedule(
  {
    schedule: cronFor(DEFAULT_SEND_AT),
    timeZone: TIME_ZONE,
    region: REGION,
    timeoutSeconds: 300,
    memory: '256MiB',
    retryCount: 1,
  },
  async () => {
    await runPulseTick();
    // Por si un deploy regresó el despertador a su hora por defecto.
    await syncSchedule();
  },
);

/** Cuando cambia la hora de envío (o el panel pide revisarla), mueve el despertador. */
exports.pulsoSincronizarHorario = onDocumentWritten(
  { document: 'slack_config/{orgId}', region: REGION },
  async (event) => {
    if (event.params.orgId !== ORG_ID) return;
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};
    const millis = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);
    const changed = !event.data?.before?.exists
      || before.sendAt !== after.sendAt
      || millis(before.syncRequestedAt) !== millis(after.syncRequestedAt);
    if (!changed) return;
    await syncSchedule();
  },
);

// Para pruebas locales.
exports.runPulseTick = runPulseTick;
exports.syncSchedule = syncSchedule;
exports.cronFor = cronFor;
