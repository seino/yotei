# yotei

Human-readable task scheduler for Node.js — inspired by Python [schedule](https://github.com/dbader/schedule).

```ts
import { schedule } from 'yoteijs';

schedule.every(10).minutes.do(() => console.log('runs every 10 min'));
schedule.every().day.at('10:30').do(fetchReport);
schedule.every().monday.at('09:00').do(sendWeeklyDigest);
schedule.every(5).to(10).minutes.do(pollAPI); // random 5–10 min interval

schedule.start();
```

## Features

- **Human-readable API** — reads like plain English, no cron expressions
- **Zero dependencies** — only Node.js built-ins
- **Async-first** — properly `await`s async jobs, handles errors gracefully
- **AbortController integration** — `cancel()` issues an `AbortSignal` to interrupt `fetch`, DB queries, etc.
- **Type-safe** — strict TypeScript with typed EventEmitter
- **Dual format** — ships ESM and CJS

## When to Use yotei

**Use yotei when:**

- You want readable scheduling code without learning cron syntax — `every(5).minutes.do(fn)` instead of `'*/5 * * * *'`
- You need to **cancel running jobs mid-execution** — yotei is the only Node.js scheduler with built-in `AbortSignal` support, so `fetch()`, streams, and DB queries stop immediately on `cancel()`
- You're building **long-running Node.js processes** (API servers, CLI daemons, AI agents) that need in-process periodic tasks
- You want **async/await-first** scheduling with proper error handling, not callback-based APIs
- You prefer **zero dependencies** — yotei uses only Node.js built-ins

**Use something else when:**

| Situation | Better choice |
| --- | --- |
| You need job persistence across restarts | [BullMQ](https://github.com/taskforcesh/bullmq), [Agenda](https://github.com/agenda/agenda) |
| You're in a serverless environment (Lambda, Cloud Functions) | AWS EventBridge, Cloud Scheduler |
| You just need a one-off cron job on a server | OS crontab |
| You already know and prefer cron expressions | [node-cron](https://github.com/node-cron/node-cron) |

## Install

```bash
npm install yoteijs
```

Requires Node.js 18+.

## Quick Start

```ts
import { schedule } from 'yoteijs';

// Every 30 seconds
schedule.every(30).seconds.do(() => {
  console.log('tick');
});

// Every day at 10:30
schedule.every().day.at('10:30').do(async (signal) => {
  const res = await fetch('https://api.example.com/report', { signal });
  console.log(await res.json());
});

// Start the scheduler (checks every 1 second by default)
schedule.start();

// Stop when done
// schedule.stop();
```

## API

### Scheduling Jobs

```ts
schedule.every(10).minutes.do(fn);           // every 10 minutes
schedule.every(2).hours.do(fn);              // every 2 hours
schedule.every().day.at('10:30').do(fn);     // daily at 10:30
schedule.every().monday.at('09:00').do(fn);  // weekly on Monday at 09:00
schedule.every(5).to(10).minutes.do(fn);     // random interval between 5–10 min
```

#### Time Units

| Plural      | Singular (alias) |
| ----------- | ---------------- |
| `.seconds`  | `.second`        |
| `.minutes`  | `.minute`        |
| `.hours`    | `.hour`          |
| `.days`     | `.day`           |
| `.weeks`    | `.week`          |

#### Weekdays

`.monday` `.tuesday` `.wednesday` `.thursday` `.friday` `.saturday` `.sunday`

#### Modifiers

| Method | Description |
| --- | --- |
| `.at('HH:MM')` | Set execution time (days/weeks only). `HH:MM:SS` also accepted. `:MM` format is parsed but reserved for future use (e.g. `every().hour.at(':30')`) |
| `.tag('name')` | Tag the job for group operations |
| `.times(n)` | Auto-cancel after `n` executions |
| `.until(deadline)` | Auto-cancel after deadline (`Date`, `'YYYY-MM-DD'`, or `'HH:MM'`) |
| `.to(max)` | Random interval: `every(min).to(max)` |
| `.skipIfRunning()` | Skip if the previous run hasn't finished |
| `.do(fn)` | Register the job |
| `.doImmediately(fn)` | Run once immediately, then on schedule |

### Managing Jobs

```ts
schedule.jobs();              // list active jobs
schedule.nextRun();           // nearest next execution time (Date | null)
schedule.cancelAll();         // cancel all jobs
schedule.cancelTag('api');    // cancel jobs with a specific tag
schedule.clear();             // alias for cancelAll()
```

### Controlling the Loop

```ts
schedule.start();       // start the scheduler (1s resolution)
schedule.start(500);    // custom resolution in ms
schedule.stop();        // stop the scheduler
```

### Running Manually

```ts
await schedule.runPending();  // run jobs that are due
await schedule.runAll();      // run all jobs immediately (useful in tests)
```

### Job Instance

`do()` returns a `Job` instance:

```ts
const job = schedule.every(10).minutes.tag('sync').do(myFn);

job.id;         // unique ID (crypto.randomUUID())
job.tags;       // ['sync']
job.nextRun;    // Date
job.lastRun;    // Date | null
job.runCount;   // number
job.cancelled;  // boolean
job.isRunning;  // boolean
job.cancel();   // cancel (sends AbortSignal if running)
```

### Events

```ts
schedule.on('job:start', (job) => { /* ... */ });
schedule.on('job:end', (job) => { /* ... */ });
schedule.on('job:error', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});
```

> If no `job:error` listener is registered, errors are logged to `console.error`.

### AbortSignal

Every job function receives an `AbortSignal`. When `job.cancel()` is called, the signal is aborted, allowing cooperative cancellation of `fetch`, streams, etc.

```ts
schedule.every(5).minutes.do(async (signal) => {
  const res = await fetch('https://api.example.com/data', { signal });
  // If cancel() is called, fetch throws AbortError (handled internally)
});
```

### Validation & Error Cases

Builder methods validate at `do()` / `doImmediately()` call time and throw immediately on invalid configuration:

```ts
// Time unit not specified
schedule.every(10).do(fn);
// → Error: yotei: time unit not specified. Use .minutes / .hours / etc.

// at() with seconds/minutes/hours (only days/weeks allowed)
schedule.every(10).minutes.at('10:00').do(fn);
// → Error: yotei: at() can only be used with days or weeks.

// Invalid at() format
schedule.every().day.at('25:00').do(fn);
// → Error: yotei: invalid hour value: 25

// times(0) or negative
schedule.every(10).minutes.times(0).do(fn);
// → Error: yotei: times() value must be >= 1.

// to(max) <= every(min)
schedule.every(10).to(5).minutes.do(fn);
// → Error: yotei: to() value must be greater than every() value.
```

### Event Behavior

| Scenario | `job:start` | `job:end` | `job:error` |
| --- | --- | --- | --- |
| Successful run | Yes | Yes | — |
| Job throws an error | Yes | — | Yes |
| Skipped by `skipIfRunning()` | — | — | — |
| Cancelled job | — | — | — |
| `doImmediately()` first run | — | — | — |

> `doImmediately()` fires the job directly via `job.run()` and does **not** emit scheduler-level events (`job:start` / `job:end` / `job:error`). Errors during the immediate run are caught and logged to `console.error`.

### Timezone & DST

yotei currently uses the **system local timezone** for all scheduling. Dates are computed via `new Date()` and `Date.prototype.setHours()`, which follow the host environment's timezone.

**DST behavior:**

- **Spring forward** (e.g. 02:00 → 03:00): If a job is scheduled at a skipped time (e.g. `at('02:30')`), JavaScript's `Date` will adjust it to the next valid time. The job may fire later than expected.
- **Fall back** (e.g. 02:00 → 01:00): A job scheduled during the repeated hour may fire once at the first occurrence. It will not fire twice.

Explicit timezone support (e.g. `at('09:00', 'Asia/Tokyo')`) is planned for a future release.

### Multiple Schedulers

The default export is a shared instance. Create separate instances when needed:

```ts
import { Scheduler } from 'yoteijs';

const apiScheduler = new Scheduler();
const dbScheduler = new Scheduler();
```

## Testing

yotei provides `MockTimer` for deterministic testing without real timers:

```ts
import { Scheduler, MockTimer } from 'yoteijs';
import { vi, describe, it, expect } from 'vitest';

describe('my scheduled task', () => {
  it('runs on schedule', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00'));

    const timer = new MockTimer();
    const scheduler = new Scheduler({ timer });
    const fn = vi.fn();

    scheduler.every(5).minutes.do(fn);

    // Advance time and run pending jobs
    vi.setSystemTime(new Date('2026-01-01T10:05:00'));
    await scheduler.runPending();

    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

## Python schedule Comparison

| Python `schedule` | yotei |
| --- | --- |
| `schedule.every(10).minutes.do(job)` | `schedule.every(10).minutes.do(job)` |
| `schedule.every().hour.do(job)` | `schedule.every().hour.do(job)` |
| `schedule.every().day.at("10:30").do(job)` | `schedule.every().day.at('10:30').do(job)` |
| `schedule.every(5).to(10).minutes.do(job)` | `schedule.every(5).to(10).minutes.do(job)` |
| `schedule.run_pending()` | `await schedule.runPending()` |
| `schedule.cancel_job(job)` | `job.cancel()` |
| `schedule.get_jobs()` | `schedule.jobs()` |
| `schedule.clear()` | `schedule.clear()` |

**Differences from Python schedule:**

- Jobs are `async`-first with `Promise` support
- `cancel()` sends an `AbortSignal` for cooperative cancellation
- Type-safe EventEmitter (`job:start`, `job:end`, `job:error`)
- `skipIfRunning()` for concurrency control

## License

[MIT](LICENSE)
