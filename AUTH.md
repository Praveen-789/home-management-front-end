# HomeHub authentication

## Run locally

1. In `D:\HomeHub\backend`, run `npm run dev` (API port 3000).
2. In this project, run `npm start` and open it using Expo Go or an emulator.
3. Keep a physical phone and your computer on the same network.

The app uses the Expo development host address for native API requests. If needed, copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL=http://YOUR-COMPUTER-IP:3000/api`, then restart Expo. Android emulator can use `http://10.0.2.2:3000/api`. Expo tunnels do not tunnel the backend. For a deployed app, configure an HTTPS API URL.

## Read the code in this order

- `src/screens/login-screen.tsx`: `useState` holds form input, errors and loading. The submit handler calls the store's login action.
- `src/screens/register-screen.tsx`: validates input, posts registration, returns to login on success. Passwords are never saved.
- `src/screens/forgot-password-screen.tsx` and `reset-password-screen.tsx`: the two steps of a password reset, described below.
- `src/lib/password-reset.ts`: the email, code and password rules the reset screens apply, mirroring the backend. Pure functions, tested in Node.
- `src/api/client.ts`: backend URL, fetch requests, timeout, bearer header and safe network error messages.
- `src/api/auth.ts`: register and login requests, the error messages they may show, and session validation.
- `src/stores/auth-store.ts`: Zustand shares the user/session, restores it and handles login/logout. Native storage uses Expo SecureStore. Web stays in memory and requires login after reload.
- `src/api/token.ts`: reads JWT expiry. This does not verify signatures; authorization remains the backend's responsibility.
- `src/app/_layout.tsx`: light/dark theme selection (see `THEME.md`), session restoration, token expiry and protected routes.
- `src/components/auth/auth-shell.tsx`: shared safe-area, keyboard-aware layout and styling.
- `src/app/(app)/_layout.tsx`: the signed-in area: a drawer for the side menu around the stack of screens in `(stack)`. The side menu and the household screens are described in `HOUSEHOLDS.md`.

Registration uses `POST /api/auth/register` and then asks the user to log in. Login uses `POST /api/auth/login`. Email is trimmed but not lowercased, matching the backend's current case-sensitive behavior. Passwords must be 8 to 72 characters; the app checks first and the backend enforces it.

## Forgot password

1. "Forgot password?" under the password field opens a screen asking for the email address. Sending it calls `POST /api/auth/forgot-password`, which answers the same way whether or not the address is registered, so the next screen always opens.
2. The reset screen takes the six-digit code from the email plus the new password twice. It calls `POST /api/auth/reset-password`; a wrong, expired or used code shows the backend's "Invalid or expired code". Success returns to login with a confirmation banner.
3. "Resend code" waits out the backend's 60-second cooldown with a countdown, then requests a fresh code; only the newest code works. "I already have a code" on the first screen skips straight to the second for someone who closed the app in between.
4. Codes live for 15 minutes and die after five wrong tries. Existing sessions on other devices are not signed out by a reset.

## Manual checks

- Empty fields, invalid email and mismatched passwords show errors without submitting.
- Successful registration returns to login with a confirmation.
- Duplicate email and incorrect credentials show understandable errors.
- Login opens the household list; back navigation cannot reopen auth screens.
- Native app restart restores an unexpired session; expired/malformed sessions return to login.
- Logout clears the saved native session and returns to login.
- Offline/unreachable API requests show an error; buttons recover after failure.
- Check password visibility, small screens, large text and keyboard scrolling on a device.
- Forgot password with an unregistered email still opens the code screen; a registered one receives the email within a few seconds.
- A wrong code, a short password and mismatched passwords each show an error without leaving the screen; the right code returns to login with the banner and the new password signs in.
- Resend is disabled with a countdown right after a code is sent and works once it reaches zero; the old code then no longer works.

Use `npx tsc --noEmit` for TypeScript checks after Expo has regenerated route types (`npm start`).

Expo web uses localhost:3000 for the API by default. The backend allows web origins http://localhost:8081 and http://localhost:8082. Set backend WEB_ORIGINS to a comma-separated list for other preview/deployed origins.

Token-expiry unit tests: `node --experimental-strip-types --test tests/token.test.mjs` (Node 22+).
Reset rules: `node --experimental-strip-types --test tests/password-reset.test.mjs`.


## Google sign-in (Android development build)

Login and registration now offer Continue with Google. The native account chooser returns an ID token; POST /api/auth/google exchanges it for a HomeHub JWT. Both login methods share session validation and SecureStore persistence. Cancelling makes no backend request. Google tokens and passwords are never persisted.

For an existing password account, sign in normally, open the side menu on Your households and tap Link Google account. Enter the current HomeHub password and select the matching Google account. POST /api/auth/google/link uses the current HomeHub bearer token. Linking preserves data and allows both login methods.

EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID must match the backend GOOGLE_CLIENT_IDS Web OAuth client. It is a public identifier. Register com.praveen_dev.homehub and the installed build signing SHA-1 in an Android OAuth client. Apply the backend add_google_auth migration before testing.

Rebuild after installing the native dependency: run npm run android from this directory. Start Metro with npx expo start --dev-client if needed. Restart Metro after changing .env. Native dependencies are autolinked; the config plugin also preserves setup for future prebuilds. Web/iOS Google buttons are hidden. Password login remains available in older builds.

Manual checks: new Google signup, returning login, cancellation, account switching after logout, offline errors, session restore, and existing-email conflict followed by linking. Verify password registration/login/reset still work. Use a Google Play-enabled Android device/emulator. The backend verifies the token; frontend token decoding is not an authorization check.
