import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Job } from '../src/job.js';
import type { JobConfig } from '../src/types.js';

function createJobConfig(overrides: Partial<JobConfig> = {}): JobConfig {
  return {
    fn: vi.fn(),
    interval: 10,
    intervalMax: null,
    unit: 'minutes',
    atTime: null,
    weekday: null,
    tags: [],
    maxTimes: null,
    until: null,
    skipIfRunning: false,
    ...overrides,
  };
}

describe('Job', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calcNextRun', () => {
    it('seconds: returns n seconds later', () => {
      const job = new Job(createJobConfig({ interval: 30, unit: 'seconds' }));
      const now = new Date('2026-03-20T10:00:00');
      const next = job.calcNextRun(now);
      expect(next.getTime() - now.getTime()).toBe(30 * 1000);
    });

    it('minutes: returns n minutes later', () => {
      const job = new Job(createJobConfig({ interval: 10, unit: 'minutes' }));
      const now = new Date('2026-03-20T10:00:00');
      const next = job.calcNextRun(now);
      expect(next.getTime() - now.getTime()).toBe(10 * 60 * 1000);
    });

    it('hours: returns n hours later', () => {
      const job = new Job(createJobConfig({ interval: 2, unit: 'hours' }));
      const now = new Date('2026-03-20T10:00:00');
      const next = job.calcNextRun(now);
      expect(next.getTime() - now.getTime()).toBe(2 * 60 * 60 * 1000);
    });

    it('days + at: sets the specified time', () => {
      const job = new Job(createJobConfig({ interval: 1, unit: 'days', atTime: '14:30' }));
      const now = new Date('2026-03-20T10:00:00');
      const next = job.calcNextRun(now);
      expect(next.getHours()).toBe(14);
      expect(next.getMinutes()).toBe(30);
    });

    it('weeks + weekday: returns the next specified weekday', () => {
      const job = new Job(createJobConfig({ interval: 1, unit: 'weeks', weekday: 'friday' }));
      const now = new Date('2026-03-20T10:00:00'); // Friday
      const next = job.calcNextRun(now);
      expect(next.getDay()).toBe(5); // Friday
      expect(next.getDate()).toBe(27); // next Friday
    });

    it('weeks + weekday + at: returns the next specified weekday at the specified time', () => {
      const job = new Job(createJobConfig({
        interval: 1,
        unit: 'weeks',
        weekday: 'monday',
        atTime: '09:00',
      }));
      const now = new Date('2026-03-20T10:00:00'); // Friday
      const next = job.calcNextRun(now);
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it('weeks + weekday + interval: returns biweekly weekday', () => {
      const job = new Job(createJobConfig({
        interval: 2,
        unit: 'weeks',
        weekday: 'monday',
      }));
      // 2026-03-20 is Friday
      const now = new Date('2026-03-20T10:00:00');
      const next = job.calcNextRun(now);
      // next Monday is 3/23, but interval=2 so +7 days -> 3/30
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getDate()).toBe(30);
    });

    it('random interval: calculates within interval–intervalMax range', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const job = new Job(createJobConfig({
        interval: 5,
        intervalMax: 10,
        unit: 'minutes',
      }));
      const now = new Date('2026-03-20T10:00:00');
      const next = job.calcNextRun(now);
      // random=0.5 -> floor(0.5 * 6) + 5 = 8 minutes
      expect(next.getTime() - now.getTime()).toBe(8 * 60 * 1000);
      vi.spyOn(Math, 'random').mockRestore();
    });
  });

  describe('run', () => {
    it('executes the function', async () => {
      const fn = vi.fn();
      const job = new Job(createJobConfig({ fn }));
      await job.run();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes an AbortSignal', async () => {
      let receivedSignal: AbortSignal | undefined;
      const fn = vi.fn((signal: AbortSignal) => {
        receivedSignal = signal;
      });
      const job = new Job(createJobConfig({ fn }));
      await job.run();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it('increments runCount', async () => {
      const job = new Job(createJobConfig({ fn: vi.fn() }));
      expect(job.runCount).toBe(0);
      await job.run();
      expect(job.runCount).toBe(1);
      await job.run();
      expect(job.runCount).toBe(2);
    });

    it('updates lastRun', async () => {
      const job = new Job(createJobConfig({ fn: vi.fn() }));
      expect(job.lastRun).toBeNull();
      await job.run();
      expect(job.lastRun).toBeInstanceOf(Date);
    });

    it('returns true on success', async () => {
      const job = new Job(createJobConfig({ fn: vi.fn() }));
      const result = await job.run();
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      const fn = vi.fn(() => {
        throw new Error('test error');
      });
      const job = new Job(createJobConfig({ fn }));
      job.onError = vi.fn();
      const result = await job.run();
      expect(result).toBe(false);
    });

    it('returns false when cancelled', async () => {
      const job = new Job(createJobConfig({ fn: vi.fn() }));
      job.cancel();
      const result = await job.run();
      expect(result).toBe(false);
    });
  });

  describe('maxTimes', () => {
    it('auto-cancels after the specified number of executions', async () => {
      const fn = vi.fn();
      const job = new Job(createJobConfig({ fn, maxTimes: 2 }));
      await job.run();
      await job.run();
      await job.run(); // 3rd call should not execute
      expect(fn).toHaveBeenCalledTimes(2);
      expect(job.cancelled).toBe(true);
    });
  });

  describe('until', () => {
    it('auto-cancels after the deadline passes', async () => {
      const fn = vi.fn();
      const pastDate = new Date('2026-03-19T00:00:00'); // yesterday
      const job = new Job(createJobConfig({ fn, until: pastDate }));
      await job.run();
      expect(fn).not.toHaveBeenCalled();
      expect(job.cancelled).toBe(true);
    });
  });

  describe('skipIfRunning', () => {
    it('skips execution when a previous run is still in progress', async () => {
      let resolve: () => void;
      const longRunning = new Promise<void>((r) => {
        resolve = r;
      });
      const fn = vi.fn(() => longRunning);
      const job = new Job(createJobConfig({ fn, skipIfRunning: true }));

      const firstRun = job.run();
      await job.run(); // should be skipped
      expect(fn).toHaveBeenCalledTimes(1);

      resolve!();
      await firstRun;
    });
  });

  describe('cancel', () => {
    it('prevents execution after cancellation', async () => {
      const fn = vi.fn();
      const job = new Job(createJobConfig({ fn }));
      job.cancel();
      await job.run();
      expect(fn).not.toHaveBeenCalled();
    });

    it('sends AbortSignal when cancelled during execution', async () => {
      let signal: AbortSignal | undefined;
      const fn = vi.fn(async (s: AbortSignal) => {
        signal = s;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });
      const job = new Job(createJobConfig({ fn }));

      const runPromise = job.run();
      job.cancel();
      expect(signal?.aborted).toBe(true);

      vi.advanceTimersByTime(1000);
      await runPromise;
    });
  });

  describe('error handling', () => {
    it('notifies onError callback on job error', async () => {
      const error = new Error('test error');
      const fn = vi.fn(() => {
        throw error;
      });
      const onError = vi.fn();
      const job = new Job(createJobConfig({ fn }));
      job.onError = onError;

      await job.run();

      expect(onError).toHaveBeenCalledWith(job, error);
      expect(job.cancelled).toBe(false); // errors do not cancel the job
    });

    it('does not notify onError for AbortError', async () => {
      const fn = vi.fn(() => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      });
      const onError = vi.fn();
      const job = new Job(createJobConfig({ fn }));
      job.onError = onError;

      await job.run();

      expect(onError).not.toHaveBeenCalled();
    });
  });
});
