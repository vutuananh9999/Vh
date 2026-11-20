import React, { useEffect, useState } from 'react';
import {
  AIProviderType,
  ConnectionTestResult,
  ExternalProviderProfile,
  ProviderAuthScheme,
  ProviderDraftInput,
  ProviderTaskRole
} from '../../services/providerTypes.ts';
import {
  PROVIDER_PRESETS,
  detectProviderType,
  getPresetForProviderType,
  validateBaseUrl
} from '../../services/modelDiscoveryService.ts';
import { providerClientService } from '../../services/providerClientService.ts';
import { maskSecret } from '../../services/secureCredentialStorage.ts';
import { SearchableModelSelect } from './SearchableModelSelect.tsx';

interface ProviderEditorFormProps {
  initialProfile?: ExternalProviderProfile | null;
  onSave: (draft: ProviderDraftInput, editId?: string) => Promise<void>;
  onCancel: () => void;
}

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

const SELECTABLE_PROVIDER_TYPES: AIProviderType[] = [
  'openai_compatible',
  'openrouter',
  'openai',
  'deepseek',
  'anthropic',
  'groq',
  'xai',
  'gemini_native'
];

export const ProviderEditorForm: React.FC<ProviderEditorFormProps> = ({
  initialProfile,
  onSave,
  onCancel
}) => {
  const isEditing = Boolean(initialProfile?.id);
  const initialType: AIProviderType =
    initialProfile?.providerType === 'custom'
      ? 'openai_compatible'
      : initialProfile?.providerType || 'openai_compatible';
  const initialPreset = getPresetForProviderType(initialType);

  const [providerName, setProviderName] = useState(initialProfile?.name || '');
  const [providerType, setProviderType] = useState<AIProviderType>(initialType);
  const [baseUrl, setBaseUrl] = useState(
    initialProfile?.baseUrl || initialPreset.defaultBaseUrl
  );
  // IMPORTANT: Do NOT pre-populate raw apiKey text when editing unless user enters a replacement,
  // or keep it empty with clear "stored key preserved" state; still allow clicking eye to inspect stored key if desired.
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [revealStoredKey, setRevealStoredKey] = useState(false);
  const [clearStoredKey, setClearStoredKey] = useState(false);

  const [model, setModel] = useState(initialProfile?.model || '');
  const [role, setRole] = useState<ProviderTaskRole>(initialProfile?.role || 'all');
  const [enabled, setEnabled] = useState<boolean>(initialProfile?.enabled ?? true);
  const [isDefault, setIsDefault] = useState<boolean>(initialProfile?.isDefault ?? false);
  const [authScheme, setAuthScheme] = useState<ProviderAuthScheme>(
    initialProfile?.authScheme || initialPreset.defaultAuthScheme
  );
  const [authHeaderName, setAuthHeaderName] = useState(initialProfile?.authHeaderName || '');

  const [temperatureStr, setTemperatureStr] = useState<string>(
    typeof initialProfile?.temperature === 'number' ? String(initialProfile.temperature) : ''
  );
  const [maxTokensStr, setMaxTokensStr] = useState<string>(
    typeof initialProfile?.maxTokens === 'number' ? String(initialProfile.maxTokens) : ''
  );
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() => {
    const entries = Object.entries(initialProfile?.customHeaders || {});
    return entries.map(([k, v], i) => ({ id: `hdr_${i}_${k}`, key: k, value: v }));
  });
  const [showAdvanced, setShowAdvanced] = useState<boolean>(
    Boolean(
      typeof initialProfile?.temperature === 'number' ||
        typeof initialProfile?.maxTokens === 'number' ||
        (initialProfile?.customHeaders && Object.keys(initialProfile.customHeaders).length > 0) ||
        initialProfile?.authHeaderName
    )
  );

  const [detectedBadge, setDetectedBadge] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasExistingStoredKey = Boolean(
    isEditing && !clearStoredKey && (initialProfile?.apiKey?.trim() || initialProfile?.hasStoredApiKey)
  );
  const effectiveApiKeyForRequests = apiKeyInput.trim()
    ? apiKeyInput.trim()
    : clearStoredKey
    ? ''
    : initialProfile?.apiKey?.trim() || '';

  useEffect(() => {
    setTestResult(null);
    setFormError(null);
  }, [baseUrl, apiKeyInput, model, providerType, authScheme]);

  const handleTypeSelect = (nextType: AIProviderType) => {
    const prevPreset = getPresetForProviderType(providerType);
    const nextPreset = getPresetForProviderType(nextType);
    setProviderType(nextType);
    setAuthScheme(nextPreset.defaultAuthScheme);

    // Update Base URL automatically only if it's still empty or matches previous preset's default
    if (!baseUrl.trim() || baseUrl.trim() === prevPreset.defaultBaseUrl) {
      setBaseUrl(nextPreset.defaultBaseUrl);
    }
    setDetectedBadge(null);
  };

  const handleBaseUrlOrKeyAutoDetect = (nextUrl: string, nextKey: string) => {
    if (providerType === 'openai_compatible') {
      const detected = detectProviderType(nextUrl, nextKey, 'openai_compatible');
      if (detected !== 'openai_compatible') {
        const preset = getPresetForProviderType(detected);
        setDetectedBadge(`Tự nhận diện: ${preset.shortLabel}`);
      } else {
        setDetectedBadge(null);
      }
    }
  };

  const buildCustomHeadersRecord = (): Record<string, string> | undefined => {
    const rec: Record<string, string> = {};
    for (const row of headerRows) {
      const k = row.key.trim();
      const v = row.value.trim();
      if (k && v) {
        rec[k] = v;
      }
    }
    return Object.keys(rec).length > 0 ? rec : undefined;
  };

  const buildCandidateProfileForValidation = (): {
    draft?: ProviderDraftInput;
    profile?: ExternalProviderProfile;
    error?: string;
  } => {
    const urlCheck = validateBaseUrl(baseUrl);
    if (!urlCheck.valid) {
      return { error: urlCheck.error || 'Base URL không hợp lệ.' };
    }
    if (authScheme !== 'none' && !effectiveApiKeyForRequests) {
      return { error: 'Vui lòng nhập API Key (hoặc chọn Auth: None nếu local server không cần key).' };
    }
    if (!model.trim()) {
      return { error: 'Vui lòng chọn hoặc nhập Model ID.' };
    }

    let parsedTemp: number | undefined;
    if (temperatureStr.trim() !== '') {
      const num = Number(temperatureStr);
      if (Number.isNaN(num) || num < 0 || num > 2) {
        return { error: 'Temperature phải nằm trong khoảng 0.0 – 2.0.' };
      }
      parsedTemp = num;
    }

    let parsedMaxTokens: number | undefined;
    if (maxTokensStr.trim() !== '') {
      const num = Math.floor(Number(maxTokensStr));
      if (Number.isNaN(num) || num < 1) {
        return { error: 'Max Output Tokens phải là số nguyên lớn hơn 0.' };
      }
      parsedMaxTokens = num;
    }

    if (authScheme === 'custom_header' && !authHeaderName.trim()) {
      return { error: 'Vui lòng nhập tên Custom Auth Header (ví dụ: X-API-Token).' };
    }

    const customHeaders = buildCustomHeadersRecord();
    const preset = getPresetForProviderType(providerType);
    const resolvedName =
      providerName.trim() || `${preset.shortLabel} · ${model.trim()}`;

    const draft: ProviderDraftInput = {
      name: resolvedName,
      providerType,
      baseUrl: urlCheck.normalized,
      apiKey: apiKeyInput.trim() || undefined,
      clearApiKey: clearStoredKey,
      model: model.trim(),
      temperature: parsedTemp,
      maxTokens: parsedMaxTokens,
      customHeaders,
      authScheme,
      authHeaderName: authScheme === 'custom_header' ? authHeaderName.trim() : undefined,
      role,
      enabled,
      isDefault
    };

    const profile: ExternalProviderProfile = {
      id: initialProfile?.id || 'draft_test',
      name: resolvedName,
      providerType,
      baseUrl: urlCheck.normalized,
      apiKey: effectiveApiKeyForRequests,
      model: model.trim(),
      temperature: parsedTemp,
      maxTokens: parsedMaxTokens,
      customHeaders,
      authScheme,
      authHeaderName: authScheme === 'custom_header' ? authHeaderName.trim() : undefined,
      role,
      enabled,
      isDefault,
      priority: initialProfile?.priority ?? 0
    };

    return { draft, profile };
  };

  const handleTestConnection = async () => {
    setFormError(null);
    const built = buildCandidateProfileForValidation();
    if (built.error || !built.profile) {
      setTestResult({
        success: false,
        latencyMs: 0,
        errorCode: 'VALIDATION_ERROR',
        message: built.error || 'Thông tin cấu hình chưa đầy đủ.'
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await providerClientService.testConnection(built.profile, 15000);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const built = buildCandidateProfileForValidation();
    if (built.error || !built.draft) {
      setFormError(built.error || 'Vui lòng kiểm tra lại các trường bắt buộc.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(built.draft, initialProfile?.id);
    } catch (err: any) {
      setFormError(err?.message || 'Không thể lưu cấu hình provider.');
    } finally {
      setIsSaving(false);
    }
  };

  const preset = getPresetForProviderType(providerType);

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-xl bg-gray-950/90 border border-sky-500/35 space-y-4 animate-fadeIn"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
        <div>
          <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
            {isEditing ? `Chỉnh sửa Provider: ${initialProfile?.name}` : 'Thêm Custom AI Provider Mới'}
          </h4>
          {detectedBadge && (
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              {detectedBadge}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-md hover:bg-gray-800"
        >
          Đóng
        </button>
      </div>

      {/* Row 1: Provider Type & Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-gray-300 block">Loại Provider *</span>
          <select
            value={providerType}
            onChange={e => handleTypeSelect(e.target.value as AIProviderType)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-sky-500"
          >
            {SELECTABLE_PROVIDER_TYPES.map(t => (
              <option key={t} value={t}>
                {PROVIDER_PRESETS[t].label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-gray-300 block">Tên hiển thị Provider</span>
          <input
            type="text"
            value={providerName}
            onChange={e => setProviderName(e.target.value)}
            placeholder={`VD: ${preset.shortLabel} Chính`}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-sky-500"
          />
        </label>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">{preset.note}</p>

      {/* Row 2: Base URL */}
      <label className="space-y-1 block">
        <span className="text-[11px] font-semibold text-gray-300 block">Base URL *</span>
        <input
          type="url"
          value={baseUrl}
          onChange={e => {
            const val = e.target.value;
            setBaseUrl(val);
            handleBaseUrlOrKeyAutoDetect(val, effectiveApiKeyForRequests);
          }}
          placeholder={preset.defaultBaseUrl}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-gray-500 outline-none focus:border-sky-500"
        />
      </label>

      {/* Row 3: API Key with Mask & Show/Hide Toggle + Existing Key Preservation */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-gray-300">
            API Key {authScheme === 'none' ? '(Không bắt buộc)' : '*'}
          </span>
          {hasExistingStoredKey && !apiKeyInput && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-emerald-400 font-mono">
                Đã lưu: {revealStoredKey ? initialProfile?.apiKey : maskSecret(initialProfile?.apiKey)}
              </span>
              {initialProfile?.apiKey && (
                <button
                  type="button"
                  onClick={() => setRevealStoredKey(prev => !prev)}
                  className="text-sky-400 hover:text-sky-300 underline"
                >
                  {revealStoredKey ? 'Ẩn key cũ' : 'Xem key cũ'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setClearStoredKey(true)}
                className="text-rose-400 hover:text-rose-300 underline"
              >
                Xóa key
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={apiKeyInput}
            onChange={e => {
              const val = e.target.value;
              setApiKeyInput(val);
              setClearStoredKey(false);
              handleBaseUrlOrKeyAutoDetect(baseUrl, val);
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              hasExistingStoredKey
                ? 'Để trống để giữ nguyên API Key đã mã hóa, hoặc nhập Key mới để thay thế...'
                : preset.keyPlaceholder
            }
            className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2 pl-3 pr-14 text-xs font-mono text-white placeholder-gray-500 outline-none focus:border-sky-500"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(prev => !prev)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-[11px] text-gray-300"
          >
            {showApiKey ? 'Ẩn' : 'Hiện'}
          </button>
        </div>
      </div>

      {/* Row 4: Automatic Searchable Model Discovery */}
      <SearchableModelSelect
        providerType={providerType}
        baseUrl={baseUrl}
        apiKey={effectiveApiKeyForRequests}
        authScheme={authScheme}
        authHeaderName={authHeaderName}
        customHeaders={buildCustomHeadersRecord()}
        value={model}
        onChange={setModel}
        onProviderDetected={detected => {
          if (providerType === 'openai_compatible' && detected !== 'openai_compatible') {
            setDetectedBadge(`Tự nhận diện: ${getPresetForProviderType(detected).shortLabel}`);
          }
        }}
      />

      {/* Row 5: Role & Activation Flags */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-gray-300 block">Vai trò tác vụ</span>
          <select
            value={role}
            onChange={e => setRole(e.target.value as ProviderTaskRole)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-sky-500"
          >
            <option value="all">Mọi tác vụ (Pro + Flash)</option>
            <option value="pro">Chỉ Sáng tác / Suy luận (Pro)</option>
            <option value="flash">Chỉ Chat / Quét nhanh (Flash)</option>
          </select>
        </label>

        <label className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-900 border border-gray-800 cursor-pointer self-end">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-950 text-sky-500"
          />
          <span className="text-xs text-gray-200">Kích hoạt Provider</span>
        </label>

        <label className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-900 border border-gray-800 cursor-pointer self-end">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={e => setIsDefault(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-950 text-sky-500"
          />
          <span className="text-xs text-gray-200">Đặt làm mặc định</span>
        </label>
      </div>

      {/* Advanced Parameters Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(prev => !prev)}
          className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1"
        >
          <span>{showAdvanced ? '▾ Ẩn tham số nâng cao' : '▸ Tham số nâng cao (Temperature, Max Tokens, Custom Headers, Auth)'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 p-3 rounded-lg bg-gray-900/70 border border-gray-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-gray-300">
                  <span>Temperature (0.0 – 2.0)</span>
                  <span className="font-mono text-gray-400">
                    {temperatureStr.trim() === '' ? 'Mặc định theo tác vụ' : temperatureStr}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={temperatureStr === '' ? '0.7' : temperatureStr}
                    onChange={e => setTemperatureStr(e.target.value)}
                    className="flex-1 accent-sky-500"
                  />
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.05"
                    value={temperatureStr}
                    onChange={e => setTemperatureStr(e.target.value)}
                    placeholder="Auto"
                    className="w-16 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-sky-500"
                  />
                  {temperatureStr !== '' && (
                    <button
                      type="button"
                      onClick={() => setTemperatureStr('')}
                      className="text-[10px] text-gray-400 hover:text-white"
                    >
                      Xóa
                    </button>
                  )}
                </div>
              </div>

              <label className="space-y-1">
                <span className="text-[11px] text-gray-300 block">Max Output Tokens (tùy chọn)</span>
                <input
                  type="number"
                  min="1"
                  max="128000"
                  value={maxTokensStr}
                  onChange={e => setMaxTokensStr(e.target.value)}
                  placeholder="VD: 4096 (để trống = tự động)"
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-sky-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[11px] text-gray-300 block">Phương thức xác thực (Auth Scheme)</span>
                <select
                  value={authScheme}
                  onChange={e => setAuthScheme(e.target.value as ProviderAuthScheme)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500"
                >
                  <option value="bearer">Authorization: Bearer (Chuẩn OpenAI)</option>
                  <option value="x-api-key">x-api-key (Anthropic)</option>
                  <option value="x-goog-api-key">x-goog-api-key (Gemini REST)</option>
                  <option value="custom_header">Custom Header</option>
                  <option value="none">Không dùng Key (Local endpoint)</option>
                </select>
              </label>

              {authScheme === 'custom_header' && (
                <label className="space-y-1">
                  <span className="text-[11px] text-gray-300 block">Tên Header xác thực</span>
                  <input
                    type="text"
                    value={authHeaderName}
                    onChange={e => setAuthHeaderName(e.target.value)}
                    placeholder="VD: X-API-Token"
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-sky-500"
                  />
                </label>
              )}
            </div>

            {/* Custom HTTP Headers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-300">Custom HTTP Headers (tùy chọn)</span>
                <button
                  type="button"
                  onClick={() =>
                    setHeaderRows(prev => [
                      ...prev,
                      { id: `hdr_${Date.now()}_${prev.length}`, key: '', value: '' }
                    ])
                  }
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold"
                >
                  + Thêm Header
                </button>
              </div>
              {headerRows.map((row, idx) => (
                <div key={row.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.key}
                    onChange={e => {
                      const val = e.target.value;
                      setHeaderRows(prev => prev.map((r, i) => (i === idx ? { ...r, key: val } : r)));
                    }}
                    placeholder="Header Name (vd: X-Org-Id)"
                    className="flex-1 bg-gray-950 border border-gray-700 rounded px-2.5 py-1 text-xs font-mono text-white outline-none focus:border-sky-500"
                  />
                  <input
                    type="text"
                    value={row.value}
                    onChange={e => {
                      const val = e.target.value;
                      setHeaderRows(prev => prev.map((r, i) => (i === idx ? { ...r, value: val } : r)));
                    }}
                    placeholder="Value"
                    className="flex-1 bg-gray-950 border border-gray-700 rounded px-2.5 py-1 text-xs font-mono text-white outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setHeaderRows(prev => prev.filter((_, i) => i !== idx))}
                    className="px-2 py-1 rounded bg-rose-950/50 text-rose-300 text-xs hover:bg-rose-900/60"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Feedback Banners */}
      {formError && (
        <div className="p-2.5 rounded-lg bg-rose-950/45 border border-rose-500/40 text-xs text-rose-300">
          {formError}
        </div>
      )}

      {testResult && (
        <div
          className={`p-2.5 rounded-lg border text-xs font-mono ${
            testResult.success
              ? 'bg-emerald-950/45 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/45 border-rose-500/40 text-rose-300'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-800">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting || isSaving}
          className="px-3.5 py-2 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-200 text-xs font-semibold disabled:opacity-40"
        >
          {isTesting ? 'Đang kiểm tra kết nối...' : 'Test Connection'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold"
        >
          Hủy
        </button>

        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-40 shadow"
        >
          {isSaving ? 'Đang lưu...' : isEditing ? 'Lưu Cập Nhật' : 'Lưu Provider'}
        </button>
      </div>
    </form>
  );
};
