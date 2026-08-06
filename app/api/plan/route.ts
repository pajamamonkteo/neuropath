import OpenAI from 'openai';
import { z } from 'zod';
import { NEUROPATH_CONTEXT } from '../../../lib/ai/neuropath-context.ts';
import { isIsoCalendarDate, normalizePlanTaskDates } from '../../../lib/plan-dates.ts';
import { createFallbackPlan, QUIZ_FREE_PLAN_INSTRUCTIONS, sanitizeInteractiveQuizTasks } from '../../../lib/plan-content.ts';
import type { PlanProjectGoal } from '../../../lib/plan-content.ts';
import { classifyPlanningMode, projectDurationDays } from '../../../lib/plan-metrics.ts';
import {
  extractSupportingFiles,
  isPdfSupportingFile,
  MAX_SUPPORTING_FILES,
  publicSupportingFileResults,
  validateSupportingFile,
  type SupportingFileInput,
  type SupportingFileResult,
} from '../../../lib/supporting-files.ts';

const PDF_FALLBACK_WARNING = 'We couldn\'t fully read this PDF. You can continue with your description or upload the relevant page as an image.';

const projectGoals = ['quiz_exam', 'essay_report', 'presentation', 'project_portfolio', 'general_study'] as const;
const pacingChoices = ['gentle', 'balanced', 'intensive'] as const;
const preferredWorkPeriods = ['none', 'morning', 'afternoon', 'evening', 'specific'] as const;
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isIsoCalendarDate, 'Date must be a real calendar date in YYYY-MM-DD format.');
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Time must use 24-hour HH:MM format.');
const inputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  today: isoDateSchema,
  deadline: isoDateSchema,
  projectGoal: z.enum(projectGoals).default('general_study'),
  timeZone: z.string().trim().min(1).max(100).optional(),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  description: z.string().max(12000),
  rubricText: z.string().max(12000),
  pacing: z.enum(pacingChoices).default('balanced'),
  preferredWorkPeriod: z.enum(preferredWorkPeriods).optional(),
  preferredTime: timeSchema.optional(),
  reminderOffsetMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60), z.null()]).optional(),
  energy: z.string().max(40).optional(),
  unreadAttachmentNames: z.array(z.string().max(255)).max(20).default([]),
}).superRefine((value, context) => {
  if (value.deadline < value.today) context.addIssue({ code: z.ZodIssueCode.custom, path: ['deadline'], message: 'Deadline cannot be before today.' });
  if (value.preferredWorkPeriod === 'specific' && !value.preferredTime) context.addIssue({ code: z.ZodIssueCode.custom, path: ['preferredTime'], message: 'Choose a preferred time.' });
});
const taskSchema = z.object({ title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(600), estimatedMinutes: z.number().int().min(1).max(45), dayNumber: z.number().int().min(1).max(365), scheduledDate: isoDateSchema, type: z.enum(['quick_start', 'work', 'checkpoint', 'review', 'submission']), dueDate: isoDateSchema.nullable(), subtasks: z.array(z.object({ title: z.string().trim().min(1).max(160), estimatedMinutes: z.number().int().min(1).max(45) })).min(1).max(6) });
const planSchema = z.object({ projectSummary: z.string().trim().min(1).max(1000), projectType: z.enum(['math', 'writing', 'studying', 'presentation', 'coding', 'creative', 'general']), planningMode: z.enum(['finite', 'phased']), assumptions: z.array(z.string().trim().min(1).max(500)).max(8), tasks: z.array(taskSchema).min(2).max(24) });
const documentAssessmentSchema = z.object({
  attachmentId: z.string().trim().min(1).max(255),
  usableDocumentContentReferenced: z.boolean(),
  contentBasis: z.enum(['text', 'page_images', 'text_and_page_images', 'none', 'uncertain']),
  containsComplexVisuals: z.boolean(),
  complexVisualsReferenced: z.boolean(),
});
const modelOutputSchema = planSchema.extend({ documentAssessments: z.array(documentAssessmentSchema).max(MAX_SUPPORTING_FILES).default([]) });

type PlanInput = z.infer<typeof inputSchema>;
type Plan = z.infer<typeof planSchema>;
type DocumentAssessment = z.infer<typeof documentAssessmentSchema>;
type OpenAIClient = Pick<OpenAI, 'files' | 'responses'>;
type PlanHandlerOptions = { apiKey?: string; createClient?: (apiKey: string) => OpenAIClient; development?: boolean; logger?: Pick<Console, 'info' | 'error'> };
type PdfDiagnostic = { filename: string; mimeType: string; fileSize: number; openAIAcceptedFile: boolean; responseStatus: number | null; modelReferencedUsableDocumentContent: boolean; apiError: string | null };

function formatTimezoneOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, '0')}:${String(absoluteMinutes % 60).padStart(2, '0')}`;
}

function fallbackFor(input: PlanInput, supportingFiles: SupportingFileResult[] = []): Plan {
  const extractedContext = supportingFiles.filter((file) => file.processingMethod === 'local_extraction' && file.text).map((file) => `${file.name}: ${file.text}`).join('\n\n');
  const description = [input.description, extractedContext].filter((value) => value.trim()).join('\n\n').slice(0, 12_000);
  const plan = createFallbackPlan({ title: input.title, projectGoal: input.projectGoal as PlanProjectGoal, description, today: input.today, deadline: input.deadline });
  return { ...plan, planningMode: classifyPlanningMode({ title: input.title, description, rubricText: input.rubricText, projectGoal: input.projectGoal, durationDays: projectDurationDays(input.today, input.deadline) }) };
}

function normalizeAndValidate(plan: Plan, input: PlanInput): Plan | null {
  const sanitized = sanitizeInteractiveQuizTasks(plan.tasks, { title: input.title, projectGoal: input.projectGoal as PlanProjectGoal });
  const tasks = normalizePlanTaskDates(sanitized, input.today, input.deadline);
  const first = tasks[0];
  const firstSubtaskMinutes = first.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0);
  if (first.estimatedMinutes > 5 || first.subtasks.some((subtask) => subtask.estimatedMinutes > 5) || firstSubtaskMinutes > 5) return null;
  return { ...plan, tasks };
}

function hasPdfWarning(results: SupportingFileResult[]): boolean {
  return results.some((file) => file.processingMethod === 'openai_pdf' && file.status !== 'extracted');
}

function fallbackResponse(input: PlanInput, supportingFiles: SupportingFileResult[] = []) {
  const plan = normalizeAndValidate(fallbackFor(input, supportingFiles), input) ?? fallbackFor(input, supportingFiles);
  return Response.json({
    plan,
    planDurationDays: projectDurationDays(input.today, input.deadline),
    planningModeResolution: { model: null, resolved: plan.planningMode, source: 'deterministic_fallback' },
    source: 'fallback',
    attachmentResults: publicSupportingFileResults(supportingFiles),
    warning: hasPdfWarning(supportingFiles) ? PDF_FALLBACK_WARNING : undefined,
  });
}

async function readRequest(request: Request): Promise<{ rawInput: unknown; files: SupportingFileInput[] }> {
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) return { rawInput: await request.json().catch(() => null), files: [] };
  const formData = await request.formData();
  const project = formData.get('project');
  const rawInput = typeof project === 'string' ? JSON.parse(project) : null;
  const fileValues = formData.getAll('files').filter((value): value is File => value instanceof File);
  const ids = formData.getAll('fileIds').filter((value): value is string => typeof value === 'string');
  return { rawInput, files: fileValues.map((file, index) => ({ id: ids[index] || `attachment-${index + 1}`, file })) };
}

async function prepareFiles(inputs: SupportingFileInput[]) {
  const pdfInputs: SupportingFileInput[] = [];
  const localInputs: SupportingFileInput[] = [];
  const resultsById = new Map<string, SupportingFileResult>();
  for (const input of inputs) {
    const invalid = validateSupportingFile(input);
    if (invalid) resultsById.set(input.id, invalid);
    else if (isPdfSupportingFile(input.file)) pdfInputs.push(input);
    else localInputs.push(input);
  }
  for (const result of await extractSupportingFiles(localInputs)) resultsById.set(result.id, result);
  return { pdfInputs, localResults: inputs.map((input) => resultsById.get(input.id)).filter((result): result is SupportingFileResult => Boolean(result)) };
}

function pdfResult(input: SupportingFileInput, status: SupportingFileResult['status'], message: string, contentMayBeMissing: boolean): SupportingFileResult {
  return { id: input.id, name: input.file.name, mimeType: input.file.type || 'application/pdf', size: input.file.size, processingMethod: 'openai_pdf', status, text: '', message, contentMayBeMissing };
}

function resultFromAssessment(input: SupportingFileInput, assessment: DocumentAssessment | undefined): SupportingFileResult {
  if (!assessment?.usableDocumentContentReferenced) return pdfResult(input, 'unreadable', PDF_FALLBACK_WARNING, true);
  if (assessment.contentBasis === 'page_images') return pdfResult(input, 'incomplete', 'OpenAI used the PDF page images, but this appears to be scanned or image-only, so some text may be unavailable.', true);
  if (assessment.contentBasis === 'uncertain' || assessment.contentBasis === 'none') return pdfResult(input, 'incomplete', PDF_FALLBACK_WARNING, true);
  if (assessment.containsComplexVisuals && !assessment.complexVisualsReferenced) return pdfResult(input, 'incomplete', 'Document text was used, but charts or diagrams were not relied on.', true);
  if (assessment.complexVisualsReferenced) return pdfResult(input, 'extracted', 'OpenAI used document content, including relevant page visuals.', false);
  return pdfResult(input, 'extracted', 'OpenAI used readable document content.', false);
}

function apiErrorText(error: unknown): string {
  if (error instanceof OpenAI.APIError) return `${error.name}${error.status ? ` (${error.status})` : ''}: ${error.message}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return 'Unknown API error';
}

function logDiagnostics(development: boolean, logger: Pick<Console, 'info' | 'error'>, diagnostics: PdfDiagnostic[]) {
  if (!development) return;
  diagnostics.forEach((diagnostic) => logger.info('[NeuroPath PDF diagnostic]', diagnostic));
}

async function handlePlanRequest(request: Request, options: PlanHandlerOptions = {}) {
  let requestData: Awaited<ReturnType<typeof readRequest>>;
  try { requestData = await readRequest(request); } catch { return Response.json({ error: 'The project details or attached files could not be read.' }, { status: 400 }); }
  if (requestData.files.length > MAX_SUPPORTING_FILES) return Response.json({ error: `Attach up to ${MAX_SUPPORTING_FILES} supporting files.` }, { status: 400 });
  const body = inputSchema.safeParse(requestData.rawInput);
  if (!body.success) return Response.json({ error: 'Please provide a title, the current local date, and a valid deadline that is not in the past.' }, { status: 400 });

  const { pdfInputs, localResults } = await prepareFiles(requestData.files);
  const development = options.development ?? process.env.NODE_ENV === 'development';
  const logger = options.logger ?? console;
  const diagnostics = pdfInputs.map((input): PdfDiagnostic => ({ filename: input.file.name, mimeType: input.file.type || 'application/pdf', fileSize: input.file.size, openAIAcceptedFile: false, responseStatus: null, modelReferencedUsableDocumentContent: false, apiError: null }));
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    diagnostics.forEach((item) => { item.apiError = 'OPENAI_API_KEY is not configured.'; });
    logDiagnostics(development, logger, diagnostics);
    return fallbackResponse(body.data, [...localResults, ...pdfInputs.map((input) => pdfResult(input, 'unreadable', PDF_FALLBACK_WARNING, true))]);
  }

  const client = (options.createClient ?? ((key) => new OpenAI({ apiKey: key })))(apiKey);
  const uploaded: { input: SupportingFileInput; fileId: string; diagnostic: PdfDiagnostic }[] = [];
  const failedPdfResults: SupportingFileResult[] = [];
  for (let index = 0; index < pdfInputs.length; index += 1) {
    const input = pdfInputs[index];
    try {
      const file = await client.files.create({ file: input.file, purpose: 'user_data' });
      diagnostics[index].openAIAcceptedFile = true;
      uploaded.push({ input, fileId: file.id, diagnostic: diagnostics[index] });
    } catch (error) {
      diagnostics[index].apiError = apiErrorText(error);
      failedPdfResults.push(pdfResult(input, 'unreadable', PDF_FALLBACK_WARNING, true));
    }
  }

  try {
    const { today, deadline, timeZone, timezoneOffsetMinutes, unreadAttachmentNames, ...project } = body.data;
    const timezoneDescription = timeZone ?? (timezoneOffsetMinutes === undefined ? 'not provided' : formatTimezoneOffset(timezoneOffsetMinutes));
    const extractedFiles = localResults.filter((file) => file.text).map((file) => ({ name: file.name, extractedText: file.text, contentMayBeMissing: file.contentMayBeMissing, extractionNote: file.message }));
    const unreadFiles = Array.from(new Set([...unreadAttachmentNames, ...localResults.filter((file) => !file.text).map((file) => file.name), ...failedPdfResults.map((file) => file.name)]));
    const uploadedDocuments = uploaded.map(({ input }) => ({ attachmentId: input.id, filename: input.file.name }));
    const planPrompt = `Return JSON only. Build a realistic day-based progressive plan for this project. The user's current local calendar date is ${today}. The user's timezone is ${timezoneDescription}. The project deadline is ${deadline}. Every task scheduledDate and every non-null dueDate must be on or after today (${today}) and on or before the deadline (${deadline}). All task dates must use strict YYYY-MM-DD format and be in ascending order. The user's pacing choice is ${project.pacing}; use it to adjust task density without exceeding the 45-minute task limit. Time-of-day preferences must not change the task count or date distribution. Return dates only and never invent or return clock times; the application applies the user's explicit period or time deterministically after generation. Classify both the nature of the goal and its duration. Set planningMode to "phased" for a long-running progressive goal that will grow through future batches, and "finite" for a bounded deliverable. Use the title, deadline, written description, rubric, pacing choice, locally extracted non-PDF text, and attached PDF files together. PDF files are supplied as actual input_file items, not filenames. Do not invent document content. Only rely on charts, tables, diagrams, or other visuals when you actually inspect and use their page-image content. For every uploaded PDF, return one documentAssessments entry using its attachmentId. Set usableDocumentContentReferenced true only if the plan or summary uses concrete content from that PDF. Use contentBasis page_images when usable content came only from page images, as with an image-only scan. Set containsComplexVisuals and complexVisualsReferenced independently; never claim a visual was understood merely because a PDF was attached. Uploaded PDFs: ${JSON.stringify(uploadedDocuments)}. Unread attachments are not analysed: ${JSON.stringify(unreadFiles)}. Prefer concrete action verbs and name the actual topic, section, material, or output when available. Give most tasks 2-4 actionable subtasks. First task <=5 minutes; later tasks generally 10-30 minutes and max 45. ${QUIZ_FREE_PLAN_INSTRUCTIONS} Schema: ${JSON.stringify({ projectSummary: 'string', projectType: 'math|writing|studying|presentation|coding|creative|general', planningMode: 'finite|phased', assumptions: ['string'], tasks: [{ title: 'string', description: 'string', estimatedMinutes: 10, dayNumber: 1, scheduledDate: 'YYYY-MM-DD', type: 'quick_start|work|checkpoint|review|submission', dueDate: 'YYYY-MM-DD or null', subtasks: [{ title: 'string', estimatedMinutes: 5 }] }], documentAssessments: [{ attachmentId: 'matching uploaded attachmentId', usableDocumentContentReferenced: true, contentBasis: 'text|page_images|text_and_page_images|none|uncertain', containsComplexVisuals: false, complexVisualsReferenced: false }] })}\nProject: ${JSON.stringify({ ...project, today, deadline, supportingFiles: extractedFiles })}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const content = [
        ...uploaded.map(({ fileId }) => ({ type: 'input_file' as const, file_id: fileId, detail: 'high' as const })),
        { type: 'input_text' as const, text: attempt ? `${planPrompt}\nThe prior response failed schema validation. Return a corrected plan.` : planPrompt },
      ];
      const { data: response, response: rawResponse } = await client.responses.create({ instructions: NEUROPATH_CONTEXT, model: 'gpt-4.1-mini', input: [{ role: 'user', content }], text: { format: { type: 'json_object' } } }).withResponse();
      diagnostics.forEach((item) => { item.responseStatus = rawResponse.status; });
      let responseData: unknown;
      try { responseData = JSON.parse(response.output_text); } catch {
        diagnostics.forEach((item) => { item.apiError = 'The model response was not valid JSON.'; });
        continue;
      }
      const parsed = modelOutputSchema.safeParse(responseData);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        diagnostics.forEach((item) => { item.apiError = `The model response failed schema validation: ${issues}`; });
        continue;
      }
      const assessmentById = new Map(parsed.data.documentAssessments.map((assessment) => [assessment.attachmentId, assessment]));
      const pdfResults = uploaded.map(({ input, diagnostic }) => {
        const assessment = assessmentById.get(input.id);
        diagnostic.modelReferencedUsableDocumentContent = assessment?.usableDocumentContentReferenced ?? false;
        return resultFromAssessment(input, assessment);
      });
      const resolvedPlanningMode = classifyPlanningMode({ title: body.data.title, description: body.data.description, rubricText: body.data.rubricText, projectGoal: body.data.projectGoal, durationDays: projectDurationDays(today, deadline), modelMode: parsed.data.planningMode });
      const { documentAssessments: _documentAssessments, ...modelPlan } = parsed.data;
      const plan = normalizeAndValidate({ ...modelPlan, planningMode: resolvedPlanningMode }, body.data);
      if (!plan) {
        diagnostics.forEach((item) => { item.apiError = 'The model plan failed NeuroPath task validation.'; });
        continue;
      }
      const supportingFiles = [...localResults, ...failedPdfResults, ...pdfResults];
      logDiagnostics(development, logger, diagnostics);
      return Response.json({
        plan,
        planDurationDays: projectDurationDays(today, deadline),
        planningModeResolution: { model: parsed.data.planningMode, resolved: plan.planningMode, source: parsed.data.planningMode === plan.planningMode ? 'model_confirmed' : 'deterministic_override' },
        source: 'ai',
        attachmentResults: publicSupportingFileResults(supportingFiles),
        warning: hasPdfWarning(supportingFiles) ? PDF_FALLBACK_WARNING : undefined,
      });
    }

    diagnostics.forEach((item) => { if (!item.apiError) item.apiError = 'The model response did not provide a valid document assessment and plan.'; });
    const supportingFiles = [...localResults, ...failedPdfResults, ...uploaded.map(({ input }) => pdfResult(input, 'unreadable', PDF_FALLBACK_WARNING, true))];
    logDiagnostics(development, logger, diagnostics);
    return fallbackResponse(body.data, supportingFiles);
  } catch (error) {
    const errorText = apiErrorText(error);
    diagnostics.forEach((item) => { if (!item.apiError) item.apiError = errorText; });
    logDiagnostics(development, logger, diagnostics);
    logger.error('Plan generation failed; using fallback plan', error instanceof Error ? error.name : 'Unknown error');
    const supportingFiles = [...localResults, ...failedPdfResults, ...uploaded.map(({ input }) => pdfResult(input, 'unreadable', PDF_FALLBACK_WARNING, true))];
    return fallbackResponse(body.data, supportingFiles);
  }
}

export async function POST(request: Request) {
  return handlePlanRequest(request);
}
