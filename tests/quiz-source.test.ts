import assert from 'node:assert/strict';
import test from 'node:test';

import { determineQuizSource, GENERAL_KNOWLEDGE_NOTICE } from '../lib/quiz-context.ts';

test('a clear academic topic can use general knowledge without notes', () => {
  const decision = determineQuizSource('pre-21st-century presidents of the USA', '');

  assert.equal(decision.canGenerate, true);
  assert.equal(decision.mode, 'general_knowledge');
  assert.match(GENERAL_KNOWLEDGE_NOTICE, /No notes were supplied/);
});

test('an unclear topic without notes remains blocked', () => {
  const decision = determineQuizSource('history', '');

  assert.equal(decision.canGenerate, false);
  assert.equal(decision.mode, 'general_knowledge');
});

test('provided notes take priority over a clear general topic', () => {
  const decision = determineQuizSource('photosynthesis', 'Teacher notes: focus on the light-dependent reactions and the Calvin cycle.');

  assert.equal(decision.canGenerate, true);
  assert.equal(decision.mode, 'provided_material');
});

test('placeholder-only chapter content stays blocked and recommends material', () => {
  const decision = determineQuizSource('Chapter 5', '');

  assert.equal(decision.canGenerate, false);
  assert.equal(decision.stronglyRecommendMaterial, true);
});
