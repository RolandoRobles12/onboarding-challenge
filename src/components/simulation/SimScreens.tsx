'use client';

/**
 * Pantallas de apoyo del runner de simulaciones: el arranque, el panel de
 * pistas, el aviso de salida y el resultado.
 *
 * Están aparte del runner porque son puramente presentacionales — toda la
 * lógica de navegación y calificación vive en la página. Todas asumen fondo
 * oscuro: el vendedor está viendo una captura a pantalla completa y cambiar a
 * un panel claro a medio ejercicio rompe la ilusión (y encandila de noche).
 */

import type { SimEvaluation, SimModule, SimTapEvent } from '@/lib/types-simulation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock, Eye, Hand, Lightbulb,
  MousePointerClick, Play, RotateCcw, Target, X,
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

// ─── Arranque ────────────────────────────────────────────────────────────────

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
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-emerald-400">Simulación</p>
            <h1 className="text-2xl font-bold leading-tight">{module.title}</h1>
            {module.instructions && (
              <p className="text-sm text-white/70 leading-relaxed">{module.instructions}</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/10">
            <BriefRow icon={<Hand className="h-4 w-4" />}>
              Vas a usar la herramienta como en la vida real: toca sobre la pantalla para avanzar.
              Pellizca o toca dos veces para acercar.
            </BriefRow>
            <BriefRow icon={<MousePointerClick className="h-4 w-4" />}>
              Si te equivocas, va a pasar lo que pasaría de verdad. Puedes regresar y corregir.
            </BriefRow>
            <BriefRow icon={<Lightbulb className="h-4 w-4" />}>
              Si te atoras, pide una pista. Se registran, pero es mejor pedirla que adivinar.
            </BriefRow>
            <BriefRow icon={<Target className="h-4 w-4" />}>
              {expectedSteps
                ? `Se puede completar en ${expectedSteps} paso${expectedSteps === 1 ? '' : 's'}. `
                : ''}
              Apruebas con {maxWrongTaps} error{maxWrongTaps === 1 ? '' : 'es'} o menos.
            </BriefRow>
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
            <Play className="h-4 w-4 mr-2" />Empezar
          </Button>
        </div>
      </div>
    </div>
  );
}

function BriefRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3 text-sm text-white/75">
      <span className="text-emerald-400 shrink-0 mt-0.5">{icon}</span>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

// ─── Panel de pistas ─────────────────────────────────────────────────────────

export function SimHintPanel({
  steps, level, canReveal, onAdvance, onReveal, onClose,
}: {
  steps: SimHintStep[];
  /** Cuántos niveles de pista ya se abrieron en esta pantalla. */
  level: number;
  canReveal: boolean;
  onAdvance: () => void;
  onReveal: () => void;
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

        <div className="space-y-3">
          {visible.map((step, index) => (
            <div key={index} className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-white/40 mb-1">{step.title}</p>
              <p className="text-sm text-white/85 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {hasMoreText && (
            <Button variant="secondary" className="w-full justify-between" onClick={onAdvance}>
              Sigo sin encontrarlo
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {!hasMoreText && canReveal && (
            <Button variant="secondary" className="w-full justify-between" onClick={onReveal}>
              Muéstrame dónde tocar
              <Eye className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" className="w-full text-white/60 hover:text-white hover:bg-white/10" onClick={onClose}>
            Sigo intentando
          </Button>
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
        <h2 className="text-base font-semibold text-white">¿Salir de la simulación?</h2>
        <p className="text-sm text-white/60">
          El intento se guarda como no terminado y tu capacitador va a ver hasta dónde llegaste.
          Puedes volver a empezar cuando quieras.
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

// ─── Resultado ───────────────────────────────────────────────────────────────

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
  const tone = evaluation.outcome === 'passed'
    ? { label: 'Aprobado', className: 'text-emerald-400', icon: <CheckCircle2 className="h-10 w-10" /> }
    : evaluation.outcome === 'pending_review'
    ? { label: 'Pendiente de revisión', className: 'text-sky-400', icon: <Clock className="h-10 w-10" /> }
    : { label: 'Para repasar', className: 'text-amber-400', icon: <AlertTriangle className="h-10 w-10" /> };

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
        <div className="w-full max-w-md space-y-5 animate-fade-in">
          <div className="text-center space-y-2">
            <div className={cn('flex justify-center', tone.className)}>{tone.icon}</div>
            <h1 className="text-xl font-bold text-white">{tone.label}</h1>
            <p className="text-sm text-white/60">{module.title}</p>
            {evaluation.outcome === 'pending_review' && (
              <p className="text-xs text-white/50 px-4">
                Escribiste respuestas abiertas: un capacitador las va a revisar antes de darlas por buenas.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label="Tiempo" value={formatDuration(durationMs)} />
            <Metric
              label="Pasos"
              value={optimalSteps ? `${steps} de ${optimalSteps}` : `${steps}`}
              hint={optimalSteps && steps > optimalSteps ? 'diste vueltas de más' : undefined}
            />
            <Metric label="Errores" value={`${wrongTaps}`} tone={wrongTaps > 0 ? 'warn' : 'ok'} />
            <Metric label="Pistas" value={`${hintsUsed}`} tone={hintsUsed > 0 ? 'warn' : 'ok'} />
          </div>

          {(evaluation.efficiency !== null || evaluation.accuracy < 100) && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 space-y-2">
              {evaluation.efficiency !== null && (
                <Bar label="Qué tan directo" value={evaluation.efficiency} />
              )}
              <Bar label="Precisión de tus toques" value={evaluation.accuracy} />
            </div>
          )}

          {stumbles.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <p className="text-xs uppercase tracking-wide text-white/40">Qué conviene repasar</p>
              {stumbles.map(item => (
                <div key={item.node.id} className="flex gap-3 text-sm">
                  <span className="text-white/40 shrink-0">{item.index + 1}.</span>
                  <div>
                    <p className="text-white/85">{item.node.goal || `Pantalla ${item.index + 1}`}</p>
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
              <RotateCcw className="h-4 w-4 mr-2" />Intentar de nuevo
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

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="text-white/80">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn('h-full rounded-full', value >= 80 ? 'bg-emerald-400' : value >= 50 ? 'bg-amber-400' : 'bg-red-400')}
          style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
