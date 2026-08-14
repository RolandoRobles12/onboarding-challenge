'use client';

/**
 * Escenario de una simulación: la captura y todo lo que se puede hacer sobre
 * ella. Es la pieza que decide si el ejercicio se siente como usar la app o
 * como picarle a una foto.
 *
 * El modelo es "captura nativa 1:1": el vendedor toma las capturas desde la app
 * de HubSpot o Slack en su tablet, así que la imagen calza exacta con la
 * pantalla y no hace falta ni encuadrar ni acercar. De ahí salen las decisiones:
 *
 *  - Sin zoom por omisión. Se enciende solo cuando la captura no calza —el
 *    mismo módulo abierto en un celular, o las pocas capturas de navegador—
 *    porque ninguna app deja arrastrar su propia pantalla de un lado a otro.
 *  - El marco toma el color del borde de la captura, no negro: cuando no calza,
 *    se ve como una app con márgenes, no como una foto pegada sobre un vacío.
 *  - Gestos de app: deslizar y mantener presionado, además del toque.
 *  - El control que se presiona se hunde, y vibra. La onda genérica queda sólo
 *    para los toques al vacío, que es donde una app real tampoco hace nada.
 *  - La pantalla nueva entra deslizando en la dirección del movimiento, o
 *    apareciendo en su lugar si es un menú.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SimHotspot, SimNode, SimSwipeDirection, SimTransition } from '@/lib/types-simulation';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.4;
/** Cuánto se puede mover el dedo y seguir contando como toque. */
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 800;
const DOUBLE_TAP_MS = 320;
/** Distancia mínima para que un arrastre cuente como deslizamiento. */
const SWIPE_MIN_PX = 45;
const SWIPE_MAX_MS = 800;
/** Cuánto hay que sostener para que sea "mantener presionado". */
const LONG_PRESS_MS = 480;
/** Ancho del borde izquierdo que sirve para regresar, como en iOS. */
const EDGE_BACK_PX = 28;
/** Debajo de esto la captura no llena la pantalla y se permite acercar. */
const FIT_RATIO = 0.92;
const TRANSITION_MS = 260;

export type SimInteraction = 'tap' | 'swipe' | 'longpress' | 'submit';

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
  disabled?: boolean;
  /** Color del marco. Vacío = se toma del borde de la captura. */
  frameColor?: string;
  /** Fuerza el zoom aunque la captura calce. */
  forceZoom?: boolean;
  /** Cómo entra esta pantalla. */
  transition?: { type: SimTransition; direction: 'forward' | 'back' } | null;
  onInteraction: (
    hotspot: SimHotspot | null,
    via: SimInteraction,
    detail: { xPct: number; yPct: number; swipeDirection?: SimSwipeDirection },
  ) => void;
  onChangeText: (hotspotId: string, value: string) => void;
  /** Deslizamiento desde el borde izquierdo: regresar. */
  onEdgeBack?: () => void;
  /** Cualquier actividad del vendedor, para que el cromo se vuelva a mostrar. */
  onActivity?: () => void;
  /** Avisa si la captura llena la pantalla o no. */
  onFitChange?: (fits: boolean) => void;
}

interface Ripple { id: number; x: number; y: number }
interface Fitted { w: number; h: number; left: number; top: number }

export function SimStage({
  node, checked, texts, textErrors, revealHotspotId, revealAll, disabled,
  frameColor, forceZoom, transition,
  onInteraction, onChangeText, onEdgeBack, onActivity, onFitChange,
}: SimStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [box, setBox] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [keyboardShift, setKeyboardShift] = useState(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [sampled, setSampled] = useState<string | null>(null);
  /** La pantalla anterior se queda debajo mientras la nueva entra. */
  const [outgoing, setOutgoing] = useState<string | null>(null);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number; startY: number; startAt: number; moved: boolean; fromEdge: boolean;
    panTx: number; panTy: number;
    pinchDist: number; pinchScale: number; anchorX: number; anchorY: number;
  } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const rippleId = useRef(0);
  const previousUrl = useRef<string | null>(null);

  // La captura entra deslizando y la anterior se queda debajo un instante: sin
  // eso, cambiar de pantalla es un corte seco y se pierde toda la orientación.
  useEffect(() => {
    if (previousUrl.current && previousUrl.current !== node.imageUrl && transition) {
      const url = previousUrl.current;
      setOutgoing(url);
      const timer = setTimeout(() => setOutgoing(current => (current === url ? null : current)), TRANSITION_MS);
      previousUrl.current = node.imageUrl;
      return () => clearTimeout(timer);
    }
    previousUrl.current = node.imageUrl;
  }, [node.imageUrl, transition]);

  // El zoom no se hereda entre pantallas: desubica.
  useEffect(() => {
    setView({ scale: 1, tx: 0, ty: 0 });
    setKeyboardShift(0);
    setPressedId(null);
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

  /** Qué tanto de la pantalla llena la captura. 1 = calza exacta. */
  const fillRatio = fitted && box.w && box.h ? (fitted.w * fitted.h) / (box.w * box.h) : 1;
  const fits = fillRatio >= FIT_RATIO;
  const zoomEnabled = forceZoom === true || !fits;

  useEffect(() => { onFitChange?.(fits); }, [fits, onFitChange]);

  /**
   * Color del marco tomado del borde de la propia captura. Si el navegador no
   * deja leer la imagen, se queda con el color configurado del módulo.
   */
  useEffect(() => {
    if (frameColor) { setSampled(null); return; }
    let active = true;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            if (x !== 0 && x !== 7 && y !== 0 && y !== 7) continue; // sólo el borde
            const i = (y * 8 + x) * 4;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
        }
        setSampled(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
      } catch {
        // Imagen de otro origen sin CORS: nos quedamos con el color por defecto.
      }
    };
    img.src = node.imageUrl;
    return () => { active = false; };
  }, [node.imageUrl, frameColor]);

  const frame = frameColor || sampled || '#101314';

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
      const cx = (anchorX - fitted.left - prev.tx) / prev.scale;
      const cy = (anchorY - fitted.top - prev.ty) / prev.scale;
      const clamped = clamp(next, anchorX - fitted.left - cx * next, anchorY - fitted.top - cy * next);
      return { scale: next, ...clamped };
    });
  }, [fitted, clamp]);

  function localPoint(e: React.PointerEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

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
      if (xPct >= h.xPct && xPct <= h.xPct + h.wPct && yPct >= h.yPct && yPct <= h.yPct + h.hPct) return h;
    }
    return null;
  }

  function addRipple(x: number, y: number) {
    const id = ++rippleId.current;
    setRipples(prev => [...prev.slice(-3), { id, x, y }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    onActivity?.();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const point = localPoint(e);
    pointers.current.set(e.pointerId, point);

    if (pointers.current.size === 1) {
      longPressFired.current = false;
      gesture.current = {
        startX: point.x, startY: point.y, startAt: Date.now(), moved: false,
        fromEdge: point.x <= EDGE_BACK_PX,
        panTx: view.tx, panTy: view.ty,
        pinchDist: 0, pinchScale: view.scale, anchorX: point.x, anchorY: point.y,
      };

      // El control que se está presionando se hunde, como en cualquier app.
      const percent = imagePercent(e.clientX, e.clientY);
      const hotspot = percent ? hitTest(percent.x, percent.y) : null;
      if (hotspot && hotspot.kind !== 'text') setPressedId(hotspot.id);

      if (hotspot?.kind === 'longpress') {
        longPressTimer.current = setTimeout(() => {
          longPressFired.current = true;
          haptic('tap');
          setPressedId(null);
          onInteraction(hotspot, 'longpress', { xPct: percent!.x, yPct: percent!.y });
        }, LONG_PRESS_MS);
      }
    } else if (pointers.current.size === 2) {
      cancelLongPress();
      setPressedId(null);
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        ...(gesture.current ?? {
          startX: point.x, startY: point.y, startAt: Date.now(), moved: true, fromEdge: false,
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
      if (!zoomEnabled) return;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (g.pinchDist > 0) zoomTo(g.pinchScale * (dist / g.pinchDist), g.anchorX, g.anchorY);
      return;
    }

    const dx = point.x - g.startX;
    const dy = point.y - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) {
      g.moved = true;
      cancelLongPress();
      setPressedId(null);
    }

    // Sólo se panea con la imagen acercada; si no, arrastrar es un deslizamiento.
    if (g.moved && zoomEnabled && view.scale > 1) {
      setView(prev => ({ scale: prev.scale, ...clamp(prev.scale, g.panTx + dx, g.panTy + dy) }));
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (disabled) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    setPressedId(null);
    cancelLongPress();

    if (pointers.current.size > 0) return; // siguen habiendo dedos: no concluimos
    gesture.current = null;
    if (!g || longPressFired.current) return;

    const point = localPoint(e);
    const duration = Date.now() - g.startAt;
    const dx = point.x - g.startX;
    const dy = point.y - g.startY;
    const distance = Math.hypot(dx, dy);
    const percent = imagePercent(e.clientX, e.clientY);
    const onImage = !!percent && percent.x >= 0 && percent.x <= 100 && percent.y >= 0 && percent.y <= 100;

    // ── Deslizamiento ────────────────────────────────────────────────────────
    if (distance >= SWIPE_MIN_PX && duration <= SWIPE_MAX_MS && !(zoomEnabled && view.scale > 1)) {
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const direction: SimSwipeDirection = horizontal ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');

      // Desde el borde izquierdo hacia la derecha: regresar, como en iOS.
      if (g.fromEdge && direction === 'right' && onEdgeBack) {
        haptic('advance');
        onEdgeBack();
        return;
      }
      const start = imagePercent(e.clientX - dx, e.clientY - dy);
      const hotspot = start ? hitTest(start.x, start.y) : null;
      onInteraction(hotspot, 'swipe', {
        xPct: start?.x ?? percent?.x ?? 0,
        yPct: start?.y ?? percent?.y ?? 0,
        swipeDirection: direction,
      });
      return;
    }

    if (g.moved || duration > TAP_MAX_MS) return;

    // ── Toque ────────────────────────────────────────────────────────────────
    const hotspot = onImage ? hitTest(percent!.x, percent!.y) : null;

    if (hotspot) {
      // Un control responde al primer toque siempre: si el doble toque también
      // aplicara aquí, desmarcar una casilla se perdería convertido en zoom.
      lastTap.current = null;
      if (hotspot.kind !== 'text') {
        haptic('tap');
        onInteraction(hotspot, 'tap', { xPct: percent!.x, yPct: percent!.y });
      }
      return;
    }

    // Fuera de los controles: con la captura acercada, el doble toque encuadra.
    if (zoomEnabled) {
      const previous = lastTap.current;
      lastTap.current = { at: Date.now(), x: point.x, y: point.y };
      if (previous && Date.now() - previous.at < DOUBLE_TAP_MS &&
          Math.hypot(point.x - previous.x, point.y - previous.y) < 40) {
        lastTap.current = null;
        if (view.scale > 1.05) setView({ scale: 1, ...clamp(1, 0, 0) });
        else zoomTo(DOUBLE_TAP_SCALE, point.x, point.y);
        return;
      }
    }

    addRipple(point.x, point.y);
    if (onImage) onInteraction(null, 'tap', { xPct: percent!.x, yPct: percent!.y });
  }

  function handlePointerCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    cancelLongPress();
    setPressedId(null);
    if (pointers.current.size === 0) gesture.current = null;
  }

  /** El teclado del teléfono tapa el campo: subimos el escenario lo justo. */
  function handleFieldFocus(el: HTMLInputElement) {
    setTimeout(() => {
      const viewport = window.visualViewport;
      const visibleBottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      const overflow = el.getBoundingClientRect().bottom - (visibleBottom - 16);
      if (overflow > 0) setKeyboardShift(-overflow);
    }, 250);
  }

  const zoneStyle = (h: SimHotspot) => ({
    left: `${h.xPct}%`, top: `${h.yPct}%`, width: `${h.wPct}%`, height: `${h.hPct}%`,
  });

  const enterClass = !transition ? ''
    : transition.type === 'fade' ? 'animate-sim-fade'
    : transition.direction === 'back' ? 'animate-sim-push-back'
    : 'animate-sim-push';

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden touch-none select-none"
      style={{ backgroundColor: frame }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* La pantalla que sale se queda quieta debajo mientras entra la nueva. */}
      {outgoing && fitted && (
        <img
          src={outgoing}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute"
          style={{ left: fitted.left, top: fitted.top, width: fitted.w, height: fitted.h }}
        />
      )}

      <div
        key={node.id}
        className={cn('absolute origin-top-left', enterClass)}
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
          onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className="block w-full h-full object-contain"
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
              onFocus={e => { onActivity?.(); handleFieldFocus(e.currentTarget); }}
              onBlur={() => setKeyboardShift(0)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                e.currentTarget.blur();
                onInteraction(hotspot, 'submit', { xPct: hotspot.xPct, yPct: hotspot.yPct });
              }}
              // El detector de gestos vive en el contenedor; sin esto, escribir
              // contaría además como un toque al fondo.
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
              style={{ ...zoneStyle(hotspot), fontSize: `${fontSize}px` }}
            />
          );
        })}

        {/* Control presionado: la respuesta inmediata que da cualquier app. */}
        {pressedId && node.hotspots.filter(h => h.id === pressedId).map(hotspot => (
          <div key={hotspot.id} aria-hidden className="absolute rounded-sm bg-black/12 pointer-events-none" style={zoneStyle(hotspot)} />
        ))}

        {/* Casillas marcadas: sin esto el vendedor no ve el efecto de su toque. */}
        {node.hotspots.filter(h => h.kind === 'checkbox' && checked.includes(h.id)).map(hotspot => (
          <div
            key={hotspot.id}
            aria-hidden
            className="absolute rounded-sm border-2 border-emerald-500 bg-emerald-400/25 pointer-events-none"
            style={zoneStyle(hotspot)}
          />
        ))}

        {/* Pista nivel 3: señala dónde, sin destapar el resto. */}
        {revealHotspotId && node.hotspots.filter(h => h.id === revealHotspotId).map(hotspot => (
          <div
            key={hotspot.id}
            aria-hidden
            className="absolute rounded-sm border-2 border-amber-400 animate-pulse-ring pointer-events-none"
            style={zoneStyle(hotspot)}
          />
        ))}

        {revealAll && node.hotspots.map(hotspot => (
          <div
            key={hotspot.id}
            aria-hidden
            className={cn(
              'absolute rounded-sm border-2 pointer-events-none',
              hotspot.kind === 'checkbox' ? 'border-emerald-400/70 bg-emerald-400/10'
                : hotspot.kind === 'text' ? 'border-amber-400/70 bg-amber-400/10'
                : hotspot.kind === 'swipe' ? 'border-violet-400/80 bg-violet-400/10'
                : hotspot.kind === 'longpress' ? 'border-fuchsia-400/80 bg-fuchsia-400/10'
                : hotspot.isCorrect ? 'border-sky-400 bg-sky-400/20'
                : 'border-white/50 bg-white/5'
            )}
            style={zoneStyle(hotspot)}
          />
        ))}
      </div>

      {/* Onda del toque: sólo donde no hay nada, que es donde una app tampoco responde. */}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          aria-hidden
          className="absolute rounded-full bg-black/10 pointer-events-none animate-sim-ripple"
          style={{ left: ripple.x - 22, top: ripple.y - 22, width: 44, height: 44 }}
        />
      ))}

      {zoomEnabled && view.scale > 1.05 && (
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onPointerUp={e => e.stopPropagation()}
          onClick={() => setView({ scale: 1, ...clamp(1, 0, 0) })}
          className="absolute bottom-3 right-3 rounded-full bg-black/60 text-white text-xs px-3 py-1.5 backdrop-blur border border-white/15"
        >
          Ver completa
        </button>
      )}
    </div>
  );
}
