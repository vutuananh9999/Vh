import React, { useState } from 'react';
import {
  WizardPromptMetrics,
  MODEL_CONTEXT_LIMITS
} from '../services/tokenEstimator';

interface TokenUsageMeterProps {
  metrics: WizardPromptMetrics;
  activeModel: string;
  onModelChange: (modelId: string) => void;
  className?: string;
}

export const TokenUsageMeter: React.FC<TokenUsageMeterProps> = ({
  metrics,
  activeModel,
  onModelChange,
  className = ''
}) => {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const getStatusColor = (status: WizardPromptMetrics['status']) => {
    switch (status) {
      case 'critical':
        return {
          bg: 'bg-rose-500/20',
          border: 'border-rose-500/50',
          text: 'text-rose-400',
          bar: 'from-rose-600 to-red-500 shadow-rose-500/50',
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          label: 'Quá tải / Nguy hiểm'
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/20',
          border: 'border-amber-500/50',
          text: 'text-amber-400',
          bar: 'from-amber-500 to-orange-500 shadow-amber-500/50',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          label: 'Sát giới hạn'
        };
      case 'moderate':
        return {
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          text: 'text-yellow-400',
          bar: 'from-yellow-500 to-amber-500 shadow-yellow-500/40',
          badge: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
          label: 'Trung bình'
        };
      case 'safe':
      default:
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          text: 'text-emerald-400',
          bar: 'from-emerald-500 to-teal-400 shadow-emerald-500/30',
          badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
          label: 'An toàn'
        };
    }
  };

  const style = getStatusColor(metrics.status);
  const formattedTokens = metrics.totalTokens.toLocaleString();
  const formattedLimit = metrics.model.contextLimit.toLocaleString();
  const clampedPercentage = Math.min(100, Math.max(0.1, metrics.usagePercentage));

  return (
    <div className={`w-full ${className}`}>
      {/* Visual Token Usage Bar Widget */}
      <div className={`rounded-2xl border transition-all duration-300 ${style.bg} ${style.border} p-3.5 backdrop-blur-md relative overflow-hidden`}>
        {/* Top Info Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-wide">Thước Đo Ngữ Cảnh (Token Meter)</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${style.badge}`}>
                  {style.label}
                </span>
              </div>
              <p className="text-[10px] text-gray-400">
                Ước tính thời gian thực cho prompt & thiết lập thế giới
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Model Target Selector */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/50 border border-white/10 text-gray-300 text-xs">
              <span className="text-[10px] text-gray-500 uppercase font-mono">Model:</span>
              <select
                value={activeModel}
                onChange={(e) => onModelChange(e.target.value)}
                className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer text-xs"
                title="Chọn model để so sánh hạn mức ngữ cảnh"
              >
                {Object.values(MODEL_CONTEXT_LIMITS).map((m) => (
                  <option key={m.id} value={m.id} className="bg-gray-900 text-white">
                    {m.name} ({m.contextLimit >= 1000000 ? `${(m.contextLimit / 1000000).toFixed(0)}M` : `${Math.round(m.contextLimit / 1000)}K`})
                  </option>
                ))}
              </select>
            </div>

            {/* Breakdown Toggle Button */}
            <button
              onClick={() => setShowBreakdown(true)}
              className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-1 active:scale-95"
              title="Xem chi tiết phân bố token từng phần"
            >
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Phân Tích</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${style.bar} transition-all duration-500 ease-out shadow-sm`}
              style={{ width: `${clampedPercentage}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[11px] font-mono text-gray-400">
            <span className="flex items-center gap-1.5">
              <strong className="text-white font-bold">{formattedTokens}</strong>
              <span className="text-gray-500">/ {formattedLimit} Tokens</span>
              <span className="text-[10px] text-gray-400">({metrics.totalChars.toLocaleString()} ký tự)</span>
            </span>
            <span className={`font-bold ${style.text}`}>
              {metrics.usagePercentage < 0.1 ? '< 0.1%' : `${metrics.usagePercentage}%`} Dung lượng
            </span>
          </div>
        </div>

        {/* Step-specific AI action prompt hint */}
        {metrics.currentStepActionTokens > 0 && (
          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="text-purple-400">⚡</span>
              <span>Lượt gọi AI bước này ({metrics.currentStepActionLabel}):</span>
              <strong className="text-purple-300 font-mono">~{metrics.currentStepActionTokens.toLocaleString()} tokens</strong>
            </span>
            <span className="text-gray-500 italic">Dữ liệu bước hiện tại: ~{metrics.currentStepTokens.toLocaleString()} tokens</span>
          </div>
        )}

        {/* Critical / High Limit Warning Banner */}
        {metrics.warningMessage && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2 animate-fadeIn">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="leading-relaxed">
              <span className="font-bold text-white block mb-0.5">Cảnh báo Giới Hạn Ngữ Cảnh</span>
              {metrics.warningMessage}
            </div>
          </div>
        )}

        {/* Free Tier TPM Warning Banner */}
        {metrics.tpmFreeWarning && (
          <div className="mt-2 p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-[11px] flex items-start gap-2 animate-fadeIn">
            <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="leading-relaxed">
              {metrics.tpmFreeWarning}
            </div>
          </div>
        )}
      </div>

      {/* Detailed Token Breakdown Modal */}
      {showBreakdown && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fadeIn">
          <div className="bg-gray-900 border border-gray-700/60 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-800 bg-gradient-to-r from-gray-900 to-gray-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/20 rounded-2xl border border-cyan-500/30 text-cyan-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Bảng Phân Tích Dung Lượng Token</h3>
                  <p className="text-xs text-cyan-400 font-mono">
                    Tổng cộng: {formattedTokens} / {formattedLimit} Tokens ({metrics.totalChars.toLocaleString()} Ký tự)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBreakdown(false)}
                className="p-2 text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-950/60">
              <div className="p-4 rounded-2xl bg-gray-900/60 border border-gray-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-medium">Model Ngữ Cảnh Hiện Tại:</span>
                  <span className="font-bold text-cyan-300 font-mono">{metrics.model.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-medium">Giới hạn Context Window:</span>
                  <span className="font-bold text-white font-mono">{formattedLimit} Tokens</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-medium">Hạn mức Free Tier TPM:</span>
                  <span className="font-bold text-amber-300 font-mono">{metrics.model.tpmFreeLimit.toLocaleString()} Tokens / phút</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-800">
                  <span className="text-gray-400 font-medium">Tỷ lệ chiếm dụng:</span>
                  <span className={`font-bold font-mono ${style.text}`}>{metrics.usagePercentage}%</span>
                </div>
              </div>

              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1 pt-2">
                Chi Tiết Từng Phần Thiết Lập
              </h4>

              <div className="space-y-2.5">
                {metrics.items.map((item) => {
                  const itemPercentage = metrics.totalTokens > 0
                    ? Math.round((item.tokens / metrics.totalTokens) * 100)
                    : 0;

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-gray-900/40 hover:bg-gray-900/80 border border-gray-800 hover:border-gray-700 transition-all flex flex-col gap-2 group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{item.icon}</span>
                          <div>
                            <span className="text-xs font-bold text-gray-200 block">{item.name}</span>
                            <span className="text-[10px] text-gray-500">{item.category}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-white block">
                            ~{item.tokens.toLocaleString()} tokens
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {item.chars.toLocaleString()} ký tự ({itemPercentage}%)
                          </span>
                        </div>
                      </div>

                      {/* Micro Progress Bar */}
                      <div className="w-full h-1.5 bg-gray-850 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(item.tokens > 0 ? 1 : 0, itemPercentage)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/90 flex justify-between items-center shrink-0">
              <span className="text-xs text-gray-400">
                Mẹo: 1 từ tiếng Việt ~ 1.3 - 1.5 Tokens.
              </span>
              <button
                onClick={() => setShowBreakdown(false)}
                className="px-6 py-2.5 bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
