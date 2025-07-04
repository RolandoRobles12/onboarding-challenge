
'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return; 
    }

    if (!user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Card>
                <CardHeader>
                    <CardTitle>Redirigiendo...</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Verificando acceso. Serás redirigido en breve.</p>
                </CardContent>
            </Card>
        </div>
    );
  }
  
  return <>{children}</>;
}
