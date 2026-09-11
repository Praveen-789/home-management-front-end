// Mirrors the backend's expense rules so the UI only offers actions the API will accept.
// The backend stays the authority; these checks never replace its own.
import type { HouseholdRole } from '@/lib/household-permissions';

export const EXPENSE_CATEGORIES = ['GROCERIES', 'UTILITIES', 'RENT', 'MAINTENANCE', 'TRANSPORT', 'HEALTH', 'ENTERTAINMENT', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  GROCERIES: 'Groceries',
  UTILITIES: 'Utilities',
  RENT: 'Rent',
  MAINTENANCE: 'Maintenance',
  TRANSPORT: 'Transport',
  HEALTH: 'Health',
  ENTERTAINMENT: 'Entertainment',
  OTHER: 'Other',
};

// Material Community Icons names, which is what React Native Paper renders.
export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  GROCERIES: 'cart-outline',
  UTILITIES: 'flash-outline',
  RENT: 'home-outline',
  MAINTENANCE: 'wrench-outline',
  TRANSPORT: 'bus',
  HEALTH: 'medical-bag',
  ENTERTAINMENT: 'movie-open-outline',
  OTHER: 'dots-horizontal-circle-outline',
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.includes(value as ExpenseCategory);
}

// The parts of an expense that permission decisions depend on, shaped as the API returns them.
export type ExpenseOwnership = { createdBy: { id: string }; paidBy: { id: string } };

// Owners and admins manage every expense; a member manages the expenses they recorded or paid for,
// since either person may need to correct it. Managing means editing any field or deleting.
export function canManageExpense(actor: HouseholdRole, expense: ExpenseOwnership, userId: string): boolean {
  return actor !== 'MEMBER' || expense.createdBy.id === userId || expense.paidBy.id === userId;
}
