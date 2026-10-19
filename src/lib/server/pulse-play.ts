/**
 * El Pulso del embajador, del lado del servidor: arma su intento, califica
 * cada respuesta y lo cierra. Las preguntas viajan al navegador sin la
 * respuesta correcta; se revela después de contestar.
 */

import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { ApiAuthError } from './auth';
import { getDailyPulse, getDailyPulses, getPulseConfig, DEFAULT_ORG_ID } from './pulse-store';
import { gradeAnswer, loadQuestions, recordQuestionStats, toPlayQuestion } from './grading';
import { awardBadgesFor } from './badges';
import {
  addDaysStr,
  computePulseStreak,
  DEFAULT_QUESTIONS_PER_PULSE,
  getPulsePhase,
  minutesUntilClose,
  pulseDateStr,
  selectQuestionsForUser,
} from '@/lib/pulse-utils';
import type { DailyPulse, KnowledgeModule, PulseAnswer, PulseAttempt, Question, UserProfile } from '@/lib/types-scalable';
import { SEGMENTATION_FIELD_KEYS } from '@/lib/types-scalable';
import type { AnswerReveal, PlayQuestion } from '@/lib/play-types';

/** Minutos después del cierre en que todavía se aceptan respuestas de un pulso ya empezado. */
export const PULSE_CLOSE_GRACE_MINUTES = 15;

export interface PulsePlayState {
  date: string;
  attempt: PulseAttempt | null;
  questions: PlayQuestion[];
  /** Respuesta correcta de las preguntas ya contestadas. */
  reveals: Record<string, AnswerReveal>;
}

const attemptRef = (userId: string, date: string) =>
  adminDb().collection('pulse_attempts').doc(`${userId}_${date}`) as DocumentReference;

function revealOf(q: Question): AnswerReveal {
  const { isCorrect: _c, userAnswer: _u, ...reveal } = gradeAnswer(q, { optionIds: [] });
  return reveal;
}

function attemptQuestionIds(attempt: PulseAttempt, pulse: DailyPulse | null): string[] {
  if (attempt.questionIds?.length) return attempt.questionIds;
  return (pulse?.questionIds ?? []).slice(0, attempt.totalQuestions || DEFAULT_QUESTIONS_PER_PULSE);
}

async function buildState(attempt: PulseAttempt | null, pulse: DailyPulse | null, date: string, shuffle: boolean): Promise<PulsePlayState> {
  if (!attempt) return { date, attempt: null, questions: [], reveals: {} };
  const questions = await loadQuestions(attemptQuestionIds(attempt, pulse));
  const answered = new Set((attempt.answers ?? []).map(a => a.questionId));
  const reveals: Record<string, AnswerReveal> = {};
  for (const q of questions) if (answered.has(q.id)) reveals[q.id] = revealOf(q);
  return {
    date,
    attempt,
    questions: questions.map(q => toPlayQuestion(q, { shuffleOptions: shuffle })),
    reveals,
  };
}

/** Estado del pulso de hoy para el embajador (intento, preguntas y lo ya revelado). */
export async function getTodayState(userId: string): Promise<PulsePlayState> {
  const date = pulseDateStr();
  const [pulse, cfg, snap] = await Promise.all([getDailyPulse(date), getPulseConfig(), attemptRef(userId, date).get()]);
  const attempt = snap.exists ? ({ id: snap.id, ...snap.data() } as PulseAttempt) : null;
  return buildState(attempt, pulse, date, cfg.randomizeAnswerOrder);
}

/** Empieza el pulso de hoy (o devuelve el que ya existe: nunca se reinicia). */
export async function startTodayAttempt(profile: UserProfile): Promise<PulsePlayState> {
  const date = pulseDateStr();
  const [pulse, cfg] = await Promise.all([getDailyPulse(date), getPulseConfig()]);
  const ref = attemptRef(profile.uid, date);
  const existing = await ref.get();
  if (existing.exists) {
    return buildState({ id: existing.id, ...existing.data() } as PulseAttempt, pulse, date, cfg.randomizeAnswerOrder);
  }
  if (getPulsePhase(pulse, cfg.closeAt) !== 'disponible' || !pulse) {
    throw new ApiAuthError('El pulso de hoy no está disponible.', 409);
  }

  // Candidatas de sobra por si alguna pregunta del pool se borró o desactivó.
  const perPulse = cfg.questionsPerPulse || DEFAULT_QUESTIONS_PER_PULSE;
  const candidates = selectQuestionsForUser(pulse.questionIds ?? [], perPulse * 2, cfg.sameQuestionsForAll ?? true);
  const assigned = (await loadQuestions(candidates))
    .filter(q => q.active !== false && (q.options?.length ?? 0) > 0)
    .slice(0, perPulse);
  if (assigned.length === 0) throw new ApiAuthError('Las preguntas de hoy no están disponibles. Avísale a tu líder.', 409);

  const od = profile.onboardingData ?? {};
  const attempt: Omit<PulseAttempt, 'id' | 'startedAt'> = {
    userId: profile.uid,
    userName: profile.nombre,
    pulseId: `${DEFAULT_ORG_ID}_${date}`,
    date,
    organizationId: DEFAULT_ORG_ID,
    vertical: od[SEGMENTATION_FIELD_KEYS.vertical],
    hub: od[SEGMENTATION_FIELD_KEYS.hub],
    estado: od[SEGMENTATION_FIELD_KEYS.estado],
    cosecha: od[SEGMENTATION_FIELD_KEYS.fechaIngreso],
    questionIds: assigned.map(q => q.id),
    answers: [],
    totalQuestions: assigned.length,
    correctAnswers: 0,
    percentage: 0,
    status: 'in_progress',
  };
  try {
    await ref.create({ ...attempt, startedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    if ((err as { code?: number }).code !== 6) throw err; // otra pestaña lo creó primero
  }
  const snap = await ref.get();
  return buildState({ id: snap.id, ...snap.data() } as PulseAttempt, pulse, date, cfg.randomizeAnswerOrder);
}

/** Califica y guarda una respuesta. La primera respuesta de cada pregunta es la que cuenta. */
export async function answerToday(
  userId: string,
  questionId: string,
  optionId: string,
  timeSpent: number,
): Promise<{ answers: PulseAnswer[]; isCorrect: boolean; reveal: AnswerReveal }> {
  const date = pulseDateStr();
  const [pulse, cfg] = await Promise.all([getDailyPulse(date), getPulseConfig()]);
  if (!pulse || pulse.status === 'closed' || minutesUntilClose(cfg.closeAt) <= -PULSE_CLOSE_GRACE_MINUTES) {
    throw new ApiAuthError('La ventana del pulso de hoy ya cerró.', 409);
  }
  const ref = attemptRef(userId, date);
  const [question] = await loadQuestions([questionId]);
  if (!question) throw new ApiAuthError('La pregunta ya no existe.', 404);
  const graded = gradeAnswer(question, { optionIds: [optionId] });

  const answers = await adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiAuthError('No existe un intento para este pulso.', 404);
    const data = snap.data() as PulseAttempt;
    if (data.status !== 'in_progress') throw new ApiAuthError('Este pulso ya no acepta respuestas.', 409);
    if (!attemptQuestionIds(data, pulse).includes(questionId)) throw new ApiAuthError('La pregunta no es de tu pulso.', 400);
    const current = data.answers ?? [];
    if (current.some(a => a.questionId === questionId)) return current;
    const next: PulseAnswer[] = [...current, {
      questionId,
      selectedOptionIds: [optionId],
      isCorrect: graded.isCorrect,
      timeSpent: Math.max(0, Math.min(Math.round(Number(timeSpent) || 0), 3600)),
    }];
    tx.update(ref, { answers: next, correctAnswers: next.filter(a => a.isCorrect).length, lastAnswerAt: FieldValue.serverTimestamp() });
    return next;
  });
  const saved = answers.find(a => a.questionId === questionId)!;
  const { isCorrect: _c, userAnswer: _u, ...reveal } = graded;
  return { answers, isCorrect: saved.isCorrect, reveal };
}

/**
 * Cierra el intento de hoy: calcula el puntaje con las respuestas guardadas,
 * suma la respuesta al pulso, actualiza estadísticas, manda las falladas al
 * repaso y entrega insignias de racha. Es idempotente.
 */
export async function submitToday(profile: UserProfile): Promise<PulseAttempt> {
  const date = pulseDateStr();
  const ref = attemptRef(profile.uid, date);
  const pulseDoc = adminDb().collection('daily_pulses').doc(`${DEFAULT_ORG_ID}_${date}`);

  const result = await adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiAuthError('No existe un intento para este pulso.', 404);
    const data = { id: snap.id, ...snap.data() } as PulseAttempt;
    if (data.status !== 'in_progress') return { attempt: data, justCompleted: false };
    const answers = data.answers ?? [];
    const total = data.questionIds?.length || data.totalQuestions || answers.length;
    const correctAnswers = answers.filter(a => a.isCorrect).length;
    const percentage = total > 0 ? Math.round((correctAnswers / total) * 100) : 0;
    const patch = { totalQuestions: total, correctAnswers, percentage, status: 'completed' as const };
    tx.update(ref, { ...patch, completedAt: FieldValue.serverTimestamp() });
    tx.update(pulseDoc, { totalResponses: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    return { attempt: { ...data, ...patch }, justCompleted: true };
  });
  if (!result.justCompleted) return result.attempt;

  const answers = result.attempt.answers ?? [];
  await Promise.all([
    recordQuestionStats(answers.map(a => ({ questionId: a.questionId, isCorrect: a.isCorrect })))
      .catch(err => console.error('[pulse] estadísticas:', err)),
    addToBacklog(profile.uid, answers.filter(a => !a.isCorrect).map(a => a.questionId), date)
      .catch(err => console.error('[pulse] repaso:', err)),
    awardStreakBadges(profile, date).catch(err => console.error('[pulse] insignias:', err)),
  ]);
  return result.attempt;
}

async function addToBacklog(userId: string, questionIds: string[], pulseDate: string): Promise<void> {
  if (questionIds.length === 0) return;
  const db = adminDb();
  const pending = await db.collection('pulse_backlogs').where('userId', '==', userId).get();
  const already = new Set(pending.docs.filter(d => d.data().status === 'pending').map(d => d.data().questionId));
  const questions = (await loadQuestions(questionIds)).filter(q => !already.has(q.id));
  if (questions.length === 0) return;
  const batch = db.batch();
  for (const q of questions) {
    batch.set(db.collection('pulse_backlogs').doc(), {
      userId,
      organizationId: DEFAULT_ORG_ID,
      questionId: q.id,
      questionText: q.text,
      module: (q.module ?? 'herramientas') as KnowledgeModule,
      addedAt: FieldValue.serverTimestamp(),
      pulseDate,
      status: 'pending',
      reviewAttempts: 0,
    });
  }
  await batch.commit();
}

async function awardStreakBadges(profile: UserProfile, today: string): Promise<void> {
  const db = adminDb();
  const [pulses, attemptsSnap] = await Promise.all([
    getDailyPulses(addDaysStr(today, -120), today),
    db.collection('pulse_attempts').where('userId', '==', profile.uid).get(),
  ]);
  const attempts = attemptsSnap.docs.map(d => d.data() as PulseAttempt);
  const { current } = computePulseStreak(
    pulses.filter(p => (p.questionIds ?? []).length > 0).map(p => p.date),
    attempts,
    today,
    false,
  );
  if (current > 0) await awardBadgesFor(profile, { type: 'pulse_streak', days: current });
}

/** Pregunta del repaso (sin respuesta) o, con optionId, su calificación. */
export async function reviewBacklogItem(
  userId: string,
  itemId: string,
  optionId?: string,
): Promise<{ question: PlayQuestion | null; result?: { isCorrect: boolean; reveal: AnswerReveal } }> {
  const db = adminDb();
  const ref = db.collection('pulse_backlogs').doc(itemId);
  const snap = await ref.get();
  const item = snap.data();
  if (!snap.exists || !item || item.userId !== userId) throw new ApiAuthError('Ese repaso no existe.', 404);
  const [question] = await loadQuestions([item.questionId]);
  if (!question) return { question: null };
  const cfg = await getPulseConfig();
  if (!optionId) return { question: toPlayQuestion(question, { shuffleOptions: cfg.randomizeAnswerOrder }) };
  if (item.status !== 'pending') throw new ApiAuthError('Esta pregunta ya salió de tu repaso.', 409);
  // Tras fallar se muestra la solución: el siguiente intento queda para mañana.
  const last = item.lastReviewedAt as { toDate?: () => Date } | undefined;
  if (last?.toDate && pulseDateStr(last.toDate()) === pulseDateStr()) {
    throw new ApiAuthError('Ya repasaste esta pregunta hoy: inténtalo de nuevo mañana.', 409);
  }

  const graded = gradeAnswer(question, { optionIds: [optionId] });
  await ref.update({
    reviewAttempts: FieldValue.increment(1),
    lastReviewedAt: FieldValue.serverTimestamp(),
    ...(graded.isCorrect ? { status: 'resolved', resolvedAt: FieldValue.serverTimestamp() } : {}),
  });
  const { isCorrect, userAnswer: _u, ...reveal } = graded;
  return { question: null, result: { isCorrect, reveal } };
}
