import React, { useRef, useState } from 'react';
import {
  ConnectionTestResult,
  ExternalProviderProfile,
  ProviderDraftInput,
  ProviderRoutingConfig,
  ProviderTaskRole
} from '../../services/providerTypes.ts';
import { getPresetForProviderType } from '../../services/modelDiscoveryService.ts';
import { providerClientService } from '../../services/providerClientService.ts';
import { providerManagerService } from '../../services/providerManagerService.ts';
import { shareOrDownloadFile } from '../../services/iosNativeBridge.ts';
import { externalProviderService } from '../../services/externalProviderService.ts';
import { maskSecret, secureCredentialStorage } from '../../services/secureCredentialStorage.ts';
import { ProviderEditorForm } from './ProviderEditorForm.tsx';

interface ProviderManagementPanelProps {
  profiles: ExternalProviderProfile[];
  routingConfig: ProviderRoutingConfig;
  onProfilesChanged: (next: ExternalProviderProfile[]) => void;
  onRoutingChanged: (next: ProviderRoutingConfig) => void;
}

export const ProviderManagementPanel: React.FC<ProviderManagementPanelProps> = ({
  profiles,
  routingConfig,
  onProfilesChanged,
  onRoutingChanged
}) => {
  const [editorMode, setEditorMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingProfile, setEditingProfile] = useState<ExternalProviderProfile | null>(null);
  const [testStatuses, setTestStatuses] = useState<
    Record<string, { loading?: boolean; result?: ConnectionTestResult }>
  >({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [revealedKeyIds, setRevealedKeyIds] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeDefaultPro = providerManagerService.getDefaultProvider('pro');
  const activeDefaultFlash = providerManagerService.getDefaultProvider('flash');
  const persistentVaultOk = secureCredentialStorage.isPersistentVaultSupported();

  const reloadProfiles = () => {
    onProfilesChanged(providerManagerService.listProviders());
    onRoutingChanged(providerManagerService.getRoutingConfig());
  };

  const handleSaveDraft = async (draft: ProviderDraftInput, editId?: string) => {
    if (editId) {
      const updated = await providerManagerService.updateProvider(editId, draft);
      setBannerMessage({
        type: 'success',
        text: `Đã cập nhật cấu hình "${updated.name}" (${updated.model}).`
      });
    } else {
      const created = await providerManagerService.createProvider(draft, { activateRouting: true });
      setBannerMessage({
        type: 'success',
        text: `Đã thêm provider "${created.name}" (${created.model}).`
      });
    }
    setEditorMode('closed');
    setEditingProfile(null);
    reloadProfiles();
  };

  const handleDelete = async (id: string) => {
    await providerManagerService.deleteProvider(id);
    setConfirmDeleteId(null);
    setBannerMessage({ type: 'info', text: 'Đã xóa cấu hình provider và khóa mã hóa liên kết.' });
    reloadProfiles();
  };

  const handleDuplicate = async (id: string) => {
    const cloned = await providerManagerService.duplicateProvider(id);
    setBannerMessage({ type: 'success', text: `Đã nhân bản thành "${cloned.name}".` });
    reloadProfiles();
  };

  const handleToggleEnabled = async (id: string) => {
    await providerManagerService.toggleProviderEnabled(id);
    reloadProfiles();
  };

  const handleSetDefaultAndActivate = async (profile: ExternalProviderProfile) => {
    await providerManagerService.setDefaultProvider(profile.id, true);
    externalProviderService.clearAllCooldowns();
    setBannerMessage({
      type: 'success',
      text: `Đã chuyển sang sử dụng "${profile.name}" (${profile.model}) làm mặc định.`
    });
    reloadProfiles();
  };

  const handleChangeRole = async (id: string, role: ProviderTaskRole) => {
    await providerManagerService.updateProvider(id, { role });
    reloadProfiles();
  };

  const handleTestCard = async (profile: ExternalProviderProfile) => {
    setTestStatuses(prev => ({ ...prev, [profile.id]: { loading: true } }));
    const res = await providerClientService.testConnection(profile, 15000);
    await providerManagerService.recordTestResult(profile.id, {
      success: res.success,
      message: res.message
    });
    if (res.success) {
      externalProviderService.clearProfileCooldown(profile.id);
    }
    setTestStatuses(prev => ({
      ...prev,
      [profile.id]: { loading: false, result: res }
    }));
    reloadProfiles();
  };

  const handleExportConfig = () => {
    // Section 7 & 8: Strictly exclude API keys from exported configuration files by default
    const bundle = providerManagerService.exportProvidersBundle({ includeApiKeys: false });
    const json = JSON.stringify(bundle, null, 2);
    const filename = `aetheria-ai-providers-${new Date().toISOString().slice(0, 10)}.json`;
    void shareOrDownloadFile(filename, json, 'application/json');
    setBannerMessage({
      type: 'success',
      text: `Đã xuất ${bundle.providers.length} cấu hình provider (không bao gồm API Key để bảo mật).`
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const { importedCount, needsApiKeyCount } = await providerManagerService.importProvidersBundle(text);
      reloadProfiles();
      setBannerMessage({
        type: needsApiKeyCount > 0 ? 'info' : 'success',
        text:
          needsApiKeyCount > 0
            ? `Đã nhập ${importedCount} provider. Có ${needsApiKeyCount} provider chưa có API Key — bấm "Sửa" để điền Key.`
            : `Đã nhập thành công ${importedCount} cấu hình provider.`
      });
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'Không thể nhập tệp cấu hình JSON.'
      });
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Active Provider & Model Status Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-gray-950 via-gray-950 to-sky-950/30 border border-sky-500/30 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
              Provider &amp; Model Đang Hoạt Động
            </div>
            <div className="mt-1 space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-gray-400">Pro / Sáng tác:</span>
                {routingConfig.activeProBackend === 'external' && activeDefaultPro ? (
                  <span className="font-mono text-emerald-300 font-semibold">
                    {activeDefaultPro.name} · {activeDefaultPro.model}
                  </span>
                ) : (
                  <span className="font-mono text-gray-200">
                    Google Gemini (Mặc định)
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-gray-400">Flash / Chat nhanh:</span>
                {routingConfig.activeFlashBackend === 'external' && activeDefaultFlash ? (
                  <span className="font-mono text-emerald-300 font-semibold">
                    {activeDefaultFlash.name} · {activeDefaultFlash.model}
                  </span>
                ) : (
                  <span className="font-mono text-gray-200">
                    Google Gemini (Mặc định)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditingProfile(null);
                setEditorMode('create');
              }}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow transition-colors"
            >
              + Thêm Provider
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold"
              title="Nhập cấu hình provider từ file JSON"
            >
              Nhập JSON
            </button>
            <button
              type="button"
              onClick={handleExportConfig}
              disabled={profiles.length === 0}
              className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-xs font-semibold disabled:opacity-40"
              title="Xuất cấu hình provider (không bao gồm API Key)"
            >
              Xuất JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </div>

        {/* Role Routing Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-800/80">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 block">
              Nguồn cho Sáng tác &amp; Suy luận (Pro)
            </span>
            <select
              value={routingConfig.activeProBackend}
              onChange={e => {
                const next: ProviderRoutingConfig = {
                  ...routingConfig,
                  activeProBackend: e.target.value as 'gemini' | 'external'
                };
                providerManagerService.saveRoutingConfig(next);
                onRoutingChanged(next);
              }}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500"
            >
              <option value="gemini">Google Gemini (Mặc định)</option>
              <option value="external">Custom AI Provider (Theo danh sách)</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-gray-400 block">
              Nguồn cho Chat &amp; Tác vụ nhanh (Flash)
            </span>
            <select
              value={routingConfig.activeFlashBackend}
              onChange={e => {
                const next: ProviderRoutingConfig = {
                  ...routingConfig,
                  activeFlashBackend: e.target.value as 'gemini' | 'external'
                };
                providerManagerService.saveRoutingConfig(next);
                onRoutingChanged(next);
              }}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-500"
            >
              <option value="gemini">Google Gemini (Mặc định)</option>
              <option value="external">Custom AI Provider (Theo danh sách)</option>
            </select>
          </label>
        </div>

        <div className="text-[11px] text-gray-400 flex items-center gap-2 rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
          <span>
            Khi Custom Provider gặp lỗi hoặc quá tải, hệ thống chỉ xoay giữa các Custom Provider đang bật (không tự chuyển sang Google API).
          </span>
        </div>

        <div className="text-[11px] text-gray-400 flex items-center gap-1.5 pt-1">
          <span
            className={`w-2 h-2 rounded-full ${
              persistentVaultOk ? 'bg-emerald-400' : 'bg-amber-400'
            }`}
          />
          <span>
            {persistentVaultOk
              ? 'API Key được mã hóa AES-GCM (Web Crypto) tách riêng khỏi tệp cấu hình.'
              : 'Môi trường trình duyệt hạn chế IndexedDB — Key chỉ lưu tạm trong phiên hiện tại.'}
          </span>
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : bannerMessage.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              : 'bg-sky-950/40 border-sky-500/40 text-sky-300'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-current opacity-70 hover:opacity-100 font-bold px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Create / Edit Form */}
      {editorMode !== 'closed' && (
        <ProviderEditorForm
          initialProfile={editingProfile}
          onSave={handleSaveDraft}
          onCancel={() => {
            setEditorMode('closed');
            setEditingProfile(null);
          }}
        />
      )}

      {/* Providers List */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            Danh sách Custom AI Provider ({profiles.length})
          </h3>
          <span className="text-[11px] text-gray-500">
            Chuyển đổi provider nhanh không cần nhập lại API Key
          </span>
        </div>

        {profiles.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-gray-800 space-y-2">
            <div className="text-xs text-gray-400">
              Chưa có Custom AI Provider nào được cấu hình.
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingProfile(null);
                setEditorMode('create');
              }}
              className="px-3.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-300 text-xs font-semibold"
            >
              + Kết nối Provider đầu tiên
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {profiles.map(p => {
              const configured = providerManagerService.isConfiguredProvider(p);
              const preset = getPresetForProviderType(p.providerType);
              const tState = testStatuses[p.id];
              const isRevealed = Boolean(revealedKeyIds[p.id]);
              const isDeleteConfirm = confirmDeleteId === p.id;
              let hostLabel = p.baseUrl;
              try {
                hostLabel = new URL(p.baseUrl).host;
              } catch {
                // keep raw
              }

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-xl border space-y-2.5 transition-colors ${
                    p.isDefault && p.enabled
                      ? 'bg-gray-950 border-sky-500/50 shadow-sm shadow-sky-950/30'
                      : p.enabled
                      ? 'bg-gray-950 border-gray-800'
                      : 'bg-gray-950/40 border-gray-900 opacity-65'
                  }`}
                >
                  {/* Top Summary */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{p.name}</span>
                        {p.isDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-semibold">
                            Mặc định
                          </span>
                        )}
                        {configured ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium">
                            Đã cấu hình
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300 font-medium">
                            Chưa hoàn tất (thiếu Key hoặc Model)
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-gray-400 break-all">
                        {preset.shortLabel} · {hostLabel} ·{' '}
                        <span className="text-gray-200">{p.model || '(chưa chọn model)'}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                        <span className="font-mono">
                          Key:{' '}
                          {p.authScheme === 'none'
                            ? 'Không yêu cầu'
                            : isRevealed && p.apiKey
                            ? p.apiKey
                            : maskSecret(p.apiKey)}
                        </span>
                        {p.apiKey && (
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedKeyIds(prev => ({ ...prev, [p.id]: !prev[p.id] }))
                            }
                            className="text-[10px] text-sky-400 hover:text-sky-300 underline"
                          >
                            {isRevealed ? 'Ẩn' : 'Hiện'}
                          </button>
                        )}
                        {typeof p.temperature === 'number' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800">
                            temp: {p.temperature}
                          </span>
                        )}
                        {typeof p.maxTokens === 'number' && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800">
                            max: {p.maxTokens}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Toolbar */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <select
                        value={p.role}
                        onChange={e => void handleChangeRole(p.id, e.target.value as ProviderTaskRole)}
                        className="bg-gray-900 border border-gray-700 rounded-md px-2 py-1 text-[11px] text-gray-200 outline-none"
                        title="Vai trò sử dụng"
                      >
                        <option value="all">Pro + Flash</option>
                        <option value="pro">Chỉ Pro</option>
                        <option value="flash">Chỉ Flash</option>
                      </select>

                      {!p.isDefault && configured && (
                        <button
                          type="button"
                          onClick={() => void handleSetDefaultAndActivate(p)}
                          className="px-2 py-1 rounded-md bg-sky-600/20 hover:bg-sky-600/35 border border-sky-500/40 text-sky-300 text-[11px] font-semibold"
                        >
                          Đặt mặc định
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleTestCard(p)}
                        disabled={tState?.loading || !configured}
                        className="px-2 py-1 rounded-md bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-300 text-[11px] font-semibold disabled:opacity-40"
                      >
                        {tState?.loading ? 'Testing...' : 'Test'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingProfile(p);
                          setEditorMode('edit');
                        }}
                        className="px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-[11px] font-semibold"
                      >
                        Sửa
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDuplicate(p.id)}
                        className="px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-[11px]"
                        title="Nhân bản provider"
                      >
                        Nhân bản
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleToggleEnabled(p.id)}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold border ${
                          p.enabled
                            ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-gray-800 border-gray-700 text-gray-400'
                        }`}
                      >
                        {p.enabled ? 'Đang bật' : 'Đang tắt'}
                      </button>

                      {isDeleteConfirm ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDelete(p.id)}
                            className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                          >
                            Xác nhận xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-1 rounded-md bg-gray-800 text-gray-300 text-[11px]"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(p.id)}
                          className="px-2 py-1 rounded-md bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 text-rose-300 text-[11px]"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Test Connection Feedback */}
                  {(tState?.result?.message || p.lastTestMessage) && (
                    <div
                      className={`text-[11px] font-mono px-2.5 py-1.5 rounded-lg border ${
                        (tState?.result ? tState.result.success : p.lastTestSuccess)
                          ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {tState?.result?.message || p.lastTestMessage}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
