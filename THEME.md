# HomeHub appearance

The app has a light and a dark theme. Users pick "Use device setting", "Light", or "Dark" from the appearance button, which sits in the household list header and at the top of the sign-in and register screens. The choice is saved on the device and restored on launch.

## Read the code in this order

- `src/lib/color-scheme.ts`: the three preferences and the rule that turns a preference plus the device scheme into light or dark.
- `src/constants/app-theme.ts`: both Material 3 palettes for React Native Paper, and the matching React Navigation themes so screen transitions use the same background.
- `src/stores/theme-store.ts`: Zustand store for the preference. Native saves it in the same secure store as the session, so no new native module is needed; web uses localStorage.
- `src/app/_layout.tsx`: reads the preference and the device scheme, picks the theme, and hands it to Paper, the navigator, the status bar and the window background.
- `src/components/theme-menu.tsx`: the picker.

## Rules for screens

Take colours from `useTheme()` in React Native Paper instead of writing hex values. The tokens in use are `background`, `onBackground` for headings, `onSurfaceVariant` for secondary text, `primary` for the brand mark, and `elevation.level1` for cards. Layout values can stay in a `StyleSheet`; colours go in an inline style next to it.

## Manual checks

- Switching to Dark changes every screen at once, including the header, status bar icons, inputs, cards, menus, dialogs and snackbars.
- "Use device setting" follows the phone's dark mode toggle while the app is open.
- The choice survives an app restart on a device, and a page reload on web.
- No white flash appears when navigating between screens in dark mode.
- Text stays readable on every surface in both modes, including disabled buttons and helper text.

## Tests

- `node --experimental-strip-types --test tests/color-scheme.test.mjs`
