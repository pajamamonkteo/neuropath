import { z } from 'zod';

export const quizProjectTypes = ['math', 'writing', 'studying', 'presentation', 'coding', 'creative', 'general'] as const;
export type QuizProjectType = (typeof quizProjectTypes)[number];

export const quizRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(12000),
  rubricText: z.string().max(12000),
  projectType: z.enum(quizProjectTypes),
  tasks: z.array(z.object({ title: z.string().max(200), description: z.string().max(800), type: z.string().max(80), completed: z.boolean(), subtasks: z.array(z.object({ title: z.string().max(200), estimatedMinutes: z.number().finite().nonnegative().max(45) })).max(8) })).max(24),
  questionCount: z.union([z.literal(5), z.literal(10)]),
}).refine((value) => Boolean(value.description.trim() || value.rubricText.trim() || value.tasks.some((task) => task.title.trim() || task.description.trim())), { message: 'Add a description, rubric, or task before starting a quiz.' });

export function inferQuizProjectType(title = '', description = '', taskText = ''): QuizProjectType {
  const source = `${title} ${description} ${taskText}`.toLowerCase();
  if (/derivative|integral|calculus|algebra|math/.test(source)) return 'math';
  if (/essay|paper|writing|citation|research/.test(source)) return 'writing';
  if (/quiz|exam|midterm|chapter|biology|study|flashcard/.test(source)) return 'studying';
  if (/presentation|slides|rehears/.test(source)) return 'presentation';
  if (/coding|code|software|program/.test(source)) return 'coding';
  return 'general';
}
