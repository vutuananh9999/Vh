export interface PlotDebugLogItem {
  id: string;
  timestamp: number;
  type: 'plot_chat' | 'plot_analysis' | 'chapter_summary' | 'content_gen' | 'key_test' | 'system_diagnostic';
  title: string;
  model: string;
  keyMask: string;
  keyIndex: number;
  totalKeys: number;
  keySource: 'localStorage' | 'env' | 'none';
  status: 'pending' | 'streaming' | 'success' | 'rate_limit_429' | 'error_400' | 'error_403' | 'network_error' | 'error';
  statusCode?: number | string;
  durationMs?: number;
  chunksCount?: number;
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
const MAX_LOGS = 60;
const EVENT_NAME = 'aetheria_plot_debug_update';

class PlotDebugLoggerService {
  private logs: PlotDebugLogItem[] = [];
  private listeners: Array<(logs: PlotDebugLogItem[]) => void> = [];

  constructor() {
    this.loadLogs();
  }

  private loadLogs() {
    if (typeof window === 'undefined') return;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      this.logs = [];
    }
  }

  private saveLogs() {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs.slice(0, MAX_LOGS)));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: this.logs }));
      this.notifyListeners();
    } catch (e) {
      console.warn("Failed to persist plot debug logs:", e);
    }
  }

  public subscribe(listener: (logs: PlotDebugLogItem[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.getLogs());
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    const current = this.getLogs();
    this.listeners.forEach(l => {
      try { l(current); } catch (e) {}
    });
  }

  public getLogs(): PlotDebugLogItem[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    this.saveLogs();
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
    const isPreview = hostname.includes('run.app') || hostname.includes('googleusercontent.com') || hostname.includes('localhost');
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
  }): string {
    const id = 'plot_log_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
    const cleanKey = params.apiKey ? params.apiKey.trim() : '';
    const keyMask = cleanKey.length > 8 
      ? `${cleanKey.slice(0, 6)}...${cleanKey.slice(-4)}` 
      : (cleanKey ? 'KEY_HIDDEN' : 'CHƯA CÓ KEY');

    const sysChars = params.systemInstruction?.length || 0;
    const msgChars = params.message?.length || 0;
    const totalChars = sysChars + msgChars + (params.chaptersContextChars || 0);
    const estimatedTokens = Math.round(totalChars / 3.8);

    const logItem: PlotDebugLogItem = {
      id,
      timestamp: Date.now(),
      type: params.type,
      title: params.title,
      model: params.model,
      keyMask,
      keyIndex: params.keyIndex,
      totalKeys: params.totalKeys,
      keySource: params.keySource,
      status: 'pending',
      payloadMetrics: {
        systemInstructionChars: sysChars,
        promptChars: msgChars,
        historyTurns: params.historyTurns || 0,
        chaptersContextChars: params.chaptersContextChars,
        estimatedTokens
      },
      requestPayload: {
        systemInstructionSnippet: params.systemInstruction ? params.systemInstruction.substring(0, 300) + '...' : undefined,
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
    this.saveLogs();
    return id;
  }

  public updateStreaming(id: string, chunkSnippet: string) {
    const item = this.logs.find(l => l.id === id);
    if (!item) return;

    item.status = 'streaming';
    item.chunksCount = (item.chunksCount || 0) + 1;
    item.responseSnippet = (item.responseSnippet || '') + chunkSnippet;
    if (item.responseSnippet.length > 500) {
      item.responseSnippet = item.responseSnippet.substring(0, 500) + '...';
    }
    this.saveLogs();
  }

  public completeSuccess(id: string, params: {
    fullResponse?: string;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
    durationMs?: number;
  }) {
    const item = this.logs.find(l => l.id === id);
    if (!item) return;

    item.status = 'success';
    item.statusCode = 200;
    item.fullResponse = params.fullResponse;
    item.responseSnippet = params.fullResponse 
      ? params.fullResponse.substring(0, 350) + (params.fullResponse.length > 350 ? '...' : '')
      : item.responseSnippet;
    item.usageMetadata = params.usageMetadata;
    item.durationMs = params.durationMs || (Date.now() - item.timestamp);
    this.saveLogs();
  }

  public recordFailure(id: string, error: any, customAdvice?: string) {
    const item = this.logs.find(l => l.id === id);
    if (!item) return;

    const errMsg = error?.message || String(error);
    const errLower = errMsg.toLowerCase();
    
    let status: PlotDebugLogItem['status'] = 'error';
    let statusCode: number | string = 'ERROR';
    let advice = customAdvice || '';

    if (errLower.includes('429') || errLower.includes('resource_exhausted') || errLower.includes('quota')) {
      status = 'rate_limit_429';
      statusCode = 429;
      advice = `[LỖI 429 GOOGLE FREE TIER QUOTA EXCEEDED]
1. Nguyên nhân: Key "${item.keyMask}" đã chạm hạn mức Tần suất (15 RPM) hoặc Dung lượng Token/phút (TPM) của Google.
2. Tại sao Preview không bị?: Preview chạy trên container AI Studio nội bộ có quota chuyên biệt. Khi deploy lên Netlify, request gọi trực tiếp từ trình duyệt qua Key cá nhân nên tuân thủ nghiêm ngặt Free Quota của Google.
3. Giải pháp:
• Chuyển sang model 'gemini-2.5-flash' hoặc 'gemini-2.0-flash' (có TPM cao hơn nhiều so với 3.7/Pro).
• Thêm các Key từ tài khoản Google khác nhau (không cùng Project) vào Cài đặt ⚙️.
• Chờ 30-60s để Google tự động giải phóng hạn mức.`;
    } else if (errLower.includes('403') || errLower.includes('permission_denied')) {
      status = 'error_403';
      statusCode = 403;
      advice = `[LỖI 403 PERMISSION DENIED]
1. Key "${item.keyMask}" không có quyền truy cập model "${item.model}" hoặc tính năng Search Grounding bị khóa.
2. Kiểm tra lại Google Cloud Console -> APIs & Services xem Generative Language API đã được Bật (Enabled) hay chưa.`;
    } else if (errLower.includes('400') || errLower.includes('invalid_argument') || errLower.includes('api key not valid')) {
      status = 'error_400';
      statusCode = 400;
      advice = `[LỖI 400 INVALID API KEY / PARAMETERS]
1. Chuỗi API Key bị sai hoặc chứa ký tự đặc biệt thừa.
2. Hãy vào Cài đặt Toàn cầu ⚙️ -> Kiểm tra lại định dạng Key bắt đầu bằng AIzaSy...`;
    } else if (errLower.includes('failed to fetch') || errLower.includes('network') || errLower.includes('cors')) {
      status = 'network_error';
      statusCode = 'CORS/NET';
      advice = `[LỖI KẾT NỐI MẠNG HOẶC CORS TRÊN NETLIFY]
1. Trình duyệt bị chặn khi gửi request từ domain ${item.hostEnv.hostname} tới Google API.
2. Kiểm tra xem trên Google Cloud Console API Key có đang cài đặt "HTTP Referrers" hạn chế domain hay không.`;
    }

    item.status = status;
    item.statusCode = statusCode;
    item.rawError = errMsg;
    item.errorStack = error?.stack || String(error);
    item.diagnosticAdvice = advice;
    item.durationMs = Date.now() - item.timestamp;
    this.saveLogs();
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
          keyMasks = parsed.map((k: string) => k.length > 8 ? `${k.slice(0, 6)}...${k.slice(-4)}` : 'KEY');
        }
      } catch (e) {
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
      recentLogs: this.logs.slice(0, 10).map(l => ({
        timestamp: new Date(l.timestamp).toLocaleTimeString(),
        type: l.type,
        model: l.model,
        status: l.status,
        statusCode: l.statusCode,
        keyMask: l.keyMask,
        durationMs: l.durationMs,
        payloadMetrics: l.payloadMetrics,
        error: l.rawError,
        advice: l.diagnosticAdvice
      }))
    };

    return JSON.stringify(report, null, 2);
  }
}

export const plotDebugLogger = new PlotDebugLoggerService();
