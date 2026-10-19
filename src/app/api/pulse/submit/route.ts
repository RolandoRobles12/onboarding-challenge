/**
 * POST /api/pulse/submit — cierra el pulso de hoy con las respuestas
 * calificadas en el servidor. Es idempotente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { submitToday } from '@/lib/server/pulse-play';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    return NextResponse.json({ attempt: await submitToday(profile) });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[pulse/submit] Error:', err);
    return NextResponse.json({ error: 'No se pudo cerrar el pulso.' }, { status: 500 });
  }
}
