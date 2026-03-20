import { Scheduler } from './scheduler.js';

/** Default instance */
export const schedule = new Scheduler();
export default schedule;

// Classes
export { Scheduler } from './scheduler.js';
export { ScheduleBuilder } from './builder.js';
export { Job } from './job.js';
export { IntervalTimer, MockTimer } from './timer.js';

// Types
export type { ITimer } from './timer.js';
export type { SchedulerOptions, SchedulerEventMap } from './scheduler.js';
export type { TimeUnit, Weekday, JobID, JobFn, JobConfig } from './types.js';
