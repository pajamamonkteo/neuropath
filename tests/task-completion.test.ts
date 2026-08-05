import assert from 'node:assert/strict';
import test from 'node:test';

import { canCompleteTask, completeTaskRecord, REQUIRED_SUBTASKS_MESSAGE } from '../lib/task-completion.ts';
import type { ProjectTask, Subtask } from '../lib/storage.ts';

function subtask(id: string, completed: boolean, required = true): Subtask {
  return { id, title: `Step ${id}`, estimatedMinutes: 5, completed, required };
}

function task(subtasks: Subtask[]): ProjectTask {
  return { id: 'task-one', title: 'Task', description: 'Description', estimatedTime: '15 min', position: 1, dayNumber: 1, scheduledDate: '2026-08-05', status: 'active', completed: false, completedAt: null, subtasks };
}

test('Complete task is disabled when a required subtask is incomplete', () => {
  assert.equal(canCompleteTask(task([subtask('one', true), subtask('two', false)])), false);
});

test('Complete task is enabled when all required subtasks are complete', () => {
  assert.equal(canCompleteTask(task([subtask('one', true), subtask('two', true)])), true);
});

test('an incomplete optional subtask does not block completion', () => {
  assert.equal(canCompleteTask(task([subtask('required', true), subtask('optional', false, false)])), true);
});

test('a task without subtasks can be completed', () => {
  assert.equal(canCompleteTask(task([])), true);
});

test('the completion handler rejects an incomplete task when called directly', () => {
  const original = task([subtask('required', false)]);
  const result = completeTaskRecord([original], original.id, '2026-08-05T08:00:00.000Z');

  assert.equal(result.completed, false);
  assert.equal(result.error, REQUIRED_SUBTASKS_MESSAGE);
  assert.equal(result.tasks[0].status, 'active');
  assert.equal(result.tasks[0].completed, false);
  assert.equal(result.tasks[0].completedAt, null);
});
