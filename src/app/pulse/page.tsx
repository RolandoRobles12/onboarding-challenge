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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import ProtectedRoute from '@/components/ProtectedRoute';
import { toast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { getDoc, doc, collection, getDocs, query, where } from 'firebase/firestore';
import {
  Radio, CheckCircle, XCircle, Clock, ListTodo, Play, ChevronRight, Award, AlertCircle,
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
  banca_conversacional: 'bg-blue-500/10 text-blue-700',
  pagos_renovacion: 'bg-green-500/10 text-green-700',
  solicitud_credito: 'bg-purple-500/10 text-purple-700',
  herramientas: 'bg-orange-500/10 text-orange-700',
  politicas_procesos: 'bg-red-500/10 text-red-700',
  incentivos: 'bg-yellow-500/10 text-yellow-700',
};

// ── Component ──────────────────────────────────────────────────────────────

export default function PulsePage() {
  const { profile } = useAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState<DailyPulse | null>(null);
  const [attempt, setAttempt] = useState<PulseAttempt | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [backlog, setBacklog] = useState<PulseBacklogItem[]>([]);

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
  const windowOpen = hour >= 0 && hour < 12; // 12:00 PM deadline — uses sendAt from config ideally

  // ── Load data ─────────────────────────────────────────────────────────

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
        // Fetch question documents
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

  // ── Quiz flow ─────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!profile || !pulse) return;
    setSubmitting(true);
    try {
      // Build segmentation from onboardingData
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
      // Submit
      setSubmitting(true);
      try {
        const allAnswers = answers; // already includes current answer from handleConfirm
        await submitPulseAttempt(profile!.uid, today, allAnswers);

        // Add incorrect questions to backlog (MVP2)
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

  // ── Render: loading ───────────────────────────────────────────────────

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      </ProtectedRoute>
    );
  }

  // ── Render: active quiz ───────────────────────────────────────────────

  if (quizActive && currentQuestion) {
    const isLast = currentIndex >= questions.length - 1;
    const correctOption = currentQuestion.options.find(o => o.isCorrect);

    return (
      <ProtectedRoute>
        <div className="max-w-lg mx-auto px-4 py-6">
          {/* Progress */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm font-medium text-muted-foreground">{currentIndex + 1} / {questions.length}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Module tag */}
          {currentQuestion.module && (
            <span className={cn('text-xs px-2 py-1 rounded-full mb-3 inline-block', MODULE_COLORS[currentQuestion.module])}>
              {KNOWLEDGE_MODULE_LABELS[currentQuestion.module]}
            </span>
          )}

          {/* Question */}
          <h2 className="text-xl font-semibold mb-6 leading-snug">{currentQuestion.text}</h2>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {currentQuestion.options.map(opt => {
              const isSelected = selectedOption === opt.id;
              const isCorrect = opt.isCorrect;
              let stateClass = 'border-muted hover:border-primary/40';
              if (revealed) {
                if (isCorrect) stateClass = 'border-green-500 bg-green-500/10 text-green-700';
                else if (isSelected && !isCorrect) stateClass = 'border-red-500 bg-red-500/10 text-red-600';
                else stateClass = 'border-muted opacity-60';
              } else if (isSelected) {
                stateClass = 'border-primary bg-primary/5';
              }
              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  disabled={revealed}
                  className={cn(
                    'w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3',
                    stateClass
                  )}
                >
                  {revealed && isCorrect && <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />}
                  {revealed && isSelected && !isCorrect && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
                  {!revealed && <div className={cn('h-5 w-5 rounded-full border-2 shrink-0', isSelected ? 'border-primary bg-primary' : 'border-muted-foreground')} />}
                  <span className="font-medium">{opt.text}</span>
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {revealed && currentQuestion.explanation && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm mb-6">
              <p className="font-semibold mb-1">Explicación</p>
              <p>{currentQuestion.explanation}</p>
            </div>
          )}

          {/* Action buttons */}
          {!revealed ? (
            <Button className="w-full" onClick={handleConfirm} disabled={!selectedOption}>
              Confirmar respuesta
            </Button>
          ) : (
            <Button className="w-full" onClick={handleNext} disabled={submitting}>
              {submitting ? 'Guardando...' : isLast ? 'Ver resultados' : <>Siguiente <ChevronRight className="h-4 w-4 ml-1" /></>}
            </Button>
          )}
        </div>
      </ProtectedRoute>
    );
  }

  // ── Render: results ───────────────────────────────────────────────────

  if (attempt?.status === 'completed') {
    const correct = attempt.correctAnswers;
    const total = attempt.totalQuestions;
    const pct = attempt.percentage;

    return (
      <ProtectedRoute>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
          <div className="text-center space-y-2">
            <div className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center mx-auto text-3xl font-bold',
              pct >= 70 ? 'bg-green-500/10 text-green-600' : 'bg-orange-500/10 text-orange-600'
            )}>
              {pct}%
            </div>
            <h1 className="text-2xl font-bold">
              {pct >= 70 ? '¡Buen trabajo!' : 'Sigue practicando'}
            </h1>
            <p className="text-muted-foreground">
              Respondiste {correct} de {total} preguntas correctamente.
            </p>
          </div>

          {/* Per-question breakdown */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              {attempt.answers.map((ans, idx) => {
                const q = questions.find(q => q.id === ans.questionId);
                return (
                  <div key={ans.questionId} className="flex items-start gap-3">
                    {ans.isCorrect
                      ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      : <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    }
                    <p className="text-sm">{q?.text ?? `Pregunta ${idx + 1}`}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Backlog indicator */}
          {backlog.length > 0 && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-orange-700 flex items-center gap-2">
                  <ListTodo className="h-4 w-4" />
                  Tienes {backlog.length} pregunta{backlog.length > 1 ? 's' : ''} en tu backlog de repaso.
                </p>
                <p className="text-xs text-orange-600 mt-1">Ve a la pestaña Backlog para repasar con videos.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </ProtectedRoute>
    );
  }

  // ── Render: main dashboard ────────────────────────────────────────────

  return (
    <ProtectedRoute>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-24">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary" /> Pulso de Conocimiento
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Hoy, {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        <Tabs defaultValue="pulse">
          <TabsList className="w-full">
            <TabsTrigger value="pulse" className="flex-1">
              <Radio className="h-4 w-4 mr-1.5" /> Pulso de Hoy
            </TabsTrigger>
            <TabsTrigger value="backlog" className="flex-1">
              <ListTodo className="h-4 w-4 mr-1.5" /> Backlog
              {backlog.length > 0 && (
                <span className="ml-1.5 bg-orange-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                  {backlog.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── PULSE TAB ─────────────────────────────────────────────── */}
          <TabsContent value="pulse" className="mt-4 space-y-4">
            {!pulse ? (
              /* No pulse today */
              <Card>
                <CardContent className="py-10 text-center space-y-3">
                  <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="font-medium">Sin pulso programado hoy</p>
                  <p className="text-sm text-muted-foreground">Vuelve mañana o contacta a tu líder de equipo.</p>
                </CardContent>
              </Card>
            ) : pulse.status === 'closed' && !attempt ? (
              /* Window closed */
              <Card>
                <CardContent className="py-10 text-center space-y-3">
                  <Clock className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="font-medium">Ventana de respuesta cerrada</p>
                  <p className="text-sm text-muted-foreground">El pulso de hoy ya cerró. Vuelve mañana.</p>
                </CardContent>
              </Card>
            ) : attempt?.status === 'completed' ? (
              /* Already done */
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="py-8 text-center space-y-3">
                  <Award className="h-10 w-10 mx-auto text-green-600" />
                  <p className="font-semibold text-green-700">¡Ya respondiste el pulso de hoy!</p>
                  <p className="text-sm text-green-600">
                    {attempt.correctAnswers}/{attempt.totalQuestions} correctas · {attempt.percentage}%
                  </p>
                </CardContent>
              </Card>
            ) : (
              /* Ready to start */
              <Card>
                <CardHeader>
                  <CardTitle>7 Preguntas · Hoy</CardTitle>
                  {!windowOpen && (
                    <p className="text-xs text-orange-600 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Recuerda responder antes de las 12:00 PM
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Module distribution preview */}
                  <div className="space-y-1">
                    {questions.reduce<Record<string, number>>((acc, q) => {
                      const mod = q.module ?? 'otro';
                      acc[mod] = (acc[mod] ?? 0) + 1;
                      return acc;
                    }, {}) && Object.entries(
                      questions.reduce<Record<string, number>>((acc, q) => {
                        const mod = q.module ?? 'otro';
                        acc[mod] = (acc[mod] ?? 0) + 1;
                        return acc;
                      }, {})
                    ).map(([mod, count]) => (
                      <div key={mod} className="flex items-center justify-between text-sm">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full', MODULE_COLORS[mod as KnowledgeModule] ?? 'bg-muted text-muted-foreground')}>
                          {KNOWLEDGE_MODULE_LABELS[mod as KnowledgeModule] ?? mod}
                        </span>
                        <span className="text-muted-foreground text-xs">{count} px</span>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full" size="lg" onClick={handleStart} disabled={submitting}>
                    <Play className="h-5 w-5 mr-2" />
                    {submitting ? 'Iniciando...' : 'Iniciar Pulso de Hoy'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── BACKLOG TAB ────────────────────────────────────────────── */}
          <TabsContent value="backlog" className="mt-4 space-y-4">
            {backlog.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center space-y-3">
                  <CheckCircle className="h-10 w-10 mx-auto text-green-500" />
                  <p className="font-medium">Sin pendientes</p>
                  <p className="text-sm text-muted-foreground">Tu backlog está vacío. ¡Sigue así!</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Repasa los temas en los videos relacionados y luego marca cada pregunta como resuelta.
                </p>
                <div className="space-y-3">
                  {backlog.map(item => (
                    <Card key={item.id} className="border-orange-100">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full inline-block mb-1', MODULE_COLORS[item.module])}>
                              {KNOWLEDGE_MODULE_LABELS[item.module]}
                            </span>
                            <p className="text-sm font-medium">{item.questionText}</p>
                            <p className="text-xs text-muted-foreground mt-1">Del pulso del {item.pulseDate}</p>
                          </div>
                          <Button
                            variant="outline" size="sm"
                            onClick={() => handleResolveBacklog(item.id)}
                            className="shrink-0 text-green-700 border-green-300 hover:bg-green-50"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" /> Resuelto
                          </Button>
                        </div>
                        {item.linkedVideoIds && item.linkedVideoIds.length > 0 && (
                          <a href="/videos" className="text-xs text-primary flex items-center gap-1 mt-3 hover:underline">
                            Ver videos relacionados <ChevronRight className="h-3 w-3" />
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
