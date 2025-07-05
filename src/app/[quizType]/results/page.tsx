'use client'

import { Suspense, useEffect, useState } from 'react';
import { notFound, useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MessageSquareQuote, Download, Timer } from 'lucide-react';
import Link from 'next/link';
import { generateMotivationalFeedback, MotivationalFeedbackOutput } from '@/ai/flows/motivational-feedback';
import { getAvatarComponent, defaultAvatar } from '@/lib/avatars';
import ProtectedRoute from '@/components/ProtectedRoute';
import { quizzes } from '@/lib/questions';
import { addLeaderboardEntry } from '@/lib/leaderboard';

type Props = {
  searchParams: { [key: string]: string | string[] | undefined };
};

function getLevel(score: number, total: number): { name: string; description: string } {
  const percentage = (score / total) * 100;
  if (percentage >= 90) return { name: 'Maestro Aviva', description: '¡Dominas el conocimiento a la perfección!' };
  if (percentage >= 75) return { name: 'Promotor en Ascenso', description: '¡Excelente trabajo! Estás muy bien preparado.' };
  if (percentage >= 60) return { name: 'Aprendiz Prometedor', description: '¡Buen esfuerzo! Sigue repasando y serás un experto.' };
  return { name: 'Explorador Novato', description: 'Has completado el primer paso. ¡El conocimiento es tu próxima conquista!' };
}

function ResultsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const quizType = searchParams.get('quizType');
    const fullName = searchParams.get('fullName');
    const scoreStr = searchParams.get('score');
    const totalQuestionsStr = searchParams.get('totalQuestions');
    const avatarKey = searchParams.get('avatar');
    const startTimeStr = searchParams.get('startTime');
    
    const quiz = quizzes[quizType || ''];

    const [feedback, setFeedback] = useState<MotivationalFeedbackOutput | null>(null);
    const [loadingFeedback, setLoadingFeedback] = useState(true);
    const [timeTaken, setTimeTaken] = useState<number | null>(null);

    useEffect(() => {
        if (!quizType || !fullName || !scoreStr || !totalQuestionsStr || !quiz) {
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
                score,
                totalQuestions,
                time: durationInSeconds,
                quizType: quizType as 'ba' | 'atn',
                avatar: avatarKey || defaultAvatar,
            }).catch(error => {
                console.error("Failed to save to leaderboard", error);
            });
        }


        async function getFeedback() {
            try {
                const aiFeedback = await generateMotivationalFeedback({
                    quizTopic: quiz.title,
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
    }, [quizType, fullName, scoreStr, totalQuestionsStr, router, quiz, avatarKey, startTimeStr]);

    if (!quizType || !fullName || !scoreStr || !totalQuestionsStr || !quiz) {
        return null;
    }

    const score = parseInt(scoreStr, 10);
    const totalQuestions = parseInt(totalQuestionsStr, 10);
    const level = getLevel(score, totalQuestions);
    const Avatar = getAvatarComponent(avatarKey);

    const timeFormatted = timeTaken !== null 
        ? `${Math.floor(timeTaken / 60)}m ${ (timeTaken % 60).toString().padStart(2, '0')}s` 
        : '...';

  return (
    <Card className="text-center animate-fade-in bg-card shadow-lg rounded-lg border-accent/20">
      <CardHeader>
        <div className="mx-auto h-24 w-24 flex items-center justify-center bg-primary/10 rounded-full">
            <Avatar className="h-20 w-20 text-primary" />
        </div>
        <CardTitle className="text-3xl font-headline mt-4 text-accent">¡Misión Cumplida, {fullName}!</CardTitle>
        <CardDescription>Has completado tu entrenamiento en Desafío Aviva.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted p-4 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
            <div className="p-2">
                <p className="text-sm font-semibold text-muted-foreground">Puntaje Final</p>
                <p className="text-5xl font-bold text-primary">
                    {score}<span className="text-3xl text-muted-foreground">/{totalQuestions}</span>
                </p>
            </div>
            <div className="p-2">
                <p className="text-sm font-semibold text-muted-foreground">Tiempo Total</p>
                <p className="text-5xl font-bold text-primary flex items-center justify-center gap-2">
                    <Timer className="h-8 w-8" />
                    {timeFormatted}
                </p>
            </div>
        </div>

        <div className="text-center">
          <Star className="mx-auto h-8 w-8 text-yellow-400" />
          <h3 className="text-xl font-semibold mt-2">{level.name}</h3>
          <p className="text-muted-foreground">{level.description}</p>
        </div>

        <div className="text-center p-4 border rounded-lg bg-card">
          <MessageSquareQuote className="mx-auto h-8 w-8 text-accent" />
          {loadingFeedback ? (
            <p>Generando mensaje de motivación...</p>
          ) : (
            <blockquote className="mt-2 text-lg italic">
              "{feedback?.message}"
            </blockquote>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg" className="w-full rounded-lg">
            <Link href="/">Finalizar y volver al inicio</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full rounded-lg">
                <Link href={`/${quizType}/certificate?${searchParams.toString()}`}>
                    <Download className="mr-2 h-4 w-4" />
                    Ver Certificado
                </Link>
            </Button>
        </div>
      </CardContent>
    </Card>
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
