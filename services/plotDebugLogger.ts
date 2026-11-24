import { redactSecrets } from './secureCredentialStorage.ts';
import { isServerRuntime, runtimeKV, serverSyncClient } from './runtimeAdapter.ts';
import { getActiveJobAbortContext, isAbortError } from './jobAbortContext.ts';
import { estimateTokens, estimateTokensFromChars } from './tokenEstimator.ts';

export interface PlotDebugLogItem {
  id: string;
  jobId?: string;
  timestamp: number;
  lastUpdateAt?: number;
  type:
    | 'plot_chat'
    | 'plot_analysis'
    | 'chapter_summary'
    | 'content_gen'
    | 'entity_scan'
    | 'audit'
    | 'key_test'
    | 'system_diagnostic';
  title: string;
  model: string;
  keyMask: string;
  keyIndex: number;
  totalKeys: number;
  keySource: 'localStorage' | 'env' | 'none';
  status:
    | 'pending'
    | 'streaming'
    | 'success'
    | 'cancelled'
    | 'rate_limit_429'
    | 'error_400'
    | 'error_403'
    | 'network_error'
    | 'error';
  statusCode?: number | string;
  currentPhase?: string;
  attemptCount?: number;
  durationMs?: number;
  chunksCount?: number;
  receivedChars?: number;
  payloadMetrics: {
    systemInstructionChars: number;
    promptChars: number;
    historyTurns: number;
    chaptersContextChars?: number;
    estimatedTokens: number;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  requestPayload: {
    systemInstructionSnippet?: string;
    fullSystemInstruction?: string;
    message: string;
    historySnippet?: string;
    config?: any;
  };
  responseSnippet?: string;
  fullResponse?: string;
  rawError?: string;
  errorStack?: string;
  diagnosticAdvice?: string;
  hostEnv: {
    hostname: string;
    origin: string;
    isPreview: boolean;
    isNetlify: boolean;
  };
}

const MAX_LOGS = 80;
const MAX_STORED_RESPONSE_CHARS = 120000;
const EVENT_NAME = 'aetheria_plot_debug_update';

function maskApiKey(apiKey?: string): string {
  const cleanKey = apiKey ? apiKey.trim() : '';
  if (cleanKey.length > 8) {
    return `${cleanKey.slice(0, 6)}...${cleanKey.slice(-4)}`;
  }
  return cleanKey ? 'KEY_HIDDEN' : 'CHƯA CÓ KEY';
}

class PlotDebugLoggerService {
  private logs: PlotDebugLogItem[] = [];
  private listeners: Array<(logs: PlotDebugLogItem[]) => void> = [];
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private broadcastHook: ((logs: PlotDebugLogItem[]) => void) | null = null;
  private cancelledJobIds = new Set<string>();
  private cancelledLogIds = new Set<string>();

  public setBroadcastHook(hook: (logs: PlotDebugLogItem[]) => void): void {
    this.broadcastHook = hook;
  }

  public hydrateFromServer(serverLogs: PlotDebugLogItem[]): void {
    if (!Array.isArray(serverLogs)) return;
    this.logs = serverLogs.slice(0, MAX_LOGS);
    this.emitNow();
  }

  private rememberCancelledJob(jobId: string) {
    this.cancelledJobIds.add(jobId);
    if (this.cancelledJobIds.size > 200) {
      const first = this.cancelledJobIds.values().next().value;
      if (first) this.cancelledJobIds.delete(first);
    }
  }

  private rememberCancelledLog(logId: string) {
    this.cancelledLogIds.add(logId);
    if (this.cancelledLogIds.size > 300) {
      const first = this.cancelledLogIds.values().next().value;
      if (first) this.cancelledLogIds.delete(first);
    }
  }

  private isItemCancelled(item: PlotDebugLogItem): boolean {
    if (item.status === 'cancelled') return true;
    if (this.cancelledLogIds.has(item.id)) return true;
    if (item.jobId && this.cancelledJobIds.has(item.jobId)) return true;
    return false;
  }

  private emitNow() {
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    const snapshot = this.getLogs();

    if (isServerRuntime() && this.broadcastHook) {
      try {
        this.broadcastHook(snapshot);
      } catch {
        // ignore broadcast errors
      }
    }

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: snapshot }));
      } catch {
        // ignore
      }
    }

    this.listeners.forEach(l => {
      try {
        l(snapshot);
      } catch {
        // ignore listener errors
      }
    });
  }

  private saveLogsImmediate() {
    this.emitNow();
  }

  private scheduleStreamSync() {
    if (!this.notifyTimer) {
      this.notifyTimer = setTimeout(() => {
        this.emitNow();
      }, 100);
    }
  }

  public subscribe(listener: (logs: PlotDebugLogItem[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.getLogs());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public getLogs(): PlotDebugLogItem[] {
    return this.logs.map(item => ({ ...item }));
  }

  public clearLogs() {
    this.logs = [];
    this.saveLogsImmediate();
    if (typeof window !== 'undefined' && !isServerRuntime()) {
      void serverSyncClient.clearDebugLogs().catch(() => {});
    }
  }

  public getHostEnv() {
    if (isServerRuntime() || typeof window === 'undefined') {
      return {
        hostname: 'steamdeck-server',
        origin: process.env.TAILSCALE_HOST || 'http://localhost:3000',
        isPreview: false,
        isNetlify: false
      };
    }
    const hostname = window.location.hostname;
    const origin = window.location.origin;
    const isPreview =
      hostname.includes('run.app') ||
      hostname.includes('googleusercontent.com') ||
      hostname.includes('localhost') ||
      hostname.includes('127.0.0.1');
    const isNetlify = hostname.includes('netlify.app');
    return {
      hostname,
      origin,
      isPreview,
      isNetlify
    };
  }

  public startLog(params: {
    jobId?: string;
    type: PlotDebugLogItem['type'];
    title: string;
    model: string;
    apiKey: string;
    keyIndex: number;
    totalKeys: number;
    keySource: 'localStorage' | 'env' | 'none';
    systemInstruction?: string;
    message: string;
    historyTurns?: number;
    chaptersContextChars?: number;
    config?: any;
    currentPhase?: string;
  }): string {
    const id = 'plot_log_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
    const now = Date.now();
    const activeCtx = getActiveJobAbortContext();
    const resolvedJobId = params.jobId || activeCtx.jobId;
    const preAborted =
      Boolean(resolvedJobId && this.cancelledJobIds.has(resolvedJobId)) ||
      Boolean(activeCtx.signal?.aborted);

    const sysChars = params.systemInstruction?.length || 0;
    const msgChars = params.message?.length || 0;
    const totalChars = sysChars + msgChars + (params.chaptersContextChars || 0);
    const estimatedTokens =
      estimateTokens(params.systemInstruction) +
      estimateTokens(params.message) +
      estimateTokensFromChars(params.chaptersContextChars || 0, true);

    const logItem: PlotDebugLogItem = {
      id,
      jobId: resolvedJobId,
      timestamp: now,
      lastUpdateAt: now,
      type: params.type,
      title: params.title,
      model: params.model,
      keyMask: maskApiKey(params.apiKey),
      keyIndex: params.keyIndex,
      totalKeys: params.totalKeys,
      keySource: params.keySource,
      status: preAborted ? 'cancelled' : 'pending',
      ...(preAborted ? { statusCode: 'HỦY', durationMs: 1 } : {}),
      currentPhase: preAborted
        ? 'Đã hủy bởi người dùng'
        : params.currentPhase || `Đang gửi yêu cầu tới ${params.model}...`,
      attemptCount: 1,
      chunksCount: 0,
      receivedChars: 0,
      payloadMetrics: {
        systemInstructionChars: sysChars,
        promptChars: msgChars,
        historyTurns: params.historyTurns || 0,
        chaptersContextChars: params.chaptersContextChars,
        estimatedTokens
      },
      requestPayload: {
        systemInstructionSnippet: params.systemInstruction
          ? params.systemInstruction.substring(0, 300) + (params.systemInstruction.length > 300 ? '...' : '')
          : undefined,
        fullSystemInstruction: params.systemInstruction,
        message: params.message,
        historySnippet: params.historyTurns ? `${params.historyTurns} tin nhắn trước` : undefined,
        config: params.config
      },
      hostEnv: this.getHostEnv()
    };

    if (preAborted) {
      this.rememberCancelledLog(id);
    }

    this.logs.unshift(logItem);
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(0, MAX_LOGS);
    }
    this.saveLogsImmediate();
    return id;
  }

  public cancelByJobId(jobId: string, reason: string = 'Đã hủy bởi người dùng'): number {
    if (!jobId) return 0;
    this.rememberCancelledJob(jobId);
    const now = Date.now();
    let count = 0;
    for (const item of this.logs) {
      if (item.jobId !== jobId) continue;
      if (item.status === 'pending' || item.status === 'streaming' || item.status === 'rate_limit_429') {
        item.status = 'cancelled';
        item.statusCode = 'HỦY';
        item.currentPhase = reason;
        item.lastUpdateAt = now;
        item.durationMs = Math.max(1, now - item.timestamp);
        item.diagnosticAdvice = undefined;
        item.rawError = undefined;
        item.errorStack = undefined;
        this.rememberCancelledLog(item.id);
        count++;
      }
    }
    if (count > 0) {
      this.saveLogsImmediate();
    }
    return count;
  }

  public cancelLog(id: string, reason: string = 'Đã hủy bởi người dùng'): boolean {
    if (!id) return false;
    this.rememberCancelledLog(id);
    const item = this.logs.find(l => l.id === id);
    if (!item) return false;
    if (item.status !== 'pending' && item.status !== 'streaming' && item.status !== 'rate_limit_429') {
      return false;
    }
    const now = Date.now();
    item.status = 'cancelled';
    item.statusCode = 'HỦY';
    item.currentPhase = reason;
    item.lastUpdateAt = now;
    item.durationMs = Math.max(1, now - item.timestamp);
    item.diagnosticAdvice = undefined;
    item.rawError = undefined;
    item.errorStack = undefined;
    this.saveLogsImmediate();
    return true;
  }

  public updateAttempt(
    id: string,
    params: {
      model?: string;
      apiKey?: string;
      keyIndex?: number;
      totalKeys?: number;
      status?: PlotDebugLogItem['status'];
      phase?: string;
      attemptCount?: number;
      title?: string;
    }
  ) {
    const item = this.logs.find(l => l.id === id);
    if (!item || this.isItemCancelled(item)) return;

    if (params.model) item.model = params.model;
    if (params.apiKey !== undefined) item.keyMask = maskApiKey(params.apiKey);
    if (params.keyIndex !== undefined) item.keyIndex = params.keyIndex;
    if (params.totalKeys !== undefined) item.totalKeys = params.totalKeys;
    if (params.status) item.status = params.status;
    if (params.phase) item.currentPhase = redactSecrets(params.phase);
    if (params.attemptCount !== undefined) item.attemptCount = params.attemptCount;
    if (params.title) item.title = params.title;
    item.lastUpdateAt = Date.now();
    this.emitNow();
  }

  public updateStreaming(id: string, chunkSnippet: string) {
    const item = this.logs.find(l => l.id === id);
    if (!item || this.isItemCancelled(item)) return;

    item.status = 'streaming';
    item.chunksCount = (item.chunksCount || 0) + 1;
    item.receivedChars = (item.receivedChars || 0) + chunkSnippet.length;
    item.lastUpdateAt = Date.now();
    item.currentPhase = `Đang nhận Stream • ${item.chunksCount} chunks • ${item.receivedChars.toLocaleString()} ký tự`;

    const existingFull = item.fullResponse || '';
    if (existingFull.length < MAX_STORED_RESPONSE_CHARS) {
      item.fullResponse = existingFull + chunkSnippet;
    }

    const combinedSnippet = (item.responseSnippet || '') + chunkSnippet;
    item.responseSnippet =
      combinedSnippet.length > 500 ? combinedSnippet.slice(-500) : combinedSnippet;

    this.scheduleStreamSync();
  }

  public completeSuccess(
    id: string,
    params: {
      fullResponse?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
      durationMs?: number;
    }
  ) {
    const item = this.logs.find(l => l.id === id);
    if (!item || this.isItemCancelled(item)) return;

    const now = Date.now();
    const resolvedFull =
      params.fullResponse !== undefined && params.fullResponse !== ''
        ? params.fullResponse
        : item.fullResponse || '';

    item.status = 'success';
    item.statusCode = 200;
    item.lastUpdateAt = now;
    item.fullResponse = resolvedFull;
    item.receivedChars = resolvedFull.length;
    item.currentPhase = `Hoàn tất (200 OK${resolvedFull ? ` • ${resolvedFull.length.toLocaleString()} ký tự` : ''})`;
    item.responseSnippet = resolvedFull
      ? resolvedFull.substring(0, 350) + (resolvedFull.length > 350 ? '...' : '')
      : item.responseSnippet;
    item.usageMetadata = params.usageMetadata;
    item.durationMs = Math.max(1, params.durationMs ?? (now - item.timestamp));
    this.saveLogsImmediate();
  }

  public recordFailure(id: string, error: any, customAdvice?: string, durationMsOverride?: number) {
    const item = this.logs.find(l => l.id === id);
    if (!item) return;

    const now = Date.now();
    const activeCtx = getActiveJobAbortContext();
    const isCancelled =
      this.isItemCancelled(item) ||
      isAbortError(error) ||
      Boolean(activeCtx.signal?.aborted && (!item.jobId || item.jobId === activeCtx.jobId));

    if (isCancelled) {
      item.status = 'cancelled';
      item.statusCode = 'HỦY';
      item.lastUpdateAt = now;
      item.currentPhase = 'Đã hủy bởi người dùng';
      item.diagnosticAdvice = undefined;
      item.rawError = undefined;
      item.errorStack = undefined;
      item.durationMs = Math.max(1, durationMsOverride ?? (now - item.timestamp));
      this.rememberCancelledLog(item.id);
      this.saveLogsImmediate();
      return;
    }

    const errMsg = error?.message || String(error);
    const errLower = errMsg.toLowerCase();

    let status: PlotDebugLogItem['status'] = 'error';
    let statusCode: number | string = 'ERROR';
    let advice = customAdvice || '';

    if (
      errLower.includes('timeout') ||
      errLower.includes('quá thời gian')
    ) {
      status = 'network_error';
      statusCode = 'TIMEOUT';
      advice = `[LỖI TIMEOUT — PHẢN HỒI QUÁ THỜI GIAN CHO PHÉP]
1. Nguyên nhân: Kết nối từ máy chủ tới API cho model "${item.model}" bị treo hoặc quá thời gian chờ.
2. Giải pháp:
• Kiểm tra lại mạng Internet trên máy chủ Steam Deck hoặc chuyển sang model phản hồi nhanh ('gemini-4-hydrogen' / 'gemini-3.1-flash-lite').`;
    } else if (
      errLower.includes('503') ||
      errLower.includes('high demand') ||
      errLower.includes('unavailable') ||
      errLower.includes('overloaded')
    ) {
      status = 'error';
      statusCode = 503;
      advice = `[LỖI 503 MÁY CHỦ AI QUÁ TẢI (HIGH DEMAND)]
1. Nguyên nhân: Model "${item.model}" đang bị quá tải tạm thời.
2. Giải pháp Khắc phục tức thì:
• Chuyển sang model 'gemini-4-hydrogen' hoặc 'gemini-3.1-flash-lite' trong Cài đặt ⚙️.`;
    } else if (errLower.includes('429') || errLower.includes('resource_exhausted') || errLower.includes('quota')) {
      status = 'rate_limit_429';
      statusCode = 429;
      advice = `[LỖI 429 QUOTA EXCEEDED]
1. Nguyên nhân: Key "${item.keyMask}" đã chạm hạn mức Tần suất (RPM) hoặc Token/phút (TPM).
2. Giải pháp:
• Thêm các Key từ tài khoản khác nhau vào Cài đặt ⚙️ để hệ thống tự xoay vòng.
• Chờ 30-60s để hạn mức tự giải phóng.`;
    } else if (errLower.includes('403') || errLower.includes('permission_denied')) {
      status = 'error_403';
      statusCode = 403;
      advice = `[LỖI 403 PERMISSION DENIED]
1. Key "${item.keyMask}" không có quyền truy cập model "${item.model}".
2. Kiểm tra lại Google Cloud Console -> APIs & Services xem Generative Language API đã được Bật (Enabled) hay chưa.`;
    } else if (
      errLower.includes('400') ||
      errLower.includes('invalid_argument') ||
      errLower.includes('api key not valid')
    ) {
      status = 'error_400';
      statusCode = 400;
      advice = `[LỖI 400 INVALID API KEY / PARAMETERS]
1. Chuỗi API Key bị sai hoặc tham số model không tương thích.
2. Hãy vào Cài đặt Toàn cầu ⚙️ -> Kiểm tra lại API Key hoặc Model.`;
    } else if (errLower.includes('failed to fetch') || errLower.includes('network') || errLower.includes('cors')) {
      status = 'network_error';
      statusCode = 'NET';
      advice = `[LỖI KẾT NỐI MẠNG]
1. Máy chủ không thể kết nối tới API endpoint.`;
    }

    item.status = status;
    item.statusCode = statusCode;
    item.lastUpdateAt = now;
    item.currentPhase = `Thất bại (${statusCode})`;
    item.rawError = redactSecrets(errMsg);
    item.errorStack = redactSecrets(error?.stack || String(error));
    item.diagnosticAdvice = redactSecrets(advice);
    item.durationMs = Math.max(1, durationMsOverride ?? (now - item.timestamp));
    this.saveLogsImmediate();
  }

  public exportDiagnosticsReport(): string {
    const env = this.getHostEnv();
    let storedKeysCount = 0;
    let keyMasks: string[] = [];

    try {
      const stored = runtimeKV.getItem('aetheria_api_key') || '';
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          storedKeysCount = parsed.length;
          keyMasks = parsed.map((k: string) =>
            k.length > 8 ? `${k.slice(0, 6)}...${k.slice(-4)}` : 'KEY'
          );
        }
      }
    } catch {
      if (runtimeKV.getItem('aetheria_api_key')) {
        storedKeysCount = 1;
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        hostname: env.hostname,
        origin: env.origin,
        isServerExecution: isServerRuntime(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js Server'
      },
      apiKeyStatus: {
        totalKeysConfigured: storedKeysCount,
        keysMasked: keyMasks
      },
      recentLogs: this.logs.slice(0, 15).map(l => ({
        timestamp: new Date(l.timestamp).toLocaleTimeString(),
        type: l.type,
        title: l.title,
        model: l.model,
        status: l.status,
        statusCode: l.statusCode,
        currentPhase: l.currentPhase,
        keyMask: l.keyMask,
        durationMs: l.durationMs,
        chunksCount: l.chunksCount,
        receivedChars: l.receivedChars,
        payloadMetrics: l.payloadMetrics,
        error: l.rawError,
        advice: l.diagnosticAdvice
      }))
    };

    return JSON.stringify(report, null, 2);
  }
}

export const plotDebugLogger = new PlotDebugLoggerService();
