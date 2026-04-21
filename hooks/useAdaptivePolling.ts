"use client";

import { useCallback, useEffect, useRef } from "react";

interface UseAdaptivePollingOptions {
  /** Callback to execute on each poll */
  onPoll: () => void | Promise<void>;
  /** Polling interval when active (ms) */
  activeInterval?: number;
  /** Polling interval when idle (ms) */
  idleInterval?: number;
  /** Time before switching to idle (ms) */
  idleAfter?: number;
  /** Stop polling entirely when true */
  stopped?: boolean;
  /** Whether the component is enabled */
  enabled?: boolean;
}

/**
 * Adaptive polling hook - slows down when idle, stops when transaction is completed.
 */
export function useAdaptivePolling({
  onPoll,
  activeInterval = 4_000,
  idleInterval = 15_000,
  idleAfter = 60_000,
  stopped = false,
  enabled = true,
}: UseAdaptivePollingOptions) {
  const lastActivityRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPollRef = useRef(onPoll);

  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (lastActivityRef.current === 0) {
      lastActivityRef.current = Date.now();
    }

    if (!enabled || stopped) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    function tick() {
      const isIdle = Date.now() - lastActivityRef.current > idleAfter;
      const interval = isIdle ? idleInterval : activeInterval;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        void onPollRef.current();
        // Re-evaluate idle state
        const nowIdle = Date.now() - lastActivityRef.current > idleAfter;
        const nextInterval = nowIdle ? idleInterval : activeInterval;
        if (intervalRef.current && nextInterval !== interval) {
          tick(); // Reschedule with new interval
        }
      }, interval);
    }

    tick();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, stopped, activeInterval, idleInterval, idleAfter]);

  return { recordActivity };
}
