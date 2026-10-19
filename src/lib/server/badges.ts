/**
 * Entrega automática de insignias (solo servidor). Las reglas de Firestore no
 * dejan que un vendedor se otorgue insignias: lo hace el servidor cuando
 * verifica el logro (desafío aprobado, curso terminado, racha del pulso…).
 */

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { notifyUser } from './notifications';
import type { Badge, BadgeCriteria, UserProfile } from '@/lib/types-scalable';

const ORG_ID = 'aviva-credito';

/** Logro que puede desbloquear insignias. */
export type Achievement =
  | { type: 'quiz_completed'; quizId: string; passed: boolean; percentage: number }
  | { type: 'course_completed'; courseId: string }
  | { type: 'journey_completed'; journeyId: string }
  | { type: 'pulse_streak'; days: number }
  | { type: 'simulation_passed'; simModuleId: string };

function matches(criteria: BadgeCriteria | undefined, a: Achievement): boolean {
  if (!criteria) return false;
  switch (criteria.type) {
    case 'quiz_passed':
      return a.type === 'quiz_completed' && a.passed && a.quizId === criteria.quizId;
    case 'quiz_perfect':
      return a.type === 'quiz_completed' && a.percentage >= 100 && (!criteria.quizId || a.quizId === criteria.quizId);
    case 'course_completed':
      return a.type === 'course_completed' && a.courseId === criteria.courseId;
    case 'journey_completed':
      return a.type === 'journey_completed' && (!criteria.journeyId || a.journeyId === criteria.journeyId);
    case 'pulse_streak':
      return a.type === 'pulse_streak' && criteria.days > 0 && a.days >= criteria.days;
    case 'simulation_passed':
      return a.type === 'simulation_passed' && a.simModuleId === criteria.simModuleId;
    default:
      return false;
  }
}

/** Otorga una insignia una sola vez (id determinista). Devuelve true si la entregó. */
export async function grantBadge(
  user: Pick<UserProfile, 'uid' | 'nombre' | 'slackId' | 'active'>,
  badge: Badge,
  opts: { awardedBy: string; reason?: string },
): Promise<boolean> {
  const db = adminDb();
  // Las otorgadas a mano antes usaban ids aleatorios: se revisan también.
  const previous = await db.collection('user_badges')
    .where('userId', '==', user.uid).where('badgeId', '==', badge.id).limit(1).get();
  if (!previous.empty) return false;
  try {
    await db.collection('user_badges').doc(`${user.uid}_${badge.id}`).create({
      userId: user.uid,
      badgeId: badge.id,
      badgeName: badge.name,
      badgeEmoji: badge.emoji,
      badgeColor: badge.color,
      badgeDescription: badge.description,
      earnedAt: FieldValue.serverTimestamp(),
      awardedBy: opts.awardedBy,
      reason: opts.reason ?? null,
      journeyStepId: null,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 6) return false;
    throw err;
  }
  await notifyBadge(user, badge.id, badge.name, badge.emoji);
  return true;
}

export async function notifyBadge(
  user: Pick<UserProfile, 'uid' | 'nombre' | 'slackId' | 'active'>,
  badgeId: string,
  name: string,
  emoji: string,
): Promise<void> {
  await notifyUser({
    type: 'badge_earned',
    user,
    message: { title: `${emoji} ¡Ganaste una insignia!`, body: `Obtuviste la insignia «${name}».`, path: '/perfil' },
    dedupeKey: `badge_${user.uid}_${badgeId}`,
  }).catch(err => console.error('[badges] aviso:', err));
}

/** Revisa las insignias automáticas activas y entrega las que el logro desbloquea. */
export async function awardBadgesFor(
  user: Pick<UserProfile, 'uid' | 'nombre' | 'slackId' | 'active'>,
  achievement: Achievement,
): Promise<string[]> {
  const snap = await adminDb().collection('badges')
    .where('organizationId', '==', ORG_ID).where('active', '==', true).get();
  const badges = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Badge).filter(b => matches(b.criteria, achievement));
  const awarded: string[] = [];
  for (const badge of badges) {
    if (await grantBadge(user, badge, { awardedBy: 'system', reason: 'Insignia automática' })) awarded.push(badge.name);
  }
  return awarded;
}
