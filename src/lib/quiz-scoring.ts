/** Puntaje de un desafío (puro: lo usan el servidor y la pantalla de resultados). */

import type { GamificationConfig, QuizQuestionResult } from './types-scalable';

/** Se usa cuando el quiz no tiene gamificationConfig propio (quizzes legacy). */
export const DEFAULT_GAMIFICATION_CONFIG: GamificationConfig = {
  enableLives: true,
  maxLives: 3,
  enableBonusLives: true,
  pointsPerCorrectAnswer: 10,
  pointsPerTrickyQuestion: 20,
  penaltyPerError: 0,
  timeBonus: false,
  enableBadges: false,
  badgeIds: [],
};

/** XP base: puntos por acierto, bonus por pregunta trampa y penalización por error. */
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

/**
 * Bonus por rapidez (si el quiz tiene tiempo límite y "bonus por tiempo"):
 * hasta la mitad de los puntos de los aciertos, proporcional al tiempo que sobró.
 */
export function calcTimeBonus(gc: GamificationConfig, score: number, timeLimit: number, secondsTaken: number): number {
  if (!gc.timeBonus || timeLimit <= 0 || secondsTaken >= timeLimit) return 0;
  const remaining = (timeLimit - secondsTaken) / timeLimit;
  return Math.round(score * gc.pointsPerCorrectAnswer * 0.5 * remaining);
}

export function getQuizLevel(score: number, total: number): { name: string; description: string } {
  const percentage = total > 0 ? (score / total) * 100 : 0;
  if (percentage >= 90) return { name: 'Maestro Aviva', description: '¡Dominas el conocimiento a la perfección!' };
  if (percentage >= 75) return { name: 'Promotor en Ascenso', description: '¡Excelente trabajo! Estás muy bien preparado.' };
  if (percentage >= 60) return { name: 'Aprendiz Prometedor', description: '¡Buen esfuerzo! Sigue repasando y serás un experto.' };
  return { name: 'Explorador Novato', description: 'Has completado el primer paso. ¡El conocimiento es tu próxima conquista!' };
}
