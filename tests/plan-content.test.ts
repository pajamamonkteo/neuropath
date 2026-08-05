import assert from 'node:assert/strict';
import test from 'node:test';

import { createFallbackPlan, isExplicitNeuroPathQuizAction, sanitizeInteractiveQuizTasks } from '../lib/plan-content.ts';
import type { PlanTaskContent } from '../lib/plan-content.ts';

const task = (title: string, description = '', subtasks: string[] = []): PlanTaskContent => ({
  title,
  description,
  estimatedMinutes: 20,
  dayNumber: 1,
  scheduledDate: '2026-08-05',
  type: 'work',
  dueDate: null,
  subtasks: (subtasks.length ? subtasks : ['Complete the task']).map((subtaskTitle) => ({ title: subtaskTitle, estimatedMinutes: 5 })),
});

test('exam study plans and normal academic practice are allowed', () => {
  const allowed = [
    'Review notes for the biology exam',
    'Study for the history exam',
    'Answer ten practice questions',
    'Complete worksheet problems',
    'Check understanding of mitosis',
    'Take a teacher-provided practice quiz',
    'Complete multiple-choice questions from the workbook',
    'Open quiz notes from last week',
    'Use quiz results to choose practice questions',
  ];
  allowed.forEach((text) => assert.equal(isExplicitNeuroPathQuizAction(text), false, text));
});

test('only the explicit NeuroPath quiz task is replaced', () => {
  const practiceTask = task('Answer ten practice questions');
  const appQuizTask = task('Open the NeuroPath quiz page', 'Click Test My Knowledge and take a NeuroPath quiz.');
  const result = sanitizeInteractiveQuizTasks([practiceTask, appQuizTask], { title: 'Biology exam', projectGoal: 'quiz_exam' });

  assert.equal(result[0].title, practiceTask.title);
  assert.match(result[1].title, /Practice key material/);
  assert.doesNotMatch(`${result[1].title} ${result[1].description}`, /NeuroPath quiz|Test My Knowledge/i);
});

test('an explicitly requested NeuroPath quiz remains available', () => {
  const requested = task('Open the NeuroPath quiz page', 'Click Test My Knowledge.');
  const result = sanitizeInteractiveQuizTasks([requested], { title: 'Biology exam', projectGoal: 'quiz_exam' }, true);
  assert.deepEqual(result, [requested]);
});

test('fallback exam plans use ordinary study and practice work', () => {
  const plan = createFallbackPlan({ title: 'Biology final', projectGoal: 'quiz_exam', description: 'Cell division and genetics', today: '2026-08-05', deadline: '2026-08-12' });
  assert.equal(plan.projectType, 'studying');
  assert.equal(plan.tasks.length, 3);
  assert.match(plan.tasks[1].description, /practice questions|worksheet problems/i);
  assert.equal(plan.tasks[0].estimatedMinutes, 5);
  assert.equal(plan.tasks[2].scheduledDate, '2026-08-12');
});

test('fallback essay plans stay focused on drafting and revision', () => {
  const plan = createFallbackPlan({ title: 'History essay', projectGoal: 'essay_report', description: 'Compare two primary sources', today: '2026-08-05', deadline: '2026-08-10' });
  assert.equal(plan.projectType, 'writing');
  assert.match(plan.tasks[1].title, /Draft/);
  assert.match(plan.tasks[2].title, /Revise/);
  assert.equal(plan.tasks.some((item) => isExplicitNeuroPathQuizAction(`${item.title} ${item.description}`)), false);
});
