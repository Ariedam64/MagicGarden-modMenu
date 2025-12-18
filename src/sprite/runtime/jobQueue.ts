import type { SpriteJob } from '../types';
import type { SpriteConfig } from '../settings';

export class JobQueue {
  private queue: SpriteJob[] = [];
  private map = new Map<string, SpriteJob>();

  constructor(private cfg: SpriteConfig) {}

  enqueue(job: SpriteJob) {
    if (this.map.has(job.key)) return;
    this.queue.push(job);
    this.map.set(job.key, job);
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  reset() {
    this.queue.length = 0;
    this.map.clear();
  }

  tick(now: number) {
    if (!this.cfg.jobOn) return 0;
    const budget = this.cfg.jobBudgetMs;
    const cap = this.cfg.jobCapPerTick;
    let used = 0;
    let run = 0;
    const start = performance.now();

    while (this.queue.length && run < cap && performance.now() - start <= budget) {
      const job = this.queue.shift()!;
      this.map.delete(job.key);
      try {
        job.run();
      } catch (err) {
        console.error('[SpriteJob] failed', job.key, err);
      }
      run += 1;
      used = performance.now() - start;
    }
    return used;
  }
}
