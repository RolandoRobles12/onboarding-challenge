/**
 * POST /api/pulse/auto-create
 * Genera automáticamente el pulso del día si aún no existe y la opción
 * "autoDailyPulse" está habilitada en la configuración del pulso.
 *
 * Puede llamarse desde:
 *  - Un cron job externo (p.ej. Cloud Scheduler, GitHub Actions, cron-job.org)
 *  - La propia app al cargar la página de pulso del usuario
 *
 * Body (opcional): { date?: "YYYY-MM-DD" }  — si se omite, usa la fecha de hoy.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getPulseConfig,
  getDailyPulse,
  upsertDailyPulse,
  scheduleAutoPulse,
} from '@/lib/firestore-service';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { date?: string };
    const date = body.date ?? todayStr();

    // 1. Check if autoDailyPulse is enabled
    const config = await getPulseConfig();
    if (!config.autoDailyPulse) {
      return NextResponse.json(
        { message: 'autoDailyPulse está desactivado. Actívalo en Admin → Knowledge Pulse → Ajustes.' },
        { status: 400 }
      );
    }

    // 2. Check if pulse already exists for this date
    const existing = await getDailyPulse(date);
    if (existing) {
      return NextResponse.json({ message: `El pulso para ${date} ya existe.`, alreadyExists: true });
    }

    // 3. Generate question pool and create the pulse
    const questionIds = await scheduleAutoPulse();
    if (questionIds.length === 0) {
      return NextResponse.json(
        { error: 'No hay preguntas activas con módulo asignado. Agrega preguntas en el banco.' },
        { status: 422 }
      );
    }

    await upsertDailyPulse(date, questionIds, 'auto');

    return NextResponse.json({
      message: `Pulso creado automáticamente para ${date} con ${questionIds.length} preguntas en el pool.`,
      date,
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
