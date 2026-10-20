'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  getAllUsers, getAllQuizAttempts, getPulseAttemptsByDateRange, getProducts,
  getJourneyForms, getJourneyByProduct, getAllJourneyProgress,
} from '@/lib/firestore-service';
import { journeySteps } from '@/lib/journey-progress';
import type { UserProfile, QuizAttempt, PulseAttempt, Product, JourneyForm, Journey, UserJourneyProgress } from '@/lib/types-scalable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, TrendingUp, Activity, Store, ClipboardCheck } from 'lucide-react';

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Formulario de la ruta que llena el capacitador sobre un vendedor y sigue pendiente. */
interface PendingEvaluation {
  seller: UserProfile;
  form: JourneyForm;
  stepTitle: string;
  href: string;
}

interface SellerRow {
  profile: UserProfile;
  productName: string;
  attemptCount: number;
  avgScore: number | null;
  activeLast7Days: boolean;
}

export default function MyTeamPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SellerRow[]>([]);
  const [pending, setPending] = useState<PendingEvaluation[]>([]);

  // El capacitador ve a sus vendedores; admin y super admin, a todos.
  const isTrainer = profile?.rol === 'trainer';

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [allUsers, quizAttempts, pulseAttempts, products, forms, progress] = await Promise.all([
          getAllUsers().catch(() => [] as UserProfile[]),
          getAllQuizAttempts().catch(() => [] as QuizAttempt[]),
          getPulseAttemptsByDateRange(toDateStr(sevenDaysAgo), toDateStr(new Date())).catch(() => [] as PulseAttempt[]),
          getProducts().catch(() => [] as Product[]),
          getJourneyForms().catch(() => [] as JourneyForm[]),
          getAllJourneyProgress().catch(() => [] as UserJourneyProgress[]),
        ]);
        if (cancelled) return;

        const productMap = new Map(products.map(p => [p.id, p.name]));
        const team = allUsers.filter(u => u.rol === 'seller' && u.active !== false && (!isTrainer || u.trainerId === profile.uid));

        // Evaluaciones pendientes: pasos de formulario que no llena el vendedor.
        const staffForms = new Map(forms.filter(f => f.respondent !== 'seller' && f.active !== false).map(f => [f.id, f]));
        const journeys = new Map<string, Journey | null>();
        if (staffForms.size > 0) {
          for (const productId of new Set(team.map(u => u.producto).filter((p): p is string => !!p))) {
            journeys.set(productId, await getJourneyByProduct(productId).catch(() => null));
          }
        }
        const doneByKey = new Map(progress.map(p => [`${p.userId}_${p.journeyId}`, new Set(p.completedStepIds ?? [])]));
        const pendingItems: PendingEvaluation[] = [];
        for (const seller of team) {
          const journey = seller.producto ? journeys.get(seller.producto) : null;
          if (!journey) continue;
          const done = doneByKey.get(`${seller.uid}_${journey.id}`) ?? new Set<string>();
          for (const step of journeySteps(journey)) {
            const form = step.type === 'info_form' && step.config?.formId ? staffForms.get(step.config.formId) : undefined;
            if (!form || done.has(step.id)) continue;
            const params = new URLSearchParams({ stepId: step.id, journeyId: journey.id, productId: seller.producto!, subjectId: seller.uid });
            pendingItems.push({ seller, form, stepTitle: step.title, href: `/forms/${form.id}?${params.toString()}` });
          }
        }
        if (cancelled) return;
        setPending(pendingItems);

        const recentUserIds = new Set<string>();
        quizAttempts.forEach(a => {
          const ms = a.completedAt?.toMillis?.() ?? 0;
          if (ms >= sevenDaysAgo.getTime()) recentUserIds.add(a.userId);
        });
        pulseAttempts.forEach(a => recentUserIds.add(a.userId));

        const teamRows: SellerRow[] = team.map(seller => {
          const attempts = quizAttempts.filter(a => a.userId === seller.uid);
          const avgScore = attempts.length > 0
            ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length)
            : null;
          return {
            profile: seller,
            productName: seller.producto ? (productMap.get(seller.producto) ?? seller.producto) : '—',
            attemptCount: attempts.length,
            avgScore,
            activeLast7Days: recentUserIds.has(seller.uid),
          };
        });

        teamRows.sort((a, b) => (a.profile.nombre || '').localeCompare(b.profile.nombre || ''));
        setRows(teamRows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profile, isTrainer]);

  const activeCount = rows.filter(r => r.activeLast7Days).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-7 w-7 text-primary" /> Mi Equipo
        </h1>
        <p className="text-muted-foreground mt-1">
          {isTrainer
            ? <>Vendedores que tienen a <strong>{profile?.nombre}</strong> asignado como capacitador.</>
            : 'Todos los vendedores activos (como admin ves a todos los equipos).'}
        </p>
      </div>

      {!loading && pending.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-amber-600" /> Evaluaciones pendientes
            </CardTitle>
            <CardDescription>
              Formularios de la ruta que llena el capacitador sobre cada vendedor. El paso se completa en la ruta del vendedor al enviarlo.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {pending.map(p => (
              <div key={`${p.seller.uid}_${p.href}`} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.seller.nombre || p.seller.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.form.title} · {p.stepTitle}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={p.href}>Evaluar</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendedores</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{loading ? '...' : rows.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activos (7 días)</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{loading ? '...' : activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio del equipo</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : (() => {
                const withScore = rows.filter(r => r.avgScore != null);
                if (withScore.length === 0) return '—';
                return `${Math.round(withScore.reduce((s, r) => s + (r.avgScore ?? 0), 0) / withScore.length)}%`;
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roster</CardTitle>
          <CardDescription>Vendedores asignados, su producto y actividad reciente.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">{isTrainer ? 'Aún no tienes vendedores asignados' : 'No hay vendedores activos'}</p>
              {isTrainer && <p className="text-xs mt-1">Pide a un admin que te asigne como capacitador desde Usuarios.</p>}
            </div>
          ) : (
            <div className="divide-y">
              {rows.map(r => (
                <div key={r.profile.uid} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {(r.profile.nombre || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.profile.nombre || r.profile.email}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Store className="h-3 w-3" /> {r.productName}
                      {r.profile.assignedKiosko && <span>· {r.profile.assignedKiosko}</span>}
                    </div>
                  </div>
                  {r.activeLast7Days && (
                    <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px] shrink-0">Activo</Badge>
                  )}
                  <div className="text-right shrink-0 w-20">
                    <p className="text-sm font-mono font-semibold">{r.avgScore != null ? `${r.avgScore}%` : '—'}</p>
                    <p className="text-[10px] text-muted-foreground">{r.attemptCount} evaluaciones</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
