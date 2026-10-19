// src/ai/flows/motivational-feedback.ts
'use server';

/**
 * @fileOverview A motivational feedback AI agent.
 *
 * - generateMotivationalFeedback - A function that generates motivational feedback based on quiz results.
 * - MotivationalFeedbackInput - The input type for the generateMotivationalFeedback function.
 * - MotivationalFeedbackOutput - The return type for the generateMotivationalFeedback function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const MotivationalFeedbackInputSchema = z.object({
  quizTopic: z.string().describe('The title of the quiz the user just finished.'),
  score: z.number().describe('The final score as a percentage (0-100).'),
  passed: z.boolean().optional().describe('Whether the user reached the passing score.'),
  missedTopics: z.array(z.string()).optional().describe('Questions the user got wrong.'),
});
export type MotivationalFeedbackInput = z.infer<typeof MotivationalFeedbackInputSchema>;

const MotivationalFeedbackOutputSchema = z.object({
  message: z.string().describe('A motivational message tailored to the quiz results.'),
});
export type MotivationalFeedbackOutput = z.infer<typeof MotivationalFeedbackOutputSchema>;

export async function generateMotivationalFeedback(input: MotivationalFeedbackInput): Promise<MotivationalFeedbackOutput> {
  return motivationalFeedbackFlow(input);
}

const prompt = ai.definePrompt({
  name: 'motivationalFeedbackPrompt',
  input: {schema: MotivationalFeedbackInputSchema},
  output: {schema: MotivationalFeedbackOutputSchema},
  prompt: `Eres el coach de capacitación de Aviva, una financiera mexicana. Un embajador de ventas
  acaba de terminar un desafío de capacitación. Escribe un mensaje breve (máximo 2 oraciones), cálido y
  motivador, en español de México, tuteando. Si le fue bien, reconócelo; si no, anímalo a repasar sin
  sonar negativo. Si hay temas fallados, sugiere repasar uno de ellos por su nombre. No inventes datos
  ni cifras distintas a las que se te dan. Sin comillas ni emojis.

  Desafío: {{{quizTopic}}}
  Puntaje: {{{score}}}%
  {{#if passed}}Aprobó el desafío.{{/if}}
  {{#if missedTopics}}Preguntas falladas: {{#each missedTopics}}- {{{this}}}
  {{/each}}{{/if}}

  Mensaje:`,
});

const motivationalFeedbackFlow = ai.defineFlow(
  {
    name: 'motivationalFeedbackFlow',
    inputSchema: MotivationalFeedbackInputSchema,
    outputSchema: MotivationalFeedbackOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
