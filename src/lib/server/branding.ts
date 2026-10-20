/**
 * Marca para el render del servidor: el layout raíz la manda en el HTML para
 * que logos y colores aparezcan desde el primer pintado, sin esperar a que el
 * navegador consulte Firestore. Se cachea 60 s; al guardar cambios en
 * Admin → Marca se invalida con revalidateTag('branding').
 */

import { unstable_cache } from 'next/cache';
import { adminDb } from './firebase-admin';
import { normalizeBranding, type BrandingConfig } from '@/lib/branding';

export const BRANDING_TAG = 'branding';

const readBranding = unstable_cache(
  async (): Promise<BrandingConfig> => {
    const snap = await adminDb().collection('config').doc('branding').get();
    return normalizeBranding(snap.exists ? snap.data() : null);
  },
  ['branding-config'],
  { tags: [BRANDING_TAG], revalidate: 60 },
);

/** null si no se pudo leer: el navegador la consulta por su cuenta. */
export async function getServerBranding(): Promise<BrandingConfig | null> {
  try {
    return await readBranding();
  } catch (err) {
    console.error('[branding] No se pudo leer la marca en el servidor:', err);
    return null;
  }
}
