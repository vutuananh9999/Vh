
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

export const storageService = {
  async saveStory(story: Story): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_STORIES, 'readwrite');
      const store = tx.objectStore(STORE_STORIES);
      const request = store.put(story);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
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
