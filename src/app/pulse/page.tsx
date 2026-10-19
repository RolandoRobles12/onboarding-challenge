'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getDailyPulse,
  getDailyPulses,
  getPulseConfig,
  getUserPulseAttempts,
  getUserPulseBacklog,
  getPulseCategories,
} from '@/lib/firestore-service';
import { authFetch } from '@/lib/api-client';
import type {
  DailyPulse,
  PulseAttempt,
  PulseAnswer,
  PulseBacklogItem,
  PulseConfig,
  PulseCategory,
  KnowledgeModule,
} from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS } from '@/lib/types-scalable';
import type { AnswerReveal, PlayOption, PlayQuestion } from '@/lib/play-types';
import {
  addDaysStr,
  computePulseStreak,
  formatCountdown,
  formatHHMM,
  formatPulseDate,
  getPulsePhase,
  minutesUntilClose,
  pulseDateStr,
  DEFAULT_QUESTIONS_PER_PULSE,
  PULSE_PASS_PERCENTAGE,
} from '@/lib/pulse-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ProtectedRoute from '@/components/ProtectedRoute';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';
import {
  Radio, CheckCircle, XCircle, Clock, ListTodo, Play, ChevronRight,
  AlertCircle, ChevronDown, ChevronUp, ArrowLeft, Flame, RotateCcw, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/BottomNav';

// ── Helpers ────────────────────────────────────────────────────────────────

const MODULE_COLORS: Record<KnowledgeModule, string> = {
  banca_conversacional: 'bg-blue-500/10 text-blue-700 border-blue-200',
  pagos_renovacion: 'bg-green-500/10 text-green-700 border-green-200',
  solicitud_credito: 'bg-purple-500/10 text-purple-700 border-purple-200',
  herramientas: 'bg-orange-500/10 text-orange-700 border-orange-200',
  politicas_procesos: 'bg-red-500/10 text-red-700 border-red-200',
  incentivos: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
};

/** Minutos después del cierre en que se puede terminar un pulso ya empezado (igual que el servidor). */
const PULSE_CLOSE_GRACE_MINUTES = 15;

/** Días hacia atrás que se muestran en el historial. */
const HISTORY_DAYS = 14;

/** Estado del pulso de hoy que devuelven /api/pulse/play y /api/pulse/start. */
interface PulsePlayState {
  attempt: PulseAttempt | null;
  questions: PlayQuestion[];
  reveals: Record<string, AnswerReveal>;
}

/** POST a una ruta del pulso; lanza un Error con el mensaje del servidor si falla. */
async function pulseApi<T>(path: string, body?: unknown): Promise<T> {
  const res = await authFetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data as T;
}

// ── Page shell (header + bottom nav) ───────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-20 safe-top bg-background/95 backdrop-blur border-b px-4 h-14 flex items-center gap-3">
          <Link href="/" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 font-bold text-base">
            <Radio className="h-4 w-4 text-primary" /> Pulso de Conocimiento
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1">
          {children}
        </div>

        {/* Bottom nav */}
        <BottomNav isAdmin={false} />
      </div>
    </ProtectedRoute>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PulsePage() {
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState<DailyPulse | null>(null);
  const [attempt, setAttempt] = useState<PulseAttempt | null>(null);
  const [pulseConfig, setPulseConfig] = useState<PulseConfig | null>(null);
  const [categories, setCategories] = useState<PulseCategory[]>([]);
  const [questions, setQuestions] = useState<PlayQuestion[]>([]);
  const [reveals, setReveals] = useState<Record<string, AnswerReveal>>({});
  const [backlog, setBacklog] = useState<PulseBacklogItem[]>([]);
  const [showBacklog, setShowBacklog] = useState(false);
  const [history, setHistory] = useState<PulseAttempt[]>([]);
  const [recentPulseDates, setRecentPulseDates] = useState<string[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Quiz flow
  const [quizActive, setQuizActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<PulseAnswer[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.key, c])) as Record<string, PulseCategory>,
    [categories],
  );
  const moduleLabel = useCallback(
    (mod: KnowledgeModule) => categoryMap[mod]?.name ?? KNOWLEDGE_MODULE_LABELS[mod] ?? mod,
    [categoryMap],
  );
  const moduleColor = useCallback(
    (mod: KnowledgeModule) => categoryMap[mod]?.color ?? MODULE_COLORS[mod] ?? 'bg-muted text-muted-foreground border-border',
    [categoryMap],
  );

  // Reloj para la cuenta regresiva y para cerrar la ventana sin recargar.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const today = pulseDateStr(now);
  const closeAt = pulseConfig?.closeAt;
  const phase = getPulsePhase(pulse, closeAt, now);
  const minutesLeft = minutesUntilClose(closeAt, now);
  // Un pulso empezado acepta respuestas hasta 15 minutos después del cierre (lo valida el servidor).
  const pastGrace = pulse?.status === 'closed' || minutesLeft <= -PULSE_CLOSE_GRACE_MINUTES;
  const questionsPerPulse = pulseConfig?.questionsPerPulse ?? DEFAULT_QUESTIONS_PER_PULSE;

  // ── Load data ──────────────────────────────────────────────────────────

  const loadHistory = useCallback(async (uid: string, date: string) => {
    const [attempts, pulses] = await Promise.all([
      getUserPulseAttempts(uid, 60),
      getDailyPulses(addDaysStr(date, -60), date),
    ]);
    setHistory(attempts);
    setRecentPulseDates(pulses.filter(p => (p.questionIds ?? []).length > 0).map(p => p.date));
  }, []);

  const applyState = (state: PulsePlayState) => {
    setAttempt(state.attempt);
    setQuestions(state.questions);
    setReveals(state.reveals);
  };

  const loadData = useCallback(async () => {
    if (!profile) return;
    const date = pulseDateStr();
    setLoading(true);
    try {
      const [pulseData, backlogData, cfg, cats] = await Promise.all([
        getDailyPulse(date),
        getUserPulseBacklog(profile.uid),
        getPulseConfig(),
        getPulseCategories().catch(() => [] as PulseCategory[]),
      ]);
      setCategories(cats);

      // Respaldo del proceso programado: crear el pulso de hoy si falta.
      let resolvedPulse = pulseData;
      if (!pulseData && cfg.autoDailyPulse) {
        try {
          await authFetch('/api/pulse/auto-create', { method: 'POST' });
          resolvedPulse = await getDailyPulse(date);
        } catch {
          // Si falla, el pulso se muestra como no disponible
        }
      }

      setPulse(resolvedPulse);
      setBacklog(backlogData);
      setPulseConfig(cfg);
      applyState(await pulseApi<PulsePlayState>('/api/pulse/play'));
      loadHistory(profile.uid, date).catch(() => {});
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo cargar el pulso', description: 'Revisa tu conexión e inténtalo de nuevo.' });
    } finally {
      setLoading(false);
    }
  }, [profile, loadHistory]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Quiz flow ──────────────────────────────────────────────────────────

  const enterQuiz = (att: PulseAttempt, qs: PlayQuestion[]) => {
    const saved = att.answers ?? [];
    const answeredIds = new Set(saved.map(a => a.questionId));
    const firstPending = qs.findIndex(q => !answeredIds.has(q.id));
    setAnswers(saved);
    setCurrentIndex(firstPending === -1 ? Math.max(qs.length - 1, 0) : firstPending);
    setSelectedOption(null);
    setRevealed(firstPending === -1);
    setStartTime(Date.now());
    setQuizActive(true);
  };

  const handleStart = async () => {
    if (!profile || !pulse) return;
    setSubmitting(true);
    try {
      // Si ya hay intento (p. ej. se abrió en otra pestaña), se retoma: nunca se reinicia.
      const state = await pulseApi<PulsePlayState>('/api/pulse/start');
      applyState(state);
      if (state.attempt?.status === 'in_progress') enterQuiz(state.attempt, state.questions);
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo iniciar', description: err instanceof Error ? err.message : 'Revisa tu conexión e inténtalo de nuevo.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResume = () => {
    if (!attempt) return;
    enterQuiz(attempt, questions);
  };

  const currentQuestion = questions[currentIndex] ?? null;
  const currentAnswer = currentQuestion ? answers.find(a => a.questionId === currentQuestion.id) : undefined;

  const handleConfirm = async () => {
    if (!selectedOption || !currentQuestion || !attempt || !profile) return;
    // La respuesta se califica y guarda en el servidor ANTES de mostrar la
    // solución: recargar no permite cambiarla.
    setSavingAnswer(true);
    try {
      const res = await pulseApi<{ answers: PulseAnswer[]; reveal: AnswerReveal }>('/api/pulse/answer', {
        questionId: currentQuestion.id,
        optionId: selectedOption,
        timeSpent: Math.round((Date.now() - startTime) / 1000),
      });
      setAnswers(res.answers);
      setReveals(prev => ({ ...prev, [currentQuestion.id]: res.reveal }));
      setRevealed(true);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        toast({ variant: 'destructive', title: 'Este pulso ya no acepta respuestas', description: err instanceof Error ? err.message : '' });
        setQuizActive(false);
        await loadData();
      } else {
        toast({ variant: 'destructive', title: 'No se guardó tu respuesta', description: 'Revisa tu conexión e inténtalo de nuevo.' });
      }
    } finally {
      setSavingAnswer(false);
    }
  };

  const handleNext = async () => {
    if (!profile || !attempt) return;
    const isLast = currentIndex >= questions.length - 1;
    if (!isLast) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setRevealed(false);
      setStartTime(Date.now());
      return;
    }

    setSubmitting(true);
    try {
      const { attempt: finished } = await pulseApi<{ attempt: PulseAttempt }>('/api/pulse/submit');
      if (finished.status !== 'completed') {
        toast({ variant: 'destructive', title: 'Este pulso ya no acepta respuestas', description: 'La ventana de ese día terminó.' });
        setQuizActive(false);
        await loadData();
        return;
      }
      setAttempt(finished);
      setQuizActive(false);
      setShowReview(false);
      toast({
        title: '¡Pulso completado!',
        description: `Respondiste ${finished.correctAnswers}/${finished.totalQuestions} correctamente.`,
      });
      const [bl] = await Promise.all([
        getUserPulseBacklog(profile.uid),
        loadHistory(profile.uid, today),
      ]);
      setBacklog(bl);
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo cerrar el pulso', description: 'Tus respuestas están guardadas. Inténtalo de nuevo.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBacklogResolved = (itemId: string) => {
    setBacklog(prev => prev.filter(b => b.id !== itemId));
  };

  // ── Derived: streak & history ──────────────────────────────────────────

  // Hoy no rompe la racha mientras aún se pueda responder (ventana abierta o pulso a medias).
  const todayStillAnswerable = phase === 'disponible' || (attempt?.status === 'in_progress' && attempt.date === today && !pastGrace);
  const streak = useMemo(
    () => computePulseStreak(recentPulseDates, history, today, todayStillAnswerable),
    [recentPulseDates, history, today, todayStillAnswerable],
  );

  const historyDays = useMemo(() => {
    const byDate = new Map(history.map(a => [a.date, a]));
    const pulseDays = new Set(recentPulseDates);
    const days: { date: string; attempt?: PulseAttempt; hadPulse: boolean }[] = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const date = addDaysStr(today, -i);
      days.push({ date, attempt: byDate.get(date), hadPulse: pulseDays.has(date) });
    }
    return days;
  }, [history, recentPulseDates, today]);

  // ── Render: loading ────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell>
        <div className="max-w-xl sm:max-w-2xl mx-auto w-full px-4 sm:px-6 pt-10 pb-28 space-y-4">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-6 w-32 mx-auto" />
          <Skeleton className="h-64 rounded-2xl mt-6" />
        </div>
      </PageShell>
    );
  }

  // ── Render: active quiz ────────────────────────────────────────────────

  if (quizActive && currentQuestion) {
    const isLast = currentIndex >= questions.length - 1;
    const answeredCount = answers.length;

    return (
      <PageShell>
        <div className="max-w-xl sm:max-w-2xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28 flex flex-col gap-5">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Pregunta {currentIndex + 1} de {questions.length}</span>
              {phase === 'disponible' && minutesLeft <= 60 ? (
                <span className="flex items-center gap-1 text-orange-600 font-medium">
                  <Clock className="h-3 w-3" /> Cierra en {formatCountdown(minutesLeft)}
                </span>
              ) : (
                <span>{answeredCount} respondida{answeredCount !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex gap-1.5">
              {questions.map((q, i) => {
                const ans = answers.find(a => a.questionId === q.id);
                return (
                  <div
                    key={q.id}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-all duration-300',
                      ans ? (ans.isCorrect ? 'bg-green-500' : 'bg-red-400') : i === currentIndex ? 'bg-primary/60' : 'bg-muted'
                    )}
                  />
                );
              })}
            </div>
          </div>

          {/* Question card */}
          <Card className="rounded-2xl shadow-sm border-0 bg-card">
            <CardContent className="p-5 sm:p-7 space-y-5">
              <QuestionBody
                question={currentQuestion}
                reveal={revealed ? reveals[currentQuestion.id] : undefined}
                selectedOption={revealed ? currentAnswer?.selectedOptionIds[0] ?? selectedOption : selectedOption}
                revealed={revealed}
                onSelect={id => { if (!revealed && !savingAnswer) setSelectedOption(id); }}
                moduleLabel={moduleLabel}
                moduleColor={moduleColor}
              />
            </CardContent>
          </Card>

          {/* Action */}
          {!revealed ? (
            <Button
              className="w-full h-12 sm:h-14 rounded-xl font-semibold text-base sm:text-lg"
              onClick={handleConfirm}
              disabled={!selectedOption || savingAnswer}
            >
              {savingAnswer ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Guardando...</> : 'Confirmar respuesta'}
            </Button>
          ) : (
            <Button
              className="w-full h-12 sm:h-14 rounded-xl font-semibold text-base sm:text-lg"
              onClick={handleNext}
              disabled={submitting}
            >
              {submitting ? 'Guardando...' : isLast
                ? 'Ver resultados'
                : <span className="flex items-center gap-1.5">Siguiente <ChevronRight className="h-4 w-4" /></span>
              }
            </Button>
          )}
          <p className="text-[11px] text-center text-muted-foreground">
            Cada respuesta se guarda al confirmarla. Si sales, puedes continuar donde te quedaste.
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Render: main ───────────────────────────────────────────────────────

  const completed = attempt?.status === 'completed' ? attempt : null;
  const inProgress = attempt?.status === 'in_progress' && attempt.date === today ? attempt : null;

  return (
    <PageShell>
      <div className="max-w-xl sm:max-w-2xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28 space-y-4">
        {/* Date + streak */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground first-letter:uppercase">{formatPulseDate(today)}</p>
          {streak.current > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-700">
              <Flame className="h-3.5 w-3.5" /> {streak.current} día{streak.current !== 1 ? 's' : ''} seguidos
            </span>
          )}
        </div>

        {/* Main card */}
        {completed ? (
          <ResultCard
            attempt={completed}
            questions={questions}
            reveals={reveals}
            showReview={showReview}
            onToggleReview={() => setShowReview(v => !v)}
          />
        ) : inProgress ? (
          <Card className="rounded-2xl shadow-sm border-0">
            <CardContent className="p-6 space-y-5">
              <div className="space-y-1">
                <p className="font-bold text-2xl">Tienes un pulso a medias</p>
                <p className="text-sm text-muted-foreground">
                  Llevas {inProgress.answers?.length ?? 0} de {inProgress.totalQuestions} preguntas. Tus respuestas están guardadas.
                </p>
                {phase === 'cerrado' && (pastGrace ? (
                  <p className="text-xs text-orange-600">La ventana cerró antes de que lo terminaras. Tus respuestas quedaron guardadas.</p>
                ) : (
                  <p className="text-xs text-orange-600">La ventana ya cerró: tienes {formatCountdown(PULSE_CLOSE_GRACE_MINUTES + minutesLeft)} para terminar el pulso que empezaste.</p>
                ))}
              </div>
              {!pastGrace && (
                <Button className="w-full h-12 sm:h-14 rounded-xl font-semibold text-base sm:text-lg" size="lg" onClick={handleResume}>
                  <Play className="h-5 w-5 mr-2" /> Continuar pulso
                </Button>
              )}
            </CardContent>
          </Card>
        ) : phase === 'sin_pulso' ? (
          <StatusCard icon={AlertCircle} title="Sin pulso programado hoy" text="Vuelve mañana o contacta a tu líder de equipo." />
        ) : phase === 'cerrado' ? (
          <StatusCard
            icon={Clock}
            title="Ventana de respuesta cerrada"
            text={attempt?.status === 'expired'
              ? 'No terminaste el pulso a tiempo. Vuelve mañana.'
              : `El pulso de hoy cerró a las ${formatHHMM(closeAt)}. Vuelve mañana.`}
          />
        ) : phase === 'programado' ? (
          <StatusCard icon={Clock} title="El pulso se está preparando" text="Las preguntas de hoy estarán listas pronto. Vuelve en unos minutos." />
        ) : (
          <Card className="rounded-2xl shadow-sm border-0">
            <CardContent className="p-6 space-y-5">
              <div className="space-y-1.5">
                <p className="font-bold text-2xl">{questionsPerPulse} preguntas de hoy</p>
                <p className={cn(
                  'text-xs flex items-center gap-1.5',
                  minutesLeft <= 60 ? 'text-orange-600 font-medium' : 'text-muted-foreground',
                )}>
                  <Clock className="h-3.5 w-3.5" />
                  Cierra a las {formatHHMM(closeAt)} · quedan {formatCountdown(minutesLeft)}
                </p>
              </div>
              <Button
                className="w-full h-12 sm:h-14 rounded-xl font-semibold text-base sm:text-lg"
                size="lg"
                onClick={handleStart}
                disabled={submitting}
              >
                <Play className="h-5 w-5 mr-2" />
                {submitting ? 'Iniciando...' : 'Iniciar Pulso de Hoy'}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Verás la respuesta correcta después de cada pregunta. Tu primera respuesta es la que cuenta.
              </p>
            </CardContent>
          </Card>
        )}

        {/* History */}
        {historyDays.some(d => d.hadPulse || d.attempt) && (
          <Card className="rounded-2xl shadow-sm border-0">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Tus últimos {HISTORY_DAYS} días</p>
                <p className="text-xs text-muted-foreground">
                  Racha: <strong className="text-foreground">{streak.current}</strong> · Mejor: <strong className="text-foreground">{streak.best}</strong>
                </p>
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${HISTORY_DAYS}, minmax(0, 1fr))` }}>
                {historyDays.map(d => {
                  const a = d.attempt;
                  const done = a?.status === 'completed';
                  const pct = done ? a!.percentage : null;
                  return (
                    <div key={d.date} className="flex flex-col items-center gap-1" title={`${formatPulseDate(d.date, { day: 'numeric', month: 'short' })}${pct !== null ? ` · ${pct}%` : ''}`}>
                      <div className={cn(
                        'w-full aspect-square rounded-md flex items-center justify-center text-[9px] font-bold',
                        done
                          ? (pct! >= PULSE_PASS_PERCENTAGE ? 'bg-green-500/80 text-white' : 'bg-orange-400/80 text-white')
                          : d.hadPulse && d.date !== today ? 'bg-red-100 border border-red-200' : 'bg-muted',
                      )}>
                        {done ? pct : ''}
                      </div>
                      <span className={cn('text-[9px]', d.date === today ? 'text-primary font-bold' : 'text-muted-foreground')}>
                        {Number(d.date.slice(8))}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-500/80" /> ≥{PULSE_PASS_PERCENTAGE}%</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange-400/80" /> &lt;{PULSE_PASS_PERCENTAGE}%</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-100 border border-red-200" /> No respondido</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted" /> Sin pulso</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Backlog */}
        {backlog.length > 0 && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50/50 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-orange-50/80 transition-colors"
              onClick={() => setShowBacklog(v => !v)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                <ListTodo className="h-4 w-4" />
                Repaso pendiente
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">{backlog.length}</Badge>
              </span>
              {showBacklog ? <ChevronUp className="h-4 w-4 text-orange-500" /> : <ChevronDown className="h-4 w-4 text-orange-500" />}
            </button>
            {showBacklog && (
              <div className="border-t border-orange-200 divide-y divide-orange-100">
                <p className="px-4 py-2.5 text-xs text-orange-800/80 bg-background">
                  Preguntas que fallaste. Respóndelas bien para quitarlas de tu lista.
                </p>
                {backlog.map(item => (
                  <BacklogItem
                    key={item.id}
                    item={item}
                    onResolved={handleBacklogResolved}
                    moduleLabel={moduleLabel}
                    moduleColor={moduleColor}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function StatusCard({ icon: Icon, title, text }: { icon: typeof Clock; title: string; text: string }) {
  return (
    <Card className="rounded-2xl shadow-sm border-0">
      <CardContent className="py-14 text-center space-y-3">
        <Icon className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

/** Pregunta con sus opciones; se reutiliza en el pulso y en el repaso del backlog. */
function QuestionBody({
  question, reveal, selectedOption, revealed, onSelect, moduleLabel, moduleColor, showModule = true,
}: {
  showModule?: boolean;
  question: PlayQuestion;
  /** Respuesta correcta, una vez calificada en el servidor. */
  reveal?: AnswerReveal;
  selectedOption: string | null;
  revealed: boolean;
  onSelect: (optionId: string) => void;
  moduleLabel: (m: KnowledgeModule) => string;
  moduleColor: (m: KnowledgeModule) => string;
}) {
  return (
    <>
      {showModule && question.module && (
        <span className={cn('text-xs px-2.5 py-1 rounded-full inline-block border font-medium', moduleColor(question.module))}>
          {moduleLabel(question.module)}
        </span>
      )}

      <h2 className="text-lg sm:text-xl font-semibold leading-snug">{question.text}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {question.options.map((opt: PlayOption) => {
          const isSelected = selectedOption === opt.id;
          const isCorrect = !!reveal?.correctOptionIds.includes(opt.id);
          let stateClass = 'border-border hover:border-primary/50 hover:bg-muted/40';
          if (revealed) {
            if (isCorrect) stateClass = 'border-green-500 bg-green-500/10 text-green-800';
            else if (isSelected) stateClass = 'border-red-400 bg-red-500/10 text-red-700';
            else stateClass = 'border-border opacity-50';
          } else if (isSelected) {
            stateClass = 'border-primary bg-primary/5 shadow-sm';
          }
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              disabled={revealed}
              className={cn('w-full text-left p-4 rounded-xl border-2 transition-all duration-150 flex items-center gap-3', stateClass)}
            >
              <div className={cn(
                'h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center',
                revealed && isCorrect ? 'border-green-500 bg-green-500' :
                revealed && isSelected && !isCorrect ? 'border-red-400 bg-red-400' :
                isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
              )}>
                {revealed && isCorrect && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                {revealed && isSelected && !isCorrect && <XCircle className="h-3.5 w-3.5 text-white" />}
              </div>
              <span className="font-medium text-sm sm:text-base leading-snug">{opt.text}</span>
            </button>
          );
        })}
      </div>

      {revealed && reveal?.explanation && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-sm">
          <p className="font-semibold mb-1 text-xs uppercase tracking-wide text-blue-600">Explicación</p>
          <p className="leading-relaxed">{reveal.explanation}</p>
        </div>
      )}
    </>
  );
}

/** Resultado del día con revisión: respuesta propia, correcta y explicación. */
function ResultCard({ attempt, questions, reveals, showReview, onToggleReview }: {
  attempt: PulseAttempt;
  questions: PlayQuestion[];
  reveals: Record<string, AnswerReveal>;
  showReview: boolean;
  onToggleReview: () => void;
}) {
  const pct = attempt.percentage;
  const passed = pct >= PULSE_PASS_PERCENTAGE;
  const answers = attempt.answers ?? [];

  return (
    <Card className="rounded-2xl shadow-sm border-0 overflow-hidden">
      <div className={cn('py-8 px-6 text-center', passed ? 'bg-green-500/8' : 'bg-orange-500/8')}>
        <div className={cn(
          'w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center mx-auto text-3xl sm:text-4xl font-extrabold border-4',
          passed
            ? 'bg-green-500/10 text-green-700 border-green-500/30'
            : 'bg-orange-500/10 text-orange-700 border-orange-400/30'
        )}>
          {pct}%
        </div>
        <h2 className="text-2xl font-bold mt-4">{passed ? '¡Buen trabajo!' : 'Sigue practicando'}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {attempt.correctAnswers} de {attempt.totalQuestions} respuestas correctas · ya respondiste el pulso de hoy
        </p>
      </div>
      <CardContent className="py-3 px-4">
        <button
          onClick={onToggleReview}
          className="w-full flex items-center justify-between py-2 text-sm font-semibold"
        >
          <span>Revisar mis respuestas</span>
          {showReview ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showReview && (
          <div className="divide-y border-t">
            {answers.map((ans, idx) => {
              const q = questions.find(x => x.id === ans.questionId);
              const reveal = reveals[ans.questionId];
              const chosen = q?.options.find(o => ans.selectedOptionIds.includes(o.id));
              const correctText = reveal?.correctAnswerText;
              return (
                <div key={ans.questionId} className="py-3 space-y-1.5">
                  <div className="flex items-start gap-2.5">
                    {ans.isCorrect
                      ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                    <p className="text-sm font-medium leading-snug">{q?.text ?? `Pregunta ${idx + 1}`}</p>
                  </div>
                  {q && (
                    <div className="ml-[26px] space-y-1 text-xs">
                      {!ans.isCorrect && chosen && (
                        <p className="text-red-700"><span className="font-semibold">Tu respuesta:</span> {chosen.text}</p>
                      )}
                      {correctText && (
                        <p className="text-green-700"><span className="font-semibold">Correcta:</span> {correctText}</p>
                      )}
                      {reveal?.explanation && <p className="text-muted-foreground leading-relaxed">{reveal.explanation}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Ítem del backlog: se resuelve respondiendo la pregunta correctamente. */
function BacklogItem({ item, onResolved, moduleLabel, moduleColor }: {
  item: PulseBacklogItem;
  onResolved: (id: string) => void;
  moduleLabel: (m: KnowledgeModule) => string;
  moduleColor: (m: KnowledgeModule) => string;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState<PlayQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reveal, setReveal] = useState<AnswerReveal | undefined>();
  const [correct, setCorrect] = useState(false);
  const [saving, setSaving] = useState(false);
  // Tras un error se muestra la solución; volver a intentarlo el mismo día
  // sería trivial, así que el siguiente intento queda para mañana.
  const reviewedToday = !!item.lastReviewedAt && pulseDateStr(item.lastReviewedAt.toDate()) === pulseDateStr();
  const [missedToday, setMissedToday] = useState(reviewedToday);

  const handleOpen = async () => {
    setOpen(true);
    setSelected(null);
    setRevealed(false);
    setReveal(undefined);
    if (question) return;
    setLoading(true);
    try {
      const res = await pulseApi<{ question: PlayQuestion | null }>('/api/pulse/review', { itemId: item.id });
      setQuestion(res.question);
    } catch {
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selected || !question) return;
    setSaving(true);
    try {
      const { result } = await pulseApi<{ result: { isCorrect: boolean; reveal: AnswerReveal } }>(
        '/api/pulse/review', { itemId: item.id, optionId: selected },
      );
      setCorrect(result.isCorrect);
      setReveal(result.reveal);
      setRevealed(true);
      if (!result.isCorrect) setMissedToday(true);
      if (result.isCorrect) toast({ title: '¡Correcto!', description: 'La pregunta salió de tu repaso pendiente.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Revisa tu conexión.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-3 bg-background space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full inline-block mb-1.5 border font-medium', moduleColor(item.module))}>
            {moduleLabel(item.module)}
          </span>
          {!open && <p className="text-sm font-medium leading-snug">{item.questionText}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            Del pulso del {formatPulseDate(item.pulseDate, { weekday: 'short', day: 'numeric', month: 'short' })}
            {(item.reviewAttempts ?? 0) > 0 && ` · ${item.reviewAttempts} intento${item.reviewAttempts !== 1 ? 's' : ''} de repaso`}
          </p>
        </div>
        {!open && (missedToday ? (
          <span className="shrink-0 text-[11px] text-muted-foreground text-right leading-tight pt-1">Vuelve a<br />intentarlo mañana</span>
        ) : (
          <Button variant="outline" size="sm" onClick={handleOpen} className="shrink-0 text-orange-700 border-orange-300 hover:bg-orange-50 text-xs">
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Repasar
          </Button>
        ))}
      </div>

      {open && (
        loading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : !question ? (
          <p className="text-xs text-muted-foreground">Esta pregunta ya no está disponible.</p>
        ) : (
          <div className="space-y-3">
            <QuestionBody
              question={question}
              reveal={reveal}
              selectedOption={selected}
              revealed={revealed}
              onSelect={id => { if (!revealed) setSelected(id); }}
              moduleLabel={moduleLabel}
              moduleColor={moduleColor}
              showModule={false}
            />
            {!revealed ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button size="sm" className="flex-1" onClick={handleConfirm} disabled={!selected || saving}>
                  {saving ? 'Guardando...' : 'Confirmar'}
                </Button>
              </div>
            ) : correct ? (
              <Button size="sm" className="w-full" onClick={() => onResolved(item.id)}>
                <CheckCircle className="h-4 w-4 mr-1.5" /> Listo, quitar de mi repaso
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="flex-1 text-xs text-muted-foreground">Sigue en tu repaso: podrás intentarlo de nuevo mañana.</p>
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cerrar</Button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
