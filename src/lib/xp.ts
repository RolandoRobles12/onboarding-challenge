import type { QuizAttempt } from '@/lib/types-scalable';

/**
 * XP total del vendedor. Los niveles (nombre, emoji y XP mínimo) se configuran
 * en Admin → Niveles XP y se calculan con getLevelFromConfig.
 */
export function calcXP(attempts: QuizAttempt[], badgeCount: number, completedCount: number): number {
  const bestPerQuiz: Record<string, number> = {};
  attempts.forEach(a => {
    const earned = a.xpEarned ?? Math.round(a.percentage * 2);
    if (!bestPerQuiz[a.quizId] || earned > bestPerQuiz[a.quizId]) bestPerQuiz[a.quizId] = earned;
  });
  return Object.values(bestPerQuiz).reduce((s, v) => s + v, 0) + badgeCount * 75 + completedCount * 25;
}
