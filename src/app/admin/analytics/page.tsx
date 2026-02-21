'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, Users, Award, Clock, Target, Zap, Radio, BookOpen, X, Plus } from 'lucide-react';
import { useProducts, useQuizzes } from '@/hooks/use-firestore';
import { getDailyPulses, getPulseAttemptsByDate, getQuestions, getAllUsers } from '@/lib/firestore-service';
import type { PulseAttempt, DailyPulse, Question, KnowledgeModule } from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS } from '@/lib/types-scalable';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

type SegmentDimension = 'vertical' | 'hub' | 'estado' | 'cosecha';
type CosechaGranularity = 'semana' | 'mes' | 'trimestre' | 'año';

const DIMENSION_LABELS: Record<SegmentDimension, string> = {
  vertical: 'Vertical',
  hub: 'Hub',
  estado: 'Estado',
  cosecha: 'Cosecha (ingreso)',
};

const GRANULARITY_LABELS: Record<CosechaGranularity, string> = {
  semana: 'Por semana',
  mes: 'Por mes',
  trimestre: 'Por trimestre',
  año: 'Por año',
};

const MODULE_COLORS: Record<string, string> = {
  banca_conversacional: 'bg-blue-500/10 text-blue-700 border-blue-200',
  pagos_renovacion: 'bg-green-500/10 text-green-700 border-green-200',
  solicitud_credito: 'bg-purple-500/10 text-purple-700 border-purple-200',
  herramientas: 'bg-orange-500/10 text-orange-700 border-orange-200',
};

type OptFilter = 'dimension' | 'cosechaGranularity' | 'cosechaFrom' | 'cosechaTo';

// ── Helpers ────────────────────────────────────────────────────────────────

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr() { return dateToStr(new Date()); }
function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dateToStr(new Date(y, m - 1, d + n));
}

function getCosechaGroup(cosecha: string | undefined, granularity: CosechaGranularity = 'mes'): string {
  if (!cosecha) return 'Sin datos';
  const date = new Date(cosecha);
  if (isNaN(date.getTime())) return cosecha;
  switch (granularity) {
    case 'semana': {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
      const week1 = new Date(d.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
      return `${d.getFullYear()}-S${String(weekNum).padStart(2, '0')}`;
    }
    case 'mes':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    case 'trimestre':
      return `${date.getFullYear()}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
    case 'año':
      return `${date.getFullYear()}`;
  }
}

function buildSegmentMetrics(
  attempts: PulseAttempt[],
  dimension: SegmentDimension,
  granularity: CosechaGranularity,
): { key: string; totalAttempts: number; avgPct: number }[] {
  const map: Record<string, { count: number; totalPct: number }> = {};
  for (const a of attempts) {
    const key = dimension === 'cosecha'
      ? getCosechaGroup(a.cosecha, granularity)
      : ((a[dimension] as string) || 'Sin datos');
    if (!map[key]) map[key] = { count: 0, totalPct: 0 };
    map[key].count++;
    map[key].totalPct += a.percentage;
  }
  return Object.entries(map)
    .map(([key, { count, totalPct }]) => ({ key, totalAttempts: count, avgPct: Math.round(totalPct / count) }))
    .sort((a, b) => b.avgPct - a.avgPct);
}

function buildQuestionMetrics(
  attempts: PulseAttempt[],
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
      questionId, timesAsked, timesCorrect,
      correctRate: timesAsked > 0 ? Math.round((timesCorrect / timesAsked) * 100) : 0,
    }))
    .sort((a, b) => a.correctRate - b.correctRate);
}

// ── Stat Card ──────────────────────────────────────────────────────────────

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

// ── Filter chip ────────────────────────────────────────────────────────────

function FilterChip({
  label, value, options, onChange, onRemove, removable = true,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  onRemove?: () => void;
  removable?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 h-8 border rounded-full px-3 bg-background text-sm shadow-sm hover:border-primary/40 transition-colors">
      <span className="text-muted-foreground text-xs shrink-0 font-medium">{label}:</span>
      <select
        className="bg-transparent border-none outline-none text-sm font-semibold cursor-pointer"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {removable && onRemove && (
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function DateFilterChip({
  label, value, onChange, onRemove,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 h-8 border rounded-full px-3 bg-background text-sm shadow-sm hover:border-primary/40 transition-colors">
      <span className="text-muted-foreground text-xs shrink-0 font-medium">{label}:</span>
      <input
        type="month"
        className="bg-transparent border-none outline-none text-sm font-semibold cursor-pointer"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { products, loading: loadingProducts } = useProducts();
  const { quizzes, loading: loadingQuizzes } = useQuizzes();

  const [activeTab, setActiveTab] = useState('platform');
  const [loadingPulse, setLoadingPulse] = useState(false);
  const [pulseAttempts, setPulseAttempts] = useState<PulseAttempt[]>([]);
  const [pulses, setPulses] = useState<DailyPulse[]>([]);
  const [questionMap, setQuestionMap] = useState<Record<string, Question>>({});
  const [totalUsers, setTotalUsers] = useState(0);

  // Filter state
  const [periodDays, setPeriodDays] = useState('30');
  const [dimension, setDimension] = useState<SegmentDimension>('hub');
  const [cosechaGranularity, setCosechaGranularity] = useState<CosechaGranularity>('mes');
  const [cosechaFrom, setCosechaFrom] = useState('');
  const [cosechaTo, setCosechaTo] = useState('');
  const [activeOptFilters, setActiveOptFilters] = useState<Set<OptFilter>>(new Set(['dimension']));
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const addFilterRef = useRef<HTMLDivElement>(null);

  // Close "add filter" dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (addFilterRef.current && !addFilterRef.current.contains(e.target as Node)) {
        setAddFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const addFilter = (key: OptFilter) => {
    setActiveOptFilters(prev => new Set([...prev, key]));
    setAddFilterOpen(false);
  };

  const removeFilter = (key: OptFilter) => {
    setActiveOptFilters(prev => {
      const next = new Set(prev);
      next.delete(key);
      // If removing dimension, also remove cosecha-specific filters
      if (key === 'dimension') {
        next.delete('cosechaGranularity');
        next.delete('cosechaFrom');
        next.delete('cosechaTo');
      }
      return next;
    });
    if (key === 'cosechaFrom') setCosechaFrom('');
    if (key === 'cosechaTo') setCosechaTo('');
  };

  // Available filters to add (not yet active or only relevant for cosecha)
  const availableToAdd: { key: OptFilter; label: string }[] = [
    !activeOptFilters.has('dimension') ? { key: 'dimension', label: 'Segmento' } : null,
    activeOptFilters.has('dimension') && dimension === 'cosecha' && !activeOptFilters.has('cosechaGranularity')
      ? { key: 'cosechaGranularity', label: 'Agrupación cosecha' }
      : null,
    activeOptFilters.has('dimension') && dimension === 'cosecha' && !activeOptFilters.has('cosechaFrom')
      ? { key: 'cosechaFrom', label: 'Cosecha desde' }
      : null,
    activeOptFilters.has('dimension') && dimension === 'cosecha' && !activeOptFilters.has('cosechaTo')
      ? { key: 'cosechaTo', label: 'Cosecha hasta' }
      : null,
  ].filter(Boolean) as { key: OptFilter; label: string }[];

  // ── Load pulse data ────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'pulse') return;
    setLoadingPulse(true);
    const endDate = todayStr();
    const startDate = addDays(endDate, -parseInt(periodDays));
    Promise.all([
      getDailyPulses(startDate, endDate),
      getQuestions('pulse', false),
      getAllUsers(),
    ]).then(async ([pulseList, allQs, allUsers]) => {
      setPulses(pulseList);
      setTotalUsers(allUsers.length);
      const map: Record<string, Question> = {};
      for (const q of allQs) map[q.id] = q;
      setQuestionMap(map);
      const allAttempts: PulseAttempt[] = [];
      for (const p of pulseList) {
        const att = await getPulseAttemptsByDate(p.date);
        allAttempts.push(...att);
      }
      setPulseAttempts(allAttempts);
    }).finally(() => setLoadingPulse(false));
  }, [activeTab, periodDays]);

  // ── Derived: filtered attempts ─────────────────────────────────────────

  const filteredAttempts = useMemo(() => {
    let result = pulseAttempts;
    if (cosechaFrom && activeOptFilters.has('cosechaFrom')) {
      result = result.filter(a => {
        if (!a.cosecha) return false;
        return getCosechaGroup(a.cosecha, 'mes') >= cosechaFrom;
      });
    }
    if (cosechaTo && activeOptFilters.has('cosechaTo')) {
      result = result.filter(a => {
        if (!a.cosecha) return false;
        return getCosechaGroup(a.cosecha, 'mes') <= cosechaTo;
      });
    }
    return result;
  }, [pulseAttempts, cosechaFrom, cosechaTo, activeOptFilters]);

  // ── Pulse metrics ──────────────────────────────────────────────────────

  const overallPct = filteredAttempts.length > 0
    ? Math.round(filteredAttempts.reduce((s, a) => s + a.percentage, 0) / filteredAttempts.length)
    : 0;

  const uniqueRespondents = new Set(filteredAttempts.map(a => a.userId)).size;
  const participationRate = totalUsers > 0 ? Math.round((uniqueRespondents / totalUsers) * 100) : 0;

  const segmentMetrics = activeOptFilters.has('dimension')
    ? buildSegmentMetrics(filteredAttempts, dimension, cosechaGranularity)
    : [];
  const maxSegPct = segmentMetrics[0]?.avgPct ?? 100;
  const questionMetrics = buildQuestionMetrics(filteredAttempts);

  // ── Render ─────────────────────────────────────────────────────────────

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

        {/* ── PLATFORM TAB ────────────────────────────────────────────── */}
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

        {/* ── PULSE TAB ───────────────────────────────────────────────── */}
        <TabsContent value="pulse" className="mt-4 space-y-6">

          {/* ── HubSpot-style filter bar ─────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Period chip — always visible, not removable */}
            <FilterChip
              label="Período"
              value={periodDays}
              removable={false}
              options={[
                { value: '7', label: 'Últimos 7 días' },
                { value: '14', label: 'Últimos 14 días' },
                { value: '30', label: 'Últimos 30 días' },
                { value: '90', label: 'Últimos 90 días' },
                { value: '180', label: 'Últimos 6 meses' },
                { value: '365', label: 'Último año' },
              ]}
              onChange={setPeriodDays}
            />

            {/* Dimension chip */}
            {activeOptFilters.has('dimension') && (
              <FilterChip
                label="Segmento"
                value={dimension}
                options={(Object.entries(DIMENSION_LABELS) as [SegmentDimension, string][]).map(([v, l]) => ({ value: v, label: l }))}
                onChange={v => {
                  setDimension(v as SegmentDimension);
                  // Reset cosecha-specific filters if switching away from cosecha
                  if (v !== 'cosecha') {
                    setActiveOptFilters(prev => {
                      const next = new Set(prev);
                      next.delete('cosechaGranularity');
                      next.delete('cosechaFrom');
                      next.delete('cosechaTo');
                      return next;
                    });
                  }
                }}
                onRemove={() => removeFilter('dimension')}
              />
            )}

            {/* Cosecha granularity chip */}
            {activeOptFilters.has('dimension') && dimension === 'cosecha' && activeOptFilters.has('cosechaGranularity') && (
              <FilterChip
                label="Agrupar cosecha"
                value={cosechaGranularity}
                options={(Object.entries(GRANULARITY_LABELS) as [CosechaGranularity, string][]).map(([v, l]) => ({ value: v, label: l }))}
                onChange={v => setCosechaGranularity(v as CosechaGranularity)}
                onRemove={() => removeFilter('cosechaGranularity')}
              />
            )}

            {/* Cosecha from chip */}
            {activeOptFilters.has('cosechaFrom') && (
              <DateFilterChip
                label="Cosecha desde"
                value={cosechaFrom}
                onChange={setCosechaFrom}
                onRemove={() => removeFilter('cosechaFrom')}
              />
            )}

            {/* Cosecha to chip */}
            {activeOptFilters.has('cosechaTo') && (
              <DateFilterChip
                label="Cosecha hasta"
                value={cosechaTo}
                onChange={setCosechaTo}
                onRemove={() => removeFilter('cosechaTo')}
              />
            )}

            {/* Add filter button */}
            {availableToAdd.length > 0 && (
              <div className="relative" ref={addFilterRef}>
                <button
                  onClick={() => setAddFilterOpen(v => !v)}
                  className="flex items-center gap-1.5 h-8 border border-dashed rounded-full px-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar filtro
                </button>
                {addFilterOpen && (
                  <div className="absolute top-10 left-0 z-50 bg-background border rounded-xl shadow-lg py-1 min-w-[180px]">
                    {availableToAdd.map(f => (
                      <button
                        key={f.key}
                        onClick={() => addFilter(f.key)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted/60 transition-colors"
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Content ──────────────────────────────────────────────── */}
          {loadingPulse ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Pulsos enviados" value={pulses.length} description={`en ${periodDays} días`} icon={Radio} color="text-primary" />
                <StatCard title="Respuestas totales" value={filteredAttempts.length} description="intentos completados" icon={Users} color="text-blue-500" />
                <StatCard
                  title="% Aciertos promedio"
                  value={`${overallPct}%`}
                  description="todas las respuestas"
                  icon={Target}
                  color={overallPct >= 70 ? 'text-green-500' : 'text-orange-500'}
                />
                <StatCard
                  title="Tasa de participación"
                  value={`${participationRate}%`}
                  description={`${uniqueRespondents} de ${totalUsers} usuarios respondieron`}
                  icon={TrendingUp}
                  color={participationRate >= 70 ? 'text-green-500' : participationRate >= 40 ? 'text-orange-500' : 'text-purple-500'}
                />
              </div>

              {/* Segment chart */}
              {activeOptFilters.has('dimension') && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        % Aciertos por {DIMENSION_LABELS[dimension]}
                        {dimension === 'cosecha' && activeOptFilters.has('cosechaGranularity') && (
                          <span className="text-xs font-normal text-muted-foreground">
                            · {GRANULARITY_LABELS[cosechaGranularity]}
                          </span>
                        )}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {segmentMetrics.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No hay datos de segmentación para este período. Asegúrate de que los usuarios tengan el campo{' '}
                        <code className="text-xs bg-muted px-1 rounded">{dimension}</code> en su perfil de onboarding.
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
              )}

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
                      {questionMetrics.slice(0, 10).map((qm, idx) => {
                        const q = questionMap[qm.questionId];
                        return (
                          <div key={qm.questionId} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/40">
                            <span className="text-muted-foreground font-bold text-sm w-5 text-right shrink-0 mt-0.5">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-snug line-clamp-2">
                                {q?.text ?? <span className="font-mono text-xs text-muted-foreground">{qm.questionId.slice(-8)}</span>}
                              </p>
                              {q?.module && (
                                <span className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded-full border font-medium mt-1 inline-block',
                                  MODULE_COLORS[q.module] ?? 'bg-muted text-muted-foreground border-border'
                                )}>
                                  {KNOWLEDGE_MODULE_LABELS[q.module as KnowledgeModule] ?? q.module}
                                </span>
                              )}
                              <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
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
                        );
                      })}
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
