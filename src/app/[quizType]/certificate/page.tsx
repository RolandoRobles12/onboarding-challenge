'use client'

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Certificate } from '@/components/Certificate';
import { quizzes } from '@/lib/questions';

function CertificateContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const quizType = searchParams.get('quizType');
    const fullName = searchParams.get('fullName');
    const scoreStr = searchParams.get('score');
    const totalQuestionsStr = searchParams.get('totalQuestions');

    const quiz = quizzes[quizType || ''];

    useEffect(() => {
        if (!quizType || !fullName || !scoreStr || !totalQuestionsStr || !quiz) {
            router.push('/');
        }
    }, [quizType, fullName, scoreStr, totalQuestionsStr, quiz, router]);


    if (!quizType || !fullName || !scoreStr || !totalQuestionsStr || !quiz) {
        return null;
    }

    const score = parseInt(scoreStr, 10);
    const totalQuestions = parseInt(totalQuestionsStr, 10);

  return (
    <Certificate
        fullName={fullName}
        quizTitle={quiz.title}
        score={score}
        totalQuestions={totalQuestions}
        date={new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
    />
  );
}


export default function CertificatePage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
          <Card className="rounded-lg">
              <CardHeader>
                  <CardTitle>Generando certificado...</CardTitle>
              </CardHeader>
              <CardContent>
                  <p>Estamos preparando tu reconocimiento. ¡Un momento!</p>
              </CardContent>
          </Card>
      }>
          <CertificateContent />
      </Suspense>
    </ProtectedRoute>
  )
}
