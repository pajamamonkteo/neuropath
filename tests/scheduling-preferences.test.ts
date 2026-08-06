import assert from 'node:assert/strict';
import test from 'node:test';

import { applySchedulingPreferences, changeTaskSchedule } from '../lib/scheduling-preferences.ts';

const datedTasks = [
  { id: 'one', scheduledDate: '2026-08-06' },
  { id: 'two', scheduledDate: '2026-08-08' },
];

test('a project with no preferred time keeps day-based scheduling', () => {
  const tasks = applySchedulingPreferences(datedTasks, { preferredWorkPeriod: 'none', timezone: 'Asia/Singapore', reminderOffsetMinutes: null });

  assert.deepEqual(tasks.map((task) => task.scheduledDate), ['2026-08-06', '2026-08-08']);
  assert.equal(tasks.some((task) => Boolean(task.scheduledTime)), false);
  assert.equal(tasks.some((task) => Boolean(task.preferredWorkPeriod)), false);
});

test('an evening preference is retained without inventing an exact time', () => {
  const tasks = applySchedulingPreferences(datedTasks, { preferredWorkPeriod: 'evening', timezone: 'Asia/Singapore', reminderOffsetMinutes: 30 });

  assert.deepEqual(tasks.map((task) => task.scheduledDate), ['2026-08-06', '2026-08-08']);
  assert.equal(tasks[0].preferredWorkPeriod, 'evening');
  assert.equal(tasks[0].scheduledTime, undefined);
  assert.equal(tasks[0].reminderOffsetMinutes, 30);
});

test('a user-selected specific time and timezone are copied to generated tasks', () => {
  const tasks = applySchedulingPreferences(datedTasks, { preferredWorkPeriod: 'specific', preferredTime: '19:30', timezone: 'Asia/Singapore', reminderOffsetMinutes: 15 });

  assert.equal(tasks[0].scheduledTime, '19:30');
  assert.equal(tasks[1].scheduledTime, '19:30');
  assert.equal(tasks[0].timezone, 'Asia/Singapore');
  assert.equal(tasks[0].reminderOffsetMinutes, 15);
});

test('task-level editing can add and change an exact time', () => {
  const added = changeTaskSchedule(datedTasks[0], 'scheduledTime', '08:45', 'Asia/Singapore');
  const changed = changeTaskSchedule(added, 'scheduledTime', '20:15', 'Asia/Singapore');

  assert.equal(changed.scheduledTime, '20:15');
  assert.equal(changed.preferredWorkPeriod, 'specific');
  assert.equal(changed.timezone, 'Asia/Singapore');
});

test('task-level editing can remove an exact time without removing its date', () => {
  const timed = applySchedulingPreferences([datedTasks[0]], { preferredWorkPeriod: 'specific', preferredTime: '19:30', timezone: 'Asia/Singapore' })[0];
  const untimed = changeTaskSchedule(timed, 'scheduledTime', '');

  assert.equal(untimed.scheduledDate, '2026-08-06');
  assert.equal(untimed.scheduledTime, undefined);
  assert.equal(untimed.preferredWorkPeriod, 'none');
});
