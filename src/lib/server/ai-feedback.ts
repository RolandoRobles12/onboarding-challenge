/**
 * Mensaje motivacional con IA (Claude) para la pantalla de resultados. Solo se
 * usa si hay una API key de Anthropic: en Admin → Tokens (`anthropic_api_key`)
 * o, de respaldo, en la variable ANTHROPIC_API_KEY. Si no hay llave, o si la
 * respuesta tarda, los resultados usan las frases fijas de siempre.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getOrgTokenValue } from './pulse-store';

const MODEL = 'claude-opus-5-5';
// El resultado del desafío espera este mensaje: si tarda más, se omite.
const TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `Eres el coach de capacitación de Aviva, una financiera mexicana. Un embajador de ventas acaba de terminar un desafío de capacitación y verá tu mensaje en su pantalla de resultados.

Escribe un mensaje breve (máximo 2 oraciones), cálido y motivador, en español de México y tuteando. Si le fue bien, reconócelo; si no, anímalo a repasar sin sonar negativo. Si hay preguntas falladas, sugiere repasar uno de esos temas por su nombre. Usa solo los datos que se te dan, sin inventar cifras. Responde únicamente con el mensaje, sin comillas ni emojis.`;

let cachedKey: { value: string; at: number } | null = null;
const KEY_CACHE_MS = 5 * 60_000;

async function getApiKey(): Promise<string> {
  if (cachedKey && Date.now() - cachedKey.at < KEY_CACHE_MS) return cachedKey.value;
  const stored = await getOrgTokenValue('anthropic_api_key').catch(() => null);
  const value = (stored || process.env.ANTHROPIC_API_KEY || '').trim();
  cachedKey = { value, at: Date.now() };
  return value;
}

export async function generateQuizFeedback(input: {
  quizTopic: string;
  score: number;
  passed: boolean;
  missedTopics: string[];
}): Promise<string | null> {
  const apiKey = await getApiKey();
  if (!apiKey) return null;

  const missed = input.missedTopics.slice(0, 5);
  const details = [
    `Desafío: ${input.quizTopic}`,
    `Puntaje: ${Math.round(input.score)}%`,
    input.passed ? 'Aprobó el desafío.' : 'No alcanzó la calificación para aprobar.',
    ...(missed.length ? ['Preguntas falladas:', ...missed.map(t => `- ${t}`)] : []),
  ].join('\n');

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      // Si el modelo declina, la API reintenta sola con el modelo de respaldo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: details }],
    });
    if (response.stop_reason === 'refusal') return null;
    const message = response.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    return message ? message.slice(0, 400) : null;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('[ai-feedback] La API key de Anthropic no es válida.');
    } else if (err instanceof Anthropic.APIConnectionTimeoutError) {
      console.warn('[ai-feedback] Claude tardó demasiado; se usa el mensaje fijo.');
    } else {
      console.error('[ai-feedback] Error:', err);
    }
    return null;
  }
}
