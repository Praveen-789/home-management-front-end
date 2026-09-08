# HomeHub authentication

## Run locally

1. In `D:\HomeHub\backend`, run `npm run dev` (API port 3000).
2. In this project, run `npm start` and open it using Expo Go or an emulator.
3. Keep a physical phone and your computer on the same network.

The app uses the Expo development host address for native API requests. If needed, copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL=http://YOUR-COMPUTER-IP:3000/api`, then restart Expo. Android emulator can use `http://10.0.2.2:3000/api`. Expo tunnels do not tunnel the backend. For a deployed app, configure an HTTPS API URL.

## Read the code in this order

- `src/screens/login-screen.tsx`: `useState` holds form input, errors and loading. The submit handler calls the store's login action.
- `src/screens/register-screen.tsx`: validates input, posts registration, returns to login on success. Passwords are never saved.
- `src/api/client.ts`: backend URL, fetch requests, timeout, bearer header and safe network error messages.
- `src/api/auth.ts`: register and login requests, the error messages they may show, and session validation.
- `src/stores/auth-store.ts`: Zustand shares the user/session, restores it and handles login/logout. Native storage uses Expo SecureStore. Web stays in memory and requires login after reload.
- `src/api/token.ts`: reads JWT expiry. This does not verify signatures; authorization remains the backend's responsibility.
- `src/app/_layout.tsx`: light/dark theme selection (see `THEME.md`), session restoration, token expiry and protected routes.
- `src/components/auth/auth-shell.tsx`: shared safe-area, keyboard-aware layout and styling.
- `src/app/(app)/_layout.tsx`: stack for signed-in screens. The household screens are described in `HOUSEHOLDS.md`.

Registration uses `POST /api/auth/register` and then asks the user to log in. Login uses `POST /api/auth/login`. No password-reset endpoint exists yet. Email is trimmed but not lowercased, matching the backend's current case-sensitive behavior.

## Manual checks

- Empty fields, invalid email and mismatched passwords show errors without submitting.
- Successful registration returns to login with a confirmation.
- Duplicate email and incorrect credentials show understandable errors.
- Login opens the household list; back navigation cannot reopen auth screens.
- Native app restart restores an unexpired session; expired/malformed sessions return to login.
- Logout clears the saved native session and returns to login.
- Offline/unreachable API requests show an error; buttons recover after failure.
- Check password visibility, small screens, large text and keyboard scrolling on a device.

Use `npx tsc --noEmit` for TypeScript checks after Expo has regenerated route types (`npm start`).

Expo web uses localhost:3000 for the API by default. The backend allows web origins http://localhost:8081 and http://localhost:8082. Set backend WEB_ORIGINS to a comma-separated list for other preview/deployed origins.

Token-expiry unit tests: `node --experimental-strip-types --test tests/token.test.mjs` (Node 22+).
