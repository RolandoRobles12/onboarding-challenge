'use client'

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Timer, Trophy, Zap } from 'lucide-react';
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
import {
  markJourneyStepComplete,
  getJourneyByProduct,
  createQuizAttempt,
} from '@/lib/firestore-service';
import { Timestamp } from 'firebase/firestore';

function getLevel(score: number, total: number): { name: string; description: string } {
  const percentage = total > 0 ? (score / total) * 100 : 0;
  if (percentage >= 90) return { name: 'Maestro Aviva', description: '¡Dominas el conocimiento a la perfección!' };
  if (percentage >= 75) return { name: 'Promotor en Ascenso', description: '¡Excelente trabajo! Estás muy bien preparado.' };
  if (percentage >= 60) return { name: 'Aprendiz Prometedor', description: '¡Buen esfuerzo! Sigue repasando y serás un experto.' };
  return { name: 'Explorador Novato', description: 'Has completado el primer paso. ¡El conocimiento es tu próxima conquista!' };
}

function getFeedbackMessage(percentage: number): string {
  if (percentage === 100) return '¡Perfecto! Demostraste un dominio absoluto del tema. ¡Eres un referente para tu equipo!';
  if (percentage >= 90) return '¡Increíble! Tu desempeño demuestra verdadero dominio. Estás listo para el siguiente nivel.';
  if (percentage >= 75) return '¡Excelente trabajo! Cada paso te acerca más a convertirte en un experto certificado.';
  if (percentage >= 60) return '¡Buen esfuerzo! Vas por buen camino. Repasa el material y lo dominarás completamente.';
  return '¡No te rindas! El aprendizaje es un proceso. Revisa el contenido y vuelve a intentarlo con más confianza.';
}

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { fire: fireConfetti } = useConfetti();
  const savedRef = useRef(false);

  const routeParams = useParams<{ quizType: string }>();
  const productId = routeParams.quizType || searchParams.get('quizType') || '';

  const quizTitle = searchParams.get('quizTitle') || 'Quiz';
  const scoreStr = searchParams.get('score');
  const totalQuestionsStr = searchParams.get('totalQuestions');
  const avatarKey = searchParams.get('avatar');
  const startTimeStr = searchParams.get('startTime');
  const quizId = searchParams.get('quizId') || '';

  const [showLevelUp, setShowLevelUp] = useState(false);
  const [animationReady, setAnimationReady] = useState(false);
  const [timeTaken, setTimeTaken] = useState<number | null>(null);

  useEffect(() => {
    if (!productId || !scoreStr || !totalQuestionsStr) {
      router.push('/');
      return;
    }

    const score = parseInt(scoreStr, 10);
    const totalQuestions = parseInt(totalQuestionsStr, 10);
    const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
    const level = getLevel(score, totalQuestions);

    let duration = 0;
    if (startTimeStr) {
      duration = Math.round((Date.now() - parseInt(startTimeStr, 10)) / 1000);
      setTimeTaken(duration);
    }

    // Animations
    setTimeout(() => setAnimationReady(true), 300);
    setTimeout(() => setShowLevelUp(true), 800);
    setTimeout(() => {
      fireConfetti({ intensity: percentage >= 75 ? 'high' : 'medium' });
    }, 1600);

    // Save attempt + mark journey steps — runs only once
    if (!savedRef.current && user?.uid) {
      savedRef.current = true;

      const userId = user.uid;

      (async () => {
        try {
          // 1. Save quiz attempt to Firestore
          if (quizId) {
            await createQuizAttempt({
              organizationId: 'default',
              userId,
              quizId,
              productId,
              startedAt: startTimeStr
                ? Timestamp.fromMillis(parseInt(startTimeStr, 10))
                : Timestamp.now(),
              completedAt: Timestamp.now(),
              status: 'completed',
              score,
              maxScore: totalQuestions,
              percentage,
              timeTaken: duration,
              livesRemaining: parseInt(searchParams.get('bonusLives') || '0', 10),
              missionResults: [],
              answers: [],
              levelAchieved: level.name,
              badgesEarned: [],
              xpEarned: Math.round(percentage),
            });
          }

          // 2. Mark quiz/challenge step and results step complete in the journey
          const journey = await getJourneyByProduct(productId).catch(() => null);
          if (!journey) return;

          const allSteps = journey.stages?.length
            ? journey.stages.flatMap(s => s.actions ?? [])
            : journey.steps ?? [];

          const markPromises: Promise<void>[] = [];
          allSteps.forEach(step => {
            if (step.type === 'quiz' || step.type === 'challenge' || step.type === 'results') {
              markPromises.push(
                markJourneyStepComplete(userId, journey.id, productId, step.id).catch(console.error)
              );
            }
          });
          await Promise.all(markPromises);
        } catch (err) {
          console.error('Error saving results:', err);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, scoreStr, totalQuestionsStr, user?.uid]);

  if (!productId || !scoreStr || !totalQuestionsStr) return null;

  const score = parseInt(scoreStr, 10);
  const totalQuestions = parseInt(totalQuestionsStr, 10);
  const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
  const level = getLevel(score, totalQuestions);
  const Avatar = getAvatarComponent(avatarKey);

  const timeFormatted = timeTaken !== null
    ? `${Math.floor(timeTaken / 60)}m ${(timeTaken % 60).toString().padStart(2, '0')}s`
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
                +{Math.round(percentage)} XP
              </motion.div>
            </motion.div>

            {/* Feedback message */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="text-center p-5 border rounded-xl bg-white/60 border-white/80"
            >
              <blockquote className="text-lg italic text-foreground leading-relaxed">
                "{getFeedbackMessage(percentage)}"
              </blockquote>
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
            >
              <Button asChild size="lg" className="w-full rounded-xl shadow-md font-semibold">
                <Link href="/">Finalizar y volver al inicio</Link>
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
