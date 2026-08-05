import type { ProjectTask, Subtask } from './storage';

export type RolloverChoice = 'move' | 'keep' | 'lighter';

export type ScheduledProjectTask = ProjectTask & {
  dayNumber: number;
  scheduledDate: string;
  subtasks: Subtask[];
};

export type RolloverResult<T extends ScheduledProjectTask> = {
  tasks: T[];
  explanation: string;
};

export function markTaskSkipped<T extends ProjectTask>(tasks: T[], taskId: string): T[] {
  return tasks.map((task) => task.id === taskId ? { ...task, status: 'skipped', completed: false, completedAt: null } : task);
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function dateToIso(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: string, amount: number): string {
  const date = dateFromIso(value);
  date.setDate(date.getDate() + amount);
  return dateToIso(date);
}

function dayDifference(firstDate: string, nextDate: string): number {
  return Math.round((dateFromIso(nextDate).getTime() - dateFromIso(firstDate).getTime()) / 86_400_000);
}

function minutesFor(task: ScheduledProjectTask): number {
  const parsed = Number.parseInt(task.estimatedTime, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

export function tasksReadyForRollover<T extends ScheduledProjectTask>(tasks: T[], today: string): T[] {
  return tasks.filter((task) => task.status !== 'completed' && !task.completed && (task.status === 'skipped' || task.scheduledDate <= today));
}

export function rescheduleUnfinishedTasks<T extends ScheduledProjectTask>(
  tasks: T[],
  choice: Exclude<RolloverChoice, 'keep'>,
  today: string,
  deadline: string,
): RolloverResult<T> {
  const overdue = tasksReadyForRollover(tasks, today);
  if (!overdue.length) return { tasks, explanation: 'There are no unfinished tasks due today or earlier.' };

  const firstScheduledDate = tasks.map((task) => task.scheduledDate).sort()[0] || today;
  const rolloverIds = new Set(overdue.map((task) => task.id));
  const firstRolloverPosition = Math.min(...overdue.map((task) => task.position));
  const ordered = tasks
    .filter((task) => task.status !== 'completed' && !task.completed && task.position >= firstRolloverPosition)
    .sort((a, b) => a.position - b.position);
  const maxTasksPerDay = choice === 'lighter' ? 2 : 3;
  const maxMinutesPerDay = choice === 'lighter' ? 60 : 90;
  const updatedById = new Map<string, T>();
  const loadByDate = new Map<string, { tasks: number; minutes: number }>();
  const nextStudyDay = addDays(today, 1);
  let lastAssignedDate = nextStudyDay;

  ordered.forEach((task) => {
    const originalMinutes = minutesFor(task);
    const taskMinutes = choice === 'lighter' && originalMinutes > 30 ? 30 : originalMinutes;
    let scheduledDate = rolloverIds.has(task.id) ? nextStudyDay : task.scheduledDate;
    if (scheduledDate < nextStudyDay) scheduledDate = nextStudyDay;
    if (scheduledDate < lastAssignedDate) scheduledDate = lastAssignedDate;
    let load = loadByDate.get(scheduledDate) ?? { tasks: 0, minutes: 0 };
    while (load.tasks >= maxTasksPerDay || (load.tasks > 0 && load.minutes + taskMinutes > maxMinutesPerDay)) {
      scheduledDate = addDays(scheduledDate, 1);
      load = loadByDate.get(scheduledDate) ?? { tasks: 0, minutes: 0 };
    }
    const lighterTask = choice === 'lighter' && originalMinutes > taskMinutes
      ? {
          ...task,
          description: `${task.description} Focus on the essential first pass; save optional extension work for later.`,
          estimatedTime: `${taskMinutes} min`,
          subtasks: task.subtasks.map((subtask) => ({ ...subtask, estimatedMinutes: Math.max(3, Math.round(subtask.estimatedMinutes * 0.75)) })),
        }
      : task;
    updatedById.set(task.id, {
      ...lighterTask,
      scheduledDate,
      dayNumber: Math.max(1, dayDifference(firstScheduledDate, scheduledDate) + 1),
      status: 'pending',
      completed: false,
      completedAt: null,
    } as T);
    loadByDate.set(scheduledDate, { tasks: load.tasks + 1, minutes: load.minutes + taskMinutes });
    lastAssignedDate = scheduledDate;
  });

  const updatedTasks = tasks.map((task) => updatedById.get(task.id) ?? task);
  const lastScheduledDate = Array.from(updatedById.values()).map((task) => task.scheduledDate).sort().at(-1) || today;
  const deadlineNote = lastScheduledDate > deadline
    ? ` The deadline remains ${deadline}, but the adjusted schedule extends beyond it, so the deadline may need review.`
    : ` The final deadline of ${deadline} was preserved.`;
  const count = overdue.length === 1 ? 'One' : overdue.length === 2 ? 'Two' : String(overdue.length);
  const summary = choice === 'lighter'
    ? `${count} unfinished task${overdue.length === 1 ? ' was' : 's were'} spread across upcoming study days, with supported task sizes reduced.`
    : `${count} unfinished task${overdue.length === 1 ? ' was' : 's were'} moved to the next study day.`;

  return {
    tasks: updatedTasks,
    explanation: `${summary} Completed tasks were not changed.${deadlineNote}`,
  };
}
