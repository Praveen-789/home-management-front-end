# Chat frontend

Open **Chats** from the side menu or from a household. Select a household, open its shared chat, or choose **Start a private chat** and a member.

Included:
- Household and one-to-one text conversations, message history, unread badges, read tracking, mute and message deletion.
- Optimistic sends with an explicit retry using the original idempotency key.
- Authenticated Socket.IO; REST recovery on initial load, reconnect and foregrounding.
- Native Expo push registration, the Android chat channel, in-app alerts, and notification tap routing.
- **Reply** and **Mark as read** buttons on chat notifications, which work on Android even when the app is closed.
- Native device deregistration before sign-out, with chat caches and drafts cleared on session changes.
- Light/dark themes, keyboard-aware composer, loading/empty/error states and household member selection.
- Images are intentionally deferred.

## Run on Android

From this directory:

~~~powershell
npx expo run:android
~~~

The Android native configuration has been regenerated from the existing app.json so Firebase and expo-notifications are included. Reinstall this development build once. Rebuild once more after pulling the notification buttons: `expo-task-manager` is a native module, and it must be in the build to display the new data-only chat pushes. For subsequent JavaScript-only changes, use your usual npx expo start --lan.

Open Chats and choose **Enable notifications** on a physical phone. The backend must be reachable at EXPO_PUBLIC_API_URL; a phone cannot use the computer's localhost. The Expo project ID and Firebase client config are already referenced by app.json. Expo/Firebase private credentials stay outside the frontend.

A development build supports remote push. iOS additionally needs its own Apple/APNs credentials; this work does not configure those. Web supports live chat and the in-app inbox, not native Expo push.

## Behaviour

Messages are fetched/sent through the authenticated backend. Socket events merge by server message ID and never move the REST recovery cursor. On reconnect or foregrounding, cached message IDs are reconciled in batches so deletion events missed in the background are recovered without polling or downloading the full history. Read state advances only for server-confirmed messages actually visible while the conversation is focused and the app is active.

Drafts and failed sends stay in memory for the signed-in session; they are not persisted across an app restart. A failed send can be retried without creating a duplicate if the server accepted the first attempt but its response was lost.

Long-press a confirmed message to start a selection; after that a tap adds or removes a message, up to 50. The header shows the count, a close button and the delete action, and Android's back button leaves the selection rather than the chat. One request deletes the whole selection, and the backend deletes all of it or none, so there is never a half-finished result to explain. **Delete for me** hides the messages only for the signed-in user and synchronizes that choice to their other devices. **Delete for everyone** is offered only when every selected message is the user's own, not already deleted and under 15 minutes old, and it is withdrawn the moment the oldest one passes that age; other members then see `This message was deleted.` Pending messages cannot be selected until the server confirms them. Push notifications already shown by Android or iOS cannot be recalled.

**Clear chat** (the sweep icon in the chat header) empties the conversation for the signed-in user only, on all their devices. Everyone else keeps the full history, nothing is removed from the database, and messages sent afterwards appear as usual. It also marks the chat read. It cannot be undone, so it asks first.

Mute controls that conversation's alerts. Reading a chat updates the backend read cursor and notification count, and once nothing is unread the backend deletes that chat's inbox notification; the next message brings it back. Tapping a chat notification in the inbox deletes it straight away and opens the chat. Deleting an inbox notification alone does not mark its chat messages read.

## Replying from a notification

Android chat pushes are high-priority data-only messages (`delivery: chat_local_v1`) with `previewTitle` and `previewBody`. The registered background task validates the saved session and recipient, checks the saved read cursor, and presents a local notification with category `chat_message`. This avoids Firebase automatically rendering a plain notification without actions. The category supplies **Reply** (with a text box) and **Mark as read**, neither of which opens the app. Existing notifications do not gain buttons. Android can delay background tasks; force-stopping the app prevents delivery until it is reopened.

Reading messages in a chat now dismisses notifications for that account and conversation up to the confirmed read sequence. Other chats and newer unread messages stay visible. The read cursor is saved on the phone to suppress delayed pushes after a restart. The same cleanup runs for synchronized read state and successful notification actions. Old Firebase-rendered notifications may lack conversation metadata and must be cleared manually.

Deploy the updated app before enabling the new backend payload. Android builds without the native `expo-task-manager` module must be rebuilt; old clients cannot display the new data-only payload. Keep Metro running for development-build background tasks. Use a release build for closed-app verification.

A press reaches the code in one of two ways, and both call the same `handleChatAction` in [chat-notification-actions.ts](src/lib/chat-notification-actions.ts):

- **App running.** The response listener in [use-push-notifications.native.ts](src/hooks/use-push-notifications.native.ts) receives it. An ordinary tap still opens the chat; a button press is handled in place.
- **App in the background or closed (Android only).** Android starts the JavaScript bundle with no screen and runs the task defined in [chat-notification-task.native.ts](src/lib/chat-notification-task.native.ts). A task must exist before any screen does, so `package.json` points `main` at [index.ts](index.ts), which imports the task first and the router last.

With no screen there is no loaded store, so the handler reads the saved session from secure storage. It acts only when that user is the `recipientId` the push was addressed to. A reply is an ordinary message send, then the chat is marked read up to the reply, then every alert of that chat that is now read is cleared. Mark as read does the last two steps with the alerted message's `sequence`.

In the background Android delivers one press to both the listener and the task. The reply's `clientMessageId` is built from the notification ID and the text, so the backend's idempotent send keeps the two deliveries as one message.

If a reply cannot be sent (offline, signed out, session expired), the alert is replaced by one **Reply not sent** notice per chat that shows the text and opens the chat when tapped. Android would otherwise leave a spinner on the alert forever. A failed Mark as read leaves the alert in place so it can be pressed again.

Limits: Expo shows one notification per message and cannot stack a conversation inside one alert the way WhatsApp does. iOS runs the background task only for silent pushes, never for a button press, and iOS push is not configured in this project anyway.

Notification permission is requested only through the Enable button. Previously granted permission registers automatically at sign-in/foreground. Native token changes are converted to an Expo token without recursively fetching the native token, and an unchanged token is not posted again. Sign-out waits for any pending registration and unregisters the device first; if the network cannot revoke it, sign-out explains the failure so it can be retried.

## Validation

~~~powershell
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test tests/*.test.mjs
npx expo export --platform all
~~~

The notification action tests cover both payload shapes (parsed for a running app, raw JSON for the background task), ignored payloads, stable reply IDs, the reply and Mark as read flows, failure notices, the wrong-account and signed-out cases, and a press delivered twice.

The chat tests exercise missing/out-of-order events, paged recovery, retries, stale responses after logout, access removal, batch deletion, the selection limit, the Delete for everyone rules, and Clear chat. Native registration tests cover permission timing, Expo project/token use, and registration/sign-out races.

Phone checks:
1. Sign in as two different household members on separate devices.
2. Test household and private messages; refresh/reopen to check history.
3. Background one phone and send a message from the other; tap the push to open the chat.
4. Keep the recipient's chat visible and confirm it becomes read without an unnecessary alert.
5. Long-press a message, tap a few more, and test Delete for me and Delete for everyone on both devices. Include someone else's message in the selection and confirm Delete for everyone disappears. Press Android back during a selection and confirm the chat stays open.
6. Clear a chat on one phone: it empties there, the other member still sees everything, and the next message shows for both.
7. Mute, lose/recover connectivity, and retry a failed send.
8. Sign out and verify that this installation no longer receives that user's chat notifications.
9. Reply from a notification three ways: with the app open (pull the shade down), in the background, and swiped away from recents. The message must arrive exactly once each time, the alert must disappear, and the chat must show as read. Test the closed case in a release build (`npx expo run:android --variant release`), because a development build needs Metro running to start its JavaScript.
10. Press **Mark as read** with several alerts from one chat showing: all of them up to the pressed one disappear.
11. Turn on aeroplane mode, reply, and confirm the **Reply not sent** notice appears and opens the chat.

Automated browser control was unavailable during implementation. Native notification delivery and keyboard/layout behaviour still need the physical-device checks above.
