export type PlanningMode = 'finite' | 'phased';
export type PlanningGoal = 'quiz_exam' | 'essay_report' | 'presentation' | 'project_portfolio' | 'general_study';

export type PlanSummaryMetric = { label: string; value: string };

export function projectDurationDays(today: string, deadline: string): number {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${deadline}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

export function formatPlanDuration(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days - years * 365) / 30.4);
    const yearLabel = `${years} ${years === 1 ? 'year' : 'years'}`;
    return months > 0 ? `${yearLabel} ${months} ${months === 1 ? 'month' : 'months'}` : yearLabel;
  }
  if (days >= 60) {
    const months = Math.max(2, Math.round(days / 30.4));
    return `${months} months`;
  }
  if (days >= 14) {
    const weeks = Math.round(days / 7);
    return `${weeks} weeks`;
  }
  return `${Math.max(1, days)} ${days === 1 ? 'day' : 'days'}`;
}

export function classifyPlanningMode(input: { title: string; description: string; rubricText?: string; projectGoal: PlanningGoal; durationDays: number; modelMode?: PlanningMode }): PlanningMode {
  const text = `${input.title}\n${input.description}\n${input.rubricText || ''}`;
  const isLongEnoughForPhases = input.durationDays >= 90;
  if (!isLongEnoughForPhases) return 'finite';

  const isFiniteGoal = input.projectGoal === 'quiz_exam' || input.projectGoal === 'essay_report' || input.projectGoal === 'presentation';
  const namesFiniteDeliverable = /\b(essay|report|presentation|slide deck|specific exam|final exam|midterm|quiz|assignment|submit|submission|due date|final paper)\b/i.test(text);
  if (isFiniteGoal || namesFiniteDeliverable) return 'finite';

  const languageProgression = /\b(language acquisition|foreign language|second language|fluenc(?:y|t)|(?:A1|A2|B1|B2|C1|C2)(?:\s+level)?|Portuguese|Spanish|French|German|Italian|Mandarin|Chinese|Japanese|Korean|Arabic|Russian|Hindi|English)\b/i.test(text);
  const progressivePractice = /\b(ongoing|long[- ]term|year[- ]long|throughout the year|phased|in phases|rolling plan|recurring|continuously|as (?:i|we|you) progress|improve(?: at| my)?|develop(?: a| my)?|build(?: a| my)? habit|master(?:ing)?|fitness|drawing|painting|practice routine|broad skill)\b/i.test(text);
  const learningGoal = /\b(learn|learning|improve|improving|develop|developing|master|mastering|practi[cs]e|training)\b/i.test(text);
  if (languageProgression || progressivePractice || learningGoal) return 'phased';

  return input.modelMode === 'phased' ? 'phased' : 'finite';
}

export function planSummaryMetrics(input: { planningMode: PlanningMode; durationDays: number; taskCount: number; deadline: string }): { metrics: PlanSummaryMetric[]; note: string | null } {
  if (input.planningMode === 'phased') {
    return {
      metrics: [
        { label: 'Plan length', value: formatPlanDuration(input.durationDays) },
        { label: 'Currently scheduled', value: `${input.taskCount} ${input.taskCount === 1 ? 'task' : 'tasks'}` },
      ],
      note: 'More tasks will be scheduled as you progress.',
    };
  }
  return {
    metrics: [{ label: 'Tasks', value: String(input.taskCount) }, { label: 'Deadline', value: input.deadline }],
    note: null,
  };
}
