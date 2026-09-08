// Turns any thrown value into text that is safe to show. API and network errors already carry safe messages.
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
