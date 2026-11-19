/**
 * Request Throttling & Environment-Aware Sequential Queuing Middleware
 * 
 * Automatically detects hosting environment:
 * - On Netlify (Free Tier / Strict Quotas): Enforces sequential FIFO queuing (concurrency = 1)
 *   with inter-request cooldown buffering to prevent 429 Rate Limits and browser connection drops.
 * - On Preview (Cloud Run / Localhost / High Quotas): Allows parallel processing (concurrency = 4+)
 *   for high-speed simultaneous operations.
 */

export type EnvironmentType = 'netlify' | 'preview' | 'custom';
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
  private environment: EnvironmentType = 'custom';
  private hostname: string = '';
  private isNetlify: boolean = false;
  private isPreview: boolean = false;
  private userModePref: QueueMode = 'auto';
  private interRequestDelayMs: number = 800; // Netlify pacing delay in ms
  
  private activeJobsCount: number = 0;
  private queue: Array<{
    job: QueueJob;
    task: () => Promise<any>;
    resolve: (val: any) => void;
    reject: (err: any) => void;
  }> = [];
  
  private recentJobs: QueueJob[] = [];
  private listeners: Array<(state: ThrottleState) => void> = [];
  private lastRequestCompletedTime: number = 0;
  private isProcessing: boolean = false;
  private isPaused: boolean = false;
  private pauseReason?: string;
  private pauseTimer?: any;

  constructor() {
    this.detectEnvironment();
    this.loadPreferences();
  }

  private detectEnvironment() {
    if (typeof window === 'undefined') {
      this.environment = 'custom';
      this.hostname = 'server';
      this.isPreview = false;
      this.isNetlify = false;
      return;
    }

    this.hostname = window.location.hostname || '';
    
    // Check if running on Google Cloud Run preview or localhost
    const isCloudRun = this.hostname.includes('run.app') || 
                       this.hostname.includes('googleusercontent.com') || 
                       this.hostname.includes('localhost') || 
                       this.hostname.includes('127.0.0.1');

    // Check if running on Netlify
    const isNetlifyHost = this.hostname.includes('netlify.app') || 
                          this.hostname.includes('viethoa.netlify.app');

    this.isPreview = isCloudRun;
    this.isNetlify = isNetlifyHost || (!isCloudRun && this.hostname.length > 0);

    if (this.isNetlify) {
      this.environment = 'netlify';
      this.interRequestDelayMs = 900; // Safe inter-call gap on Netlify
    } else if (this.isPreview) {
      this.environment = 'preview';
      this.interRequestDelayMs = 50; // Minimal gap in high-capacity preview
    } else {
      this.environment = 'custom';
      this.interRequestDelayMs = 500;
    }

    console.log(`[RequestThrottle] Environment detected: ${this.environment} (Hostname: ${this.hostname}) | Netlify: ${this.isNetlify} | Preview: ${this.isPreview}`);
  }

  private loadPreferences() {
    if (typeof window === 'undefined') return;
    try {
      const savedMode = localStorage.getItem(STORAGE_MODE_KEY) as QueueMode;
      if (savedMode && ['auto', 'sequential', 'parallel'].includes(savedMode)) {
        this.userModePref = savedMode;
      }
      const savedDelay = localStorage.getItem(STORAGE_DELAY_KEY);
      if (savedDelay) {
        const num = parseInt(savedDelay, 10);
        if (!isNaN(num) && num >= 0 && num <= 5000) {
          this.interRequestDelayMs = num;
        }
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  public getEffectiveConcurrency(): number {
    if (this.userModePref === 'sequential') return 1;
    if (this.userModePref === 'parallel') return 4;
    
    // Auto mode: Netlify = 1 (Strict Sequential), Preview = 4 (Parallel)
    return this.isNetlify ? 1 : 4;
  }

  public setMode(mode: QueueMode) {
    this.userModePref = mode;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_MODE_KEY, mode);
      } catch (e) {}
    }
    this.notifyState();
    this.processQueue();
  }

  public setInterRequestDelay(ms: number) {
    this.interRequestDelayMs = Math.max(0, Math.min(5000, ms));
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_DELAY_KEY, String(this.interRequestDelayMs));
      } catch (e) {}
    }
    this.notifyState();
  }

  public getPriorityWeight(priority: QueuePriority): number {
    switch (priority) {
      case 'critical': return 100;
      case 'high': return 50;
      case 'normal': return 20;
      case 'low': return 5;
      default: return 10;
    }
  }

  /**
   * Pause queue temporarily when 429 is hit to let the quota bucket cool down
   */
  public pauseForCooldown(cooldownMs: number, reason: string = "Google 429 Quota Exhausted") {
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    this.isPaused = true;
    this.pauseReason = reason;
    this.notifyState();

    console.warn(`[RequestThrottle] Queue paused for ${Math.round(cooldownMs / 1000)}s: ${reason}`);

    this.pauseTimer = setTimeout(() => {
      this.isPaused = false;
      this.pauseReason = undefined;
      console.log(`[RequestThrottle] Queue resumed after cooldown.`);
      this.notifyState();
      this.processQueue();
    }, cooldownMs);
  }

  /**
   * Enqueue a standard Promise-returning API call
   */
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

      // Sort queue by priority (descending) and then creation time (ascending)
      this.sortQueue();
      this.recordJob(job);
      this.notifyState();
      this.processQueue();
    });
  }

  /**
   * Enqueue an Async Generator (Streaming) API call
   * Ensures on Netlify that the active stream occupies the slot until the stream has finished!
   */
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

    // Wait until our turn arrives according to concurrency limit
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
      // Check inter-request delay if needed
      await this.enforceInterRequestGap();
      this.activeJobsCount++;
      return;
    }

    return new Promise((resolve) => {
      const checkAndAcquire = async () => {
        if (this.activeJobsCount < this.getEffectiveConcurrency() && !this.isPaused) {
          await this.enforceInterRequestGap();
          this.activeJobsCount++;
          resolve();
        } else {
          setTimeout(checkAndAcquire, 150);
        }
      };
      checkAndAcquire();
    });
  }

  private releaseSlot(job: QueueJob) {
    this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
    this.lastRequestCompletedTime = Date.now();
    this.notifyState();
    // Process next queued task
    setTimeout(() => this.processQueue(), 50);
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

      // Enforce inter-request gap on sequential / Netlify
      await this.enforceInterRequestGap();

      job.status = 'running';
      job.startedAt = Date.now();
      this.notifyState();

      // Execute task
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

          // If 429 rate limit is detected in the error, pause queue
          if (err?.status === 429 || String(err).includes('429') || String(err).includes('RESOURCE_EXHAUSTED')) {
            this.pauseForCooldown(25000, "Phát hiện mã lỗi 429 (Đã tạm dừng hàng đợi 25s để hồi Quota)");
          }

          reject(err);
        } finally {
          this.activeJobsCount = Math.max(0, this.activeJobsCount - 1);
          this.lastRequestCompletedTime = Date.now();
          this.notifyState();
          this.processQueue();
        }
      })();
    }

    this.isProcessing = false;
  }

  private recordJob(job: QueueJob) {
    this.recentJobs = [job, ...this.recentJobs.slice(0, 49)];
  }

  public getLatestRunningJob(): QueueJob | undefined {
    return this.recentJobs.find(j => j.status === 'running') || this.recentJobs.find(j => j.status === 'pending');
  }

  public getState(): ThrottleState {
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
    this.listeners.forEach(l => {
      try { l(state); } catch (e) {}
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
