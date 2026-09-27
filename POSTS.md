# HomeHub posts

Each household has a shared feed: any member can post text, up to five photos, or both, and everyone at home can like it and comment on it. Data comes from the backend's post endpoints, documented in `D:\HomeHub\backend\API.md` under **Posts**.

Posts arrived together with the app's navigation change: the side menu (drawer) is gone, and a bottom tab bar with five tabs — Home, Posts, Chats, Alerts, Profile — sits on every top-level screen. The menu's account items (appearance, link Google, sign out) moved to the Profile tab.

## Flow

1. The Posts tab shows one household's feed, newest first, with the same household chips as Chats. The household screen also has a Posts card that opens the tab with that household selected.
2. Scrolling to the end loads the next page of 20. Pull to refresh reloads the first page. Paging uses the backend's cursor, so posts written while you scroll never repeat or vanish mid-list.
3. "New post" opens the compose screen: text, photos from the camera or library, or both. Photos upload to Cloudinary when the post is shared, using tickets from the posts upload endpoint.
4. Tapping a post opens it with its comments, oldest first, and a box to add one. Comments are plain text, flat, and cannot be edited.
5. The heart likes and unlikes; one like per person; the counts come back from the backend with each change. Likes notify nobody.
6. Delete appears on a post for its author and for owners and admins, and the same rule covers comments. Deleting a post removes its photos, likes and comments for everyone.
7. A new post notifies the other members; a comment notifies the post's author. Tapping either notification opens the post.
8. Posts cannot be edited in this version.

## Navigation

- `src/components/bottom-tab-bar.tsx`: the five tabs. It highlights the tab owning the current path, shows the unread badge on Alerts, and uses `router.navigate` so tapping a tab returns to the copy already in the stack.
- `src/components/app-shell.tsx`: top-level screens pass `tabs`, deeper screens `back`. The screens are still one stack, so Android's back button walks back through tabs the way it walked the old menu.
- `src/app/(app)/_layout.tsx`: the drawer wrapper is gone; the layout now only mounts the chat socket and the badge sync.

## Read the code in this order

- `src/lib/post-permissions.ts`: the backend's limits and the author/owner/admin delete rule, so the UI hides what the API would refuse. The backend still decides.
- `src/lib/post-helpers.ts`: the cache rules the store uses. Feed pages join on the cursor, a deleted post takes its comments with it, and comment counts follow writes. Pure functions that return new objects, tested in Node.
- `src/api/posts.ts`: typed requests and response validation for the post endpoints, and the post-photo upload built on `src/api/images.ts`.
- `src/stores/post-store.ts`: Zustand store holding one feed per household and one comment list per post. The first page replaces, cursor pages continue, and a late first page for a household is dropped. A 401 signs the user out. The store resets when the signed-in user changes.
- `src/app/(app)/(stack)/posts/` and `src/app/(app)/(stack)/households/[householdId]/posts/[postId].tsx`: the routes; each re-exports a screen.
- `src/screens/posts-screen.tsx`: chips, feed, like, delete, load more, and the New post button.
- `src/screens/post-compose-screen.tsx`: text, the photo tiles, and sharing.
- `src/screens/post-detail-screen.tsx`: the post, its comments with paging, the comment box, and both delete confirmations.
- `src/components/post-card.tsx`: one post as the feed and the detail screen show it.

Posts use Zustand like households and expenses, not Redux like tasks.

## Manual checks

- Tab bar: each tab opens its screen, the current tab stays highlighted on it, and Android back returns to Home. Alerts shows the unread badge.
- Profile tab: theme buttons switch the look, sign out asks first, and Link Google appears on Android only.
- Household with no posts: the feed shows the invitation to post; sharing one returns to the feed with it on top.
- Compose: the share button stays off until there is text or a photo; five photos hide the add tile; removing a picked photo brings it back.
- Two members: a post by one shows a `POST_CREATED` notification for the other, and tapping it opens the post. A comment notifies only the author, as `POST_COMMENTED`.
- Likes: like on the feed, open the post — the heart is filled there too; unlike on the detail and return — the feed count dropped. No notification either way.
- Deletes: a member sees delete only on their own posts and comments; an owner or admin on all. Deleting asks first, and a deleted post's notification no longer opens it (the screen reports it is gone).
- More than 20 posts: scrolling loads the next page; writing a post while scrolled keeps the list free of repeats.

## Tests

`node --experimental-strip-types --test tests/post-helpers.test.mjs tests/post-permissions.test.mjs` covers the cache rules (page joins, duplicate drops, count moves, immutability) and the permission and limit rules. The backend's behavior is tested in its own repo against real PostgreSQL, via `npm run test:posts:integration` there.
