/**
 * POST /api/branding/refresh — invalida la marca cacheada en el servidor
 * después de guardar cambios en Admin → Marca. Solo staff.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { authErrorResponse, requireUser, STAFF_ROLES } from '@/lib/server/auth';
import { BRANDING_TAG } from '@/lib/server/branding';

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, STAFF_ROLES);
    revalidateTag(BRANDING_TAG);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[branding/refresh] Error:', err);
    return NextResponse.json({ error: 'No se pudo actualizar la marca.' }, { status: 500 });
  }
}
