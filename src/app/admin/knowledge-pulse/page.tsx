'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@/lib/firestore-service';
import type {
  DailyPulse,
  SlackChannel,
  SlackDirectRecipient,
  PulseAttempt,
  PulseConfig,
  KnowledgeModule,
} from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS, KNOWLEDGE_MODULES } from '@/lib/types-scalable';
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
  Radio, Settings, Zap, ChevronLeft, ChevronRight,
  Plus, Trash2, Send, RefreshCw, Users, CheckCircle, Clock,
  BarChart2, ListChecks, Edit3, AlertTriangle, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────

function dateToStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr() {
  return dateToStr(new Date());
}

function formatDateLong(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function formatDateShort(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return dateToStr(new Date(y, m - 1, d + n));
}

function getWeekDays(anchor: string): string[] {
  const days: string[] = [];
  // Monday of the week containing anchor
  const [y, m, d] = anchor.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0=Sun
  const monday = new Date(y, m - 1, d - ((day === 0 ? 7 : day) - 1));
  for (let i = 0; i < 7; i++) {
    days.push(dateToStr(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  }
  return days;
}

const STATUS_META = {
  scheduled: {
    label: 'Programado',
    dot: 'bg-yellow-400',
    badge: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    icon: Clock,
    hero: 'from-yellow-50 to-amber-50/30 border-yellow-200',
  },
  active: {
    label: 'Activo ahora',
    dot: 'bg-green-500',
    badge: 'bg-green-50 text-green-700 border border-green-200',
    icon: Radio,
    hero: 'from-green-50 to-emerald-50/30 border-green-200',
  },
  closed: {
    label: 'Cerrado',
    dot: 'bg-gray-400',
    badge: 'bg-gray-50 text-gray-600 border border-gray-200',
    icon: CheckCircle,
    hero: 'from-gray-50 to-slate-50/30 border-gray-200',
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

// ── Component ──────────────────────────────────────────────────────────────

export default function KnowledgePulsePage() {
  const { profile } = useAuth();
  const { questions, loading: loadingQ } = useQuestions();

  const [mainTab, setMainTab] = useState('pulsos');
  const [weekAnchor, setWeekAnchor] = useState(todayStr());
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [pulses, setPulses] = useState<DailyPulse[]>([]);
  const [loadingPulses, setLoadingPulses] = useState(true);
  const [selectedPulse, setSelectedPulse] = useState<DailyPulse | null | undefined>(undefined); // undefined = not loaded yet
  const [pulseAttempts, setPulseAttempts] = useState<PulseAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [detailTab, setDetailTab] = useState('preguntas');
  const [scheduling, setScheduling] = useState(false);
  const [actioning, setActioning] = useState(false);

  // Pulse config (Ajustes tab)
  const [loadingPulseConfig, setLoadingPulseConfig] = useState(false);
  const [savingPulseConfig, setSavingPulseConfig] = useState(false);
  const [pulseConfigForm, setPulseConfigForm] = useState<Omit<PulseConfig, 'id' | 'organizationId' | 'updatedAt' | 'updatedBy'>>({
    questionsPerPulse: 7,
    activeModules: [],
    closeAt: '12:00',
    sameQuestionsForAll: true,
    randomizeAnswerOrder: false,
  });

  // Slack config (Slack tab)
  const [loadingSlack, setLoadingSlack] = useState(false);
  const [savingSlack, setSavingSlack] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [slackForm, setSlackForm] = useState({
    active: false,
    sendAt: '08:00',
    appUrl: '',
    messageTemplate: '📡 *Pulso de Conocimiento* — {date}\n\nResponde tus 7 preguntas antes de las 12:00 PM. ¡Tienes hasta las 12:00 PM de hoy!',
  });
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [directRecipients, setDirectRecipients] = useState<SlackDirectRecipient[]>([]);
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelVertical, setNewChannelVertical] = useState('');
  const [channelVerticalFilter, setChannelVerticalFilter] = useState('todos');
  const [newDMUserId, setNewDMUserId] = useState('');
  const [newDMUserName, setNewDMUserName] = useState('');

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPulse, setEditingPulse] = useState<{ date: string; questionIds: string[] } | null>(null);

  // ── Load pulses for current week window ───────────────────────────────

  const loadPulses = useCallback(async () => {
    setLoadingPulses(true);
    try {
      const days = getWeekDays(weekAnchor);
      const start = addDays(days[0], -1);
      const end = addDays(days[6], 1);
      const list = await getDailyPulses(start, end);
      setPulses(list);
    } finally {
      setLoadingPulses(false);
    }
  }, [weekAnchor]);

  useEffect(() => { loadPulses(); }, [loadPulses]);

  // ── Load selected day ──────────────────────────────────────────────────

  const loadSelectedDay = useCallback(async (date: string) => {
    setSelectedPulse(undefined); // loading
    setLoadingAttempts(true);
    const [pulse, attempts] = await Promise.all([
      getDailyPulse(date),
      getPulseAttemptsByDate(date),
    ]);
    setSelectedPulse(pulse); // null = no pulse
    setPulseAttempts(attempts);
    setLoadingAttempts(false);
  }, []);

  // Auto-load today on mount and whenever selected date changes
  useEffect(() => { loadSelectedDay(selectedDate); }, [selectedDate, loadSelectedDay]);

  // ── Pulse config (Ajustes tab) ─────────────────────────────────────────

  useEffect(() => {
    if (mainTab !== 'ajustes') return;
    setLoadingPulseConfig(true);
    getPulseConfig().then(cfg => {
      setPulseConfigForm({
        questionsPerPulse: cfg.questionsPerPulse,
        activeModules: cfg.activeModules,
        closeAt: cfg.closeAt,
        sameQuestionsForAll: cfg.sameQuestionsForAll,
        randomizeAnswerOrder: cfg.randomizeAnswerOrder,
      });
    }).finally(() => setLoadingPulseConfig(false));
  }, [mainTab]);

  // ── Slack config ───────────────────────────────────────────────────────

  useEffect(() => {
    if (mainTab !== 'slack') return;
    setLoadingSlack(true);
    getSlackConfig().then(cfg => {
      // Auto-detect current app URL as default when not configured yet
      const detectedUrl = typeof window !== 'undefined' ? window.location.origin : '';
      if (cfg) {
        setSlackForm({
          active: cfg.active,
          sendAt: cfg.sendAt,
          appUrl: cfg.appUrl || detectedUrl,
          messageTemplate: cfg.messageTemplate,
        });
        setChannels(cfg.channels);
        setDirectRecipients(cfg.directRecipients ?? []);
      } else {
        // First time — pre-fill the URL
        setSlackForm(f => ({ ...f, appUrl: detectedUrl }));
      }
    }).finally(() => setLoadingSlack(false));
  }, [mainTab]);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleAutoSchedule = async (date: string) => {
    setScheduling(true);
    try {
      const qIds = await scheduleAutoPulse();
      if (qIds.length === 0) {
        toast({ variant: 'destructive', title: 'Sin preguntas', description: 'No hay preguntas activas. Agrega preguntas en el banco.' });
        return;
      }
      await upsertDailyPulse(date, qIds, profile?.uid || 'admin');
      toast({ title: 'Pulso creado', description: `Pool de ${qIds.length} preguntas disponibles para ${formatDateShort(date)}` });
      await Promise.all([loadPulses(), loadSelectedDay(date)]);
    } finally {
      setScheduling(false);
    }
  };

  const handleActivate = async (date: string) => {
    setActioning(true);
    try {
      await updatePulseStatus(date, 'active');
      toast({ title: 'Pulso activado', description: 'El equipo ya puede responder.' });
      await Promise.all([loadPulses(), loadSelectedDay(date)]);
    } catch {
      toast({ variant: 'destructive', title: 'Error al activar' });
    } finally {
      setActioning(false);
    }
  };

  const handleClose = async (date: string) => {
    setActioning(true);
    try {
      await updatePulseStatus(date, 'closed');
      toast({ title: 'Pulso cerrado' });
      await Promise.all([loadPulses(), loadSelectedDay(date)]);
    } catch {
      toast({ variant: 'destructive', title: 'Error al cerrar' });
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
      await Promise.all([loadPulses(), loadSelectedDay(editingPulse.date)]);
    } catch {
      toast({ variant: 'destructive', title: 'Error al actualizar' });
    }
  };

  // Pulse config
  const handleSavePulseConfig = async () => {
    if (!profile) return;
    setSavingPulseConfig(true);
    try {
      await savePulseConfig(pulseConfigForm, profile.uid);
      toast({ title: 'Ajustes del pulso guardados' });
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSavingPulseConfig(false);
    }
  };

  // Slack
  const handleSaveSlack = async () => {
    if (!profile) return;
    setSavingSlack(true);
    try {
      await saveSlackConfig({ ...slackForm, closeAt: '12:00', channels, directRecipients }, profile.uid);
      toast({ title: 'Configuración de Slack guardada' });
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSavingSlack(false);
    }
  };

  const handleAddChannel = () => {
    const id = newChannelId.trim(); const name = newChannelName.trim();
    if (!id || !name) return;
    setChannels(prev => [...prev, { id: crypto.randomUUID(), channelId: id, channelName: name, vertical: newChannelVertical.trim() || undefined, active: true }]);
    setNewChannelId(''); setNewChannelName(''); setNewChannelVertical('');
  };

  const handleAddDM = () => {
    const uid = newDMUserId.trim(); const name = newDMUserName.trim();
    if (!uid || !name) return;
    setDirectRecipients(prev => [...prev, { id: crypto.randomUUID(), slackUserId: uid, displayName: name }]);
    setNewDMUserId(''); setNewDMUserName('');
  };

  const handleSendTestSlack = async () => {
    setSendingTest(true);
    try {
      const res = await fetch('/api/pulse/send-slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayStr(), test: true }),
      });
      const data = await res.json() as {
        message?: string;
        error?: string;
        results?: { target: string; type: string; ok: boolean; error?: string }[];
      };

      if (!res.ok && !data.results) {
        // Hard error (no results at all — token missing, config missing, etc.)
        toast({
          variant: 'destructive',
          title: 'Error al enviar',
          description: data.error ?? `HTTP ${res.status}`,
        });
        return;
      }

      const results = data.results ?? [];
      const failed = results.filter(r => !r.ok);
      const succeeded = results.filter(r => r.ok);

      if (failed.length === 0) {
        const channels = succeeded.filter(r => r.type === 'channel').length;
        const dms = succeeded.filter(r => r.type === 'dm').length;
        const parts = [
          channels > 0 ? `${channels} canal${channels !== 1 ? 'es' : ''}` : '',
          dms > 0 ? `${dms} DM${dms !== 1 ? 's' : ''}` : '',
        ].filter(Boolean).join(', ');
        toast({ title: '✅ Prueba enviada', description: `Enviado a: ${parts || 'sin destinatarios'}` });
      } else {
        const details = failed.map(r => `${r.target}: ${r.error ?? 'error desconocido'}`).join(' · ');
        toast({
          variant: 'destructive',
          title: `⚠️ ${succeeded.length} ok, ${failed.length} fallaron`,
          description: details,
        });
      }
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error al enviar', description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSendingTest(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────

  const weekDays = getWeekDays(weekAnchor);
  const getPulseForDate = (d: string) => pulses.find(p => p.date === d) ?? null;

  const pulseQuestions = selectedPulse
    ? questions.filter(q => (selectedPulse.questionIds ?? []).includes(q.id))
    : [];

  const avgCorrect = pulseAttempts.length > 0
    ? Math.round(pulseAttempts.reduce((s, a) => s + a.percentage, 0) / pulseAttempts.length)
    : null;

  const channelVerticals = Array.from(new Set(channels.map(c => c.vertical).filter(Boolean))) as string[];

  const isToday = selectedDate === todayStr();

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Radio className="h-7 w-7 text-primary" /> Pulso de Conocimiento
          </h1>
          <p className="text-muted-foreground mt-1">Cuestionario diario de 7 preguntas para el equipo comercial</p>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="pulsos">
            <BarChart2 className="h-4 w-4 mr-1.5" /> Pulsos
          </TabsTrigger>
          <TabsTrigger value="ajustes">
            <Settings className="h-4 w-4 mr-1.5" /> Ajustes
          </TabsTrigger>
          <TabsTrigger value="slack">
            <Send className="h-4 w-4 mr-1.5" /> Slack
          </TabsTrigger>
        </TabsList>

        {/* ─────────────────── PULSOS TAB ─────────────────────────────── */}
        <TabsContent value="pulsos" className="space-y-5 mt-5">

          {/* ── HERO: selected day status ─────────────────────────── */}
          {selectedPulse === undefined ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : selectedPulse === null ? (
            /* No pulse for this day */
            <div className="rounded-2xl border-2 border-dashed border-muted-foreground/20 bg-muted/20 p-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {isToday ? 'Hoy' : formatDateShort(selectedDate)} · Sin pulso programado
                  </p>
                  <h2 className="text-2xl font-bold capitalize">{formatDateLong(selectedDate)}</h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    El equipo no tiene preguntas programadas para este día.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                  <Button size="lg" className="font-semibold" onClick={() => handleAutoSchedule(selectedDate)} disabled={scheduling}>
                    {scheduling
                      ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Creando...</>
                      : <><Zap className="h-4 w-4 mr-2" /> Crear automáticamente</>
                    }
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => {
                    setEditingPulse({ date: selectedDate, questionIds: [] });
                    setEditDialogOpen(true);
                  }}>
                    <Edit3 className="h-4 w-4 mr-2" /> Elegir preguntas
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                La creación automática selecciona 7 preguntas priorizando las más difíciles y distribuyendo por módulo.
              </p>
            </div>
          ) : (
            /* Has pulse */
            (() => {
              const meta = STATUS_META[selectedPulse.status] ?? STATUS_META['scheduled'];
              const StatusIcon = meta.icon;
              return (
                <div className={cn('rounded-2xl border bg-gradient-to-br p-6 space-y-4', meta.hero)}>
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        {isToday ? 'Hoy' : formatDateShort(selectedDate)}
                      </p>
                      <h2 className="text-2xl font-bold capitalize">{formatDateLong(selectedDate)}</h2>
                    </div>
                    <span className={cn('flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full', meta.badge)}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="bg-white/60 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Respuestas</p>
                      <p className="text-2xl font-bold">{pulseAttempts.length}</p>
                    </div>
                    <div className="bg-white/60 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">% Aciertos prom.</p>
                      <p className={cn(
                        'text-2xl font-bold',
                        avgCorrect === null ? 'text-muted-foreground' :
                        avgCorrect >= 70 ? 'text-green-600' : 'text-orange-500'
                      )}>
                        {avgCorrect !== null ? `${avgCorrect}%` : '—'}
                      </p>
                    </div>
                    <div className="bg-white/60 rounded-xl p-3 col-span-2 sm:col-span-1">
                      <p className="text-xs text-muted-foreground mb-0.5">Preguntas</p>
                      <p className="text-2xl font-bold">{(selectedPulse.questionIds ?? []).length}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {selectedPulse.status === 'scheduled' && (
                      <Button onClick={() => handleActivate(selectedDate)} disabled={actioning} size="sm" className="font-semibold">
                        <Radio className="h-4 w-4 mr-1.5" />
                        {actioning ? 'Activando...' : 'Activar ahora'}
                      </Button>
                    )}
                    {selectedPulse.status === 'active' && (
                      <Button onClick={() => handleClose(selectedDate)} disabled={actioning} size="sm" variant="outline" className="font-semibold border-green-300 text-green-700 hover:bg-green-50">
                        <CheckCircle className="h-4 w-4 mr-1.5" />
                        {actioning ? 'Cerrando...' : 'Cerrar pulso'}
                      </Button>
                    )}
                    {selectedPulse.status !== 'closed' && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingPulse({ date: selectedPulse.date, questionIds: [...(selectedPulse.questionIds ?? [])] });
                        setEditDialogOpen(true);
                      }}>
                        <Edit3 className="h-4 w-4 mr-1.5" /> Editar preguntas
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()
          )}

          {/* ── WEEK STRIP ────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <button
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={() => setWeekAnchor(d => addDays(d, -7))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex-1 grid grid-cols-7 gap-1">
              {loadingPulses
                ? [...Array(7)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)
                : weekDays.map(date => {
                    const pulse = getPulseForDate(date);
                    const isTodayDate = date === todayStr();
                    const isSelected = date === selectedDate;
                    const [, , dayNum] = date.split('-');
                    const weekday = new Date(date + 'T12:00').toLocaleDateString('es-MX', { weekday: 'narrow' });

                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        className={cn(
                          'flex flex-col items-center py-2 px-1 rounded-xl border-2 transition-all text-center',
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-transparent hover:border-muted hover:bg-muted/40',
                        )}
                      >
                        <span className={cn(
                          'text-[10px] font-semibold uppercase tracking-wide',
                          isTodayDate ? 'text-primary' : 'text-muted-foreground'
                        )}>
                          {weekday}
                        </span>
                        <span className={cn(
                          'text-base font-bold leading-tight',
                          isTodayDate ? 'text-primary' : ''
                        )}>
                          {dayNum}
                        </span>
                        <div className="mt-1.5 h-2 flex items-center justify-center">
                          {pulse ? (
                            <span className={cn('h-2 w-2 rounded-full', (STATUS_META[pulse.status] ?? STATUS_META['scheduled']).dot)} />
                          ) : (
                            <span className="h-1 w-4 rounded-full bg-muted" />
                          )}
                        </div>
                      </button>
                    );
                  })
              }
            </div>

            <button
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={() => setWeekAnchor(d => addDays(d, 7))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Week legend */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                {meta.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full bg-muted" />
              Sin pulso
            </span>
          </div>

          {/* ── DETAIL: questions + participants ─────────────────── */}
          {selectedPulse && selectedPulse !== null && (
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="w-full max-w-xs">
                <TabsTrigger value="preguntas" className="flex-1">
                  <ListChecks className="h-3.5 w-3.5 mr-1.5" /> Preguntas
                </TabsTrigger>
                <TabsTrigger value="participantes" className="flex-1">
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Participantes
                  {pulseAttempts.length > 0 && (
                    <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                      {pulseAttempts.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Questions tab */}
              <TabsContent value="preguntas" className="mt-4">
                <Card>
                  <CardContent className="pt-4">
                    {loadingQ ? (
                      <div className="space-y-3">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
                    ) : pulseQuestions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No se encontraron las preguntas en el banco.</p>
                    ) : (
                      <div className="space-y-2">
                        {pulseQuestions.map((q, idx) => (
                          <div key={q.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                            <span className="text-sm font-bold text-muted-foreground min-w-[22px] pt-0.5">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-snug">{q.text}</p>
                              {q.module && (
                                <span className={cn('text-[10px] px-2 py-0.5 rounded-full mt-1.5 inline-block', MODULE_COLORS[q.module])}>
                                  {KNOWLEDGE_MODULE_LABELS[q.module]}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Participants tab */}
              <TabsContent value="participantes" className="mt-4">
                <Card>
                  <CardContent className="pt-4">
                    {loadingAttempts ? (
                      <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                    ) : pulseAttempts.length === 0 ? (
                      <div className="py-10 text-center">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Aún no hay respuestas para este día.</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {/* Summary bar */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 pb-3 border-b">
                          <span>{pulseAttempts.length} respuesta{pulseAttempts.length !== 1 ? 's' : ''}</span>
                          {avgCorrect !== null && (
                            <span className={cn(
                              'font-semibold',
                              avgCorrect >= 70 ? 'text-green-600' : 'text-orange-500'
                            )}>
                              Promedio: {avgCorrect}%
                            </span>
                          )}
                        </div>
                        {pulseAttempts
                          .sort((a, b) => b.percentage - a.percentage)
                          .map((attempt, idx) => (
                            <div key={attempt.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                              <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{attempt.userName}</p>
                                {attempt.hub && <p className="text-xs text-muted-foreground">{attempt.hub}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-muted-foreground">{attempt.correctAnswers}/7</span>
                                <span className={cn(
                                  'text-xs font-bold px-2.5 py-1 rounded-full',
                                  attempt.percentage >= 70 ? 'bg-green-500/10 text-green-700' : 'bg-orange-500/10 text-orange-600'
                                )}>
                                  {attempt.percentage}%
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        {/* ─────────────────── AJUSTES DEL PULSO TAB ──────────────────── */}
        <TabsContent value="ajustes" className="space-y-6 mt-5">
          {loadingPulseConfig ? (
            <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Preguntas por pulso */}
              <Card>
                <CardHeader>
                  <CardTitle>Preguntas por pulso</CardTitle>
                  <CardDescription>
                    Número de preguntas que se incluyen en cada pulso diario.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Número de preguntas</Label>
                    <Input
                      type="number"
                      min={3}
                      max={20}
                      value={pulseConfigForm.questionsPerPulse}
                      onChange={e => setPulseConfigForm(f => ({ ...f, questionsPerPulse: Math.min(20, Math.max(3, Number(e.target.value))) }))}
                    />
                    <p className="text-xs text-muted-foreground">Entre 3 y 20 preguntas. Por defecto: 7.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Ventana de respuesta */}
              <Card>
                <CardHeader>
                  <CardTitle>Ventana de respuesta</CardTitle>
                  <CardDescription>
                    Hora límite fija en la que se cierra el pulso del día para todos los usuarios.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Hora de cierre</Label>
                    <Input
                      type="time"
                      value={pulseConfigForm.closeAt}
                      onChange={e => setPulseConfigForm(f => ({ ...f, closeAt: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      El pulso se marcará como <strong>cerrado</strong> a esta hora exacta.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Módulos activos */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Módulos activos</CardTitle>
                  <CardDescription>
                    Selecciona de qué módulos se tomarán las preguntas. Si no seleccionas ninguno, se usan todos.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {KNOWLEDGE_MODULES.map(mod => {
                      const isChecked = pulseConfigForm.activeModules.includes(mod);
                      return (
                        <label
                          key={mod}
                          className={cn(
                            'flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-all',
                            isChecked
                              ? 'border-primary/50 bg-primary/5'
                              : 'border-border hover:border-muted-foreground/40',
                            pulseConfigForm.activeModules.length === 0 && 'border-muted-foreground/20 bg-muted/20'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              if (e.target.checked) {
                                setPulseConfigForm(f => ({ ...f, activeModules: [...f.activeModules, mod] }));
                              } else {
                                setPulseConfigForm(f => ({ ...f, activeModules: f.activeModules.filter(m => m !== mod) }));
                              }
                            }}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className={cn('text-xs font-medium', MODULE_COLORS[mod].split(' ')[1])}>
                            {KNOWLEDGE_MODULE_LABELS[mod]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {pulseConfigForm.activeModules.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Sin selección = todos los módulos activos.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Opciones de selección y orden */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Opciones de preguntas</CardTitle>
                  <CardDescription>
                    Controla cómo se seleccionan y presentan las preguntas a los usuarios.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-start gap-4 justify-between">
                    <div className="space-y-0.5">
                      <Label>Mismas preguntas para todos</Label>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        Si está activo, todos los promotores reciben el mismo set de {pulseConfigForm.questionsPerPulse} preguntas.
                        Si está inactivo, cada usuario recibe una selección aleatoria distinta.
                      </p>
                    </div>
                    <Switch
                      checked={pulseConfigForm.sameQuestionsForAll}
                      onCheckedChange={v => setPulseConfigForm(f => ({ ...f, sameQuestionsForAll: v }))}
                    />
                  </div>
                  <div className="border-t pt-5 flex items-start gap-4 justify-between">
                    <div className="space-y-0.5">
                      <Label>Orden aleatorio de respuestas</Label>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        Si está activo, el orden de las opciones de respuesta se aleatoriza para cada usuario,
                        reduciendo el efecto de memorizar posiciones.
                      </p>
                    </div>
                    <Switch
                      checked={pulseConfigForm.randomizeAnswerOrder}
                      onCheckedChange={v => setPulseConfigForm(f => ({ ...f, randomizeAnswerOrder: v }))}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 flex justify-end">
                <Button onClick={handleSavePulseConfig} disabled={savingPulseConfig}>
                  {savingPulseConfig ? 'Guardando...' : 'Guardar ajustes'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─────────────────── SLACK CONFIG TAB ───────────────────────── */}
        <TabsContent value="slack" className="space-y-6 mt-5">
          {loadingSlack ? (
            <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Notification settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Notificación Slack</CardTitle>
                  <CardDescription>
                    El bot enviará un mensaje con el link del pulso a los canales configurados.
                    Requiere <code className="text-xs bg-muted px-1 rounded">SLACK_BOT_TOKEN</code> en variables de entorno.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Switch checked={slackForm.active} onCheckedChange={v => setSlackForm(f => ({ ...f, active: v }))} />
                    <Label>Notificaciones activas</Label>
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Hora de envío de notificación</Label>
                    <Input type="time" value={slackForm.sendAt} onChange={e => setSlackForm(f => ({ ...f, sendAt: e.target.value }))} />
                    <p className="text-xs text-muted-foreground">Hora a la que el bot publicará el mensaje en Slack.</p>
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
                        className={!slackForm.appUrl ? 'border-amber-300 focus-visible:ring-amber-400' : ''}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="Usar URL actual del navegador"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            setSlackForm(f => ({ ...f, appUrl: window.location.origin }));
                          }
                        }}
                      >
                        <Globe className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      URL base para el botón <strong>📚 Responder el Pulso →</strong> del mensaje de Slack.
                      El ícono <Globe className="inline h-3 w-3" /> auto-rellena con la URL del navegador actual.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Plantilla del mensaje</Label>
                    <textarea
                      className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      value={slackForm.messageTemplate}
                      onChange={e => setSlackForm(f => ({ ...f, messageTemplate: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Variable disponible: <code>{'{date}'}</code>. El enlace a la app se envía automáticamente como botón interactivo de Slack.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Channels */}
              <Card>
                <CardHeader>
                  <CardTitle>Canales y Destinatarios</CardTitle>
                  <CardDescription>
                    Canales donde se publicará el pulso. Puedes asignar una vertical a cada canal para organizarlos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Vertical filter chips */}
                  {channels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: 'todos', label: `Todos (${channels.length})` },
                        ...channelVerticals.map(v => ({ key: v, label: `${v} (${channels.filter(c => c.vertical === v).length})` })),
                        ...(channels.some(c => !c.vertical) ? [{ key: 'sin_vertical', label: `Sin vertical (${channels.filter(c => !c.vertical).length})` }] : []),
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setChannelVerticalFilter(key)}
                          className={cn(
                            'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                            channelVerticalFilter === key
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    {channels.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No hay canales configurados.</p>
                    )}
                    {channels
                      .filter(ch => channelVerticalFilter === 'todos' ? true : channelVerticalFilter === 'sin_vertical' ? !ch.vertical : ch.vertical === channelVerticalFilter)
                      .map(ch => (
                        <div key={ch.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{ch.channelName}</p>
                              <span className={cn(
                                'text-[10px] px-2 py-0.5 rounded-full border font-medium',
                                ch.vertical ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground'
                              )}>
                                {ch.vertical ?? 'Todas las verticales'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{ch.channelId}</p>
                          </div>
                          <button onClick={() => setChannels(prev => prev.filter(c => c.id !== ch.id))} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agregar canal</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="ID (ej: C01234567)" value={newChannelId} onChange={e => setNewChannelId(e.target.value)} />
                      <Input placeholder="Nombre (ej: #conocimiento)" value={newChannelName} onChange={e => setNewChannelName(e.target.value)} />
                    </div>
                    <Input placeholder="Vertical (ej: Aviva Tu Compra) — vacío = todos" value={newChannelVertical} onChange={e => setNewChannelVertical(e.target.value)} />
                    <Button variant="outline" size="sm" className="w-full" onClick={handleAddChannel}>
                      <Plus className="h-4 w-4 mr-1.5" /> Agregar canal
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Direct message recipients */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Mensajes directos (DM)</CardTitle>
                  <CardDescription>
                    Destinatarios adicionales de DM. Los usuarios con Slack ID configurado en
                    <strong> Admin → Slack</strong> ya reciben DM automáticamente; agrega aquí
                    IDs extra que no estén registrados como usuarios.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {directRecipients.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin destinatarios directos configurados.</p>
                    )}
                    {directRecipients.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{r.displayName}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.slackUserId}</p>
                        </div>
                        <button onClick={() => setDirectRecipients(prev => prev.filter(d => d.id !== r.id))} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agregar destinatario</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Slack User ID (ej: U01234567)" value={newDMUserId} onChange={e => setNewDMUserId(e.target.value)} />
                      <Input placeholder="Nombre (ej: Carlos López)" value={newDMUserName} onChange={e => setNewDMUserName(e.target.value)} />
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={handleAddDM}>
                      <Plus className="h-4 w-4 mr-1.5" /> Agregar destinatario
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="lg:col-span-2 flex gap-3 justify-end">
                <Button variant="outline" onClick={handleSendTestSlack} disabled={sendingTest}>
                  <Send className="h-4 w-4 mr-2" />
                  {sendingTest ? 'Enviando...' : 'Enviar prueba'}
                </Button>
                <Button onClick={handleSaveSlack} disabled={savingSlack}>
                  {savingSlack ? 'Guardando...' : 'Guardar configuración'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Edit questions dialog ─────────────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seleccionar pool de preguntas</DialogTitle>
            <DialogDescription>
              Elige las preguntas disponibles para {editingPulse ? formatDateShort(editingPulse.date) : ''}.
              Con <strong>preguntas aleatorias</strong> activado, cada usuario recibe 7 al azar de este pool.
              Selecciona todas las que quieras incluir.
            </DialogDescription>
          </DialogHeader>
          {editingPulse && (
            <div className="space-y-3 py-2">
              {/* Counter */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {editingPulse.questionIds.length} de {questions.filter(q => q.module).length} preguntas seleccionadas
                </span>
                <div className="flex gap-2">
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => setEditingPulse(prev => prev ? { ...prev, questionIds: questions.filter(q => q.module).map(q => q.id) } : prev)}
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => setEditingPulse(prev => prev ? { ...prev, questionIds: [] } : prev)}
                  >
                    Limpiar
                  </button>
                </div>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {questions.filter(q => q.module).map(q => {
                  const selected = editingPulse.questionIds.includes(q.id);
                  return (
                    <button
                      key={q.id}
                      onClick={() => setEditingPulse(prev => {
                        if (!prev) return prev;
                        const ids = prev.questionIds.includes(q.id)
                          ? prev.questionIds.filter(id => id !== q.id)
                          : [...prev.questionIds, q.id];
                        return { ...prev, questionIds: ids };
                      })}
                      className={cn(
                        'w-full text-left p-3 rounded-xl border-2 transition-all',
                        selected ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/30'
                      )}
                    >
                      <p className="text-sm font-medium line-clamp-2">{q.text}</p>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full mt-1 inline-block', MODULE_COLORS[q.module!])}>
                        {KNOWLEDGE_MODULE_LABELS[q.module!]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEditedPulse} disabled={!editingPulse || editingPulse.questionIds.length === 0}>
              Guardar pool ({editingPulse?.questionIds.length ?? 0} preguntas)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
