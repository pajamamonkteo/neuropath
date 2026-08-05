import { NEUROPATH_CONTEXT } from '../../../lib/ai/neuropath-context';
import OpenAI from 'openai';
import { z } from 'zod';
import { isIsoCalendarDate, normalizePlanTaskDates } from '../../../lib/plan-dates';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isIsoCalendarDate, 'Date must be a real calendar date in YYYY-MM-DD format.');
const inputSchema = z.object({ title: z.string().trim().min(1).max(200), today: isoDateSchema, deadline: isoDateSchema, timeZone: z.string().trim().min(1).max(100).optional(), timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(), description: z.string().max(12000), rubricText: z.string().max(12000), energy: z.string().max(40).optional(), unreadAttachmentNames: z.array(z.string().max(255)).max(20).default([]) }).superRefine((value, context) => { if (value.deadline < value.today) context.addIssue({ code: z.ZodIssueCode.custom, path: ['deadline'], message: 'Deadline cannot be before today.' }); });
const taskSchema = z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(600), estimatedMinutes: z.number().int().min(1).max(45), dayNumber: z.number().int().min(1).max(365), scheduledDate: isoDateSchema, type: z.enum(['quick_start', 'work', 'checkpoint', 'review', 'submission']), dueDate: isoDateSchema.nullable(), subtasks: z.array(z.object({ title: z.string().trim().min(1).max(160), estimatedMinutes: z.number().int().min(1).max(45) })).min(1).max(6) });
const planSchema = z.object({ projectSummary: z.string().trim().min(1).max(1000), projectType: z.enum(['math', 'writing', 'studying', 'presentation', 'coding', 'creative', 'general']), assumptions: z.array(z.string().trim().min(1).max(500)).max(8), tasks: z.array(taskSchema).min(2).max(24) });

function formatTimezoneOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, '0')}:${String(absoluteMinutes % 60).padStart(2, '0')}`;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'Planner service is not configured.' }, { status: 503 });
  const body = inputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Please provide a title, the current local date, and a valid deadline that is not in the past.' }, { status: 400 });
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { today, deadline, timeZone, timezoneOffsetMinutes, ...project } = body.data;
    const timezoneDescription = timeZone ?? (timezoneOffsetMinutes === undefined ? 'not provided' : formatTimezoneOffset(timezoneOffsetMinutes));
    const response = await client.responses.create({instructions: NEUROPATH_CONTEXT, model: 'gpt-4.1-mini', input: `Return JSON only. Build a realistic day-based progressive plan for this project. The user's current local calendar date is ${today}. The user's timezone is ${timezoneDescription}. The project deadline is ${deadline}. Every task scheduledDate and every non-null dueDate must be on or after today (${today}) and on or before the deadline (${deadline}). All task dates must use strict YYYY-MM-DD format. Task scheduledDate values must be in ascending (nondecreasing) order. Every task needs dayNumber and scheduledDate. Use only the supplied title, description, rubric, deadline, and task context; unread attachments are not analysed. Each task must start with a clear action verb and name the actual topic, section, material, or output when the user provided one. Never use vague “study”, “research”, “review notes”, or “work on project” wording without a concrete object. Give most tasks 2-4 immediately actionable subtasks. Do not invent source material. First task <=5 minutes; later tasks generally 10-30 minutes and max 45. Progress challenge, volume, independence, or time pressure across days, using quantities where appropriate (5 questions, then 10, then a timed mixed quiz). Include specific mistake review, retrieval practice, revision, testing, or rehearsal by project type. Keep the number of parent tasks reasonable. Schema: ${JSON.stringify({ projectSummary: 'string', projectType: 'math|writing|studying|presentation|coding|creative|general', assumptions: ['string'], tasks: [{ title: 'string', description: 'string', estimatedMinutes: 10, dayNumber: 1, scheduledDate: 'YYYY-MM-DD', type: 'quick_start|work|checkpoint|review|submission', dueDate: 'YYYY-MM-DD or null', subtasks: [{ title: 'string', estimatedMinutes: 5 }] }] })}\nProject: ${JSON.stringify(project)}`, text: { format: { type: 'json_object' } } });
    const parsed = planSchema.safeParse(JSON.parse(response.output_text));
    if (!parsed.success) return Response.json({ error: 'The planner returned an invalid plan. Please retry.' }, { status: 502 });
    const tasks = normalizePlanTaskDates(parsed.data.tasks, today, deadline);
    const first = tasks[0]; const firstSubtaskMinutes = first.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0);
    if (first.estimatedMinutes > 5 || first.subtasks.some((subtask) => subtask.estimatedMinutes > 5) || firstSubtaskMinutes > 5) return Response.json({ error: 'The planner returned an invalid starting task. Please retry.' }, { status: 502 });
    return Response.json({ plan: { ...parsed.data, tasks }, source: 'ai' });
  } catch (error) { console.error('Plan generation failed', error); return Response.json({ error: 'We couldn’t generate your plan. Please retry.' }, { status: 502 }); }
}
