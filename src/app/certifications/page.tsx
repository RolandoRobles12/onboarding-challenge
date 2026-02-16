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
  Award,
  Shield,
  RefreshCw,
  Hash,
  Palette,
  Bell,
  ChevronLeft,
  LogOut,
} from 'lucide-react';

const UPCOMING_FEATURES = [
  {
    icon: Award,
    title: 'Certificados automáticos',
    description: 'Se generan al completar cursos, desafíos y rutas de aprendizaje.',
  },
  {
    icon: Palette,
    title: 'Plantillas personalizables',
    description: 'Branding, logos y firma digital en cada certificado.',
  },
  {
    icon: Hash,
    title: 'Validación por ID único',
    description: 'Cada certificado tiene un código único verificable externamente.',
  },
  {
    icon: RefreshCw,
    title: 'Re-certificación automática',
    description: 'El sistema reasigna el curso cuando el certificado vence.',
  },
  {
    icon: Bell,
    title: 'Alertas de vencimiento',
    description: 'Notificaciones automáticas días antes de que expire la certificación.',
  },
  {
    icon: Shield,
    title: 'Compliance tracking',
    description: 'Visualiza el estado de certificaciones obligatorias por rol o equipo.',
  },
];

export default function CertificationsPage() {
  const { user, logout } = useAuth();

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
                  Mis Certificados
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <h1 className="text-3xl sm:text-4xl font-bold font-headline">Mis Certificados</h1>
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                  Próximamente
                </Badge>
              </div>
              <p className="mt-1 text-accent-foreground/80">
                Historial de certificaciones, fechas de vencimiento y estado de cumplimiento.
              </p>
            </div>
          </header>

          <main className="flex-grow p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-8">

              {/* Hero coming soon */}
              <div className="text-center py-10 space-y-4">
                <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-xl">
                  <Award className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">
                  El módulo de Certificados está en desarrollo
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
                  Estamos construyendo un <strong>Certification Engine</strong> que centralizará
                  todos tus certificados, mostrará el estado de cumplimiento y gestionará los
                  ciclos de re-certificación automáticamente.
                </p>

                {/* Lifecycle preview */}
                <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 font-mono mt-2">
                  <span>Aprobación</span>
                  <span>→</span>
                  <span className="font-semibold">Certificado</span>
                  <span>→</span>
                  <span>Vencimiento</span>
                  <span>→</span>
                  <span>Renovación</span>
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
                            <Icon className="h-5 w-5 text-amber-500" />
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
