import { NEUROPATH_CONTEXT } from '../../../lib/ai/neuropath-context';
import OpenAI from 'openai';
import { z } from 'zod';

const inputSchema = z.object({ title: z.string().trim().min(1).max(200), deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().max(12000), rubricText: z.string().max(12000), energy: z.string().max(40).optional(), unreadAttachmentNames: z.array(z.string().max(255)).max(20).default([]) });
const taskSchema = z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(600), estimatedMinutes: z.number().int().min(1).max(45), dayNumber: z.number().int().min(1).max(365), scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), type: z.enum(['quick_start', 'work', 'checkpoint', 'review', 'submission']), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), subtasks: z.array(z.object({ title: z.string().trim().min(1).max(160), estimatedMinutes: z.number().int().min(1).max(45) })).min(1).max(6) });
const planSchema = z.object({ projectSummary: z.string().trim().min(1).max(1000), projectType: z.enum(['math', 'writing', 'studying', 'presentation', 'coding', 'creative', 'general']), assumptions: z.array(z.string().trim().min(1).max(500)).max(8), tasks: z.array(taskSchema).min(2).max(24) });

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'Planner service is not configured.' }, { status: 503 });
  const body = inputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Please provide a title and a valid deadline.' }, { status: 400 });
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({instructions: NEUROPATH_CONTEXT, model: 'gpt-4.1-mini', input: `Return JSON only. Build a realistic day-based progressive plan for this project. Every task needs dayNumber and scheduledDate on or before the deadline. Use title, description, rubric, and deadline only; unread attachments are not analysed. Each task must start with a clear action verb and name the actual topic, section, material, or output when the user provided one. Never use vague “study”, “research”, “review notes”, or “work on project” wording without a concrete object. Give most tasks 2-4 immediately actionable subtasks. Do not invent source material. First task <=5 minutes; later tasks generally 10-30 minutes and max 45. Progress challenge, volume, independence, or time pressure across days, using quantities where appropriate (5 questions, then 10, then a timed mixed quiz). Include specific mistake review, retrieval practice, revision, testing, or rehearsal by project type. Keep the number of parent tasks reasonable. Schema: ${JSON.stringify({ projectSummary: 'string', projectType: 'math|writing|studying|presentation|coding|creative|general', assumptions: ['string'], tasks: [{ title: 'string', description: 'string', estimatedMinutes: 10, dayNumber: 1, scheduledDate: 'YYYY-MM-DD', type: 'quick_start|work|checkpoint|review|submission', dueDate: 'YYYY-MM-DD or null', subtasks: [{ title: 'string', estimatedMinutes: 5 }] }] })}\nProject: ${JSON.stringify(body.data)}`, text: { format: { type: 'json_object' } } });
    const parsed = planSchema.safeParse(JSON.parse(response.output_text));
    if (!parsed.success) return Response.json({ error: 'The planner returned an invalid plan. Please retry.' }, { status: 502 });
    const first = parsed.data.tasks[0]; const firstSubtaskMinutes = first.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0);
    if (first.estimatedMinutes > 5 || first.subtasks.some((subtask) => subtask.estimatedMinutes > 5) || firstSubtaskMinutes > 5) return Response.json({ error: 'The planner returned an invalid starting task. Please retry.' }, { status: 502 });
    if (parsed.data.tasks.some((task) => task.scheduledDate > body.data.deadline)) return Response.json({ error: 'The planner returned an invalid schedule. Please retry.' }, { status: 502 });
    return Response.json({ plan: parsed.data, source: 'ai' });
  } catch (error) { console.error('Plan generation failed', error); return Response.json({ error: 'We couldn’t generate your plan. Please retry.' }, { status: 502 }); }
}
