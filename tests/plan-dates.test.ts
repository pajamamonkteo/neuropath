import assert from 'node:assert/strict';
import test from 'node:test';

import { isIsoCalendarDate, localIsoDate, normalizePlanTaskDates, type PlanTaskDateFields } from '../lib/plan-dates.ts';

function task(overrides: Partial<PlanTaskDateFields> = {}): PlanTaskDateFields {
  return {
    scheduledDate: overrides.scheduledDate ?? '2030-04-10',
    dueDate: overrides.dueDate === undefined ? null : overrides.dueDate,
    dayNumber: overrides.dayNumber ?? 1,
  };
}

test('localIsoDate uses local calendar fields instead of UTC conversion', () => {
  const utcPlusEightJustAfterMidnight = {
    getFullYear: () => 2030,
    getMonth: () => 0,
    getDate: () => 15,
  };

  assert.equal(localIsoDate(utcPlusEightJustAfterMidnight), '2030-01-15');
});

test('calendar date validation rejects malformed and impossible dates', () => {
  assert.equal(isIsoCalendarDate('2030-02-28'), true);
  assert.equal(isIsoCalendarDate('2030-02-30'), false);
  assert.equal(isIsoCalendarDate('01/15/2030'), false);
});

test('plan dates are deterministically repaired into the planning window and ascending order', () => {
  const normalized = normalizePlanTaskDates([
    task({ scheduledDate: '2030-04-09', dueDate: '2030-04-08', dayNumber: 4 }),
    task({ scheduledDate: '2030-04-20', dueDate: '2030-04-30', dayNumber: 8 }),
    task({ scheduledDate: '2030-04-12', dayNumber: 6 }),
  ], '2030-04-10', '2030-04-15');

  assert.deepEqual(normalized.map((item) => item.scheduledDate), ['2030-04-10', '2030-04-15', '2030-04-15']);
  assert.deepEqual(normalized.map((item) => item.dueDate), ['2030-04-10', '2030-04-15', null]);
  assert.deepEqual(normalized.map((item) => item.dayNumber), [1, 2, 2]);
});

test('valid ascending plan dates are preserved', () => {
  const normalized = normalizePlanTaskDates([
    task({ scheduledDate: '2030-04-10', dayNumber: 1 }),
    task({ scheduledDate: '2030-04-12', dueDate: '2030-04-14', dayNumber: 3 }),
  ], '2030-04-10', '2030-04-15');

  assert.deepEqual(normalized, [
    task({ scheduledDate: '2030-04-10', dayNumber: 1 }),
    task({ scheduledDate: '2030-04-12', dueDate: '2030-04-14', dayNumber: 3 }),
  ]);
});

test('malformed AI task dates and past deadlines are rejected', () => {
  assert.throws(() => normalizePlanTaskDates([task({ scheduledDate: '2030-02-30' })], '2030-02-01', '2030-03-01'), /real date/);
  assert.throws(() => normalizePlanTaskDates([task()], '2030-04-11', '2030-04-10'), /before today/);
});
