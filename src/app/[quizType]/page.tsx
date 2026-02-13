'use client';

import React from 'react';
import { UserInfoForm } from '@/components/UserInfoForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useEffect, useState } from 'react';
import { getProduct } from '@/lib/firestore-service';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  params: Promise<{ quizType: string }>;
};

export default function UserInfoPage({ params }: Props) {
  const resolvedParams = React.use(params);
  const { quizType } = resolvedParams;
  const [productName, setProductName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadProduct() {
      try {
        const product = await getProduct(quizType);
        if (product) {
          setProductName(product.name);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    loadProduct();
  }, [quizType]);

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

  if (notFound || !productName) {
    return (
      <ProtectedRoute>
        <Card className="bg-card shadow-lg rounded-lg border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive">Producto no encontrado</CardTitle>
            <CardDescription>
              El producto "{quizType}" no existe en la plataforma.
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
