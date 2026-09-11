# HomeHub tasks

Each household has a task list: chores with a status, a priority, an optional due date and an optional assignee. Data comes from the backend's task endpoints, documented in `D:\HomeHub\backend\API.md`.

## Flow

1. The Tasks button on the household screen opens the task list, filtered by All, To do, In progress or Done. Tasks are ordered by due date, soonest first, with undated tasks last.
2. Scrolling to the end loads the next page of 20. Pull to refresh reloads the first page.
3. Anyone in the household can create a task: title, optional description, priority, due date and assignee. Only household members can be assigned.
4. Tapping a task opens it. The status control appears for owners, admins, the creator and the assignee. Edit and Delete appear only for owners, admins and the creator.
5. The checkbox on a row marks a task done, or moves it back to "to do", for anyone allowed to change its status.
6. Sign out, or a token the backend rejects, clears task data and returns to login.
7. A task can carry up to five photos, added from its detail screen by anyone who may change its status. See `IMAGES.md`.

## Why tasks use Redux

Auth, households and the theme use Zustand. The tasks feature uses Redux Toolkit instead, deliberately, as a learning exercise: it is the one self-contained feature where the two approaches can be compared side by side. The boundary is strict. Everything Redux lives under `src/redux/`, only the task screens import from it, and nothing in Redux reaches into the Zustand stores except to read the session token and to reset when the user changes. If the comparison is ever settled, either side can be rewritten without touching the other.

The pieces, in Redux terms:

- **Store** (`src/redux/store.ts`): one `configureStore` with a single `tasks` reducer. `RootState` and `AppDispatch` are derived from it.
- **Slice** (`src/redux/tasks-slice.ts`): the state shape, one synchronous reducer (`tasksReset`), five thunks made with `createAsyncThunk`, and the `extraReducers` that respond to their `pending` and `fulfilled` actions.
- **Thunks**: each wraps one API call. Dispatching one returns a promise; `.unwrap()` on it resolves with the result or throws the failure, so screens can `await` them like ordinary functions.
- **Failures**: thunks reject with a plain `{ message, status }` object rather than throwing, because Redux serializes thrown errors and the detail screen needs the 404 status to say "deleted" instead of "failed".
- **Selectors** (`selectTask`, `selectTaskList`): functions from the whole state to one piece of it. Screens subscribe with `useAppSelector` and re-render only when that piece changes.
- **Typed hooks** (`src/redux/hooks.ts`): `useAppSelector` and `useAppDispatch`, so screens never annotate state or dispatch by hand.
- **Provider**: `src/app/_layout.tsx` wraps the whole app so every screen can reach the store.

The reducers stay small because the cache rules are pure functions in `src/lib/task-helpers.ts` (`storeTaskPage`, `applyTask`, `forgetTask`). Redux Toolkit runs reducers inside Immer, so those functions may change `state` in place and Immer produces the new immutable state. The same functions run against plain objects in the Node tests.

## Read the code in this order

- `src/lib/task-permissions.ts`: statuses, priorities, labels, and the owner/admin/creator/assignee rules copied from the backend, so the UI hides actions the API would refuse. The backend still decides.
- `src/lib/task-helpers.ts`: the backend's sort order, filter matching, overdue detection, the YYYY-MM-DD form helpers, and the cache rules the reducers call. Pure functions, tested in Node.
- `src/api/tasks.ts`: typed requests and response validation for the five task endpoints, including the list's `status`, `page` and `limit` query.
- `src/stores/with-token.ts`: the token wrapper shared by the Zustand household store and the Redux task thunks. A 401 signs the user out.
- `src/redux/tasks-slice.ts`, `src/redux/store.ts`, `src/redux/hooks.ts`: the Redux pieces described above. Page 1 replaces a household's list, later pages append, and a late reply for a filter the user already left is dropped by comparing request IDs.
- `src/app/(app)/households/[householdId]/tasks/`: the routes; each re-exports a screen.
- `src/screens/tasks-screen.tsx`: filter chips, list, pull to refresh, load more, the quick-done checkbox and the New task button.
- `src/screens/task-form-screen.tsx`: create and edit in one form. The due date is typed as YYYY-MM-DD or set from the Today, Tomorrow and In a week chips. The assignee picker uses the household's members.
- `src/screens/task-detail-screen.tsx`: details, status control, edit and delete with confirmation.
- `src/components/task-row.tsx`: a row with its checkbox, due date, priority and assignee.

## Due dates

The app sends the start of the chosen day in the device's time zone and shows Today, Tomorrow, Yesterday or a short date. A task is overdue when its due day has passed and it is not done; the due date then shows in the error colour. A date picker can replace the text field later; `react-native-paper-dates` matches the Paper theme.

## Manual checks

- Household with no tasks: the list shows the create prompt; creating a task returns to the list with it shown.
- Filter chips: each shows only that status and its count; an empty filter offers "Show all tasks".
- More than 20 tasks: scrolling loads the next page; pull to refresh returns to the first page.
- Checkbox: marking done under the To do filter removes the row and lowers the count; under All it strikes the title through and re-sorts.
- A member sees no Edit or Delete on a task they did not create, and no status control unless assigned to it.
- The assignee can change status on the detail screen; the other fields are not editable for them.
- An owner or admin can edit and delete any task; deleting asks for confirmation and returns to the list.
- Assigning someone who has since left the household shows the backend's message and keeps the form.
- Invalid due date text shows an error without submitting; the Today, Tomorrow and In a week chips fill it; the clear icon empties it.
- Overdue tasks show the due date in the error colour in both themes; done tasks never show as overdue.
- Deep link to a task or its edit form while signed in loads it and shows a back button.
- After sign out and sign in as a different user, no tasks from the previous user remain.

## Tests

- Permission matrix: `node --experimental-strip-types --test tests/task-permissions.test.mjs`
- Ordering, filters and dates: `node --experimental-strip-types --test tests/task-helpers.test.mjs`
- Cache rules behind the reducers: `node --experimental-strip-types --test tests/task-cache.test.mjs`
- Types: `npx tsc --noEmit` after Expo has regenerated route types (`npm start`).
