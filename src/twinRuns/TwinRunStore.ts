/**
 * Finished twin runs, newest first. Kept in this browser (localStorage), like
 * the workspace, so a run survives a reload and can be opened from Analytics
 * and AI Insights by its id.
 */
import { SimStore } from '../core/SimStore.ts';
import { newRunId } from './common.ts';
import type { TwinRun } from './types.ts';

const KEY = 'autotwin.twinRuns.v1';
const MAX_RUNS = 12;

export class TwinRunStore extends SimStore {
  runs: TwinRun[] = [];
  /** The run that just finished and hasn't been dismissed on the twin page. */
  fresh: string | null = null;

  constructor(load = true) {
    super();
    if (load) this.load();
  }

  add(run: Omit<TwinRun, 'id' | 'createdAt'>): TwinRun {
    const full: TwinRun = { ...run, id: newRunId(), createdAt: Date.now() };
    this.runs = [full, ...this.runs].slice(0, MAX_RUNS);
    this.fresh = full.id;
    this.save();
    this.emit();
    return full;
  }

  get(id: string | undefined | null) {
    return id ? this.runs.find((r) => r.id === id) : undefined;
  }

  dismiss() {
    this.fresh = null;
    this.emit();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.runs));
    } catch {
      // Storage full or blocked: keep the newest runs only in memory.
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.runs = JSON.parse(raw) as TwinRun[];
    } catch {
      this.runs = [];
    }
  }
}

export const twinRuns = new TwinRunStore(typeof localStorage !== 'undefined');
