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
import { getUserCertificates } from '@/lib/firestore-service';
import { syncCertificates } from '@/lib/api-client';
import { certificateHref } from '@/lib/certificates';
import type { UserCertificate } from '@/lib/types-scalable';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';

export default function CertificationsPage() {
  const { user, profile, logout } = useAuth();
  // Certificados ligados al perfil (user_certificates). Los revocados no se muestran.
  const [certs, setCerts] = useState<UserCertificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !profile) return;
    let cancelled = false;

    (async () => {
      try {
        // Registra los que se hayan ganado y aún no tengan registro.
        await syncCertificates();
        const all = await getUserCertificates(user.uid).catch(() => [] as UserCertificate[]);
        if (!cancelled) setCerts(all.filter(c => c.status !== 'revoked'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, profile]);

  const activeCount = certs.filter(c => c.status === 'active').length;

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
                {!loading && activeCount > 0 && (
                  <Badge className="bg-white/15 text-accent-foreground border-white/20 text-xs">
                    {activeCount}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-accent-foreground/80">
                Certificados que has obtenido en tu Ruta Aviva y en tus cursos.
              </p>
            </div>
          </header>

          <main className="flex-grow p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
                </div>
              ) : certs.length === 0 ? (
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
                  {certs.map(c => {
                    const expired = c.status === 'expired';
                    return (
                      <Card key={c.id} className={expired ? 'overflow-hidden opacity-70' : c.kind === 'course' ? 'overflow-hidden border-sky-200/60' : 'overflow-hidden border-amber-200/60'}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${c.kind === 'course' ? 'from-sky-500 to-blue-600' : 'from-amber-500 to-orange-500'} flex items-center justify-center shrink-0`}>
                              <Award className="h-5 w-5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-base leading-tight truncate">{c.title}</CardTitle>
                              <CardDescription className="text-xs mt-0.5">
                                {c.kind === 'course' ? 'Certificado del curso' : 'Ruta Aviva'}
                                {c.issuedAt?.toDate && ` · ${c.issuedAt.toDate().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                          {expired ? (
                            <>
                              <Badge variant="outline" className="text-xs">Vencido: renueva el curso</Badge>
                              <Button asChild size="sm" variant="outline" className="w-full gap-1.5">
                                <Link href={`/courses/${c.courseId}`}>Ir al curso <ChevronRight className="h-3.5 w-3.5" /></Link>
                              </Button>
                            </>
                          ) : (
                            <>
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Certificado emitido</Badge>
                              <Button asChild size="sm" className="w-full gap-1.5">
                                <Link href={certificateHref(c)}>
                                  Ver certificado <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
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
