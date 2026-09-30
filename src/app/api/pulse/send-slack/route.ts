/**
 * POST /api/pulse/send-slack
 * Envía el aviso del Pulso de Conocimiento por Slack desde el panel de admin.
 *
 * Body: { date: "YYYY-MM-DD", test?: boolean, testSlackId?: string }
 *  - test=true: solo al admin que la pide (testSlackId) o a los destinatarios
 *    directos. No cambia el estado del pulso.
 *  - test=false: envío real a canales, vendedores y destinatarios directos,
 *    aunque el envío automático esté apagado. Marca el pulso como "aviso
 *    enviado" y guarda el resultado (también si falla).
 *
 * El envío automático a la hora configurada lo hace /api/pulse/cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { claimPulseSlackSend, getDailyPulse, recordPulseSlackResult } from '@/lib/firestore-service';
import { checkSlackConnection, sendPulseSlack, summarizeSlackResults, PulseSlackError } from '@/lib/pulse-slack';

export async function POST(req: NextRequest) {
  try {
    const { date, test = false, testSlackId } = await req.json() as { date: string; test?: boolean; testSlackId?: string };
    if (!date) return NextResponse.json({ error: 'Falta la fecha del pulso' }, { status: 400 });

    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';

    // En la prueba, primero se verifica el token para dar un motivo claro.
    let connection: { team: string; bot: string } | undefined;
    if (test) {
      const check = await checkSlackConnection();
      if (!check.ok) return NextResponse.json({ ok: false, error: check.error });
      connection = { team: check.team, bot: check.bot };
    }

    let pulse = null;
    if (!test) {
      pulse = await getDailyPulse(date);
      if (!pulse || (pulse.questionIds ?? []).length === 0) {
        return NextResponse.json({ error: 'El pulso de ese día no existe o no tiene preguntas.' }, { status: 400 });
      }
      // Primer envío: se reserva antes de mandar para no coincidir con el proceso
      // programado. Un reenvío (ya estaba 'active') es una decisión explícita del admin.
      if (pulse.status === 'scheduled' && !(await claimPulseSlackSend(date))) {
        return NextResponse.json({ error: 'El aviso de este pulso ya se está enviando o ya se envió.' }, { status: 409 });
      }
    }

    let results;
    try {
      results = await sendPulseSlack({
        date,
        test,
        testSlackId,
        fallbackBaseUrl: host ? `${proto}://${host}` : undefined,
      });
    } catch (err) {
      // Deja constancia del fallo en el pulso para que el panel lo muestre.
      if (!test && pulse) {
        const message = err instanceof Error ? err.message : String(err);
        await recordPulseSlackResult(date, { ok: 0, failed: 0, error: message, trigger: 'manual' }).catch(() => {});
      }
      throw err;
    }

    if (!test && pulse) {
      await recordPulseSlackResult(date, { ...summarizeSlackResults(results), trigger: 'manual' });
    }

    // Slack respondió: 200 con el detalle por destinatario (un rechazo de Slack
    // no es una falla del servidor de la app).
    const failed = results.filter(r => !r.ok);
    const succeeded = results.length - failed.length;
    return NextResponse.json({
      ok: failed.length === 0,
      partial: failed.length > 0 && succeeded > 0,
      message: failed.length === 0
        ? `${succeeded} mensaje${succeeded !== 1 ? 's' : ''} enviado${succeeded !== 1 ? 's' : ''}`
        : `${succeeded} enviados, ${failed.length} fallaron`,
      results,
      connection,
    });
  } catch (err: unknown) {
    if (err instanceof PulseSlackError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[send-slack] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
