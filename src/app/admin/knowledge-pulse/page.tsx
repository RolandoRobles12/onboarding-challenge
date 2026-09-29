'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useQuestions } from '@/hooks/use-firestore';
import {
  getDailyPulse,
  getDailyPulses,
  upsertDailyPulse,
  updatePulseStatus,
  scheduleAutoPulse,
  getSlackConfig,
  saveSlackConfig,
  getPulseConfig,
  savePulseConfig,
  getPulseAttemptsByDate,
  getPulseCategories,
  getPulseCronStatus,
  getAllUsers,
} from '@/lib/firestore-service';
import type {
  DailyPulse,
  PulseAttempt,
  PulseConfig,
  PulseCategory,
  PulseCronStatus,
  KnowledgeModule,
  Question,
  SlackNotificationConfig,
  UserProfile,
} from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS, KNOWLEDGE_MODULES, SEGMENTATION_FIELD_KEYS } from '@/lib/types-scalable';
import {
  addDaysStr,
  applySlackTemplate,
  formatHHMM,
  formatPulseDate,
  getPulsePhase,
  isPulseWindowOpen,
  lastUsedByQuestion,
  pulseDateStr,
  DEFAULT_SLACK_TEMPLATE,
  PULSE_PASS_PERCENTAGE,
  PULSE_TIMEZONE,
  type PulsePhase,
} from '@/lib/pulse-utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  Radio, Settings, Zap, ChevronLeft, ChevronRight, Send, RefreshCw, Users, CheckCircle, Clock,
  BarChart2, ListChecks, Edit3, AlertTriangle, Globe, Download, Search, Lock, Unlock, Activity,
  ExternalLink, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────

function getWeekDays(anchor: string): string[] {
  const [y, m, d] = anchor.split('-').map(Number);
  const day = new Date(y, m - 1, d, 12).getDay(); // 0=Sun
  const monday = addDaysStr(anchor, -((day === 0 ? 7 : day) - 1));
  return Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i));
}

const shortDate = (date: string) => formatPulseDate(date, { weekday: 'short', day: 'numeric', month: 'short' });

function timeAgo(date: Date, now: Date): string {
  const mins = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

function timeOf(ts: { toDate?: () => Date } | undefined): string {
  const d = ts?.toDate?.();
  return d ? d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: PULSE_TIMEZONE }) : '';
}

const PHASE_META: Record<Exclude<PulsePhase, 'sin_pulso'>, { label: string; dot: string; badge: string; hero: string; icon: typeof Clock }> = {
  programado: {
    label: 'Programado',
    dot: 'bg-yellow-400',
    badge: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    hero: 'from-yellow-50 to-amber-50/30 border-yellow-200',
    icon: Clock,
  },
  disponible: {
    label: 'Disponible ahora',
    dot: 'bg-green-500',
    badge: 'bg-green-50 text-green-700 border border-green-200',
    hero: 'from-green-50 to-emerald-50/30 border-green-200',
    icon: Radio,
  },
  cerrado: {
    label: 'Cerrado',
    dot: 'bg-gray-400',
    badge: 'bg-gray-50 text-gray-600 border border-gray-200',
    hero: 'from-gray-50 to-slate-50/30 border-gray-200',
    icon: CheckCircle,
  },
};

const MODULE_COLORS: Record<KnowledgeModule, string> = {
  banca_conversacional: 'bg-blue-500/10 text-blue-700',
  pagos_renovacion: 'bg-green-500/10 text-green-700',
  solicitud_credito: 'bg-purple-500/10 text-purple-700',
  herramientas: 'bg-orange-500/10 text-orange-700',
  politicas_procesos: 'bg-red-500/10 text-red-700',
  incentivos: 'bg-yellow-500/10 text-yellow-700',
};

type ParticipantStatus = 'completado' | 'en_progreso' | 'vencido' | 'pendiente';

interface ParticipantRow {
  key: string;
  name: string;
  email?: string;
  hub?: string;
  vertical?: string;
  status: ParticipantStatus;
  attempt?: PulseAttempt;
}

const PARTICIPANT_STATUS_META: Record<ParticipantStatus, { label: string; className: string }> = {
  completado: { label: 'Completado', className: 'bg-green-500/10 text-green-700' },
  en_progreso: { label: 'En progreso', className: 'bg-blue-500/10 text-blue-700' },
  vencido: { label: 'Sin terminar', className: 'bg-orange-500/10 text-orange-700' },
  pendiente: { label: 'Pendiente', className: 'bg-muted text-muted-foreground' },
};

function userHub(u: UserProfile) {
  return u.onboardingData?.[SEGMENTATION_FIELD_KEYS.hub] || u.assignedKiosko || undefined;
}

function csvEscape(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const content = '﻿' + rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type PulseConfigForm = Omit<PulseConfig, 'id' | 'organizationId' | 'updatedAt' | 'updatedBy'>;
type SlackForm = Pick<SlackNotificationConfig, 'active' | 'sendAt' | 'appUrl' | 'messageTemplate'> & { dmSellers: boolean };

const DEFAULT_CONFIG_FORM: PulseConfigForm = {
  questionsPerPulse: 7,
  activeModules: [],
  closeAt: '12:00',
  sameQuestionsForAll: true,
  randomizeAnswerOrder: false,
  autoDailyPulse: false,
};

/** Si el proceso programado no corre en este tiempo, se muestra una alerta. */
const CRON_STALE_MINUTES = 45;

// ── Component ──────────────────────────────────────────────────────────────

export default function KnowledgePulsePage() {
  const { profile } = useAuth();
  const { questions, loading: loadingQ } = useQuestions();

  const [mainTab, setMainTab] = useState('pulsos');
  const [now, setNow] = useState(() => new Date());
  const today = pulseDateStr(now);

  const [categories, setCategories] = useState<PulseCategory[]>([]);
  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.key, c])) as Record<string, PulseCategory>,
    [categories],
  );
  const moduleLabel = useCallback((mod: KnowledgeModule) => categoryMap[mod]?.name ?? KNOWLEDGE_MODULE_LABELS[mod] ?? mod, [categoryMap]);
  const moduleColor = useCallback((mod: KnowledgeModule) => categoryMap[mod]?.color ?? MODULE_COLORS[mod] ?? 'bg-muted text-muted-foreground', [categoryMap]);
  const moduleKeys = useMemo<KnowledgeModule[]>(() => {
    const active = categories.filter(c => c.active).map(c => c.key as KnowledgeModule);
    return active.length > 0 ? active : KNOWLEDGE_MODULES;
  }, [categories]);

  // Configuración (se carga una vez; cambiar de pestaña no descarta lo editado)
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savedConfig, setSavedConfig] = useState<PulseConfigForm>(DEFAULT_CONFIG_FORM);
  const [configForm, setConfigForm] = useState<PulseConfigForm>(DEFAULT_CONFIG_FORM);
  const [savingConfig, setSavingConfig] = useState(false);

  const [slackConfig, setSlackConfig] = useState<SlackNotificationConfig | null>(null);
  const [savedSlack, setSavedSlack] = useState<SlackForm | null>(null);
  const [slackForm, setSlackForm] = useState<SlackForm>({ active: false, sendAt: '08:00', appUrl: '', messageTemplate: DEFAULT_SLACK_TEMPLATE, dmSellers: true });
  const [savingSlack, setSavingSlack] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [cronStatus, setCronStatus] = useState<PulseCronStatus | null>(null);
  const [sellers, setSellers] = useState<UserProfile[]>([]);

  // Pulsos
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [pulses, setPulses] = useState<DailyPulse[]>([]);
  const [loadingPulses, setLoadingPulses] = useState(true);
  const [selectedPulse, setSelectedPulse] = useState<DailyPulse | null | undefined>(undefined); // undefined = cargando
  const [pulseAttempts, setPulseAttempts] = useState<PulseAttempt[]>([]);
  const [detailTab, setDetailTab] = useState('participacion');
  const [scheduling, setScheduling] = useState(false);
  const [actioning, setActioning] = useState(false);

  // Diálogo de preguntas
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPulse, setEditingPulse] = useState<{ date: string; questionIds: string[] } | null>(null);

  const configDirty = JSON.stringify(configForm) !== JSON.stringify(savedConfig);
  const slackDirty = !!savedSlack && JSON.stringify(slackForm) !== JSON.stringify(savedSlack);

  // ── Carga inicial ──────────────────────────────────────────────────────

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    getPulseCategories().then(setCategories).catch(() => {});
    getPulseCronStatus().then(setCronStatus).catch(() => {});
    getAllUsers()
      .then(users => setSellers(users.filter(u => u.rol === 'seller' && u.active !== false)))
      .catch(() => {});
    getPulseConfig().then(cfg => {
      const form: PulseConfigForm = {
        questionsPerPulse: cfg.questionsPerPulse,
        activeModules: cfg.activeModules ?? [],
        closeAt: cfg.closeAt,
        sameQuestionsForAll: cfg.sameQuestionsForAll,
        randomizeAnswerOrder: cfg.randomizeAnswerOrder,
        autoDailyPulse: cfg.autoDailyPulse ?? false,
      };
      setSavedConfig(form);
      setConfigForm(form);
    }).finally(() => setLoadingConfig(false));
    getSlackConfig().then(cfg => {
      const detectedUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const form: SlackForm = {
        active: cfg?.active ?? false,
        sendAt: cfg?.sendAt ?? '08:00',
        appUrl: cfg?.appUrl || detectedUrl,
        messageTemplate: cfg?.messageTemplate || DEFAULT_SLACK_TEMPLATE,
        dmSellers: cfg?.dmSellers !== false,
      };
      setSlackConfig(cfg);
      setSavedSlack(form);
      setSlackForm(form);
    });
  }, []);

  // Aviso al salir de la página con cambios sin guardar
  useEffect(() => {
    if (!configDirty && !slackDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [configDirty, slackDirty]);

  const loadPulses = useCallback(async () => {
    setLoadingPulses(true);
    try {
      const days = getWeekDays(weekAnchor);
      setPulses(await getDailyPulses(days[0], days[6]));
    } finally {
      setLoadingPulses(false);
    }
  }, [weekAnchor]);

  useEffect(() => { loadPulses(); }, [loadPulses]);

  const loadSelectedDay = useCallback(async (date: string) => {
    setSelectedPulse(undefined);
    const [pulse, attempts] = await Promise.all([getDailyPulse(date), getPulseAttemptsByDate(date)]);
    setSelectedPulse(pulse);
    setPulseAttempts(attempts);
  }, []);

  useEffect(() => { loadSelectedDay(selectedDate); }, [selectedDate, loadSelectedDay]);

  const refreshDay = (date: string) => Promise.all([loadPulses(), loadSelectedDay(date)]);

  // ── Acciones del pulso ─────────────────────────────────────────────────

  const handleAutoSchedule = async (date: string) => {
    setScheduling(true);
    try {
      const qIds = await scheduleAutoPulse(undefined, date);
      if (qIds.length === 0) {
        toast({ variant: 'destructive', title: 'Sin preguntas', description: 'No hay preguntas activas con módulo en los módulos seleccionados.' });
        return;
      }
      await upsertDailyPulse(date, qIds, profile?.uid || 'admin');
      toast({ title: 'Pulso creado', description: `${Math.min(savedConfig.questionsPerPulse, qIds.length)} preguntas por vendedor · pool de ${qIds.length} para ${shortDate(date)}` });
      await refreshDay(date);
    } finally {
      setScheduling(false);
    }
  };

  const handleSendSlack = async (date: string, resend: boolean) => {
    if (resend && !window.confirm('El aviso de hoy ya se envió. ¿Enviarlo otra vez a todo el equipo?')) return;
    setActioning(true);
    try {
      const res = await fetch('/api/pulse/send-slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok && res.status !== 207) {
        toast({ variant: 'destructive', title: 'No se envió el aviso', description: data.error ?? data.message ?? `HTTP ${res.status}` });
      } else {
        toast({ title: res.status === 207 ? '⚠️ Aviso enviado con errores' : 'Aviso enviado', description: data.message });
      }
      await refreshDay(date);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al enviar', description: err instanceof Error ? err.message : String(err) });
    } finally {
      setActioning(false);
    }
  };

  const handleSetClosed = async (date: string, closed: boolean) => {
    setActioning(true);
    try {
      await updatePulseStatus(date, closed ? 'closed' : (selectedPulse?.sentAt ? 'active' : 'scheduled'));
      toast({ title: closed ? 'Pulso cerrado' : 'Pulso reabierto' });
      await refreshDay(date);
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo actualizar el pulso' });
    } finally {
      setActioning(false);
    }
  };

  const handleSaveEditedPulse = async () => {
    if (!editingPulse) return;
    try {
      await upsertDailyPulse(editingPulse.date, editingPulse.questionIds, profile?.uid || 'admin');
      toast({ title: 'Pulso actualizado' });
      setEditDialogOpen(false);
      await refreshDay(editingPulse.date);
    } catch {
      toast({ variant: 'destructive', title: 'Error al actualizar' });
    }
  };

  // ── Guardar configuración ──────────────────────────────────────────────

  const handleSaveConfig = async () => {
    if (!profile) return;
    setSavingConfig(true);
    try {
      await savePulseConfig(configForm, profile.uid);
      setSavedConfig(configForm);
      toast({ title: 'Ajustes del pulso guardados' });
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveSlack = async () => {
    if (!profile) return;
    setSavingSlack(true);
    try {
      await saveSlackConfig(slackForm, profile.uid);
      setSavedSlack(slackForm);
      setSlackConfig(prev => prev ? { ...prev, ...slackForm } : prev);
      toast({ title: 'Configuración de Slack guardada' });
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSavingSlack(false);
    }
  };

  const handleSendTestSlack = async () => {
    setSendingTest(true);
    try {
      const res = await fetch('/api/pulse/send-slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, test: true, testSlackId: profile?.slackId }),
      });
      const data = await res.json() as { message?: string; error?: string; results?: { target: string; ok: boolean; error?: string }[] };
      const failed = (data.results ?? []).filter(r => !r.ok);
      if (!res.ok && !data.results) {
        toast({ variant: 'destructive', title: 'Error al enviar', description: data.error ?? `HTTP ${res.status}` });
      } else if (failed.length > 0) {
        toast({ variant: 'destructive', title: 'La prueba falló', description: failed.map(r => `${r.target}: ${r.error ?? 'error'}`).join(' · ') });
      } else {
        toast({ title: '✅ Prueba enviada', description: 'Revisa tus mensajes directos de Slack. Se usó la configuración guardada.' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al enviar', description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSendingTest(false);
    }
  };

  // ── Derivados ──────────────────────────────────────────────────────────

  const closeAt = savedConfig.closeAt;
  const perPulse = savedConfig.questionsPerPulse;
  const weekDays = getWeekDays(weekAnchor);
  const getPulseForDate = (d: string) => pulses.find(p => p.date === d) ?? null;
  const isToday = selectedDate === today;
  const selectedPhase = getPulsePhase(selectedPulse, closeAt, now);
  const pulsePool = selectedPulse?.questionIds ?? [];

  const pulseQuestions = useMemo(() => {
    const byId = new Map(questions.map(q => [q.id, q]));
    return pulsePool.map(id => byId.get(id)).filter((q): q is Question => !!q);
  }, [questions, pulsePool]);

  // Participación: vendedores activos que ya existían ese día + quien haya respondido.
  const participants = useMemo<ParticipantRow[]>(() => {
    const endOfDay = selectedDate;
    const byUser = new Map(pulseAttempts.map(a => [a.userId, a]));
    const rows: ParticipantRow[] = [];
    const seen = new Set<string>();
    for (const u of sellers) {
      const created = u.createdAt?.toDate ? pulseDateStr(u.createdAt.toDate()) : '';
      const attempt = byUser.get(u.uid);
      if (!attempt && created && created > endOfDay) continue;
      seen.add(u.uid);
      rows.push({
        key: u.uid,
        name: u.nombre || u.email,
        email: u.email,
        hub: attempt?.hub ?? userHub(u),
        vertical: attempt?.vertical ?? u.onboardingData?.[SEGMENTATION_FIELD_KEYS.vertical],
        status: !attempt ? 'pendiente'
          : attempt.status === 'completed' ? 'completado'
          : attempt.status === 'expired' || attempt.date < today ? 'vencido'
          : 'en_progreso',
        attempt,
      });
    }
    for (const a of pulseAttempts) {
      if (seen.has(a.userId)) continue;
      rows.push({
        key: a.userId, name: a.userName, hub: a.hub, vertical: a.vertical,
        status: a.status === 'completed' ? 'completado' : a.status === 'expired' || a.date < today ? 'vencido' : 'en_progreso',
        attempt: a,
      });
    }
    return rows;
  }, [sellers, pulseAttempts, selectedDate, today]);

  const completedAttempts = pulseAttempts.filter(a => a.status === 'completed');
  const avgCorrect = completedAttempts.length > 0
    ? Math.round(completedAttempts.reduce((s, a) => s + a.percentage, 0) / completedAttempts.length)
    : null;
  const participationPct = participants.length > 0
    ? Math.round((completedAttempts.length / participants.length) * 100)
    : null;

  const exportCsv = () => {
    const header = ['Nombre', 'Email', 'Hub', 'Vertical', 'Estado', 'Correctas', 'Total', '% aciertos', 'Tiempo (s)', 'Terminó'];
    const rows = participants.map(p => [
      p.name, p.email, p.hub, p.vertical, PARTICIPANT_STATUS_META[p.status].label,
      p.attempt?.status === 'completed' ? p.attempt.correctAnswers : p.attempt?.answers?.filter(a => a.isCorrect).length,
      p.attempt?.totalQuestions,
      p.attempt?.status === 'completed' ? p.attempt.percentage : undefined,
      p.attempt ? (p.attempt.answers ?? []).reduce((s, a) => s + (a.timeSpent || 0), 0) : undefined,
      timeOf(p.attempt?.completedAt),
    ]);
    downloadCsv(`pulso-${selectedDate}.csv`, [header, ...rows]);
  };

  // Salud de la automatización
  const cronLastRun = cronStatus?.lastRunAt?.toDate?.();
  const cronMinutesAgo = cronLastRun ? (now.getTime() - cronLastRun.getTime()) / 60_000 : null;
  const cronHealthy = cronMinutesAgo !== null && cronMinutesAgo <= CRON_STALE_MINUTES;
  const modulePoolSize = useMemo(() => {
    const active = new Set(savedConfig.activeModules ?? []);
    return questions.filter(q => q.module && (active.size === 0 || active.has(q.module))).length;
  }, [questions, savedConfig.activeModules]);
  const sellersWithSlack = sellers.filter(u => u.slackId?.trim()).length;
  const activeChannels = (slackConfig?.channels ?? []).filter(c => c.active).length;
  const directRecipients = slackConfig?.directRecipients?.length ?? 0;

  const warnings: { text: string; action?: { label: string; onClick?: () => void; href?: string } }[] = [];
  if (!cronHealthy) {
    warnings.push({
      text: cronLastRun
        ? `El proceso programado no corre desde ${timeAgo(cronLastRun, now)}. Sin él, el aviso de Slack no sale solo ni se crea el pulso automático al inicio del día.`
        : 'El proceso programado nunca se ha ejecutado. Sin él, el aviso de Slack no sale solo ni se crea el pulso automático al inicio del día.',
      action: { label: 'Cómo configurarlo', onClick: () => setMainTab('ajustes') },
    });
  }
  if (cronStatus?.lastError) warnings.push({ text: `La última ejecución del proceso programado falló: ${cronStatus.lastError}` });
  if (!loadingQ && !loadingConfig && modulePoolSize === 0) {
    warnings.push({ text: 'No hay preguntas activas en los módulos seleccionados: no se puede crear el pulso.', action: { label: 'Banco de preguntas', href: '/admin/questions' } });
  } else if (!loadingQ && !loadingConfig && modulePoolSize < perPulse) {
    warnings.push({ text: `Solo hay ${modulePoolSize} preguntas activas en los módulos seleccionados; el pulso pide ${perPulse}.` });
  }
  if (slackConfig?.active && activeChannels === 0 && directRecipients === 0 && (!slackForm.dmSellers || sellersWithSlack === 0)) {
    warnings.push({ text: 'Slack está activo pero no hay canales, destinatarios ni vendedores con Slack ID.', action: { label: 'Configurar Slack', href: '/admin/slack' } });
  }
  const todayPulse = getPulseForDate(today);
  if (todayPulse?.slackResult && (todayPulse.slackResult.failed > 0 || todayPulse.slackResult.error)) {
    warnings.push({ text: `El aviso de hoy tuvo errores: ${todayPulse.slackResult.error ?? `${todayPulse.slackResult.failed} envíos fallidos`}` });
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Radio className="h-7 w-7 text-primary" /> Pulso de Conocimiento
        </h1>
        <p className="text-muted-foreground mt-1">
          Cuestionario diario de {perPulse} preguntas para el equipo comercial · cierra a las {formatHHMM(closeAt)}
        </p>
      </div>

      {/* Salud de la automatización */}
      <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Activity className={cn('h-4 w-4', cronHealthy ? 'text-green-600' : 'text-amber-500')} />
          <span className="font-medium">Automatización:</span>
          <span className="text-muted-foreground">
            {cronLastRun ? `última ejecución ${timeAgo(cronLastRun, now)}` : 'sin ejecuciones registradas'}
          </span>
        </div>
        {warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="flex-1">{w.text}</span>
            {w.action && (w.action.href ? (
              <Link href={w.action.href} className="font-semibold underline shrink-0">{w.action.label}</Link>
            ) : (
              <button onClick={w.action.onClick} className="font-semibold underline shrink-0">{w.action.label}</button>
            ))}
          </div>
        ))}
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="pulsos">
            <BarChart2 className="h-4 w-4 mr-1.5" /> Pulsos
          </TabsTrigger>
          <TabsTrigger value="ajustes">
            <Settings className="h-4 w-4 mr-1.5" /> Ajustes {configDirty && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </TabsTrigger>
          <TabsTrigger value="slack">
            <Send className="h-4 w-4 mr-1.5" /> Slack {slackDirty && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </TabsTrigger>
        </TabsList>

        {/* ─────────────────── PULSOS ─────────────────────────────────── */}
        <TabsContent value="pulsos" className="space-y-5 mt-5">
          {selectedPulse === undefined ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : selectedPulse === null ? (
            <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 p-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {isToday ? 'Hoy' : shortDate(selectedDate)} · Sin pulso programado
                  </p>
                  <h2 className="text-2xl font-bold first-letter:uppercase">{formatPulseDate(selectedDate)}</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {selectedDate < today ? 'Este día no tuvo pulso.' : 'El equipo no tiene preguntas programadas para este día.'}
                  </p>
                </div>
                {selectedDate >= today && (
                  <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                    <Button size="lg" className="font-semibold" onClick={() => handleAutoSchedule(selectedDate)} disabled={scheduling}>
                      {scheduling
                        ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Creando...</>
                        : <><Zap className="h-4 w-4 mr-2" /> Crear automáticamente</>}
                    </Button>
                    <Button size="lg" variant="outline" onClick={() => {
                      setEditingPulse({ date: selectedDate, questionIds: [] });
                      setEditDialogOpen(true);
                    }}>
                      <Edit3 className="h-4 w-4 mr-2" /> Elegir preguntas
                    </Button>
                  </div>
                )}
              </div>
              {selectedDate >= today && (
                <p className="text-xs text-muted-foreground mt-4">
                  La creación automática reparte las preguntas entre módulos, prioriza las de menor tasa de aciertos y
                  evita las usadas en los últimos días. Cada vendedor recibe {perPulse}.
                </p>
              )}
            </div>
          ) : (() => {
            const meta = PHASE_META[selectedPhase === 'sin_pulso' ? 'programado' : selectedPhase];
            const StatusIcon = meta.icon;
            const slackResult = selectedPulse.slackResult;
            const manuallyClosed = selectedPulse.status === 'closed';
            return (
              <div className={cn('rounded-2xl border bg-gradient-to-br p-6 space-y-4', meta.hero)}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {isToday ? 'Hoy' : shortDate(selectedDate)}
                    </p>
                    <h2 className="text-2xl font-bold first-letter:uppercase">{formatPulseDate(selectedDate)}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedPulse.sentAt
                        ? `Aviso de Slack enviado a las ${timeOf(slackResult?.at ?? selectedPulse.sentAt)}${slackResult ? ` · ${slackResult.ok} entregados${slackResult.failed ? `, ${slackResult.failed} fallidos` : ''} (${slackResult.trigger === 'auto' ? 'automático' : 'manual'})` : ''}`
                        : selectedPhase === 'cerrado' ? 'No se envió aviso de Slack'
                        : savedSlack?.active ? `Aviso de Slack pendiente (programado a las ${formatHHMM(savedSlack.sendAt)})` : 'Envío automático de Slack desactivado'}
                    </p>
                    {slackResult?.error && <p className="text-xs text-red-600 mt-0.5">{slackResult.error}</p>}
                  </div>
                  <span className={cn('flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full', meta.badge)}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Respondieron" value={`${completedAttempts.length}${participants.length ? ` / ${participants.length}` : ''}`}
                    hint={participationPct !== null ? `${participationPct}% de participación` : undefined} />
                  <Stat label="En progreso" value={String(pulseAttempts.filter(a => a.status === 'in_progress').length)} />
                  <Stat label="% aciertos prom." value={avgCorrect !== null ? `${avgCorrect}%` : '—'}
                    tone={avgCorrect === null ? undefined : avgCorrect >= PULSE_PASS_PERCENTAGE ? 'good' : 'warn'} />
                  <Stat label="Preguntas" value={`${Math.min(perPulse, pulsePool.length)} por vendedor`} hint={`pool de ${pulsePool.length}`} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {isToday && selectedPhase === 'disponible' && (
                    <Button onClick={() => handleSendSlack(selectedDate, !!selectedPulse.sentAt)} disabled={actioning} size="sm" className="font-semibold">
                      <Send className="h-4 w-4 mr-1.5" />
                      {selectedPulse.sentAt ? 'Reenviar aviso de Slack' : 'Enviar aviso de Slack ahora'}
                    </Button>
                  )}
                  {isToday && selectedPhase === 'disponible' && (
                    <Button onClick={() => handleSetClosed(selectedDate, true)} disabled={actioning} size="sm" variant="outline">
                      <Lock className="h-4 w-4 mr-1.5" /> Cerrar ahora
                    </Button>
                  )}
                  {isToday && manuallyClosed && isPulseWindowOpen(closeAt, now) && (
                    <Button onClick={() => handleSetClosed(selectedDate, false)} disabled={actioning} size="sm" variant="outline">
                      <Unlock className="h-4 w-4 mr-1.5" /> Reabrir
                    </Button>
                  )}
                  {selectedPhase !== 'cerrado' && pulsePool.length === 0 && (
                    <Button onClick={() => handleAutoSchedule(selectedDate)} disabled={scheduling} size="sm" variant="outline">
                      <Zap className="h-4 w-4 mr-1.5" /> {scheduling ? 'Asignando...' : 'Auto-asignar preguntas'}
                    </Button>
                  )}
                  {selectedPhase !== 'cerrado' && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditingPulse({ date: selectedPulse.date, questionIds: [...pulsePool] });
                      setEditDialogOpen(true);
                    }}>
                      <Edit3 className="h-4 w-4 mr-1.5" /> Editar preguntas
                    </Button>
                  )}
                  {participants.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={exportCsv}>
                      <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
                    </Button>
                  )}
                </div>
                {isToday && selectedPhase === 'disponible' && pulseAttempts.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Editar el pool no cambia las preguntas de quien ya empezó.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Week strip */}
          <div className="flex items-center gap-2">
            <button
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={() => setWeekAnchor(d => addDaysStr(d, -7))}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 grid grid-cols-7 gap-1">
              {loadingPulses
                ? [...Array(7)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
                : weekDays.map(date => {
                    const pulse = getPulseForDate(date);
                    const phase = getPulsePhase(pulse, closeAt, now);
                    const isSelected = date === selectedDate;
                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        className={cn(
                          'flex flex-col items-center py-2 px-1 rounded-xl border-2 transition-all text-center',
                          isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:border-muted hover:bg-muted/40',
                        )}
                      >
                        <span className={cn('text-[10px] font-semibold uppercase tracking-wide', date === today ? 'text-primary' : 'text-muted-foreground')}>
                          {formatPulseDate(date, { weekday: 'narrow' })}
                        </span>
                        <span className={cn('text-base font-bold leading-tight', date === today ? 'text-primary' : '')}>
                          {Number(date.slice(8))}
                        </span>
                        <div className="mt-1.5 h-2 flex items-center justify-center">
                          {phase !== 'sin_pulso'
                            ? <span className={cn('h-2 w-2 rounded-full', PHASE_META[phase].dot)} />
                            : <span className="h-1 w-4 rounded-full bg-muted" />}
                        </div>
                      </button>
                    );
                  })}
            </div>
            <button
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={() => setWeekAnchor(d => addDaysStr(d, 7))}
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            {Object.values(PHASE_META).map(meta => (
              <span key={meta.label} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', meta.dot)} /> {meta.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded-full bg-muted" /> Sin pulso</span>
          </div>

          {/* Detail */}
          {selectedPulse && (
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="w-full max-w-sm">
                <TabsTrigger value="participacion" className="flex-1">
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Participación
                </TabsTrigger>
                <TabsTrigger value="preguntas" className="flex-1">
                  <ListChecks className="h-3.5 w-3.5 mr-1.5" /> Preguntas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="participacion" className="mt-4">
                <ParticipationPanel rows={participants} />
              </TabsContent>

              <TabsContent value="preguntas" className="mt-4">
                <QuestionsPanel
                  loading={loadingQ}
                  pool={pulsePool}
                  questions={pulseQuestions}
                  attempts={pulseAttempts}
                  perPulse={perPulse}
                  sameForAll={savedConfig.sameQuestionsForAll}
                  moduleLabel={moduleLabel}
                  moduleColor={moduleColor}
                />
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        {/* ─────────────────── AJUSTES ────────────────────────────────── */}
        <TabsContent value="ajustes" className="space-y-6 mt-5">
          {loadingConfig ? (
            <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Preguntas por pulso</CardTitle>
                  <CardDescription>Cuántas preguntas responde cada vendedor al día.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Número de preguntas</Label>
                    <Input
                      type="number"
                      min={3}
                      max={20}
                      value={configForm.questionsPerPulse}
                      onChange={e => setConfigForm(f => ({ ...f, questionsPerPulse: Math.min(20, Math.max(3, Number(e.target.value) || 3)) }))}
                    />
                    <p className="text-xs text-muted-foreground">Entre 3 y 20 preguntas. Por defecto: 7.</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ventana de respuesta</CardTitle>
                  <CardDescription>Hora límite para empezar el pulso del día (hora del centro de México).</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Hora de cierre</Label>
                    <Input type="time" value={configForm.closeAt} onChange={e => setConfigForm(f => ({ ...f, closeAt: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">
                      Después de esta hora ya no se puede iniciar el pulso. Quien lo empezó antes puede terminarlo ese mismo día.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Módulos activos</CardTitle>
                  <CardDescription>De qué módulos se toman las preguntas automáticas. Sin selección se usan todos.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {moduleKeys.map(mod => {
                      const isChecked = configForm.activeModules.includes(mod);
                      const count = questions.filter(q => q.module === mod).length;
                      return (
                        <label
                          key={mod}
                          className={cn(
                            'flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all',
                            isChecked ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-muted-foreground/40',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => setConfigForm(f => ({
                              ...f,
                              activeModules: e.target.checked ? [...f.activeModules, mod] : f.activeModules.filter(m => m !== mod),
                            }))}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-xs font-medium flex-1">{moduleLabel(mod)}</span>
                          <span className="text-[10px] text-muted-foreground">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                  {configForm.activeModules.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-3">Sin selección = todos los módulos activos.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Opciones de preguntas</CardTitle>
                  <CardDescription>Cómo se reparten y presentan las preguntas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <SettingRow
                    label="Mismas preguntas para todos"
                    text={`Activo: todo el equipo responde las primeras ${configForm.questionsPerPulse} del pool (comparables entre sí). Inactivo: cada vendedor recibe ${configForm.questionsPerPulse} al azar del pool.`}
                    checked={configForm.sameQuestionsForAll}
                    onChange={v => setConfigForm(f => ({ ...f, sameQuestionsForAll: v }))}
                  />
                  <SettingRow
                    label="Orden aleatorio de respuestas"
                    text="Mezcla el orden de las opciones para cada vendedor, para que no se memoricen posiciones."
                    checked={configForm.randomizeAnswerOrder}
                    onChange={v => setConfigForm(f => ({ ...f, randomizeAnswerOrder: v }))}
                  />
                  <SettingRow
                    label={<span className="flex items-center gap-1.5"><Zap className="h-4 w-4 text-yellow-500" /> Pulso automático diario</span>}
                    text="Crea el pulso de cada día sin intervención (lo hace el proceso programado y, como respaldo, la app cuando el primer vendedor la abre)."
                    checked={configForm.autoDailyPulse}
                    onChange={v => setConfigForm(f => ({ ...f, autoDailyPulse: v }))}
                  />
                </CardContent>
              </Card>

              <AutomationCard cronStatus={cronStatus} now={now} />

              <div className="lg:col-span-2 flex items-center justify-end gap-3 sticky bottom-4">
                {configDirty && <span className="text-xs text-amber-600 bg-background px-2 py-1 rounded">Cambios sin guardar</span>}
                <Button variant="ghost" onClick={() => setConfigForm(savedConfig)} disabled={!configDirty || savingConfig}>Descartar</Button>
                <Button onClick={handleSaveConfig} disabled={!configDirty || savingConfig}>
                  {savingConfig ? 'Guardando...' : 'Guardar ajustes'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─────────────────── SLACK ──────────────────────────────────── */}
        <TabsContent value="slack" className="space-y-6 mt-5">
          {!savedSlack ? (
            <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Aviso diario</CardTitle>
                  <CardDescription>Mensaje con el botón para responder, enviado cada día a la hora indicada.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Switch checked={slackForm.active} onCheckedChange={v => setSlackForm(f => ({ ...f, active: v }))} />
                    <Label>Envío automático activo</Label>
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Hora de envío</Label>
                    <Input type="time" value={slackForm.sendAt} onChange={e => setSlackForm(f => ({ ...f, sendAt: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">
                      Debe ser antes del cierre ({formatHHMM(closeAt)}). Requiere el proceso programado (Ajustes → Automatización).
                    </p>
                    {slackForm.sendAt >= closeAt && (
                      <p className="text-xs text-red-600">La hora de envío es igual o posterior al cierre: el aviso nunca saldría.</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      URL de la app
                      {!slackForm.appUrl && (
                        <span className="inline-flex items-center gap-1 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                          <AlertTriangle className="h-3 w-3" /> Requerida para el botón
                        </span>
                      )}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://app.avivacredito.com"
                        value={slackForm.appUrl}
                        onChange={e => setSlackForm(f => ({ ...f, appUrl: e.target.value }))}
                      />
                      <Button type="button" variant="outline" size="icon" title="Usar URL actual del navegador"
                        onClick={() => setSlackForm(f => ({ ...f, appUrl: window.location.origin }))}>
                        <Globe className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Plantilla del mensaje</Label>
                    <textarea
                      className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      value={slackForm.messageTemplate}
                      onChange={e => setSlackForm(f => ({ ...f, messageTemplate: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Variables: <code>{'{date}'}</code> fecha, <code>{'{preguntas}'}</code> número de preguntas,{' '}
                      <code>{'{cierre}'}</code> hora de cierre. El botón para responder se agrega solo.
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
                    <p className="text-sm whitespace-pre-line">
                      {applySlackTemplate(slackForm.messageTemplate, { date: formatPulseDate(today), preguntas: perPulse, cierre: formatHHMM(closeAt) })}
                    </p>
                    <span className="inline-block mt-1 text-xs font-semibold bg-green-700 text-white rounded px-2 py-1">📚 Responder el Pulso →</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Destinatarios</CardTitle>
                  <CardDescription>
                    Canales, Slack IDs de usuarios y destinatarios extra se gestionan en un solo lugar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Canales activos" value={String(activeChannels)} />
                    <Stat label="Vendedores con Slack" value={`${sellersWithSlack} / ${sellers.length}`} />
                    <Stat label="Destinatarios extra" value={String(directRecipients)} />
                  </div>
                  <div className="flex items-start gap-3 justify-between border-t pt-4">
                    <div className="space-y-0.5">
                      <Label>Mensaje directo a vendedores</Label>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        Envía DM a cada vendedor activo con Slack ID (no a admins ni capacitadores).
                      </p>
                    </div>
                    <Switch checked={slackForm.dmSellers} onCheckedChange={v => setSlackForm(f => ({ ...f, dmSellers: v }))} />
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/slack"><ExternalLink className="h-4 w-4 mr-1.5" /> Gestionar en Configuración Slack</Link>
                  </Button>
                  <div className="border-t pt-4 space-y-2">
                    <Label>Probar el mensaje</Label>
                    <p className="text-xs text-muted-foreground">
                      {profile?.slackId
                        ? 'La prueba se envía solo a ti por mensaje directo, con la configuración guardada.'
                        : 'No tienes Slack ID en tu perfil: la prueba irá a los destinatarios extra. Agrégalo en Configuración Slack → Usuarios.'}
                    </p>
                    <Button variant="outline" size="sm" onClick={handleSendTestSlack} disabled={sendingTest || slackDirty}>
                      <Send className="h-4 w-4 mr-1.5" /> {sendingTest ? 'Enviando...' : 'Enviarme una prueba'}
                    </Button>
                    {slackDirty && <p className="text-[11px] text-amber-600">Guarda los cambios antes de probar.</p>}
                  </div>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 flex items-center justify-end gap-3">
                {slackDirty && <span className="text-xs text-amber-600">Cambios sin guardar</span>}
                <Button variant="ghost" onClick={() => savedSlack && setSlackForm(savedSlack)} disabled={!slackDirty || savingSlack}>Descartar</Button>
                <Button onClick={handleSaveSlack} disabled={!slackDirty || savingSlack}>
                  {savingSlack ? 'Guardando...' : 'Guardar configuración'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <QuestionPickerDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editing={editingPulse}
        setEditing={setEditingPulse}
        onSave={handleSaveEditedPulse}
        questions={questions}
        perPulse={perPulse}
        sameForAll={savedConfig.sameQuestionsForAll}
        moduleKeys={moduleKeys}
        moduleLabel={moduleLabel}
        moduleColor={moduleColor}
      />
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="bg-white/60 dark:bg-background/40 rounded-xl p-3 border border-transparent">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-xl font-bold', tone === 'good' && 'text-green-600', tone === 'warn' && 'text-orange-500')}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SettingRow({ label, text, checked, onChange }: {
  label: React.ReactNode; text: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4 justify-between border-t first:border-t-0 pt-5 first:pt-0">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground max-w-md">{text}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function AutomationCard({ cronStatus, now }: { cronStatus: PulseCronStatus | null; now: Date }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/api/pulse/cron`;
  const lastRun = cronStatus?.lastRunAt?.toDate?.();
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast({ title: 'Copiado' })).catch(() => {});
  };
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Automatización</CardTitle>
        <CardDescription>
          Un proceso programado crea el pulso, envía el aviso de Slack a la hora de envío y cierra el pulso a la hora de cierre.
          Configúralo una vez en Cloud Scheduler (o cron-job.org) para que llame cada 10 minutos a:
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono truncate">GET {url}</code>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => copy(url)} title="Copiar URL"><Copy className="h-3.5 w-3.5" /></Button>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
          <li>Frecuencia: <code>*/10 * * * *</code></li>
          <li>Header: <code>Authorization: Bearer &lt;secreto&gt;</code> (o agrega <code>?key=&lt;secreto&gt;</code> a la URL).</li>
          <li>
            El secreto se define en <Link href="/admin/tokens" className="underline">Admin → Tokens</Link> con la clave{' '}
            <code>pulse_cron_secret</code> (o la variable de entorno <code>PULSE_CRON_SECRET</code>).
          </li>
        </ul>
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          {lastRun ? (
            <>
              <p><strong>Última ejecución:</strong> {timeAgo(lastRun, now)} ({lastRun.toLocaleString('es-MX', { timeZone: PULSE_TIMEZONE })})</p>
              <p className="text-muted-foreground mt-0.5">
                {cronStatus?.lastActions?.length ? cronStatus.lastActions.join(' · ') : 'Sin acciones pendientes en esa ejecución.'}
              </p>
              {cronStatus?.lastError && <p className="text-red-600 mt-0.5">Error: {cronStatus.lastError}</p>}
            </>
          ) : (
            <p className="text-amber-700">Todavía no se ha ejecutado. Mientras tanto, el aviso de Slack solo se envía con el botón manual.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ParticipationPanel({ rows }: { rows: ParticipantRow[] }) {
  const [filter, setFilter] = useState<'todos' | ParticipantStatus>('todos');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const c: Record<ParticipantStatus, number> = { completado: 0, en_progreso: 0, vencido: 0, pendiente: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const visible = rows
    .filter(r => filter === 'todos' || r.status === filter)
    .filter(r => !search || `${r.name} ${r.hub ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const order: ParticipantStatus[] = ['completado', 'en_progreso', 'vencido', 'pendiente'];
      const d = order.indexOf(a.status) - order.indexOf(b.status);
      if (d !== 0) return d;
      if (a.status === 'completado') return (b.attempt?.percentage ?? 0) - (a.attempt?.percentage ?? 0);
      return a.name.localeCompare(b.name);
    });

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['todos', 'completado', 'en_progreso', 'vencido', 'pendiente'] as const).map(key => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                filter === key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted',
              )}
            >
              {key === 'todos' ? `Todos (${rows.length})` : `${PARTICIPANT_STATUS_META[key].label} (${counts[key]})`}
            </button>
          ))}
          <div className="relative ml-auto w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-8 pl-8 text-xs" placeholder="Buscar nombre o hub" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? 'No hay vendedores activos registrados.' : 'Nadie en esta categoría.'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {visible.map(r => {
              const a = r.attempt;
              const meta = PARTICIPANT_STATUS_META[r.status];
              return (
                <div key={r.key} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{[r.hub, r.vertical].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a && r.status !== 'completado' && (
                      <span className="text-xs text-muted-foreground">{a.answers?.length ?? 0}/{a.totalQuestions}</span>
                    )}
                    {a && r.status === 'completado' ? (
                      <>
                        <span className="text-xs text-muted-foreground">{a.correctAnswers}/{a.totalQuestions}</span>
                        <span className={cn(
                          'text-xs font-bold px-2.5 py-1 rounded-full',
                          a.percentage >= PULSE_PASS_PERCENTAGE ? 'bg-green-500/10 text-green-700' : 'bg-orange-500/10 text-orange-600',
                        )}>
                          {a.percentage}%
                        </span>
                      </>
                    ) : (
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', meta.className)}>{meta.label}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionsPanel({ loading, pool, questions, attempts, perPulse, sameForAll, moduleLabel, moduleColor }: {
  loading: boolean;
  pool: string[];
  questions: Question[];
  attempts: PulseAttempt[];
  perPulse: number;
  sameForAll: boolean;
  moduleLabel: (m: KnowledgeModule) => string;
  moduleColor: (m: KnowledgeModule) => string;
}) {
  const [sortBy, setSortBy] = useState<'orden' | 'falladas'>('orden');

  const stats = useMemo(() => {
    const map = new Map<string, { asked: number; correct: number }>();
    for (const a of attempts) {
      for (const ans of a.answers ?? []) {
        const s = map.get(ans.questionId) ?? { asked: 0, correct: 0 };
        s.asked++;
        if (ans.isCorrect) s.correct++;
        map.set(ans.questionId, s);
      }
    }
    return map;
  }, [attempts]);

  const rate = (id: string) => {
    const s = stats.get(id);
    return s && s.asked > 0 ? Math.round((s.correct / s.asked) * 100) : null;
  };

  const rows = questions.map(q => ({ q, poolIndex: pool.indexOf(q.id), rate: rate(q.id), asked: stats.get(q.id)?.asked ?? 0 }));
  if (sortBy === 'falladas') {
    rows.sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
  }
  const mostFailed = [...rows].filter(r => r.rate !== null && r.asked >= 3).sort((a, b) => a.rate! - b.rate!)[0];
  const hasAnswers = stats.size > 0;

  if (loading) {
    return <Card><CardContent className="pt-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}</CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {questions.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <AlertTriangle className="h-6 w-6 mx-auto text-yellow-500" />
            <p className="text-sm font-medium">
              {pool.length === 0 ? 'Este pulso no tiene preguntas asignadas.' : 'No se encontraron las preguntas en el banco activo.'}
            </p>
            <p className="text-xs text-muted-foreground">
              {pool.length === 0 ? 'Usa "Auto-asignar preguntas" o "Editar preguntas".' : 'Pueden haber sido desactivadas. Verifica el banco de preguntas.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {sameForAll
                  ? `Todo el equipo responde las primeras ${Math.min(perPulse, pool.length)}; el resto queda de reserva.`
                  : `Cada vendedor recibe ${Math.min(perPulse, pool.length)} al azar de estas ${pool.length}.`}
              </p>
              {hasAnswers && (
                <div className="flex gap-1 text-xs">
                  {(['orden', 'falladas'] as const).map(k => (
                    <button key={k} onClick={() => setSortBy(k)}
                      className={cn('px-2.5 py-1 rounded-full border', sortBy === k ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}>
                      {k === 'orden' ? 'Orden del pulso' : 'Más falladas'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {mostFailed && mostFailed.rate! < PULSE_PASS_PERCENTAGE && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <strong>La más fallada hoy ({mostFailed.rate}% de aciertos):</strong> {mostFailed.q.text}
              </div>
            )}

            <div className="space-y-2">
              {rows.map(({ q, poolIndex, rate: r, asked }) => {
                const inPlay = !sameForAll || poolIndex < perPulse;
                return (
                  <div key={q.id} className={cn('flex items-start gap-3 p-3 rounded-xl bg-muted/30', !inPlay && 'opacity-60')}>
                    <span className="text-sm font-bold text-muted-foreground min-w-[22px] pt-0.5">{poolIndex + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{q.text}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {q.module && (
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-full', moduleColor(q.module))}>{moduleLabel(q.module)}</span>
                        )}
                        {sameForAll && !inPlay && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Reserva</span>}
                      </div>
                    </div>
                    {r !== null && (
                      <div className="text-right shrink-0">
                        <p className={cn('text-sm font-bold', r >= PULSE_PASS_PERCENTAGE ? 'text-green-600' : 'text-orange-500')}>{r}%</p>
                        <p className="text-[10px] text-muted-foreground">{asked} resp.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionPickerDialog({
  open, onOpenChange, editing, setEditing, onSave, questions, perPulse, sameForAll, moduleKeys, moduleLabel, moduleColor,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: { date: string; questionIds: string[] } | null;
  setEditing: React.Dispatch<React.SetStateAction<{ date: string; questionIds: string[] } | null>>;
  onSave: () => void;
  questions: Question[];
  perPulse: number;
  sameForAll: boolean;
  moduleKeys: KnowledgeModule[];
  moduleLabel: (m: KnowledgeModule) => string;
  moduleColor: (m: KnowledgeModule) => string;
}) {
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<KnowledgeModule | 'todos'>('todos');
  const [sortBy, setSortBy] = useState<'dificiles' | 'menos_usadas' | 'texto'>('dificiles');
  const [lastUsed, setLastUsed] = useState<Record<string, string>>({});
  const date = editing?.date;

  useEffect(() => {
    if (!open || !date) return;
    getDailyPulses(addDaysStr(date, -21), addDaysStr(date, 14))
      .then(list => setLastUsed(lastUsedByQuestion(list.filter(p => p.date !== date), perPulse)))
      .catch(() => setLastUsed({}));
  }, [open, date, perPulse]);

  if (!editing) return null;

  const selected = editing.questionIds;
  const pulseQuestions = questions.filter(q => q.module);
  const visible = pulseQuestions
    .filter(q => moduleFilter === 'todos' || q.module === moduleFilter)
    .filter(q => !search || q.text.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'texto') return a.text.localeCompare(b.text);
      if (sortBy === 'menos_usadas') return (lastUsed[a.id] ?? '').localeCompare(lastUsed[b.id] ?? '');
      return (a.averageCorrectRate ?? 0) - (b.averageCorrectRate ?? 0);
    });

  const toggle = (id: string) => setEditing(prev => {
    if (!prev) return prev;
    const ids = prev.questionIds.includes(id) ? prev.questionIds.filter(x => x !== id) : [...prev.questionIds, id];
    return { ...prev, questionIds: ids };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preguntas del {shortDate(editing.date)}</DialogTitle>
          <DialogDescription>
            {sameForAll
              ? `Todo el equipo responde las primeras ${perPulse} que selecciones, en ese orden; las demás quedan de reserva.`
              : `Cada vendedor recibe ${perPulse} al azar de las que selecciones.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-9 pl-8 text-sm" placeholder="Buscar pregunta" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
            >
              <option value="dificiles">Menos aciertos primero</option>
              <option value="menos_usadas">Menos usadas recientemente</option>
              <option value="texto">Alfabético</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['todos', ...moduleKeys] as const).map(m => (
              <button
                key={m}
                onClick={() => setModuleFilter(m)}
                className={cn('text-[11px] px-2.5 py-1 rounded-full border', moduleFilter === m ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}
              >
                {m === 'todos' ? 'Todos los módulos' : moduleLabel(m)}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className={cn('text-muted-foreground', selected.length > 0 && selected.length < perPulse && 'text-amber-600')}>
              {selected.length} seleccionadas
              {selected.length > 0 && selected.length < perPulse && ` · cada vendedor recibirá solo ${selected.length}`}
            </span>
            <div className="flex gap-2">
              <button className="text-xs text-primary hover:underline"
                onClick={() => setEditing(prev => prev ? { ...prev, questionIds: Array.from(new Set([...prev.questionIds, ...visible.map(q => q.id)])) } : prev)}>
                Seleccionar visibles
              </button>
              <span className="text-muted-foreground">·</span>
              <button className="text-xs text-muted-foreground hover:underline"
                onClick={() => setEditing(prev => prev ? { ...prev, questionIds: [] } : prev)}>
                Limpiar
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
            {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No hay preguntas con esos filtros.</p>}
            {visible.map(q => {
              const idx = selected.indexOf(q.id);
              const isSelected = idx !== -1;
              const used = lastUsed[q.id];
              return (
                <button
                  key={q.id}
                  onClick={() => toggle(q.id)}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border-2 transition-all flex items-start gap-3',
                    isSelected ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30',
                  )}
                >
                  <span className={cn(
                    'h-6 w-6 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center border',
                    isSelected
                      ? (sameForAll && idx >= perPulse ? 'bg-muted text-muted-foreground border-muted' : 'bg-primary text-primary-foreground border-primary')
                      : 'border-muted-foreground/30 text-transparent',
                  )}>
                    {isSelected ? idx + 1 : ''}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{q.text}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', moduleColor(q.module!))}>{moduleLabel(q.module!)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {q.timesUsed > 0 ? `${Math.round(q.averageCorrectRate ?? 0)}% aciertos históricos` : 'Sin historial'}
                      </span>
                      {used && (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', used > editing.date ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700')}>
                          {used > editing.date ? 'Programada' : 'Usada'} el {shortDate(used)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={selected.length === 0}>
            Guardar ({selected.length} preguntas)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
