'use client';

import { useEffect, useState } from 'react';

export type Project = {
  id: string;
  title: string;
  progress: number;
  next: string;
  due: string;
  tone: string;
  type: string;
  subject: string;
  workload: string;
  obstacle: string;
  notes: string;
  description: string;
  rubric: string;
  requirements: string[];
  tasks: ProjectTask[];
  createdAt: string;
};

export type ProjectTask = {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  position: number;
  completed: boolean;
  completedAt: string | null;
};

export type ProjectDraft = {
  type: string;
  subject: string;
  title: string;
  deadline: string;
  workload: string;
  obstacle: string;
  details: string;
};

export type Reflection = {
  id: string;
  difficulty: string;
  duration: string;
  projectId: string;
  taskId: string;
  completedAt: string;
};

export const emptyProjectDraft: ProjectDraft = { type: 'Academic', subject: '', title: '', deadline: '', workload: '', obstacle: '', details: '' };

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
}

/** Syncs one app value with localStorage while keeping storage details out of screens. */
export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(read(key, fallback));
    setReady(true);
  // The key is stable for each hook call; fallback supplies the initial shape.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (ready) write(key, value);
  }, [key, ready, value]);

  return [value, setValue, ready] as const;
}

export function createId(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}
