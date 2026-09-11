# HomeHub photos

Tasks and expenses can each carry up to five photos: a picture of the finished chore, a receipt for the bill. Files live in Cloudinary. The backend's part is documented under "Images" in `D:\HomeHub\backend\API.md`.

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
- `src/components/image-grid.tsx` and `image-viewer.tsx`: the thumbnails with the add tile, and the full-screen viewer.
- `src/screens/task-detail-screen.tsx` and `expense-detail-screen.tsx`: the Photos section and the add and remove handlers.

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
