'use client';

import { useState, useEffect, useMemo, Suspense, useRef } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import type { Option } from '@/lib/types';
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
import { getQuizzes, getQuestionsByIds } from '@/lib/firestore-service';
import type { AssessmentConfig } from '@/lib/types-scalable';
import { DEFAULT_ASSESSMENT_CONFIG } from '@/lib/types-scalable';

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Estructura de runtime que el motor del quiz espera
interface RuntimeQuestion {
  text: string;
  imageUrl?: string;         // imagen opcional de la pregunta
  options: Option[];
  isTricky?: boolean;
  isMultiSelect?: boolean;
  isOpenText?: boolean;
  isFillInBlank?: boolean;   // fill_in_the_blank: tap-to-place word bank
  validAnswers?: string[];   // conceptos clave para auto-evaluación
  modelAnswer?: string;      // respuesta modelo (se muestra como feedback)
  type?: string;             // tipo original de la pregunta
}

/** Evalúa una respuesta abierta contra los conceptos clave. Retorna 0–1. */
function evaluateOpenText(answer: string, keywords: string[]): { score: number; found: string[]; missing: string[] } {
  if (keywords.length === 0) return { score: 1, found: [], missing: [] };
  const normalized = answer.toLowerCase();
  const found = keywords.filter(kw => normalized.includes(kw.toLowerCase()));
  const missing = keywords.filter(kw => !normalized.includes(kw.toLowerCase()));
  return { score: found.length / keywords.length, found, missing };
}
interface RuntimeMission {
  id: string;
  title: string;
  narrative: string;
  questions: RuntimeQuestion[];
}
interface RuntimeQuiz {
  title: string;
  missions: RuntimeMission[];
}

function QuizComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Per-question result tracking (stored in ref to avoid re-renders)
  const questionResultsRef = useRef<{ text: string; isCorrect: boolean; userAnswer: string; correctAnswer: string }[]>([]);

  // Quiz cargado desde Firestore
  const [quiz, setQuiz] = useState<RuntimeQuiz | null>(null);
  const [quizId, setQuizId] = useState('');
  const [loadingQuiz, setLoadingQuiz] = useState(true);
  const [quizNotAvailable, setQuizNotAvailable] = useState(false);
  const [assessmentCfg, setAssessmentCfg] = useState<AssessmentConfig>(DEFAULT_ASSESSMENT_CONFIG);
  // Countdown timer (seconds remaining, only when timeLimit > 0)
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timeExpired, setTimeExpired] = useState(false);

  const [gameState, setGameState] = useState({
    currentMissionIndex: 0,
    currentQuestionIndex: 0,
    score: 0,
    selectedOptions: [] as Option[],
    isAnswered: false,
    showMissionIntro: true,
    missionFailed: false,
    missionScore: 0,
    showMissionFailedScreen: false,
    initialSelection: null as { option: Option, isCorrect: boolean } | null,
    isConfirming: false,
    specialFeedback: null as string | null,
    bonusLives: 0,
    lifeUsedMessage: null as string | null,
    mistakeMadeInMission: false,
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

  // Cargar quiz desde Firestore
  useEffect(() => {
    if (!quizType) {
      router.push('/');
      return;
    }

    async function loadQuiz() {
      try {
        const firestoreQuizzes = await getQuizzes(quizType, true);
        if (!firestoreQuizzes.length) {
          setLoadingQuiz(false);
          return;
        }
        // Allow caller to specify a particular quiz via ?quizId=...
        const requestedQuizId = searchParams.get('quizId');
        let q: typeof firestoreQuizzes[0] | undefined;
        if (requestedQuizId) {
          q = firestoreQuizzes.find(quiz => quiz.id === requestedQuizId);
          if (!q) {
            // The specific quiz assigned in the journey is not published yet
            setQuizNotAvailable(true);
            setLoadingQuiz(false);
            return;
          }
        } else {
          q = firestoreQuizzes[0];
        }
        setQuizId(q.id);

        // Cargar todas las preguntas de todas las misiones
        const allIds = q.missions.flatMap((m) => m.questionIds);
        const allQuestions = await getQuestionsByIds(allIds);
        const qMap = Object.fromEntries(allQuestions.map((q) => [q.id, q]));

        // Read assessment config (defaults if not set on the quiz doc)
        const cfg: AssessmentConfig = { ...DEFAULT_ASSESSMENT_CONFIG, ...(q as any).assessmentConfig };
        setAssessmentCfg(cfg);

        const buildOptions = (rawOptions: { text: string; isCorrect: boolean; order: number }[]) => {
          const sorted = rawOptions.sort((a, b) => a.order - b.order).map(o => ({ text: o.text, isCorrect: o.isCorrect }));
          return cfg.randomizeOptions ? shuffle(sorted) : sorted;
        };

        let runtimeMissions: RuntimeMission[] = q.missions
          .sort((a, b) => a.order - b.order)
          .map((mission) => {
            let questions = mission.questionIds
              .map((id) => qMap[id])
              .filter(Boolean)
              .map((q) => ({
                text: q.text,
                imageUrl: q.imageUrl,
                options: q.type === 'open_text' ? [] : buildOptions(q.options),
                type: q.type,
                isTricky: q.isTricky || q.type === 'tricky',
                isMultiSelect: q.type === 'multiple_choice',
                isOpenText: q.type === 'open_text',
                isFillInBlank: q.type === 'fill_in_the_blank',
                validAnswers: q.validAnswers || [],
                modelAnswer: q.modelAnswer,
              }));
            if (cfg.randomizeQuestions) questions = shuffle(questions);
            return { id: mission.id, title: mission.title, narrative: mission.narrative, questions };
          });

        setQuiz({ title: q.title, missions: runtimeMissions });

        // Initialize countdown if time limit is set
        if (cfg.timeLimit > 0) {
          setTimeRemaining(cfg.timeLimit);
        }
      } catch (error) {
        console.error('Error loading quiz:', error);
      } finally {
        setLoadingQuiz(false);
      }
    }

    loadQuiz();
  }, [quizType, router]);

  useEffect(() => {
    if (!startTime || gameState.showMissionFailedScreen || gameState.showMissionIntro) return;
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);

      // Countdown timer
      if (assessmentCfg.timeLimit > 0) {
        const remaining = assessmentCfg.timeLimit - elapsed;
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
  }, [startTime, gameState.showMissionFailedScreen, gameState.showMissionIntro, assessmentCfg.timeLimit]);

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

  useEffect(() => {
    const bonusLivesParam = searchParams.get('bonusLives');
    setGameState(prev => ({
      ...prev,
      bonusLives: bonusLivesParam ? parseInt(bonusLivesParam, 10) : 0,
    }));
  }, [searchParams]);

  const toggleMusic = () => {
    if (isMusicPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsMusicPlaying(!isMusicPlaying);
  };

  const processAnswer = (selected: Option[]) => {
    let isCorrect;
    if (currentQuestion?.isMultiSelect) {
      const correctOptions = currentQuestion.options.filter(o => o.isCorrect);
      const selectedTexts = new Set(selected.map(o => o.text));
      const correctTexts = new Set(correctOptions.map(o => o.text));
      isCorrect = selected.length === correctOptions.length && [...selectedTexts].every(text => correctTexts.has(text));
    } else {
      isCorrect = selected.length > 0 && selected[0].isCorrect;
    }

    let feedback = null;
    let bonusLivesChange = 0;

    if (gameState.initialSelection) {
      const initialIsCorrect = gameState.initialSelection.isCorrect;
      if (initialIsCorrect && isCorrect) {
        feedback = "¡Correcto! ¡Bien hecho por confiar en tu instinto! Has ganado una vida extra para la siguiente misión.";
        bonusLivesChange = 1;
      } else if (initialIsCorrect && !isCorrect) {
        feedback = "¡Oh no! Tu primera respuesta era la correcta. ¡Confía más en tu conocimiento de Aviva!";
      } else if (!initialIsCorrect && isCorrect) {
        feedback = "¡Excelente corrección! Es de sabios cambiar de opinión. ¡Bien hecho!";
      }
    }

    let newMissionFailed = false;
    let newMistakeMadeInMission = gameState.mistakeMadeInMission;

    if (!isCorrect) {
      if (gameState.mistakeMadeInMission) {
        newMissionFailed = true;
      } else {
        newMistakeMadeInMission = true;
      }
    }

    // Record per-question result
    const correctAnswerText = currentQuestion?.options.find(o => o.isCorrect)?.text
      ?? currentQuestion?.validAnswers?.[0] ?? '';
    const userAnswerText = selected.map(o => o.text).join(', ');
    questionResultsRef.current.push({
      text: currentQuestion?.text ?? '',
      isCorrect: !!isCorrect,
      userAnswer: userAnswerText,
      correctAnswer: correctAnswerText,
    });

    setParticleType(isCorrect ? 'correct' : 'wrong');
    setShowParticles(true);
    setTimeout(() => setShowParticles(false), 1500);

    setGameState(prev => ({
      ...prev,
      isAnswered: true,
      score: isCorrect ? prev.score + 1 : prev.score,
      missionScore: isCorrect ? prev.missionScore + 1 : prev.missionScore,
      missionFailed: newMissionFailed,
      mistakeMadeInMission: newMistakeMadeInMission,
      specialFeedback: feedback,
      bonusLives: prev.bonusLives + bonusLivesChange,
      lastAnswerWasCorrect: isCorrect,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
  };

  const handleSingleOptionSelect = (option: Option) => {
    if (gameState.isAnswered || gameState.isConfirming) return;
    setGameState(prev => ({ ...prev, selectedOptions: [option] }));
    if (currentQuestion?.isTricky && !gameState.initialSelection) {
      setGameState(prev => ({
        ...prev,
        isConfirming: true,
        initialSelection: { option, isCorrect: option.isCorrect }
      }));
    } else {
      processAnswer([option]);
    }
  };

  const handleMultiOptionToggle = (option: Option) => {
    if (gameState.isAnswered) return;
    setGameState(prev => {
      const newSelection = prev.selectedOptions.some(o => o.text === option.text)
        ? prev.selectedOptions.filter(o => o.text !== option.text)
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
          mistakeMadeInMission: false,
          bonusLives: bonusLivesLeft,
          ...commonReset,
        }));
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.set('score', gameState.score.toString());
        params.set('totalQuestions', totalQuestions.toString());
        params.set('bonusLives', bonusLivesLeft.toString());
        params.set('quizTitle', quiz?.title || '');
        if (startTime) {
          params.set('startTime', startTime.toString());
        }
        if (quizId) {
          params.set('quizId', quizId);
        }
        params.set('showFeedback', assessmentCfg.showFeedback);
        // Persist per-question results for the results page
        try {
          sessionStorage.setItem(
            `quiz_results_${quizType}`,
            JSON.stringify(questionResultsRef.current)
          );
        } catch { /* ignore quota errors */ }
        router.push(`/${quizType}/results?${params.toString()}`);
      }
    }
  };

  const handleOpenTextSubmit = () => {
    if (!currentQuestion?.isOpenText || gameState.isAnswered) return;
    const result = evaluateOpenText(openTextAnswer, currentQuestion.validAnswers || []);
    setOpenTextResult(result);
    // Correct if score ≥ 70%, or if no keywords were defined (score = 1)
    const isCorrect = result.score >= 0.7;

    // Record open-text result
    questionResultsRef.current.push({
      text: currentQuestion?.text ?? '',
      isCorrect,
      userAnswer: openTextAnswer,
      correctAnswer: currentQuestion?.validAnswers?.join(', ') ?? '',
    });

    setParticleType(isCorrect ? 'correct' : 'wrong');
    setShowParticles(true);
    setTimeout(() => setShowParticles(false), 1500);

    let newMissionFailed = false;
    let newMistakeMade = gameState.mistakeMadeInMission;
    if (!isCorrect) {
      if (gameState.mistakeMadeInMission) newMissionFailed = true;
      else newMistakeMade = true;
    }
    setGameState(prev => ({
      ...prev,
      isAnswered: true,
      score: isCorrect ? prev.score + 1 : prev.score,
      missionScore: isCorrect ? prev.missionScore + 1 : prev.missionScore,
      missionFailed: newMissionFailed,
      mistakeMadeInMission: newMistakeMade,
      lastAnswerWasCorrect: isCorrect,
      streak: isCorrect ? prev.streak + 1 : 0,
    }));
  };

  const startMission = () => {
    if (gameState.currentMissionIndex === 0 && !startTime) {
      setStartTime(Date.now());
    }
    setGameState(prev => ({ ...prev, showMissionIntro: false, lifeUsedMessage: null }));
  };

  const restartMission = () => {
    setGameState(prev => ({
      ...prev,
      score: prev.score - prev.missionScore,
      currentQuestionIndex: 0,
      selectedOptions: [],
      isAnswered: false,
      showMissionIntro: true,
      showMissionFailedScreen: false,
      missionFailed: false,
      mistakeMadeInMission: false,
      missionScore: 0,
      initialSelection: null,
      specialFeedback: null,
    }));
  };

  // Time expired → auto-navigate to results
  useEffect(() => {
    if (!timeExpired || !quiz) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('score', gameState.score.toString());
    params.set('totalQuestions', totalQuestions.toString());
    params.set('bonusLives', gameState.bonusLives.toString());
    params.set('quizTitle', quiz.title);
    params.set('timeExpired', '1');
    if (startTime) params.set('startTime', startTime.toString());
    if (quizId) params.set('quizId', quizId);
    router.push(`/${quizType}/results?${params.toString()}`);
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
    // Build word bank: prefer options (new format with isCorrect flags),
    // fall back to validAnswers for legacy questions that have no options stored.
    const wordBank: { text: string; isCorrect: boolean }[] =
      currentQuestion.options.length > 0
        ? currentQuestion.options
        : (currentQuestion.validAnswers || []).map((v, i) => ({ text: v, isCorrect: i === 0 }));
    const correctWord = wordBank.find(o => o.isCorrect)?.text ?? (currentQuestion.validAnswers?.[0] ?? '');
    const words = [...wordBank].sort(() => Math.random() - 0.5);
    const parts = currentQuestion.text.split(/_{2,}/);
    const isCorrect = fillAnswer === correctWord;

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
            onClick={() => processAnswer(wordBank.filter(o => o.text === fillAnswer))}
            className="w-full text-primary-foreground bg-primary hover:bg-primary/90"
            size="lg"
          >
            <Check className="mr-2 h-4 w-4" /> Verificar respuesta
          </Button>
        )}

        {/* Post-answer: show correct word if wrong */}
        {gameState.isAnswered && !isCorrect && (
          <div className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
            La respuesta correcta era: <strong className="text-foreground">{correctWord}</strong>
          </div>
        )}
      </div>
    );
  };

  const renderOptions = () => {
    return currentQuestion.options.map((option, index) => {
      const isSelected = gameState.selectedOptions.some(o => o.text === option.text);
      const isCorrect = option.isCorrect;
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
          {assessmentCfg.timeLimit > 0 ? (
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
                      {gameState.isAnswered && currentQuestion.modelAnswer && (
                        <div className="mt-2 rounded-lg bg-muted p-3 text-sm">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Respuesta modelo:</p>
                          <p className="text-foreground leading-relaxed">{currentQuestion.modelAnswer}</p>
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
                <Button onClick={handleOpenTextSubmit} disabled={!openTextAnswer.trim()} className="w-full text-primary-foreground bg-primary hover:bg-primary/90" size="lg">
                  <Check className="mr-2" />
                  Verificar respuesta
                </Button>
              </CardFooter>
            )}

            {currentQuestion.isMultiSelect && !gameState.isAnswered && (
              <CardFooter>
                <Button onClick={handleVerifyMultiSelectAnswer} disabled={gameState.selectedOptions.length === 0} className="w-full text-primary-foreground bg-primary hover:bg-primary/90" size="lg">
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
                        : gameState.missionFailed
                        ? 'Este fue tu segundo error en la misión. Deberás reiniciar para continuar.'
                        : 'Cuidado, este es tu primer error. ¡Aún te queda una oportunidad en esta misión!')}
                  </AlertDescription>
                </Alert>
                <Button onClick={handleNext} className="w-full rounded-lg text-primary-foreground bg-primary hover:bg-primary/90" size="lg">
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
