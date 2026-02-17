'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { AvivaLogo } from '@/components/AvivaLogo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getJourneyByProduct,
  getProducts,
  getUserJourneyProgress,
  markJourneyStepComplete,
} from '@/lib/firestore-service';
import type { Journey, UserJourneyProgress, JourneyStep, Product } from '@/lib/types-scalable';
import {
  LogOut,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ChevronRight,
  FileText,
  HelpCircle,
  BarChart2,
  Award,
  PlayCircle,
  AlertCircle,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Step type metadata ───────────────────────────────────────────────────────

const STEP_META: Record<
  string,
  { icon: React.ElementType; actionLabel: string; revisitLabel: string; href: (productId: string) => string }
> = {
  info_form: {
    icon: FileText,
    actionLabel: 'Ver mis datos',
    revisitLabel: 'Ver mis datos',
    href: () => '#',
  },
  quiz: {
    icon: HelpCircle,
    actionLabel: 'Comenzar evaluación',
    revisitLabel: 'Repetir evaluación',
    href: (productId) => `/${productId}/quiz`,
  },
  results: {
    icon: BarChart2,
    actionLabel: 'Ver resultados',
    revisitLabel: 'Ver resultados',
    href: (productId) => `/${productId}/results`,
  },
  certificate: {
    icon: Award,
    actionLabel: 'Obtener certificado',
    revisitLabel: 'Ver certificado',
    href: (productId) => `/${productId}/certificate`,
  },
};

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  status,
  productId,
  onMarkComplete,
  productColor,
}: {
  step: JourneyStep;
  index: number;
  status: 'completed' | 'current' | 'upcoming';
  productId: string;
  onMarkComplete: (stepId: string) => void;
  productColor: string;
}) {
  const meta = STEP_META[step.type] ?? STEP_META.quiz;
  const Icon = meta.icon;
  const isCurrent = status === 'current';
  const isCompleted = status === 'completed';
  const isUpcoming = status === 'upcoming';

  return (
    <div
      className={cn(
        'relative flex gap-4 rounded-xl border p-4 transition-all duration-200',
        isCompleted && 'bg-green-50 border-green-200',
        isCurrent && 'border-2 shadow-md bg-card',
        isUpcoming && 'bg-muted/30 border-dashed opacity-60'
      )}
      style={isCurrent ? { borderColor: productColor } : {}}
    >
      {/* Connector line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
            isCompleted && 'bg-green-500 text-white',
            isCurrent && 'text-white',
            isUpcoming && 'bg-muted text-muted-foreground'
          )}
          style={isCurrent ? { backgroundColor: productColor } : {}}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : isUpcoming ? (
            <Lock className="h-4 w-4" />
          ) : (
            <PlayCircle className="h-5 w-5" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Paso {index + 1}</span>
              {!step.required && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">Opcional</Badge>
              )}
            </div>
            <h3
              className={cn(
                'font-semibold text-base mt-0.5',
                isUpcoming && 'text-muted-foreground'
              )}
            >
              {step.title}
            </h3>
            {step.config.description && (
              <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                {step.config.description}
              </p>
            )}
          </div>

          {/* Status badge */}
          {isCompleted && (
            <Badge className="bg-green-100 text-green-700 border-green-200 flex-shrink-0">
              Completado
            </Badge>
          )}
          {isCurrent && (
            <Badge className="flex-shrink-0" style={{ backgroundColor: productColor, color: 'white' }}>
              Siguiente
            </Badge>
          )}
          {isUpcoming && (
            <Badge variant="secondary" className="flex-shrink-0">Pendiente</Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          {isCompleted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-green-700 hover:text-green-800 hover:bg-green-50"
              asChild
            >
              <Link href={meta.href(productId)}>
                <Icon className="h-3 w-3" />
                {meta.revisitLabel}
              </Link>
            </Button>
          )}

          {isCurrent && step.type !== 'info_form' && (
            <Button
              size="sm"
              className="gap-1.5 text-sm"
              style={{ backgroundColor: productColor }}
              asChild
            >
              <Link href={meta.href(productId)}>
                {meta.actionLabel}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}

          {isCurrent && step.type === 'info_form' && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-sm"
              onClick={() => onMarkComplete(step.id)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Marcar como completado
            </Button>
          )}
        </div>
      </div>

      {/* Step type icon */}
      <div className={cn('hidden sm:flex items-center justify-center', isUpcoming && 'opacity-40')}>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  );
}

// ─── Journey dashboard ────────────────────────────────────────────────────────

function JourneyDashboard({ userId, profile }: { userId: string; profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [progress, setProgress] = useState<UserJourneyProgress | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  const productId = profile.producto || '';

  useEffect(() => {
    if (!productId) { setLoading(false); return; }

    async function load() {
      try {
        const [allProducts, foundJourney] = await Promise.all([
          getProducts(),
          getJourneyByProduct(productId),
        ]);
        const foundProduct = allProducts.find((p) => p.id === productId) ?? null;
        setProduct(foundProduct);
        setJourney(foundJourney);

        if (foundJourney) {
          const prog = await getUserJourneyProgress(userId, foundJourney.id);
          setProgress(prog);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [productId, userId]);

  const handleMarkComplete = async (stepId: string) => {
    if (!journey) return;
    await markJourneyStepComplete(userId, journey.id, productId, stepId);
    const updated = await getUserJourneyProgress(userId, journey.id);
    setProgress(updated);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // ── No product assigned ──
  if (!productId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-lg">Sin producto asignado</h3>
        <p className="text-muted-foreground text-sm mt-1 max-w-xs">
          Tu administrador aún no te ha asignado un producto. Contáctalo para comenzar.
        </p>
      </div>
    );
  }

  // ── No journey configured ──
  if (!journey) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-lg">Ruta de aprendizaje no configurada</h3>
        <p className="text-muted-foreground text-sm mt-1 max-w-xs">
          Tu administrador aún no ha configurado la ruta para{' '}
          <strong>{product?.name ?? 'tu producto'}</strong>. Vuelve pronto.
        </p>
      </div>
    );
  }

  // ── Compute progress ──
  const completedStepIds = new Set(progress?.completedStepIds ?? []);

  // info_form is always complete if onboardingCompleted
  const sortedSteps = [...journey.steps].sort((a, b) => a.order - b.order);
  sortedSteps.forEach((s) => {
    if (s.type === 'info_form' && profile.onboardingCompleted) {
      completedStepIds.add(s.id);
    }
  });

  const completedCount = sortedSteps.filter((s) => completedStepIds.has(s.id)).length;
  const totalCount = sortedSteps.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isFinished = completedCount === totalCount;

  // The current step = first non-completed step
  const currentStepIndex = sortedSteps.findIndex((s) => !completedStepIds.has(s.id));

  const productColor = product?.color ?? '#7C3AED';

  return (
    <div className="space-y-5">
      {/* ── Hero progress card ── */}
      <div
        className="rounded-xl p-5 text-white relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${productColor}dd, ${productColor}99)` }}
      >
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-white/70 text-sm font-medium uppercase tracking-wide">Tu ruta de aprendizaje</p>
              <h2 className="text-xl font-bold mt-0.5">{journey.name}</h2>
              {product && (
                <p className="text-white/80 text-sm mt-0.5">{product.name}</p>
              )}
            </div>
            {isFinished ? (
              <Badge className="bg-white/20 text-white border-white/30 gap-1">
                <Sparkles className="h-3 w-3" /> Completado
              </Badge>
            ) : (
              <Badge className="bg-white/20 text-white border-white/30">
                {completedCount} / {totalCount} pasos
              </Badge>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-white/70 text-xs mt-1.5">
              {isFinished
                ? '¡Felicidades! Completaste toda la ruta.'
                : `${progressPct}% completado · ${totalCount - completedCount} paso${totalCount - completedCount !== 1 ? 's' : ''} restante${totalCount - completedCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Step list ── */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Tu agenda
        </h3>
        <div className="space-y-2.5">
          {sortedSteps.map((step, idx) => {
            let stepStatus: 'completed' | 'current' | 'upcoming';
            if (completedStepIds.has(step.id)) {
              stepStatus = 'completed';
            } else if (idx === currentStepIndex) {
              stepStatus = 'current';
            } else {
              stepStatus = 'upcoming';
            }

            return (
              <StepCard
                key={step.id}
                step={step}
                index={idx}
                status={stepStatus}
                productId={productId}
                onMarkComplete={handleMarkComplete}
                productColor={productColor}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Admin shortcut panel ─────────────────────────────────────────────────────

function AdminPanel({ name }: { name: string }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 p-6 text-center">
        <LayoutDashboard className="h-10 w-10 text-primary mx-auto mb-3" />
        <h2 className="font-semibold text-lg">Hola, {name}</h2>
        <p className="text-muted-foreground text-sm mt-1 mb-4">
          Como administrador, gestiona la plataforma desde el panel de control.
        </p>
        <Button asChild>
          <Link href="/admin">
            Ir al panel de administración <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function LMSDashboard() {
  const { user, profile, logout, loading: authLoading } = useAuth();
  const isAdmin = profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol);
  const firstName = profile?.nombre?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'tú';

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">
          {/* ── Header ── */}
          <header className="bg-accent text-accent-foreground border-b sticky top-0 z-20">
            <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/" aria-label="Aviva LMS">
                <AvivaLogo className="h-8 w-auto" />
              </Link>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Link href="/admin">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 gap-1 hidden sm:flex"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Admin
                    </Button>
                  </Link>
                )}
                {user && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={logout}
                    className="text-accent-foreground hover:bg-white/10 gap-1"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Salir</span>
                  </Button>
                )}
              </div>
            </div>
          </header>

          {/* ── Main ── */}
          <main className="flex-grow">
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
              {/* Greeting */}
              <div>
                <h1 className="text-2xl font-bold font-headline">
                  Hola, {firstName} 👋
                </h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {isAdmin
                    ? 'Bienvenido al panel de aprendizaje.'
                    : 'Aquí está tu agenda de aprendizaje para hoy.'}
                </p>
              </div>

              {/* Content */}
              {isAdmin ? (
                <AdminPanel name={firstName} />
              ) : profile ? (
                <JourneyDashboard userId={profile.uid} profile={profile} />
              ) : (
                <div className="space-y-3">
                  <Skeleton className="h-28 w-full rounded-xl" />
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              )}
            </div>
          </main>

          {/* ── Footer ── */}
          <footer className="py-4 px-4 text-center text-xs text-muted-foreground border-t mt-8">
            &copy; {new Date().getFullYear()} Aviva. Todos los derechos reservados.
          </footer>
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
