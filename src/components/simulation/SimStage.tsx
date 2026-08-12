'use client';

/**
 * Escenario de una simulación: la captura de pantalla y todo lo que se puede
 * hacer sobre ella.
 *
 * Es la pieza que decide si el ejercicio se siente como usar la herramienta o
 * como picarle a una foto. Lo que resuelve:
 *
 *  - Zoom y paneo. Una captura de HubSpot de escritorio en un celular es
 *    ilegible; sin pellizcar para acercar, el vendedor adivina en vez de leer.
 *  - Distinguir toque de gesto. Un pellizco o un arrastre no pueden contar
 *    como un toque fallido.
 *  - Feedback físico inmediato: cada toque deja una onda donde cayó el dedo,
 *    incluso cuando no pasa nada. Tocar algo que no es botón y no ver ninguna
 *    reacción es exactamente lo que se siente en una app real.
 *  - Campos de texto que viven dentro de la imagen (escalan con el zoom) y que
 *    se acomodan solos cuando el teclado del teléfono tapa el campo.
 *
 * El contenedor calcula el rectángulo exacto donde cae la imagen y lo usa como
 * marco: así los porcentajes de cada zona coinciden con el pixel de la captura
 * en cualquier pantalla, sin depender de `object-contain`.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SimHotspot, SimNode } from '@/lib/types-simulation';
import { cn } from '@/lib/utils';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.4;
/** Cuánto se puede mover el dedo y seguir contando como toque. */
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 800;
const DOUBLE_TAP_MS = 320;

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface Fitted {
  w: number;
  h: number;
  left: number;
  top: number;
}

export interface SimStageProps {
  node: SimNode;
  /** Ids de las casillas marcadas en esta pantalla. */
  checked: string[];
  texts: Record<string, string>;
  /** Mensaje de error por campo de texto, si lo hay. */
  textErrors: Record<string, string>;
  /** Zona resaltada por una pista. */
  revealHotspotId?: string | null;
  /** Modo capacitador: muestra todas las zonas. Nunca para el vendedor. */
  revealAll?: boolean;
  /** Se incrementa desde afuera para sacudir la pantalla en un error. */
  shakeToken?: number;
  disabled?: boolean;
  onTap: (hotspot: SimHotspot | null, xPct: number, yPct: number) => void;
  onChangeText: (hotspotId: string, value: string) => void;
}

export function SimStage({
  node, checked, texts, textErrors, revealHotspotId, revealAll,
  shakeToken = 0, disabled, onTap, onChangeText,
}: SimStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [box, setBox] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  /** Desplazamiento extra para que el teclado no tape el campo enfocado. */
  const [keyboardShift, setKeyboardShift] = useState(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [shaking, setShaking] = useState(false);

  // Punteros activos, para separar toque / arrastre / pellizco.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number; startY: number; startAt: number; moved: boolean;
    panTx: number; panTy: number;
    pinchDist: number; pinchScale: number; anchorX: number; anchorY: number;
  } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const rippleId = useRef(0);

  // Cada pantalla empieza sin zoom: heredar el zoom de la anterior desubica.
  useEffect(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
    setKeyboardShift(0);
    setNatural(null);
    setLoaded(false);
  }, [node.id]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setBox({ w: rect.width, h: rect.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!shakeToken) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 420);
    return () => clearTimeout(t);
  }, [shakeToken]);

  /** Rectángulo exacto donde cae la imagen dentro del contenedor. */
  const fitted = useMemo<Fitted | null>(() => {
    if (!natural || !box.w || !box.h) return null;
    const ratio = natural.w / natural.h;
    let w = box.w;
    let h = box.w / ratio;
    if (h > box.h) {
      h = box.h;
      w = box.h * ratio;
    }
    return { w, h, left: (box.w - w) / 2, top: (box.h - h) / 2 };
  }, [natural, box]);

  /** Mantiene la imagen dentro de cuadro: sin huecos raros ni imagen perdida. */
  const clamp = useCallback((scale: number, tx: number, ty: number) => {
    if (!fitted) return { tx, ty };
    const sw = fitted.w * scale;
    const sh = fitted.h * scale;
    const nx = sw <= box.w
      ? (box.w - sw) / 2 - fitted.left
      : Math.min(-fitted.left, Math.max(box.w - fitted.left - sw, tx));
    const ny = sh <= box.h
      ? (box.h - sh) / 2 - fitted.top
      : Math.min(-fitted.top, Math.max(box.h - fitted.top - sh, ty));
    return { tx: nx, ty: ny };
  }, [fitted, box]);

  const zoomTo = useCallback((scale: number, anchorX: number, anchorY: number) => {
    if (!fitted) return;
    setView(prev => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      // Punto de la imagen bajo el dedo, para que no se mueva al acercar.
      const cx = (anchorX - fitted.left - prev.tx) / prev.scale;
      const cy = (anchorY - fitted.top - prev.ty) / prev.scale;
      const tx = anchorX - fitted.left - cx * next;
      const ty = anchorY - fitted.top - cy * next;
      const clamped = clamp(next, tx, ty);
      return { scale: next, ...clamped };
    });
  }, [fitted, clamp]);

  /** Coordenadas del evento relativas al contenedor. */
  function localPoint(e: React.PointerEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /**
   * Punto de la imagen en porcentaje. Se calcula contra el rectángulo real del
   * `img`, que ya trae aplicada la transformación, así que el zoom y el paneo
   * no pueden desalinear el cálculo.
   */
  function imagePercent(clientX: number, clientY: number) {
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }

  function hitTest(xPct: number, yPct: number): SimHotspot | null {
    // De arriba hacia abajo: la última zona dibujada es la que está encima.
    for (let i = node.hotspots.length - 1; i >= 0; i--) {
      const h = node.hotspots[i];
      if (xPct >= h.xPct && xPct <= h.xPct + h.wPct && yPct >= h.yPct && yPct <= h.yPct + h.hPct) {
        return h;
      }
    }
    return null;
  }

  function addRipple(x: number, y: number) {
    const id = ++rippleId.current;
    setRipples(prev => [...prev.slice(-4), { id, x, y }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const point = localPoint(e);
    pointers.current.set(e.pointerId, point);

    if (pointers.current.size === 1) {
      gesture.current = {
        startX: point.x, startY: point.y, startAt: Date.now(), moved: false,
        panTx: view.tx, panTy: view.ty,
        pinchDist: 0, pinchScale: view.scale, anchorX: point.x, anchorY: point.y,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        ...(gesture.current ?? {
          startX: point.x, startY: point.y, startAt: Date.now(), moved: true,
          panTx: view.tx, panTy: view.ty, pinchDist: 0, pinchScale: view.scale,
          anchorX: point.x, anchorY: point.y,
        }),
        moved: true,
        pinchDist: Math.hypot(a.x - b.x, a.y - b.y),
        pinchScale: view.scale,
        anchorX: (a.x + b.x) / 2,
        anchorY: (a.y + b.y) / 2,
      };
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (disabled || !pointers.current.has(e.pointerId)) return;
    const point = localPoint(e);
    pointers.current.set(e.pointerId, point);
    const g = gesture.current;
    if (!g) return;

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.pinchDist > 0) {
        zoomTo(g.pinchScale * (dist / g.pinchDist), g.anchorX, g.anchorY);
      }
      return;
    }

    const dx = point.x - g.startX;
    const dy = point.y - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) g.moved = true;

    // Sin zoom no hay nada que panear: la imagen ya cabe completa.
    if (g.moved && view.scale > 1) {
      setView(prev => ({ scale: prev.scale, ...clamp(prev.scale, g.panTx + dx, g.panTy + dy) }));
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (disabled) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (pointers.current.size > 0) return; // sigue habiendo dedos: no es un toque
    gesture.current = null;
    if (!g) return;

    const duration = Date.now() - g.startAt;
    if (g.moved || duration > TAP_MAX_MS) return;

    const point = localPoint(e);
    const percent = imagePercent(e.clientX, e.clientY);
    const onImage = !!percent &&
      percent.x >= 0 && percent.x <= 100 && percent.y >= 0 && percent.y <= 100;
    const hotspot = onImage ? hitTest(percent!.x, percent!.y) : null;

    // Un control responde al primer toque, siempre. Si el doble toque también
    // aplicara aquí, tocar dos veces seguidas una casilla —desmarcarla, que es
    // lo natural— se perdería convertido en un zoom.
    if (hotspot) {
      lastTap.current = null;
      addRipple(point.x, point.y);
      // Los campos de texto tienen su propio input encima; el toque llega aquí
      // sólo si cayó en el borde, y ahí no debe pasar nada.
      if (hotspot.kind !== 'text') onTap(hotspot, percent!.x, percent!.y);
      return;
    }

    // Fuera de los controles, el doble toque acerca donde el vendedor está
    // mirando: es el gesto para poder leer una captura de escritorio.
    const previous = lastTap.current;
    lastTap.current = { at: Date.now(), x: point.x, y: point.y };
    if (previous && Date.now() - previous.at < DOUBLE_TAP_MS &&
        Math.hypot(point.x - previous.x, point.y - previous.y) < 40) {
      lastTap.current = null;
      if (view.scale > 1.05) {
        setView({ scale: 1, ...clamp(1, 0, 0) });
      } else {
        zoomTo(DOUBLE_TAP_SCALE, point.x, point.y);
      }
      return;
    }

    addRipple(point.x, point.y);
    if (onImage) onTap(null, percent!.x, percent!.y);
  }

  function handlePointerCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  }

  /**
   * El teclado del teléfono tapa la mitad inferior de la pantalla. Si el campo
   * enfocado queda debajo, subimos el escenario lo justo para verlo.
   */
  function handleFieldFocus(el: HTMLInputElement) {
    setTimeout(() => {
      const viewport = window.visualViewport;
      const visibleBottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      const rect = el.getBoundingClientRect();
      const overflow = rect.bottom - (visibleBottom - 16);
      if (overflow > 0) setKeyboardShift(-overflow);
    }, 250);
  }

  const showZones = revealAll === true;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex-1 overflow-hidden touch-none select-none bg-neutral-950',
        shaking && 'animate-shake'
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Marco exacto de la imagen: los porcentajes de cada zona se miden aquí. */}
      <div
        className="absolute origin-top-left"
        style={fitted ? {
          left: fitted.left,
          top: fitted.top,
          width: fitted.w,
          height: fitted.h,
          transform: `translate(${view.tx}px, ${view.ty + keyboardShift}px) scale(${view.scale})`,
          transition: gesture.current ? 'none' : 'transform 180ms ease-out',
        } : { left: 0, top: 0, right: 0, bottom: 0 }}
      >
        <img
          ref={imageRef}
          src={node.imageUrl}
          alt=""
          draggable={false}
          onLoad={e => {
            const img = e.currentTarget;
            setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            setLoaded(true);
          }}
          className={cn(
            'block w-full h-full object-contain transition-opacity duration-200',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        />

        {fitted && node.hotspots.filter(h => h.kind === 'text').map(hotspot => {
          const fieldHeight = (hotspot.hPct / 100) * fitted.h;
          const fontSize = Math.max(10, Math.min(22, fieldHeight * 0.5));
          const invalid = !!textErrors[hotspot.id];
          return (
            <input
              key={hotspot.id}
              type="text"
              inputMode="text"
              enterKeyHint="done"
              value={texts[hotspot.id] || ''}
              disabled={disabled}
              placeholder={hotspot.placeholder}
              aria-label={hotspot.label}
              aria-invalid={invalid}
              onChange={e => onChangeText(hotspot.id, e.target.value)}
              onFocus={e => handleFieldFocus(e.currentTarget)}
              onBlur={() => setKeyboardShift(0)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              // El detector de gestos vive en el contenedor; sin esto, escribir
              // en el campo contaría además como un toque al fondo.
              onPointerDown={e => e.stopPropagation()}
              onPointerMove={e => e.stopPropagation()}
              onPointerUp={e => e.stopPropagation()}
              className={cn(
                'absolute rounded-[2px] bg-white text-neutral-900 px-1 outline-none border',
                'touch-auto select-text placeholder:text-neutral-400',
                invalid
                  ? 'border-red-500 ring-2 ring-red-500/30'
                  : 'border-neutral-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30'
              )}
              style={{
                left: `${hotspot.xPct}%`,
                top: `${hotspot.yPct}%`,
                width: `${hotspot.wPct}%`,
                height: `${hotspot.hPct}%`,
                fontSize: `${fontSize}px`,
              }}
            />
          );
        })}

        {/* Casillas marcadas: sin esto el vendedor no ve el efecto de su toque. */}
        {node.hotspots.filter(h => h.kind === 'checkbox' && checked.includes(h.id)).map(hotspot => (
          <div
            key={hotspot.id}
            aria-hidden
            className="absolute rounded-sm border-2 border-emerald-500 bg-emerald-400/25 pointer-events-none"
            style={{
              left: `${hotspot.xPct}%`, top: `${hotspot.yPct}%`,
              width: `${hotspot.wPct}%`, height: `${hotspot.hPct}%`,
            }}
          />
        ))}

        {/* Pista nivel 3: señala dónde tocar, sin destapar el resto. */}
        {revealHotspotId && node.hotspots.filter(h => h.id === revealHotspotId).map(hotspot => (
          <div
            key={hotspot.id}
            aria-hidden
            className="absolute rounded-sm border-2 border-amber-400 animate-pulse-ring pointer-events-none"
            style={{
              left: `${hotspot.xPct}%`, top: `${hotspot.yPct}%`,
              width: `${hotspot.wPct}%`, height: `${hotspot.hPct}%`,
            }}
          />
        ))}

        {showZones && node.hotspots.map(hotspot => (
          <div
            key={hotspot.id}
            aria-hidden
            className={cn(
              'absolute rounded-sm border-2 pointer-events-none',
              hotspot.kind === 'checkbox' ? 'border-emerald-400/70 bg-emerald-400/10'
                : hotspot.kind === 'text' ? 'border-amber-400/70 bg-amber-400/10'
                : hotspot.isCorrect ? 'border-sky-400 bg-sky-400/20'
                : 'border-white/40 bg-white/5'
            )}
            style={{
              left: `${hotspot.xPct}%`, top: `${hotspot.yPct}%`,
              width: `${hotspot.wPct}%`, height: `${hotspot.hPct}%`,
            }}
          />
        ))}
      </div>

      {/* Onda del toque: la respuesta física a cada dedo, aunque no pase nada. */}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          aria-hidden
          className="absolute rounded-full bg-white/40 pointer-events-none animate-sim-ripple"
          style={{ left: ripple.x - 22, top: ripple.y - 22, width: 44, height: 44 }}
        />
      ))}

      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
        </div>
      )}

      {view.scale > 1.05 && (
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
          onClick={() => setView({ scale: 1, ...clamp(1, 0, 0) })}
          className="absolute bottom-3 right-3 rounded-full bg-black/70 text-white text-xs px-3 py-1.5 backdrop-blur border border-white/15"
        >
          Ver completa
        </button>
      )}
    </div>
  );
}
