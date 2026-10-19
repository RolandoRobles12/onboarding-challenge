/**
 * POST /api/events
 * Eventos de la capacitación que disparan avisos (Slack y push) e insignias
 * automáticas. El servidor verifica cada evento en Firestore antes de actuar:
 * no basta con que el navegador lo diga.
 *
 * Del embajador (sobre sí mismo):
 *   { type: 'course_completed', courseId }
 *   { type: 'certificate_issued', journeyId, stepId } | { type: 'certificate_issued', courseId }
 *   { type: 'simulation_passed', attemptId }
 * Del staff:
 *   { type: 'course_assigned', userId, courseId }
 *   { type: 'challenge_available', quizId }
 *   { type: 'badge_awarded', userId, badgeId }
 *   { type: 'simulation_reviewed', attemptId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/server/firebase-admin';
import { authErrorResponse, requireUser, STAFF_ROLES } from '@/lib/server/auth';
import { notifyUser, notifyUsers } from '@/lib/server/notifications';
import { awardBadgesFor, notifyBadge } from '@/lib/server/badges';
import { markJourneySteps } from '@/lib/server/progress';
import type { Course, CourseEnrollment } from '@/lib/types-lms';
import type { Quiz, UserProfile } from '@/lib/types-scalable';

type EventBody = {
  type: string;
  courseId?: string;
  journeyId?: string;
  stepId?: string;
  attemptId?: string;
  userId?: string;
  quizId?: string;
  badgeId?: string;
};

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function getUser(uid: string): Promise<UserProfile | null> {
  const snap = await adminDb().collection('users').doc(uid).get();
  return snap.exists ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null;
}

async function getEnrollment(userId: string, courseId: string): Promise<CourseEnrollment | null> {
  const snap = await adminDb().collection('enrollments').where('userId', '==', userId).get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }) as CourseEnrollment).filter(e => e.courseId === courseId);
  return all.find(e => e.status === 'completed') ?? all[0] ?? null;
}

async function getCourse(courseId: string): Promise<Course | null> {
  const snap = await adminDb().collection('courses').doc(courseId).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as Course) : null;
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const body = await req.json() as EventBody;
    const db = adminDb();
    const isStaff = STAFF_ROLES.includes(profile.rol);

    switch (body.type) {
      case 'course_completed': {
        if (!body.courseId) return bad('Falta el curso.');
        const [enrollment, course] = await Promise.all([getEnrollment(profile.uid, body.courseId), getCourse(body.courseId)]);
        if (!course || enrollment?.status !== 'completed') return bad('El curso no está completado.', 409);
        await notifyUser({
          type: 'course_completed',
          user: profile,
          message: { title: '🎉 ¡Curso completado!', body: `Terminaste el curso «${course.title}». ¡Sigue así!`, path: '/courses' },
          dedupeKey: `course_completed_${profile.uid}_${course.id}`,
        });
        const badges = await awardBadgesFor(profile, { type: 'course_completed', courseId: course.id });
        return NextResponse.json({ ok: true, badges });
      }

      case 'certificate_issued': {
        if (body.courseId) {
          const [enrollment, course] = await Promise.all([getEnrollment(profile.uid, body.courseId), getCourse(body.courseId)]);
          if (!course?.certificateTemplate || enrollment?.status !== 'completed') return bad('El certificado no está disponible.', 409);
          await notifyUser({
            type: 'certificate_issued',
            user: profile,
            message: { title: '🎖️ ¡Ya tienes tu certificado!', body: `Obtuviste el certificado del curso «${course.title}».`, path: '/certifications' },
            dedupeKey: `certificate_course_${profile.uid}_${course.id}`,
          });
          return NextResponse.json({ ok: true });
        }
        if (!body.journeyId || !body.stepId) return bad('Falta la ruta.');
        const progress = await db.collection('journey_progress').doc(`${profile.uid}_${body.journeyId}`).get();
        if (!progress.data()?.certificateIssuedAt?.[body.stepId]) return bad('El certificado no se ha emitido.', 409);
        const journey = await db.collection('journeys').doc(body.journeyId).get();
        const name = journey.data()?.name || 'tu ruta';
        await notifyUser({
          type: 'certificate_issued',
          user: profile,
          message: { title: '🎖️ ¡Ya tienes tu certificado!', body: `Completaste «${name}» y obtuviste tu certificado.`, path: '/certifications' },
          dedupeKey: `certificate_${profile.uid}_${body.journeyId}_${body.stepId}`,
        });
        const badges = await awardBadgesFor(profile, { type: 'journey_completed', journeyId: body.journeyId });
        return NextResponse.json({ ok: true, badges });
      }

      case 'simulation_passed': {
        if (!body.attemptId) return bad('Falta el intento.');
        const snap = await db.collection('sim_attempts').doc(body.attemptId).get();
        const attempt = snap.data();
        if (!snap.exists || attempt?.userId !== profile.uid || attempt?.passed !== true) return bad('La simulación no está aprobada.', 409);
        const steps = profile.producto
          ? await markJourneySteps(profile, profile.producto, s => s.type === 'simulation' && s.config?.simModuleId === attempt.moduleId)
          : [];
        const badges = await awardBadgesFor(profile, { type: 'simulation_passed', simModuleId: attempt.moduleId });
        return NextResponse.json({ ok: true, steps, badges });
      }

      case 'simulation_reviewed': {
        // Un capacitador aprobó las respuestas abiertas de una simulación.
        if (!isStaff) return bad('No tienes permiso para hacer esto.', 403);
        if (!body.attemptId) return bad('Falta el intento.');
        const snap = await db.collection('sim_attempts').doc(body.attemptId).get();
        const attempt = snap.data();
        if (!snap.exists || attempt?.passed !== true || attempt?.review?.status !== 'approved' || !attempt.userId) {
          return bad('La simulación no está aprobada.', 409);
        }
        const seller = await getUser(attempt.userId);
        if (!seller) return bad('El usuario no existe.', 404);
        const steps = seller.producto
          ? await markJourneySteps(seller, seller.producto, s => s.type === 'simulation' && s.config?.simModuleId === attempt.moduleId)
          : [];
        const badges = await awardBadgesFor(seller, { type: 'simulation_passed', simModuleId: attempt.moduleId });
        return NextResponse.json({ ok: true, steps, badges });
      }

      case 'course_assigned': {
        if (!isStaff) return bad('No tienes permiso para hacer esto.', 403);
        if (!body.userId || !body.courseId) return bad('Faltan datos.');
        const [target, enrollment, course] = await Promise.all([
          getUser(body.userId), getEnrollment(body.userId, body.courseId), getCourse(body.courseId),
        ]);
        if (!target || !course || !enrollment) return bad('La inscripción no existe.', 404);
        await notifyUser({
          type: 'course_assigned',
          user: target,
          message: { title: '📚 Tienes un curso nuevo', body: `Te asignaron el curso «${course.title}».`, path: `/courses/${course.id}` },
          dedupeKey: `course_assigned_${target.uid}_${course.id}_${enrollment.id}`,
        });
        return NextResponse.json({ ok: true });
      }

      case 'challenge_available': {
        if (!isStaff) return bad('No tienes permiso para hacer esto.', 403);
        if (!body.quizId) return bad('Falta el desafío.');
        const quizSnap = await db.collection('quizzes').doc(body.quizId).get();
        const quiz = quizSnap.exists ? ({ id: quizSnap.id, ...quizSnap.data() } as Quiz) : null;
        if (!quiz?.published || quiz.active === false) return bad('El desafío no está publicado.', 409);
        const sellers = (await db.collection('users').where('producto', '==', quiz.productId).get()).docs
          .map(d => ({ uid: d.id, ...d.data() }) as UserProfile)
          .filter(u => u.rol === 'seller' && u.active !== false);
        const sent = await notifyUsers('challenge_available', sellers, user => ({
          message: { title: '⚔️ Nuevo desafío disponible', body: `Ya puedes jugar «${quiz.title}».`, path: `/${quiz.productId}/quiz?quizId=${quiz.id}` },
          dedupeKey: `challenge_${quiz.id}_${user.uid}`,
        }));
        return NextResponse.json({ ok: true, sent });
      }

      case 'badge_awarded': {
        if (!isStaff) return bad('No tienes permiso para hacer esto.', 403);
        if (!body.userId || !body.badgeId) return bad('Faltan datos.');
        const [target, awarded] = await Promise.all([
          getUser(body.userId),
          db.collection('user_badges').where('userId', '==', body.userId).where('badgeId', '==', body.badgeId).limit(1).get(),
        ]);
        if (!target || awarded.empty) return bad('La insignia no está otorgada.', 404);
        const b = awarded.docs[0].data();
        await notifyBadge(target, body.badgeId, b.badgeName ?? 'Insignia', b.badgeEmoji ?? '🏅');
        return NextResponse.json({ ok: true });
      }

      default:
        return bad('Evento desconocido.');
    }
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[events] Error:', err);
    return NextResponse.json({ error: 'No se pudo procesar el evento.' }, { status: 500 });
  }
}
