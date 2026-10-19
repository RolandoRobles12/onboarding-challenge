'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push-client';

const HINT: Record<PushState, string> = {
  enabled: 'Te avisaremos de cursos nuevos, desafíos, plazos por vencer y tus logros.',
  disabled: 'Actívalas para enterarte de cursos nuevos, desafíos y plazos por vencer.',
  denied: 'Las bloqueaste en este navegador. Actívalas desde los ajustes del sitio para recibir avisos.',
  'needs-install': 'En iPhone primero instala la app: Compartir → Agregar a inicio. Luego actívalas aquí.',
  unsupported: 'Este navegador no permite notificaciones. Prueba con Chrome o con la app instalada.',
};

/** Activar o apagar las notificaciones push de este dispositivo (Mi Perfil). */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getPushState().then(setState).catch(() => setState('unsupported')); }, []);

  if (!state) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const next = state === 'enabled' ? await disablePush() : await enablePush();
      setState(next);
      if (next === 'enabled') toast({ title: 'Notificaciones activadas', description: 'Te avisaremos de lo importante.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudieron activar', description: err instanceof Error ? err.message : 'Inténtalo de nuevo.' });
    } finally {
      setBusy(false);
    }
  };

  const Icon = state === 'enabled' ? BellRing : state === 'disabled' ? Bell : BellOff;
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <Icon className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Notificaciones {state === 'enabled' ? 'activadas' : 'en este dispositivo'}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{HINT[state]}</p>
      </div>
      {(state === 'enabled' || state === 'disabled') && (
        <Button size="sm" variant={state === 'enabled' ? 'outline' : 'default'} onClick={toggle} disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : state === 'enabled' ? 'Apagar' : 'Activar'}
        </Button>
      )}
    </div>
  );
}

const PROMPT_DISMISS_KEY = 'pushPromptDismissed';

/** Aviso en el inicio para activar notificaciones; desaparece al activarlas o descartarlo. */
export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(PROMPT_DISMISS_KEY) === '1'; } catch { /* modo privado */ }
    if (dismissed) return;
    getPushState().then(s => setShow(s === 'disabled' || s === 'needs-install')).catch(() => {});
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(PROMPT_DISMISS_KEY, '1'); } catch { /* modo privado */ }
  };
  return (
    <div className="relative">
      <PushToggle />
      <button onClick={dismiss} aria-label="Cerrar" className="absolute -top-2 -right-2 p-1 rounded-full bg-background border shadow-sm text-muted-foreground hover:bg-muted">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
