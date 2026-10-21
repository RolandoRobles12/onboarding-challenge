/**
 * POST /api/certificates/sync — registra en el perfil los certificados ya
 * ganados (ver src/lib/server/certificates.ts).
 * Body: { all?: boolean } — con all (solo staff) sincroniza a todos los embajadores.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireUser, STAFF_ROLES } from '@/lib/server/auth';
import { syncAllCertificates, syncUserCertificates } from '@/lib/server/certificates';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const body = await req.json().catch(() => ({})) as { all?: boolean };
    if (body.all) {
      if (!STAFF_ROLES.includes(profile.rol)) {
        return NextResponse.json({ error: 'No tienes permiso para hacer esto.' }, { status: 403 });
      }
      return NextResponse.json({ ok: true, count: await syncAllCertificates() });
    }
    return NextResponse.json({ ok: true, count: await syncUserCertificates(profile) });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[certificates/sync] Error:', err);
    return NextResponse.json({ error: 'No se pudieron actualizar los certificados.' }, { status: 500 });
  }
}
