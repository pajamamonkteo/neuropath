import { QuizProjectType } from './quiz';

export type QuizTaskSource = { title: string; description: string; completed: boolean; quizTopic?: string; quizSkills?: string[] };
export type QuizContext = { subject: string; topic: string; skills: string[]; sourceText: string; questionCount: number; difficulty: 'easy' | 'medium' | 'hard' };
export type QuizSourceType = 'topic' | 'notes' | 'sample_quiz' | 'worksheet' | 'study_guide' | 'unknown';

const placeholderTopic = /^(topic|chapter|unit|module)\s*\d+\b|^(review material|study guide|practice questions|current task|assignment|project|quiz preparation)$/i;
const activityWords = /\b(practice|review|study|complete|prepare|work on|solve \d+ problems?|questions?)\b/gi;
const topicHint = /(?:about|on|from|covering|for)\s+(.{3,80})/i;

function cleanTopic(value = '') { return value.replace(activityWords, '').replace(/^[-:–—\s]+|[-:–—\s]+$/g, '').trim(); }
function validTopic(value: string) { return value.length >= 3 && !placeholderTopic.test(value); }

/** Detects structurally useful material without requiring prose notes or a manual chapter title. */
export function classifyQuizSource(material = '', topic = ''): QuizSourceType {
  const text = material.trim();
  if (!text && validTopic(topic)) return 'topic';
  if (!text) return 'unknown';
  const numbered = (text.match(/(?:^|\n)\s*\d+[.)]/g) || []).length;
  const choices = (text.match(/(?:^|\n)\s*[A-D][.)]/gi) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const blanks = (text.match(/_{3,}|\btrue\s+or\s+false\b|select the correct answer|answer key/gi) || []).length;
  const equations = (text.match(/[=±√∑÷×^]|\b(solve|calculate|evaluate)\b/gi) || []).length;
  if ((numbered >= 2 && (questions >= 1 || choices >= 2)) || choices >= 3 || questions >= 3 || /answer key/i.test(text)) return 'sample_quiz';
  if (blanks >= 1 || equations >= 2 || (numbered >= 2 && text.length >= 40)) return 'worksheet';
  if (/study guide|learning objectives|key terms/i.test(text)) return 'study_guide';
  return text.length >= 12 ? 'notes' : 'unknown';
}

export function deriveQuizContext(input: { title: string; description: string; rubricText: string; projectType: QuizProjectType; tasks: QuizTaskSource[]; questionCount: 5 | 10 }): QuizContext | null {
  const task = input.tasks.find((item) => !item.completed) ?? input.tasks[0];
  const supplied = [input.rubricText, input.description].filter((item) => item.trim()).join('\n');
  const titleTopic = cleanTopic(input.title);
  const taskTopic = cleanTopic(task?.quizTopic || task?.description || task?.title || '');
  const hinted = taskTopic.match(topicHint)?.[1]?.trim() || taskTopic;
  const topic = [task?.quizTopic, hinted, titleTopic].map((item) => cleanTopic(item || '')).find(validTopic) || '';
  const sourceSkills = (supplied.match(/(?:direct substitution|factoring|removable discontinuities|light-dependent reactions|calvin cycle|atp|nadph|chloroplast\w*)/gi) || []).map((item) => item.trim());
  const skills = Array.from(new Set([...(task?.quizSkills || []), ...sourceSkills].filter(validTopic))).slice(0, 6);
  const sourceText = supplied.trim();
  const enoughGrounding = Boolean(sourceText.length >= 20 || (validTopic(topic) && /\b(limit|derivative|integral|equation|formula|vocabulary|definition|grammar|translation)\b/i.test(topic)) || skills.length > 0);
  if (!validTopic(topic) || !enoughGrounding) return null;
  return { subject: input.projectType, topic, skills, sourceText, questionCount: input.questionCount, difficulty: 'medium' };
}

export function isInvalidQuizPrompt(prompt: string, context: QuizContext) {
  if (/\b(stud(y|ying)|review(ing)?|practi[cs](e|ing)?|plan(ning)?|clarity|time management|take a quiz|before solving)\b/i.test(prompt)) return true;
  if (placeholderTopic.test(prompt)) return true;
  // Rich pasted material is the grounding source; model wording need not repeat the manually entered topic verbatim.
  if (context.sourceText.replace(/\s/g, '').length >= 100) return false;
  const concepts = [context.topic, ...context.skills].map((item) => item.toLowerCase()).filter((item) => item.length > 3);
  return concepts.length > 0 && !concepts.some((item) => prompt.toLowerCase().includes(item) || item.split(/\s+/).some((word) => word.length > 4 && prompt.toLowerCase().includes(word)));
}
