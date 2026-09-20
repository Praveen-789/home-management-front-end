# HomeHub notifications

Each user has one inbox across all their households: task assignments, completed tasks, household expenses, invitations to a household and the answers to invitations the user sent. The backend writes these itself; the app only reads, marks read and deletes. Endpoints and event rules are documented in `D:\HomeHub\backend\API.md`.

## Flow

1. The bell in the header of the household list and of a household shows the unread count. Tapping it opens the inbox. The side menu's Notifications item shows the same count and opens the same inbox.
2. The inbox lists notifications newest first, 20 per page, with All and Unread chips. Scrolling to the end loads the next page. Pull to refresh reloads the first page and the count.
3. Tapping a notification marks it read at once and opens what it is about: the task, the expense, or the household. An invitation is different: the user is not a member yet, so tapping it opens a dialog with the invitation's text and Accept and Decline. Accepting opens the household. Tapping outside the dialog leaves the invitation unanswered; it also stays on the household list (see `HOUSEHOLDS.md`). The notification outlives its invitation, which the backend deletes once it is answered or cancelled, so the inbox reloads the pending invitations on each tap and shows "This invitation is no longer available" instead of the dialog when it is gone. The backend refuses a dead invitation regardless (404). If the task or expense was deleted since, or the user left the household, the destination screen says so. A notification with no target (saved before the backend recorded targets, or for a deleted household) is only marked read.
4. The bin on a row deletes it. The double tick in the header marks everything read.
5. Sign out, or a token the backend rejects, clears the inbox and returns to login.

## Keeping the badge current

There is no push or socket connection yet, so the app asks for the count when the user could see a change:

- when the signed-in area mounts and whenever the app returns to the foreground,
- every 60 seconds while the app stays in the foreground (never in the background),
- whenever a screen with the bell, or the inbox, gains focus,
- and locally, without a request, after mark read, mark all read and delete.

All of these go through `refreshUnreadCount()` in the store. When Expo push arrives, its handler calls the same function and the timer can go.

A count reply that was requested before a local change (say a mark-read) is dropped, so a slow reply cannot bring back a stale badge.

## Read the code in this order

- `src/lib/notification-helpers.ts`: icon per type, the rule from type and IDs to a navigation target, relative times, and the inbox rules the store uses (page merging without repeats, mark read, mark all, delete, and what each does to the count). Pure functions that return new objects, tested in Node.
- `src/api/notifications.ts`: typed requests and response validation for the five endpoints. `type` is kept as a string so a new backend event still loads, with a plain bell icon.
- `src/stores/notification-store.ts`: Zustand store holding the loaded list and the unread count. Page 1 replaces the list, later pages append, and a late reply for a filter the user left is dropped. Mark read is optimistic and rolls back on failure; a 404 on mark read or delete means it was deleted elsewhere, so the row just leaves. A 401 signs the user out. The store resets when the signed-in user changes.
- `src/hooks/use-unread-count-sync.ts`: the foreground and one-minute refresh, mounted once in `src/app/(app)/_layout.tsx`.
- `src/components/notification-bell.tsx`: header bell with badge; refreshes on screen focus.
- `src/app/(app)/(stack)/notifications.tsx`: the route; re-exports the screen.
- `src/screens/notifications-screen.tsx`: chips, list, pull to refresh, load more, mark all read, delete, and opening a target. Before opening, it reloads the household list if the target household is not in it, because a household the user was just added to is missing from a list loaded earlier.
- `src/components/notification-row.tsx`: a row with the backend's title and message as written.

The title and message are shown exactly as the backend wrote them; the app never parses them. Icons and navigation come from `type`, `householdId` and `entityId`.

## Tests

`node --experimental-strip-types --test tests/notification-helpers.test.mjs`

## Manual checks

Use two accounts, A and B, in the same household.

- New account: the bell has no badge and the inbox shows the empty message.
- The bin fades its row out and the rows below glide up (see "Motion" in `HOUSEHOLDS.md`). Switching between All and Unread swaps the list at once, with no fading.
- A assigns a task to B: within a minute, or on returning to the app or the household list, B's bell shows 1. The inbox shows it bold with a dot.
- B taps it: the task opens; going back shows it read and the badge cleared.
- B marks the task done: A gets "Task completed"; tapping opens the task.
- A records an expense: B gets "New household expense"; tapping opens the expense. A gets nothing for their own action.
- A invites a new user C: C's inbox shows "A wants to add you to ...". Tapping it offers Accept and Decline. Accept opens the household even though C's household list was loaded before, and A's inbox shows that C accepted; tapping that opens the household.
- C declines instead: A's inbox shows that C declined.
- C taps an invitation notification after A cancelled it, or after already accepting or declining it: a message says it is no longer available and no Accept / Decline dialog opens. C does not join.
- A deletes a task B was notified about: B taps the notification and sees the task screen's not-found state, not a crash.
- Unread chip: shows only unread; tapping one removes it from this list; with none left it offers "Show all notifications".
- Mark all read: the badge clears, every row loses its dot, and the button disables.
- Delete an unread row: it disappears and the badge drops by one. Delete a read row: the badge is unchanged.
- More than 20 notifications: scrolling loads the next page with no repeated rows.
- Background the app for a while and return: the badge updates without touching anything.
- Sign out and sign in as another user: none of the first user's notifications or count appear.
