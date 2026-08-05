import { z } from 'zod';

export const quizProjectTypes = ['math', 'writing', 'studying', 'presentation', 'coding', 'creative', 'general'] as const;
export type QuizProjectType = (typeof quizProjectTypes)[number];

export type QuizAnswerValue = string | number;

export type QuizQuestion = {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
};

export type SubmittedQuizAnswer = {
  questionIndex: number;
  value: QuizAnswerValue;
};

export type QuizResult = {
  correct: number;
  total: number;
  missedQuestionIndexes: number[];
  gradable: boolean;
};

export function isValidQuizQuestion(question: QuizQuestion): boolean {
  return Boolean(
    question.question.trim()
    && question.choices.length >= 2
    && question.choices.every((choice) => choice.trim())
    && Number.isInteger(question.correctIndex)
    && question.correctIndex >= 0
    && question.correctIndex < question.choices.length,
  );
}

export function quizQuestionsFromResponse(value: unknown): QuizQuestion[] {
  if (!value || typeof value !== 'object') return [];
  const quiz = (value as Record<string, unknown>).quiz;
  if (!quiz || typeof quiz !== 'object') return [];
  const questions = (quiz as Record<string, unknown>).questions;
  if (!Array.isArray(questions)) return [];
  return questions.flatMap((question) => {
    if (!question || typeof question !== 'object') return [];
    const item = question as Record<string, unknown>;
    if (typeof item.question !== 'string' || !Array.isArray(item.choices) || !item.choices.every((choice) => typeof choice === 'string') || typeof item.correctIndex !== 'number' || typeof item.explanation !== 'string' || typeof item.topic !== 'string') return [];
    return [{ question: item.question, choices: item.choices, correctIndex: item.correctIndex, explanation: item.explanation, topic: item.topic }];
  });
}

export function normalizeQuizAnswer(value: QuizAnswerValue): string {
  const normalized = String(value).trim().toLowerCase();
  const numeric = Number(normalized);
  return normalized !== '' && Number.isFinite(numeric) ? String(numeric) : normalized;
}

export function gradeQuiz(questions: QuizQuestion[], answers: SubmittedQuizAnswer[]): QuizResult {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionIndex, answer.value]));
  const validQuestions = questions
    .map((question, questionIndex) => ({ question, questionIndex }))
    .filter(({ question }) => isValidQuizQuestion(question));

  if (!validQuestions.length) return { correct: 0, total: 0, missedQuestionIndexes: [], gradable: false };

  const missedQuestionIndexes: number[] = [];
  let correct = 0;
  validQuestions.forEach(({ question, questionIndex }) => {
    const submitted = answerByQuestion.get(questionIndex);
    const normalizedSubmitted = submitted === undefined ? '' : normalizeQuizAnswer(submitted);
    const normalizedIndex = normalizeQuizAnswer(question.correctIndex);
    const normalizedChoice = normalizeQuizAnswer(question.choices[question.correctIndex]);
    if (submitted !== undefined && (normalizedSubmitted === normalizedIndex || normalizedSubmitted === normalizedChoice)) correct += 1;
    else missedQuestionIndexes.push(questionIndex);
  });

  return { correct, total: validQuestions.length, missedQuestionIndexes, gradable: true };
}

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
