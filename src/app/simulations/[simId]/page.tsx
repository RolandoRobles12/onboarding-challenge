'use client';

/**
 * Runner de prueba del prototipo de "simulación por nodos".
 *
 * Standalone a propósito: no está enganchado a cursos, rutas ni
 * AssessmentConfig. Sirve para validar el patrón de interacción (tocar sobre
 * una captura real, escribir en los campos que importan, navegar de pantalla
 * en pantalla y calificar por ruta y estado final) antes de integrarlo a algo
 * que un vendedor real vea en su ruta de aprendizaje.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getSimModule, createSimAttempt } from '@/lib/firestore-service';
import { serverTimestamp } from 'firebase/firestore';
import { matchesValidAnswer } from '@/lib/types-simulation';
import type { SimModule, SimNode, SimTapEvent } from '@/lib/types-simulation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, RotateCcw, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SimulationRunnerPage() {
  const params = useParams<{ simId: string }>();
  const { user, profile } = useAuth();
  const [module, setModule] = useState<SimModule | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showZones, setShowZones] = useState(false);

  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [path, setPath] = useState<string[]>([]);
  const [taps, setTaps] = useState<SimTapEvent[]>([]);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [banner, setBanner] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [finished, setFinished] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    getSimModule(params.simId).then(m => {
      if (!active) return;
      if (!m) { setNotFound(true); return; }
      setModule(m);
      startOver(m);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.simId]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 2500);
    return () => clearTimeout(t);
  }, [banner]);

  function startOver(m: SimModule) {
    setCurrentNodeId(m.startNodeId);
    setChecked(new Set());
    setTexts({});
    setPath([m.startNodeId]);
    setTaps([]);
    setWrongTaps(0);
    setBanner(null);
    setFinished(false);
    setStartedAt(Date.now());
    setSaved(false);
  }

  async function finish(
    passed: boolean,
    finalTaps: SimTapEvent[],
    finalPath: string[],
    finalWrongTaps: number,
    finalTexts: Record<string, string>,
  ) {
    setFinished(true);
    if (!module || saved) return;
    setSaved(true);

    // Un campo de texto sin respuestas válidas configuradas es texto abierto:
    // se guarda, pero la calificación final la da un capacitador.
    const needsManualReview = module.nodes.some(n =>
      n.hotspots.some(h =>
        h.kind === 'text' && (h.validAnswers?.length ?? 0) === 0 && !!finalTexts[h.id]?.trim()
      )
    );

    try {
      await createSimAttempt({
        moduleId: module.id,
        userId: user?.uid,
        userEmail: profile?.email,
        startedAt: serverTimestamp(),
        finishedAt: serverTimestamp(),
        passed,
        wrongTaps: finalWrongTaps,
        path: finalPath,
        taps: finalTaps,
        durationMs: Date.now() - startedAt,
        textAnswers: finalTexts,
        needsManualReview,
      });
    } catch (error) {
      console.error('No se pudo guardar el intento de simulación:', error);
    }
  }

  function handleTap(node: SimNode, xPct: number, yPct: number) {
    if (finished) return;
    const hotspot = node.hotspots.find(h =>
      xPct >= h.xPct && xPct <= h.xPct + h.wPct && yPct >= h.yPct && yPct <= h.yPct + h.hPct
    );

    // Los campos de texto manejan su propia interacción (el input real);
    // aquí no hacen nada.
    if (!hotspot || hotspot.kind === 'text') {
      if (!hotspot) setTaps(prev => [...prev, { nodeId: node.id, xPct, yPct, hit: false, at: Date.now() }]);
      return;
    }

    if (hotspot.kind === 'checkbox') {
      setChecked(prev => {
        const next = new Set(prev);
        next.has(hotspot.id) ? next.delete(hotspot.id) : next.add(hotspot.id);
        return next;
      });
      setTaps(prev => [...prev, { nodeId: node.id, xPct, yPct, hotspotId: hotspot.id, hit: true, at: Date.now() }]);
      return;
    }

    // kind === 'hotspot'
    const registerWrong = (message: string) => {
      setWrongTaps(w => w + 1);
      setBanner({ kind: 'error', text: message });
      setTaps(prev => [...prev, { nodeId: node.id, xPct, yPct, hotspotId: hotspot.id, hit: false, at: Date.now() }]);
    };

    if (!hotspot.isCorrect) {
      registerWrong(hotspot.feedback || 'Esa no es la zona correcta. Intenta de nuevo.');
      return;
    }

    const checkboxHotspots = node.hotspots.filter(h => h.kind === 'checkbox');
    if (checkboxHotspots.length > 0 && !checkboxHotspots.every(h => checked.has(h.id) === h.isCorrect)) {
      registerWrong('Revisa tu selección antes de continuar.');
      return;
    }

    // Los campos de texto de esta pantalla se validan al momento de avanzar.
    const textHotspots = node.hotspots.filter(h => h.kind === 'text');
    const empty = textHotspots.find(h => !texts[h.id]?.trim());
    if (empty) {
      registerWrong(`Falta llenar "${empty.label}".`);
      return;
    }
    const wrongText = textHotspots.find(h =>
      (h.validAnswers?.length ?? 0) > 0 && !matchesValidAnswer(texts[h.id] || '', h.validAnswers!)
    );
    if (wrongText) {
      registerWrong(wrongText.feedback || `Revisa lo que escribiste en "${wrongText.label}".`);
      return;
    }

    const nextTaps = [...taps, { nodeId: node.id, xPct, yPct, hotspotId: hotspot.id, hit: true, at: Date.now() }];
    setTaps(nextTaps);
    if (hotspot.feedback) setBanner({ kind: 'ok', text: hotspot.feedback });

    if (!hotspot.nextNodeId) {
      finish(true, nextTaps, path, wrongTaps, texts);
      return;
    }
    const nextPath = [...path, hotspot.nextNodeId];
    setPath(nextPath);
    setCurrentNodeId(hotspot.nextNodeId);
    setChecked(new Set());
  }

  if (notFound) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">No se encontró esta simulación.</div>;
  }
  if (!module || !currentNodeId) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const node = module.nodes.find(n => n.id === currentNodeId);

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-white">
      <header className="shrink-0 border-b border-white/10 px-4 py-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{module.title}</p>
          {module.instructions && <p className="text-xs text-white/60 truncate">{module.instructions}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-white/60" />
            <Label htmlFor="zones" className="text-xs text-white/60">Modo capacitador</Label>
            <Switch id="zones" checked={showZones} onCheckedChange={setShowZones} />
          </div>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => startOver(module)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reiniciar
          </Button>
        </div>
      </header>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden p-2">
        {node && (
          <SimStage
            node={node}
            checked={checked}
            texts={texts}
            showZones={showZones}
            disabled={finished}
            onChangeText={(id, value) => setTexts(prev => ({ ...prev, [id]: value }))}
            onTap={(x, y) => handleTap(node, x, y)}
          />
        )}

        {banner && (
          <div className={cn(
            'absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg max-w-xs text-center',
            banner.kind === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
          )}>
            {banner.text}
          </div>
        )}

        {finished && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6">
            <div className="bg-neutral-900 rounded-xl p-6 max-w-sm w-full text-center space-y-3 border border-white/10">
              <h2 className="text-lg font-semibold">¡Completaste la simulación!</h2>
              <p className="text-sm text-white/70">
                {wrongTaps === 0 ? 'Sin errores en el camino.' : `${wrongTaps} toque${wrongTaps === 1 ? '' : 's'} fuera de lugar.`}
              </p>
              <p className="text-xs text-white/50">Tiempo: {Math.round((Date.now() - startedAt) / 1000)}s</p>
              <Button className="w-full" onClick={() => startOver(module)}>
                <RotateCcw className="h-4 w-4 mr-2" />Intentar de nuevo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SimStage({
  node, checked, texts, showZones, disabled, onTap, onChangeText,
}: {
  node: SimNode;
  checked: Set<string>;
  texts: Record<string, string>;
  showZones: boolean;
  disabled: boolean;
  onTap: (xPct: number, yPct: number) => void;
  onChangeText: (hotspotId: string, value: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const downPoint = useRef<{ x: number; y: number } | null>(null);
  const [stageHeight, setStageHeight] = useState(0);

  // El tamaño de letra de los campos tiene que seguir al de la captura
  // renderizada: la misma imagen se ve mucho más chica en un celular que en
  // una tablet, y un input con letra fija se vería fuera de lugar.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setStageHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    setStageHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [node.id]);

  function pct(e: React.PointerEvent) {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  return (
    <div
      ref={ref}
      className="relative inline-block max-h-full max-w-full select-none touch-none"
      onPointerDown={e => { downPoint.current = pct(e); }}
      onPointerUp={e => {
        const start = downPoint.current;
        downPoint.current = null;
        if (!start) return;
        const end = pct(e);
        // Si se movió más de ~1.5% de la imagen, es un gesto (scroll/pan), no un toque.
        if (Math.abs(end.x - start.x) > 1.5 || Math.abs(end.y - start.y) > 1.5) return;
        onTap(end.x, end.y);
      }}
    >
      <img src={node.imageUrl} alt="" draggable={false} className="block max-h-[calc(100dvh-56px)] max-w-full w-auto h-auto object-contain" />

      {/* Campos de texto: inputs reales encima de la captura. */}
      {node.hotspots.filter(h => h.kind === 'text').map(h => {
        const boxHeightPx = (h.hPct / 100) * stageHeight;
        const fontSize = Math.max(11, Math.min(20, boxHeightPx * 0.45));
        return (
          <input
            key={h.id}
            type="text"
            value={texts[h.id] || ''}
            disabled={disabled}
            placeholder={h.placeholder}
            aria-label={h.label}
            onChange={e => onChangeText(h.id, e.target.value)}
            // El detector de toque-vs-gesto vive en el contenedor; sin esto,
            // tocar el campo contaría además como un toque fallido al fondo.
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
            className="absolute rounded-[3px] bg-white/95 text-neutral-900 px-1.5 outline-none ring-2 ring-sky-400/70 focus:ring-sky-400 touch-auto select-text"
            style={{
              left: `${h.xPct}%`,
              top: `${h.yPct}%`,
              width: `${h.wPct}%`,
              height: `${h.hPct}%`,
              fontSize: `${fontSize}px`,
            }}
          />
        );
      })}

      {showZones && node.hotspots.filter(h => h.kind !== 'text').map(h => (
        <div
          key={h.id}
          className={cn(
            'absolute border-2 rounded-sm pointer-events-none',
            h.kind === 'checkbox'
              ? (checked.has(h.id) ? 'border-emerald-400 bg-emerald-400/30' : 'border-emerald-400/60 bg-emerald-400/10')
              : 'border-sky-400/70 bg-sky-400/10'
          )}
          style={{ left: `${h.xPct}%`, top: `${h.yPct}%`, width: `${h.wPct}%`, height: `${h.hPct}%` }}
        />
      ))}
    </div>
  );
}
