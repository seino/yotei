import { MockTimer } from '../../src/timer.js';
import { Scheduler } from '../../src/scheduler.js';

export function createTestScheduler(): {
  scheduler: Scheduler;
  timer: MockTimer;
  tick: () => void;
} {
  const timer = new MockTimer();
  const scheduler = new Scheduler({ timer });
  return { scheduler, timer, tick: () => timer.tick() };
}
