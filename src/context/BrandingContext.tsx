'use client';

import * as React from 'react';
import { getBrandingConfig, type BrandingConfig } from '@/lib/firestore-service';

interface BrandingContextType {
  logoUrl: string | null;
  iconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = React.createContext<BrandingContextType>({
  logoUrl: null,
  iconUrl: null,
  primaryColor: null,
  accentColor: null,
  loading: true,
  refreshBranding: async () => {},
});

/** Convierte un hex ("#16B877") al triplete "H S% L%" que esperan las
 * variables CSS del tema (usadas como hsl(var(--primary)) en Tailwind). */
function hexToHslTriplet(hex: string): string | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyBrandColors(primaryColor: string | null, accentColor: string | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  const primaryHsl = primaryColor ? hexToHslTriplet(primaryColor) : null;
  const accentHsl = accentColor ? hexToHslTriplet(accentColor) : null;
  if (primaryHsl) root.setProperty('--primary', primaryHsl);
  else root.removeProperty('--primary');
  if (accentHsl) root.setProperty('--accent', accentHsl);
  else root.removeProperty('--accent');
}

export const BrandingProvider = ({ children }: { children: React.ReactNode }) => {
  const [branding, setBranding] = React.useState<BrandingConfig>({
    logoUrl: null, iconUrl: null, primaryColor: null, accentColor: null,
  });
  const [loading, setLoading] = React.useState(true);

  const refreshBranding = React.useCallback(async () => {
    try {
      const config = await getBrandingConfig();
      setBranding(config);
      applyBrandColors(config.primaryColor ?? null, config.accentColor ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refreshBranding(); }, [refreshBranding]);

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
