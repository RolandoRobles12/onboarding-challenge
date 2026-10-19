/**
 * Mensaje motivacional con IA para la pantalla de resultados (Genkit + Gemini,
 * ver src/ai). Solo se usa si hay una llave de Google AI configurada
 * (GEMINI_API_KEY o GOOGLE_API_KEY); si no, o si tarda, los resultados usan
 * las frases fijas de siempre.
 */

const TIMEOUT_MS = 6000;

export function aiFeedbackEnabled(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY);
}

export async function generateQuizFeedback(input: {
  quizTopic: string;
  score: number;
  passed: boolean;
  missedTopics: string[];
}): Promise<string | null> {
  if (!aiFeedbackEnabled()) return null;
  try {
    // Import dinámico: el plugin de Google AI pide la llave al cargarse.
    const { generateMotivationalFeedback } = await import('@/ai/flows/motivational-feedback');
    const result = await Promise.race([
      generateMotivationalFeedback({ ...input, missedTopics: input.missedTopics.slice(0, 5) }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    const message = result?.message?.trim();
    return message ? message.slice(0, 400) : null;
  } catch (err) {
    console.error('[ai-feedback] Error:', err);
    return null;
  }
}
