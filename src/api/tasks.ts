import type { User } from '@/api/auth';
import { isPhoto, type ImageInput, type Photo } from '@/api/images';
import { apiRequest } from '@/api/client';
import { isTaskPriority, isTaskStatus, type TaskPriority, type TaskStatus } from '@/lib/task-permissions';

// A task as every task endpoint returns it. Dates are ISO strings from the backend.
export type Task = {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: User;
  assignedTo: User | null;
  images: Photo[];
};

export type Pagination = { page: number; limit: number; total: number; totalPages: number };
export type TaskPage = { tasks: Task[]; pagination: Pagination };
export type TaskListQuery = { status?: TaskStatus; page?: number; limit?: number };

// Fields the app may send. null clears a nullable field; a key left out is unchanged on PATCH.
export type TaskInput = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  assignedToId?: string | null;
};

const unexpectedResponse = () => new Error('Unexpected response from HomeHub. Please try again.');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

const isUser = (value: unknown): value is User =>
  isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' && typeof value.email === 'string';

export function isTask(value: unknown): value is Task {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.householdId === 'string' &&
    typeof value.title === 'string' && isNullableString(value.description) && isTaskStatus(value.status) &&
    isTaskPriority(value.priority) && isNullableString(value.dueDate) && typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' && isUser(value.createdBy) && (value.assignedTo === null || isUser(value.assignedTo)) &&
    Array.isArray(value.images) && value.images.every(isPhoto);
}

export function isPagination(value: unknown): value is Pagination {
  return isRecord(value) && ['page', 'limit', 'total', 'totalPages'].every((key) => typeof value[key] === 'number');
}

const tasksPath = (householdId: string) => `/households/${encodeURIComponent(householdId)}/tasks`;
const taskPath = (householdId: string, taskId: string) => `${tasksPath(householdId)}/${encodeURIComponent(taskId)}`;

// React Native's URLSearchParams is incomplete, so the query string is assembled by hand.
function queryString({ status, page, limit }: TaskListQuery): string {
  const parts = Object.entries({ status, page, limit })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function listTasks(token: string, householdId: string, query: TaskListQuery = {}): Promise<TaskPage> {
  const data = await apiRequest(`${tasksPath(householdId)}${queryString(query)}`, { token });
  const tasks = isRecord(data) ? data.tasks : undefined;
  const pagination = isRecord(data) ? data.pagination : undefined;
  if (!Array.isArray(tasks) || !tasks.every(isTask) || !isPagination(pagination)) throw unexpectedResponse();
  return { tasks, pagination };
}

function readTask(data: unknown): Task {
  const task = isRecord(data) ? data.task : undefined;
  if (!isTask(task)) throw unexpectedResponse();
  return task;
}

export async function getTask(token: string, householdId: string, taskId: string): Promise<Task> {
  return readTask(await apiRequest(taskPath(householdId, taskId), { token }));
}

export async function createTask(token: string, householdId: string, input: TaskInput & { title: string }): Promise<Task> {
  return readTask(await apiRequest(tasksPath(householdId), { method: 'POST', body: input, token }));
}

export async function updateTask(token: string, householdId: string, taskId: string, input: TaskInput): Promise<Task> {
  return readTask(await apiRequest(taskPath(householdId, taskId), { method: 'PATCH', body: input, token }));
}

export async function deleteTask(token: string, householdId: string, taskId: string): Promise<void> {
  await apiRequest(taskPath(householdId, taskId), { method: 'DELETE', token });
}

// Both return the whole task with its photos, so the cache can replace it in one step.
export async function addTaskImage(token: string, householdId: string, taskId: string, input: ImageInput): Promise<Task> {
  return readTask(await apiRequest(`${taskPath(householdId, taskId)}/images`, { method: 'POST', body: input, token }));
}

export async function removeTaskImage(token: string, householdId: string, taskId: string, imageId: string): Promise<Task> {
  return readTask(await apiRequest(`${taskPath(householdId, taskId)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE', token }));
}
