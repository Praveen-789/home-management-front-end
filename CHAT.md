# Chat frontend

Open **Chats** from the side menu or from a household. Select a household, open its shared chat, or choose **Start a private chat** and a member.

Included:
- Household and one-to-one conversations with text and photos, message history, unread badges, read tracking, mute, message editing and deletion.
- Optimistic sends with an explicit retry using the original idempotency key.
- Authenticated Socket.IO; REST recovery on initial load, reconnect and foregrounding.
- Native Expo push registration, the Android chat channel, in-app alerts, and notification tap routing.
- **Reply** and **Mark as read** buttons on chat notifications, which work on Android even when the app is closed.
- Native device deregistration before sign-out, with chat caches and drafts cleared on session changes.
- In the household chat, each person's picture and name head a run of their messages, instead of repeating on every bubble.
- Delivered and read ticks on your own messages, and **Message info** showing who read a message and when.
- Light/dark themes, keyboard-aware composer, loading/empty/error states and household member selection.
- One photo per message, with an optional caption. See [Photos](#photos).

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

## Editing

Long-press one of your own messages. While it is under 15 minutes old, the header shows a pencil next to info and delete. The composer then turns into an editor: a bar reads **Editing message** with the old text, the box holds that text ready to change, and the send button becomes a tick. Any text you were typing waits untouched and comes back when the edit ends. The ✕ on the bar and Android's back button cancel the edit.

- A photo's caption can be changed or emptied. The photo itself stays. A text message needs some text.
- Saving the same text just closes the editor. When the backend refuses because the 15 minutes ran out or the message was deleted, a notice explains it and the editor closes. A network failure keeps your text so you can try again.
- The pencil disappears the moment the message turns 15 minutes old, and a chat that cannot be sent to offers no edit.
- The bubble keeps its place, ticks and unread state, and shows **Edited** before the time. The chat list shows the new text when it is the latest message. No edit history is kept.
- Everyone who still sees the message gets `chat:message-edited` and the bubble changes live, including on your other devices. A phone that was offline catches up when it reconciles.
- A later copy always wins: `newerMessage` in [chat-helpers.ts](src/lib/chat-helpers.ts) keeps the most recently edited copy, and a deletion over both. A page fetched before an edit cannot put the old text back when it arrives late.
- A push alert already shown keeps the old text; one not yet sent carries the new text.

## Photos

The picture button left of the message box offers **Take photo** or **Choose from library**. The photo waits above the box with a remove button, and the box becomes **Add a caption…**. Send works with a caption or without one. Picking again replaces the waiting photo, because a message carries one. The waiting photo is kept per chat, like the text draft, while you look at other screens.

Sending shows the bubble at once with the photo from the phone and a spinner, reading **Uploading…** and then **Sending…**. The store asks the backend for a ticket (`POST /conversations/:id/uploads`), sends the file straight to Cloudinary with the same code as task photos, then sends the message with the photo's details. The finished upload is saved on the unsent row. A retry after a failed send reuses that upload and the same `clientMessageId`, so a photo is never uploaded or posted twice. A failed upload is simply tried again on retry.

The bubble shows the photo at full width, in its own shape between a wide letterbox and a tall portrait, with the caption, time and ticks underneath. It loads a copy that Cloudinary sizes for the bubble (`chatPhotoUrl`), not the full file. A tap opens the full photo in the same viewer as task photos, credited to the sender. During a selection a tap selects the message instead, and a long press on the photo starts a selection as it does on the rest of the bubble. Chat photos have no delete button in the viewer: delete the message. **Delete for everyone** removes the photo for everyone. **Delete for me** and **Clear chat** hide it only for you.

The chat list shows `📷 Photo`, or `📷` and the caption, and so does Message info. A screen reader hears "Photo" instead of the emoji. Push alerts get the same text from the backend.

A message from a backend without chat photos has no `images` field and is shown as text, as before.

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

## Delivered and read receipts

Your own messages carry ticks next to the time: one tick means the server has it, two mean it has reached the other person's phone, and two coloured ticks mean they have read it. In the household chat the slowest person decides, as on WhatsApp, so two ticks mean it has reached everyone.

**Ticks cost nothing extra.** Each conversation summary carries `receipts`: for every other member, how far they have received (`deliveredSequence`) and read (`readSequence`). Two numbers per person tick every bubble in the chat. `messageStatus` in [chat-helpers.ts](src/lib/chat-helpers.ts) is the whole rule, and it is a pure function tested in Node. When someone's progress moves, the socket sends `chat:receipt` and the store re-ticks. Progress only moves forward: `applyReceipt` ignores a late or repeated event, and `mergeReceipts` stops an older REST answer from taking back what the socket already reported.

**A late joiner does not hold old messages back.** Someone counts for a message when they joined before it was sent, or when it has reached them anyway. So inviting a new member does not turn old read messages back to one tick, and the newcomer still counts once they open the history.

**Message info.** Long press already selects messages, so with exactly one of your own messages selected the header shows an info button beside delete. It opens [message-info-dialog.tsx](src/components/message-info-dialog.tsx), which asks the backend who the message reached and who read it, with times. This is the only per-message request, and it happens only when someone asks. While the dialog is open a new receipt fetches the list again. A line reads "Read" with no time when the backend has no honest time to give: the read is older than this feature, or the person used **Clear chat**, which sweeps messages away without opening them.

**How this phone reports delivery.** The backend does not guess, because a socket emit or an Expo receipt does not prove a phone has the message. The phone says so itself, in three places:

- the chat store, when a message from someone else arrives over the socket, after a sync, and when the chat list loads with someone else's unread message as the preview;
- the background task in [chat-notification-delivery.ts](src/lib/chat-notification-delivery.ts), when a push wakes a closed or backgrounded app. It reports with the saved session, after the notification is on screen, and only while the app is not open, so the store and the task never both report the same message.

Each new message costs at most one small request. A repeat costs none, because the store remembers the highest position it has reported, and what you have read already counts as delivered on the backend. A failed report is forgotten and made again by the next sync.

**Mark as read from a notification counts as read**, with a time, the same as opening the chat.

## Validation

~~~powershell
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test tests/*.test.mjs
npx expo export --platform all
~~~

The notification action tests cover both payload shapes (parsed for a running app, raw JSON for the background task), ignored payloads, stable reply IDs, the reply and Mark as read flows, failure notices, the wrong-account and signed-out cases, and a press delivered twice.

The receipt tests cover the tick rules for private and household chats, late joiners, forward-only progress, stale summaries, honest time labels, payload validation, and when the store does and does not report delivery. The delivery tests cover the report from the background task.

The chat tests exercise missing/out-of-order events, paged recovery, retries, stale responses after logout, access removal, batch deletion, the selection limit, the Delete for everyone rules, Clear chat, message editing (the request, live and late edits, edits outside the loaded history, and reconcile), and photo sending: upload once, retry without re-uploading, retry after a failed upload, captionless photos, the message guard, and the waiting photo leaving with lost access. `tests/images.test.mjs` covers the bubble size and the sized Cloudinary URL. Native registration tests cover permission timing, Expo project/token use, and registration/sign-out races.

Phone checks:
1. Sign in as two different household members on separate devices.
2. Test household and private messages; refresh/reopen to check history.
3. Background one phone and send a message from the other; tap the push to open the chat.
4. Keep the recipient's chat visible and confirm it becomes read without an unnecessary alert.
5. Long-press a message, tap a few more, and test Delete for me and Delete for everyone on both devices. Include someone else's message in the selection and confirm Delete for everyone disappears. Press Android back during a selection and confirm the chat stays open.
6. Clear a chat on one phone: it empties there, the other member still sees everything, and the next message shows for both.
7. Mute, lose/recover connectivity, and retry a failed send.
7a. Receipts, with two phones. Send a message with the other phone's app closed: one tick, then two when the push arrives there, without opening the app. Open the chat there: the ticks turn coloured on the first phone within a second. Turn on aeroplane mode on the second phone and send again: it stays on one tick until the phone is back online.
7b. Long-press one of your own messages and tap the info button: the other person shows "Read" with a time. In the household chat, check that someone who has not opened the chat shows "Delivered" or "Not delivered yet", and that the bubble stays on two grey ticks until everyone has read it. Select someone else's message, or two messages: the info button is not offered.
7b2. Editing. Send a message, long-press it and tap the pencil. Change the text and save: both phones show the new text with **Edited**, and the chat list too if it is the latest message. Start editing, then cancel with ✕ and with Android back: the draft you were typing comes back. Edit a photo's caption down to nothing: the photo stays. Wait 15 minutes: the pencil is no longer offered. Edit a message while the other phone is in aeroplane mode, then reconnect it: it shows the new text.
7c. Photos. Send a photo without a caption and one with a caption, from the camera and from the library. Both phones show it in the bubble, the chat list shows `📷 Photo` or `📷 Leak under the sink`, and the push alert says the same. Tap the photo to open it full screen. Try a wide panorama and a tall screenshot: both fit the bubble and open uncropped in the viewer. Turn on aeroplane mode, send a photo, see it fail, turn it off and press Retry message: it arrives once. Delete a photo for everyone within 15 minutes: it is gone on both phones.
8. Sign out and verify that this installation no longer receives that user's chat notifications.
9. Reply from a notification three ways: with the app open (pull the shade down), in the background, and swiped away from recents. The message must arrive exactly once each time, the alert must disappear, and the chat must show as read. Test the closed case in a release build (`npx expo run:android --variant release`), because a development build needs Metro running to start its JavaScript.
10. Press **Mark as read** with several alerts from one chat showing: all of them up to the pressed one disappear.
11. Turn on aeroplane mode, reply, and confirm the **Reply not sent** notice appears and opens the chat.

Automated browser control was unavailable during implementation. Native notification delivery and keyboard/layout behaviour still need the physical-device checks above.
