import { describe, it, expect } from 'vitest';
import { parseAtTime, setTime, parseDeadline, nextWeekday } from '../src/parser.js';

describe('parseAtTime', () => {
  it('parses HH:MM format', () => {
    expect(parseAtTime('10:30')).toEqual({ h: 10, m: 30, s: 0 });
    expect(parseAtTime('0:00')).toEqual({ h: 0, m: 0, s: 0 });
    expect(parseAtTime('23:59')).toEqual({ h: 23, m: 59, s: 0 });
  });

  it('parses HH:MM:SS format', () => {
    expect(parseAtTime('10:30:45')).toEqual({ h: 10, m: 30, s: 45 });
    expect(parseAtTime('0:00:00')).toEqual({ h: 0, m: 0, s: 0 });
  });

  it('parses :MM format', () => {
    expect(parseAtTime(':30')).toEqual({ h: 0, m: 30, s: 0 });
    expect(parseAtTime(':00')).toEqual({ h: 0, m: 0, s: 0 });
  });

  it('throws on invalid hour value', () => {
    expect(() => parseAtTime('25:00')).toThrow('invalid hour value');
    expect(() => parseAtTime('24:00')).toThrow('invalid hour value');
  });

  it('throws on invalid minute value', () => {
    expect(() => parseAtTime('10:60')).toThrow('invalid minute value');
    expect(() => parseAtTime(':99')).toThrow('invalid minute value');
  });

  it('throws on invalid second value', () => {
    expect(() => parseAtTime('10:30:60')).toThrow('invalid second value');
  });

  it('throws on invalid format', () => {
    expect(() => parseAtTime('')).toThrow('invalid time format');
    expect(() => parseAtTime('abc')).toThrow('invalid time format');
    expect(() => parseAtTime('10')).toThrow('invalid time format');
  });
});

describe('setTime', () => {
  it('overwrites the time portion of a Date', () => {
    const date = new Date('2026-03-20T15:00:00');
    const result = setTime(date, '10:30');
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(0);
  });

  it('does not mutate the original Date', () => {
    const date = new Date('2026-03-20T15:00:00');
    setTime(date, '10:30');
    expect(date.getHours()).toBe(15);
  });
});

describe('parseDeadline', () => {
  it('parses YYYY-MM-DD format', () => {
    const result = parseDeadline('2026-12-31');
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(11); // 0-indexed
    expect(result.getDate()).toBe(31);
  });

  it('parses HH:MM format', () => {
    const result = parseDeadline('18:00');
    expect(result.getHours()).toBe(18);
    expect(result.getMinutes()).toBe(0);
  });

  it('throws on invalid format', () => {
    expect(() => parseDeadline('invalid')).toThrow('invalid until format');
  });

  it('throws on invalid date (non-existent month/day)', () => {
    expect(() => parseDeadline('2026-99-99')).toThrow('invalid date');
  });

  it('throws on normalized date (e.g. Feb 31)', () => {
    expect(() => parseDeadline('2026-02-31')).toThrow('invalid date');
    expect(() => parseDeadline('2026-04-31')).toThrow('invalid date');
  });
});

describe('nextWeekday', () => {
  it('returns next Monday from Wednesday', () => {
    // 2026-03-18 is Wednesday
    const wed = new Date('2026-03-18T10:00:00');
    const result = nextWeekday(wed, 'monday');
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(23); // 5 days later
  });

  it('returns next week when on the same weekday', () => {
    // 2026-03-16 is Monday
    const mon = new Date('2026-03-16T10:00:00');
    const result = nextWeekday(mon, 'monday');
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(23); // 7 days later
  });

  it('returns the next day correctly', () => {
    // 2026-03-16 is Monday -> Tuesday
    const mon = new Date('2026-03-16T10:00:00');
    const result = nextWeekday(mon, 'tuesday');
    expect(result.getDay()).toBe(2);
    expect(result.getDate()).toBe(17);
  });

  it('skips additional weeks with weekInterval', () => {
    // 2026-03-20 is Friday
    const fri = new Date('2026-03-20T10:00:00');
    // interval=2: next Monday is 3/23, +7 = 3/30
    const result = nextWeekday(fri, 'monday', 2);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(30);
  });

  it('weekInterval=1 behaves the same as default', () => {
    const fri = new Date('2026-03-20T10:00:00');
    const result1 = nextWeekday(fri, 'monday');
    const result2 = nextWeekday(fri, 'monday', 1);
    expect(result1.getTime()).toBe(result2.getTime());
  });

  it('weekInterval=3 returns 3 weeks later', () => {
    // 2026-03-20 is Friday
    const fri = new Date('2026-03-20T10:00:00');
    // next Monday is 3/23, interval=3 -> 3/23 + 14 = 4/6
    const result = nextWeekday(fri, 'monday', 3);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(6);
    expect(result.getMonth()).toBe(3); // April
  });
});
