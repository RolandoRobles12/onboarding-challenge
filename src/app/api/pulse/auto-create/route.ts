/**
 * POST /api/pulse/auto-create
 * Genera automáticamente el pulso del día si aún no existe y la opción
 * "autoDailyPulse" está habilitada en la configuración del pulso.
 *
 * Lo llama la página del vendedor al abrirse, como respaldo de /api/pulse/cron.
 * Es idempotente: si el pulso ya existe no hace nada.
 *
 * Body (opcional): { date?: "YYYY-MM-DD" } — si se omite, usa la fecha de hoy
 * en la zona horaria del equipo.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPulseConfig,
  getDailyPulse,
  createDailyPulseIfMissing,
  scheduleAutoPulse,
} from '@/lib/firestore-service';
import { pulseDateStr } from '@/lib/pulse-utils';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { date?: string };
    const today = pulseDateStr();
    // Solo se permite crear el pulso de hoy (evita crear días arbitrarios desde el cliente).
    const date = body.date && body.date === today ? body.date : today;

    const config = await getPulseConfig();
    if (!config.autoDailyPulse) {
      return NextResponse.json(
        { message: 'autoDailyPulse está desactivado. Actívalo en Admin → Pulso → Ajustes.' },
        { status: 400 }
      );
    }

    const existing = await getDailyPulse(date);
    if (existing) {
      return NextResponse.json({ message: `El pulso para ${date} ya existe.`, alreadyExists: true });
    }

    const questionIds = await scheduleAutoPulse(undefined, date);
    if (questionIds.length === 0) {
      return NextResponse.json(
        { error: 'No hay preguntas activas con módulo asignado. Agrega preguntas en el banco.' },
        { status: 422 }
      );
    }

    const created = await createDailyPulseIfMissing(date, questionIds, 'auto');
    return NextResponse.json({
      message: created
        ? `Pulso creado automáticamente para ${date} con ${questionIds.length} preguntas en el pool.`
        : `El pulso para ${date} ya existe.`,
      date,
      alreadyExists: !created,
      questionsInPool: questionIds.length,
    });
  } catch (err: unknown) {
    console.error('[auto-create] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

/**
 * GET /api/pulse/auto-create
 * Alias de POST para facilitar llamadas desde cron jobs que solo soportan GET.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
