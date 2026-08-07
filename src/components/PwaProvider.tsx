'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwaInstallDismissed';

/** iOS/iPadOS no dispara beforeinstallprompt: Safari exige "Compartir → Agregar
 *  a inicio" a mano, así que ahí hay que explicar el paso en vez de un botón. */
function isIos() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ se reporta como Mac con pantalla táctil
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari en iOS
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Registra el service worker y ofrece instalar la app.
 *
 * Se monta en el layout raíz. No renderiza nada mientras la app ya esté
 * instalada (display-mode: standalone) o si el usuario descartó el aviso.
 */
export function PwaProvider() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // arranca oculto hasta comprobar

  // ── Registro del service worker ──
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.error('No se pudo registrar el service worker:', err);
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  // ── Disponibilidad de instalación ──
  useEffect(() => {
    if (isStandalone()) return; // ya está instalada, no hay nada que ofrecer
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    setDismissed(false);

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault(); // evita el mini-infobar de Chrome, usamos el nuestro
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* modo privado */ }
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === 'accepted') dismiss();
  };

  if (dismissed) return null;
  if (!installEvent && !showIosHint) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:left-auto sm:right-4 sm:w-[360px] rounded-2xl border bg-card shadow-lg p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <Download className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Instala Aviva LMS</p>
          {showIosHint ? (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Toca <Share className="inline h-3 w-3 mx-0.5" /> <strong>Compartir</strong> y luego{' '}
              <Plus className="inline h-3 w-3 mx-0.5" /> <strong>Agregar a inicio</strong> para abrirla
              como una app, a pantalla completa.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Ábrela como una app: pantalla completa, ícono propio y funciona aunque
              se caiga la señal.
            </p>
          )}
          {!showIosHint && (
            <button
              onClick={install}
              className="mt-2.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90 transition-colors"
            >
              Instalar
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Cerrar aviso de instalación"
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
