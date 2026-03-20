import type { Weekday } from './types.js';

/**
 * Parse a time string
 *
 * Supported formats:
 * - `'HH:MM'` — hours and minutes
 * - `'HH:MM:SS'` — hours, minutes, and seconds
 * - `':MM'` — every hour at MM minutes (reserved for future use, e.g. `every().hour.at(':30')`)
 *
 * @param str - Time string to parse
 * @returns Parsed hours, minutes, and seconds
 * @throws On invalid format or out-of-range values
 *
 * @example
 * ```ts
 * parseAtTime('10:30');    // { h: 10, m: 30, s: 0 }
 * parseAtTime('10:30:45'); // { h: 10, m: 30, s: 45 }
 * parseAtTime(':30');      // { h: 0, m: 30, s: 0 }
 * ```
 */
export function parseAtTime(str: string): { h: number; m: number; s: number } {
  // :MM (every hour at MM minutes)
  const minuteOnly = /^:(\d{2})$/.exec(str);
  if (minuteOnly) {
    const m = Number(minuteOnly[1]);
    if (m < 0 || m > 59) throw new Error(`yotei: invalid minute value: "${str}"`);
    return { h: 0, m, s: 0 };
  }

  // HH:MM:SS
  const hms = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(str);
  if (hms) {
    const [h, m, s] = [Number(hms[1]), Number(hms[2]), Number(hms[3])];
    validateTime(h, m, s, str);
    return { h, m, s };
  }

  // HH:MM
  const hm = /^(\d{1,2}):(\d{2})$/.exec(str);
  if (hm) {
    const [h, m] = [Number(hm[1]), Number(hm[2])];
    validateTime(h, m, 0, str);
    return { h, m, s: 0 };
  }

  throw new Error(`yotei: invalid time format: "${str}"`);
}

function validateTime(h: number, m: number, s: number, original: string): void {
  if (h < 0 || h > 23) throw new Error(`yotei: invalid hour value: "${original}"`);
  if (m < 0 || m > 59) throw new Error(`yotei: invalid minute value: "${original}"`);
  if (s < 0 || s > 59) throw new Error(`yotei: invalid second value: "${original}"`);
}

/**
 * Return a new Date with the time portion overwritten by the given string
 *
 * The original Date is not mutated (immutable).
 *
 * @param date - Base date
 * @param timeStr - Time string (see `parseAtTime` for supported formats)
 * @returns A new Date with the time overwritten
 *
 * @example
 * ```ts
 * const date = new Date('2026-03-20T15:00:00');
 * setTime(date, '10:30'); // 2026-03-20T10:30:00
 * ```
 */
export function setTime(date: Date, timeStr: string): Date {
  const { h, m, s } = parseAtTime(timeStr);
  const result = new Date(date);
  result.setHours(h, m, s, 0);
  return result;
}

/**
 * Parse a deadline string for `until()`
 *
 * Supported formats:
 * - `'YYYY-MM-DD'` — midnight on that date
 * - `'HH:MM'` — that time today
 *
 * **Note**: With the `'HH:MM'` format, if the time has already passed,
 * the job will be cancelled immediately on the next `runPending()` call.
 *
 * @param str - Deadline string
 * @returns Parsed Date object
 * @throws On invalid format or date
 *
 * @example
 * ```ts
 * parseDeadline('2026-12-31'); // 2026-12-31T00:00:00
 * parseDeadline('18:00');      // today at 18:00:00
 * ```
 */
export function parseDeadline(str: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number) as [number, number, number];
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      throw new Error(`yotei: invalid date: "${str}"`);
    }
    return date;
  }
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const today = new Date();
    const { h, m } = parseAtTime(str);
    today.setHours(h, m, 0, 0);
    return today;
  }
  throw new Error(`yotei: invalid until format: "${str}"`);
}

// --- Date arithmetic helpers ---

/**
 * Return a new Date with the given number of seconds added
 * @param date - Base date
 * @param n - Seconds to add
 */
export function addSeconds(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 1000);
}

/**
 * Return a new Date with the given number of minutes added
 * @param date - Base date
 * @param n - Minutes to add
 */
export function addMinutes(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 60 * 1000);
}

/**
 * Return a new Date with the given number of hours added
 * @param date - Base date
 * @param n - Hours to add
 */
export function addHours(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 60 * 60 * 1000);
}

/**
 * Return a new Date with the given number of days added
 * @param date - Base date
 * @param n - Days to add
 */
export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 24 * 60 * 60 * 1000);
}

/**
 * Return a new Date with the given number of weeks added
 * @param date - Base date
 * @param n - Weeks to add
 */
export function addWeeks(date: Date, n: number): Date {
  return addDays(date, n * 7);
}

const WEEKDAY_MAP: Record<Weekday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Return the next occurrence of the specified weekday
 *
 * If `from` falls on the target weekday, returns the following week.
 * Use `weekInterval` to skip additional weeks.
 *
 * @param from - Base date
 * @param weekday - Target weekday
 * @param weekInterval - Week interval (1 = weekly, 2 = biweekly). Defaults to 1
 * @returns The next occurrence as a Date
 *
 * @example
 * ```ts
 * // From Friday 2026-03-20 to the next Monday
 * nextWeekday(new Date('2026-03-20'), 'monday');    // 2026-03-23
 * // Biweekly Monday
 * nextWeekday(new Date('2026-03-20'), 'monday', 2); // 2026-03-30
 * ```
 */
export function nextWeekday(from: Date, weekday: Weekday, weekInterval = 1): Date {
  const target = WEEKDAY_MAP[weekday];
  const current = from.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;
  if (weekInterval > 1) {
    diff += 7 * (weekInterval - 1);
  }
  return addDays(from, diff);
}

/**
 * Return a random integer between min and max (inclusive)
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns A random integer in [min, max]
 */
export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
