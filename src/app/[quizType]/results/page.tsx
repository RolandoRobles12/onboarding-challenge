'use client'

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MessageSquareQuote, Download, Timer, Trophy, Zap, Award } from 'lucide-react';
import Link from 'next/link';
import { generateMotivationalFeedback, MotivationalFeedbackOutput } from '@/ai/flows/motivational-feedback';
import { getAvatarComponent, defaultAvatar } from '@/lib/avatars';
import ProtectedRoute from '@/components/ProtectedRoute';
import { addLeaderboardEntry } from '@/lib/leaderboard';
import { motion } from 'framer-motion';
import {
  useConfetti,
  LevelUpOverlay,
  BadgeNotifications,
  AnimatedScore,
  ProgressRing,
} from '@/components/GamificationEffects';
import { cn } from '@/lib/utils';

function getLevel(score: number, total: number): { name: string; description: string } {
  const percentage = (score / total) * 100;
  if (percentage >= 90) return { name: 'Maestro Aviva', description: '¡Dominas el conocimiento a la perfección!' };
  if (percentage >= 75) return { name: 'Promotor en Ascenso', description: '¡Excelente trabajo! Estás muy bien preparado.' };
  if (percentage >= 60) return { name: 'Aprendiz Prometedor', description: '¡Buen esfuerzo! Sigue repasando y serás un experto.' };
  return { name: 'Explorador Novato', description: 'Has completado el primer paso. ¡El conocimiento es tu próxima conquista!' };
}

function getBadges(score: number, total: number, timeTaken: number | null): Array<{ name: string; icon: string; xp: number }> {
  const percentage = (score / total) * 100;
  const badges = [];

  if (percentage === 100) badges.push({ name: '¡Perfeccionista!', icon: 'star', xp: 100 });
  else if (percentage >= 90) badges.push({ name: 'Maestro Aviva', icon: 'trophy', xp: 80 });
  else if (percentage >= 75) badges.push({ name: 'Promotor en Ascenso', icon: 'award', xp: 60 });

  if (timeTaken !== null && timeTaken < 900) {
    badges.push({ name: '¡Velocista!', icon: 'zap', xp: 75 });
  }

  badges.push({ name: 'Primera Misión', icon: 'shield', xp: 50 });

  return badges;
}

function ResultsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { fire: fireConfetti } = useConfetti();

    const quizType = searchParams.get('quizType');
    const fullName = searchParams.get('fullName') || searchParams.get('nombre') || 'Participante';
    const quizTitle = searchParams.get('quizTitle') || 'Quiz';
    const scoreStr = searchParams.get('score');
    const totalQuestionsStr = searchParams.get('totalQuestions');
    const avatarKey = searchParams.get('avatar');
    const startTimeStr = searchParams.get('startTime');
    const assignedKiosk = searchParams.get('assignedKiosk') || searchParams.get('kiosco_asignado') || 'N/A';

    const [feedback, setFeedback] = useState<MotivationalFeedbackOutput | null>(null);
    const [loadingFeedback, setLoadingFeedback] = useState(true);
    const [timeTaken, setTimeTaken] = useState<number | null>(null);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [showBadges, setShowBadges] = useState(false);
    const [animationReady, setAnimationReady] = useState(false);

    useEffect(() => {
        if (!quizType || !scoreStr || !totalQuestionsStr) {
            router.push('/');
            return;
        }

        const score = parseInt(scoreStr, 10);
        const totalQuestions = parseInt(totalQuestionsStr, 10);

        if (startTimeStr) {
            const startTime = parseInt(startTimeStr, 10);
            const durationInSeconds = Math.round((Date.now() - startTime) / 1000);
            setTimeTaken(durationInSeconds);

            addLeaderboardEntry({
                fullName,
                assignedKiosk,
                score,
                totalQuestions,
                time: durationInSeconds,
                quizType,
                avatar: avatarKey || defaultAvatar,
            }).catch(error => {
                console.error("Failed to save to leaderboard", error);
            });
        }

        // Staggered animation sequence
        setTimeout(() => setAnimationReady(true), 300);
        setTimeout(() => setShowLevelUp(true), 800);
        setTimeout(() => {
            const percentage = (score / totalQuestions) * 100;
            fireConfetti({ intensity: percentage >= 75 ? 'high' : 'medium' });
        }, 1600);

        setTimeout(() => setShowBadges(true), 2200);

        async function getFeedback() {
            try {
                const aiFeedback = await generateMotivationalFeedback({
                    quizTopic: quizTitle,
                    score: score,
                });
                setFeedback(aiFeedback);
            } catch (error) {
                console.error("Failed to get AI feedback", error);
                setFeedback({ message: "¡Gran esfuerzo! Sigue así y alcanzarás la maestría." });
            } finally {
                setLoadingFeedback(false);
            }
        }
        getFeedback();
    }, [quizType, fullName, quizTitle, scoreStr, totalQuestionsStr, router, avatarKey, startTimeStr, assignedKiosk]);

    if (!quizType || !scoreStr || !totalQuestionsStr) {
        return null;
    }

    const score = parseInt(scoreStr, 10);
    const totalQuestions = parseInt(totalQuestionsStr, 10);
    const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
    const level = getLevel(score, totalQuestions);
    const Avatar = getAvatarComponent(avatarKey);
    const badges = getBadges(score, totalQuestions, timeTaken);
    const totalXP = badges.reduce((sum, b) => sum + b.xp, 0);

    const timeFormatted = timeTaken !== null
        ? `${Math.floor(timeTaken / 60)}m ${(timeTaken % 60).toString().padStart(2, '0')}s`
        : '...';

    const getLevelGradient = () => {
        if (percentage >= 90) return 'from-yellow-50 to-orange-50 border-yellow-200';
        if (percentage >= 75) return 'from-blue-50 to-purple-50 border-blue-200';
        if (percentage >= 60) return 'from-green-50 to-teal-50 border-green-200';
        return 'from-gray-50 to-gray-100 border-gray-200';
    };

    return (
        <>
            {/* Level Up Overlay */}
            <LevelUpOverlay
                show={showLevelUp}
                levelName={level.name}
                percentage={percentage}
                onDismiss={() => setShowLevelUp(false)}
            />

            {/* Badge notifications */}
            <BadgeNotifications badges={badges} show={showBadges} />

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
                                ¡Misión Cumplida, {fullName}!
                            </CardTitle>
                            <CardDescription className="text-base mt-1">
                                Has completado tu entrenamiento en <strong>{quiz.title}</strong>
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

                        {/* Level + XP */}
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
                            <div className="text-center">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ delay: 1.2, type: 'spring', stiffness: 400 }}
                                    className="bg-yellow-400 text-yellow-900 rounded-full px-3 py-1.5 font-bold flex items-center gap-1"
                                >
                                    <Zap className="h-4 w-4" />
                                    +{totalXP} XP
                                </motion.div>
                            </div>
                        </motion.div>

                        {/* Badges earned */}
                        {badges.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.9 }}
                                className="text-left"
                            >
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                                    <Award className="h-3.5 w-3.5" /> Insignias obtenidas
                                </p>
                                <div className="flex gap-2 flex-wrap">
                                    {badges.map((badge, i) => (
                                        <motion.span
                                            key={badge.name}
                                            initial={{ opacity: 0, scale: 0 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 1.0 + i * 0.1, type: 'spring' }}
                                            className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-1 rounded-full border border-yellow-200 flex items-center gap-1"
                                        >
                                            <Star className="h-3 w-3" /> {badge.name} (+{badge.xp} XP)
                                        </motion.span>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* AI Feedback */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.1 }}
                            className="text-center p-5 border rounded-xl bg-white/60 border-white/80"
                        >
                            <MessageSquareQuote className="mx-auto h-8 w-8 text-accent mb-2" />
                            {loadingFeedback ? (
                                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            ) : (
                                <blockquote className="text-lg italic text-foreground leading-relaxed">
                                    "{feedback?.message}"
                                </blockquote>
                            )}
                        </motion.div>

                        {/* Actions */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 1.3 }}
                            className="flex flex-col sm:flex-row gap-3"
                        >
                            <Button asChild size="lg" className="w-full rounded-xl shadow-md font-semibold">
                                <Link href="/">Finalizar y volver al inicio</Link>
                            </Button>
                            <Button asChild size="lg" variant="outline" className="w-full rounded-xl">
                                <Link href={`/${quizType}/certificate?${searchParams.toString()}`}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Ver Certificado
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
