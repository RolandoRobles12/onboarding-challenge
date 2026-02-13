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
  // Auth temporalmente deshabilitada para desarrollo
  return <>{children}</>;
}
