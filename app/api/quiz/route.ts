import OpenAI from 'openai';
import { z } from 'zod';
import { NEUROPATH_CONTEXT } from '../../../lib/ai/neuropath-context';
import { classifyQuizSource, determineQuizSource, isInvalidQuizPrompt, QuizContext } from '../../../lib/quiz-context';

const sourceSchema = z.object({ projectId: z.string().min(1), taskId: z.string(), subject: z.string().trim().min(1).max(100), topic: z.string().trim().max(300), sourceText: z.string().max(20000), rubricText: z.string().max(12000), sourceMode: z.enum(['general_knowledge', 'provided_material']), quizSkills: z.array(z.string().trim().min(1).max(120)).max(12), questionCount: z.union([z.literal(5), z.literal(10)]) });
const questionSchema = z.object({ question: z.string().trim().min(8), choices: z.array(z.string().trim().min(1)).length(4).refine((choices) => new Set(choices.map((choice) => choice.toLowerCase())).size === 4), correctIndex: z.number().int().min(0).max(3), explanation: z.string().trim().min(1), topic: z.string().trim().min(2) });
const quizSchema = z.object({ title: z.string().trim().min(1), questions: z.array(questionSchema).min(1) });

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'Quiz service is not configured.' }, { status: 503 });
  const body = sourceSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Quiz details are invalid.', detail: body.error.issues[0]?.message }, { status: 400 });
  const sourceText = [body.data.sourceText.trim(), body.data.rubricText.trim()].filter(Boolean).join('\n\n');
  const sourceType = classifyQuizSource(body.data.sourceText, body.data.topic);
  const topic = body.data.topic || sourceText.split(/\n|[.!?]/)[0]?.slice(0, 160).trim() || '';
  const sourceDecision = determineQuizSource(topic, sourceText);
  if (!sourceDecision.canGenerate) return Response.json({ error: 'Add a clear academic topic or enough source material before starting the quiz.' }, { status: 400 });
  const sourceMode = sourceDecision.mode;
  const context: QuizContext = { subject: body.data.subject, topic, skills: body.data.quizSkills, sourceText, sourceMode, questionCount: body.data.questionCount, difficulty: 'medium' };
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const schema = { title: 'string', questions: [{ question: 'string', choices: ['string', 'string', 'string', 'string'], correctIndex: 0, explanation: 'string', topic: 'string' }] };
  const groundingInstruction = sourceMode === 'provided_material'
    ? 'Prioritize and ground every question in QuizContext.sourceText. Use the named topic only to clarify the supplied material; do not replace class-specific details with generic coverage.'
    : 'No source material was supplied. Generate a stable, general-knowledge academic quiz about QuizContext.topic. Do not claim to browse, search Google, use live web results, or match a particular textbook, teacher, class, or syllabus.';
  const instruction = `Return JSON only. Generate exactly ${context.questionCount} questions. Quiz source mode: ${sourceMode}. Source type: ${sourceType}. ${groundingInstruction} Do not generate questions about studying, planning, reviewing, practising, task completion, or quiz-taking. Never use placeholder labels such as Topic 1 or Chapter 1. If the source is a sample_quiz or worksheet, extract its academic concepts, recurring terminology, formulas, question formats, and approximate difficulty; create new questions testing the same concepts without copying prompts word-for-word. For mathematics with a named concept, generate actual solvable problems and verify the correct answer. Four distinct choices, one correct answer, and an explanation that names the relevant concept. Schema: ${JSON.stringify(schema)}\nQuizContext: ${JSON.stringify(context)}`;
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) { const response = await client.responses.create({ instructions: NEUROPATH_CONTEXT, model: 'gpt-4.1-mini', input: attempt ? `${instruction}\nThe prior response failed relevance checks. Regenerate within the selected source mode.` : instruction, text: { format: { type: 'json_object' } } }); const quiz = quizSchema.safeParse(JSON.parse(response.output_text)); const invalid = !quiz.success || quiz.data.questions.length !== context.questionCount || quiz.data.questions.some((item) => isInvalidQuizPrompt(item.question, context) || isInvalidQuizPrompt(item.topic, context)); if (!invalid) return Response.json({ quiz: quiz.data, context, sourceMode }); }
    return Response.json({ error: 'The supplied material is not specific enough for a reliable quiz. Add more notes or a clearer chapter/concept.' }, { status: 502 });
  } catch (error) { console.error('Quiz generation failed', error); return Response.json({ error: 'We couldn’t generate your quiz. Please retry.' }, { status: 502 }); }
}
