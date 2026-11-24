import { Story, VectorData } from '../types.ts';
import type { ServerJobState } from './runtimeAdapter.ts';
import {
  isCapacitorNative,
  loadAllNativePreferences,
  mirrorPreferenceRemove,
  mirrorPreferenceSet
} from './iosNativeBridge.ts';

const DB_NAME = 'aetheria_standalone_db_v1';
const DB_VERSION = 1;
const STORE_STORIES = 'stories';
const STORE_VECTORS = 'vectors';
const STORE_KV = 'kv_settings';
const STORE_JOBS = 'ai_jobs';

const LOCAL_KV_PREFIX = 'aetheria_standalone_kv_';
const LEGACY_STORAGE_KEYS = [
  'aetheria_api_key',
  'aetheria_model_flash',
  'aetheria_model_pro',
  'aetheria_user_writing_style',
  'aetheria_active_story_id',
  'aetheria_provider_routing_v1',
  'aetheria_provider_metadata_v2',
  'aetheria_queue_mode_pref',
  'aetheria_queue_delay_pref',
  'aetheria_api_usage',
  'aetheria_custom_server_url'
];

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_STORIES)) {
          db.createObjectStore(STORE_STORIES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_VECTORS)) {
          const vecStore = db.createObjectStore(STORE_VECTORS, { keyPath: 'id' });
          vecStore.createIndex('storyId', 'storyId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_JOBS)) {
          db.createObjectStore(STORE_JOBS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function reqPromise<T = any>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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

class LocalIndexedDbVault {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;

  private storiesMap = new Map<string, Story>();
  private kvMap = new Map<string, string>();
  private jobsList: ServerJobState[] = [];
  private vectorsByStory = new Map<string, VectorData[]>();

  private onStoryChangedHook:
    | ((storyId: string, action: 'save' | 'delete', story?: Story) => void)
    | null = null;

  public setOnStoryChangedHook(
    hook: ((storyId: string, action: 'save' | 'delete', story?: Story) => void) | null
  ): void {
    this.onStoryChangedHook = hook;
  }

  private getDb(): Promise<IDBDatabase | null> {
    if (!this.dbPromise) {
      this.dbPromise = openDb();
    }
    return this.dbPromise;
  }

  public async hydrate(): Promise<void> {
    if (this.hydrated) return;
    if (this.hydratePromise) return this.hydratePromise;

    this.hydratePromise = (async () => {
      try {
        // 1. Seed KV from synchronous localStorage first
        if (typeof localStorage !== 'undefined') {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith(LOCAL_KV_PREFIX)) {
              const actualKey = k.slice(LOCAL_KV_PREFIX.length);
              const val = localStorage.getItem(k);
              if (typeof val === 'string') {
                this.kvMap.set(actualKey, val);
              }
            } else if (LEGACY_STORAGE_KEYS.includes(k)) {
              const val = localStorage.getItem(k);
              if (typeof val === 'string' && !this.kvMap.has(k)) {
                this.kvMap.set(k, val);
              }
            }
          }
        }

        // 2. Load Capacitor native Preferences backup on iOS/Android
        if (isCapacitorNative()) {
          const prefs = await loadAllNativePreferences();
          for (const [k, v] of Object.entries(prefs)) {
            if (!this.kvMap.has(k)) {
              this.kvMap.set(k, v);
              if (typeof localStorage !== 'undefined') {
                try {
                  localStorage.setItem(`${LOCAL_KV_PREFIX}${k}`, v);
                } catch {
                  // ignore quota
                }
              }
            }
          }
        }

        // 3. Load IndexedDB records
        const db = await this.getDb();
        if (db) {
          try {
            const tx = db.transaction([STORE_STORIES, STORE_KV, STORE_JOBS], 'readonly');
            const [stories, kvRows, jobRows] = await Promise.all([
              reqPromise<Story[]>(tx.objectStore(STORE_STORIES).getAll()).catch(() => []),
              reqPromise<Array<{ key: string; value: string }>>(tx.objectStore(STORE_KV).getAll()).catch(
                () => []
              ),
              reqPromise<ServerJobState[]>(tx.objectStore(STORE_JOBS).getAll()).catch(() => [])
            ]);

            this.storiesMap.clear();
            for (const s of stories || []) {
              if (s?.id) this.storiesMap.set(s.id, s);
            }

            for (const row of kvRows || []) {
              if (row?.key && typeof row.value === 'string' && !this.kvMap.has(row.key)) {
                this.kvMap.set(row.key, row.value);
              }
            }

            this.jobsList = (jobRows || [])
              .map(j =>
                j.status === 'running'
                  ? {
                      ...j,
                      status: 'failed' as const,
                      statusText: 'Tác vụ bị gián đoạn do ứng dụng đóng.',
                      completedAt: j.updatedAt || Date.now()
                    }
                  : j
              )
              .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
              .slice(0, 30);
          } catch (err) {
            console.warn('[localIndexedDbVault] IndexedDB read warning:', err);
          }
        }
      } finally {
        this.hydrated = true;
        this.hydratePromise = null;
      }
    })();

    return this.hydratePromise;
  }

  public getKV(key: string): string | null {
    if (this.kvMap.has(key)) {
      return this.kvMap.get(key) ?? null;
    }
    if (typeof localStorage !== 'undefined') {
      const prefixed = localStorage.getItem(`${LOCAL_KV_PREFIX}${key}`);
      if (prefixed !== null) {
        this.kvMap.set(key, prefixed);
        return prefixed;
      }
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        this.kvMap.set(key, legacy);
        return legacy;
      }
    }
    return null;
  }

  public setKV(key: string, value: string): void {
    this.kvMap.set(key, value);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${LOCAL_KV_PREFIX}${key}`, value);
      } catch {
        // ignore quota errors
      }
    }
    void mirrorPreferenceSet(key, value);
    void this.persistKVEntry(key, value);
  }

  public removeKV(key: string): void {
    this.kvMap.delete(key);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(`${LOCAL_KV_PREFIX}${key}`);
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    void mirrorPreferenceRemove(key);
    void this.deleteKVEntry(key);
  }

  public getAllKV(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.kvMap.entries()) {
      out[k] = v;
    }
    return out;
  }

  private async persistKVEntry(key: string, value: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      await reqPromise(tx.objectStore(STORE_KV).put({ key, value }));
    } catch {
      // ignore
    }
  }

  private async deleteKVEntry(key: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      await reqPromise(tx.objectStore(STORE_KV).delete(key));
    } catch {
      // ignore
    }
  }

  public getAllStorySummaries(): Story[] {
    return Array.from(this.storiesMap.values())
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map(toStorySummary);
  }

  public getAllStories(): Story[] {
    return Array.from(this.storiesMap.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
  }

  public getStory(id: string): Story | undefined {
    const found = this.storiesMap.get(id);
    return found ? structuredCloneCompat(found) : undefined;
  }

  public async saveStory(story: Story): Promise<void> {
    await this.hydrate();
    const copy = structuredCloneCompat(story);
    this.storiesMap.set(copy.id, copy);
    this.onStoryChangedHook?.(copy.id, 'save', copy);

    const db = await this.getDb();
    if (db) {
      const tx = db.transaction(STORE_STORIES, 'readwrite');
      await reqPromise(tx.objectStore(STORE_STORIES).put(copy));
    }
  }

  public async saveChapterDelta(
    storyId: string,
    chapterId: string,
    content: string,
    title?: string,
    translatedContent?: string
  ): Promise<void> {
    await this.hydrate();
    const existing = this.storiesMap.get(storyId);
    if (!existing) return;

    const now = Date.now();
    const updated: Story = {
      ...existing,
      chapters: (existing.chapters || []).map(ch => {
        if (ch.id !== chapterId) return ch;
        return {
          ...ch,
          content,
          ...(title !== undefined ? { title } : {}),
          ...(translatedContent !== undefined ? { translatedContent } : {}),
          lastUpdated: now
        };
      })
    };

    this.storiesMap.set(storyId, updated);
    const db = await this.getDb();
    if (db) {
      const tx = db.transaction(STORE_STORIES, 'readwrite');
      await reqPromise(tx.objectStore(STORE_STORIES).put(updated));
    }
  }

  public async deleteStory(id: string): Promise<void> {
    await this.hydrate();
    this.storiesMap.delete(id);
    this.vectorsByStory.delete(id);
    this.onStoryChangedHook?.(id, 'delete');

    const db = await this.getDb();
    if (db) {
      const tx = db.transaction([STORE_STORIES, STORE_VECTORS], 'readwrite');
      tx.objectStore(STORE_STORIES).delete(id);
      const idx = tx.objectStore(STORE_VECTORS).index('storyId');
      const keys = await reqPromise<IDBValidKey[]>(idx.getAllKeys(id)).catch(() => []);
      for (const k of keys) {
        tx.objectStore(STORE_VECTORS).delete(k);
      }
    }
  }

  public async saveVectors(vectors: VectorData[]): Promise<void> {
    if (!vectors || vectors.length === 0) return;
    await this.hydrate();

    const byStory = new Map<string, VectorData[]>();
    for (const v of vectors) {
      const list = byStory.get(v.storyId) || [];
      list.push(v);
      byStory.set(v.storyId, list);
    }

    for (const [sid, list] of byStory.entries()) {
      const existing = this.vectorsByStory.get(sid) || [];
      const mergedMap = new Map<string, VectorData>();
      for (const e of existing) mergedMap.set(e.id, e);
      for (const n of list) mergedMap.set(n.id, n);
      this.vectorsByStory.set(sid, Array.from(mergedMap.values()));
    }

    const db = await this.getDb();
    if (db) {
      const tx = db.transaction(STORE_VECTORS, 'readwrite');
      const store = tx.objectStore(STORE_VECTORS);
      for (const v of vectors) {
        store.put(v);
      }
    }
  }

  public async getVectorsByStory(storyId: string): Promise<VectorData[]> {
    await this.hydrate();
    if (this.vectorsByStory.has(storyId)) {
      return [...(this.vectorsByStory.get(storyId) || [])];
    }
    const db = await this.getDb();
    if (!db) return [];
    try {
      const tx = db.transaction(STORE_VECTORS, 'readonly');
      const idx = tx.objectStore(STORE_VECTORS).index('storyId');
      const list = await reqPromise<VectorData[]>(idx.getAll(storyId));
      this.vectorsByStory.set(storyId, list || []);
      return list || [];
    } catch {
      return [];
    }
  }

  public async deleteVectorsByStory(storyId: string): Promise<void> {
    await this.hydrate();
    this.vectorsByStory.delete(storyId);
    const db = await this.getDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_VECTORS, 'readwrite');
      const idx = tx.objectStore(STORE_VECTORS).index('storyId');
      const keys = await reqPromise<IDBValidKey[]>(idx.getAllKeys(storyId));
      for (const k of keys) {
        tx.objectStore(STORE_VECTORS).delete(k);
      }
    } catch {
      // ignore
    }
  }

  public getJobs(): ServerJobState[] {
    return this.jobsList.map(j => ({ ...j }));
  }

  public async saveJobs(jobs: ServerJobState[]): Promise<void> {
    this.jobsList = jobs.slice(0, 30);
    const db = await this.getDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_JOBS, 'readwrite');
      const store = tx.objectStore(STORE_JOBS);
      store.clear();
      for (const job of this.jobsList) {
        store.put(job);
      }
    } catch {
      // ignore
    }
  }

  public async getStorageEstimate(): Promise<{ usedMB: number; quotaMB: number; percent: number }> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        const usedMB = Number(((est.usage || 0) / (1024 * 1024)).toFixed(2));
        const quotaMB = Number(((est.quota || 0) / (1024 * 1024)).toFixed(2));
        const percent = quotaMB > 0 ? Math.min(100, Math.round((usedMB / quotaMB) * 100)) : 0;
        return { usedMB, quotaMB, percent };
      }
    } catch {
      // ignore
    }
    let bytes = 0;
    for (const s of this.storiesMap.values()) {
      bytes += JSON.stringify(s).length * 2;
    }
    const usedMB = Number((bytes / (1024 * 1024)).toFixed(2));
    return { usedMB, quotaMB: 512, percent: Math.min(100, Math.round((usedMB / 512) * 100)) };
  }
}

function structuredCloneCompat<T>(obj: T): T {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(obj);
    }
  } catch {
    // fallback JSON clone
  }
  return JSON.parse(JSON.stringify(obj));
}

export const localIndexedDbVault = new LocalIndexedDbVault();
