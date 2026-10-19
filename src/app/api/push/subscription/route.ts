/**
 * POST /api/push/subscription   — guarda la suscripción push de este dispositivo.
 * DELETE /api/push/subscription — la borra (el embajador apagó las notificaciones).
 * Body: la suscripción tal como la da el navegador (`PushSubscription.toJSON()`).
 */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { removePushSubscription, savePushSubscription } from '@/lib/server/notifications';

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

function valid(sub: Sub): sub is { endpoint: string; keys: { p256dh: string; auth: string } } {
  return typeof sub.endpoint === 'string' && sub.endpoint.startsWith('https://')
    && typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string';
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const sub = await req.json() as Sub;
    if (!valid(sub)) return NextResponse.json({ error: 'Suscripción inválida.' }, { status: 400 });
    await savePushSubscription(profile.uid, sub, req.headers.get('user-agent') ?? '');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[push/subscription] Error:', err);
    return NextResponse.json({ error: 'No se pudieron activar las notificaciones.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const sub = await req.json().catch(() => ({})) as Sub;
    if (typeof sub.endpoint === 'string') await removePushSubscription(profile.uid, sub.endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[push/subscription] Error:', err);
    return NextResponse.json({ error: 'No se pudieron desactivar las notificaciones.' }, { status: 500 });
  }
}
