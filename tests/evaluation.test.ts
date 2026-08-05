import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluationTypeForGoal } from '../lib/evaluation.ts';

test('quiz or exam projects use a non-quiz routine check-in', () => {
  assert.equal(evaluationTypeForGoal('quiz_exam'), 'practice');
});

test('non-quiz projects retain work-appropriate check-ins', () => {
  assert.equal(evaluationTypeForGoal('essay_report', 'Thesis and citations'), 'rubric-review');
  assert.equal(evaluationTypeForGoal('presentation'), 'deliverable-review');
  assert.equal(evaluationTypeForGoal('general_study'), 'reflection');
});
