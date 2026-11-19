import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import {
  googleDriveService,
  DriveUserInfo,
  DriveSyncFileItem,
  DriveSyncPayload,
  DriveAuthError,
  DriveUnauthorizedDomainError,
  DriveInsufficientScopeError
} from '../services/googleDriveService.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type ConfirmModalState =
  | {
      type: 'overwrite_drive';
      title: string;
      description: string;
      existingFile: DriveSyncFileItem;
      targetFilename: string;
      payload: DriveSyncPayload;
    }
  | {
      type: 'delete_drive';
      title: string;
      description: string;
      file: DriveSyncFileItem;
    }
  | {
      type: 'restore_local';
      title: string;
      file: DriveSyncFileItem;
      payload: DriveSyncPayload;
    };

function formatBytes(bytesStr?: string): string {
  const bytes = Number(bytesStr || 0);
  if (!bytes || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(isoOrMs?: string | number): string {
  if (!isoOrMs) return 'Không rõ';
  const d = new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return 'Không rõ';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export const GoogleDriveSyncModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { story, storiesList, refreshFromStorage } = useStory();

  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !googleDriveService.getAccessToken());
  const [user, setUser] = useState<DriveUserInfo | null>(() => googleDriveService.getCurrentUser());
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveSyncFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [includeSettings, setIncludeSettings] = useState(true);
  const [includeApiKeys, setIncludeApiKeys] = useState(false);

  const [restoreMode, setRestoreMode] = useState<'merge_newer' | 'overwrite_matching' | 'duplicate_new'>('merge_newer');
  const [restoreSettingsFlag, setRestoreSettingsFlag] = useState(true);
  const [restoreApiKeysFlag, setRestoreApiKeysFlag] = useState(false);

  const [confirmState, setConfirmState] = useState<ConfirmModalState | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [unauthorizedDomainInfo, setUnauthorizedDomainInfo] = useState<{ hostname: string; projectId: string } | null>(null);
  const [insufficientScopeFlag, setInsufficientScopeFlag] = useState(false);

  const loadDriveFiles = useCallback(async () => {
    if (!googleDriveService.getAccessToken()) {
      setNeedsAuth(true);
      return;
    }
    setIsLoadingFiles(true);
    try {
      const result = await googleDriveService.listSyncFiles();
      setFolderId(result.folderId);
      setFiles(result.files);
      setNeedsAuth(false);
    } catch (err: any) {
      if (err instanceof DriveUnauthorizedDomainError) {
        setUnauthorizedDomainInfo({ hostname: err.hostname, projectId: err.projectId });
        setNeedsAuth(true);
        setStatusNotice({ kind: 'error', message: err.message });
      } else if (err instanceof DriveInsufficientScopeError) {
        setInsufficientScopeFlag(true);
        setNeedsAuth(true);
        setStatusNotice({ kind: 'error', message: err.message });
      } else if (err instanceof DriveAuthError) {
        setNeedsAuth(true);
        setStatusNotice({ kind: 'info', message: err.message });
      } else {
        setStatusNotice({ kind: 'error', message: err?.message || 'Không thể tải danh sách từ Google Drive.' });
      }
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    const unsub = googleDriveService.initAuth(
      (authUser) => {
        setUser(authUser);
        setNeedsAuth(false);
      },
      (signedInWithoutToken) => {
        setUser(signedInWithoutToken || null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (googleDriveService.getAccessToken()) {
      setNeedsAuth(false);
      loadDriveFiles();
    } else {
      setNeedsAuth(true);
    }
  }, [isOpen, loadDriveFiles]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setStatusNotice(null);
    setUnauthorizedDomainInfo(null);
    setInsufficientScopeFlag(false);
    try {
      const res = await googleDriveService.googleSignIn();
      setUser(res.user);
      setNeedsAuth(false);
      setStatusNotice({ kind: 'success', message: `Đã kết nối Google Drive (${res.user.email || res.user.displayName})` });
      await loadDriveFiles();
    } catch (err: any) {
      if (err instanceof DriveUnauthorizedDomainError) {
        setUnauthorizedDomainInfo({ hostname: err.hostname, projectId: err.projectId });
      } else if (err instanceof DriveInsufficientScopeError) {
        setInsufficientScopeFlag(true);
      }
      setStatusNotice({ kind: 'error', message: err?.message || 'Đăng nhập Google thất bại.' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await googleDriveService.logout();
    setUser(null);
    setFiles([]);
    setFolderId(null);
    setNeedsAuth(true);
    setStatusNotice({ kind: 'info', message: 'Đã ngắt kết nối tài khoản Google Drive.' });
  };

  const handleSyncFullLibrary = async () => {
    setIsSyncing(true);
    setStatusNotice(null);
    try {
      const payload = await googleDriveService.buildLibraryPayload({
        includeSettings,
        includeApiKeys,
        kind: 'library'
      });

      if (payload.stories.length === 0 && !includeSettings) {
        setStatusNotice({ kind: 'info', message: 'Thư viện hiện chưa có truyện nào để đồng bộ.' });
        return;
      }

      const targetFolderId = folderId || (await googleDriveService.ensureSyncFolder());
      setFolderId(targetFolderId);

      const targetFilename = googleDriveService.getLibrarySyncFilename();
      const existing = files.find(f => f.name === targetFilename);

      if (existing) {
        // Explicit confirmation required before overwriting existing file on Google Drive
        setConfirmState({
          type: 'overwrite_drive',
          title: 'Xác nhận ghi đè bản đồng bộ trên Google Drive?',
          description: `Tệp "${existing.name}" đã tồn tại trên Google Drive (cập nhật lần cuối lúc ${formatDateTime(existing.modifiedTime)}). Ghi đè sẽ thay thế nội dung tệp đó bằng ${payload.stories.length} truyện hiện tại trên máy bạn.`,
          existingFile: existing,
          targetFilename,
          payload
        });
        return;
      }

      const created = await googleDriveService.createSyncFile(targetFolderId, targetFilename, payload);
      setStatusNotice({
        kind: 'success',
        message: `Đã đồng bộ ${payload.stories.length} truyện lên Google Drive (${created.name}).`
      });
      await loadDriveFiles();
    } catch (err: any) {
      if (err instanceof DriveAuthError) {
        setNeedsAuth(true);
      }
      setStatusNotice({ kind: 'error', message: err?.message || 'Đồng bộ lên Google Drive thất bại.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setIsSyncing(true);
    setStatusNotice(null);
    try {
      const payload = await googleDriveService.buildLibraryPayload({
        includeSettings,
        includeApiKeys,
        kind: 'snapshot'
      });
      if (payload.stories.length === 0) {
        setStatusNotice({ kind: 'info', message: 'Thư viện chưa có truyện nào để tạo bản chụp.' });
        return;
      }
      const targetFolderId = folderId || (await googleDriveService.ensureSyncFolder());
      setFolderId(targetFolderId);
      const snapshotName = googleDriveService.getSnapshotFilename();
      const created = await googleDriveService.createSyncFile(targetFolderId, snapshotName, payload);
      setStatusNotice({
        kind: 'success',
        message: `Đã tạo bản sao lưu mới "${created.name}" (${payload.stories.length} truyện) trên Google Drive.`
      });
      await loadDriveFiles();
    } catch (err: any) {
      if (err instanceof DriveAuthError) setNeedsAuth(true);
      setStatusNotice({ kind: 'error', message: err?.message || 'Không thể tạo bản chụp trên Google Drive.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncActiveStory = async () => {
    if (!story) return;
    setIsSyncing(true);
    setStatusNotice(null);
    try {
      const { story: hydratedStory, payload } = await googleDriveService.buildSingleStoryPayload(story.id);
      const targetFolderId = folderId || (await googleDriveService.ensureSyncFolder());
      setFolderId(targetFolderId);

      const targetFilename = googleDriveService.getStoryFilename(hydratedStory);
      const existing = files.find(
        f => f.appProperties?.storyId === hydratedStory.id || f.name === targetFilename
      );

      if (existing) {
        setConfirmState({
          type: 'overwrite_drive',
          title: `Ghi đè bản sao lưu "${hydratedStory.title}" trên Drive?`,
          description: `Tệp "${existing.name}" (cập nhật lúc ${formatDateTime(existing.modifiedTime)}) sẽ được cập nhật lại bằng ${hydratedStory.chapters.length} chương mới nhất trên máy.`,
          existingFile: existing,
          targetFilename,
          payload
        });
        return;
      }

      const created = await googleDriveService.createSyncFile(targetFolderId, targetFilename, payload);
      setStatusNotice({
        kind: 'success',
        message: `Đã đẩy truyện "${hydratedStory.title}" (${hydratedStory.chapters.length} chương) lên Google Drive (${created.name}).`
      });
      await loadDriveFiles();
    } catch (err: any) {
      if (err instanceof DriveAuthError) setNeedsAuth(true);
      setStatusNotice({ kind: 'error', message: err?.message || 'Không thể đẩy truyện lên Google Drive.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePrepareRestore = async (file: DriveSyncFileItem) => {
    setIsSyncing(true);
    setStatusNotice(null);
    try {
      const payload = await googleDriveService.downloadSyncFile(file.id);
      setRestoreMode('merge_newer');
      setRestoreSettingsFlag(Boolean(payload.settings));
      setRestoreApiKeysFlag(false);
      setConfirmState({
        type: 'restore_local',
        title: `Khôi phục dữ liệu từ "${file.name}"?`,
        file,
        payload
      });
    } catch (err: any) {
      if (err instanceof DriveAuthError) setNeedsAuth(true);
      setStatusNotice({ kind: 'error', message: err?.message || 'Không thể đọc tệp từ Google Drive.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    const currentConfirm = confirmState;
    setIsSyncing(true);
    setStatusNotice(null);

    try {
      if (currentConfirm.type === 'overwrite_drive') {
        const updated = await googleDriveService.overwriteSyncFile(
          currentConfirm.existingFile.id,
          currentConfirm.targetFilename,
          currentConfirm.payload
        );
        setConfirmState(null);
        setStatusNotice({
          kind: 'success',
          message: `Đã cập nhật "${updated.name}" (${currentConfirm.payload.stories.length} truyện) lên Google Drive.`
        });
        await loadDriveFiles();
      } else if (currentConfirm.type === 'delete_drive') {
        await googleDriveService.deleteSyncFile(currentConfirm.file.id);
        setConfirmState(null);
        setStatusNotice({
          kind: 'success',
          message: `Đã xóa tệp "${currentConfirm.file.name}" khỏi Google Drive.`
        });
        await loadDriveFiles();
      } else if (currentConfirm.type === 'restore_local') {
        const summary = await googleDriveService.restoreFromPayload(currentConfirm.payload, {
          mode: restoreMode,
          restoreSettings: restoreSettingsFlag,
          restoreApiKeys: restoreApiKeysFlag
        });
        await refreshFromStorage(summary.updatedStoryIds);
        setConfirmState(null);
        const parts: string[] = [];
        if (summary.addedCount > 0) parts.push(`thêm ${summary.addedCount} truyện mới`);
        if (summary.updatedCount > 0) parts.push(`cập nhật ${summary.updatedCount} truyện`);
        if (summary.skippedCount > 0) parts.push(`giữ nguyên ${summary.skippedCount} truyện cục bộ mới hơn`);
        if (summary.settingsRestored) parts.push('đã đồng bộ cấu hình Model');
        if (summary.apiKeysRestored) parts.push('đã gộp API Key');

        setStatusNotice({
          kind: 'success',
          message: parts.length > 0
            ? `Đồng bộ hoàn tất: ${parts.join(', ')}.`
            : 'Dữ liệu trên máy đã là bản mới nhất, không có thay đổi nào.'
        });
      }
    } catch (err: any) {
      if (err instanceof DriveAuthError) {
        setNeedsAuth(true);
        setConfirmState(null);
      }
      setStatusNotice({ kind: 'error', message: err?.message || 'Thao tác thất bại.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const librarySyncFile = useMemo(
    () => files.find(f => f.name === googleDriveService.getLibrarySyncFilename()),
    [files]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] font-sans animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full h-full sm:h-auto sm:max-h-[88vh] sm:max-w-2xl bg-[#0d1421] sm:rounded-2xl border-0 sm:border sm:border-slate-800 shadow-2xl flex flex-col overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-[#121b2c] border-b border-slate-800/90 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-display font-bold text-slate-100 truncate">
                Đồng Bộ Google Drive
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {user?.email ? `Tài khoản: ${user.email}` : 'Sao lưu & đồng bộ truyện giữa máy tính và iPhone'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] sm:min-h-[34px] sm:min-w-[34px] rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
            aria-label="Đóng"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto ios-scroll custom-scrollbar p-4 sm:p-6 space-y-5">
          {statusNotice && (
            <div
              className={`p-3 rounded-xl border text-xs leading-relaxed flex items-start justify-between gap-2 ${
                statusNotice.kind === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : statusNotice.kind === 'error'
                    ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                    : 'bg-sky-950/40 border-sky-500/30 text-sky-200'
              }`}
            >
              <span>{statusNotice.message}</span>
              <button
                onClick={() => setStatusNotice(null)}
                className="text-slate-400 hover:text-white shrink-0 px-1"
                aria-label="Ẩn thông báo"
              >
                ✕
              </button>
            </div>
          )}

          {needsAuth ? (
            <div className="py-6 sm:py-8 px-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="max-w-md space-y-1.5">
                <h3 className="text-sm sm:text-base font-semibold text-slate-100">
                  {user ? 'Phiên kết nối Google Drive cần xác thực lại' : 'Kết nối với Google Drive của bạn'}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ứng dụng chỉ truy cập các tệp sao lưu do chính Aetheria tạo trong thư mục <strong className="text-slate-200">Aetheria - Đồng Bộ Truyện</strong>, không đụng tới tài liệu cá nhân khác trên Drive của bạn.
                </p>
              </div>

              {/* Official Google Sign-In Button Styling */}
              <button
                type="button"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="gsi-material-button inline-flex items-center justify-center gap-3 min-h-[44px] px-5 py-2.5 rounded-md bg-white hover:bg-slate-100 active:bg-slate-200 text-[#1f1f1f] border border-[#747775] font-medium text-sm shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
              >
                <span className="gsi-material-button-icon w-5 h-5 shrink-0 block">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '20px', height: '20px' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </span>
                <span className="gsi-material-button-contents font-sans font-medium tracking-tight">
                  {isLoggingIn ? 'Đang kết nối...' : 'Sign in with Google'}
                </span>
              </button>

              {user && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs text-slate-400 hover:text-slate-200 underline pt-1"
                >
                  Đổi sang tài khoản Google khác
                </button>
              )}

              {unauthorizedDomainInfo && (
                <div className="w-full text-left mt-2 p-4 rounded-xl bg-amber-950/35 border border-amber-500/40 space-y-3 text-xs text-amber-100">
                  <div className="font-semibold text-amber-300">
                    Hướng dẫn cấp quyền cho tên miền Netlify
                  </div>
                  <p className="text-amber-100/90 leading-relaxed">
                    Để đăng nhập Google trên trang web Netlify, bạn cần thêm tên miền hiện tại vào danh sách <strong>Authorized domains</strong> trong Firebase Project <span className="font-mono text-amber-200">{unauthorizedDomainInfo.projectId}</span> (chỉ cần làm 1 lần):
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                    <span className="font-mono text-sky-300 truncate">{unauthorizedDomainInfo.hostname}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(unauthorizedDomainInfo.hostname);
                        setStatusNotice({ kind: 'info', message: `Đã sao chép tên miền: ${unauthorizedDomainInfo.hostname}` });
                      }}
                      className="min-h-[36px] sm:min-h-[30px] px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium shrink-0"
                    >
                      Sao chép domain
                    </button>
                  </div>

                  <ol className="list-decimal list-inside space-y-1.5 text-amber-100/85 leading-relaxed">
                    <li>Bấm <strong>Sao chép domain</strong> ở trên.</li>
                    <li>
                      Mở{' '}
                      <a
                        href={`https://console.firebase.google.com/project/${unauthorizedDomainInfo.projectId}/authentication/settings`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-300 underline font-semibold hover:text-sky-200"
                      >
                        Firebase Authentication Settings
                      </a>
                      {' '}và kiểm tra góc trên bên phải đã đăng nhập đúng Gmail chủ dự án chưa (chọn đúng dự án <span className="font-mono text-amber-200">{unauthorizedDomainInfo.projectId}</span> ở góc trên trái).
                    </li>
                    <li>
                      Ở trang Authentication: chọn tab <strong>Settings</strong> (hoặc <strong>Cài đặt</strong> — trên iPhone hãy bấm vào menu thả xuống có chữ <em>Users ▾</em> để chuyển sang <em>Settings</em>).
                    </li>
                    <li>
                      Trong Settings, chọn mục <strong>Authorized domains</strong> (tiếng Việt: <strong>Miền được ủy quyền</strong>) → bấm <strong>Add domain</strong> (<strong>Thêm miền</strong>) → dán tên miền Netlify vừa sao chép (chỉ dán phần <span className="font-mono">...netlify.app</span>, không kèm <span className="font-mono">https://</span>) → bấm <strong>Add</strong>.
                    </li>
                    <li>Quay lại đây và bấm <strong>Sign in with Google</strong> lại lần nữa.</li>
                  </ol>
                </div>
              )}

              {insufficientScopeFlag && (
                <div className="w-full text-left mt-2 p-4 rounded-xl bg-amber-950/35 border border-amber-500/40 space-y-2.5 text-xs text-amber-100">
                  <div className="font-semibold text-amber-300">
                    Thiếu quyền truy cập Google Drive (403 Insufficient Scopes)
                  </div>
                  <p className="text-amber-100/90 leading-relaxed">
                    Google vừa đăng nhập tài khoản của bạn nhưng <strong>ô quyền truy cập Google Drive chưa được tích chọn</strong> (hoặc phiên cấp quyền cũ chưa bật quyền Drive).
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-amber-100/85 leading-relaxed">
                    <li>Bấm lại nút <strong>Sign in with Google</strong> ở trên.</li>
                    <li>
                      Trên màn hình cấp quyền của Google, tìm dòng{' '}
                      <em>“Xem, chỉnh sửa, tạo và xóa chỉ các tệp Google Drive cụ thể mà bạn sử dụng với ứng dụng này”</em> (hoặc <strong>Chọn tất cả / Select all</strong>) và{' '}
                      <strong>nhớ tích dấu ✓ vào ô vuông</strong> trước khi bấm <strong>Continue / Tiếp tục</strong>.
                    </li>
                    <li>Nếu màn hình Google hiện cảnh báo “Ứng dụng chưa được xác minh”, chọn <strong>Nâng cao (Advanced)</strong> → <strong>Đi tới ứng dụng (Go to ...)</strong> → tích quyền Drive và tiếp tục.</li>
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Account Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-3 min-w-0">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Google User'}
                      className="w-9 h-9 rounded-full border border-slate-700 shrink-0 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                      {(user?.displayName || user?.email || 'G')[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-100 truncate">
                      {user?.displayName || 'Tài khoản Google'}
                    </div>
                    <div className="text-xs text-slate-400 truncate font-mono">
                      {user?.email || 'Đã kết nối Google Drive'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={loadDriveFiles}
                    disabled={isLoadingFiles || isSyncing}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-200 transition-colors disabled:opacity-50"
                  >
                    {isLoadingFiles ? 'Đang tải...' : 'Làm mới'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isSyncing}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-700/80 hover:border-rose-700/60 text-xs font-medium text-slate-300 hover:text-rose-300 transition-colors"
                  >
                    Đăng xuất
                  </button>
                </div>
              </div>

              {/* Upload / Push Section */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">Đẩy dữ liệu lên Google Drive</h3>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    Trên máy: {storiesList.length} truyện
                  </span>
                </div>

                <div className="space-y-2 text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded-xl p-3.5">
                  <label className="flex items-center gap-2.5 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={includeSettings}
                      onChange={e => setIncludeSettings(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-sky-500 focus:ring-sky-500"
                    />
                    <span>Kèm cấu hình Model AI, phong cách viết &amp; chế độ hàng đợi</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={includeApiKeys}
                      onChange={e => setIncludeApiKeys(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-slate-300">
                      Kèm danh sách Gemini API Key cá nhân (chỉ lưu trong tệp Drive riêng của bạn)
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handleSyncFullLibrary}
                    disabled={isSyncing}
                    className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span>
                      {librarySyncFile ? 'Cập nhật Đồng bộ Toàn Thư viện' : 'Đẩy Toàn Thư viện lên Drive'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCreateSnapshot}
                    disabled={isSyncing}
                    className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                    </svg>
                    <span>Tạo Bản chụp Mới (Không ghi đè)</span>
                  </button>
                </div>

                {story && (
                  <button
                    type="button"
                    onClick={handleSyncActiveStory}
                    disabled={isSyncing}
                    className="w-full min-h-[42px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>Đẩy riêng truyện đang mở: “{story.title}” ({story.chapters.length} chương)</span>
                  </button>
                )}
              </div>

              {/* Remote Files List */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Bản sao lưu trên Google Drive ({files.length})
                  </h3>
                  <span className="text-xs text-slate-500 truncate">
                    Thư mục: Aetheria - Đồng Bộ Truyện
                  </span>
                </div>

                {isLoadingFiles ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Đang tải danh sách bản sao lưu từ Google Drive...
                  </div>
                ) : files.length === 0 ? (
                  <div className="py-8 px-4 text-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-400">
                    Chưa có tệp đồng bộ nào trong thư mục Google Drive của bạn. Hãy bấm nút ở trên để đẩy dữ liệu lên lần đầu.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden">
                    {files.map((file) => {
                      const kind = file.appProperties?.kind;
                      const kindText =
                        kind === 'library'
                          ? 'Thư viện đồng bộ'
                          : kind === 'snapshot'
                            ? 'Bản chụp'
                            : kind === 'story'
                              ? 'Truyện lẻ'
                              : 'Tệp sao lưu';
                      const countText = file.appProperties?.storiesCount
                        ? `${file.appProperties.storiesCount} truyện · ${file.appProperties.chaptersCount || 0} chương`
                        : null;

                      return (
                        <div
                          key={file.id}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/50 transition-colors"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
                              {file.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 font-mono tabular-nums">
                              <span className="text-sky-400 font-sans font-medium">{kindText}</span>
                              {countText && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{countText}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span>{formatBytes(file.size)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatDateTime(file.modifiedTime)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handlePrepareRestore(file)}
                              disabled={isSyncing}
                              className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-[32px] px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              Tải về &amp; Đồng bộ
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmState({
                                  type: 'delete_drive',
                                  title: `Xóa tệp "${file.name}" khỏi Google Drive?`,
                                  description: `Tệp sao lưu này (${formatBytes(file.size)}, sửa đổi lúc ${formatDateTime(file.modifiedTime)}) sẽ bị xóa khỏi Google Drive của bạn.`,
                                  file
                                })
                              }
                              disabled={isSyncing}
                              className="min-h-[40px] sm:min-h-[32px] px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 text-rose-300 text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Mandatory Explicit Confirmation Dialog for Overwrite / Delete / Restore */}
        {confirmState && (
          <div
            className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !isSyncing && setConfirmState(null)}
          >
            <div
              className="w-full max-w-md bg-[#111928] border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4"
              onClick={e => e.stopPropagation()}
            >
              <h4 className="text-base font-bold text-slate-100 leading-snug">
                {confirmState.title}
              </h4>

              {confirmState.type === 'restore_local' ? (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="text-slate-400 leading-relaxed space-y-1">
                    <div>
                      Nguồn: <span className="text-slate-200 font-medium">{confirmState.file.name}</span>
                    </div>
                    <div>
                      Nội dung: <span className="text-sky-300 font-mono">{confirmState.payload.stories.length} truyện</span>
                      {' · '}
                      Xuất lúc {formatDateTime(confirmState.payload.exportedAt)} ({confirmState.payload.deviceLabel})
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="font-semibold text-slate-200">Cách xử lý khi trùng truyện trên máy:</div>
                    <label className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="restoreMode"
                        checked={restoreMode === 'merge_newer'}
                        onChange={() => setRestoreMode('merge_newer')}
                        className="mt-0.5 text-sky-500 bg-slate-950 border-slate-600"
                      />
                      <span>
                        <strong className="block text-slate-100">Gộp thông minh (Khuyên dùng)</strong>
                        <span className="text-slate-400">Thêm truyện mới và chỉ cập nhật truyện có chương mới hơn trên Drive.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="restoreMode"
                        checked={restoreMode === 'overwrite_matching'}
                        onChange={() => setRestoreMode('overwrite_matching')}
                        className="mt-0.5 text-sky-500 bg-slate-950 border-slate-600"
                      />
                      <span>
                        <strong className="block text-slate-100">Ghi đè bản trên máy</strong>
                        <span className="text-slate-400">Thay thế hoàn toàn các truyện trùng ID trên máy bằng bản từ Drive.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-900/80 border border-slate-800 cursor-pointer">
                      <input
                        type="radio"
                        name="restoreMode"
                        checked={restoreMode === 'duplicate_new'}
                        onChange={() => setRestoreMode('duplicate_new')}
                        className="mt-0.5 text-sky-500 bg-slate-950 border-slate-600"
                      />
                      <span>
                        <strong className="block text-slate-100">Nhập thành bản sao mới</strong>
                        <span className="text-slate-400">Giữ nguyên toàn bộ truyện cũ và tạo thêm bản mới độc lập.</span>
                      </span>
                    </label>
                  </div>

                  {confirmState.payload.settings && (
                    <div className="space-y-1.5 pt-1 border-t border-slate-800">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={restoreSettingsFlag}
                          onChange={e => setRestoreSettingsFlag(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-sky-500"
                        />
                        <span>Khôi phục cấu hình Model AI &amp; Hàng đợi</span>
                      </label>
                      {Array.isArray(confirmState.payload.settings.apiKeys) && confirmState.payload.settings.apiKeys.length > 0 && (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={restoreApiKeysFlag}
                            onChange={e => setRestoreApiKeysFlag(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-sky-500"
                          />
                          <span>Gộp {confirmState.payload.settings.apiKeys.length} Gemini API Key từ bản sao lưu</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {confirmState.description}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmState(null)}
                  disabled={isSyncing}
                  className="min-h-[40px] sm:min-h-[36px] px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  disabled={isSyncing}
                  className={`min-h-[40px] sm:min-h-[36px] px-4 py-1.5 rounded-lg text-white text-xs font-semibold transition-colors disabled:opacity-50 ${
                    confirmState.type === 'delete_drive'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : confirmState.type === 'overwrite_drive'
                        ? 'bg-amber-600 hover:bg-amber-500'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {isSyncing
                    ? 'Đang xử lý...'
                    : confirmState.type === 'delete_drive'
                      ? 'Xác nhận xóa'
                      : confirmState.type === 'overwrite_drive'
                        ? 'Xác nhận ghi đè'
                        : 'Xác nhận đồng bộ'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
