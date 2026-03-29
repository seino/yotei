/**
 * Timer interface
 *
 * Used by `Scheduler` to periodically call `runPending()`.
 * Swap in `MockTimer` during tests for time-independent testing.
 */
export interface ITimer {
  /**
   * Start periodic execution
   * @param fn - Function to call periodically
   * @param ms - Interval in milliseconds
   */
  start(fn: () => void, ms: number): void;

  /** Stop periodic execution */
  stop(): void;
}

/**
 * Production timer based on `setInterval`
 *
 * Calling `start()` multiple times automatically stops the previous timer.
 * Uses `unref()` to prevent the timer from keeping the process alive.
 */
export class IntervalTimer implements ITimer {
  private handle: ReturnType<typeof setInterval> | null = null;

  /**
   * Start periodic execution
   *
   * If a timer is already running, it is stopped before starting the new one.
   *
   * @param fn - Function to call periodically
   * @param ms - Interval in milliseconds
   */
  start(fn: () => void, ms: number): void {
    if (!Number.isFinite(ms) || ms < 10) {
      throw new Error('yotei: timer interval must be a finite number >= 10 (ms).');
    }
    this.stop();
    this.handle = setInterval(fn, ms);
    // Prevent the timer alone from keeping the Node.js process alive
    if (this.handle.unref) this.handle.unref();
  }

  /** Stop periodic execution. No-op if already stopped. */
  stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }
}

/**
 * Mock timer for testing
 *
 * Call `tick()` manually to simulate time progression.
 *
 * @example
 * ```ts
 * const timer = new MockTimer();
 * const scheduler = new Scheduler({ timer });
 * scheduler.every(10).minutes.do(myJob);
 *
 * vi.setSystemTime(new Date('2026-03-20T10:10:00'));
 * timer.tick(); // triggers runPending()
 * ```
 */
export class MockTimer implements ITimer {
  private fn: (() => void) | null = null;

  /** @param fn - Function to call on each tick */
  start(fn: () => void, _ms: number): void {
    this.fn = fn;
  }

  /** Stop the timer. Subsequent `tick()` calls are no-ops. */
  stop(): void {
    this.fn = null;
  }

  /** Manually trigger a tick, calling the registered function */
  tick(): void {
    this.fn?.();
  }
}
