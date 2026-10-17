/**
 * Puntaje y guardado de un desafío terminado.
 *
 * El quiz guarda el intento una sola vez, al terminar, y la pantalla de
 * resultados lo lee de Firestore. Antes los resultados se guardaban a partir de
 * la URL: recargar la página creaba otro intento (y gastaba el límite de
 * intentos) y editar la URL registraba cualquier puntaje.
 */

import { Timestamp } from 'firebase/firestore';
import {
  createQuizAttempt,
  getJourneyByProduct,
  markJourneyStepComplete,
  recordQuestionResults,
} from './firestore-service';
import type { GamificationConfig, QuizQuestionResult, UserProfile } from './types-scalable';

/** Se usa cuando el quiz no tiene gamificationConfig propio (quizzes legacy). */
export const DEFAULT_GAMIFICATION_CONFIG: GamificationConfig = {
  enableLives: true,
  maxLives: 3,
  enableBonusLives: true,
  pointsPerCorrectAnswer: 10,
  pointsPerTrickyQuestion: 20,
  penaltyPerError: 0,
  timeBonus: false,
  enableBadges: true,
  badgeIds: [],
};

/** XP según la gamificación del quiz (puntos por acierto, bonus por trampa, penalización). */
export function calcGamifiedXp(
  gc: GamificationConfig,
  score: number,
  totalQuestions: number,
  questionResults: Pick<QuizQuestionResult, 'isCorrect' | 'isTricky'>[],
): number {
  const incorrectCount = Math.max(0, totalQuestions - score);
  const trickyCorrect = questionResults.filter(r => r.isTricky && r.isCorrect).length;
  const normalCorrect = Math.max(0, score - trickyCorrect);
  return Math.max(0, Math.round(
    normalCorrect * gc.pointsPerCorrectAnswer +
    trickyCorrect * gc.pointsPerTrickyQuestion -
    incorrectCount * gc.penaltyPerError
  ));
}

export function getQuizLevel(score: number, total: number): { name: string; description: string } {
  const percentage = total > 0 ? (score / total) * 100 : 0;
  if (percentage >= 90) return { name: 'Maestro Aviva', description: '¡Dominas el conocimiento a la perfección!' };
  if (percentage >= 75) return { name: 'Promotor en Ascenso', description: '¡Excelente trabajo! Estás muy bien preparado.' };
  if (percentage >= 60) return { name: 'Aprendiz Prometedor', description: '¡Buen esfuerzo! Sigue repasando y serás un experto.' };
  return { name: 'Explorador Novato', description: 'Has completado el primer paso. ¡El conocimiento es tu próxima conquista!' };
}

/** Nombre y kiosko del vendedor tal como se guardan en el intento (para rankings). */
function sellerMeta(profile: UserProfile, displayName?: string | null) {
  const od = profile.onboardingData;
  const fromOnboarding = (re: RegExp) => od ? Object.entries(od).find(([k]) => re.test(k))?.[1] : undefined;
  return {
    trainerName: (fromOnboarding(/nombre|name|nombres/i) || profile.nombre || displayName || '').trim(),
    assignedKiosko: (fromOnboarding(/kiosk|kiosco|kiosko/i) || profile.assignedKiosko || '').trim(),
  };
}

/** Marca en la ruta del producto el paso del quiz terminado y los pasos de "resultados". */
async function markQuizJourneySteps(userId: string, productId: string, quizId: string, profile: UserProfile) {
  const journey = await getJourneyByProduct(productId).catch(() => null);
  if (!journey) return;
  const steps = journey.stages?.length ? journey.stages.flatMap(s => s.actions ?? []) : journey.steps ?? [];
  const meta = { userName: profile.nombre, userEmail: profile.email };
  await Promise.all(steps
    .filter(step => step.type === 'results'
      || ((step.type === 'quiz' || step.type === 'challenge') && step.config?.quizId === quizId))
    .map(step => markJourneyStepComplete(userId, journey.id, productId, step.id, meta).catch(console.error)));
}

export async function saveQuizCompletion(input: {
  userId: string;
  displayName?: string | null;
  profile: UserProfile;
  quizId: string;
  productId: string;
  gamification?: GamificationConfig | null;
  showFeedback: string;
  score: number;
  totalQuestions: number;
  bonusLives: number;
  startedAt: number | null;
  timeExpired: boolean;
  questionResults: QuizQuestionResult[];
}): Promise<string> {
  const { score, totalQuestions } = input;
  const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
  const finishedAt = Date.now();
  const gc = input.gamification ?? DEFAULT_GAMIFICATION_CONFIG;

  const attemptId = await createQuizAttempt({
    organizationId: 'aviva-credito',
    userId: input.userId,
    quizId: input.quizId,
    productId: input.productId,
    startedAt: Timestamp.fromMillis(input.startedAt ?? finishedAt),
    completedAt: Timestamp.fromMillis(finishedAt),
    status: 'completed',
    score,
    maxScore: totalQuestions,
    percentage,
    timeTaken: input.startedAt ? Math.round((finishedAt - input.startedAt) / 1000) : 0,
    livesRemaining: input.bonusLives,
    missionResults: [],
    answers: [],
    questionResults: input.questionResults,
    showFeedback: input.showFeedback,
    timeExpired: input.timeExpired,
    levelAchieved: getQuizLevel(score, totalQuestions).name,
    badgesEarned: [],
    xpEarned: calcGamifiedXp(gc, score, totalQuestions, input.questionResults),
    ...sellerMeta(input.profile, input.displayName),
  });

  await Promise.all([
    markQuizJourneySteps(input.userId, input.productId, input.quizId, input.profile),
    recordQuestionResults(input.questionResults
      .filter((r): r is QuizQuestionResult & { questionId: string } => !!r.questionId)
      .map(r => ({ questionId: r.questionId, isCorrect: r.isCorrect })))
      .catch(err => console.error('No se pudieron actualizar las estadísticas de preguntas:', err)),
  ]);
  return attemptId;
}
