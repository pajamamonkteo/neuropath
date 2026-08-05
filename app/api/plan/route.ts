import OpenAI from 'openai';
import { z } from 'zod';
import { NEUROPATH_CONTEXT } from '../../../lib/ai/neuropath-context.ts';
import { isIsoCalendarDate, normalizePlanTaskDates } from '../../../lib/plan-dates.ts';
import { createFallbackPlan, QUIZ_FREE_PLAN_INSTRUCTIONS, sanitizeInteractiveQuizTasks } from '../../../lib/plan-content.ts';
import type { PlanProjectGoal } from '../../../lib/plan-content.ts';

const projectGoals = ['quiz_exam', 'essay_report', 'presentation', 'project_portfolio', 'general_study'] as const;
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isIsoCalendarDate, 'Date must be a real calendar date in YYYY-MM-DD format.');
const inputSchema = z.object({ title: z.string().trim().min(1).max(200), today: isoDateSchema, deadline: isoDateSchema, projectGoal: z.enum(projectGoals).default('general_study'), timeZone: z.string().trim().min(1).max(100).optional(), timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(), description: z.string().max(12000), rubricText: z.string().max(12000), energy: z.string().max(40).optional(), unreadAttachmentNames: z.array(z.string().max(255)).max(20).default([]) }).superRefine((value, context) => { if (value.deadline < value.today) context.addIssue({ code: z.ZodIssueCode.custom, path: ['deadline'], message: 'Deadline cannot be before today.' }); });
const taskSchema = z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(600), estimatedMinutes: z.number().int().min(1).max(45), dayNumber: z.number().int().min(1).max(365), scheduledDate: isoDateSchema, type: z.enum(['quick_start', 'work', 'checkpoint', 'review', 'submission']), dueDate: isoDateSchema.nullable(), subtasks: z.array(z.object({ title: z.string().trim().min(1).max(160), estimatedMinutes: z.number().int().min(1).max(45) })).min(1).max(6) });
const planSchema = z.object({ projectSummary: z.string().trim().min(1).max(1000), projectType: z.enum(['math', 'writing', 'studying', 'presentation', 'coding', 'creative', 'general']), assumptions: z.array(z.string().trim().min(1).max(500)).max(8), tasks: z.array(taskSchema).min(2).max(24) });
type PlanInput = z.infer<typeof inputSchema>;
type Plan = z.infer<typeof planSchema>;

function formatTimezoneOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, '0')}:${String(absoluteMinutes % 60).padStart(2, '0')}`;
}

function fallbackFor(input: PlanInput): Plan {
  return createFallbackPlan({ title: input.title, projectGoal: input.projectGoal as PlanProjectGoal, description: input.description, today: input.today, deadline: input.deadline });
}

function normalizeAndValidate(plan: Plan, input: PlanInput): Plan | null {
  const sanitized = sanitizeInteractiveQuizTasks(plan.tasks, { title: input.title, projectGoal: input.projectGoal as PlanProjectGoal });
  const tasks = normalizePlanTaskDates(sanitized, input.today, input.deadline);
  const first = tasks[0];
  const firstSubtaskMinutes = first.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0);
  if (first.estimatedMinutes > 5 || first.subtasks.some((subtask) => subtask.estimatedMinutes > 5) || firstSubtaskMinutes > 5) return null;
  return { ...plan, tasks };
}

function fallbackResponse(input: PlanInput) {
  const plan = normalizeAndValidate(fallbackFor(input), input) ?? fallbackFor(input);
  return Response.json({ plan, source: 'fallback' });
}

export async function POST(request: Request) {
  const body = inputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Please provide a title, the current local date, and a valid deadline that is not in the past.' }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return fallbackResponse(body.data);

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { today, deadline, timeZone, timezoneOffsetMinutes, ...project } = body.data;
    const timezoneDescription = timeZone ?? (timezoneOffsetMinutes === undefined ? 'not provided' : formatTimezoneOffset(timezoneOffsetMinutes));
    const planPrompt = `Return JSON only. Build a realistic day-based progressive plan for this project. The user's current local calendar date is ${today}. The user's timezone is ${timezoneDescription}. The project deadline is ${deadline}. Every task scheduledDate and every non-null dueDate must be on or after today (${today}) and on or before the deadline (${deadline}). All task dates must use strict YYYY-MM-DD format and be in ascending order. Use only the supplied title, goal, description, rubric, deadline, and task context; unread attachments are not analysed. Prefer concrete action verbs and name the actual topic, section, material, or output when available. Normal study activities such as reviewing notes, practice questions, worksheets, studying for an exam, and checking understanding are valid plan tasks. Give most tasks 2-4 actionable subtasks. Do not invent source material. First task <=5 minutes; later tasks generally 10-30 minutes and max 45. ${QUIZ_FREE_PLAN_INSTRUCTIONS} Schema: ${JSON.stringify({ projectSummary: 'string', projectType: 'math|writing|studying|presentation|coding|creative|general', assumptions: ['string'], tasks: [{ title: 'string', description: 'string', estimatedMinutes: 10, dayNumber: 1, scheduledDate: 'YYYY-MM-DD', type: 'quick_start|work|checkpoint|review|submission', dueDate: 'YYYY-MM-DD or null', subtasks: [{ title: 'string', estimatedMinutes: 5 }] }] })}\nProject: ${JSON.stringify(project)}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await client.responses.create({ instructions: NEUROPATH_CONTEXT, model: 'gpt-4.1-mini', input: attempt ? `${planPrompt}\nThe prior response failed schema validation. Return a corrected plan.` : planPrompt, text: { format: { type: 'json_object' } } });
      let responseData: unknown;
      try { responseData = JSON.parse(response.output_text); } catch { continue; }
      const parsed = planSchema.safeParse(responseData);
      if (!parsed.success) continue;
      const plan = normalizeAndValidate(parsed.data, body.data);
      if (plan) return Response.json({ plan, source: 'ai' });
    }

    return fallbackResponse(body.data);
  } catch (error) {
    console.error('Plan generation failed; using fallback plan', error);
    return fallbackResponse(body.data);
  }
}
