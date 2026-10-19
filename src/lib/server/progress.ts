/**
 * Progreso del embajador en su ruta, escrito por el servidor (Admin SDK)
 * cuando el logro se verifica aquí: desafíos terminados, simulaciones
 * aprobadas.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { journeySteps } from '@/lib/journey-progress';
import type { Journey, JourneyStep, UserProfile } from '@/lib/types-scalable';

const ORG_ID = 'aviva-credito';

export async function getJourneyForProduct(productId: string): Promise<Journey | null> {
  if (!productId) return null;
  const snap = await adminDb().collection('journeys')
    .where('organizationId', '==', ORG_ID)
    .where('productId', '==', productId)
    .where('active', '==', true)
    .limit(1)
    .get();
  return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Journey);
}

/** Marca como completados los pasos de la ruta del producto que cumplan `filter`. */
export async function markJourneySteps(
  user: Pick<UserProfile, 'uid' | 'nombre' | 'email'>,
  productId: string,
  filter: (step: JourneyStep) => boolean,
): Promise<string[]> {
  const journey = await getJourneyForProduct(productId);
  if (!journey) return [];
  const stepIds = journeySteps(journey).filter(filter).map(s => s.id);
  if (stepIds.length === 0) return [];

  const ref = adminDb().collection('journey_progress').doc(`${user.uid}_${journey.id}`);
  await adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    const meta = { userName: user.nombre ?? '', userEmail: user.email ?? '' };
    if (!snap.exists) {
      tx.set(ref, {
        userId: user.uid,
        ...meta,
        journeyId: journey.id,
        productId,
        completedStepIds: stepIds,
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(ref, { ...meta, completedStepIds: FieldValue.arrayUnion(...stepIds), updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return stepIds;
}
