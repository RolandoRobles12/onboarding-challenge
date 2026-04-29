'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminRouteProps {
  children: React.ReactNode;
  requiredRoles?: ('super_admin' | 'admin' | 'trainer')[];
}

/**
 * Componente para proteger rutas del panel de administración
 * Solo permite acceso a usuarios con roles de admin o capacitador
 */
export function AdminRoute({ children, requiredRoles = ['super_admin', 'admin'] }: AdminRouteProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (profile && !requiredRoles.includes(profile.rol as 'super_admin' | 'admin' | 'trainer')) {
      router.replace('/');
    }
  }, [user, profile, loading, router, requiredRoles]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card>
          <CardHeader>
            <CardTitle>Cargando...</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Verificando permisos...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || !profile) return null;

  if (!requiredRoles.includes(profile.rol as 'super_admin' | 'admin' | 'trainer')) return null;

  return <>{children}</>;
}
