'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  getDailyPulse,
  getPulseAttempt,
  startPulseAttempt,
  submitPulseAttempt,
  addToPulseBacklog,
  getUserPulseBacklog,
  resolvePulseBacklogItem,
} from '@/lib/firestore-service';
import type {
  DailyPulse,
  PulseAttempt,
  PulseAnswer,
  PulseBacklogItem,
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
import {
  Radio, CheckCircle, XCircle, Clock, ListTodo, Play, ChevronRight,
  Award, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function currentHour() {
  return new Date().getHours();
}

const MODULE_COLORS: Record<KnowledgeModule, string> = {
  banca_conversacional: 'bg-blue-500/10 text-blue-700 border-blue-200',
  pagos_renovacion: 'bg-green-500/10 text-green-700 border-green-200',
  solicitud_credito: 'bg-purple-500/10 text-purple-700 border-purple-200',
  herramientas: 'bg-orange-500/10 text-orange-700 border-orange-200',
  politicas_procesos: 'bg-red-500/10 text-red-700 border-red-200',
  incentivos: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
};

// ── Component ──────────────────────────────────────────────────────────────

export default function PulsePage() {
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState<DailyPulse | null>(null);
  const [attempt, setAttempt] = useState<PulseAttempt | null>(null);
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
  const hour = currentHour();
  const windowOpen = hour >= 0 && hour < 12;

  // ── Load data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [pulseData, attemptData, backlogData] = await Promise.all([
        getDailyPulse(today),
        getPulseAttempt(profile.uid, today),
        getUserPulseBacklog(profile.uid),
      ]);

      setPulse(pulseData);
      setAttempt(attemptData);
      setBacklog(backlogData);

      if (pulseData && pulseData.questionIds.length > 0) {
        const qs: Question[] = [];
        for (const qId of pulseData.questionIds) {
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
      await startPulseAttempt(profile.uid, profile.nombre, today, seg);
      const newAttempt = await getPulseAttempt(profile.uid, today);
      setAttempt(newAttempt);
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
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col">
          <div className="max-w-lg mx-auto w-full px-4 pt-12 space-y-4">
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-6 w-32 mx-auto" />
            <Skeleton className="h-64 rounded-2xl mt-6" />
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // ── Render: active quiz ────────────────────────────────────────────────

  if (quizActive && currentQuestion) {
    const isLast = currentIndex >= questions.length - 1;

    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col">
          <div className="max-w-lg mx-auto w-full px-4 pt-8 pb-12 flex flex-col gap-5">
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
              <CardContent className="p-6 space-y-5">
                {/* Module badge */}
                {currentQuestion.module && (
                  <span className={cn(
                    'text-xs px-2.5 py-1 rounded-full inline-block border font-medium',
                    MODULE_COLORS[currentQuestion.module]
                  )}>
                    {KNOWLEDGE_MODULE_LABELS[currentQuestion.module]}
                  </span>
                )}

                {/* Question text */}
                <h2 className="text-lg font-semibold leading-snug">{currentQuestion.text}</h2>

                {/* Options */}
                <div className="space-y-2.5">
                  {currentQuestion.options.map(opt => {
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
                        <span className="font-medium text-sm leading-snug">{opt.text}</span>
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
                className="w-full h-12 rounded-xl font-semibold text-base"
                onClick={handleConfirm}
                disabled={!selectedOption}
              >
                Confirmar respuesta
              </Button>
            ) : (
              <Button
                className="w-full h-12 rounded-xl font-semibold text-base"
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
        </div>
      </ProtectedRoute>
    );
  }

  // ── Render: results ────────────────────────────────────────────────────

  if (attempt?.status === 'completed' && !quizActive) {
    const correct = attempt.correctAnswers;
    const total = attempt.totalQuestions;
    const pct = attempt.percentage;
    const passed = pct >= 70;

    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col">
          <div className="max-w-lg mx-auto w-full px-4 pt-10 pb-12 space-y-4">
            {/* Score card */}
            <Card className="rounded-2xl shadow-sm border-0 overflow-hidden">
              <div className={cn('py-8 px-6 text-center', passed ? 'bg-green-500/8' : 'bg-orange-500/8')}>
                <div className={cn(
                  'w-24 h-24 rounded-full flex items-center justify-center mx-auto text-3xl font-extrabold border-4',
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
              <CardContent className="py-4 space-y-2">
                {attempt.answers.map((ans, idx) => {
                  const q = questions.find(q => q.id === ans.questionId);
                  return (
                    <div key={ans.questionId} className="flex items-start gap-2.5 py-1.5 border-b last:border-0">
                      {ans.isCorrect
                        ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                      }
                      <p className="text-sm text-muted-foreground leading-snug">{q?.text ?? `Pregunta ${idx + 1}`}</p>
                    </div>
                  );
                })}
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
                      <BacklogItem key={item.id} item={item} onResolve={handleResolveBacklog} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // ── Render: main (idle) ────────────────────────────────────────────────

  const moduleBreakdown = questions.reduce<Record<string, number>>((acc, q) => {
    const mod = q.module ?? 'otro';
    acc[mod] = (acc[mod] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col">
        <div className="max-w-lg mx-auto w-full px-4 pt-10 pb-12 space-y-4">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2 text-primary font-bold text-xl">
              <Radio className="h-5 w-5" /> Pulso de Conocimiento
            </div>
            <p className="text-sm text-muted-foreground capitalize">
              {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>

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
          ) : (
            <Card className="rounded-2xl shadow-sm border-0">
              <CardContent className="p-6 space-y-5">
                {/* Modules */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(moduleBreakdown).map(([mod, count]) => (
                    <span
                      key={mod}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1',
                        MODULE_COLORS[mod as KnowledgeModule] ?? 'bg-muted text-muted-foreground border-border'
                      )}
                    >
                      {KNOWLEDGE_MODULE_LABELS[mod as KnowledgeModule] ?? mod}
                      <span className="opacity-60">·{count}</span>
                    </span>
                  ))}
                </div>

                <div className="space-y-1">
                  <p className="font-bold text-2xl">7 preguntas de hoy</p>
                  {!windowOpen && (
                    <p className="text-xs text-orange-600 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Responde antes de las 12:00 PM
                    </p>
                  )}
                </div>

                <Button
                  className="w-full h-12 rounded-xl font-semibold text-base"
                  size="lg"
                  onClick={handleStart}
                  disabled={submitting}
                >
                  <Play className="h-5 w-5 mr-2" />
                  {submitting ? 'Iniciando...' : 'Iniciar Pulso de Hoy'}
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
                    <BacklogItem key={item.id} item={item} onResolve={handleResolveBacklog} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// ── Backlog item ────────────────────────────────────────────────────────────

function BacklogItem({ item, onResolve }: { item: PulseBacklogItem; onResolve: (id: string) => void }) {
  return (
    <div className="px-4 py-3 bg-background">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full inline-block mb-1.5 border font-medium',
            MODULE_COLORS[item.module]
          )}>
            {KNOWLEDGE_MODULE_LABELS[item.module]}
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
