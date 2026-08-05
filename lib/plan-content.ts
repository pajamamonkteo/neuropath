export type PlanProjectGoal = 'quiz_exam' | 'essay_report' | 'presentation' | 'project_portfolio' | 'general_study';

export type PlanSubtaskContent = { title: string; estimatedMinutes: number };
export type PlanTaskContent = {
  title: string;
  description: string;
  estimatedMinutes: number;
  dayNumber: number;
  scheduledDate: string;
  type: 'quick_start' | 'work' | 'checkpoint' | 'review' | 'submission';
  dueDate: string | null;
  subtasks: PlanSubtaskContent[];
};

export const QUIZ_FREE_PLAN_INSTRUCTIONS = `Interactive NeuroPath quizzes are opt-in. Do not tell the learner to open or launch NeuroPath's quiz page, click “Test My Knowledge,” ask NeuroPath to generate a quiz, or take a NeuroPath quiz unless the request explicitly asks for that tool. Ordinary academic work is allowed, including reviewing notes, studying for an exam, answering practice questions, completing worksheet problems, checking understanding, and taking a teacher-provided practice quiz.`;

const explicitNeuroPathQuizPattern = /\btest my knowledge\b|\b(?:open|launch)\s+(?:the\s+)?(?:neuropath(?:'s)?\s+quiz(?:\s+(?:tool|page))?|quiz\s+(?:tool|page))\b|\buse\s+(?:the\s+)?(?:neuropath(?:'s)?\s+quiz|quiz\s+(?:tool|page))\b|\b(?:ask|have)\s+neuropath\s+to\s+(?:create|generate)\s+(?:a\s+)?quiz\b|\b(?:create|generate|start|take)\s+(?:a\s+|the\s+)?neuropath(?:'s)?\s+quiz\b|\b(?:open|launch|generate|start|take)\b.{0,45}\bquiz\b.{0,30}\b(?:in|with|using)\s+neuropath\b/i;

export function isExplicitNeuroPathQuizAction(text: string): boolean {
  return explicitNeuroPathQuizPattern.test(text);
}

function replacementFor(goal: PlanProjectGoal, title: string) {
  const projectTitle = trimTo(title, 110) || 'this project';
  switch (goal) {
    case 'quiz_exam': return { title: `Practice key material for ${projectTitle}`, description: 'Use class notes, practice questions, or worksheet problems. Check answers and mark topics that need another pass.', subtask: 'Complete one short set of practice questions' };
    case 'essay_report': return { title: `Review the draft for ${projectTitle}`, description: 'Compare the current draft with the instructions or rubric and make one concrete revision.', subtask: 'Make one evidence-based revision' };
    case 'presentation': return { title: `Rehearse ${projectTitle}`, description: 'Run through the presentation once and note one content or delivery improvement.', subtask: 'Rehearse one section and record one improvement' };
    case 'project_portfolio': return { title: `Review the current work for ${projectTitle}`, description: 'Compare the current output with the requirements and complete one missing or weak element.', subtask: 'Improve one required element' };
    case 'general_study': return { title: `Check progress on ${projectTitle}`, description: 'Review the work completed so far and choose one concrete next action.', subtask: 'Write down one concrete next action' };
  }
}

export function sanitizeInteractiveQuizTasks<T extends PlanTaskContent>(tasks: T[], project: { title: string; projectGoal: PlanProjectGoal }, allowInteractiveQuiz = false): T[] {
  if (allowInteractiveQuiz) return tasks;
  const replacement = replacementFor(project.projectGoal, project.title);
  return tasks.map((task) => {
    const replaceTask = isExplicitNeuroPathQuizAction(`${task.title} ${task.description}`);
    const subtasks = task.subtasks.map((subtask) => isExplicitNeuroPathQuizAction(subtask.title) ? { ...subtask, title: replacement.subtask } : subtask);
    return replaceTask ? { ...task, title: replacement.title, description: replacement.description, subtasks } : { ...task, subtasks };
  });
}

function trimTo(value: string, length: number): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean.length <= length ? clean : `${clean.slice(0, length - 1).trimEnd()}…`;
}

function dateAtFraction(today: string, deadline: string, fraction: number): string {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${deadline}T00:00:00Z`);
  return new Date(start + Math.round((end - start) * fraction)).toISOString().slice(0, 10);
}

export function createFallbackPlan(input: { title: string; projectGoal: PlanProjectGoal; description: string; today: string; deadline: string }) {
  const title = trimTo(input.title, 100) || 'the project';
  const context = trimTo(input.description, 420);
  const middleDate = dateAtFraction(input.today, input.deadline, 0.5);
  const goalSteps = {
    quiz_exam: { middleTitle: `Practice key material for ${title}`, middleDescription: 'Answer practice questions or complete worksheet problems, then check mistakes against class materials.', finalTitle: `Check readiness for ${title}`, finalDescription: 'Explain difficult ideas without notes, review mistakes, and list any topic that needs another pass.', projectType: 'studying' as const },
    essay_report: { middleTitle: `Draft the core sections of ${title}`, middleDescription: 'Write a rough but complete draft that addresses the supplied instructions and rubric.', finalTitle: `Revise and prepare ${title}`, finalDescription: 'Check structure, evidence, citations, formatting, and submission requirements.', projectType: 'writing' as const },
    presentation: { middleTitle: `Build the main slides for ${title}`, middleDescription: 'Create the core slide sequence with the required content and supporting evidence.', finalTitle: `Rehearse and refine ${title}`, finalDescription: 'Run through the presentation, improve unclear slides, and verify delivery requirements.', projectType: 'presentation' as const },
    project_portfolio: { middleTitle: `Build the main output for ${title}`, middleDescription: 'Create a complete rough version that covers the known project requirements.', finalTitle: `Review and finish ${title}`, finalDescription: 'Check the output against the requirements and complete missing or weak elements.', projectType: 'creative' as const },
    general_study: { middleTitle: `Complete the main work for ${title}`, middleDescription: 'Work through the central material or assignment requirements in a focused session.', finalTitle: `Review and finish ${title}`, finalDescription: 'Check understanding and completion, then address the most important remaining gap.', projectType: 'general' as const },
  }[input.projectGoal];

  const tasks: PlanTaskContent[] = [
    { title: `Open the instructions for ${title}`, description: context ? `Read the available instructions and identify the required output. Context: ${context}` : 'Read the available instructions and identify the required output.', estimatedMinutes: 5, dayNumber: 1, scheduledDate: input.today, type: 'quick_start', dueDate: null, subtasks: [{ title: 'Open the instructions and write down the required output', estimatedMinutes: 5 }] },
    { title: goalSteps.middleTitle, description: goalSteps.middleDescription, estimatedMinutes: 25, dayNumber: 2, scheduledDate: middleDate, type: 'work', dueDate: null, subtasks: [{ title: 'Complete the first focused work block', estimatedMinutes: 15 }, { title: 'Record what remains', estimatedMinutes: 5 }] },
    { title: goalSteps.finalTitle, description: goalSteps.finalDescription, estimatedMinutes: 25, dayNumber: 3, scheduledDate: input.deadline, type: 'submission', dueDate: input.deadline, subtasks: [{ title: 'Check the work against the requirements', estimatedMinutes: 10 }, { title: 'Complete the final correction or submission step', estimatedMinutes: 10 }] },
  ];

  return { projectSummary: trimTo(context ? `${title}: ${context}` : `A practical plan for ${title}.`, 1000), projectType: goalSteps.projectType, assumptions: ['A basic plan was created because the generated plan could not be used safely. Review and edit any step before starting.'], tasks };
}
