/**
 * POST /api/pulse/answer — califica una respuesta del pulso de hoy.
 * Body: { questionId, optionId, timeSpent }
 * Responde: { answers, isCorrect, reveal } (la respuesta correcta se muestra
 * después de contestar). Se aceptan respuestas hasta 15 minutos después del
 * cierre si el pulso ya estaba empezado.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { answerToday } from '@/lib/server/pulse-play';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const { questionId, optionId, timeSpent } = await req.json() as { questionId: string; optionId: string; timeSpent?: number };
    if (!questionId || !optionId) return NextResponse.json({ error: 'Falta la respuesta.' }, { status: 400 });
    return NextResponse.json(await answerToday(profile.uid, String(questionId), String(optionId), Number(timeSpent) || 0));
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[pulse/answer] Error:', err);
    return NextResponse.json({ error: 'No se guardó tu respuesta.' }, { status: 500 });
  }
}
