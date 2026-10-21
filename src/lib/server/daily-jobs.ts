/**
 * Revisión diaria (la corre /api/pulse/cron una vez al día): avisos de plazos
 * por vencer, re-certificación de cursos e inactividad. Cada aviso se manda
 * una sola vez gracias al dedupeKey de notification_log.
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { getNotificationConfig, notifyUser } from './notifications';
import { getJourneyForProduct } from './progress';
import { expireCourseCertificate } from './certificates';
import { journeyStages } from '@/lib/journey-progress';
import { getEntryDate, getStageSchedule } from '@/lib/journey-schedule';
import { addDaysStr } from '@/lib/pulse-utils';
import type { Course, CourseEnrollment, RecurrenceType } from '@/lib/types-lms';
import type { Journey, UserJourneyProgress, UserProfile } from '@/lib/types-scalable';

const DAY_MS = 86_400_000;

const RECURRENCE_DAYS: Record<RecurrenceType, number> = {
  none: 0, monthly: 30, quarterly: 90, biannual: 182, annual: 365,
};

/** Días que dura una certificación del curso antes de renovarse (0 = no se renueva). */
export function recertificationDays(course: Pick<Course, 'recertification'>): number {
  const r = course.recertification;
  if (!r?.enabled) return 0;
  return r.intervalDays && r.intervalDays > 0 ? r.intervalDays : RECURRENCE_DAYS[r.recurrenceType] ?? 0;
}

/** "YYYY-MM-DD" → fecha local a medianoche (mismo criterio que journey-schedule). */
function dateFromStr(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const millis = (t: unknown): number | null =>
  t && typeof (t as Timestamp).toMillis === 'function' ? (t as Timestamp).toMillis() : null;

const dayDiff = (fromMs: number, toMs: number) => Math.floor((toMs - fromMs) / DAY_MS);

export async function runDailyNotifications(today: string): Promise<string[]> {
  const config = await getNotificationConfig();
  const db = adminDb();
  const actions: string[] = [];
  const todayDate = dateFromStr(today);
  const nowMs = todayDate.getTime() + DAY_MS / 2; // mediodía de hoy: evita bordes de zona horaria

  const usersSnap = await db.collection('users').get();
  const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }) as UserProfile).filter(u => u.active !== false);
  const sellers = users.filter(u => u.rol === 'seller');
  const userById = new Map(users.map(u => [u.uid, u]));

  // Rutas por producto y progreso de cada vendedor (se usan en dos revisiones).
  const journeys = new Map<string, Journey | null>();
  for (const product of new Set(sellers.map(s => s.producto).filter((p): p is string => !!p))) {
    journeys.set(product, await getJourneyForProduct(product));
  }
  const progressSnap = await db.collection('journey_progress').get();
  const progressByKey = new Map(progressSnap.docs.map(d => [d.id, d.data() as UserJourneyProgress]));
  const completedFor = (uid: string, journeyId: string) => new Set(progressByKey.get(`${uid}_${journeyId}`)?.completedStepIds ?? []);

  // ── Etapas de la ruta por vencer ──
  if (config.rules.stage_due_warning.enabled) {
    const windowDays = config.rules.stage_due_warning.days ?? 2;
    let sent = 0;
    for (const user of sellers) {
      const journey = user.producto ? journeys.get(user.producto) : null;
      const entry = getEntryDate(user);
      if (!journey || !entry) continue;
      const done = completedFor(user.uid, journey.id);
      for (const stage of journeyStages(journey).filter(s => s.visible !== false)) {
        const stageDone = stage.actions.length === 0 || stage.actions.filter(a => a.required).every(a => done.has(a.id));
        const schedule = getStageSchedule(stage, entry, journey.milestones ?? [], stageDone, todayDate);
        if (stageDone || schedule.daysRemaining === null || schedule.daysRemaining < 0 || schedule.daysRemaining > windowDays) continue;
        const when = schedule.daysRemaining === 0 ? 'hoy' : schedule.daysRemaining === 1 ? 'mañana' : `en ${schedule.daysRemaining} días`;
        const ok = await notifyUser({
          type: 'stage_due_warning', user, config,
          message: { title: '⏰ Una etapa de tu ruta vence pronto', body: `«${stage.title}» vence ${when}. ¡Termínala a tiempo!`, path: '/' },
          dedupeKey: `stage_due_${user.uid}_${journey.id}_${stage.id}`,
        });
        if (ok) sent++;
      }
    }
    if (sent) actions.push(`${sent} aviso(s) de etapa por vencer`);
  }

  // ── Cursos: fecha límite y re-certificación ──
  const coursesSnap = await db.collection('courses').get();
  const courses = new Map(coursesSnap.docs.map(d => [d.id, { id: d.id, ...d.data() } as Course]));
  const enrollmentsSnap = await db.collection('enrollments').get();
  let dueSent = 0;
  let recertSent = 0;
  let reassigned = 0;
  for (const doc of enrollmentsSnap.docs) {
    const enrollment = { id: doc.id, ...doc.data() } as CourseEnrollment;
    const course = courses.get(enrollment.courseId);
    const user = userById.get(enrollment.userId);
    if (!course || !user) continue;

    if (enrollment.status !== 'completed' && enrollment.status !== 'expired' && course.durationDays && course.durationDays > 0) {
      const start = millis(enrollment.assignedAt) ?? millis(enrollment.enrolledAt);
      const left = start !== null ? course.durationDays - dayDiff(start, nowMs) : null;
      const windowDays = config.rules.course_due_warning.days ?? 3;
      if (left !== null && left >= 0 && left <= windowDays && config.rules.course_due_warning.enabled) {
        const when = left === 0 ? 'hoy' : left === 1 ? 'mañana' : `en ${left} días`;
        const ok = await notifyUser({
          type: 'course_due_warning', user, config,
          message: { title: '⏳ Tu curso está por vencer', body: `El plazo para terminar «${course.title}» vence ${when}.`, path: `/courses/${course.id}` },
          dedupeKey: `course_due_${enrollment.id}`,
        });
        if (ok) dueSent++;
      }
    }

    const cycle = recertificationDays(course);
    const completedAt = millis(enrollment.completedAt);
    if (enrollment.status === 'completed' && cycle > 0 && completedAt !== null) {
      const left = cycle - dayDiff(completedAt, nowMs);
      const notifyWindow = course.recertification.notifyDaysBefore > 0
        ? course.recertification.notifyDaysBefore
        : config.rules.recertification_due.days ?? 14;
      if (left > 0 && left <= notifyWindow) {
        const ok = await notifyUser({
          type: 'recertification_due', user, config,
          message: { title: '🔁 Renueva tu certificación', body: `Tu curso «${course.title}» vence en ${left} día${left !== 1 ? 's' : ''}. Repásalo para renovarlo.`, path: `/courses/${course.id}` },
          dedupeKey: `recert_due_${enrollment.id}_${completedAt}`,
        });
        if (ok) recertSent++;
      } else if (left <= 0) {
        // Venció: se marca como vencido y, si el curso lo pide, se vuelve a asignar desde cero.
        if (course.recertification.autoReassign) {
          await doc.ref.update({
            status: 'enrolled',
            completedLessonIds: [],
            completedModuleIds: [],
            overallScore: FieldValue.delete(),
            completedAt: FieldValue.delete(),
            assignedAt: FieldValue.serverTimestamp(),
            enrolledAt: FieldValue.serverTimestamp(),
            renewalDueAt: FieldValue.delete(),
            // El certificado renovado tendrá su propia fecha de emisión.
            certificateIssuedAt: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          await expireCourseCertificate(user.uid, course.id);
          await notifyUser({
            type: 'recertification_due', user, config,
            message: { title: '🔁 Toca renovar tu curso', body: `Tu certificación de «${course.title}» venció y se te volvió a asignar.`, path: `/courses/${course.id}` },
            dedupeKey: `recert_reassigned_${enrollment.id}_${completedAt}`,
          });
          reassigned++;
        } else {
          await doc.ref.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() });
          await expireCourseCertificate(user.uid, course.id);
        }
      }
    }
  }
  if (dueSent) actions.push(`${dueSent} aviso(s) de curso por vencer`);
  if (recertSent) actions.push(`${recertSent} aviso(s) de re-certificación`);
  if (reassigned) actions.push(`${reassigned} curso(s) reasignados por re-certificación`);

  // ── Inactividad ──
  const inactivity = config.rules.inactivity_reminder;
  if (inactivity.enabled) {
    const days = Math.max(1, inactivity.days ?? 3);
    const cutoff = Timestamp.fromMillis(nowMs - days * DAY_MS);
    const cutoffDate = addDaysStr(today, -days);
    const active = new Set<string>();
    const collect = async (collection: string, field: string, value: unknown, userField = 'userId') => {
      const snap = await db.collection(collection).where(field, '>=', value).get();
      for (const d of snap.docs) {
        const uid = d.data()[userField];
        if (uid) active.add(uid);
      }
    };
    await Promise.all([
      collect('journey_progress', 'updatedAt', cutoff),
      collect('attempts', 'completedAt', cutoff),
      collect('pulse_attempts', 'date', cutoffDate),
      collect('enrollments', 'updatedAt', cutoff),
      collect('lesson_progress', 'updatedAt', cutoff),
      collect('video_views', 'lastWatchedAt', cutoff),
      collect('sim_attempts', 'updatedAt', cutoff),
    ]);
    const bucket = Math.floor(todayDate.getTime() / DAY_MS / days);
    let sent = 0;
    for (const user of sellers) {
      if (active.has(user.uid)) continue;
      const created = millis(user.createdAt);
      if (created !== null && created > cutoff.toMillis()) continue; // recién llegado
      const journey = user.producto ? journeys.get(user.producto) : null;
      if (!journey) continue;
      const done = completedFor(user.uid, journey.id);
      const pending = journeyStages(journey).filter(s => s.visible !== false)
        .flatMap(s => s.actions.filter(a => a.required && !done.has(a.id)));
      if (pending.length === 0) continue; // ruta terminada
      const ok = await notifyUser({
        type: 'inactivity_reminder', user, config,
        message: {
          title: '👋 ¡Te extrañamos!',
          body: `Llevas ${days} días sin avanzar en tu ruta. Te faltan ${pending.length} paso${pending.length !== 1 ? 's' : ''}: ¡sigue con el siguiente!`,
          path: '/',
        },
        dedupeKey: `inactivity_${user.uid}_${bucket}`,
      });
      if (ok) sent++;
    }
    if (sent) actions.push(`${sent} recordatorio(s) de inactividad`);
  }

  return actions;
}
