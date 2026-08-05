/**
 * Motor de calendario de rutas de aprendizaje.
 *
 * Ancla una ruta a la fecha de ingreso del vendedor y calcula, para cada
 * etapa y cada hito (30/60/90 o los que el admin configure), su fecha límite
 * y su estado (a tiempo, por vencer, vencido, completado).
 *
 * Todo el cálculo es puro y trabaja con fechas locales normalizadas a
 * medianoche para evitar desfases por horas/zonas horarias.
 */

import type {
  Journey,
  JourneyMilestone,
  JourneyStage,
  UserProfile,
} from '@/lib/types-scalable';
import { SEGMENTATION_FIELD_KEYS } from '@/lib/types-scalable';

// ─── Fechas ───────────────────────────────────────────────────────────────────

/** Normaliza una fecha a medianoche local. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Interpreta una fecha guardada como texto. Acepta `YYYY-MM-DD` (formato del
 * campo `fechaIngreso`) y `DD/MM/YYYY` (formato común en capturas manuales).
 * Devuelve null si no se puede interpretar.
 */
export function parseDateString(value?: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : startOfDay(fallback);
}

/**
 * Fecha de ingreso del vendedor. Prioriza el campo operativo `fechaIngreso`
 * (editable por admin) y cae al dato capturado en el formulario de ingreso.
 */
export function getEntryDate(
  profile: Pick<UserProfile, 'fechaIngreso' | 'onboardingData'> | null | undefined,
): Date | null {
  if (!profile) return null;
  return (
    parseDateString(profile.fechaIngreso) ??
    parseDateString(profile.onboardingData?.[SEGMENTATION_FIELD_KEYS.fechaIngreso])
  );
}

export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Días completos entre dos fechas (b - a). Positivo si b es posterior. */
export function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

/** Día del camino en el que va el vendedor. El día de ingreso es el día 1. */
export function getDayInJourney(entryDate: Date, today: Date = new Date()): number {
  return daysBetween(entryDate, today) + 1;
}

/** Convierte un plazo (cantidad + unidad) a días. */
export function deadlineToDays(
  amount: number,
  unit: JourneyStage['deadlineUnit'] = 'días',
): number {
  if (unit === 'semanas') return amount * 7;
  if (unit === 'meses') return amount * 30;
  return amount;
}

// ─── Estado de plazos ─────────────────────────────────────────────────────────

export type ScheduleStatus =
  | 'completed'   // ya terminado (no importa el plazo)
  | 'overdue'     // pasó la fecha límite y sigue pendiente
  | 'due_soon'    // vence en los próximos 3 días
  | 'on_track'    // dentro de plazo
  | 'upcoming'    // el tramo todavía no empieza
  | 'no_deadline'; // sin plazo configurado

export interface ScheduleInfo {
  status: ScheduleStatus;
  /** Fecha límite calculada, si existe. */
  dueDate: Date | null;
  /** Días restantes hasta el vencimiento (negativo = días de retraso). */
  daysRemaining: number | null;
  /** Día del camino en que vence (ej. 30 para el hito de 30 días). */
  dueDayOffset: number | null;
}

const DUE_SOON_THRESHOLD_DAYS = 3;

const NO_DEADLINE: ScheduleInfo = {
  status: 'no_deadline',
  dueDate: null,
  daysRemaining: null,
  dueDayOffset: null,
};

function buildSchedule(
  entryDate: Date,
  dueDayOffset: number,
  completed: boolean,
  today: Date,
): ScheduleInfo {
  const dueDate = addDays(entryDate, dueDayOffset);
  const daysRemaining = daysBetween(today, dueDate);

  let status: ScheduleStatus;
  if (completed) status = 'completed';
  else if (daysRemaining < 0) status = 'overdue';
  else if (daysRemaining <= DUE_SOON_THRESHOLD_DAYS) status = 'due_soon';
  else status = 'on_track';

  return { status, dueDate, daysRemaining, dueDayOffset };
}

// ─── Hitos ────────────────────────────────────────────────────────────────────

export function sortMilestones(milestones: JourneyMilestone[]): JourneyMilestone[] {
  return [...milestones].sort((a, b) => a.order - b.order || a.dayOffset - b.dayOffset);
}

/** Día en que arranca un hito: el día siguiente al cierre del hito anterior. */
export function getMilestoneStartDay(
  milestones: JourneyMilestone[],
  milestoneId: string,
): number {
  const sorted = sortMilestones(milestones);
  const idx = sorted.findIndex(m => m.id === milestoneId);
  if (idx <= 0) return 1;
  return sorted[idx - 1].dayOffset + 1;
}

/** Hito en curso según los días transcurridos desde el ingreso. */
export function getCurrentMilestone(
  milestones: JourneyMilestone[],
  entryDate: Date | null,
  today: Date = new Date(),
): JourneyMilestone | null {
  const sorted = sortMilestones(milestones);
  if (sorted.length === 0) return null;
  if (!entryDate) return sorted[0];
  const day = getDayInJourney(entryDate, today);
  return sorted.find(m => day <= m.dayOffset) ?? sorted[sorted.length - 1];
}

export function getMilestoneSchedule(
  milestone: JourneyMilestone,
  entryDate: Date | null,
  completed: boolean,
  today: Date = new Date(),
): ScheduleInfo {
  if (!entryDate) return NO_DEADLINE;
  return buildSchedule(entryDate, milestone.dayOffset, completed, today);
}

// ─── Etapas ───────────────────────────────────────────────────────────────────

/**
 * Fecha límite de una etapa. El plazo propio de la etapa (`deadlineDays`)
 * tiene prioridad; si no lo tiene, hereda el vencimiento de su hito.
 */
export function getStageDueDayOffset(
  stage: JourneyStage,
  milestones: JourneyMilestone[] = [],
): number | null {
  if (stage.deadlineDays && stage.deadlineDays > 0) {
    return deadlineToDays(stage.deadlineDays, stage.deadlineUnit);
  }
  const milestone = milestones.find(m => m.id === stage.milestoneId);
  return milestone ? milestone.dayOffset : null;
}

export function getStageSchedule(
  stage: JourneyStage,
  entryDate: Date | null,
  milestones: JourneyMilestone[] = [],
  completed = false,
  today: Date = new Date(),
): ScheduleInfo {
  const dueDayOffset = getStageDueDayOffset(stage, milestones);
  if (!entryDate || dueDayOffset === null) return NO_DEADLINE;
  return buildSchedule(entryDate, dueDayOffset, completed, today);
}

// ─── Agrupación de etapas por hito ────────────────────────────────────────────

export interface MilestoneGroup {
  milestone: JourneyMilestone;
  stages: JourneyStage[];
  startDay: number;
}

/**
 * Agrupa las etapas visibles por hito, respetando el orden de los hitos.
 * Las etapas sin hito asignado quedan fuera de los grupos y se devuelven en
 * `unassigned` para que la UI las muestre al final.
 */
export function groupStagesByMilestone(
  stages: JourneyStage[],
  milestones: JourneyMilestone[],
): { groups: MilestoneGroup[]; unassigned: JourneyStage[] } {
  const sorted = sortMilestones(milestones);
  const assignedIds = new Set<string>();

  const groups = sorted.map(milestone => {
    const own = stages.filter(s => s.milestoneId === milestone.id);
    own.forEach(s => assignedIds.add(s.id));
    return {
      milestone,
      stages: own,
      startDay: getMilestoneStartDay(sorted, milestone.id),
    };
  });

  return {
    groups,
    unassigned: stages.filter(s => !assignedIds.has(s.id)),
  };
}

// ─── Formato ──────────────────────────────────────────────────────────────────

export function formatDate(date: Date): string {
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Texto humano del plazo restante: "vence hoy", "en 5 días", "3 días de retraso". */
export function formatDeadline(info: ScheduleInfo): string | null {
  if (info.daysRemaining === null) return null;
  const d = info.daysRemaining;
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  if (d > 1) return `Vencen en ${d} días`;
  if (d === -1) return '1 día de retraso';
  return `${Math.abs(d)} días de retraso`;
}

export const SCHEDULE_STATUS_STYLES: Record<ScheduleStatus, { label: string; className: string }> = {
  completed:   { label: 'Completado', className: 'bg-green-100 text-green-700 border-green-200' },
  overdue:     { label: 'Atrasado',   className: 'bg-red-100 text-red-700 border-red-200' },
  due_soon:    { label: 'Por vencer', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  on_track:    { label: 'A tiempo',   className: 'bg-sky-100 text-sky-700 border-sky-200' },
  upcoming:    { label: 'Próximo',    className: 'bg-muted text-muted-foreground border-muted' },
  no_deadline: { label: 'Sin plazo',  className: 'bg-muted text-muted-foreground border-muted' },
};

// ─── Resumen global de la ruta ────────────────────────────────────────────────

export interface JourneyScheduleSummary {
  entryDate: Date | null;
  /** Día del camino (1 = día de ingreso). null si no hay fecha de ingreso. */
  currentDay: number | null;
  milestones: JourneyMilestone[];
  currentMilestone: JourneyMilestone | null;
  /** Etapas vencidas y aún pendientes. */
  overdueStageIds: string[];
  /** Duración total del plan en días (el hito más lejano). */
  totalDays: number | null;
}

export function buildJourneySummary(
  journey: Pick<Journey, 'milestones' | 'anchorToEntryDate'>,
  stages: JourneyStage[],
  entryDate: Date | null,
  isStageComplete: (stage: JourneyStage) => boolean,
  today: Date = new Date(),
): JourneyScheduleSummary {
  const milestones = journey.anchorToEntryDate ? sortMilestones(journey.milestones ?? []) : [];
  const anchored = journey.anchorToEntryDate ? entryDate : null;

  const overdueStageIds = anchored
    ? stages
        .filter(s => getStageSchedule(s, anchored, milestones, isStageComplete(s), today).status === 'overdue')
        .map(s => s.id)
    : [];

  return {
    entryDate: anchored,
    currentDay: anchored ? getDayInJourney(anchored, today) : null,
    milestones,
    currentMilestone: getCurrentMilestone(milestones, anchored, today),
    overdueStageIds,
    totalDays: milestones.length > 0 ? milestones[milestones.length - 1].dayOffset : null,
  };
}
