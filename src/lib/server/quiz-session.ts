/**
 * Sesiones de desafío (solo servidor). Mientras el embajador juega, cada
 * respuesta se califica aquí y se guarda en quiz_sessions/{id}; al terminar,
 * el puntaje se calcula con esas respuestas y no con lo que diga el navegador.
 */

import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { ApiAuthError } from './auth';
import type { Quiz } from '@/lib/types-scalable';

export interface SessionAnswer {
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  missionIndex: number;
  isTricky: boolean;
  answeredAt: number;
}

export interface QuizSession {
  userId: string;
  quizId: string;
  productId: string;
  startedAt: number;
  timeLimit: number;
  showFeedback: 'always' | 'after_attempt' | 'never';
  /** Preguntas en el orden en que se juegan, con su misión. */
  questionOrder: { questionId: string; missionIndex: number; missionId: string }[];
  answers: Record<string, SessionAnswer>;
  status: 'active' | 'finished';
  /** Jugado desde Práctica: no entra al Salón de la Fama. */
  practice?: boolean;
  /** Ya empezó la primera misión (desde ahí corre el tiempo límite). */
  begun?: boolean;
  attemptId?: string;
}

/** Margen para la latencia de red al revisar el tiempo límite. */
export const TIME_GRACE_MS = 30_000;

export async function loadSession(sessionId: string, userId: string): Promise<{ snap: DocumentSnapshot; session: QuizSession }> {
  if (!sessionId || typeof sessionId !== 'string') throw new ApiAuthError('Falta la sesión del desafío.', 400);
  const snap = await adminDb().collection('quiz_sessions').doc(sessionId).get();
  const session = snap.data() as QuizSession | undefined;
  if (!snap.exists || !session || session.userId !== userId) throw new ApiAuthError('Sesión de desafío no encontrada.', 404);
  return { snap, session };
}

export function isTimeUp(session: Pick<QuizSession, 'startedAt' | 'timeLimit'>, now = Date.now()): boolean {
  return session.timeLimit > 0 && now > session.startedAt + session.timeLimit * 1000 + TIME_GRACE_MS;
}

export async function getQuizDoc(quizId: string): Promise<Quiz | null> {
  const snap = await adminDb().collection('quizzes').doc(quizId).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as Quiz) : null;
}
