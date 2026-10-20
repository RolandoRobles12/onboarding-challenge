import { redirect } from 'next/navigation';

/**
 * Antes aquí se capturaban los datos del vendedor antes del desafío. Ahora eso
 * lo hace el ingreso (SellerOnboardingGate) y los desafíos se abren desde la
 * ruta o Prácticas; los enlaces viejos del tipo /<producto> llevan al inicio.
 */
export default function LegacyProductPage() {
  redirect('/');
}
