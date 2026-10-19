/**
 * POST /api/notifications/test — manda un aviso de prueba a quien la pide,
 * por Slack y push, para revisar que todo esté conectado. Solo staff.
 * Responde el resultado de cada canal con un motivo claro si falla.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser, STAFF_ROLES } from '@/lib/server/auth';
import { deliver } from '@/lib/server/notifications';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req, STAFF_ROLES);
    const result = await deliver(profile, {
      title: '🔔 Aviso de prueba',
      body: 'Así les llegarán los avisos a los embajadores.',
      path: '/',
    }, 'test', { slack: true, push: true });
    return NextResponse.json(result);
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[notifications/test] Error:', err);
    return NextResponse.json({ error: 'No se pudo mandar la prueba.' }, { status: 500 });
  }
}
