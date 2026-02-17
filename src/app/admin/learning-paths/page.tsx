'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Las Rutas de Aprendizaje y las Rutas del Jaguar Aviva son el mismo concepto.
 * Redirige al builder unificado en /admin/journey.
 */
export default function LearningPathsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/journey');
  }, [router]);
  return null;
}
