
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Story, Chapter, Character, VectorData, BackupData, PinnedMemory, ChatMessage, ReferenceDocument, WebInspiration, EvolutionLog, DocumentAnalysis, ExtractionCategory, KnowledgeLog, WritingDNA } from '../types.ts';
import { storageService } from '../services/storage.ts';
import { geminiService } from '../services/geminiService.ts';
import { ragService, getMagnitude } from '../services/ragService.ts';
import { fastWordCount } from '../utils/wordCount.ts';

const generateId = () => {
    try {
        return crypto.randomUUID();
    } catch (e) {
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
  webInspiration: { insights: string, sources: WebInspiration[] } | null;
  plotArcAnalysis: any | null;
  isAnalyzingPlotArc: boolean;
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
  
  loadStories: () => Promise<void>;
  createStory: (params: any) => Promise<void>;
  openStory: (id: string) => Promise<void>;
  closeStory: () => void;
  updateStorySettings: (settings: Partial<Story>) => Promise<void>;
  deleteStory: (id: string) => Promise<void>;
  addPersistentDirective: (directive: string) => Promise<void>;

  sendPlanningMessage: (message: string) => Promise<void>;
  clearPlanningChat: () => Promise<void>;
  sendPlotChatMessage: (message: string) => Promise<void>;
  clearPlotChat: () => Promise<void>;
  isPlotPlanning: boolean;

  selectChapter: (id: string) => void;
  addChapter: (params?: Partial<Chapter>) => Promise<void>;
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
  generateChapterContentFromPlot: (id: string) => Promise<string>;
  translateChapter: (id: string) => Promise<void>;
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
  exportAllStories: () => Promise<void>;
  importStory: (file: File) => Promise<void>;
  importStoryFromTxt: (file: File) => Promise<void>;
  importChaptersFromTxt: (file: File) => Promise<void>;
  ingestRawDocument: (file: File, categories?: ExtractionCategory[]) => Promise<void>;

  addCharacterManual: (char: Partial<Character>) => Promise<void>;
  updateCharacter: (id: string, updates: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  autoUpdateCharacter: (charId: string) => Promise<Character | null>;
  
  applyPendingEdit: () => void;
  discardPendingEdit: () => void;
  isAutoTranslateEnabled: boolean;
  setIsAutoTranslateEnabled: (v: boolean) => void;
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

const MAX_HISTORY = 50;
const TOKEN_LIMIT_ESTIMATE = 1000000; // Giả lập giới hạn context 1M tokens
const MAX_WORDS_PER_CHAPTER = 1200;

const countWords = fastWordCount;

const splitContentIntoChunks = (content: string, maxWords: number): string[] => {
    const paragraphs = content.split(/\n/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentWordCount = 0;

    for (const para of paragraphs) {
        const paraWordCount = fastWordCount(para);
        
        // Nếu một đoạn văn đơn lẻ đã quá dài, ta phải chia nhỏ nó ra (hiếm nhưng có thể xảy ra)
        if (paraWordCount > maxWords) {
            // Đẩy chunk hiện tại đi nếu có
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n'));
                currentChunk = [];
                currentWordCount = 0;
            }
            
            // Chia nhỏ đoạn văn dài này
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

export const StoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [story, setStory] = useState<Story | null>(null);
  const [storiesList, setStoriesList] = useState<Story[]>([]);
  const [isStoriesLoaded, setIsStoriesLoaded] = useState(false); 
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSequentiallySummarizing, setIsSequentiallySummarizing] = useState(false);
  const [sequentialSummaryProgress, setSequentialSummaryProgress] = useState<{ current: number; total: number; chapterTitle: string } | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0); 
  const [generationStatus, setGenerationStatus] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [isPlotPlanning, setIsPlotPlanning] = useState(false);
  const [isLearning, setIsLearning] = useState(false);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isAuditingChapter, setIsAuditingChapter] = useState(false);
  const [isCheckingErrors, setIsCheckingErrors] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [saveTrigger, setSaveTrigger] = useState(0);
  const [learnTrigger, setLearnTrigger] = useState(0);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoGenerationStatus, setVideoGenerationStatus] = useState("");
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [consistencyReport, setConsistencyReport] = useState<any | null>(null);
  const [auditReport, setAuditReport] = useState<any | null>(null);
  const [chapterAuditReport, setChapterAuditReport] = useState<any | null>(null);
  const [vocabularyInsights, setVocabularyInsights] = useState<any | null>(null);
  const [webInspiration, setWebInspiration] = useState<{ insights: string, sources: WebInspiration[] } | null>(null);
  const [plotArcAnalysis, setPlotArcAnalysis] = useState<any | null>(null);
  const [isAnalyzingPlotArc, setIsAnalyzingPlotArc] = useState(false);
  const [userInstruction, setUserInstruction] = useState('');
  const [targetWordCount, setTargetWordCount] = useState(2000); 
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [chapterSuggestion, setChapterSuggestion] = useState<ChapterSuggestion | null>(null);
  const [isSuggestingChapter, setIsSuggestingChapter] = useState(false);
  const [isAutoTranslateEnabled, setIsAutoTranslateEnabled] = useState(false);
  
  // Token State
  const [lastTokenUsage, setLastTokenUsage] = useState<TokenUsage | null>(null);
  const [sessionTotalTokens, setSessionTotalTokens] = useState(0);
  const [remainingTokensEstimate, setRemainingTokensEstimate] = useState(TOKEN_LIMIT_ESTIMATE);

  const [history, setHistory] = useState<Record<string, ChapterHistory>>({});
  
  const storyRef = useRef<Story | null>(null);
  const activeChapterIdRef = useRef<string | null>(null);

  useEffect(() => { storyRef.current = story; }, [story]);
  useEffect(() => { activeChapterIdRef.current = activeChapterId; }, [activeChapterId]);

  const recordUsage = useCallback((usage: any) => {
      if (!usage) return;
      const metrics: TokenUsage = {
          promptTokens: usage.promptTokenCount || 0,
          candidatesTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0
      };
      setLastTokenUsage(metrics);
      setSessionTotalTokens(prev => prev + metrics.totalTokens);
      setRemainingTokensEstimate(prev => Math.max(0, prev - metrics.totalTokens));
  }, []);

  const triggerSave = useCallback(() => setSaveTrigger(prev => prev + 1), []);
  const triggerLearn = useCallback(() => setLearnTrigger(prev => prev + 1), []);

  const loadStories = async () => {
    const list = await storageService.getAllStories();
    setStoriesList(list.sort((a, b) => (b.createdAt - a.createdAt)));
    setIsStoriesLoaded(true);
  };

  useEffect(() => { loadStories(); }, []);

  const createStory = async (params: any) => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStatus("Khởi tạo vũ trụ...");
    try {
        const storyId = generateId();
        const newStory: Story = {
          id: storyId,
          title: params.title || "Vũ Trụ Mới",
          synopsis: params.synopsis || "",
          genre: params.genre || "Chưa xác định",
          planning: params.planning || "",
          persistentDirectives: params.persistentDirectives || "",
          setting: params.setting || "",
          currentTimeline: params.currentTimeline || "", 
          mechanics: params.mechanics || "", 
          interactionRules: params.interactionRules || "",
          logistics: params.logistics || "",
          trade: params.trade || "", 
          economy: params.economy || "",
          maps: params.maps || "",
          officials: params.officials || "",
          writingStyle: params.writingStyle || "",
          pov: params.pov || "",
          pronounStyle: params.pronounStyle || "",
          negativePrompt: params.negativePrompt || "",
          nsfw: params.nsfw,
          hasSystem: params.hasSystem, 
          isFanfiction: params.isFanfiction, 
          fandomName: params.fandomName, 
          referenceDocs: params.referenceDocs || [],
          evolutionLogs: [],
          knowledgeLogs: [],
          styleReference: "", 
          pinnedMemory: { physical: [], emotional: [], relational: [], world: [], inventory: [] },
          planningChatHistory: [],
          plotChatHistory: [],
          characters: params.characters || [], 
          createdAt: Date.now(),
          chapters: [{ 
              id: generateId(), 
              title: 'Chương 1', 
              content: '', 
              summary: '', 
              outline: '', 
              order: 1, 
              wordGoal: 2000, 
              lastUpdated: Date.now() 
          }]
        };
        await storageService.saveStory(newStory);
        setStory(newStory);
        setActiveChapterId(newStory.chapters[0].id);
        await loadStories();
    } catch (e) {
        alert("Lỗi khi tạo truyện.");
    } finally {
        setIsGenerating(false);
        setGenerationStatus("");
    }
  };

  const openStory = async (id: string) => {
    const found = await storageService.getStory(id);
    if (found) {
        const fixedChapters = found.chapters.map(c => ({
          ...c,
          wordGoal: c.wordGoal || 2000
        }));
        const fixedStory = { ...found, chapters: fixedChapters };
        setStory(fixedStory);
        if (fixedStory.chapters.length > 0) {
            const sorted = [...fixedStory.chapters].sort((a, b) => a.order - b.order);
            setActiveChapterId(sorted[0].id);
        }
        setHistory({});
    }
  };

  const closeStory = () => { setStory(null); setActiveChapterId(null); loadStories(); setHistory({}); };

  const updateStorySettings = useCallback(async (settings: Partial<Story>) => {
    setStory(prev => {
        if (!prev) return null;
        const updated = { ...prev, ...settings };
        storageService.saveStory(updated);
        return updated;
    });
  }, []);

  const addPersistentDirective = async (directive: string) => {
    if (!storyRef.current || !directive.trim()) return;
    const currentDirectives = storyRef.current.persistentDirectives || "";
    if (currentDirectives.includes(directive)) return;

    const updatedDirectives = currentDirectives 
        ? `${currentDirectives}\n- ${directive}` 
        : `- ${directive}`;
        
    await updateStorySettings({ persistentDirectives: updatedDirectives });
  };

  const deleteStory = async (id: string) => {
    await storageService.deleteStory(id);
    await loadStories();
  };

  const updateChapterOutline = useCallback((id: string, outline: string) => {
    setStory(prev => {
        if (!prev) return null;
        const newState = { ...prev, chapters: prev.chapters.map(c => c.id === id ? { ...c, outline, lastUpdated: Date.now() } : c) };
        storageService.saveStory(newState);
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
        const newState = { ...prev, chapters: prev.chapters.map(c => c.id === id ? { ...c, timeSetting: time, lastUpdated: Date.now() } : c) };
        storageService.saveStory(newState);
        return newState;
    });
  }, []);

  const updateChapterSummary = useCallback((id: string, summary: string) => {
    setStory(prev => {
        if (!prev) return null;
        const newState = { ...prev, chapters: prev.chapters.map(c => c.id === id ? { ...c, summary, lastUpdated: Date.now() } : c) };
        storageService.saveStory(newState);
        return newState;
    });
  }, []);

  const sendPlanningMessage = async (message: string) => {
    if (!storyRef.current) return;
    setIsPlanning(true);
    const currentStory = storyRef.current;
    const history = currentStory.planningChatHistory || [];
    const updatedHistoryWithUser = [...history, { role: 'user', parts: [{ text: message }] } as ChatMessage];
    setStory({ ...currentStory, planningChatHistory: updatedHistoryWithUser });

    try {
        const stream = geminiService.chatPlanningStream(history, message, currentStory);
        let fullResponse = "";
        for await (const chunk of stream) {
            fullResponse += chunk.text;
            // Record usage from last chunk
            if (chunk.usageMetadata) recordUsage(chunk.usageMetadata);
            
            setStory(prev => {
                if (!prev) return null;
                const currentHist = prev.planningChatHistory || [];
                const newHist = [...currentHist];
                if (newHist.length > 0 && newHist[newHist.length - 1].role === 'model') {
                    newHist[newHist.length - 1] = { role: 'model', parts: [{ text: fullResponse }] };
                } else {
                    newHist.push({ role: 'model', parts: [{ text: fullResponse }] });
                }
                return { ...prev, planningChatHistory: newHist };
            });
        }
        if (storyRef.current) await storageService.saveStory(storyRef.current);
    } catch (e) { } finally { setIsPlanning(false); }
  };

  const clearPlanningChat = useCallback(async () => {
    setStory(prev => {
        if (!prev) return null;
        const updated = { ...prev, planningChatHistory: [] };
        storageService.saveStory(updated);
        return updated;
    });
  }, []);

  const sendPlotChatMessage = async (message: string) => {
    if (!storyRef.current) return;
    setIsPlotPlanning(true);
    const currentStory = storyRef.current;
    const history = currentStory.plotChatHistory || [];
    const updatedHistoryWithUser = [...history, { role: 'user', parts: [{ text: message }] } as ChatMessage];
    setStory({ ...currentStory, plotChatHistory: updatedHistoryWithUser });

    try {
        const stream = geminiService.chatPlotStream(history, message, currentStory);
        let fullResponse = "";
        for await (const chunk of stream) {
            fullResponse += chunk.text;
            if (chunk.usageMetadata) recordUsage(chunk.usageMetadata);
            
            setStory(prev => {
                if (!prev) return null;
                const currentHist = prev.plotChatHistory || [];
                const newHist = [...currentHist];
                if (newHist.length > 0 && newHist[newHist.length - 1].role === 'model') {
                    newHist[newHist.length - 1] = { role: 'model', parts: [{ text: fullResponse }] };
                } else {
                    newHist.push({ role: 'model', parts: [{ text: fullResponse }] });
                }
                return { ...prev, plotChatHistory: newHist };
            });
        }
        if (storyRef.current) await storageService.saveStory(storyRef.current);
    } catch (e) { } finally { setIsPlotPlanning(false); }
  };

  const clearPlotChat = useCallback(async () => {
    setStory(prev => {
        if (!prev) return null;
        const updated = { ...prev, plotChatHistory: [] };
        storageService.saveStory(updated);
        return updated;
    });
  }, []);

  const selectChapter = useCallback((id: string) => setActiveChapterId(id), []);

  const addChapter = async (params?: Partial<Chapter>) => {
    if (!story) return;
    const maxOrder = story.chapters.length > 0 ? Math.max(...story.chapters.map(c => c.order)) : 0;
    const newChapter: Chapter = {
        id: generateId(), 
        title: params?.title || `Chương ${story.chapters.length + 1}`, 
        content: params?.content || '', 
        summary: params?.summary || '', 
        outline: params?.outline || '', 
        timeSetting: params?.timeSetting || '',
        order: maxOrder + 1, 
        wordGoal: 2000, 
        lastUpdated: Date.now()
    };
    const updatedStory = { ...story, chapters: [...story.chapters, newChapter] };
    setStory(updatedStory);
    await storageService.saveStory(updatedStory);
    setActiveChapterId(newChapter.id);
  };

  const deleteChapter = async (id: string) => {
    const currentStory = storyRef.current;
    if (!currentStory || currentStory.chapters.length <= 1) return;

    const updatedChapters = currentStory.chapters.filter(c => c.id !== id);
    const updatedStory = { ...currentStory, chapters: updatedChapters };
    await storageService.saveStory(updatedStory);
    setStory(updatedStory);
    if (activeChapterIdRef.current === id) {
        const sorted = [...updatedChapters].sort((a, b) => a.order - b.order);
        const newActiveId = sorted[0]?.id || null;
        setActiveChapterId(newActiveId);
    }
    await loadStories();
  };

  const updateChapterContent = useCallback((id: string, content: string, pushToHistory = true) => {
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
        const newState = { ...prev, chapters: prev.chapters.map(c => c.id === id ? { ...c, content, lastUpdated: Date.now() } : c) };
        storageService.saveStory(newState);
        return newState;
    });
  }, []);

  const undo = useCallback(() => {
    const id = activeChapterIdRef.current;
    if (!id || !storyRef.current) return;
    const chHistory = history[id];
    if (!chHistory || chHistory.past.length === 0) return;
    const currentContent = storyRef.current.chapters.find(c => c.id === id)?.content || "";
    const previousContent = chHistory.past[chHistory.past.length - 1];
    const newPast = chHistory.past.slice(0, -1);
    const newFuture = [currentContent, ...chHistory.future].slice(0, MAX_HISTORY);
    setHistory(prev => ({ ...prev, [id]: { past: newPast, future: newFuture } }));
    updateChapterContent(id, previousContent, false);
  }, [history, updateChapterContent]);

  const redo = useCallback(() => {
    const id = activeChapterIdRef.current;
    if (!id || !storyRef.current) return;
    const chHistory = history[id];
    if (!chHistory || chHistory.future.length === 0) return;
    const currentContent = storyRef.current.chapters.find(c => c.id === id)?.content || "";
    const nextContent = chHistory.future[0];
    const newFuture = chHistory.future.slice(1);
    const newPast = [...chHistory.past, currentContent].slice(-MAX_HISTORY);
    setHistory(prev => ({ ...prev, [id]: { past: newPast, future: newFuture } }));
    updateChapterContent(id, nextContent, false);
  }, [history, updateChapterContent]);

  const canUndo = activeChapterId ? (history[activeChapterId]?.past.length || 0) > 0 : false;
  const canRedo = activeChapterId ? (history[activeChapterId]?.future.length || 0) > 0 : false;

  const updateChapterTitle = useCallback((id: string, title: string) => {
    setStory(prev => {
        if (!prev) return null;
        const newState = { ...prev, chapters: prev.chapters.map(c => c.id === id ? { ...c, title, lastUpdated: Date.now() } : c) };
        storageService.saveStory(newState);
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
    } else { return; }
    const updatedStory = { ...currentStory, chapters };
    setStory(updatedStory);
    await storageService.saveStory(updatedStory);
  };

  const getRelevantKnowledge = async (queryText: string, s: Story): Promise<string> => {
    const pool = ragService.buildKnowledgePool(s);
    if (pool.length === 0) return s.setting || "Chưa có bối cảnh.";
    
    try {
        const queryEmbedding = await geminiService.embedText(queryText);
        if (!queryEmbedding || queryEmbedding.length === 0) return s.setting || "Chưa có bối cảnh.";
        
        const matches = ragService.search(queryEmbedding, pool, { topK: 12, minScore: 0.5 });
        const retrievedText = matches.map(m => m.text).join('\n\n');
        const activeEvolutionRules = s.evolutionLogs?.filter(l => l.isActive).map(l => `- Quy tắc: ${l.learnedRule}`).join('\n') || "";
        return `[BỐI CẢNH GỐC]:\n${s.setting}\n\n[TRI THỨC TRUY XUẤT]:\n${retrievedText}\n\n[TIẾN HÓA VĂN PHONG]:\n${activeEvolutionRules}`;
    } catch (e) { return s.setting || "Chưa có bối cảnh."; }
  };

  const summarizeChapter = useCallback(async (id: string) => {
    const targetChapter = storyRef.current?.chapters.find(c => c.id === id);
    if (!targetChapter) return;
    
    const contentText = targetChapter.content?.trim() || "";
    const outlineText = targetChapter.outline?.trim() || "";
    
    let sourceText = "";
    let isFromOutline = false;
    
    if (contentText.length >= 50) {
        sourceText = contentText;
    } else if (outlineText.length >= 10) {
        sourceText = `[Đề cương của chương]:\n${outlineText}`;
        isFromOutline = true;
    } else if (contentText.length > 0) {
        sourceText = contentText;
    }
    
    if (!sourceText || sourceText.trim().length < 10) {
        alert(`Không thể tóm tắt: Chương "${targetChapter.title}" chưa có bản thảo hoặc đề cương đủ dài (tối thiểu 10 ký tự). Hãy viết thêm trước khi tóm tắt.`);
        return;
    }

    setIsSummarizing(true); 
    try {
        const result = await geminiService.generateChapterSummary(
            targetChapter.title, 
            sourceText + (isFromOutline ? "\n\n(Lưu ý: Tóm tắt lại ngắn gọn diễn biến chính dựa trên đề cương này)" : "")
        );
        if (result && result.text) {
            recordUsage(result.usageMetadata);
            setStory(prev => {
                if (!prev) return null;
                const updatedChapters = prev.chapters.map(c => c.id === id ? { ...c, summary: result.text } : c);
                const updatedStory = { ...prev, chapters: updatedChapters };
                storageService.saveStory(updatedStory);
                return updatedStory;
            });
        }
    } catch (e) {
        console.error("Lỗi khi tóm tắt chương:", e);
        alert("Có lỗi xảy ra trong quá trình gọi AI để tóm tắt chương.");
    } finally { 
        setIsSummarizing(false); 
    }
  }, [recordUsage]);

  const summarizeAllChaptersSequentially = useCallback(async () => {
    const currentStory = storyRef.current;
    if (!currentStory || !currentStory.chapters || currentStory.chapters.length === 0) {
        alert("Không tìm thấy chương truyện nào để tóm tắt.");
        return;
    }

    if (isSequentiallySummarizing) return;

    setIsSequentiallySummarizing(true);
    
    try {
        const sortedChapters = [...currentStory.chapters].sort((a, b) => a.order - b.order);
        
        for (let i = 0; i < sortedChapters.length; i++) {
            const chapter = sortedChapters[i];
            
            // Re-read current chapter state from ref in case it was updated by previous steps
            const currentStoryLatest = storyRef.current;
            const latestChapter = currentStoryLatest?.chapters.find(c => c.id === chapter.id) || chapter;
            
            // Skip if the chapter already has a summary
            if (latestChapter.summary?.trim()) {
                setSequentialSummaryProgress({ 
                    current: i + 1, 
                    total: sortedChapters.length, 
                    chapterTitle: `${latestChapter.title} (Bỏ qua - Đã có tóm tắt)` 
                });
                await new Promise(resolve => setTimeout(resolve, 600));
                continue;
            }
            
            const contentText = latestChapter.content?.trim() || "";
            const outlineText = latestChapter.outline?.trim() || "";
            
            let sourceText = "";
            let isFromOutline = false;
            
            if (contentText.length >= 50) {
                sourceText = contentText;
            } else if (outlineText.length >= 10) {
                sourceText = `[Đề cương của chương]:\n${outlineText}`;
                isFromOutline = true;
            } else if (contentText.length > 0) {
                sourceText = contentText;
            }
            
            if (!sourceText || sourceText.trim().length < 10) {
                setSequentialSummaryProgress({ 
                    current: i + 1, 
                    total: sortedChapters.length, 
                    chapterTitle: `${latestChapter.title} (Bỏ qua - Chưa có bản thảo/đề cương)` 
                });
                await new Promise(resolve => setTimeout(resolve, 1500));
                continue;
            }

            setSequentialSummaryProgress({ 
                current: i + 1, 
                total: sortedChapters.length, 
                chapterTitle: latestChapter.title 
            });

            try {
                const result = await geminiService.generateChapterSummary(
                    latestChapter.title, 
                    sourceText + (isFromOutline ? "\n\n(Lưu ý: Tóm tắt lại ngắn gọn diễn biến chính dựa trên đề cương này)" : "")
                );
                
                if (result && result.text) {
                    recordUsage(result.usageMetadata);
                    setStory(prev => {
                        if (!prev) return null;
                        const updatedChapters = prev.chapters.map(c => c.id === latestChapter.id ? { ...c, summary: result.text } : c);
                        const updatedStory = { ...prev, chapters: updatedChapters };
                        storageService.saveStory(updatedStory);
                        return updatedStory;
                    });
                }
            } catch (err) {
                console.error(`Lỗi khi tóm tắt chương "${latestChapter.title}":`, err);
                // Keep moving to next chapter even if one fails
            }

            // Small breathing gap between API requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (e) {
        console.error("Lỗi trong quá trình tóm tắt hàng loạt:", e);
    } finally {
        setIsSequentiallySummarizing(false);
        setSequentialSummaryProgress(null);
    }
  }, [isSequentiallySummarizing, recordUsage]);

  const generateChapterContentFromPlot = async (chapterId: string): Promise<string> => {
    const currentStory = storyRef.current;
    if (!currentStory) throw new Error("Không tìm thấy dữ liệu truyện.");
    
    const chapter = currentStory.chapters.find(c => c.id === chapterId);
    if (!chapter) throw new Error("Không tìm thấy chương chỉ định.");
    
    setIsGenerating(true);
    setGenerationStatus("Đang dùng AI tự động viết/sửa bản thảo chương...");
    
    try {
        const result = await geminiService.generateChapterContentFromPlot(chapter, currentStory);
        if (result && result.text) {
            recordUsage(result.usageMetadata);
            updateChapterContent(chapterId, result.text, true);
            return result.text;
        }
        return chapter.content;
    } catch (e) {
        console.error("Lỗi khi tự động sửa bản thảo:", e);
        throw e;
    } finally {
        setIsGenerating(false);
    }
  };

  const translateChapter = async (id: string) => {
    const targetChapter = storyRef.current?.chapters.find(c => c.id === id);
    if (!targetChapter || !targetChapter.content || targetChapter.content.length < 10) return;
    setIsGenerating(true);
    setGenerationStatus("Đang dịch sang tiếng Việt...");
    try {
        const stream = geminiService.translateToVietnameseStream(targetChapter.content);
        let accumulated = "";
        let finalMetadata = null;
        
        for await (const chunk of stream) {
            if (chunk.text) {
                accumulated += chunk.text;
                if (isAutoTranslateEnabled) {
                    updateChapterContent(id, accumulated, false);
                }
            }
            if (chunk.usageMetadata) finalMetadata = chunk.usageMetadata;
        }

        if (finalMetadata) recordUsage(finalMetadata);
        
        if (isAutoTranslateEnabled) {
            updateChapterContent(id, accumulated, true);
            
            const currentStory = storyRef.current;
            if (currentStory) {
                const sorted = [...currentStory.chapters].sort((a, b) => a.order - b.order);
                const currentIndex = sorted.findIndex(c => c.id === id);
                if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
                    const nextChapter = sorted[currentIndex + 1];
                    setTimeout(() => {
                        setActiveChapterId(nextChapter.id);
                        translateChapter(nextChapter.id);
                    }, 800); 
                } else {
                    alert("Đã dịch xong toàn bộ các chương!");
                }
            }
        } else {
            setPendingEdit({ chapterId: id, original: targetChapter.content, modified: accumulated });
        }
    } catch (e) {
        console.error(e);
        alert("Kết nối quá yếu (LTE). Quá trình bị gián đoạn, vui lòng thử lại.");
    } finally { 
        setIsGenerating(false);
        setGenerationStatus("");
    }
  };

  const suggestNewChapter = async () => {
    const currentStory = storyRef.current;
    if (!currentStory) return;
    setIsSuggestingChapter(true);
    try {
        const result = await geminiService.generateAdvancedChapterSuggestion(currentStory);
        if (result && result.data) {
            recordUsage(result.usageMetadata);
            setChapterSuggestion(result.data);
        }
    } catch (e) { console.error(e); }
    finally { setIsSuggestingChapter(false); }
  };

  const generateContinue = async (mode: 'append' | 'regenerate' = 'append') => {
    const currentStory = storyRef.current;
    const currentActiveId = activeChapterId; 
    if (!currentStory || !currentActiveId) return;
    const chapter = currentStory.chapters.find(c => c.id === currentActiveId)!;
    const sortedChapters = [...currentStory.chapters].sort((a, b) => a.order - b.order);
    const currentIndex = sortedChapters.findIndex(c => c.id === currentActiveId);
    const previousChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
    const previousChapterTime = previousChapter?.timeSetting || "Không rõ (Chương mở đầu)";

    setIsGenerating(true);
    setGenerationProgress(5); 
    setGenerationStatus("Đang đồng bộ Đa Tầng Bộ Nhớ...");
    
    try {
        const stmContext = mode === 'regenerate' ? "" : chapter.content.slice(-2500);
        const entitySearchContext = chapter.outline + " " + userInstruction + " " + stmContext;
        
        let historicalContext = "";
        if (currentStory.currentTimeline && currentStory.currentTimeline.length > 3) {
             setGenerationStatus("Tra cứu Dữ liệu Lịch sử & Grounding...");
             historicalContext = await geminiService.fetchHistoricalContext(currentStory.currentTimeline);
        }

        let canonContext = "";
        if (currentStory.isFanfiction) {
            if (currentStory.fandomName && currentStory.fandomName.length > 2) {
                 setGenerationStatus(`Tra cứu dữ liệu gốc ${currentStory.fandomName}...`);
                 canonContext = await geminiService.fetchCanonContext(currentStory.fandomName);
            }
            if (currentStory.referenceDocs && currentStory.referenceDocs.length > 0) {
                 const docsText = currentStory.referenceDocs.map(doc => `[DỮ LIỆU TỪ LORE TẬP TIN ${doc.name}]:\n${doc.content}`).join("\n\n");
                 canonContext = canonContext ? `${canonContext}\n\n${docsText}` : docsText;
            }
        }

        setGenerationStatus("Truy xuất Semantic LTM & Thẩm định Tri thức...");
        setGenerationProgress(20);
        const [verificationReport, dynamicWorldBible] = await Promise.all([
            geminiService.verifyKnowledge(entitySearchContext, currentStory),
            getRelevantKnowledge(entitySearchContext, currentStory)
        ]);

        setGenerationStatus("Aetheria đang dệt nên thực tại mới...");
        setGenerationProgress(40);

        const initialContent = mode === 'regenerate' ? "" : chapter.content;
        const stream = geminiService.generateStoryStream(
            initialContent, dynamicWorldBible, currentStory.planning, currentStory.characters, currentStory.interactionRules, userInstruction, currentStory.genre, currentStory.writingStyle || "", currentStory.pov, currentStory.pronounStyle, currentStory.negativePrompt, currentStory.nsfw || false, currentStory.hasSystem || false, targetWordCount, currentStory.persistentDirectives || "", currentStory.mechanics || "", chapter.outline, verificationReport, currentStory.writingDNA, chapter.timeSetting || "", previousChapterTime, currentStory.currentTimeline || "", historicalContext, canonContext
        );
        
        let accumulated = "";
        for await (const chunk of stream) {
            const chunkText = chunk.text || "";
            if (chunkText) {
                accumulated += chunkText;
                setGenerationProgress(prev => Math.min(90, prev + 0.3));
            }
            if (chunk.usageMetadata) recordUsage(chunk.usageMetadata);
        }
        
        setGenerationStatus("Giai đoạn Hậu kiểm & Nhất quán hóa...");
        setGenerationProgress(92);
        
        const finalDraft = initialContent + (initialContent && !initialContent.endsWith('\n') ? '\n' : '') + accumulated;
        const correctedResult = await geminiService.enforceCompliance(finalDraft, currentStory, verificationReport);
        
        recordUsage(correctedResult.usageMetadata);
        updateChapterContent(currentActiveId, correctedResult.text || finalDraft, true);
        
        if (storyRef.current) {
            await storageService.saveStory(storyRef.current);
            setGenerationStatus("Đang đúc kết Tóm tắt Chương...");
            await summarizeChapter(currentActiveId);
        }
    } catch (e) { console.error(e); } finally {
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStatus("");
    }
  };

  const learnWritingDNA = async (text: string) => {
    if (!storyRef.current || !text.trim()) return;
    setIsLearning(true);
    try {
      const result = await geminiService.extractWritingDNA(text);
      if (result && result.data) {
        recordUsage(result.usageMetadata);
        setStory(prev => {
          if (!prev) return null;
          const updated = { ...prev, writingDNA: result.data };
          storageService.saveStory(updated);
          return updated;
        });
        alert("Đã phục hồi Hồn Văn từ văn bản mẫu!");
      }
    } catch (e) { }
    setIsLearning(false);
  };

  const balanceChapterLength = async () => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId)!;
    setIsGenerating(true);
    try {
        const result = await geminiService.balanceChapterLength(chapter.content, chapter.wordGoal || 2000, fastWordCount(chapter.content), currentStory.interactionRules, currentStory.genre, currentStory.negativePrompt);
        if (result && result.data && result.data.edited_text) {
          recordUsage(result.usageMetadata);
          updateChapterContent(activeChapterId, result.data.edited_text);
          if (storyRef.current) {
              await storageService.saveStory(storyRef.current);
              await summarizeChapter(activeChapterId);
          }
        }
    } catch (e) { } finally { setIsGenerating(false); }
  };

  const refineChapter = async (customInstruction?: string) => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId)!;
    setIsGenerating(true);
    try {
        const verificationReport = await geminiService.verifyKnowledge(customInstruction || "", currentStory);
        const dynamicWorldBible = await getRelevantKnowledge(chapter.outline, currentStory);
        const stream = geminiService.refineChapterStream(chapter.content, dynamicWorldBible, currentStory.interactionRules, currentStory.genre, currentStory.writingStyle || "", currentStory.pov, currentStory.pronounStyle, currentStory.negativePrompt, currentStory.nsfw || false, customInstruction || userInstruction, currentStory.persistentDirectives || "", currentStory.mechanics || "", currentStory.styleReference || "");
        let accumulated = "";
        for await (const chunk of stream) { 
            accumulated += chunk.text; 
            if (chunk.usageMetadata) recordUsage(chunk.usageMetadata);
        }
        const correctedResult = await geminiService.enforceCompliance(accumulated, currentStory, verificationReport);
        recordUsage(correctedResult.usageMetadata);
        setPendingEdit({ chapterId: activeChapterId, original: chapter.content, modified: correctedResult.text || accumulated });
    } catch (e) { } finally { setIsGenerating(false); }
  };

  const refineSelection = async (selection: string, startIdx: number, endIdx: number, customInstruction: string) => {
    const currentStory = storyRef.current;
    if (!currentStory || !activeChapterId) return;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId)!;
    setIsGenerating(true);
    const prefix = chapter.content.substring(0, startIdx);
    const suffix = chapter.content.substring(endIdx);
    try {
        const verificationReport = await geminiService.verifyKnowledge(customInstruction, currentStory);
        const stream = geminiService.refineSelectionStream(selection, prefix, suffix, currentStory, customInstruction);
        let accumulated = "";
        for await (const chunk of stream) { 
            accumulated += chunk.text; 
            if (chunk.usageMetadata) recordUsage(chunk.usageMetadata);
        }
        const correctedResult = await geminiService.enforceCompliance(accumulated, currentStory, verificationReport);
        recordUsage(correctedResult.usageMetadata);
        setPendingEdit({ chapterId: activeChapterId, original: chapter.content, modified: prefix + (correctedResult.text || accumulated) + suffix });
    } catch (e) { } finally { setIsGenerating(false); }
  };

  const applyPendingEdit = () => {
    if (pendingEdit) {
        const { chapterId, modified } = pendingEdit;
        updateChapterContent(chapterId, modified, true);
        setPendingEdit(null);
    }
  };

  const discardPendingEdit = () => setPendingEdit(null);

  const learnFromChapter = async () => {
    if (!storyRef.current || !activeChapterId) return;
    const chapter = storyRef.current.chapters.find(c => c.id === activeChapterId)!;
    setIsLearning(true);
    try {
        const report = await geminiService.extractKnowledge(chapter.content, storyRef.current);
        if (report) {
            recordUsage(report.usageMetadata);
            setConsistencyReport(report.data);
        }
    } catch (e) { } finally { setIsLearning(false); }
  };

  const learnFromText = async (text: string, categories: ExtractionCategory[] = ['characters', 'world']) => {
    if (!storyRef.current) return;
    setIsLearning(true);
    try {
        const report = await geminiService.extractKnowledge(text, storyRef.current, categories);
        if (report) {
            recordUsage(report.usageMetadata);
            setConsistencyReport(report.data);
        }
    } catch (e) { } finally { setIsLearning(false); }
  };

  const learnStyleFromText = async (text: string) => {
    if (!storyRef.current || !text.trim()) return;
    setIsLearning(true);
    try {
      const result = await geminiService.extractStylisticRule(text);
      if (result && result.text) {
        recordUsage(result.usageMetadata);
        const newLog: EvolutionLog = { 
          id: generateId(), timestamp: Date.now(), type: 'derived_rule', context: text.substring(0, 100), learnedRule: result.text, isActive: true 
        };
        setStory(prev => {
            if (!prev) return null;
            const updated = { ...prev, evolutionLogs: [newLog, ...(prev.evolutionLogs || [])] };
            storageService.saveStory(updated);
            return updated;
        });
        alert(`Đã học được quy tắc mới: "${result.text}"`);
      }
    } catch (e) { } finally { setIsLearning(false); }
  };

  const learnFromInteraction = async (original: string, modified: string) => {
    if (!storyRef.current) return;
    setIsLearning(true);
    try {
      const result = await geminiService.deriveStylisticRule(original, modified);
      if (result && result.text) {
        recordUsage(result.usageMetadata);
        const newLog: EvolutionLog = { 
          id: generateId(), timestamp: Date.now(), type: 'derived_rule', context: "User manual edit", learnedRule: result.text, isActive: true 
        };
        setStory(prev => {
            if (!prev) return null;
            const updated = { ...prev, evolutionLogs: [newLog, ...(prev.evolutionLogs || [])] };
            storageService.saveStory(updated);
            return updated;
        });
      }
    } catch (e) { } finally { setIsLearning(false); }
  };

  const toggleEvolutionLog = async (id: string) => {
    setStory(prev => {
        if (!prev) return null;
        const updatedLogs = prev.evolutionLogs?.map(l => l.id === id ? { ...l, isActive: !l.isActive } : l);
        const updated = { ...prev, evolutionLogs: updatedLogs };
        storageService.saveStory(updated);
        return updated;
    });
  };

  const deleteEvolutionLog = async (id: string) => {
    setStory(prev => {
        if (!prev) return null;
        const updated = { ...prev, evolutionLogs: prev.evolutionLogs?.filter(l => l.id !== id) };
        storageService.saveStory(updated);
        return updated;
    });
  };

  const toggleKnowledgeLog = async (id: string) => {
    setStory(prev => {
        if (!prev) return null;
        const updatedLogs = prev.knowledgeLogs?.map(l => l.id === id ? { ...l, isActive: !l.isActive } : l);
        const updated = { ...prev, knowledgeLogs: updatedLogs };
        storageService.saveStory(updated);
        return updated;
    });
  };

  const deleteKnowledgeLog = async (id: string) => {
    setStory(prev => {
        if (!prev) return null;
        const updated = { ...prev, knowledgeLogs: prev.knowledgeLogs?.filter(l => l.id !== id) };
        storageService.saveStory(updated);
        return updated;
    });
  };

  const fetchWebInspiration = async (topic?: string) => {
    if (!storyRef.current) return;
    setIsSearchingWeb(true);
    try {
        const result = await geminiService.searchCreativeInspiration(storyRef.current, topic);
        if (result) {
            recordUsage(result.usageMetadata);
            setWebInspiration(result.data);
        }
    } catch (e) { } finally { setIsSearchingWeb(false); }
  };

  const clearWebInspiration = () => setWebInspiration(null);

  const expandSettingWithAI = async (input: string): Promise<string> => {
      try {
          const result = await geminiService.expandWorldBuilding(input);
          if (result) {
              recordUsage(result.usageMetadata);
              return result.text || input;
          }
          return input;
      } catch (e) { return input; }
  };

  const suggestWorldSettings = async (title: string, genre: string, synopsis: string, timeline: string): Promise<any> => {
      try {
          const result = await geminiService.suggestWorldSettings(title, genre, synopsis, timeline);
          if (result) {
              recordUsage(result.usageMetadata);
              return result.data;
          }
          return null;
      } catch (e) { return null; }
  };

  const suggestMainCharacter = async (title: string, genre: string, synopsis: string): Promise<any> => {
      try {
          const result = await geminiService.suggestMainCharacter(title, genre, synopsis);
          if (result) {
              recordUsage(result.usageMetadata);
              return result.data;
          }
          return null;
      } catch (e) { return null; }
  };

  const auditStory = async () => {
    if (!storyRef.current) return;
    setIsAuditing(true);
    try {
        const report = await geminiService.auditStoryConsistency(storyRef.current);
        if (report) {
            recordUsage(report.usageMetadata);
            setAuditReport(report.data);
        }
    } catch (e) { } finally { setIsAuditing(false); }
  };

  const auditActiveChapter = async () => {
    if (!storyRef.current || !activeChapterId) return;
    setIsAuditingChapter(true);
    const chapter = storyRef.current.chapters.find(c => c.id === activeChapterId)!;
    try {
        const report = await geminiService.auditChapterLogic(chapter.content, chapter.title, storyRef.current);
        if (report) {
            recordUsage(report.usageMetadata);
            setChapterAuditReport(report.data);
        }
    } catch (e) { } finally { setIsAuditingChapter(false); }
  };

  const analyzeActiveChapterQuality = async () => {
    if (!storyRef.current || !activeChapterId) return;
    setIsCheckingErrors(true);
    const chapter = storyRef.current.chapters.find(c => c.id === activeChapterId)!;
    try {
        const report = await geminiService.analyzeVocabulary(chapter.content, storyRef.current.interactionRules || "");
        if (report) {
            recordUsage(report.usageMetadata);
            setVocabularyInsights(report.data);
        }
    } catch (e) { } finally { setIsCheckingErrors(false); }
  };

  const suggestActiveChapterOutline = async () => {
    if (!storyRef.current || !activeChapterId) return;
    const currentStory = storyRef.current;
    const chapter = currentStory.chapters.find(c => c.id === activeChapterId)!;
    setIsGeneratingOutline(true);
    try {
        const shortTermMemory = chapter.content.slice(-2000);
        const longTermMemory = currentStory.chapters.filter(c => c.id !== activeChapterId && c.order < chapter.order).slice(-3).map(c => c.summary).join('\n');
        
        const result = await geminiService.suggestOutline(chapter, currentStory, userInstruction, longTermMemory, shortTermMemory);
        if (result && result.text) {
            recordUsage(result.usageMetadata);
            updateChapterOutline(activeChapterId, result.text);
        }
    } catch (e) { } finally { setIsGeneratingOutline(false); }
  };

  const generateChapterVideo = async () => {
    if (!storyRef.current || !activeChapterId) return;
    const chapter = storyRef.current.chapters.find(c => c.id === activeChapterId)!;
    if (!chapter.summary) { alert("Cần tóm tắt chương trước khi tạo video."); return; }
    
    setIsGeneratingVideo(true);
    setVideoGenerationStatus("Đang khởi tạo Veo Engine...");
    try {
        const url = await geminiService.generateVideo(chapter.summary, storyRef.current.genre, process.env.API_KEY || "");
        if (url) {
            setGeneratedVideoUrl(url);
            setStory(prev => {
                if (!prev) return null;
                const updated = { ...prev, chapters: prev.chapters.map(c => c.id === activeChapterId ? { ...c, videoUrl: url } : c) };
                storageService.saveStory(updated);
                return updated;
            });
        }
    } catch (e) { 
        setVideoGenerationStatus("Lỗi tạo video. Thử lại sau.");
    } finally { setIsGeneratingVideo(false); }
  };

  const clearGeneratedVideo = () => setGeneratedVideoUrl(null);
  const clearConsistencyReport = () => setConsistencyReport(null);
  const clearAuditReport = () => setAuditReport(null);
  const clearChapterAuditReport = () => setChapterAuditReport(null);
  const clearVocabularyInsights = () => setVocabularyInsights(null);

  const analyzeStoryPlotArc = useCallback(async () => {
      if (!storyRef.current) return;
      setIsAnalyzingPlotArc(true);
      try {
          const result = await geminiService.analyzePlotArc(storyRef.current.chapters, storyRef.current.title);
          if (result) {
              recordUsage(result.usageMetadata);
              setPlotArcAnalysis(result.data);
          }
      } catch (e) { }
      finally { setIsAnalyzingPlotArc(false); }
  }, [recordUsage]);

  const exportStory = (id?: string) => {
      const targetId = id || storyRef.current?.id;
      if (!targetId) return;
      
      storageService.getStory(targetId).then(s => {
          if (!s) return;
          const backup: BackupData = { version: 1, story: s, vectors: [], exportedAt: Date.now() };
          const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Aetheria_Backup_${s.title.replace(/\s+/g, '_')}_${Date.now()}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
      });
  };

  const exportAllStories = async () => {
      const allStories = await storageService.getAllStories();
      if (allStories.length === 0) {
          alert("Không có truyện nào để sao lưu.");
          return;
      }
      const backup = {
          version: 1,
          stories: allStories,
          exportedAt: Date.now()
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Aetheria_Full_Backup_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  const importStory = async (file: File) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const json = JSON.parse(e.target?.result as string);
              
              // Handle full backup (multiple stories)
              if (json.stories && Array.isArray(json.stories)) {
                  for (const s of json.stories) {
                      const newId = generateId();
                      s.id = newId;
                      s.chapters = s.chapters.map((c: any) => ({ ...c, id: generateId() }));
                      s.characters = s.characters.map((c: any) => ({ ...c, id: generateId() }));
                      await storageService.saveStory(s);
                  }
                  await loadStories();
                  alert(`Đã nhập thành công ${json.stories.length} truyện!`);
                  return;
              }

              // Handle single story backup
              const s = json.story || json; 
              if (s && s.title) {
                  const newId = generateId();
                  s.id = newId;
                  s.chapters = s.chapters.map((c: any) => ({ ...c, id: generateId() }));
                  s.characters = s.characters.map((c: any) => ({ ...c, id: generateId() }));
                  await storageService.saveStory(s);
                  await loadStories();
                  alert("Nhập truyện thành công!");
              } else { throw new Error("Invalid format"); }
          } catch (err) { alert("Lỗi file không hợp lệ."); }
      };
      reader.readAsText(file);
  };

  const importStoryFromTxt = async (file: File) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const text = e.target?.result as string;
              if (!text) return;

              const lines = text.split('\n');
              const title = lines[0].trim() || file.name.replace('.txt', '');
              
              const chapterRegex = /^(Chương|Chapter)\s+\d+/i;
              const rawChapters: { title: string, content: string }[] = [];
              let currentTitle = 'Chương 1';
              let currentContent: string[] = [];

              for (let i = 0; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (chapterRegex.test(line)) {
                      if (currentContent.length > 0 || rawChapters.length > 0) {
                          rawChapters.push({
                              title: currentTitle,
                              content: currentContent.join('\n').trim()
                          });
                      }
                      currentTitle = line;
                      currentContent = [];
                  } else {
                      currentContent.push(lines[i]);
                  }
              }

              if (currentContent.length > 0 || rawChapters.length === 0) {
                  rawChapters.push({
                      title: currentTitle,
                      content: currentContent.join('\n').trim()
                  });
              }

              // Smart splitting for large chapters
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
                  title: title,
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

              await storageService.saveStory(newStory);
              await loadStories();
              alert(`Tải lên truyện thành công với ${finalChapters.length} chương!`);
          } catch (err) {
              console.error(err);
              alert("Lỗi khi xử lý file TXT.");
          }
      };
      reader.readAsText(file);
  };

  const importChaptersFromTxt = async (file: File) => {
      if (!storyRef.current) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const text = e.target?.result as string;
              if (!text) return;

              const lines = text.split('\n');
              const chapterRegex = /^(Chương|Chapter)\s+\d+/i;
              const rawChapters: { title: string, content: string }[] = [];
              let currentTitle = `Chương ${storyRef.current!.chapters.length + 1}`;
              let currentContent: string[] = [];

              for (let i = 0; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (chapterRegex.test(line)) {
                      if (currentContent.length > 0 || rawChapters.length > 0) {
                          rawChapters.push({
                              title: currentTitle,
                              content: currentContent.join('\n').trim()
                          });
                      }
                      currentTitle = line;
                      currentContent = [];
                  } else {
                      currentContent.push(lines[i]);
                  }
              }

              if (currentContent.length > 0 || rawChapters.length === 0) {
                  rawChapters.push({
                      title: currentTitle,
                      content: currentContent.join('\n').trim()
                  });
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
                      ...storyRef.current,
                      chapters: [...storyRef.current!.chapters, ...newChapters]
                  };
                  setStory(updatedStory);
                  await storageService.saveStory(updatedStory);
                  alert(`Đã thêm ${newChapters.length} chương mới từ file TXT!`);
              }
          } catch (err) {
              console.error(err);
              alert("Lỗi khi nhập chương từ file TXT.");
          }
      };
      reader.readAsText(file);
  };

  const ingestRawDocument = async (file: File, categories: ExtractionCategory[]) => {
      if (!storyRef.current) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
          const text = e.target?.result as string;
          if (text) { await learnFromText(text, categories); }
      };
      reader.readAsText(file);
  };

  const addCharacterManual = async (char: Partial<Character>) => {
      setStory(prev => {
          if (!prev) return null;
          const newChar: Character = {
              id: generateId(), name: char.name || "Nhân vật mới", role: char.role || "Phụ", description: char.description || "", status: char.status || 'alive', traits: char.traits || [], appearance: char.appearance || "", ...char
          };
          const updated = { ...prev, characters: [...prev.characters, newChar] };
          storageService.saveStory(updated);
          return updated;
      });
  };

  const updateCharacter = async (id: string, updates: Partial<Character>) => {
      setStory(prev => {
          if (!prev) return null;
          const updated = { ...prev, characters: prev.characters.map(c => c.id === id ? { ...c, ...updates } : c) };
          storageService.saveStory(updated);
          return updated;
      });
  };

  const deleteCharacter = async (id: string) => {
      setStory(prev => {
          if (!prev) return null;
          const updated = { ...prev, characters: prev.characters.filter(c => c.id !== id) };
          storageService.saveStory(updated);
          return updated;
      });
  };

  const autoUpdateCharacter = async (charId: string) => {
      const currentStory = storyRef.current;
      if (!currentStory) return null;
      const character = currentStory.characters.find(c => c.id === charId);
      if (!character) return null;
      const recentChapters = [...currentStory.chapters].sort((a, b) => b.order - a.order).slice(0, 3);
      const shortTermMemory = recentChapters.map(c => `[${c.title}]: ${c.summary}`).join('\n');
      const longTermMemory = `[QUÁ KHỨ]: ${character.description}. [TÌNH TRẠNG CŨ]: ${character.healthStatus}`;

      try {
          const result = await geminiService.autoUpdateCharacterStatus(character, longTermMemory, shortTermMemory);
          if (result && result.data) {
              recordUsage(result.usageMetadata);
              await updateCharacter(charId, result.data);
              return { ...character, ...result.data };
          }
      } catch (e) { console.error(e); }
      return null;
  };

  return (
    <StoryContext.Provider value={{
      story, storiesList, isStoriesLoaded, activeChapterId, isGenerating, isSummarizing,
      isSequentiallySummarizing, sequentialSummaryProgress,
      generationProgress, generationStatus,
      isPlanning, isPlotPlanning, isLearning, isSearchingWeb, isAuditing, isAuditingChapter, isCheckingErrors, isGeneratingOutline, isGeneratingVideo,
      isSavingManual, setIsSavingManual, saveTrigger, triggerSave, learnTrigger, triggerLearn,
      videoGenerationStatus, generatedVideoUrl, consistencyReport, auditReport, chapterAuditReport, vocabularyInsights, webInspiration, plotArcAnalysis, isAnalyzingPlotArc,
      userInstruction, setUserInstruction, targetWordCount, setTargetWordCount,
      pendingEdit, setPendingEdit, chapterSuggestion, setChapterSuggestion, isSuggestingChapter,
      lastTokenUsage, sessionTotalTokens, remainingTokensEstimate,
      canUndo, canRedo, undo, redo,
      loadStories, createStory, openStory, closeStory, updateStorySettings, deleteStory, addPersistentDirective,
      sendPlanningMessage, clearPlanningChat, sendPlotChatMessage, clearPlotChat, selectChapter, addChapter, deleteChapter, updateChapterContent, updateChapterOutline, updateChapterTitle, updateChapterGoal, updateChapterTimeSetting, updateChapterSummary, reorderChapter,
      generateContinue, suggestNewChapter, balanceChapterLength, refineChapter, translateChapter, generateChapterContentFromPlot, refineSelection, learnFromChapter, learnFromText, learnStyleFromText, learnWritingDNA, learnFromInteraction,
      toggleEvolutionLog, deleteEvolutionLog, toggleKnowledgeLog, deleteKnowledgeLog, fetchWebInspiration, clearWebInspiration, auditStory, auditActiveChapter, analyzeActiveChapterQuality, summarizeChapter, summarizeAllChaptersSequentially, suggestActiveChapterOutline, generateChapterVideo, analyzeStoryPlotArc,
      clearGeneratedVideo, clearConsistencyReport, clearAuditReport, clearChapterAuditReport, clearVocabularyInsights, expandSettingWithAI, suggestWorldSettings, suggestMainCharacter,
      exportStory, exportAllStories, importStory, importStoryFromTxt, importChaptersFromTxt, ingestRawDocument, addCharacterManual, updateCharacter, deleteCharacter, autoUpdateCharacter,
      applyPendingEdit, discardPendingEdit,
      isAutoTranslateEnabled, setIsAutoTranslateEnabled
    }}>
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
