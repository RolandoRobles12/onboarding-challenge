/**
 * Reglas de acceso y avance de un curso (puras: las usan el panel, las
 * pantallas del embajador y el servidor).
 */

import type { Course, CourseEnrollment, CourseModule, Lesson } from './types-lms';
import type { UserProfile } from './types-scalable';

const DAY_MS = 86_400_000;

type TimestampLike = { toMillis?: () => number; toDate?: () => Date } | Date | null | undefined;

export function toMillis(t: TimestampLike): number | null {
  if (!t) return null;
  if (t instanceof Date) return t.getTime();
  if (typeof t.toMillis === 'function') return t.toMillis();
  return null;
}

/** El curso va dirigido a este usuario (rol, producto y kiosko; vacío = todos). */
export function courseAudienceMatches(course: Course, profile: Pick<UserProfile, 'rol' | 'producto' | 'assignedKiosko'>): boolean {
  if (course.targetRoles?.length && !course.targetRoles.includes(profile.rol)) return false;
  if (course.productIds?.length && !(profile.producto && course.productIds.includes(profile.producto))) return false;
  if (course.branchIds?.length && !(profile.assignedKiosko && course.branchIds.includes(profile.assignedKiosko))) return false;
  return true;
}

/** Cursos previos que faltan por terminar. */
export function missingPrerequisites(course: Course, allCourses: Course[], enrollments: CourseEnrollment[]): Course[] {
  const done = new Set(enrollments.filter(e => e.status === 'completed').map(e => e.courseId));
  return (course.prerequisiteCourseIds ?? [])
    .filter(id => !done.has(id))
    .map(id => allCourses.find(c => c.id === id))
    .filter((c): c is Course => !!c);
}

/** El curso ya no acepta inscripciones nuevas. */
export function isCourseClosed(course: Course, now = Date.now()): boolean {
  const expires = toMillis(course.expiresAt as TimestampLike);
  return expires !== null && expires < now;
}

/** Fecha límite para terminarlo: inscripción + `durationDays`. */
export function courseDueDate(course: Course, enrollment: CourseEnrollment | null | undefined): Date | null {
  if (!enrollment || !course.durationDays || course.durationDays <= 0) return null;
  const start = toMillis(enrollment.assignedAt as TimestampLike) ?? toMillis(enrollment.enrolledAt as TimestampLike);
  return start === null ? null : new Date(start + course.durationDays * DAY_MS);
}

/** Lecciones que cuentan para completar: las obligatorias de módulos no opcionales. */
export function requiredLessons(course: Course): Lesson[] {
  return course.modules
    .filter(m => !m.isOptional)
    .flatMap(m => m.lessons.filter(l => l.isRequired !== false));
}

/** Quizzes de evaluación del curso (por lección y por módulo). */
export function assessmentQuizIds(course: Course): string[] {
  const ids = course.modules.flatMap(m => [m.assessmentQuizId, ...m.lessons.map(l => l.assessmentQuizId)]);
  return Array.from(new Set(ids.filter((id): id is string => !!id)));
}

/**
 * El curso se completa al terminar sus lecciones obligatorias y, si tiene
 * evaluaciones con puntaje mínimo, al alcanzarlo en alguna de ellas.
 */
export function isCourseComplete(course: Course, lessonIds: Set<string>, overallScore: number | undefined): boolean {
  const lessons = requiredLessons(course);
  const all = course.modules.flatMap(m => m.lessons);
  if (all.length === 0) return false;
  if (!(lessons.length > 0 ? lessons : all).every(l => lessonIds.has(l.id))) return false;
  const needsScore = assessmentQuizIds(course).length > 0 && !!course.passingScore && course.passingScore > 0;
  return !needsScore || (overallScore ?? 0) >= course.passingScore!;
}

/** Módulo disponible: sus módulos previos requeridos ya están completos. */
export function isModuleUnlocked(module: CourseModule, completedModuleIds: Set<string>): boolean {
  return (module.prerequisiteModuleIds ?? []).every(id => completedModuleIds.has(id));
}
