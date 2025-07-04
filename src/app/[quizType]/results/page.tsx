import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Award, Star, MessageSquareQuote } from 'lucide-react';
import Link from 'next/link';
import { generateMotivationalFeedback } from '@/ai/flows/motivational-feedback';

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

async function ResultsContent({ searchParams }: Props) {
  const quizType = searchParams.quizType as string;
  const fullName = searchParams.fullName as string;
  const scoreStr = searchParams.score as string;
  const totalQuestionsStr = searchParams.totalQuestions as string;

  if (!quizType || !fullName || !scoreStr || !totalQuestionsStr) {
    return notFound();
  }

  const score = parseInt(scoreStr, 10);
  const totalQuestions = parseInt(totalQuestionsStr, 10);
  const level = getLevel(score, totalQuestions);

  const aiFeedback = await generateMotivationalFeedback({
    quizTopic: quizType === 'ba' ? 'Aviva Tu Compra' : 'Aviva Tu Negocio',
    score: score,
  });

  return (
    <Card className="text-center animate-fade-in">
      <CardHeader>
        <Award className="mx-auto h-16 w-16 text-primary" />
        <CardTitle className="text-3xl font-headline mt-4">¡Misión Cumplida, {fullName}!</CardTitle>
        <CardDescription>Has completado tu entrenamiento en AvivaQuest.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted p-6 rounded-lg">
          <p className="text-lg font-semibold">Tu puntaje final es:</p>
          <p className="text-6xl font-bold text-primary">
            {score}<span className="text-3xl text-muted-foreground">/{totalQuestions}</span>
          </p>
        </div>

        <div className="text-center">
          <Star className="mx-auto h-8 w-8 text-yellow-400" />
          <h3 className="text-xl font-semibold mt-2">{level.name}</h3>
          <p className="text-muted-foreground">{level.description}</p>
        </div>

        <div className="text-center p-4 border rounded-lg bg-card">
          <MessageSquareQuote className="mx-auto h-8 w-8 text-accent" />
          <blockquote className="mt-2 text-lg italic">
            "{aiFeedback.message}"
          </blockquote>
        </div>

        <Button asChild size="lg" className="w-full">
          <Link href="/">Finalizar y volver al inicio</Link>
        </Button>
      </CardContent>
    </Card>
  );
}


export default function ResultsPage({ searchParams }: Props) {
  return (
      <Suspense fallback={
          <Card>
              <CardHeader>
                  <CardTitle>Calculando resultados...</CardTitle>
              </CardHeader>
              <CardContent>
                  <p>Estamos procesando tu hazaña. ¡Un momento!</p>
              </CardContent>
          </Card>
      }>
          <ResultsContent searchParams={searchParams} />
      </Suspense>
  )
}
