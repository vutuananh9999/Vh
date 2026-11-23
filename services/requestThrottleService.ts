/**
 * Request Throttling & Server-Aware Sequential/Parallel Queuing Middleware
 */

import { isServerRuntime, runtimeKV, serverSyncClient } from './runtimeAdapter.ts';
import {
  abortableSleep,
  createAbortError,
  getActiveJobAbortContext,
  isAbortError
} from './jobAbortContext.ts';

export type EnvironmentType = 'netlify' | 'preview' | 'custom' | 'server';
export type QueuePriority = 'critical' | 'high' | 'normal' | 'low';
export type QueueMode = 'auto' | 'sequential' | 'parallel';

export interface QueueJob<T = any> {
  id: string;
  jobId?: string;
  name: string;
  type: 'plot_chat' | 'plot_analysis' | 'chapter_summary' | 'content_gen' | 'general';
  priority: QueuePriority;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';
  error?: string;
  retryCount: number;
}

export interface ThrottleState {
  environment: EnvironmentType;
  hostname: string;
  isNetlify: boolean;
  isPreview: boolean;
  mode: QueueMode;
  effectiveConcurrency: number;
  activeCount: number;
  pendingCount: number;
  totalProcessed: number;
  lastRequestTime: number;
  interRequestDelayMs: number;
  isPaused: boolean;
  pauseReason?: string;
  jobs: QueueJob[];
}

const STORAGE_MODE_KEY = 'aetheria_queue_mode_pref';
const STORAGE_DELAY_KEY = 'aetheria_queue_delay_pref';

class RequestThrottleService {
  private environment: EnvironmentType = 'server';
  private hostname: string = 'steamdeck-server';
  private isNetlify: boolean = false;
  private isPreview: boolean = false;
  private userModePref: QueueMode = 'auto';
  private interRequestDelayMs: number = 150;

  private activeJobsCount: number = 0;
  private queue: Array<{
    job: QueueJob;
    task: () => Promise<any>;
    resolve: (val: any) => void;
    reject: (err: any) => void;
    signal?: AbortSignal;
    cleanup?: () => void;
  }> = [];

  private recentJobs: QueueJob[] = [];
  private waitCancelsByJobId = new Map<string, Set<() => void>>();
  private listeners: Array<(state: ThrottleState) => void> = [];
  private broadcastHook: ((state: ThrottleState) => void) | null = null;
  private lastRequestCompletedTime: number = 0;
  private isProcessing: boolean = false;
  private isPaused: boolean = false;
  private pauseReason?: string;
  private pauseTimer?: any;

  // Browser-side remote mirror state
  private remoteMirroredState: ThrottleState | null = null;

  constructor() {
    this.detectEnvironment();
    this.loadPreferences();
  }

  public setBroadcastHook(hook: (state: ThrottleState) => void): void {
    this.broadcastHook = hook;
  }

  public hydrateFromServer(state: ThrottleState): void {
    if (!state) return;
    this.remoteMirroredState = state;
    this.userModePref = state.mode;
    this.interRequestDelayMs = state.interRequestDelayMs;
    this.environment = state.environment || 'server';
    this.hostname = state.hostname || 'steamdeck-server';
    this.isNetlify = false;
    this.isPreview = false;
    this.listeners.forEach(l => {
      try {
        l(state);
      } catch {
        // ignore
      }
    });
  }

  public reloadPreferences(): void {
    this.detectEnvironment();
    this.loadPreferences();
    this.notifyState();
  }

  private detectEnvironment() {
    if (isServerRuntime() || typeof window === 'undefined') {
      this.environment = 'server';
      this.hostname = 'steamdeck-server';
      this.isPreview = false;
      this.isNetlify = false;
      this.interRequestDelayMs = 150;
      return;
    }

    this.hostname = window.location.hostname || '';
    this.environment = 'server';
    this.isPreview = false;
    this.isNetlify = false;
    this.interRequestDelayMs = 150;
  }

  private loadPreferences() {
    try {
      const savedMode = runtimeKV.getItem(STORAGE_MODE_KEY) as QueueMode | null;
      if (savedMode && ['auto', 'sequential', 'parallel'].includes(savedMode)) {
        this.userModePref = savedMode;
      }
      const savedDelay = runtimeKV.getItem(STORAGE_DELAY_KEY);
      if (savedDelay) {
        const num = parseInt(savedDelay, 10);
        if (!isNaN(num) && num >= 0 && num <= 5000) {
          this.interRequestDelayMs = num;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  public getEffectiveConcurrency(): number {
    if (this.userModePref === 'sequential') return 1;
    if (this.userModePref === 'parallel') return 4;
    return this.isNetlify ? 1 : 4;
  }

  public setMode(mode: QueueMode) {
    this.userModePref = mode;
    if (isServerRuntime()) {
      runtimeKV.setItem(STORAGE_MODE_KEY, mode);
      this.notifyState();
      void this.processQueue();
      return;
    }

    if (this.remoteMirroredState) {
      this.remoteMirroredState = {
        ...this.remoteMirroredState,
        mode,
        effectiveConcurrency: mode === 'sequential' ? 1 : 4
      };
    }
    this.notifyState();
    void serverSyncClient.updateThrottle({ mode }).catch(() => {});
  }

  public setInterRequestDelay(ms: number) {
    const cleanMs = Math.max(0, Math.min(5000, ms));
    this.interRequestDelayMs = cleanMs;
    if (isServerRuntime()) {
      runtimeKV.setItem(STORAGE_DELAY_KEY, String(cleanMs));
      this.notifyState();
      return;
    }

    if (this.remoteMirroredState) {
      this.remoteMirroredState = {
        ...this.remoteMirroredState,
        interRequestDelayMs: cleanMs
      };
    }
    this.notifyState();
    void serverSyncClient.updateThrottle({ interRequestDelayMs: cleanMs }).catch(() => {});
  }

  public getPriorityWeight(priority: QueuePriority): number {
    switch (priority) {
      case 'critical':
        return 100;
      case 'high':
        return 50;
      case 'normal':
        return 20;
      case 'low':
        return 5;
      default:
        return 10;
    }
  }

  public pauseForCooldown(cooldownMs: number, reason: string = 'Google 429 Quota Exhausted') {
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.isPaused = true;
    this.pauseReason = reason;
    this.notifyState();

    this.pauseTimer = setTimeout(() => {
      this.isPaused = false;
      this.pauseReason = undefined;
      this.notifyState();
      void this.processQueue();
    }, cooldownMs);
  }

  private registerWaitCancel(serverJobId: string | undefined, cancelFn: () => void): () => void {
    if (!serverJobId) return () => {};
    let set = this.waitCancelsByJobId.get(serverJobId);
    if (!set) {
      set = new Set();
      this.waitCancelsByJobId.set(serverJobId, set);
    }
    set.add(cancelFn);
    return () => {
      set?.delete(cancelFn);
      if (set && set.size === 0) {
        this.waitCancelsByJobId.delete(serverJobId);
      }
    };
  }

  public enqueuePromise<T>(
    task: () => Promise<T>,
    options: {
      name: string;
      type?: QueueJob['type'];
      priority?: QueuePriority;
      signal?: AbortSignal;
      jobId?: string;
    }
  ): Promise<T> {
    const activeCtx = getActiveJobAbortContext(options.signal);
    const signal = activeCtx.signal;
    const serverJobId = options.jobId || activeCtx.jobId;

    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    return new Promise<T>((resolve, reject) => {
      const job: QueueJob = {
        id: 'job_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
        jobId: serverJobId,
        name: options.name,
        type: options.type || 'general',
        priority: options.priority || 'normal',
        createdAt: Date.now(),
        status: 'pending',
        retryCount: 0
      };

      let settled = false;
      const onAbort = () => {
        if (settled) return;
        const idx = this.queue.findIndex(q => q.job.id === job.id);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          settled = true;
          cleanup();
          job.status = 'cancelled';
          job.error = 'Đã hủy bởi người dùng';
          job.completedAt = Date.now();
          this.notifyState();
          reject(createAbortError());
        }
      };

      const unregisterWait = this.registerWaitCancel(serverJobId, onAbort);
      const cleanup = () => {
        unregisterWait();
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.queue.push({
        job,
        task,
        resolve: (val) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(val);
        },
        reject: (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        },
        signal,
        cleanup
      });

      this.sortQueue();
      this.recordJob(job);
      this.notifyState();
      void this.processQueue();
    });
  }

  public async *enqueueStream<T = any>(
    streamFactory: () => AsyncGenerator<T, void, unknown>,
    options: {
      name: string;
      type?: QueueJob['type'];
      priority?: QueuePriority;
      signal?: AbortSignal;
      jobId?: string;
    }
  ): AsyncGenerator<T, void, unknown> {
    const activeCtx = getActiveJobAbortContext(options.signal);
    const signal = activeCtx.signal;
    const serverJobId = options.jobId || activeCtx.jobId;

    if (signal?.aborted) {
      throw createAbortError();
    }

    const job: QueueJob = {
      id: 'stream_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      jobId: serverJobId,
      name: options.name,
      type: options.type || 'plot_chat',
      priority: options.priority || 'high',
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0
    };

    this.recordJob(job);
    this.notifyState();

    let slotAcquired = false;
    try {
      await this.acquireSlot(job, signal, serverJobId);
      slotAcquired = true;

      if (signal?.aborted) {
        throw createAbortError();
      }

      job.status = 'running';
      job.startedAt = Date.now();
      this.notifyState();

      const stream = streamFactory();
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw createAbortError();
        }
        yield chunk;
      }

      job.status = 'completed';
      job.completedAt = Date.now();
    } catch (err: any) {
      if (signal?.aborted || isAbortError(err)) {
        job.status = 'cancelled';
        job.error = 'Đã hủy bởi người dùng';
      } else {
        job.status = 'failed';
        job.error = err?.message || String(err);
      }
      job.completedAt = Date.now();
      throw err;
    } finally {
      if (slotAcquired) {
        this.releaseSlot(job);
      } else {
        this.notifyState();
      }
    }
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      const pDiff = this.getPriorityWeight(b.job.priority) - this.getPriorityWeight(a.job.priority);
      if (pDiff !== 0) return pDiff;
      return a.job.createdAt - b.job.createdAt;
    });
  }

  private async acquireSlot(job: QueueJob, signal?: AbortSignal, serverJobId?: string): Promise<void> {
    if (signal?.aborted) {
      throw createAbortError();
    }

    const maxConcurrency = this.getEffectiveConcurrency();
    if (this.activeJobsCount < maxConcurrency && !this.isPaused && this.queue.length === 0) {
      await this.enforceInterRequestGap(signal);
      if (signal?.aborted) throw createAbortError();
      this.activeJobsCount++;
      return;
    }

    return new Promise((resolve, reject) => {
      let pollTimer: ReturnType<typeof setTimeout> | null = null;
      let done = false;

      const finishReject = (err: any) => {
        if (done) return;
        done = true;
        if (pollTimer) clearTimeout(pollTimer);
        unregisterWait();
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      };

      const onAbort = () => finishReject(createAbortError());
      const unregisterWait = this.registerWaitCancel(serverJobId, onAbort);
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const checkAndAcquire = async () => {
        if (done) return;
        if (signal?.aborted) {
          onAbort();
          return;
        }
        if (this.activeJobsCount < this.getEffectiveConcurrency() && !this.isPaused) {
          try {
            await this.enforceInterRequestGap(signal);
          } catch (gapErr) {
            finishReject(gapErr);
            return;
          }
          if (done) return;
          if (signal?.aborted) {
            onAbort();
            return;
          }
          done = true;
          if (pollTimer) clearTimeout(pollTimer);
          unregisterWait();
          if (signal) signal.removeEventListener('abort', onAbort);
          this.activeJobsCount++;
          resolve();
        } else {
          pollTimer = setTimeout(checkAndAcquire, 150);
        }
      };
      void checkAndAcquire();
    });
  }

  private releaseSlot(_job: QueueJob) {
    this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
    this.lastRequestCompletedTime = Date.now();
    this.notifyState();
    setTimeout(() => void this.processQueue(), 50);
  }

  private async enforceInterRequestGap(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw createAbortError();
    const delay = this.interRequestDelayMs;
    if (delay <= 0 || this.lastRequestCompletedTime === 0) return;

    const elapsed = Date.now() - this.lastRequestCompletedTime;
    if (elapsed < delay) {
      const waitMs = delay - elapsed;
      await abortableSleep(waitMs, signal);
    }
  }

  private async processQueue() {
    if (this.isProcessing) return;
    if (this.isPaused) return;

    const maxConcurrency = this.getEffectiveConcurrency();
    if (this.activeJobsCount >= maxConcurrency || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeJobsCount < this.getEffectiveConcurrency() && !this.isPaused) {
      const item = this.queue.shift();
      if (!item) break;

      const { job, task, resolve, reject, signal, cleanup } = item;
      cleanup?.();

      if (signal?.aborted) {
        job.status = 'cancelled';
        job.error = 'Đã hủy bởi người dùng';
        job.completedAt = Date.now();
        this.notifyState();
        reject(createAbortError());
        continue;
      }

      this.activeJobsCount++;

      try {
        await this.enforceInterRequestGap(signal);
      } catch (gapErr) {
        this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
        job.status = 'cancelled';
        job.error = 'Đã hủy bởi người dùng';
        job.completedAt = Date.now();
        this.notifyState();
        reject(gapErr);
        continue;
      }

      job.status = 'running';
      job.startedAt = Date.now();
      this.notifyState();

      (async () => {
        try {
          const result = await task();
          job.status = 'completed';
          job.completedAt = Date.now();
          resolve(result);
        } catch (err: any) {
          const cancelled = signal?.aborted || isAbortError(err);
          job.status = cancelled ? 'cancelled' : 'failed';
          job.error = cancelled ? 'Đã hủy bởi người dùng' : (err?.message || String(err));
          job.completedAt = Date.now();

          if (
            !cancelled &&
            (err?.status === 429 || String(err).includes('429') || String(err).includes('RESOURCE_EXHAUSTED'))
          ) {
            this.pauseForCooldown(25000, 'Phát hiện mã lỗi 429 (Đã tạm dừng hàng đợi 25s để hồi Quota)');
          }

          reject(err);
        } finally {
          this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
          this.lastRequestCompletedTime = Date.now();
          this.notifyState();
          void this.processQueue();
        }
      })();
    }

    this.isProcessing = false;
  }

  private recordJob(job: QueueJob) {
    this.recentJobs = [job, ...this.recentJobs.slice(0, 49)];
  }

  public getLatestRunningJob(): QueueJob | undefined {
    const jobs = this.getState().jobs;
    return jobs.find(j => j.status === 'running') || jobs.find(j => j.status === 'pending');
  }

  public getState(): ThrottleState {
    if (!isServerRuntime() && this.remoteMirroredState) {
      return this.remoteMirroredState;
    }
    return {
      environment: this.environment,
      hostname: this.hostname,
      isNetlify: this.isNetlify,
      isPreview: this.isPreview,
      mode: this.userModePref,
      effectiveConcurrency: this.getEffectiveConcurrency(),
      activeCount: this.activeJobsCount,
      pendingCount: this.queue.length,
      totalProcessed: this.recentJobs.filter(j => j.status === 'completed').length,
      lastRequestTime: this.lastRequestCompletedTime,
      interRequestDelayMs: this.interRequestDelayMs,
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      jobs: this.recentJobs
    };
  }

  public subscribe(listener: (state: ThrottleState) => void): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyState() {
    const state = this.getState();
    if (isServerRuntime() && this.broadcastHook) {
      try {
        this.broadcastHook(state);
      } catch {
        // ignore
      }
    }
    this.listeners.forEach(l => {
      try {
        l(state);
      } catch {
        // ignore
      }
    });
  }

  public cancelByJobId(serverJobId: string): number {
    if (!serverJobId) return 0;
    let cancelledCount = 0;

    const callbacks = this.waitCancelsByJobId.get(serverJobId);
    if (callbacks) {
      for (const fn of Array.from(callbacks)) {
        try {
          fn();
          cancelledCount++;
        } catch {
          // ignore
        }
      }
      this.waitCancelsByJobId.delete(serverJobId);
    }

    const now = Date.now();
    for (const j of this.recentJobs) {
      if (j.jobId === serverJobId && (j.status === 'pending' || j.status === 'running' || j.status === 'retrying')) {
        j.status = 'cancelled';
        j.error = 'Đã hủy bởi người dùng';
        j.completedAt = now;
        cancelledCount++;
      }
    }

    if (cancelledCount > 0) {
      this.notifyState();
    }
    return cancelledCount;
  }

  public clearQueue(): number {
    let count = 0;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        item.cleanup?.();
        item.job.status = 'cancelled';
        item.job.error = 'Bị hủy do người dùng xóa hàng đợi';
        item.job.completedAt = Date.now();
        item.reject(createAbortError('Hàng đợi đã bị hủy thủ công'));
        count++;
      }
    }
    for (const callbacks of this.waitCancelsByJobId.values()) {
      for (const fn of Array.from(callbacks)) {
        try {
          fn();
          count++;
        } catch {
          // ignore
        }
      }
    }
    this.waitCancelsByJobId.clear();
    const now = Date.now();
    for (const j of this.recentJobs) {
      if (j.status === 'pending' || j.status === 'running' || j.status === 'retrying') {
        j.status = 'cancelled';
        j.error = 'Bị hủy do người dùng xóa hàng đợi';
        j.completedAt = now;
        count++;
      }
    }
    this.notifyState();
    return count;
  }
}

export const requestThrottleService = new RequestThrottleService();
