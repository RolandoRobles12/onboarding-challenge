import type { QuizAttempt } from '@/lib/types-scalable';

export const LEVELS = [
  { min: 0,    max: 249,      level: 1, title: 'Explorador',    emoji: '🌱' },
  { min: 250,  max: 599,      level: 2, title: 'Aprendiz',      emoji: '📚' },
  { min: 600,  max: 1199,     level: 3, title: 'Promotor',      emoji: '⚡' },
  { min: 1200, max: 2399,     level: 4, title: 'Asesor Senior', emoji: '🎯' },
  { min: 2400, max: Infinity, level: 5, title: 'Maestro Aviva', emoji: '🏆' },
];

export function getLevelInfo(xp: number) {
  const lvl = LEVELS.find(l => xp >= l.min && xp <= l.max) ?? LEVELS[LEVELS.length - 1];
  const next = LEVELS.find(l => l.level === lvl.level + 1);
  const pctToNext = next ? Math.round(((xp - lvl.min) / (next.min - lvl.min)) * 100) : 100;
  const xpToNext = next ? next.min - xp : 0;
  return { ...lvl, xp, pctToNext, xpToNext };
}

export function calcXP(attempts: QuizAttempt[], badgeCount: number, completedCount: number): number {
  const bestPerQuiz: Record<string, number> = {};
  attempts.forEach(a => {
    const earned = a.xpEarned ?? Math.round(a.percentage * 2);
    if (!bestPerQuiz[a.quizId] || earned > bestPerQuiz[a.quizId]) bestPerQuiz[a.quizId] = earned;
  });
  return Object.values(bestPerQuiz).reduce((s, v) => s + v, 0) + badgeCount * 75 + completedCount * 25;
}
