'use client';

import * as React from 'react';
import { getBrandingConfig } from '@/lib/firestore-service';
import { authFetch } from '@/lib/api-client';
import { brandCssVars, DEFAULT_BRANDING, type BrandingConfig } from '@/lib/branding';

interface BrandingContextType {
  logoUrl: string | null;
  iconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  loading: boolean;
  /** Vuelve a leer la marca; con `publish`, también invalida la copia del servidor. */
  refreshBranding: (opts?: { publish?: boolean }) => Promise<void>;
}

const BrandingContext = React.createContext<BrandingContextType>({
  logoUrl: null,
  iconUrl: null,
  primaryColor: null,
  accentColor: null,
  loading: true,
  refreshBranding: async () => {},
});

function applyBrandColors(config: BrandingConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  const vars = brandCssVars(config);
  for (const name of ['--primary', '--accent']) {
    if (vars[name]) root.setProperty(name, vars[name]);
    else root.removeProperty(name);
  }
}

/**
 * `initial` llega del layout raíz (render del servidor): con ella los logos y
 * colores aparecen desde el primer pintado. Si el servidor no pudo leerla, se
 * consulta desde el navegador como antes.
 */
export const BrandingProvider = ({ children, initial }: { children: React.ReactNode; initial?: BrandingConfig | null }) => {
  const [branding, setBranding] = React.useState<BrandingConfig>(initial ?? DEFAULT_BRANDING);
  const [loading, setLoading] = React.useState(!initial);

  const refreshBranding = React.useCallback(async (opts?: { publish?: boolean }) => {
    try {
      const config = await getBrandingConfig();
      setBranding(config);
      applyBrandColors(config);
      if (opts?.publish) {
        await authFetch('/api/branding/refresh', { method: 'POST' }).catch(err => console.error('[branding]', err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initial) refreshBranding();
  }, [initial, refreshBranding]);

  return (
    <BrandingContext.Provider value={{
      logoUrl: branding.logoUrl,
      iconUrl: branding.iconUrl,
      primaryColor: branding.primaryColor ?? null,
      accentColor: branding.accentColor ?? null,
      loading,
      refreshBranding,
    }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => React.useContext(BrandingContext);
