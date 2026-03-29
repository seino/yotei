import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestScheduler } from './fixtures/mock-timer.js';

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runPending', () => {
    it('only runs jobs that are due', async () => {
      const { scheduler } = createTestScheduler();
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      scheduler.every(5).minutes.do(fn1);
      scheduler.every(30).minutes.do(fn2);

      // Advance 5 minutes -> only fn1 should run
      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      await scheduler.runPending();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).not.toHaveBeenCalled();
    });

    it('runs multiple jobs at the same time', async () => {
      const { scheduler } = createTestScheduler();
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      scheduler.every(10).minutes.do(fn1);
      scheduler.every(10).minutes.do(fn2);

      vi.setSystemTime(new Date('2026-03-20T10:10:00'));
      await scheduler.runPending();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelTag', () => {
    it('cancels jobs by tag', async () => {
      const { scheduler } = createTestScheduler();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();

      scheduler.every(10).minutes.tag('api').do(fn1);
      scheduler.every(10).minutes.tag('api').do(fn2);
      scheduler.every(10).minutes.tag('db').do(fn3);

      scheduler.cancelTag('api');

      expect(scheduler.jobs()).toHaveLength(1);
      expect(scheduler.jobs()[0].tags).toEqual(['db']);
    });
  });

  describe('cancelAll', () => {
    it('cancels all jobs', () => {
      const { scheduler } = createTestScheduler();
      scheduler.every(10).minutes.do(vi.fn());
      scheduler.every(20).minutes.do(vi.fn());

      scheduler.cancelAll();
      expect(scheduler.jobs()).toHaveLength(0);
    });
  });

  describe('nextRun', () => {
    it('returns the nearest next execution time', () => {
      const { scheduler } = createTestScheduler();
      scheduler.every(5).minutes.do(vi.fn());
      scheduler.every(30).minutes.do(vi.fn());

      const next = scheduler.nextRun();
      expect(next).not.toBeNull();
      // 5 minutes is the nearest
      expect(next!.getTime()).toBe(new Date('2026-03-20T10:05:00').getTime());
    });

    it('returns null when no jobs are registered', () => {
      const { scheduler } = createTestScheduler();
      expect(scheduler.nextRun()).toBeNull();
    });
  });

  describe('events', () => {
    it('emits job:start and job:end', async () => {
      const { scheduler } = createTestScheduler();
      const startHandler = vi.fn();
      const endHandler = vi.fn();

      scheduler.on('job:start', startHandler);
      scheduler.on('job:end', endHandler);

      scheduler.every(5).minutes.do(vi.fn());
      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      await scheduler.runPending();

      expect(startHandler).toHaveBeenCalledTimes(1);
      expect(endHandler).toHaveBeenCalledTimes(1);
    });

    it('emits job:error', async () => {
      const { scheduler } = createTestScheduler();
      const errorHandler = vi.fn();
      const error = new Error('test error');

      scheduler.on('job:error', errorHandler);

      scheduler.every(5).minutes.do(() => {
        throw error;
      });

      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      await scheduler.runPending();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(expect.anything(), error);
    });

    it('does not emit job:start for skipped runs (skipIfRunning)', async () => {
      const { scheduler } = createTestScheduler();
      const startHandler = vi.fn();
      let resolveRun: (() => void) | null = null;

      scheduler.on('job:start', startHandler);

      scheduler.every(5).minutes.skipIfRunning().do(
        () =>
          new Promise<void>((resolve) => {
            resolveRun = resolve;
          }),
      );

      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      const firstPending = scheduler.runPending();
      await vi.advanceTimersByTimeAsync(0);
      expect(startHandler).toHaveBeenCalledTimes(1);

      // Still running from previous call, runPending again at same time
      await scheduler.runPending();
      expect(startHandler).toHaveBeenCalledTimes(1);

      resolveRun!();
      await firstPending;
    });

    it('does not emit job:end on error', async () => {
      const { scheduler } = createTestScheduler();
      const endHandler = vi.fn();
      const errorHandler = vi.fn();

      scheduler.on('job:end', endHandler);
      scheduler.on('job:error', errorHandler);

      scheduler.every(5).minutes.do(() => {
        throw new Error('test error');
      });

      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      await scheduler.runPending();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(endHandler).not.toHaveBeenCalled();
    });

    it('does not cancel next run after error', async () => {
      const { scheduler } = createTestScheduler();
      const fn = vi.fn(() => {
        throw new Error('error');
      });

      // Register error handler to suppress console.error
      scheduler.on('job:error', () => {});

      const job = scheduler.every(5).minutes.do(fn);

      // First run
      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      await scheduler.runPending();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(job.cancelled).toBe(false);

      // Second run
      vi.setSystemTime(new Date('2026-03-20T10:10:00'));
      await scheduler.runPending();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('runAll', () => {
    it('runs all jobs immediately', async () => {
      const { scheduler } = createTestScheduler();
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      scheduler.every(30).minutes.do(fn1);
      scheduler.every(60).minutes.do(fn2);

      // Run all without advancing time
      await scheduler.runAll();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('skips cancelled jobs', async () => {
      const { scheduler } = createTestScheduler();
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      const job1 = scheduler.every(10).minutes.do(fn1);
      scheduler.every(10).minutes.do(fn2);

      job1.cancel();
      await scheduler.runAll();

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('emits job:start and job:end events', async () => {
      const { scheduler } = createTestScheduler();
      const startHandler = vi.fn();
      const endHandler = vi.fn();

      scheduler.on('job:start', startHandler);
      scheduler.on('job:end', endHandler);

      scheduler.every(10).minutes.do(vi.fn());
      await scheduler.runAll();

      expect(startHandler).toHaveBeenCalledTimes(1);
      expect(endHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('removes all jobs', () => {
      const { scheduler } = createTestScheduler();
      scheduler.every(10).minutes.do(vi.fn());
      scheduler.every(20).minutes.do(vi.fn());

      scheduler.clear();
      expect(scheduler.jobs()).toHaveLength(0);
    });
  });

  describe('runPending re-entrancy guard', () => {
    it('second runPending() returns immediately while first is still running', async () => {
      const { scheduler } = createTestScheduler();
      let resolveJob: (() => void) | null = null;
      const fn = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveJob = resolve;
          }),
      );

      scheduler.every(5).minutes.do(fn);

      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      const first = scheduler.runPending();
      await vi.advanceTimersByTimeAsync(0);

      // First runPending is still awaiting the job
      expect(fn).toHaveBeenCalledTimes(1);

      // Second runPending should return immediately (re-entrancy guard)
      await scheduler.runPending();
      expect(fn).toHaveBeenCalledTimes(1);

      resolveJob!();
      await first;
    });
  });

  describe('start / stop', () => {
    it('start() + tick() triggers runPending', async () => {
      const { scheduler, tick } = createTestScheduler();
      const fn = vi.fn();

      scheduler.every(5).minutes.do(fn);
      scheduler.start();

      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      tick();
      // runPending is async, wait for it
      await vi.advanceTimersByTimeAsync(0);

      expect(fn).toHaveBeenCalledTimes(1);
      scheduler.stop();
    });

    it('tick() after stop() does not run jobs', async () => {
      const { scheduler, tick } = createTestScheduler();
      const fn = vi.fn();

      scheduler.every(5).minutes.do(fn);
      scheduler.start();
      scheduler.stop();

      vi.setSystemTime(new Date('2026-03-20T10:05:00'));
      tick();
      await vi.advanceTimersByTimeAsync(0);

      expect(fn).not.toHaveBeenCalled();
    });

    it('throws on resolution < 10', () => {
      const { scheduler } = createTestScheduler();
      expect(() => scheduler.start(0)).toThrow('>= 10');
      expect(() => scheduler.start(5)).toThrow('>= 10');
      expect(() => scheduler.start(-1)).toThrow('>= 10');
    });

    it('throws on NaN / Infinity resolution', () => {
      const { scheduler } = createTestScheduler();
      expect(() => scheduler.start(NaN)).toThrow('>= 10');
      expect(() => scheduler.start(Infinity)).toThrow('>= 10');
    });
  });
});
