/**
 * POST /api/quiz/start
 * Abre una sesión de desafío y devuelve las preguntas sin las respuestas.
 *
 * Body: { quizId?: string, productId: string, practice?: boolean } — sin quizId, el primer desafío
 * publicado del producto. Revisa (salvo para el staff, que puede previsualizar)
 * que esté publicado, el límite de intentos y los desafíos previos requeridos.
 * Con practice (Práctica), el intento cuenta igual pero no entra al ranking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/server/firebase-admin';
import { authErrorResponse, requireUser, STAFF_ROLES } from '@/lib/server/auth';
import { getQuizDoc, type QuizSession } from '@/lib/server/quiz-session';
import { loadQuestions, toPlayQuestion } from '@/lib/server/grading';
import { DEFAULT_ASSESSMENT_CONFIG, type Quiz, type QuizAttempt } from '@/lib/types-scalable';
import { DEFAULT_GAMIFICATION_CONFIG } from '@/lib/quiz-scoring';
import type { PlayMission, QuizSessionStart } from '@/lib/play-types';

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const isStaff = STAFF_ROLES.includes(profile.rol);
    const { quizId, productId, practice } = await req.json() as { quizId?: string; productId?: string; practice?: boolean };
    const db = adminDb();

    let quiz: Quiz | null = null;
    if (quizId) {
      quiz = await getQuizDoc(quizId);
    } else if (productId) {
      const snap = await db.collection('quizzes')
        .where('organizationId', '==', 'aviva-credito')
        .where('productId', '==', productId)
        .where('active', '==', true)
        .where('published', '==', true)
        .orderBy('order', 'asc')
        .limit(1)
        .get();
      quiz = snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Quiz);
    }
    if (!quiz) return NextResponse.json({ code: 'not_found', error: 'Este producto no tiene un desafío activo.' }, { status: 404 });
    if (!isStaff && (!quiz.published || !quiz.active)) {
      return NextResponse.json({ code: 'not_available', error: 'Este desafío no está disponible.' }, { status: 404 });
    }

    const cfg = { ...DEFAULT_ASSESSMENT_CONFIG, ...quiz.assessmentConfig };
    const gc = { ...DEFAULT_GAMIFICATION_CONFIG, ...quiz.gamificationConfig };

    if (!isStaff) {
      const attemptsSnap = await db.collection('attempts').where('userId', '==', profile.uid).get();
      const completed = attemptsSnap.docs.map(d => d.data() as QuizAttempt).filter(a => a.status === 'completed');

      const limit = !cfg.allowRetry ? 1 : cfg.maxAttempts > 0 ? cfg.maxAttempts : 0;
      const count = completed.filter(a => a.quizId === quiz!.id).length;
      if (limit > 0 && count >= limit) {
        return NextResponse.json({ code: 'exhausted', count, limit, error: 'Alcanzaste el máximo de intentos.' }, { status: 409 });
      }

      // Desafíos previos: hay que haberlos aprobado (o terminado, si no tienen mínimo).
      const missing: string[] = [];
      for (const prereqId of quiz.prerequisites ?? []) {
        const prereq = await getQuizDoc(prereqId);
        if (!prereq) continue;
        const ps = prereq.assessmentConfig?.passingScore ?? 0;
        const done = completed.some(a => a.quizId === prereqId && (ps <= 0 || a.percentage >= ps));
        if (!done) missing.push(prereq.title);
      }
      if (missing.length > 0) {
        return NextResponse.json({ code: 'prerequisites', missing, error: 'Primero completa los desafíos previos.' }, { status: 409 });
      }
    }

    const missionsSorted = [...(quiz.missions ?? [])].sort((a, b) => a.order - b.order);
    const questions = await loadQuestions(missionsSorted.flatMap(m => m.questionIds));
    const byId = new Map(questions.map(q => [q.id, q]));

    const missions: PlayMission[] = missionsSorted.map(m => {
      let qs = m.questionIds.map(id => byId.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
      if (cfg.randomizeQuestions) qs = shuffle(qs);
      return {
        id: m.id,
        title: m.title,
        narrative: m.narrative,
        maxErrors: m.maxErrors && m.maxErrors > 0 ? m.maxErrors : 1,
        questions: qs.map(q => toPlayQuestion(q, { shuffleOptions: cfg.randomizeOptions })),
      };
    }).filter(m => m.questions.length > 0);
    if (missions.length === 0) {
      return NextResponse.json({ code: 'not_found', error: 'El desafío no tiene preguntas.' }, { status: 404 });
    }

    const session: QuizSession = {
      userId: profile.uid,
      quizId: quiz.id,
      productId: productId || quiz.productId,
      startedAt: Date.now(),
      timeLimit: cfg.timeLimit > 0 ? cfg.timeLimit : 0,
      showFeedback: cfg.showFeedback,
      questionOrder: missions.flatMap((m, missionIndex) => m.questions.map(q => ({ questionId: q.id, missionIndex, missionId: m.id }))),
      answers: {},
      status: 'active',
      practice: !!practice,
    };
    const ref = await db.collection('quiz_sessions').add({ ...session, organizationId: 'aviva-credito' });

    const body: QuizSessionStart = {
      sessionId: ref.id,
      quizId: quiz.id,
      title: quiz.title,
      missions,
      timeLimit: session.timeLimit,
      showFeedback: cfg.showFeedback,
      enableLives: gc.enableLives !== false,
      enableBonusLives: gc.enableBonusLives !== false,
      maxBonusLives: gc.maxLives > 0 ? gc.maxLives : 3,
    };
    return NextResponse.json(body);
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[quiz/start] Error:', err);
    return NextResponse.json({ error: 'No se pudo abrir el desafío.' }, { status: 500 });
  }
}
