
'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { quizzes } from '@/lib/questions';
import type { Option } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, ArrowRight, BookOpen, ShieldAlert, Heart } from 'lucide-react';
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

function QuizComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const quizType = searchParams.get('quizType') || '';
  const fullName = searchParams.get('fullName') || '';
  const avatarKey = searchParams.get('avatar');
  const Avatar = getAvatarComponent(avatarKey);

  const [gameState, setGameState] = useState({
    currentMissionIndex: 0,
    currentQuestionIndex: 0,
    score: 0,
    selectedOption: null as Option | null,
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
  });

  const quiz = useMemo(() => quizzes[quizType], [quizType]);

  const totalQuestions = useMemo(() => quiz?.missions.reduce((acc, mission) => acc + mission.questions.length, 0) || 0, [quiz]);
  
  const questionsAnswered = useMemo(() => {
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
    if (!quizType || !fullName) {
      router.push('/');
    }
    const bonusLivesParam = searchParams.get('bonusLives');
    setGameState(prev => ({
      ...prev,
      bonusLives: bonusLivesParam ? parseInt(bonusLivesParam, 10) : 0,
    }));
  }, [quizType, fullName, router, searchParams]);

  const processAnswer = (option: Option) => {
      const isCorrect = option.isCorrect;
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

      setGameState(prev => ({
        ...prev,
        isAnswered: true,
        score: isCorrect ? prev.score + 1 : prev.score,
        missionScore: isCorrect ? prev.missionScore + 1 : prev.missionScore,
        missionFailed: !isCorrect,
        specialFeedback: feedback,
        bonusLives: prev.bonusLives + bonusLivesChange,
      }));
  };

  const handleOptionSelect = (option: Option) => {
    if (gameState.isAnswered || gameState.isConfirming) return;

    setGameState(prev => ({ ...prev, selectedOption: option }));

    if (currentQuestion?.isTricky && !gameState.initialSelection) {
        setGameState(prev => ({
            ...prev,
            isConfirming: true,
            initialSelection: { option, isCorrect: option.isCorrect }
        }));
    } else {
        processAnswer(option);
    }
  };

  const handleConfirmAnswer = (isSure: boolean) => {
    setGameState(prev => ({ ...prev, isConfirming: false }));
    if (isSure && gameState.selectedOption) {
        processAnswer(gameState.selectedOption);
    } else {
        setGameState(prev => ({
          ...prev,
          selectedOption: null, // Allow user to select another option
        }));
    }
  };
  
  const handleNext = () => {
    let missionFailed = gameState.missionFailed;
    let bonusLivesLeft = gameState.bonusLives;
    let lifeUsed = false;

    if (missionFailed && bonusLivesLeft > 0) {
      bonusLivesLeft--;
      missionFailed = false; // Override failure
      lifeUsed = true;
    }

    if (missionFailed) {
      setGameState(prev => ({ ...prev, showMissionFailedScreen: true }));
      return;
    }

    const commonReset = {
        selectedOption: null,
        isAnswered: false,
        initialSelection: null,
        specialFeedback: null,
        lifeUsedMessage: lifeUsed ? "¡Has usado una vida extra para continuar!" : null,
    };

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
          bonusLives: bonusLivesLeft,
          ...commonReset,
        }));
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.set('score', gameState.score.toString());
        params.set('totalQuestions', totalQuestions.toString());
        params.set('bonusLives', bonusLivesLeft.toString());
        router.push(`/${quizType}/results?${params.toString()}`);
      }
    }
  };

  const startMission = () => {
    setGameState(prev => ({ ...prev, showMissionIntro: false, lifeUsedMessage: null }));
  };

  const restartMission = () => {
    setGameState(prev => ({
      ...prev,
      score: prev.score - prev.missionScore,
      currentQuestionIndex: 0,
      selectedOption: null,
      isAnswered: false,
      showMissionIntro: true,
      showMissionFailedScreen: false,
      missionFailed: false,
      missionScore: 0,
      initialSelection: null,
      specialFeedback: null,
    }));
  };

  if (!quiz || !currentMission) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cargando...</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Preparando tu misión. Por favor, espera.</p>
        </CardContent>
      </Card>
    );
  }

  if (gameState.showMissionFailedScreen) {
    return (
      <Card className="animate-fade-in text-center rounded-lg shadow-lg">
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
          <Button onClick={restartMission} size="lg" className="w-full rounded-lg text-background">
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
          <Button onClick={startMission} size="lg" className="w-full rounded-lg text-background">
            Comenzar Misión
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!currentQuestion) return <p>Error: No se encontró la pregunta.</p>;
  
  const questionKey = `${gameState.currentMissionIndex}-${gameState.currentQuestionIndex}`;

  return (
    <div className="space-y-6">
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
            <AlertDialogAction onClick={() => handleConfirmAnswer(true)} className="text-background">Sí, estoy seguro</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex justify-between items-center space-x-4">
        <div className="space-y-2 flex-grow">
          <p className="text-sm text-muted-foreground">Pregunta {questionsAnswered + 1} de {totalQuestions}</p>
          <Progress value={progressValue} className="transition-all duration-500 rounded-lg h-3" />
        </div>
        <div className="relative flex items-center gap-2 bg-white p-2 rounded-full shadow-md">
          <Avatar className="h-10 w-10 text-primary" />
          {gameState.bonusLives > 0 && (
            <div className="flex items-center gap-1 text-primary font-bold pr-2">
              <Heart className="h-5 w-5" />
              <span>x{gameState.bonusLives}</span>
            </div>
          )}
        </div>
      </div>
      <Card key={questionKey} className="animate-fade-in bg-card shadow-lg rounded-lg border-primary/20">
        <CardHeader>
          <CardTitle className="text-2xl leading-snug text-primary">{currentQuestion.text}</CardTitle>
          <CardDescription>{currentMission.title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentQuestion.options.map((option, index) => {
            const isSelected = gameState.selectedOption?.text === option.text;
            const isCorrect = option.isCorrect;

            let buttonColor = 'border-primary/30 text-primary hover:bg-primary/10';

            if (gameState.isAnswered) {
              if (isCorrect) {
                buttonColor = 'bg-accent text-accent-foreground border-accent';
              } else if (isSelected) {
                buttonColor = 'bg-destructive text-destructive-foreground border-destructive';
              } else {
                 buttonColor = 'border-gray-300 text-gray-500 bg-gray-50';
              }
            } else if (isSelected) {
              buttonColor = 'bg-primary/20 border-primary';
            }
            
            return (
              <Button
                key={index}
                onClick={() => handleOptionSelect(option)}
                disabled={gameState.isAnswered}
                size="lg"
                variant="outline"
                className={cn("w-full justify-start text-left h-auto py-3 whitespace-normal rounded-lg transition-all", buttonColor)}
              >
                <>
                  {gameState.isAnswered && (
                    isCorrect ? <CheckCircle className="mr-3" /> :
                    isSelected ? <XCircle className="mr-3" /> :
                    <span className="w-8 mr-3"></span>
                  )}
                  {!gameState.isAnswered && <span className="w-8 mr-3"></span>}
                  {option.text}
                </>
              </Button>
            );
          })}
        </CardContent>

        {gameState.isAnswered && (
          <CardFooter className="flex-col items-stretch space-y-4">
            <Alert variant={!gameState.missionFailed ? 'default' : 'destructive'} className="bg-card rounded-lg border-2">
              <AlertTitle>{!gameState.missionFailed ? '¡Correcto!' : '¡Ups! Respuesta incorrecta.'}</AlertTitle>
              <AlertDescription>
                 {gameState.specialFeedback || (!gameState.missionFailed ? '¡Excelente! Sigamos adelante.' : 'Has perdido tu única vida. Deberás reiniciar la misión para continuar.')}
              </AlertDescription>
            </Alert>
            <Button onClick={handleNext} className="w-full rounded-lg text-background" size="lg">
              Siguiente <ArrowRight className="ml-2" />
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <QuizComponent />
    </Suspense>
  )
}
