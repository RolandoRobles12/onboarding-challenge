'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3, TrendingUp, TrendingDown, Users, Target, Clock, Zap, Radio,
  BookOpen, X, Plus, Timer, AlertTriangle, CheckCircle2, Circle,
  ChevronDown, ChevronRight, Search, ArrowUpDown, Download,
} from 'lucide-react';
import { useProducts, useQuizzes } from '@/hooks/use-firestore';
import { getDailyPulses, getPulseAttemptsByDateRange, getQuestions, getAllUsers } from '@/lib/firestore-service';
import type { PulseAttempt, DailyPulse, Question, KnowledgeModule, UserProfile } from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS } from '@/lib/types-scalable';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────

type SegmentDimension = 'vertical' | 'hub' | 'estado' | 'cosecha';
type CosechaGranularity = 'semana' | 'mes' | 'trimestre' | 'año';
type UserSortKey = 'avgPct' | 'nombre' | 'lastActivity';

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
function pctColor(rate: number): string {
  if (rate >= 70) return 'text-green-600';
  if (rate >= 50) return 'text-orange-500';
  return 'text-red-500';
}
function barColor(rate: number): string {
  if (rate >= 70) return 'bg-green-500';
  if (rate >= 50) return 'bg-orange-400';
  return 'bg-red-500';
}
function cellBg(rate: number | null): string {
  if (rate === null) return 'bg-muted/30 text-muted-foreground';
  if (rate >= 70) return 'bg-green-100 text-green-800';
  if (rate >= 50) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
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

function getDimensionValue(a: PulseAttempt, dim: SegmentDimension, granularity: CosechaGranularity = 'mes'): string {
  if (dim === 'cosecha') return getCosechaGroup(a.cosecha, granularity);
  return (a[dim] as string) || 'Sin datos';
}

// ── Metric builders ────────────────────────────────────────────────────────

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
    .sort((a, b) => a.correctRate - b.correctRate); // lowest rate first
}

interface EnrichedModuleMetric {
  module: KnowledgeModule;
  label: string;
  totalAnswers: number;
  correctAnswers: number;
  correctRate: number;
  domina: number;
  enProceso: number;
  necesitaApoyo: number;
  hardestQuestions: QuestionMetric[];
}

function buildEnrichedModuleMetrics(
  attempts: PulseAttempt[],
  questionMap: Record<string, Question>,
  allQuestionMetrics: QuestionMetric[],
): EnrichedModuleMetric[] {
  const overall: Record<string, { totalAnswers: number; correctAnswers: number }> = {};
  const perUser: Record<string, Record<string, { correct: number; total: number }>> = {};

  for (const a of attempts) {
    if (!perUser[a.userId]) perUser[a.userId] = {};
    for (const ans of a.answers) {
      const q = questionMap[ans.questionId];
      if (!q?.module) continue;
      const mod = q.module;
      if (!overall[mod]) overall[mod] = { totalAnswers: 0, correctAnswers: 0 };
      overall[mod].totalAnswers++;
      if (ans.isCorrect) overall[mod].correctAnswers++;
      if (!perUser[a.userId][mod]) perUser[a.userId][mod] = { correct: 0, total: 0 };
      perUser[a.userId][mod].total++;
      if (ans.isCorrect) perUser[a.userId][mod].correct++;
    }
  }

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

  const qByModule: Record<string, QuestionMetric[]> = {};
  for (const qm of allQuestionMetrics) {
    const mod = questionMap[qm.questionId]?.module;
    if (!mod) continue;
    if (!qByModule[mod]) qByModule[mod] = [];
    if (qByModule[mod].length < 3) qByModule[mod].push(qm);
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

// ── User detail metrics ────────────────────────────────────────────────────

interface ModuleRate {
  module: KnowledgeModule;
  label: string;
  correct: number;
  total: number;
  rate: number;
}

interface UserDetailMetric {
  userId: string;
  userName: string;
  hub: string;
  vertical: string;
  estado: string;
  totalAttempts: number;
  avgPct: number;
  totalCorrect: number;
  totalQuestions: number;
  lastActivity: string;
  moduleRates: ModuleRate[];
  worstModuleLabel: string;
}

function buildUserDetailMetrics(
  attempts: PulseAttempt[],
  questionMap: Record<string, Question>,
): UserDetailMetric[] {
  const users: Record<string, {
    userName: string; hub: string; vertical: string; estado: string;
    attempts: number; totalPct: number; correct: number; questions: number;
    lastActivity: string;
    moduleMap: Record<string, { correct: number; total: number }>;
  }> = {};

  for (const a of attempts) {
    if (!users[a.userId]) {
      users[a.userId] = {
        userName: a.userName || a.userId,
        hub: a.hub || '-', vertical: a.vertical || '-', estado: a.estado || '-',
        attempts: 0, totalPct: 0, correct: 0, questions: 0,
        lastActivity: a.date, moduleMap: {},
      };
    }
    const u = users[a.userId];
    u.attempts++;
    u.totalPct += a.percentage;
    u.correct += a.correctAnswers;
    u.questions += a.totalQuestions;
    if (a.date > u.lastActivity) u.lastActivity = a.date;

    for (const ans of a.answers) {
      const q = questionMap[ans.questionId];
      if (!q?.module) continue;
      if (!u.moduleMap[q.module]) u.moduleMap[q.module] = { correct: 0, total: 0 };
      u.moduleMap[q.module].total++;
      if (ans.isCorrect) u.moduleMap[q.module].correct++;
    }
  }

  return Object.entries(users)
    .map(([userId, u]) => {
      const moduleRates: ModuleRate[] = Object.entries(u.moduleMap).map(([mod, { correct, total }]) => ({
        module: mod as KnowledgeModule,
        label: KNOWLEDGE_MODULE_LABELS[mod as KnowledgeModule] ?? mod,
        correct, total,
        rate: total > 0 ? Math.round((correct / total) * 100) : 0,
      })).sort((a, b) => a.rate - b.rate);

      const worst = moduleRates[0];
      return {
        userId,
        userName: u.userName,
        hub: u.hub, vertical: u.vertical, estado: u.estado,
        totalAttempts: u.attempts,
        avgPct: u.attempts > 0 ? Math.round(u.totalPct / u.attempts) : 0,
        totalCorrect: u.correct,
        totalQuestions: u.questions,
        lastActivity: u.lastActivity,
        moduleRates,
        worstModuleLabel: worst ? `${worst.label} (${worst.rate}%)` : '-',
      };
    })
    .sort((a, b) => a.avgPct - b.avgPct); // worst performers first
}

// ── Enriched user rows (all users merged with pulse metrics) ───────────────

interface EnrichedUserRow {
  uid: string;
  nombre: string;
  email: string;
  hub: string;
  vertical: string;
  estado: string;
  hasResponded: boolean;
  avgPct: number;
  totalAttempts: number;
  totalCorrect: number;
  totalQuestions: number;
  lastActivity: string | null;
  moduleRates: ModuleRate[];
  worstModuleLabel: string;
}

function buildEnrichedUserRows(
  allUsers: UserProfile[],
  userMetrics: UserDetailMetric[],
): EnrichedUserRow[] {
  const byId = new Map(userMetrics.map(u => [u.userId, u]));
  return allUsers.map(user => {
    const m = byId.get(user.uid);
    return {
      uid: user.uid,
      nombre: user.nombre || user.email,
      email: user.email,
      hub: (m?.hub && m.hub !== '-') ? m.hub : (user.assignedKiosko || '-'),
      vertical: (m?.vertical && m.vertical !== '-') ? m.vertical : (user.onboardingData?.['vertical'] || '-'),
      estado: (m?.estado && m.estado !== '-') ? m.estado : (user.onboardingData?.['estado'] || '-'),
      hasResponded: !!m,
      avgPct: m?.avgPct ?? 0,
      totalAttempts: m?.totalAttempts ?? 0,
      totalCorrect: m?.totalCorrect ?? 0,
      totalQuestions: m?.totalQuestions ?? 0,
      lastActivity: m?.lastActivity ?? null,
      moduleRates: m?.moduleRates ?? [],
      worstModuleLabel: m?.worstModuleLabel ?? '-',
    };
  });
}

// ── User timeline ──────────────────────────────────────────────────────────

interface UserTimelinePoint {
  date: string;
  pct: number;
  correct: number;
  total: number;
}

function buildUserTimeline(attempts: PulseAttempt[], userId: string): UserTimelinePoint[] {
  return attempts
    .filter(a => a.userId === userId && a.status === 'completed')
    .map(a => ({ date: a.date, pct: a.percentage, correct: a.correctAnswers, total: a.totalQuestions }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── CSV export ─────────────────────────────────────────────────────────────

function exportUsersCSV(rows: EnrichedUserRow[]) {
  const headers = [
    'Nombre', 'Email', 'Hub', 'Vertical', 'Estado',
    '% Aciertos', 'Pulsos completados', 'Correctas', 'Total preguntas',
    'Última actividad', 'Módulo más débil',
  ];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map(r => [
    r.nombre, r.email, r.hub, r.vertical, r.estado,
    r.hasResponded ? r.avgPct : '',
    r.totalAttempts || '',
    r.totalCorrect || '',
    r.totalQuestions || '',
    r.lastActivity || '',
    r.worstModuleLabel !== '-' ? r.worstModuleLabel : '',
  ].map(escape).join(','));
  const csv = '\uFEFF' + [headers.join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `usuarios-pulso-${dateToStr(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Cross-tab: segment × module ────────────────────────────────────────────

interface CrossTabData {
  rowKeys: string[];
  colKeys: KnowledgeModule[];
  colLabels: Record<string, string>;
  cells: Record<string, Record<string, { correct: number; total: number; rate: number } | null>>;
  rowTotals: Record<string, { correct: number; total: number; rate: number }>;
}

function buildCrossTab(
  attempts: PulseAttempt[],
  questionMap: Record<string, Question>,
  segmentDim: SegmentDimension,
  granularity: CosechaGranularity,
): CrossTabData {
  const cells: Record<string, Record<string, { correct: number; total: number }>> = {};
  const rowTotalsRaw: Record<string, { correct: number; total: number }> = {};
  const colKeySet = new Set<KnowledgeModule>();

  for (const a of attempts) {
    const rowKey = getDimensionValue(a, segmentDim, granularity);
    if (!cells[rowKey]) cells[rowKey] = {};
    if (!rowTotalsRaw[rowKey]) rowTotalsRaw[rowKey] = { correct: 0, total: 0 };
    for (const ans of a.answers) {
      const q = questionMap[ans.questionId];
      if (!q?.module) continue;
      const mod = q.module;
      colKeySet.add(mod);
      if (!cells[rowKey][mod]) cells[rowKey][mod] = { correct: 0, total: 0 };
      cells[rowKey][mod].total++;
      rowTotalsRaw[rowKey].total++;
      if (ans.isCorrect) {
        cells[rowKey][mod].correct++;
        rowTotalsRaw[rowKey].correct++;
      }
    }
  }

  const rowKeys = Object.keys(cells).sort();
  const colKeys = Array.from(colKeySet) as KnowledgeModule[];
  const colLabels: Record<string, string> = {};
  for (const k of colKeys) colLabels[k] = KNOWLEDGE_MODULE_LABELS[k] ?? k;

  const filledCells: CrossTabData['cells'] = {};
  for (const rk of rowKeys) {
    filledCells[rk] = {};
    for (const ck of colKeys) {
      const c = cells[rk][ck];
      filledCells[rk][ck] = c
        ? { correct: c.correct, total: c.total, rate: Math.round((c.correct / c.total) * 100) }
        : null;
    }
  }

  const rowTotals: CrossTabData['rowTotals'] = {};
  for (const [rk, { correct, total }] of Object.entries(rowTotalsRaw)) {
    rowTotals[rk] = { correct, total, rate: total > 0 ? Math.round((correct / total) * 100) : 0 };
  }

  return { rowKeys, colKeys, colLabels, cells: filledCells, rowTotals };
}

// ── Product metrics ────────────────────────────────────────────────────────

interface ProductMetric {
  productId: string;
  productName: string;
  productColor: string;
  totalAnswers: number;
  correctAnswers: number;
  correctRate: number;
  moduleRates: Array<{ module: KnowledgeModule; label: string; rate: number; total: number }>;
}

function buildProductMetrics(
  attempts: PulseAttempt[],
  questionMap: Record<string, Question>,
  productList: { id: string; name: string; color: string }[],
): ProductMetric[] {
  const prod: Record<string, { total: number; correct: number; moduleMap: Record<string, { correct: number; total: number }> }> = {};

  for (const a of attempts) {
    for (const ans of a.answers) {
      const q = questionMap[ans.questionId];
      if (!q?.productId) continue;
      if (!prod[q.productId]) prod[q.productId] = { total: 0, correct: 0, moduleMap: {} };
      prod[q.productId].total++;
      if (ans.isCorrect) prod[q.productId].correct++;
      if (q.module) {
        if (!prod[q.productId].moduleMap[q.module]) prod[q.productId].moduleMap[q.module] = { correct: 0, total: 0 };
        prod[q.productId].moduleMap[q.module].total++;
        if (ans.isCorrect) prod[q.productId].moduleMap[q.module].correct++;
      }
    }
  }

  return Object.entries(prod)
    .map(([productId, { total, correct, moduleMap }]) => {
      const found = productList.find(p => p.id === productId);
      const moduleRates = Object.entries(moduleMap).map(([mod, { correct: c, total: t }]) => ({
        module: mod as KnowledgeModule,
        label: KNOWLEDGE_MODULE_LABELS[mod as KnowledgeModule] ?? mod,
        rate: t > 0 ? Math.round((c / t) * 100) : 0,
        total: t,
      })).sort((a, b) => a.rate - b.rate);

      return {
        productId,
        productName: found?.name ?? productId,
        productColor: found?.color ?? '#94a3b8',
        totalAnswers: total,
        correctAnswers: correct,
        correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
        moduleRates,
      };
    })
    .filter(p => p.totalAnswers > 0)
    .sort((a, b) => a.correctRate - b.correctRate);
}

// ── Segment chart ──────────────────────────────────────────────────────────

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

// ── Components ─────────────────────────────────────────────────────────────

function StatCard({ title, value, description, icon: Icon, color, delta }: {
  title: string; value: string | number; description?: string;
  icon: React.ElementType; color: string;
  delta?: { value: number; positive: boolean } | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          <div className="text-2xl font-bold">{value}</div>
          {delta && (
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold mb-1', delta.positive ? 'text-green-600' : 'text-red-500')}>
              {delta.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta.value > 0 ? `${delta.positive ? '+' : '-'}${delta.value}` : '='}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        {delta && <p className="text-[10px] text-muted-foreground">vs período anterior</p>}
      </CardContent>
    </Card>
  );
}

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

// ── Main page ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { products, loading: loadingProducts } = useProducts();
  const { quizzes, loading: loadingQuizzes } = useQuizzes();

  const [activeTab, setActiveTab] = useState('platform');
  const [pulseSubTab, setPulseSubTab] = useState('resumen');
  const [loadingPulse, setLoadingPulse] = useState(false);
  const [pulseAttempts, setPulseAttempts] = useState<PulseAttempt[]>([]);
  const [pulses, setPulses] = useState<DailyPulse[]>([]);
  const [questionMap, setQuestionMap] = useState<Record<string, Question>>({});
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [prevPulseAttempts, setPrevPulseAttempts] = useState<PulseAttempt[]>([]);

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

  // Users sub-tab state
  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort] = useState<UserSortKey>('avgPct');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  // Comparison sub-tab state
  const [compDim, setCompDim] = useState<SegmentDimension>('hub');

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

  // ── Load pulse data ──────────────────────────────────────────────────────

  // Persist key filters to localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('analytics_filters');
      if (saved) {
        const f = JSON.parse(saved);
        if (f.periodDays) setPeriodDays(f.periodDays);
        if (f.dimension) setDimension(f.dimension);
        if (f.cosechaGranularity) setCosechaGranularity(f.cosechaGranularity);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('analytics_filters', JSON.stringify({ periodDays, dimension, cosechaGranularity }));
    } catch { /* ignore */ }
  }, [periodDays, dimension, cosechaGranularity]);

  useEffect(() => {
    if (activeTab !== 'pulse') return;
    setLoadingPulse(true);
    const endDate = todayStr();
    const startDate = addDays(endDate, -parseInt(periodDays));
    const prevStartDate = addDays(startDate, -parseInt(periodDays));
    Promise.all([
      getDailyPulses(startDate, endDate),
      getQuestions(undefined, false),
      getAllUsers(),
      getPulseAttemptsByDateRange(startDate, endDate),
      getPulseAttemptsByDateRange(prevStartDate, startDate),
    ]).then(([pulseList, allQs, userList, allAttempts, prevAttempts]) => {
      setPulses(pulseList);
      setAllUsers(userList.filter(u => u.active !== false));
      const map: Record<string, Question> = {};
      for (const q of allQs) map[q.id] = q;
      setQuestionMap(map);
      setPulseAttempts(allAttempts);
      setPrevPulseAttempts(prevAttempts);
    }).finally(() => setLoadingPulse(false));
  }, [activeTab, periodDays]);

  const totalUsers = allUsers.length;

  // ── Base attempts (cosecha filters only) ────────────────────────────────

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

  const dimensionValues = useMemo(() => {
    const set = new Set<string>();
    for (const a of baseAttempts) {
      const v = getDimensionValue(a, dimension, cosechaGranularity);
      if (v && v !== 'Sin datos') set.add(v);
    }
    return Array.from(set).sort();
  }, [baseAttempts, dimension, cosechaGranularity]);

  // ── Filtered attempts (base + filterValue) ───────────────────────────────

  const filteredAttempts = useMemo(() => {
    if (filterValue && activeOptFilters.has('filterValue')) {
      return baseAttempts.filter(a => getDimensionValue(a, dimension, cosechaGranularity) === filterValue);
    }
    return baseAttempts;
  }, [baseAttempts, filterValue, activeOptFilters, dimension, cosechaGranularity]);

  const availableToAdd = useMemo((): { key: OptFilter; label: string }[] => {
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

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const overallPct = filteredAttempts.length > 0
    ? Math.round(filteredAttempts.reduce((s, a) => s + a.percentage, 0) / filteredAttempts.length)
    : 0;

  const avgTotalTime = filteredAttempts.length > 0
    ? Math.round(filteredAttempts.reduce((s, a) => s + a.answers.reduce((t, ans) => t + (ans.timeSpent ?? 0), 0), 0) / filteredAttempts.length)
    : 0;

  const uniqueRespondents = new Set(filteredAttempts.map(a => a.userId)).size;
  const participationRate = totalUsers > 0 ? Math.round((uniqueRespondents / totalUsers) * 100) : 0;

  // ── Previous period KPIs (for delta comparison) ───────────────────────────

  const prevFilteredAttempts = useMemo(() => {
    let result = prevPulseAttempts.filter(a => a.status === 'completed');
    if (filterValue && activeOptFilters.has('filterValue')) {
      result = result.filter(a => getDimensionValue(a, dimension, cosechaGranularity) === filterValue);
    }
    return result;
  }, [prevPulseAttempts, filterValue, activeOptFilters, dimension, cosechaGranularity]);

  const prevOverallPct = prevFilteredAttempts.length > 0
    ? Math.round(prevFilteredAttempts.reduce((s, a) => s + a.percentage, 0) / prevFilteredAttempts.length)
    : null;
  const prevUniqueRespondents = new Set(prevFilteredAttempts.map(a => a.userId)).size;
  const prevParticipationRate = totalUsers > 0 ? Math.round((prevUniqueRespondents / totalUsers) * 100) : null;

  function delta(current: number, prev: number | null): { value: number; positive: boolean } | null {
    if (prev === null || prev === 0) return null;
    const d = current - prev;
    return { value: Math.abs(d), positive: d >= 0 };
  }

  // ── Derived metrics ───────────────────────────────────────────────────────

  const questionMetrics = useMemo(() => buildQuestionMetrics(filteredAttempts), [filteredAttempts]);
  const moduleMetrics = useMemo(() => buildEnrichedModuleMetrics(filteredAttempts, questionMap, questionMetrics), [filteredAttempts, questionMap, questionMetrics]);
  const trendMetrics = useMemo(() => buildTrendMetrics(filteredAttempts), [filteredAttempts]);
  const maxTrendCount = Math.max(...trendMetrics.map(t => t.count), 1);
  const segmentMetrics = useMemo(
    () => activeOptFilters.has('dimension') ? buildSegmentMetrics(filteredAttempts, dimension, cosechaGranularity) : [],
    [filteredAttempts, dimension, cosechaGranularity, activeOptFilters],
  );
  const maxSegPct = segmentMetrics[0]?.avgPct ?? 100;

  const userDetailMetrics = useMemo(() => buildUserDetailMetrics(filteredAttempts, questionMap), [filteredAttempts, questionMap]);

  // All users merged with their pulse metrics (shows even users with no responses)
  const allUsersEnriched = useMemo(
    () => buildEnrichedUserRows(allUsers, userDetailMetrics),
    [allUsers, userDetailMetrics],
  );

  const crossTabData = useMemo(
    () => buildCrossTab(filteredAttempts, questionMap, compDim, cosechaGranularity),
    [filteredAttempts, questionMap, compDim, cosechaGranularity],
  );

  const productMetrics = useMemo(
    () => buildProductMetrics(filteredAttempts, questionMap, products),
    [filteredAttempts, questionMap, products],
  );

  // ── Diagnóstico ───────────────────────────────────────────────────────────

  const needsHelp = moduleMetrics.filter(m => m.correctRate < 50);
  const inProgress = moduleMetrics.filter(m => m.correctRate >= 50 && m.correctRate < 70);
  const mastered = moduleMetrics.filter(m => m.correctRate >= 70);
  const hardestQ = questionMetrics.find(q => q.timesAsked >= 2);
  const slowestQ = [...questionMetrics].filter(q => q.avgTime > 0 && q.timesAsked >= 2).sort((a, b) => b.avgTime - a.avgTime)[0];
  const atRiskUserIds = useMemo(() => {
    const map: Record<string, { correct: number; total: number }> = {};
    for (const a of filteredAttempts) {
      if (!map[a.userId]) map[a.userId] = { correct: 0, total: 0 };
      map[a.userId].correct += a.correctAnswers;
      map[a.userId].total += a.totalQuestions;
    }
    return Object.entries(map).filter(([, { correct, total }]) => total > 0 && (correct / total) < 0.5).map(([uid]) => uid);
  }, [filteredAttempts]);

  // ── Users table helpers ───────────────────────────────────────────────────

  const respondedCount = allUsersEnriched.filter(u => u.hasResponded).length;

  const filteredSortedUsers = useMemo(() => {
    let list = [...allUsersEnriched];
    if (userSearch) {
      const q = userSearch.toLowerCase();
      list = list.filter(u =>
        u.nombre.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.hub.toLowerCase().includes(q) ||
        u.vertical.toLowerCase().includes(q),
      );
    }
    // Apply segment filter to users list when filterValue is active
    if (filterValue && activeOptFilters.has('filterValue') && activeOptFilters.has('dimension') && dimension !== 'cosecha') {
      list = list.filter(u => {
        const val = dimension === 'hub' ? u.hub : dimension === 'vertical' ? u.vertical : u.estado;
        return val === filterValue;
      });
    }
    list.sort((a, b) => {
      if (userSort === 'avgPct') {
        // Non-respondents always go to the bottom
        if (!a.hasResponded && b.hasResponded) return 1;
        if (a.hasResponded && !b.hasResponded) return -1;
        return a.avgPct - b.avgPct; // worst performers first
      }
      if (userSort === 'nombre') return a.nombre.localeCompare(b.nombre);
      if (userSort === 'lastActivity') {
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return b.lastActivity.localeCompare(a.lastActivity);
      }
      return 0;
    });
    return list;
  }, [allUsersEnriched, userSearch, userSort, filterValue, activeOptFilters, dimension]);

  function toggleUserExpand(uid: string) {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Métricas y estadísticas de la plataforma</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="platform"><BarChart3 className="h-4 w-4 mr-1.5" />Plataforma</TabsTrigger>
          <TabsTrigger value="pulse"><Radio className="h-4 w-4 mr-1.5" />Pulso de Conocimiento</TabsTrigger>
        </TabsList>

        {/* ── PLATFORM TAB ────────────────────────────────────────────────── */}
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
                <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" />Quizzes por Producto</CardTitle>
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
                            <div className="h-full rounded-full transition-all" style={{ width: `${(pqs.length / maxCount) * 100}%`, backgroundColor: product.color }} />
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
                <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Resumen de Contenido</CardTitle>
                <CardDescription>Estado actual de los quizzes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(['Publicados', 'Borradores', 'Desactivados'] as const).map((label, i) => {
                    const counts = [quizzes.filter(q => q.published && q.active).length, quizzes.filter(q => !q.published && q.active).length, quizzes.filter(q => !q.active).length];
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

        {/* ── PULSE TAB ────────────────────────────────────────────────────── */}
        <TabsContent value="pulse" className="mt-4 space-y-4">

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label="Período" value={periodDays} removable={false}
              options={[
                { value: '7', label: 'Últimos 7 días' }, { value: '14', label: 'Últimos 14 días' },
                { value: '30', label: 'Últimos 30 días' }, { value: '90', label: 'Últimos 90 días' },
                { value: '180', label: 'Últimos 6 meses' }, { value: '365', label: 'Último año' },
              ]}
              onChange={v => setPeriodDays(v)}
            />
            {activeOptFilters.has('dimension') && (
              <FilterChip
                label="Segmento" value={dimension}
                options={(Object.entries(DIMENSION_LABELS) as [SegmentDimension, string][]).map(([v, l]) => ({ value: v, label: l }))}
                onChange={v => {
                  setDimension(v as SegmentDimension);
                  setFilterValue('');
                  setActiveOptFilters(prev => {
                    const next = new Set(prev);
                    next.delete('filterValue');
                    if (v !== 'cosecha') { next.delete('cosechaGranularity'); next.delete('cosechaFrom'); next.delete('cosechaTo'); }
                    return next;
                  });
                }}
                onRemove={() => removeFilter('dimension')}
              />
            )}
            {activeOptFilters.has('filterValue') && activeOptFilters.has('dimension') && dimension !== 'cosecha' && (
              <FilterChip
                label={DIMENSION_LABELS[dimension]} value={filterValue}
                options={[{ value: '', label: `Todos` }, ...dimensionValues.map(v => ({ value: v, label: v }))]}
                onChange={v => setFilterValue(v)}
                onRemove={() => removeFilter('filterValue')}
              />
            )}
            {activeOptFilters.has('dimension') && dimension === 'cosecha' && activeOptFilters.has('cosechaGranularity') && (
              <FilterChip
                label="Agrupar cosecha" value={cosechaGranularity}
                options={(Object.entries(GRANULARITY_LABELS) as [CosechaGranularity, string][]).map(([v, l]) => ({ value: v, label: l }))}
                onChange={v => setCosechaGranularity(v as CosechaGranularity)}
                onRemove={() => removeFilter('cosechaGranularity')}
              />
            )}
            {activeOptFilters.has('cosechaFrom') && (
              <DateFilterChip label="Cosecha desde" value={cosechaFrom} onChange={setCosechaFrom} onRemove={() => removeFilter('cosechaFrom')} />
            )}
            {activeOptFilters.has('cosechaTo') && (
              <DateFilterChip label="Cosecha hasta" value={cosechaTo} onChange={setCosechaTo} onRemove={() => removeFilter('cosechaTo')} />
            )}
            {availableToAdd.length > 0 && (
              <div className="relative" ref={addFilterRef}>
                <button onClick={() => setAddFilterOpen(v => !v)}
                  className="flex items-center gap-1.5 h-8 border border-dashed rounded-full px-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Agregar filtro
                </button>
                {addFilterOpen && (
                  <div className="absolute top-10 left-0 z-50 bg-background border rounded-xl shadow-lg py-1 min-w-[200px]">
                    {availableToAdd.map(f => (
                      <button key={f.key} onClick={() => addFilter(f.key)}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-muted/60 transition-colors">{f.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {filterValue && (
              <span className="text-xs text-muted-foreground italic">
                Mostrando solo: <strong>{filterValue}</strong>
              </span>
            )}
          </div>

          {/* Sub-tabs */}
          <Tabs value={pulseSubTab} onValueChange={setPulseSubTab}>
            <TabsList className="h-9">
              <TabsTrigger value="resumen" className="text-xs">Resumen</TabsTrigger>
              <TabsTrigger value="usuarios" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1" />Usuarios
              </TabsTrigger>
              <TabsTrigger value="comparacion" className="text-xs">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1" />Comparación
              </TabsTrigger>
            </TabsList>

            {/* ── RESUMEN ──────────────────────────────────────────────────── */}
            <TabsContent value="resumen" className="mt-4 space-y-6">
              {loadingPulse ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
                  <Skeleton className="h-40" /><Skeleton className="h-80" /><Skeleton className="h-80" />
                </div>
              ) : (
                <>
                  {/* KPIs */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Pulsos enviados" value={pulses.length} description={`en los últimos ${periodDays} días`} icon={Radio} color="text-primary" />
                    <StatCard title="Respuestas totales" value={filteredAttempts.length}
                      description={`${uniqueRespondents} participantes únicos`} icon={Users} color="text-blue-500"
                      delta={delta(filteredAttempts.length, prevFilteredAttempts.length > 0 ? prevFilteredAttempts.length : null)} />
                    <StatCard title="% Aciertos promedio" value={`${overallPct}%`}
                      description={avgTotalTime > 0 ? `Tiempo prom. por pulso: ${formatSeconds(avgTotalTime)}` : 'sobre todas las respuestas'}
                      icon={Target} color={overallPct >= 70 ? 'text-green-500' : 'text-orange-500'}
                      delta={delta(overallPct, prevOverallPct)} />
                    <StatCard title="Tasa de participación" value={`${participationRate}%`}
                      description={`${uniqueRespondents} de ${totalUsers} usuarios activos`}
                      icon={TrendingUp} color={participationRate >= 70 ? 'text-green-500' : participationRate >= 40 ? 'text-orange-500' : 'text-purple-500'}
                      delta={delta(participationRate, prevParticipationRate)} />
                  </div>

                  {/* Diagnóstico */}
                  {moduleMetrics.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Diagnóstico del período</CardTitle>
                        <CardDescription>Resumen de salud por módulo · identifica áreas de acción inmediata</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-1.5">
                            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
                              <Circle className="h-3 w-3 fill-red-500 text-red-500" />Necesitan refuerzo &lt;50%
                            </p>
                            {needsHelp.length === 0 ? <p className="text-xs text-muted-foreground italic">Ninguno</p>
                              : needsHelp.map(m => (
                                <div key={m.module} className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-red-800">{m.label}</span>
                                  <span className="text-xs font-bold text-red-600">{m.correctRate}%</span>
                                </div>
                              ))}
                          </div>
                          <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 space-y-1.5">
                            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-1.5">
                              <Circle className="h-3 w-3 fill-orange-400 text-orange-400" />En desarrollo 50–70%
                            </p>
                            {inProgress.length === 0 ? <p className="text-xs text-muted-foreground italic">Ninguno</p>
                              : inProgress.map(m => (
                                <div key={m.module} className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-orange-800">{m.label}</span>
                                  <span className="text-xs font-bold text-orange-600">{m.correctRate}%</span>
                                </div>
                              ))}
                          </div>
                          <div className="rounded-xl border border-green-200 bg-green-50/50 p-3 space-y-1.5">
                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />Bien dominados &gt;70%
                            </p>
                            {mastered.length === 0 ? <p className="text-xs text-muted-foreground italic">Ninguno aún</p>
                              : mastered.map(m => (
                                <div key={m.module} className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-green-800">{m.label}</span>
                                  <span className="text-xs font-bold text-green-600">{m.correctRate}%</span>
                                </div>
                              ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1 border-t">
                          {atRiskUserIds.length > 0 && (
                            <span className="inline-flex items-center gap-1.5 text-xs bg-red-100 text-red-700 border border-red-200 rounded-full px-3 py-1">
                              <AlertTriangle className="h-3 w-3" /><strong>{atRiskUserIds.length}</strong> usuarios con menos del 50% general
                            </span>
                          )}
                          {hardestQ && (
                            <span className="inline-flex items-center gap-1.5 text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-3 py-1">
                              <Target className="h-3 w-3" />Pregunta con más errores: <strong>{hardestQ.correctRate}%</strong> aciertos
                              {questionMap[hardestQ.questionId]?.text && (
                                <span className="italic truncate max-w-[180px]">
                                  · &ldquo;{questionMap[hardestQ.questionId].text.slice(0, 60)}{questionMap[hardestQ.questionId].text.length > 60 ? '…' : ''}&rdquo;
                                </span>
                              )}
                            </span>
                          )}
                          {slowestQ && slowestQ.questionId !== hardestQ?.questionId && (
                            <span className="inline-flex items-center gap-1.5 text-xs bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
                              <Timer className="h-3 w-3" />Pregunta más lenta: <strong>{formatSeconds(slowestQ.avgTime)}</strong> promedio
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Tendencia diaria */}
                  {trendMetrics.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />Tendencia diaria</CardTitle>
                        <CardDescription>Respuestas por día · altura = participación · color = % aciertos</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto pb-1">
                          <div className="flex items-end gap-2" style={{ minWidth: `${Math.max(trendMetrics.length * 44, 300)}px`, height: '120px' }}>
                            {trendMetrics.map(({ date, count, avgPct }) => {
                              const h = Math.max(Math.round((count / maxTrendCount) * 72), 4);
                              return (
                                <div key={date} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                                  <span className="text-[10px] text-muted-foreground font-medium leading-none">{avgPct}%</span>
                                  <div className="w-full flex items-end" style={{ height: '72px' }}>
                                    <div className={cn('w-full rounded-t-sm', barColor(avgPct))} style={{ height: `${h}px` }} />
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

                  {/* Módulos en profundidad */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" />Módulos en profundidad</CardTitle>
                      <CardDescription>Distribución de usuarios y preguntas con mayor % de error · ordenados de mayor a menor tasa de error</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {moduleMetrics.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Sin datos de módulos. Asegúrate de que las preguntas tengan módulo asignado.</p>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          {moduleMetrics.map(({ module, label, totalAnswers, correctAnswers, correctRate, domina, enProceso, necesitaApoyo, hardestQuestions }) => {
                            const tot = domina + enProceso + necesitaApoyo;
                            return (
                              <div key={module} className="rounded-xl border p-4 space-y-3 bg-card hover:shadow-sm transition-shadow">
                                <div className="flex items-start justify-between gap-2">
                                  <span className={cn('text-[11px] px-2 py-1 rounded-full border font-medium leading-none', MODULE_COLORS[module] ?? 'bg-muted text-muted-foreground border-border')}>{label}</span>
                                  <span className={cn('text-xl font-bold shrink-0', pctColor(correctRate))}>{correctRate}%</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full', MODULE_BAR_COLORS[module] ?? 'bg-primary')} style={{ width: `${correctRate}%` }} />
                                </div>
                                <div className="text-xs text-muted-foreground">{correctAnswers}/{totalAnswers} respuestas correctas</div>
                                {tot > 0 && (
                                  <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Distribución de usuarios</p>
                                    <div className="flex rounded-full overflow-hidden h-2">
                                      {domina > 0 && <div className="bg-green-500" style={{ width: `${(domina / tot) * 100}%` }} />}
                                      {enProceso > 0 && <div className="bg-orange-400" style={{ width: `${(enProceso / tot) * 100}%` }} />}
                                      {necesitaApoyo > 0 && <div className="bg-red-400" style={{ width: `${(necesitaApoyo / tot) * 100}%` }} />}
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[10px]">
                                      {domina > 0 && <span className="text-green-700"><strong>{domina}</strong> dominan</span>}
                                      {enProceso > 0 && <span className="text-orange-600"><strong>{enProceso}</strong> en proceso</span>}
                                      {necesitaApoyo > 0 && <span className="text-red-600"><strong>{necesitaApoyo}</strong> necesitan apoyo</span>}
                                    </div>
                                  </div>
                                )}
                                {hardestQuestions.length > 0 && (
                                  <div className="space-y-1.5 border-t pt-2">
                                    <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Mayor % de error</p>
                                    {hardestQuestions.map(qm => (
                                      <div key={qm.questionId} className="flex items-start gap-2">
                                        <span className={cn('text-[10px] font-bold shrink-0 mt-0.5 w-7 text-right', pctColor(qm.correctRate))}>{qm.correctRate}%</span>
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[11px] leading-snug line-clamp-2">{questionMap[qm.questionId]?.text ?? qm.questionId.slice(-8)}</p>
                                          <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                            {qm.avgTime > 0 && <span>{formatSeconds(qm.avgTime)} prom.</span>}
                                            <span>{qm.timesAsked}× respondida</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Análisis de preguntas */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Timer className="h-4 w-4" />Preguntas con mayor % de error</CardTitle>
                      <CardDescription>Top 15 ordenadas por menor tasa de aciertos · incluye tiempo promedio de respuesta</CardDescription>
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
                              <div key={qm.questionId} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-start p-2 rounded-lg hover:bg-muted/40">
                                <div className="min-w-0">
                                  <div className="flex items-start gap-2">
                                    <span className="text-muted-foreground text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium leading-snug line-clamp-2">
                                        {q?.text ?? <span className="font-mono text-xs text-muted-foreground">{qm.questionId.slice(-8)}</span>}
                                      </p>
                                      {q?.module && (
                                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium mt-1 inline-block', MODULE_COLORS[q.module] ?? 'bg-muted text-muted-foreground border-border')}>
                                          {KNOWLEDGE_MODULE_LABELS[q.module as KnowledgeModule] ?? q.module}
                                        </span>
                                      )}
                                      <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                                        <div className={cn('h-full rounded-full', barColor(qm.correctRate))} style={{ width: `${qm.correctRate}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <span className={cn('text-sm font-bold w-16 text-right shrink-0', pctColor(qm.correctRate))}>{qm.correctRate}%</span>
                                <span className="text-xs text-muted-foreground w-16 text-right shrink-0 font-medium">{formatSeconds(qm.avgTime)}</span>
                                <span className="text-xs text-muted-foreground w-12 text-right shrink-0">{qm.timesAsked}×</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Segmento */}
                  {activeOptFilters.has('dimension') && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />% Aciertos por {DIMENSION_LABELS[dimension]}
                        </CardTitle>
                        <CardDescription>
                          {filterValue ? `Filtrado a: ${filterValue}` : `Comparación de rendimiento entre ${DIMENSION_LABELS[dimension].toLowerCase()}s`}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {segmentMetrics.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            Sin datos de segmentación. Verifica que los usuarios tengan el campo <code className="text-xs bg-muted px-1 rounded">{dimension}</code> en su perfil.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {segmentMetrics.map(({ key, totalAttempts, avgPct }) => (
                              <div key={key} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="font-medium">{key}</span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground">{totalAttempts} resp.</span>
                                    <span className={cn('font-semibold text-sm', pctColor(avgPct))}>{avgPct}%</span>
                                  </div>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full', barColor(avgPct))} style={{ width: `${(avgPct / Math.max(maxSegPct, 1)) * 100}%` }} />
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

            {/* ── USUARIOS ─────────────────────────────────────────────────── */}
            <TabsContent value="usuarios" className="mt-4 space-y-4">
              {loadingPulse ? (
                <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
              ) : allUsers.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No hay usuarios activos en el sistema.</CardContent></Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Desempeño por usuario</CardTitle>
                    <CardDescription>
                      <span className={respondedCount === 0 ? 'text-red-500 font-medium' : ''}>
                        {respondedCount} de {allUsers.length} usuarios han respondido en el período
                      </span>
                      {respondedCount > 0 && ' · click para ver detalle por módulo'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Participation summary bar */}
                    <div className="space-y-1">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={barColor(allUsers.length > 0 ? Math.round((respondedCount / allUsers.length) * 100) : 0)}
                          style={{ width: `${allUsers.length > 0 ? (respondedCount / allUsers.length) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Participación: {allUsers.length > 0 ? Math.round((respondedCount / allUsers.length) * 100) : 0}% ·
                        {' '}{allUsers.length - respondedCount} sin respuesta en este período
                      </p>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Buscar por nombre, email, hub…"
                          value={userSearch}
                          onChange={e => setUserSearch(e.target.value)}
                          className="h-8 w-full pl-8 pr-3 rounded-full border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <FilterChip
                        label="Ordenar" value={userSort} removable={false}
                        options={[
                          { value: 'avgPct', label: '% Aciertos (peor primero)' },
                          { value: 'nombre', label: 'Nombre A–Z' },
                          { value: 'lastActivity', label: 'Actividad reciente' },
                        ]}
                        onChange={v => setUserSort(v as UserSortKey)}
                      />
                      <button
                        onClick={() => exportUsersCSV(filteredSortedUsers)}
                        className="flex items-center gap-1.5 h-8 border rounded-full px-3 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                        title="Exportar a CSV"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Exportar CSV</span>
                      </button>
                    </div>

                    {/* Table header */}
                    <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 text-[10px] text-muted-foreground uppercase font-medium px-3 py-1.5 border rounded-lg bg-muted/30">
                      <span />
                      <span>Nombre</span>
                      <span className="text-center w-14">Aciertos</span>
                      <span className="text-center w-20">Respuestas</span>
                      <span className="text-center w-20 hidden sm:block">Última act.</span>
                      <span className="text-right w-28 hidden md:block">Módulo más débil</span>
                    </div>

                    {/* Rows */}
                    <div className="space-y-1">
                      {filteredSortedUsers.map(u => {
                        const expanded = expandedUsers.has(u.uid);
                        const isAtRisk = u.hasResponded && atRiskUserIds.includes(u.uid);
                        return (
                          <div key={u.uid} className={cn(
                            'border rounded-xl overflow-hidden',
                            !u.hasResponded && 'opacity-60',
                            isAtRisk && 'border-red-300 bg-red-50/30',
                          )}>
                            {/* Main row */}
                            <button
                              onClick={() => toggleUserExpand(u.uid)}
                              className="w-full grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                            >
                              <span className="text-muted-foreground">
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium truncate">{u.nombre}</p>
                                  {isAtRisk && (
                                    <span title="Usuario en riesgo: menos del 50% de aciertos">
                                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {[u.hub !== '-' && u.hub, u.vertical !== '-' && u.vertical].filter(Boolean).join(' · ') || u.email}
                                </p>
                              </div>
                              {u.hasResponded ? (
                                <span className={cn('text-sm font-bold w-14 text-center', pctColor(u.avgPct))}>{u.avgPct}%</span>
                              ) : (
                                <span className="text-xs text-muted-foreground w-14 text-center italic">—</span>
                              )}
                              <span className="text-xs text-muted-foreground w-20 text-center">
                                {u.hasResponded ? `${u.totalAttempts} pulso${u.totalAttempts !== 1 ? 's' : ''}` : 'Sin respuesta'}
                              </span>
                              <span className="text-xs text-muted-foreground w-20 text-center hidden sm:block">
                                {u.lastActivity ? shortDate(u.lastActivity) : '—'}
                              </span>
                              <span className="text-[11px] text-muted-foreground w-28 text-right hidden md:block truncate">
                                {u.hasResponded ? u.worstModuleLabel : '—'}
                              </span>
                            </button>

                            {/* Expanded detail */}
                            {expanded && (
                              <div className="border-t bg-muted/20 px-4 py-3 space-y-3">
                                {!u.hasResponded ? (
                                  <p className="text-sm text-muted-foreground italic">
                                    Este usuario no ha completado ningún pulso en el período seleccionado.
                                    Prueba ampliar el período de tiempo en los filtros.
                                  </p>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                      <span><strong className="text-foreground">{u.totalCorrect}</strong>/{u.totalQuestions} correctas en total</span>
                                      <span>· <strong className="text-foreground">{u.totalAttempts}</strong> pulsos completados</span>
                                      {u.estado !== '-' && <span>· Estado: <strong className="text-foreground">{u.estado}</strong></span>}
                                      <span>· <span className="font-mono text-[10px]">{u.email}</span></span>
                                    </div>
                                    {u.moduleRates.length > 0 ? (
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {u.moduleRates.map(mr => (
                                          <div key={mr.module} className="space-y-0.5">
                                            <div className="flex items-center justify-between text-xs">
                                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', MODULE_COLORS[mr.module] ?? 'bg-muted text-muted-foreground border-border')}>{mr.label}</span>
                                              <span className={cn('font-bold text-xs', pctColor(mr.rate))}>
                                                {mr.rate}% <span className="font-normal text-muted-foreground">({mr.correct}/{mr.total})</span>
                                              </span>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                              <div className={cn('h-full rounded-full', barColor(mr.rate))} style={{ width: `${mr.rate}%` }} />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground italic">
                                        Sin desglose por módulo — las preguntas respondidas no tienen módulo asignado.
                                      </p>
                                    )}
                                    {/* Timeline */}
                                    {(() => {
                                      const timeline = buildUserTimeline(filteredAttempts, u.uid);
                                      if (timeline.length < 2) return null;
                                      return (
                                        <div className="pt-2 border-t space-y-1.5">
                                          <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Evolución por pulso</p>
                                          <div className="flex items-end gap-1.5 h-14 overflow-x-auto pb-1">
                                            {timeline.map((pt, i) => (
                                              <div key={i} className="flex flex-col items-center gap-0.5 shrink-0" style={{ minWidth: '32px' }}>
                                                <span className={cn('text-[9px] font-bold leading-none', pctColor(pt.pct))}>{pt.pct}%</span>
                                                <div className="w-6 flex items-end" style={{ height: '32px' }}>
                                                  <div className={cn('w-full rounded-t-sm', barColor(pt.pct))} style={{ height: `${Math.max(Math.round((pt.pct / 100) * 32), 2)}px` }} />
                                                </div>
                                                <span className="text-[9px] text-muted-foreground leading-none whitespace-nowrap">{shortDate(pt.date)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {filteredSortedUsers.length === 0 && userSearch && (
                      <p className="text-sm text-muted-foreground text-center py-6 italic">
                        Ningún usuario coincide con &ldquo;{userSearch}&rdquo;
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ── COMPARACIÓN ──────────────────────────────────────────────── */}
            <TabsContent value="comparacion" className="mt-4 space-y-6">
              {loadingPulse ? (
                <div className="space-y-4"><Skeleton className="h-60" /><Skeleton className="h-60" /></div>
              ) : (
                <>
                  {/* Hub × Módulo cross-tab */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <ArrowUpDown className="h-4 w-4" />Matriz {DIMENSION_LABELS[compDim]} × Módulo
                          </CardTitle>
                          <CardDescription>% de aciertos por combinación de {DIMENSION_LABELS[compDim].toLowerCase()} y módulo</CardDescription>
                        </div>
                        <FilterChip
                          label="Comparar por" value={compDim} removable={false}
                          options={(Object.entries(DIMENSION_LABELS) as [SegmentDimension, string][]).filter(([k]) => k !== 'cosecha').map(([v, l]) => ({ value: v, label: l }))}
                          onChange={v => setCompDim(v as SegmentDimension)}
                        />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {crossTabData.rowKeys.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          Sin datos. Verifica que los usuarios tengan el campo <code className="text-xs bg-muted px-1 rounded">{compDim}</code> en su perfil y que las preguntas tengan módulo asignado.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4 min-w-[120px]">
                                  {DIMENSION_LABELS[compDim]}
                                </th>
                                {crossTabData.colKeys.map(col => (
                                  <th key={col} className="text-center text-[10px] font-medium text-muted-foreground pb-2 px-1 min-w-[80px]">
                                    {crossTabData.colLabels[col]}
                                  </th>
                                ))}
                                <th className="text-center text-[10px] font-medium text-muted-foreground pb-2 px-2 min-w-[60px]">Total</th>
                              </tr>
                            </thead>
                            <tbody className="space-y-1">
                              {crossTabData.rowKeys.map(rk => (
                                <tr key={rk} className="border-t">
                                  <td className="py-2 pr-4 font-medium text-sm">{rk}</td>
                                  {crossTabData.colKeys.map(col => {
                                    const cell = crossTabData.cells[rk][col];
                                    return (
                                      <td key={col} className="px-1 py-1.5 text-center">
                                        {cell ? (
                                          <span className={cn('inline-block rounded-lg px-2 py-1 text-xs font-bold min-w-[48px]', cellBg(cell.rate))}>
                                            {cell.rate}%
                                          </span>
                                        ) : (
                                          <span className="inline-block rounded-lg px-2 py-1 text-xs text-muted-foreground bg-muted/30 min-w-[48px]">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="px-2 py-1.5 text-center">
                                    <span className={cn('inline-block rounded-lg px-2 py-1 text-xs font-bold min-w-[48px]', cellBg(crossTabData.rowTotals[rk].rate))}>
                                      {crossTabData.rowTotals[rk].rate}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t bg-muted/20">
                                <td className="py-2 pr-4 text-xs font-medium text-muted-foreground">Promedio</td>
                                {crossTabData.colKeys.map(col => {
                                  const vals = crossTabData.rowKeys.map(rk => crossTabData.cells[rk][col]?.rate).filter((v): v is number => v !== undefined && v !== null);
                                  const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
                                  return (
                                    <td key={col} className="px-1 py-1.5 text-center">
                                      {avg !== null ? (
                                        <span className={cn('inline-block rounded-lg px-2 py-1 text-xs font-bold min-w-[48px]', cellBg(avg))}>{avg}%</span>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Product comparison */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" />Desempeño por producto</CardTitle>
                      <CardDescription>% de aciertos en preguntas de cada producto · incluye desglose por módulo</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {productMetrics.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          Sin datos por producto. Verifica que las preguntas del pulso tengan <code className="text-xs bg-muted px-1 rounded">productId</code> asignado.
                        </p>
                      ) : (
                        <div className="space-y-6">
                          {productMetrics.map(pm => (
                            <div key={pm.productId} className="space-y-3">
                              {/* Product header */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: pm.productColor }} />
                                  <span className="font-semibold text-sm">{pm.productName}</span>
                                  <span className="text-xs text-muted-foreground">· {pm.totalAnswers} respuestas</span>
                                </div>
                                <span className={cn('text-xl font-bold', pctColor(pm.correctRate))}>{pm.correctRate}%</span>
                              </div>
                              {/* Product progress bar */}
                              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full', barColor(pm.correctRate))} style={{ width: `${pm.correctRate}%` }} />
                              </div>
                              {/* Module breakdown for this product */}
                              {pm.moduleRates.length > 0 && (
                                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 pl-4">
                                  {pm.moduleRates.map(mr => (
                                    <div key={mr.module} className="space-y-0.5">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', MODULE_COLORS[mr.module] ?? 'bg-muted text-muted-foreground border-border')}>{mr.label}</span>
                                        <span className={cn('font-bold', pctColor(mr.rate))}>{mr.rate}%</span>
                                      </div>
                                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div className={cn('h-full rounded-full', MODULE_BAR_COLORS[mr.module] ?? 'bg-primary')} style={{ width: `${mr.rate}%` }} />
                                      </div>
                                      <p className="text-[10px] text-muted-foreground">{mr.total} respuestas</p>
                                    </div>
                                  ))}
                                </div>
                              )}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
