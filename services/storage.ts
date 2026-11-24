import { Story, VectorData } from '../types.ts';
import { apiFetch, isServerRuntime, isStandaloneMode } from './runtimeAdapter.ts';
import { localIndexedDbVault } from './localIndexedDbVault.ts';

export interface ServerStorageBackend {
  getAllStorySummaries(): Story[];
  getStory(id: string): Story | undefined;
  getAllStories(): Story[];
  saveStory(story: Story): void;
  saveChapterDelta(
    storyId: string,
    chapterId: string,
    content: string,
    title?: string,
    translatedContent?: string
  ): void;
  deleteStory(id: string): void;
  saveVectors(vectors: VectorData[]): void;
  getVectorsByStory(storyId: string): VectorData[];
  deleteVectorsByStory(storyId: string): void;
  getStorageEstimate?: () => { usedMB: number; quotaMB: number; percent: number };
}

let serverBackend: ServerStorageBackend | null = null;

export function registerServerStorageBackend(backend: ServerStorageBackend): void {
  serverBackend = backend;
}

// Client debounce queue so rapid editor changes batch cleanly onto backend/IndexedDB
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let queuedStoryToSave: Story | null = null;
let isSavingInProgress = false;
let pendingSaveResolvers: Array<() => void> = [];

async function executeDirectSave(story: Story): Promise<void> {
  if (serverBackend && isServerRuntime()) {
    serverBackend.saveStory(story);
    return;
  }
  if (isStandaloneMode()) {
    await localIndexedDbVault.saveStory(story);
    return;
  }
  await apiFetch(`/api/stories/${encodeURIComponent(story.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ story })
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
    console.error('[storageService] Failed to save story:', err);
  } finally {
    isSavingInProgress = false;
    currentResolvers.forEach(res => {
      try {
        res();
      } catch {
        // ignore
      }
    });

    if (queuedStoryToSave) {
      void processSaveQueue();
    }
  }
}

export const storageService = {
  async saveChapterDelta(
    storyId: string,
    chapterId: string,
    content: string,
    title?: string,
    translatedContent?: string
  ): Promise<void> {
    if (serverBackend && isServerRuntime()) {
      serverBackend.saveChapterDelta(storyId, chapterId, content, title, translatedContent);
      return;
    }
    if (isStandaloneMode()) {
      await localIndexedDbVault.saveChapterDelta(storyId, chapterId, content, title, translatedContent);
      return;
    }
    await apiFetch(
      `/api/stories/${encodeURIComponent(storyId)}/chapters/${encodeURIComponent(chapterId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ content, title, translatedContent })
      }
    );
  },

  async saveStory(story: Story, immediate: boolean = false): Promise<void> {
    if (serverBackend && isServerRuntime()) {
      serverBackend.saveStory(story);
      return;
    }

    queuedStoryToSave = story;

    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }

    if (immediate) {
      return new Promise<void>(resolve => {
        pendingSaveResolvers.push(resolve);
        void processSaveQueue();
      });
    }

    return new Promise<void>(resolve => {
      pendingSaveResolvers.push(resolve);
      saveDebounceTimer = setTimeout(() => {
        saveDebounceTimer = null;
        void processSaveQueue();
      }, 350);
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
    if (serverBackend && isServerRuntime()) {
      return serverBackend.getStory(id);
    }
    if (isStandaloneMode()) {
      await localIndexedDbVault.hydrate();
      return localIndexedDbVault.getStory(id);
    }
    try {
      const res = await apiFetch<{ story?: Story }>(`/api/stories/${encodeURIComponent(id)}`);
      return res?.story;
    } catch {
      return undefined;
    }
  },

  async getAllStories(): Promise<Story[]> {
    if (serverBackend && isServerRuntime()) {
      return serverBackend.getAllStories();
    }
    if (isStandaloneMode()) {
      await localIndexedDbVault.hydrate();
      return localIndexedDbVault.getAllStories();
    }
    const res = await apiFetch<{ stories: Story[] }>('/api/stories?full=1');
    return res?.stories || [];
  },

  async getAllStorySummaries(): Promise<Story[]> {
    if (serverBackend && isServerRuntime()) {
      return serverBackend.getAllStorySummaries();
    }
    if (isStandaloneMode()) {
      await localIndexedDbVault.hydrate();
      return localIndexedDbVault.getAllStorySummaries();
    }
    const res = await apiFetch<{ stories: Story[] }>('/api/stories');
    return res?.stories || [];
  },

  async deleteStory(id: string): Promise<void> {
    if (serverBackend && isServerRuntime()) {
      serverBackend.deleteStory(id);
      return;
    }
    if (isStandaloneMode()) {
      await localIndexedDbVault.deleteStory(id);
      return;
    }
    await apiFetch(`/api/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async saveVectors(vectors: VectorData[]): Promise<void> {
    if (!vectors || vectors.length === 0) return;
    if (serverBackend && isServerRuntime()) {
      serverBackend.saveVectors(vectors);
      return;
    }
    if (isStandaloneMode()) {
      await localIndexedDbVault.saveVectors(vectors);
      return;
    }
    await apiFetch('/api/vectors', {
      method: 'POST',
      body: JSON.stringify({ vectors })
    });
  },

  async getVectorsByStory(storyId: string): Promise<VectorData[]> {
    if (serverBackend && isServerRuntime()) {
      return serverBackend.getVectorsByStory(storyId);
    }
    if (isStandaloneMode()) {
      return localIndexedDbVault.getVectorsByStory(storyId);
    }
    const res = await apiFetch<{ vectors: VectorData[] }>(
      `/api/vectors/${encodeURIComponent(storyId)}`
    );
    return res?.vectors || [];
  },

  async deleteVectorsByStory(storyId: string): Promise<void> {
    if (serverBackend && isServerRuntime()) {
      serverBackend.deleteVectorsByStory(storyId);
      return;
    }
    if (isStandaloneMode()) {
      await localIndexedDbVault.deleteVectorsByStory(storyId);
      return;
    }
    await apiFetch(`/api/vectors/${encodeURIComponent(storyId)}`, { method: 'DELETE' });
  },

  async getStorageEstimate(): Promise<{ usedMB: number; quotaMB: number; percent: number }> {
    if (serverBackend?.getStorageEstimate && isServerRuntime()) {
      return serverBackend.getStorageEstimate();
    }
    if (isStandaloneMode()) {
      return localIndexedDbVault.getStorageEstimate();
    }
    try {
      return await apiFetch<{ usedMB: number; quotaMB: number; percent: number }>(
        '/api/storage/estimate'
      );
    } catch {
      return { usedMB: 0, quotaMB: 0, percent: 0 };
    }
  }
};
