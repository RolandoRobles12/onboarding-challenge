'use client';

import { UserInfoForm } from '@/components/UserInfoForm';
import { quizzes } from '@/lib/questions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useEffect, useState } from 'react';
import { getProduct, getQuizzes } from '@/lib/firestore-service';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  params: { quizType: string };
};

export default function UserInfoPage({ params }: Props) {
  const { quizType } = params;
  const hardcodedQuiz = quizzes[quizType];

  const [productName, setProductName] = useState<string | null>(hardcodedQuiz?.title || null);
  const [loading, setLoading] = useState(!hardcodedQuiz);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (hardcodedQuiz) return;

    async function loadFromFirestore() {
      try {
        // Try loading as product ID from Firestore
        const product = await getProduct(quizType);
        if (product) {
          setProductName(product.name);
          setLoading(false);
          return;
        }

        // Try loading as quiz ID
        const quizzesForType = await getQuizzes(quizType, false);
        if (quizzesForType.length > 0) {
          setProductName(quizzesForType[0].title);
          setLoading(false);
          return;
        }

        setNotFound(true);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    loadFromFirestore();
  }, [quizType, hardcodedQuiz]);

  if (loading) {
    return (
      <ProtectedRoute>
        <Card className="bg-card shadow-lg rounded-lg border-primary/20">
          <CardHeader>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </ProtectedRoute>
    );
  }

  if (notFound || (!hardcodedQuiz && !productName)) {
    return (
      <ProtectedRoute>
        <Card className="bg-card shadow-lg rounded-lg border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive">Quiz no encontrado</CardTitle>
            <CardDescription>
              El quiz o producto "{quizType}" no existe en la plataforma.
            </CardDescription>
          </CardHeader>
        </Card>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Card className="bg-card shadow-lg rounded-lg border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-headline text-accent">¡Casi listos para la aventura!</CardTitle>
          <CardDescription>
            Estás a punto de iniciar el desafío de{' '}
            <span className="font-semibold text-primary">{productName}</span>.
            <br />
            Primero, necesitamos algunos datos para registrar tu progreso:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserInfoForm quizType={quizType} />
        </CardContent>
      </Card>
    </ProtectedRoute>
  );
}
