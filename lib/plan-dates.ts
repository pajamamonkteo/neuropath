export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type UserDateContext = {
  today: string;
  timeZone?: string;
  timezoneOffsetMinutes: number;
};

export type PlanTaskDateFields = {
  scheduledDate: string;
  dueDate: string | null;
  dayNumber: number;
};

type LocalDateParts = Pick<Date, 'getFullYear' | 'getMonth' | 'getDate'>;

export function localIsoDate(value: LocalDateParts = new Date()): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

export function getUserDateContext(value = new Date()): UserDateContext {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    today: localIsoDate(value),
    ...(timeZone ? { timeZone } : {}),
    // Positive values are east of UTC, so UTC+8 is reported as 480.
    timezoneOffsetMinutes: -value.getTimezoneOffset(),
  };
}

export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function clampDate(value: string, today: string, deadline: string): string {
  if (value < today) return today;
  if (value > deadline) return deadline;
  return value;
}

function assertValidDate(value: string, field: string): void {
  if (!isIsoCalendarDate(value)) throw new Error(`${field} must be a real date in YYYY-MM-DD format.`);
}

export function normalizePlanTaskDates<T extends PlanTaskDateFields>(tasks: T[], today: string, deadline: string): T[] {
  assertValidDate(today, 'Today');
  assertValidDate(deadline, 'Deadline');
  if (deadline < today) throw new Error('Deadline cannot be before today.');

  let previousScheduledDate = today;
  let scheduledDateChanged = false;
  const normalized = tasks.map((task, index) => {
    assertValidDate(task.scheduledDate, `Task ${index + 1} scheduledDate`);
    if (task.dueDate !== null) assertValidDate(task.dueDate, `Task ${index + 1} dueDate`);

    let scheduledDate = clampDate(task.scheduledDate, today, deadline);
    if (scheduledDate < previousScheduledDate) scheduledDate = previousScheduledDate;
    scheduledDateChanged ||= scheduledDate !== task.scheduledDate;
    previousScheduledDate = scheduledDate;

    let dueDate = task.dueDate === null ? null : clampDate(task.dueDate, today, deadline);
    if (dueDate !== null && dueDate < scheduledDate) dueDate = scheduledDate;

    return { ...task, scheduledDate, dueDate };
  });

  const withConsistentDays = scheduledDateChanged
    ? normalized.reduce<T[]>((result, task) => {
        const previous = result.at(-1);
        const dayNumber = !previous ? 1 : previous.scheduledDate === task.scheduledDate ? previous.dayNumber : previous.dayNumber + 1;
        return [...result, { ...task, dayNumber }];
      }, [])
    : normalized;

  withConsistentDays.forEach((task, index) => {
    if (task.scheduledDate < today || task.scheduledDate > deadline) throw new Error(`Task ${index + 1} scheduledDate is outside the planning window.`);
    if (index > 0 && task.scheduledDate < withConsistentDays[index - 1].scheduledDate) throw new Error('Task scheduledDate values must be in ascending order.');
    if (task.dueDate !== null && (task.dueDate < task.scheduledDate || task.dueDate > deadline)) throw new Error(`Task ${index + 1} dueDate is outside the planning window.`);
  });

  return withConsistentDays;
}
