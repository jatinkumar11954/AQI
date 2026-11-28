import { useEffect, useState } from 'react';
import type { ZodType } from 'zod';

/** Persists a Zod-validated JSON value in `localStorage`, falling back safely when storage is unavailable or invalid. */
export function useStored<T>(key: string, initial: T, schema: ZodType<T>) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : schema.parse(JSON.parse(raw));
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Storage can be disabled in private browsing contexts. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
