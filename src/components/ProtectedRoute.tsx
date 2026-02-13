
'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  // Auth temporalmente deshabilitada para desarrollo
  return <>{children}</>;
}
