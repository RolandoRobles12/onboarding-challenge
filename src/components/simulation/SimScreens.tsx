'use client';

/**
 * Pantallas de apoyo del runner: el arranque, la ayuda, la salida y el cierre.
 *
 * El encuadre es deliberado: el vendedor entra a hacer un trabajo, no a
 * presentar un examen. Por eso lo primero que lee es la situación —quién llegó
 * y qué necesita— y no el criterio de aprobación, que queda guardado en un
 * desplegable para quien lo quiera ver. Y al terminar, lo primero que se le
 * dice es qué pasó con el trabajo; las métricas van después.
 *
 * Todas asumen fondo oscuro: se muestran encima de una captura a pantalla
 * completa, y saltar a un panel claro a media tarea rompe la ilusión.
 */

import { useState } from 'react';
import type { SimEvaluation, SimModule, SimTapEvent } from '@/lib/types-simulation';
import { screenLabel } from '@/lib/types-simulation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Check, ChevronDown, Eye, Hand, Lightbulb, LogOut, RotateCcw, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SimHintStep {
  title: string;
  body: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} min ${seconds}s` : `${seconds}s`;
}

// ─── Arranque: la orden de trabajo ───────────────────────────────────────────

export function SimBrief({
  module, expectedSteps, maxWrongTaps, isTrainer, revealAll, onToggleReveal, onStart, onExit,
}: {
  module: SimModule;
  expectedSteps: number | null;
  maxWrongTaps: number;
  isTrainer: boolean;
  revealAll: boolean;
  onToggleReveal: (value: boolean) => void;
  onStart: () => void;
  onExit: () => void;
}) {
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-white flex flex-col">
      <div className="flex justify-end p-3">
        <button
          type="button"
          onClick={onExit}
          aria-label="Salir"
          className="rounded-full p-2 text-white/60 hover:text-white hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 pb-10">
        <div className="w-full max-w-md space-y-6 animate-fade-in">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-emerald-400">
              {module.clientName ? `Cliente · ${module.clientName}` : 'Tu turno'}
            </p>

            {module.scenario ? (
              <>
                <p className="text-xl leading-snug font-medium">{module.scenario}</p>
                {module.instructions && (
                  <p className="text-sm text-white/70 leading-relaxed">{module.instructions}</p>
                )}
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold leading-tight">{module.title}</h1>
                {module.instructions && (
                  <p className="text-sm text-white/70 leading-relaxed">{module.instructions}</p>
                )}
              </>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex gap-3">
            <Hand className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-white/75 leading-relaxed">
              Vas a usar la herramienta como en la vida real. Si te equivocas va a pasar lo que
              pasaría de verdad, y puedes regresar.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowRules(v => !v)}
              className="flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70"
              aria-expanded={showRules}
            >
              Cómo se evalúa
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showRules && 'rotate-180')} />
            </button>
            {showRules && (
              <ul className="mt-2 space-y-1 text-xs text-white/50 animate-fade-in">
                {expectedSteps && <li>· Se completa en {expectedSteps} paso{expectedSteps === 1 ? '' : 's'}.</li>}
                <li>· Apruebas con {maxWrongTaps} error{maxWrongTaps === 1 ? '' : 'es'} o menos.</li>
                <li>· Puedes pedir ayuda cuando quieras; queda registrada.</li>
              </ul>
            )}
          </div>

          {isTrainer && (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-300" />
                <Label htmlFor="reveal-zones" className="text-sm text-amber-100">
                  Modo capacitador: ver las zonas
                </Label>
              </div>
              <Switch id="reveal-zones" checked={revealAll} onCheckedChange={onToggleReveal} />
            </div>
          )}

          <Button size="lg" className="w-full h-12 text-base" onClick={onStart}>
            Empezar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

export function SimHintPanel({
  steps, level, canReveal, revealUsed, canGoBack, onAdvance, onReveal, onBack, onExit, onClose,
}: {
  steps: SimHintStep[];
  /** Cuántos niveles de pista ya se abrieron en esta pantalla. */
  level: number;
  canReveal: boolean;
  /** Ya se usó "muéstrame dónde" en esta pantalla: no se vuelve a cobrar. */
  revealUsed: boolean;
  canGoBack: boolean;
  onAdvance: () => void;
  onReveal: () => void;
  onBack: () => void;
  onExit: () => void;
  onClose: () => void;
}) {
  const visible = steps.slice(0, Math.max(1, level));
  const hasMoreText = level < steps.length;

  return (
    <div className="absolute inset-0 z-30 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full rounded-t-2xl border-t border-white/10 bg-neutral-900 p-5 pb-8 space-y-4 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Ayuda</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ayuda"
            className="rounded-full p-1.5 text-white/50 hover:text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {visible.length > 0 && (
          <div className="space-y-3">
            {visible.map((step, index) => (
              <div key={index} className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1">{step.title}</p>
                <p className="text-sm text-white/85 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {hasMoreText && (
            <Button variant="secondary" className="w-full" onClick={onAdvance}>
              Sigo sin encontrarlo
            </Button>
          )}
          {!hasMoreText && canReveal && (
            <Button variant="secondary" className="w-full" onClick={onReveal}>
              {revealUsed ? 'Volver a señalar la zona' : 'Muéstrame dónde tocar'}
            </Button>
          )}

          <div className="flex gap-2 pt-1">
            {canGoBack && (
              <Button
                variant="ghost"
                className="flex-1 text-white/60 hover:text-white hover:bg-white/10"
                onClick={onBack}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />Regresar
              </Button>
            )}
            <Button
              variant="ghost"
              className="flex-1 text-white/60 hover:text-white hover:bg-white/10"
              onClick={onExit}
            >
              <LogOut className="h-4 w-4 mr-1.5" />Salir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirmación de salida ──────────────────────────────────────────────────

export function SimExitDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-6" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/75" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 space-y-4 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-white">¿Dejar el trabajo a medias?</h2>
        <p className="text-sm text-white/60">
          Se guarda hasta dónde llegaste y puedes retomarlo cuando quieras.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" className="w-full" onClick={onCancel}>Seguir aquí</Button>
          <Button variant="ghost" className="w-full text-white/60 hover:text-white hover:bg-white/10" onClick={onConfirm}>
            Salir
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Cierre: primero el trabajo, después el desempeño ────────────────────────

export function SimResult({
  module, evaluation, durationMs, wrongTaps, hintsUsed, steps, optimalSteps, taps, onRetry, onExit,
}: {
  module: SimModule;
  evaluation: SimEvaluation;
  durationMs: number;
  wrongTaps: number;
  hintsUsed: number;
  steps: number;
  optimalSteps: number | null;
  taps: SimTapEvent[];
  onRetry: () => void;
  onExit: () => void;
}) {
  const passed = evaluation.outcome === 'passed';
  const pending = evaluation.outcome === 'pending_review';

  const headline = passed
    ? module.successMessage || 'Listo, quedó hecho.'
    : pending
    ? module.successMessage || 'Terminaste el trabajo.'
    : 'Llegaste al final, pero con tropiezos.';

  const sub = passed
    ? module.clientName ? `${module.clientName} ya quedó registrado.` : 'Lo hiciste como se hace.'
    : pending
    ? 'Tu capacitador va a revisar lo que escribiste.'
    : 'Vale la pena repasar los pasos donde te atoraste.';

  // Dónde se equivocó: las pantallas con más tropiezos son las que hay que repasar.
  const stumbles = module.nodes
    .map((node, index) => ({
      node,
      index,
      errors: taps.filter(t => t.nodeId === node.id && (t.kind === 'wrong' || t.kind === 'detour')).length,
    }))
    .filter(item => item.errors > 0)
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 3);

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-neutral-950/95 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-5">
        <div className="w-full max-w-md space-y-6 animate-fade-in">

          <div className="space-y-3 pt-2">
            <div className={cn(
              'h-11 w-11 rounded-full flex items-center justify-center',
              passed ? 'bg-emerald-500' : pending ? 'bg-sky-500' : 'bg-amber-500'
            )}>
              <Check className="h-6 w-6 text-white" strokeWidth={3} />
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight">{headline}</h1>
            <p className="text-sm text-white/60">{sub}</p>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-[11px] uppercase tracking-wide text-white/35">Cómo te fue</p>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Tiempo" value={formatDuration(durationMs)} />
              <Metric
                label="Pasos"
                value={optimalSteps ? `${steps} de ${optimalSteps}` : `${steps}`}
                hint={optimalSteps && steps > optimalSteps ? 'diste vueltas de más' : undefined}
              />
              <Metric label="Errores" value={`${wrongTaps}`} tone={wrongTaps > 0 ? 'warn' : 'ok'} />
              <Metric label="Ayudas" value={`${hintsUsed}`} tone={hintsUsed > 0 ? 'warn' : 'ok'} />
            </div>
          </div>

          {stumbles.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-white/40">Qué conviene repasar</p>
              {stumbles.map(item => (
                <div key={item.node.id} className="flex gap-3 text-sm">
                  <span className="text-white/40 shrink-0">{item.index + 1}.</span>
                  <div>
                    <p className="text-white/85">{item.node.goal || screenLabel(module.nodes, item.node.id)}</p>
                    <p className="text-xs text-white/45">
                      {item.errors} tropiezo{item.errors === 1 ? '' : 's'} aquí
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 pb-4">
            <Button size="lg" className="w-full" onClick={onRetry}>
              <RotateCcw className="h-4 w-4 mr-2" />Hacerlo de nuevo
            </Button>
            <Button variant="ghost" className="w-full text-white/60 hover:text-white hover:bg-white/10" onClick={onExit}>
              Salir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label, value, hint, tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
      <p className={cn(
        'text-lg font-semibold',
        tone === 'warn' ? 'text-amber-300' : tone === 'ok' ? 'text-emerald-300' : 'text-white'
      )}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}
