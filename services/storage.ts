
import { Story, Chapter } from '../types.ts';
import { compressText, decompressText } from '../utils/compression.ts';

const DB_NAME = 'AetheriaDB';
const DB_VERSION = 4;
const STORE_STORIES = 'stories';
const STORE_CHAPTER_DATA = 'chapter_data';
const STORE_VECTORS = 'vectors';

export interface StoredChapterPayload {
  id: string; // chapterId
  storyId: string;
  title?: string;
  content: string; // may be compressed with §GZ: prefix
  translatedContent?: string;
  translatedTitle?: string;
  summary?: string;
  outline?: string;
  lastUpdated?: number;
}

let dbInstance: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return dbInstance;

  dbInstance = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbInstance = null;
      reject(request.error);
    };
    
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_STORIES)) {
        db.createObjectStore(STORE_STORIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CHAPTER_DATA)) {
        const chapterStore = db.createObjectStore(STORE_CHAPTER_DATA, { keyPath: 'id' });
        chapterStore.createIndex('storyId', 'storyId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_VECTORS)) {
        const vectorStore = db.createObjectStore(STORE_VECTORS, { keyPath: 'id' });
        vectorStore.createIndex('storyId', 'storyId', { unique: false });
        vectorStore.createIndex('referenceId', 'metadata.referenceId', { unique: false });
        vectorStore.createIndex('type', 'metadata.type', { unique: false });
      }
    };
  });
  
  return dbInstance;
};

// Saving queue and debounce state to prevent simultaneous massive IndexedDB transactions
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let queuedStoryToSave: Story | null = null;
let isSavingInProgress = false;
let pendingSaveResolvers: Array<() => void> = [];

async function executeDirectSave(story: Story): Promise<void> {
  const db = await openDB();

  // Compress and save individual chapters to STORE_CHAPTER_DATA in a single transaction
  const tx = db.transaction([STORE_STORIES, STORE_CHAPTER_DATA], 'readwrite');
  const storyStore = tx.objectStore(STORE_STORIES);
  const chapterStore = tx.objectStore(STORE_CHAPTER_DATA);

  // Save story metadata with chapters list having summary info
  const storyToStore: Story = {
    ...story,
    chapters: await Promise.all(
      (story.chapters || []).map(async (ch) => {
        const compressedContent = await compressText(ch.content || '');
        const compressedTranslation = ch.translatedContent ? await compressText(ch.translatedContent) : '';

        const payload: StoredChapterPayload = {
          id: ch.id,
          storyId: story.id,
          title: ch.title,
          content: compressedContent,
          translatedContent: compressedTranslation,
          translatedTitle: ch.translatedTitle,
          summary: ch.summary,
          outline: ch.outline,
          lastUpdated: ch.lastUpdated || Date.now()
        };

        chapterStore.put(payload);

        // Keep lightweight metadata in story object
        return {
          id: ch.id,
          title: ch.title,
          order: ch.order,
          lastUpdated: ch.lastUpdated || Date.now(),
          wordGoal: ch.wordGoal,
          isTranslation: ch.isTranslation,
          translatedTitle: ch.translatedTitle,
          content: ch.content, // In-memory stays intact
          summary: ch.summary,
          outline: ch.outline,
          translatedContent: ch.translatedContent
        };
      })
    )
  };

  storyStore.put(storyToStore);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error("IndexedDB save error:", tx.error);
      reject(tx.error);
    };
  });
}

async function processSaveQueue(): Promise<void> {
  if (isSavingInProgress || !queuedStoryToSave) return;
  
  isSavingInProgress = true;
  const currentStory = queuedStoryToSave;
  queuedStoryToSave = null;
  const currentResolvers = pendingSaveResolvers;
  pendingSaveResolvers = [];

  try {
    await executeDirectSave(currentStory);
  } catch (err) {
    console.error("Failed to save story to IndexedDB:", err);
  } finally {
    isSavingInProgress = false;
    currentResolvers.forEach(res => {
      try { res(); } catch (_) {}
    });

    if (queuedStoryToSave) {
      processSaveQueue();
    }
  }
}

export const storageService = {
  /**
   * Fast granular chapter update without serializing the whole story.
   * Speeds up auto-save on typing keystrokes significantly.
   */
  async saveChapterDelta(
    storyId: string,
    chapterId: string,
    content: string,
    title?: string,
    translatedContent?: string
  ): Promise<void> {
    const db = await openDB();
    const compressedContent = await compressText(content);
    const compressedTranslation = translatedContent ? await compressText(translatedContent) : '';

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_STORIES, STORE_CHAPTER_DATA], 'readwrite');
      const chapterStore = tx.objectStore(STORE_CHAPTER_DATA);
      const storyStore = tx.objectStore(STORE_STORIES);

      const chapterPayload: StoredChapterPayload = {
        id: chapterId,
        storyId,
        title,
        content: compressedContent,
        translatedContent: compressedTranslation,
        lastUpdated: Date.now()
      };

      chapterStore.put(chapterPayload);

      // Update story's chapter header
      const storyReq = storyStore.get(storyId);
      storyReq.onsuccess = () => {
        const story = storyReq.result as Story | undefined;
        if (story && story.chapters) {
          const idx = story.chapters.findIndex(c => c.id === chapterId);
          if (idx !== -1) {
            story.chapters[idx].content = content;
            if (title !== undefined) story.chapters[idx].title = title;
            if (translatedContent !== undefined) story.chapters[idx].translatedContent = translatedContent;
            story.chapters[idx].lastUpdated = Date.now();
            storyStore.put(story);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async saveStory(story: Story, immediate: boolean = false): Promise<void> {
    queuedStoryToSave = story;

    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }

    if (immediate) {
      return new Promise<void>((resolve) => {
        pendingSaveResolvers.push(resolve);
        processSaveQueue();
      });
    }

    return new Promise<void>((resolve) => {
      pendingSaveResolvers.push(resolve);
      saveDebounceTimer = setTimeout(() => {
        saveDebounceTimer = null;
        processSaveQueue();
      }, 400);
    });
  },

  async flushSaves(): Promise<void> {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }
    if (queuedStoryToSave) {
      await processSaveQueue();
    }
  },

  async getStory(id: string): Promise<Story | undefined> {
    const db = await openDB();

    const story = await new Promise<Story | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_STORIES, 'readonly');
      const store = tx.objectStore(STORE_STORIES);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!story) return undefined;

    // Load chapters from STORE_CHAPTER_DATA or decompress embedded content
    const chapterMap = await new Promise<Map<string, StoredChapterPayload>>((resolve) => {
      const tx = db.transaction(STORE_CHAPTER_DATA, 'readonly');
      const store = tx.objectStore(STORE_CHAPTER_DATA);
      const index = store.index('storyId');
      const request = index.getAll(id);
      request.onsuccess = () => {
        const map = new Map<string, StoredChapterPayload>();
        (request.result || []).forEach((c: StoredChapterPayload) => map.set(c.id, c));
        resolve(map);
      };
      request.onerror = () => resolve(new Map());
    });

    // Populate and decompress chapters
    const hydratedChapters: Chapter[] = await Promise.all(
      (story.chapters || []).map(async (ch) => {
        const stored = chapterMap.get(ch.id);
        const rawContent = stored?.content ?? ch.content ?? '';
        const rawTranslation = stored?.translatedContent ?? ch.translatedContent ?? '';

        const decompressedContent = await decompressText(rawContent);
        const decompressedTranslation = rawTranslation ? await decompressText(rawTranslation) : '';

        return {
          ...ch,
          title: stored?.title ?? ch.title,
          content: decompressedContent,
          translatedContent: decompressedTranslation || ch.translatedContent,
          translatedTitle: stored?.translatedTitle ?? ch.translatedTitle,
          summary: stored?.summary ?? ch.summary,
          outline: stored?.outline ?? ch.outline,
          lastUpdated: stored?.lastUpdated ?? ch.lastUpdated
        };
      })
    );

    return {
      ...story,
      chapters: hydratedChapters
    };
  },

  async getAllStories(): Promise<Story[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STORIES, 'readonly');
      const store = tx.objectStore(STORE_STORIES);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Retrieves lightweight story summaries for the library screen.
   * Strips chapter contents to avoid loading tens of megabytes into React state.
   */
  async getAllStorySummaries(): Promise<Story[]> {
    const stories = await this.getAllStories();
    return stories.map(story => ({
      ...story,
      chapters: (story.chapters || []).map(ch => ({
        id: ch.id,
        title: ch.title,
        order: ch.order,
        lastUpdated: ch.lastUpdated,
        content: '',
        summary: '',
        outline: '',
        translatedTitle: ch.translatedTitle,
        isTranslation: ch.isTranslation
      }))
    }));
  },

  async deleteStory(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_STORIES, STORE_CHAPTER_DATA], 'readwrite');
      const storyStore = tx.objectStore(STORE_STORIES);
      const chapterStore = tx.objectStore(STORE_CHAPTER_DATA);

      storyStore.delete(id);

      // Clean up all associated chapters from STORE_CHAPTER_DATA
      const index = chapterStore.index('storyId');
      const req = index.getAllKeys(id);
      req.onsuccess = () => {
        (req.result || []).forEach(key => chapterStore.delete(key));
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Get storage usage statistics
   */
  async getStorageEstimate(): Promise<{ usedMB: number; quotaMB: number; percent: number }> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const quota = estimate.quota || 1;
        return {
          usedMB: +(used / (1024 * 1024)).toFixed(2),
          quotaMB: +(quota / (1024 * 1024)).toFixed(2),
          percent: +((used / quota) * 100).toFixed(1)
        };
      } catch {
        // fallback
      }
    }
    return { usedMB: 0, quotaMB: 0, percent: 0 };
  }
};
