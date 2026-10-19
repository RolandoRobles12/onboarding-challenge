/**
 * GET /scorm/<ruta> — sirve los archivos de un paquete SCORM descomprimido en
 * Storage (courses/<curso>/scorm/<paquete>/...) desde el mismo dominio de la
 * app. Así el contenido del paquete puede encontrar la API de SCORM que la
 * página del curso expone en `window.API` / `window.API_1484_11` (un iframe de
 * otro dominio no podría).
 *
 * El iframe no puede mandar el token de sesión, así que la ruta no lo pide:
 * solo sirve archivos dentro de carpetas `scorm/` de cursos, con ids aleatorios.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { adminDb } from '@/lib/server/firebase-admin';

const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript',
  css: 'text/css', json: 'application/json', xml: 'application/xml', xsd: 'application/xml', txt: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf', swf: 'application/x-shockwave-flash',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const objectPath = path.map(decodeURIComponent).join('/');
  if (!/^courses\/[^/]+\/scorm\/[^/]+\/.+/.test(objectPath) || objectPath.split('/').some(p => p === '..' || p === '')) {
    return new NextResponse('No encontrado', { status: 404 });
  }
  try {
    adminDb(); // inicializa el Admin SDK (y los emuladores en desarrollo)
    if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.startsWith('demo-')) {
      process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= 'localhost:9199';
    }
    const file = getStorage().bucket(BUCKET).file(objectPath);
    const [contents] = await file.download();
    const ext = objectPath.split('.').pop()?.toLowerCase() ?? '';
    return new NextResponse(new Uint8Array(contents), {
      headers: {
        'Content-Type': TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 404) console.error('[scorm] Error:', err);
    return new NextResponse('No encontrado', { status: 404 });
  }
}
