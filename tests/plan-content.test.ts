import assert from 'node:assert/strict';
import test from 'node:test';

import { planContainsQuizTask } from '../lib/plan-content.ts';

const task = (title: string, description = '', subtasks: string[] = []) => ({
  title,
  description,
  subtasks: subtasks.map((subtaskTitle) => ({ title: subtaskTitle })),
});

test('rejects quiz prompts anywhere in a generated task', () => {
  assert.equal(planContainsQuizTask([task('Draft the introduction', '', ['Take a timed mixed quiz'])]), true);
  assert.equal(planContainsQuizTask([task('Test My Knowledge')]), true);
  assert.equal(planContainsQuizTask([task('Complete multiple-choice questions')]), true);
  assert.equal(planContainsQuizTask([task('Run a knowledge check')]), true);
  assert.equal(planContainsQuizTask([task('Self-test on key dates')]), true);
});

test('allows non-quiz exam preparation activities', () => {
  assert.equal(planContainsQuizTask([
    task('Recall the stages of mitosis', 'Write each stage from memory.'),
    task('Solve five practice problems', 'Check mistakes against your notes.'),
  ]), false);
});
