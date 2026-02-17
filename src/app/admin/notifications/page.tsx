'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  BellRing,
  Mail,
  Clock,
  Award,
  BookOpen,
  Swords,
  RefreshCw,
  Save,
  Info,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationRule {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  enabled: boolean;
  daysBefore?: number;       // Para recordatorios previos a vencimiento
  daysAfter?: number;        // Para recordatorios de inactividad
  channel: 'email' | 'push' | 'both';
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<NotificationRule[]>([
    {
      id: 'course_assigned',
      label: 'Nuevo curso asignado',
      description: 'Se envía cuando el admin inscribe a un usuario en un curso',
      icon: BookOpen,
      color: 'text-emerald-600',
      enabled: true,
      channel: 'email',
    },
    {
      id: 'certificate_expiry_warning',
      label: 'Recordatorio de vencimiento de certificado',
      description: 'Avisa antes de que expire un certificado (cumplimiento)',
      icon: Award,
      color: 'text-amber-600',
      enabled: true,
      daysBefore: 30,
      channel: 'email',
    },
    {
      id: 'course_due_warning',
      label: 'Recordatorio de fecha límite del curso',
      description: 'Avisa cuando se acerca la fecha límite de completar un curso',
      icon: Clock,
      color: 'text-orange-600',
      enabled: true,
      daysBefore: 7,
      channel: 'email',
    },
    {
      id: 'challenge_available',
      label: 'Nuevo desafío disponible',
      description: 'Notifica cuando se publica un desafío asignado al usuario',
      icon: Swords,
      color: 'text-purple-600',
      enabled: true,
      channel: 'push',
    },
    {
      id: 'inactivity_reminder',
      label: 'Recordatorio de inactividad',
      description: 'Recuerda al vendedor continuar su ruta si lleva días sin actividad',
      icon: AlertCircle,
      color: 'text-red-600',
      enabled: false,
      daysAfter: 3,
      channel: 'email',
    },
    {
      id: 'course_completed',
      label: 'Curso completado',
      description: 'Confirmación al vendedor cuando completa un curso exitosamente',
      icon: CheckCircle2,
      color: 'text-teal-600',
      enabled: true,
      channel: 'email',
    },
    {
      id: 'certificate_issued',
      label: 'Certificado emitido',
      description: 'Notifica cuando se genera un certificado tras completar una ruta',
      icon: Award,
      color: 'text-amber-500',
      enabled: true,
      channel: 'email',
    },
    {
      id: 'recertification_due',
      label: 'Ciclo de re-certificación',
      description: 'Avisa cuando es momento de renovar una certificación obligatoria',
      icon: RefreshCw,
      color: 'text-blue-600',
      enabled: true,
      daysBefore: 14,
      channel: 'both',
    },
  ]);

  const [adminEmail, setAdminEmail] = useState('');

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const updateDays = (id: string, field: 'daysBefore' | 'daysAfter', value: string) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 1) return;
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: num } : r));
  };

  const updateChannel = (id: string, channel: NotificationRule['channel']) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, channel } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate save — in production this would write to Firestore
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast({ title: 'Configuración guardada', description: 'Las reglas de notificación se aplicarán en el próximo ciclo.' });
  };

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-6 w-6" /> Notificaciones
          </h1>
          <p className="text-muted-foreground">
            Configura cuándo y cómo se comunica el sistema con los vendedores
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Info banner */}
      <Card className="border-blue-200 bg-blue-50/40">
        <CardContent className="py-3 flex gap-3 items-start">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-700 space-y-1">
            <p>
              Las notificaciones se envían automáticamente basadas en los eventos del LMS.
              Actualmente se soporta <strong>correo electrónico</strong>. Las notificaciones push
              requieren integrar un servicio como Firebase Cloud Messaging (FCM).
            </p>
            <p>
              <strong>{enabledCount} de {rules.length}</strong> reglas activas.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Admin email */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Correo del administrador
          </CardTitle>
          <CardDescription>
            Recibe una copia de todas las notificaciones críticas del sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end max-w-sm">
            <div className="flex-1 space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="admin@avivafinanciera.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification rules */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Reglas de notificación
        </h2>

        {rules.map(rule => {
          const Icon = rule.icon;
          return (
            <Card key={rule.id} className={rule.enabled ? '' : 'opacity-60'}>
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className={`h-5 w-5 ${rule.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-medium text-sm">{rule.label}</p>
                      <Badge
                        variant={rule.channel === 'email' ? 'secondary' : rule.channel === 'push' ? 'outline' : 'default'}
                        className="text-xs"
                      >
                        {rule.channel === 'email' ? '📧 Email' : rule.channel === 'push' ? '📱 Push' : '📧📱 Ambos'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>

                    {/* Days config */}
                    {rule.enabled && (rule.daysBefore !== undefined || rule.daysAfter !== undefined) && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {rule.daysBefore !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs whitespace-nowrap">Avisar con</Label>
                            <Input
                              type="number"
                              min={1}
                              max={90}
                              value={rule.daysBefore}
                              onChange={e => updateDays(rule.id, 'daysBefore', e.target.value)}
                              className="h-7 w-16 text-sm text-center"
                            />
                            <Label className="text-xs whitespace-nowrap">días de antelación</Label>
                          </div>
                        )}
                        {rule.daysAfter !== undefined && (
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs whitespace-nowrap">Después de</Label>
                            <Input
                              type="number"
                              min={1}
                              max={30}
                              value={rule.daysAfter}
                              onChange={e => updateDays(rule.id, 'daysAfter', e.target.value)}
                              className="h-7 w-16 text-sm text-center"
                            />
                            <Label className="text-xs whitespace-nowrap">días de inactividad</Label>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Channel selector */}
                    {rule.enabled && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Label className="text-xs">Canal:</Label>
                        {(['email', 'push', 'both'] as const).map(ch => (
                          <button
                            key={ch}
                            onClick={() => updateChannel(rule.id, ch)}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                              rule.channel === ch
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/30 hover:border-primary/50'
                            }`}
                          >
                            {ch === 'email' ? 'Email' : ch === 'push' ? 'Push' : 'Ambos'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Toggle */}
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleRule(rule.id)}
                    className="shrink-0"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Compliance cycle summary */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-amber-600" /> Ciclo de compliance
          </CardTitle>
          <CardDescription>
            Para certificaciones con re-certificación automática, el sistema enviará notificaciones
            en cascada conforme se acerquen las fechas de renovación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { days: 30, label: 'Primer aviso' },
              { days: 14, label: 'Segundo aviso' },
              { days: 7, label: 'Aviso urgente' },
              { days: 0, label: 'Vencimiento' },
              { days: -7, label: 'Certificado expirado' },
            ].map(({ days, label }) => (
              <div key={days} className="flex items-center gap-1.5 bg-background rounded-lg px-3 py-1.5 border">
                <span className={`font-mono font-bold ${days < 0 ? 'text-red-600' : days === 0 ? 'text-amber-600' : 'text-blue-600'}`}>
                  {days === 0 ? 'Día 0' : days > 0 ? `-${days}d` : `+${Math.abs(days)}d`}
                </span>
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
