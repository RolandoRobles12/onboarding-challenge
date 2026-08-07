'use client';

import { cn } from '@/lib/utils';
import { useBranding } from '@/context/BrandingContext';

interface AvivaLogoProps {
  className?: string;
  /** 'full' = ícono + wordmark (uso general). 'icon' = solo el símbolo (espacios reducidos, ej. sidebar). */
  variant?: 'full' | 'icon';
}

function FallbackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Aviva</title>
      <rect x="1" y="1" width="30" height="38" rx="15" fill="#B0F5CD" />
      <rect x="4" y="4" width="24" height="32" rx="12" fill="#16B877" />
      <rect x="8" y="8" width="16" height="24" rx="8" fill="#FFFFFF" />
      <rect x="11" y="11" width="10" height="18" rx="5" fill="#026149" />
      <circle cx="16" cy="16.5" r="1.8" fill="#FFFFFF" />
    </svg>
  );
}

function FallbackFull({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 172 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <title>Aviva</title>
      <rect x="1" y="1" width="30" height="38" rx="15" fill="#B0F5CD" />
      <rect x="4" y="4" width="24" height="32" rx="12" fill="#16B877" />
      <rect x="8" y="8" width="16" height="24" rx="8" fill="#FFFFFF" />
      <rect x="11" y="11" width="10" height="18" rx="5" fill="#026149" />
      <circle cx="16" cy="16.5" r="1.8" fill="#FFFFFF" />
      <text
        x="40" y="30"
        fontFamily="Fustat, Arial, sans-serif"
        fontWeight="700"
        fontSize="30"
        fill="#16B877"
      >
        aviva
      </text>
    </svg>
  );
}

/**
 * Logo de Aviva. Usa el logo subido por el admin (Ajustes > Marca) cuando existe;
 * de lo contrario cae en un símbolo/wordmark vectorial de respaldo en los colores de marca.
 */
export function AvivaLogo({ variant = 'full', className }: AvivaLogoProps) {
  const { logoUrl, iconUrl } = useBranding();
  const uploadedUrl = variant === 'icon' ? (iconUrl ?? logoUrl) : (logoUrl ?? iconUrl);

  if (uploadedUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={uploadedUrl} alt="Aviva" className={cn('object-contain', className)} />;
  }

  return variant === 'icon'
    ? <FallbackIcon className={className} />
    : <FallbackFull className={className} />;
}
