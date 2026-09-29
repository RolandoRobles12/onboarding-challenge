/**
 * Tareas programadas del Pulso de Conocimiento.
 *
 * Firebase ejecuta `pulsoCadaDiezMinutos` cada 10 minutos. La función solo
 * "despierta" a la app llamando a /api/pulse/cron, que es donde vive la lógica
 * (crear el pulso, enviar el aviso de Slack a su hora, cerrar a su hora). Así
 * nadie tiene que configurar un scheduler externo ni tocar tokens:
 *
 *  - La URL de la app se toma de la configuración de Slack (`appUrl`), que la
 *    propia app llena sola; `APP_URL` en functions/.env es solo un respaldo.
 *  - El secreto que protege /api/pulse/cron se genera aquí la primera vez y
 *    se guarda en `org_tokens`, donde la app lo lee.
 */

const crypto = require('crypto');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const ORG_ID = 'aviva-credito';
const SECRET_KEY = 'pulse_cron_secret';

function db() {
  if (getApps().length === 0) initializeApp();
  return getFirestore();
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
  await firestore.collection('pulse_cron_status').doc(ORG_ID).set({
    organizationId: ORG_ID,
    lastError: message,
    lastErrorAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/** Una "vuelta" del reloj: llama a /api/pulse/cron de la app. */
async function runPulseTick({ fetchImpl = fetch } = {}) {
  const firestore = db();
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
    logger.info('Pulso: vuelta completada', { actions: body.actions });
    return { ok: true, actions: body.actions || [] };
  } catch (err) {
    const message = `No se pudo contactar a la app (${appUrl}): ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    await recordFailure(firestore, message);
    return { ok: false, error: message };
  }
}

exports.pulsoCadaDiezMinutos = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'America/Mexico_City',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    retryCount: 0,
  },
  async () => {
    await runPulseTick();
  },
);

// Para pruebas locales.
exports.runPulseTick = runPulseTick;
