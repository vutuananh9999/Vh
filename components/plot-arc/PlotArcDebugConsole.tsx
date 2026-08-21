import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { plotDebugLogger, PlotDebugLogItem } from '../../services/plotDebugLogger.ts';
import { geminiService } from '../../services/geminiService.ts';

interface Props {
  onSwitchToChat?: () => void;
}

export const PlotArcDebugConsole: React.FC<Props> = ({ onSwitchToChat }) => {
  const [logs, setLogs] = useState<PlotDebugLogItem[]>([]);
  const [selectedLog, setSelectedLog] = useState<PlotDebugLogItem | null>(null);
  const [filter, setFilter] = useState<'all' | '429' | 'errors' | 'chat' | 'analysis'>('all');
  const [isTestingKeys, setIsTestingKeys] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; statusText: string; latency?: number }>>({});
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'system' | 'message' | 'response' | 'error'>('overview');

  const hostEnv = useMemo(() => plotDebugLogger.getHostEnv(), []);

  useEffect(() => {
    const unsubscribe = plotDebugLogger.subscribe((updatedLogs) => {
      setLogs(updatedLogs);
      if (selectedLog) {
        const found = updatedLogs.find(l => l.id === selectedLog.id);
        if (found) setSelectedLog(found);
      }
    });
    return () => unsubscribe();
  }, [selectedLog]);

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
  }, [storedKeys, logs]);

  const filteredLogs = useMemo(() => {
    if (filter === '429') return logs.filter(l => l.status === 'rate_limit_429' || l.statusCode === 429);
    if (filter === 'errors') return logs.filter(l => l.status !== 'success' && l.status !== 'pending' && l.status !== 'streaming');
    if (filter === 'chat') return logs.filter(l => l.type === 'plot_chat');
    if (filter === 'analysis') return logs.filter(l => l.type === 'plot_analysis');
    return logs;
  }, [logs, filter]);

  const stats = useMemo(() => {
    const total = logs.length;
    const count429 = logs.filter(l => l.status === 'rate_limit_429' || l.statusCode === 429).length;
    const errors = logs.filter(l => l.status !== 'success' && l.status !== 'pending' && l.status !== 'streaming').length;
    const successes = logs.filter(l => l.status === 'success').length;
    return { total, count429, errors, successes };
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
        model: geminiService.getFlash ? geminiService.getFlash() : 'gemini-2.5-flash',
        apiKey: k,
        keyIndex: i + 1,
        totalKeys: storedKeys.length,
        keySource: 'localStorage',
        message: 'Ping test',
        systemInstruction: 'Test connection'
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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-950 text-gray-200 font-sans">
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
      <div className="bg-gradient-to-r from-gray-900 via-gray-900/90 to-gray-950 border-b border-gray-800 p-3 sm:p-4 shrink-0 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Environment Status Pills */}
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

            {/* Model Selector Badge */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gray-850 border border-gray-700 text-gray-300 font-mono">
              <span className="text-gray-400 text-[10px]">Model:</span>
              <select
                value={geminiService.getFlash ? geminiService.getFlash() : 'gemini-2.5-flash'}
                onChange={(e) => {
                  const newModel = e.target.value;
                  localStorage.setItem('aetheria_model_flash', newModel);
                  showNotification(`Đã chuyển Model sang: ${newModel}`);
                  // Force re-render
                  setLogs([...plotDebugLogger.getLogs()]);
                }}
                className="bg-transparent text-amber-400 font-bold text-[11px] focus:outline-none cursor-pointer"
                title="Thay đổi Model AI đang sử dụng"
              >
                <option value="gemini-2.5-flash" className="bg-gray-900 text-amber-400">gemini-2.5-flash (Khuyên dùng - Nhanh & Ổn định nhất)</option>
                <option value="gemini-2.0-flash" className="bg-gray-900 text-amber-400">gemini-2.0-flash (Ổn định cao)</option>
                <option value="gemini-3.7-flash" className="bg-gray-900 text-amber-400">gemini-3.7-flash (Đang bị quá tải 503 tại Google)</option>
                <option value="gemini-2.5-pro" className="bg-gray-900 text-purple-400">gemini-2.5-pro (Mô hình lớn)</option>
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
              onClick={() => plotDebugLogger.clearLogs()}
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
          <div className="mt-2.5 pt-2 border-t border-gray-800/80 flex flex-wrap items-center gap-2 text-[10.5px]">
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
      </div>

      {/* Main Content Area: Split List & Inspector */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Filter Tabs & Request Logs List */}
        <div className="w-full md:w-1/2 lg:w-5/12 flex flex-col border-r border-gray-800 bg-gray-950 overflow-hidden">
          {/* Filter Pills */}
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
                filter === 'errors' ? 'bg-amber-600 text-white shadow' : 'bg-gray-850 text-gray-400 hover:text-gray-200'
              }`}
            >
              Lỗi khác ({stats.errors})
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
          </div>

          {/* Logs Scrollable Feed */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2 custom-scrollbar">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center p-6 text-gray-500">
                <svg className="w-10 h-10 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs font-semibold">Chưa có yêu cầu API nào được ghi lại</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Hãy gửi một tin nhắn trong tab Co-Edit hoặc bấm &quot;Test Tất Cả Key&quot; để quan sát log thực tế.
                </p>
              </div>
            ) : (
              filteredLogs.map(log => {
                const isSelected = selectedLog?.id === log.id;
                const is429 = log.status === 'rate_limit_429' || log.statusCode === 429;
                const isSuccess = log.status === 'success';
                const isStreaming = log.status === 'streaming';
                const isPending = log.status === 'pending';

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/50'
                        : is429
                        ? 'bg-rose-950/20 hover:bg-rose-950/40 border-rose-900/50'
                        : isSuccess
                        ? 'bg-gray-900/70 hover:bg-gray-850 border-gray-800'
                        : 'bg-gray-900/90 hover:bg-gray-850 border-gray-800'
                    }`}
                  >
                    {/* Log Card Header */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {/* Status Badge */}
                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase ${
                          isSuccess
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : is429
                            ? 'bg-rose-950 text-rose-400 border border-rose-700 animate-pulse'
                            : isStreaming
                            ? 'bg-sky-950 text-sky-400 border border-sky-700'
                            : isPending
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {log.statusCode || log.status}
                        </span>

                        <span className="font-bold text-gray-200 truncate max-w-[140px] sm:max-w-[200px]">
                          {log.title}
                        </span>
                      </div>

                      <span className="text-[10px] text-gray-500 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Meta Row */}
                    <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-gray-400 font-mono mb-1.5">
                      <span className="text-amber-400/90">{log.model}</span>
                      <span>•</span>
                      <span>Key: {log.keyMask}</span>
                      <span>•</span>
                      <span>~{log.payloadMetrics.estimatedTokens} tok</span>
                      {log.durationMs && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400">{log.durationMs}ms</span>
                        </>
                      )}
                    </div>

                    {/* Excerpt Snippet */}
                    {log.rawError ? (
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
        <div className="w-full md:w-1/2 lg:w-7/12 flex flex-col bg-gray-950/60 overflow-hidden">
          {selectedLog ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Inspector Header */}
              <div className="p-3 sm:p-4 border-b border-gray-800 bg-gray-900/60 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    selectedLog.status === 'success'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : selectedLog.status === 'rate_limit_429'
                      ? 'bg-rose-950 text-rose-300 border border-rose-600'
                      : 'bg-amber-950 text-amber-300 border border-amber-700'
                  }`}>
                    {selectedLog.statusCode || selectedLog.status}
                  </span>
                  <h4 className="font-bold text-gray-200 text-xs sm:text-sm truncate">
                    {selectedLog.title}
                  </h4>
                </div>

                <div className="flex items-center gap-1.5">
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
                  className={`px-3 py-1 rounded-md transition-all ${
                    inspectorTab === 'overview' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Tổng quan & Chẩn đoán
                </button>
                <button
                  onClick={() => setInspectorTab('system')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inspectorTab === 'system' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  System Instruction ({Math.round(selectedLog.payloadMetrics.systemInstructionChars / 1000)}k ký tự)
                </button>
                <button
                  onClick={() => setInspectorTab('message')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inspectorTab === 'message' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  User Prompt
                </button>
                <button
                  onClick={() => setInspectorTab('response')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    inspectorTab === 'response' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Phản hồi AI
                </button>
                {selectedLog.rawError && (
                  <button
                    onClick={() => setInspectorTab('error')}
                    className={`px-3 py-1 rounded-md transition-all ${
                      inspectorTab === 'error' ? 'bg-rose-600 text-white' : 'text-rose-400 hover:text-rose-200'
                    }`}
                  >
                    Chi tiết Lỗi
                  </button>
                )}
              </div>

              {/* Inspector Body Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
                {/* 1. Overview Tab */}
                {inspectorTab === 'overview' && (
                  <div className="space-y-4">
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
                        <span className="text-sm font-mono font-bold text-amber-400">{selectedLog.model}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">API Key sử dụng</span>
                        <span className="text-sm font-mono font-bold text-purple-400">{selectedLog.keyMask}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Thời gian phản hồi</span>
                        <span className="text-sm font-mono font-bold text-emerald-400">{selectedLog.durationMs ? `${selectedLog.durationMs}ms` : 'Đang xử lý'}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Ký tự Payload</span>
                        <span className="text-sm font-mono font-bold text-sky-400">
                          {selectedLog.payloadMetrics.systemInstructionChars + selectedLog.payloadMetrics.promptChars} ký tự
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Ước lượng Token</span>
                        <span className="text-sm font-mono font-bold text-indigo-400">~{selectedLog.payloadMetrics.estimatedTokens} Tokens</span>
                      </div>
                      <div className="p-3 rounded-xl bg-gray-900 border border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block">Môi trường máy chủ</span>
                        <span className="text-sm font-mono font-bold text-gray-300 truncate">{selectedLog.hostEnv.hostname}</span>
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
                    <pre className="p-3 rounded-xl bg-gray-900 border border-gray-800 font-mono text-[11px] text-gray-300 whitespace-pre-wrap max-h-96 overflow-y-auto custom-scrollbar">
                      {selectedLog.requestPayload.fullSystemInstruction || selectedLog.requestPayload.systemInstructionSnippet || '(Trống)'}
                    </pre>
                  </div>
                )}

                {/* 3. User Message Tab */}
                {inspectorTab === 'message' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Nội dung người dùng gửi ({selectedLog.payloadMetrics.promptChars} ký tự):
                      </span>
                      <button
                        onClick={() => handleCopyText(selectedLog.requestPayload.message, 'User Prompt')}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-bold transition-all border border-gray-700"
                      >
                        Sao chép
                      </button>
                    </div>
                    <div className="p-3 rounded-xl bg-gray-900 border border-gray-800 font-mono text-[11.5px] text-gray-200 whitespace-pre-wrap">
                      {selectedLog.requestPayload.message || '(Không có tin nhắn)'}
                    </div>
                  </div>
                )}

                {/* 4. Response Tab */}
                {inspectorTab === 'response' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        Nội dung phản hồi từ Gemini:
                      </span>
                      <button
                        onClick={() => handleCopyText(selectedLog.fullResponse || selectedLog.responseSnippet, 'phản hồi AI')}
                        className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-bold transition-all border border-gray-700"
                      >
                        Sao chép
                      </button>
                    </div>
                    <div className="p-3.5 rounded-xl bg-gray-900 border border-gray-800 text-[12px] text-gray-200 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto custom-scrollbar">
                      {selectedLog.fullResponse || selectedLog.responseSnippet || '(Chưa có phản hồi hoặc phản hồi rỗng)'}
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
                      <pre className="p-3 rounded-xl bg-gray-900 border border-gray-800 text-[10px] text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto">
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
                Bấm vào từng dòng log để kiểm tra toàn bộ System Instruction, Payload Token, Model, và Error Stack Trace tương ứng.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
