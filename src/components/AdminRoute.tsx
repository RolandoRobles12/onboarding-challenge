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
  const { user, profile, loading, isAdmin, isTrainer } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // Si no hay usuario, redirigir a login
      if (!user) {
        router.push('/login');
        return;
      }

      // Si no hay perfil aún, esperar
      if (!profile) {
        return;
      }

      // Verificar si el usuario tiene el rol requerido
      const hasRequiredRole = requiredRoles.includes(profile.role as any);

      if (!hasRequiredRole) {
        // Redirigir a la página principal si no tiene permisos
        router.push('/');
      }
    }
  }, [user, profile, loading, router, requiredRoles]);

  // Mostrar loading mientras verifica
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card>
          <CardHeader>
            <CardTitle>Verificando permisos...</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Un momento por favor</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mostrar error si no tiene perfil
  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error al cargar perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <p>No se pudo cargar tu perfil de usuario. Por favor, intenta cerrar sesión y volver a iniciar.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verificar permisos antes de mostrar contenido
  const hasRequiredRole = requiredRoles.includes(profile.role as any);

  if (!hasRequiredRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Acceso Denegado</CardTitle>
          </CardHeader>
          <CardContent>
            <p>No tienes permisos para acceder a esta sección.</p>
            <p className="text-sm text-muted-foreground mt-2">Tu rol: {profile.role}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Si todo está bien, mostrar el contenido
  return <>{children}</>;
}
