'use client';

/**
 * Mapa del recorrido de un módulo.
 *
 * Con desvíos, un módulo es un grafo, pero el editor sólo lo mostraba como una
 * lista de miniaturas: el capacitador tenía que sostener el flujo en la cabeza,
 * y así es como se publican módulos donde el vendedor queda atorado.
 *
 * Verde continuo = el paso esperado. Ámbar punteado = un desvío, el camino que
 * de verdad tomaría alguien que se equivoca.
 */

import { useMemo } from 'react';
import type { SimNode } from '@/lib/types-simulation';
import { isFinishNode, resolveHotspotStep, screenLabel } from '@/lib/types-simulation';
import { Flag, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const CARD_W = 132;
const CARD_H = 96;
const GAP_X = 68;
const GAP_Y = 22;

interface Edge {
  from: string;
  to: string;
  expected: boolean;
}

export function SimFlowMap({
  nodes, startNodeId, selectedId, onSelect,
}: {
  nodes: SimNode[];
  startNodeId: string;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const layout = useMemo(() => {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const start = byId.has(startNodeId) ? startNodeId : nodes[0]?.id;

    // Profundidad por anchura: la columna de cada pantalla es lo lejos que
    // está del inicio siguiendo cualquier camino.
    const depth = new Map<string, number>();
    if (start) {
      depth.set(start, 0);
      const queue = [start];
      while (queue.length > 0) {
        const id = queue.shift()!;
        const current = byId.get(id);
        if (!current) continue;
        for (const hotspot of current.hotspots) {
          const step = resolveHotspotStep(hotspot);
          if (step.type !== 'go' || !byId.has(step.nodeId) || depth.has(step.nodeId)) continue;
          depth.set(step.nodeId, (depth.get(id) ?? 0) + 1);
          queue.push(step.nodeId);
        }
      }
    }
    // Las pantallas que no se alcanzan van al final, para que se vean solas.
    const maxDepth = Math.max(0, ...[...depth.values()]);
    for (const node of nodes) if (!depth.has(node.id)) depth.set(node.id, maxDepth + 1);

    const columns = new Map<number, string[]>();
    for (const node of nodes) {
      const d = depth.get(node.id) ?? 0;
      columns.set(d, [...(columns.get(d) ?? []), node.id]);
    }

    const position = new Map<string, { x: number; y: number }>();
    for (const [d, ids] of columns) {
      ids.forEach((id, index) => {
        position.set(id, { x: d * (CARD_W + GAP_X), y: index * (CARD_H + GAP_Y) });
      });
    }

    const edges: Edge[] = [];
    for (const node of nodes) {
      for (const hotspot of node.hotspots) {
        const step = resolveHotspotStep(hotspot);
        if (step.type !== 'go' || !byId.has(step.nodeId)) continue;
        edges.push({ from: node.id, to: step.nodeId, expected: hotspot.isCorrect });
      }
    }

    const width = (Math.max(0, ...[...columns.keys()]) + 1) * (CARD_W + GAP_X);
    const height = Math.max(...[...columns.values()].map(ids => ids.length), 1) * (CARD_H + GAP_Y);
    return { position, edges, width, height, unreachableFrom: maxDepth + 1, depth };
  }, [nodes, startNodeId]);

  if (nodes.length === 0) {
    return <p className="text-xs text-muted-foreground">Agrega pantallas para ver el recorrido.</p>;
  }

  return (
    <div className="overflow-auto rounded-lg border bg-muted/30 p-4">
      <div className="relative" style={{ width: layout.width, height: layout.height, minWidth: '100%' }}>
        <svg className="absolute inset-0 pointer-events-none overflow-visible" width={layout.width} height={layout.height}>
          {layout.edges.map((edge, index) => {
            const from = layout.position.get(edge.from);
            const to = layout.position.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + CARD_W;
            const y1 = from.y + CARD_H / 2;
            const x2 = to.x;
            const y2 = to.y + CARD_H / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={index}
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={edge.expected ? '#16B877' : '#D97706'}
                strokeWidth={edge.expected ? 2 : 1.5}
                strokeDasharray={edge.expected ? undefined : '5 4'}
                opacity={edge.expected ? 0.9 : 0.65}
              />
            );
          })}
        </svg>

        {nodes.map(node => {
          const pos = layout.position.get(node.id);
          if (!pos) return null;
          const unreachable = (layout.depth.get(node.id) ?? 0) === layout.unreachableFrom;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              className={cn(
                'absolute rounded-lg border-2 bg-background overflow-hidden text-left shadow-sm transition-colors',
                selectedId === node.id ? 'border-primary' : 'border-border hover:border-primary/50',
                unreachable && 'opacity-60 border-dashed'
              )}
              style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
            >
              <img src={node.imageUrl} alt="" className="h-[60px] w-full object-cover object-top border-b" />
              <div className="px-1.5 py-1 flex items-center gap-1">
                {node.id === startNodeId && <Play className="h-3 w-3 shrink-0 text-emerald-600" />}
                {isFinishNode(node) && <Flag className="h-3 w-3 shrink-0 text-emerald-600" />}
                <span className="text-[11px] leading-tight truncate">{screenLabel(nodes, node.id)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 bg-[#16B877]" />Paso esperado</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-5 border-t border-dashed border-[#D97706]" />Desvío</span>
        <span className="flex items-center gap-1.5"><Play className="h-3 w-3" />Inicio</span>
        <span className="flex items-center gap-1.5"><Flag className="h-3 w-3" />Final</span>
      </div>
    </div>
  );
}
