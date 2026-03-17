export function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

export function decodeJson<TValue>(value: string | null): TValue | null {
  if (value === null) {
    return null;
  }

  return JSON.parse(value) as TValue;
}
