'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import {
  Route,
  Users,
  Shuffle,
  Award,
  ChevronLeft,
  LogOut,
  ShieldCheck,
  Target,
  BookOpen,
  CheckCircle,
} from 'lucide-react';

const UPCOMING_FEATURES = [
  {
    icon: Route,
    title: 'Itinerarios configurables',
    description: 'Combina cursos, desafíos y evaluaciones en una ruta secuencial o libre.',
  },
  {
    icon: Target,
    title: 'Pre-requisitos entre pasos',
    description: 'Controla qué pasos deben completarse antes de desbloquear el siguiente.',
  },
  {
    icon: BookOpen,
    title: 'Tipos de contenido mixtos',
    description: 'Incluye cursos de contenido, desafíos gamificados y evaluaciones formales.',
  },
  {
    icon: Users,
    title: 'Auto-asignación por rol o grupo',
    description: 'Asigna automáticamente rutas según el rol, branch o grupo del usuario.',
  },
  {
    icon: Award,
    title: 'Certificado al completar la ruta',
    description: 'Emite un certificado formal al terminar todos los pasos requeridos.',
  },
  {
    icon: Shuffle,
    title: 'Encadenamiento de certificaciones',
    description: 'Diseña programas de compliance con re-certificaciones automáticas.',
  },
  {
    icon: CheckCircle,
    title: 'Score mínimo por paso',
    description: 'Define un porcentaje mínimo de aprobación para avanzar en la ruta.',
  },
];

export default function LearningPathsPage() {
  const { user, profile, logout } = useAuth();
  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">
          {/* Header */}
          <header className="bg-accent text-accent-foreground py-4 sm:py-6 px-4">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <Link href="/" aria-label="Volver al LMS">
                  <AvivaLogo className="h-10 sm:h-12 w-auto" />
                </Link>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Link href="/admin/learning-paths">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 hidden sm:flex gap-1"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Gestionar rutas
                      </Button>
                    </Link>
                  )}
                  {user && (
                    <Button
                      variant="ghost"
                      onClick={logout}
                      className="text-accent-foreground hover:bg-accent/20"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Salir</span>
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="flex items-center gap-1 text-accent-foreground/70 hover:text-accent-foreground text-sm transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  LMS
                </Link>
                <span className="text-accent-foreground/40">/</span>
                <span className="text-accent-foreground font-semibold text-sm">
                  Rutas de Aprendizaje
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <h1 className="text-3xl sm:text-4xl font-bold font-headline">
                  Rutas de Aprendizaje
                </h1>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                  Próximamente
                </Badge>
              </div>
              <p className="mt-1 text-accent-foreground/80">
                Itinerarios formativos que combinan cursos, desafíos y evaluaciones.
              </p>
            </div>
          </header>

          <main className="flex-grow p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-8">

              {/* Hero coming soon */}
              <div className="text-center py-10 space-y-4">
                <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-xl">
                  <Route className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">
                  Las Rutas de Aprendizaje están en desarrollo
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
                  Estamos construyendo un <strong>Assignment Engine</strong> que te permitirá
                  diseñar itinerarios formativos completos: desde el onboarding de nuevos
                  ingresos hasta programas de compliance y academias corporativas.
                </p>

                {/* Architecture preview */}
                <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-mono mt-2">
                  <span>Usuario</span>
                  <span>→</span>
                  <span className="font-semibold">Ruta</span>
                  <span>→</span>
                  <span>Curso</span>
                  <span>→</span>
                  <span>Desafío</span>
                  <span>→</span>
                  <span>Certificado</span>
                </div>

                <div>
                  <Button asChild variant="outline" className="mt-2">
                    <Link href="/">
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Volver al LMS
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Feature preview */}
              <div>
                <h3 className="text-base font-semibold text-foreground/60 uppercase tracking-wide mb-4 text-sm">
                  Lo que incluirá este módulo
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {UPCOMING_FEATURES.map((feat) => {
                    const Icon = feat.icon;
                    return (
                      <Card
                        key={feat.title}
                        className="border border-dashed border-muted-foreground/20 bg-muted/20"
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5 text-emerald-500" />
                            <CardTitle className="text-sm font-semibold">{feat.title}</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <CardDescription className="text-xs">{feat.description}</CardDescription>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

            </div>
          </main>

          <footer className="bg-accent text-accent-foreground/80 py-4 px-4 sm:px-8 mt-8">
            <div className="max-w-7xl mx-auto text-center text-sm">
              <p>&copy; {new Date().getFullYear()} Aviva. Todos los derechos reservados.</p>
            </div>
          </footer>
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
