/**
 * GET|POST /api/pulse/cron
 * Proceso programado del Pulso de Conocimiento. Debe llamarse cada 5–15 min
 * (Cloud Scheduler, cron-job.org, GitHub Actions…). Es idempotente: cada
 * ejecución revisa la hora en la zona del equipo y solo hace lo que falta.
 *
 *  1. Cierra pulsos de días anteriores que quedaron abiertos y marca como
 *     'expired' los intentos que quedaron a medias.
 *  2. Crea el pulso de hoy si "Pulso automático diario" está activo.
 *  3. Envía el aviso de Slack a partir de la hora de envío (una sola vez).
 *  4. Cierra el pulso de hoy al llegar la hora de cierre.
 *
 * Autenticación: header `Authorization: Bearer <secreto>` (o `?key=<secreto>`
 * para schedulers que no permiten headers). El secreto se toma de la variable
 * de entorno PULSE_CRON_SECRET o del token `pulse_cron_secret` en Admin → Tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  claimPulseSlackSend,
  createDailyPulseIfMissing,
  expireStalePulseAttempts,
  getDailyPulse,
  getDailyPulses,
  getOrgToken,
  getPulseConfig,
  getSlackConfig,
  recordPulseSlackResult,
  savePulseCronStatus,
  scheduleAutoPulse,
  updatePulseStatus,
} from '@/lib/firestore-service';
import { addDaysStr, hhmmToMinutes, pulseDateStr, pulseMinutesNow } from '@/lib/pulse-utils';
import { sendPulseSlack, summarizeSlackResults } from '@/lib/pulse-slack';

const LOOKBACK_DAYS = 7;

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

async function isAuthorized(req: NextRequest): Promise<boolean | 'unconfigured'> {
  const stored = await getOrgToken('pulse_cron_secret');
  const secret = process.env.PULSE_CRON_SECRET || stored?.value;
  if (!secret) return 'unconfigured';
  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : (req.nextUrl.searchParams.get('key') ?? '');
  return !!provided && safeEqual(provided, secret);
}

async function run(req: NextRequest) {
  const auth = await isAuthorized(req);
  if (auth === 'unconfigured') {
    return NextResponse.json(
      { error: 'Configura el secreto del cron (PULSE_CRON_SECRET o el token pulse_cron_secret en Admin → Tokens).' },
      { status: 503 }
    );
  }
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const now = new Date();
  const today = pulseDateStr(now);
  const minutes = pulseMinutesNow(now);
  const actions: string[] = [];

  try {
    const [cfg, slackCfg] = await Promise.all([getPulseConfig(), getSlackConfig()]);
    const closeMinutes = hhmmToMinutes(cfg.closeAt);

    // 1. Días anteriores
    const past = await getDailyPulses(addDaysStr(today, -LOOKBACK_DAYS), addDaysStr(today, -1));
    for (const p of past) {
      if (p.status !== 'closed') {
        await updatePulseStatus(p.date, 'closed');
        actions.push(`Pulso del ${p.date} cerrado`);
      }
    }
    const expired = await expireStalePulseAttempts(today, addDaysStr(today, -LOOKBACK_DAYS));
    if (expired > 0) actions.push(`${expired} intento(s) a medias marcados como vencidos`);

    // 2. Crear el pulso de hoy
    let pulse = await getDailyPulse(today);
    if (!pulse && cfg.autoDailyPulse && minutes < closeMinutes) {
      const ids = await scheduleAutoPulse(undefined, today);
      if (ids.length === 0) {
        actions.push('No se pudo crear el pulso: no hay preguntas activas en los módulos seleccionados');
      } else if (await createDailyPulseIfMissing(today, ids, 'auto')) {
        actions.push(`Pulso de hoy creado (${ids.length} preguntas en el pool)`);
      }
      pulse = await getDailyPulse(today);
    }

    const hasQuestions = !!pulse && (pulse.questionIds ?? []).length > 0;

    // 3. Aviso de Slack
    if (
      pulse && hasQuestions && pulse.status === 'scheduled' &&
      slackCfg?.active &&
      minutes >= hhmmToMinutes(slackCfg.sendAt, '08:00') && minutes < closeMinutes
    ) {
      if (await claimPulseSlackSend(today)) {
        try {
          const results = await sendPulseSlack({ date: today });
          const summary = summarizeSlackResults(results);
          await recordPulseSlackResult(today, { ...summary, trigger: 'auto' });
          actions.push(`Aviso de Slack enviado (${summary.ok} ok, ${summary.failed} fallidos)`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await recordPulseSlackResult(today, { ok: 0, failed: 0, error: message, trigger: 'auto' });
          actions.push(`Error al enviar Slack: ${message}`);
        }
      }
    }

    // 4. Cierre
    if (pulse && pulse.status !== 'closed' && minutes >= closeMinutes) {
      await updatePulseStatus(today, 'closed');
      actions.push('Pulso de hoy cerrado');
    }

    await savePulseCronStatus({ lastActions: actions });
    return NextResponse.json({ ok: true, date: today, actions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pulse-cron] Error:', err);
    await savePulseCronStatus({ lastActions: actions, lastError: message }).catch(() => {});
    return NextResponse.json({ ok: false, error: message, actions }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
