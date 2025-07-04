import { UserInfoForm } from '@/components/UserInfoForm';
import { quizzes } from '@/lib/questions';
import { notFound } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import ProtectedRoute from '@/components/ProtectedRoute';

type Props = {
  params: { quizType: string };
};

export default function UserInfoPage({ params }: Props) {
  const { quizType } = params;
  const quiz = quizzes[quizType];

  if (!quiz) {
    notFound();
  }

  return (
    <ProtectedRoute>
        <Card className="bg-card shadow-lg rounded-lg border-primary/20">
        <CardHeader>
            <CardTitle className="text-3xl font-headline text-accent">¡Casi listos para la aventura!</CardTitle>
            <CardDescription>
            Estás a punto de iniciar el desafío de <span className="font-semibold text-primary">{quiz.title}</span>.
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
