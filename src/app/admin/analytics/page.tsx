'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3, TrendingUp, Users, Target, Clock, Zap, Radio,
  BookOpen, X, Plus, Timer, AlertTriangle, CheckCircle2, Circle,
} from 'lucide-react';
import { useProducts, useQuizzes } from '@/hooks/use-firestore';
import { getDailyPulses, getPulseAttemptsByDateRange, getQuestions, getAllUsers } from '@/lib/firestore-service';
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
  politicas_procesos: 'bg-red-500/10 text-red-700 border-red-200',
  incentivos: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
};

const MODULE_BAR_COLORS: Record<string, string> = {
  banca_conversacional: 'bg-blue-500',
  pagos_renovacion: 'bg-green-500',
  solicitud_credito: 'bg-purple-500',
  herramientas: 'bg-orange-500',
  politicas_procesos: 'bg-red-500',
  incentivos: 'bg-yellow-500',
};

// OptFilter now includes 'filterValue' for dimension-value filtering
type OptFilter = 'dimension' | 'filterValue' | 'cosechaGranularity' | 'cosechaFrom' | 'cosechaTo';

// ── Helpers ────────────────────────────────────────────────────────────────

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr() { return dateToStr(new Date()); }
function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dateToStr(new Date(y, m - 1, d + n));
}
function formatSeconds(s: number): string {
  if (s <= 0) return '-';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function shortDate(dateStr: string): string {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${months[m - 1]}`;
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

/** Returns the display value of a dimension field from an attempt. */
function getDimensionValue(a: PulseAttempt, dim: SegmentDimension, granularity: CosechaGranularity = 'mes'): string {
  if (dim === 'cosecha') return getCosechaGroup(a.cosecha, granularity);
  return (a[dim] as string) || 'Sin datos';
}

function buildSegmentMetrics(
  attempts: PulseAttempt[],
  dimension: SegmentDimension,
  granularity: CosechaGranularity,
): { key: string; totalAttempts: number; avgPct: number }[] {
  const map: Record<string, { count: number; totalPct: number }> = {};
  for (const a of attempts) {
    const key = getDimensionValue(a, dimension, granularity);
    if (!map[key]) map[key] = { count: 0, totalPct: 0 };
    map[key].count++;
    map[key].totalPct += a.percentage;
  }
  return Object.entries(map)
    .map(([key, { count, totalPct }]) => ({ key, totalAttempts: count, avgPct: Math.round(totalPct / count) }))
    .sort((a, b) => b.avgPct - a.avgPct);
}

interface QuestionMetric {
  questionId: string;
  timesAsked: number;
  timesCorrect: number;
  correctRate: number;
  avgTime: number;
}

function buildQuestionMetrics(attempts: PulseAttempt[]): QuestionMetric[] {
  const map: Record<string, { timesAsked: number; timesCorrect: number; totalTime: number; timedCount: number }> = {};
  for (const a of attempts) {
    for (const ans of a.answers) {
      if (!map[ans.questionId]) map[ans.questionId] = { timesAsked: 0, timesCorrect: 0, totalTime: 0, timedCount: 0 };
      map[ans.questionId].timesAsked++;
      if (ans.isCorrect) map[ans.questionId].timesCorrect++;
      if (typeof ans.timeSpent === 'number' && ans.timeSpent > 0) {
        map[ans.questionId].totalTime += ans.timeSpent;
        map[ans.questionId].timedCount++;
      }
    }
  }
  return Object.entries(map)
    .map(([questionId, { timesAsked, timesCorrect, totalTime, timedCount }]) => ({
      questionId,
      timesAsked,
      timesCorrect,
      correctRate: timesAsked > 0 ? Math.round((timesCorrect / timesAsked) * 100) : 0,
      avgTime: timedCount > 0 ? Math.round(totalTime / timedCount) : 0,
    }))
    .sort((a, b) => a.correctRate - b.correctRate);
}

interface EnrichedModuleMetric {
  module: KnowledgeModule;
  label: string;
  totalAnswers: number;
  correctAnswers: number;
  correctRate: number;
  /** Users with >70% correct in this module. */
  domina: number;
  /** Users with 50–70% correct. */
  enProceso: number;
  /** Users with <50% correct. */
  necesitaApoyo: number;
  /** Top hardest questions in this module (sorted by correctRate asc). */
  hardestQuestions: QuestionMetric[];
}

function buildEnrichedModuleMetrics(
  attempts: PulseAttempt[],
  questionMap: Record<string, Question>,
  allQuestionMetrics: QuestionMetric[],
): EnrichedModuleMetric[] {
  // Overall correct/total per module
  const overall: Record<string, { totalAnswers: number; correctAnswers: number }> = {};
  // Per-user per-module correct/total (to compute distribution)
  const perUser: Record<string, Record<string, { correct: number; total: number }>> = {};

  for (const a of attempts) {
    if (!perUser[a.userId]) perUser[a.userId] = {};
    for (const ans of a.answers) {
      const q = questionMap[ans.questionId];
      if (!q?.module) continue;
      const mod = q.module;
      // overall
      if (!overall[mod]) overall[mod] = { totalAnswers: 0, correctAnswers: 0 };
      overall[mod].totalAnswers++;
      if (ans.isCorrect) overall[mod].correctAnswers++;
      // per-user
      if (!perUser[a.userId][mod]) perUser[a.userId][mod] = { correct: 0, total: 0 };
      perUser[a.userId][mod].total++;
      if (ans.isCorrect) perUser[a.userId][mod].correct++;
    }
  }

  // Compute user distribution per module
  const dist: Record<string, { domina: number; enProceso: number; necesitaApoyo: number }> = {};
  for (const modules of Object.values(perUser)) {
    for (const [mod, { correct, total }] of Object.entries(modules)) {
      if (total === 0) continue;
      const rate = (correct / total) * 100;
      if (!dist[mod]) dist[mod] = { domina: 0, enProceso: 0, necesitaApoyo: 0 };
      if (rate >= 70) dist[mod].domina++;
      else if (rate >= 50) dist[mod].enProceso++;
      else dist[mod].necesitaApoyo++;
    }
  }

  // Build question-per-module index from already-sorted allQuestionMetrics
  const qByModule: Record<string, QuestionMetric[]> = {};
  for (const qm of allQuestionMetrics) {
    const mod = questionMap[qm.questionId]?.module;
    if (!mod) continue;
    if (!qByModule[mod]) qByModule[mod] = [];
    if (qByModule[mod].length < 3) qByModule[mod].push(qm); // top 3 hardest (already sorted asc)
  }

  return Object.entries(overall)
    .map(([mod, { totalAnswers, correctAnswers }]) => ({
      module: mod as KnowledgeModule,
      label: KNOWLEDGE_MODULE_LABELS[mod as KnowledgeModule] ?? mod,
      totalAnswers,
      correctAnswers,
      correctRate: totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0,
      domina: dist[mod]?.domina ?? 0,
      enProceso: dist[mod]?.enProceso ?? 0,
      necesitaApoyo: dist[mod]?.necesitaApoyo ?? 0,
      hardestQuestions: qByModule[mod] ?? [],
    }))
    .sort((a, b) => a.correctRate - b.correctRate);
}

function buildTrendMetrics(attempts: PulseAttempt[]): { date: string; count: number; avgPct: number }[] {
  const map: Record<string, { count: number; totalPct: number }> = {};
  for (const a of attempts) {
    if (!map[a.date]) map[a.date] = { count: 0, totalPct: 0 };
    map[a.date].count++;
    map[a.date].totalPct += a.percentage;
  }
  return Object.entries(map)
    .map(([date, { count, totalPct }]) => ({ date, count, avgPct: count > 0 ? Math.round(totalPct / count) : 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void; onRemove?: () => void; removable?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 h-8 border rounded-full px-3 bg-background text-sm shadow-sm hover:border-primary/40 transition-colors">
      <span className="text-muted-foreground text-xs shrink-0 font-medium">{label}:</span>
      <select
        className="bg-transparent border-none outline-none text-sm font-semibold cursor-pointer max-w-[140px]"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {removable && onRemove && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function DateFilterChip({ label, value, onChange, onRemove }: {
  label: string; value: string; onChange: (v: string) => void; onRemove: () => void;
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
      <button onClick={onRemove} className="text-muted-foreground hover:text-foreground ml-0.5 shrink-0">
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
  const [filterValue, setFilterValue] = useState('');
  const [cosechaGranularity, setCosechaGranularity] = useState<CosechaGranularity>('mes');
  const [cosechaFrom, setCosechaFrom] = useState('');
  const [cosechaTo, setCosechaTo] = useState('');
  const [activeOptFilters, setActiveOptFilters] = useState<Set<OptFilter>>(new Set(['dimension']));
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const addFilterRef = useRef<HTMLDivElement>(null);

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
      if (key === 'dimension') {
        next.delete('filterValue');
        next.delete('cosechaGranularity');
        next.delete('cosechaFrom');
        next.delete('cosechaTo');
      }
      return next;
    });
    if (key === 'filterValue') setFilterValue('');
    if (key === 'cosechaFrom') setCosechaFrom('');
    if (key === 'cosechaTo') setCosechaTo('');
  };

  // ── Load pulse data ────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'pulse') return;
    setLoadingPulse(true);
    const endDate = todayStr();
    const startDate = addDays(endDate, -parseInt(periodDays));
    Promise.all([
      getDailyPulses(startDate, endDate),
      getQuestions(undefined, false),
      getAllUsers(),
      getPulseAttemptsByDateRange(startDate, endDate),
    ]).then(([pulseList, allQs, allUsersList, allAttempts]) => {
      setPulses(pulseList);
      setTotalUsers(allUsersList.filter(u => (u as { active?: boolean }).active !== false).length);
      const map: Record<string, Question> = {};
      for (const q of allQs) map[q.id] = q;
      setQuestionMap(map);
      setPulseAttempts(allAttempts);
    }).finally(() => setLoadingPulse(false));
  }, [activeTab, periodDays]);

  // ── Base attempts: completed + cosecha filters ────────────────────────
  // Computed BEFORE filterValue so we can build the dimension value dropdown
  const baseAttempts = useMemo(() => {
    let result = pulseAttempts.filter(a => a.status === 'completed');
    if (cosechaFrom && activeOptFilters.has('cosechaFrom')) {
      result = result.filter(a => a.cosecha && getCosechaGroup(a.cosecha, 'mes') >= cosechaFrom);
    }
    if (cosechaTo && activeOptFilters.has('cosechaTo')) {
      result = result.filter(a => a.cosecha && getCosechaGroup(a.cosecha, 'mes') <= cosechaTo);
    }
    return result;
  }, [pulseAttempts, cosechaFrom, cosechaTo, activeOptFilters]);

  // Available values for the current dimension (from base, before filterValue)
  const dimensionValues = useMemo(() => {
    const set = new Set<string>();
    for (const a of baseAttempts) {
      const v = getDimensionValue(a, dimension, cosechaGranularity);
      if (v && v !== 'Sin datos') set.add(v);
    }
    return Array.from(set).sort();
  }, [baseAttempts, dimension, cosechaGranularity]);

  // ── filteredAttempts: base + filterValue ───────────────────────────────
  const filteredAttempts = useMemo(() => {
    if (filterValue && activeOptFilters.has('filterValue')) {
      return baseAttempts.filter(
        a => getDimensionValue(a, dimension, cosechaGranularity) === filterValue
      );
    }
    return baseAttempts;
  }, [baseAttempts, filterValue, activeOptFilters, dimension, cosechaGranularity]);

  // Available optional filters to add
  const availableToAdd: { key: OptFilter; label: string }[] = useMemo(() => {
    const out: { key: OptFilter; label: string }[] = [];
    if (!activeOptFilters.has('dimension')) out.push({ key: 'dimension', label: 'Segmento' });
    if (activeOptFilters.has('dimension')) {
      if (dimension !== 'cosecha' && !activeOptFilters.has('filterValue')) {
        out.push({ key: 'filterValue', label: `Filtrar por ${DIMENSION_LABELS[dimension]}` });
      }
      if (dimension === 'cosecha') {
        if (!activeOptFilters.has('cosechaGranularity')) out.push({ key: 'cosechaGranularity', label: 'Agrupación cosecha' });
        if (!activeOptFilters.has('cosechaFrom')) out.push({ key: 'cosechaFrom', label: 'Cosecha desde' });
        if (!activeOptFilters.has('cosechaTo')) out.push({ key: 'cosechaTo', label: 'Cosecha hasta' });
      }
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOptFilters, dimension]);

  // ── KPI metrics ────────────────────────────────────────────────────────

  const overallPct = filteredAttempts.length > 0
    ? Math.round(filteredAttempts.reduce((s, a) => s + a.percentage, 0) / filteredAttempts.length)
    : 0;

  const avgTotalTime = filteredAttempts.length > 0
    ? Math.round(
        filteredAttempts.reduce((s, a) => s + a.answers.reduce((t, ans) => t + (ans.timeSpent ?? 0), 0), 0)
        / filteredAttempts.length
      )
    : 0;

  const uniqueRespondents = new Set(filteredAttempts.map(a => a.userId)).size;
  const participationRate = totalUsers > 0 ? Math.round((uniqueRespondents / totalUsers) * 100) : 0;

  // ── Derived metrics ────────────────────────────────────────────────────

  const questionMetrics = useMemo(() => buildQuestionMetrics(filteredAttempts), [filteredAttempts]);

  const moduleMetrics = useMemo(
    () => buildEnrichedModuleMetrics(filteredAttempts, questionMap, questionMetrics),
    [filteredAttempts, questionMap, questionMetrics]
  );

  const trendMetrics = useMemo(() => buildTrendMetrics(filteredAttempts), [filteredAttempts]);
  const maxTrendCount = Math.max(...trendMetrics.map(t => t.count), 1);

  const segmentMetrics = useMemo(
    () => activeOptFilters.has('dimension')
      ? buildSegmentMetrics(filteredAttempts, dimension, cosechaGranularity)
      : [],
    [filteredAttempts, dimension, cosechaGranularity, activeOptFilters]
  );
  const maxSegPct = segmentMetrics[0]?.avgPct ?? 100;

  // ── Diagnóstico: summary insights ─────────────────────────────────────

  const needsHelp = moduleMetrics.filter(m => m.correctRate < 50);
  const inProgress = moduleMetrics.filter(m => m.correctRate >= 50 && m.correctRate < 70);
  const mastered = moduleMetrics.filter(m => m.correctRate >= 70);

  // Hardest question with enough data (≥5 times asked)
  const hardestQ = questionMetrics.find(q => q.timesAsked >= 5);
  // Slowest question with enough data
  const slowestQ = [...questionMetrics]
    .filter(q => q.avgTime > 0 && q.timesAsked >= 5)
    .sort((a, b) => b.avgTime - a.avgTime)[0];
  // Total users needing help across all modules (unique users with avg < 50%)
  const atRiskUserIds = useMemo(() => {
    const map: Record<string, { correct: number; total: number }> = {};
    for (const a of filteredAttempts) {
      if (!map[a.userId]) map[a.userId] = { correct: 0, total: 0 };
      map[a.userId].correct += a.correctAnswers;
      map[a.userId].total += a.totalQuestions;
    }
    return Object.entries(map)
      .filter(([, { correct, total }]) => total > 0 && (correct / total) < 0.5)
      .map(([uid]) => uid);
  }, [filteredAttempts]);

  const hasDiagnostico = moduleMetrics.length > 0;

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
              <>{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}</>
            ) : (
              <>
                <StatCard title="Productos Activos" value={products.length} description="Productos disponibles" icon={Target} color="text-blue-500" />
                <StatCard title="Quizzes Publicados" value={quizzes.filter(q => q.published).length} description={`${quizzes.length} en total`} icon={CheckCircle2} color="text-green-500" />
                <StatCard title="Preguntas Totales" value={quizzes.reduce((s, q) => s + (q.totalQuestions || 0), 0)} description="En todos los quizzes" icon={Zap} color="text-yellow-500" />
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
                      const pqs = quizzes.filter(q => q.productId === product.id);
                      const maxCount = Math.max(...products.map(p => quizzes.filter(q => q.productId === p.id).length), 1);
                      return (
                        <div key={product.id} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: product.color }} />
                              <span className="font-medium">{product.name}</span>
                            </div>
                            <span className="text-muted-foreground">{pqs.length} quizzes</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${(pqs.length / maxCount) * 100}%`, backgroundColor: product.color }} />
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

          {/* ── Filter bar ───────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Period — always visible */}
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
              onChange={v => setPeriodDays(v)}
            />

            {/* Dimension */}
            {activeOptFilters.has('dimension') && (
              <FilterChip
                label="Segmento"
                value={dimension}
                options={(Object.entries(DIMENSION_LABELS) as [SegmentDimension, string][]).map(([v, l]) => ({ value: v, label: l }))}
                onChange={v => {
                  setDimension(v as SegmentDimension);
                  setFilterValue('');
                  setActiveOptFilters(prev => {
                    const next = new Set(prev);
                    next.delete('filterValue');
                    if (v !== 'cosecha') {
                      next.delete('cosechaGranularity');
                      next.delete('cosechaFrom');
                      next.delete('cosechaTo');
                    }
                    return next;
                  });
                }}
                onRemove={() => removeFilter('dimension')}
              />
            )}

            {/* Dimension value filter — filters ALL data to that value */}
            {activeOptFilters.has('filterValue') && activeOptFilters.has('dimension') && dimension !== 'cosecha' && (
              <FilterChip
                label={DIMENSION_LABELS[dimension]}
                value={filterValue}
                options={[
                  { value: '', label: `Todos los ${DIMENSION_LABELS[dimension].toLowerCase()}s` },
                  ...dimensionValues.map(v => ({ value: v, label: v })),
                ]}
                onChange={v => setFilterValue(v)}
                onRemove={() => removeFilter('filterValue')}
              />
            )}

            {/* Cosecha granularity */}
            {activeOptFilters.has('dimension') && dimension === 'cosecha' && activeOptFilters.has('cosechaGranularity') && (
              <FilterChip
                label="Agrupar cosecha"
                value={cosechaGranularity}
                options={(Object.entries(GRANULARITY_LABELS) as [CosechaGranularity, string][]).map(([v, l]) => ({ value: v, label: l }))}
                onChange={v => setCosechaGranularity(v as CosechaGranularity)}
                onRemove={() => removeFilter('cosechaGranularity')}
              />
            )}

            {/* Cosecha from */}
            {activeOptFilters.has('cosechaFrom') && (
              <DateFilterChip label="Cosecha desde" value={cosechaFrom} onChange={setCosechaFrom} onRemove={() => removeFilter('cosechaFrom')} />
            )}

            {/* Cosecha to */}
            {activeOptFilters.has('cosechaTo') && (
              <DateFilterChip label="Cosecha hasta" value={cosechaTo} onChange={setCosechaTo} onRemove={() => removeFilter('cosechaTo')} />
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
                  <div className="absolute top-10 left-0 z-50 bg-background border rounded-xl shadow-lg py-1 min-w-[200px]">
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

            {/* Active filter indicator */}
            {filterValue && (
              <span className="text-xs text-muted-foreground italic">
                Mostrando solo: <strong>{filterValue}</strong>
              </span>
            )}
          </div>

          {/* ── Content ──────────────────────────────────────────────── */}
          {loadingPulse ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
              </div>
              <Skeleton className="h-40" />
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          ) : (
            <>
              {/* ── KPIs ─────────────────────────────────────────────── */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  title="Pulsos enviados"
                  value={pulses.length}
                  description={`en los últimos ${periodDays} días`}
                  icon={Radio}
                  color="text-primary"
                />
                <StatCard
                  title="Respuestas totales"
                  value={filteredAttempts.length}
                  description={`${uniqueRespondents} participantes únicos`}
                  icon={Users}
                  color="text-blue-500"
                />
                <StatCard
                  title="% Aciertos promedio"
                  value={`${overallPct}%`}
                  description={avgTotalTime > 0 ? `Tiempo prom. por pulso: ${formatSeconds(avgTotalTime)}` : 'sobre todas las respuestas'}
                  icon={Target}
                  color={overallPct >= 70 ? 'text-green-500' : 'text-orange-500'}
                />
                <StatCard
                  title="Tasa de participación"
                  value={`${participationRate}%`}
                  description={`${uniqueRespondents} de ${totalUsers} usuarios activos`}
                  icon={TrendingUp}
                  color={participationRate >= 70 ? 'text-green-500' : participationRate >= 40 ? 'text-orange-500' : 'text-purple-500'}
                />
              </div>

              {/* ── Diagnóstico del período ───────────────────────────── */}
              {hasDiagnostico && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Diagnóstico del período
                    </CardTitle>
                    <CardDescription>
                      Resumen de salud por módulo · identifica áreas de acción inmediata
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Module tiers */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      {/* Needs help */}
                      <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
                          <Circle className="h-3 w-3 fill-red-500 text-red-500" />
                          Necesitan refuerzo &lt;50%
                        </p>
                        {needsHelp.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Ninguno</p>
                        ) : needsHelp.map(m => (
                          <div key={m.module} className="flex items-center justify-between">
                            <span className="text-xs font-medium text-red-800">{m.label}</span>
                            <span className="text-xs font-bold text-red-600">{m.correctRate}%</span>
                          </div>
                        ))}
                      </div>

                      {/* In progress */}
                      <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-1.5">
                          <Circle className="h-3 w-3 fill-orange-400 text-orange-400" />
                          En desarrollo 50–70%
                        </p>
                        {inProgress.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Ninguno</p>
                        ) : inProgress.map(m => (
                          <div key={m.module} className="flex items-center justify-between">
                            <span className="text-xs font-medium text-orange-800">{m.label}</span>
                            <span className="text-xs font-bold text-orange-600">{m.correctRate}%</span>
                          </div>
                        ))}
                      </div>

                      {/* Mastered */}
                      <div className="rounded-xl border border-green-200 bg-green-50/50 p-3 space-y-1.5">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                          Bien dominados &gt;70%
                        </p>
                        {mastered.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Ninguno aún</p>
                        ) : mastered.map(m => (
                          <div key={m.module} className="flex items-center justify-between">
                            <span className="text-xs font-medium text-green-800">{m.label}</span>
                            <span className="text-xs font-bold text-green-600">{m.correctRate}%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Insight pills */}
                    <div className="flex flex-wrap gap-2 pt-1 border-t">
                      {atRiskUserIds.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-xs bg-red-100 text-red-700 border border-red-200 rounded-full px-3 py-1">
                          <AlertTriangle className="h-3 w-3" />
                          <strong>{atRiskUserIds.length}</strong> usuarios con menos del 50% general
                        </span>
                      )}
                      {hardestQ && (
                        <span className="inline-flex items-center gap-1.5 text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-3 py-1">
                          <Target className="h-3 w-3" />
                          Pregunta más fallada: <strong>{hardestQ.correctRate}%</strong> aciertos
                          {questionMap[hardestQ.questionId]?.text && (
                            <span className="italic truncate max-w-[180px]">
                              · &ldquo;{questionMap[hardestQ.questionId].text.slice(0, 60)}{questionMap[hardestQ.questionId].text.length > 60 ? '…' : ''}&rdquo;
                            </span>
                          )}
                        </span>
                      )}
                      {slowestQ && slowestQ.questionId !== hardestQ?.questionId && (
                        <span className="inline-flex items-center gap-1.5 text-xs bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
                          <Timer className="h-3 w-3" />
                          Pregunta más lenta: <strong>{formatSeconds(slowestQ.avgTime)}</strong> promedio
                          {questionMap[slowestQ.questionId]?.text && (
                            <span className="italic truncate max-w-[180px]">
                              · &ldquo;{questionMap[slowestQ.questionId].text.slice(0, 50)}{questionMap[slowestQ.questionId].text.length > 50 ? '…' : ''}&rdquo;
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Tendencia diaria ─────────────────────────────────── */}
              {trendMetrics.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" /> Tendencia diaria
                    </CardTitle>
                    <CardDescription>
                      Respuestas por día · altura = participación · color = % aciertos (verde ≥70 · naranja 50–70 · rojo &lt;50)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto pb-1">
                      <div
                        className="flex items-end gap-2"
                        style={{ minWidth: `${Math.max(trendMetrics.length * 44, 300)}px`, height: '120px' }}
                      >
                        {trendMetrics.map(({ date, count, avgPct }) => {
                          const barH = Math.max(Math.round((count / maxTrendCount) * 72), 4);
                          const barColor = avgPct >= 70 ? 'bg-green-500' : avgPct >= 50 ? 'bg-orange-400' : 'bg-red-400';
                          return (
                            <div key={date} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                              <span className="text-[10px] text-muted-foreground font-medium leading-none">{avgPct}%</span>
                              <div className="w-full flex items-end" style={{ height: '72px' }}>
                                <div className={cn('w-full rounded-t-sm transition-all duration-500', barColor)} style={{ height: `${barH}px` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">{shortDate(date)}</span>
                              <span className="text-[10px] font-semibold leading-none">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Módulos en profundidad ───────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" /> Módulos en profundidad
                  </CardTitle>
                  <CardDescription>
                    Por módulo: distribución de usuarios y preguntas más difíciles · ordenado de mayor a menor dificultad
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {moduleMetrics.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Sin datos de módulos. Asegúrate de que las preguntas tengan módulo asignado.
                    </p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {moduleMetrics.map(({
                        module, label, totalAnswers, correctAnswers, correctRate,
                        domina, enProceso, necesitaApoyo, hardestQuestions,
                      }) => {
                        const totalUsers = domina + enProceso + necesitaApoyo;
                        return (
                          <div
                            key={module}
                            className="rounded-xl border p-4 space-y-3 bg-card hover:shadow-sm transition-shadow"
                          >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <span className={cn(
                                'text-[11px] px-2 py-1 rounded-full border font-medium leading-none',
                                MODULE_COLORS[module] ?? 'bg-muted text-muted-foreground border-border'
                              )}>
                                {label}
                              </span>
                              <span className={cn(
                                'text-xl font-bold shrink-0',
                                correctRate >= 70 ? 'text-green-600' : correctRate >= 50 ? 'text-orange-500' : 'text-red-500'
                              )}>
                                {correctRate}%
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full transition-all duration-500',
                                  MODULE_BAR_COLORS[module] ?? 'bg-primary'
                                )}
                                style={{ width: `${correctRate}%` }}
                              />
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{correctAnswers}/{totalAnswers} respuestas correctas</span>
                            </div>

                            {/* User distribution */}
                            {totalUsers > 0 && (
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
                                  Distribución de usuarios
                                </p>
                                <div className="flex gap-0 rounded-full overflow-hidden h-2">
                                  {domina > 0 && (
                                    <div className="bg-green-500" style={{ width: `${(domina / totalUsers) * 100}%` }} title={`Domina: ${domina}`} />
                                  )}
                                  {enProceso > 0 && (
                                    <div className="bg-orange-400" style={{ width: `${(enProceso / totalUsers) * 100}%` }} title={`En proceso: ${enProceso}`} />
                                  )}
                                  {necesitaApoyo > 0 && (
                                    <div className="bg-red-400" style={{ width: `${(necesitaApoyo / totalUsers) * 100}%` }} title={`Necesita apoyo: ${necesitaApoyo}`} />
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2 text-[10px]">
                                  {domina > 0 && (
                                    <span className="text-green-700">
                                      <strong>{domina}</strong> dominan
                                    </span>
                                  )}
                                  {enProceso > 0 && (
                                    <span className="text-orange-600">
                                      <strong>{enProceso}</strong> en proceso
                                    </span>
                                  )}
                                  {necesitaApoyo > 0 && (
                                    <span className="text-red-600">
                                      <strong>{necesitaApoyo}</strong> necesitan apoyo
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Hardest questions in this module */}
                            {hardestQuestions.length > 0 && (
                              <div className="space-y-1.5 border-t pt-2">
                                <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
                                  Preguntas más difíciles
                                </p>
                                {hardestQuestions.map(qm => {
                                  const q = questionMap[qm.questionId];
                                  return (
                                    <div key={qm.questionId} className="flex items-start gap-2">
                                      <span className={cn(
                                        'text-[10px] font-bold shrink-0 mt-0.5 w-7 text-right',
                                        qm.correctRate >= 70 ? 'text-green-600' : qm.correctRate >= 40 ? 'text-orange-500' : 'text-red-500'
                                      )}>
                                        {qm.correctRate}%
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[11px] text-foreground leading-snug line-clamp-2">
                                          {q?.text ?? <span className="font-mono text-muted-foreground">{qm.questionId.slice(-8)}</span>}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          {qm.avgTime > 0 && (
                                            <span className="text-[10px] text-muted-foreground">
                                              {formatSeconds(qm.avgTime)} prom.
                                            </span>
                                          )}
                                          <span className="text-[10px] text-muted-foreground">
                                            {qm.timesAsked}× preguntada
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Análisis de preguntas ────────────────────────────── */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Timer className="h-4 w-4" /> Análisis de preguntas
                  </CardTitle>
                  <CardDescription>
                    Top 15 más difíciles · % de aciertos + tiempo promedio de respuesta · ordenadas de mayor a menor dificultad
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {questionMetrics.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Sin datos disponibles.</p>
                  ) : (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[10px] text-muted-foreground uppercase font-medium px-2 pb-1">
                        <span>Pregunta</span>
                        <span className="text-right w-16">Aciertos</span>
                        <span className="text-right w-16">Tiempo</span>
                        <span className="text-right w-12">Veces</span>
                      </div>
                      {questionMetrics.slice(0, 15).map((qm, idx) => {
                        const q = questionMap[qm.questionId];
                        return (
                          <div
                            key={qm.questionId}
                            className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-start p-2 rounded-lg hover:bg-muted/40"
                          >
                            <div className="min-w-0">
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
                                <div className="min-w-0">
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
                                      className={cn('h-full rounded-full',
                                        qm.correctRate >= 70 ? 'bg-green-500' : qm.correctRate >= 40 ? 'bg-orange-400' : 'bg-red-500'
                                      )}
                                      style={{ width: `${qm.correctRate}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <span className={cn(
                              'text-sm font-bold w-16 text-right shrink-0',
                              qm.correctRate >= 70 ? 'text-green-600' : qm.correctRate >= 40 ? 'text-orange-500' : 'text-red-500'
                            )}>{qm.correctRate}%</span>
                            <span className="text-xs text-muted-foreground w-16 text-right shrink-0 font-medium">
                              {formatSeconds(qm.avgTime)}
                            </span>
                            <span className="text-xs text-muted-foreground w-12 text-right shrink-0">
                              {qm.timesAsked}×
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Segmento ─────────────────────────────────────────── */}
              {activeOptFilters.has('dimension') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      % Aciertos por {DIMENSION_LABELS[dimension]}
                      {dimension === 'cosecha' && activeOptFilters.has('cosechaGranularity') && (
                        <span className="text-xs font-normal text-muted-foreground">
                          · {GRANULARITY_LABELS[cosechaGranularity]}
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {filterValue
                        ? `Filtrado a: ${filterValue} · comparación entre todos los valores de ${DIMENSION_LABELS[dimension]}`
                        : `Comparación de rendimiento entre ${DIMENSION_LABELS[dimension].toLowerCase()}s`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {segmentMetrics.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Sin datos de segmentación. Verifica que los usuarios tengan el campo{' '}
                        <code className="text-xs bg-muted px-1 rounded">{dimension}</code> en su perfil.
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
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
