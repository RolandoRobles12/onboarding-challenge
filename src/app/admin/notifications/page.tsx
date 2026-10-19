'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { getAllUsers, getNotificationConfig, getRecentNotifications, saveNotificationConfig } from '@/lib/firestore-service';
import { authFetch } from '@/lib/api-client';
import {
  NOTIFICATION_RULES,
  type NotificationConfig,
  type NotificationLogEntry,
  type NotificationRuleConfig,
  type NotificationType,
} from '@/lib/notifications';
import type { UserProfile } from '@/lib/types-scalable';
import {
  BellRing, Save, Info, Send, Loader2, MessageSquare, Smartphone, Users, CheckCircle2, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Rules = NotificationConfig['rules'];

interface TestResult {
  slack?: { ok: boolean; error?: string };
  push?: { sent: number; failed: number; error?: string };
  error?: string;
}

function formatWhen(entry: NotificationLogEntry): string {
  const d = entry.createdAt?.toDate?.();
  return d ? d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

/**
 * Avisos automáticos a los embajadores por Slack (mensaje directo del bot) y
 * push (notificación de la app). Las reglas se guardan en notification_config
 * y el servidor las aplica en cada evento y en la revisión diaria.
 */
export default function NotificationsPage() {
  const { toast } = useToast();
  const { profile } = useAuth();

  const [rules, setRules] = useState<Rules | null>(null);
  const [savedRules, setSavedRules] = useState<Rules | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [log, setLog] = useState<NotificationLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    getNotificationConfig().then(cfg => { setRules(cfg.rules); setSavedRules(cfg.rules); })
      .catch(() => toast({ variant: 'destructive', title: 'No se pudo cargar la configuración' }));
    getAllUsers().then(setUsers).catch(() => setUsers([]));
    getRecentNotifications().then(setLog).catch(() => setLog([]));
  }, [toast]);

  const dirty = !!rules && JSON.stringify(rules) !== JSON.stringify(savedRules);
  useUnsavedChanges(dirty);

  const reach = useMemo(() => {
    const sellers = users.filter(u => u.rol === 'seller' && u.active !== false);
    return {
      total: sellers.length,
      slack: sellers.filter(u => u.slackId?.trim()).length,
      push: sellers.filter(u => u.pushEnabled).length,
    };
  }, [users]);

  const update = (id: NotificationType, patch: Partial<NotificationRuleConfig>) => {
    setRules(prev => prev ? { ...prev, [id]: { ...prev[id], ...patch } } : prev);
  };

  const handleSave = async () => {
    if (!rules || !profile) return;
    const noChannel = NOTIFICATION_RULES.find(m => rules[m.id].enabled && !rules[m.id].slack && !rules[m.id].push);
    if (noChannel) {
      toast({ variant: 'destructive', title: 'Falta el canal', description: `Elige Slack o push para «${noChannel.label}», o apágalo.` });
      return;
    }
    setSaving(true);
    try {
      await saveNotificationConfig(rules, profile.uid);
      setSavedRules(rules);
      toast({ title: 'Avisos guardados' });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch('/api/notifications/test', { method: 'POST' });
      setTestResult(await res.json() as TestResult);
    } catch {
      setTestResult({ error: 'No se pudo contactar a la app.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-6 w-6" /> Notificaciones
          </h1>
          <p className="text-muted-foreground">
            Avisos automáticos a los embajadores por Slack y por notificación push de la app
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Alcance */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="py-4 flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{reach.total}</p><p className="text-xs text-muted-foreground">embajadores activos</p></div>
        </CardContent></Card>
        <Card><CardContent className="py-4 flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{reach.slack}</p><p className="text-xs text-muted-foreground">con Slack ID (reciben Slack)</p></div>
        </CardContent></Card>
        <Card><CardContent className="py-4 flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{reach.push}</p><p className="text-xs text-muted-foreground">con notificaciones activadas</p></div>
        </CardContent></Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="py-3 flex gap-3 items-start">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p>
              <strong>Slack</strong> usa el bot del Pulso (<Link href="/admin/tokens" className="underline">Tokens</Link>) y el Slack ID de cada
              embajador (<Link href="/admin/knowledge-pulse?tab=slack" className="underline">Gestión del Pulso → Slack</Link>).
              <strong> Push</strong> le llega a quien activó las notificaciones en <em>Mi Perfil</em> (en iPhone, con la app instalada).
            </p>
            <p>
              Los avisos de eventos salen al momento. Los de plazos, re-certificación e inactividad se revisan una vez al día,
              a la hora de envío del Pulso. Cada aviso se manda una sola vez.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Prueba */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Probar los avisos</CardTitle>
          <CardDescription>Te manda un aviso de prueba a ti, por Slack y push, para revisar que todo esté conectado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviarme una prueba
          </Button>
          {testResult && (
            <div className="text-sm space-y-1">
              {testResult.error && <p className="text-destructive">{testResult.error}</p>}
              {testResult.slack && (
                <p className={cn('flex items-center gap-1.5', testResult.slack.ok ? 'text-green-700' : 'text-destructive')}>
                  {testResult.slack.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  Slack: {testResult.slack.ok ? 'enviado' : testResult.slack.error}
                </p>
              )}
              {testResult.push && (
                <p className={cn('flex items-center gap-1.5', testResult.push.sent > 0 ? 'text-green-700' : 'text-destructive')}>
                  {testResult.push.sent > 0 ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  Push: {testResult.push.sent > 0
                    ? `enviado a ${testResult.push.sent} dispositivo${testResult.push.sent !== 1 ? 's' : ''}`
                    : testResult.push.error ?? 'no se envió'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reglas */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Avisos</h2>
        {!rules ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        ) : NOTIFICATION_RULES.map(meta => {
          const rule = rules[meta.id];
          return (
            <Card key={meta.id} className={rule.enabled ? '' : 'opacity-60'}>
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <p className="font-medium text-sm">{meta.label}</p>
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                    {rule.enabled && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label className="text-xs">Canales:</Label>
                        {([['slack', 'Slack', MessageSquare], ['push', 'Push', Smartphone]] as const).map(([key, label, Icon]) => (
                          <button
                            key={key}
                            onClick={() => update(meta.id, { [key]: !rule[key] })}
                            className={cn(
                              'text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1',
                              rule[key]
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/30 hover:border-primary/50',
                            )}
                          >
                            <Icon className="h-3 w-3" /> {label}
                          </button>
                        ))}
                        {meta.daysLabel && (
                          <span className="flex items-center gap-1.5 ml-2">
                            <Input
                              type="number"
                              min={1}
                              max={90}
                              value={rule.days ?? meta.defaults.days ?? 1}
                              onChange={e => update(meta.id, { days: Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 1)) })}
                              className="h-7 w-16 text-sm text-center"
                            />
                            <Label className="text-xs whitespace-nowrap">{meta.daysLabel}</Label>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Switch checked={rule.enabled} onCheckedChange={v => update(meta.id, { enabled: v })} className="shrink-0" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Historial */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimos avisos enviados</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se ha enviado ningún aviso.</p>
          ) : (
            <div className="divide-y">
              {log.map(entry => (
                <div key={entry.id} className="py-2 text-sm flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.title} <span className="text-muted-foreground font-normal">· {entry.userName || entry.userId}</span></p>
                    <p className="text-xs text-muted-foreground truncate">{entry.body}</p>
                  </div>
                  <div className="text-xs text-right shrink-0 space-y-0.5">
                    <p className="text-muted-foreground">{formatWhen(entry)}</p>
                    {entry.slack && <p className={entry.slack.ok ? 'text-green-700' : 'text-destructive'} title={entry.slack.error}>Slack {entry.slack.ok ? '✓' : '✗'}</p>}
                    {entry.push && <p className={entry.push.sent > 0 ? 'text-green-700' : 'text-muted-foreground'} title={entry.push.error}>Push {entry.push.sent > 0 ? '✓' : '—'}</p>}
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
