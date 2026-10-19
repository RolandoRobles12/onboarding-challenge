'use client';

import { useState, useEffect, useMemo, Suspense, useRef } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FloatingParticles, StreakCounter, MissionCompleteBanner } from '@/components/GamificationEffects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, ArrowRight, BookOpen, ShieldAlert, Heart, Check, Music, VolumeX, Timer } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAvatarComponent } from '@/lib/avatars';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { authFetch } from '@/lib/api-client';
import type { AnswerReveal, PlayOption, PlayQuestion, QuizAnswerResult, QuizSessionStart } from '@/lib/play-types';

type RuntimeQuiz = Pick<QuizSessionStart, 'title' | 'missions'>;

function QuizComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const finishingRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  // Petición en curso que debe terminar antes de mandar la siguiente (p. ej. reiniciar misión).
  const pendingRef = useRef<Promise<unknown>>(Promise.resolve());
  const [checking, setChecking] = useState(false);

  // Sesión del desafío: las preguntas llegan sin la respuesta y cada una se
  // califica en el servidor (/api/quiz/answer).
  const [session, setSession] = useState<QuizSessionStart | null>(null);
  const [quiz, setQuiz] = useState<RuntimeQuiz | null>(null);
  const [reveals, setReveals] = useState<Record<string, AnswerReveal>>({});
  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [quizNotAvailable, setQuizNotAvailable] = useState(false);
  const [attemptsExhausted, setAttemptsExhausted] = useState<{ count: number; limit: number } | null>(null);
  const [missingPrerequisites, setMissingPrerequisites] = useState<string[] | null>(null);
  const timeLimit = session?.timeLimit ?? 0;
  // Countdown timer (seconds remaining, only when timeLimit > 0)
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timeExpired, setTimeExpired] = useState(false);

  const [gameState, setGameState] = useState({
    currentMissionIndex: 0,
    currentQuestionIndex: 0,
    score: 0,
    selectedOptions: [] as PlayOption[],
    isAnswered: false,
    showMissionIntro: true,
    missionFailed: false,
    missionScore: 0,
    showMissionFailedScreen: false,
    initialSelection: null as { option: PlayOption } | null,
    isConfirming: false,
    specialFeedback: null as string | null,
    bonusLives: 0,
    lifeUsedMessage: null as string | null,
    errorsInMission: 0,
    lastAnswerWasCorrect: false,
    streak: 0,
    showMissionComplete: false,
  });
  const [showParticles, setShowParticles] = useState(false);
  const [particleType, setParticleType] = useState<'correct' | 'wrong'>('correct');
  const [openTextAnswer, setOpenTextAnswer] = useState('');
  const [openTextResult, setOpenTextResult] = useState<{ score: number; found: string[]; missing: string[] } | null>(null);
  // Fill-in-the-blank: word the user tapped from the word bank
  const [fillAnswer, setFillAnswer] = useState<string | null>(null);

  const routeParams = useParams<{ quizType: string }>();
  const quizType = routeParams.quizType || searchParams.get('quizType') || '';
  const avatarKey = searchParams.get('avatar');
  const Avatar = getAvatarComponent(avatarKey);

  // Abre la sesión del desafío
  useEffect(() => {
    if (!quizType) {
      router.push('/');
      return;
    }

    async function loadQuiz() {
      try {
        const res = await authFetch('/api/quiz/start', {
          method: 'POST',
          body: JSON.stringify({ quizId: searchParams.get('quizId') || undefined, productId: quizType, practice: searchParams.get('practice') === '1' }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === 'exhausted') setAttemptsExhausted({ count: data.count, limit: data.limit });
          else if (data.code === 'prerequisites') setMissingPrerequisites(data.missing ?? []);
          else if (data.code === 'not_available') setQuizNotAvailable(true);
          return;
        }
        const started = data as QuizSessionStart;
        setSession(started);
        setQuiz({ title: started.title, missions: started.missions });
        if (started.timeLimit > 0) setTimeRemaining(started.timeLimit);
      } catch (error) {
        console.error('Error loading quiz:', error);
      } finally {
        setLoadingQuiz(false);
      }
    }

    loadQuiz();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizType]);

  useEffect(() => {
    if (!startTime || gameState.showMissionFailedScreen || gameState.showMissionIntro) return;
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);

      // Countdown timer
      if (timeLimit > 0) {
        const remaining = timeLimit - elapsed;
        if (remaining <= 0) {
          setTimeRemaining(0);
          setTimeExpired(true);
          clearInterval(timer);
        } else {
          setTimeRemaining(remaining);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime, gameState.showMissionFailedScreen, gameState.showMissionIntro, timeLimit]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalQuestions = useMemo(
    () => quiz?.missions.reduce((acc, mission) => acc + mission.questions.length, 0) || 0,
    [quiz]
  );

  const questionsAnswered = useMemo(() => {
    if (!quiz) return 0;
    let count = 0;
    for (let i = 0; i < gameState.currentMissionIndex; i++) {
      count += quiz.missions[i].questions.length;
    }
    count += gameState.currentQuestionIndex;
    return count;
  }, [gameState.currentMissionIndex, gameState.currentQuestionIndex, quiz]);

  const progressValue = totalQuestions > 0 ? (questionsAnswered / totalQuestions) * 100 : 0;

  const currentMission = quiz?.missions[gameState.currentMissionIndex];
  const currentQuestion = currentMission?.questions[gameState.currentQuestionIndex];

  const currentReveal = currentQuestion ? reveals[currentQuestion.id] : undefined;

  const toggleMusic = () => {
    if (isMusicPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsMusicPlaying(!isMusicPlaying);
  };

  /** Manda la respuesta al servidor; null si no se pudo calificar. */
  const submitAnswer = async (payload: { optionIds?: string[]; text?: string }): Promise<QuizAnswerResult | null> => {
    if (!session || !currentQuestion) return null;
    setChecking(true);
    try {
      await pendingRef.current;
      const res = await authFetch('/api/quiz/answer', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.sessionId, questionId: currentQuestion.id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'time_up') setTimeExpired(true);
        else toast({ variant: 'destructive', title: 'No se pudo calificar', description: data.error || 'Revisa tu conexión e inténtalo de nuevo.' });
        return null;
      }
      const result = data as QuizAnswerResult;
      if (result.reveal) setReveals(prev => ({ ...prev, [currentQuestion.id]: result.reveal! }));
      return result;
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo calificar', description: 'Revisa tu conexión e inténtalo de nuevo.' });
      return null;
    } finally {
      setChecking(false);
    }
  };

  /** Aplica el resultado de una respuesta al estado del juego (vidas, misión, racha). */
  const applyResult = (isCorrect: boolean, withTrickyFeedback: boolean) => {
    let feedback = null;
    let bonusLivesChange = 0;
    if (withTrickyFeedback) {
      if (isCorrect) {
        const canEarn = !!session?.enableBonusLives && gameState.bonusLives < (session?.maxBonusLives ?? 3);
        feedback = canEarn
          ? '¡Correcto! ¡Bien hecho por confiar en tu instinto! Has ganado una vida extra para la siguiente misión.'
          : '¡Correcto! ¡Bien hecho por confiar en tu instinto!';
        bonusLivesChange = canEarn ? 1 : 0;
      } else {
        feedback = '¡Oh no! Era una pregunta clave. ¡Repasa este tema para la próxima!';
      }
    }

    let newMissionFailed = false;
    let newErrorsInMission = gameState.errorsInMission;
    if (!isCorrect) {
      newErrorsInMission = gameState.errorsInMission + 1;
      // Sin "vidas" en el quiz, las misiones no se pierden por errores.
      if (session?.enableLives !== false && newErrorsInMission > (currentMission?.maxErrors ?? 1)) {
        newMissionFailed = true;
      }
    }

    setParticleType(isCorrect ? 'correct' : 'wrong');
    setShowParticles(true);
    setTimeout(() => setShowParticles(false), 1500);

    setGameState(prev => ({
      ...prev,
      isAnswered: true,
      score: isCorrect ? prev.score + 1 : prev.score,
      missionScore: isCorrect ? prev.missionScore + 1 : prev.missionScore,
      missionFailed: newMissionFailed,
      errorsInMission: newErrorsInMission,
      specialFeedback: feedback,
      bonusLives: prev.bonusLives + bonusLivesChange,
      lastAnswerWasCorrect: isCorrect,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
  };

  const processAnswer = async (selected: PlayOption[]) => {
    if (checking || gameState.isAnswered) return;
    const result = await submitAnswer({ optionIds: selected.map(o => o.id) });
    if (!result) return;
    applyResult(result.isCorrect, !!gameState.initialSelection);
  };

  const handleSingleOptionSelect = (option: PlayOption) => {
    if (gameState.isAnswered || gameState.isConfirming || checking) return;
    setGameState(prev => ({ ...prev, selectedOptions: [option] }));
    if (currentQuestion?.isTricky && !gameState.initialSelection) {
      setGameState(prev => ({ ...prev, isConfirming: true, initialSelection: { option } }));
    } else {
      processAnswer([option]);
    }
  };

  const handleMultiOptionToggle = (option: PlayOption) => {
    if (gameState.isAnswered || checking) return;
    setGameState(prev => {
      const newSelection = prev.selectedOptions.some(o => o.id === option.id)
        ? prev.selectedOptions.filter(o => o.id !== option.id)
        : [...prev.selectedOptions, option];
      return { ...prev, selectedOptions: newSelection };
    });
  };

  const handleVerifyMultiSelectAnswer = () => {
    processAnswer(gameState.selectedOptions);
  };

  const handleConfirmAnswer = (isSure: boolean) => {
    setGameState(prev => ({ ...prev, isConfirming: false }));
    if (isSure && gameState.selectedOptions.length > 0) {
      processAnswer(gameState.selectedOptions);
    } else {
      setGameState(prev => ({ ...prev, selectedOptions: [], initialSelection: null }));
    }
  };

  /**
   * Cierra la sesión: el servidor calcula el puntaje con las respuestas que
   * calificó y registra el intento una sola vez. Luego abre los resultados.
   */
  const finishQuiz = async ({ bonusLives, timeExpired: expired }: { bonusLives: number; timeExpired: boolean }) => {
    if (finishingRef.current || !session) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      await pendingRef.current;
      const res = await authFetch('/api/quiz/finish', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.sessionId, bonusLives, timeExpired: expired }),
      });
      const data = await res.json() as { attemptId?: string; error?: string };
      if (!res.ok || !data.attemptId) throw new Error(data.error || `Error ${res.status}`);
      const params = new URLSearchParams();
      for (const key of ['avatar', 'returnTo']) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
      }
      params.set('quizTitle', session.title);
      params.set('quizId', session.quizId);
      params.set('attemptId', data.attemptId);
      router.replace(`/${quizType}/results?${params.toString()}`);
    } catch (err) {
      console.error('No se pudo registrar el intento:', err);
      toast({ variant: 'destructive', title: 'No se guardó tu intento', description: 'Revisa tu conexión y vuelve a tocar el botón para intentarlo.' });
      finishingRef.current = false;
      setFinishing(false);
    }
  };

  const handleNext = () => {
    let missionFailed = gameState.missionFailed;
    let bonusLivesLeft = gameState.bonusLives;
    let lifeUsed = false;

    if (missionFailed && bonusLivesLeft > 0) {
      bonusLivesLeft--;
      missionFailed = false;
      lifeUsed = true;
    }

    if (missionFailed) {
      setGameState(prev => ({ ...prev, showMissionFailedScreen: true }));
      return;
    }

    const commonReset = {
      selectedOptions: [],
      isAnswered: false,
      initialSelection: null,
      specialFeedback: null,
      lifeUsedMessage: lifeUsed ? "¡Has usado una vida extra para continuar!" : null,
    };
    setOpenTextAnswer('');
    setOpenTextResult(null);
    setFillAnswer(null);

    if (gameState.currentQuestionIndex < (currentMission?.questions.length || 0) - 1) {
      setGameState(prev => ({
        ...prev,
        currentQuestionIndex: prev.currentQuestionIndex + 1,
        bonusLives: bonusLivesLeft,
        ...commonReset,
      }));
    } else {
      if (gameState.currentMissionIndex < (quiz?.missions.length || 0) - 1) {
        setGameState(prev => ({
          ...prev,
          currentMissionIndex: prev.currentMissionIndex + 1,
          currentQuestionIndex: 0,
          showMissionIntro: true,
          missionScore: 0,
          missionFailed: false,
          errorsInMission: 0,
          bonusLives: bonusLivesLeft,
          ...commonReset,
        }));
      } else {
        finishQuiz({ bonusLives: bonusLivesLeft, timeExpired: false });
      }
    }
  };

  const handleOpenTextSubmit = async () => {
    if (!currentQuestion?.isOpenText || gameState.isAnswered || checking) return;
    const result = await submitAnswer({ text: openTextAnswer });
    if (!result) return;
    setOpenTextResult(result.reveal?.openText ?? null);
    applyResult(result.isCorrect, false);
  };

  const startMission = () => {
    if (gameState.currentMissionIndex === 0 && !startTime) {
      setStartTime(Date.now());
      // El tiempo límite del servidor empieza junto con el cronómetro.
      if (session) {
        pendingRef.current = authFetch('/api/quiz/answer', {
          method: 'POST',
          body: JSON.stringify({ sessionId: session.sessionId, begin: true }),
        }).catch(() => {});
      }
    }
    setGameState(prev => ({ ...prev, showMissionIntro: false, lifeUsedMessage: null }));
  };

  const restartMission = () => {
    // Las respuestas de la misión fallida no cuentan: se vuelve a jugar.
    if (session) {
      const missionIndex = gameState.currentMissionIndex;
      pendingRef.current = pendingRef.current.then(() => authFetch('/api/quiz/answer', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.sessionId, restartMission: missionIndex }),
      })).catch(() => {});
      const missionIds = new Set(currentMission?.questions.map(q => q.id) ?? []);
      setReveals(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !missionIds.has(id))));
    }
    setGameState(prev => ({
      ...prev,
      score: prev.score - prev.missionScore,
      currentQuestionIndex: 0,
      selectedOptions: [],
      isAnswered: false,
      showMissionIntro: true,
      showMissionFailedScreen: false,
      missionFailed: false,
      errorsInMission: 0,
      missionScore: 0,
      initialSelection: null,
      specialFeedback: null,
    }));
  };

  // Tiempo agotado → se cierra el quiz con lo respondido hasta ahora.
  useEffect(() => {
    if (!timeExpired || !quiz) return;
    finishQuiz({ bonusLives: gameState.bonusLives, timeExpired: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeExpired]);

  if (loadingQuiz) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (quizNotAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Evaluación no disponible</CardTitle>
          <CardDescription>
            Esta evaluación aún no está lista. Por favor contacta a tu Hub Manager o capacitador para que la habilite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.push('/')}>Volver al inicio</Button>
        </CardContent>
      </Card>
    );
  }

  if (missingPrerequisites) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Primero completa los desafíos previos</CardTitle>
          <CardDescription>
            Para abrir este desafío necesitas aprobar: {missingPrerequisites.join(', ') || 'los desafíos previos'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.push('/')}>Volver al inicio</Button>
        </CardContent>
      </Card>
    );
  }

  if (attemptsExhausted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Alcanzaste el máximo de intentos</CardTitle>
          <CardDescription>
            Ya completaste esta evaluación {attemptsExhausted.count} {attemptsExhausted.count === 1 ? 'vez' : 'veces'}
            {attemptsExhausted.limit > 1 ? ` (máximo permitido: ${attemptsExhausted.limit})` : ' y no admite reintentos'}.
            Contacta a tu capacitador si necesitas otra oportunidad.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.push('/')}>Volver al inicio</Button>
        </CardContent>
      </Card>
    );
  }

  if (!quiz || !currentMission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">No se encontró el quiz</CardTitle>
          <CardDescription>
            Este producto no tiene un quiz activo configurado. Pide al administrador que configure uno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.push('/')}>Volver al inicio</Button>
        </CardContent>
      </Card>
    );
  }

  if (gameState.showMissionFailedScreen) {
    return (
      <Card className="animate-fade-in text-center rounded-lg shadow-lg border-destructive/20">
        <CardHeader>
          <ShieldAlert className="mx-auto h-16 w-16 text-destructive" />
          <CardTitle className="text-3xl font-headline text-destructive mt-4">
            ¡Misión Fallida!
          </CardTitle>
          <CardDescription>
            Has cometido un error y debes reiniciar la misión para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>¡No te preocupes, hasta los mejores exploradores tropiezan! Concéntrate y vuelve a intentarlo.</p>
        </CardContent>
        <CardFooter>
          <Button onClick={restartMission} size="lg" className="w-full rounded-lg text-primary-foreground bg-primary hover:bg-primary/90">
            Intentar de Nuevo
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (gameState.showMissionIntro) {
    return (
      <Card className="animate-fade-in rounded-lg shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center text-primary">
            <BookOpen className="mr-3" />
            {currentMission.title}
          </CardTitle>
          <CardDescription>Misión {gameState.currentMissionIndex + 1} de {quiz.missions.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-lg leading-relaxed">{currentMission.narrative}</p>
          {gameState.lifeUsedMessage && (
            <Alert variant="default" className="mt-4 bg-primary/10 border-primary/20 text-primary">
              <Heart className="h-4 w-4 !text-primary" />
              <AlertTitle>¡Vida extra usada!</AlertTitle>
              <AlertDescription>{gameState.lifeUsedMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={startMission} size="lg" className="w-full rounded-lg text-primary-foreground bg-primary hover:bg-primary/90">
            Comenzar Misión
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!currentQuestion) return <p>Error: No se encontró la pregunta.</p>;

  const questionKey = `${gameState.currentMissionIndex}-${gameState.currentQuestionIndex}`;

  // ── Fill-in-the-blank: tap-to-place word bank ──────────────────────────────
  const renderFillInBlank = () => {
    // El banco de palabras llega ya mezclado y sin marcar la correcta.
    const words = currentQuestion.options;
    const correctWord = currentReveal?.correctAnswerText ?? '';
    const parts = currentQuestion.text.split(/_{2,}/);
    const isCorrect = gameState.lastAnswerWasCorrect;

    return (
      <div className="space-y-5">
        {/* Question text with inline blank slot */}
        <div className="text-base font-medium leading-relaxed flex flex-wrap items-center gap-x-1.5 gap-y-2">
          {parts.map((part, i) => (
            <span key={i} className="contents">
              <span>{part}</span>
              {i < parts.length - 1 && (
                <button
                  className={cn(
                    'min-w-[7rem] px-3 py-1.5 rounded-lg border-b-2 text-sm font-semibold transition-all',
                    gameState.isAnswered
                      ? isCorrect
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-destructive bg-destructive/10 text-destructive'
                      : fillAnswer
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted-foreground/40 text-muted-foreground/60',
                  )}
                  onClick={() => !gameState.isAnswered && setFillAnswer(null)}
                >
                  {fillAnswer ?? '— toca una palabra —'}
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Word bank */}
        {!gameState.isAnswered && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Arrastra o toca la respuesta correcta
            </p>
            <div className="flex flex-wrap gap-2">
              {words.map((w, i) => (
                <button
                  key={i}
                  onClick={() => setFillAnswer(w.text)}
                  disabled={fillAnswer === w.text}
                  className={cn(
                    'px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all select-none',
                    fillAnswer === w.text
                      ? 'border-primary/20 bg-primary/5 text-primary/40 cursor-not-allowed'
                      : 'border-primary/40 bg-card text-primary hover:bg-primary/10 active:scale-95',
                  )}
                >
                  {w.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Verify button */}
        {!gameState.isAnswered && fillAnswer && (
          <Button
            onClick={() => processAnswer(words.filter(o => o.text === fillAnswer).slice(0, 1))}
            disabled={checking}
            className="w-full text-primary-foreground bg-primary hover:bg-primary/90"
            size="lg"
          >
            <Check className="mr-2 h-4 w-4" /> Verificar respuesta
          </Button>
        )}

        {/* Post-answer: show correct word if wrong */}
        {gameState.isAnswered && !isCorrect && correctWord && (
          <div className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
            La respuesta correcta era: <strong className="text-foreground">{correctWord}</strong>
          </div>
        )}
      </div>
    );
  };

  const renderOptions = () => {
    return currentQuestion.options.map((option, index) => {
      const isSelected = gameState.selectedOptions.some(o => o.id === option.id);
      // Sin la respuesta revelada (el quiz la muestra al final), solo se marca
      // si lo que eligió fue correcto o no.
      const isCorrect = currentReveal
        ? currentReveal.correctOptionIds.includes(option.id)
        : isSelected && gameState.lastAnswerWasCorrect;
      let optionStyle = "border-primary/30 text-primary bg-card hover:bg-primary/10";
      let Icon = null;
      let radioOrCheck = <div className="w-6 h-6 rounded-full border-2 border-primary/50 shrink-0"></div>;

      if (currentQuestion.isMultiSelect) {
        radioOrCheck = <Checkbox checked={isSelected} disabled={gameState.isAnswered} className="h-6 w-6 shrink-0" />;
      } else if (isSelected) {
        radioOrCheck = <div className="w-6 h-6 rounded-full border-2 border-primary bg-primary flex items-center justify-center shrink-0"><div className="w-3 h-3 bg-card rounded-full"></div></div>;
      }

      if (gameState.isAnswered) {
        if (isCorrect) {
          optionStyle = 'bg-accent/10 border-accent text-accent';
          Icon = <CheckCircle className="text-accent shrink-0" />;
        } else if (isSelected) {
          optionStyle = 'bg-destructive/10 border-destructive text-destructive';
          Icon = <XCircle className="text-destructive shrink-0" />;
        } else {
          optionStyle = 'border-muted-foreground/30 bg-muted text-muted-foreground';
          Icon = <span className="w-6 h-6 shrink-0"></span>;
        }
      } else if (isSelected) {
        optionStyle = 'border-primary bg-primary/10';
      }

      return (
        <label
          key={index}
          className={cn(
            "flex w-full cursor-pointer items-center gap-4 rounded-lg border p-4 text-left text-base transition-all",
            optionStyle,
            gameState.isAnswered ? 'cursor-not-allowed opacity-80' : 'hover:shadow-md'
          )}
          onClick={() => {
            if (gameState.isAnswered) return;
            if (currentQuestion.isMultiSelect) {
              handleMultiOptionToggle(option);
            } else {
              handleSingleOptionSelect(option);
            }
          }}
        >
          {gameState.isAnswered ? Icon : radioOrCheck}
          <span className="flex-grow">{option.text}</span>
        </label>
      );
    });
  };

  return (
    <div className="space-y-6">
      <FloatingParticles trigger={showParticles} type={particleType} />

      <AlertDialog open={gameState.isConfirming} onOpenChange={(open) => !open && handleConfirmAnswer(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro de tu respuesta?</AlertDialogTitle>
            <AlertDialogDescription>
              Confía en tu instinto, pero revisa bien tu elección. ¡Esta es una pregunta clave!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirmAnswer(false)}>No, quiero cambiar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmAnswer(true)} className="text-primary-foreground bg-primary hover:bg-primary/90">Sí, estoy seguro</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex justify-between items-center space-x-4">
        <div className="space-y-2 flex-grow">
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Pregunta {questionsAnswered + 1} de {totalQuestions}</p>
            <StreakCounter streak={gameState.streak} />
          </div>
          <Progress value={progressValue} className="transition-all duration-500 rounded-lg h-3" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={toggleMusic} className="rounded-full shadow-md border" aria-label={isMusicPlaying ? "Pausar música" : "Reproducir música"}>
            {isMusicPlaying ? <VolumeX className="h-5 w-5" /> : <Music className="h-5 w-5" />}
          </Button>
          {timeLimit > 0 ? (
            // Countdown timer
            <div className={cn(
              "flex items-center gap-2 p-2 px-3 rounded-full shadow-md border font-mono text-sm font-bold",
              timeRemaining <= 60
                ? "bg-destructive/10 border-destructive text-destructive animate-pulse"
                : "bg-card border text-primary"
            )}>
              <Timer className="h-5 w-5" />
              <span className="w-12 text-center">{formatTime(timeRemaining)}</span>
            </div>
          ) : (
            // Elapsed timer
            <div className="flex items-center gap-2 bg-card p-2 px-3 rounded-full shadow-md border text-primary">
              <Timer className="h-5 w-5" />
              <span className="font-mono text-sm font-bold w-12 text-center">{formatTime(elapsedTime)}</span>
            </div>
          )}
          <div className="relative flex items-center gap-2 bg-card p-2 rounded-full shadow-md border">
            <Avatar className="h-10 w-10 text-primary" />
            {gameState.bonusLives > 0 && (
              <div className="flex items-center gap-1 text-primary font-bold pr-2">
                <Heart className="h-5 w-5" />
                <span>x{gameState.bonusLives}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <audio ref={audioRef} src="https://storage.googleapis.com/proudcity/mebanenc/uploads/2021/03/placeholder-audio.mp3" loop />

      <AnimatePresence mode="wait">
        <motion.div
          key={questionKey}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Card className="bg-card shadow-lg rounded-lg border-primary/20">
            <CardHeader>
              <CardTitle className="text-2xl leading-snug text-primary">{currentQuestion.text}</CardTitle>
              {currentQuestion.imageUrl && (
                <img
                  src={currentQuestion.imageUrl}
                  alt="Imagen de la pregunta"
                  className="rounded-lg border object-contain max-h-52 w-auto mt-2"
                />
              )}
              <CardDescription>{currentMission.title}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentQuestion.isFillInBlank ? (
                renderFillInBlank()
              ) : currentQuestion.isOpenText ? (
                <div className="space-y-3">
                  <textarea
                    className="w-full rounded-lg border border-input bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                    rows={4}
                    placeholder="Escribe tu respuesta aquí..."
                    value={openTextAnswer}
                    onChange={e => setOpenTextAnswer(e.target.value)}
                    disabled={gameState.isAnswered}
                  />
                  {/* Respuestas válidas — always visible as a guide */}
                  {(currentQuestion.validAnswers?.length ?? 0) > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Respuestas válidas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {currentQuestion.validAnswers!.map(kw => (
                          <span
                            key={kw}
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-full border font-medium',
                              gameState.isAnswered && openTextResult
                                ? openTextResult.found.includes(kw)
                                  ? 'bg-accent/20 text-accent border-accent/30'
                                  : 'bg-destructive/10 text-destructive border-destructive/20'
                                : 'bg-amber-100 text-amber-800 border-amber-300',
                            )}
                          >
                            {gameState.isAnswered && openTextResult
                              ? openTextResult.found.includes(kw) ? `✓ ${kw}` : `✗ ${kw}`
                              : kw}
                          </span>
                        ))}
                      </div>
                      {gameState.isAnswered && currentReveal?.modelAnswer && (
                        <div className="mt-2 rounded-lg bg-muted p-3 text-sm">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Respuesta modelo:</p>
                          <p className="text-foreground leading-relaxed">{currentReveal.modelAnswer}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                renderOptions()
              )}
            </CardContent>

            {/* Verify buttons */}
            {currentQuestion.isOpenText && !gameState.isAnswered && (
              <CardFooter>
                <Button onClick={handleOpenTextSubmit} disabled={!openTextAnswer.trim() || checking} className="w-full text-primary-foreground bg-primary hover:bg-primary/90" size="lg">
                  <Check className="mr-2" />
                  Verificar respuesta
                </Button>
              </CardFooter>
            )}

            {currentQuestion.isMultiSelect && !gameState.isAnswered && (
              <CardFooter>
                <Button onClick={handleVerifyMultiSelectAnswer} disabled={gameState.selectedOptions.length === 0 || checking} className="w-full text-primary-foreground bg-primary hover:bg-primary/90" size="lg">
                  <Check className="mr-2" />
                  Verificar respuesta
                </Button>
              </CardFooter>
            )}

            {gameState.isAnswered && (
              <CardFooter className="flex-col items-stretch space-y-4">
                <Alert variant={gameState.lastAnswerWasCorrect ? 'default' : 'destructive'} className={cn(
                  "rounded-lg border-2",
                  gameState.lastAnswerWasCorrect ? "bg-accent/10 border-accent text-accent" : "bg-destructive/10 border-destructive text-destructive"
                )}>
                  <AlertTitle className="font-bold">
                    {gameState.lastAnswerWasCorrect
                      ? (currentQuestion.isOpenText ? `¡Bien! (${Math.round((openTextResult?.score ?? 1) * 100)}%)` : '¡Correcto!')
                      : (currentQuestion.isOpenText ? `Incompleto (${Math.round((openTextResult?.score ?? 0) * 100)}%)` : '¡Ups! Respuesta incorrecta.')}
                  </AlertTitle>
                  <AlertDescription>
                    {gameState.specialFeedback ||
                      (gameState.lastAnswerWasCorrect
                        ? '¡Excelente! Sigamos adelante.'
                        : session?.enableLives === false
                        ? 'Sigue adelante: en este desafío los errores no reinician la misión.'
                        : gameState.missionFailed
                        ? 'Llegaste al límite de errores de la misión. Deberás reiniciarla para continuar.'
                        : 'Cuidado, cuenta como error. ¡Aún puedes completar esta misión!')}
                    {currentReveal?.explanation && (
                      <span className="block mt-2 text-foreground/80">{currentReveal.explanation}</span>
                    )}
                  </AlertDescription>
                </Alert>
                <Button onClick={handleNext} disabled={finishing} className="w-full rounded-lg text-primary-foreground bg-primary hover:bg-primary/90" size="lg">
                  Siguiente <ArrowRight className="ml-2" />
                </Button>
              </CardFooter>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function QuizPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="text-center p-8"><Card><CardHeader><CardTitle>Cargando Quiz...</CardTitle></CardHeader></Card></div>}>
        <QuizComponent />
      </Suspense>
    </ProtectedRoute>
  );
}
