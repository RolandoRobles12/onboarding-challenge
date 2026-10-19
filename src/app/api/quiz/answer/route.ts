/**
 * POST /api/quiz/answer
 * Califica una respuesta del desafío en curso y la guarda en la sesión.
 *
 * Body: { sessionId, questionId, optionIds?: string[], text?: string }
 *    o: { sessionId, restartMission: number } — al reiniciar una misión
 *       fallida, sus respuestas dejan de contar.
 *    o: { sessionId, begin: true } — arranca el tiempo límite.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { authErrorResponse, requireUser } from '@/lib/server/auth';
import { isTimeUp, loadSession } from '@/lib/server/quiz-session';
import { gradeAnswer, loadQuestions } from '@/lib/server/grading';
import type { QuizAnswerResult } from '@/lib/play-types';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireUser(req);
    const body = await req.json() as { sessionId: string; questionId?: string; optionIds?: string[]; text?: string; restartMission?: number; begin?: boolean };
    const { snap, session } = await loadSession(body.sessionId, profile.uid);
    if (session.status !== 'active') return NextResponse.json({ code: 'finished', error: 'Este intento ya terminó.' }, { status: 409 });

    // El tiempo límite corre desde que empieza la primera misión, no desde que se abrió la pantalla.
    if (body.begin) {
      if (!session.begun) await snap.ref.update({ begun: true, startedAt: Date.now() });
      return NextResponse.json({ ok: true });
    }

    if (typeof body.restartMission === 'number') {
      const keys = session.questionOrder.filter(q => q.missionIndex === body.restartMission).map(q => q.questionId);
      if (keys.length > 0) {
        await snap.ref.update(Object.fromEntries(keys.map(k => [`answers.${k}`, FieldValue.delete()])));
      }
      return NextResponse.json({ ok: true });
    }

    const entry = session.questionOrder.find(q => q.questionId === body.questionId);
    if (!entry) return NextResponse.json({ error: 'La pregunta no es de este desafío.' }, { status: 400 });
    if (isTimeUp(session)) return NextResponse.json({ code: 'time_up', error: 'Se acabó el tiempo.' }, { status: 409 });

    const [question] = await loadQuestions([entry.questionId]);
    if (!question) return NextResponse.json({ error: 'La pregunta ya no existe.' }, { status: 404 });
    const graded = gradeAnswer(question, {
      optionIds: Array.isArray(body.optionIds) ? body.optionIds.map(String) : [],
      text: typeof body.text === 'string' ? body.text.slice(0, 4000) : undefined,
    });

    await snap.ref.update({
      [`answers.${entry.questionId}`]: {
        isCorrect: graded.isCorrect,
        userAnswer: graded.userAnswer,
        correctAnswer: graded.correctAnswerText,
        missionIndex: entry.missionIndex,
        isTricky: !!question.isTricky || question.type === 'tricky',
        answeredAt: Date.now(),
      },
    });

    const { isCorrect, userAnswer: _u, ...reveal } = graded;
    const result: QuizAnswerResult = {
      isCorrect,
      ...(session.showFeedback === 'always' ? { reveal } : {}),
    };
    return NextResponse.json(result);
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    console.error('[quiz/answer] Error:', err);
    return NextResponse.json({ error: 'No se pudo calificar la respuesta.' }, { status: 500 });
  }
}
