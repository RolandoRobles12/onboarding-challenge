'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { useAuth } from '@/context/AuthContext';
import {
  getExplorableJourneys,
  getUserJourneyProgress,
  getProducts,
} from '@/lib/firestore-service';
import type { Journey, JourneyStep, Product } from '@/lib/types-scalable';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';

interface EarnedCertificate {
  journey: Journey;
  step: JourneyStep;
  product?: Product;
  doneCount: number;
  totalCount: number;
}

export default function CertificationsPage() {
  const { user, profile, logout } = useAuth();
  const [certificates, setCertificates] = useState<EarnedCertificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile) return;
    let cancelled = false;

    (async () => {
      try {
        const [journeys, products] = await Promise.all([
          getExplorableJourneys().catch(() => [] as Journey[]),
          getProducts().catch(() => [] as Product[]),
        ]);
        const productMap = new Map(products.map(p => [p.id, p]));

        const results = await Promise.all(
          journeys.map(async (journey): Promise<EarnedCertificate | null> => {
            const allSteps: JourneyStep[] = journey.stages?.length
              ? journey.stages.flatMap(s => s.actions ?? [])
              : journey.steps ?? [];
            const certStep = allSteps.find(s => s.type === 'certificate');
            if (!certStep) return null;

            const progress = await getUserJourneyProgress(user.uid, journey.id).catch(() => null);
            const completedIds = new Set(progress?.completedStepIds ?? []);
            if (!completedIds.has(certStep.id)) return null;

            return {
              journey,
              step: certStep,
              product: productMap.get(journey.productId),
              doneCount: completedIds.size,
              totalCount: allSteps.length || 1,
            };
          })
        );

        if (!cancelled) setCertificates(results.filter((c): c is EarnedCertificate => c !== null));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, profile]);

  const certificateHref = (c: EarnedCertificate) => {
    const params = new URLSearchParams({
      quizType: c.journey.productId,
      fullName: profile?.nombre || 'Promotor Aviva',
      quizTitle: c.product?.name || c.journey.name || 'tu Ruta Aviva',
      score: String(c.doneCount),
      totalQuestions: String(c.totalCount),
      journeyId: c.journey.id,
      stepId: c.step.id,
    });
    return `/${c.journey.productId}/certificate?${params.toString()}`;
  };

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
                {!loading && certificates.length > 0 && (
                  <Badge className="bg-white/15 text-accent-foreground border-white/20 text-xs">
                    {certificates.length}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-accent-foreground/80">
                Certificados que has obtenido al completar tu Ruta Aviva.
              </p>
            </div>
          </header>

          <main className="flex-grow p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
                </div>
              ) : certificates.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-xl">
                    <Award className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Aún no tienes certificados</h2>
                  <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
                    Completa tu Ruta Aviva hasta el paso de certificación para obtener tu certificado oficial.
                  </p>
                  <Button asChild variant="outline" className="mt-2">
                    <Link href="/">
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Ir a mi Ruta
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {certificates.map(c => (
                    <Card key={c.journey.id} className="overflow-hidden border-amber-200/60">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shrink-0">
                            <Award className="h-5 w-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-base leading-tight truncate">
                              {c.product?.name || c.journey.name}
                            </CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                              {c.journey.name}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-3">
                        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                          Certificado emitido
                        </Badge>
                        <Button asChild size="sm" className="w-full gap-1.5">
                          <Link href={certificateHref(c)}>
                            Ver certificado <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

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
