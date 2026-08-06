import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPlanningMode, formatPlanDuration, planSummaryMetrics, projectDurationDays } from '../lib/plan-metrics.ts';

test('phased plans distinguish total duration from the active task batch', () => {
  const summary = planSummaryMetrics({ planningMode: 'phased', durationDays: 365, taskCount: 11, deadline: '2027-08-06' });
  assert.deepEqual(summary.metrics, [
    { label: 'Plan length', value: '1 year' },
    { label: 'Currently scheduled', value: '11 tasks' },
  ]);
  assert.equal(summary.note, 'More tasks will be scheduled as you progress.');
});

test('finite plans retain the normal total task count and deadline', () => {
  const summary = planSummaryMetrics({ planningMode: 'finite', durationDays: 365, taskCount: 11, deadline: '2027-08-06' });
  assert.deepEqual(summary.metrics, [
    { label: 'Tasks', value: '11' },
    { label: 'Deadline', value: '2027-08-06' },
  ]);
  assert.equal(summary.note, null);
});

test('duration and phased-mode helpers are deterministic', () => {
  assert.equal(projectDurationDays('2026-08-06', '2027-08-06'), 365);
  assert.equal(formatPlanDuration(365), '1 year');
  assert.equal(projectDurationDays('2026-08-06', '2027-11-25'), 476);
  assert.equal(formatPlanDuration(476), '1 year 3 months');
});

test('classification uses both progressive goal nature and duration', () => {
  assert.equal(classifyPlanningMode({ title: 'Learn Portuguese to C2 level using research-based language acquisition principles', description: '', projectGoal: 'general_study', durationDays: 476 }), 'phased');
  assert.equal(classifyPlanningMode({ title: 'Improve at drawing', description: 'Build skill through regular practice', projectGoal: 'general_study', durationDays: 180 }), 'phased');
  assert.equal(classifyPlanningMode({ title: 'Build a fitness habit', description: '', projectGoal: 'general_study', durationDays: 180 }), 'phased');
  assert.equal(classifyPlanningMode({ title: 'Learn Portuguese', description: '', projectGoal: 'general_study', durationDays: 30 }), 'finite');
});

test('finite deliverables override duration and an incorrect model label', () => {
  assert.equal(classifyPlanningMode({ title: 'Write a history essay', description: 'Submit the final paper', projectGoal: 'essay_report', durationDays: 476, modelMode: 'phased' }), 'finite');
  assert.equal(classifyPlanningMode({ title: 'Study for a specific exam', description: '', projectGoal: 'quiz_exam', durationDays: 180, modelMode: 'phased' }), 'finite');
  assert.equal(classifyPlanningMode({ title: 'Learn Portuguese to C2', description: '', projectGoal: 'general_study', durationDays: 476, modelMode: 'finite' }), 'phased');
});
