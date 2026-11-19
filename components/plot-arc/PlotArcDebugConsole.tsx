import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { plotDebugLogger, PlotDebugLogItem } from '../../services/plotDebugLogger.ts';
import { geminiService } from '../../services/geminiService.ts';
import { requestThrottleService, ThrottleState, QueueMode } from '../../services/requestThrottleService.ts';

interface Props {
  onSwitchToChat?: () => void;
}

const LOG_TYPE_LABELS: Record<PlotDebugLogItem['type'], string> = {
  plot_chat: 'Co-Edit Chat',
  plot_analysis: 'Phân tích Mạch',
  entity_scan: 'Quét Nhân vật',
  audit: 'Kiểm toán',
  chapter_summary: 'Tóm tắt chương',
  content_gen: 'Sáng tác / Sửa',
  key_test: 'Kiểm tra Key',
  system_diagnostic: 'Hệ thống',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStatusPresentation(log: PlotDebugLogItem): {
  codeText: string;
  textClass: string;
  rowHighlight: string;
} {
  if (log.status === 'streaming') {
    return {
      codeText: 'LIVE',
      textClass: 'text-sky-400',
      rowHighlight: 'bg-sky-500/[0.06]',
    };
  }
  if (log.status === 'pending') {
    return {
      codeText: 'ĐANG CHẠY',
      textClass: 'text-amber-400',
      rowHighlight: 'bg-amber-500/[0.04]',
    };
  }
  if (log.status === 'success') {
    return {
      codeText: String(log.statusCode || 200),
      textClass: 'text-emerald-400',
      rowHighlight: '',
    };
  }
  if (log.status === 'rate_limit_429' || log.statusCode === 429) {
    return {
      codeText: '429',
      textClass: 'text-rose-400',
      rowHighlight: 'bg-rose-500/[0.05]',
    };
  }
  return {
    codeText: String(log.statusCode || 'LỖI'),
    textClass: 'text-rose-400',
    rowHighlight: 'bg-rose-500/[0.04]',
  };
}

export const PlotArcDebugConsole: React.FC<Props> = ({ onSwitchToChat }) => {
  const [logs, setLogs] = useState<PlotDebugLogItem[]>(() => plotDebugLogger.getLogs());
  const [selectedLog, setSelectedLog] = useState<PlotDebugLogItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'live' | 'scan_audit' | '429' | 'errors' | 'chat' | 'analysis'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [isTestingKeys, setIsTestingKeys] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; statusText: string; latency?: number }>>({});
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'response' | 'message' | 'system' | 'error'>('overview');
  const [throttleState, setThrottleState] = useState<ThrottleState>(() => requestThrottleService.getState());
  const [autoFollowLive, setAutoFollowLive] = useState(true);
  const [selectedModel, setSelectedModel] = useState(() =>
    geminiService.getFlash ? geminiService.getFlash() : 'gemini-4-hydrogen'
  );
  const [nowTime, setNowTime] = useState<number>(() => Date.now());

  const selectedLogIdRef = useRef<string | null>(null);
  const lastAutoSelectedIdRef = useRef<string | null>(null);
  const autoFollowRef = useRef<boolean>(true);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const inspectorScrollRef = useRef<HTMLDivElement>(null);
  const responseBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedLogIdRef.current = selectedLog?.id || null;
    if (selectedLog && !selectedLog.rawError && inspectorTab === 'error') {
      setInspectorTab('overview');
    }
  }, [selectedLog, inspectorTab]);

  useEffect(() => {
    autoFollowRef.current = autoFollowLive;
  }, [autoFollowLive]);

  const hostEnv = useMemo(() => plotDebugLogger.getHostEnv(), []);

  useEffect(() => {
    const unsubThrottle = requestThrottleService.subscribe((state) => {
      setThrottleState(state);
    });
    return () => unsubThrottle();
  }, []);

  useEffect(() => {
    const unsubscribe = plotDebugLogger.subscribe((updatedLogs) => {
      setLogs(updatedLogs);

      const currentId = selectedLogIdRef.current;
      const latestActive = updatedLogs.find(l => l.status === 'streaming' || l.status === 'pending');

      if (autoFollowRef.current && latestActive && latestActive.id !== lastAutoSelectedIdRef.current) {
        lastAutoSelectedIdRef.current = latestActive.id;
        // On desktop auto-select immediately; on mobile only update if user already inspecting or keep list calm until tapped
        if (typeof window !== 'undefined' && window.innerWidth >= 768) {
          setSelectedLog(latestActive);
          return;
        }
      }

      if (currentId) {
        const found = updatedLogs.find(l => l.id === currentId);
        if (found) {
          setSelectedLog(found);
        } else {
          setSelectedLog(null);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const activeLiveLogs = useMemo(
    () => logs.filter(l => l.status === 'pending' || l.status === 'streaming'),
    [logs]
  );

  const queuedPendingJobs = useMemo(
    () => throttleState.jobs.filter(j => j.status === 'pending'),
    [throttleState.jobs]
  );

  const hasLiveActivity =
    activeLiveLogs.length > 0 || throttleState.activeCount > 0 || throttleState.pendingCount > 0;

  useEffect(() => {
    if (!hasLiveActivity) return;
    setNowTime(Date.now());
    const interval = setInterval(() => {
      setNowTime(Date.now());
    }, 200);
    return () => clearInterval(interval);
  }, [hasLiveActivity]);

  useEffect(() => {
    if (
      autoFollowLive &&
      inspectorTab === 'response' &&
      selectedLog?.status === 'streaming' &&
      responseBoxRef.current
    ) {
      responseBoxRef.current.scrollTop = responseBoxRef.current.scrollHeight;
    }
  }, [selectedLog?.fullResponse, selectedLog?.chunksCount, selectedLog?.status, inspectorTab, autoFollowLive]);

  const showNotification = useCallback((msg: string) => {
    setCopiedNotification(msg);
    setTimeout(() => setCopiedNotification(null), 2800);
  }, []);

  const storedKeys = useMemo(() => {
    if (typeof window === 'undefined') return [];
    return geminiService.getAllKeys ? geminiService.getAllKeys() : [];
  }, [logs]);

  const keyCooldownsInfo = useMemo(() => {
    return storedKeys.map((key, index) => {
      const status = geminiService.getKeyCooldownStatus(key);
      const mask = key.length > 8 ? `${key.slice(0, 6)}...${key.slice(-4)}` : (key ? 'KEY_VALID' : 'EMPTY');
      return {
        key,
        index: index + 1,
        mask,
        isCoolingDown: status.isCoolingDown,
        remainingSec: Math.ceil(status.remainingMs / 1000)
      };
    });
  }, [storedKeys, logs, nowTime]);

  const coolingKeyCount = useMemo(
    () => keyCooldownsInfo.filter(k => k.isCoolingDown).length,
    [keyCooldownsInfo]
  );

  const filteredLogs = useMemo(() => {
    let base = logs;
    if (filter === 'live') base = logs.filter(l => l.status === 'pending' || l.status === 'streaming');
    else if (filter === 'scan_audit') base = logs.filter(l => l.type === 'entity_scan' || l.type === 'audit');
    else if (filter === '429') base = logs.filter(l => l.status === 'rate_limit_429' || l.statusCode === 429);
    else if (filter === 'errors') base = logs.filter(l => l.status !== 'success' && l.status !== 'pending' && l.status !== 'streaming');
    else if (filter === 'chat') base = logs.filter(l => l.type === 'plot_chat');
    else if (filter === 'analysis') base = logs.filter(l => l.type === 'plot_analysis');

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(l =>
      l.title.toLowerCase().includes(q) ||
      l.model.toLowerCase().includes(q) ||
      (l.rawError || '').toLowerCase().includes(q) ||
      (l.responseSnippet || '').toLowerCase().includes(q) ||
      (l.currentPhase || '').toLowerCase().includes(q)
    );
  }, [logs, filter, searchQuery]);

  const stats = useMemo(() => {
    const total = logs.length;
    const live = logs.filter(l => l.status === 'pending' || l.status === 'streaming').length;
    const count429 = logs.filter(l => l.status === 'rate_limit_429' || l.statusCode === 429).length;
    const errors = logs.filter(l => l.status !== 'success' && l.status !== 'pending' && l.status !== 'streaming').length;
    const scanAudit = logs.filter(l => l.type === 'entity_scan' || l.type === 'audit').length;
    return { total, live, count429, errors, scanAudit };
  }, [logs]);

  const handleTestAllKeys = async () => {
    if (storedKeys.length === 0) {
      showNotification('Chưa có API Key nào được cài đặt!');
      return;
    }
    setIsTestingKeys(true);
    setShowConfigDrawer(true);
    const results: Record<string, { ok: boolean; statusText: string; latency?: number }> = {};

    for (let i = 0; i < storedKeys.length; i++) {
      const k = storedKeys[i];
      const start = Date.now();
      const mask = k.length > 8 ? `${k.slice(0, 6)}...${k.slice(-4)}` : `Key #${i + 1}`;

      const logId = plotDebugLogger.startLog({
        type: 'key_test',
        title: `Kiểm tra kết nối Key #${i + 1} (${mask})`,
        model: selectedModel,
        apiKey: k,
        keyIndex: i + 1,
        totalKeys: storedKeys.length,
        keySource: 'localStorage',
        message: 'Ping test',
        systemInstruction: 'Test connection',
        currentPhase: `Đang ping Key #${i + 1}...`
      });

      try {
        const res = await geminiService.testSingleKeyDirectly(k);
        const latency = Date.now() - start;
        results[k] = { ok: true, statusText: `200 OK · ${latency}ms`, latency };
        plotDebugLogger.completeSuccess(logId, {
          fullResponse: 'Ping test thành công: ' + (res.text || 'OK'),
          durationMs: latency
        });
      } catch (err: any) {
        const latency = Date.now() - start;
        const msg = err?.message || String(err);
        const is429 = msg.includes('429') || msg.toLowerCase().includes('resource_exhausted');
        results[k] = {
          ok: false,
          statusText: is429 ? '429 Hết quota' : msg.substring(0, 40),
          latency
        };
        plotDebugLogger.recordFailure(logId, err);
      }
    }

    setTestResults(results);
    setIsTestingKeys(false);
    showNotification('Đã kiểm tra xong toàn bộ API Key');
  };

  const handleResetCooldowns = () => {
    geminiService.clearAllCooldowns();
    showNotification('Đã mở khóa toàn bộ Key đang hạ nhiệt');
  };

  const handleCopyReport = () => {
    const report = plotDebugLogger.exportDiagnosticsReport();
    navigator.clipboard.writeText(report);
    showNotification('Đã sao chép Báo cáo Chẩn đoán JSON');
  };

  const handleCopyText = (text?: string, label: string = 'nội dung') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showNotification(`Đã sao chép ${label}`);
  };

  const scrollContainerTo = (ref: React.RefObject<HTMLDivElement | null>, direction: 'top' | 'bottom') => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({
      top: direction === 'top' ? 0 : el.scrollHeight,
      behavior: 'smooth',
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#090d16] text-slate-200 font-sans relative select-none sm:select-auto">
      {/* Subtle Top Toast */}
      {copiedNotification && (
        <div className="fixed sm:absolute top-4 left-1/2 -translate-x-1/2 z-[300] bg-slate-900/95 backdrop-blur-md text-emerald-300 font-medium py-2.5 px-4 rounded-xl shadow-xl border border-emerald-500/40 text-xs flex items-center gap-2 whitespace-nowrap">
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Primary Top Console Bar — Clean 1-row on Desktop, 2 compact zones on iPhone 13 Pro Max */}
      <div className="bg-[#0f1623] border-b border-slate-800/80 px-3.5 sm:px-5 py-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Unboxed Environment & Quota Telemetry Summary */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 text-xs sm:text-[13px] font-display font-semibold text-slate-100 truncate">
              <span>{hostEnv.isNetlify ? 'Netlify Production' : 'Preview Sandbox'}</span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="font-mono text-sky-400 truncate">{selectedModel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 font-mono tabular-nums">
              <span>{throttleState.effectiveConcurrency === 1 ? 'Tuần tự 1 luồng' : `Song song ${throttleState.effectiveConcurrency} luồng`}</span>
              <span aria-hidden="true">·</span>
              <span>{storedKeys.length} API Key</span>
              <span aria-hidden="true">·</span>
              <span>Đang chạy {Math.max(throttleState.activeCount, activeLiveLogs.length)}</span>
              {throttleState.pendingCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400">Chờ {throttleState.pendingCount}</span>
                </>
              )}
              {coolingKeyCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    onClick={() => setShowConfigDrawer(true)}
                    className="text-rose-400 hover:underline font-semibold"
                  >
                    {coolingKeyCount} Key tạm khóa
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Primary Actions (>=40px touch height on mobile) */}
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              onClick={() => setAutoFollowLive(prev => !prev)}
              className={`min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-2 whitespace-nowrap ${
                autoFollowLive
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Tự động theo dõi tác vụ AI đang chạy theo thời gian thực"
            >
              {hasLiveActivity && autoFollowLive && (
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
              )}
              <span>{autoFollowLive ? 'Live: Bật' : 'Live: Tắt'}</span>
            </button>

            <button
              onClick={() => setShowConfigDrawer(prev => !prev)}
              className={`min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5 whitespace-nowrap ${
                showConfigDrawer
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Cấu hình &amp; Key</span>
            </button>

            <button
              onClick={handleTestAllKeys}
              disabled={isTestingKeys}
              className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isTestingKeys ? 'Đang test...' : 'Test Key'}
            </button>
          </div>
        </div>

        {/* Collapsible Netlify & API Key Drawer (saves vertical space on iPhone 13 Pro Max) */}
        {showConfigDrawer && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-3 max-h-[46vh] overflow-y-auto ios-scroll custom-scrollbar pr-1">
            {throttleState.isPaused && (
              <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 font-medium">
                Hàng đợi tạm dừng: {throttleState.pauseReason}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-400">Mô hình mặc định</span>
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    const newModel = e.target.value;
                    localStorage.setItem('aetheria_model_flash', newModel);
                    setSelectedModel(newModel);
                    showNotification(`Đã chuyển sang ${newModel}`);
                  }}
                  className="min-h-[42px] sm:min-h-[36px] bg-slate-950 border border-slate-800 text-slate-100 font-mono text-[15px] md:text-xs rounded-lg px-2.5 focus:outline-none focus:border-sky-500"
                >
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen (Flash 4 Mới nhất)</option>
                  <option value="gemini-4-argon">gemini-4-argon (Pro 4 Argon)</option>
                  <option value="gemini-4-carbon">gemini-4-carbon (Carbon 4 Reasoning)</option>
                  <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                  <option value="gemini-3.7-flash">gemini-3.7-flash</option>
                  <option value="gemini-3.6-pro">gemini-3.6-pro</option>
                  <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                  <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Kháng 429)</option>
                  <option value="gemini-flash-latest">gemini-flash-latest</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-400">Điều tiết hàng đợi (Netlify)</span>
                <select
                  value={throttleState.mode}
                  onChange={(e) => {
                    const newMode = e.target.value as QueueMode;
                    requestThrottleService.setMode(newMode);
                    showNotification(`Chế độ hàng đợi: ${newMode}`);
                  }}
                  className="min-h-[42px] sm:min-h-[36px] bg-slate-950 border border-slate-800 text-slate-100 text-[15px] md:text-xs rounded-lg px-2.5 focus:outline-none focus:border-sky-500"
                >
                  <option value="auto">Tự động theo Host (Khuyên dùng)</option>
                  <option value="sequential">Tuần tự 1 luồng (An toàn Netlify)</option>
                  <option value="parallel">Song song 4 luồng (Tốc độ cao)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-400">Giãn cách giữa các lệnh</span>
                <select
                  value={throttleState.interRequestDelayMs}
                  onChange={(e) => {
                    const delay = parseInt(e.target.value, 10);
                    requestThrottleService.setInterRequestDelay(delay);
                    showNotification(`Giãn cách: ${delay}ms`);
                  }}
                  className="min-h-[42px] sm:min-h-[36px] bg-slate-950 border border-slate-800 text-slate-100 font-mono text-[15px] md:text-xs rounded-lg px-2.5 focus:outline-none focus:border-sky-500"
                >
                  <option value="0">0ms (Không đệm)</option>
                  <option value="300">300ms (Nhanh)</option>
                  <option value="800">800ms (Chuẩn Netlify)</option>
                  <option value="1500">1500ms (Chống 429 tối đa)</option>
                </select>
              </label>
            </div>

            {/* Key Status Table */}
            {keyCooldownsInfo.length > 0 && (
              <div className="border-t border-slate-800/70 pt-2.5">
                <div className="text-[11px] font-medium text-slate-400 mb-1.5">Danh sách API Key ({keyCooldownsInfo.length})</div>
                <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded-lg bg-slate-950/60">
                  {keyCooldownsInfo.map(k => (
                    <div key={k.key} className="flex items-center justify-between gap-3 px-3 py-2 text-xs font-mono tabular-nums">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-300 font-semibold">Key #{k.index}</span>
                        <span className="text-slate-500 truncate">{k.mask}</span>
                      </div>
                      <div className="shrink-0">
                        {k.isCoolingDown ? (
                          <span className="text-rose-400 font-semibold">Tạm khóa {k.remainingSec}s</span>
                        ) : testResults[k.key] ? (
                          <span className={testResults[k.key].ok ? 'text-emerald-400' : 'text-rose-400'}>
                            {testResults[k.key].statusText}
                          </span>
                        ) : (
                          <span className="text-emerald-400">Sẵn sàng</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Utility Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleResetCooldowns}
                  className="min-h-[40px] sm:min-h-[32px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-amber-300 rounded-lg text-xs font-medium"
                >
                  Mở khóa Cooldown
                </button>
                <button
                  onClick={handleCopyReport}
                  className="min-h-[40px] sm:min-h-[32px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 rounded-lg text-xs font-medium"
                >
                  Copy Báo cáo JSON
                </button>
              </div>
              <button
                onClick={() => {
                  plotDebugLogger.clearLogs();
                  setSelectedLog(null);
                  showNotification('Đã xóa toàn bộ nhật ký');
                }}
                className="min-h-[40px] sm:min-h-[32px] px-3 py-1.5 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/50 text-rose-300 rounded-lg text-xs font-medium"
              >
                Xóa tất cả Log
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Live AI Activity Panel — Expanded cleanly ONLY when active AI streams or queue jobs are running */}
      {hasLiveActivity && (
        <div className="bg-[#0b1322] border-b border-sky-500/30 px-3.5 sm:px-5 py-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 text-xs font-display font-semibold text-sky-300">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
              <span>Hoạt động AI trực tiếp</span>
              <span className="text-slate-500 font-mono text-[11px] tabular-nums">
                ({activeLiveLogs.length} đang chạy · {queuedPendingJobs.length} chờ hàng đợi)
              </span>
            </div>
            {onSwitchToChat && (
              <button
                onClick={onSwitchToChat}
                className="text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
              >
                Mở Co-Edit →
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-800/80 max-h-32 overflow-y-auto ios-scroll custom-scrollbar">
            {activeLiveLogs.map(liveLog => {
              const elapsedMs = Math.max(0, nowTime - liveLog.timestamp);
              const elapsedSec = Math.max(0.1, elapsedMs / 1000);
              const chars = liveLog.receivedChars || liveLog.fullResponse?.length || 0;
              const speed = Math.round(chars / elapsedSec);
              const liveTail = (liveLog.fullResponse || liveLog.responseSnippet || '').slice(-110).replace(/\s+/g, ' ').trim();

              return (
                <button
                  key={liveLog.id}
                  type="button"
                  onClick={() => {
                    setSelectedLog(liveLog);
                    setInspectorTab(liveLog.status === 'streaming' ? 'response' : 'overview');
                  }}
                  className="w-full text-left py-2 px-1 hover:bg-slate-900/60 transition-colors flex flex-col gap-1 min-h-[44px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[11px] font-mono font-bold shrink-0 ${liveLog.status === 'streaming' ? 'text-sky-400' : 'text-amber-400'}`}>
                        {liveLog.status === 'streaming' ? 'STREAM' : 'CHỜ'}
                      </span>
                      <span className="text-xs font-semibold text-slate-100 truncate">{liveLog.title}</span>
                    </div>
                    <span className="text-xs font-mono font-semibold text-sky-300 tabular-nums shrink-0">
                      {formatDuration(elapsedMs)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-400 tabular-nums">
                    <span className="text-amber-300">{liveLog.model}</span>
                    <span aria-hidden="true">·</span>
                    <span>Key #{liveLog.keyIndex}/{liveLog.totalKeys}</span>
                    {chars > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-300">
                          {liveLog.chunksCount || 0} chunks · {chars.toLocaleString()} kt ({speed} kt/s)
                        </span>
                      </>
                    )}
                    {liveLog.currentPhase && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-sky-300 truncate max-w-full">{liveLog.currentPhase}</span>
                      </>
                    )}
                  </div>

                  {liveTail && (
                    <p className="text-[11px] text-slate-400 truncate font-mono">
                      &ldquo;...{liveTail}&rdquo;
                    </p>
                  )}
                </button>
              );
            })}

            {queuedPendingJobs.map(job => (
              <div key={job.id} className="py-1.5 px-1 flex items-center justify-between gap-2 text-xs text-amber-200">
                <span className="truncate font-medium">Đang xếp hàng: {job.name}</span>
                <span className="font-mono text-[11px] text-amber-400 tabular-nums shrink-0">
                  {formatDuration(Math.max(0, nowTime - job.createdAt))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Split Area: Native Push-Detail on iPhone (< md) & 2-Column Split on Desktop (md+) */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* MASTER VIEW: Search + Segmented Filters + Log List */}
        <div
          className={`w-full md:w-[44%] lg:w-[42%] flex-col min-h-0 md:border-r border-slate-800/80 bg-[#090d16] overflow-hidden relative ${
            selectedLog ? 'hidden md:flex' : 'flex flex-1 md:flex-none'
          }`}
        >
          {/* Search + Filter Controls */}
          <div className="px-3.5 py-2.5 border-b border-slate-800/80 bg-[#0d131f] space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tác vụ, model, lỗi 429..."
                  className="w-full min-h-[40px] sm:min-h-[34px] bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-8 text-[15px] md:text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <svg className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white"
                    aria-label="Xóa tìm kiếm"
                  >
                    ✕
                  </button>
                )}
              </div>
              {onSwitchToChat && !hasLiveActivity && (
                <button
                  onClick={onSwitchToChat}
                  className="hidden sm:inline-flex min-h-[34px] items-center px-2.5 text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
                >
                  Co-Edit →
                </button>
              )}
            </div>

            {/* Segmented Horizontal Filter Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {[
                { id: 'all', label: `Tất cả (${stats.total})` },
                { id: 'live', label: `Live (${stats.live})` },
                { id: 'scan_audit', label: `Quét & Kiểm toán (${stats.scanAudit})` },
                { id: 'chat', label: 'Co-Edit' },
                { id: 'analysis', label: 'Phân tích' },
                { id: '429', label: `429 (${stats.count429})` },
                { id: 'errors', label: `Lỗi (${stats.errors})` },
              ].map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id as any)}
                    className={`min-h-[36px] sm:min-h-[30px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable Log List */}
          <div
            ref={listScrollRef}
            className="flex-1 min-h-0 overflow-y-auto ios-scroll custom-scrollbar divide-y divide-slate-800/60"
          >
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[260px] text-center p-6 text-slate-500">
                <p className="text-sm font-medium text-slate-300">Chưa có nhật ký AI nào</p>
                <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
                  Mọi thao tác AI (Quét nhân vật, Kiểm toán, Phân tích mạch, Co-Edit, Sáng tác, Việt Hóa) sẽ hiển thị trực tiếp tại đây.
                </p>
                <button
                  onClick={handleTestAllKeys}
                  disabled={isTestingKeys}
                  className="mt-4 min-h-[42px] px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
                >
                  Kiểm tra kết nối API Key ngay
                </button>
              </div>
            ) : (
              filteredLogs.map(log => {
                const isSelected = selectedLog?.id === log.id;
                const isLive = log.status === 'streaming' || log.status === 'pending';
                const statusMeta = getStatusPresentation(log);
                const typeLabel = LOG_TYPE_LABELS[log.type] || 'Hệ thống';
                const displayDuration = log.durationMs
                  ? formatDuration(log.durationMs)
                  : formatDuration(Math.max(0, nowTime - log.timestamp));

                return (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => {
                      setSelectedLog(log);
                      if (log.rawError && log.status !== 'success') {
                        setInspectorTab('overview');
                      }
                    }}
                    className={`w-full text-left px-3.5 sm:px-4 py-3 transition-colors flex flex-col gap-1 min-h-[64px] ${
                      isSelected
                        ? 'bg-indigo-500/15'
                        : `${statusMeta.rowHighlight} hover:bg-slate-900/70 active:bg-slate-800/80`
                    }`}
                  >
                    {/* Line 1: Clean status code + Title + Timestamp + iOS Chevron */}
                    <div className="flex items-center justify-between gap-2 w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-mono text-[11px] font-bold tracking-tight shrink-0 tabular-nums ${statusMeta.textClass}`}>
                          {statusMeta.codeText}
                        </span>
                        <span className="text-[13px] font-semibold text-slate-100 truncate">
                          {log.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour12: false })}
                        </span>
                        <svg className="w-3.5 h-3.5 text-slate-600 md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>

                    {/* Line 2: Unboxed Typographic Metadata */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400 font-mono tabular-nums">
                      <span className="text-slate-300 font-sans font-medium">{typeLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-300/90">{log.model}</span>
                      <span aria-hidden="true">·</span>
                      <span>Key #{log.keyIndex}</span>
                      <span aria-hidden="true">·</span>
                      <span className={isLive ? 'text-sky-400 font-semibold' : 'text-slate-300'}>
                        {displayDuration}
                      </span>
                      {(log.receivedChars || 0) > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400/90">{(log.receivedChars || 0).toLocaleString()} kt</span>
                        </>
                      )}
                    </div>

                    {/* Line 3: Concise single-line live phase / error / response preview */}
                    {isLive && log.currentPhase ? (
                      <p className="text-[11px] text-sky-300 font-mono truncate w-full">
                        {log.currentPhase}
                      </p>
                    ) : log.rawError ? (
                      <p className="text-[11px] text-rose-300/90 font-mono truncate w-full">
                        {log.rawError}
                      </p>
                    ) : log.responseSnippet ? (
                      <p className="text-[11px] text-slate-500 truncate w-full">
                        {log.responseSnippet}
                      </p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {/* Floating Quick Scroll Assist for Long Mobile Touch Lists */}
          {filteredLogs.length > 6 && (
            <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollContainerTo(listScrollRef, 'top')}
                className="min-h-[38px] min-w-[38px] px-2.5 rounded-full bg-slate-900/90 backdrop-blur border border-slate-700 text-slate-200 text-xs font-medium shadow-lg hover:bg-slate-800"
                title="Cuộn lên đầu danh sách"
              >
                ↑ Mới nhất
              </button>
              <button
                type="button"
                onClick={() => scrollContainerTo(listScrollRef, 'bottom')}
                className="min-h-[38px] min-w-[38px] px-2.5 rounded-full bg-slate-900/90 backdrop-blur border border-slate-700 text-slate-300 text-xs font-medium shadow-lg hover:bg-slate-800"
                title="Cuộn xuống cuối danh sách"
              >
                ↓
              </button>
            </div>
          )}
        </div>

        {/* DETAIL VIEW: Deep Inspector */}
        <div
          className={`w-full md:flex-1 flex-col min-h-0 bg-[#0b101b] overflow-hidden relative ${
            selectedLog ? 'flex flex-1' : 'hidden md:flex'
          }`}
        >
          {selectedLog ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Inspector Header with iPhone Back Navigation */}
              <div className="px-3.5 sm:px-5 py-2.5 border-b border-slate-800/80 bg-[#0f1623] flex items-center justify-between gap-2 shrink-0 min-h-[50px]">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedLog(null)}
                    className="md:hidden min-h-[40px] pr-2.5 pl-1 flex items-center gap-1 text-sky-400 font-semibold text-xs shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span>Danh sách</span>
                  </button>

                  <span className={`font-mono text-xs font-bold shrink-0 ${getStatusPresentation(selectedLog).textClass}`}>
                    {getStatusPresentation(selectedLog).codeText}
                  </span>
                  <h4 className="font-display font-semibold text-slate-100 text-xs sm:text-sm truncate">
                    {selectedLog.title}
                  </h4>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleCopyText(JSON.stringify(selectedLog, null, 2), 'chi tiết log JSON')}
                    className="min-h-[36px] px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium border border-slate-800 whitespace-nowrap"
                  >
                    Copy JSON
                  </button>
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="hidden md:flex min-h-[36px] min-w-[36px] items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs border border-slate-800"
                    title="Đóng chi tiết"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Inspector Segmented Sub-tabs */}
              <div className="flex items-center gap-1 px-3.5 sm:px-5 py-2 border-b border-slate-800/80 bg-[#0d131f] overflow-x-auto scrollbar-none shrink-0">
                {[
                  { id: 'overview', label: 'Tổng quan' },
                  { id: 'response', label: 'Phản hồi AI', liveDot: selectedLog.status === 'streaming' || selectedLog.status === 'pending' },
                  { id: 'message', label: 'Prompt gửi' },
                  { id: 'system', label: `System (${Math.round(selectedLog.payloadMetrics.systemInstructionChars / 1000)}k)` },
                  ...(selectedLog.rawError ? [{ id: 'error', label: 'Chi tiết lỗi', isError: true }] : []),
                ].map(tab => {
                  const active = inspectorTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setInspectorTab(tab.id as any)}
                      className={`min-h-[38px] sm:min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                        active
                          ? (tab as any).isError
                            ? 'bg-rose-600 text-white'
                            : 'bg-indigo-600 text-white'
                          : (tab as any).isError
                          ? 'text-rose-400 hover:bg-rose-950/40'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {(tab as any).liveDot && (
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Inspector Scrollable Body */}
              <div
                ref={inspectorScrollRef}
                className="flex-1 min-h-0 overflow-y-auto ios-scroll custom-scrollbar p-4 sm:p-5 space-y-4 text-xs"
              >
                {inspectorTab === 'overview' && (
                  <div className="space-y-4">
                    {/* Live / Final Phase Line */}
                    {selectedLog.currentPhase && (
                      <div className="flex items-center justify-between gap-3 py-2.5 px-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                        <div className="flex items-center gap-2 min-w-0">
                          {(selectedLog.status === 'streaming' || selectedLog.status === 'pending') && (
                            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
                          )}
                          <span className="font-mono text-xs text-slate-200 truncate">{selectedLog.currentPhase}</span>
                        </div>
                        {selectedLog.attemptCount && (
                          <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                            Thử lần #{selectedLog.attemptCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Diagnostic Advice */}
                    {selectedLog.diagnosticAdvice && (
                      <div className="p-3.5 sm:p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 space-y-1.5">
                        <h5 className="font-display font-semibold text-rose-300 text-xs">
                          Chẩn đoán nguyên nhân &amp; Khắc phục
                        </h5>
                        <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                          {selectedLog.diagnosticAdvice}
                        </pre>
                      </div>
                    )}

                    {/* Flat Metric Table (Single Elevation, Tabular Numerals) */}
                    <div className="border border-slate-800/80 rounded-xl bg-slate-900/60 divide-y divide-slate-800/70">
                      <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-slate-800/70">
                        <div className="p-3">
                          <span className="text-[11px] text-slate-500 block">Mô hình AI</span>
                          <span className="text-xs sm:text-[13px] font-mono font-semibold text-amber-300 break-all">{selectedLog.model}</span>
                        </div>
                        <div className="p-3">
                          <span className="text-[11px] text-slate-500 block">API Key</span>
                          <span className="text-xs sm:text-[13px] font-mono font-semibold text-slate-200">{selectedLog.keyMask}</span>
                        </div>
                        <div className="p-3 col-span-2 sm:col-span-1 border-t sm:border-t-0 border-slate-800/70">
                          <span className="text-[11px] text-slate-500 block">Thời gian phản hồi</span>
                          <span className="text-xs sm:text-[13px] font-mono font-semibold text-emerald-400 tabular-nums">
                            {selectedLog.durationMs
                              ? formatDuration(selectedLog.durationMs)
                              : formatDuration(Math.max(0, nowTime - selectedLog.timestamp))}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-slate-800/70">
                        <div className="p-3">
                          <span className="text-[11px] text-slate-500 block">Payload gửi</span>
                          <span className="text-xs sm:text-[13px] font-mono font-semibold text-slate-200 tabular-nums">
                            {(selectedLog.payloadMetrics.systemInstructionChars + selectedLog.payloadMetrics.promptChars).toLocaleString()} kt
                          </span>
                        </div>
                        <div className="p-3">
                          <span className="text-[11px] text-slate-500 block">Ước lượng token</span>
                          <span className="text-xs sm:text-[13px] font-mono font-semibold text-slate-200 tabular-nums">
                            ~{selectedLog.payloadMetrics.estimatedTokens.toLocaleString()}
                          </span>
                        </div>
                        <div className="p-3 col-span-2 sm:col-span-1 border-t sm:border-t-0 border-slate-800/70">
                          <span className="text-[11px] text-slate-500 block">Dữ liệu nhận</span>
                          <span className="text-xs sm:text-[13px] font-mono font-semibold text-sky-300 tabular-nums">
                            {(selectedLog.receivedChars || selectedLog.fullResponse?.length || 0).toLocaleString()} kt ({selectedLog.chunksCount || 0} chunks)
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedLog.usageMetadata && (
                      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5 font-mono text-xs tabular-nums">
                        <span className="text-[11px] text-slate-400 font-sans block">Token thực tế từ Google API</span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
                          <span>Prompt: <strong className="text-slate-100">{selectedLog.usageMetadata.promptTokenCount || 0}</strong></span>
                          <span>Output: <strong className="text-emerald-300">{selectedLog.usageMetadata.candidatesTokenCount || 0}</strong></span>
                          <span>Tổng: <strong className="text-amber-300">{selectedLog.usageMetadata.totalTokenCount || 0}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {inspectorTab === 'response' && (
                  <div className="space-y-2.5 flex flex-col h-full">
                    <div className="flex items-center justify-between gap-2 shrink-0">
                      <span className="text-xs text-slate-400 font-mono tabular-nums">
                        {selectedLog.status === 'streaming'
                          ? `Đang nhận trực tiếp · ${(selectedLog.receivedChars || selectedLog.fullResponse?.length || 0).toLocaleString()} ký tự`
                          : `Phản hồi · ${(selectedLog.fullResponse || selectedLog.responseSnippet || '').length.toLocaleString()} ký tự`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => scrollContainerTo(responseBoxRef, 'bottom')}
                          className="min-h-[34px] px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs border border-slate-800"
                        >
                          ↓ Cuối
                        </button>
                        <button
                          onClick={() => handleCopyText(selectedLog.fullResponse || selectedLog.responseSnippet, 'phản hồi AI')}
                          className="min-h-[34px] px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-medium border border-slate-800"
                        >
                          Sao chép
                        </button>
                      </div>
                    </div>
                    <div
                      ref={responseBoxRef}
                      className="flex-1 min-h-[240px] max-h-[60vh] p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed overflow-y-auto ios-scroll custom-scrollbar font-mono select-text"
                    >
                      {selectedLog.fullResponse ||
                        selectedLog.responseSnippet ||
                        (selectedLog.status === 'pending'
                          ? 'Đang chờ dữ liệu đầu tiên từ Google Gemini...'
                          : '(Chưa có phản hồi hoặc phản hồi rỗng)')}
                    </div>
                  </div>
                )}

                {inspectorTab === 'message' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400 font-mono tabular-nums">
                        User Prompt · {selectedLog.payloadMetrics.promptChars.toLocaleString()} ký tự
                      </span>
                      <button
                        onClick={() => handleCopyText(selectedLog.requestPayload.message, 'User Prompt')}
                        className="min-h-[34px] px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-medium border border-slate-800"
                      >
                        Sao chép
                      </button>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto ios-scroll custom-scrollbar select-text">
                      {selectedLog.requestPayload.message || '(Không có nội dung gửi)'}
                    </div>
                  </div>
                )}

                {inspectorTab === 'system' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400 font-mono tabular-nums">
                        {selectedLog.payloadMetrics.systemInstructionChars.toLocaleString()} ký tự (~{Math.round(selectedLog.payloadMetrics.systemInstructionChars / 3.8)} tokens)
                      </span>
                      <button
                        onClick={() => handleCopyText(selectedLog.requestPayload.fullSystemInstruction, 'System Instruction')}
                        className="min-h-[34px] px-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-medium border border-slate-800"
                      >
                        Sao chép
                      </button>
                    </div>
                    <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto ios-scroll custom-scrollbar select-text">
                      {selectedLog.requestPayload.fullSystemInstruction || selectedLog.requestPayload.systemInstructionSnippet || '(Trống)'}
                    </pre>
                  </div>
                )}

                {inspectorTab === 'error' && selectedLog.rawError && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 font-mono text-xs whitespace-pre-wrap select-text">
                      {selectedLog.rawError}
                    </div>
                    {selectedLog.errorStack && (
                      <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 font-mono whitespace-pre-wrap overflow-x-auto ios-scroll custom-scrollbar select-text">
                        {selectedLog.errorStack}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              {/* Mobile Thumb-Zone Action Bar (iPhone 13 Pro Max One-Handed Ergonomics) */}
              <div className="md:hidden shrink-0 border-t border-slate-800/90 bg-[#0f1623]/95 backdrop-blur-md px-3.5 py-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
                >
                  <span>← Quay lại</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        selectedLog.fullResponse || selectedLog.rawError || selectedLog.requestPayload.message,
                        'nội dung log'
                      )
                    }
                    className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 border border-slate-800 text-sky-300 text-xs font-semibold"
                  >
                    Copy nhanh
                  </button>
                  {onSwitchToChat && (
                    <button
                      type="button"
                      onClick={onSwitchToChat}
                      className="min-h-[44px] px-3.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                    >
                      Co-Edit →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <p className="font-display font-semibold text-slate-300 text-sm">Chọn một yêu cầu API ở cột bên trái</p>
              <p className="text-xs text-slate-500 max-w-xs mt-1.5 leading-relaxed">
                Xem đầy đủ System Prompt, Prompt gửi đi, phản hồi stream theo thời gian thực và chi tiết lỗi 429 khi chạy trên Netlify.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
