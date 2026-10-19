/**
 * POST /api/pulse/auto-create
 * Genera automáticamente el pulso del día si aún no existe y la opción
 * "autoDailyPulse" está habilitada en la configuración del pulso.
 *
 * Lo llama la página del vendedor al abrirse, como respaldo de /api/pulse/cron.
 * Es idempotente: si el pulso ya existe no hace nada. Requiere sesión
 * (header `Authorization: Bearer <ID token>`) y solo crea el pulso de hoy, en
 * la zona horaria del equipo.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPulseConfig,
  getDailyPulse,
  createDailyPulseIfMissing,
  scheduleAutoPulse,
} from '@/lib/server/pulse-store';
import { pulseDateStr } from '@/lib/pulse-utils';
import { authErrorResponse, requireUser } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const date = pulseDateStr();

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

    const questionIds = await scheduleAutoPulse(date);
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
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[auto-create] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
