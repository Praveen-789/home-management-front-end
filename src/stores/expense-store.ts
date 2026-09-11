import { create } from 'zustand';
import * as expensesApi from '@/api/expenses';
import type { Expense, ExpenseInput, ExpenseSummary } from '@/api/expenses';
import { uploadImage, type ImageFile } from '@/api/images';
import { applyExpense, forgetExpense, storeExpensePage, type ExpenseCache, type ExpenseFilter } from '@/lib/expense-helpers';
import { useAuthStore } from '@/stores/auth-store';
import { withToken } from '@/stores/with-token';

export const PAGE_SIZE = 20;

// The totals last fetched for a household, with the filter they were fetched for.
export type SummaryEntry = { filter: ExpenseFilter; summary: ExpenseSummary };

type ExpenseState = ExpenseCache & {
  summariesByHousehold: Record<string, SummaryEntry>;
  loadExpenses: (householdId: string, filter: ExpenseFilter, page?: number) => Promise<void>;
  loadSummary: (householdId: string, filter: ExpenseFilter) => Promise<void>;
  loadExpense: (householdId: string, expenseId: string) => Promise<Expense>;
  createExpense: (householdId: string, input: ExpenseInput & { amount: string }) => Promise<Expense>;
  updateExpense: (householdId: string, expenseId: string, input: ExpenseInput) => Promise<Expense>;
  deleteExpense: (householdId: string, expenseId: string) => Promise<void>;
  addImage: (householdId: string, expenseId: string, file: ImageFile) => Promise<Expense>;
  removeImage: (householdId: string, expenseId: string, imageId: string) => Promise<Expense>;
  reset: () => void;
};

const initialState = { expensesById: {}, listsByHousehold: {}, summariesByHousehold: {} };

// The newest list and summary request per household, so a slow reply for a filter the user already
// left cannot overwrite the newer data. Kept outside the state because no screen reads it.
const latestList: Record<string, number> = {};
const latestSummary: Record<string, number> = {};
let requestCount = 0;

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  ...initialState,
  loadExpenses: async (householdId, filter, page = 1) => {
    const requestId = ++requestCount;
    latestList[householdId] = requestId;
    const query = { page, limit: PAGE_SIZE, category: filter.category, taskId: filter.taskId };
    const result = await withToken((token) => expensesApi.listExpenses(token, householdId, query));
    if (latestList[householdId] !== requestId) return;
    set(storeExpensePage(get(), householdId, filter, page, result));
  },
  loadSummary: async (householdId, filter) => {
    const requestId = ++requestCount;
    latestSummary[householdId] = requestId;
    const summary = await withToken((token) => expensesApi.getExpenseSummary(token, householdId, { category: filter.category, taskId: filter.taskId }));
    if (latestSummary[householdId] !== requestId) return;
    set({ summariesByHousehold: { ...get().summariesByHousehold, [householdId]: { filter, summary } } });
  },
  loadExpense: async (householdId, expenseId) => {
    const expense = await withToken((token) => expensesApi.getExpense(token, householdId, expenseId));
    set(applyExpense(get(), householdId, expense));
    return expense;
  },
  // Every change drops the household's totals, so the list screen fetches fresh ones.
  createExpense: async (householdId, input) => {
    const expense = await withToken((token) => expensesApi.createExpense(token, householdId, input));
    set({ ...applyExpense(get(), householdId, expense, true), summariesByHousehold: withoutSummary(get(), householdId) });
    return expense;
  },
  updateExpense: async (householdId, expenseId, input) => {
    const expense = await withToken((token) => expensesApi.updateExpense(token, householdId, expenseId, input));
    set({ ...applyExpense(get(), householdId, expense), summariesByHousehold: withoutSummary(get(), householdId) });
    return expense;
  },
  deleteExpense: async (householdId, expenseId) => {
    await withToken((token) => expensesApi.deleteExpense(token, householdId, expenseId));
    set({ ...forgetExpense(get(), householdId, expenseId), summariesByHousehold: withoutSummary(get(), householdId) });
  },
  // Photos do not change any total, so the summary stays put.
  addImage: async (householdId, expenseId, file) => {
    const expense = await withToken(async (token) => {
      const input = await uploadImage(token, householdId, file);
      return expensesApi.addExpenseImage(token, householdId, expenseId, input);
    });
    set(applyExpense(get(), householdId, expense));
    return expense;
  },
  removeImage: async (householdId, expenseId, imageId) => {
    const expense = await withToken((token) => expensesApi.removeExpenseImage(token, householdId, expenseId, imageId));
    set(applyExpense(get(), householdId, expense));
    return expense;
  },
  reset: () => set(initialState),
}));

function withoutSummary(state: ExpenseState, householdId: string): Record<string, SummaryEntry> {
  const summaries = { ...state.summariesByHousehold };
  delete summaries[householdId];
  return summaries;
}

// Expense data belongs to one user; drop it on sign-out or when a different user signs in.
useAuthStore.subscribe((state, previous) => {
  if (state.session?.user.id !== previous.session?.user.id) useExpenseStore.getState().reset();
});
