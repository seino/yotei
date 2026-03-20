import { Job } from './job.js';
import { parseAtTime, parseDeadline } from './parser.js';
import type { Scheduler } from './scheduler.js';
import type { JobFn, TimeUnit, Weekday } from './types.js';

/**
 * Builds a method chain starting from `every()` and registers a Job via `do()`
 *
 * Do not instantiate directly — use `scheduler.every()` instead.
 *
 * @example
 * ```ts
 * scheduler.every(10).minutes.do(myJob);
 * scheduler.every().day.at('10:30').do(myJob);
 * scheduler.every(5).to(10).minutes.do(myJob); // random interval
 * scheduler.every().monday.at('09:00').do(myJob);
 * ```
 */
export class ScheduleBuilder {
  private _interval: number;
  private _intervalMax: number | null = null;
  private _unit: TimeUnit | null = null;
  private _atTime: string | null = null;
  private _weekday: Weekday | null = null;
  private _tags: string[] = [];
  private _maxTimes: number | null = null;
  private _until: Date | null = null;
  private _skipIfRunning = false;

  constructor(
    private readonly scheduler: Scheduler,
    interval?: number,
  ) {
    this._interval = interval ?? 1;
  }

  // --- Time unit properties (plural) ---

  /** Schedule in seconds */
  get seconds(): this {
    this._unit = 'seconds';
    return this;
  }

  /** Schedule in minutes */
  get minutes(): this {
    this._unit = 'minutes';
    return this;
  }

  /** Schedule in hours */
  get hours(): this {
    this._unit = 'hours';
    return this;
  }

  /** Schedule in days */
  get days(): this {
    this._unit = 'days';
    return this;
  }

  /** Schedule in weeks */
  get weeks(): this {
    this._unit = 'weeks';
    return this;
  }

  // --- Singular aliases ---

  /** Alias for `seconds`. Use as `every().second` */
  get second(): this {
    return this.seconds;
  }

  /** Alias for `minutes`. Use as `every().minute` */
  get minute(): this {
    return this.minutes;
  }

  /** Alias for `hours`. Use as `every().hour` */
  get hour(): this {
    return this.hours;
  }

  /** Alias for `days`. Use as `every().day` */
  get day(): this {
    return this.days;
  }

  /** Alias for `weeks`. Use as `every().week` */
  get week(): this {
    return this.weeks;
  }

  // --- Weekdays ---

  /** Run every Monday */
  get monday(): this {
    this._weekday = 'monday';
    this._unit = 'weeks';
    return this;
  }

  /** Run every Tuesday */
  get tuesday(): this {
    this._weekday = 'tuesday';
    this._unit = 'weeks';
    return this;
  }

  /** Run every Wednesday */
  get wednesday(): this {
    this._weekday = 'wednesday';
    this._unit = 'weeks';
    return this;
  }

  /** Run every Thursday */
  get thursday(): this {
    this._weekday = 'thursday';
    this._unit = 'weeks';
    return this;
  }

  /** Run every Friday */
  get friday(): this {
    this._weekday = 'friday';
    this._unit = 'weeks';
    return this;
  }

  /** Run every Saturday */
  get saturday(): this {
    this._weekday = 'saturday';
    this._unit = 'weeks';
    return this;
  }

  /** Run every Sunday */
  get sunday(): this {
    this._weekday = 'sunday';
    this._unit = 'weeks';
    return this;
  }

  /**
   * Set the upper bound for random intervals
   *
   * Use as `every(min).to(max).minutes` to run at a random interval between min and max.
   *
   * @param max - Upper bound of the interval
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * scheduler.every(5).to(10).minutes.do(myJob); // random 5–10 min interval
   * ```
   */
  to(max: number): this {
    this._intervalMax = max;
    return this;
  }

  /**
   * Set the execution time
   *
   * Only valid with `days` / `weeks` (including weekday specifiers).
   *
   * @param time - Time string (`'HH:MM'` / `'HH:MM:SS'`)
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * scheduler.every().day.at('10:30').do(myJob);
   * scheduler.every().monday.at('09:00:30').do(myJob);
   * ```
   */
  at(time: string): this {
    this._atTime = time;
    return this;
  }

  /**
   * Tag the job
   *
   * Tags can be used with `scheduler.cancelTag()` to cancel jobs in bulk.
   *
   * @param tags - Tag names to attach (multiple allowed)
   * @returns this (for chaining)
   */
  tag(...tags: string[]): this {
    this._tags.push(...tags);
    return this;
  }

  /**
   * Set the maximum number of executions
   *
   * The job is automatically cancelled after reaching this count.
   *
   * @param n - Maximum execution count (must be >= 1)
   * @returns this (for chaining)
   */
  times(n: number): this {
    this._maxTimes = n;
    return this;
  }

  /**
   * Set a deadline for the job
   *
   * The job is automatically cancelled after the deadline passes.
   *
   * @param deadline - Deadline (`Date` / `'YYYY-MM-DD'` / `'HH:MM'`)
   * @returns this (for chaining)
   *
   * @example
   * ```ts
   * scheduler.every(10).minutes.until('2026-12-31').do(myJob);
   * scheduler.every(10).minutes.until('18:00').do(myJob);
   * ```
   */
  until(deadline: Date | string): this {
    this._until = typeof deadline === 'string' ? parseDeadline(deadline) : deadline;
    return this;
  }

  /**
   * Skip this execution if the previous run hasn't finished
   * @returns this (for chaining)
   */
  skipIfRunning(): this {
    this._skipIfRunning = true;
    return this;
  }

  /**
   * Register the job
   *
   * Call at the end of the chain to register the job with the Scheduler.
   *
   * @param fn - Function to execute. Receives an `AbortSignal` as the first argument
   * @returns The registered `Job` instance
   *
   * @example
   * ```ts
   * const job = scheduler.every(10).minutes.do(async (signal) => {
   *   const res = await fetch(url, { signal });
   * });
   * ```
   */
  do(fn: JobFn): Job {
    return this._register(fn, false);
  }

  /**
   * Run once immediately, then register on schedule
   *
   * The first execution happens right away without waiting for `nextRun`,
   * then continues on the regular schedule.
   *
   * @param fn - Function to execute. Receives an `AbortSignal` as the first argument
   * @returns The registered `Job` instance
   */
  doImmediately(fn: JobFn): Job {
    return this._register(fn, true);
  }

  private _register(fn: JobFn, immediately: boolean): Job {
    this._validate();

    const job = new Job({
      fn,
      interval: this._interval,
      intervalMax: this._intervalMax,
      unit: this._unit!,
      atTime: this._atTime,
      weekday: this._weekday,
      tags: this._tags,
      maxTimes: this._maxTimes,
      until: this._until,
      skipIfRunning: this._skipIfRunning,
    });

    this.scheduler.register(job);
    if (immediately) {
      job.run().catch((err: unknown) => {
        console.error('[yotei] Unexpected error during doImmediately() execution:', err);
      });
    }
    return job;
  }

  private _validate(): void {
    if (!this._unit) {
      throw new Error('yotei: time unit not specified. Use .minutes / .hours / etc.');
    }
    if (this._interval <= 0) {
      throw new Error('yotei: every() value must be >= 1.');
    }
    if (this._intervalMax !== null && this._intervalMax <= this._interval) {
      throw new Error('yotei: to() value must be greater than every() value.');
    }
    if (this._maxTimes !== null && this._maxTimes <= 0) {
      throw new Error('yotei: times() value must be >= 1.');
    }
    if (this._atTime !== null && this._unit !== 'days' && this._unit !== 'weeks') {
      throw new Error('yotei: at() can only be used with days or weeks.');
    }
    if (this._atTime !== null) {
      // Validate time format at registration to avoid runtime errors later
      parseAtTime(this._atTime);
    }
  }
}
