// Enable explicitly for a profiling session in both development and release builds.
// Labels contain route templates or HTTP methods, never params, tokens or bodies.
const enabled = process.env.EXPO_PUBLIC_PROFILE_NAVIGATION === '1';
export function startTiming(label: string) {
  const started = enabled ? performance.now() : 0;
  return () => {
    if (enabled) console.info(`[HomeHub timing] ${label}: ${Math.round(performance.now() - started)} ms`);
  };
}
let finishNavigation: (() => void) | undefined;
export function beginNavigationTiming(route: string) {
  if (enabled) finishNavigation = startTiming(`tap to transition end ${route}`);
}
export function endNavigationTiming() {
  finishNavigation?.();
  finishNavigation = undefined;
}
export function cancelNavigationTiming() { finishNavigation = undefined; }
