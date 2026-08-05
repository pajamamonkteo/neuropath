import assert from 'node:assert/strict';
import test from 'node:test';

import { markTaskSkipped, rescheduleUnfinishedTasks, type ScheduledProjectTask } from '../lib/task-schedule.ts';

function task(overrides: Partial<ScheduledProjectTask> & Pick<ScheduledProjectTask, 'id' | 'position' | 'scheduledDate'>): ScheduledProjectTask {
  return {
    id: overrides.id,
    title: overrides.title ?? `Task ${overrides.id}`,
    description: overrides.description ?? 'Keep the learning objective.',
    estimatedTime: overrides.estimatedTime ?? '20 min',
    position: overrides.position,
    dayNumber: overrides.dayNumber ?? overrides.position,
    scheduledDate: overrides.scheduledDate,
    status: overrides.status ?? 'pending',
    completed: overrides.completed ?? false,
    completedAt: overrides.completedAt ?? null,
    subtasks: overrides.subtasks ?? [{ title: 'Practice', estimatedMinutes: 20 }],
  };
}

test('skipping a task keeps it incomplete', () => {
  const tasks = [task({ id: 'one', position: 1, scheduledDate: '2026-08-05', status: 'active' })];
  const [skipped] = markTaskSkipped(tasks, 'one');

  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.completed, false);
  assert.equal(skipped.completedAt, null);
});

test('moving unfinished tasks preserves order without duplication', () => {
  const tasks = [
    task({ id: 'one', position: 1, scheduledDate: '2026-08-05', status: 'skipped' }),
    task({ id: 'two', position: 2, scheduledDate: '2026-08-05', status: 'active' }),
    task({ id: 'three', position: 3, scheduledDate: '2026-08-07' }),
  ];
  const result = rescheduleUnfinishedTasks(tasks, 'move', '2026-08-05', '2026-08-10');

  assert.deepEqual(result.tasks.map((item) => item.id), ['one', 'two', 'three']);
  assert.equal(new Set(result.tasks.map((item) => item.id)).size, result.tasks.length);
  assert.equal(result.tasks[0].scheduledDate, '2026-08-06');
  assert.equal(result.tasks[1].scheduledDate, '2026-08-06');
  assert.equal(result.tasks[2].scheduledDate, '2026-08-07');
  assert.match(result.explanation, /Completed tasks were not changed/);
});

test('completed tasks and their completion dates do not change during rollover', () => {
  const completedAt = '2026-08-05T03:00:00.000Z';
  const tasks = [
    task({ id: 'done', position: 1, scheduledDate: '2026-08-05', status: 'completed', completed: true, completedAt }),
    task({ id: 'open', position: 2, scheduledDate: '2026-08-05', status: 'skipped' }),
  ];
  const result = rescheduleUnfinishedTasks(tasks, 'lighter', '2026-08-05', '2026-08-10');
  const completed = result.tasks.find((item) => item.id === 'done');

  assert.equal(completed?.status, 'completed');
  assert.equal(completed?.completed, true);
  assert.equal(completed?.completedAt, completedAt);
});
