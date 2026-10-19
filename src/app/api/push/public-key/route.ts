/** GET /api/push/public-key — llave pública VAPID para suscribir el dispositivo a notificaciones. */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { getPushPublicKey } from '@/lib/server/notifications';

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    return NextResponse.json({ publicKey: await getPushPublicKey() });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[push/public-key] Error:', err);
    return NextResponse.json({ error: 'No se pudieron preparar las notificaciones.' }, { status: 500 });
  }
}
