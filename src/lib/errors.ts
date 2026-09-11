// Turns any thrown value into text that is safe to show. API and network errors already carry safe
// messages, and so do the plain objects the Redux task thunks reject with.
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const message = typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined;
  return typeof message === 'string' && message ? message : fallback;
}
