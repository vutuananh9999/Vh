
import { Story, VectorData } from '../types.ts';

const DB_NAME = 'AetheriaDB';
const DB_VERSION = 3;
const STORE_STORIES = 'stories';
const STORE_VECTORS = 'vectors';

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
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_STORIES, 'readwrite');
    const store = tx.objectStore(STORE_STORIES);
    const request = store.put(story);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error("IndexedDB save error:", request.error);
      reject(request.error);
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

    // If another save was queued while this one was running, process it now
    if (queuedStoryToSave) {
      processSaveQueue();
    }
  }
}

export const storageService = {
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STORIES, 'readonly');
      const store = tx.objectStore(STORE_STORIES);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllStories(): Promise<Story[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STORIES, 'readonly');
      const store = tx.objectStore(STORE_STORIES);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
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
      // Strip chapter text contents for the library overview
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
        const tx = db.transaction(STORE_STORIES, 'readwrite');
        const store = tx.objectStore(STORE_STORIES);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
  }
};
