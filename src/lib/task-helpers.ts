// Pure helpers for task lists and due dates. No React or network code, so Node can test them directly.
import type { Pagination, Task, TaskPage } from '@/api/tasks';
import type { TaskStatus } from '@/lib/task-permissions';

// The fields these helpers read, so they accept API tasks and small test fixtures alike.
export type TaskLike = { id: string; status: TaskStatus; dueDate: string | null; createdAt: string };

export type TaskFilter = TaskStatus | 'ALL';

export const FILTER_LABELS: Record<TaskFilter, string> = { ALL: 'All', TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' };

export function matchesFilter(task: { status: TaskStatus }, filter: TaskFilter): boolean {
  return filter === 'ALL' || task.status === filter;
}

// The backend's order: dated tasks first, soonest due first; undated tasks after, newest first; ID breaks ties.
export function compareTasks(a: TaskLike, b: TaskLike): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    const byDue = Date.parse(a.dueDate) - Date.parse(b.dueDate);
    if (byDue !== 0) return byDue;
  }
  const byCreated = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Calendar-day arithmetic in the device's time zone. A due date means "by the end of that day".
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const DAY = 24 * 60 * 60 * 1000;

// Whole days from `now` to `date`, ignoring the time of day. Rounding absorbs daylight-saving shifts.
export function daysUntil(date: Date, now = new Date()): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY);
}

export function isOverdue(task: { status: TaskStatus; dueDate: string | null }, now = new Date()): boolean {
  return task.status !== 'DONE' && task.dueDate !== null && daysUntil(new Date(task.dueDate), now) < 0;
}

export function formatDueDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = daysUntil(date, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

// The form's date button spells the day out, e.g. "Tue, 22 Sep 2026".
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Android's Material date picker counts days in UTC: it reads the UTC day of the date it is given and
// answers with UTC midnight of the chosen day. The app counts days in the device's time zone, so these
// two carry the calendar day across. Without them, India (UTC+5:30) would open on the day before.
export function localDayAsUtc(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function utcDayAsLocal(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// A browser's date input speaks YYYY-MM-DD. Blank means no due date (null); anything unparseable is undefined.
export function parseDateInput(text: string): Date | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // JavaScript rolls impossible dates forward (2026-02-30 becomes March 2), so check nothing moved.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

export function toDateInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Due dates are sent as the start of the chosen day in the device's time zone.
export function dueDateToIso(date: Date): string {
  return startOfDay(date).toISOString();
}

// ---- Cache maintenance ----
// The task cache: every task seen by ID, plus one loaded list per household. These functions change
// the cache in place, which suits Redux Toolkit's Immer drafts and plain objects in tests alike.

// One household's loaded list: the filter it was fetched with, every page loaded so far, and the
// backend's page details from the most recent page.
export type TaskList = { filter: TaskFilter; tasks: Task[]; pagination: Pagination };
export type TaskCache = { tasksById: Record<string, Task>; listsByHousehold: Record<string, TaskList> };

// Records a fetched page. Page 1, or any page for a different filter, replaces the list; a later page
// of the same filter appends to it.
export function storeTaskPage(cache: TaskCache, householdId: string, filter: TaskFilter, page: number, result: TaskPage): void {
  for (const task of result.tasks) cache.tasksById[task.id] = task;
  const current = cache.listsByHousehold[householdId];
  const tasks = page > 1 && current && current.filter === filter ? mergeTasks(current.tasks, result.tasks) : result.tasks;
  cache.listsByHousehold[householdId] = { filter, tasks, pagination: result.pagination };
}

// Records one task from the API. A task already in the household's list is replaced and re-sorted, or
// removed when it no longer matches the list's filter. A newly created task is inserted when it
// matches. Anything else leaves the list alone, because the list only knows the pages it loaded.
export function applyTask(cache: TaskCache, householdId: string, task: Task, created = false): void {
  cache.tasksById[task.id] = task;
  const list = cache.listsByHousehold[householdId];
  if (!list) return;
  const index = list.tasks.findIndex((item) => item.id === task.id);
  const present = index !== -1;
  const belongs = matchesFilter(task, list.filter);
  if (belongs && (present || created)) {
    if (present) list.tasks.splice(index, 1);
    list.tasks.push(task);
    list.tasks.sort(compareTasks);
    if (!present) adjustTotal(list.pagination, 1);
  } else if (!belongs && present) {
    list.tasks.splice(index, 1);
    adjustTotal(list.pagination, -1);
  }
}

export function forgetTask(cache: TaskCache, householdId: string, taskId: string): void {
  delete cache.tasksById[taskId];
  const list = cache.listsByHousehold[householdId];
  const index = list ? list.tasks.findIndex((item) => item.id === taskId) : -1;
  if (!list || index === -1) return;
  list.tasks.splice(index, 1);
  adjustTotal(list.pagination, -1);
}

function adjustTotal(pagination: Pagination, delta: number): void {
  pagination.total = Math.max(0, pagination.total + delta);
  pagination.totalPages = Math.ceil(pagination.total / pagination.limit);
}

// Appends a page, dropping any task already shown. Offset paging can repeat a row when the list
// shifted between requests.
function mergeTasks(existing: Task[], incoming: Task[]): Task[] {
  const incomingIds = new Set(incoming.map((task) => task.id));
  return [...existing.filter((task) => !incomingIds.has(task.id)), ...incoming];
}
