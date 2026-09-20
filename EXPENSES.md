# HomeHub expenses

Each household has a ledger: what was spent, on which category, who paid, and optionally which task it paid for. Data comes from the backend's expense endpoints, documented in `D:\HomeHub\backend\API.md`.

## Flow

1. The Expenses button on the household screen opens the list, newest first, with a totals card on top and category chips to filter by. The card shows the grand total and how much each member paid for whatever the chips select.
2. Scrolling to the end loads the next page of 20. Pull to refresh reloads the first page and the totals.
3. Anyone in the household can record an expense: amount, optional description, category, who paid (defaults to the person recording it) and an optional task. Only household members can be the payer, and only the household's own tasks can be linked.
4. Tapping an expense opens it. Edit and Delete appear for owners, admins, the person who recorded it and the person who paid. A linked task opens from the detail screen.
5. A task's detail screen offers "Add expense", which opens the form with that task preselected, and "View expenses", which opens the list filtered to that task. A task never needs an expense, and deleting a task keeps its expenses.
6. Sign out, or a token the backend rejects, clears expense data and returns to login.
7. An expense can carry up to five photos, typically receipts, added from its detail screen by anyone who may edit it. See `IMAGES.md`.

## Money

Amounts are strings such as `"1250.50"` end to end. The backend stores exact decimals and sends two places; the app never converts them to a float. The form accepts what people type (`1250`, `1,250.5`, `.5`), checks it the way the backend does (positive, at most two decimals, under ten billion) and sends the normalized string. Totals come from the backend's summary endpoint, where Postgres sums the column, so the app never adds amounts itself.

The currency symbol is one constant, `CURRENCY_SYMBOL` in `src/lib/expense-helpers.ts`. The backend has no currency column, so a household is assumed to use one currency.

## Read the code in this order

- `src/lib/expense-permissions.ts`: categories with labels and icons, and the owner/admin/recorder/payer rule copied from the backend, so the UI hides actions the API would refuse. The backend still decides.
- `src/lib/expense-helpers.ts`: amount formatting and parsing, the backend's sort order, filter matching, and the cache rules the store uses. Pure functions that return new objects, tested in Node.
- `src/api/expenses.ts`: typed requests and response validation for the six expense endpoints, including the list's filters and paging and the summary's shape.
- `src/stores/expense-store.ts`: Zustand store holding every expense seen by ID, one loaded list per household, and the last totals per household. Page 1 replaces a household's list, later pages append, and a late reply for a filter the user already left is dropped. Any change drops the household's totals so the list fetches fresh ones. A 401 signs the user out. The store resets when the signed-in user changes.
- `src/app/(app)/(stack)/households/[householdId]/expenses/`: the routes; each re-exports a screen.
- `src/screens/expenses-screen.tsx`: totals card, category chips, list, pull to refresh, load more, the task filter banner and the New expense button.
- `src/screens/expense-form-screen.tsx`: create and edit in one form. The payer picker uses the household's members; the task picker reads the task endpoint directly rather than the task screens' Redux store, so the two features stay separate.
- `src/screens/expense-detail-screen.tsx`: details, link to the task, edit and delete with confirmation.
- `src/components/expense-row.tsx`, `expense-summary-card.tsx`: a row with its category, task and payer, and the totals card.

Expenses use Zustand like households, not Redux like tasks. `TASKS.md` explains why tasks are the one Redux feature.

## Manual checks

- Household with no expenses: the list shows the record prompt; recording one returns to the list with it and the totals card shown.
- Category chips: each shows only that category, its count and its totals; an empty category offers "Show all expenses".
- More than 20 expenses: scrolling loads the next page; pull to refresh returns to the first page.
- Amount field: `1,250.5` is accepted and shown as `₹1,250.50`; `abc`, `0` and `1.005` show an error without submitting.
- Paid by defaults to you; picking another member shows their name on the row and in the totals card.
- A member sees no Edit or Delete on an expense they neither recorded nor paid, and sees both on one they paid but someone else recorded.
- An owner or admin can edit and delete any expense; deleting asks for confirmation and returns to the list with the totals updated.
- From a task: "Add expense" opens the form with the task preselected; "View expenses" shows only that task's expenses with an "All expenses" chip that returns to the full list.
- Deleting a task leaves its expenses in the list with "Not linked to a task" on their detail screens.
- Picking a payer who has since left the household shows the backend's message and keeps the form.
- Deep link to an expense or its edit form while signed in loads it and shows a back button.
- After sign out and sign in as a different user, no expenses from the previous user remain.

## Tests

- Permission matrix and categories: `node --experimental-strip-types --test tests/expense-permissions.test.mjs`
- Amounts, ordering, filters and cache rules: `node --experimental-strip-types --test tests/expense-helpers.test.mjs`
- Types: `npx tsc --noEmit` after Expo has regenerated route types (`npm start`).
