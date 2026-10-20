/**
 * Calificación de preguntas en el servidor.
 *
 * El navegador del embajador recibe las preguntas sin la respuesta correcta
 * (`toPlayQuestion`) y manda lo que eligió; aquí se califica (`gradeAnswer`).
 * Las reglas de Firestore no dejan que un vendedor lea la colección
 * `questions`, así que la respuesta no se puede ver en las herramientas del
 * navegador.
 */

import { adminDb } from './firebase-admin';
import { withOptionIds } from '@/lib/question-options';
import type { Question } from '@/lib/types-scalable';
import type { PlayQuestion, AnswerReveal } from '@/lib/play-types';

/** Una respuesta abierta cuenta como correcta con 70% de los conceptos clave. */
const OPEN_TEXT_THRESHOLD = 0.7;

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Opciones de la pregunta; las de completar sin opciones salen de validAnswers (la primera es la correcta). */
function optionsOf(q: Question) {
  if (q.type === 'open_text') return [];
  if (q.type === 'fill_in_the_blank' && (!q.options || q.options.length === 0)) {
    return (q.validAnswers ?? []).map((text, i) => ({ id: `va_${i}`, text, isCorrect: i === 0, order: i }));
  }
  return withOptionIds(q.options).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function toPlayQuestion(q: Question, opts: { shuffleOptions?: boolean } = {}): PlayQuestion {
  const options = optionsOf(q).map(o => ({ id: o.id, text: o.text }));
  const correctCount = optionsOf(q).filter(o => o.isCorrect).length;
  return {
    id: q.id,
    text: q.text,
    imageUrl: q.imageUrl,
    type: q.type,
    module: q.module,
    isTricky: !!q.isTricky || q.type === 'tricky',
    hint: (q.isTricky || q.type === 'tricky') && q.trickyHint?.trim() ? q.trickyHint.trim() : undefined,
    isMultiSelect: q.type === 'multiple_choice',
    isOpenText: q.type === 'open_text',
    isFillInBlank: q.type === 'fill_in_the_blank',
    // Las respuestas abiertas muestran los conceptos clave como guía (así se diseñó el quiz).
    validAnswers: q.type === 'open_text' ? q.validAnswers ?? [] : undefined,
    correctCount: q.type === 'multiple_choice' ? correctCount : undefined,
    options: opts.shuffleOptions || q.type === 'fill_in_the_blank' ? shuffle(options) : options,
  };
}

export interface GradeResult extends AnswerReveal {
  isCorrect: boolean;
  /** Texto de lo que eligió o escribió (para el detalle de resultados). */
  userAnswer: string;
}

export function gradeAnswer(q: Question, answer: { optionIds?: string[]; text?: string }): GradeResult {
  const reveal: AnswerReveal = {
    correctOptionIds: [],
    correctAnswerText: '',
    explanation: q.explanation,
  };

  if (q.type === 'open_text') {
    const keywords = q.validAnswers ?? [];
    const text = (answer.text ?? '').trim();
    const normalized = text.toLowerCase();
    const found = keywords.filter(kw => normalized.includes(kw.toLowerCase()));
    const missing = keywords.filter(kw => !normalized.includes(kw.toLowerCase()));
    const score = keywords.length === 0 ? (text ? 1 : 0) : found.length / keywords.length;
    return {
      ...reveal,
      isCorrect: score >= OPEN_TEXT_THRESHOLD,
      userAnswer: text,
      correctAnswerText: keywords.join(', '),
      modelAnswer: q.modelAnswer,
      openText: { score, found, missing },
    };
  }

  const options = optionsOf(q);
  const correct = options.filter(o => o.isCorrect);
  const chosen = new Set(answer.optionIds ?? []);
  const chosenOptions = options.filter(o => chosen.has(o.id));
  const isCorrect = q.type === 'multiple_choice'
    ? chosenOptions.length === correct.length && chosenOptions.every(o => o.isCorrect) && chosen.size === correct.length
    : chosenOptions.length === 1 && chosen.size === 1 && chosenOptions[0].isCorrect;

  return {
    ...reveal,
    isCorrect,
    userAnswer: chosenOptions.map(o => o.text).join(', '),
    correctOptionIds: correct.map(o => o.id),
    correctAnswerText: correct.map(o => o.text).join(', '),
  };
}

/** Lee preguntas por id, conservando el orden pedido. */
export async function loadQuestions(ids: string[]): Promise<Question[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const db = adminDb();
  const byId = new Map<string, Question>();
  for (let i = 0; i < unique.length; i += 100) {
    const refs = unique.slice(i, i + 100).map(id => db.collection('questions').doc(id));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) if (s.exists) byId.set(s.id, { id: s.id, ...s.data() } as Question);
  }
  return ids.map(id => byId.get(id)).filter((q): q is Question => !!q);
}

/**
 * Suma respuestas a las estadísticas de cada pregunta (`timesUsed`,
 * `timesCorrect`, `averageCorrectRate`). El armado automático del pulso usa la
 * tasa de aciertos para reforzar lo que más se falla.
 */
export async function recordQuestionStats(results: { questionId: string; isCorrect: boolean }[]): Promise<void> {
  const byId = new Map<string, boolean>();
  for (const r of results) if (r.questionId) byId.set(r.questionId, r.isCorrect);
  if (byId.size === 0) return;
  const db = adminDb();
  await db.runTransaction(async tx => {
    const refs = Array.from(byId.keys()).map(id => db.collection('questions').doc(id));
    const snaps = await tx.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      const used = Number(data.timesUsed ?? 0);
      const correct = typeof data.timesCorrect === 'number'
        ? data.timesCorrect
        : Math.round((Number(data.averageCorrectRate ?? 0) / 100) * used);
      const nextUsed = used + 1;
      const nextCorrect = correct + (byId.get(snap.id) ? 1 : 0);
      tx.update(snap.ref, {
        timesUsed: nextUsed,
        timesCorrect: nextCorrect,
        averageCorrectRate: Math.round((nextCorrect / nextUsed) * 100),
      });
    }
  });
}
