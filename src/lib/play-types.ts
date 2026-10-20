/**
 * Formas que intercambian el navegador y las rutas de /api al jugar un desafío
 * o el Pulso. Las preguntas viajan sin la respuesta correcta; la respuesta se
 * revela (o no, según el quiz) después de calificar en el servidor.
 */

import type { KnowledgeModule, QuestionType } from './types-scalable';

export interface PlayOption {
  id: string;
  text: string;
}

export interface PlayQuestion {
  id: string;
  text: string;
  imageUrl?: string;
  type: QuestionType;
  module?: KnowledgeModule;
  isTricky: boolean;
  /** Solo en preguntas capciosas: pista que se muestra antes de responder. */
  hint?: string;
  isMultiSelect: boolean;
  isOpenText: boolean;
  isFillInBlank: boolean;
  /** Solo en respuestas abiertas: conceptos clave que se muestran como guía. */
  validAnswers?: string[];
  /** Solo en opción múltiple: cuántas opciones son correctas. */
  correctCount?: number;
  options: PlayOption[];
}

export interface AnswerReveal {
  correctOptionIds: string[];
  correctAnswerText: string;
  explanation?: string;
  modelAnswer?: string;
  openText?: { score: number; found: string[]; missing: string[] };
}

export interface PlayMission {
  id: string;
  title: string;
  narrative: string;
  maxErrors: number;
  questions: PlayQuestion[];
}

/** Lo que devuelve /api/quiz/start. */
export interface QuizSessionStart {
  sessionId: string;
  quizId: string;
  title: string;
  missions: PlayMission[];
  timeLimit: number;
  showFeedback: 'always' | 'after_attempt' | 'never';
  enableLives: boolean;
  enableBonusLives: boolean;
  maxBonusLives: number;
}

/** Lo que devuelve /api/quiz/answer. */
export interface QuizAnswerResult {
  isCorrect: boolean;
  /** Vacío si el quiz no muestra la respuesta durante el intento. */
  reveal?: AnswerReveal;
}
