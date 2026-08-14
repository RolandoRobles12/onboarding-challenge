'use client';

/**
 * Vista previa del módulo dentro del editor.
 *
 * Antes, para revisar el paso 7 había que abrir otra pestaña y jugar los siete
 * pasos: cada iteración costaba el módulo completo. Aquí se prueba desde
 * cualquier pantalla, viendo exactamente lo que ve el vendedor y con las zonas
 * a la vista para poder ajustarlas.
 */

import { useEffect, useState } from 'react';
import type { SimHotspot, SimNode, SimSwipeDirection } from '@/lib/types-simulation';
import { decideTap, isFinishNode, screenLabel } from '@/lib/types-simulation';
import { SimStage } from '@/components/simulation/SimStage';
import type { SimInteraction } from '@/components/simulation/SimStage';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, RotateCcw } from 'lucide-react';

export function SimPreview({
  nodes, fromNodeId, frameColor, onClose,
}: {
  nodes: SimNode[];
  /** Desde qué pantalla arranca la prueba. */
  fromNodeId: string;
  frameColor?: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<string[]>([fromNodeId]);
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [textErrors, setTextErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [showZones, setShowZones] = useState(true);

  useEffect(() => {
    setHistory([fromNodeId]);
    setChecked({});
    setTexts({});
    setTextErrors({});
    setMessage(null);
    setFinished(false);
  }, [fromNodeId]);

  const currentId = history[history.length - 1];
  const node = nodes.find(n => n.id === currentId) ?? null;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (node && isFinishNode(node)) setFinished(true);
  }, [node]);

  function go(nodeId: string) {
    setHistory(prev => [...prev, nodeId]);
    setTextErrors({});
  }

  function handleInteraction(
    hotspot: SimHotspot | null,
    via: SimInteraction,
    detail: { swipeDirection?: SimSwipeDirection },
  ) {
    if (!node || finished) return;
    const outcome = decideTap({
      node,
      hotspot,
      checked: checked[node.id] ?? [],
      texts,
      nodeExists: id => nodes.some(n => n.id === id),
      via,
      swipeDirection: detail.swipeDirection,
    });

    switch (outcome.kind) {
      case 'toggle': {
        const current = checked[node.id] ?? [];
        setChecked({
          ...checked,
          [node.id]: current.includes(outcome.hotspotId)
            ? current.filter(id => id !== outcome.hotspotId)
            : [...current, outcome.hotspotId],
        });
        return;
      }
      case 'expected':
        go(outcome.nodeId);
        return;
      case 'detour':
        setMessage(`Desvío: ${outcome.message}`);
        go(outcome.nodeId);
        return;
      case 'finish':
        setFinished(true);
        return;
      case 'wrong':
        if (outcome.textErrors) setTextErrors(outcome.textErrors);
        setMessage(outcome.message);
        return;
      case 'broken':
        setMessage(outcome.message);
        return;
      default:
        return;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="font-medium">{node ? screenLabel(nodes, node.id) : 'Pantalla eliminada'}</span>
          {node?.goal && <span className="text-muted-foreground"> · {node.goal}</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="preview-zones" className="text-xs text-muted-foreground">Ver zonas</Label>
            <Switch id="preview-zones" checked={showZones} onCheckedChange={setShowZones} />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={history.length < 2}
            onClick={() => { setHistory(prev => prev.slice(0, -1)); setFinished(false); }}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Atrás
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setHistory([fromNodeId]); setFinished(false); }}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reiniciar
          </Button>
        </div>
      </div>

      {/* Marco con la proporción de la tablet del vendedor. */}
      <div className="relative mx-auto w-full max-w-[320px] aspect-[820/1180] rounded-2xl border-4 border-neutral-800 overflow-hidden bg-neutral-950 flex">
        {node ? (
          <SimStage
            node={node}
            checked={checked[node.id] ?? []}
            texts={texts}
            textErrors={textErrors}
            revealAll={showZones}
            disabled={finished}
            frameColor={frameColor}
            onInteraction={handleInteraction}
            onChangeText={(id, value) => setTexts(prev => ({ ...prev, [id]: value }))}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-white/60">
            Esta pantalla ya no existe: alguna zona apunta a un destino borrado.
          </div>
        )}

        {message && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90%] rounded-lg bg-neutral-900/95 px-3 py-1.5 text-[11px] text-white text-center shadow-lg">
            {message}
          </div>
        )}

        {finished && (
          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm text-white">Aquí termina el módulo.</p>
            <Button size="sm" variant="secondary" onClick={() => { setHistory([fromNodeId]); setFinished(false); }}>
              Probar otra vez
            </Button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Los toques, gestos y validaciones se comportan igual que con el vendedor.
      </p>

      <Button variant="ghost" size="sm" onClick={onClose}>Cerrar vista previa</Button>
    </div>
  );
}
