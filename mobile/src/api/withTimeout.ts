/** Bound a request so a stalled connection can never wedge a caller that serialises work. */
export async function withTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  ms = 15_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
