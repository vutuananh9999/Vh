/**
 * Request Throttling & Server-Aware Sequential/Parallel Queuing Middleware
 */

import { isServerRuntime, runtimeKV, serverSyncClient } from './runtimeAdapter.ts';

export type EnvironmentType = 'netlify' | 'preview' | 'custom' | 'server';
export type QueuePriority = 'critical' | 'high' | 'normal' | 'low';
export type QueueMode = 'auto' | 'sequential' | 'parallel';

export interface QueueJob<T = any> {
  id: string;
  name: string;
  type: 'plot_chat' | 'plot_analysis' | 'chapter_summary' | 'content_gen' | 'general';
  priority: QueuePriority;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
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
  }> = [];

  private recentJobs: QueueJob[] = [];
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

  public enqueuePromise<T>(
    task: () => Promise<T>,
    options: {
      name: string;
      type?: QueueJob['type'];
      priority?: QueuePriority;
    }
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: QueueJob = {
        id: 'job_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
        name: options.name,
        type: options.type || 'general',
        priority: options.priority || 'normal',
        createdAt: Date.now(),
        status: 'pending',
        retryCount: 0
      };

      this.queue.push({
        job,
        task,
        resolve,
        reject
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
    }
  ): AsyncGenerator<T, void, unknown> {
    const job: QueueJob = {
      id: 'stream_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      name: options.name,
      type: options.type || 'plot_chat',
      priority: options.priority || 'high',
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0
    };

    this.recordJob(job);
    this.notifyState();

    await this.acquireSlot(job);

    try {
      job.status = 'running';
      job.startedAt = Date.now();
      this.notifyState();

      const stream = streamFactory();
      for await (const chunk of stream) {
        yield chunk;
      }

      job.status = 'completed';
      job.completedAt = Date.now();
    } catch (err: any) {
      job.status = 'failed';
      job.error = err?.message || String(err);
      job.completedAt = Date.now();
      throw err;
    } finally {
      this.releaseSlot(job);
    }
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      const pDiff = this.getPriorityWeight(b.job.priority) - this.getPriorityWeight(a.job.priority);
      if (pDiff !== 0) return pDiff;
      return a.job.createdAt - b.job.createdAt;
    });
  }

  private async acquireSlot(job: QueueJob): Promise<void> {
    const maxConcurrency = this.getEffectiveConcurrency();
    if (this.activeJobsCount < maxConcurrency && !this.isPaused && this.queue.length === 0) {
      await this.enforceInterRequestGap();
      this.activeJobsCount++;
      return;
    }

    return new Promise(resolve => {
      const checkAndAcquire = async () => {
        if (this.activeJobsCount < this.getEffectiveConcurrency() && !this.isPaused) {
          await this.enforceInterRequestGap();
          this.activeJobsCount++;
          resolve();
        } else {
          setTimeout(checkAndAcquire, 150);
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

  private async enforceInterRequestGap(): Promise<void> {
    const delay = this.interRequestDelayMs;
    if (delay <= 0 || this.lastRequestCompletedTime === 0) return;

    const elapsed = Date.now() - this.lastRequestCompletedTime;
    if (elapsed < delay) {
      const waitMs = delay - elapsed;
      await new Promise(r => setTimeout(r, waitMs));
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

      const { job, task, resolve, reject } = item;
      this.activeJobsCount++;

      await this.enforceInterRequestGap();

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
          job.status = 'failed';
          job.error = err?.message || String(err);
          job.completedAt = Date.now();

          if (err?.status === 429 || String(err).includes('429') || String(err).includes('RESOURCE_EXHAUSTED')) {
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

  public clearQueue() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        item.job.status = 'failed';
        item.job.error = 'Bị hủy do người dùng xóa hàng đợi';
        item.reject(new Error('Hàng đợi đã bị xóa thủ công'));
      }
    }
    this.notifyState();
  }
}

export const requestThrottleService = new RequestThrottleService();
