import type { PreferredWorkPeriod, ReminderOffsetMinutes } from './storage';

export const preferredWorkPeriodLabels: Record<PreferredWorkPeriod, string> = {
  none: 'No preference',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  specific: 'Specific time',
};

export const reminderLabels: Record<Exclude<ReminderOffsetMinutes, null>, string> = {
  0: 'At task time',
  15: '15 minutes before',
  30: '30 minutes before',
  60: '1 hour before',
};

export type SchedulingPreferences = {
  preferredWorkPeriod?: PreferredWorkPeriod;
  preferredTime?: string;
  timezone?: string;
  reminderOffsetMinutes?: ReminderOffsetMinutes;
};

export type SchedulableTask = {
  scheduledDate: string;
  scheduledTime?: string;
  timezone?: string;
  reminderOffsetMinutes?: ReminderOffsetMinutes;
  preferredWorkPeriod?: PreferredWorkPeriod;
};

export function isValidTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Applies only user-selected clock data; generated dates and task counts stay untouched. */
export function applySchedulingPreferences<T extends SchedulableTask>(tasks: T[], preferences: SchedulingPreferences): Array<T & SchedulableTask> {
  const period = preferences.preferredWorkPeriod ?? 'none';
  const scheduledTime = period === 'specific' && preferences.preferredTime && isValidTime(preferences.preferredTime)
    ? preferences.preferredTime
    : undefined;

  return tasks.map((task) => ({
    ...task,
    ...(period === 'none' ? {} : { preferredWorkPeriod: period }),
    ...(scheduledTime ? { scheduledTime } : {}),
    ...(preferences.timezone ? { timezone: preferences.timezone } : {}),
    ...(preferences.reminderOffsetMinutes === undefined ? {} : { reminderOffsetMinutes: preferences.reminderOffsetMinutes }),
  }));
}

export function changeTaskSchedule<T extends SchedulableTask>(task: T, field: 'scheduledDate' | 'scheduledTime', value: string, timezone?: string): T & SchedulableTask {
  if (field === 'scheduledDate') return value ? { ...task, scheduledDate: value } : task;
  if (!value) return { ...task, scheduledTime: undefined, preferredWorkPeriod: 'none' };
  if (!isValidTime(value)) return task;
  return { ...task, scheduledTime: value, preferredWorkPeriod: 'specific', timezone: task.timezone ?? timezone };
}

export function formatClockTime(value: string): string {
  if (!isValidTime(value)) return value;
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function formatTaskSchedule(task: SchedulableTask): string {
  if (task.scheduledTime) return `${task.scheduledDate} at ${formatClockTime(task.scheduledTime)}`;
  if (task.preferredWorkPeriod && task.preferredWorkPeriod !== 'none' && task.preferredWorkPeriod !== 'specific') {
    return `${task.scheduledDate} · ${preferredWorkPeriodLabels[task.preferredWorkPeriod]}`;
  }
  return task.scheduledDate;
}

export function formatReminder(offset: ReminderOffsetMinutes | undefined): string {
  return offset === null || offset === undefined ? 'No reminder' : reminderLabels[offset];
}
