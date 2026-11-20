import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AIProviderType,
  DiscoveredModel,
  ModelDiscoveryResult,
  ProviderAuthScheme
} from '../../services/providerTypes.ts';
import {
  modelDiscoveryService,
  validateBaseUrl
} from '../../services/modelDiscoveryService.ts';

interface SearchableModelSelectProps {
  providerType: AIProviderType;
  baseUrl: string;
  apiKey: string;
  authScheme?: ProviderAuthScheme;
  authHeaderName?: string;
  customHeaders?: Record<string, string>;
  value: string;
  onChange: (modelId: string) => void;
  onProviderDetected?: (detected: AIProviderType) => void;
}

function formatContextTokens(n?: number): string {
  if (!n || n <= 0) return '';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M ctx`;
  if (n >= 1000) return `${Math.round(n / 1000)}K ctx`;
  return `${n} ctx`;
}

export const SearchableModelSelect: React.FC<SearchableModelSelectProps> = ({
  providerType,
  baseUrl,
  apiKey,
  authScheme,
  authHeaderName,
  customHeaders,
  value,
  onChange,
  onProviderDetected
}) => {
  const [discovery, setDiscovery] = useState<ModelDiscoveryResult>({
    status: 'idle',
    models: [],
    fromCache: false,
    fetchedAt: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [manualFallback, setManualFallback] = useState(false);
  const [missingSelectedWarning, setMissingSelectedWarning] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  const customHeadersKey = useMemo(() => JSON.stringify(customHeaders || {}), [customHeaders]);

  const canAutoDiscover = useMemo(() => {
    const urlCheck = validateBaseUrl(baseUrl);
    if (!urlCheck.valid) return false;
    if (authScheme === 'none') return true;
    return Boolean(apiKey && apiKey.trim().length >= 4);
  }, [baseUrl, apiKey, authScheme]);

  const runDiscovery = async (forceRefresh: boolean = false) => {
    const urlCheck = validateBaseUrl(baseUrl);
    if (!urlCheck.valid) {
      setDiscovery({
        status: 'error',
        models: [],
        errorMessage: urlCheck.error || 'Base URL không hợp lệ.',
        fromCache: false,
        fetchedAt: Date.now()
      });
      return;
    }

    if (authScheme !== 'none' && !apiKey?.trim()) {
      setDiscovery({
        status: 'error',
        models: [],
        errorMessage: 'Cần nhập API Key để tự động quét danh sách model.',
        fromCache: false,
        fetchedAt: Date.now()
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDiscovery(prev => ({
      ...prev,
      status: 'loading',
      errorMessage: undefined
    }));

    try {
      const res = await modelDiscoveryService.discoverModels({
        providerType,
        baseUrl,
        apiKey,
        authScheme,
        authHeaderName,
        customHeaders,
        forceRefresh,
        signal: controller.signal
      });

      if (controller.signal.aborted) return;

      setDiscovery(res);

      if (res.detectedProviderType && onProviderDetected) {
        onProviderDetected(res.detectedProviderType);
      }

      const currentVal = latestValueRef.current.trim();
      if (res.status === 'success' && res.models.length > 0) {
        setManualFallback(false);
        if (currentVal) {
          const stillExists = res.models.some(m => m.id === currentVal);
          if (!stillExists) {
            setMissingSelectedWarning(
              `Model "${currentVal}" không có trong danh sách trả về mới nhất từ API. Hãy chọn model khác từ danh sách hoặc giữ thủ công.`
            );
          } else {
            setMissingSelectedWarning(null);
          }
        } else {
          setMissingSelectedWarning(null);
          // Do not force an arbitrary guess if multiple exist unless user picks, or auto-open dropdown cleanly
        }
      } else if (res.status === 'unsupported' || res.status === 'error') {
        setMissingSelectedWarning(null);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setDiscovery({
        status: 'error',
        models: [],
        errorMessage: err?.message || 'Lỗi khi quét danh sách model.',
        fromCache: false,
        fetchedAt: Date.now()
      });
    }
  };

  // Debounced automatic model discovery when connection details change
  useEffect(() => {
    if (!canAutoDiscover) {
      abortRef.current?.abort();
      setDiscovery({
        status: 'idle',
        models: [],
        fromCache: false,
        fetchedAt: 0
      });
      setMissingSelectedWarning(null);
      return;
    }

    const timer = setTimeout(() => {
      void runDiscovery(false);
    }, 550);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey, providerType, authScheme, authHeaderName, customHeadersKey, canAutoDiscover]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return discovery.models;
    return discovery.models.filter(
      m =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.ownedBy && m.ownedBy.toLowerCase().includes(q)) ||
        m.providerName.toLowerCase().includes(q)
    );
  }, [discovery.models, searchQuery]);

  const selectedModelMeta: DiscoveredModel | undefined = useMemo(
    () => discovery.models.find(m => m.id === value.trim()),
    [discovery.models, value]
  );

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-300">Model AI *</span>
          {discovery.status === 'loading' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-sky-400">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              Đang quét model từ API...
            </span>
          )}
          {discovery.status === 'success' && (
            <span className="text-[10px] text-emerald-400 font-medium">
              {discovery.models.length} model khả dụng
              {discovery.fromCache ? ' (cache)' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void runDiscovery(true)}
            disabled={discovery.status === 'loading' || !canAutoDiscover}
            className="px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-[11px] text-gray-200 disabled:opacity-40 flex items-center gap-1 transition-colors"
            title="Tải lại danh sách model trực tiếp từ API"
          >
            <svg
              className={`w-3 h-3 ${discovery.status === 'loading' ? 'animate-spin text-sky-400' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Làm mới Model
          </button>

          <button
            type="button"
            onClick={() => {
              setManualFallback(prev => !prev);
              setIsDropdownOpen(false);
            }}
            className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
              manualFallback
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
            }`}
            title="Chỉ dùng khi API không hỗ trợ endpoint /models"
          >
            {manualFallback ? 'Dùng danh sách API' : 'Nhập thủ công (Fallback)'}
          </button>
        </div>
      </div>

      {/* Discovery Dropdown or Manual Fallback Input */}
      {!manualFallback && discovery.models.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen(prev => !prev)}
            className="w-full flex items-center justify-between gap-2 bg-gray-900 border border-gray-700 hover:border-sky-500/70 rounded-lg px-3 py-2 text-left text-xs transition-colors"
          >
            <div className="min-w-0 flex-1">
              {value.trim() ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-white truncate">{value}</span>
                  {selectedModelMeta && selectedModelMeta.name !== selectedModelMeta.id && (
                    <span className="text-[11px] text-gray-400 truncate">
                      ({selectedModelMeta.name})
                    </span>
                  )}
                  {selectedModelMeta?.contextLength && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-mono">
                      {formatContextTokens(selectedModelMeta.contextLength)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-gray-500">
                  Chọn một model từ {discovery.models.length} model đã quét...
                </span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className="absolute z-40 mt-1.5 w-full rounded-xl bg-gray-950 border border-gray-700 shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-gray-800 bg-gray-900/90">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm model theo ID, tên hoặc hãng..."
                  autoFocus
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-sky-500"
                />
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-gray-800/60 custom-scrollbar">
                {filteredModels.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-500">
                    Không tìm thấy model nào khớp "{searchQuery}".
                  </div>
                ) : (
                  filteredModels.map(m => {
                    const isSelected = m.id === value.trim();
                    const ctxLabel = formatContextTokens(m.contextLength);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onChange(m.id);
                          setMissingSelectedWarning(null);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-start justify-between gap-2 hover:bg-sky-500/10 transition-colors ${
                          isSelected ? 'bg-sky-500/15 border-l-2 border-sky-400' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-mono text-white truncate">{m.id}</div>
                          {m.name && m.name !== m.id && (
                            <div className="text-[11px] text-gray-400 truncate">{m.name}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          {ctxLabel && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">
                              {ctxLabel}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                            {m.ownedBy || m.providerName}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => {
            onChange(e.target.value);
            setMissingSelectedWarning(null);
          }}
          placeholder={
            !canAutoDiscover
              ? 'Nhập Base URL + API Key để tự quét model, hoặc nhập thủ công...'
              : 'Nhập Model ID thủ công (vd: gpt-4o, claude-sonnet-4...)'
          }
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-gray-500 outline-none focus:border-sky-500"
        />
      )}

      {/* Status Messages */}
      {!canAutoDiscover && discovery.status === 'idle' && (
        <div className="text-[11px] text-gray-500">
          Nhập Base URL hợp lệ và API Key — hệ thống sẽ tự động tải danh sách model khả dụng từ API.
        </div>
      )}

      {missingSelectedWarning && (
        <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300">
          {missingSelectedWarning}
        </div>
      )}

      {(discovery.status === 'error' || discovery.status === 'unsupported' || discovery.status === 'empty') &&
        discovery.errorMessage && (
          <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-rose-950/35 border border-rose-500/35 text-rose-300 leading-relaxed">
            {discovery.errorMessage}
          </div>
        )}
    </div>
  );
};
