/**
 * POST /api/pulse/play — estado del pulso de hoy del embajador: su intento,
 * sus preguntas (sin respuesta) y la respuesta correcta de las ya contestadas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { getTodayState } from '@/lib/server/pulse-play';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    return NextResponse.json(await getTodayState(profile.uid));
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[pulse/play] Error:', err);
    return NextResponse.json({ error: 'No se pudo cargar el pulso.' }, { status: 500 });
  }
}
