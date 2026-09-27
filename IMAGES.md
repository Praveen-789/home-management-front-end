# HomeHub photos

Tasks and expenses can each carry up to five photos: a picture of the finished chore, a receipt for the bill. Files live in Cloudinary. Chat messages can carry one photo each; that flow is described under "Photos" in [CHAT.md](CHAT.md#photos) and reuses the upload and viewer below. The backend's part is documented under "Images" in `D:\HomeHub\backend\API.md`.

## Flow

1. On a task or expense detail screen, the Photos section shows square thumbnails and, for people allowed to change the item, an "Add photo" tile offering the camera or the photo library.
2. The chosen picture is shrunk so its longest side is 1600 pixels and saved as a JPEG, then uploaded straight to Cloudinary with a one-time signature from the backend. HomeHub's API never handles the bytes.
3. Once Cloudinary accepts the file, the app records it against the task or expense. The response is the whole item, so the list and detail screens update from the store as usual.
4. Tapping a thumbnail opens the photo full screen with who added it, when, its size, and a Delete button for those allowed. Delete asks for a second tap inside the viewer.
5. Who may add and remove follows the item's own rule: for a task, owners, admins, the creator and the assignee; for an expense, owners, admins, the recorder and the payer.
6. Deleting a task or an expense removes its photos too.

## Read the code in this order

- `src/lib/images.ts`: the five-photo limit, the resize rule, and size formatting. Pure functions, tested in Node.
- `src/api/images.ts`: the `Photo` shape with its validator, the upload ticket request, and the multipart upload to Cloudinary. Expo 57 swaps the global `fetch` for its own, which only sends strings and Blob-like form parts, so on native the file goes in as `expo-file-system`'s `File`, never as React Native's `{ uri, name, type }` object. On web the bytes are read from the URI.
- `src/api/tasks.ts` and `src/api/expenses.ts`: `images` on every task and expense, plus the attach and remove requests, which return the parent.
- `src/lib/pick-image.ts`: permissions, the picker, and the resize with `expo-image-manipulator`'s context API.
- `src/redux/tasks-slice.ts`: `addTaskImage` and `removeTaskImage` thunks; `src/stores/expense-store.ts`: `addImage` and `removeImage`. Both reuse the cache functions that already handle a replaced item.
- `src/components/image-grid.tsx` and `image-viewer.tsx`: the thumbnails with the add tile, and the full-screen viewer. The viewer takes any photo with a size, a date and a name to credit, so chat photos open in it too, credited to their sender.
- `src/screens/task-detail-screen.tsx` and `expense-detail-screen.tsx`: the Photos section and the add and remove handlers.

## Profile pictures

A person can set one profile picture and a household can have one picture. Both reuse the upload flow above: the backend signs an upload, the file goes straight to Cloudinary, and the app then tells the backend which file to use. The backend's part is under "Profile pictures" in `D:HomeHubackendAPI.md`.

### What the person sees

1. The side menu's header shows their picture, or their initials. Tapping it opens **Your profile**.
2. On the profile, tapping the picture offers **Take photo**, **Choose from library** and, when there is one, **Remove picture**. Removing asks first.
3. On Android the crop screen keeps a 1:1 ratio with a round guide. iOS always crops square. A browser has no crop screen, so there the backend's face-centred crop does the work.
4. The picture is shrunk to at most 1024 pixels a side before upload. The backend delivers it as a 400 pixel square for avatars.
5. Owners and admins change a household's picture the same way, from the hero card on the household screen. Members see the picture without the camera badge.
6. Pictures then appear wherever that person or household does: member lists, chat lists, the private-chat picker, household cards and invitation cards. Anywhere without a picture falls back to initials or the home icon, and so does a picture that fails to load.

7. Tapping a picture opens it in a viewer: in member lists, the chat list, household cards, invitation cards, the household chat's bubbles and Message info. Initials and the home icon have nothing to open, so they stay plain. Where a tap already opens the edit menu (your profile, and the household hero for owners and admins), the menu offers **View picture** instead. The side menu's header is left alone because the whole block opens the profile.

### The viewer and the larger picture

An avatar is a 400 pixel square, which would look soft filling a phone screen. Cloudinary resizes on request, so the viewer asks for the same crop at 1000 pixels: `largePictureUrl` swaps `w_400,h_400` for `w_1000,h_1000` in the URL. A URL that does not look like one of ours comes back unchanged, so the viewer falls back to the small picture. The small copy is already cached and is shown as a placeholder, so the viewer never opens empty. This ties the app to the URL shape the backend builds (`profileImageUrl` in its `cloudinary.ts`); if that transformation ever changes, `AVATAR_SIZE` in `src/lib/images.ts` changes with it, and a test pins both shapes.

Pictures uploaded before this change are 512 pixels, so they look slightly soft in the viewer until they are set again.

[picture-viewer.tsx](src/components/picture-viewer.tsx) is React Native's own `Modal`, not a Paper one, so it also opens above a dialog such as Message info. A tap on the dark area, the close button, or Android's back button closes it.

### Read the code in this order

- `src/lib/images.ts`: `initials`, `PROFILE_UPLOAD_SIDE` and `largePictureUrl`. `src/lib/household-permissions.ts`: `canChangePicture`. Pure functions, tested in Node.
- `src/api/images.ts`: `uploadWithTicket` takes the backend route that signs the upload, so the same code serves task photos, avatars and household pictures. `src/api/profile.ts` and `src/api/households.ts`: the set and remove requests.
- `src/lib/pick-image.ts`: the `profile` option turns on the square crop and the smaller size.
- `src/stores/auth-store.ts`: `changeAvatar`, `removeAvatar`, and `refreshProfile`, which runs when the app opens so a picture set on another phone shows up. `updateUser` rewrites the saved session without touching the token, so no other store treats it as a sign-in.
- `src/stores/household-store.ts`: `changePicture` and `removePicture` swap the household in the list. When the signed-in person's avatar changes, the member lists already loaded are corrected too.
- `src/components/user-avatar.tsx` and `household-avatar.tsx`: the picture with its fallback. A person is round and a household is a rounded square, so they are easy to tell apart.
- `src/components/picture-editor.tsx` and `src/hooks/use-picture-actions.ts`: the camera badge, the menu, and the pick, upload and report steps, shared by both screens.
- `src/screens/profile-screen.tsx` and `household-detail-screen.tsx`.

### Manual checks

- Set a picture from the library and from the camera. The badge shows a spinner during the upload, then the picture appears on the profile, in the side menu and in the household's member list without a refresh.
- Replace the picture, then open Cloudinary's media library: the old file under `homehub/users/<your id>` is gone within a few seconds.
- Remove the picture: it asks first, then your initials return everywhere.
- Aeroplane mode while changing: a "cannot reach" message appears and the old picture stays.
- Sign in as a second member: they see your picture in the member list, the chat list and the private-chat picker.
- As an owner or admin, set a household picture: it shows on the household card, the chats list and new invitations. As a member, the hero picture has no camera badge.
- Set a picture on one phone, then reopen the app on another: the side menu updates by itself.
- Web: the file dialog opens, there is no crop step, and a tall photo still comes back as a centred square.
- Tap a picture in the member list, the chat list and a household chat bubble: the viewer opens with the name above a large, sharp picture, and closes on a tap outside, the close button and Android back. Tapping someone's initials does nothing.
- In the chat list, a tap on the picture opens the viewer and a tap anywhere else on the row still opens the chat. During a message selection, tapping a bubble's picture selects the message instead.
- On your profile and, as an owner, on the household hero, the menu offers View picture. As a member, tapping the household hero picture opens the viewer directly.
- Open Message info and tap a reader's picture: the viewer opens above the dialog, and closing it returns to the dialog.

No native rebuild is needed for this: the picker and the image manipulator are already in the development build.

## Native build

`expo-image-picker` and `expo-image-manipulator` add native code, and `app.json` now carries the picker's permission strings. The development build has to be rebuilt once (`npx expo run:android` or `npx expo run:ios`) before the picker works on a device. Expo Go already includes both modules.

## Manual checks

- Task with no photos: the section reads "Photos (0/5)" with the add tile for the creator, assignee, owner and admin, and "No photos yet" for anyone else.
- Take photo asks for camera permission the first time; refusing shows the Settings hint and keeps the screen.
- Choose from library, pick a large photo: the tile shows a spinner, then the thumbnail appears and the count rises. The stored image is at most 1600 pixels a side.
- Airplane mode while adding: a "cannot reach" message appears and nothing is attached.
- After five photos the add tile disappears.
- Tap a thumbnail: the full photo opens with the caption; Close returns to the detail screen.
- Delete inside the viewer needs a second tap; after it the viewer closes, the thumbnail is gone and the snackbar confirms.
- A member who neither recorded nor paid an expense sees its photos but no add tile and no Delete in the viewer.
- Delete a task that has photos, then open Cloudinary's media library: the files are gone within a few seconds.
- Web: Add photo opens the file dialog and the same flow works, with `fetch` reading the chosen file.

## Tests

- Limits, resize rule, and size formatting: `node --experimental-strip-types --test tests/images.test.mjs`
- Types: `npx tsc --noEmit`.
