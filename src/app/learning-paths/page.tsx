'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AvivaLogo } from '@/components/AvivaLogo';
import ProtectedRoute from '@/components/ProtectedRoute';
import SellerOnboardingGate from '@/components/SellerOnboardingGate';
import { BottomNav } from '@/components/BottomNav';
import { useAuth } from '@/context/AuthContext';
import { getExplorableJourneys, getProducts } from '@/lib/firestore-service';
import type { Journey, JourneyStepType, Product } from '@/lib/types-scalable';
import { sortMilestones } from '@/lib/journey-schedule';
import { cn } from '@/lib/utils';
import {
  Route, ChevronLeft, ChevronRight, LogOut, ShieldCheck, Compass,
  BookOpen, Swords, Award, ListChecks, FileText, HelpCircle, BarChart2, Medal,
  CalendarDays, Search, AlertCircle,
} from 'lucide-react';

const TYPE_META: Record<JourneyStepType, { label: string; icon: React.ElementType; color: string }> = {
  info_form:   { label: 'formularios',  icon: FileText,   color: 'text-blue-500' },
  course:      { label: 'cursos',       icon: BookOpen,   color: 'text-emerald-500' },
  challenge:   { label: 'desafíos',     icon: Swords,     color: 'text-orange-500' },
  quiz:        { label: 'evaluaciones', icon: HelpCircle, color: 'text-purple-500' },
  results:     { label: 'resultados',   icon: BarChart2,  color: 'text-sky-500' },
  certificate: { label: 'certificados', icon: Award,      color: 'text-amber-500' },
  badge:       { label: 'insignias',    icon: Medal,      color: 'text-yellow-500' },
  checklist:   { label: 'listas',       icon: ListChecks, color: 'text-teal-500' },
};

interface RouteCard {
  journey: Journey;
  product: Product;
  stageCount: number;
  actionCount: number;
  typeCounts: [JourneyStepType, number][];
  planLabel: string | null;
  isMine: boolean;
}

export default function LearningPathsCatalogPage() {
  const { user, profile, logout } = useAuth();
  const isAdmin = !!(profile && ['super_admin', 'admin', 'trainer'].includes(profile.rol));

  const [cards, setCards] = useState<RouteCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const assignedProductId = profile?.producto || '';

  useEffect(() => {
    let cancelled = false;
    Promise.all([getExplorableJourneys(), getProducts()])
      .then(([journeys, products]) => {
        if (cancelled) return;
        const byId = new Map(products.map(p => [p.id, p]));
        const built = journeys
          .map(j => {
            const product = byId.get(j.productId);
            if (!product) return null;
            const stages = (j.stages ?? []).filter(s => s.visible !== false);
            const actions = stages.flatMap(s => s.actions ?? []);
            const counts = actions.reduce((acc, a) => {
              acc[a.type] = (acc[a.type] ?? 0) + 1;
              return acc;
            }, {} as Record<string, number>);
            const milestones = j.anchorToEntryDate ? sortMilestones(j.milestones ?? []) : [];
            return {
              journey: j,
              product,
              stageCount: stages.length,
              actionCount: actions.length,
              typeCounts: Object.entries(counts) as [JourneyStepType, number][],
              planLabel: milestones.length > 0
                ? `Plan ${milestones.map(m => m.dayOffset).join(' / ')} días`
                : null,
              isMine: j.productId === assignedProductId,
            } as RouteCard;
          })
          .filter((c): c is RouteCard => c !== null)
          .sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.product.name.localeCompare(b.product.name));
        setCards(built);
      })
      .catch(() => setError(true))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assignedProductId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(c =>
      c.product.name.toLowerCase().includes(q) ||
      c.journey.name.toLowerCase().includes(q) ||
      (c.product.description ?? '').toLowerCase().includes(q)
    );
  }, [cards, search]);

  return (
    <ProtectedRoute>
      <SellerOnboardingGate>
        <div className="flex flex-col min-h-screen bg-background">

          {/* Header */}
          <header className="bg-accent text-accent-foreground sticky top-0 z-20">
            <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/"><AvivaLogo className="h-8 w-auto" /></Link>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Link href="/admin/journey">
                    <Button variant="outline" size="sm" className="text-accent-foreground border-accent-foreground/30 hover:bg-white/10 gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Gestionar
                    </Button>
                  </Link>
                )}
                {user && (
                  <Button variant="ghost" size="sm" onClick={logout} className="text-accent-foreground hover:bg-white/10 gap-1">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Salir</span>
                  </Button>
                )}
              </div>
            </div>
          </header>

          <main className="flex-grow">
            <div className="max-w-md mx-auto px-4 py-5 space-y-4 pb-24">

              {/* Breadcrumb + title */}
              <div>
                <Link href="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs transition-colors mb-2">
                  <ChevronLeft className="h-3.5 w-3.5" /> Inicio
                </Link>
                <div className="flex items-center gap-2">
                  <Compass className="h-5 w-5 text-teal-600" />
                  <h1 className="text-lg font-bold">Explorar rutas</h1>
                </div>
                <p className="text-sm text-muted-foreground mt-1 leading-snug">
                  Conoce las trayectorias de aprendizaje de todos los productos Aviva, no sólo la tuya.
                </p>
              </div>

              {/* Search */}
              {cards.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar producto o ruta..."
                    className="w-full h-10 rounded-xl border bg-background pl-9 pr-3 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {/* Cards */}
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-28 w-full rounded-2xl" />
                  <Skeleton className="h-28 w-full rounded-2xl" />
                  <Skeleton className="h-28 w-full rounded-2xl" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-destructive/30 py-12 text-center gap-3">
                  <AlertCircle className="h-10 w-10 text-destructive/60" />
                  <p className="font-semibold">No se pudieron cargar las rutas</p>
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Recargar</Button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-14 text-center gap-2">
                  <Route className="h-10 w-10 text-muted-foreground opacity-40" />
                  <p className="font-semibold text-sm">
                    {search ? 'Sin resultados' : 'Aún no hay rutas publicadas'}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    {search
                      ? 'Prueba con otro nombre de producto.'
                      : 'Cuando el equipo publique rutas de aprendizaje, aparecerán aquí para que las explores.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(card => {
                    const color = card.product.color ?? '#7C3AED';
                    return (
                      <Link
                        key={card.journey.id}
                        href={card.isMine ? '/' : `/?ruta=${card.product.id}`}
                        className={cn(
                          'block rounded-2xl border overflow-hidden transition-all hover:shadow-md',
                          card.isMine && 'border-primary/40',
                        )}
                      >
                        {/* Color band */}
                        <div className="h-1.5" style={{ backgroundColor: color }} />

                        <div className="p-4 space-y-2.5">
                          <div className="flex items-start gap-3">
                            <div
                              className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${color}1A` }}
                            >
                              <Route className="h-5 w-5" style={{ color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-semibold text-sm truncate">{card.product.name}</p>
                                {card.isMine && (
                                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] h-4 px-1.5">
                                    MI RUTA
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{card.journey.name}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                          </div>

                          {card.product.description && (
                            <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                              {card.product.description}
                            </p>
                          )}

                          {/* Meta strip */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] h-5 gap-1">
                              {card.stageCount} etapa{card.stageCount !== 1 ? 's' : ''}
                            </Badge>
                            {card.planLabel && (
                              <Badge variant="outline" className="text-[10px] h-5 gap-1 border-violet-200 text-violet-700 bg-violet-50">
                                <CalendarDays className="h-2.5 w-2.5" /> {card.planLabel}
                              </Badge>
                            )}
                            {card.typeCounts.slice(0, 3).map(([type, count]) => {
                              const meta = TYPE_META[type];
                              if (!meta) return null;
                              const Icon = meta.icon;
                              return (
                                <span key={type} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Icon className={cn('h-3 w-3', meta.color)} />
                                  {count} {meta.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground text-center leading-snug pt-2">
                Explorar una ruta ajena es sólo para conocerla: tu progreso se registra únicamente en la ruta que
                tienes asignada.
              </p>
            </div>
          </main>

          <BottomNav isAdmin={isAdmin} />
        </div>
      </SellerOnboardingGate>
    </ProtectedRoute>
  );
}
