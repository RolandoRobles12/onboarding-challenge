'use client';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import {
  LogOut,
  ShieldCheck,
  Target,
  BookOpen,
  Route,
  Award,
  ChevronRight,
  Zap,
  Lock,
} from 'lucide-react';
import type { LMSModuleCard } from '@/lib/types-lms';

const LMS_MODULES: LMSModuleCard[] = [
  {
    id: 'challenges',
    title: 'Desafíos',
    description:
      'Evaluaciones gamificadas por producto. Pon a prueba tu conocimiento, sube en el ranking y gana certificados.',
    icon: 'Target',
    href: '/challenges',
    color: '#7C3AED',
    gradient: 'from-violet-600 to-purple-700',
    status: 'active',
    adminHref: '/admin/quizzes',
  },
  {
    id: 'courses',
    title: 'Cursos',
    description:
      'Contenido estructurado con videos, presentaciones, documentos y evaluaciones. Aprende a tu ritmo.',
    icon: 'BookOpen',
    href: '/courses',
    color: '#0284C7',
    gradient: 'from-sky-500 to-blue-600',
    status: 'coming_soon',
    adminHref: '/admin/courses',
  },
  {
    id: 'learning_paths',
    title: 'Rutas de Aprendizaje',
    description:
      'Itinerarios formativos secuenciales. Combina cursos, desafíos y evaluaciones en programas completos.',
    icon: 'Route',
    href: '/learning-paths',
    color: '#059669',
    gradient: 'from-emerald-500 to-green-600',
    status: 'coming_soon',
    adminHref: '/admin/learning-paths',
  },
  {
    id: 'certifications',
    title: 'Mis Certificados',
    description:
      'Consulta todos tus certificados, fechas de vencimiento y procesos de re-certificación activos.',
    icon: 'Award',
    href: '/certifications',
    color: '#D97706',
    gradient: 'from-amber-500 to-orange-500',
    status: 'coming_soon',
  },
];

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    Target,
    BookOpen,
    Route,
    Award,
  };
  const Icon = icons[name] ?? Target;
  return <Icon className={className} />;
}

function ModuleCard({ mod }: { mod: LMSModuleCard }) {
  const isActive = mod.status === 'active';
  const isBeta = mod.status === 'beta';

  return (
    <Card
      className={`relative overflow-hidden border-2 transition-all duration-300 group ${
        isActive
          ? 'hover:shadow-xl hover:-translate-y-1 border-transparent hover:border-primary/20 cursor-pointer'
          : 'opacity-75 border-dashed border-muted'
      }`}
    >
      {/* Top color bar */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${mod.gradient}`} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div
            className={`h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-md bg-gradient-to-br ${mod.gradient}`}
          >
            <ModuleIcon name={mod.icon} className="h-6 w-6" />
          </div>
          {!isActive && (
            <Badge variant="secondary" className="text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Próximamente
            </Badge>
          )}
          {isBeta && (
            <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
              <Zap className="h-3 w-3 mr-1" />
              Beta
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg font-bold mt-3">{mod.title}</CardTitle>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        <CardDescription className="text-sm leading-relaxed text-foreground/70">
          {mod.description}
        </CardDescription>

        {isActive ? (
          <Button asChild className={`w-full text-white bg-gradient-to-r ${mod.gradient} hover:opacity-90`}>
            <Link href={mod.href}>
              Ir al módulo <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled>
            Disponible pronto
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function LMSDashboard() {
  const { user, profile, logout } = useAuth();
  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);
  const firstName = user?.displayName?.split(' ')[0] || 'Explorador';

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">
          {/* Header */}
          <header className="bg-accent text-accent-foreground py-4 sm:py-6 px-4">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <Link href="/" aria-label="Aviva LMS">
                  <AvivaLogo className="h-10 sm:h-12 w-auto" />
                </Link>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Link href="/admin">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 hidden sm:flex gap-1"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" /> Admin
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

              <div>
                <h1 className="text-2xl sm:text-4xl font-bold font-headline">Aviva LMS</h1>
                <p className="mt-1 text-sm sm:text-base text-accent-foreground/80">
                  Bienvenido, <span className="font-semibold">{firstName}</span>. ¿Qué quieres aprender hoy?
                </p>
              </div>
            </div>
          </header>

          {/* Main */}
          <main className="flex-grow p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-8">

              {/* Module grid */}
              <section>
                <h2 className="text-lg font-semibold text-foreground/70 mb-4 uppercase tracking-wide text-sm">
                  Módulos de aprendizaje
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {LMS_MODULES.map((mod) => (
                    <ModuleCard key={mod.id} mod={mod} />
                  ))}
                </div>
              </section>

              {/* Info strip */}
              <section className="rounded-xl border border-primary/10 bg-primary/5 p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Plataforma en evolución</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Aviva LMS está creciendo. Los módulos de <strong>Cursos</strong>,{' '}
                      <strong>Rutas de Aprendizaje</strong> y <strong>Mis Certificados</strong> estarán
                      disponibles próximamente. Por ahora, comienza con los{' '}
                      <Link href="/challenges" className="text-primary underline underline-offset-2 font-medium">
                        Desafíos
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </section>

            </div>
          </main>

          {/* Footer */}
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
