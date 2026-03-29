import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntervalTimer, MockTimer } from '../src/timer.js';

describe('IntervalTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() calls fn periodically', () => {
    const timer = new IntervalTimer();
    const fn = vi.fn();
    timer.start(fn, 1000);

    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);

    timer.stop();
  });

  it('stop() halts periodic execution', () => {
    const timer = new IntervalTimer();
    const fn = vi.fn();
    timer.start(fn, 1000);

    vi.advanceTimersByTime(2000);
    timer.stop();
    vi.advanceTimersByTime(3000);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calling start() twice stops the previous timer', () => {
    const timer = new IntervalTimer();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    timer.start(fn1, 1000);
    timer.start(fn2, 1000);

    vi.advanceTimersByTime(1000);
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);

    timer.stop();
  });

  it('calling stop() multiple times does not throw', () => {
    const timer = new IntervalTimer();
    expect(() => {
      timer.stop();
      timer.stop();
    }).not.toThrow();
  });

  describe('input validation', () => {
    it('throws on ms < 10', () => {
      const timer = new IntervalTimer();
      expect(() => timer.start(vi.fn(), 0)).toThrow('>= 10');
      expect(() => timer.start(vi.fn(), 5)).toThrow('>= 10');
      expect(() => timer.start(vi.fn(), -1)).toThrow('>= 10');
    });

    it('throws on NaN', () => {
      const timer = new IntervalTimer();
      expect(() => timer.start(vi.fn(), NaN)).toThrow('>= 10');
    });

    it('throws on Infinity', () => {
      const timer = new IntervalTimer();
      expect(() => timer.start(vi.fn(), Infinity)).toThrow('>= 10');
      expect(() => timer.start(vi.fn(), -Infinity)).toThrow('>= 10');
    });

    it('accepts ms = 10', () => {
      const timer = new IntervalTimer();
      expect(() => timer.start(vi.fn(), 10)).not.toThrow();
      timer.stop();
    });
  });
});

describe('MockTimer', () => {
  it('tick() calls fn', () => {
    const timer = new MockTimer();
    const fn = vi.fn();
    timer.start(fn, 1000);

    timer.tick();
    expect(fn).toHaveBeenCalledTimes(1);

    timer.tick();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('tick() after stop() is a no-op', () => {
    const timer = new MockTimer();
    const fn = vi.fn();
    timer.start(fn, 1000);
    timer.stop();

    timer.tick();
    expect(fn).not.toHaveBeenCalled();
  });

  it('tick() before start() is a no-op', () => {
    const timer = new MockTimer();
    expect(() => timer.tick()).not.toThrow();
  });
});
