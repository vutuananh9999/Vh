import React, { useState, useEffect, useMemo, useRef } from 'react';
import { plotDebugLogger, PlotDebugLogItem } from '../../services/plotDebugLogger.ts';
import { geminiService } from '../../services/geminiService.ts';
import { requestThrottleService, ThrottleState, QueueMode } from '../../services/requestThrottleService.ts';

interface Props {
  onSwitchToChat?: () => void;
}

const LOG_TYPE_LABELS: Record<PlotDebugLogItem['type'], { label: string; badgeClass: string }> = {
  plot_chat: { label: 'Co-Edit Chat', badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50' },
  plot_analysis: { label: 'Phân tích Mạch', badgeClass: 'bg-indigo-950/70 text-indigo-300 border-indigo-700/50' },
  entity_scan: { label: 'Quét Nhân vật/Tri thức', badgeClass: 'bg-purple-950/70 text-purple-300 border-purple-700/50' },
  audit: { label: 'Kiểm toán', badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-700/50' },
  chapter_summary: { label: 'Tóm tắt chương', badgeClass: 'bg-cyan-950/70 text-cyan-300 border-cyan-700/50' },
  content_gen: { label: 'Sáng tác / Sửa', badgeClass: 'bg-sky-950/70 text-sky-300 border-sky-700/50' },
  key_test: { label: 'Test Key', badgeClass: 'bg-teal-950/70 text-teal-300 border-teal-700/50' },
  system_diagnostic: { label: 'Hệ thống', badgeClass: 'bg-gray-800 text-gray-300 border-gray-700' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const PlotArcDebugConsole: React.FC<Props> = ({ onSwitchToChat }) => {
  const [logs, setLogs] = useState<PlotDebugLogItem[]>(() => plotDebugLogger.getLogs());
  const [selectedLog, setSelectedLog] = useState<PlotDebugLogItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'live' | 'scan_audit' | '429' | 'errors' | 'chat' | 'analysis'>('all');
  const [isTestingKeys, setIsTestingKeys] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; statusText: string; latency?: number }>>({});
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'system' | 'message' | 'response' | 'error'>('overview');
  const [throttleState, setThrottleState] = useState<ThrottleState>(() => requestThrottleService.getState());
  const [autoFollowLive, setAutoFollowLive] = useState(true);
  const [nowTime, setNowTime] = useState<number>(() => Date.now());

  const selectedLogIdRef = useRef<string | null>(null);
  const lastAutoSelectedIdRef = useRef<string | null>(null);
  const autoFollowRef = useRef<boolean>(true);
  const responseBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedLogIdRef.current = selectedLog?.id || null;
  }, [selectedLog]);

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
        setSelectedLog(latestActive);
        return;
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

  // Auto-scroll live streaming response content when viewing Phản hồi AI
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

  const showNotification = (msg: string) => {
    setCopiedNotification(msg);
    setTimeout(() => setCopiedNotification(null), 3000);
  };

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

  const filteredLogs = useMemo(() => {
    if (filter === 'live') return logs.filter(l => l.status === 'pending' || l.status === 'streaming');
    if (filter === 'scan_audit') return logs.filter(l => l.type === 'entity_scan' || l.type === 'audit');
    if (filter === '429') return logs.filter(l => l.status === 'rate_limit_429' || l.statusCode === 429);
    if (filter === 'errors') return logs.filter(l => l.status !== 'success' && l.status !== 'pending' && l.status !== 'streaming');
    if (filter === 'chat') return logs.filter(l => l.type === 'plot_chat');
    if (filter === 'analysis') return logs.filter(l => l.type === 'plot_analysis');
    return logs;
  }, [logs, filter]);

  const stats = useMemo(() => {
    const total = logs.length;
    const live = logs.filter(l => l.status === 'pending' || l.status === 'streaming').length;
    const count429 = logs.filter(l => l.status === 'rate_limit_429' || l.statusCode === 429).length;
    const errors = logs.filter(l => l.status !== 'success' && l.status !== 'pending' && l.status !== 'streaming').length;
    const scanAudit = logs.filter(l => l.type === 'entity_scan' || l.type === 'audit').length;
    const successes = logs.filter(l => l.status === 'success').length;
    return { total, live, count429, errors, scanAudit, successes };
  }, [logs]);

  const handleTestAllKeys = async () => {
    if (storedKeys.length === 0) {
      showNotification('Chưa có API Key nào được cài đặt!');
      return;
    }
    setIsTestingKeys(true);
    const results: Record<string, { ok: boolean; statusText: string; latency?: number }> = {};

    for (let i = 0; i < storedKeys.length; i++) {
      const k = storedKeys[i];
      const start = Date.now();
      const mask = k.length > 8 ? `${k.slice(0, 6)}...${k.slice(-4)}` : `Key #${i + 1}`;

      const logId = plotDebugLogger.startLog({
        type: 'key_test',
        title: `Kiểm tra kết nối API Key #${i + 1} (${mask})`,
        model: geminiService.getFlash ? geminiService.getFlash() : 'gemini-4-hydrogen',
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
        results[k] = { ok: true, statusText: `200 OK (${latency}ms)`, latency };
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
          statusText: is429 ? '429 Rate Limit (Hết quota)' : 'Lỗi: ' + msg.substring(0, 45),
          latency
        };
        plotDebugLogger.recordFailure(logId, err);
      }
    }

    setTestResults(results);
    setIsTestingKeys(false);
    showNotification('Đã kiểm tra xong toàn bộ API Key!');
  };

  const handleResetCooldowns = () => {
    geminiService.clearAllCooldowns();
    showNotification('Đã xóa toàn bộ trạng thái Hạ nhiệt (Cooldown) cho tất cả Key!');
  };

  const handleCopyReport = () => {
    const report = plotDebugLogger.exportDiagnosticsReport();
    navigator.clipboard.writeText(report);
    showNotification('Đã sao chép Báo cáo Chẩn đoán (JSON) vào bộ nhớ tạm!');
  };

  const handleCopyText = (text?: string, label: string = 'nội dung') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showNotification(`Đã sao chép ${label}!`);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-gray-950 text-gray-200 font-sans relative">
      {/* Toast */}
      {copiedNotification && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-[300] bg-emerald-600 text-white font-bold py-2 px-5 rounded-xl shadow-2xl border border-emerald-400/40 text-xs animate-fadeIn flex items-center gap-2">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Top Diagnostics Dashboard Bar */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-900/90 to-gray-950 border-b border-gray-800 p-3 sm:p-4 shrink-0 max-h-[42%] md:max-h-none overflow-y-auto custom-scrollbar shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Environment Status Badges */}
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {/* Host Badge */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono font-bold ${
              hostEnv.isNetlify
                ? 'bg-sky-950/60 border-sky-600/40 text-sky-300'
                : 'bg-emerald-950/60 border-emerald-600/40 text-emerald-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${hostEnv.isNetlify ? 'bg-sky-400 animate-pulse' : 'bg-emerald-400'}`}></span>
              <span>Host: {hostEnv.hostname || 'localhost'}</span>
              <span className="text-[9px] px-1 bg-black/40 rounded uppercase">{hostEnv.isNetlify ? 'Netlify Domain' : 'Preview Container'}</span>
            </div>

            {/* Active Keys Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/50 border border-purple-600/30 text-purple-300 font-bold">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span>{storedKeys.length} Key đã cấu hình</span>
            </div>

            {/* Model Selector */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gray-850 border border-gray-700 text-gray-300 font-mono">
              <span className="text-gray-400 text-[10px]">Model:</span>
              <select
                value={geminiService.getFlash ? geminiService.getFlash() : 'gemini-4-hydrogen'}
                onChange={(e) => {
                  const newModel = e.target.value;
                  localStorage.setItem('aetheria_model_flash', newModel);
                  showNotification(`Đã chuyển Model sang: ${newModel}`);
                  setLogs([...plotDebugLogger.getLogs()]);
                }}
                className="bg-transparent text-amber-400 font-bold text-[11px] focus:outline-none cursor-pointer"
                title="Thay đổi Model AI đang sử dụng"
              >
                <option value="gemini-4-hydrogen" className="bg-gray-900 text-amber-400">gemini-4-hydrogen (Mặc định Flash 4 - Mới nhất, hỗ trợ tất cả Key)</option>
                <option value="gemini-4-argon" className="bg-gray-900 text-purple-400">gemini-4-argon (Pro 4 Argon - Phân tích & suy luận sâu)</option>
                <option value="gemini-4-carbon" className="bg-gray-900 text-purple-400">gemini-4-carbon (Carbon 4 - Deep Reasoning & Kiểm toán)</option>
                <option value="gemini-3.8-flash" className="bg-gray-900 text-amber-400">gemini-3.8-flash (Flash 3.8 - Siêu tốc độ)</option>
                <option value="gemini-3.7-flash" className="bg-gray-900 text-amber-400">gemini-3.7-flash (Flash 3.7 - Hybrid reasoning)</option>
                <option value="gemini-3.6-pro" className="bg-gray-900 text-purple-400">gemini-3.6-pro (Pro 3.6)</option>
                <option value="gemini-3.6-flash" className="bg-gray-900 text-amber-400">gemini-3.6-flash (Flash 3.6)</option>
                <option value="gemini-3.1-pro-preview" className="bg-gray-900 text-purple-400">gemini-3.1-pro-preview (Pro 3.1 Preview)</option>
                <option value="gemini-3.1-flash-lite" className="bg-gray-900 text-emerald-400">gemini-3.1-flash-lite (Flash Lite 3.1 - Siêu nhẹ, kháng 429)</option>
                <option value="gemini-flash-latest" className="bg-gray-900 text-amber-400">gemini-flash-latest (Bản Flash mới nhất của Google)</option>
              </select>
            </div>

            {/* 429 Alert Counter */}
            {stats.count429 > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-600/60 text-rose-300 font-bold text-[10px] animate-pulse">
                <span>⚠️ {stats.count429} lần chạm 429</span>
              </div>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setAutoFollowLive(prev => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border active:scale-95 ${
                autoFollowLive
                  ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-sm shadow-emerald-900/40'
                  : 'bg-gray-850 border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
              title="Tự động chọn và cuộn theo luồng AI đang chạy theo thời gian thực"
            >
              <span className={`w-2 h-2 rounded-full ${autoFollowLive ? 'bg-emerald-400 animate-ping' : 'bg-gray-500'}`}></span>
              <span>{autoFollowLive ? 'Theo dõi Live: BẬT' : 'Theo dõi Live: TẮT'}</span>
            </button>

            <button
              onClick={handleTestAllKeys}
              disabled={isTestingKeys}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Gửi gói tin ping nhỏ tới Google API để test từng Key"
            >
              {isTestingKeys ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Đang test...</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Test Tất Cả Key</span>
                </>
              )}
            </button>

            <button
              onClick={handleResetCooldowns}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-750 text-gray-200 rounded-lg text-xs font-bold transition-all border border-gray-700 active:scale-95"
              title="Bỏ trạng thái hạ nhiệt nếu Key đang bị tạm ngừng 30s"
            >
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Reset Cooldown</span>
            </button>

            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-750 text-gray-200 rounded-lg text-xs font-bold transition-all border border-gray-700 active:scale-95"
              title="Sao chép file báo cáo lỗi chi tiết dạng JSON"
            >
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              <span>Copy Báo Cáo JSON</span>
            </button>

            <button
              onClick={() => {
                plotDebugLogger.clearLogs();
                setSelectedLog(null);
              }}
              className="p-1.5 bg-gray-850 hover:bg-rose-950/60 text-gray-400 hover:text-rose-300 rounded-lg text-xs transition-all border border-gray-800"
              title="Xóa toàn bộ log hiện tại"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Live Key Cooldown Strip */}
        {keyCooldownsInfo.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-800/80 flex flex-wrap items-center gap-2 text-[10.5px]">
            <span className="text-gray-500 font-bold uppercase text-[9px] tracking-wider">Trạng thái từng Key:</span>
            {keyCooldownsInfo.map(k => (
              <div
                key={k.key}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono ${
                  k.isCoolingDown
                    ? 'bg-rose-950/60 border-rose-600/50 text-rose-300 animate-pulse'
                    : testResults[k.key]?.ok === false
                    ? 'bg-amber-950/60 border-amber-600/50 text-amber-300'
                    : 'bg-black/40 border-gray-800 text-gray-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${k.isCoolingDown ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                <span className="font-bold">Key #{k.index} ({k.mask})</span>
                {k.isCoolingDown && (
                  <span className="text-[9.5px] font-bold text-rose-400">(Tạm khóa {k.remainingSec}s)</span>
                )}
                {testResults[k.key] && (
                  <span className={`text-[9px] font-bold ml-1 ${testResults[k.key].ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                    • {testResults[k.key].statusText}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Request Throttling & Queue Management Bar */}
        <div className="mt-2 pt-2 border-t border-gray-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono font-bold ${
              throttleState.effectiveConcurrency === 1
                ? 'bg-amber-950/50 border-amber-600/40 text-amber-300'
                : 'bg-indigo-950/50 border-indigo-600/40 text-indigo-300'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span>
                Hàng Đợi: {throttleState.effectiveConcurrency === 1 ? 'Tuần Tự 1-Luồng (Chống 429)' : `Song Song (${throttleState.effectiveConcurrency} Luồng)`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-850 border border-gray-700 text-gray-300">
              <span className={`w-2 h-2 rounded-full ${hasLiveActivity ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`}></span>
              <span className="font-bold text-gray-200">Đang chạy: {Math.max(throttleState.activeCount, activeLiveLogs.length)}</span>
              <span className="text-gray-500">|</span>
              <span className="text-gray-300">Đang chờ: <b className="text-amber-400">{throttleState.pendingCount}</b></span>
              <span className="text-gray-500">|</span>
              <span className="text-gray-400 text-[10px]">Đã xử lý: {throttleState.totalProcessed}</span>
            </div>

            {throttleState.isPaused && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-600/60 text-rose-300 font-bold animate-pulse">
                <span>⏸️ Hàng đợi tạm nghỉ: {throttleState.pauseReason}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-[10px] uppercase font-bold">Chế độ Queue:</span>
            <select
              value={throttleState.mode}
              onChange={(e) => {
                const newMode = e.target.value as QueueMode;
                requestThrottleService.setMode(newMode);
                showNotification(`Đã chuyển chế độ điều tiết sang: ${newMode}`);
              }}
              className="bg-gray-850 border border-gray-700 text-cyan-300 font-bold text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="auto" className="bg-gray-900 text-cyan-300">Tự động theo Host (Khuyến nghị)</option>
              <option value="sequential" className="bg-gray-900 text-amber-300">Bắt buộc Tuần tự 1-by-1 (Netlify Safe)</option>
              <option value="parallel" className="bg-gray-900 text-indigo-300">Bắt buộc Song song 4-luồng (Turbo)</option>
            </select>

            <select
              value={throttleState.interRequestDelayMs}
              onChange={(e) => {
                const delay = parseInt(e.target.value, 10);
                requestThrottleService.setInterRequestDelay(delay);
                showNotification(`Đã chỉnh độ giãn cách giữa các lệnh: ${delay}ms`);
              }}
              className="bg-gray-850 border border-gray-700 text-gray-300 font-mono text-[10.5px] rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
              title="Khoảng nghỉ giữa các request để Google hồi phục token bucket"
            >
              <option value="0" className="bg-gray-900">Nghỉ 0ms (Không đệm)</option>
              <option value="300" className="bg-gray-900">Nghỉ 300ms (Nhanh)</option>
              <option value="800" className="bg-gray-900">Nghỉ 800ms (Chuẩn Netlify)</option>
              <option value="1500" className="bg-gray-900">Nghỉ 1500ms (Siêu an toàn)</option>
            </select>
          </div>
        </div>

        {/* Real-time Live AI Activity Monitor Strip */}
        <div className={`mt-2.5 rounded-xl border px-3 py-2 transition-all ${
          hasLiveActivity
            ? 'bg-gradient-to-r from-sky-950/60 via-indigo-950/50 to-purple-950/40 border-sky-500/40 shadow-inner'
            : 'bg-black/30 border-gray-800/80'
        }`}>
          <div className="flex items-center justify-between gap-2 text-[10.5px]">
            <div className="flex items-center gap-2 font-bold">
              <span className="relative flex h-2.5 w-2.5">
                {hasLiveActivity && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${hasLiveActivity ? 'bg-sky-400' : 'bg-emerald-500/70'}`}></span>
              </span>
              <span className={hasLiveActivity ? 'text-sky-300 uppercase tracking-wider' : 'text-gray-400 uppercase tracking-wider'}>
                {hasLiveActivity
                  ? `HOẠT ĐỘNG AI TRỰC TIẾP (${activeLiveLogs.length} đang chạy • ${queuedPendingJobs.length} chờ hàng đợi)`
                  : 'LUỒNG LIVE AI: ĐANG CHỜ TÁC VỤ (Tự động cập nhật theo thời gian thực khi AI hoạt động)'}
              </span>
            </div>

            {onSwitchToChat && (
              <button
                onClick={onSwitchToChat}
                className="text-[10px] font-bold text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
              >
                Mở Co-Edit để test ngay →
              </button>
            )}
          </div>

          {(activeLiveLogs.length > 0 || queuedPendingJobs.length > 0) && (
            <div className="mt-2 space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar pr-1">
              {activeLiveLogs.map(liveLog => {
                const elapsedMs = Math.max(0, nowTime - liveLog.timestamp);
                const elapsedSec = Math.max(0.1, elapsedMs / 1000);
                const chars = liveLog.receivedChars || liveLog.fullResponse?.length || 0;
                const speed = Math.round(chars / elapsedSec);
                const liveTail = (liveLog.fullResponse || liveLog.responseSnippet || '').slice(-120).replace(/\s+/g, ' ').trim();

                return (
                  <div
                    key={liveLog.id}
                    onClick={() => {
                      setSelectedLog(liveLog);
                      if (liveLog.status === 'streaming') setInspectorTab('response');
                    }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-950/80 border border-sky-500/30 hover:border-sky-400/60 cursor-pointer text-[11px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 ${
                        liveLog.status === 'streaming'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 animate-pulse'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {liveLog.status === 'streaming' ? 'STREAMING' : 'ĐANG GỬI'}
                      </span>
                      <span className="font-bold text-gray-100 truncate">{liveLog.title}</span>
                      <span className="text-[10px] text-sky-300/90 font-mono truncate hidden md:inline">
                        • {liveLog.currentPhase || 'Đang xử lý...'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 text-[10px] font-mono shrink-0 text-gray-300">
                      <span className="text-amber-300">{liveLog.model}</span>
                      <span className="text-purple-300">Key #{liveLog.keyIndex}/{liveLog.totalKeys}</span>
                      {chars > 0 && (
                        <span className="text-emerald-300">
                          {liveLog.chunksCount || 0} chunks • {chars.toLocaleString()} kt ({speed} kt/s)
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 font-bold border border-sky-800">
                        ⏱ {formatDuration(elapsedMs)}
                      </span>
                    </div>

                    {liveTail && (
                      <div className="sm:hidden text-[10px] text-gray-400 italic truncate">
                        &quot;...{liveTail}&quot;
                      </div>
                    )}
                  </div>
                );
              })}

              {queuedPendingJobs.map(job => (
                <div
                  key={job.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-gray-900/80 border border-amber-700/30 text-[10.5px] text-amber-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700/50 text-[9px] font-mono font-bold">
                      HÀNG ĐỢI
                    </span>
                    <span className="truncate font-semibold">{job.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-amber-400 shrink-0">
                    Chờ {formatDuration(Math.max(0, nowTime - job.createdAt))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area: Split List & Inspector */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left Side: Filter Tabs & Request Logs List */}
        <div
          className={`w-full md:w-1/2 lg:w-5/12 flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-gray-800 bg-gray-950 overflow-hidden ${
            selectedLog ? 'h-[42%] md:h-auto shrink-0 md:shrink' : 'flex-1 md:flex-none'
          }`}
        >
          {/* Filter Tabs */}
          <div className="p-2.5 border-b border-gray-800/80 flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0 bg-gray-900/40">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all whitespace-nowrap ${
                filter === 'all' ? 'bg-purple-600 text-white shadow' : 'bg-gray-850 text-gray-400 hover:text-gray-200'
              }`}
            >
              Tất cả ({stats.total})
            </button>
            <button
              onClick={() => setFilter('live')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
                filter === 'live'
                  ? 'bg-sky-600 text-white shadow'
                  : stats.live > 0
                  ? 'bg-sky-950/70 text-sky-300 border border-sky-600/40 animate-pulse'
                  : 'bg-gray-850 text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>Live ({stats.live})</span>
            </button>
            <button
              onClick={() => setFilter('scan_audit')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all whitespace-nowrap ${
                filter === 'scan_audit' ? 'bg-amber-600 text-white shadow' : 'bg-gray-850 text-gray-400 hover:text-gray-200'
              }`}
            >
              Quét & Kiểm toán ({stats.scanAudit})
            </button>
            <button
              onClick={() => setFilter('chat')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all whitespace-nowrap ${
                filter === 'chat' ? 'bg-emerald-600 text-white shadow' : 'bg-gray-850 text-gray-400 hover:text-gray-200'
              }`}
            >
              Chat Co-Edit
            </button>
            <button
              onClick={() => setFilter('analysis')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all whitespace-nowrap ${
                filter === 'analysis' ? 'bg-indigo-600 text-white shadow' : 'bg-gray-850 text-gray-400 hover:text-gray-200'
              }`}
            >
              Phân tích Mạch
            </button>
            <button
              onClick={() => setFilter('429')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all whitespace-nowrap ${
                filter === '429' ? 'bg-rose-600 text-white shadow' : 'bg-gray-850 text-rose-400 hover:bg-gray-800'
              }`}
            >
              Lỗi 429 ({stats.count429})
            </button>
            <button
              onClick={() => setFilter('errors')}
              className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition-all whitespace-nowrap ${
                filter === 'errors' ? 'bg-rose-700 text-white shadow' : 'bg-gray-850 text-gray-400 hover:text-gray-200'
              }`}
            >
              Lỗi khác ({stats.errors})
            </button>
          </div>

          {/* Logs Scrollable Feed */}
          <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 space-y-2 custom-scrollbar">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-6 text-gray-500">
                <svg className="w-10 h-10 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs font-semibold">Chưa có yêu cầu API nào khớp bộ lọc</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Mọi thao tác AI (Quét nhân vật, Kiểm toán, Phân tích mạch, Chat, Sáng tác, Việt Hóa) sẽ tự động hiện trực tiếp tại đây.
                </p>
              </div>
            ) : (
              filteredLogs.map(log => {
                const isSelected = selectedLog?.id === log.id;
                const is429 = log.status === 'rate_limit_429' || log.statusCode === 429;
                const isSuccess = log.status === 'success';
                const isStreaming = log.status === 'streaming';
                const isPending = log.status === 'pending';
                const isLive = isStreaming || isPending;
                const typeMeta = LOG_TYPE_LABELS[log.type] || LOG_TYPE_LABELS.system_diagnostic;
                const displayDuration = log.durationMs
                  ? formatDuration(log.durationMs)
                  : formatDuration(Math.max(0, nowTime - log.timestamp));

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                        : isLive
                        ? 'bg-sky-950/25 border-sky-500/50 hover:bg-sky-950/40'
                        : is429
                        ? 'bg-rose-950/20 hover:bg-rose-950/40 border-rose-900/50'
                        : isSuccess
                        ? 'bg-gray-900/70 hover:bg-gray-850 border-gray-800'
                        : 'bg-gray-900/90 hover:bg-gray-850 border-gray-800'
                    }`}
                  >
                    {/* Log Card Header */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase shrink-0 ${
                          isSuccess
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : is429
                            ? 'bg-rose-950 text-rose-400 border border-rose-700 animate-pulse'
                            : isStreaming
                            ? 'bg-sky-950 text-sky-300 border border-sky-600 animate-pulse'
                            : isPending
                            ? 'bg-amber-950 text-amber-300 border border-amber-700'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {isStreaming ? 'LIVE' : isPending ? 'RUN' : (log.statusCode || log.status)}
                        </span>

                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold shrink-0 ${typeMeta.badgeClass}`}>
                          {typeMeta.label}
                        </span>

                        <span className="font-bold text-gray-200 truncate">
                          {log.title}
                        </span>
                      </div>

                      <span className="text-[10px] text-gray-500 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Meta Row */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-gray-400 font-mono mb-1.5">
                      <span className="text-amber-400/90">{log.model}</span>
                      <span>•</span>
                      <span>Key: {log.keyMask}</span>
                      <span>•</span>
                      <span>~{log.payloadMetrics.estimatedTokens} tok</span>
                      <span>•</span>
                      <span className={isLive ? 'text-sky-400 font-bold' : 'text-emerald-400'}>
                        {isLive ? `⏱ ${displayDuration}` : displayDuration}
                      </span>
                      {(log.chunksCount || 0) > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-300">{log.chunksCount} chunks / {(log.receivedChars || 0).toLocaleString()} kt</span>
                        </>
                      )}
                    </div>

                    {/* Live Phase / Excerpt Snippet */}
                    {isLive && log.currentPhase ? (
                      <div className="p-1.5 rounded bg-sky-950/40 border border-sky-800/50 text-[10.5px] text-sky-200 font-mono truncate">
                        ⚡ {log.currentPhase}
                        {log.responseSnippet ? ` — "${log.responseSnippet.slice(-80)}"` : ''}
                      </div>
                    ) : log.rawError ? (
                      <div className="p-1.5 rounded bg-rose-950/40 border border-rose-900/40 text-[10.5px] text-rose-300 font-mono truncate">
                        ⚠️ {log.rawError}
                      </div>
                    ) : log.responseSnippet ? (
                      <div className="text-[10.5px] text-gray-400 line-clamp-1 italic">
                        &quot;{log.responseSnippet}&quot;
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Deep Inspector Panel */}
        <div className="w-full md:w-1/2 lg:w-7/12 flex-1 md:flex-none flex flex-col min-h-0 bg-gray-950/60 overflow-hidden">
          {selectedLog ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Inspector Header */}
              <div className="p-3 sm:p-4 border-b border-gray-800 bg-gray-900/60 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                    selectedLog.status === 'success'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : selectedLog.status === 'streaming'
                      ? 'bg-sky-950 text-sky-300 border border-sky-600 animate-pulse'
                      : selectedLog.status === 'rate_limit_429'
                      ? 'bg-rose-950 text-rose-300 border border-rose-600'
                      : 'bg-amber-950 text-amber-300 border border-amber-700'
                  }`}>
                    {selectedLog.status === 'streaming' ? 'STREAMING' : (selectedLog.statusCode || selectedLog.status)}
                  </span>
                  <h4 className="font-bold text-gray-200 text-xs sm:text-sm truncate">
                    {selectedLog.title}
                  </h4>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleCopyText(JSON.stringify(selectedLog, null, 2), 'toàn bộ log JSON')}
                    className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition-all border border-gray-750"
                    title="Sao chép toàn bộ chi tiết Log"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg text-xs transition-all"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Inspector Sub-tabs */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800/80 bg-gray-900/30 text-[11px] font-bold overflow-x-auto custom-scrollbar shrink-0">
                <button
                  onClick={() => setInspectorTab('overview')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${
                    inspectorTab === 'overview' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Tổng quan & Chẩn đoán
                </button>
                <button
                  onClick={() => setInspectorTab('system')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${
                    inspectorTab === 'system' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  System Instruction ({Math.round(selectedLog.payloadMetrics.systemInstructionChars / 1000)}k kt)
                </button>
                <button
                  onClick={() => setInspectorTab('message')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${
                    inspectorTab === 'message' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  User Prompt
                </button>
                <button
                  onClick={() => setInspectorTab('response')}
                  className={`px-3 py-1 rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    inspectorTab === 'response' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span>Phản hồi AI</span>
                  {(selectedLog.status === 'streaming' || selectedLog.status === 'pending') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping"></span>
                  )}
                </button>
                {selectedLog.rawError && (
                  <button
                    onClick={() => setInspectorTab('error')}
                    className={`px-3 py-1 rounded-md transition-all whitespace-nowrap ${
                      inspectorTab === 'error' ? 'bg-rose-600 text-white' : 'text-rose-400 hover:text-rose-200'
                    }`}
                  >
                    Chi tiết Lỗi
                  </button>
                )}
              </div>

              {/* Inspector Body Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
                {/* 1. Overview Tab */}
                {inspectorTab === 'overview' && (
                  <div className="space-y-4">
                    {/* Live Phase Banner */}
                    {selectedLog.currentPhase && (
                      <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        selectedLog.status === 'streaming' || selectedLog.status === 'pending'
                          ? 'bg-sky-950/40 border-sky-500/40 text-sky-200'
                          : selectedLog.status === 'success'
                          ? 'bg-emerald-950/30 border-emerald-700/40 text-emerald-200'
                          : 'bg-rose-950/30 border-rose-700/40 text-rose-200'
                      }`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            selectedLog.status === 'streaming' || selectedLog.status === 'pending'
                              ? 'bg-sky-400 animate-ping'
                              : selectedLog.status === 'success'
                              ? 'bg-emerald-400'
                              : 'bg-rose-400'
                          }`}></span>
                          <span className="font-mono text-[11px] font-bold truncate">{selectedLog.currentPhase}</span>
                        </div>
                        {selectedLog.attemptCount && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-white/10 shrink-0">
                            Lần thử: #{selectedLog.attemptCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Automated Diagnostic Advice Box */}
                    {selectedLog.diagnosticAdvice && (
                      <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/60 to-purple-950/40 border border-rose-500/40 shadow-lg space-y-2">
                        <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>Chẩn đoán nguyên nhân & Cách xử lý:</span>
                        </div>
                        <pre className="text-[11.5px] text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
                          {selectedLog.diagnosticAdvice}
                        </pre>
                      </div>
                    )}

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Mô hình AI</span>
                        <span className="text-sm font-mono font-bold text-amber-400 break-all">{selectedLog.model}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">API Key sử dụng</span>
                        <span className="text-sm font-mono font-bold text-purple-400">{selectedLog.keyMask}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Thời gian phản hồi</span>
                        <span className="text-sm font-mono font-bold text-emerald-400">
                          {selectedLog.durationMs
                            ? formatDuration(selectedLog.durationMs)
                            : `⏱ ${formatDuration(Math.max(0, nowTime - selectedLog.timestamp))}`}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Ký tự Payload gửi</span>
                        <span className="text-sm font-mono font-bold text-sky-400">
                          {(selectedLog.payloadMetrics.systemInstructionChars + selectedLog.payloadMetrics.promptChars).toLocaleString()} kt
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Ước lượng Token</span>
                        <span className="text-sm font-mono font-bold text-indigo-400">~{selectedLog.payloadMetrics.estimatedTokens.toLocaleString()} Tokens</span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Dữ liệu đã nhận</span>
                        <span className="text-sm font-mono font-bold text-cyan-300">
                          {(selectedLog.receivedChars || selectedLog.fullResponse?.length || 0).toLocaleString()} kt ({selectedLog.chunksCount || 0} chunks)
                        </span>
                      </div>
                    </div>

                    {/* Google Actual Usage Metadata if available */}
                    {selectedLog.usageMetadata && (
                      <div className="p-3.5 rounded-xl bg-gray-900/80 border border-gray-800 space-y-1.5 font-mono text-[11px]">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block font-sans">Token thực tế do Google ghi nhận (UsageMetadata):</span>
                        <div className="flex flex-wrap gap-4 text-gray-300">
                          <span>Prompt Tokens: <strong className="text-purple-300">{selectedLog.usageMetadata.promptTokenCount || 0}</strong></span>
                          <span>Candidate Tokens: <strong className="text-emerald-300">{selectedLog.usageMetadata.candidatesTokenCount || 0}</strong></span>
                          <span>Tổng Token: <strong className="text-amber-300">{selectedLog.usageMetadata.totalTokenCount || 0}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. System Instruction Tab */}
                {inspectorTab === 'system' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Độ dài: {selectedLog.payloadMetrics.systemInstructionChars.toLocaleString()} ký tự (~{Math.round(selectedLog.payloadMetrics.systemInstructionChars / 3.8)} Tokens)
                      </span>
                      <button
                        onClick={() => handleCopyText(selectedLog.requestPayload.fullSystemInstruction, 'toàn bộ System Instruction')}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-bold transition-all border border-gray-700 flex items-center gap-1"
                      >
                        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Sao chép
                      </button>
                    </div>
                    <pre className="p-3 rounded-xl bg-gray-900 border border-gray-800 font-mono text-[11px] text-gray-300 whitespace-pre-wrap max-h-[55vh] overflow-y-auto custom-scrollbar">
                      {selectedLog.requestPayload.fullSystemInstruction || selectedLog.requestPayload.systemInstructionSnippet || '(Trống)'}
                    </pre>
                  </div>
                )}

                {/* 3. User Message Tab */}
                {inspectorTab === 'message' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Nội dung gửi đi ({selectedLog.payloadMetrics.promptChars.toLocaleString()} ký tự):
                      </span>
                      <button
                        onClick={() => handleCopyText(selectedLog.requestPayload.message, 'User Prompt')}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-bold transition-all border border-gray-700"
                      >
                        Sao chép
                      </button>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-900 border border-gray-800 font-mono text-[11.5px] text-gray-200 whitespace-pre-wrap max-h-[55vh] overflow-y-auto custom-scrollbar">
                      {selectedLog.requestPayload.message || '(Không có tin nhắn)'}
                    </div>
                  </div>
                )}

                {/* 4. Response Tab */}
                {inspectorTab === 'response' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>Nội dung phản hồi từ Gemini:</span>
                        {selectedLog.status === 'streaming' && (
                          <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-700 font-mono text-[10px] animate-pulse">
                            Đang stream trực tiếp ({(selectedLog.receivedChars || selectedLog.fullResponse?.length || 0).toLocaleString()} kt)...
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleCopyText(selectedLog.fullResponse || selectedLog.responseSnippet, 'phản hồi AI')}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-bold transition-all border border-gray-700"
                      >
                        Sao chép
                      </button>
                    </div>
                    <div
                      ref={responseBoxRef}
                      className="p-3.5 rounded-xl bg-gray-900 border border-gray-800 text-[12px] text-gray-200 whitespace-pre-wrap leading-relaxed max-h-[55vh] overflow-y-auto custom-scrollbar font-mono"
                    >
                      {selectedLog.fullResponse || selectedLog.responseSnippet || (selectedLog.status === 'pending' ? 'Đang chờ phản hồi đầu tiên từ Google Gemini...' : '(Chưa có phản hồi hoặc phản hồi rỗng)')}
                    </div>
                  </div>
                )}

                {/* 5. Error Tab */}
                {inspectorTab === 'error' && selectedLog.rawError && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 font-mono text-[11px] whitespace-pre-wrap">
                      {selectedLog.rawError}
                    </div>
                    {selectedLog.errorStack && (
                      <pre className="p-3 rounded-xl bg-gray-900 border border-gray-800 text-[10px] text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto custom-scrollbar">
                        {selectedLog.errorStack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
              <svg className="w-12 h-12 mb-3 opacity-30 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <h5 className="font-bold text-gray-400 text-xs sm:text-sm">Chọn một yêu cầu API từ danh sách bên trái</h5>
              <p className="text-[11px] text-gray-600 max-w-xs mt-1">
                Hoặc bật &quot;Theo dõi Live&quot; để tự động hiển thị toàn bộ thông số, phản hồi stream, lượt xoay Key và lỗi theo thời gian thực.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
