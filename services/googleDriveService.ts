import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { Story } from '../types.ts';
import { storageService } from './storage.ts';

// Minimal Workspace scope for app-managed sync folder & backup files on Google Drive
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const SYNC_FOLDER_NAME = 'Aetheria - Đồng Bộ Truyện';
const LIBRARY_SYNC_FILENAME = 'Aetheria_Library_Sync.json';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'consent select_account',
  include_granted_scopes: 'true'
});

// Strict in-memory caching ONLY (never store OAuth access tokens in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export interface DriveUserInfo {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface DriveSyncFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  appProperties?: {
    app?: string;
    kind?: 'library' | 'story' | 'snapshot';
    storyId?: string;
    storyTitle?: string;
    storiesCount?: string;
    chaptersCount?: string;
    exportedAt?: string;
    deviceLabel?: string;
  };
}

export interface DriveSettingsPayload {
  modelFlash?: string | null;
  modelPro?: string | null;
  userStyle?: string | null;
  queueMode?: string | null;
  interRequestDelayMs?: string | null;
  apiKeys?: string[];
}

export interface DriveSyncPayload {
  schema: 'aetheria-drive-sync-v1';
  kind: 'library' | 'story' | 'snapshot';
  exportedAt: number;
  deviceLabel: string;
  stories: Story[];
  settings?: DriveSettingsPayload;
}

export interface RestoreSummary {
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  settingsRestored: boolean;
  apiKeysRestored: boolean;
  updatedStoryIds: string[];
}

export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export class DriveUnauthorizedDomainError extends Error {
  public readonly hostname: string;
  public readonly projectId: string;

  constructor(hostname: string, projectId: string) {
    super(
      `Tên miền "${hostname}" chưa được cấp quyền đăng nhập Google trong Firebase Console (auth/unauthorized-domain).`
    );
    this.name = 'DriveUnauthorizedDomainError';
    this.hostname = hostname;
    this.projectId = projectId;
  }
}

export class DriveInsufficientScopeError extends DriveAuthError {
  public readonly grantedScopes: string[];

  constructor(grantedScopes: string[] = []) {
    super(
      'Tài khoản Google đã đăng nhập nhưng CHƯA được cấp quyền truy cập Google Drive (thiếu quyền drive.file). Vui lòng bấm Đăng nhập lại bằng Google và tích chọn ô cấp quyền Google Drive.'
    );
    this.name = 'DriveInsufficientScopeError';
    this.grantedScopes = grantedScopes;
  }
}

function toUserInfo(user: User): DriveUserInfo {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL
  };
}

function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web Browser';
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone Safari';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Web Browser';
}

function getStoryLatestTimestamp(story: Story): number {
  let latest = story.createdAt || 0;
  for (const ch of story.chapters || []) {
    if ((ch.lastUpdated || 0) > latest) latest = ch.lastUpdated;
  }
  return latest;
}

export const googleDriveService = {
  initAuth(
    onAuthSuccess?: (user: DriveUserInfo, token: string) => void,
    onAuthFailure?: (signedInUserWithoutToken?: DriveUserInfo | null) => void
  ): () => void {
    return onAuthStateChanged(auth, (user: User | null) => {
      if (user) {
        if (cachedAccessToken) {
          onAuthSuccess?.(toUserInfo(user), cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          onAuthFailure?.(toUserInfo(user));
        }
      } else {
        cachedAccessToken = null;
        onAuthFailure?.(null);
      }
    });
  },

  async googleSignIn(): Promise<{ user: DriveUserInfo; accessToken: string }> {
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Không nhận được mã truy cập Google Drive từ phiên đăng nhập.');
      }
      const token = credential.accessToken;

      // Verify Google Granular OAuth Consent actually granted drive.file
      try {
        const infoRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
        );
        if (infoRes.ok) {
          const info = await infoRes.json();
          const granted = String(info?.scope || '').split(/\s+/).filter(Boolean);
          if (!granted.includes('https://www.googleapis.com/auth/drive.file')) {
            throw new DriveInsufficientScopeError(granted);
          }
        }
      } catch (scopeErr) {
        if (scopeErr instanceof DriveInsufficientScopeError) {
          cachedAccessToken = null;
          throw scopeErr;
        }
      }

      cachedAccessToken = token;
      return {
        user: toUserInfo(result.user),
        accessToken: cachedAccessToken
      };
    } catch (error: any) {
      const code = String(error?.code || '');
      const rawMsg = String(error?.message || '');
      if (code === 'auth/unauthorized-domain' || rawMsg.includes('auth/unauthorized-domain')) {
        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown-domain';
        throw new DriveUnauthorizedDomainError(hostname, firebaseConfig.projectId);
      }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        throw new Error('Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.');
      }
      if (code === 'auth/popup-blocked') {
        throw new Error('Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép pop-up (trên iPhone: Cài đặt > Safari > tắt Chặn cửa sổ bật lên).');
      }
      if (code === 'auth/network-request-failed') {
        throw new Error('Lỗi kết nối mạng khi đăng nhập Google. Vui lòng kiểm tra Wi-Fi / 4G rồi thử lại.');
      }
      if (code === 'auth/web-storage-unsupported') {
        throw new Error('Trình duyệt đang chặn cookie/bộ nhớ phiên. Trên iPhone Safari hãy tắt chế độ Ẩn danh hoặc bật cho phép cookie.');
      }
      throw error;
    } finally {
      isSigningIn = false;
    }
  },

  async logout(): Promise<void> {
    cachedAccessToken = null;
    await signOut(auth);
  },

  getAccessToken(): string | null {
    return cachedAccessToken;
  },

  invalidateAccessToken(): void {
    cachedAccessToken = null;
  },

  getCurrentUser(): DriveUserInfo | null {
    return auth.currentUser ? toUserInfo(auth.currentUser) : null;
  },

  async ensureAuthorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = cachedAccessToken;
    if (!token) {
      throw new DriveAuthError('Phiên kết nối Google Drive chưa sẵn sàng hoặc đã hết hạn. Vui lòng đăng nhập lại Google.');
    }

    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(url, { ...init, headers });
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new DriveAuthError('Phiên truy cập Google Drive đã hết hạn (401). Vui lòng bấm Đăng nhập lại bằng Google.');
    }
    if (res.status === 403) {
      const clonedText = await res.clone().text();
      if (
        clonedText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
        clonedText.includes('insufficientPermissions') ||
        clonedText.includes('insufficient authentication scopes')
      ) {
        cachedAccessToken = null;
        throw new DriveInsufficientScopeError();
      }
    }
    return res;
  },

  async ensureSyncFolder(): Promise<string> {
    const q = encodeURIComponent(
      `mimeType = 'application/vnd.google-apps.folder' and name = '${SYNC_FOLDER_NAME}' and trashed = false`
    );
    const searchRes = await this.ensureAuthorizedFetch(
      `${DRIVE_API_BASE}/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime desc`
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Không thể kiểm tra thư mục trên Google Drive (${searchRes.status}): ${errText}`);
    }

    const searchData = await searchRes.json();
    if (Array.isArray(searchData.files) && searchData.files.length > 0) {
      return searchData.files[0].id as string;
    }

    const createRes = await this.ensureAuthorizedFetch(`${DRIVE_API_BASE}/files?fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: SYNC_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: {
          app: 'aetheria-studio',
          role: 'sync-root'
        }
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Không thể tạo thư mục "${SYNC_FOLDER_NAME}" trên Google Drive (${createRes.status}): ${errText}`);
    }

    const folderData = await createRes.json();
    return folderData.id as string;
  },

  async listSyncFiles(): Promise<{ folderId: string; files: DriveSyncFileItem[] }> {
    const folderId = await this.ensureSyncFolder();
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
    const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime,webViewLink,appProperties)');

    const res = await this.ensureAuthorizedFetch(
      `${DRIVE_API_BASE}/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=100`
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Không thể tải danh sách tệp từ Google Drive (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      folderId,
      files: (data.files || []) as DriveSyncFileItem[]
    };
  },

  async buildLibraryPayload(options: {
    includeSettings?: boolean;
    includeApiKeys?: boolean;
    kind?: 'library' | 'snapshot';
  }): Promise<DriveSyncPayload> {
    await storageService.flushSaves();
    const summaries = await storageService.getAllStorySummaries();
    const hydrated = await Promise.all(
      summaries.map(async (s) => (await storageService.getStory(s.id)) || s)
    );

    let settings: DriveSettingsPayload | undefined = undefined;
    if (options.includeSettings || options.includeApiKeys) {
      settings = {};
      if (options.includeSettings && typeof localStorage !== 'undefined') {
        settings.modelFlash = localStorage.getItem('aetheria_model_flash');
        settings.modelPro = localStorage.getItem('aetheria_model_pro');
        settings.userStyle = localStorage.getItem('aetheria_user_style');
        settings.queueMode = localStorage.getItem('aetheria_queue_mode');
        settings.interRequestDelayMs = localStorage.getItem('aetheria_inter_request_delay_ms');
      }
      if (options.includeApiKeys && typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem('aetheria_api_key');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              settings.apiKeys = parsed.filter((k: unknown) => typeof k === 'string' && k.trim().length > 0);
            }
          }
        } catch {
          // ignore malformed localStorage
        }
      }
    }

    return {
      schema: 'aetheria-drive-sync-v1',
      kind: options.kind || 'library',
      exportedAt: Date.now(),
      deviceLabel: getDeviceLabel(),
      stories: hydrated,
      settings
    };
  },

  async buildSingleStoryPayload(storyId: string): Promise<{ story: Story; payload: DriveSyncPayload }> {
    await storageService.flushSaves();
    const story = await storageService.getStory(storyId);
    if (!story) {
      throw new Error('Không tìm thấy dữ liệu truyện cục bộ để tải lên Google Drive.');
    }

    return {
      story,
      payload: {
        schema: 'aetheria-drive-sync-v1',
        kind: 'story',
        exportedAt: Date.now(),
        deviceLabel: getDeviceLabel(),
        stories: [story]
      }
    };
  },

  getLibrarySyncFilename(): string {
    return LIBRARY_SYNC_FILENAME;
  },

  getStoryFilename(story: Story): string {
    const safeTitle = (story.title || 'Truyen')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim()
      .slice(0, 70);
    return `Truyện - ${safeTitle}.json`;
  },

  getSnapshotFilename(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `Aetheria_Snapshot_${stamp}.json`;
  },

  buildAppProperties(payload: DriveSyncPayload): Record<string, string> {
    const totalChapters = payload.stories.reduce((sum, s) => sum + (s.chapters?.length || 0), 0);
    const props: Record<string, string> = {
      app: 'aetheria-studio',
      kind: payload.kind,
      storiesCount: String(payload.stories.length),
      chaptersCount: String(totalChapters),
      exportedAt: String(payload.exportedAt),
      deviceLabel: payload.deviceLabel
    };
    if (payload.kind === 'story' && payload.stories[0]) {
      props.storyId = payload.stories[0].id;
      props.storyTitle = (payload.stories[0].title || '').slice(0, 100);
    }
    return props;
  },

  async createSyncFile(folderId: string, fileName: string, payload: DriveSyncPayload): Promise<DriveSyncFileItem> {
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/json',
      appProperties: this.buildAppProperties(payload)
    };

    const boundary = `aetheria_sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(payload)}\r\n` +
      `--${boundary}--`;

    const fields = encodeURIComponent('id,name,mimeType,size,modifiedTime,webViewLink,appProperties');
    const res = await this.ensureAuthorizedFetch(
      `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=${fields}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Tải tệp lên Google Drive thất bại (${res.status}): ${errText}`);
    }

    return (await res.json()) as DriveSyncFileItem;
  },

  // Destructive/Mutating: ONLY invoke after explicit user confirmation in the UI
  async overwriteSyncFile(fileId: string, fileName: string, payload: DriveSyncPayload): Promise<DriveSyncFileItem> {
    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      appProperties: this.buildAppProperties(payload)
    };

    const boundary = `aetheria_sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(payload)}\r\n` +
      `--${boundary}--`;

    const fields = encodeURIComponent('id,name,mimeType,size,modifiedTime,webViewLink,appProperties');
    const res = await this.ensureAuthorizedFetch(
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=${fields}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Cập nhật tệp trên Google Drive thất bại (${res.status}): ${errText}`);
    }

    return (await res.json()) as DriveSyncFileItem;
  },

  async downloadSyncFile(fileId: string): Promise<DriveSyncPayload> {
    const res = await this.ensureAuthorizedFetch(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Không thể tải tệp từ Google Drive (${res.status}): ${errText}`);
    }

    const raw = await res.json();

    // Normalize either new sync schema or legacy Aetheria JSON exports
    if (raw && raw.schema === 'aetheria-drive-sync-v1' && Array.isArray(raw.stories)) {
      return raw as DriveSyncPayload;
    }
    if (raw && Array.isArray(raw.stories)) {
      return {
        schema: 'aetheria-drive-sync-v1',
        kind: 'library',
        exportedAt: raw.exportedAt || Date.now(),
        deviceLabel: 'Legacy Backup',
        stories: raw.stories
      };
    }
    if (raw && raw.story && raw.story.title) {
      return {
        schema: 'aetheria-drive-sync-v1',
        kind: 'story',
        exportedAt: raw.exportedAt || Date.now(),
        deviceLabel: 'Legacy Backup',
        stories: [raw.story]
      };
    }
    if (raw && raw.title && Array.isArray(raw.chapters)) {
      return {
        schema: 'aetheria-drive-sync-v1',
        kind: 'story',
        exportedAt: Date.now(),
        deviceLabel: 'Legacy Story',
        stories: [raw]
      };
    }

    throw new Error('Tệp JSON trên Google Drive không đúng định dạng sao lưu của Aetheria.');
  },

  // Destructive/Mutating: ONLY invoke after explicit user confirmation in the UI
  async deleteSyncFile(fileId: string): Promise<void> {
    const res = await this.ensureAuthorizedFetch(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`,
      { method: 'DELETE' }
    );

    if (!res.ok && res.status !== 204) {
      const errText = await res.text();
      throw new Error(`Không thể xóa tệp trên Google Drive (${res.status}): ${errText}`);
    }
  },

  async restoreFromPayload(
    payload: DriveSyncPayload,
    options: {
      mode: 'merge_newer' | 'overwrite_matching' | 'duplicate_new';
      restoreSettings: boolean;
      restoreApiKeys: boolean;
    }
  ): Promise<RestoreSummary> {
    const existingSummaries = await storageService.getAllStorySummaries();
    const existingMap = new Map<string, Story>();
    for (const s of existingSummaries) {
      const full = await storageService.getStory(s.id);
      if (full) existingMap.set(full.id, full);
    }

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const updatedStoryIds: string[] = [];

    const makeId = () => {
      try {
        return crypto.randomUUID();
      } catch {
        return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }
    };

    for (const remoteStory of payload.stories) {
      if (!remoteStory || !remoteStory.title) continue;

      if (options.mode === 'duplicate_new') {
        const cloned: Story = {
          ...remoteStory,
          id: makeId(),
          title: existingMap.has(remoteStory.id) ? `${remoteStory.title} (Drive)` : remoteStory.title,
          chapters: (remoteStory.chapters || []).map(ch => ({ ...ch, id: makeId() })),
          characters: (remoteStory.characters || []).map(c => ({ ...c, id: makeId() }))
        };
        await storageService.saveStory(cloned, true);
        addedCount++;
        updatedStoryIds.push(cloned.id);
        continue;
      }

      const localStory = existingMap.get(remoteStory.id);
      if (!localStory) {
        await storageService.saveStory(remoteStory, true);
        addedCount++;
        updatedStoryIds.push(remoteStory.id);
      } else if (options.mode === 'overwrite_matching') {
        await storageService.saveStory(remoteStory, true);
        updatedCount++;
        updatedStoryIds.push(remoteStory.id);
      } else {
        // merge_newer: only overwrite if Drive version has newer chapter/creation timestamp
        const remoteLatest = getStoryLatestTimestamp(remoteStory);
        const localLatest = getStoryLatestTimestamp(localStory);
        if (remoteLatest > localLatest) {
          await storageService.saveStory(remoteStory, true);
          updatedCount++;
          updatedStoryIds.push(remoteStory.id);
        } else {
          skippedCount++;
        }
      }
    }

    let settingsRestored = false;
    let apiKeysRestored = false;

    if (payload.settings && typeof localStorage !== 'undefined') {
      if (options.restoreSettings) {
        if (payload.settings.modelFlash) localStorage.setItem('aetheria_model_flash', payload.settings.modelFlash);
        if (payload.settings.modelPro) localStorage.setItem('aetheria_model_pro', payload.settings.modelPro);
        if (payload.settings.userStyle !== undefined && payload.settings.userStyle !== null) {
          localStorage.setItem('aetheria_user_style', payload.settings.userStyle);
        }
        if (payload.settings.queueMode) localStorage.setItem('aetheria_queue_mode', payload.settings.queueMode);
        if (payload.settings.interRequestDelayMs) {
          localStorage.setItem('aetheria_inter_request_delay_ms', payload.settings.interRequestDelayMs);
        }
        settingsRestored = true;
      }

      if (options.restoreApiKeys && Array.isArray(payload.settings.apiKeys) && payload.settings.apiKeys.length > 0) {
        try {
          const currentRaw = localStorage.getItem('aetheria_api_key');
          const currentKeys: string[] = currentRaw ? JSON.parse(currentRaw) : [];
          const mergedKeys = Array.from(new Set([...(Array.isArray(currentKeys) ? currentKeys : []), ...payload.settings.apiKeys]));
          localStorage.setItem('aetheria_api_key', JSON.stringify(mergedKeys));
          apiKeysRestored = true;
        } catch {
          localStorage.setItem('aetheria_api_key', JSON.stringify(payload.settings.apiKeys));
          apiKeysRestored = true;
        }
      }
    }

    return {
      addedCount,
      updatedCount,
      skippedCount,
      settingsRestored,
      apiKeysRestored,
      updatedStoryIds
    };
  }
};
