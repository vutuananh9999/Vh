import { isServerRuntime, isStandaloneMode, runtimeKV } from './runtimeAdapter.ts';

export interface RequestLogItem {
  id: string;
  timestamp: number;
  modelType: 'pro' | 'flash';
  modelId: string;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  status: 'pending' | 'success' | 'failure';
  apiKey?: string;
}

export interface ModelLimitStatus {
  modelType: 'pro' | 'flash';
  modelId: string;
  rpmLimit: number;
  rpmUsed: number;
  tpmLimit: number;
  tpmUsed: number;
  rpdLimit: number;
  rpdUsed: number;
  isLimited: boolean;
  limitReason: 'rpm' | 'tpm' | 'rpd' | null;
  cooldownSeconds: number;
  estimatedRemainingRequests: number;
  workTimeRemaining: string;
}

const STORAGE_KEY = 'aetheria_api_usage';
const UPDATE_EVENT = 'aetheria_token_update';

const LIMITS = {
  pro: {
    rpm: 2,
    tpm: 32000,
    rpd: 50
  },
  flash: {
    rpm: 15,
    tpm: 1000000,
    rpd: 1500
  }
};

class TokenTrackerService {
  private log: RequestLogItem[] = [];
  private broadcastHook: ((logs: RequestLogItem[]) => void) | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    this.loadLog();
  }

  public setBroadcastHook(hook: (logs: RequestLogItem[]) => void): void {
    this.broadcastHook = hook;
  }

  public reloadFromStorage(): void {
    this.loadLog();
    this.emitUpdate();
  }

  public getLogs(): RequestLogItem[] {
    this.cleanOldEntries();
    return [...this.log];
  }

  public hydrateFromServer(logs: RequestLogItem[]): void {
    if (!Array.isArray(logs)) return;
    this.log = logs;
    this.cleanOldEntries();
    this.emitUpdate();
  }

  private loadLog() {
    try {
      const stored = runtimeKV.getItem(STORAGE_KEY);
      if (stored) {
        this.log = JSON.parse(stored);
        this.cleanOldEntries();
      }
    } catch {
      this.log = [];
    }
  }

  private emitUpdate() {
    if (isServerRuntime() && this.broadcastHook) {
      try {
        this.broadcastHook([...this.log]);
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
    }
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {
        // ignore
      }
    }
  }

  private saveLog() {
    try {
      this.cleanOldEntries();
      if (isServerRuntime() || isStandaloneMode()) {
        runtimeKV.setItem(STORAGE_KEY, JSON.stringify(this.log));
      }
      this.emitUpdate();
    } catch (e) {
      console.error('Failed to save token usage log:', e);
    }
  }

  private cleanOldEntries() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.log = this.log.filter(item => item.timestamp >= oneDayAgo);
  }

  private getModelType(modelId: string): 'pro' | 'flash' {
    const id = modelId.toLowerCase();
    if (id.includes('pro') || id.includes('argon') || id.includes('carbon')) {
      return 'pro';
    }
    return 'flash';
  }

  public recordRequestStart(modelId: string, estimatedTokens = 1000, apiKey?: string): string {
    const modelType = this.getModelType(modelId);
    const requestId = Math.random().toString(36).substring(2, 11);

    const newItem: RequestLogItem = {
      id: requestId,
      timestamp: Date.now(),
      modelType,
      modelId,
      promptTokens: estimatedTokens,
      candidatesTokens: 0,
      totalTokens: estimatedTokens,
      status: 'pending',
      apiKey
    };

    this.log.push(newItem);
    this.saveLog();
    return requestId;
  }

  public recordRequestSuccess(
    requestId: string,
    promptTokens: number,
    candidatesTokens: number,
    totalTokens: number
  ) {
    const item = this.log.find(i => i.id === requestId);
    if (item) {
      item.status = 'success';
      item.promptTokens = promptTokens;
      item.candidatesTokens = candidatesTokens;
      item.totalTokens = totalTokens || promptTokens + candidatesTokens;
      this.saveLog();
    }
  }

  public recordRequestFailure(requestId: string) {
    const item = this.log.find(i => i.id === requestId);
    if (item) {
      item.status = 'failure';
      item.totalTokens = 0;
      this.saveLog();
    }
  }

  public getModelStatus(modelId: string): ModelLimitStatus {
    const modelType = this.getModelType(modelId);
    const limits = LIMITS[modelType];
    const now = Date.now();

    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const minuteLogs = this.log.filter(item => item.modelType === modelType && item.timestamp >= oneMinuteAgo);
    const dayLogs = this.log.filter(item => item.modelType === modelType && item.timestamp >= oneDayAgo);

    const rpmUsed = minuteLogs.length;
    const tpmUsed = minuteLogs.reduce((sum, item) => sum + item.totalTokens, 0);
    const rpdUsed = dayLogs.length;

    let isLimited = false;
    let limitReason: 'rpm' | 'tpm' | 'rpd' | null = null;
    let cooldownSeconds = 0;
    let workTimeRemaining = 'Sẵn sàng';

    if (rpdUsed >= limits.rpd) {
      isLimited = true;
      limitReason = 'rpd';
      const oldestDayLog = [...dayLogs].sort((a, b) => a.timestamp - b.timestamp)[0];
      const resetMs = (oldestDayLog ? oldestDayLog.timestamp : now) + 24 * 60 * 60 * 1000 - now;
      cooldownSeconds = Math.max(0, Math.ceil(resetMs / 1000));

      const hours = Math.floor(cooldownSeconds / 3600);
      const minutes = Math.floor((cooldownSeconds % 3600) / 60);
      workTimeRemaining = `Hết lượt ngày (Chờ ${hours}g ${minutes}p)`;
    } else if (rpmUsed >= limits.rpm) {
      isLimited = true;
      limitReason = 'rpm';

      const sortedMinute = [...minuteLogs].sort((a, b) => a.timestamp - b.timestamp);
      const oldestRequest = sortedMinute[0];
      const resetMs = (oldestRequest ? oldestRequest.timestamp : now) + 60 * 1000 - now;
      cooldownSeconds = Math.max(0, Math.ceil(resetMs / 1000));
      workTimeRemaining = `Hồi chiêu RPM (${cooldownSeconds}s)`;
    } else if (tpmUsed >= limits.tpm) {
      isLimited = true;
      limitReason = 'tpm';

      const sortedMinute = [...minuteLogs].sort((a, b) => a.timestamp - b.timestamp);
      let currentTpm = tpmUsed;
      let targetTime = now;
      for (const item of sortedMinute) {
        currentTpm -= item.totalTokens;
        if (currentTpm < limits.tpm) {
          targetTime = item.timestamp + 60 * 1000;
          break;
        }
      }
      const resetMs = targetTime - now;
      cooldownSeconds = Math.max(0, Math.ceil(resetMs / 1000));
      workTimeRemaining = `Đầy Token (${cooldownSeconds}s)`;
    }

    const estimatedRemainingRequests = Math.max(0, limits.rpd - rpdUsed);

    return {
      modelType,
      modelId,
      rpmLimit: limits.rpm,
      rpmUsed,
      tpmLimit: limits.tpm,
      tpmUsed,
      rpdLimit: limits.rpd,
      rpdUsed,
      isLimited,
      limitReason,
      cooldownSeconds,
      estimatedRemainingRequests,
      workTimeRemaining
    };
  }

  public getKeyStats(key: string) {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const cleanK = key.trim();
    if (!cleanK) {
      return {
        rpmUsed: 0,
        tpmUsed: 0,
        rpdUsed: 0,
        totalTokensUsed: 0,
        successCount: 0,
        failureCount: 0
      };
    }

    const keyLogs = this.log.filter(item => item.apiKey && item.apiKey.trim() === cleanK);
    const minuteLogs = keyLogs.filter(item => item.timestamp >= oneMinuteAgo);
    const dayLogs = keyLogs.filter(item => item.timestamp >= oneDayAgo);

    const rpmUsed = minuteLogs.length;
    const tpmUsed = minuteLogs.reduce((sum, item) => sum + item.totalTokens, 0);
    const rpdUsed = dayLogs.length;
    const totalTokensUsed = keyLogs.reduce((sum, item) => sum + item.totalTokens, 0);
    const successCount = keyLogs.filter(item => item.status === 'success').length;
    const failureCount = keyLogs.filter(item => item.status === 'failure').length;

    return {
      rpmUsed,
      tpmUsed,
      rpdUsed,
      totalTokensUsed,
      successCount,
      failureCount
    };
  }

  public subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    if (typeof window !== 'undefined') {
      window.addEventListener(UPDATE_EVENT, callback);
    }
    return () => {
      this.listeners.delete(callback);
      if (typeof window !== 'undefined') {
        window.removeEventListener(UPDATE_EVENT, callback);
      }
    };
  }
}

export const tokenTracker = new TokenTrackerService();
