# HomeHub households

Signed-in users land on their household list. Data comes from the backend's household endpoints, documented in `D:\HomeHub\backend\API.md`. Each household's task list is described in `TASKS.md` and its expenses in `EXPENSES.md`.

## Flow

1. Login opens the household list. A user with no memberships sees a prompt to create one.
2. Creating a household makes the user its owner and opens the household screen.
3. The household screen lists members. Owners and admins see an "Add member" button and a menu on each member they may manage.
4. Adding a member takes the email address the person registered with. Owners may choose the role; admins can only add members.
5. Sign out, or a token the backend rejects, clears household data and returns to login.

## Read the code in this order

- `src/api/client.ts`: backend URL, fetch with timeout, bearer header, safe network messages. Failed responses throw an `ApiError` carrying the backend's message and status.
- `src/api/households.ts`: typed requests and response validation for the household and member endpoints.
- `src/lib/household-permissions.ts`: the owner/admin/member matrix copied from the backend, so the UI hides actions the API would refuse. The backend still decides.
- `src/stores/household-store.ts`: Zustand store holding the household list and members per household. Actions update the cache from the response. A 401 signs the user out. The store resets when the signed-in user changes.
- `src/app/(app)/_layout.tsx`: stack for signed-in routes. The root layout guards the whole group with the session.
- `src/screens/households-screen.tsx`: list, empty state, pull to refresh, sign out.
- `src/screens/create-household-screen.tsx`: name form; duplicate names show the backend's 409 message.
- `src/screens/household-detail-screen.tsx`: members, role changes, removal with confirmation.
- `src/screens/add-member-screen.tsx`: email plus role.
- `src/components/app-shell.tsx`, `member-row.tsx`, `status-message.tsx`: shared layout, member row with its menu, and empty/error states.

## Manual checks

- New user: list shows the create prompt; creating opens the household with one owner member.
- Duplicate household name shows "You already have a household with this name" and keeps the form.
- Add member with an unregistered email explains that they need to register first.
- Add member with an existing member's email shows the duplicate message.
- Admin sees no role selector when adding, and no menu on the owner or other admins.
- Owner can promote a member, demote an admin, and remove either; the owner's own row has no menu.
- Removing asks for confirmation; the list updates without a reload.
- Pull to refresh on both lists; airplane mode shows a retry message.
- Deep link to a household while signed in shows a back button that returns to the list.
- After sign out and sign in as a different user, no households from the previous user remain.

## Tests

- Permission matrix: `node --experimental-strip-types --test tests/household-permissions.test.mjs`
- Types: `npx tsc --noEmit` after Expo has regenerated route types (`npm start`).
