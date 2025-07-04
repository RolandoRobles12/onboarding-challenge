'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { quizzes } from '@/lib/questions';
import type { Option } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Check, CheckCircle, XCircle, ArrowRight, BookOpen, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAvatarComponent } from '@/lib/avatars';
import { Checkbox } from '@/components/ui/checkbox';

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
    selectedOptions: [] as Option[],
    isAnswered: false,
    showMissionIntro: true,
    missionFailed: false,
    missionScore: 0,
    showMissionFailedScreen: false,
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
  }, [quizType, fullName, router]);

  const handleOptionSelect = (option: Option) => {
    if (gameState.isAnswered) return;

    if (currentQuestion?.multipleCorrect) {
      setGameState(prev => {
        const newSelected = prev.selectedOptions.some(o => o.text === option.text)
          ? prev.selectedOptions.filter(o => o.text !== option.text)
          : [...prev.selectedOptions, option];
        return { ...prev, selectedOptions: newSelected };
      });
    } else {
      const isCorrect = option.isCorrect;
      setGameState(prev => ({
        ...prev,
        selectedOptions: [option],
        isAnswered: true,
        score: isCorrect ? prev.score + 1 : prev.score,
        missionScore: isCorrect ? prev.missionScore + 1 : prev.missionScore,
        missionFailed: !isCorrect,
      }));
    }
  };
  
  const handleConfirmMultipleChoice = () => {
    if (!currentQuestion || gameState.isAnswered) return;

    const correctOptions = currentQuestion.options.filter(o => o.isCorrect);
    const selectedCorrectOptions = gameState.selectedOptions.filter(o => o.isCorrect);
    const selectedIncorrectOptions = gameState.selectedOptions.filter(o => !o.isCorrect);
    
    const isCorrect = selectedCorrectOptions.length === correctOptions.length && selectedIncorrectOptions.length === 0;

    setGameState(prev => ({
      ...prev,
      isAnswered: true,
      score: isCorrect ? prev.score + 1 : prev.score,
      missionScore: isCorrect ? prev.missionScore + 1 : prev.missionScore,
      missionFailed: !isCorrect,
    }));
  };

  const handleNext = () => {
    if (gameState.missionFailed) {
      setGameState(prev => ({ ...prev, showMissionFailedScreen: true }));
      return;
    }

    const commonReset = {
        selectedOptions: [],
        isAnswered: false,
    };

    if (gameState.currentQuestionIndex < (currentMission?.questions.length || 0) - 1) {
      setGameState(prev => ({
        ...prev,
        currentQuestionIndex: prev.currentQuestionIndex + 1,
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
          ...commonReset,
        }));
      } else {
        const params = new URLSearchParams(searchParams.toString());
        params.set('score', gameState.score.toString());
        params.set('totalQuestions', totalQuestions.toString());
        router.push(`/${quizType}/results?${params.toString()}`);
      }
    }
  };

  const startMission = () => {
    setGameState(prev => ({ ...prev, showMissionIntro: false }));
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
      missionScore: 0,
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
          <Button onClick={restartMission} size="lg" className="w-full rounded-lg">
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
          <CardTitle className="text-3xl font-headline flex items-center text-accent">
            <BookOpen className="mr-3 text-primary" />
            {currentMission.title}
          </CardTitle>
          <CardDescription>Misión {gameState.currentMissionIndex + 1} de {quiz.missions.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-lg leading-relaxed">{currentMission.narrative}</p>
        </CardContent>
        <CardFooter>
          <Button onClick={startMission} size="lg" className="w-full rounded-lg">
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
      <div className="flex justify-between items-center space-x-4">
        <div className="space-y-2 flex-grow">
          <p className="text-sm text-muted-foreground">Pregunta {questionsAnswered + 1} de {totalQuestions}</p>
          <Progress value={progressValue} className="transition-all duration-500 rounded-lg h-3" />
        </div>
        <div className="flex-shrink-0 bg-white p-1 rounded-full shadow-md">
          <Avatar className="h-12 w-12 text-primary" />
        </div>
      </div>
      <Card key={questionKey} className="animate-fade-in bg-card shadow-lg rounded-lg border-accent/20">
        <CardHeader>
          <CardTitle className="text-2xl leading-snug text-accent">{currentQuestion.text}</CardTitle>
          {currentQuestion.multipleCorrect && !gameState.isAnswered && (
             <CardDescription>Selecciona todas las respuestas correctas.</CardDescription>
          )}
          <CardDescription>{currentMission.title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentQuestion.options.map((option, index) => {
            const isSelected = gameState.selectedOptions.some(o => o.text === option.text);
            const isCorrect = option.isCorrect;
            let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
            let buttonColor = 'border-accent/30 text-accent hover:bg-accent/10';

            if (gameState.isAnswered) {
              if (isCorrect) {
                variant = 'default';
                buttonColor = 'bg-primary text-primary-foreground';
              } else if (isSelected) {
                variant = 'destructive';
                buttonColor = 'bg-destructive text-destructive-foreground';
              } else {
                 variant = 'outline';
                 buttonColor = 'border-gray-300 text-gray-500';
              }
            }

            return (
              <Button
                key={index}
                onClick={() => handleOptionSelect(option)}
                disabled={gameState.isAnswered && !currentQuestion.multipleCorrect}
                size="lg"
                variant={variant}
                className={cn("w-full justify-start text-left h-auto py-3 whitespace-normal rounded-lg", buttonColor)}
              >
                {currentQuestion.multipleCorrect ? (
                  <div className="flex items-center w-full">
                    <Checkbox
                      checked={isSelected}
                      disabled={gameState.isAnswered}
                      className="mr-3 flex-shrink-0"
                    />
                    <span className="flex-grow">{option.text}</span>
                    {gameState.isAnswered && (
                      <div className="ml-2 flex-shrink-0">
                        {isCorrect ? <CheckCircle /> : isSelected ? <XCircle /> : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {gameState.isAnswered && (
                      isCorrect ? <CheckCircle className="mr-3" /> :
                      isSelected ? <XCircle className="mr-3" /> :
                      <span className="w-8 mr-3"></span>
                    )}
                    {!gameState.isAnswered && <span className="w-8 mr-3"></span>}
                    {option.text}
                  </>
                )}
              </Button>
            );
          })}
        </CardContent>

        {gameState.isAnswered ? (
          <CardFooter className="flex-col items-stretch space-y-4">
            <Alert variant={!gameState.missionFailed ? 'default' : 'destructive'} className="bg-card rounded-lg">
              <AlertTitle>{!gameState.missionFailed ? '¡Correcto!' : '¡Ups! Respuesta incorrecta.'}</AlertTitle>
              <AlertDescription>
                 {!gameState.missionFailed ? '¡Excelente! Sigamos adelante.' : 'Has perdido tu única vida. Deberás reiniciar la misión para continuar.'}
              </AlertDescription>
            </Alert>
            <Button onClick={handleNext} className="w-full rounded-lg" size="lg">
              Siguiente <ArrowRight className="ml-2" />
            </Button>
          </CardFooter>
        ) : currentQuestion.multipleCorrect && (
           <CardFooter>
                <Button onClick={handleConfirmMultipleChoice} className="w-full rounded-lg" size="lg" disabled={gameState.selectedOptions.length === 0}>
                    Verificar Respuesta <Check className="ml-2" />
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
