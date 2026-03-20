import { EventEmitter } from 'node:events';
import { Job } from './job.js';
import { ScheduleBuilder } from './builder.js';
import { IntervalTimer, type ITimer } from './timer.js';

/** Options for the Scheduler constructor */
export interface SchedulerOptions {
  /** Custom timer. Pass `MockTimer` for testing */
  timer?: ITimer;
}

/** Event type definitions emitted by Scheduler */
export interface SchedulerEventMap {
  'job:start': [job: Job];
  'job:end': [job: Job];
  'job:error': [job: Job, error: unknown];
}

/**
 * Manages job registration, scheduling, and execution
 *
 * Extends `EventEmitter` and emits `job:start`, `job:end`, and `job:error` events.
 *
 * @example
 * ```ts
 * import { Scheduler } from 'yotei';
 *
 * const scheduler = new Scheduler();
 * scheduler.every(10).minutes.do(() => console.log('running'));
 * scheduler.on('job:error', (job, err) => console.error(err));
 * scheduler.start();
 * ```
 */
export class Scheduler extends EventEmitter {
  private readonly jobMap = new Map<string, Job>();
  private readonly timer: ITimer;
  private pendingRunning = false;

  // --- Type-safe event method overloads ---

  /**
   * Register an event listener
   * @param event - Event name
   * @param listener - Callback function
   */
  on<K extends keyof SchedulerEventMap>(
    event: K,
    listener: (...args: SchedulerEventMap[K]) => void,
  ): this;
  on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  emit<K extends keyof SchedulerEventMap>(event: K, ...args: SchedulerEventMap[K]): boolean;
  emit(event: string | symbol, ...args: unknown[]): boolean;
  emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  constructor(options?: SchedulerOptions) {
    super();
    this.timer = options?.timer ?? new IntervalTimer();
  }

  /**
   * Entry point for the chain API
   *
   * @param interval - Execution interval. Defaults to 1
   * @returns A `ScheduleBuilder` for method chaining
   *
   * @example
   * ```ts
   * scheduler.every(10).minutes.do(myJob);
   * scheduler.every().day.at('10:30').do(myJob);
   * scheduler.every().monday.at('09:00').do(myJob);
   * ```
   */
  every(interval?: number): ScheduleBuilder {
    return new ScheduleBuilder(this, interval);
  }

  /**
   * Register a job
   *
   * Typically called by `ScheduleBuilder.do()` — you don't need to call this directly.
   *
   * @param job - Job instance to register
   */
  register(job: Job): void {
    job.onError = (j, err) => {
      if (this.listenerCount('job:error') > 0) {
        this.emit('job:error', j, err);
      } else {
        console.error(`[yotei] Job execution error: id=${j.id}`, err);
      }
    };
    this.jobMap.set(job.id, job);
  }

  /**
   * Run all jobs that are due
   *
   * Executes jobs where `nextRun <= now` in parallel, then removes cancelled jobs.
   * Emits `job:end` only for successfully completed jobs.
   * Does not emit `job:end` for jobs that errored.
   */
  async runPending(): Promise<void> {
    if (this.pendingRunning) return;
    this.pendingRunning = true;

    try {
      const now = new Date();
      const pending = [...this.jobMap.values()].filter(
        (job) => !job.cancelled && job.nextRun <= now && job.canRun(now),
      );

      await Promise.allSettled(
        pending.map(async (job) => {
          this.emit('job:start', job);
          const success = await job.run();
          if (success && !job.cancelled) {
            this.emit('job:end', job);
          }
        }),
      );

      // Remove cancelled jobs
      for (const [id, job] of this.jobMap) {
        if (job.cancelled) this.jobMap.delete(id);
      }
    } finally {
      this.pendingRunning = false;
    }
  }

  /**
   * Run all active jobs immediately
   *
   * Executes all non-cancelled jobs regardless of `nextRun`. Primarily for testing.
   */
  async runAll(): Promise<void> {
    const now = new Date();
    const allJobs = [...this.jobMap.values()].filter((job) => !job.cancelled && job.canRun(now));
    await Promise.allSettled(
      allJobs.map(async (job) => {
        this.emit('job:start', job);
        const success = await job.run();
        if (success && !job.cancelled) {
          this.emit('job:end', job);
        }
      }),
    );
  }

  /**
   * Start periodic `runPending()` calls via the Timer
   * @param resolution - Check interval in milliseconds. Defaults to 1000 (1 second)
   */
  start(resolution = 1000): void {
    this.timer.start(() => {
      void this.runPending();
    }, resolution);
  }

  /** Stop the Timer, halting periodic `runPending()` calls */
  stop(): void {
    this.timer.stop();
  }

  /**
   * Return an array of active (non-cancelled) jobs
   * @returns Array of active Job instances
   */
  jobs(): Job[] {
    return [...this.jobMap.values()].filter((job) => !job.cancelled);
  }

  /**
   * Return the nearest next execution time across all jobs
   * @returns The earliest `nextRun` Date, or `null` if no jobs are registered
   */
  nextRun(): Date | null {
    const active = this.jobs();
    if (active.length === 0) return null;
    const first = active[0]!;
    return active.reduce((earliest, job) => (job.nextRun < earliest ? job.nextRun : earliest), first.nextRun);
  }

  /** Cancel all jobs and remove them from the Scheduler */
  cancelAll(): void {
    for (const job of this.jobMap.values()) {
      job.cancel();
    }
    this.jobMap.clear();
  }

  /**
   * Cancel all jobs with the specified tag
   * @param tag - Tag name to match
   */
  cancelTag(tag: string): void {
    for (const [id, job] of this.jobMap) {
      if (job.tags.includes(tag)) {
        job.cancel();
        this.jobMap.delete(id);
      }
    }
  }

  /** Cancel and remove all jobs. Alias for `cancelAll()` */
  clear(): void {
    this.cancelAll();
  }
}
