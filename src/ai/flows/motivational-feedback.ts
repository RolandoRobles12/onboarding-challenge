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
  quizTopic: z.string().describe('The topic of the quiz (e.g., BA or ATN).'),
  score: z.number().describe('The final score obtained in the quiz.'),
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
  prompt: `You are an AI assistant designed to provide motivational feedback to users completing onboarding quizzes.

  Based on the quiz topic and the user's score, generate a short, encouraging message.

  Quiz Topic: {{{quizTopic}}}
  Score: {{{score}}}

  Message:`,
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
