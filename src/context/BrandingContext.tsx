'use client';

import * as React from 'react';
import { getBrandingConfig, type BrandingConfig } from '@/lib/firestore-service';

interface BrandingContextType {
  logoUrl: string | null;
  iconUrl: string | null;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = React.createContext<BrandingContextType>({
  logoUrl: null,
  iconUrl: null,
  loading: true,
  refreshBranding: async () => {},
});

export const BrandingProvider = ({ children }: { children: React.ReactNode }) => {
  const [branding, setBranding] = React.useState<BrandingConfig>({ logoUrl: null, iconUrl: null });
  const [loading, setLoading] = React.useState(true);

  const refreshBranding = React.useCallback(async () => {
    try {
      const config = await getBrandingConfig();
      setBranding(config);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { refreshBranding(); }, [refreshBranding]);

  return (
    <BrandingContext.Provider value={{ logoUrl: branding.logoUrl, iconUrl: branding.iconUrl, loading, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => React.useContext(BrandingContext);
