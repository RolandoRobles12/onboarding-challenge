/**
 * Vibración corta para las simulaciones.
 *
 * Es la señal más barata de "esto responde como una app". Un toque sobre un
 * control de verdad se siente distinto a picarle a un pedazo de imagen, y esa
 * diferencia es la mitad de la ilusión.
 *
 * Silencioso donde no existe (iOS/Safari no expone la API): la simulación
 * nunca depende de que funcione.
 */

export type HapticKind = 'tap' | 'advance' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  /** Toque sobre un control real. Apenas perceptible. */
  tap: 8,
  /** Cambio de pantalla: un poco más de cuerpo. */
  advance: 14,
  /** Algo no procede. Dos golpes secos, sin dramatismo. */
  error: [12, 60, 12],
};

export function haptic(kind: HapticKind): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // Algunos navegadores lanzan si la pestaña no tiene interacción previa.
  }
}
