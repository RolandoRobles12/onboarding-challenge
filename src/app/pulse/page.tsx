'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getDailyPulse,
  getPulseAttempt,
  getPulseConfig,
  startPulseAttempt,
  submitPulseAttempt,
  addToPulseBacklog,
  getUserPulseBacklog,
  resolvePulseBacklogItem,
  getPulseCategories,
} from '@/lib/firestore-service';
import type {
  DailyPulse,
  PulseAttempt,
  PulseAnswer,
  PulseBacklogItem,
  PulseConfig,
  PulseCategory,
  Question,
  KnowledgeModule,
} from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS, SEGMENTATION_FIELD_KEYS } from '@/lib/types-scalable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ProtectedRoute from '@/components/ProtectedRoute';
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { getDoc, doc } from 'firebase/firestore';
import Link from 'next/link';
import {
  Radio, CheckCircle, XCircle, Clock, ListTodo, Play, ChevronRight,
  Award, AlertCircle, ChevronDown, ChevronUp, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/BottomNav';

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "14:00" → "2:00 PM" */
function formatCloseAt(closeAt: string) {
  const [h, m] = closeAt.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

const MODULE_COLORS: Record<KnowledgeModule, string> = {
  banca_conversacional: 'bg-blue-500/10 text-blue-700 border-blue-200',
  pagos_renovacion: 'bg-green-500/10 text-green-700 border-green-200',
  solicitud_credito: 'bg-purple-500/10 text-purple-700 border-purple-200',
  herramientas: 'bg-orange-500/10 text-orange-700 border-orange-200',
  politicas_procesos: 'bg-red-500/10 text-red-700 border-red-200',
  incentivos: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
};

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
  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.key, c])) as Record<string, PulseCategory>,
    [categories],
  );
  const moduleLabel = (mod: KnowledgeModule) => categoryMap[mod]?.name ?? KNOWLEDGE_MODULE_LABELS[mod];
  const moduleColor = (mod: KnowledgeModule) => categoryMap[mod]?.color ?? MODULE_COLORS[mod];
  const [questions, setQuestions] = useState<Question[]>([]);
  const [backlog, setBacklog] = useState<PulseBacklogItem[]>([]);
  const [showBacklog, setShowBacklog] = useState(false);

  // Quiz flow
  const [quizActive, setQuizActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<PulseAnswer[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);

  const today = todayStr();
  // Ventana de respuesta real, según la hora de cierre configurada en el
  // Pulso (admin/knowledge-pulse) — antes estaba fija en las 12:00 sin
  // relación con esa configuración, y solo era un aviso, no un bloqueo.
  const closeAt = pulseConfig?.closeAt || '12:00';
  const windowOpen = (() => {
    const [closeH, closeM] = closeAt.split(':').map(Number);
    const now = new Date();
    const closeTime = new Date(now);
    closeTime.setHours(closeH || 0, closeM || 0, 0, 0);
    return now < closeTime;
  })();

  // ── Load data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [pulseData, attemptData, backlogData, cfg, cats] = await Promise.all([
        getDailyPulse(today),
        getPulseAttempt(profile.uid, today),
        getUserPulseBacklog(profile.uid),
        getPulseConfig(),
        getPulseCategories().catch(() => [] as PulseCategory[]),
      ]);
      setCategories(cats);

      // Auto-create today's pulse if autoDailyPulse is enabled and no pulse exists yet
      let resolvedPulse = pulseData;
      if (!pulseData && cfg.autoDailyPulse) {
        try {
          await fetch('/api/pulse/auto-create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: today }) });
          resolvedPulse = await getDailyPulse(today);
        } catch {
          // Ignore auto-create errors; pulse will show as unavailable
        }
      }

      setPulse(resolvedPulse);
      setAttempt(attemptData);
      setBacklog(backlogData);
      setPulseConfig(cfg);

      if (resolvedPulse && resolvedPulse.questionIds.length > 0) {
        // Use the user's personal question IDs if already assigned, otherwise use pool
        const qIds = attemptData?.questionIds ?? resolvedPulse.questionIds;
        const qs: Question[] = [];
        for (const qId of qIds) {
          const snap = await getDoc(doc(db!, 'questions', qId));
          if (snap.exists()) qs.push({ id: snap.id, ...snap.data() } as Question);
        }
        setQuestions(qs);
      }
    } finally {
      setLoading(false);
    }
  }, [profile, today]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Quiz flow ──────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!profile || !pulse) return;
    setSubmitting(true);
    try {
      const od = (profile as any).onboardingData ?? {};
      const seg = {
        vertical: od[SEGMENTATION_FIELD_KEYS.vertical],
        hub: od[SEGMENTATION_FIELD_KEYS.hub],
        estado: od[SEGMENTATION_FIELD_KEYS.estado],
        cosecha: od[SEGMENTATION_FIELD_KEYS.fechaIngreso],
      };

      // If sameQuestionsForAll=false, pick a random subset of questionsPerPulse from the pool
      let assignedIds: string[] | undefined;
      if (!pulseConfig?.sameQuestionsForAll && pulse.questionIds.length > 0) {
        const n = pulseConfig?.questionsPerPulse ?? 7;
        const pool = [...pulse.questionIds];
        // Fisher-Yates shuffle
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        assignedIds = pool.slice(0, n);
      }

      await startPulseAttempt(profile.uid, profile.nombre, today, seg, assignedIds);
      const newAttempt = await getPulseAttempt(profile.uid, today);
      setAttempt(newAttempt);

      // If the user was assigned a specific subset, load those questions now
      if (assignedIds && assignedIds.length > 0) {
        const qs: Question[] = [];
        for (const qId of assignedIds) {
          const snap = await getDoc(doc(db!, 'questions', qId));
          if (snap.exists()) qs.push({ id: snap.id, ...snap.data() } as Question);
        }
        setQuestions(qs);
      }

      setCurrentIndex(0);
      setAnswers([]);
      setSelectedOption(null);
      setRevealed(false);
      setStartTime(Date.now());
      setQuizActive(true);
    } finally {
      setSubmitting(false);
    }
  };

  const currentQuestion = questions[currentIndex] ?? null;

  // Orden de opciones — se mezcla una sola vez por pregunta cuando el admin
  // activó "Orden aleatorio de respuestas" en la configuración del Pulso.
  const displayedOptions = useMemo(() => {
    if (!currentQuestion) return [];
    if (!pulseConfig?.randomizeAnswerOrder) return currentQuestion.options;
    const shuffled = [...currentQuestion.options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [currentQuestion, pulseConfig?.randomizeAnswerOrder]);

  const handleSelectOption = (optionId: string) => {
    if (revealed) return;
    setSelectedOption(optionId);
  };

  const handleConfirm = () => {
    if (!selectedOption || !currentQuestion) return;
    const correct = currentQuestion.options.find(o => o.id === selectedOption)?.isCorrect ?? false;
    const answer: PulseAnswer = {
      questionId: currentQuestion.id,
      selectedOptionIds: [selectedOption],
      isCorrect: correct,
      timeSpent: Math.round((Date.now() - startTime) / 1000),
    };
    setAnswers(prev => [...prev, answer]);
    setRevealed(true);
    setStartTime(Date.now());
  };

  const handleNext = async () => {
    const isLast = currentIndex >= questions.length - 1;
    if (isLast) {
      setSubmitting(true);
      try {
        const allAnswers = answers;
        await submitPulseAttempt(profile!.uid, today, allAnswers);

        const incorrectQuestions = allAnswers
          .filter(a => !a.isCorrect)
          .map(a => {
            const q = questions.find(q => q.id === a.questionId);
            return q ? {
              questionId: q.id,
              questionText: q.text,
              module: (q.module ?? 'herramientas') as KnowledgeModule,
            } : null;
          })
          .filter(Boolean) as { questionId: string; questionText: string; module: KnowledgeModule }[];

        if (incorrectQuestions.length > 0) {
          await addToPulseBacklog(profile!.uid, incorrectQuestions, today);
        }

        await loadData();
        setQuizActive(false);
        toast({ title: '¡Pulso completado!', description: `Respondiste ${allAnswers.filter(a => a.isCorrect).length}/7 correctamente.` });
      } finally {
        setSubmitting(false);
      }
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setRevealed(false);
    }
  };

  const handleResolveBacklog = async (itemId: string) => {
    await resolvePulseBacklogItem(itemId);
    setBacklog(prev => prev.filter(b => b.id !== itemId));
    toast({ title: 'Pregunta resuelta', description: 'Eliminada de tu backlog.' });
  };

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

    return (
      <PageShell>
        <div className="max-w-xl sm:max-w-2xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28 flex flex-col gap-5">
            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>Pregunta {currentIndex + 1} de {questions.length}</span>
                <span>{Math.round(((currentIndex + 1) / questions.length) * 100)}%</span>
              </div>
              <div className="flex gap-1.5">
                {questions.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-all duration-300',
                      i < currentIndex ? 'bg-primary' : i === currentIndex ? 'bg-primary/60' : 'bg-muted'
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Question card */}
            <Card className="rounded-2xl shadow-sm border-0 bg-card">
              <CardContent className="p-5 sm:p-7 space-y-5">
                {/* Module badge */}
                {currentQuestion.module && (
                  <span className={cn(
                    'text-xs px-2.5 py-1 rounded-full inline-block border font-medium',
                    moduleColor(currentQuestion.module)
                  )}>
                    {moduleLabel(currentQuestion.module)}
                  </span>
                )}

                {/* Question text */}
                <h2 className="text-lg sm:text-xl font-semibold leading-snug">{currentQuestion.text}</h2>

                {/* Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {displayedOptions.map(opt => {
                    const isSelected = selectedOption === opt.id;
                    const isCorrect = opt.isCorrect;
                    let stateClass = 'border-border hover:border-primary/50 hover:bg-muted/40';
                    if (revealed) {
                      if (isCorrect) stateClass = 'border-green-500 bg-green-500/10 text-green-800';
                      else if (isSelected && !isCorrect) stateClass = 'border-red-400 bg-red-500/10 text-red-700';
                      else stateClass = 'border-border opacity-50';
                    } else if (isSelected) {
                      stateClass = 'border-primary bg-primary/5 shadow-sm';
                    }
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectOption(opt.id)}
                        disabled={revealed}
                        className={cn(
                          'w-full text-left p-4 rounded-xl border-2 transition-all duration-150 flex items-center gap-3',
                          stateClass
                        )}
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

                {/* Explanation */}
                {revealed && currentQuestion.explanation && (
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-sm">
                    <p className="font-semibold mb-1 text-xs uppercase tracking-wide text-blue-600">Explicación</p>
                    <p className="leading-relaxed">{currentQuestion.explanation}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action */}
            {!revealed ? (
              <Button
                className="w-full h-12 sm:h-14 rounded-xl font-semibold text-base sm:text-lg"
                onClick={handleConfirm}
                disabled={!selectedOption}
              >
                Confirmar respuesta
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
          </div>
      </PageShell>
    );
  }

  // ── Render: results ────────────────────────────────────────────────────

  if (attempt?.status === 'completed' && !quizActive) {
    const correct = attempt.correctAnswers;
    const total = attempt.totalQuestions;
    const pct = attempt.percentage;
    const passed = pct >= 70;

    return (
      <PageShell>
        <div className="max-w-xl sm:max-w-2xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28 space-y-4">
            {/* Score card */}
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
                <h2 className="text-2xl font-bold mt-4">
                  {passed ? '¡Buen trabajo!' : 'Sigue practicando'}
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {correct} de {total} respuestas correctas
                </p>
              </div>
              <CardContent className="py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                {attempt.answers.map((ans, idx) => {
                  const q = questions.find(q => q.id === ans.questionId);
                  return (
                    <div key={ans.questionId} className="flex items-start gap-2.5 py-1.5 border-b last:border-0 sm:odd:border-r sm:odd:pr-3 sm:even:pl-3">
                      {ans.isCorrect
                        ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      }
                      <p className="text-sm text-muted-foreground leading-snug">{q?.text ?? `Pregunta ${idx + 1}`}</p>
                    </div>
                  );
                })}
                </div>
              </CardContent>
            </Card>

            {/* Backlog section */}
            {backlog.length > 0 && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50/50 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-orange-50/80 transition-colors"
                  onClick={() => setShowBacklog(v => !v)}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-orange-700">
                    <ListTodo className="h-4 w-4" />
                    {backlog.length} pregunta{backlog.length > 1 ? 's' : ''} en tu backlog de repaso
                  </span>
                  {showBacklog ? <ChevronUp className="h-4 w-4 text-orange-500" /> : <ChevronDown className="h-4 w-4 text-orange-500" />}
                </button>
                {showBacklog && (
                  <div className="border-t border-orange-200 divide-y divide-orange-100">
                    {backlog.map(item => (
                      <BacklogItem key={item.id} item={item} onResolve={handleResolveBacklog} categoryMap={categoryMap} />
                    ))}
                  </div>
                )}
              </div>
            )}
        </div>
      </PageShell>
    );
  }

  // ── Render: main (idle) ────────────────────────────────────────────────

  return (
    <PageShell>
      <div className="max-w-xl sm:max-w-2xl mx-auto w-full px-4 sm:px-6 pt-6 pb-28 space-y-4">
          {/* Date header */}
          <p className="text-sm text-muted-foreground capitalize text-center">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>

          {/* Main card */}
          {!pulse ? (
            <Card className="rounded-2xl shadow-sm border-0">
              <CardContent className="py-14 text-center space-y-3">
                <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="font-semibold">Sin pulso programado hoy</p>
                <p className="text-sm text-muted-foreground">Vuelve mañana o contacta a tu líder de equipo.</p>
              </CardContent>
            </Card>
          ) : pulse.status === 'closed' && !attempt ? (
            <Card className="rounded-2xl shadow-sm border-0">
              <CardContent className="py-14 text-center space-y-3">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="font-semibold">Ventana de respuesta cerrada</p>
                <p className="text-sm text-muted-foreground">El pulso de hoy ya cerró. Vuelve mañana.</p>
              </CardContent>
            </Card>
          ) : attempt?.status === 'completed' ? (
            <Card className="rounded-2xl shadow-sm border-0 border-green-100">
              <CardContent className="py-10 text-center space-y-3">
                <Award className="h-12 w-12 mx-auto text-green-600" />
                <div>
                  <p className="font-bold text-lg text-green-700">¡Ya respondiste el pulso de hoy!</p>
                  <p className="text-sm text-green-600 mt-1">
                    {attempt.correctAnswers}/{attempt.totalQuestions} correctas · {attempt.percentage}%
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : pulse.questionIds.length === 0 ? (
            <Card className="rounded-2xl shadow-sm border-0">
              <CardContent className="py-14 text-center space-y-3">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="font-semibold">El pulso se está preparando</p>
                <p className="text-sm text-muted-foreground">Las preguntas de hoy estarán listas pronto. Vuelve en unos minutos.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl shadow-sm border-0">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-1">
                  <p className="font-bold text-2xl">{pulseConfig?.questionsPerPulse ?? 7} preguntas de hoy</p>
                  {windowOpen ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Responde antes de las {formatCloseAt(closeAt)}
                    </p>
                  ) : (
                    <p className="text-xs text-red-600 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> La ventana de hoy cerró a las {formatCloseAt(closeAt)}
                    </p>
                  )}
                </div>

                <Button
                  className="w-full h-12 sm:h-14 rounded-xl font-semibold text-base sm:text-lg"
                  size="lg"
                  onClick={handleStart}
                  disabled={submitting || !windowOpen}
                >
                  <Play className="h-5 w-5 mr-2" />
                  {submitting ? 'Iniciando...' : windowOpen ? 'Iniciar Pulso de Hoy' : 'Ventana cerrada'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Backlog toggle */}
          {backlog.length > 0 && (
            <div className="rounded-2xl border overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3.5 bg-background hover:bg-muted/40 transition-colors"
                onClick={() => setShowBacklog(v => !v)}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ListTodo className="h-4 w-4 text-orange-500" />
                  Backlog de repaso
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-xs">{backlog.length}</Badge>
                </span>
                {showBacklog ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showBacklog && (
                <div className="border-t divide-y">
                  {backlog.map(item => (
                    <BacklogItem key={item.id} item={item} onResolve={handleResolveBacklog} categoryMap={categoryMap} />
                  ))}
                </div>
              )}
            </div>
          )}
      </div>
    </PageShell>
  );
}

// ── Backlog item ────────────────────────────────────────────────────────────

function BacklogItem({ item, onResolve, categoryMap = {} }: {
  item: PulseBacklogItem;
  onResolve: (id: string) => void;
  categoryMap?: Record<string, PulseCategory>;
}) {
  return (
    <div className="px-4 py-3 bg-background">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full inline-block mb-1.5 border font-medium',
            categoryMap[item.module]?.color ?? MODULE_COLORS[item.module]
          )}>
            {categoryMap[item.module]?.name ?? KNOWLEDGE_MODULE_LABELS[item.module]}
          </span>
          <p className="text-sm font-medium leading-snug">{item.questionText}</p>
          <p className="text-xs text-muted-foreground mt-1">Del pulso del {item.pulseDate}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onResolve(item.id)}
          className="shrink-0 text-green-700 border-green-300 hover:bg-green-50 text-xs"
        >
          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Resuelto
        </Button>
      </div>
      {item.linkedVideoIds && item.linkedVideoIds.length > 0 && (
        <a href="/videos" className="text-xs text-primary flex items-center gap-1 mt-2.5 hover:underline">
          Ver videos relacionados <ChevronRight className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
