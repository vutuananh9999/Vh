import { redactSecrets } from './secureCredentialStorage.ts';

export interface PlotDebugLogItem {
  id: string;
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

const STORAGE_KEY = 'aetheria_plot_debug_logs';
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
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadLogs();
  }

  private loadLogs() {
    if (typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          this.logs = parsed.map((item: PlotDebugLogItem) => {
            // Reap dangling live statuses left over from a page refresh
            if ((item.status === 'pending' || item.status === 'streaming') && now - (item.lastUpdateAt || item.timestamp) > 60000) {
              return {
                ...item,
                status: 'error',
                statusCode: 'ABORTED',
                currentPhase: 'Phiên xử lý trước đã bị ngắt',
                durationMs: item.durationMs || ((item.lastUpdateAt || item.timestamp) - item.timestamp)
              };
            }
            return item;
          });
        }
      }
    } catch {
      this.logs = [];
    }
  }

  private persistNow() {
    if (typeof window === 'undefined') return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      const trimmed = this.logs.slice(0, MAX_LOGS).map(l => ({
        ...l,
        fullResponse: l.fullResponse && l.fullResponse.length > 30000
          ? l.fullResponse.slice(0, 30000) + '\n... [Đã rút gọn bản lưu sessionStorage]'
          : l.fullResponse,
        requestPayload: {
          ...l.requestPayload,
          fullSystemInstruction: l.requestPayload.fullSystemInstruction && l.requestPayload.fullSystemInstruction.length > 25000
            ? l.requestPayload.fullSystemInstruction.slice(0, 25000) + '\n... [Đã rút gọn bản lưu sessionStorage]'
            : l.requestPayload.fullSystemInstruction
        }
      }));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('Failed to persist plot debug logs:', e);
    }
  }

  private emitNow() {
    if (typeof window === 'undefined') return;
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
    const snapshot = this.getLogs();
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: snapshot }));
    } catch {
      // ignore
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
    this.persistNow();
  }

  private scheduleStreamSync() {
    if (typeof window === 'undefined') return;
    if (!this.notifyTimer) {
      this.notifyTimer = setTimeout(() => {
        this.emitNow();
      }, 75);
    }
    if (!this.persistTimer) {
      this.persistTimer = setTimeout(() => {
        this.persistNow();
      }, 1200);
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
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    this.saveLogsImmediate();
  }

  public getHostEnv() {
    if (typeof window === 'undefined') {
      return {
        hostname: 'server',
        origin: '',
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
    const isNetlify = hostname.includes('netlify.app') || (!isPreview && !hostname.includes('localhost'));
    return {
      hostname,
      origin,
      isPreview,
      isNetlify
    };
  }

  public startLog(params: {
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

    const sysChars = params.systemInstruction?.length || 0;
    const msgChars = params.message?.length || 0;
    const totalChars = sysChars + msgChars + (params.chaptersContextChars || 0);
    const estimatedTokens = Math.round(totalChars / 3.8);

    const logItem: PlotDebugLogItem = {
      id,
      timestamp: now,
      lastUpdateAt: now,
      type: params.type,
      title: params.title,
      model: params.model,
      keyMask: maskApiKey(params.apiKey),
      keyIndex: params.keyIndex,
      totalKeys: params.totalKeys,
      keySource: params.keySource,
      status: 'pending',
      currentPhase: params.currentPhase || `Đang gửi yêu cầu tới ${params.model}...`,
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

    this.logs.unshift(logItem);
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(0, MAX_LOGS);
    }
    this.saveLogsImmediate();
    return id;
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
    if (!item) return;

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
    if (!item) return;

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
    if (!item) return;

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
    const errMsg = error?.message || String(error);
    const errLower = errMsg.toLowerCase();

    let status: PlotDebugLogItem['status'] = 'error';
    let statusCode: number | string = 'ERROR';
    let advice = customAdvice || '';

    if (
      errLower.includes('timeout') ||
      errLower.includes('quá thời gian') ||
      errLower.includes('aborted') ||
      errLower.includes('abort')
    ) {
      status = 'network_error';
      statusCode = 'TIMEOUT';
      advice = `[LỖI TIMEOUT — PHẢN HỒI QUÁ THỜI GIAN CHO PHÉP]
1. Nguyên nhân: Kết nối từ trình duyệt (Safari / Netlify) tới máy chủ Google cho model "${item.model}" bị treo hoặc mất gói tin nên hệ thống đã tự ngắt sau giới hạn chờ để không làm đơ máy.
2. Lưu ý trên iPhone Safari: Nếu bạn khóa màn hình hoặc chuyển sang ứng dụng khác khi đang gọi API, iOS Safari có thể tạm đóng băng kết nối mạng của tab.
3. Giải pháp:
• Giữ màn hình sáng khi test hoặc chuyển sang model nhẹ 'gemini-3.1-flash-lite' / 'gemini-4-hydrogen'.
• Kiểm tra lại kết nối Wi-Fi / 4G hoặc tắt VPN/iCloud Private Relay nếu bị nghẽn.`;
    } else if (
      errLower.includes('503') ||
      errLower.includes('high demand') ||
      errLower.includes('unavailable') ||
      errLower.includes('overloaded')
    ) {
      status = 'error';
      statusCode = 503;
      advice = `[LỖI 503 MÁY CHỦ GOOGLE QUÁ TẢI (HIGH DEMAND)]
1. Nguyên nhân: Model "${item.model}" trên máy chủ Google đang bị quá tải đột biến do lượng truy cập toàn cầu quá lớn.
2. Giải pháp Khắc phục tức thì:
• Chuyển sang model 'gemini-4-hydrogen' hoặc 'gemini-3.1-flash-lite' trong Cài đặt ⚙️ (phản hồi siêu tốc, ổn định, ít bị nghẽn 503).
• Hoặc thử model 'gemini-3.8-flash' / 'gemini-flash-latest' trong danh sách dự phòng.`;
    } else if (errLower.includes('429') || errLower.includes('resource_exhausted') || errLower.includes('quota')) {
      status = 'rate_limit_429';
      statusCode = 429;
      advice = `[LỖI 429 GOOGLE FREE TIER QUOTA EXCEEDED]
1. Nguyên nhân: Key "${item.keyMask}" đã chạm hạn mức Tần suất (15 RPM) hoặc Dung lượng Token/phút (TPM) của Google.
2. Giải pháp:
• Chuyển sang model 'gemini-4-hydrogen' hoặc 'gemini-3.1-flash-lite' (có TPM cao hơn nhiều so với dòng Pro/Argon/Carbon).
• Thêm các Key từ tài khoản Google khác nhau (không cùng Project) vào Cài đặt ⚙️.
• Chờ 30-60s để Google tự động giải phóng hạn mức.`;
    } else if (errLower.includes('403') || errLower.includes('permission_denied')) {
      status = 'error_403';
      statusCode = 403;
      advice = `[LỖI 403 PERMISSION DENIED]
1. Key "${item.keyMask}" không có quyền truy cập model "${item.model}" hoặc tính năng Search Grounding bị khóa.
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
2. Hãy vào Cài đặt Toàn cầu ⚙️ -> Kiểm tra lại định dạng Key bắt đầu bằng AIzaSy...`;
    } else if (errLower.includes('failed to fetch') || errLower.includes('network') || errLower.includes('cors')) {
      status = 'network_error';
      statusCode = 'CORS/NET';
      advice = `[LỖI KẾT NỐI MẠNG HOẶC CORS]
1. Trình duyệt bị chặn khi gửi request từ domain ${item.hostEnv.hostname} tới Google API.
2. Kiểm tra xem trên Google Cloud Console API Key có đang cài đặt "HTTP Referrers" hạn chế domain hay không.`;
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

    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('aetheria_api_key') || '';
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          storedKeysCount = parsed.length;
          keyMasks = parsed.map((k: string) =>
            k.length > 8 ? `${k.slice(0, 6)}...${k.slice(-4)}` : 'KEY'
          );
        }
      } catch {
        if (localStorage.getItem('aetheria_api_key')) {
          storedKeysCount = 1;
        }
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        hostname: env.hostname,
        origin: env.origin,
        isNetlifyDomain: env.isNetlify,
        isPreviewContainer: env.isPreview,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
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
