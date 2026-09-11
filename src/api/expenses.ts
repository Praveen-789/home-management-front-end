import type { User } from '@/api/auth';
import { isPhoto, type ImageInput, type Photo } from '@/api/images';
import { apiRequest } from '@/api/client';
import { isPagination, type Pagination } from '@/api/tasks';
import { isExpenseCategory, type ExpenseCategory } from '@/lib/expense-permissions';
import { isTaskStatus, type TaskStatus } from '@/lib/task-permissions';

// The task an expense is linked to, as the expense endpoints embed it.
export type ExpenseTask = { id: string; title: string; status: TaskStatus };

// An expense as every expense endpoint returns it. `amount` is a two-place decimal string such as
// "1250.50", because the backend never sends money as a float. Dates are ISO strings.
export type Expense = {
  id: string;
  householdId: string;
  amount: string;
  description: string | null;
  category: ExpenseCategory;
  createdAt: string;
  updatedAt: string;
  paidBy: User;
  createdBy: User;
  task: ExpenseTask | null;
  images: Photo[];
};

export type ExpensePage = { expenses: Expense[]; pagination: Pagination };

// Filters the list and summary endpoints share. `from` and `to` are ISO strings bounding createdAt.
export type ExpenseFilterQuery = { category?: ExpenseCategory; paidById?: string; taskId?: string; from?: string; to?: string };
export type ExpenseListQuery = ExpenseFilterQuery & { page?: number; limit?: number };

export type CategoryTotal = { category: ExpenseCategory; total: string; count: number };
// `paidBy` is null only if the payer's account vanished, which the backend's foreign key prevents.
export type PayerTotal = { paidBy: User | null; total: string; count: number };
// Totals the backend computes in the database for the filtered expenses, largest group first.
export type ExpenseSummary = { total: string; count: number; byCategory: CategoryTotal[]; byPayer: PayerTotal[] };

// Fields the app may send. null clears `description` or `taskId`; a key left out is unchanged on
// PATCH. `paidById` left out on POST defaults to the caller.
export type ExpenseInput = {
  amount?: string;
  description?: string | null;
  category?: ExpenseCategory;
  paidById?: string;
  taskId?: string | null;
};

const unexpectedResponse = () => new Error('Unexpected response from HomeHub. Please try again.');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isAmount = (value: unknown): value is string => typeof value === 'string' && /^\d+\.\d{2}$/.test(value);

const isUser = (value: unknown): value is User =>
  isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' && typeof value.email === 'string';

const isExpenseTask = (value: unknown): value is ExpenseTask =>
  isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.title === 'string' && isTaskStatus(value.status);

export function isExpense(value: unknown): value is Expense {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.householdId === 'string' &&
    isAmount(value.amount) && isNullableString(value.description) && isExpenseCategory(value.category) &&
    typeof value.createdAt === 'string' && typeof value.updatedAt === 'string' &&
    isUser(value.paidBy) && isUser(value.createdBy) && (value.task === null || isExpenseTask(value.task)) &&
    Array.isArray(value.images) && value.images.every(isPhoto);
}

const isCategoryTotal = (value: unknown): value is CategoryTotal =>
  isRecord(value) && isExpenseCategory(value.category) && isAmount(value.total) && typeof value.count === 'number';

const isPayerTotal = (value: unknown): value is PayerTotal =>
  isRecord(value) && (value.paidBy === null || isUser(value.paidBy)) && isAmount(value.total) && typeof value.count === 'number';

export function isExpenseSummary(value: unknown): value is ExpenseSummary {
  return isRecord(value) && isAmount(value.total) && typeof value.count === 'number' &&
    Array.isArray(value.byCategory) && value.byCategory.every(isCategoryTotal) &&
    Array.isArray(value.byPayer) && value.byPayer.every(isPayerTotal);
}

const expensesPath = (householdId: string) => `/households/${encodeURIComponent(householdId)}/expenses`;
const expensePath = (householdId: string, expenseId: string) => `${expensesPath(householdId)}/${encodeURIComponent(expenseId)}`;

// React Native's URLSearchParams is incomplete, so the query string is assembled by hand.
function queryString(query: ExpenseListQuery): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function listExpenses(token: string, householdId: string, query: ExpenseListQuery = {}): Promise<ExpensePage> {
  const data = await apiRequest(`${expensesPath(householdId)}${queryString(query)}`, { token });
  const expenses = isRecord(data) ? data.expenses : undefined;
  const pagination = isRecord(data) ? data.pagination : undefined;
  if (!Array.isArray(expenses) || !expenses.every(isExpense) || !isPagination(pagination)) throw unexpectedResponse();
  return { expenses, pagination };
}

export async function getExpenseSummary(token: string, householdId: string, query: ExpenseFilterQuery = {}): Promise<ExpenseSummary> {
  const data = await apiRequest(`${expensesPath(householdId)}/summary${queryString(query)}`, { token });
  const summary = isRecord(data) ? data.summary : undefined;
  if (!isExpenseSummary(summary)) throw unexpectedResponse();
  return summary;
}

function readExpense(data: unknown): Expense {
  const expense = isRecord(data) ? data.expense : undefined;
  if (!isExpense(expense)) throw unexpectedResponse();
  return expense;
}

export async function getExpense(token: string, householdId: string, expenseId: string): Promise<Expense> {
  return readExpense(await apiRequest(expensePath(householdId, expenseId), { token }));
}

export async function createExpense(token: string, householdId: string, input: ExpenseInput & { amount: string }): Promise<Expense> {
  return readExpense(await apiRequest(expensesPath(householdId), { method: 'POST', body: input, token }));
}

export async function updateExpense(token: string, householdId: string, expenseId: string, input: ExpenseInput): Promise<Expense> {
  return readExpense(await apiRequest(expensePath(householdId, expenseId), { method: 'PATCH', body: input, token }));
}

export async function deleteExpense(token: string, householdId: string, expenseId: string): Promise<void> {
  await apiRequest(expensePath(householdId, expenseId), { method: 'DELETE', token });
}

// Both return the whole expense with its photos, so the cache can replace it in one step.
export async function addExpenseImage(token: string, householdId: string, expenseId: string, input: ImageInput): Promise<Expense> {
  return readExpense(await apiRequest(`${expensePath(householdId, expenseId)}/images`, { method: 'POST', body: input, token }));
}

export async function removeExpenseImage(token: string, householdId: string, expenseId: string, imageId: string): Promise<Expense> {
  return readExpense(await apiRequest(`${expensePath(householdId, expenseId)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE', token }));
}
