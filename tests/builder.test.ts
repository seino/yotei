import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestScheduler } from './fixtures/mock-timer.js';

describe('ScheduleBuilder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T10:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when do() is called without a time unit', () => {
    const { scheduler } = createTestScheduler();
    expect(() => {
      scheduler.every(10).do(vi.fn());
    }).toThrow('time unit not specified');
  });

  it('throws on every(0)', () => {
    const { scheduler } = createTestScheduler();
    expect(() => {
      scheduler.every(0).minutes.do(vi.fn());
    }).toThrow('>= 1');
  });

  it('throws on every(NaN / Infinity / non-integer)', () => {
    const { scheduler } = createTestScheduler();
    expect(() => scheduler.every(NaN).minutes.do(vi.fn())).toThrow('finite integer');
    expect(() => scheduler.every(Infinity).minutes.do(vi.fn())).toThrow('finite integer');
    expect(() => scheduler.every(1.5).minutes.do(vi.fn())).toThrow('finite integer');
  });

  it('throws when to() value is <= every() value', () => {
    const { scheduler } = createTestScheduler();
    expect(() => {
      scheduler.every(10).to(10).minutes.do(vi.fn());
    }).toThrow('greater than every()');
    expect(() => {
      scheduler.every(10).to(5).minutes.do(vi.fn());
    }).toThrow('greater than every()');
  });

  it('throws on to(NaN / Infinity / non-integer)', () => {
    const { scheduler } = createTestScheduler();
    expect(() => scheduler.every(1).to(NaN).minutes.do(vi.fn())).toThrow('finite integer');
    expect(() => scheduler.every(1).to(Infinity).minutes.do(vi.fn())).toThrow('finite integer');
    expect(() => scheduler.every(1).to(2.5).minutes.do(vi.fn())).toThrow('finite integer');
  });

  it('throws on times(0)', () => {
    const { scheduler } = createTestScheduler();
    expect(() => {
      scheduler.every(10).minutes.times(0).do(vi.fn());
    }).toThrow('>= 1');
  });

  it('throws on times(NaN / Infinity / non-integer)', () => {
    const { scheduler } = createTestScheduler();
    expect(() => scheduler.every(10).minutes.times(NaN).do(vi.fn())).toThrow('finite integer');
    expect(() => scheduler.every(10).minutes.times(Infinity).do(vi.fn())).toThrow('finite integer');
    expect(() => scheduler.every(10).minutes.times(1.5).do(vi.fn())).toThrow('finite integer');
  });

  it('throws when at() is used with minutes', () => {
    const { scheduler } = createTestScheduler();
    expect(() => {
      scheduler.every(10).minutes.at('10:30').do(vi.fn());
    }).toThrow('at() can only be used with days or weeks');
  });

  it('throws on invalid at() time format', () => {
    const { scheduler } = createTestScheduler();
    expect(() => {
      scheduler.every().day.at('invalid').do(vi.fn());
    }).toThrow('invalid time format');
  });

  it('registers a Job with a valid chain', () => {
    const { scheduler } = createTestScheduler();
    const fn = vi.fn();
    const job = scheduler.every(10).minutes.do(fn);

    expect(job).toBeDefined();
    expect(scheduler.jobs()).toHaveLength(1);
    expect(scheduler.jobs()[0]).toBe(job);
  });

  it('supports singular aliases', () => {
    const { scheduler } = createTestScheduler();
    const job = scheduler.every().minute.do(vi.fn());
    expect(job).toBeDefined();
  });

  it('supports weekday specifiers', () => {
    const { scheduler } = createTestScheduler();
    const job = scheduler.every().monday.at('09:00').do(vi.fn());
    expect(job).toBeDefined();
    expect(job.nextRun.getDay()).toBe(1); // Monday
  });

  it('attaches tags via tag()', () => {
    const { scheduler } = createTestScheduler();
    const job = scheduler.every(10).minutes.tag('api', 'sync').do(vi.fn());
    expect(job.tags).toEqual(['api', 'sync']);
  });

  it('doImmediately() runs the job right away', async () => {
    const { scheduler } = createTestScheduler();
    const fn = vi.fn();
    scheduler.every(10).minutes.doImmediately(fn);

    // doImmediately runs asynchronously, wait for it
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  describe('at() validation', () => {
    it('throws on seconds + at()', () => {
      const { scheduler } = createTestScheduler();
      expect(() => {
        scheduler.every(30).seconds.at('10:00').do(vi.fn());
      }).toThrow('at() can only be used with days or weeks');
    });

    it('throws on minutes + at()', () => {
      const { scheduler } = createTestScheduler();
      expect(() => {
        scheduler.every(10).minutes.at('10:00').do(vi.fn());
      }).toThrow('at() can only be used with days or weeks');
    });

    it('throws on hours + at()', () => {
      const { scheduler } = createTestScheduler();
      expect(() => {
        scheduler.every(2).hours.at('10:00').do(vi.fn());
      }).toThrow('at() can only be used with days or weeks');
    });

    it('allows days + at()', () => {
      const { scheduler } = createTestScheduler();
      expect(() => {
        scheduler.every().day.at('10:00').do(vi.fn());
      }).not.toThrow();
    });

    it('allows weeks + at()', () => {
      const { scheduler } = createTestScheduler();
      expect(() => {
        scheduler.every().week.at('10:00').do(vi.fn());
      }).not.toThrow();
    });

    it('allows weekday + at()', () => {
      const { scheduler } = createTestScheduler();
      expect(() => {
        scheduler.every().monday.at('09:00').do(vi.fn());
      }).not.toThrow();
    });
  });

  describe('doImmediately() error handling', () => {
    it('does not cause Unhandled rejection on error', async () => {
      const { scheduler } = createTestScheduler();
      const errorHandler = vi.fn();
      scheduler.on('job:error', errorHandler);

      scheduler.every(10).minutes.doImmediately(() => {
        throw new Error('immediate execution error');
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });

    it('increments runCount on doImmediately()', async () => {
      const { scheduler } = createTestScheduler();
      const fn = vi.fn();
      const job = scheduler.every(10).minutes.doImmediately(fn);

      await vi.advanceTimersByTimeAsync(0);
      expect(job.runCount).toBe(1);
      expect(job.lastRun).toBeInstanceOf(Date);
    });
  });
});
