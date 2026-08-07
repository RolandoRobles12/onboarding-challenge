'use client';

import { useEffect } from 'react';

/**
 * Avisa antes de cerrar o recargar la pestaña cuando hay cambios sin guardar.
 *
 * Los builders del panel (cursos, formularios, evaluaciones) mantienen mucho
 * trabajo en estado local antes de guardar; sin esto, cerrar la pestaña por
 * error lo pierde todo sin ninguna advertencia.
 *
 * Nota: el navegador muestra su propio texto genérico — no se puede
 * personalizar el mensaje por seguridad. Esto tampoco intercepta la
 * navegación interna del App Router, solo cierre/recarga/salida del sitio.
 */
export function useUnsavedChanges(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Los navegadores modernos ignoran el valor, pero sigue siendo
      // necesario asignarlo para que se muestre el diálogo.
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);
}
