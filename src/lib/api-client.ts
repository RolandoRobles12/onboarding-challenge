import { auth } from './firebase';

/**
 * `fetch` a las rutas de /api con el ID token de la sesión actual. Las rutas
 * lo verifican en el servidor (src/lib/server/auth.ts).
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth?.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers });
}

/**
 * Avisa al servidor de un evento de la capacitación (/api/events) para que
 * mande avisos y entregue insignias. No bloquea ni falla la acción del usuario.
 */
export function postEvent(event: Record<string, unknown> & { type: string }): Promise<void> {
  // keepalive: el aviso no se pierde si el usuario sale de la página justo después.
  return authFetch('/api/events', { method: 'POST', body: JSON.stringify(event), keepalive: true })
    .then(() => undefined)
    .catch(err => console.error('[events]', event.type, err));
}
