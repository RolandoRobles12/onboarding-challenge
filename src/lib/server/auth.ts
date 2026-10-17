/**
 * Autenticación de las rutas de /api (solo servidor).
 *
 * El cliente manda su ID token de Firebase en `Authorization: Bearer <token>`
 * (ver src/lib/api-client.ts). Aquí se verifica la firma, que el correo sea de
 * un dominio permitido y, si se pide, el rol guardado en el perfil.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb } from './firebase-admin';
import { isUserAllowed } from '@/lib/auth-utils';
import type { UserProfile, UserRole } from '@/lib/types-scalable';

export const STAFF_ROLES: UserRole[] = ['super_admin', 'admin', 'trainer'];
export const ADMIN_ROLES: UserRole[] = ['super_admin', 'admin'];

export class ApiAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Verifica el ID token de la petición. No exige que exista el perfil. */
export async function verifyRequestToken(req: NextRequest): Promise<DecodedIdToken> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ApiAuthError('Falta iniciar sesión.', 401);

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth().verifyIdToken(token);
  } catch {
    throw new ApiAuthError('La sesión no es válida o expiró. Vuelve a iniciar sesión.', 401);
  }
  if (!decoded.email || decoded.email_verified === false || !isUserAllowed(decoded.email)) {
    throw new ApiAuthError('Esta cuenta no tiene acceso a la plataforma.', 403);
  }
  return decoded;
}

/**
 * Verifica la sesión y que el usuario tenga un perfil activo. Si se pasan
 * `roles`, además exige que su rol esté entre ellos.
 */
export async function requireUser(
  req: NextRequest,
  roles?: UserRole[],
): Promise<{ token: DecodedIdToken; profile: UserProfile }> {
  const token = await verifyRequestToken(req);
  const snap = await adminDb().collection('users').doc(token.uid).get();
  if (!snap.exists) throw new ApiAuthError('Tu perfil todavía no existe. Recarga la página.', 403);
  const profile = { uid: snap.id, ...snap.data() } as UserProfile;
  if (profile.active === false) throw new ApiAuthError('Tu acceso está desactivado.', 403);
  if (roles && !roles.includes(profile.rol)) {
    throw new ApiAuthError('No tienes permiso para hacer esto.', 403);
  }
  return { token, profile };
}

/** Convierte un ApiAuthError en respuesta; devuelve null si es otro error. */
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof ApiAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}
