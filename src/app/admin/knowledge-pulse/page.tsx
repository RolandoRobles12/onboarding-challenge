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
  getPulseAttemptsByDate,
} from '@/lib/firestore-service';
import type {
  DailyPulse,
  SlackNotificationConfig,
  SlackChannel,
  PulseAttempt,
  KnowledgeModule,
} from '@/lib/types-scalable';
import { KNOWLEDGE_MODULE_LABELS } from '@/lib/types-scalable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  Calendar, Radio, Settings, Zap, ChevronLeft, ChevronRight,
  Plus, Trash2, Send, RefreshCw, Users, CheckCircle, Clock, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dt.toISOString().split('T')[0];
}

const STATUS_CONFIG = {
  scheduled: { label: 'Programado', color: 'bg-yellow-500/10 text-yellow-700', icon: Clock },
  active: { label: 'Activo', color: 'bg-green-500/10 text-green-700', icon: Radio },
  closed: { label: 'Cerrado', color: 'bg-gray-500/10 text-gray-600', icon: CheckCircle },
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

  const [activeTab, setActiveTab] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(todayStr());
  const [pulses, setPulses] = useState<DailyPulse[]>([]);
  const [loadingPulses, setLoadingPulses] = useState(false);
  const [selectedPulse, setSelectedPulse] = useState<DailyPulse | null>(null);
  const [pulseAttempts, setPulseAttempts] = useState<PulseAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  // Slack config state
  const [slackConfig, setSlackConfig] = useState<SlackNotificationConfig | null>(null);
  const [loadingSlack, setLoadingSlack] = useState(false);
  const [savingSlack, setSavingSlack] = useState(false);
  const [slackForm, setSlackForm] = useState({
    active: false,
    sendAt: '08:00',
    closeAt: '12:00',
    appUrl: '',
    messageTemplate: '📡 *Pulso de Conocimiento* — {date}\n\nResponde tus 7 preguntas antes de las 12:00 PM:\n{link}',
  });
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelVertical, setNewChannelVertical] = useState('');
  const [channelVerticalFilter, setChannelVerticalFilter] = useState<string>('todos');

  // Edit pulse dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPulse, setEditingPulse] = useState<{ date: string; questionIds: string[] } | null>(null);
  const [scheduling, setScheduling] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────

  const loadPulses = useCallback(async () => {
    setLoadingPulses(true);
    try {
      const start = addDays(currentDate, -15);
      const end = addDays(currentDate, 15);
      const list = await getDailyPulses(start, end);
      setPulses(list);
    } finally {
      setLoadingPulses(false);
    }
  }, [currentDate]);

  useEffect(() => { loadPulses(); }, [loadPulses]);

  useEffect(() => {
    if (activeTab !== 'config') return;
    setLoadingSlack(true);
    getSlackConfig().then(cfg => {
      if (cfg) {
        setSlackConfig(cfg);
        setSlackForm({
          active: cfg.active,
          sendAt: cfg.sendAt,
          closeAt: cfg.closeAt,
          appUrl: cfg.appUrl ?? '',
          messageTemplate: cfg.messageTemplate,
        });
        setChannels(cfg.channels);
      }
    }).finally(() => setLoadingSlack(false));
  }, [activeTab]);

  const loadAttempts = useCallback(async (date: string) => {
    setLoadingAttempts(true);
    try {
      const list = await getPulseAttemptsByDate(date);
      setPulseAttempts(list);
    } finally {
      setLoadingAttempts(false);
    }
  }, []);

  // ── Pulse calendar ──────────────────────────────────────────────────────

  function getPulseForDate(date: string) {
    return pulses.find(p => p.date === date) ?? null;
  }

  function renderWeek() {
    const days: string[] = [];
    const start = addDays(currentDate, -3);
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
    return days;
  }

  const handleSelectDay = async (date: string) => {
    const pulse = getPulseForDate(date);
    setSelectedPulse(pulse);
    if (pulse) await loadAttempts(date);
    else setPulseAttempts([]);
  };

  const handleAutoSchedule = async (date: string) => {
    setScheduling(true);
    try {
      const qIds = await scheduleAutoPulse();
      if (qIds.length < 7) {
        toast({ variant: 'destructive', title: 'Pocas preguntas', description: `Solo hay ${qIds.length} preguntas con módulo asignado. Asigna módulos en el banco de preguntas.` });
        return;
      }
      await upsertDailyPulse(date, qIds, profile?.uid || 'admin');
      toast({ title: 'Pulso programado', description: `7 preguntas seleccionadas automáticamente para ${formatDate(date)}` });
      await loadPulses();
      const pulse = await getDailyPulse(date);
      setSelectedPulse(pulse);
    } finally {
      setScheduling(false);
    }
  };

  const handleActivate = async (date: string) => {
    try {
      await updatePulseStatus(date, 'active');
      toast({ title: 'Pulso activado', description: 'Los usuarios ya pueden responder.' });
      await loadPulses();
      const pulse = await getDailyPulse(date);
      setSelectedPulse(pulse);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo activar el pulso.' });
    }
  };

  const handleClose = async (date: string) => {
    try {
      await updatePulseStatus(date, 'closed');
      toast({ title: 'Pulso cerrado' });
      await loadPulses();
      const pulse = await getDailyPulse(date);
      setSelectedPulse(pulse);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cerrar el pulso.' });
    }
  };

  const handleEditPulse = (pulse: DailyPulse) => {
    setEditingPulse({ date: pulse.date, questionIds: [...pulse.questionIds] });
    setEditDialogOpen(true);
  };

  const handleSaveEditedPulse = async () => {
    if (!editingPulse) return;
    try {
      await upsertDailyPulse(editingPulse.date, editingPulse.questionIds, profile?.uid || 'admin');
      toast({ title: 'Pulso actualizado' });
      setEditDialogOpen(false);
      await loadPulses();
      const pulse = await getDailyPulse(editingPulse.date);
      setSelectedPulse(pulse);
    } catch {
      toast({ variant: 'destructive', title: 'Error al actualizar' });
    }
  };

  // ── Slack config ────────────────────────────────────────────────────────

  const handleSaveSlack = async () => {
    if (!profile) return;
    setSavingSlack(true);
    try {
      await saveSlackConfig({ ...slackForm, channels }, profile.uid);
      toast({ title: 'Configuración guardada', description: 'La configuración de Slack se actualizó.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error al guardar' });
    } finally {
      setSavingSlack(false);
    }
  };

  const handleAddChannel = () => {
    const id = newChannelId.trim();
    const name = newChannelName.trim();
    if (!id || !name) return;
    setChannels(prev => [...prev, {
      id: crypto.randomUUID(),
      channelId: id,
      channelName: name,
      vertical: newChannelVertical.trim() || undefined,
      active: true,
    }]);
    setNewChannelId('');
    setNewChannelName('');
    setNewChannelVertical('');
  };

  // Derived: unique verticals from channels
  const channelVerticals = Array.from(new Set(channels.map(c => c.vertical).filter(Boolean))) as string[];

  const handleSendTestSlack = async () => {
    try {
      const res = await fetch('/api/pulse/send-slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayStr(), test: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: 'Mensaje de prueba enviado' });
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error al enviar', description: err instanceof Error ? err.message : String(err) });
    }
  };

  // ── Derived stats ───────────────────────────────────────────────────────

  const pulseQuestions = selectedPulse
    ? questions.filter(q => selectedPulse.questionIds.includes(q.id))
    : [];

  const moduleBreakdown = pulseQuestions.reduce<Record<string, number>>((acc, q) => {
    const mod = q.module ?? 'sin_módulo';
    acc[mod] = (acc[mod] ?? 0) + 1;
    return acc;
  }, {});

  const participationPct = selectedPulse && selectedPulse.totalResponses > 0
    ? Math.round(selectedPulse.totalResponses)
    : 0;

  const avgCorrect = pulseAttempts.length > 0
    ? Math.round(pulseAttempts.reduce((s, a) => s + a.percentage, 0) / pulseAttempts.length)
    : null;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Radio className="h-7 w-7 text-primary" /> Pulso de Conocimiento
        </h1>
        <p className="text-muted-foreground mt-1">
          Administra el cuestionario diario de 7 preguntas para el equipo comercial.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calendar">
            <Calendar className="h-4 w-4 mr-1.5" /> Calendario
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="h-4 w-4 mr-1.5" /> Config Slack
          </TabsTrigger>
        </TabsList>

        {/* ── CALENDAR TAB ────────────────────────────────────────────── */}
        <TabsContent value="calendar" className="space-y-6 mt-4">
          {/* Week navigator */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(d => addDays(d, -7))}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="text-sm font-medium text-muted-foreground">
                  {formatDate(addDays(currentDate, -3))} — {formatDate(addDays(currentDate, 3))}
                </span>
                <Button variant="ghost" size="icon" onClick={() => setCurrentDate(d => addDays(d, 7))}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {renderWeek().map(date => {
                  const pulse = getPulseForDate(date);
                  const isToday = date === todayStr();
                  const isSelected = selectedPulse?.date === date;
                  const StatusIcon = pulse ? STATUS_CONFIG[pulse.status].icon : null;
                  return (
                    <button
                      key={date}
                      onClick={() => handleSelectDay(date)}
                      className={cn(
                        'flex flex-col items-center p-2 rounded-lg border-2 transition-all text-center min-h-[80px]',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : isToday
                          ? 'border-primary/40'
                          : 'border-transparent hover:border-muted',
                      )}
                    >
                      <span className={cn('text-[11px] font-medium uppercase', isToday && 'text-primary')}>
                        {new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short' })}
                      </span>
                      <span className={cn('text-lg font-bold', isToday && 'text-primary')}>
                        {date.split('-')[2]}
                      </span>
                      {pulse ? (
                        <span className={cn('text-[10px] px-1 py-0.5 rounded-full mt-1 flex items-center gap-0.5', STATUS_CONFIG[pulse.status].color)}>
                          {StatusIcon && <StatusIcon className="h-3 w-3" />}
                          {STATUS_CONFIG[pulse.status].label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground mt-1">Sin pulso</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected day detail */}
          {selectedPulse ? (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Stats */}
              <div className="lg:col-span-1 space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {formatDate(selectedPulse.date)}
                    </CardTitle>
                    <span className={cn('text-xs px-2 py-1 rounded-full w-fit flex items-center gap-1', STATUS_CONFIG[selectedPulse.status].color)}>
                      {(() => { const Icon = STATUS_CONFIG[selectedPulse.status].icon; return <Icon className="h-3 w-3" />; })()}
                      {STATUS_CONFIG[selectedPulse.status].label}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Respuestas</span>
                      <span className="font-semibold">{participationPct}</span>
                    </div>
                    {avgCorrect !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">% Aciertos promedio</span>
                        <span className={cn('font-semibold', avgCorrect >= 70 ? 'text-green-600' : 'text-red-500')}>
                          {avgCorrect}%
                        </span>
                      </div>
                    )}
                    <div className="border-t pt-3 space-y-1.5">
                      {Object.entries(moduleBreakdown).map(([mod, count]) => (
                        <div key={mod} className="flex items-center justify-between text-xs">
                          <span className={cn('px-2 py-0.5 rounded-full', MODULE_COLORS[mod as KnowledgeModule] ?? 'bg-muted text-muted-foreground')}>
                            {KNOWLEDGE_MODULE_LABELS[mod as KnowledgeModule] ?? mod}
                          </span>
                          <span className="text-muted-foreground">{count} px</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 space-y-2">
                      {selectedPulse.status === 'scheduled' && (
                        <Button size="sm" className="w-full" onClick={() => handleActivate(selectedPulse.date)}>
                          <Radio className="h-4 w-4 mr-1.5" /> Activar Ahora
                        </Button>
                      )}
                      {selectedPulse.status === 'active' && (
                        <Button size="sm" variant="outline" className="w-full" onClick={() => handleClose(selectedPulse.date)}>
                          <CheckCircle className="h-4 w-4 mr-1.5" /> Cerrar Pulso
                        </Button>
                      )}
                      {selectedPulse.status !== 'closed' && (
                        <Button size="sm" variant="ghost" className="w-full" onClick={() => handleEditPulse(selectedPulse)}>
                          Editar preguntas
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Questions list */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">7 Preguntas del Pulso</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingQ ? (
                      <div className="space-y-3">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
                    ) : (
                      <div className="space-y-2">
                        {pulseQuestions.map((q, idx) => (
                          <div key={q.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                            <span className="text-lg font-bold text-muted-foreground min-w-[24px]">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium line-clamp-2">{q.text}</p>
                              {q.module && (
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full mt-1 inline-block', MODULE_COLORS[q.module])}>
                                  {KNOWLEDGE_MODULE_LABELS[q.module]}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {pulseQuestions.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No se encontraron las preguntas en el banco.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Participant results */}
                {pulseAttempts.length > 0 && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="h-4 w-4" /> Respuestas ({pulseAttempts.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingAttempts ? (
                        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {pulseAttempts
                            .sort((a, b) => b.percentage - a.percentage)
                            .map(attempt => (
                              <div key={attempt.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                                <div>
                                  <span className="font-medium">{attempt.userName}</span>
                                  {attempt.hub && <span className="text-muted-foreground text-xs ml-2">· {attempt.hub}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{attempt.correctAnswers}/7</span>
                                  <span className={cn(
                                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                                    attempt.percentage >= 70 ? 'bg-green-500/10 text-green-700' : 'bg-red-500/10 text-red-600'
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
                )}
              </div>
            </div>
          ) : (
            /* No pulse selected or day has no pulse */
            <Card>
              <CardContent className="py-12 text-center space-y-4">
                {selectedPulse === null && (
                  <>
                    <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
                    <div>
                      <p className="font-medium">Selecciona un día del calendario</p>
                      <p className="text-sm text-muted-foreground">Haz clic en un día para ver o crear su pulso.</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* No pulse for selected day — create it */}
          {selectedPulse === null && (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center space-y-3">
                <Zap className="h-10 w-10 mx-auto text-yellow-500" />
                <p className="font-medium">Programar pulso para hoy ({formatDate(currentDate)})</p>
                <Button onClick={() => handleAutoSchedule(currentDate)} disabled={scheduling}>
                  {scheduling
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Seleccionando preguntas...</>
                    : <><Zap className="h-4 w-4 mr-2" /> Rotación Automática (7 preguntas)</>
                  }
                </Button>
                <p className="text-xs text-muted-foreground">
                  El sistema elige 7 preguntas del catálogo priorizando las más difíciles y distribuyendo por módulo.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── SLACK CONFIG TAB ─────────────────────────────────────────── */}
        <TabsContent value="config" className="space-y-6 mt-4">
          {loadingSlack ? (
            <div className="space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Activation & timing */}
              <Card>
                <CardHeader>
                  <CardTitle>Notificación Slack</CardTitle>
                  <CardDescription>
                    El bot enviará un mensaje con el link del pulso a los canales configurados.
                    Solo necesitas agregar <code className="text-xs bg-muted px-1 rounded">SLACK_BOT_TOKEN</code> en tus variables de entorno.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={slackForm.active}
                      onCheckedChange={v => setSlackForm(f => ({ ...f, active: v }))}
                    />
                    <Label>Notificaciones activas</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Hora de envío</Label>
                      <Input
                        type="time"
                        value={slackForm.sendAt}
                        onChange={e => setSlackForm(f => ({ ...f, sendAt: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cierre de ventana</Label>
                      <Input
                        type="time"
                        value={slackForm.closeAt}
                        onChange={e => setSlackForm(f => ({ ...f, closeAt: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>URL de la app</Label>
                    <Input
                      placeholder="https://app.avivacredito.com"
                      value={slackForm.appUrl}
                      onChange={e => setSlackForm(f => ({ ...f, appUrl: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      La URL base de tu plataforma. Se usa para generar el link <code>{'{link}'}</code> en el mensaje.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Plantilla del mensaje</Label>
                    <textarea
                      className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      value={slackForm.messageTemplate}
                      onChange={e => setSlackForm(f => ({ ...f, messageTemplate: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">Variables disponibles: <code>{'{date}'}</code>, <code>{'{link}'}</code></p>
                  </div>
                </CardContent>
              </Card>

              {/* Channels */}
              <Card>
                <CardHeader>
                  <CardTitle>Canales y Destinatarios</CardTitle>
                  <CardDescription>
                    Agrega los IDs de los canales de Slack donde se publicará el pulso.
                    Puedes asignar una vertical de producto a cada canal para organizarlos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Vertical filter */}
                  {channels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setChannelVerticalFilter('todos')}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                          channelVerticalFilter === 'todos'
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                        )}
                      >
                        Todos ({channels.length})
                      </button>
                      {channelVerticals.map(v => {
                        const count = channels.filter(c => c.vertical === v).length;
                        return (
                          <button
                            key={v}
                            onClick={() => setChannelVerticalFilter(v)}
                            className={cn(
                              'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                              channelVerticalFilter === v
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                            )}
                          >
                            {v} ({count})
                          </button>
                        );
                      })}
                      {channels.some(c => !c.vertical) && (
                        <button
                          onClick={() => setChannelVerticalFilter('sin_vertical')}
                          className={cn(
                            'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                            channelVerticalFilter === 'sin_vertical'
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                          )}
                        >
                          Sin vertical ({channels.filter(c => !c.vertical).length})
                        </button>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    {channels.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No hay canales configurados.</p>
                    )}
                    {channels
                      .filter(ch =>
                        channelVerticalFilter === 'todos' ? true :
                        channelVerticalFilter === 'sin_vertical' ? !ch.vertical :
                        ch.vertical === channelVerticalFilter
                      )
                      .map(ch => (
                        <div key={ch.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{ch.channelName}</p>
                              {ch.vertical && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                                  {ch.vertical}
                                </span>
                              )}
                              {!ch.vertical && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border font-medium">
                                  Todas las verticales
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{ch.channelId}</p>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => setChannels(prev => prev.filter(c => c.id !== ch.id))}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Agregar canal</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="ID (ej: C01234567)"
                        value={newChannelId}
                        onChange={e => setNewChannelId(e.target.value)}
                      />
                      <Input
                        placeholder="Nombre (ej: #conocimiento)"
                        value={newChannelName}
                        onChange={e => setNewChannelName(e.target.value)}
                      />
                    </div>
                    <Input
                      placeholder="Vertical de producto (ej: Aviva Tu Compra) — dejar vacío para todos"
                      value={newChannelVertical}
                      onChange={e => setNewChannelVertical(e.target.value)}
                    />
                    <Button variant="outline" size="sm" className="w-full" onClick={handleAddChannel}>
                      <Plus className="h-4 w-4 mr-1.5" /> Agregar Canal
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Save + Test */}
              <div className="lg:col-span-2 flex gap-3 justify-end">
                <Button variant="outline" onClick={handleSendTestSlack}>
                  <Send className="h-4 w-4 mr-2" /> Enviar Prueba
                </Button>
                <Button onClick={handleSaveSlack} disabled={savingSlack}>
                  {savingSlack ? 'Guardando...' : 'Guardar Configuración'}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit pulse questions dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar preguntas del pulso</DialogTitle>
            <DialogDescription>
              Selecciona exactamente 7 preguntas con módulo asignado.
            </DialogDescription>
          </DialogHeader>
          {editingPulse && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                {editingPulse.questionIds.length}/7 preguntas seleccionadas
              </p>
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
                          : prev.questionIds.length < 7
                          ? [...prev.questionIds, q.id]
                          : prev.questionIds;
                        return { ...prev, questionIds: ids };
                      })}
                      className={cn(
                        'w-full text-left p-3 rounded-lg border-2 transition-all',
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
            <Button
              onClick={handleSaveEditedPulse}
              disabled={editingPulse?.questionIds.length !== 7}
            >
              Guardar {editingPulse?.questionIds.length}/7
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
