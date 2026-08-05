import type { ProjectTask, Subtask } from './storage';

export const REQUIRED_SUBTASKS_MESSAGE = 'Complete all required steps to finish this task.';

export function areRequiredSubtasksComplete(subtasks: Subtask[]): boolean {
  return subtasks.every((subtask) => subtask.required === false || subtask.completed);
}

export function canCompleteTask(task: Pick<ProjectTask, 'subtasks'>): boolean {
  return areRequiredSubtasksComplete(task.subtasks);
}

export function setSubtaskCompletion<T extends ProjectTask>(tasks: T[], taskId: string, subtaskId: string, completed: boolean): T[] {
  return tasks.map((task) => {
    if (task.id !== taskId || task.completed || task.status === 'completed') return task;
    return {
      ...task,
      subtasks: task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, completed } : subtask),
    };
  });
}

export type TaskCompletionAttempt<T extends ProjectTask> = {
  tasks: T[];
  completed: boolean;
  error?: string;
};

export function completeTaskRecord<T extends ProjectTask>(tasks: T[], taskId: string, completedAt: string): TaskCompletionAttempt<T> {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return { tasks, completed: false, error: 'The task could not be found.' };
  if (task.completed || task.status === 'completed') return { tasks, completed: true };
  if (!canCompleteTask(task)) return { tasks, completed: false, error: REQUIRED_SUBTASKS_MESSAGE };
  return {
    tasks: tasks.map((item) => item.id === taskId ? { ...item, status: 'completed', completed: true, completedAt } : item),
    completed: true,
  };
}
