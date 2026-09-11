# Navigation performance check

Repeated navigation taps are guarded by `src/hooks/use-push-once.ts`. Every screen shares one lock across its navigation controls. The lock is set synchronously, stays held while leaving, and resets when that screen receives focus again. API loading is independent of this lock.

## Opt-in timing

Set `EXPO_PUBLIC_PROFILE_NAVIGATION=1` in the terminal before starting Metro (restart it if already running) or creating a release build. Remove this setting after profiling. No timing logs are emitted by default.

```powershell
$env:EXPO_PUBLIC_PROFILE_NAVIGATION = '1'
npx expo start --dev-client --clear
```

The `[HomeHub timing]` messages record:

- `tap to transition end`: accepted navigation handler to the signed-in native stack's opening transition end. It is not a measurement of all content/images becoming ready, nor of touch delivery before the handler runs.
- `API GET/POST/...`: fetch plus JSON parsing, including failed requests. HTTP labels omit URLs, tokens and payloads. Concurrent requests have separate elapsed durations but are not assigned to a particular navigation.

For Android release comparison, use the same device, account, network and reachable API endpoint. A release build does not have Metro's host URI for API-host discovery, so ensure `EXPO_PUBLIC_API_URL` is explicitly configured for the device.

```powershell
$env:EXPO_PUBLIC_PROFILE_NAVIGATION = '1'
npx expo run:android --variant release
adb logcat -s ReactNativeJS
```

Compare several runs of the same route, separately for the first opening and cached openings. Note whether the delay is before the transition starts or after arriving with a spinner. Double-tap an item rapidly, then verify a single Back returns to the list. Open a different item after returning to verify that the lock reset.

The implementation's automated regression checks run with:

```powershell
node --test tests/navigation-guard.test.mjs
```
