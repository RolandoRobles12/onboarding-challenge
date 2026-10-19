/**
 * POST /api/pulse/review — repaso de una pregunta fallada.
 * Body: { itemId } → { question } (sin respuesta)
 *       { itemId, optionId } → { result: { isCorrect, reveal } }; si acierta,
 *       la pregunta sale del repaso.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { reviewBacklogItem } from '@/lib/server/pulse-play';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const { itemId, optionId } = await req.json() as { itemId: string; optionId?: string };
    if (!itemId) return NextResponse.json({ error: 'Falta el repaso.' }, { status: 400 });
    return NextResponse.json(await reviewBacklogItem(profile.uid, String(itemId), optionId ? String(optionId) : undefined));
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[pulse/review] Error:', err);
    return NextResponse.json({ error: 'No se pudo guardar el repaso.' }, { status: 500 });
  }
}
