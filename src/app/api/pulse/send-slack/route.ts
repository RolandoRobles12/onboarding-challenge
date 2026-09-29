/**
 * POST /api/pulse/send-slack
 * Envía el aviso del Pulso de Conocimiento por Slack desde el panel de admin.
 *
 * Body: { date: "YYYY-MM-DD", test?: boolean, testSlackId?: string }
 *  - test=true: solo al admin que la pide (testSlackId) o a los destinatarios
 *    directos. No cambia el estado del pulso.
 *  - test=false: envío real a canales, vendedores y destinatarios directos.
 *    Marca el pulso como "aviso enviado" y guarda el resultado.
 *
 * El envío automático a la hora configurada lo hace /api/pulse/cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyPulse, recordPulseSlackResult, updatePulseStatus } from '@/lib/firestore-service';
import { sendPulseSlack, summarizeSlackResults, PulseSlackError } from '@/lib/pulse-slack';

export async function POST(req: NextRequest) {
  try {
    const { date, test = false, testSlackId } = await req.json() as { date: string; test?: boolean; testSlackId?: string };
    if (!date) return NextResponse.json({ error: 'Falta la fecha del pulso' }, { status: 400 });

    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';

    let pulse = null;
    if (!test) {
      pulse = await getDailyPulse(date);
      if (!pulse || (pulse.questionIds ?? []).length === 0) {
        return NextResponse.json({ error: 'El pulso de ese día no existe o no tiene preguntas.' }, { status: 400 });
      }
    }

    const results = await sendPulseSlack({
      date,
      test,
      testSlackId,
      fallbackBaseUrl: host ? `${proto}://${host}` : undefined,
    });

    if (!test && pulse) {
      if (pulse.status === 'scheduled') await updatePulseStatus(date, 'active');
      await recordPulseSlackResult(date, { ...summarizeSlackResults(results), trigger: 'manual' });
    }

    const failed = results.filter(r => !r.ok);
    const succeeded = results.length - failed.length;
    if (failed.length === results.length) {
      return NextResponse.json({ message: 'Todos los envíos fallaron', results }, { status: 502 });
    }
    if (failed.length > 0) {
      return NextResponse.json({ message: `${succeeded} enviados, ${failed.length} fallaron`, results, partialSuccess: true }, { status: 207 });
    }
    return NextResponse.json({
      message: `${results.length} mensaje${results.length !== 1 ? 's' : ''} enviado${results.length !== 1 ? 's' : ''}`,
      results,
    });
  } catch (err: unknown) {
    if (err instanceof PulseSlackError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[send-slack] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
