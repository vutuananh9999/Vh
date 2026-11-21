import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Story, VectorData } from '../types.ts';
import type { ProviderMetadataRecord } from '../services/providerTypes.ts';
import type { RuntimeKVBackend, ServerJobState } from '../services/runtimeAdapter.ts';

const SAFE_ID_REGEX = /[^a-zA-Z0-9_-]/g;

function sanitizeId(rawId: string): string {
  const cleaned = String(rawId || '').replace(SAFE_ID_REGEX, '').trim();
  if (!cleaned) {
    throw new Error('ID không hợp lệ.');
  }
  return cleaned;
}

function resolveContainedPath(baseDir: string, fileName: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, fileName);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Đường dẫn truy cập vượt quá thư mục dữ liệu cho phép.');
  }
  return resolvedTarget;
}

function writeFileAtomic(targetPath: string, content: string, mode?: number): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: mode ?? 0o600 });
  fs.renameSync(tmpPath, targetPath);
}

interface EncryptedVaultDisk {
  geminiApiKeysRaw: string;
  providerSecrets: Record<string, string>;
}

interface AuthConfigDisk {
  enabled: boolean;
  salt?: string;
  hash?: string;
  sessionSecret: string;
  updatedAt: number;
}

interface EncryptedEnvelope {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
}

function toStorySummary(story: Story): Story {
  return {
    ...story,
    chapters: (story.chapters || []).map(ch => ({
      ...ch,
      content: '',
      translatedContent: ch.translatedContent ? '[synced]' : undefined,
      originalContent: undefined
    }))
  };
}

class ServerVault {
  public readonly dataDir: string;
  private readonly storiesDir: string;
  private readonly vectorsDir: string;
  private readonly settingsPath: string;
  private readonly providersPath: string;
  private readonly credentialsPath: string;
  private readonly vaultKeyPath: string;
  private readonly indexPath: string;
  private readonly authPath: string;
  private readonly jobsPath: string;

  private settingsCache: Record<string, string> = {};
  private credentialsCache: EncryptedVaultDisk = { geminiApiKeysRaw: '', providerSecrets: {} };
  private providersCache: ProviderMetadataRecord[] = [];
  private indexCache: Story[] = [];
  private jobsCache: ServerJobState[] = [];
  private authCache: AuthConfigDisk;
  private masterKey: Buffer;

  private activeSessions = new Set<string>();
  private revokedSessions = new Set<string>();

  private changeHooks: {
    onSettingChanged?: (key: string, value: string | null) => void;
    onGeminiCredChanged?: (rawValue: string) => void;
    onStoryChanged?: (storyId: string, action: 'save' | 'delete', story?: Story) => void;
    onProvidersChanged?: () => void;
  } = {};

  constructor() {
    const configuredDir = process.env.DATA_DIR?.trim();
    this.dataDir = path.resolve(configuredDir || './aetheria-data');
    this.storiesDir = path.join(this.dataDir, 'stories');
    this.vectorsDir = path.join(this.dataDir, 'vectors');
    this.settingsPath = path.join(this.dataDir, 'settings.json');
    this.providersPath = path.join(this.dataDir, 'providers.json');
    this.credentialsPath = path.join(this.dataDir, 'credentials.enc.json');
    this.vaultKeyPath = path.join(this.dataDir, '.vault.key');
    this.indexPath = path.join(this.dataDir, 'stories-index.json');
    this.authPath = path.join(this.dataDir, 'auth.json');
    this.jobsPath = path.join(this.dataDir, 'jobs.json');

    this.ensureDirs();
    this.masterKey = this.loadOrCreateMasterKey();
    this.authCache = this.loadOrCreateAuthConfig();
    this.loadAllFromDisk();
  }

  public setChangeHooks(hooks: typeof this.changeHooks): void {
    this.changeHooks = hooks;
  }

  private ensureDirs(): void {
    for (const dir of [this.dataDir, this.storiesDir, this.vectorsDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
    }
    try {
      fs.chmodSync(this.dataDir, 0o700);
    } catch {
      // Ignore permission changes on filesystems that don't support POSIX modes
    }
  }

  private loadOrCreateMasterKey(): Buffer {
    if (fs.existsSync(this.vaultKeyPath)) {
      try {
        const hex = fs.readFileSync(this.vaultKeyPath, 'utf8').trim();
        const buf = Buffer.from(hex, 'hex');
        if (buf.length === 32) return buf;
      } catch {
        // fall through and regenerate if corrupted
      }
    }
    const fresh = crypto.randomBytes(32);
    writeFileAtomic(this.vaultKeyPath, fresh.toString('hex'), 0o600);
    return fresh;
  }

  private encryptObject(payload: any): EncryptedEnvelope {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      v: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: encrypted.toString('base64')
    };
  }

  private decryptObject<T>(envelope: EncryptedEnvelope, fallback: T): T {
    try {
      const iv = Buffer.from(envelope.iv, 'base64');
      const tag = Buffer.from(envelope.tag, 'base64');
      const ct = Buffer.from(envelope.ct, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      return JSON.parse(decrypted) as T;
    } catch {
      return fallback;
    }
  }

  private loadOrCreateAuthConfig(): AuthConfigDisk {
    const fallbackSecret = process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
    if (fs.existsSync(this.authPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.authPath, 'utf8')) as Partial<AuthConfigDisk>;
        return {
          enabled: Boolean(parsed.enabled && parsed.hash && parsed.salt),
          salt: parsed.salt,
          hash: parsed.hash,
          sessionSecret: parsed.sessionSecret || fallbackSecret,
          updatedAt: parsed.updatedAt || Date.now()
        };
      } catch {
        // regenerate cleanly
      }
    }
    const created: AuthConfigDisk = {
      enabled: false,
      sessionSecret: fallbackSecret,
      updatedAt: Date.now()
    };
    writeFileAtomic(this.authPath, JSON.stringify(created, null, 2), 0o600);
    return created;
  }

  private loadAllFromDisk(): void {
    // 1. Settings
    if (fs.existsSync(this.settingsPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          this.settingsCache = parsed;
        }
      } catch {
        this.settingsCache = {};
      }
    }

    // 2. Encrypted Credentials
    if (fs.existsSync(this.credentialsPath)) {
      try {
        const env = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8')) as EncryptedEnvelope;
        const decoded = this.decryptObject<EncryptedVaultDisk>(env, {
          geminiApiKeysRaw: '',
          providerSecrets: {}
        });
        this.credentialsCache = {
          geminiApiKeysRaw: typeof decoded.geminiApiKeysRaw === 'string' ? decoded.geminiApiKeysRaw : '',
          providerSecrets:
            decoded.providerSecrets && typeof decoded.providerSecrets === 'object' ? decoded.providerSecrets : {}
        };
      } catch {
        this.credentialsCache = { geminiApiKeysRaw: '', providerSecrets: {} };
      }
    }

    // 3. Providers Metadata
    if (fs.existsSync(this.providersPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.providersPath, 'utf8'));
        if (Array.isArray(parsed)) {
          this.providersCache = parsed;
        }
      } catch {
        this.providersCache = [];
      }
    }

    // 4. Stories Index (or rebuild from stories/*.json if missing)
    if (fs.existsSync(this.indexPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
        if (Array.isArray(parsed)) {
          this.indexCache = parsed;
        }
      } catch {
        this.rebuildStoriesIndex();
      }
    } else {
      this.rebuildStoriesIndex();
    }

    // 5. Persisted Jobs (reap any stale "running" jobs from an ungraceful process exit)
    if (fs.existsSync(this.jobsPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.jobsPath, 'utf8'));
        if (Array.isArray(parsed)) {
          this.jobsCache = parsed.map((job: ServerJobState) => {
            if (job.status === 'running') {
              return {
                ...job,
                status: 'failed',
                statusText: 'Máy chủ vừa khởi động lại khi tác vụ đang chạy.',
                error: 'Server restarted while job was running.',
                completedAt: Date.now(),
                updatedAt: Date.now()
              };
            }
            return job;
          });
          this.persistJobs();
        }
      } catch {
        this.jobsCache = [];
      }
    }
  }

  private rebuildStoriesIndex(): void {
    const summaries: Story[] = [];
    try {
      const files = fs.readdirSync(this.storiesDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const full = JSON.parse(fs.readFileSync(path.join(this.storiesDir, file), 'utf8')) as Story;
          if (full?.id) {
            summaries.push(toStorySummary(full));
          }
        } catch {
          // skip corrupt entry
        }
      }
    } catch {
      // ignore
    }
    this.indexCache = summaries;
    writeFileAtomic(this.indexPath, JSON.stringify(this.indexCache), 0o600);
  }

  private persistSettings(): void {
    writeFileAtomic(this.settingsPath, JSON.stringify(this.settingsCache, null, 2), 0o600);
  }

  private persistCredentials(): void {
    const envelope = this.encryptObject(this.credentialsCache);
    writeFileAtomic(this.credentialsPath, JSON.stringify(envelope, null, 2), 0o600);
  }

  private persistProviders(): void {
    writeFileAtomic(this.providersPath, JSON.stringify(this.providersCache, null, 2), 0o600);
  }

  private persistIndex(): void {
    writeFileAtomic(this.indexPath, JSON.stringify(this.indexCache), 0o600);
  }

  private persistJobs(): void {
    writeFileAtomic(this.jobsPath, JSON.stringify(this.jobsCache.slice(0, 30), null, 2), 0o600);
  }

  // --- Runtime KV Adapter ---
  public createKVBackend(): RuntimeKVBackend {
    return {
      getItem: (key: string): string | null => {
        if (key === 'aetheria_api_key') {
          return this.credentialsCache.geminiApiKeysRaw || null;
        }
        return key in this.settingsCache ? this.settingsCache[key] : null;
      },
      setItem: (key: string, value: string): void => {
        if (key === 'aetheria_api_key') {
          this.setGeminiApiKeysRaw(value);
          return;
        }
        this.setSetting(key, value);
      },
      removeItem: (key: string): void => {
        if (key === 'aetheria_api_key') {
          this.setGeminiApiKeysRaw('');
          return;
        }
        this.setSetting(key, null);
      }
    };
  }

  public getAllPublicSettings(): Record<string, string> {
    return { ...this.settingsCache };
  }

  public setSetting(key: string, value: string | null): void {
    if (!key) return;
    if (key === 'aetheria_api_key') {
      this.setGeminiApiKeysRaw(value || '');
      return;
    }
    if (value === null || value === undefined) {
      delete this.settingsCache[key];
    } else {
      this.settingsCache[key] = String(value);
    }
    this.persistSettings();
    this.changeHooks.onSettingChanged?.(key, value ?? null);
  }

  public getGeminiApiKeysRaw(): string {
    return this.credentialsCache.geminiApiKeysRaw || '';
  }

  public setGeminiApiKeysRaw(rawValue: string): void {
    this.credentialsCache.geminiApiKeysRaw = rawValue ? String(rawValue) : '';
    this.persistCredentials();
    this.changeHooks.onGeminiCredChanged?.(this.credentialsCache.geminiApiKeysRaw);
  }

  // --- Encrypted Custom Provider Credentials & Metadata ---
  public getProviderMetadataList(): ProviderMetadataRecord[] {
    return [...this.providersCache];
  }

  public setProviderMetadataList(records: ProviderMetadataRecord[]): void {
    this.providersCache = [...records];
    this.persistProviders();
    this.changeHooks.onProvidersChanged?.();
  }

  public getProviderSecret(id: string): string {
    return this.credentialsCache.providerSecrets[id] || '';
  }

  public hasProviderSecret(id: string): boolean {
    return Boolean(this.credentialsCache.providerSecrets[id]?.trim());
  }

  public setProviderSecret(id: string, apiKey: string): void {
    if (!id) return;
    const clean = (apiKey || '').trim();
    if (!clean) {
      delete this.credentialsCache.providerSecrets[id];
    } else {
      this.credentialsCache.providerSecrets[id] = clean;
    }
    this.persistCredentials();
  }

  public deleteProviderSecret(id: string): void {
    if (id in this.credentialsCache.providerSecrets) {
      delete this.credentialsCache.providerSecrets[id];
      this.persistCredentials();
    }
  }

  // --- Stories & Chapters ---
  public getAllStorySummaries(): Story[] {
    return [...this.indexCache].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  public getStory(id: string): Story | undefined {
    const safe = sanitizeId(id);
    const filePath = resolveContainedPath(this.storiesDir, `${safe}.json`);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Story;
    } catch {
      return undefined;
    }
  }

  public getAllStories(): Story[] {
    return this.getAllStorySummaries()
      .map(s => this.getStory(s.id))
      .filter((s): s is Story => Boolean(s));
  }

  public saveStory(story: Story): void {
    if (!story?.id) throw new Error('Story missing ID.');
    const safe = sanitizeId(story.id);
    const filePath = resolveContainedPath(this.storiesDir, `${safe}.json`);
    writeFileAtomic(filePath, JSON.stringify(story), 0o600);

    const summary = toStorySummary(story);
    const idx = this.indexCache.findIndex(s => s.id === story.id);
    if (idx >= 0) {
      this.indexCache[idx] = summary;
    } else {
      this.indexCache.unshift(summary);
    }
    this.persistIndex();
    this.changeHooks.onStoryChanged?.(story.id, 'save', story);
  }

  public saveChapterDelta(
    storyId: string,
    chapterId: string,
    content: string,
    title?: string,
    translatedContent?: string
  ): void {
    const existing = this.getStory(storyId);
    if (!existing) return;
    const updatedChapters = (existing.chapters || []).map(c => {
      if (c.id !== chapterId) return c;
      return {
        ...c,
        content,
        ...(title !== undefined ? { title } : {}),
        ...(translatedContent !== undefined ? { translatedContent } : {}),
        lastUpdated: Date.now()
      };
    });
    this.saveStory({ ...existing, chapters: updatedChapters });
  }

  public deleteStory(id: string): void {
    const safe = sanitizeId(id);
    const storyPath = resolveContainedPath(this.storiesDir, `${safe}.json`);
    if (fs.existsSync(storyPath)) {
      fs.unlinkSync(storyPath);
    }
    this.deleteVectorsByStory(safe);
    this.indexCache = this.indexCache.filter(s => s.id !== safe);
    this.persistIndex();
    this.changeHooks.onStoryChanged?.(safe, 'delete');
  }

  // --- Vectors ---
  public saveVectors(vectors: VectorData[]): void {
    if (!vectors || vectors.length === 0) return;
    const byStory = new Map<string, VectorData[]>();
    for (const v of vectors) {
      const list = byStory.get(v.storyId) || [];
      list.push(v);
      byStory.set(v.storyId, list);
    }
    for (const [storyId, incoming] of byStory.entries()) {
      const safe = sanitizeId(storyId);
      const existing = this.getVectorsByStory(safe);
      const map = new Map<string, VectorData>();
      for (const e of existing) map.set(e.id, e);
      for (const n of incoming) map.set(n.id, n);
      const vecPath = resolveContainedPath(this.vectorsDir, `${safe}.json`);
      writeFileAtomic(vecPath, JSON.stringify(Array.from(map.values())), 0o600);
    }
  }

  public getVectorsByStory(storyId: string): VectorData[] {
    const safe = sanitizeId(storyId);
    const vecPath = resolveContainedPath(this.vectorsDir, `${safe}.json`);
    if (!fs.existsSync(vecPath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(vecPath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public deleteVectorsByStory(storyId: string): void {
    const safe = sanitizeId(storyId);
    const vecPath = resolveContainedPath(this.vectorsDir, `${safe}.json`);
    if (fs.existsSync(vecPath)) {
      fs.unlinkSync(vecPath);
    }
  }

  // --- Jobs Persistence ---
  public getPersistedJobs(): ServerJobState[] {
    return [...this.jobsCache];
  }

  public savePersistedJobs(jobs: ServerJobState[]): void {
    this.jobsCache = jobs.slice(0, 30);
    this.persistJobs();
  }

  // --- Optional Password Authentication ---
  public isEnvForcedPassword(): boolean {
    return Boolean(process.env.APP_PASSWORD && process.env.APP_PASSWORD.trim().length > 0);
  }

  public isPasswordEnabled(): boolean {
    if (this.isEnvForcedPassword()) return true;
    return Boolean(this.authCache.enabled && this.authCache.hash && this.authCache.salt);
  }

  public verifyPassword(password: string): boolean {
    if (!this.isPasswordEnabled()) return true;
    const candidate = String(password || '');

    if (this.isEnvForcedPassword()) {
      const expected = (process.env.APP_PASSWORD || '').trim();
      const a = crypto.createHash('sha256').update(candidate).digest();
      const b = crypto.createHash('sha256').update(expected).digest();
      return crypto.timingSafeEqual(a, b);
    }

    if (!this.authCache.salt || !this.authCache.hash) return false;
    const derived = crypto.scryptSync(candidate, this.authCache.salt, 64);
    const expected = Buffer.from(this.authCache.hash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }

  public setOptionalPassword(newPassword: string | null): void {
    if (this.isEnvForcedPassword()) {
      throw new Error('Mật khẩu đang được cố định qua biến môi trường APP_PASSWORD trong .env.');
    }
    const clean = typeof newPassword === 'string' ? newPassword.trim() : '';
    const rotatedSecret = crypto.randomBytes(32).toString('hex');
    if (!clean) {
      this.authCache = {
        enabled: false,
        sessionSecret: rotatedSecret,
        updatedAt: Date.now()
      };
      this.activeSessions.clear();
      this.revokedSessions.clear();
      writeFileAtomic(this.authPath, JSON.stringify(this.authCache, null, 2), 0o600);
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(clean, salt, 64).toString('hex');
    this.authCache = {
      enabled: true,
      salt,
      hash,
      sessionSecret: rotatedSecret,
      updatedAt: Date.now()
    };
    this.activeSessions.clear();
    this.revokedSessions.clear();
    writeFileAtomic(this.authPath, JSON.stringify(this.authCache, null, 2), 0o600);
  }

  public createSessionToken(): string {
    const raw = crypto.randomBytes(24).toString('hex');
    const sig = crypto
      .createHmac('sha256', this.authCache.sessionSecret)
      .update(raw)
      .digest('hex');
    const token = `${raw}.${sig}`;
    this.activeSessions.add(token);
    return token;
  }

  public verifySessionToken(token?: string | null): boolean {
    if (!this.isPasswordEnabled()) return true;
    if (!token || typeof token !== 'string') return false;
    if (this.revokedSessions.has(token)) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [raw, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.authCache.sessionSecret)
      .update(raw)
      .digest('hex');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  public revokeSessionToken(token?: string | null): void {
    if (token) {
      this.activeSessions.delete(token);
      if (this.revokedSessions.size > 1000) {
        this.revokedSessions.clear();
      }
      this.revokedSessions.add(token);
    }
  }
}

export const serverVault = new ServerVault();
