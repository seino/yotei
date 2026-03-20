export type TimeUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type JobID = string;

/** Function passed to `do()`. Receives an `AbortSignal` (can be ignored). */
export type JobFn = (signal: AbortSignal) => void | Promise<void>;

export interface JobConfig {
  fn: JobFn;
  interval: number;
  intervalMax: number | null;
  unit: TimeUnit;
  atTime: string | null;
  weekday: Weekday | null;
  tags: string[];
  maxTimes: number | null;
  until: Date | null;
  skipIfRunning: boolean;
}
