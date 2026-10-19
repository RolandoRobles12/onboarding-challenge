'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MousePointerClick, CheckCircle2, Clock, RotateCcw, Play } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { getAllSimModules, getUserSimAttempts } from '@/lib/firestore-service';
import type { SimAttempt, SimModule } from '@/lib/types-simulation';

type Status = 'passed' | 'pending' | 'retry' | 'new';

function statusOf(attempts: SimAttempt[]): Status {
  if (attempts.some(a => a.passed)) return 'passed';
  if (attempts.some(a => a.outcome === 'pending_review' && !a.review)) return 'pending';
  if (attempts.some(a => a.state === 'completed' || a.state === 'abandoned')) return 'retry';
  return 'new';
}

const STATUS: Record<Status, { label: string; icon: typeof CheckCircle2; className: string }> = {
  passed: { label: 'Aprobada', icon: CheckCircle2, className: 'bg-green-100 text-green-800 border-green-200' },
  pending: { label: 'Por revisar', icon: Clock, className: 'bg-amber-100 text-amber-800 border-amber-200' },
  retry: { label: 'Vuelve a intentarlo', icon: RotateCcw, className: 'bg-orange-100 text-orange-800 border-orange-200' },
  new: { label: 'Nueva', icon: Play, className: 'bg-sky-100 text-sky-800 border-sky-200' },
};

/** Simulaciones de la herramienta disponibles para practicar. */
export default function SimulationsPage() {
  const { profile, isTrainer } = useAuth();
  const [modules, setModules] = useState<SimModule[] | null>(null);
  const [attempts, setAttempts] = useState<SimAttempt[]>([]);

  useEffect(() => {
    if (!profile) return;
    Promise.all([getAllSimModules(), getUserSimAttempts(profile.uid)]).then(([mods, atts]) => {
      setModules(mods.filter(m => m.active).sort((a, b) => a.title.localeCompare(b.title)));
      setAttempts(atts);
    });
  }, [profile]);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex flex-col">
          <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b px-4 h-14 flex items-center gap-3">
            <Link href="/challenges" className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
            <div className="flex items-center gap-2 font-bold text-base">
              <MousePointerClick className="h-4 w-4 text-primary" /> Simulaciones
            </div>
          </header>
          <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-5 pb-28 space-y-3">
            <p className="text-sm text-muted-foreground">Practica el flujo de la herramienta paso a paso, como si atendieras a un cliente.</p>
            {modules === null ? (
              [0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)
            ) : modules.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Todavía no hay simulaciones disponibles.</CardContent></Card>
            ) : modules.map(mod => {
              const status = statusOf(attempts.filter(a => a.moduleId === mod.id));
              const meta = STATUS[status];
              const Icon = meta.icon;
              return (
                <Card key={mod.id} className="rounded-2xl">
                  <CardContent className="py-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-fuchsia-500/10 flex items-center justify-center shrink-0">
                      <MousePointerClick className="h-5 w-5 text-fuchsia-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">{mod.title}</p>
                      {(mod.scenario || mod.instructions) && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{mod.scenario || mod.instructions}</p>
                      )}
                      <Badge className={`mt-1.5 text-[10px] gap-1 ${meta.className}`}><Icon className="h-3 w-3" /> {meta.label}</Badge>
                    </div>
                    <Button asChild size="sm" variant={status === 'passed' ? 'outline' : 'default'} className="shrink-0">
                      <Link href={`/simulations/${mod.id}`}>{status === 'passed' ? 'Repetir' : 'Practicar'}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </main>
          <BottomNav isAdmin={isTrainer} />
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
