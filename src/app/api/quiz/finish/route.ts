/**
 * POST /api/quiz/finish
 * Cierra la sesión del desafío y registra el intento. El puntaje se calcula
 * con las respuestas calificadas en el servidor; también aquí se marcan los
 * pasos de la ruta, se actualizan las estadísticas de las preguntas y se
 * entregan las insignias automáticas.
 *
 * Body: { sessionId, bonusLives?: number, timeExpired?: boolean }
 * Responde: { attemptId, awardedBadges }
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/server/firebase-admin';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { getQuizDoc, isTimeUp, TIME_GRACE_MS, type QuizSession } from '@/lib/server/quiz-session';
import { loadQuestions, recordQuestionStats } from '@/lib/server/grading';
import { markJourneySteps } from '@/lib/server/progress';
import { awardBadgesFor } from '@/lib/server/badges';
import { calcGamifiedXp, calcTimeBonus, DEFAULT_GAMIFICATION_CONFIG, getQuizLevel } from '@/lib/quiz-scoring';
import { DEFAULT_ASSESSMENT_CONFIG, type QuizQuestionResult } from '@/lib/types-scalable';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const body = await req.json() as { sessionId: string; bonusLives?: number; timeExpired?: boolean };
    const db = adminDb();
    const ref = db.collection('quiz_sessions').doc(String(body.sessionId || '_'));

    // Reclama el cierre en una transacción: un doble clic no crea dos intentos.
    const claim = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const session = snap.data() as QuizSession | undefined;
      if (!snap.exists || !session || session.userId !== profile.uid) return { error: 'not_found' as const };
      if (session.status === 'finished') return { done: session.attemptId ?? null };
      const attemptRef = db.collection('attempts').doc();
      tx.update(ref, { status: 'finished', attemptId: attemptRef.id, finishedAt: FieldValue.serverTimestamp() });
      return { session, attemptId: attemptRef.id };
    });
    if ('error' in claim) return NextResponse.json({ error: 'Sesión de desafío no encontrada.' }, { status: 404 });
    if ('done' in claim) return NextResponse.json({ attemptId: claim.done, awardedBadges: [] });

    const { session, attemptId } = claim;
    const quiz = await getQuizDoc(session.quizId);
    const cfg = { ...DEFAULT_ASSESSMENT_CONFIG, ...quiz?.assessmentConfig };
    const gc = { ...DEFAULT_GAMIFICATION_CONFIG, ...quiz?.gamificationConfig };

    const now = Date.now();
    const deadline = session.timeLimit > 0 ? session.startedAt + session.timeLimit * 1000 + TIME_GRACE_MS : Infinity;
    const timeExpired = !!body.timeExpired || isTimeUp(session, now);
    const secondsTaken = Math.round((Math.min(now, deadline) - session.startedAt) / 1000);

    // Respuestas en el orden del desafío; las que llegaron fuera de tiempo no cuentan.
    const texts = new Map((await loadQuestions(session.questionOrder.map(q => q.questionId))).map(q => [q.id, q.text]));
    const showAnswers = session.showFeedback !== 'never';
    const questionResults: QuizQuestionResult[] = session.questionOrder.map(({ questionId }) => {
      const a = session.answers?.[questionId];
      const valid = a && a.answeredAt <= deadline;
      return {
        questionId,
        text: texts.get(questionId) ?? '',
        isCorrect: !!(valid && a.isCorrect),
        userAnswer: valid ? a.userAnswer : '',
        correctAnswer: showAnswers ? (a?.correctAnswer ?? '') : '',
        isTricky: !!a?.isTricky,
      };
    });
    const totalQuestions = questionResults.length;
    const score = questionResults.filter(r => r.isCorrect).length;
    const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;
    const passed = !cfg.passingScore || cfg.passingScore <= 0 || percentage >= cfg.passingScore;

    // Puntos extra de las misiones terminadas sin errores.
    const correctIds = new Set(questionResults.filter(r => r.isCorrect).map(r => r.questionId));
    const missionBonus = (quiz?.missions ?? []).reduce((sum, mission) => {
      const own = session.questionOrder.filter(q => q.missionId === mission.id);
      const clean = own.length > 0 && own.every(q => correctIds.has(q.questionId));
      return sum + (clean ? Number(mission.bonusPoints ?? 0) : 0);
    }, 0);
    const xpEarned = calcGamifiedXp(gc, score, totalQuestions, questionResults)
      + missionBonus
      + (timeExpired ? 0 : calcTimeBonus(gc, score, session.timeLimit, secondsTaken));

    const od = profile.onboardingData;
    const fromOnboarding = (re: RegExp) => od ? Object.entries(od).find(([k]) => re.test(k))?.[1] : undefined;
    const batch = db.batch();
    batch.set(db.collection('attempts').doc(attemptId), {
      organizationId: 'aviva-credito',
      userId: profile.uid,
      quizId: session.quizId,
      productId: session.productId,
      startedAt: Timestamp.fromMillis(session.startedAt),
      completedAt: Timestamp.fromMillis(now),
      status: 'completed',
      score,
      maxScore: totalQuestions,
      percentage,
      passed,
      practice: !!session.practice,
      timeTaken: secondsTaken,
      timeExpired,
      livesRemaining: Math.max(0, Math.min(Number(body.bonusLives) || 0, gc.maxLives > 0 ? gc.maxLives : 3)),
      missionResults: [],
      answers: [],
      showFeedback: session.showFeedback,
      levelAchieved: getQuizLevel(score, totalQuestions).name,
      badgesEarned: [],
      xpEarned,
      trainerName: (fromOnboarding(/nombre|name|nombres/i) || profile.nombre || '').trim(),
      assignedKiosko: (fromOnboarding(/kiosk|kiosco|kiosko/i) || profile.assignedKiosko || '').trim(),
    });
    // El detalle (con las respuestas correctas) solo lo leen el embajador y el staff.
    batch.set(db.collection('attempt_details').doc(attemptId), {
      userId: profile.uid,
      quizId: session.quizId,
      questionResults,
      showFeedback: session.showFeedback,
    });
    await batch.commit();

    const [, , awardedBadges] = await Promise.all([
      recordQuestionStats(questionResults
        .filter(r => r.userAnswer !== '' || r.isCorrect)
        .map(r => ({ questionId: r.questionId!, isCorrect: r.isCorrect })))
        .catch(err => console.error('[quiz/finish] estadísticas:', err)),
      (cfg.requirePassToAdvance && !passed
        ? Promise.resolve([])
        : markJourneySteps(profile, session.productId, step =>
            step.type === 'results' || (
              (step.type === 'quiz' || step.type === 'challenge')
              && step.config?.quizId === session.quizId
              // Puntaje mínimo del paso (configurable en la ruta).
              && (!step.config?.minimumScore || percentage >= step.config.minimumScore)
            ))
      ).catch(err => console.error('[quiz/finish] ruta:', err)),
      awardBadgesFor(profile, { type: 'quiz_completed', quizId: session.quizId, passed, percentage })
        .catch(err => { console.error('[quiz/finish] insignias:', err); return [] as string[]; }),
    ]);

    if (awardedBadges.length > 0) {
      await db.collection('attempts').doc(attemptId).update({ badgesEarned: awardedBadges }).catch(() => {});
    }
    return NextResponse.json({ attemptId, awardedBadges });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[quiz/finish] Error:', err);
    return NextResponse.json({ error: 'No se pudo registrar el intento.' }, { status: 500 });
  }
}
