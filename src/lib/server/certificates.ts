/**
 * Certificados ligados al perfil (user_certificates), solo servidor.
 *
 * Un certificado se gana como siempre (paso "certificate" de la ruta, o curso
 * terminado que emite certificado); aquí se guarda el registro para que viva
 * en el perfil como las insignias y el staff pueda verlo y revocarlo.
 * `syncUserCertificates` crea los que falten (incluidos los ganados antes de
 * que existiera esta colección) y marca como vencidos los cursos que se
 * tienen que renovar. Un certificado revocado no se vuelve a activar solo.
 */

import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { journeySteps } from '@/lib/journey-progress';
import { courseCertificateId, journeyCertificateId } from '@/lib/certificates';
import type { Course, CourseEnrollment } from '@/lib/types-lms';
import type { Journey, UserCertificate, UserJourneyProgress, UserProfile } from '@/lib/types-scalable';

const ORG_ID = 'aviva-credito';
const COLLECTION = 'user_certificates';

// issuedAt es el Timestamp del Admin SDK (el tipo compartido usa el del SDK de cliente).
type Earned = Omit<UserCertificate, 'id' | 'status' | 'revokedAt' | 'revokedBy' | 'updatedAt' | 'issuedAt'> & { issuedAt: Timestamp };

const asTimestamp = (t: unknown): Timestamp | null =>
  t && typeof (t as Timestamp).toMillis === 'function' ? (t as Timestamp) : null;

/** Crea el registro, o reactiva uno vencido si se volvió a ganar con otra fecha. */
async function upsert(ref: DocumentReference, earned: Earned): Promise<void> {
  await adminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.create(ref, { ...earned, status: 'active', updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    const current = snap.data() as UserCertificate;
    if (current.status === 'revoked') return;
    const renewed = current.status === 'expired' && current.issuedAt?.toMillis?.() !== earned.issuedAt.toMillis();
    if (renewed) {
      tx.update(ref, { ...earned, status: 'active', updatedAt: FieldValue.serverTimestamp() });
    } else if (current.title !== earned.title || current.userName !== earned.userName) {
      tx.update(ref, { title: earned.title, userName: earned.userName, updatedAt: FieldValue.serverTimestamp() });
    }
  });
}

/** Marca como vencido el certificado de un curso (re-certificación). */
export async function expireCourseCertificate(userId: string, courseId: string): Promise<void> {
  const ref = adminDb().collection(COLLECTION).doc(courseCertificateId(userId, courseId));
  const snap = await ref.get();
  if (snap.exists && snap.data()?.status === 'active') {
    await ref.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() });
  }
}

/**
 * Registra los certificados que el usuario ya ganó. Solo para embajadores: el
 * staff puede abrir un certificado para revisarlo sin que cuente como emitido.
 */
export async function syncUserCertificates(user: UserProfile): Promise<number> {
  if (user.rol !== 'seller') return 0;
  const db = adminDb();
  const base = { organizationId: ORG_ID, userId: user.uid, userName: user.nombre || '', userEmail: user.email || '' };
  const earned: { id: string; data: Earned }[] = [];

  // Rutas: pasos "certificate" ya emitidos.
  const progressSnap = await db.collection('journey_progress').where('userId', '==', user.uid).get();
  const productNames = new Map<string, string>();
  for (const doc of progressSnap.docs) {
    const progress = doc.data() as UserJourneyProgress & { certificateIssuedAt?: Record<string, unknown> };
    const issued = progress.certificateIssuedAt ?? {};
    if (Object.keys(issued).length === 0) continue;
    const journeySnap = await db.collection('journeys').doc(progress.journeyId).get();
    if (!journeySnap.exists) continue;
    const journey = { id: journeySnap.id, ...journeySnap.data() } as Journey;
    if (!productNames.has(journey.productId)) {
      const product = await db.collection('products').doc(journey.productId).get();
      productNames.set(journey.productId, (product.data()?.name as string | undefined) ?? '');
    }
    for (const step of journeySteps(journey).filter(s => s.type === 'certificate')) {
      const issuedAt = asTimestamp(issued[step.id]);
      if (!issuedAt) continue;
      earned.push({
        id: journeyCertificateId(user.uid, journey.id, step.id),
        data: {
          ...base, kind: 'journey', issuedAt,
          title: productNames.get(journey.productId) || journey.name || 'Ruta Aviva',
          journeyId: journey.id, stepId: step.id, productId: journey.productId,
        },
      });
    }
  }

  // Cursos terminados que emiten certificado; los que dejaron de estar
  // completos (re-certificación) se marcan como vencidos.
  const enrollmentsSnap = await db.collection('enrollments').where('userId', '==', user.uid).get();
  for (const doc of enrollmentsSnap.docs) {
    const enrollment = { id: doc.id, ...doc.data() } as CourseEnrollment;
    const courseSnap = await db.collection('courses').doc(enrollment.courseId).get();
    const course = courseSnap.exists ? ({ id: courseSnap.id, ...courseSnap.data() } as Course) : null;
    if (!course?.certificateTemplate) continue;
    if (enrollment.status !== 'completed') {
      await expireCourseCertificate(user.uid, course.id);
      continue;
    }
    const issuedAt = asTimestamp(enrollment.certificateIssuedAt) ?? asTimestamp(enrollment.completedAt);
    if (!issuedAt) continue;
    earned.push({
      id: courseCertificateId(user.uid, course.id),
      data: { ...base, kind: 'course', issuedAt, title: course.title, courseId: course.id },
    });
  }

  for (const { id, data } of earned) await upsert(db.collection(COLLECTION).doc(id), data);
  return earned.length;
}

/** Sincroniza a todos los embajadores activos (pestaña "Emitidos" del admin). */
export async function syncAllCertificates(): Promise<number> {
  const users = (await adminDb().collection('users').where('rol', '==', 'seller').get()).docs
    .map(d => ({ uid: d.id, ...d.data() }) as UserProfile)
    .filter(u => u.active !== false);
  let total = 0;
  for (const user of users) total += await syncUserCertificates(user).catch(err => {
    console.error('[certificates] No se pudo sincronizar', user.uid, err);
    return 0;
  });
  return total;
}
