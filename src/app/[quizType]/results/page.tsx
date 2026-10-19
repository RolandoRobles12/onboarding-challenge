'use client'

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timer, Trophy, Zap, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { getAvatarComponent } from '@/lib/avatars';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { motion } from 'framer-motion';
import {
  useConfetti,
  LevelUpOverlay,
  AnimatedScore,
  ProgressRing,
} from '@/components/GamificationEffects';
import { cn } from '@/lib/utils';
import { getAttemptDetails, getQuiz, getQuizAttempt } from '@/lib/firestore-service';
import { getQuizLevel } from '@/lib/quiz-scoring';
import type { QuizQuestionResult } from '@/lib/types-scalable';

function getFeedbackMessage(percentage: number): string {
  if (percentage === 100) return '¡Perfecto! Demostraste un dominio absoluto del tema. ¡Eres un referente para tu equipo!';
  if (percentage >= 90) return '¡Increíble! Tu desempeño demuestra verdadero dominio. Estás listo para el siguiente nivel.';
  if (percentage >= 75) return '¡Excelente trabajo! Cada paso te acerca más a convertirte en un experto certificado.';
  if (percentage >= 60) return '¡Buen esfuerzo! Vas por buen camino. Repasa el material y lo dominarás completamente.';
  return '¡No te rindas! El aprendizaje es un proceso. Revisa el contenido y vuelve a intentarlo con más confianza.';
}

/** Solo rutas internas: `returnTo` viene en la URL. */
function safeReturnTo(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

interface ResultData {
  score: number;
  totalQuestions: number;
  timeTaken: number | null;
  xp: number;
  showFeedback: string;
  questionResults: QuizQuestionResult[];
  badges: string[];
  aiFeedback?: string;
}

/**
 * Pantalla de resultados de un desafío. No guarda nada: el quiz registra el
 * intento al terminar y aquí se lee por su id (recargar no lo duplica).
 */
function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { fire: fireConfetti } = useConfetti();

  const routeParams = useParams<{ quizType: string }>();
  const productId = routeParams.quizType || searchParams.get('quizType') || '';

  const quizTitle = searchParams.get('quizTitle') || 'Quiz';
  const avatarKey = searchParams.get('avatar');
  const quizId = searchParams.get('quizId') || '';
  const attemptId = searchParams.get('attemptId');
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  const [data, setData] = useState<ResultData | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [animationReady, setAnimationReady] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [quizPassingScore, setQuizPassingScore] = useState<number | null>(null);

  useEffect(() => {
    if (!productId || !user) return;
    let cancelled = false;

    (async () => {
      const quiz = quizId ? await getQuiz(quizId).catch(() => null) : null;
      const ps = quiz?.assessmentConfig?.passingScore;
      if (!cancelled) setQuizPassingScore(ps && ps > 0 ? ps : null);

      let result: ResultData | null = null;
      const attempt = attemptId ? await getQuizAttempt(attemptId).catch(() => null) : null;
      if (attempt && attempt.userId === user.uid) {
        const details = await getAttemptDetails(attempt.id).catch(() => null);
        result = {
          score: attempt.score,
          totalQuestions: attempt.maxScore,
          timeTaken: attempt.timeTaken ?? null,
          xp: attempt.xpEarned ?? 0,
          showFeedback: details?.showFeedback ?? attempt.showFeedback ?? 'after_attempt',
          questionResults: details?.questionResults ?? [],
          badges: attempt.badgesEarned ?? [],
          aiFeedback: attempt.aiFeedback,
        };
      }

      if (cancelled) return;
      if (!result) {
        router.replace('/');
        return;
      }
      setData(result);
      const pct = result.totalQuestions > 0 ? (result.score / result.totalQuestions) * 100 : 0;
      setTimeout(() => setAnimationReady(true), 300);
      setTimeout(() => setShowLevelUp(true), 800);
      setTimeout(() => fireConfetti({ intensity: pct >= 75 ? 'high' : 'medium' }), 1600);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, attemptId, quizId, user?.uid]);

  if (!data) return null;

  const { score, totalQuestions, questionResults, showFeedback } = data;
  const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
  const level = getQuizLevel(score, totalQuestions);
  const Avatar = getAvatarComponent(avatarKey);
  const displayXp = data.xp;
  const passed = quizPassingScore != null ? percentage >= quizPassingScore : null;

  const timeFormatted = data.timeTaken !== null
    ? `${Math.floor(data.timeTaken / 60)}m ${(data.timeTaken % 60).toString().padStart(2, '0')}s`
    : '—';

  const getLevelGradient = () => {
    if (percentage >= 90) return 'from-yellow-50 to-orange-50 border-yellow-200';
    if (percentage >= 75) return 'from-blue-50 to-purple-50 border-blue-200';
    if (percentage >= 60) return 'from-green-50 to-teal-50 border-green-200';
    return 'from-gray-50 to-gray-100 border-gray-200';
  };

  return (
    <>
      <LevelUpOverlay
        show={showLevelUp}
        levelName={level.name}
        percentage={percentage}
        onDismiss={() => setShowLevelUp(false)}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={animationReady ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <Card className={cn('text-center bg-gradient-to-b shadow-xl rounded-2xl border-2', getLevelGradient())}>
          <CardHeader className="pb-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.2 }}
              className="mx-auto h-28 w-28 flex items-center justify-center bg-white/70 rounded-full shadow-lg mb-2"
            >
              <Avatar className="h-24 w-24 text-primary" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <CardTitle className="text-3xl font-headline mt-2 text-accent">
                ¡Desafío Completado!
              </CardTitle>
              <CardDescription className="text-base mt-1">
                Has finalizado <strong>{quizTitle}</strong>
              </CardDescription>
            </motion.div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Score + Ring */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, type: 'spring' }}
              className="bg-white/60 backdrop-blur-sm p-6 rounded-2xl border border-white/80 shadow-sm grid grid-cols-3 gap-4 items-center"
            >
              <div className="text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Puntaje</p>
                <AnimatedScore value={score} total={totalQuestions} />
                <p className="text-xs text-muted-foreground mt-1">{score} de {totalQuestions} correctas</p>
              </div>

              <div className="flex justify-center">
                <ProgressRing percentage={percentage} />
              </div>

              <div className="text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Tiempo</p>
                <p className="text-3xl font-bold text-primary flex flex-col items-center gap-1">
                  <Timer className="h-6 w-6" />
                  <span className="font-mono text-2xl">{timeFormatted}</span>
                </p>
              </div>
            </motion.div>

            {/* Level */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex items-center justify-between bg-white/60 rounded-xl px-5 py-4 border border-white/80"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nivel alcanzado</p>
                  <p className="font-bold text-accent">{level.name}</p>
                  <p className="text-xs text-muted-foreground">{level.description}</p>
                </div>
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.0, type: 'spring', stiffness: 400 }}
                className="bg-yellow-400 text-yellow-900 rounded-full px-3 py-1.5 font-bold flex items-center gap-1"
              >
                <Zap className="h-4 w-4" />
                +{displayXp} XP
              </motion.div>
            </motion.div>

            {data.badges.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="rounded-xl px-5 py-3 border bg-yellow-50 border-yellow-200 text-yellow-800 text-sm font-semibold text-center"
              >
                🏅 ¡Ganaste {data.badges.length === 1 ? 'la insignia' : 'las insignias'} {data.badges.map(b => `«${b}»`).join(', ')}!
              </motion.div>
            )}

            {passed !== null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.85 }}
                className={cn(
                  'rounded-xl px-5 py-3 border text-sm font-semibold flex items-center justify-center gap-2',
                  passed
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700',
                )}
              >
                {passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {passed
                  ? `Aprobado · puntaje mínimo ${quizPassingScore}%`
                  : `No alcanzaste el puntaje mínimo (${quizPassingScore}%)`}
              </motion.div>
            )}

            {/* Feedback message */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="text-center p-5 border rounded-xl bg-white/60 border-white/80"
            >
              <blockquote className="text-lg italic text-foreground leading-relaxed">
                "{data.aiFeedback || getFeedbackMessage(percentage)}"
              </blockquote>
            </motion.div>

            {/* Per-question breakdown */}
            {showFeedback !== 'never' && questionResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0 }}
                className="text-left rounded-xl border border-white/80 bg-white/60 overflow-hidden"
              >
                <button
                  onClick={() => setShowDetail(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 font-semibold text-sm text-accent hover:bg-white/40 transition-colors"
                >
                  <span>Detalle de respuestas ({questionResults.filter(r => r.isCorrect).length}/{questionResults.length} correctas)</span>
                  {showDetail ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showDetail && (
                  <div className="divide-y divide-white/40 px-5 pb-3">
                    {questionResults.map((r, i) => (
                      <div key={i} className="py-3 flex gap-3 items-start">
                        {r.isCorrect
                          ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                          : <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
                        <div className="text-sm space-y-0.5">
                          <p className="font-medium text-foreground leading-snug">{r.text}</p>
                          {!r.isCorrect && r.correctAnswer && (
                            <p className="text-xs text-muted-foreground">
                              Correcta: <span className="font-semibold text-emerald-600">{r.correctAnswer}</span>
                            </p>
                          )}
                          {!r.isCorrect && r.userAnswer && (
                            <p className="text-xs text-muted-foreground">
                              Tu respuesta: <span className="text-destructive">{r.userAnswer}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
            >
              <Button asChild size="lg" className="w-full rounded-xl shadow-md font-semibold">
                <Link href={returnTo}>
                  Finalizar y volver al inicio
                </Link>
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}

export default function ResultsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Calculando resultados...</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Estamos procesando tu hazaña. ¡Un momento!</p>
          </CardContent>
        </Card>
      }>
        <ResultsContent />
      </Suspense>
    </ProtectedRoute>
  )
}
