'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getAllUsers, getAllQuizAttempts, getPulseAttemptsByDateRange, getProducts } from '@/lib/firestore-service';
import type { UserProfile, QuizAttempt, PulseAttempt, Product } from '@/lib/types-scalable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, TrendingUp, Activity, Store, ShieldAlert } from 'lucide-react';

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
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

  const isTrainer = profile?.rol === 'trainer';

  useEffect(() => {
    if (!profile || !isTrainer) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [allUsers, quizAttempts, pulseAttempts, products] = await Promise.all([
          getAllUsers().catch(() => [] as UserProfile[]),
          getAllQuizAttempts().catch(() => [] as QuizAttempt[]),
          getPulseAttemptsByDateRange(toDateStr(sevenDaysAgo), toDateStr(new Date())).catch(() => [] as PulseAttempt[]),
          getProducts().catch(() => [] as Product[]),
        ]);
        if (cancelled) return;

        const productMap = new Map(products.map(p => [p.id, p.name]));
        const team = allUsers.filter(u => u.rol === 'seller' && u.trainerId === profile.uid);

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

  if (!isTrainer) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Esta vista es para capacitadores</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          "Mi Equipo" muestra el roster de un capacitador (vendedores con este usuario como <code>trainerId</code>).
          Para ver el desempeño de todos los equipos, usa Usuarios o Analytics.
        </p>
      </div>
    );
  }

  const activeCount = rows.filter(r => r.activeLast7Days).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-7 w-7 text-primary" /> Mi Equipo
        </h1>
        <p className="text-muted-foreground mt-1">
          Vendedores que tienen a <strong>{profile?.nombre}</strong> asignado como capacitador.
        </p>
      </div>

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
              <p className="text-sm font-medium">Aún no tienes vendedores asignados</p>
              <p className="text-xs mt-1">Pide a un admin que te asigne como capacitador desde Usuarios.</p>
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
