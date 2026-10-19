/**
 * POST /api/pulse/start — empieza el pulso de hoy (o devuelve el que ya
 * existe). Las preguntas se eligen en el servidor y llegan sin la respuesta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { startTodayAttempt } from '@/lib/server/pulse-play';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    return NextResponse.json(await startTodayAttempt(profile));
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[pulse/start] Error:', err);
    return NextResponse.json({ error: 'No se pudo iniciar el pulso.' }, { status: 500 });
  }
}
