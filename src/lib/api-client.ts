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
