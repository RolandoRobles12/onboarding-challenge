import type { UserRole } from './types-scalable';

/**
 * Acceso a las secciones del panel de administración.
 *
 * Roles y Permisos (role_permissions) decide qué secciones ve cada rol, pero
 * algunas nunca se pueden abrir a roles menores: sus datos además están
 * protegidos por las reglas de Firestore.
 */

/** Solo super_admin. */
export const SUPER_ADMIN_ONLY_PATHS = ['/admin/roles'];

/** Solo admin y super_admin (usuarios, invitaciones y tokens de integraciones). */
export const ADMIN_ONLY_PATHS = ['/admin/users', '/admin/tokens'];

/** Siempre disponibles para cualquier rol del panel. */
const ALWAYS_ALLOWED = ['/admin', '/admin/team'];

/** Subrutas que pertenecen a otra sección del menú. */
const SECTION_ALIASES: Record<string, string> = {
  '/admin/certificate-template': '/admin/certificados',
  '/admin/certificate-signers': '/admin/certificados',
  '/admin/learning-paths': '/admin/journey',
  '/admin/slack': '/admin/knowledge-pulse',
};

/** "/admin/quizzes/abc" → "/admin/quizzes" */
export function adminSectionOf(pathname: string): string {
  const parts = pathname.split('?')[0].split('/').filter(Boolean);
  const section = parts.length <= 1 ? '/admin' : `/${parts[0]}/${parts[1]}`;
  return SECTION_ALIASES[section] ?? section;
}

/** Si el rol puede asignar esa sección en Roles y Permisos. */
export function isAssignableToRole(role: UserRole, section: string): boolean {
  if (role === 'super_admin') return true;
  if (SUPER_ADMIN_ONLY_PATHS.includes(section)) return false;
  if (ADMIN_ONLY_PATHS.includes(section)) return role === 'admin';
  return true;
}

/**
 * @param allowedPaths secciones configuradas para el rol; null = sin
 *                     configuración (todas las que el rol puede tener).
 */
export function canAccessAdminPath(role: UserRole | undefined, pathname: string, allowedPaths: Set<string> | null): boolean {
  if (!role || role === 'seller') return false;
  if (role === 'super_admin') return true;
  const section = adminSectionOf(pathname);
  if (ALWAYS_ALLOWED.includes(section)) return true;
  if (!isAssignableToRole(role, section)) return false;
  return allowedPaths === null || allowedPaths.has(section);
}
