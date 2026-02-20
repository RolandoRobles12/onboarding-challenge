'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp, Users, Award, Clock, Target, Zap, Radio, BookOpen } from 'lucide-react';
import { useProducts, useQuizzes } from '@/hooks/use-firestore';
import { getDailyPulses, getPulseAttemptsByDate } from '@/lib/firestore-service';
import type { PulseAttempt, DailyPulse, KnowledgeModule } from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS } from '@/lib/types-scalable';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0]; }
function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d + n).toISOString().split('T')[0];
}

function StatCard({ title, value, description, icon: Icon, color }: {
  title: string; value: string | number; description?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

type SegmentDimension = 'vertical' | 'hub' | 'estado' | 'cosecha';
const DIMENSION_LABELS: Record<SegmentDimension, string> = {
  vertical: 'Vertical',
  hub: 'Hub',
  estado: 'Estado',
  cosecha: 'Cosecha (mes ingreso)',
};

// ── Pulse analytics helpers ────────────────────────────────────────────────

function getCosechaGroup(cosecha?: string): string {
  if (!cosecha) return 'Sin datos';
  // cosecha is fecha_ingreso (YYYY-MM-DD or similar)
  const date = new Date(cosecha);
  if (isNaN(date.getTime())) return cosecha;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildSegmentMetrics(
  attempts: PulseAttempt[],
  dimension: SegmentDimension
): { key: string; totalAttempts: number; totalCorrect: number; avgPct: number }[] {
  const map: Record<string, { count: number; totalPct: number }> = {};
  for (const a of attempts) {
    let key: string;
    if (dimension === 'cosecha') key = getCosechaGroup(a.cosecha);
    else key = (a[dimension] as string) || 'Sin datos';

    if (!map[key]) map[key] = { count: 0, totalPct: 0 };
    map[key].count++;
    map[key].totalPct += a.percentage;
  }
  return Object.entries(map)
    .map(([key, { count, totalPct }]) => ({
      key,
      totalAttempts: count,
      totalCorrect: 0,
      avgPct: Math.round(totalPct / count),
    }))
    .sort((a, b) => b.avgPct - a.avgPct);
}

function buildQuestionMetrics(
  attempts: PulseAttempt[]
): { questionId: string; timesAsked: number; timesCorrect: number; correctRate: number }[] {
  const map: Record<string, { timesAsked: number; timesCorrect: number }> = {};
  for (const a of attempts) {
    for (const ans of a.answers) {
      if (!map[ans.questionId]) map[ans.questionId] = { timesAsked: 0, timesCorrect: 0 };
      map[ans.questionId].timesAsked++;
      if (ans.isCorrect) map[ans.questionId].timesCorrect++;
    }
  }
  return Object.entries(map)
    .map(([questionId, { timesAsked, timesCorrect }]) => ({
      questionId,
      timesAsked,
      timesCorrect,
      correctRate: timesAsked > 0 ? Math.round((timesCorrect / timesAsked) * 100) : 0,
    }))
    .sort((a, b) => a.correctRate - b.correctRate); // most difficult first
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { products, loading: loadingProducts } = useProducts();
  const { quizzes, loading: loadingQuizzes } = useQuizzes();

  const [activeTab, setActiveTab] = useState('platform');
  const [periodDays, setPeriodDays] = useState('30');
  const [dimension, setDimension] = useState<SegmentDimension>('hub');
  const [loadingPulse, setLoadingPulse] = useState(false);
  const [pulseAttempts, setPulseAttempts] = useState<PulseAttempt[]>([]);
  const [pulses, setPulses] = useState<DailyPulse[]>([]);

  // Load pulse data when tab changes or period changes
  useEffect(() => {
    if (activeTab !== 'pulse') return;
    setLoadingPulse(true);
    const endDate = todayStr();
    const startDate = addDays(endDate, -parseInt(periodDays));

    getDailyPulses(startDate, endDate).then(async pulseList => {
      setPulses(pulseList);
      // Load attempts for each pulse
      const allAttempts: PulseAttempt[] = [];
      for (const p of pulseList) {
        const att = await getPulseAttemptsByDate(p.date);
        allAttempts.push(...att);
      }
      setPulseAttempts(allAttempts);
    }).finally(() => setLoadingPulse(false));
  }, [activeTab, periodDays]);

  // ── Pulse metrics ─────────────────────────────────────────────────────

  const overallPct = pulseAttempts.length > 0
    ? Math.round(pulseAttempts.reduce((s, a) => s + a.percentage, 0) / pulseAttempts.length)
    : 0;

  const segmentMetrics = buildSegmentMetrics(pulseAttempts, dimension);
  const questionMetrics = buildQuestionMetrics(pulseAttempts);
  const maxSegPct = segmentMetrics[0]?.avgPct ?? 100;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Métricas y estadísticas de la plataforma</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="platform">
            <BarChart3 className="h-4 w-4 mr-1.5" /> Plataforma
          </TabsTrigger>
          <TabsTrigger value="pulse">
            <Radio className="h-4 w-4 mr-1.5" /> Pulso de Conocimiento
          </TabsTrigger>
        </TabsList>

        {/* ── PLATFORM TAB ──────────────────────────────────────────── */}
        <TabsContent value="platform" className="mt-4 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {loadingProducts || loadingQuizzes ? (
              <>{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}</>
            ) : (
              <>
                <StatCard title="Productos Activos" value={products.length} description="Productos disponibles" icon={Target} color="text-blue-500" />
                <StatCard title="Quizzes Publicados" value={quizzes.filter(q => q.published).length} description={`${quizzes.length} quizzes en total`} icon={Award} color="text-green-500" />
                <StatCard title="Preguntas Totales" value={quizzes.reduce((sum, q) => sum + (q.totalQuestions || 0), 0)} description="En todos los quizzes" icon={Zap} color="text-yellow-500" />
                <StatCard title="Tiempo Promedio" value={`${quizzes.length > 0 ? Math.round(quizzes.reduce((s, q) => s + q.estimatedDuration, 0) / quizzes.length) : 0} min`} description="Duración promedio" icon={Clock} color="text-purple-500" />
              </>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Quizzes por Producto</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProducts || loadingQuizzes ? (
                  <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
                ) : products.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No hay productos aún</p>
                ) : (
                  <div className="space-y-3">
                    {products.map(product => {
                      const productQuizzes = quizzes.filter(q => q.productId === product.id);
                      const maxCount = Math.max(...products.map(p => quizzes.filter(q => q.productId === p.id).length), 1);
                      const pct = (productQuizzes.length / maxCount) * 100;
                      return (
                        <div key={product.id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: product.color }} />
                              <span className="font-medium">{product.name}</span>
                            </div>
                            <span className="text-muted-foreground">{productQuizzes.length} quizzes</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: product.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Resumen de Contenido</CardTitle>
                <CardDescription>Estado actual de los quizzes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {['Publicados', 'Borradores', 'Desactivados'].map((label, i) => {
                    const counts = [
                      quizzes.filter(q => q.published && q.active).length,
                      quizzes.filter(q => !q.published && q.active).length,
                      quizzes.filter(q => !q.active).length,
                    ];
                    const colors = ['bg-green-500', 'bg-yellow-500', 'bg-gray-400'];
                    return (
                      <div key={label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${colors[i]}`} />
                          <span className="text-sm">{label}</span>
                        </div>
                        <span className="text-sm font-semibold">{loadingQuizzes ? '...' : counts[i]}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Analytics detallados de usuarios próximamente.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── PULSE TAB ─────────────────────────────────────────────── */}
        <TabsContent value="pulse" className="mt-4 space-y-6">
          {/* Period selector */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Período:</span>
            <Select value={periodDays} onValueChange={setPeriodDays}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="14">Últimos 14 días</SelectItem>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="90">Últimos 90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingPulse ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Pulsos enviados" value={pulses.length} description={`en ${periodDays} días`} icon={Radio} color="text-primary" />
                <StatCard title="Respuestas totales" value={pulseAttempts.length} description="intentos completados" icon={Users} color="text-blue-500" />
                <StatCard title="% Aciertos promedio" value={`${overallPct}%`} description="todas las respuestas" icon={Target} color={overallPct >= 70 ? 'text-green-500' : 'text-orange-500'} />
                <StatCard
                  title="Promedio respuestas/día"
                  value={pulses.length > 0 ? Math.round(pulseAttempts.length / pulses.length) : 0}
                  description="participación diaria"
                  icon={TrendingUp}
                  color="text-purple-500"
                />
              </div>

              {/* Segmentation selector + chart */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> % Aciertos por Segmento
                    </CardTitle>
                    <Select value={dimension} onValueChange={v => setDimension(v as SegmentDimension)}>
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(DIMENSION_LABELS) as [SegmentDimension, string][]).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {segmentMetrics.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No hay datos de segmentación para este período. Asegúrate de que los usuarios tengan los campos
                      {' '}<code className="text-xs bg-muted px-1 rounded">{dimension}</code> en su perfil de onboarding.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {segmentMetrics.map(({ key, totalAttempts, avgPct }) => (
                        <div key={key} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{key}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground">{totalAttempts} resp.</span>
                              <span className={cn(
                                'font-semibold text-sm',
                                avgPct >= 70 ? 'text-green-600' : avgPct >= 50 ? 'text-orange-500' : 'text-red-500'
                              )}>{avgPct}%</span>
                            </div>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                avgPct >= 70 ? 'bg-green-500' : avgPct >= 50 ? 'bg-orange-400' : 'bg-red-500'
                              )}
                              style={{ width: `${(avgPct / Math.max(maxSegPct, 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Most failed questions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" /> Preguntas más falladas
                  </CardTitle>
                  <CardDescription>Ordenadas de mayor a menor dificultad (menor % de aciertos)</CardDescription>
                </CardHeader>
                <CardContent>
                  {questionMetrics.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No hay datos disponibles aún.</p>
                  ) : (
                    <div className="space-y-3">
                      {questionMetrics.slice(0, 10).map((qm, idx) => (
                        <div key={qm.questionId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40">
                          <span className="text-muted-foreground font-bold text-sm w-5 text-right">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground font-mono">{qm.questionId.slice(-8)}</p>
                            <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  qm.correctRate >= 70 ? 'bg-green-500' : qm.correctRate >= 40 ? 'bg-orange-400' : 'bg-red-500'
                                )}
                                style={{ width: `${qm.correctRate}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={cn(
                              'text-sm font-bold',
                              qm.correctRate >= 70 ? 'text-green-600' : qm.correctRate >= 40 ? 'text-orange-500' : 'text-red-500'
                            )}>{qm.correctRate}%</span>
                            <p className="text-[10px] text-muted-foreground">{qm.timesAsked} veces</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
