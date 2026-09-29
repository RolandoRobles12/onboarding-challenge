'use client';

/**
 * La configuración de Slack ahora vive en Gestión del Pulso → Slack.
 * Esta ruta se conserva solo para redirigir enlaces o marcadores anteriores.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SlackAdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/knowledge-pulse?tab=slack');
  }, [router]);
  return <p className="text-sm text-muted-foreground">Abriendo la configuración de Slack del Pulso…</p>;
}
