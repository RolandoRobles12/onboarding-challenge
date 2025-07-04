'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { quizzes } from '@/lib/questions';
import type { Option } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, ArrowRight, BookOpen } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAvatarComponent } from '@/lib/avatars';

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

    setGameState(prev => ({
      ...prev,
      selectedOption: option,
      isAnswered: true,
      score: option.isCorrect ? prev.score + 1 : prev.score,
    }));
  };

  const handleNext = () => {
    if (gameState.currentQuestionIndex < (currentMission?.questions.length || 0) - 1) {
      // Next question in the same mission
      setGameState(prev => ({
        ...prev,
        currentQuestionIndex: prev.currentQuestionIndex + 1,
        selectedOption: null,
        isAnswered: false,
      }));
    } else {
      // End of mission, check for next mission
      if (gameState.currentMissionIndex < (quiz?.missions.length || 0) - 1) {
        // Next mission
        setGameState(prev => ({
          ...prev,
          currentMissionIndex: prev.currentMissionIndex + 1,
          currentQuestionIndex: 0,
          selectedOption: null,
          isAnswered: false,
          showMissionIntro: true,
        }));
      } else {
        // End of quiz
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

  if (gameState.showMissionIntro) {
    return (
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="text-3xl font-headline flex items-center">
            <BookOpen className="mr-3 text-primary" />
            {currentMission.title}
          </CardTitle>
          <CardDescription>Misión {gameState.currentMissionIndex + 1} de {quiz.missions.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-lg leading-relaxed">{currentMission.narrative}</p>
        </CardContent>
        <CardFooter>
          <Button onClick={startMission} size="lg" className="w-full">
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
          <Progress value={progressValue} className="transition-all duration-500" />
        </div>
        <div className="flex-shrink-0">
          <Avatar className="h-12 w-12 text-primary bg-muted rounded-full p-2" />
        </div>
      </div>
      <Card key={questionKey} className="animate-fade-in">
        <CardHeader>
          <CardTitle className="text-2xl leading-snug">{currentQuestion.text}</CardTitle>
          <CardDescription>{currentMission.title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentQuestion.options.map((option, index) => {
            const isSelected = gameState.selectedOption === option;
            const isCorrect = option.isCorrect;
            let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
            if (gameState.isAnswered) {
              if (isCorrect) variant = 'default';
              if (isSelected && !isCorrect) variant = 'destructive';
              if (!isSelected && !isCorrect) variant = 'outline';
            }
            
            return (
              <Button
                key={index}
                onClick={() => handleOptionSelect(option)}
                disabled={gameState.isAnswered}
                size="lg"
                variant={variant}
                className="w-full justify-start text-left h-auto py-3 whitespace-normal"
              >
                {gameState.isAnswered && (
                    isCorrect ? <CheckCircle className="mr-3 text-accent-foreground" /> :
                    isSelected ? <XCircle className="mr-3" /> :
                    <span className="w-8 mr-3"></span>
                )}
                {!gameState.isAnswered && <span className="w-8 mr-3"></span>}
                {option.text}
              </Button>
            );
          })}
        </CardContent>
        {gameState.isAnswered && (
          <CardFooter className="flex-col items-stretch space-y-4">
            <Alert variant={gameState.selectedOption?.isCorrect ? 'default' : 'destructive'} className="bg-card">
              <AlertTitle>{gameState.selectedOption?.isCorrect ? '¡Correcto!' : '¡Ups! Respuesta incorrecta.'}</AlertTitle>
              <AlertDescription>
                 {gameState.selectedOption?.isCorrect ? '¡Excelente! Sigamos adelante.' : 'No te preocupes, ¡lo importante es aprender!'}
              </AlertDescription>
            </Alert>
            <Button onClick={handleNext} className="w-full" size="lg">
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
