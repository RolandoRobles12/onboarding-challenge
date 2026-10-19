/**
 * Avisos automáticos a los embajadores (Admin → Notificaciones).
 *
 * Se mandan por Slack (mensaje directo del bot, al Slack ID del perfil) y por
 * notificación push de la app (si el embajador la activó en su teléfono). No
 * se usa correo. Este módulo es compartido entre el panel y el servidor.
 */

import type { Timestamp } from 'firebase/firestore';

export type NotificationType =
  | 'course_assigned'
  | 'course_completed'
  | 'course_due_warning'
  | 'certificate_issued'
  | 'badge_earned'
  | 'challenge_available'
  | 'stage_due_warning'
  | 'recertification_due'
  | 'inactivity_reminder';

export interface NotificationRuleConfig {
  enabled: boolean;
  slack: boolean;
  push: boolean;
  /** Días antes del vencimiento (etapa) o de inactividad, según la regla. */
  days?: number;
}

export interface NotificationConfig {
  organizationId: string;
  rules: Record<NotificationType, NotificationRuleConfig>;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export interface NotificationRuleMeta {
  id: NotificationType;
  label: string;
  description: string;
  defaults: NotificationRuleConfig;
  /** Texto del campo de días, si la regla lo usa. */
  daysLabel?: string;
}

export const NOTIFICATION_RULES: NotificationRuleMeta[] = [
  {
    id: 'course_assigned',
    label: 'Nuevo curso asignado',
    description: 'Cuando un admin inscribe al embajador en un curso.',
    defaults: { enabled: true, slack: true, push: true },
  },
  {
    id: 'challenge_available',
    label: 'Nuevo desafío disponible',
    description: 'Cuando se publica un desafío del producto del embajador.',
    defaults: { enabled: true, slack: true, push: true },
  },
  {
    id: 'stage_due_warning',
    label: 'Etapa de la ruta por vencer',
    description: 'Antes de que venza el plazo de una etapa de su ruta (según su fecha de ingreso).',
    defaults: { enabled: true, slack: true, push: true, days: 2 },
    daysLabel: 'días antes',
  },
  {
    id: 'course_due_warning',
    label: 'Fecha límite del curso',
    description: 'Antes de que se acabe el plazo para terminar un curso (los días que da el curso desde la inscripción).',
    defaults: { enabled: true, slack: true, push: true, days: 3 },
    daysLabel: 'días antes',
  },
  {
    id: 'recertification_due',
    label: 'Re-certificación',
    description: 'Antes de que venza un curso con re-certificación; al vencer se le vuelve a asignar si el curso lo pide.',
    defaults: { enabled: true, slack: true, push: true, days: 14 },
    daysLabel: 'días antes',
  },
  {
    id: 'inactivity_reminder',
    label: 'Recordatorio de inactividad',
    description: 'Si lleva días sin avanzar y su ruta no está terminada. Se repite cada tantos días mientras siga sin actividad.',
    defaults: { enabled: false, slack: true, push: true, days: 3 },
    daysLabel: 'días sin actividad',
  },
  {
    id: 'course_completed',
    label: 'Curso completado',
    description: 'Felicitación al terminar un curso.',
    defaults: { enabled: true, slack: false, push: true },
  },
  {
    id: 'certificate_issued',
    label: 'Certificado emitido',
    description: 'Cuando obtiene el certificado de su ruta o de un curso.',
    defaults: { enabled: true, slack: true, push: true },
  },
  {
    id: 'badge_earned',
    label: 'Insignia obtenida',
    description: 'Cuando gana una insignia (automática o entregada por un admin).',
    defaults: { enabled: true, slack: false, push: true },
  },
];

/** Configuración guardada + valores por defecto de las reglas que falten. */
export function resolveNotificationConfig(
  stored: Partial<NotificationConfig> | null | undefined,
  orgId = 'aviva-credito',
): NotificationConfig {
  const rules = {} as Record<NotificationType, NotificationRuleConfig>;
  for (const meta of NOTIFICATION_RULES) {
    rules[meta.id] = { ...meta.defaults, ...(stored?.rules?.[meta.id] ?? {}) };
  }
  return { ...stored, organizationId: stored?.organizationId ?? orgId, rules };
}

/** Registro de un aviso enviado (colección notification_log, la escribe el servidor). */
export interface NotificationLogEntry {
  id: string;
  type: NotificationType | 'test';
  userId: string;
  userName?: string;
  title: string;
  body: string;
  createdAt: Timestamp;
  slack?: { ok: boolean; error?: string };
  push?: { sent: number; failed: number; error?: string };
}
