import assert from 'node:assert/strict';
import test from 'node:test';

import { loadProjectState, saveProjectState } from '../lib/project-storage.ts';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test('task rollover state persists after a simulated page refresh', () => {
  const localStorage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', { value: { localStorage }, configurable: true });
  const project = {
    id: 'project-one',
    title: 'Biology',
    attachments: [],
    tasks: [{ id: 'task-one', title: 'Photosynthesis', status: 'pending', completed: false, completedAt: null, scheduledDate: '2026-08-06', dayNumber: 2, subtasks: [{ id: 'read', title: 'Read', estimatedMinutes: 5, completed: true, required: true }, { id: 'practice', title: 'Practice', estimatedMinutes: 10, completed: false, required: true }] }],
  };

  saveProjectState([project], project.id);
  const refreshed = loadProjectState();
  const savedTask = ((refreshed?.projects[0]?.tasks as Record<string, unknown>[]) ?? [])[0];

  assert.equal(refreshed?.activeProjectId, project.id);
  assert.equal(savedTask.status, 'pending');
  assert.equal(savedTask.completed, false);
  assert.equal(savedTask.scheduledDate, '2026-08-06');
  const savedSubtasks = savedTask.subtasks as Record<string, unknown>[];
  assert.deepEqual(savedSubtasks.map((subtask) => subtask.completed), [true, false]);
});
