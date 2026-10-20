/**
 * Utilidades de marca compartidas por el servidor (layout raíz) y el navegador
 * (BrandingContext): normalizan la configuración y traducen los colores a las
 * variables CSS del tema.
 */

export interface BrandingConfig {
  /** Logo completo (ícono + wordmark), usado en pantallas grandes como login. */
  logoUrl: string | null;
  /** Símbolo/ícono únicamente, usado en espacios reducidos como el header. */
  iconUrl: string | null;
  /** Color primario de marca (hex, ej. "#16B877"). null = usar el default de la plataforma. */
  primaryColor?: string | null;
  /** Color de acento de marca (hex). null = usar el default de la plataforma. */
  accentColor?: string | null;
  updatedAt?: unknown;
}

export const DEFAULT_BRANDING: BrandingConfig = { logoUrl: null, iconUrl: null, primaryColor: null, accentColor: null };

export const DEFAULT_PRIMARY = '#16B877';
export const DEFAULT_ACCENT = '#074739';

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function normalizeBranding(data: Record<string, unknown> | undefined | null): BrandingConfig {
  if (!data) return DEFAULT_BRANDING;
  return {
    logoUrl: str(data.logoUrl),
    iconUrl: str(data.iconUrl),
    primaryColor: str(data.primaryColor),
    accentColor: str(data.accentColor),
  };
}

/** Convierte un hex ("#16B877") al triplete "H S% L%" que esperan las
 * variables CSS del tema (usadas como hsl(var(--primary)) en Tailwind). */
export function hexToHslTriplet(hex: string): string | null {
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

/** Variables CSS del tema para los colores de marca configurados. */
export function brandCssVars(config: Pick<BrandingConfig, 'primaryColor' | 'accentColor'>): Record<string, string> {
  const vars: Record<string, string> = {};
  const primary = config.primaryColor ? hexToHslTriplet(config.primaryColor) : null;
  const accent = config.accentColor ? hexToHslTriplet(config.accentColor) : null;
  if (primary) vars['--primary'] = primary;
  if (accent) vars['--accent'] = accent;
  return vars;
}
