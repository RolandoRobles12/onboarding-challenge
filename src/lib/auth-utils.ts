/**
 * Permite el acceso a cualquier usuario con email válido.
 * El control de roles y acceso real se maneja a través de:
 *   - Whitelist en Firestore (asignación de rol al primer login)
 *   - profile.rol en toda la app (admin, seller, trainer)
 *   - Firestore Security Rules en producción
 */
export function isUserAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.includes('@');
}
