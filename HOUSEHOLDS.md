# HomeHub households

Signed-in users land on their household list. Data comes from the backend's household endpoints, documented in `D:\HomeHub\backend\API.md`. Each household's task list is described in `TASKS.md` and its expenses in `EXPENSES.md`.

## Flow

1. Login opens the household list. A user with no memberships sees a prompt to create one. Invitations waiting for an answer sit at the top of this screen, with Accept and Decline, whether or not the user has a household yet.
2. Creating a household makes the user its owner and opens the household screen.
3. The household screen lists members. Owners and admins see an "Invite member" button and a menu on each member they may manage.
4. Nobody is added directly. Inviting takes the email address the person registered with; owners may choose the role, admins can only invite members. The person appears under "Waiting for an answer" on the household screen, where an owner or admin may cancel the invitation.
5. The invited person gets a notification and sees the invitation on their household list. Accepting makes them a member and the household appears in their list; declining removes the invitation. Either way the sender is notified. Declining asks for confirmation, because only a new invitation can undo it.
6. Sign out, or a token the backend rejects, clears household data and returns to login.

## Read the code in this order

- `src/api/client.ts`: backend URL, fetch with timeout, bearer header, safe network messages. Failed responses throw an `ApiError` carrying the backend's message and status.
- `src/api/households.ts`: typed requests and response validation for the household and member endpoints.
- `src/api/invitations.ts`: the same for invitations, from both sides: the invited user's list, accept and decline, and the household's pending list, invite and cancel.
- `src/lib/household-permissions.ts`: the owner/admin/member matrix copied from the backend, so the UI hides actions the API would refuse. The backend still decides.
- `src/stores/household-store.ts`: Zustand store holding the household list and members per household. Actions update the cache from the response. A 401 signs the user out. The store resets when the signed-in user changes.
- `src/stores/invitation-store.ts`: invitations the user has received, and pending ones per household. Accepting reloads the household list. A 404 on accept or decline means it was cancelled or already answered, so it leaves the list with a message that says so; a 404 on cancel is treated as done.
- `src/hooks/use-invitation-actions.ts`: accept and decline with their busy state and snackbar text, shared by the household list and the notification inbox.
- `src/app/(app)/_layout.tsx` and `src/app/(app)/(stack)/_layout.tsx`: the drawer that holds the side menu, and inside it the stack of signed-in routes. The root layout guards the whole group with the session. See "Side menu" below.
- `src/components/side-menu.tsx`: what the drawer shows, including sign out.
- `src/screens/households-screen.tsx`: invitations, list, empty state, pull to refresh. Invitations reload every time the screen gains focus.
- `src/screens/create-household-screen.tsx`: name form; duplicate names show the backend's 409 message.
- `src/screens/household-detail-screen.tsx`: members, role changes, removal with confirmation, and the pending invitations with their cancel button.
- `src/screens/add-member-screen.tsx`: email plus role; sends the invitation.
- `src/components/app-shell.tsx`, `member-row.tsx`, `invitation-card.tsx`, `pending-invitation-row.tsx`, `status-message.tsx`: shared layout, member row with its menu, the two views of an invitation, and empty/error states.

## Side menu

The menu button on the household list slides in a drawer with the signed-in user, Households, Notifications with its unread count, the appearance switch, Link Google account (Android only) and Sign out. The header keeps only the notification bell, so the unread badge stays visible without opening anything.

It uses Expo Router's `Drawer`, which SDK 57 bundles inside `expo-router`. A drawer holds sibling screens, but HomeHub's screens are a stack: household, then tasks, then a task. So the drawer has one screen, the `(stack)` group, and every route file lives in that folder. Names in brackets never appear in a URL, so links and deep links are unchanged.

- Only the household list shows the menu button and opens the drawer on a swipe from the left edge. Deeper screens show a back arrow and keep that edge for the back swipe.
- `AppShell` opens the drawer by dispatching `DrawerActions.openDrawer()`. The screen sits in the stack, which has no drawer, so the action travels up to the drawer around it.
- The drawer keeps `SideMenu` mounted while closed. That is why the sign out and Google dialogs can show after a tap has already closed the menu.

## Motion

Motion in HomeHub confirms what just happened, and is short enough that nobody waits for it. It uses `react-native-reanimated`, which was already installed. `src/constants/motion.ts` holds the two animations every list shares: `rowExit`, a 180 ms fade for a row that has left, and `rowShift`, a 220 ms glide for what remains.

- A list becomes `Animated.FlatList` with `itemLayoutAnimation={rowShift}`, and each row sits in an `Animated.View` with `exiting={rowExit}`. The task list, the notification inbox and the household list do this.
- `skipEnteringExitingAnimations` is set on those lists. A filter change swaps the whole list, and this keeps the swap instant instead of fading every row.
- Invitation cards are drawn with `map`, so each card carries `exiting` and `layout` itself. The section fades too, because the last card takes the heading with it.
- Only a view's position may glide. The empty household screen re-centres when an invitation leaves, which changes its height, and a height glide makes the contents jump first. So that block is left to move at once.
- The phone's "Remove animations" setting is respected without any code: Reanimated's default for these animations is `ReduceMotion.System`.
- Expense rows are not animated. An expense is deleted from its detail screen, so its row leaves while the list is hidden.

## Manual checks

- With two invitations, declining the first fades its card, and the second card, the heading and the household cards glide up together. Declining the last one fades the whole Invitations section.
- With "Remove animations" on in the phone's accessibility settings, rows and cards leave at once, with no fade or glide.
- The menu button and a swipe from the left edge both open the drawer on the household list; the Android back button closes it. Inside a household the swipe does nothing.
- Notifications in the menu opens the inbox with a back arrow, and its badge matches the bell. Tapping it twice quickly opens one inbox, not two.
- The appearance switch changes the theme at once, drawer included, and the choice survives a restart.
- Sign out closes the menu, asks for confirmation, then returns to login.
- New user: list shows the create prompt; creating opens the household with one owner member.
- Duplicate household name shows "You already have a household with this name" and keeps the form.
- Invite with an unregistered email explains that they need to register first.
- Invite an existing member, or someone already invited: each shows its own duplicate message.
- Admin sees no role selector when inviting, no menu on the owner or other admins, and no cancel button on an owner's admin invitation.
- After inviting, the person is listed under "Waiting for an answer" and not under members. Cancelling removes them.
- Invited user with no households: the invitation card shows above the create prompt. Accept: the household appears and opens normally. Decline: asks first, then the card disappears.
- Invitation cancelled before the invited user answers: Accept shows "This invitation is no longer available" and the card disappears.
- Sender removed from the household before the answer: Accept shows that the invitation is no longer valid; Decline still works.
- After an acceptance, the sender's household screen shows the new member after pull to refresh, and their inbox shows who accepted.
- Owner can promote a member, demote an admin, and remove either; the owner's own row has no menu.
- Removing asks for confirmation; the list updates without a reload.
- Pull to refresh on both lists; airplane mode shows a retry message.
- Deep link to a household while signed in shows a back button that returns to the list.
- After sign out and sign in as a different user, no households from the previous user remain.

## Tests

- Permission matrix: `node --experimental-strip-types --test tests/household-permissions.test.mjs`
- Types: `npx tsc --noEmit` after Expo has regenerated route types (`npm start`).
