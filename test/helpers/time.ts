export async function withFakeNow<TValue>(
  now: number,
  run: () => Promise<TValue> | TValue,
): Promise<TValue> {
  const original = Date.now;
  Date.now = () => now;
  try {
    return await run();
  } finally {
    Date.now = original;
  }
}
