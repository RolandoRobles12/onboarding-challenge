/**
 * POST /api/auth/profile
 * Crea el perfil de un usuario la primera vez que inicia sesión.
 *
 * El rol se decide aquí, en el servidor, y no en el navegador: así nadie puede
 * darse un rol de admin escribiendo su propio perfil. Las reglas de Firestore
 * no permiten crear perfiles desde el cliente.
 *
 *  - Si el correo está en la whitelist, toma de ahí el rol, el producto y el
 *    kiosko asignados (y la marca como usada).
 *  - Si no, y el correo está en SUPER_ADMIN_EMAILS, es super_admin (sirve para
 *    arrancar un proyecto nuevo sin admins).
 *  - Si no, es vendedor.
 *
 * Requiere el ID token de la sesión (`Authorization: Bearer <token>`). Si el
 * perfil ya existe no lo modifica.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/server/firebase-admin';
import { authErrorResponse, verifyRequestToken } from '@/lib/server/auth';
import type { UserRole, WhitelistEntry } from '@/lib/types-scalable';

const DEFAULT_ORG_ID = 'aviva-credito';
const VALID_ROLES: UserRole[] = ['super_admin', 'admin', 'trainer', 'seller'];

function superAdminEmails(): string[] {
  const configured = process.env.SUPER_ADMIN_EMAILS ?? 'rolando.9834@gmail.com,admin@avivacredito.com';
  return configured.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

async function findWhitelistEntry(email: string): Promise<WhitelistEntry | null> {
  const snap = await adminDb().collection('whitelist')
    .where('organizationId', '==', DEFAULT_ORG_ID)
    .where('email', '==', email)
    .get();
  const now = Date.now();
  const entries = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as WhitelistEntry))
    .filter(e => !e.expiresAt || (e.expiresAt as unknown as Timestamp).toMillis() > now);
  // Si hay varias invitaciones, la que no se ha usado y es más reciente.
  entries.sort((a, b) =>
    Number(a.used) - Number(b.used) ||
    ((b.addedAt as unknown as Timestamp | undefined)?.toMillis() ?? 0) - ((a.addedAt as unknown as Timestamp | undefined)?.toMillis() ?? 0));
  return entries[0] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = await verifyRequestToken(req);
    const db = adminDb();
    const ref = db.collection('users').doc(token.uid);
    if ((await ref.get()).exists) return NextResponse.json({ created: false });

    const email = token.email!.toLowerCase();
    const entry = await findWhitelistEntry(email);
    const role: UserRole = entry && VALID_ROLES.includes(entry.role)
      ? entry.role
      : superAdminEmails().includes(email) ? 'super_admin' : 'seller';

    const profile: Record<string, unknown> = {
      uid: token.uid,
      email,
      nombre: (token.name as string | undefined) || email.split('@')[0] || 'Usuario',
      rol: role,
      organizationId: DEFAULT_ORG_ID,
      active: true,
      onboardingCompleted: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (entry?.assignedProductId) profile.producto = entry.assignedProductId;
    if (entry?.assignedKiosko) profile.assignedKiosko = entry.assignedKiosko;

    try {
      await ref.create(profile);
    } catch (err) {
      // ALREADY_EXISTS (6): otra pestaña lo creó al mismo tiempo.
      if ((err as { code?: number }).code === 6) return NextResponse.json({ created: false });
      throw err;
    }
    if (entry && !entry.used) {
      await db.collection('whitelist').doc(entry.id).update({ used: true }).catch(err => {
        console.error('[auth/profile] No se pudo marcar la invitación como usada:', err);
      });
    }
    return NextResponse.json({ created: true, role });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[auth/profile] Error:', err);
    return NextResponse.json({ error: 'No se pudo crear tu perfil.' }, { status: 500 });
  }
}
