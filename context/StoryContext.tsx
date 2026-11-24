import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Story,
  Chapter,
  Character,
  BackupData,
  ChatMessage,
  WebInspiration,
  ExtractionCategory,
  KnowledgeLog,
  WritingDNA,
  TranslationOptions
} from '../types.ts';
import { storageService } from '../services/storage.ts';
import { ragService } from '../services/ragService.ts';
import { tokenTracker } from '../services/tokenTracker.ts';
import {
  runtimeKV,
  serverSyncClient,
  ServerJobState
} from '../services/runtimeAdapter.ts';
import { fastWordCount } from '../utils/wordCount.ts';
import { parseEpubFile, downloadEpubFile } from '../utils/epubHelper.ts';
import { shareOrDownloadFile } from '../services/iosNativeBridge.ts';

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
};

interface TokenUsage {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
}

interface PendingEdit {
  chapterId: string;
  original: string;
  modified: string;
  isTranslation?: boolean;
}

interface ChapterHistory {
  past: string[];
  future: string[];
}

interface ChapterSuggestion {
  title: string;
  conflict: string;
  emotionalGoal: string;
  outline: string;
  logicCheck: string;
}

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error';
  text: string;
}

export interface ServerMetaInfo {
  dataDir?: string;
  passwordEnabled: boolean;
  envForcedPassword: boolean;
  standaloneMode?: boolean;
}

interface StoryContextType {
  story: Story | null;
  storiesList: Story[];
  isStoriesLoaded: boolean;
  activeChapterId: string | null;
  isGenerating: boolean;
  isSummarizing: boolean;
  isSequentiallySummarizing: boolean;
  sequentialSummaryProgress: { current: number; total: number; chapterTitle: string } | null;
  generationProgress: number;
  generationStatus: string;
  isPlanning: boolean;
  isLearning: boolean;
  isSearchingWeb: boolean;
  isAuditing: boolean;
  isAuditingChapter: boolean;
  isCheckingErrors: boolean;
  isGeneratingOutline: boolean;
  isGeneratingVideo: boolean;
  isSavingManual: boolean;
  setIsSavingManual: (v: boolean) => void;
  saveTrigger: number;
  triggerSave: () => void;
  learnTrigger: number;
  triggerLearn: () => void;
  videoGenerationStatus: string;
  generatedVideoUrl: string | null;
  consistencyReport: any | null;
  auditReport: any | null;
  chapterAuditReport: any | null;
  vocabularyInsights: any | null;
  webInspiration: { insights: string; sources: WebInspiration[] } | null;
  plotArcAnalysis: any | null;
  plotArcError: string | null;
  isAnalyzingPlotArc: boolean;
  isScanningStory: boolean;
  scanProgress: { current: number; total: number; label: string } | null;
  userInstruction: string;
  setUserInstruction: (text: string) => void;
  targetWordCount: number;
  setTargetWordCount: (count: number) => void;
  pendingEdit: PendingEdit | null;
  setPendingEdit: (edit: PendingEdit | null) => void;

  // Token Tracking
  lastTokenUsage: TokenUsage | null;
  sessionTotalTokens: number;
  remainingTokensEstimate: number;

  chapterSuggestion: ChapterSuggestion | null;
  setChapterSuggestion: (s: ChapterSuggestion | null) => void;
  isSuggestingChapter: boolean;

  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  // Server Remote Control State & Controls
  activeServerJobs: ServerJobState[];
  isWsConnected: boolean;
  cancelServerJob: (jobId: string) => Promise<void>;
  serverMeta: ServerMetaInfo;
  setServerMeta: React.Dispatch<React.SetStateAction<ServerMetaInfo>>;
  toastMessage: ToastMessage | null;
  showToast: (text: string, type?: ToastMessage['type']) => void;
  dismissToast: () => void;

  loadStories: () => Promise<void>;
  refreshFromStorage: (updatedStoryIds?: string[]) => Promise<void>;
  createStory: (params: any) => Promise<void>;
  openStory: (id: string) => Promise<void>;
  closeStory: () => void;
  updateStorySettings: (settings: Partial<Story>) => Promise<void>;
  deleteStory: (id: string) => Promise<void>;
  addPersistentDirective: (directive: string) => Promise<void>;

  sendPlanningMessage: (message: string) => Promise<void>;
  clearPlanningChat: () => Promise<void>;
  sendPlotChatMessage: (message: string, focusChapterId?: string) => Promise<void>;
  clearPlotChat: () => Promise<void>;
  isPlotPlanning: boolean;

  selectChapter: (id: string) => void;
  addChapter: (
    params?: Partial<Chapter>,
    insertOptions?: { targetChapterId?: string; position?: 'before' | 'after'; autoRenumberFollowing?: boolean }
  ) => Promise<string | undefined>;
  insertChapter: (
    targetChapterId: string,
    position?: 'before' | 'after',
    params?: Partial<Chapter>,
    options?: { autoRenumberFollowing?: boolean }
  ) => Promise<string | undefined>;
  deleteChapter: (id: string) => Promise<void>;
  updateChapterContent: (id: string, content: string, pushToHistory?: boolean) => void;
  updateChapterOutline: (id: string, outline: string) => void;
  updateChapterTitle: (id: string, title: string) => void;
  updateChapterGoal: (id: string, goal: number) => void;
  updateChapterTimeSetting: (id: string, time: string) => void;
  updateChapterSummary: (id: string, summary: string) => void;
  reorderChapter: (id: string, direction: 'up' | 'down') => Promise<void>;

  generateContinue: (mode?: 'append' | 'regenerate') => Promise<void>;
  suggestNewChapter: () => Promise<void>;
  balanceChapterLength: () => Promise<void>;
  refineChapter: (customInstruction?: string) => Promise<void>;
  refineSelection: (selection: string, startIdx: number, endIdx: number, customInstruction: string) => Promise<void>;
  learnFromChapter: () => Promise<void>;
  learnFromText: (text: string, categories?: ExtractionCategory[]) => Promise<void>;
  scanStoryCharactersAndLore: () => Promise<void>;
  applyKnowledgeExtraction: (selection: {
    newCharacters: any[];
    characterUpdates: any[];
    worldLore: any[];
    mechanics: any[];
    writingDNA?: WritingDNA | null;
    genreSuggestion?: string;
    synopsisSuggestion?: string;
  }) => Promise<void>;
  learnStyleFromText: (text: string) => Promise<void>;
  learnWritingDNA: (text: string) => Promise<void>;
  learnFromInteraction: (original: string, modified: string) => Promise<void>;
  toggleEvolutionLog: (id: string) => Promise<void>;
  deleteEvolutionLog: (id: string) => Promise<void>;
  toggleKnowledgeLog: (id: string) => Promise<void>;
  deleteKnowledgeLog: (id: string) => Promise<void>;
  fetchWebInspiration: (topic?: string) => Promise<void>;
  clearWebInspiration: () => void;
  auditStory: () => Promise<void>;
  auditActiveChapter: () => Promise<void>;
  analyzeActiveChapterQuality: () => Promise<void>;
  summarizeChapter: (id: string) => Promise<void>;
  summarizeAllChaptersSequentially: () => Promise<void>;
  generateChapterContentFromPlot: (
    id: string,
    options?: { repairInstruction?: string; continuityNotes?: string }
  ) => Promise<string>;
  translateChapter: (id: string, options?: TranslationOptions) => Promise<void>;
  translationOptions: TranslationOptions;
  setTranslationOptions: React.Dispatch<React.SetStateAction<TranslationOptions>>;
  suggestActiveChapterOutline: () => Promise<void>;
  generateChapterVideo: () => Promise<void>;
  analyzeStoryPlotArc: () => Promise<void>;
  clearGeneratedVideo: () => void;
  clearConsistencyReport: () => void;
  clearAuditReport: () => void;
  clearChapterAuditReport: () => void;
  clearVocabularyInsights: () => void;
  expandSettingWithAI: (input: string) => Promise<string>;
  suggestWorldSettings: (title: string, genre: string, synopsis: string, timeline: string) => Promise<any>;
  suggestMainCharacter: (title: string, genre: string, synopsis: string) => Promise<any>;

  exportStory: (id?: string) => void;
  exportStoryEpub: (id?: string) => Promise<void>;
  exportAllStories: () => Promise<void>;
  importStory: (file: File) => Promise<void>;
  importStoryFromTxt: (file: File) => Promise<void>;
  importStoryFromEpub: (file: File) => Promise<void>;
  importChaptersFromTxt: (file: File) => Promise<void>;
  importChaptersFromEpub: (file: File) => Promise<void>;
  ingestRawDocument: (file: File, categories?: ExtractionCategory[]) => Promise<void>;

  addCharacterManual: (char: Partial<Character>) => Promise<void>;
  updateCharacter: (id: string, updates: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  autoUpdateCharacter: (charId: string) => Promise<Character | null>;

  splitChapter: (
    chapterId: string,
    segments: { title: string; content: string; outline?: string; summary?: string }[]
  ) => Promise<void>;
  mergeChapters: (
    chapterIds: string[],
    options: { newTitle: string; separator?: string; mergeTranslations?: boolean }
  ) => Promise<void>;

  applyPendingEdit: (mode?: 'overwrite' | 'new_chapter') => void;
  discardPendingEdit: () => void;
  editorSyncToken: number;
  bumpEditorSyncToken: () => void;
  isAutoTranslateEnabled: boolean;
  setIsAutoTranslateEnabled: (v: boolean) => void;
  editorVersion: 'original' | 'translation';
  setEditorVersion: (v: 'original' | 'translation') => void;
  updateChapterTranslation: (chapterId: string, translatedContent: string, translatedTitle?: string) => Promise<void>;
  promoteTranslationToMain: (chapterId: string) => Promise<void>;
  revertChapterToOriginal: (chapterId: string) => Promise<void>;
  exportAllTranslations: () => void;
  exportAllTranslationsEpub: () => Promise<void>;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

const MAX_HISTORY = 15;
const TOKEN_LIMIT_ESTIMATE = 1000000;
const MAX_WORDS_PER_CHAPTER = 1200;

const splitContentIntoChunks = (content: string, maxWords: number): string[] => {
  const paragraphs = content.split(/\n/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const paraWordCount = fastWordCount(para);
    if (paraWordCount > maxWords) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
        currentWordCount = 0;
      }
      const words = para.split(/\s+/);
      for (let i = 0; i < words.length; i += maxWords) {
        chunks.push(words.slice(i, i + maxWords).join(' '));
      }
      continue;
    }

    if (currentWordCount + paraWordCount > maxWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      currentChunk = [para];
      currentWordCount = paraWordCount;
    } else {
      currentChunk.push(para);
      currentWordCount += paraWordCount;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }

  return chunks;
};

interface StoryProviderProps {
  children: React.ReactNode;
  initialJobs?: ServerJobState[];
  serverMeta?: ServerMetaInfo;
}

export const StoryProvider: React.FC<StoryProviderProps> = ({
  children,
  initialJobs = [],
  serverMeta: initialServerMeta = { passwordEnabled: false, envForcedPassword: false }
}) => {
  const [story, setStory] = useState<Story | null>(null);
  const [storiesList, setStoriesList] = useState<Story[]>([]);
  const [isStoriesLoaded, setIsStoriesLoaded] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  const [serverJobs, setServerJobs] = useState<ServerJobState[]>(initialJobs);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(true);
  const [serverMeta, setServerMeta] = useState<ServerMetaInfo>(initialServerMeta);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [learnTrigger, setLearnTrigger] = useState(0);
  const [editorSyncToken, setEditorSyncToken] = useState(0);
  const bumpEditorSyncToken = useCallback(() => setEditorSyncToken(prev => prev + 1), []);

  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [consistencyReport, setConsistencyReport] = useState<any | null>(null);
  const [auditReport, setAuditReport] = useState<any | null>(null);
  const [chapterAuditReport, setChapterAuditReport] = useState<any | null>(null);
  const [vocabularyInsights, setVocabularyInsights] = useState<any | null>(null);
  const [webInspiration, setWebInspiration] = useState<{ insights: string; sources: WebInspiration[] } | null>(null);
  const [plotArcAnalysis, setPlotArcAnalysis] = useState<any | null>(null);
  const [plotArcError, setPlotArcError] = useState<string | null>(null);
  const [userInstruction, setUserInstruction] = useState('');
  const [targetWordCount, setTargetWordCount] = useState(2000);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [chapterSuggestion, setChapterSuggestion] = useState<ChapterSuggestion | null>(null);
  const [isAutoTranslateEnabled, setIsAutoTranslateEnabled] = useState(false);
  const [editorVersion, setEditorVersion] = useState<'original' | 'translation'>('original');

  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const id = generateId();
    setToastMessage({ id, type, text });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(prev => (prev?.id === id ? null : prev));
    }, type === 'error' ? 6000 : 4000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(null);
  }, []);

  const [translationOptions, setTranslationOptions] = useState<TranslationOptions>(() => {
    try {
      const saved = runtimeKV.getItem('aetheria_translation_options');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { outputTarget: 'new_chapter', ...parsed };
      }
    } catch {
      // ignore
    }
    return { styleMode: 'natural', outputTarget: 'new_chapter' };
  });

  useEffect(() => {
    try {
      runtimeKV.setItem('aetheria_translation_options', JSON.stringify(translationOptions));
    } catch {
      // ignore
    }
  }, [translationOptions]);

  // Token State synced from server tokenTracker logs
  const [lastTokenUsage, setLastTokenUsage] = useState<TokenUsage | null>(null);
  const [sessionTotalTokens, setSessionTotalTokens] = useState(0);
  const [remainingTokensEstimate, setRemainingTokensEstimate] = useState(TOKEN_LIMIT_ESTIMATE);

  useEffect(() => {
    const syncTokens = () => {
      const logs = tokenTracker.getLogs().filter(l => l.status === 'success');
      const total = logs.reduce((s, item) => s + (item.totalTokens || 0), 0);
      setSessionTotalTokens(total);
      setRemainingTokensEstimate(Math.max(0, TOKEN_LIMIT_ESTIMATE - total));
      const newest = logs[logs.length - 1];
      if (newest) {
        setLastTokenUsage({
          promptTokens: newest.promptTokens || 0,
          candidatesTokens: newest.candidatesTokens || 0,
          totalTokens: newest.totalTokens || 0
        });
      }
    };
    syncTokens();
    return tokenTracker.subscribe(syncTokens);
  }, []);

  const [history, setHistory] = useState<Record<string, ChapterHistory>>({});
  const storyRef = useRef<Story | null>(null);
  const activeChapterIdRef = useRef<string | null>(null);
  const handledJobIdsRef = useRef<Set<string>>(new Set());
  const awaitingJobPromisesRef = useRef<
    Map<string, { resolve: (val: any) => void; reject: (err: Error) => void }>
  >(new Map());
  const lastLocalDeltaAtRef = useRef<number>(0);

  useEffect(() => {
    storyRef.current = story;
  }, [story]);

  useEffect(() => {
    activeChapterIdRef.current = activeChapterId;
  }, [activeChapterId]);

  const triggerSave = useCallback(() => setSaveTrigger(prev => prev + 1), []);
  const triggerLearn = useCallback(() => setLearnTrigger(prev => prev + 1), []);

  // Derive legacy boolean flags cleanly from running server jobs
  const runningJobs = useMemo(
    () => serverJobs.filter(j => j.status === 'running'),
    [serverJobs]
  );

  const activeServerJobs = runningJobs;

  const genJob = useMemo(
    () =>
      runningJobs.find(j =>
        [
          'generate_continue',
          'refine_chapter',
          'refine_selection',
          'generate_from_plot',
          'translate_chapter',
          'balance_chapter_length'
        ].includes(j.type)
      ),
    [runningJobs]
  );

  const seqSumJob = useMemo(
    () => runningJobs.find(j => j.type === 'summarize_all_sequential'),
    [runningJobs]
  );

  const videoJob = useMemo(
    () => runningJobs.find(j => j.type === 'generate_video'),
    [runningJobs]
  );

  const scanJob = useMemo(
    () => runningJobs.find(j => j.type === 'scan_story_entities'),
    [runningJobs]
  );

  const isGenerating = Boolean(genJob) || isCreatingStory;
  const generationProgress = genJob?.progress ?? 0;
  const generationStatus = genJob?.statusText ?? (isCreatingStory ? 'Đang khởi tạo truyện mới...' : '');
  const isSummarizing = runningJobs.some(j => j.type === 'summarize_chapter');
  const isSequentiallySummarizing = Boolean(seqSumJob);
  const sequentialSummaryProgress = seqSumJob?.subProgress
    ? {
        current: seqSumJob.subProgress.current,
        total: seqSumJob.subProgress.total,
        chapterTitle: seqSumJob.subProgress.label
      }
    : null;
  const isPlanning = runningJobs.some(j => j.type === 'chat_planning');
  const isPlotPlanning = runningJobs.some(j => j.type === 'chat_plot');
  const isLearning = runningJobs.some(j =>
    [
      'extract_knowledge',
      'learn_writing_dna',
      'learn_style_from_text',
      'learn_from_interaction'
    ].includes(j.type)
  );
  const isSearchingWeb = runningJobs.some(j => j.type === 'fetch_web_inspiration');
  const isAuditing = runningJobs.some(j => j.type === 'audit_story');
  const isAuditingChapter = runningJobs.some(j => j.type === 'audit_chapter');
  const isCheckingErrors = runningJobs.some(j => j.type === 'analyze_vocabulary');
  const isGeneratingOutline = runningJobs.some(j => j.type === 'suggest_outline');
  const isGeneratingVideo = Boolean(videoJob);
  const videoGenerationStatus = videoJob?.statusText ?? '';
  const isAnalyzingPlotArc = runningJobs.some(j => j.type === 'analyze_plot_arc');
  const isScanningStory = Boolean(scanJob);
  const scanProgress = scanJob?.subProgress || null;
  const isSuggestingChapter = runningJobs.some(j => j.type === 'suggest_new_chapter');

  const applyCompletedJobResult = useCallback(
    (job: ServerJobState) => {
      if (handledJobIdsRef.current.has(job.id)) return;
      handledJobIdsRef.current.add(job.id);

      const pendingPromise = awaitingJobPromisesRef.current.get(job.id);
      if (pendingPromise) {
        awaitingJobPromisesRef.current.delete(job.id);
      }

      if (job.status === 'failed') {
        if (job.type === 'analyze_plot_arc') {
          setPlotArcError(job.error || 'Không thể phân tích mạch truyện.');
        } else if (!job.acknowledged) {
          showToast(job.error || job.statusText || 'Tác vụ AI gặp lỗi.', 'error');
        }
        pendingPromise?.reject(new Error(job.error || 'Tác vụ thất bại.'));
        if (!job.acknowledged) {
          void serverSyncClient.ackJob(job.id).catch(() => {});
        }
        return;
      }

      if (job.status === 'cancelled') {
        pendingPromise?.reject(new Error('Người dùng đã hủy tác vụ.'));
        if (!job.acknowledged) {
          void serverSyncClient.ackJob(job.id).catch(() => {});
        }
        return;
      }

      if (job.status === 'completed') {
        const res = job.result;
        if (res?.pendingEdit) setPendingEdit(res.pendingEdit);
        if (res?.consistencyReport !== undefined) setConsistencyReport(res.consistencyReport);
        if (res?.auditReport !== undefined) setAuditReport(res.auditReport);
        if (res?.chapterAuditReport !== undefined) setChapterAuditReport(res.chapterAuditReport);
        if (res?.vocabularyInsights !== undefined) setVocabularyInsights(res.vocabularyInsights);
        if (res?.plotArcAnalysis !== undefined) {
          setPlotArcError(null);
          setPlotArcAnalysis(res.plotArcAnalysis);
        }
        if (res?.chapterSuggestion !== undefined) setChapterSuggestion(res.chapterSuggestion);
        if (res?.webInspiration !== undefined) setWebInspiration(res.webInspiration);
        if (res?.generatedVideoUrl) setGeneratedVideoUrl(res.generatedVideoUrl);

        if (pendingPromise) {
          pendingPromise.resolve(res?.generatedText || '');
        }

        if (storyRef.current && job.storyId === storyRef.current.id) {
          void storageService.getStory(job.storyId).then(fresh => {
            if (fresh && storyRef.current?.id === job.storyId) {
              setStory(fresh);
              bumpEditorSyncToken();
            }
          });
        }

        if (!job.acknowledged) {
          if (job.type === 'learn_writing_dna' || job.type === 'learn_style_from_text' || job.type === 'translate_chapter') {
            showToast(job.statusText, 'success');
          }
          void serverSyncClient.ackJob(job.id).catch(() => {});
        }
      }
    },
    [bumpEditorSyncToken, showToast]
  );

  // Process any already-completed unacknowledged jobs when phone opens/reconnects
  useEffect(() => {
    for (const job of initialJobs) {
      if (job.status !== 'running' && !job.acknowledged) {
        applyCompletedJobResult(job);
      }
    }
  }, [initialJobs, applyCompletedJobResult]);

  // Real-time WebSocket subscription for Server Jobs & Remote Story Updates
  useEffect(() => {
    const unsubWs = serverSyncClient.subscribe('ws:status', payload => {
      setIsWsConnected(Boolean(payload?.connected));
    });

    const unsubJob = serverSyncClient.subscribe('job:updated', (job: ServerJobState) => {
      if (!job?.id) return;
      setServerJobs(prev => {
        const idx = prev.findIndex(j => j.id === job.id);
        if (idx === -1) return [job, ...prev].slice(0, 30);
        const copy = [...prev];
        copy[idx] = job;
        return copy;
      });

      if (job.status === 'running' && job.type === 'translate_chapter' && job.chapterId) {
        if (activeChapterIdRef.current !== job.chapterId && isAutoTranslateEnabled) {
          setActiveChapterId(job.chapterId);
        }
      }

      if (job.status !== 'running') {
        applyCompletedJobResult(job);
      }
    });

    const unsubStory = serverSyncClient.subscribe(
      'story:updated',
      (payload: { storyId: string; action: 'save' | 'delete' | 'chapter'; story?: Story }) => {
        if (!payload?.storyId) return;
        const { storyId, action, story: remoteStory } = payload;

        if (action === 'delete') {
          setStoriesList(prev => prev.filter(s => s.id !== storyId));
          if (storyRef.current?.id === storyId) {
            setStory(null);
            setActiveChapterId(null);
            runtimeKV.removeItem('aetheria_active_story_id');
          }
          return;
        }

        if (action === 'chapter') {
          // Skip redundant reload if triggered immediately by local typing & no server AI job running on this story
          const recentlyTypedLocally = Date.now() - lastLocalDeltaAtRef.current < 1500;
          if (recentlyTypedLocally && serverJobs.every(j => j.status !== 'running')) {
            return;
          }
          if (storyRef.current?.id === storyId) {
            void storageService.getStory(storyId).then(fresh => {
              if (fresh && storyRef.current?.id === storyId) {
                setStory(fresh);
                bumpEditorSyncToken();
              }
            });
          }
          return;
        }

        if (remoteStory) {
          setStoriesList(prev => {
            const exists = prev.some(s => s.id === storyId);
            const nextSummary = { ...remoteStory };
            if (!exists) return [nextSummary, ...prev];
            return prev.map(s => (s.id === storyId ? nextSummary : s));
          });

          if (storyRef.current?.id === storyId) {
            setStory(remoteStory);
            bumpEditorSyncToken();
          }
        }
      }
    );

    const unsubBootstrap = serverSyncClient.subscribe('bootstrap:loaded', (data: any) => {
      if (Array.isArray(data?.jobs)) {
        setServerJobs(data.jobs);
        for (const job of data.jobs) {
          if (job.status !== 'running' && !job.acknowledged) {
            applyCompletedJobResult(job);
          }
        }
      }
      if (Array.isArray(data?.storiesList)) {
        setStoriesList(data.storiesList.sort((a: Story, b: Story) => b.createdAt - a.createdAt));
      }
      if (storyRef.current) {
        void storageService.getStory(storyRef.current.id).then(fresh => {
          if (fresh) {
            setStory(fresh);
            bumpEditorSyncToken();
          }
        });
      }
    });

    return () => {
      unsubWs();
      unsubJob();
      unsubStory();
      unsubBootstrap();
    };
  }, [applyCompletedJobResult, bumpEditorSyncToken, isAutoTranslateEnabled, serverJobs]);

  const cancelServerJob = useCallback(
    async (jobId: string) => {
      setServerJobs(prev =>
        prev.map(j =>
          j.id === jobId && j.status === 'running'
            ? {
                ...j,
                status: 'cancelled',
                statusText: 'Người dùng đã hủy tác vụ.',
                completedAt: Date.now()
              }
            : j
        )
      );
      try {
        await serverSyncClient.cancelJob(jobId);
        showToast('Đã hủy lệnh AI.', 'info');
      } catch (err: any) {
        showToast(err?.message || 'Không thể hủy tác vụ.', 'error');
      }
    },
    [showToast]
  );

  const openStory = useCallback(async (id: string) => {
    try {
      runtimeKV.setItem('aetheria_active_story_id', id);
    } catch {
      // ignore
    }
    const found = await storageService.getStory(id);
    if (found) {
      const fixedChapters = found.chapters.map(c => ({
        ...c,
        wordGoal: c.wordGoal || 2000
      }));
      const cleanHistory = (historyList: ChatMessage[] | undefined) => {
        if (!historyList) return [];
        return historyList.map(msg => ({
          ...msg,
          parts: (msg.parts || []).map(p => ({
            ...p,
            text: (p.text || '').replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '').trim()
          }))
        }));
      };
      const fixedStory: Story = {
        ...found,
        chapters: fixedChapters,
        planningChatHistory: cleanHistory(found.planningChatHistory),
        plotChatHistory: cleanHistory(found.plotChatHistory)
      };
      setStory(fixedStory);
      setPlotArcAnalysis(null);
      setPlotArcError(null);
      setAuditReport(null);
      setChapterAuditReport(null);
      setConsistencyReport(null);
      if (fixedStory.chapters.length > 0) {
        const sorted = [...fixedStory.chapters].sort((a, b) => a.order - b.order);
        setActiveChapterId(sorted[0].id);
      }
      setHistory({});
    }
  }, []);

  const loadStories = useCallback(
    async (skipAutoOpen = false) => {
      try {
        const list = await storageService.getAllStorySummaries();
        const sorted = list.sort((a, b) => b.createdAt - a.createdAt);
        setStoriesList(sorted);

        if (!skipAutoOpen) {
          const savedStoryId = runtimeKV.getItem('aetheria_active_story_id');
          if (savedStoryId && sorted.some(s => s.id === savedStoryId) && !storyRef.current) {
            await openStory(savedStoryId);
          }
        }
      } catch (err) {
        console.error('Failed to load stories from server:', err);
        setStoriesList([]);
      } finally {
        setIsStoriesLoaded(true);
      }
    },
    [openStory]
  );

  useEffect(() => {
    void loadStories();
  }, [loadStories]);

  const refreshFromStorage = useCallback(
    async (updatedStoryIds?: string[]) => {
      await loadStories(true);
      const active = storyRef.current;
      if (active && (!updatedStoryIds || updatedStoryIds.includes(active.id))) {
        const refreshed = await storageService.getStory(active.id);
        if (refreshed) {
          setStory(refreshed);
          const currentChId = activeChapterIdRef.current;
          if (!currentChId || !refreshed.chapters.some(c => c.id === currentChId)) {
            setActiveChapterId(refreshed.chapters[0]?.id || null);
          }
          setEditorSyncToken(t => t + 1);
        }
      }
    },
    [loadStories]
  );

  const createStory = async (params: any) => {
    setIsCreatingStory(true);
    try {
      const storyId = generateId();
      const newStory: Story = {
        id: storyId,
        title: params.title || 'Vũ Trụ Mới',
        synopsis: params.synopsis || '',
        genre: params.genre || 'Chưa xác định',
        planning: params.planning || '',
        persistentDirectives: params.persistentDirectives || '',
        setting: params.setting || '',
        currentTimeline: params.currentTimeline || '',
        mechanics: params.mechanics || '',
        interactionRules: params.interactionRules || '',
        logistics: params.logistics || '',
        trade: params.trade || '',
        economy: params.economy || '',
        maps: params.maps || '',
        officials: params.officials || '',
        writingStyle: params.writingStyle || '',
        pov: params.pov || '',
        pronounStyle: params.pronounStyle || '',
        negativePrompt: params.negativePrompt || '',
        nsfw: params.nsfw,
        hasSystem: params.hasSystem,
        isFanfiction: params.isFanfiction,
        fandomName: params.fandomName,
        referenceDocs: params.referenceDocs || [],
        evolutionLogs: [],
        knowledgeLogs: [],
        styleReference: '',
        pinnedMemory: { physical: [], emotional: [], relational: [], world: [], inventory: [] },
        planningChatHistory: [],
        plotChatHistory: [],
        characters: params.characters || [],
        createdAt: Date.now(),
        chapters: [
          {
            id: generateId(),
            title: 'Chương 1',
            content: '',
            summary: '',
            outline: '',
            order: 1,
            wordGoal: 2000,
            lastUpdated: Date.now()
          }
        ]
      };
      await storageService.saveStory(newStory, true);
      try {
        runtimeKV.setItem('aetheria_active_story_id', storyId);
      } catch {
        // ignore
      }
      setStory(newStory);
      setActiveChapterId(newStory.chapters[0].id);
      await loadStories(true);
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi tạo truyện.', 'error');
    } finally {
      setIsCreatingStory(false);
    }
  };

  const closeStory = () => {
    try {
      runtimeKV.removeItem('aetheria_active_story_id');
    } catch {
      // ignore
    }
    void storageService.flushSaves();
    setStory(null);
    setActiveChapterId(null);
    setPlotArcAnalysis(null);
    setPlotArcError(null);
    setAuditReport(null);
    setChapterAuditReport(null);
    setConsistencyReport(null);
    void loadStories(true);
    setHistory({});
  };

  const updateStorySettings = useCallback(async (settings: Partial<Story>) => {
    const immediate =
      'continuityLedger' in settings ||
      'continuityLedgerSuppressedKeys' in settings ||
      'pinnedMemory' in settings;
    setStory(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...settings };
      void storageService.saveStory(updated, immediate);
      return updated;
    });
  }, []);

  const addPersistentDirective = async (directive: string) => {
    if (!storyRef.current || !directive.trim()) return;
    const currentDirectives = storyRef.current.persistentDirectives || '';
    if (currentDirectives.includes(directive)) return;

    const updatedDirectives = currentDirectives ? `${currentDirectives}\n- ${directive}` : `- ${directive}`;
    await updateStorySettings({ persistentDirectives: updatedDirectives });
  };

  const deleteStory = async (id: string) => {
    await storageService.deleteStory(id);
    await loadStories(true);
  };

  const updateChapterOutline = useCallback((id: string, outline: string) => {
    setStory(prev => {
      if (!prev) return null;
      const newState = {
        ...prev,
        chapters: prev.chapters.map(c => (c.id === id ? { ...c, outline, lastUpdated: Date.now() } : c))
      };
      void storageService.saveStory(newState);
      return newState;
    });
  }, []);

  const updateChapterGoal = useCallback((id: string, goal: number) => {
    const clampedGoal = Math.max(100, Math.min(15000, goal));
    setStory(prev => {
      if (!prev) return null;
      const updatedChapters = prev.chapters.map(c =>
        c.id === id ? { ...c, wordGoal: clampedGoal, lastUpdated: Date.now() } : c
      );
      const newState = { ...prev, chapters: updatedChapters };
      storageService.saveStory(newState).catch(console.error);
      return newState;
    });
  }, []);

  const updateChapterTimeSetting = useCallback((id: string, time: string) => {
    setStory(prev => {
      if (!prev) return null;
      const newState = {
        ...prev,
        chapters: prev.chapters.map(c => (c.id === id ? { ...c, timeSetting: time, lastUpdated: Date.now() } : c))
      };
      void storageService.saveStory(newState);
      return newState;
    });
  }, []);

  const updateChapterSummary = useCallback((id: string, summary: string) => {
    setStory(prev => {
      if (!prev) return null;
      const storyWithSummary: Story = {
        ...prev,
        chapters: prev.chapters.map(c => (c.id === id ? { ...c, summary, lastUpdated: Date.now() } : c))
      };
      const nextLedger = ragService.upsertChapterContinuityLedger(storyWithSummary, id, {
        mode: 'refresh_auto'
      });
      const newState: Story = {
        ...storyWithSummary,
        continuityLedger: nextLedger
      };
      void storageService.saveStory(newState, true);
      return newState;
    });
  }, []);

  // --- Authoritative Server Background AI Job Launchers ---
  const launchServerJob = useCallback(
    async (type: any, payload: any): Promise<ServerJobState> => {
      await storageService.flushSaves();
      const job = await serverSyncClient.startJob(type, payload);
      setServerJobs(prev => [job, ...prev.filter(j => j.id !== job.id)].slice(0, 30));
      return job;
    },
    []
  );

  const sendPlanningMessage = async (message: string) => {
    if (!storyRef.current || !message.trim()) return;
    const currentStory = storyRef.current;
    const optimisticHistory: ChatMessage[] = [
      ...(currentStory.planningChatHistory || []),
      { role: 'user', parts: [{ text: message }] }
    ];
    setStory({ ...currentStory, planningChatHistory: optimisticHistory });
    try {
      await launchServerJob('chat_planning', { storyId: currentStory.id, message });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi gửi tin nhắn đến Cố vấn Kế hoạch.', 'error');
    }
  };

  const clearPlanningChat = useCallback(async () => {
    setStory(prev => {
      if (!prev) return null;
      const updated = { ...prev, planningChatHistory: [] };
      void storageService.saveStory(updated, true);
      return updated;
    });
  }, []);

  const sendPlotChatMessage = async (message: string, focusChapterId?: string) => {
    if (!storyRef.current || !message.trim()) return;
    const currentStory = storyRef.current;
    const optimisticHistory: ChatMessage[] = [
      ...(currentStory.plotChatHistory || []),
      { role: 'user', parts: [{ text: message }] }
    ];
    setStory({ ...currentStory, plotChatHistory: optimisticHistory });
    try {
      await launchServerJob('chat_plot', {
        storyId: currentStory.id,
        message,
        focusChapterId: focusChapterId || activeChapterIdRef.current || undefined,
        plotArcAnalysis,
        auditReport
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi gửi tin nhắn đến Plot AI.', 'error');
    }
  };

  const clearPlotChat = useCallback(async () => {
    setStory(prev => {
      if (!prev) return null;
      const updated = { ...prev, plotChatHistory: [] };
      void storageService.saveStory(updated, true);
      return updated;
    });
  }, []);

  const selectChapter = useCallback((id: string) => setActiveChapterId(id), []);

  const insertChapter = async (
    targetChapterId: string,
    position: 'before' | 'after' = 'after',
    params?: Partial<Chapter>,
    options?: { autoRenumberFollowing?: boolean }
  ): Promise<string | undefined> => {
    const currentStory = storyRef.current;
    if (!currentStory) return undefined;

    const sortedChapters = [...currentStory.chapters].sort((a, b) => a.order - b.order);
    const targetIdx = sortedChapters.findIndex(c => c.id === targetChapterId);
    const insertIdx =
      targetIdx === -1 ? sortedChapters.length : position === 'before' ? targetIdx : targetIdx + 1;

    const newChapterId = generateId();
    const finalOrder = insertIdx + 1;

    let initialTitle = params?.title?.trim();
    if (!initialTitle) {
      initialTitle = `Chương ${finalOrder}`;
    }

    const newChapter: Chapter = {
      id: newChapterId,
      title: initialTitle,
      content: params?.content || '',
      summary: params?.summary || '',
      outline: params?.outline || '',
      timeSetting: params?.timeSetting || '',
      order: finalOrder,
      wordGoal: params?.wordGoal || 2000,
      lastUpdated: Date.now()
    };

    sortedChapters.splice(insertIdx, 0, newChapter);
    const shouldRenumber = options?.autoRenumberFollowing ?? false;

    const updatedChapters = sortedChapters.map((c, idx) => {
      const orderNum = idx + 1;
      let chapterTitle = c.title;
      if (shouldRenumber && idx > insertIdx && c.id !== newChapterId) {
        const match = chapterTitle.match(/^((?:Chương|Chapter)\s*)(\d+)(.*)$/i);
        if (match) {
          chapterTitle = `${match[1]}${parseInt(match[2], 10) + 1}${match[3]}`;
        }
      }
      return { ...c, order: orderNum, title: chapterTitle };
    });

    const updatedStory: Story = { ...currentStory, chapters: updatedChapters };
    setStory(updatedStory);
    storyRef.current = updatedStory;
    await storageService.saveStory(updatedStory, true);
    setActiveChapterId(newChapterId);
    bumpEditorSyncToken();
    return newChapterId;
  };

  const addChapter = async (
    params?: Partial<Chapter>,
    insertOptions?: { targetChapterId?: string; position?: 'before' | 'after'; autoRenumberFollowing?: boolean }
  ): Promise<string | undefined> => {
    if (insertOptions?.targetChapterId) {
      return insertChapter(
        insertOptions.targetChapterId,
        insertOptions.position || 'after',
        params,
        { autoRenumberFollowing: insertOptions.autoRenumberFollowing }
      );
    }

    const currentStory = storyRef.current;
    if (!currentStory) return undefined;
    const maxOrder =
      currentStory.chapters.length > 0 ? Math.max(...currentStory.chapters.map(c => c.order)) : 0;
    const newId = generateId();
    const newChapter: Chapter = {
      id: newId,
      title: params?.title || `Chương ${currentStory.chapters.length + 1}`,
      content: params?.content || '',
      summary: params?.summary || '',
      outline: params?.outline || '',
      timeSetting: params?.timeSetting || '',
      order: maxOrder + 1,
      wordGoal: params?.wordGoal || 2000,
      lastUpdated: Date.now()
    };
    const updatedStory = { ...currentStory, chapters: [...currentStory.chapters, newChapter] };
    setStory(updatedStory);
    storyRef.current = updatedStory;
    await storageService.saveStory(updatedStory, true);
    setActiveChapterId(newChapter.id);
    bumpEditorSyncToken();
    return newId;
  };

  const deleteChapter = async (id: string) => {
    const currentStory = storyRef.current;
    if (!currentStory || currentStory.chapters.length <= 1) return;

    const updatedChapters = currentStory.chapters.filter(c => c.id !== id);
    const updatedStory = { ...currentStory, chapters: updatedChapters };
    await storageService.saveStory(updatedStory, true);
    setStory(updatedStory);
    if (activeChapterIdRef.current === id) {
      const sorted = [...updatedChapters].sort((a, b) => a.order - b.order);
      setActiveChapterId(sorted[0]?.id || null);
    }
    await loadStories(true);
  };

  const splitChapter = async (
    chapterId: string,
    segments: { title: string; content: string; outline?: string; summary?: string }[]
  ) => {
    const currentStory = storyRef.current;
    if (!currentStory || !segments || segments.length === 0) return;

    const targetIndex = currentStory.chapters.findIndex(c => c.id === chapterId);
    if (targetIndex === -1) return;
    const originalChapter = currentStory.chapters[targetIndex];

    const newSegmentChapters: Chapter[] = segments.map((seg, idx) => ({
      id: idx === 0 ? originalChapter.id : generateId(),
      title: seg.title || `${originalChapter.title} (Phần ${idx + 1})`,
      content: seg.content || '',
      summary: seg.summary || '',
      outline: seg.outline || (idx === 0 ? originalChapter.outline : ''),
      timeSetting: originalChapter.timeSetting || '',
      order: 0,
      wordGoal: Math.max(500, Math.round((originalChapter.wordGoal || 2000) / segments.length)),
      lastUpdated: Date.now()
    }));

    const combinedChapters = [
      ...currentStory.chapters.slice(0, targetIndex),
      ...newSegmentChapters,
      ...currentStory.chapters.slice(targetIndex + 1)
    ];

    const reIndexedChapters = combinedChapters.map((c, i) => ({ ...c, order: i + 1 }));
    const updatedStory = { ...currentStory, chapters: reIndexedChapters };

    setStory(updatedStory);
    await storageService.saveStory(updatedStory, true);
    setActiveChapterId(newSegmentChapters[0].id);
    await loadStories(true);
  };

  const mergeChapters = async (
    chapterIds: string[],
    options: { newTitle: string; separator?: string; mergeTranslations?: boolean }
  ) => {
    const currentStory = storyRef.current;
    if (!currentStory || !chapterIds || chapterIds.length < 2) return;

    const selectedChapters = chapterIds
      .map(id => currentStory.chapters.find(c => c.id === id))
      .filter((c): c is Chapter => !!c);
    if (selectedChapters.length < 2) return;

    const firstChapter = selectedChapters[0];
    const separator = options.separator !== undefined ? options.separator : '\n\n';
    const mergedContent = selectedChapters.map(c => (c.content || '').trim()).filter(Boolean).join(separator);

    const hasOriginal = selectedChapters.some(c => !!c.originalContent);
    const mergedOriginalContent = hasOriginal
      ? selectedChapters.map(c => (c.originalContent || c.content || '').trim()).filter(Boolean).join(separator)
      : undefined;

    const hasTranslation = selectedChapters.some(c => !!c.translatedContent && c.translatedContent.trim().length > 0);
    const mergedTranslatedContent =
      options.mergeTranslations !== false && hasTranslation
        ? selectedChapters.map(c => (c.translatedContent || '').trim()).filter(Boolean).join(separator)
        : undefined;

    const mergedTranslatedTitle =
      options.mergeTranslations !== false && selectedChapters.some(c => !!c.translatedTitle)
        ? options.newTitle
        : undefined;

    const mergedSummary = selectedChapters.map(c => (c.summary || '').trim()).filter(Boolean).join('\n---\n');
    const mergedOutline = selectedChapters.map(c => (c.outline || '').trim()).filter(Boolean).join('\n\n');
    const totalWordGoal = selectedChapters.reduce((sum, c) => sum + (c.wordGoal || 2000), 0);

    const mergedChapter: Chapter = {
      ...firstChapter,
      title: options.newTitle.trim() || firstChapter.title,
      content: mergedContent,
      originalContent: mergedOriginalContent,
      translatedContent: mergedTranslatedContent,
      translatedTitle: mergedTranslatedTitle,
      summary: mergedSummary,
      outline: mergedOutline,
      wordGoal: totalWordGoal,
      lastUpdated: Date.now(),
      translationLastUpdated: mergedTranslatedContent ? Date.now() : undefined
    };

    const remainingChapters: Chapter[] = [];
    let inserted = false;
    for (const c of currentStory.chapters) {
      if (chapterIds.includes(c.id)) {
        if (!inserted) {
          remainingChapters.push(mergedChapter);
          inserted = true;
        }
      } else {
        remainingChapters.push(c);
      }
    }

    const updatedStory = {
      ...currentStory,
      chapters: remainingChapters.map((c, idx) => ({ ...c, order: idx + 1 }))
    };

    setStory(updatedStory);
    await storageService.saveStory(updatedStory, true);
    setActiveChapterId(mergedChapter.id);
    await loadStories(true);
  };

  const updateChapterContent = useCallback((id: string, content: string, pushToHistory = true) => {
    lastLocalDeltaAtRef.current = Date.now();
    setStory(prev => {
      if (!prev) return null;
      if (pushToHistory) {
        const currentChapter = prev.chapters.find(c => c.id === id);
        if (currentChapter && currentChapter.content !== content) {
          setHistory(prevHistory => {
            const chHistory = prevHistory[id] || { past: [], future: [] };
            const newPast = [...chHistory.past, currentChapter.content].slice(-MAX_HISTORY);
            return { ...prevHistory, [id]: { past: newPast, future: [] } };
          });
        }
      }
      const newState = {
        ...prev,
        chapters: prev.chapters.map(c => (c.id === id ? { ...c, content, lastUpdated: Date.now() } : c))
      };
      void storageService.saveChapterDelta(prev.id, id, content);
      return newState;
    });
  }, []);

  const undo = useCallback(() => {
    const id = activeChapterIdRef.current;
    if (!id || !storyRef.current) return;
    const chHistory = history[id];
    if (!chHistory || chHistory.past.length === 0) return;
    const currentContent = storyRef.current.chapters.find(c => c.id === id)?.content || '';
    const previousContent = chHistory.past[chHistory.past.length - 1];
    const newPast = chHistory.past.slice(0, -1);
    const newFuture = [currentContent, ...chHistory.future].slice(0, MAX_HISTORY);
    setHistory(prev => ({ ...prev, [id]: { past: newPast, future: newFuture } }));
    updateChapterContent(id, previousContent, false);
    bumpEditorSyncToken();
  }, [history, updateChapterContent, bumpEditorSyncToken]);

  const redo = useCallback(() => {
    const id = activeChapterIdRef.current;
    if (!id || !storyRef.current) return;
    const chHistory = history[id];
    if (!chHistory || chHistory.future.length === 0) return;
    const currentContent = storyRef.current.chapters.find(c => c.id === id)?.content || '';
    const nextContent = chHistory.future[0];
    const newFuture = chHistory.future.slice(1);
    const newPast = [...chHistory.past, currentContent].slice(-MAX_HISTORY);
    setHistory(prev => ({ ...prev, [id]: { past: newPast, future: newFuture } }));
    updateChapterContent(id, nextContent, false);
    bumpEditorSyncToken();
  }, [history, updateChapterContent, bumpEditorSyncToken]);

  const canUndo = activeChapterId ? (history[activeChapterId]?.past.length || 0) > 0 : false;
  const canRedo = activeChapterId ? (history[activeChapterId]?.future.length || 0) > 0 : false;

  const updateChapterTitle = useCallback((id: string, title: string) => {
    lastLocalDeltaAtRef.current = Date.now();
    setStory(prev => {
      if (!prev) return null;
      const newState = {
        ...prev,
        chapters: prev.chapters.map(c => (c.id === id ? { ...c, title, lastUpdated: Date.now() } : c))
      };
      void storageService.saveStory(newState);
      return newState;
    });
  }, []);

  const reorderChapter = async (id: string, direction: 'up' | 'down') => {
    const currentStory = storyRef.current;
    if (!currentStory) return;
    const chapters = [...currentStory.chapters].sort((a, b) => a.order - b.order);
    const index = chapters.findIndex(c => c.id === id);
    if (direction === 'up' && index > 0) {
      const temp = chapters[index].order;
      chapters[index].order = chapters[index - 1].order;
      chapters[index - 1].order = temp;
    } else if (direction === 'down' && index < chapters.length - 1) {
      const temp = chapters[index].order;
      chapters[index].order = chapters[index + 1].order;
      chapters[index + 1].order = temp;
    } else {
      return;
    }
    const updatedStory = { ...currentStory, chapters };
    setStory(updatedStory);
    await storageService.saveStory(updatedStory, true);
  };

  // Used locally only by RAG helper if needed
  void ragService;

  const summarizeChapter = useCallback(
    async (id: string) => {
      const currentStory = storyRef.current;
      const targetChapter = currentStory?.chapters.find(c => c.id === id);
      if (!currentStory || !targetChapter) return;

      const contentText = targetChapter.content?.trim() || '';
      const outlineText = targetChapter.outline?.trim() || '';
      const sourceText =
        contentText.length >= 50
          ? contentText
          : outlineText.length >= 10
          ? outlineText
          : contentText;

      if (!sourceText || sourceText.trim().length < 10) {
        showToast(
          `Không thể tóm tắt: Chương "${targetChapter.title}" chưa có bản thảo hoặc đề cương đủ dài (tối thiểu 10 ký tự).`,
          'error'
        );
        return;
      }

      try {
        await storageService.flushSaves();
        await launchServerJob('summarize_chapter', {
          storyId: currentStory.id,
          chapterId: id,
          title: `Tóm tắt: ${targetChapter.title}`
        });
      } catch (e: any) {
        showToast(e?.message || 'Lỗi khi khởi chạy tóm tắt chương.', 'error');
      }
    },
    [launchServerJob, showToast]
  );

  const summarizeAllChaptersSequentially = useCallback(async () => {
    const currentStory = storyRef.current;
    if (!currentStory || !currentStory.chapters || currentStory.chapters.length === 0) {
      showToast('Không tìm thấy chương truyện nào để tóm tắt.', 'error');
      return;
    }
    if (isSequentiallySummarizing) return;
    try {
      await storageService.flushSaves();
      await launchServerJob('summarize_all_sequential', {
        storyId: currentStory.id,
        title: `Tóm tắt ${currentStory.chapters.length} chương (${currentStory.title})`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi chạy tóm tắt hàng loạt trên máy chủ.', 'error');
    }
  }, [isSequentiallySummarizing, launchServerJob, showToast]);

  const generateChapterContentFromPlot = async (
    chapterId: string,
    options?: { repairInstruction?: string; continuityNotes?: string }
  ): Promise<string> => {
    const currentStory = storyRef.current;
    if (!currentStory) throw new Error('Không tìm thấy dữ liệu truyện.');
    const chapter = currentStory.chapters.find(c => c.id === chapterId);
    if (!chapter) throw new Error('Không tìm thấy chương chỉ định.');

    await storageService.flushSaves();
    const job = await launchServerJob('generate_from_plot', {
      storyId: currentStory.id,
      chapterId,
      options,
      title: `Soạn theo Plot: ${chapter.title}`
    });

    return new Promise<string>((resolve, reject) => {
      awaitingJobPromisesRef.current.set(job.id, { resolve, reject });
    });
  };

  const translateChapter = async (id: string, options?: TranslationOptions) => {
    if (isGenerating) {
      return;
    }
    const currentStory = storyRef.current;
    const targetChapter = currentStory?.chapters.find(c => c.id === id);
    if (!currentStory || !targetChapter) return;
    const sourceText = (targetChapter.originalContent || targetChapter.content || '').trim();
    if (sourceText.length < 5 && !isAutoTranslateEnabled) {
      showToast('Chương chưa có đủ nội dung gốc để Việt hóa.', 'error');
      return;
    }

    const activeOptions = options || translationOptions;
    setActiveChapterId(id);
    setEditorVersion('translation');

    try {
      await storageService.flushSaves();
      await launchServerJob('translate_chapter', {
        storyId: currentStory.id,
        chapterId: id,
        options: activeOptions,
        autoNext: isAutoTranslateEnabled,
        title: isAutoTranslateEnabled
          ? `Việt hóa tự động từ ${targetChapter.title}`
          : `Việt hóa: ${targetChapter.title}`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi khởi chạy Việt hóa trên máy chủ.', 'error');
    }
  };

  const updateChapterTranslation = async (
    chapterId: string,
    translatedContent: string,
    translatedTitle?: string
  ) => {
    if (!storyRef.current) return;
    lastLocalDeltaAtRef.current = Date.now();
    const storyId = storyRef.current.id;
    const currentChapter = storyRef.current.chapters.find(c => c.id === chapterId);
    const existingContent = currentChapter?.content || '';

    const updatedChapters = storyRef.current.chapters.map(c =>
      c.id === chapterId
        ? {
            ...c,
            translatedContent,
            translatedTitle: translatedTitle !== undefined ? translatedTitle : c.translatedTitle,
            translationLastUpdated: Date.now()
          }
        : c
    );
    const updatedStory = { ...storyRef.current, chapters: updatedChapters };
    setStory(updatedStory);
    storyRef.current = updatedStory;
    await storageService.saveChapterDelta(storyId, chapterId, existingContent, translatedTitle, translatedContent);
  };

  const promoteTranslationToMain = async (chapterId: string) => {
    if (!storyRef.current) return;
    const chapter = storyRef.current.chapters.find(c => c.id === chapterId);
    if (!chapter || !chapter.translatedContent) return;

    const updatedChapters = storyRef.current.chapters.map(c =>
      c.id === chapterId
        ? {
            ...c,
            originalContent: c.originalContent || c.content,
            content: c.translatedContent!,
            lastUpdated: Date.now()
          }
        : c
    );
    const updatedStory = { ...storyRef.current, chapters: updatedChapters };
    setStory(updatedStory);
    storyRef.current = updatedStory;
    await storageService.saveStory(updatedStory, true);
    bumpEditorSyncToken();
    setEditorVersion('original');
  };

  const revertChapterToOriginal = async (chapterId: string) => {
    if (!storyRef.current) return;
    const chapter = storyRef.current.chapters.find(c => c.id === chapterId);
    if (!chapter || !chapter.originalContent) return;

    const updatedChapters = storyRef.current.chapters.map(c =>
      c.id === chapterId ? { ...c, content: c.originalContent || c.content, lastUpdated: Date.now() } : c
    );
    const updatedStory = { ...storyRef.current, chapters: updatedChapters };
    setStory(updatedStory);
    storyRef.current = updatedStory;
    await storageService.saveStory(updatedStory, true);
    bumpEditorSyncToken();
    setEditorVersion('original');
  };

  const exportAllTranslations = () => {
    const currentStory = storyRef.current;
    if (!currentStory) return;
    const translatedChapters = currentStory.chapters
      .filter(c => !!c.translatedContent && c.translatedContent.trim().length > 0)
      .sort((a, b) => a.order - b.order);

    if (translatedChapters.length === 0) {
      showToast('Chưa có chương nào được Việt hóa trong Menu Bản Dịch để xuất!', 'error');
      return;
    }

    let fullText = `${currentStory.title} - BẢN VIỆT HÓA\n`;
    fullText += `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}\n`;
    fullText += `Tổng số chương: ${translatedChapters.length}\n`;
    fullText += `==========================================\n\n`;

    translatedChapters.forEach((ch, idx) => {
      const title = ch.translatedTitle || ch.title;
      fullText += `CHƯƠNG ${idx + 1}: ${title}\n`;
      fullText += `------------------------------------------\n`;
      fullText += `${ch.translatedContent}\n\n\n`;
    });

    const filename = `${currentStory.title.replace(/\s+/g, '_')}_Ban_Viet_Hoa.txt`;
    void shareOrDownloadFile(filename, fullText, 'text/plain;charset=utf-8');
  };

  const exportAllTranslationsEpub = async () => {
    const currentStory = storyRef.current;
    if (!currentStory) return;
    const translatedChapters = currentStory.chapters
      .filter(c => !!c.translatedContent && c.translatedContent.trim().length > 0)
      .sort((a, b) => a.order - b.order);

    if (translatedChapters.length === 0) {
      showToast('Chưa có chương nào được Việt hóa trong Menu Bản Dịch để xuất!', 'error');
      return;
    }

    const safeTitle = `${currentStory.title} (Bản Việt Hóa)`;
    await downloadEpubFile(
      {
        title: safeTitle,
        author: 'Aetheria Studio / Dịch Thuật AI',
        genre: currentStory.genre || 'Tiểu thuyết dịch',
        description: currentStory.synopsis || `Bản dịch Việt hóa hoàn chỉnh gồm ${translatedChapters.length} chương.`,
        chapters: translatedChapters.map((ch, idx) => ({
          title: ch.translatedTitle || ch.title || `Chương ${idx + 1}`,
          content: ch.translatedContent || ''
        }))
      },
      `${currentStory.title.replace(/\s+/g, '_')}_Ban_Viet_Hoa.epub`
    );
  };

  const suggestNewChapter = async () => {
    const currentStory = storyRef.current;
    if (!currentStory) return;
    try {
      await storageService.flushSaves();
      await launchServerJob('suggest_new_chapter', {
        storyId: currentStory.id,
        title: `Gợi ý chương mới (${currentStory.title})`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi gợi ý chương tiếp theo.', 'error');
    }
  };

  const generateContinue = async (mode: 'append' | 'regenerate' = 'append') => {
    const currentStory = storyRef.current;
    const currentActiveId = activeChapterId;
    if (!currentStory || !currentActiveId) return;
    const chapter = currentStory.chapters.find(c => c.id === currentActiveId);
    if (!chapter) return;
    try {
      await storageService.flushSaves();
      await launchServerJob('generate_continue', {
        storyId: currentStory.id,
        chapterId: currentActiveId,
        mode,
        editorVersion,
        userInstruction,
        targetWordCount,
        title: `Viết tiếp: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi trong quá trình tạo nội dung.', 'error');
    }
  };

  const learnWritingDNA = async (text: string) => {
    if (!storyRef.current || !text.trim()) return;
    try {
      await launchServerJob('learn_writing_dna', {
        storyId: storyRef.current.id,
        text,
        title: 'Trích xuất Hồn Văn (DNA)'
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi phân tích Hồn Văn.', 'error');
    }
  };

  const balanceChapterLength = async () => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId);
    if (!chapter) return;
    const isTrans = editorVersion === 'translation' && Boolean(chapter.translatedContent?.trim());
    const sourceContent = isTrans
      ? chapter.translatedContent || ''
      : chapter.content?.trim()
      ? chapter.content
      : chapter.translatedContent || '';

    if (!sourceContent.trim() || sourceContent.trim().length < 30) {
      showToast('Chương hiện tại chưa có đủ nội dung để AI cân bằng độ dài.', 'error');
      return;
    }

    try {
      await storageService.flushSaves();
      await launchServerJob('balance_chapter_length', {
        storyId: currentStory.id,
        chapterId: activeChapterId,
        editorVersion,
        title: `Cân bằng độ dài: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi cân bằng độ dài chương.', 'error');
    }
  };

  const refineChapter = async (customInstruction?: string) => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId);
    if (!chapter) return;

    const isTrans = editorVersion === 'translation' && Boolean(chapter.translatedContent?.trim());
    const sourceText = isTrans
      ? chapter.translatedContent || ''
      : chapter.content?.trim()
      ? chapter.content
      : chapter.translatedContent || '';

    if (!sourceText || sourceText.trim().length < 20) {
      showToast('Chương hiện tại chưa có đủ nội dung để tinh chỉnh.', 'error');
      return;
    }

    try {
      await storageService.flushSaves();
      await launchServerJob('refine_chapter', {
        storyId: currentStory.id,
        chapterId: activeChapterId,
        editorVersion,
        customInstruction: customInstruction || userInstruction,
        title: `Tinh chỉnh: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi trong quá trình tinh chỉnh văn bản.', 'error');
    }
  };

  const refineSelection = async (
    selection: string,
    startIdx: number,
    endIdx: number,
    customInstruction: string
  ) => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId);
    if (!chapter) return;

    try {
      await storageService.flushSaves();
      await launchServerJob('refine_selection', {
        storyId: currentStory.id,
        chapterId: activeChapterId,
        editorVersion,
        selection,
        startIdx,
        endIdx,
        customInstruction,
        title: `Tinh chỉnh đoạn: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi trong quá trình tinh chỉnh phân đoạn.', 'error');
    }
  };

  const applyPendingEdit = (mode: 'overwrite' | 'new_chapter' = 'new_chapter') => {
    if (!pendingEdit) return;
    const { chapterId, original, modified, isTranslation } = pendingEdit;
    const currentStory = storyRef.current;
    if (!currentStory) return;
    const targetChapter = currentStory.chapters.find(c => c.id === chapterId);
    if (!targetChapter) return;

    if (mode === 'new_chapter') {
      const cleanBaseTitle = targetChapter.title.replace(/^\[Việt Hóa\]\s*/i, '').trim();
      const newTitle =
        isTranslation || targetChapter.title.startsWith('[Việt Hóa]')
          ? targetChapter.title.startsWith('[Việt Hóa]')
            ? `${targetChapter.title} (Bản mới)`
            : `[Việt Hóa] ${cleanBaseTitle || targetChapter.title}`
          : `${targetChapter.title} (Bản mới)`;

      const newChapterId = generateId();
      const newChapter: Chapter = {
        id: newChapterId,
        title: newTitle,
        content: modified,
        summary: targetChapter.summary || '',
        outline: targetChapter.outline || '',
        timeSetting: targetChapter.timeSetting,
        order: targetChapter.order + 1,
        wordGoal: targetChapter.wordGoal || 2000,
        lastUpdated: Date.now(),
        originalContent: original,
        sourceChapterId: targetChapter.id,
        isTranslation: true
      };

      const updatedChapters: Chapter[] = [];
      for (const ch of currentStory.chapters) {
        if (ch.order > targetChapter.order) {
          updatedChapters.push({ ...ch, order: ch.order + 1 });
        } else {
          updatedChapters.push(ch);
        }
      }
      updatedChapters.push(newChapter);
      updatedChapters.sort((a, b) => a.order - b.order);

      const storyWithNewChapter: Story = { ...currentStory, chapters: updatedChapters };
      const updatedStory: Story = {
        ...storyWithNewChapter,
        continuityLedger: ragService.upsertChapterContinuityLedger(storyWithNewChapter, newChapterId, {
          mode: 'refresh_auto'
        })
      };
      setStory(updatedStory);
      storyRef.current = updatedStory;
      void storageService.saveStory(updatedStory, true);
      setActiveChapterId(newChapterId);
    } else {
      const updatedChapters = currentStory.chapters.map(c => {
        if (c.id === chapterId) {
          if (isTranslation) {
            return { ...c, translatedContent: modified, translationLastUpdated: Date.now() };
          }
          return {
            ...c,
            content: modified,
            originalContent: c.originalContent || original,
            lastUpdated: Date.now()
          };
        }
        return c;
      });
      const storyWithEdit: Story = { ...currentStory, chapters: updatedChapters };
      const updatedStory: Story = {
        ...storyWithEdit,
        continuityLedger: ragService.upsertChapterContinuityLedger(storyWithEdit, chapterId, {
          mode: 'refresh_auto'
        })
      };
      setStory(updatedStory);
      storyRef.current = updatedStory;
      void storageService.saveStory(updatedStory, true);
      bumpEditorSyncToken();
    }
    setPendingEdit(null);
  };

  const discardPendingEdit = () => setPendingEdit(null);

  const learnFromChapter = async () => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId);
    if (!chapter) return;

    const targetContent =
      editorVersion === 'translation' && chapter.translatedContent?.trim()
        ? chapter.translatedContent
        : chapter.content?.trim()
        ? chapter.content
        : chapter.translatedContent || '';

    if (!targetContent || targetContent.trim().length < 20) {
      showToast('Chương hiện tại chưa có đủ nội dung để quét tri thức & nhân vật.', 'error');
      return;
    }

    try {
      await storageService.flushSaves();
      await launchServerJob('extract_knowledge', {
        storyId: currentStory.id,
        chapterId: activeChapterId,
        editorVersion,
        categories: ['characters', 'world', 'mechanics', 'dna'],
        title: `Quét tri thức: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(`Lỗi khi quét tri thức chương: ${e?.message || 'Không thể kết nối AI.'}`, 'error');
    }
  };

  const learnFromText = async (
    text: string,
    categories: ExtractionCategory[] = ['characters', 'world', 'mechanics']
  ) => {
    if (!storyRef.current) return;
    if (!text || text.trim().length < 20) {
      showToast('Văn bản nạp vào quá ngắn để trích xuất tri thức.', 'error');
      return;
    }
    try {
      await launchServerJob('extract_knowledge', {
        storyId: storyRef.current.id,
        text,
        categories,
        title: 'Trích xuất tri thức từ văn bản'
      });
    } catch (e: any) {
      showToast(`Lỗi khi trích xuất tri thức: ${e?.message || 'Không thể kết nối AI.'}`, 'error');
    }
  };

  const scanStoryCharactersAndLore = async () => {
    const currentStory = storyRef.current;
    if (!currentStory) return;

    const hasContent = (currentStory.chapters || []).some(
      ch => (ch.content || ch.translatedContent || '').trim().length >= 30
    );
    if (!hasContent) {
      showToast('Truyện chưa có đủ nội dung chương (tối thiểu 30 ký tự) để quét nhân vật và thế giới.', 'error');
      return;
    }

    try {
      await storageService.flushSaves();
      await launchServerJob('scan_story_entities', {
        storyId: currentStory.id,
        title: `Quét nhân vật & Lore (${currentStory.title})`
      });
    } catch (e: any) {
      showToast(`Lỗi khi quét nhân vật & dữ liệu truyện: ${e?.message || 'Thử lại sau.'}`, 'error');
    }
  };

  const applyKnowledgeExtraction = async (selection: {
    newCharacters: any[];
    characterUpdates: any[];
    worldLore: any[];
    mechanics: any[];
    writingDNA?: WritingDNA | null;
    genreSuggestion?: string;
    synopsisSuggestion?: string;
  }) => {
    const currentStory = storyRef.current;
    if (!currentStory) return;

    const updatedChars = [...(currentStory.characters || [])];
    const normalizeName = (n: string) => (n || '').trim().toLowerCase().replace(/\s+/g, ' ');

    for (const raw of selection.newCharacters || []) {
      const name = (raw?.name || '').trim();
      if (!name) continue;
      const existingIdx = updatedChars.findIndex(c => normalizeName(c.name) === normalizeName(name));
      const cleanTraits = Array.isArray(raw.traits)
        ? raw.traits
        : typeof raw.traits === 'string' && raw.traits.trim()
        ? raw.traits
            .split(/[,;]/)
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [];

      if (existingIdx >= 0) {
        const prev = updatedChars[existingIdx];
        updatedChars[existingIdx] = {
          ...prev,
          role: raw.role || prev.role,
          species: raw.species || prev.species,
          description: prev.description
            ? raw.description && !prev.description.includes(raw.description)
              ? `${prev.description}\n${raw.description}`
              : prev.description
            : raw.description || '',
          appearance: prev.appearance || raw.appearance || '',
          currentLocation: raw.currentLocation || prev.currentLocation || '',
          powerLevel: raw.powerLevel || prev.powerLevel || '',
          abilities: prev.abilities || raw.abilities || '',
          traits: Array.from(new Set([...(prev.traits || []), ...cleanTraits]))
        };
      } else {
        updatedChars.push({
          id: generateId(),
          name,
          role: raw.role || 'Phụ',
          entityType: raw.entityType || 'human',
          species: raw.species || '',
          description: raw.description || '',
          appearance: raw.appearance || '',
          traits: cleanTraits,
          status: raw.status || 'alive',
          powerLevel: raw.powerLevel || '',
          currentLocation: raw.currentLocation || '',
          abilities: raw.abilities || '',
          knowledge: raw.knowledge || '',
          mentors: raw.mentors || '',
          enemies: raw.enemies || ''
        });
      }
    }

    for (const upd of selection.characterUpdates || []) {
      const name = (upd?.name || '').trim();
      if (!name) continue;
      const idx = updatedChars.findIndex(c => normalizeName(c.name) === normalizeName(name));
      if (idx >= 0) {
        const prev = updatedChars[idx];
        const mergedKnowledge = upd.knowledge
          ? prev.knowledge && !prev.knowledge.includes(upd.knowledge)
            ? `${prev.knowledge}\n• ${upd.knowledge}`
            : prev.knowledge || upd.knowledge
          : prev.knowledge;
        updatedChars[idx] = {
          ...prev,
          status: upd.status || prev.status,
          powerLevel: upd.powerLevel || prev.powerLevel,
          healthStatus: upd.healthStatus || prev.healthStatus,
          currentLocation: upd.currentLocation || prev.currentLocation,
          abilities: upd.abilities || prev.abilities,
          knowledge: mergedKnowledge
        };
      }
    }

    const newLogs: KnowledgeLog[] = [];
    let nextSetting = currentStory.setting || '';
    for (const lore of selection.worldLore || []) {
      if (!lore?.topic || !lore?.content) continue;
      if (!nextSetting.includes(lore.topic)) {
        nextSetting = `${nextSetting ? nextSetting + '\n\n' : ''}### ${lore.topic}\n${lore.content}`;
      }
      newLogs.push({
        id: generateId(),
        timestamp: Date.now(),
        category: 'world',
        title: lore.topic,
        content: lore.content,
        isActive: true
      });
    }

    let nextMechanics = currentStory.mechanics || '';
    for (const mech of selection.mechanics || []) {
      const title = (mech?.name || mech?.rule || '').trim();
      const body = (mech?.detail || mech?.rule || '').trim();
      if (!title || !body) continue;
      if (!nextMechanics.includes(title)) {
        nextMechanics = `${nextMechanics ? nextMechanics + '\n\n' : ''}• **${title}**: ${body}`;
      }
      newLogs.push({
        id: generateId(),
        timestamp: Date.now(),
        category: 'mechanics',
        title,
        content: body,
        isActive: true
      });
    }

    const updatedStory: Story = {
      ...currentStory,
      characters: updatedChars,
      setting: nextSetting,
      mechanics: nextMechanics,
      writingDNA: selection.writingDNA || currentStory.writingDNA,
      genre: selection.genreSuggestion?.trim() ? selection.genreSuggestion.trim() : currentStory.genre,
      synopsis: selection.synopsisSuggestion?.trim() ? selection.synopsisSuggestion.trim() : currentStory.synopsis,
      knowledgeLogs: [...(currentStory.knowledgeLogs || []), ...newLogs]
    };

    setStory(updatedStory);
    storyRef.current = updatedStory;
    await storageService.saveStory(updatedStory, true);
    setConsistencyReport(null);
  };

  const learnStyleFromText = async (text: string) => {
    if (!storyRef.current || !text.trim()) return;
    try {
      await launchServerJob('learn_style_from_text', {
        storyId: storyRef.current.id,
        text,
        title: 'Học quy tắc văn phong'
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi học quy tắc văn phong.', 'error');
    }
  };

  const learnFromInteraction = async (original: string, modified: string) => {
    if (!storyRef.current) return;
    try {
      await launchServerJob('learn_from_interaction', {
        storyId: storyRef.current.id,
        original,
        modified,
        title: 'Học phong cách từ chỉnh sửa'
      });
    } catch {
      // background non-critical
    }
  };

  const toggleEvolutionLog = async (id: string) => {
    setStory(prev => {
      if (!prev) return null;
      const updatedLogs = prev.evolutionLogs?.map(l => (l.id === id ? { ...l, isActive: !l.isActive } : l));
      const updated = { ...prev, evolutionLogs: updatedLogs };
      void storageService.saveStory(updated);
      return updated;
    });
  };

  const deleteEvolutionLog = async (id: string) => {
    setStory(prev => {
      if (!prev) return null;
      const updated = { ...prev, evolutionLogs: prev.evolutionLogs?.filter(l => l.id !== id) };
      void storageService.saveStory(updated);
      return updated;
    });
  };

  const toggleKnowledgeLog = async (id: string) => {
    setStory(prev => {
      if (!prev) return null;
      const updatedLogs = prev.knowledgeLogs?.map(l => (l.id === id ? { ...l, isActive: !l.isActive } : l));
      const updated = { ...prev, knowledgeLogs: updatedLogs };
      void storageService.saveStory(updated);
      return updated;
    });
  };

  const deleteKnowledgeLog = async (id: string) => {
    setStory(prev => {
      if (!prev) return null;
      const updated = { ...prev, knowledgeLogs: prev.knowledgeLogs?.filter(l => l.id !== id) };
      void storageService.saveStory(updated);
      return updated;
    });
  };

  const fetchWebInspiration = async (topic?: string) => {
    if (!storyRef.current) return;
    try {
      await launchServerJob('fetch_web_inspiration', {
        storyId: storyRef.current.id,
        topic,
        title: 'Tìm cảm hứng sáng tác Web'
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi tìm cảm hứng Web.', 'error');
    }
  };

  const clearWebInspiration = () => setWebInspiration(null);

  const expandSettingWithAI = async (input: string): Promise<string> => {
    try {
      return await serverSyncClient.runAiUtility<string>('expandSettingWithAI', { input });
    } catch {
      return input;
    }
  };

  const suggestWorldSettings = async (
    title: string,
    genre: string,
    synopsis: string,
    timeline: string
  ): Promise<any> => {
    try {
      return await serverSyncClient.runAiUtility('suggestWorldSettings', {
        title,
        genre,
        synopsis,
        timeline
      });
    } catch {
      return null;
    }
  };

  const suggestMainCharacter = async (title: string, genre: string, synopsis: string): Promise<any> => {
    try {
      return await serverSyncClient.runAiUtility('suggestMainCharacter', { title, genre, synopsis });
    } catch {
      return null;
    }
  };

  const auditStory = async () => {
    const currentStory = storyRef.current;
    if (!currentStory) return;

    const hasAnyContent =
      (currentStory.chapters || []).some(ch =>
        Boolean(ch.content?.trim() || ch.translatedContent?.trim() || ch.outline?.trim() || ch.summary?.trim())
      ) ||
      Boolean(currentStory.planning?.trim() || currentStory.setting?.trim()) ||
      (currentStory.characters || []).length > 0;

    if (!hasAnyContent) {
      showToast('Truyện hiện chưa có đủ dữ liệu (nội dung chương, dàn ý hoặc hồ sơ nhân vật) để kiểm toán.', 'error');
      return;
    }

    try {
      await storageService.flushSaves();
      await launchServerJob('audit_story', {
        storyId: currentStory.id,
        focusChapterId: activeChapterId || undefined,
        title: `Kiểm toán toàn truyện (${currentStory.title})`
      });
    } catch (e: any) {
      showToast(`Lỗi khi kiểm toán toàn truyện: ${e?.message || 'Thử lại sau.'}`, 'error');
    }
  };

  const auditActiveChapter = async () => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId);
    if (!chapter) return;

    const targetContent =
      editorVersion === 'translation' && chapter.translatedContent?.trim()
        ? chapter.translatedContent
        : chapter.content?.trim()
        ? chapter.content
        : chapter.translatedContent || '';

    if (!targetContent || targetContent.trim().length < 20) {
      showToast('Chương hiện tại chưa có đủ nội dung để kiểm toán logic.', 'error');
      return;
    }

    try {
      await storageService.flushSaves();
      await launchServerJob('audit_chapter', {
        storyId: currentStory.id,
        chapterId: chapter.id,
        editorVersion,
        title: `Kiểm toán logic: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(`Lỗi khi kiểm toán logic chương: ${e?.message || 'Thử lại sau.'}`, 'error');
    }
  };

  const analyzeActiveChapterQuality = async () => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId);
    if (!chapter) return;

    const targetContent =
      editorVersion === 'translation' && chapter.translatedContent?.trim()
        ? chapter.translatedContent
        : chapter.content?.trim()
        ? chapter.content
        : chapter.translatedContent || '';

    if (!targetContent || targetContent.trim().length < 20) {
      showToast('Chương hiện tại chưa có đủ nội dung để phân tích từ vựng.', 'error');
      return;
    }

    try {
      await storageService.flushSaves();
      await launchServerJob('analyze_vocabulary', {
        storyId: currentStory.id,
        chapterId: activeChapterId,
        editorVersion,
        title: `Phân tích từ vựng: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi phân tích chất lượng văn phong.', 'error');
    }
  };

  const suggestActiveChapterOutline = async () => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId);
    if (!chapter) return;

    try {
      await storageService.flushSaves();
      await launchServerJob('suggest_outline', {
        storyId: currentStory.id,
        chapterId: activeChapterId,
        userInstruction,
        title: `Gợi ý đề cương: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi khi AI gợi ý đề cương chương.', 'error');
    }
  };

  const generateChapterVideo = async () => {
    if (!storyRef.current || !activeChapterId) return;
    const chapter = storyRef.current.chapters.find(c => c.id === activeChapterId);
    if (!chapter?.summary) {
      showToast('Cần tóm tắt chương trước khi tạo video.', 'error');
      return;
    }
    try {
      await storageService.flushSaves();
      await launchServerJob('generate_video', {
        storyId: storyRef.current.id,
        chapterId: activeChapterId,
        title: `Tạo Video Trailer: ${chapter.title}`
      });
    } catch (e: any) {
      showToast(e?.message || 'Lỗi tạo video.', 'error');
    }
  };

  const clearGeneratedVideo = () => setGeneratedVideoUrl(null);
  const clearConsistencyReport = () => setConsistencyReport(null);
  const clearAuditReport = () => setAuditReport(null);
  const clearChapterAuditReport = () => setChapterAuditReport(null);
  const clearVocabularyInsights = () => setVocabularyInsights(null);

  const analyzeStoryPlotArc = useCallback(async () => {
    const currentStory = storyRef.current;
    if (!currentStory) return;

    const hasSubstantialContent = (currentStory.chapters || []).some(
      ch => (ch.content || ch.translatedContent || ch.summary || ch.outline || '').trim().length >= 30
    );
    if (!hasSubstantialContent) {
      setPlotArcError(
        'Truyện chưa đủ dữ liệu (cần ít nhất 1 chương có nội dung, tóm tắt hoặc đề cương) để AI phân tích mạch truyện.'
      );
      return;
    }

    setPlotArcError(null);
    try {
      await storageService.flushSaves();
      await launchServerJob('analyze_plot_arc', {
        storyId: currentStory.id,
        title: `Phân tích Plot Arc (${currentStory.title})`
      });
    } catch (e: any) {
      setPlotArcError(e?.message || 'Không thể phân tích mạch truyện lúc này.');
    }
  }, [launchServerJob]);

  const exportStory = (id?: string) => {
    const targetId = id || storyRef.current?.id;
    if (!targetId) return;

    storageService.getStory(targetId).then(s => {
      if (!s) return;
      const backup: BackupData = { version: 1, story: s, vectors: [], exportedAt: Date.now() };
      const filename = `Aetheria_Backup_${s.title.replace(/\s+/g, '_')}_${Date.now()}.json`;
      void shareOrDownloadFile(filename, JSON.stringify(backup, null, 2), 'application/json');
    });
  };

  const exportStoryEpub = async (id?: string) => {
    const targetId = id || storyRef.current?.id;
    if (!targetId) return;
    const s = await storageService.getStory(targetId);
    if (!s) return;

    const sortedChapters = [...s.chapters].sort((a, b) => a.order - b.order);
    await downloadEpubFile({
      title: s.title,
      author: 'Aetheria Studio',
      genre: s.genre || 'Tiểu thuyết',
      description: s.synopsis || '',
      chapters: sortedChapters.map((ch, idx) => ({
        title: ch.title || `Chương ${idx + 1}`,
        content: ch.content || ''
      }))
    });
  };

  const exportAllStories = async () => {
    const allStories = await storageService.getAllStories();
    if (allStories.length === 0) {
      showToast('Không có truyện nào để sao lưu.', 'error');
      return;
    }
    const backup = { version: 1, stories: allStories, exportedAt: Date.now() };
    const filename = `Aetheria_Full_Backup_${Date.now()}.json`;
    await shareOrDownloadFile(filename, JSON.stringify(backup, null, 2), 'application/json');
  };

  const importStory = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.stories && Array.isArray(json.stories)) {
          for (const s of json.stories) {
            s.id = generateId();
            s.chapters = s.chapters.map((c: any) => ({ ...c, id: generateId() }));
            s.characters = s.characters.map((c: any) => ({ ...c, id: generateId() }));
            await storageService.saveStory(s, true);
          }
          await loadStories(true);
          showToast(`Đã nhập thành công ${json.stories.length} truyện!`, 'success');
          return;
        }

        const s = json.story || json;
        if (s && s.title) {
          s.id = generateId();
          s.chapters = (s.chapters || []).map((c: any) => ({ ...c, id: generateId() }));
          s.characters = (s.characters || []).map((c: any) => ({ ...c, id: generateId() }));
          await storageService.saveStory(s, true);
          await loadStories(true);
          showToast('Nhập truyện thành công!', 'success');
        } else {
          throw new Error('Invalid format');
        }
      } catch {
        showToast('Lỗi file không hợp lệ.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const importStoryFromEpub = async (file: File) => {
    try {
      const parsed = await parseEpubFile(file);
      if (!parsed.chapters || parsed.chapters.length === 0) {
        showToast('Không tìm thấy nội dung chương trong file EPUB này.', 'error');
        return;
      }

      const finalChapters: Chapter[] = [];
      for (const raw of parsed.chapters) {
        const chunks = splitContentIntoChunks(raw.content, MAX_WORDS_PER_CHAPTER);
        if (chunks.length <= 1) {
          finalChapters.push({
            id: generateId(),
            title: raw.title,
            content: raw.content,
            summary: '',
            outline: '',
            order: finalChapters.length + 1,
            wordGoal: 2000,
            lastUpdated: Date.now()
          });
        } else {
          chunks.forEach((chunk, idx) => {
            finalChapters.push({
              id: generateId(),
              title: `${raw.title} (Phần ${idx + 1})`,
              content: chunk,
              summary: '',
              outline: '',
              order: finalChapters.length + 1,
              wordGoal: 2000,
              lastUpdated: Date.now()
            });
          });
        }
      }

      const newStory: Story = {
        id: generateId(),
        title: parsed.title || file.name.replace(/\.epub$/i, ''),
        synopsis: parsed.description || '',
        genre: parsed.genre || 'Chưa xác định',
        planning: '',
        persistentDirectives: '',
        setting: '',
        currentTimeline: '',
        mechanics: '',
        interactionRules: '',
        logistics: '',
        trade: '',
        economy: '',
        maps: '',
        officials: '',
        writingStyle: '',
        pov: 'Ngôi thứ 3 (Toàn tri)',
        pronounStyle: '',
        negativePrompt: '',
        nsfw: false,
        hasSystem: false,
        isFanfiction: false,
        referenceDocs: [],
        evolutionLogs: [],
        knowledgeLogs: [],
        styleReference: '',
        pinnedMemory: { physical: [], emotional: [], relational: [], world: [], inventory: [] },
        planningChatHistory: [],
        plotChatHistory: [],
        characters: [],
        createdAt: Date.now(),
        chapters: finalChapters
      };

      await storageService.saveStory(newStory, true);
      await loadStories(true);
      showToast(`Đã tải lên truyện thành công từ file EPUB với ${finalChapters.length} chương!`, 'success');
    } catch (err: any) {
      showToast(`Lỗi khi xử lý file EPUB: ${err?.message || 'Tệp không đúng định dạng chuẩn'}`, 'error');
    }
  };

  const importStoryFromTxt = async (file: File) => {
    if (file.name.toLowerCase().endsWith('.epub')) {
      return importStoryFromEpub(file);
    }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const text = e.target?.result as string;
        if (!text) return;

        const lines = text.split('\n');
        const title = lines[0].trim() || file.name.replace('.txt', '');
        const chapterRegex =
          /^(Chương|Chapter|第\s*[0-9一二三四五六七八九十百千万零]+\s*[章回节集卷部篇]|Tiết|Hồi)\s*/i;
        const rawChapters: { title: string; content: string }[] = [];
        let currentTitle = 'Chương 1';
        let currentContent: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (chapterRegex.test(line)) {
            if (currentContent.length > 0 || rawChapters.length > 0) {
              rawChapters.push({ title: currentTitle, content: currentContent.join('\n').trim() });
            }
            currentTitle = line;
            currentContent = [];
          } else {
            currentContent.push(lines[i]);
          }
        }

        if (currentContent.length > 0 || rawChapters.length === 0) {
          rawChapters.push({ title: currentTitle, content: currentContent.join('\n').trim() });
        }

        const finalChapters: Chapter[] = [];
        for (const raw of rawChapters) {
          const chunks = splitContentIntoChunks(raw.content, MAX_WORDS_PER_CHAPTER);
          if (chunks.length <= 1) {
            finalChapters.push({
              id: generateId(),
              title: raw.title,
              content: raw.content,
              summary: '',
              outline: '',
              order: finalChapters.length + 1,
              wordGoal: 2000,
              lastUpdated: Date.now()
            });
          } else {
            chunks.forEach((chunk, idx) => {
              finalChapters.push({
                id: generateId(),
                title: `${raw.title} (Phần ${idx + 1})`,
                content: chunk,
                summary: '',
                outline: '',
                order: finalChapters.length + 1,
                wordGoal: 2000,
                lastUpdated: Date.now()
              });
            });
          }
        }

        const newStory: Story = {
          id: generateId(),
          title,
          synopsis: '',
          genre: 'Chưa xác định',
          planning: '',
          persistentDirectives: '',
          setting: '',
          currentTimeline: '',
          mechanics: '',
          interactionRules: '',
          logistics: '',
          trade: '',
          economy: '',
          maps: '',
          officials: '',
          writingStyle: '',
          pov: 'Ngôi thứ 3 (Toàn tri)',
          pronounStyle: '',
          negativePrompt: '',
          nsfw: false,
          hasSystem: false,
          isFanfiction: false,
          referenceDocs: [],
          evolutionLogs: [],
          knowledgeLogs: [],
          styleReference: '',
          pinnedMemory: { physical: [], emotional: [], relational: [], world: [], inventory: [] },
          planningChatHistory: [],
          plotChatHistory: [],
          characters: [],
          createdAt: Date.now(),
          chapters: finalChapters
        };

        await storageService.saveStory(newStory, true);
        await loadStories(true);
        showToast(`Tải lên truyện thành công với ${finalChapters.length} chương!`, 'success');
      } catch {
        showToast('Lỗi khi xử lý file TXT.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const importChaptersFromEpub = async (file: File) => {
    if (!storyRef.current) return;
    try {
      const parsed = await parseEpubFile(file);
      if (!parsed.chapters || parsed.chapters.length === 0) {
        showToast('Không tìm thấy nội dung chương trong file EPUB này.', 'error');
        return;
      }

      const currentChapters = [...storyRef.current.chapters];
      let orderCounter = currentChapters.length;
      const newChapters: Chapter[] = [];

      for (const raw of parsed.chapters) {
        const chunks = splitContentIntoChunks(raw.content, MAX_WORDS_PER_CHAPTER);
        if (chunks.length <= 1) {
          orderCounter++;
          newChapters.push({
            id: generateId(),
            title: raw.title,
            content: raw.content,
            summary: '',
            outline: '',
            order: orderCounter,
            wordGoal: 2000,
            lastUpdated: Date.now()
          });
        } else {
          chunks.forEach((chunk, idx) => {
            orderCounter++;
            newChapters.push({
              id: generateId(),
              title: `${raw.title} (Phần ${idx + 1})`,
              content: chunk,
              summary: '',
              outline: '',
              order: orderCounter,
              wordGoal: 2000,
              lastUpdated: Date.now()
            });
          });
        }
      }

      const updatedStory = { ...storyRef.current, chapters: [...currentChapters, ...newChapters] };
      setStory(updatedStory);
      storyRef.current = updatedStory;
      await storageService.saveStory(updatedStory, true);
      bumpEditorSyncToken();
      showToast(`Đã thêm thành công ${newChapters.length} chương mới từ file EPUB!`, 'success');
    } catch (err: any) {
      showToast(`Lỗi khi nạp chương từ file EPUB: ${err?.message || 'Tệp không đúng định dạng'}`, 'error');
    }
  };

  const importChaptersFromTxt = async (file: File) => {
    if (file.name.toLowerCase().endsWith('.epub')) {
      return importChaptersFromEpub(file);
    }
    if (!storyRef.current) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const text = e.target?.result as string;
        if (!text) return;

        const lines = text.split('\n');
        const chapterRegex =
          /^(Chương|Chapter|第\s*[0-9一二三四五六七八九十百千万零]+\s*[章回节集卷部篇]|Tiết|Hồi)\s*/i;
        const rawChapters: { title: string; content: string }[] = [];
        let currentTitle = `Chương ${storyRef.current!.chapters.length + 1}`;
        let currentContent: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (chapterRegex.test(line)) {
            if (currentContent.length > 0 || rawChapters.length > 0) {
              rawChapters.push({ title: currentTitle, content: currentContent.join('\n').trim() });
            }
            currentTitle = line;
            currentContent = [];
          } else {
            currentContent.push(lines[i]);
          }
        }

        if (currentContent.length > 0 || rawChapters.length === 0) {
          rawChapters.push({ title: currentTitle, content: currentContent.join('\n').trim() });
        }

        const newChapters: Chapter[] = [];
        const startOrder = storyRef.current!.chapters.length;

        for (const raw of rawChapters) {
          const chunks = splitContentIntoChunks(raw.content, MAX_WORDS_PER_CHAPTER);
          if (chunks.length <= 1) {
            newChapters.push({
              id: generateId(),
              title: raw.title,
              content: raw.content,
              summary: '',
              outline: '',
              order: startOrder + newChapters.length + 1,
              wordGoal: 2000,
              lastUpdated: Date.now()
            });
          } else {
            chunks.forEach((chunk, idx) => {
              newChapters.push({
                id: generateId(),
                title: `${raw.title} (Phần ${idx + 1})`,
                content: chunk,
                summary: '',
                outline: '',
                order: startOrder + newChapters.length + 1,
                wordGoal: 2000,
                lastUpdated: Date.now()
              });
            });
          }
        }

        if (newChapters.length > 0) {
          const updatedStory = {
            ...storyRef.current!,
            chapters: [...storyRef.current!.chapters, ...newChapters]
          };
          setStory(updatedStory);
          await storageService.saveStory(updatedStory, true);
          showToast(`Đã thêm ${newChapters.length} chương mới từ file TXT!`, 'success');
        }
      } catch {
        showToast('Lỗi khi nhập chương từ file TXT.', 'error');
      }
    };
    reader.readAsText(file);
  };

  const ingestRawDocument = async (file: File, categories: ExtractionCategory[]) => {
    if (!storyRef.current) return;
    if (file.name.toLowerCase().endsWith('.epub')) {
      try {
        const parsed = await parseEpubFile(file);
        const fullText = parsed.chapters.map(c => `${c.title}\n${c.content}`).join('\n\n');
        if (fullText) await learnFromText(fullText, categories);
      } catch {
        showToast('Không thể giải nén tài liệu từ file EPUB.', 'error');
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = async e => {
      const text = e.target?.result as string;
      if (text) await learnFromText(text, categories);
    };
    reader.readAsText(file);
  };

  const addCharacterManual = async (char: Partial<Character>) => {
    setStory(prev => {
      if (!prev) return null;
      const newChar: Character = {
        id: generateId(),
        name: char.name || 'Nhân vật mới',
        role: char.role || 'Phụ',
        description: char.description || '',
        status: char.status || 'alive',
        traits: char.traits || [],
        appearance: char.appearance || '',
        ...char
      };
      const updated = { ...prev, characters: [...prev.characters, newChar] };
      void storageService.saveStory(updated, true);
      return updated;
    });
  };

  const updateCharacter = async (id: string, updates: Partial<Character>) => {
    setStory(prev => {
      if (!prev) return null;
      const updated = {
        ...prev,
        characters: prev.characters.map(c => (c.id === id ? { ...c, ...updates } : c))
      };
      void storageService.saveStory(updated, true);
      return updated;
    });
  };

  const deleteCharacter = async (id: string) => {
    setStory(prev => {
      if (!prev) return null;
      const updated = { ...prev, characters: prev.characters.filter(c => c.id !== id) };
      void storageService.saveStory(updated, true);
      return updated;
    });
  };

  const autoUpdateCharacter = async (charId: string): Promise<Character | null> => {
    const currentStory = storyRef.current;
    if (!currentStory) return null;
    try {
      await storageService.flushSaves();
      const updatedChar = await serverSyncClient.runAiUtility<Character | null>('autoUpdateCharacter', {
        storyId: currentStory.id,
        charId
      });
      if (updatedChar) {
        setStory(prev =>
          prev
            ? {
                ...prev,
                characters: prev.characters.map(c => (c.id === charId ? updatedChar : c))
              }
            : null
        );
      }
      return updatedChar;
    } catch (e: any) {
      showToast(e?.message || 'Không thể đồng bộ tình trạng nhân vật lúc này.', 'error');
      return null;
    }
  };

  return (
    <StoryContext.Provider
      value={{
        story,
        storiesList,
        isStoriesLoaded,
        activeChapterId,
        isGenerating,
        isSummarizing,
        isSequentiallySummarizing,
        sequentialSummaryProgress,
        generationProgress,
        generationStatus,
        isPlanning,
        isPlotPlanning,
        isLearning,
        isSearchingWeb,
        isAuditing,
        isAuditingChapter,
        isCheckingErrors,
        isGeneratingOutline,
        isGeneratingVideo,
        isSavingManual,
        setIsSavingManual,
        saveTrigger,
        triggerSave,
        learnTrigger,
        triggerLearn,
        videoGenerationStatus,
        generatedVideoUrl,
        consistencyReport,
        auditReport,
        chapterAuditReport,
        vocabularyInsights,
        webInspiration,
        plotArcAnalysis,
        plotArcError,
        isAnalyzingPlotArc,
        isScanningStory,
        scanProgress,
        userInstruction,
        setUserInstruction,
        targetWordCount,
        setTargetWordCount,
        pendingEdit,
        setPendingEdit,
        chapterSuggestion,
        setChapterSuggestion,
        isSuggestingChapter,
        lastTokenUsage,
        sessionTotalTokens,
        remainingTokensEstimate,
        canUndo,
        canRedo,
        undo,
        redo,
        activeServerJobs,
        isWsConnected,
        cancelServerJob,
        serverMeta,
        setServerMeta,
        toastMessage,
        showToast,
        dismissToast,
        loadStories,
        refreshFromStorage,
        createStory,
        openStory,
        closeStory,
        updateStorySettings,
        deleteStory,
        addPersistentDirective,
        sendPlanningMessage,
        clearPlanningChat,
        sendPlotChatMessage,
        clearPlotChat,
        selectChapter,
        addChapter,
        insertChapter,
        deleteChapter,
        splitChapter,
        mergeChapters,
        updateChapterContent,
        updateChapterOutline,
        updateChapterTitle,
        updateChapterGoal,
        updateChapterTimeSetting,
        updateChapterSummary,
        reorderChapter,
        generateContinue,
        suggestNewChapter,
        balanceChapterLength,
        refineChapter,
        translateChapter,
        generateChapterContentFromPlot,
        refineSelection,
        learnFromChapter,
        learnFromText,
        scanStoryCharactersAndLore,
        applyKnowledgeExtraction,
        learnStyleFromText,
        learnWritingDNA,
        learnFromInteraction,
        toggleEvolutionLog,
        deleteEvolutionLog,
        toggleKnowledgeLog,
        deleteKnowledgeLog,
        fetchWebInspiration,
        clearWebInspiration,
        auditStory,
        auditActiveChapter,
        analyzeActiveChapterQuality,
        summarizeChapter,
        summarizeAllChaptersSequentially,
        suggestActiveChapterOutline,
        generateChapterVideo,
        analyzeStoryPlotArc,
        clearGeneratedVideo,
        clearConsistencyReport,
        clearAuditReport,
        clearChapterAuditReport,
        clearVocabularyInsights,
        expandSettingWithAI,
        suggestWorldSettings,
        suggestMainCharacter,
        exportStory,
        exportStoryEpub,
        exportAllStories,
        importStory,
        importStoryFromTxt,
        importStoryFromEpub,
        importChaptersFromTxt,
        importChaptersFromEpub,
        ingestRawDocument,
        addCharacterManual,
        updateCharacter,
        deleteCharacter,
        autoUpdateCharacter,
        applyPendingEdit,
        discardPendingEdit,
        editorSyncToken,
        bumpEditorSyncToken,
        isAutoTranslateEnabled,
        setIsAutoTranslateEnabled,
        translationOptions,
        setTranslationOptions,
        editorVersion,
        setEditorVersion,
        updateChapterTranslation,
        promoteTranslationToMain,
        revertChapterToOriginal,
        exportAllTranslations,
        exportAllTranslationsEpub
      }}
    >
      {children}
    </StoryContext.Provider>
  );
};

export const useStory = () => {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error('useStory must be used within a StoryProvider');
  }
  return context;
};
