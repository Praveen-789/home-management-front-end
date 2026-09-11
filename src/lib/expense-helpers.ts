// Pure helpers for amounts and the expense cache. No React or network code, so Node can test them
// directly. Only type imports cross into other modules, which Node strips before running.
import type { Expense, ExpensePage } from '@/api/expenses';
import type { Pagination } from '@/api/tasks';
import type { ExpenseCategory } from '@/lib/expense-permissions';

// Change this to show a different currency. The backend stores plain decimals with no currency.
export const CURRENCY_SYMBOL = '₹';

// The fields these helpers read, so they accept API expenses and small test fixtures alike.
export type ExpenseLike = { id: string; createdAt: string };

// "1250.5" becomes "₹1,250.50". Amounts are decimal strings and never pass through a float.
export function formatAmount(amount: string): string {
  const [whole = '0', fraction = ''] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${CURRENCY_SYMBOL}${grouped}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

// The form takes an amount as text. Spaces and thousands separators are ignored, ".5" is read as
// 0.50 and "5." as 5.00. Returns the two-place string the API expects, or undefined when the text
// is not a positive amount with at most two decimals and ten digits before the point.
export function parseAmountInput(text: string): string | undefined {
  const cleaned = text.replace(/[,\s]/g, '').replace(/^\./, '0.').replace(/\.$/, '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(cleaned) || Number(cleaned) === 0) return undefined;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  return `${Number(whole)}.${fraction.padEnd(2, '0')}`;
}

// The backend's order: newest first, ID breaks ties.
export function compareExpenses(a: ExpenseLike, b: ExpenseLike): number {
  const byCreated = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// What a loaded list was filtered by. Both parts are optional: the chips set the category and a
// task's detail screen opens the list for that task alone.
export type ExpenseFilter = { category?: ExpenseCategory; taskId?: string };

export function sameFilter(a: ExpenseFilter, b: ExpenseFilter): boolean {
  return a.category === b.category && a.taskId === b.taskId;
}

export function matchesFilter(expense: { category: ExpenseCategory; task: { id: string } | null }, filter: ExpenseFilter): boolean {
  return (!filter.category || expense.category === filter.category) && (!filter.taskId || expense.task?.id === filter.taskId);
}

// ---- Cache maintenance ----
// The expense cache: every expense seen by ID, plus one loaded list per household. These functions
// return a new cache and leave the given one untouched, which is what a Zustand `set` expects.

// One household's loaded list: the filter it was fetched with, every page loaded so far, and the
// backend's page details from the most recent page.
export type ExpenseList = { filter: ExpenseFilter; expenses: Expense[]; pagination: Pagination };
export type ExpenseCache = { expensesById: Record<string, Expense>; listsByHousehold: Record<string, ExpenseList> };

// Records a fetched page. Page 1, or any page for a different filter, replaces the list; a later
// page of the same filter appends to it.
export function storeExpensePage(cache: ExpenseCache, householdId: string, filter: ExpenseFilter, page: number, result: ExpensePage): ExpenseCache {
  const expensesById = { ...cache.expensesById };
  for (const expense of result.expenses) expensesById[expense.id] = expense;
  const current = cache.listsByHousehold[householdId];
  const expenses = page > 1 && current && sameFilter(current.filter, filter) ? mergeExpenses(current.expenses, result.expenses) : result.expenses;
  return { expensesById, listsByHousehold: { ...cache.listsByHousehold, [householdId]: { filter, expenses, pagination: result.pagination } } };
}

// Records one expense from the API. An expense already in the household's list is replaced and
// re-sorted, or removed when it no longer matches the list's filter. A newly created expense is
// inserted when it matches. Anything else leaves the list alone, because the list only knows the
// pages it loaded.
export function applyExpense(cache: ExpenseCache, householdId: string, expense: Expense, created = false): ExpenseCache {
  const expensesById = { ...cache.expensesById, [expense.id]: expense };
  const list = cache.listsByHousehold[householdId];
  if (!list) return { ...cache, expensesById };
  const present = list.expenses.some((item) => item.id === expense.id);
  const belongs = matchesFilter(expense, list.filter);
  const others = list.expenses.filter((item) => item.id !== expense.id);
  let updated: ExpenseList;
  if (belongs && (present || created)) {
    updated = { ...list, expenses: [...others, expense].sort(compareExpenses), pagination: present ? list.pagination : adjustTotal(list.pagination, 1) };
  } else if (!belongs && present) {
    updated = { ...list, expenses: others, pagination: adjustTotal(list.pagination, -1) };
  } else {
    return { ...cache, expensesById };
  }
  return { expensesById, listsByHousehold: { ...cache.listsByHousehold, [householdId]: updated } };
}

export function forgetExpense(cache: ExpenseCache, householdId: string, expenseId: string): ExpenseCache {
  const expensesById = { ...cache.expensesById };
  delete expensesById[expenseId];
  const list = cache.listsByHousehold[householdId];
  if (!list || !list.expenses.some((item) => item.id === expenseId)) return { ...cache, expensesById };
  const updated = { ...list, expenses: list.expenses.filter((item) => item.id !== expenseId), pagination: adjustTotal(list.pagination, -1) };
  return { expensesById, listsByHousehold: { ...cache.listsByHousehold, [householdId]: updated } };
}

function adjustTotal(pagination: Pagination, delta: number): Pagination {
  const total = Math.max(0, pagination.total + delta);
  return { ...pagination, total, totalPages: Math.ceil(total / pagination.limit) };
}

// Appends a page, dropping any expense already shown. Offset paging can repeat a row when the
// list shifted between requests.
function mergeExpenses(existing: Expense[], incoming: Expense[]): Expense[] {
  const incomingIds = new Set(incoming.map((expense) => expense.id));
  return [...existing.filter((expense) => !incomingIds.has(expense.id)), ...incoming];
}
