export const projectGoals = ['quiz_exam', 'essay_report', 'presentation', 'project_portfolio', 'general_study'] as const;
export type ProjectGoal = (typeof projectGoals)[number];
export type EvaluationType = 'quiz' | 'rubric-review' | 'deliverable-review' | 'reflection' | 'practice';

/** MVP routing is deterministic. Project and task text is never inspected. */
export function evaluationTypeForGoal(goal: ProjectGoal, rubricText = ''): EvaluationType {
  switch (goal) {
    case 'quiz_exam': return 'quiz';
    case 'essay_report': return rubricText.trim() ? 'rubric-review' : 'reflection';
    case 'presentation':
    case 'project_portfolio': return 'deliverable-review';
    case 'general_study': return 'reflection';
  }
}

export const evaluationLabel: Record<EvaluationType, string> = {
  quiz: 'Test my knowledge',
  'rubric-review': 'Review against rubric',
  'deliverable-review': 'Review my work',
  reflection: 'Check my progress',
  practice: 'Log practice',
};
