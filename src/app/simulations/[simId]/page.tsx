'use client';

/**
 * Runner de simulaciones: la pantalla donde el vendedor opera la herramienta.
 *
 * El modelo es "captura nativa 1:1": las capturas se toman desde la app de
 * HubSpot o Slack en la misma tablet donde trabaja el vendedor, así que la
 * imagen calza exacta con la pantalla. Con eso, todo lo que separa al vendedor
 * de una copia perfecta de la app es lo que nosotros le pongamos encima — y por
 * eso aquí no hay barras permanentes.
 *
 * Principios, en orden:
 *
 * 1. Emular, no examinar. Un toque equivocado hace lo que haría la herramienta
 *    real: si el capacitador conectó esa zona a otra pantalla, el vendedor
 *    termina ahí y tiene que darse cuenta y regresar. Si no lleva a nada, no
 *    pasa nada, igual que al picarle a un pedazo de interfaz que no es botón.
 * 2. El cromo se quita de en medio. El objetivo aparece al llegar y se repliega;
 *    los controles se esconden solos y vuelven con cualquier toque. Regresar es
 *    un deslizamiento desde el borde, como en el teléfono.
 * 3. Nunca dejarlo atorado. Siempre hay atrás, ayuda progresiva y salida.
 * 4. Todo intento deja rastro, incluso el que se abandona a la mitad.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { serverTimestamp } from 'firebase/firestore';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { createSimAttempt, getSimModule, updateSimAttempt } from '@/lib/firestore-service';
import {
  DEFAULT_MAX_WRONG_TAPS, MAX_STORED_TAPS, decideTap, evaluateAttempt, expectedHotspot,
  findExpectedPath, findPendingWork, isFinishNode, nodeNeedsInput, resolveHotspotStep,
} from '@/lib/types-simulation';
import type {
  SimAttemptState, SimHotspot, SimModule, SimNode, SimTapEvent, SimTapOutcome, SimTransition,
} from '@/lib/types-simulation';
import { haptic } from '@/lib/haptics';
import { SimStage } from '@/components/simulation/SimStage';
import type { SimInteraction } from '@/components/simulation/SimStage';
import { SimBrief, SimExitDialog, SimHintPanel, SimResult } from '@/components/simulation/SimScreens';
import type { SimHintStep } from '@/components/simulation/SimScreens';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check, ChevronDown, HelpCircle, Loader2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Cuánto espera la pantalla de éxito antes de mostrar el cierre. */
const SUCCESS_BEAT_MS = 900;
/** Cuánto dura el resaltado de la pista "muéstrame dónde". */
const REVEAL_MS = 4000;
/** Silencio antes de ofrecer ayuda por iniciativa propia. */
const NUDGE_MS = 25000;
/** Cuánto se queda el objetivo a la vista al llegar a una pantalla. */
const GOAL_MS = 3500;
/** Inactividad tras la cual los controles se esconden. */
const CHROME_IDLE_MS = 4000;

// ─── Estado del intento ──────────────────────────────────────────────────────

interface RunState {
  currentNodeId: string;
  /** Pila de navegación, para el botón de atrás. */
  history: string[];
  /** Todo lo recorrido en orden, incluyendo regresos: es el registro real. */
  path: string[];
  checkedByNode: Record<string, string[]>;
  texts: Record<string, string>;
  textErrors: Record<string, string>;
  taps: SimTapEvent[];
  wrongTaps: number;
  hintsUsed: number;
  /** Toques que cambiaron de pantalla. */
  steps: number;
  startedAt: number;
  finishedAt: number | null;
}

type RunAction =
  | { type: 'start'; nodeId: string }
  | { type: 'tap'; event: SimTapEvent }
  | { type: 'wrong'; event: SimTapEvent }
  | { type: 'toggle'; nodeId: string; hotspotId: string; event: SimTapEvent }
  | { type: 'advance'; nodeId: string; event: SimTapEvent }
  | { type: 'complete'; event: SimTapEvent }
  | { type: 'text'; hotspotId: string; value: string }
  | { type: 'textErrors'; errors: Record<string, string> }
  | { type: 'back' }
  | { type: 'hint' }
  | { type: 'finish' };

function initialRunState(nodeId: string): RunState {
  return {
    currentNodeId: nodeId,
    history: [nodeId],
    path: [nodeId],
    checkedByNode: {},
    texts: {},
    textErrors: {},
    taps: [],
    wrongTaps: 0,
    hintsUsed: 0,
    steps: 0,
    startedAt: Date.now(),
    finishedAt: null,
  };
}

function pushTap(taps: SimTapEvent[], event: SimTapEvent): SimTapEvent[] {
  return [...taps, event].slice(-MAX_STORED_TAPS);
}

function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'start':
      return initialRunState(action.nodeId);

    case 'tap':
      return { ...state, taps: pushTap(state.taps, action.event) };

    case 'wrong':
      return { ...state, taps: pushTap(state.taps, action.event), wrongTaps: state.wrongTaps + 1 };

    case 'toggle': {
      const current = state.checkedByNode[action.nodeId] ?? [];
      const next = current.includes(action.hotspotId)
        ? current.filter(id => id !== action.hotspotId)
        : [...current, action.hotspotId];
      return {
        ...state,
        checkedByNode: { ...state.checkedByNode, [action.nodeId]: next },
        taps: pushTap(state.taps, action.event),
      };
    }

    case 'advance':
      return {
        ...state,
        currentNodeId: action.nodeId,
        history: [...state.history, action.nodeId],
        path: [...state.path, action.nodeId],
        steps: state.steps + 1,
        // Un desvío avanza igual que un acierto, pero cuenta como error.
        wrongTaps: action.event.kind === 'detour' ? state.wrongTaps + 1 : state.wrongTaps,
        taps: pushTap(state.taps, action.event),
        textErrors: {},
      };

    case 'complete':
      return {
        ...state,
        steps: state.steps + 1,
        taps: pushTap(state.taps, action.event),
        finishedAt: Date.now(),
      };

    case 'text': {
      const { [action.hotspotId]: _removed, ...textErrors } = state.textErrors;
      return { ...state, texts: { ...state.texts, [action.hotspotId]: action.value }, textErrors };
    }

    case 'textErrors':
      return { ...state, textErrors: action.errors };

    case 'back': {
      if (state.history.length < 2) return state;
      const history = state.history.slice(0, -1);
      const currentNodeId = history[history.length - 1];
      return { ...state, history, currentNodeId, path: [...state.path, currentNodeId], textErrors: {} };
    }

    case 'hint':
      return { ...state, hintsUsed: state.hintsUsed + 1 };

    case 'finish':
      return state.finishedAt ? state : { ...state, finishedAt: Date.now() };
  }
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function SimulationRunnerPage() {
  return (
    <ProtectedRoute>
      <SimulationRunner />
    </ProtectedRoute>
  );
}

type LoadStatus = 'loading' | 'ready' | 'missing' | 'broken';
type Phase = 'brief' | 'running' | 'result';

function SimulationRunner() {
  const params = useParams<{ simId: string }>();
  const router = useRouter();
  const { user, profile, isTrainer } = useAuth();

  const [module, setModule] = useState<SimModule | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [phase, setPhase] = useState<Phase>('brief');
  const [run, dispatch] = useReducer(runReducer, initialRunState(''));

  const [message, setMessage] = useState<{ tone: 'error' | 'detour'; text: string } | null>(null);
  const [offTrack, setOffTrack] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [revealedNodes, setRevealedNodes] = useState<string[]>([]);
  const [revealHotspotId, setRevealHotspotId] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const [revealAll, setRevealAll] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [goalExpanded, setGoalExpanded] = useState(true);
  const [transition, setTransition] = useState<{ type: SimTransition; direction: 'forward' | 'back' } | null>(null);
  const [needsZoomHint, setNeedsZoomHint] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const attemptIdRef = useRef<string | null>(null);
  const finalizedRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  // ─── Carga del módulo ──────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    getSimModule(params.simId)
      .then(loaded => {
        if (!active) return;
        if (!loaded) { setStatus('missing'); return; }
        setModule(loaded);
        setStatus(loaded.nodes?.length ? 'ready' : 'broken');
      })
      .catch(error => {
        console.error('No se pudo cargar la simulación:', error);
        if (active) setStatus('missing');
      });
    return () => { active = false; };
  }, [params.simId]);

  const expected = useMemo(() => (module ? findExpectedPath(module) : null), [module]);
  const maxWrongTaps = module?.maxWrongTaps ?? DEFAULT_MAX_WRONG_TAPS;
  const allowBack = module?.allowBack !== false;

  const startNodeId = useMemo(() => {
    if (!module?.nodes.length) return '';
    return module.nodes.some(n => n.id === module.startNodeId) ? module.startNodeId : module.nodes[0].id;
  }, [module]);

  const node: SimNode | null = useMemo(
    () => module?.nodes.find(n => n.id === run.currentNodeId) ?? null,
    [module, run.currentNodeId]
  );

  const canGoBack = allowBack && run.history.length > 1;

  // ─── Pantalla completa: la copia 1:1 no aguanta la barra del navegador ─────

  const enterFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el || document.fullscreenElement) return;
    // Falla en silencio donde no se puede (iOS): dentro del PWA no hace falta.
    el.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  }, []);

  const leaveFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => () => leaveFullscreen(), [leaveFullscreen]);

  // ─── Cromo que se quita de en medio ────────────────────────────────────────

  const noteActivity = useCallback(() => {
    setChromeVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    noteActivity();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [phase, run.currentNodeId, noteActivity]);

  // El objetivo se muestra al llegar y se repliega solo.
  useEffect(() => {
    if (phase !== 'running') return;
    setGoalExpanded(true);
    const timer = setTimeout(() => setGoalExpanded(false), GOAL_MS);
    return () => clearTimeout(timer);
  }, [run.currentNodeId, phase]);

  // ─── Registro del intento ──────────────────────────────────────────────────

  const needsManualReview = useCallback((texts: Record<string, string>) => {
    if (!module) return false;
    return module.nodes.some(n => n.hotspots.some(h =>
      h.kind === 'text' && (h.validAnswers?.length ?? 0) === 0 && !!texts[h.id]?.trim()
    ));
  }, [module]);

  const finalize = useCallback(async (state: SimAttemptState) => {
    if (finalizedRef.current || !module) return;
    finalizedRef.current = true;

    const current = runRef.current;
    const manualReview = needsManualReview(current.texts);
    const evaluation = evaluateAttempt({
      wrongTaps: current.wrongTaps,
      stepsTaken: current.steps + 1,
      optimalSteps: expected?.screens ?? null,
      maxWrongTaps,
      needsManualReview: manualReview,
    });
    const completed = state === 'completed';

    const payload = {
      state,
      // Un intento abandonado nunca se da por aprobado, sin importar el score.
      outcome: completed ? evaluation.outcome : undefined,
      passed: completed && evaluation.passed && !manualReview,
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      wrongTaps: current.wrongTaps,
      hintsUsed: current.hintsUsed,
      stepsTaken: current.steps + 1,
      optimalSteps: expected?.screens,
      path: current.path,
      lastNodeId: current.currentNodeId,
      taps: current.taps,
      durationMs: (current.finishedAt ?? Date.now()) - current.startedAt,
      textAnswers: current.texts,
      needsManualReview: manualReview,
    };

    try {
      if (attemptIdRef.current) {
        await updateSimAttempt(attemptIdRef.current, payload);
      } else {
        // El alta inicial pudo fallar (o seguir en vuelo): no perdemos el intento.
        await createSimAttempt({
          moduleId: module.id,
          moduleTitle: module.title,
          userId: user?.uid,
          userEmail: profile?.email,
          userName: profile?.nombre,
          startedAt: serverTimestamp(),
          ...payload,
        });
      }
    } catch (error) {
      console.error('No se pudo guardar el intento de simulación:', error);
    }
  }, [module, expected, maxWrongTaps, needsManualReview, user, profile]);

  const startRun = useCallback(async () => {
    if (!module || !startNodeId) return;
    enterFullscreen();
    dispatch({ type: 'start', nodeId: startNodeId });
    setPhase('running');
    setMessage(null);
    setOffTrack(false);
    setHintOpen(false);
    setHintLevel(0);
    setRevealedNodes([]);
    setRevealHotspotId(null);
    setTransition(null);
    finalizedRef.current = false;
    attemptIdRef.current = null;

    try {
      const id = await createSimAttempt({
        moduleId: module.id,
        moduleTitle: module.title,
        userId: user?.uid,
        userEmail: profile?.email,
        userName: profile?.nombre,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        state: 'in_progress',
        passed: false,
        wrongTaps: 0,
        hintsUsed: 0,
        stepsTaken: 0,
        optimalSteps: expected?.screens,
        path: [startNodeId],
        lastNodeId: startNodeId,
        taps: [],
      });
      attemptIdRef.current = id;
    } catch (error) {
      // Sin registro el ejercicio sigue siendo útil: no bloqueamos al vendedor.
      console.error('No se pudo registrar el inicio del intento:', error);
    }
  }, [module, startNodeId, expected, user, profile, enterFullscreen]);

  // Guarda el avance en cada cambio de pantalla: si abandona, sabemos dónde quedó.
  useEffect(() => {
    if (phase !== 'running' || !attemptIdRef.current || run.finishedAt) return;
    updateSimAttempt(attemptIdRef.current, {
      updatedAt: serverTimestamp(),
      path: run.path,
      lastNodeId: run.currentNodeId,
      wrongTaps: run.wrongTaps,
      hintsUsed: run.hintsUsed,
      stepsTaken: run.steps,
      taps: run.taps,
      textAnswers: run.texts,
    }).catch(error => console.error('No se pudo guardar el avance:', error));
    // Sólo al cambiar de pantalla: un write por toque sería un desperdicio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.currentNodeId, phase]);

  useEffect(() => {
    if (phase === 'running' && run.finishedAt) {
      finalize('completed');
      leaveFullscreen();
      setPhase('result');
    }
  }, [run.finishedAt, phase, finalize, leaveFullscreen]);

  // Cerrar la pestaña a media simulación cuenta como abandono.
  useEffect(() => {
    if (phase !== 'running') return;
    const handler = () => { if (!finalizedRef.current) finalize('abandoned'); };
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
  }, [phase, finalize]);

  // ─── Ayuda progresiva ──────────────────────────────────────────────────────

  useEffect(() => {
    setHintLevel(0);
    setRevealHotspotId(null);
    setHintOpen(false);
    setNudge(false);
    if (phase !== 'running') return;
    const timer = setTimeout(() => setNudge(true), NUDGE_MS);
    return () => clearTimeout(timer);
  }, [run.currentNodeId, phase]);

  const hintSteps = useMemo<SimHintStep[]>(() => {
    if (!node || !module) return [];
    const steps: SimHintStep[] = [];
    const goal = node.goal || module.instructions;
    if (goal) steps.push({ title: 'Tu objetivo', body: goal });
    const detail = node.hint || expectedHotspot(node)?.hint;
    if (detail) steps.push({ title: 'Pista', body: detail });
    return steps;
  }, [node, module]);

  function openHints() {
    setNudge(false);
    noteActivity();
    if (hintLevel === 0 && hintSteps.length > 0) {
      setHintLevel(1);
      dispatch({ type: 'hint' });
    }
    setHintOpen(true);
  }

  function advanceHint() {
    setHintLevel(level => level + 1);
    dispatch({ type: 'hint' });
  }

  function revealAnswer() {
    if (!node) return;
    const target = expectedHotspot(node);
    if (!target) return;
    // Sólo se cobra la primera vez en esta pantalla: volver a pedir lo mismo no
    // es ayuda nueva, y antes inflaba el contador sin límite.
    if (!revealedNodes.includes(node.id)) {
      dispatch({ type: 'hint' });
      setRevealedNodes(prev => [...prev, node.id]);
    }
    setRevealHotspotId(target.id);
    setHintOpen(false);
    setTimeout(() => setRevealHotspotId(current => (current === target.id ? null : current)), REVEAL_MS);
  }

  // ─── Interacción ───────────────────────────────────────────────────────────

  const showMessage = useCallback((tone: 'error' | 'detour', text: string) => {
    setMessage({ tone, text });
    setTimeout(() => setMessage(current => (current?.text === text ? null : current)), 3200);
  }, []);

  function applyOutcome(
    outcome: SimTapOutcome,
    base: Omit<SimTapEvent, 'kind' | 'hit'>,
    hotspot: SimHotspot | null,
  ) {
    if (!node) return;
    switch (outcome.kind) {
      case 'miss':
        dispatch({ type: 'tap', event: { ...base, kind: 'miss', hit: false } });
        return;

      case 'toggle':
        dispatch({
          type: 'toggle',
          nodeId: node.id,
          hotspotId: outcome.hotspotId,
          event: { ...base, kind: 'toggle', hit: true },
        });
        return;

      case 'expected':
        setTransition({ type: hotspot?.transition ?? 'push', direction: 'forward' });
        haptic('advance');
        dispatch({ type: 'advance', nodeId: outcome.nodeId, event: { ...base, kind: 'expected', hit: true } });
        setOffTrack(false);
        return;

      case 'finish':
        haptic('advance');
        dispatch({ type: 'complete', event: { ...base, kind: 'expected', hit: true } });
        return;

      case 'detour':
        setTransition({ type: hotspot?.transition ?? 'push', direction: 'forward' });
        haptic('advance');
        dispatch({ type: 'advance', nodeId: outcome.nodeId, event: { ...base, kind: 'detour', hit: true } });
        setOffTrack(true);
        showMessage('detour', outcome.message);
        return;

      case 'wrong':
        if (outcome.textErrors) dispatch({ type: 'textErrors', errors: outcome.textErrors });
        dispatch({ type: 'wrong', event: { ...base, kind: 'wrong', hit: false } });
        haptic('error');
        showMessage('error', outcome.message);
        return;

      case 'broken':
        // Error de autoría del módulo: no se le cobra al vendedor.
        dispatch({ type: 'tap', event: { ...base, kind: 'miss', hit: false } });
        showMessage('error', outcome.message);
        return;
    }
  }

  function handleInteraction(
    hotspot: SimHotspot | null,
    via: SimInteraction,
    detail: { xPct: number; yPct: number; swipeDirection?: 'left' | 'right' | 'up' | 'down' },
  ) {
    if (!module || !node || run.finishedAt) return;
    applyOutcome(
      decideTap({
        node,
        hotspot,
        checked: run.checkedByNode[node.id] ?? [],
        texts: run.texts,
        nodeExists: id => module.nodes.some(n => n.id === id),
        via,
        swipeDirection: detail.swipeDirection,
      }),
      { nodeId: node.id, xPct: detail.xPct, yPct: detail.yPct, at: Date.now(), hotspotId: hotspot?.id },
      hotspot,
    );
  }

  function handleBack() {
    if (!canGoBack) return;
    setTransition({ type: 'push', direction: 'back' });
    dispatch({ type: 'back' });
    setOffTrack(false);
    setMessage(null);
    noteActivity();
  }

  // Llegar a la pantalla final cierra el módulo, con una pausa para que el
  // vendedor alcance a ver la confirmación. Si esa pantalla todavía le pide
  // algo, espera: si no, terminaría antes de dejarlo escribir.
  const finishNeedsConfirm = !!node && isFinishNode(node) && nodeNeedsInput(node);

  useEffect(() => {
    if (phase !== 'running' || !node || run.finishedAt) return;
    if (!isFinishNode(node) || nodeNeedsInput(node)) return;
    const timer = setTimeout(() => dispatch({ type: 'finish' }), SUCCESS_BEAT_MS);
    return () => clearTimeout(timer);
  }, [node, phase, run.finishedAt]);

  function handleConfirmFinish() {
    if (!node) return;
    const missing = findPendingWork(node, run.checkedByNode[node.id] ?? [], run.texts);
    if (missing) {
      if (missing.textErrors) dispatch({ type: 'textErrors', errors: missing.textErrors });
      haptic('error');
      showMessage('error', missing.message);
      return;
    }
    dispatch({ type: 'finish' });
  }

  // Precarga las pantallas siguientes: sin esto cada avance espera a la red.
  useEffect(() => {
    if (!module || !node || typeof window === 'undefined') return;
    const targets = new Set(
      node.hotspots
        .map(hotspot => resolveHotspotStep(hotspot))
        .filter((step): step is { type: 'go'; nodeId: string } => step.type === 'go')
        .map(step => step.nodeId)
    );
    for (const id of targets) {
      const target = module.nodes.find(n => n.id === id);
      if (!target) continue;
      const image = new window.Image();
      image.src = target.imageUrl;
    }
  }, [module, node]);

  async function exitSimulation() {
    if (phase === 'running') await finalize('abandoned');
    leaveFullscreen();
    router.push('/');
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-neutral-950">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (status === 'missing' || !module) {
    return <FullMessage title="No encontramos esta simulación." action="Volver al inicio" onAction={() => router.push('/')} />;
  }

  if (status === 'broken') {
    return (
      <FullMessage
        title="Esta simulación todavía no tiene pantallas."
        detail="Avísale a tu capacitador para que la termine de armar."
        action="Volver al inicio"
        onAction={() => router.push('/')}
      />
    );
  }

  if (!module.active && !isTrainer) {
    return (
      <FullMessage
        title="Esta simulación no está disponible."
        detail="Tu capacitador la tiene desactivada por ahora."
        action="Volver al inicio"
        onAction={() => router.push('/')}
      />
    );
  }

  if (phase === 'brief') {
    return (
      <SimBrief
        module={module}
        expectedSteps={expected?.screens ?? null}
        maxWrongTaps={maxWrongTaps}
        isTrainer={isTrainer}
        revealAll={revealAll}
        onToggleReveal={setRevealAll}
        onStart={startRun}
        onExit={() => router.push('/')}
      />
    );
  }

  const evaluation = evaluateAttempt({
    wrongTaps: run.wrongTaps,
    stepsTaken: run.steps + 1,
    optimalSteps: expected?.screens ?? null,
    maxWrongTaps,
    needsManualReview: needsManualReview(run.texts),
  });

  const routeIndex = expected ? expected.nodes.indexOf(run.currentNodeId) : -1;
  const progress = expected && routeIndex >= 0
    ? Math.round((routeIndex / Math.max(1, expected.screens - 1)) * 100)
    : 0;
  const goalText = node?.goal || module.instructions || module.title;

  return (
    <div
      ref={rootRef}
      className="relative min-h-[100dvh] h-[100dvh] flex flex-col bg-neutral-950 text-white overscroll-none"
    >
      {node ? (
        <SimStage
          node={node}
          checked={run.checkedByNode[node.id] ?? []}
          texts={run.texts}
          textErrors={run.textErrors}
          revealHotspotId={revealHotspotId}
          revealAll={revealAll && isTrainer}
          disabled={!!run.finishedAt}
          frameColor={module.frameColor}
          forceZoom={module.allowZoom}
          transition={transition}
          onInteraction={handleInteraction}
          onChangeText={(hotspotId, value) => dispatch({ type: 'text', hotspotId, value })}
          onEdgeBack={canGoBack ? handleBack : undefined}
          onActivity={noteActivity}
          onFitChange={fits => setNeedsZoomHint(!fits)}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm text-white/70">Esta pantalla ya no existe en el módulo.</p>
          <Button variant="secondary" onClick={canGoBack ? handleBack : () => dispatch({ type: 'start', nodeId: startNodeId })}>
            {canGoBack ? 'Regresar' : 'Empezar de nuevo'}
          </Button>
        </div>
      )}

      {/* Progreso: una línea en el borde. Sin "paso 2 de 5": en la app real
          nadie te dice en qué paso vas. */}
      {expected && (
        <div className="absolute top-0 inset-x-0 h-[3px] bg-black/15 z-20 pointer-events-none">
          <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* El objetivo aparece al llegar y se repliega en una pestaña. */}
      {!run.finishedAt && (
        <div className="absolute top-[3px] inset-x-0 z-20 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => { setGoalExpanded(v => !v); noteActivity(); }}
            className={cn(
              'pointer-events-auto max-w-[86%] rounded-b-xl bg-neutral-900/85 backdrop-blur',
              'text-white/90 shadow-lg transition-all duration-300',
              goalExpanded ? 'px-4 py-2' : 'px-3 py-1'
            )}
          >
            {goalExpanded ? (
              <span className="text-[13px] leading-snug line-clamp-2 text-left block">{goalText}</span>
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-white/60" />
            )}
          </button>
        </div>
      )}

      {/* Aviso de desvío: la corrección tiene que estar a un toque. */}
      {offTrack && canGoBack && !run.finishedAt && (
        <button
          type="button"
          onClick={handleBack}
          className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-amber-500/90 px-4 py-2 text-xs font-medium text-amber-950 shadow-lg animate-fade-in"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Este no era el camino — regresar
        </button>
      )}

      {/* Controles flotantes: se esconden solos y vuelven con cualquier toque. */}
      {!run.finishedAt && (
        <div
          className={cn(
            'absolute bottom-5 inset-x-0 z-20 flex items-center justify-between px-5 transition-opacity duration-300',
            chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          {canGoBack ? (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Regresar"
              className="h-11 w-11 rounded-full bg-neutral-900/45 backdrop-blur flex items-center justify-center text-white/90 shadow-lg border border-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : <span />}

          <button
            type="button"
            onClick={openHints}
            aria-label="Pedir ayuda"
            className={cn(
              'h-11 w-11 rounded-full backdrop-blur flex items-center justify-center shadow-lg border',
              nudge
                ? 'bg-amber-500/90 text-amber-950 border-amber-300/40 animate-pulse-ring'
                : 'bg-neutral-900/45 text-white/90 border-white/10'
            )}
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Una pantalla final con campos espera confirmación explícita. */}
      {finishNeedsConfirm && !run.finishedAt && (
        <div className="absolute bottom-20 inset-x-0 z-20 flex justify-center">
          <Button size="lg" className="shadow-xl" onClick={handleConfirmFinish}>
            <Check className="h-4 w-4 mr-2" />Terminar
          </Button>
        </div>
      )}

      {needsZoomHint && chromeVisible && !run.finishedAt && (
        <p className="absolute bottom-20 inset-x-0 z-10 text-center text-[11px] text-white/50 pointer-events-none">
          Pellizca para acercar
        </p>
      )}

      {message && (
        <div
          role="status"
          className={cn(
            'absolute left-1/2 -translate-x-1/2 bottom-24 z-20 max-w-[85%] rounded-xl px-4 py-2.5 text-sm text-center shadow-lg border animate-fade-in',
            message.tone === 'detour'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-100'
              : 'bg-neutral-900/95 border-white/15 text-white/90'
          )}
        >
          {message.text}
        </div>
      )}

      {hintOpen && (
        <SimHintPanel
          steps={hintSteps}
          level={hintLevel}
          canReveal={!!node && !!expectedHotspot(node)}
          revealUsed={!!node && revealedNodes.includes(node.id)}
          canGoBack={canGoBack}
          onAdvance={advanceHint}
          onReveal={revealAnswer}
          onBack={() => { setHintOpen(false); handleBack(); }}
          onExit={() => { setHintOpen(false); setExiting(true); }}
          onClose={() => setHintOpen(false)}
        />
      )}

      {exiting && (
        <SimExitDialog onConfirm={exitSimulation} onCancel={() => setExiting(false)} />
      )}

      {phase === 'result' && (
        <SimResult
          module={module}
          evaluation={evaluation}
          durationMs={(run.finishedAt ?? Date.now()) - run.startedAt}
          wrongTaps={run.wrongTaps}
          hintsUsed={run.hintsUsed}
          steps={run.steps + 1}
          optimalSteps={expected?.screens ?? null}
          taps={run.taps}
          onRetry={startRun}
          onExit={() => { leaveFullscreen(); router.push('/'); }}
        />
      )}
    </div>
  );
}

function FullMessage({
  title, detail, action, onAction,
}: {
  title: string;
  detail?: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-neutral-950 p-6">
      <div className="text-center space-y-4 max-w-sm">
        <p className="text-base text-white/85">{title}</p>
        {detail && <p className="text-sm text-white/50">{detail}</p>}
        <Button variant="secondary" onClick={onAction}>{action}</Button>
      </div>
    </div>
  );
}
