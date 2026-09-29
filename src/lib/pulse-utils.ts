/**
 * Utilidades compartidas del Pulso de Conocimiento.
 *
 * Todo lo relacionado con "qué día es hoy" y "a qué hora cierra" se calcula en
 * la zona horaria del equipo (no en la del dispositivo ni en la del servidor,
 * que en App Hosting corre en UTC). Así el vendedor, el panel de admin y el
 * proceso programado siempre coinciden en la fecha del pulso.
 *
 * Este módulo no depende de Firestore: se usa igual en cliente y servidor.
 */

import type { DailyPulse, KnowledgeModule, PulseAttempt, Question } from './types-scalable';

export const PULSE_TIMEZONE = 'America/Mexico_City';
export const DEFAULT_QUESTIONS_PER_PULSE = 7;
export const DEFAULT_CLOSE_AT = '12:00';
/** Porcentaje a partir del cual un pulso se considera aprobado. */
export const PULSE_PASS_PERCENTAGE = 70;
/** Días hacia atrás en los que una pregunta se considera "usada recientemente". */
export const RECENT_USE_WINDOW_DAYS = 10;

// ── Fecha y hora en la zona del equipo ─────────────────────────────────────

function partsInTz(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  };
}

/** Fecha del pulso (YYYY-MM-DD) para un instante dado, en la zona del equipo. */
export function pulseDateStr(now: Date = new Date(), tz: string = PULSE_TIMEZONE): string {
  const p = partsInTz(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutos transcurridos desde la medianoche en la zona del equipo. */
export function pulseMinutesNow(now: Date = new Date(), tz: string = PULSE_TIMEZONE): number {
  const p = partsInTz(now, tz);
  return p.hour * 60 + p.minute;
}

/** "14:30" → 870 */
export function hhmmToMinutes(hhmm: string | undefined, fallback = DEFAULT_CLOSE_AT): number {
  const [h, m] = (hhmm || fallback).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** "14:00" → "2:00 PM" */
export function formatHHMM(hhmm: string | undefined): string {
  const [h, m] = (hhmm || DEFAULT_CLOSE_AT).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${period}`;
}

export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/** "2026-09-29" → "martes 29 de septiembre" (o el formato que se pida). */
export function formatPulseDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('es-MX', options);
}

/** Minutos que faltan para el cierre de hoy (negativo si ya cerró). */
export function minutesUntilClose(closeAt: string | undefined, now: Date = new Date()): number {
  return hhmmToMinutes(closeAt) - pulseMinutesNow(now);
}

export function isPulseWindowOpen(closeAt: string | undefined, now: Date = new Date()): boolean {
  return minutesUntilClose(closeAt, now) > 0;
}

/** 83 → "1 h 23 min" · 12 → "12 min" */
export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ── Estado del pulso ───────────────────────────────────────────────────────

/**
 * Estado del pulso tal como lo viven vendedor y admin. Unifica el `status`
 * guardado con la fecha y la hora de cierre, para que ambos lados muestren
 * lo mismo aunque el proceso programado aún no haya actualizado el documento.
 *
 * - programado: día futuro, o pulso de hoy sin preguntas todavía.
 * - disponible: hoy, con preguntas y antes de la hora de cierre.
 * - cerrado:    día pasado, hora de cierre alcanzada o cerrado manualmente.
 */
export type PulsePhase = 'sin_pulso' | 'programado' | 'disponible' | 'cerrado';

export function getPulsePhase(
  pulse: Pick<DailyPulse, 'date' | 'status' | 'questionIds'> | null | undefined,
  closeAt: string | undefined,
  now: Date = new Date(),
): PulsePhase {
  if (!pulse) return 'sin_pulso';
  const today = pulseDateStr(now);
  if (pulse.status === 'closed' || pulse.date < today) return 'cerrado';
  if (pulse.date > today) return 'programado';
  if (!isPulseWindowOpen(closeAt, now)) return 'cerrado';
  if ((pulse.questionIds ?? []).length === 0) return 'programado';
  return 'disponible';
}

// ── Selección de preguntas ─────────────────────────────────────────────────

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Preguntas que recibe un vendedor a partir del pool del día.
 * Siempre devuelve como máximo `perPulse` preguntas: con "mismas preguntas
 * para todos" son las primeras del pool (en el orden elegido por el admin o
 * por la creación automática); si no, una selección aleatoria.
 */
export function selectQuestionsForUser(pool: string[], perPulse: number, sameForAll: boolean): string[] {
  const n = Math.max(1, perPulse || DEFAULT_QUESTIONS_PER_PULSE);
  return sameForAll ? pool.slice(0, n) : shuffle(pool).slice(0, n);
}

/**
 * Arma el pool automático del día:
 *  1. Solo preguntas del pulso (con módulo) y de los módulos activos.
 *  2. Dentro de cada módulo: primero las no usadas en los últimos días, luego
 *     las de menor tasa de aciertos (más refuerzo donde más se falla).
 *  3. Intercala módulos (round-robin) para que las primeras N queden
 *     distribuidas; el módulo inicial rota cada día.
 */
export function buildAutoPool(
  questions: Question[],
  options: {
    activeModules?: KnowledgeModule[];
    /** questionId → última fecha (YYYY-MM-DD) en que apareció en un pulso */
    lastUsed?: Record<string, string>;
    date: string;
  },
): string[] {
  const active = new Set(options.activeModules ?? []);
  const lastUsed = options.lastUsed ?? {};
  const recentCutoff = addDaysStr(options.date, -RECENT_USE_WINDOW_DAYS);

  const byModule = new Map<string, Question[]>();
  for (const q of questions) {
    if (!q.module || q.active === false) continue;
    if (active.size > 0 && !active.has(q.module)) continue;
    const list = byModule.get(q.module) ?? [];
    list.push(q);
    byModule.set(q.module, list);
  }

  const isRecent = (q: Question) => (lastUsed[q.id] ?? '') >= recentCutoff && (lastUsed[q.id] ?? '') < options.date;
  for (const list of byModule.values()) {
    list.sort((a, b) => {
      const ra = isRecent(a) ? 1 : 0;
      const rb = isRecent(b) ? 1 : 0;
      if (ra !== rb) return ra - rb;
      if (ra === 1) return (lastUsed[a.id] ?? '').localeCompare(lastUsed[b.id] ?? '');
      return (a.averageCorrectRate ?? 0) - (b.averageCorrectRate ?? 0);
    });
  }

  const modules = Array.from(byModule.keys()).sort();
  if (modules.length === 0) return [];
  const [y, m, d] = options.date.split('-').map(Number);
  const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const offset = dayIndex % modules.length;
  const rotated = [...modules.slice(offset), ...modules.slice(0, offset)];

  const result: string[] = [];
  let added = true;
  for (let round = 0; added; round++) {
    added = false;
    for (const mod of rotated) {
      const q = byModule.get(mod)![round];
      if (q) { result.push(q.id); added = true; }
    }
  }
  return result;
}

/** questionId → última fecha en que apareció en alguno de los pulsos dados. */
export function lastUsedByQuestion(pulses: Pick<DailyPulse, 'date' | 'questionIds'>[], perPulse: number): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of pulses) {
    // Solo cuentan las que realmente se mostraron (las primeras N del pool).
    for (const id of (p.questionIds ?? []).slice(0, Math.max(perPulse, 1))) {
      if (!map[id] || map[id] < p.date) map[id] = p.date;
    }
  }
  return map;
}

// ── Racha e historial del vendedor ─────────────────────────────────────────

/**
 * Racha de pulsos completados consecutivos. Solo cuentan los días en que hubo
 * pulso; el de hoy, si sigue abierto y aún no se responde, no rompe la racha.
 */
export function computePulseStreak(
  pulseDates: string[],
  attempts: Pick<PulseAttempt, 'date' | 'status'>[],
  today: string,
  todayOpen: boolean,
): { current: number; best: number } {
  const completed = new Set(attempts.filter(a => a.status === 'completed').map(a => a.date));
  const dates = Array.from(new Set(pulseDates)).filter(d => d <= today).sort().reverse();

  let current = 0;
  let counting = true;
  let best = 0;
  let run = 0;
  for (const date of dates) {
    const done = completed.has(date);
    if (date === today && !done && todayOpen) continue;
    if (done) {
      run++;
      if (counting) current++;
    } else {
      counting = false;
      best = Math.max(best, run);
      run = 0;
    }
  }
  best = Math.max(best, run, current);
  return { current, best };
}

// ── Slack ──────────────────────────────────────────────────────────────────

export const DEFAULT_SLACK_TEMPLATE =
  '📡 *Pulso de Conocimiento* — {date}\n\nResponde tus {preguntas} preguntas antes de las {cierre}. ¡Te toma menos de 5 minutos!';

/** Sustituye {date}, {preguntas} y {cierre} en la plantilla del mensaje. */
export function applySlackTemplate(
  template: string | undefined,
  vars: { date: string; preguntas: number; cierre: string },
): string {
  return (template?.trim() || DEFAULT_SLACK_TEMPLATE)
    .replace(/\{date\}/g, vars.date)
    .replace(/\{preguntas\}/g, String(vars.preguntas))
    .replace(/\{cierre\}/g, vars.cierre)
    .replace(/\{link\}/g, '')
    .trim();
}
