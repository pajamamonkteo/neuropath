export const QUIZ_FREE_PLAN_INSTRUCTIONS = `Quiz creation is opt-in and happens outside project planning. Never add a task or subtask that asks the learner to take, start, create, or generate a quiz; click “Test My Knowledge”; complete multiple-choice questions; or use a quiz as a daily task, check-in, milestone, or completion requirement. For essay, report, presentation, portfolio, and general-assignment projects, do not mention quizzes at all. For quiz or exam preparation, use source review, active recall, practice problems, mistake review, and rehearsal without directing the learner to a generated quiz.`;

const quizTaskPattern = /\bquiz(?:zes|zing)?\b|\btest my knowledge\b|\btest (?:your|the learner's) (?:knowledge|understanding)\b|\bknowledge check\b|\bself[- ]test\b|\bcreate (?:a )?quiz\b|\bgenerate (?:a )?quiz\b|\bstart (?:a |the )?quiz\b|\btake (?:a |the )?quiz\b|\bmultiple[- ]choice\b/i;

export function planContainsQuizTask(tasks: Array<{ title: string; description: string; subtasks: Array<{ title: string }> }>): boolean {
  return tasks.some((task) => quizTaskPattern.test([task.title, task.description, ...task.subtasks.map((subtask) => subtask.title)].join(' ')));
}
