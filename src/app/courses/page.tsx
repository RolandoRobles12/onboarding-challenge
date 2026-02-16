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
  BookOpen,
  Video,
  FileText,
  Headphones,
  Globe,
  ChevronLeft,
  LogOut,
  ShieldCheck,
  Clock,
  ListOrdered,
  RefreshCw,
} from 'lucide-react';

const UPCOMING_FEATURES = [
  {
    icon: Video,
    title: 'Lecciones en video',
    description: 'Videos con streaming o carga directa, con seguimiento de progreso.',
  },
  {
    icon: FileText,
    title: 'Documentos y presentaciones',
    description: 'Sube PDFs, PPTs y DOCs directamente al curso.',
  },
  {
    icon: Headphones,
    title: 'Audio lessons',
    description: 'Contenido en formato podcast para aprender en movimiento.',
  },
  {
    icon: Globe,
    title: 'Contenido embebido',
    description: 'Integra iFrames, SCORM y recursos externos.',
  },
  {
    icon: ListOrdered,
    title: 'Navegación secuencial o libre',
    description: 'Define si el alumno avanza en orden o a su ritmo.',
  },
  {
    icon: RefreshCw,
    title: 'Re-certificación automática',
    description: 'Cursos que vencen y se re-asignan automáticamente por compliance.',
  },
  {
    icon: Clock,
    title: 'Tiempo límite configurable',
    description: 'Establece días máximos para completar cada curso.',
  },
];

export default function CoursesPage() {
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
                    <Link href="/admin/courses">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 hidden sm:flex gap-1"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Gestionar cursos
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
                <span className="text-accent-foreground font-semibold text-sm">Cursos</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <h1 className="text-3xl sm:text-4xl font-bold font-headline">Cursos</h1>
                <Badge className="bg-sky-100 text-sky-800 border-sky-200 text-xs">
                  Próximamente
                </Badge>
              </div>
              <p className="mt-1 text-accent-foreground/80">
                Contenido estructurado con videos, documentos y evaluaciones.
              </p>
            </div>
          </header>

          <main className="flex-grow p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-8">

              {/* Hero coming soon */}
              <div className="text-center py-10 space-y-4">
                <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-xl">
                  <BookOpen className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">
                  El módulo de Cursos está en desarrollo
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
                  Estamos construyendo un <strong>Course Authoring Engine</strong> completo que te
                  permitirá crear, publicar y gestionar cursos con múltiples tipos de contenido,
                  evaluaciones integradas y certificación automática.
                </p>
                <Button asChild variant="outline" className="mt-2">
                  <Link href="/">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Volver al LMS
                  </Link>
                </Button>
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
                      <Card key={feat.title} className="border border-dashed border-muted-foreground/20 bg-muted/20">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="h-5 w-5 text-sky-500" />
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
