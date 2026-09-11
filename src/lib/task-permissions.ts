// Mirrors the backend's task rules so the UI only offers actions the API will accept.
// The backend stays the authority; these checks never replace its own.
import type { HouseholdRole } from '@/lib/household-permissions';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' };
export const PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority);
}

// The parts of a task that permission decisions depend on, shaped as the API returns them.
export type TaskOwnership = { createdBy: { id: string }; assignedTo: { id: string } | null };

// Owners and admins manage every task; a member manages only the tasks they created.
// Managing means editing any field or deleting the task.
export function canManageTask(actor: HouseholdRole, task: TaskOwnership, userId: string): boolean {
  return actor !== 'MEMBER' || task.createdBy.id === userId;
}

// Anyone who manages a task may change its status. So may its assignee, who may change nothing else.
export function canChangeStatus(actor: HouseholdRole, task: TaskOwnership, userId: string): boolean {
  return canManageTask(actor, task, userId) || task.assignedTo?.id === userId;
}
