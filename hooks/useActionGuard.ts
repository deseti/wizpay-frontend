"use client";

import { useCallback, useRef, useState } from "react";

interface UseActionGuardOptions {
  /** Timeout in ms to re-enable the action (fallback) */
  timeout?: number;
}

/**
 * Prevents duplicate submissions (double-click protection).
 * Returns isProcessing state + a guard wrapper for async actions.
 */
export function useActionGuard(options: UseActionGuardOptions = {}) {
  const { timeout = 30_000 } = options;
  const [isProcessing, setIsProcessing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guard = useCallback(
    async <T>(action: () => Promise<T>): Promise<T | null> => {
      if (isProcessing) return null;

      setIsProcessing(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsProcessing(false), timeout);

      try {
        const result = await action();
        return result;
      } finally {
        setIsProcessing(false);
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    },
    [isProcessing, timeout]
  );

  const reset = useCallback(() => {
    setIsProcessing(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { isProcessing, guard, reset };
}
