
import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { SummaryViewModal } from './SummaryViewModal.tsx';
import { DiffReview } from './DiffReview.tsx';
import { SplitChapterModal } from './SplitChapterModal.tsx';
import { MergeChapterModal } from './MergeChapterModal.tsx';
import { InsertChapterModal } from './InsertChapterModal.tsx';
import { BilingualReviewModal } from './BilingualReviewModal.tsx';
import { TranslationSettingsModal } from './TranslationSettingsModal.tsx';
import { fastWordCount } from '../utils/wordCount.ts';
import { tokenTracker } from '../services/tokenTracker.ts';
import { geminiService } from '../services/geminiService.ts';

type EditorTab = 'refine' | 'sensory' | 'transform' | 'critique';

interface EditorProps {
  onOpenSidebar?: () => void;
  onOpenPlotArc?: () => void;
  onOpenBilingualReview?: (chapterId?: string) => void;
}

export const Editor: React.FC<EditorProps> = ({ onOpenSidebar, onOpenPlotArc, onOpenBilingualReview }) => {
  const { 
    story, 
    activeChapterId, 
    updateChapterContent, 
    updateChapterTitle,
    isGenerating,
    isSummarizing,
    generationProgress,
    generationStatus,
    isAuditingChapter,
    isCheckingErrors,
    generateContinue,
    refineChapter,
    refineSelection,
    learnStyleFromText,
    learnFromInteraction,
    undo,
    redo,
    canUndo,
    canRedo,
    pendingEdit,
    applyPendingEdit,
    discardPendingEdit,
    auditActiveChapter,
    chapterAuditReport,
    summarizeChapter,
    translateChapter,
    closeStory,
    lastTokenUsage,
    saveTrigger,
    learnTrigger,
    setIsSavingManual,
    sessionTotalTokens,
    remainingTokensEstimate,
    selectChapter,
    splitChapter,
    mergeChapters,
    insertChapter,
    isAutoTranslateEnabled,
    setIsAutoTranslateEnabled,
    translationOptions,
    setTranslationOptions,
    editorVersion,
    setEditorVersion,
    updateChapterTranslation,
    promoteTranslationToMain,
    revertChapterToOriginal,
    editorSyncToken
  } = useStory();

  const [showTranslateSettings, setShowTranslateSettings] = useState(false);
  const [isBilingualModalOpen, setIsBilingualModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(true);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
  const [insertPosition, setInsertPosition] = useState<'before' | 'after'>('after');
  const [bottomPullDistance, setBottomPullDistance] = useState(0);
  const [topPullDistance, setTopPullDistance] = useState(0);
  const [swipeFeedbackText, setSwipeFeedbackText] = useState<string | null>(null);

  const touchStartRef = useRef<{ y: number; x: number; time: number; atBottom: boolean; atTop: boolean } | null>(null);
  const wheelAccumulatorRef = useRef<{ bottom: number; top: number; timer: ReturnType<typeof setTimeout> | null }>({
    bottom: 0,
    top: 0,
    timer: null,
  });
  const hasVibratedRef = useRef(false);
  const [refineCommand, setRefineCommand] = useState('');
  const [isRefinePanelOpen, setIsRefinePanelOpen] = useState(false);
  const [activeAITab, setActiveAITab] = useState<EditorTab>('refine');
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  
  const [localContent, setLocalContent] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  
  const [proStatus, setProStatus] = useState(() => tokenTracker.getModelStatus(geminiService.getPro()));
  const [flashStatus, setFlashStatus] = useState(() => tokenTracker.getModelStatus(geminiService.getFlash()));
  const [showTokenDetails, setShowTokenDetails] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  interface ReaderSettings {
    fontSize: 'sm' | 'base' | 'lg' | 'xl';
    fontFamily: 'serif' | 'sans';
    theme: 'oled' | 'charcoal' | 'sepia';
    lineHeight: 'normal' | 'relaxed' | 'loose';
  }

  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = localStorage.getItem('aetheria_reader_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      fontSize: 'base',
      fontFamily: 'serif',
      theme: 'oled',
      lineHeight: 'relaxed'
    };
  });

  const [isZenMode, setIsZenMode] = useState(false);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const readerSettingsRef = useRef<HTMLDivElement>(null);

  const updateReaderSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setReaderSettings(prev => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem('aetheria_reader_settings', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setIsToolsMenuOpen(false);
      }
      if (readerSettingsRef.current && !readerSettingsRef.current.contains(e.target as Node)) {
        setShowReaderSettings(false);
      }
    };
    if (isToolsMenuOpen || showReaderSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isToolsMenuOpen, showReaderSettings]);

  useEffect(() => {
    const update = () => {
      setProStatus(tokenTracker.getModelStatus(geminiService.getPro()));
      setFlashStatus(tokenTracker.getModelStatus(geminiService.getFlash()));
    };
    update();
    const unsubscribe = tokenTracker.subscribe(update);
    const interval = setInterval(update, 1000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const localContentRef = useRef(localContent);
  const localTitleRef = useRef(localTitle);
  const lastSentContentRef = useRef('');
  const lastSentTitleRef = useRef('');
  const initialContentRef = useRef<string>('');
  const loadedChapterIdRef = useRef<string | null>(null);
  const loadedVersionRef = useRef<'original' | 'translation'>(editorVersion);
  const prevSyncTokenRef = useRef<number>(editorSyncToken);
  const prevIsGeneratingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeChapter = story?.chapters.find(c => c.id === activeChapterId);

  // Auto-recover activeChapterId if it becomes invalid or desynced
  useEffect(() => {
    if (story && story.chapters.length > 0 && !story.chapters.some(c => c.id === activeChapterId)) {
      selectChapter(story.chapters[0].id);
    }
  }, [story, activeChapterId, selectChapter]);

  const sortedChapters = useMemo(() => {
    return story?.chapters ? [...story.chapters].sort((a, b) => a.order - b.order) : [];
  }, [story?.chapters]);

  const currentIndex = sortedChapters.findIndex(c => c.id === activeChapterId);
  const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  useEffect(() => {
    localTitleRef.current = localTitle;
  }, [localTitle]);

  // Sync title and content ONLY on chapter change, version change, AI generation completion, or explicit external syncToken
  useEffect(() => {
    if (!activeChapter) return;

    const isTranslation = editorVersion === 'translation';
    const targetContent = isTranslation ? (activeChapter.translatedContent || '') : (activeChapter.content || '');
    const targetTitle = isTranslation ? (activeChapter.translatedTitle || activeChapter.title || '') : (activeChapter.title || '');

    const isChapterSwitch = loadedChapterIdRef.current !== activeChapterId;
    const isVersionSwitch = loadedVersionRef.current !== editorVersion;
    const isGenerationFinish = prevIsGeneratingRef.current && !isGenerating;
    const isExternalSync = prevSyncTokenRef.current !== editorSyncToken;
    const isContentDesynced = !localContentRef.current && !!targetContent && loadedChapterIdRef.current === activeChapterId;

    if (isChapterSwitch || isVersionSwitch || isGenerationFinish || isExternalSync || isContentDesynced) {
      // If switching chapter OR switching version, flush pending save for previous state first
      if ((isChapterSwitch || isVersionSwitch) && loadedChapterIdRef.current && saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        if (loadedVersionRef.current === 'translation') {
          updateChapterTranslation(loadedChapterIdRef.current, localContentRef.current, localTitleRef.current);
        } else {
          updateChapterContent(loadedChapterIdRef.current, localContentRef.current);
          if (localTitleRef.current !== undefined) {
            updateChapterTitle(loadedChapterIdRef.current, localTitleRef.current);
          }
        }
      }

      // Check if user is actively editing in the textarea
      const textarea = textareaRef.current;
      const isFocused = document.activeElement === textarea;
      const isSameChapterAndVersion = loadedChapterIdRef.current === activeChapterId && loadedVersionRef.current === editorVersion;

      // If user is focused on textarea and hasn't changed chapters/versions, protect their active input
      if (!isChapterSwitch && !isVersionSwitch && isFocused && isSameChapterAndVersion) {
        // If content in textarea already matches, or if user is mid-typing (has dirty un-flushed content)
        if (localContentRef.current === targetContent || saveTimeoutRef.current !== null) {
          prevSyncTokenRef.current = editorSyncToken;
          return;
        }
      }

      // Capture cursor position if textarea is focused
      const prevCursorStart = (isFocused && textarea) ? textarea.selectionStart : null;
      const prevCursorEnd = (isFocused && textarea) ? textarea.selectionEnd : null;

      if (localContentRef.current !== targetContent || isChapterSwitch || isVersionSwitch) {
        setLocalContent(targetContent);
        localContentRef.current = targetContent;
        initialContentRef.current = targetContent;
        lastSentContentRef.current = targetContent;

        // Restore cursor position on next frame to prevent cursor jumping to the end/bottom
        if (isFocused && textarea && prevCursorStart !== null && prevCursorEnd !== null) {
          requestAnimationFrame(() => {
            if (textareaRef.current && document.activeElement === textareaRef.current) {
              try {
                const safeStart = Math.min(prevCursorStart, targetContent.length);
                const safeEnd = Math.min(prevCursorEnd, targetContent.length);
                textareaRef.current.setSelectionRange(safeStart, safeEnd);
              } catch {
                // ignore
              }
            }
          });
        }
      }

      setLocalTitle(targetTitle);
      localTitleRef.current = targetTitle;
      lastSentTitleRef.current = targetTitle;

      loadedChapterIdRef.current = activeChapterId;
      loadedVersionRef.current = editorVersion;
      prevSyncTokenRef.current = editorSyncToken;
    }

    // Keep localContent synchronized with live streaming translatedContent during generation
    if (isGenerating && editorVersion === 'translation' && activeChapter) {
      const streamingContent = activeChapter.translatedContent || '';
      if (streamingContent && streamingContent !== localContentRef.current) {
        setLocalContent(streamingContent);
        localContentRef.current = streamingContent;
        initialContentRef.current = streamingContent;
        lastSentContentRef.current = streamingContent;
      }
    }

    prevIsGeneratingRef.current = isGenerating;
  }, [activeChapterId, editorVersion, isGenerating, editorSyncToken, activeChapter, updateChapterContent, updateChapterTitle, updateChapterTranslation]);

  const adjustTextareaHeight = useCallback((forceRecalculate = false) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const container = scrollContainerRef.current;
    const prevScrollTop = container ? container.scrollTop : 0;
    const isFocused = document.activeElement === textarea;
    const prevStart = isFocused ? textarea.selectionStart : null;
    const prevEnd = isFocused ? textarea.selectionEnd : null;

    if (forceRecalculate) {
      // Force reset height to auto to get the true scrollHeight for new chapter content
      textarea.style.height = 'auto';
      const accurateHeight = Math.max(450, textarea.scrollHeight);
      textarea.style.height = `${accurateHeight}px`;
    } else {
      const currentHeight = textarea.offsetHeight;
      if (textarea.scrollHeight > currentHeight) {
        textarea.style.height = `${Math.max(450, textarea.scrollHeight)}px`;
      } else {
        textarea.style.height = 'auto';
        const newHeight = Math.max(450, textarea.scrollHeight);
        textarea.style.height = `${newHeight}px`;
      }
    }

    if (container && container.scrollTop !== prevScrollTop) {
      container.scrollTop = prevScrollTop;
    }

    if (isFocused && prevStart !== null && prevEnd !== null && textarea) {
      try {
        textarea.setSelectionRange(prevStart, prevEnd);
      } catch {
        // ignore
      }
    }
  }, []);

  // Synchronously measure whenever content, chapter, or edit mode changes
  useLayoutEffect(() => {
    if (isEditMode) {
      adjustTextareaHeight(true);
    }
  }, [isEditMode, activeChapterId, editorVersion, localContent, adjustTextareaHeight]);

  // Double check after microtask and DOM painting to guarantee full chapter expansion
  useEffect(() => {
    if (isEditMode) {
      const raf = requestAnimationFrame(() => {
        adjustTextareaHeight(true);
      });
      const timer = setTimeout(() => {
        adjustTextareaHeight(true);
      }, 60);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [isEditMode, activeChapterId, editorVersion, localContent, adjustTextareaHeight]);

  // Scroll to top when switching chapters
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeChapterId]);

  const wordCount = useMemo(() => {
    return fastWordCount(localContent);
  }, [localContent]);

  const performSave = useCallback((content: string, title?: string) => {
    if (activeChapterId) {
        lastSentContentRef.current = content;
        if (title !== undefined) lastSentTitleRef.current = title;
        if (editorVersion === 'translation') {
          updateChapterTranslation(activeChapterId, content, title);
        } else {
          updateChapterContent(activeChapterId, content);
          if (title !== undefined) updateChapterTitle(activeChapterId, title);
        }
    }
  }, [activeChapterId, editorVersion, updateChapterContent, updateChapterTitle, updateChapterTranslation]);

  // Flush any pending save immediately
  const flushSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    performSave(localContentRef.current, localTitleRef.current);
  }, [performSave]);

  const PULL_THRESHOLD = 70; // px threshold to trigger chapter switch on swipe

  const goToNextChapter = useCallback(() => {
    if (nextChapter && !isGenerating) {
      flushSave();
      selectChapter(nextChapter.id);
      setSwipeFeedbackText(`Đã mở: ${nextChapter.title || 'Chương kế tiếp'}`);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [nextChapter, isGenerating, flushSave, selectChapter]);

  const goToPrevChapter = useCallback(() => {
    if (prevChapter && !isGenerating) {
      flushSave();
      selectChapter(prevChapter.id);
      setSwipeFeedbackText(`Đã mở: ${prevChapter.title || 'Chương trước'}`);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [prevChapter, isGenerating, flushSave, selectChapter]);

  useEffect(() => {
    if (swipeFeedbackText) {
      const timer = setTimeout(() => {
        setSwipeFeedbackText(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [swipeFeedbackText]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isGenerating) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const touch = e.touches[0];
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 25;
    const atTop = container.scrollTop <= 10;

    touchStartRef.current = {
      y: touch.clientY,
      x: touch.clientX,
      time: Date.now(),
      atBottom,
      atTop,
    };
    hasVibratedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || isGenerating) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const touch = e.touches[0];
    const diffY = touch.clientY - touchStartRef.current.y;
    const diffX = touch.clientX - touchStartRef.current.x;

    // Ignore horizontal swipes
    if (Math.abs(diffX) > Math.abs(diffY)) {
      return;
    }

    const currentAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 25;
    const currentAtTop = container.scrollTop <= 10;

    // Swiping UP at the bottom -> Next chapter
    if (diffY < 0 && (touchStartRef.current.atBottom || currentAtBottom) && nextChapter) {
      const pull = Math.min(120, Math.max(0, -diffY * 0.7));
      setBottomPullDistance(pull);
      setTopPullDistance(0);

      if (pull >= PULL_THRESHOLD && !hasVibratedRef.current) {
        hasVibratedRef.current = true;
        try {
          if ('vibrate' in navigator) navigator.vibrate(15);
        } catch {}
      }
    } 
    // Swiping DOWN at the top -> Prev chapter
    else if (diffY > 0 && (touchStartRef.current.atTop || currentAtTop) && prevChapter) {
      const pull = Math.min(120, Math.max(0, diffY * 0.7));
      setTopPullDistance(pull);
      setBottomPullDistance(0);

      if (pull >= PULL_THRESHOLD && !hasVibratedRef.current) {
        hasVibratedRef.current = true;
        try {
          if ('vibrate' in navigator) navigator.vibrate(15);
        } catch {}
      }
    } else {
      if (bottomPullDistance > 0) setBottomPullDistance(0);
      if (topPullDistance > 0) setTopPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;

    if (bottomPullDistance >= PULL_THRESHOLD && nextChapter && !isGenerating) {
      goToNextChapter();
    } else if (topPullDistance >= PULL_THRESHOLD && prevChapter && !isGenerating) {
      goToPrevChapter();
    }

    touchStartRef.current = null;
    setBottomPullDistance(0);
    setTopPullDistance(0);
    hasVibratedRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isGenerating) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 10;
    const atTop = container.scrollTop <= 5;

    if (e.deltaY > 0 && atBottom && nextChapter) {
      const current = wheelAccumulatorRef.current.bottom + e.deltaY;
      wheelAccumulatorRef.current.bottom = current;
      setBottomPullDistance(Math.min(100, current * 0.4));

      if (current >= 140) {
        wheelAccumulatorRef.current.bottom = 0;
        setBottomPullDistance(0);
        goToNextChapter();
        return;
      }

      if (wheelAccumulatorRef.current.timer) clearTimeout(wheelAccumulatorRef.current.timer);
      wheelAccumulatorRef.current.timer = setTimeout(() => {
        wheelAccumulatorRef.current.bottom = 0;
        setBottomPullDistance(0);
      }, 350);
    } else if (e.deltaY < 0 && atTop && prevChapter) {
      const current = wheelAccumulatorRef.current.top + Math.abs(e.deltaY);
      wheelAccumulatorRef.current.top = current;
      setTopPullDistance(Math.min(100, current * 0.4));

      if (current >= 140) {
        wheelAccumulatorRef.current.top = 0;
        setTopPullDistance(0);
        goToPrevChapter();
        return;
      }

      if (wheelAccumulatorRef.current.timer) clearTimeout(wheelAccumulatorRef.current.timer);
      wheelAccumulatorRef.current.timer = setTimeout(() => {
        wheelAccumulatorRef.current.top = 0;
        setTopPullDistance(0);
      }, 350);
    }
  };

  const handleModeChange = useCallback((newEditMode: boolean) => {
    if (isEditMode && !newEditMode) {
      // Flush save immediately when switching from Edit to View
      flushSave();
    }
    setIsEditMode(newEditMode);
    if (newEditMode) {
      // Focus textarea and adjust height smoothly upon entering Edit mode
      setTimeout(() => {
        if (textareaRef.current) {
          adjustTextareaHeight();
          textareaRef.current.focus();
        }
      }, 50);
    }
  }, [isEditMode, flushSave, adjustTextareaHeight]);

  const handleVersionChange = useCallback((newVersion: 'original' | 'translation') => {
    if (newVersion === editorVersion) return;
    // Flush save before changing version
    flushSave();
    setEditorVersion(newVersion);
  }, [editorVersion, flushSave]);

  const handleManualSave = () => {
    setIsSavingManual(true);
    flushSave();
    setTimeout(() => setIsSavingManual(false), 1000);
  };

  useEffect(() => {
    if (saveTrigger > 0) {
      handleManualSave();
    }
  }, [saveTrigger]);

  useEffect(() => {
    if (learnTrigger > 0) {
      handleManualLearn();
    }
  }, [learnTrigger]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        performSave(localContentRef.current, localTitleRef.current);
      }
    };
  }, [activeChapterId, performSave]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalContent(newVal);
    localContentRef.current = newVal;

    const textarea = e.target;
    if (textarea.scrollHeight > textarea.clientHeight) {
      textarea.style.height = `${Math.max(450, textarea.scrollHeight)}px`;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
        performSave(newVal, localTitleRef.current);
    }, 1200);
  };

  const handleManualLearn = () => {
    if (localContent !== initialContentRef.current) {
        learnFromInteraction(initialContentRef.current, localContent);
        initialContentRef.current = localContent;
        alert("Aetheria đã học được văn phong từ bản sửa đổi tay của bạn!");
    } else {
        alert("Chưa có thay đổi nào để học tập.");
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setLocalTitle(newTitle);
    localTitleRef.current = newTitle;
    if (activeChapterId) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        performSave(localContentRef.current, newTitle);
      }, 800);
    }
  };

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        flushSave();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isGenerating) generateContinue('append');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsRefinePanelOpen(p => !p);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !isGenerating) {
        if (e.shiftKey) { e.preventDefault(); redo(); }
        else { e.preventDefault(); undo(); }
      }
      if (e.key === 'Escape') {
        setIsZenMode(false);
        setShowReaderSettings(false);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [localContent, isGenerating, performSave, generateContinue, undo, redo, isZenMode, showReaderSettings]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = e.currentTarget.selectionStart;
        const end = e.currentTarget.selectionEnd;
        const val = e.currentTarget.value;
        const newVal = val.substring(0, start) + "\t" + val.substring(end);
        setLocalContent(newVal);
        setTimeout(() => { if (textareaRef.current) textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1; }, 0);
    }
  };

  const [selectionRange, setSelectionRange] = useState<{start: number, end: number} | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');

  const handleSelection = () => {
    if (textareaRef.current) {
      const { selectionStart, selectionEnd } = textareaRef.current;
      if (selectionStart !== selectionEnd) {
        setSelectionRange({ start: selectionStart, end: selectionEnd });
        setSelectedText(textareaRef.current.value.substring(selectionStart, selectionEnd));
      } else {
        setSelectionRange(null);
        setSelectedText('');
      }
    }
  };

  const handleReaderSelection = () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (text) {
      setSelectedText(text);
      const startIdx = localContent.indexOf(text);
      if (startIdx !== -1) {
        setSelectionRange({ start: startIdx, end: startIdx + text.length });
      } else {
        setSelectionRange(null);
      }
    }
  };

  const togglePreset = (preset: string) => {
    setSelectedPresets(prev => {
        const next = new Set(prev);
        if (next.has(preset)) next.delete(preset);
        else next.add(preset);
        return next;
    });
  };

  const applyRefinement = async () => {
    if (isGenerating || (selectedPresets.size === 0 && !refineCommand.trim())) return;
    const combinedInstructions = Array.from(selectedPresets).join(", ") + (refineCommand.trim() ? (selectedPresets.size > 0 ? ", " : "") + refineCommand : "");
    if (selectionRange && selectedText) {
        await refineSelection(selectedText, selectionRange.start, selectionRange.end, combinedInstructions);
        setSelectionRange(null);
        setSelectedText('');
    } else {
        await refineChapter(combinedInstructions);
    }
    setRefineCommand('');
    setSelectedPresets(new Set());
  };

  const handleLearnStyle = async () => {
    if (selectedText.trim()) await learnStyleFromText(selectedText);
    else alert("Hãy bôi đen một đoạn văn bạn tâm đắc để AI học hỏi văn phong.");
  };

  const handleSummarize = () => { if (activeChapterId) summarizeChapter(activeChapterId); };

  if (!activeChapter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 p-6 text-center">
        <div className="text-4xl mb-3">📖</div>
        <div className="text-base font-semibold text-gray-300 mb-1">Đang mở bản thảo...</div>
        <div className="text-xs text-gray-500 mb-4">Nhấn vào bên dưới để tải chương truyện.</div>
        <button
          type="button"
          onClick={() => {
            if (story && story.chapters.length > 0) {
              selectChapter(story.chapters[0].id);
            } else if (onOpenSidebar) {
              onOpenSidebar();
            }
          }}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg"
        >
          {story && story.chapters.length > 0 ? `Mở ${story.chapters[0].title || 'Chương 1'}` : 'Mở Menu chương'}
        </button>
      </div>
    );
  }

  const progressPercent = Math.min(100, (wordCount / (activeChapter.wordGoal || 2000)) * 100);

  const renderedParagraphs = useMemo(() => {
    if (!localContent) return null;
    return localContent.split('\n').map((paragraph, index) => {
      const trimmed = paragraph.trim();
      if (!trimmed) {
        return <div key={index} className="h-4" />;
      }
      return (
        <p key={index} className="indent-6 md:indent-8">
          {paragraph}
        </p>
      );
    });
  }, [localContent]);

  const readerFontClass = readerSettings.fontFamily === 'serif' ? 'font-serif' : 'font-sans';
  const readerSizeClass = 
    readerSettings.fontSize === 'sm' ? 'text-sm sm:text-base' :
    readerSettings.fontSize === 'lg' ? 'text-lg sm:text-xl' :
    readerSettings.fontSize === 'xl' ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg';
  const readerLineHeightClass =
    readerSettings.lineHeight === 'loose' ? 'leading-[2.2]' :
    readerSettings.lineHeight === 'normal' ? 'leading-[1.7]' : 'leading-[1.9]';
  const readerThemeClass =
    readerSettings.theme === 'charcoal' ? 'bg-[#121214] text-gray-200' :
    readerSettings.theme === 'sepia' ? 'bg-[#181512] text-[#e2d9ce]' : 'bg-[#050505] text-gray-200';

  return (
    <div className={`flex-1 flex flex-col overflow-hidden bg-gray-950 transition-all duration-700 ${(isGenerating || isAuditingChapter || isCheckingErrors) ? 'ring-inset ring-1 ring-purple-500/20 shadow-[inset_0_0_50px_rgba(168,85,247,0.05)]' : ''}`}>
      {pendingEdit && (
        <DiffReview 
          original={pendingEdit.original} 
          modified={pendingEdit.modified} 
          onAccept={() => applyPendingEdit('overwrite')} 
          onAcceptNewChapter={() => applyPendingEdit('new_chapter')}
          onDiscard={discardPendingEdit} 
          isTranslation={pendingEdit.isTranslation}
        />
      )}

      {isZenMode && (
        <div className="fixed top-3 right-4 z-50 animate-fadeIn flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReaderSettings(s => !s)}
            className="p-2 rounded-full bg-gray-900/90 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700/80 backdrop-blur-md text-xs font-serif font-black shadow-2xl transition-all"
            title="Tùy chỉnh hiển thị"
          >
            Aa
          </button>
          <button
            type="button"
            onClick={() => setIsZenMode(false)}
            className="px-3 py-1.5 rounded-full bg-gray-900/90 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700/80 backdrop-blur-md text-xs font-semibold flex items-center gap-1.5 shadow-2xl transition-all"
            title="Thoát chế độ tập trung (ESC)"
          >
            <span>✕</span>
            <span>Thoát Focus (ESC)</span>
          </button>
        </div>
      )}

      {!isZenMode && (
        <div className="z-40 flex items-center justify-between px-2 sm:px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0 gap-1 sm:gap-2">
        {/* Cụm công cụ chính: Tối ưu kích thước vừa vặn hoàn hảo trên iPhone 13 Pro Max (428px), cuộn mượt mà nếu màn hình nhỏ hơn */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none min-w-0 pr-1 touch-pan-x">
          {/* Mobile Sidebar toggle */}
          {onOpenSidebar && (
            <button 
              onClick={onOpenSidebar}
              className="md:hidden p-1.5 rounded-lg bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700 transition-all border border-gray-700 flex items-center justify-center shrink-0 w-8 h-8"
              title="Mở Menu chương"
              aria-label="Mở Sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          {/* Về thư viện */}
          <button 
            onClick={closeStory} 
            title="Về thư viện (Lưu trữ)" 
            className="p-1.5 rounded-lg bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700 transition-all border border-gray-700 flex items-center justify-center shrink-0 w-8 h-8 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          
          {/* Hoàn tác / Làm lại */}
          <div className="flex bg-gray-950 rounded-lg p-0.5 border border-gray-800 shrink-0">
              <button onClick={undo} disabled={!canUndo || isGenerating} className={`p-1.5 rounded-md transition-colors ${canUndo ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700'}`} title="Hoàn tác (Ctrl+Z)"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" strokeWidth={2}/></svg></button>
              <button onClick={redo} disabled={!canRedo || isGenerating} className={`p-1.5 rounded-md transition-colors ${canRedo ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700'}`} title="Làm lại (Ctrl+Y)"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" strokeWidth={2}/></svg></button>
          </div>

          {/* Chế độ Sửa / Xem */}
          <div className="flex items-center bg-gray-950 p-0.5 rounded-lg border border-gray-800 shrink-0" role="group" aria-label="Chế độ làm việc">
            <button 
              type="button"
              onClick={() => handleModeChange(true)} 
              className={`px-1.5 sm:px-2 py-1 rounded-md transition-all flex items-center gap-1 text-[11px] sm:text-xs font-semibold ${
                isEditMode 
                  ? 'bg-primary-600 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Chế độ Sửa (Cho phép soạn thảo văn bản và tiêu đề)"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Sửa</span>
            </button>
            <button 
              type="button"
              onClick={() => handleModeChange(false)} 
              className={`px-1.5 sm:px-2 py-1 rounded-md transition-all flex items-center gap-1 text-[11px] sm:text-xs font-semibold ${
                !isEditMode 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Chế độ Xem (Giao diện đọc sách trang nhã, không hiện bàn phím, tránh gõ nhầm)"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Xem</span>
            </button>
          </div>

          <div className="h-4 w-px bg-gray-800 mx-0.5 shrink-0 hidden sm:block"></div>

          {/* Cụm Dịch / Việt hoá */}
          <div className="relative inline-flex items-center shrink-0 shadow-sm">
            <button 
              onClick={() => {
                setShowTranslateSettings(false);
                translateChapter(activeChapterId!);
              }} 
              disabled={isGenerating} 
              className={`px-2 py-1 rounded-lg sm:rounded-r-none transition-all border shrink-0 flex items-center gap-1 text-[11px] sm:text-xs font-semibold ${
                isGenerating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-900/40 hover:border-emerald-500/60'
              } bg-emerald-950/40 text-emerald-300 border-emerald-800/60`} 
              title="Đại Biên Tập & Việt Hóa Văn Học Đỉnh Cao"
            >
              <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              <span className="text-emerald-300">Việt Hóa</span>
              <span className="hidden lg:inline px-1.5 py-0.2 rounded bg-emerald-900/60 text-[10px] text-emerald-400 font-normal">
                {translationOptions?.styleMode === 'wuxia' ? 'Tiên Hiệp' :
                 translationOptions?.styleMode === 'fantasy' ? 'Tây Phương' :
                 translationOptions?.styleMode === 'modern' ? 'Hiện Đại' : 'Thuần Việt'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowTranslateSettings(true)}
              className="hidden sm:flex p-1 sm:py-1 -ml-px rounded-r-lg transition-all border border-l-0 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-400 hover:text-emerald-200 border-emerald-800/60"
              title="Tùy chỉnh phong cách & Xưng hô Việt hóa"
              aria-label="Tùy chọn Việt hóa"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {/* Auto Next (Dịch tự động) */}
          <button 
            onClick={() => setIsAutoTranslateEnabled(!isAutoTranslateEnabled)} 
            className={`p-1.5 sm:px-2 sm:py-1 rounded-lg transition-all border shrink-0 flex items-center gap-1 text-[11px] sm:text-xs font-semibold relative ${
              isAutoTranslateEnabled 
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/50' 
                : 'bg-gray-800/40 text-gray-400 border-gray-700/70 hover:text-gray-200 hover:border-gray-600'
            }`}
            title="Dịch tự động hàng loạt & Chuyển chương tiếp theo (Auto Next)"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            <span className="hidden md:inline">Auto</span>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAutoTranslateEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}></div>
          </button>

          {/* Trợ lý tinh chỉnh AI */}
          <button 
            onClick={() => setIsRefinePanelOpen(!isRefinePanelOpen)} 
            className={`p-1.5 sm:px-2 sm:py-1 rounded-lg transition-all border shrink-0 flex items-center gap-1 text-[11px] sm:text-xs font-semibold ${
              isRefinePanelOpen 
                ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.3)]' 
                : 'bg-purple-950/30 text-purple-300 border-purple-900/50 hover:border-purple-600/60'
            }`}
            title="Trợ lý tinh chỉnh AI (Văn phong, Đối thoại, Giác quan)"
          >
            <span className="text-xs shrink-0">✨</span>
            <span className="hidden md:inline">Trợ lý AI</span>
          </button>

          {/* Nút Aa Tùy chỉnh chế độ đọc */}
          <div className="relative shrink-0" ref={readerSettingsRef}>
            <button
              type="button"
              onClick={() => setShowReaderSettings(s => !s)}
              className={`p-1.5 sm:px-2 sm:py-1 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 ${
                showReaderSettings 
                  ? 'bg-purple-900/60 text-purple-200 border-purple-500 ring-1 ring-purple-500/30' 
                  : 'bg-gray-800/60 text-gray-300 border-gray-700 hover:text-white hover:bg-gray-800 hover:border-gray-600'
              }`}
              title="Tùy chỉnh cỡ chữ, font chữ & màu nền"
              aria-expanded={showReaderSettings}
            >
              <span className="font-serif font-black text-xs">Aa</span>
            </button>

            {showReaderSettings && (
              <div 
                className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] bg-gray-900/98 border border-gray-700/80 rounded-2xl p-4 shadow-2xl z-50 text-xs backdrop-blur-xl animate-fadeIn space-y-4"
              >
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>📖</span> Tùy chỉnh chế độ đọc
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setShowReaderSettings(false)}
                    className="text-gray-400 hover:text-white p-1"
                  >
                    ✕
                  </button>
                </div>

                {/* Cỡ chữ */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cỡ chữ</label>
                  <div className="grid grid-cols-4 gap-1 p-1 bg-gray-950 rounded-xl border border-gray-800">
                    {(['sm', 'base', 'lg', 'xl'] as const).map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => updateReaderSetting('fontSize', size)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                          readerSettings.fontSize === size 
                            ? 'bg-primary-600 text-white shadow' 
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {size === 'sm' ? 'Nhỏ' : size === 'base' ? 'Vừa' : size === 'lg' ? 'Lớn' : 'XL'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kiểu chữ */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kiểu chữ</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-950 rounded-xl border border-gray-800">
                    <button
                      type="button"
                      onClick={() => updateReaderSetting('fontFamily', 'serif')}
                      className={`py-1.5 rounded-lg text-xs font-serif font-bold transition-all ${
                        readerSettings.fontFamily === 'serif' 
                          ? 'bg-purple-600 text-white shadow' 
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Văn chương (Serif)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateReaderSetting('fontFamily', 'sans')}
                      className={`py-1.5 rounded-lg text-xs font-sans font-bold transition-all ${
                        readerSettings.fontFamily === 'sans' 
                          ? 'bg-purple-600 text-white shadow' 
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Hiện đại (Sans)
                    </button>
                  </div>
                </div>

                {/* Tông màu nền */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Màu nền dịu mắt</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateReaderSetting('theme', 'oled')}
                      className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all border ${
                        readerSettings.theme === 'oled' 
                          ? 'bg-black text-white border-primary-500 ring-2 ring-primary-500/30' 
                          : 'bg-black/60 text-gray-400 border-gray-800 hover:text-white'
                      }`}
                    >
                      OLED Đen
                    </button>
                    <button
                      type="button"
                      onClick={() => updateReaderSetting('theme', 'charcoal')}
                      className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all border ${
                        readerSettings.theme === 'charcoal' 
                          ? 'bg-[#121214] text-white border-primary-500 ring-2 ring-primary-500/30' 
                          : 'bg-[#121214]/60 text-gray-400 border-gray-800 hover:text-white'
                      }`}
                    >
                      Than chì
                    </button>
                    <button
                      type="button"
                      onClick={() => updateReaderSetting('theme', 'sepia')}
                      className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all border ${
                        readerSettings.theme === 'sepia' 
                          ? 'bg-[#1c1815] text-[#e4dacd] border-amber-500 ring-2 ring-amber-500/30' 
                          : 'bg-[#181512]/60 text-gray-400 border-gray-800 hover:text-amber-200'
                      }`}
                    >
                      Giấy ngà
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Nút Focus Mode */}
          <button
            type="button"
            onClick={() => setIsZenMode(true)}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1 bg-gray-800/60 text-gray-300 border-gray-700 hover:text-white hover:bg-gray-800 hover:border-gray-600"
            title="Bật chế độ tập trung Zen Mode (Ẩn mọi xao nhãng)"
          >
            <span>🎯</span>
            <span className="hidden xl:inline">Tập trung</span>
          </button>
        </div>

        {/* Menu Công cụ (Được cố định bên phải, không bao giờ bị cắt ngoài màn hình) */}
        <div className="relative shrink-0 pl-1" ref={toolsMenuRef}>
          <button 
            type="button"
            onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)} 
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1 ${
              isToolsMenuOpen 
                ? 'bg-gray-800 text-white border-primary-500 shadow-md ring-1 ring-primary-500/30' 
                : 'bg-gray-800/60 text-gray-300 border-gray-700 hover:text-white hover:bg-gray-800 hover:border-gray-600'
            }`}
            title="Mở menu công cụ chương & tiện ích"
            aria-expanded={isToolsMenuOpen}
          >
            <svg className="w-3.5 h-3.5 text-primary-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span className="hidden sm:inline">Công cụ</span>
            {isSummarizing && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Đang tóm tắt..."></span>
            )}
            <svg className={`w-3 h-3 text-gray-400 transition-transform duration-200 hidden sm:block ${isToolsMenuOpen ? 'rotate-180 text-white' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isToolsMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] bg-gray-900 border border-gray-800 rounded-xl shadow-2xl p-1.5 z-50 text-xs backdrop-blur-md">
              <div className="px-2.5 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Xử lý chương
              </div>

              {/* Tóm tắt chương */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  handleSummarize();
                }}
                disabled={isSummarizing}
                className="w-full text-left px-2.5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors disabled:opacity-40"
              >
                <svg className={`w-4 h-4 text-emerald-400 shrink-0 ${isSummarizing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Tóm tắt chương</div>
                  <div className="text-[10px] text-gray-500 truncate">AI đúc kết diễn biến cốt truyện</div>
                </div>
              </button>

              {/* Chia nhỏ chương */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsSplitModalOpen(true);
                }}
                disabled={isGenerating || !activeChapter?.content?.trim()}
                className="w-full text-left px-2.5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors disabled:opacity-40"
              >
                <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Chia nhỏ chương</div>
                  <div className="text-[10px] text-gray-500 truncate">Tách thành các phân đoạn nhỏ</div>
                </div>
              </button>

              {/* Gộp chương */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsMergeModalOpen(true);
                }}
                disabled={isGenerating || (story?.chapters.length || 0) < 2}
                className="w-full text-left px-2.5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors disabled:opacity-40"
              >
                <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Gộp chương</div>
                  <div className="text-[10px] text-gray-500 truncate">Nối các phần đã xử lý thành 1 chương</div>
                </div>
              </button>

              {/* Chèn chương trống */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setInsertPosition('after');
                  setIsInsertModalOpen(true);
                }}
                disabled={isGenerating}
                className="w-full text-left px-2.5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors disabled:opacity-40"
              >
                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Chèn chương trống</div>
                  <div className="text-[10px] text-gray-500 truncate">Thêm chương mới vào trước hoặc sau</div>
                </div>
              </button>

              <div className="my-1.5 border-t border-gray-800" />
              <div className="px-2.5 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Sáng tác & Đối chiếu
              </div>

              {/* Cài đặt Việt hóa */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setShowTranslateSettings(true);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-950/50 flex items-center gap-2.5 transition-colors"
              >
                <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Cài đặt phong cách Việt hóa</div>
                  <div className="text-[10px] text-gray-500 truncate">Văn phong, đại từ xưng hô, văn cảnh</div>
                </div>
              </button>

              {/* Đối Soát Song Ngữ */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  if (onOpenBilingualReview) {
                    onOpenBilingualReview(activeChapterId || undefined);
                  } else {
                    setIsBilingualModalOpen(true);
                  }
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors"
              >
                <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Đối soát song ngữ</div>
                  <div className="text-[10px] text-gray-500 truncate">So sánh song song nguyên tác và dịch</div>
                </div>
              </button>

              {/* Mạch truyện */}
              {onOpenPlotArc && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsToolsMenuOpen(false);
                    onOpenPlotArc();
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors"
                >
                  <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">Mạch truyện (Plot Arc)</div>
                    <div className="text-[10px] text-gray-500 truncate">Phân tích nhịp điệu & đồng sáng tạo</div>
                  </div>
                </button>
              )}

              <div className="my-1.5 border-t border-gray-800" />
              <div className="px-2.5 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Giao diện & Hiệu năng
              </div>

              {/* Chế độ tập trung */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setIsZenMode(true);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors"
              >
                <span className="text-base">🎯</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Chế độ tập trung (Zen Focus)</div>
                  <div className="text-[10px] text-gray-500 truncate">Ẩn mọi menu, chỉ để lại trang viết (ESC để thoát)</div>
                </div>
              </button>

              {/* Tùy chỉnh chế độ đọc */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setShowReaderSettings(true);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors"
              >
                <span className="font-serif font-black text-sm text-purple-400">Aa</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">Tùy biến hiển thị đọc sách</div>
                  <div className="text-[10px] text-gray-500 truncate">Cỡ chữ, font Serif/Sans, màu nền OLED/Than chì</div>
                </div>
              </button>

              <div className="my-1.5 border-t border-gray-800" />

              {/* Chú giải */}
              <button
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(false);
                  setShowLegendModal(true);
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Xem chú giải các nút</span>
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      <div 
        ref={scrollContainerRef} 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
        className={`flex-1 overflow-y-auto relative custom-scrollbar pb-20 overscroll-y-contain transition-colors duration-300 ${readerThemeClass}`}
      >
        {isGenerating && <div className="sticky top-0 left-0 right-0 z-[60] h-1 w-full bg-gray-900 overflow-hidden"><div className="absolute top-0 bottom-0 bg-primary-500 transition-all duration-300" style={{ width: `${generationProgress}%` }}></div></div>}
        <div className="max-w-3xl mx-auto py-6 px-4 md:py-16 md:px-8 min-h-screen">
          {/* VERSION SWITCHER & TRANSLATION CONTROLS */}
          <div className="mb-6 p-2 rounded-2xl bg-gray-900/90 border border-gray-800 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-1.5 p-1 bg-gray-950 rounded-xl border border-gray-800/80">
              <button
                type="button"
                onClick={() => handleVersionChange('original')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  editorVersion === 'original'
                    ? 'bg-primary-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>📖</span>
                <span>Bản Gốc</span>
              </button>

              <button
                type="button"
                onClick={() => handleVersionChange('translation')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  editorVersion === 'translation'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <span>✨</span>
                <span>Bản Dịch</span>
                {activeChapter.translatedContent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
                )}
              </button>

              <button
                type="button"
                onClick={() => onOpenBilingualReview ? onOpenBilingualReview(activeChapter.id) : setIsBilingualModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-950/40 transition-all flex items-center gap-1 border border-blue-900/40"
                title="Mở bảng đối chiếu song ngữ hai cột"
              >
                <span>⚖️</span>
                <span>Đối Soát</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTranslateSettings(true)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 transition-all flex items-center gap-1 border border-emerald-900/40"
                title="Cài đặt phong cách & xưng hô Việt hóa"
              >
                <span>⚙️</span>
                <span className="hidden sm:inline">
                  {translationOptions?.styleMode === 'wuxia' ? 'Tiên Hiệp' :
                   translationOptions?.styleMode === 'fantasy' ? 'Tây Phương' :
                   translationOptions?.styleMode === 'modern' ? 'Hiện Đại' : 'Thuần Việt'}
                </span>
              </button>
            </div>

            {/* Quick status on the right */}
            <div className="flex items-center gap-2">
              {editorVersion === 'translation' ? (
                activeChapter.translatedContent ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-emerald-400/80 hidden sm:inline">
                      ✓ Đang xem Bản Dịch (Menu Bản Dịch)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Áp dụng bản dịch này làm nội dung chính của chương? (Bản gốc vẫn được bảo lưu an toàn)")) {
                          promoteTranslationToMain(activeChapter.id);
                        }
                      }}
                      className="px-2.5 py-1 bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 rounded-lg text-xs font-medium transition-all"
                    >
                      Áp dụng làm bản chính
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-orange-400 font-medium">
                    Chương này chưa có bản dịch
                  </span>
                )
              ) : (
                activeChapter.translatedContent ? (
                  <button
                    type="button"
                    onClick={() => setEditorVersion('translation')}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>Đã có bản dịch</span>
                    <span>→</span>
                  </button>
                ) : null
              )}
            </div>
          </div>

          {/* If Translation Mode and empty */}
          {editorVersion === 'translation' && !activeChapter.translatedContent && !isGenerating && (
            <div className="mb-6 p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-3">
              <div className="text-2xl">✨</div>
              <h4 className="text-sm font-bold text-emerald-300">Chương này chưa có bản dịch trong Menu Bản Dịch</h4>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Bản gốc vẫn giữ nguyên vẹn 100%. Khi dịch, kết quả sẽ được lưu độc lập vào Menu Bản Dịch để bạn có thể xem lại hoặc đối soát bất cứ lúc nào.
              </p>
              <button
                type="button"
                onClick={() => translateChapter(activeChapter.id)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 mx-auto"
              >
                <span>⚡</span>
                <span>Việt Hóa Ngay (Văn học đỉnh cao)</span>
              </button>
            </div>
          )}

          {/* Title Presentation */}
          {isEditMode ? (
            <input 
              type="text" 
              value={localTitle} 
              onChange={handleTitleChange} 
              className="w-full bg-transparent text-2xl md:text-4xl font-serif font-bold text-gray-100 mb-6 md:mb-8 outline-none border-b border-transparent focus:border-primary-500/40 pb-2 transition-colors placeholder:text-gray-600" 
              placeholder="Tiêu đề chương..." 
            />
          ) : (
            <div className="mb-6 md:mb-8 pb-3 border-b border-gray-800/80 flex items-baseline justify-between gap-4">
              <h1 className="text-2xl md:text-4xl font-serif font-bold text-gray-100 tracking-tight select-text">
                {localTitle || 'Chưa đặt tiêu đề'}
              </h1>
              <button
                type="button"
                onClick={() => handleModeChange(true)}
                className="shrink-0 text-xs text-gray-400 hover:text-primary-400 flex items-center gap-1 transition-colors px-2 py-1 rounded bg-gray-900 border border-gray-800 hover:border-primary-800/60"
                title="Chuyển sang Chế độ Sửa để đổi tiêu đề"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span>Sửa</span>
              </button>
            </div>
          )}

          {/* Content Presentation */}
          {isEditMode ? (
            <div className={`relative ${readerSizeClass} leading-relaxed ${readerFontClass}`}>
              <textarea 
                ref={textareaRef} 
                value={localContent} 
                onChange={handleContentChange} 
                onKeyDown={handleKeyDown} 
                onSelect={handleSelection} 
                placeholder="Hành trình bắt đầu từ đây... (Nhập hoặc dán nội dung chương)" 
                className={`w-full min-h-[400px] bg-transparent focus:outline-none resize-none overflow-hidden p-0 border-none m-0 ${readerLineHeightClass} placeholder:text-gray-600 ${readerSettings.theme === 'sepia' ? 'text-[#e2d9ce]' : 'text-gray-200'}`} 
                spellCheck={false} 
                readOnly={isGenerating} 
              />
            </div>
          ) : (
            <div 
              className={`relative ${readerSizeClass} ${readerLineHeightClass} ${readerFontClass} select-text`}
              onMouseUp={handleReaderSelection}
              onTouchEnd={handleReaderSelection}
            >
              {localContent ? (
                <div 
                  className={`space-y-4 cursor-text ${readerSettings.theme === 'sepia' ? 'text-[#e2d9ce]' : 'text-gray-200'}`}
                  onDoubleClick={() => handleModeChange(true)}
                  title="Nhấp đúp chuột để chuyển nhanh sang Chế độ Sửa"
                >
                  {renderedParagraphs}
                </div>
              ) : (
                <div className="py-16 text-center border border-dashed border-gray-800 rounded-2xl p-6 bg-gray-900/30 space-y-3">
                  <div className="text-3xl">📝</div>
                  <p className="text-sm font-semibold text-gray-300">Chương này hiện chưa có nội dung</p>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    {editorVersion === 'translation' 
                      ? 'Bản dịch cho chương này chưa được tạo. Bạn có thể bấm Việt Hóa hoặc chuyển sang Chế độ Sửa để tự viết.'
                      : 'Chuyển sang Chế độ Sửa để nhập hoặc dán nội dung bản thảo vào chương này.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleModeChange(true)}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg inline-flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Chuyển sang Chế độ Sửa</span>
                  </button>
                </div>
              )}

              {/* Reader footer indicator */}
              {localContent && (
                <div className="mt-12 pt-6 border-t border-gray-800/60 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Đang xem ở Chế độ Đọc sách
                  </span>
                  <button
                    type="button"
                    onClick={() => handleModeChange(true)}
                    className="text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1 underline"
                  >
                    <span>Chuyển sang Chế độ Sửa</span>
                    <span>→</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TRẠM KẾT THÚC CHƯƠNG & CHUYỂN CHƯƠNG BẰNG MỘT CHẠM / VUỐT */}
          <div className="mt-14 pt-8 border-t border-gray-800/80 space-y-4">
            <div className="flex items-center justify-center gap-3 text-gray-600 text-[11px] uppercase tracking-widest font-mono">
              <div className="h-px w-12 bg-gray-800"></div>
              <span>❖ Hết {activeChapter.title || 'Chương'} ❖</span>
              <div className="h-px w-12 bg-gray-800"></div>
            </div>

            {nextChapter ? (
              <div 
                onClick={goToNextChapter}
                className="group relative cursor-pointer p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-gray-900 via-gray-900 to-emerald-950/40 border border-gray-800 hover:border-emerald-500/50 transition-all duration-300 shadow-xl hover:shadow-emerald-950/30 flex items-center justify-between gap-4 select-none"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                      Chương tiếp theo
                    </span>
                    <span className="text-[10px] text-gray-400 hidden sm:inline">
                      (Vuốt lên tiếp ⬆ hoặc chạm để đọc)
                    </span>
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-emerald-300 transition-colors truncate">
                    {nextChapter.title || 'Chương kế tiếp'}
                  </h3>
                  <p className="text-[11px] text-gray-400 truncate">
                    {nextChapter.content ? `${fastWordCount(nextChapter.content)} từ · Tiếp tục mạch truyện` : 'Chương mới chưa có nội dung'}
                  </p>
                </div>

                <div className="w-10 h-10 rounded-xl bg-gray-800 group-hover:bg-emerald-600 text-gray-400 group-hover:text-white flex items-center justify-center transition-all shrink-0 group-hover:scale-105 shadow-md">
                  <svg className="w-5 h-5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 text-center space-y-3">
                <div className="text-2xl">🎉</div>
                <p className="text-xs font-bold text-gray-300">Bạn đã đọc đến chương cuối cùng hiện có của tác phẩm</p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setInsertPosition('after');
                      setIsInsertModalOpen(true);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>+ Chèn chương mới</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => generateContinue('append')}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>⚡</span>
                    <span>Viết tiếp bằng AI</span>
                  </button>
                </div>
              </div>
            )}

            {prevChapter && (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={goToPrevChapter}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-gray-900"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="truncate max-w-[200px]">Quay lại: {prevChapter.title || 'Chương trước'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CHỈ BÁO VUỐT CHUYỂN CHƯƠNG NỔI (SWIPE INDICATORS) */}
      {bottomPullDistance > 0 && nextChapter && (
        <div 
          className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[70] pointer-events-none transition-all duration-150 animate-fadeIn"
          style={{ transform: `translateX(-50%) translateY(${-Math.min(20, bottomPullDistance * 0.2)}px)` }}
        >
          <div className={`px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 ${
            bottomPullDistance >= PULL_THRESHOLD 
              ? 'bg-emerald-950/95 border-emerald-400 text-emerald-200 ring-2 ring-emerald-400/40 scale-105' 
              : 'bg-gray-900/95 border-gray-700 text-gray-300'
          } transition-all duration-200`}>
            <div className={`p-2 rounded-xl transition-all ${
              bottomPullDistance >= PULL_THRESHOLD 
                ? 'bg-emerald-500 text-gray-950 animate-bounce' 
                : 'bg-gray-800 text-emerald-400'
            }`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-[11px] font-black uppercase tracking-wider">
                {bottomPullDistance >= PULL_THRESHOLD ? '✨ Thả tay để chuyển chương' : 'Kéo lên tiếp để sang chương mới'}
              </div>
              <div className="text-xs font-semibold text-white truncate max-w-[200px] sm:max-w-[280px]">
                {nextChapter.title || 'Chương kế tiếp'}
              </div>
            </div>
          </div>
        </div>
      )}

      {topPullDistance > 0 && prevChapter && (
        <div 
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] pointer-events-none transition-all duration-150 animate-fadeIn"
          style={{ transform: `translateX(-50%) translateY(${Math.min(20, topPullDistance * 0.2)}px)` }}
        >
          <div className={`px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 ${
            topPullDistance >= PULL_THRESHOLD 
              ? 'bg-blue-950/95 border-blue-400 text-blue-200 ring-2 ring-blue-400/40 scale-105' 
              : 'bg-gray-900/95 border-gray-700 text-gray-300'
          } transition-all duration-200`}>
            <div className={`p-2 rounded-xl transition-all ${
              topPullDistance >= PULL_THRESHOLD 
                ? 'bg-blue-500 text-gray-950 animate-bounce' 
                : 'bg-gray-800 text-blue-400'
            }`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-[11px] font-black uppercase tracking-wider">
                {topPullDistance >= PULL_THRESHOLD ? '✨ Thả tay để về chương trước' : 'Kéo xuống tiếp để về chương trước'}
              </div>
              <div className="text-xs font-semibold text-white truncate max-w-[200px] sm:max-w-[280px]">
                {prevChapter.title || 'Chương trước'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST THÔNG BÁO CHUYỂN CHƯƠNG THÀNH CÔNG */}
      {swipeFeedbackText && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-[80] pointer-events-none animate-fadeIn">
          <div className="px-4 py-2 bg-gray-900/95 text-emerald-300 border border-emerald-500/50 rounded-full shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{swipeFeedbackText}</span>
          </div>
        </div>
      )}
      {isRefinePanelOpen && (
        <div className="fixed inset-x-0 bottom-0 sm:inset-auto sm:top-20 sm:right-6 z-50 w-full sm:w-80 md:w-96 bg-gray-900/98 backdrop-blur-xl border-t sm:border border-purple-500/30 rounded-t-2xl sm:rounded-2xl shadow-2xl p-0 animate-fadeIn flex flex-col overflow-hidden max-h-[85vh] sm:max-h-[75vh]">
            <div className="sm:hidden flex justify-center py-2 bg-gray-950 border-b border-gray-800"><div className="w-12 h-1 bg-gray-700 rounded-full"></div></div>
            <div className="flex bg-gray-950 border-b border-gray-800 shrink-0 overflow-x-auto custom-scrollbar">
                <button onClick={() => setActiveAITab('refine')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-widest transition-all ${activeAITab === 'refine' ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Tỉa</button>
                <button onClick={() => setActiveAITab('sensory')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-widest transition-all ${activeAITab === 'sensory' ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Giác quan</button>
                <button onClick={() => setActiveAITab('transform')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-widest transition-all ${activeAITab === 'transform' ? 'text-orange-400 border-b-2 border-orange-500 bg-orange-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Biến hình</button>
                <button onClick={() => setActiveAITab('critique')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-widest transition-all ${activeAITab === 'critique' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Góp ý</button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                {activeAITab === 'refine' && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="grid grid-cols-2 gap-1.5">
                        {["🌊 Mượt mà", "🎭 Nội tâm", "📉 Rút gọn", "📖 Mở rộng", "⚡ Kịch tính", "💎 Văn chương", "🎨 Thêm ẩn dụ", "🔊 Tiết tấu dồn dập"].map(label => (<button key={label} onClick={() => togglePreset(label)} className={`py-3 text-[10px] font-bold border rounded-xl transition-all ${selectedPresets.has(label) ? 'bg-purple-500 text-white border-purple-400 shadow-lg' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'}`}>{label}</button>))}
                    </div>
                  </div>
                )}
                {activeAITab === 'sensory' && (
                    <div className="space-y-4 animate-fadeIn">
                        <div className="grid grid-cols-2 gap-2">
                            {[ {label: "👁️ Thị giác", prompt: "Tăng cường thị giác"}, {label: "👂 Thính giác", prompt: "Tăng cường thính giác"}, {label: "🤝 Xúc giác", prompt: "Tăng cường xúc giác"}, {label: "👃 Khứu giác", prompt: "Tăng cường khứu giác"}, {label: "👅 Vị giác", prompt: "Tăng cường vị giác"}, {label: "🧠 Tâm linh", prompt: "Tăng cường linh cảm"} ].map(sense => (
                                <button key={sense.label} onClick={() => togglePreset(sense.prompt)} className={`flex flex-col items-center py-4 border rounded-2xl group transition-all ${selectedPresets.has(sense.prompt) ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' : 'bg-gray-800 border-gray-700 hover:border-emerald-500/50'}`}><span className="text-sm mb-1">{sense.label.split(' ')[0]}</span><span className={`text-[9px] font-black uppercase ${selectedPresets.has(sense.prompt) ? 'text-white' : 'text-gray-500'}`}>{sense.label.split(' ')[1]}</span></button>
                            ))}
                        </div>
                    </div>
                )}
                {activeAITab === 'transform' && (
                  <div className="space-y-4 animate-fadeIn">
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { label: "👤 Chuyển sang Ngôi thứ 1 (Ta/Tôi)", prompt: "Chuyển văn bản sang ngôi thứ nhất" },
                          { label: "👥 Chuyển sang Ngôi thứ 3 (Hắn/Nàng)", prompt: "Chuyển văn bản sang ngôi thứ ba" },
                          { label: "⏳ Dùng thì Quá khứ", prompt: "Sửa văn bản sang thì quá khứ" },
                          { label: "⚡ Dùng thì Hiện tại", prompt: "Sửa văn bản sang thì hiện tại" },
                          { label: "🗣️ Điêu khắc Đối thoại", prompt: "Rút gọn lời thoại, thêm action tags miêu tả điệu bộ" }
                        ].map(item => (
                          <button key={item.label} onClick={() => togglePreset(item.prompt)} className={`w-full py-3 px-4 text-left text-[10px] font-bold border rounded-xl transition-all ${selectedPresets.has(item.prompt) ? 'bg-orange-600 border-orange-400 text-white shadow-lg' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'}`}>{item.label}</button>
                        ))}
                      </div>
                  </div>
                )}
                {activeAITab === 'critique' && (
                    <div className="space-y-4 animate-fadeIn">
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => togglePreset("Kiểm tra lặp từ và gợi ý thay thế")} className={`py-3 text-[10px] font-bold border rounded-xl transition-all ${selectedPresets.has("Kiểm tra lặp từ và gợi ý thay thế") ? 'bg-blue-600 text-white border-blue-400' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>🔎 Quét lặp từ</button>
                          <button onClick={() => togglePreset("Phát hiện mâu thuẫn logic trong đoạn văn")} className={`py-3 text-[10px] font-bold border rounded-xl transition-all ${selectedPresets.has("Phát hiện mâu thuẫn logic trong đoạn văn") ? 'bg-blue-600 text-white border-blue-400' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>🧩 Soi logic</button>
                        </div>
                        <button onClick={auditActiveChapter} disabled={isAuditingChapter} className="w-full py-3.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl text-[10px] font-black uppercase hover:bg-blue-600/30 transition-all flex items-center justify-center gap-2 shadow-xl">{isAuditingChapter ? <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span> : '🔍 Toàn văn phân tích logic chương'}</button>
                        {chapterAuditReport && (
                          <div className="p-4 bg-blue-950/20 border border-blue-900/30 rounded-2xl animate-fadeIn space-y-3">
                            <h5 className="text-[9px] font-black text-blue-400 uppercase">Kết quả kiểm toán chương:</h5>
                            <p className="text-[11px] text-gray-300 leading-relaxed italic">"{chapterAuditReport.pacingAnalysis || 'Chưa có nhận xét nhịp điệu.'}"</p>
                            {[
                              ...(chapterAuditReport.internalConsistency || []),
                              ...(chapterAuditReport.characterLogic || []),
                              ...(chapterAuditReport.worldRuleViolations || [])
                            ].length > 0 && (
                              <div className="space-y-1.5 pt-2 border-t border-blue-900/30">
                                <span className="text-[9px] font-bold text-rose-400 uppercase block">
                                  Phát hiện {[...(chapterAuditReport.internalConsistency || []), ...(chapterAuditReport.characterLogic || []), ...(chapterAuditReport.worldRuleViolations || [])].length} lỗi cần sửa:
                                </span>
                                <ul className="space-y-1 text-[10px] text-rose-200 max-h-28 overflow-y-auto custom-scrollbar">
                                  {[
                                    ...(chapterAuditReport.internalConsistency || []),
                                    ...(chapterAuditReport.characterLogic || []),
                                    ...(chapterAuditReport.worldRuleViolations || [])
                                  ].slice(0, 6).map((err: any, i: number) => (
                                    <li key={i}>• {err.issue || err.character || JSON.stringify(err)}</li>
                                  ))}
                                </ul>
                                <button
                                  type="button"
                                  disabled={isGenerating}
                                  onClick={() => {
                                    const allIssues = [
                                      ...(chapterAuditReport.internalConsistency || []).map((x: any) => x.issue),
                                      ...(chapterAuditReport.characterLogic || []).map((x: any) => `${x.character}: ${x.issue}`),
                                      ...(chapterAuditReport.worldRuleViolations || []).map((x: any) => x.issue)
                                    ].filter(Boolean);
                                    refineChapter(`Khắc phục triệt để các lỗi logic/mạch lạc sau mà vẫn bảo tồn nguyên tác:\n- ${allIssues.join('\n- ')}`);
                                  }}
                                  className="w-full mt-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow transition-all disabled:opacity-40"
                                >
                                  ✨ AI Tự động sửa theo báo cáo (Xem Diff)
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {onOpenPlotArc && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsRefinePanelOpen(false);
                              onOpenPlotArc();
                            }}
                            className="w-full py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                          >
                            🎯 Mở Plot & Co-Edit Studio (Sửa toàn cục)
                          </button>
                        )}
                    </div>
                )}
                <div className="pt-2 border-t border-gray-800 space-y-3">
                    <div className="relative"><textarea value={refineCommand} onChange={e => setRefineCommand(e.target.value)} placeholder={selectedText ? "Chỉ dẫn sửa vùng chọn..." : "Nhập yêu cầu AI tùy chỉnh..."} className="w-full h-24 bg-gray-950 border border-gray-800 rounded-2xl p-4 text-xs text-white outline-none focus:border-purple-500 shadow-inner resize-none" />{selectedText && (<div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-600/20 text-emerald-400 text-[8px] font-black uppercase rounded border border-emerald-500/30">Vùng chọn</div>)}</div>
                    <button onClick={applyRefinement} disabled={isGenerating || (selectedPresets.size === 0 && !refineCommand.trim())} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase shadow-2xl transition-all active:scale-95 ${isGenerating ? 'bg-gray-800 text-gray-600' : 'bg-gradient-to-r from-purple-600 to-primary-600 text-white'}`}>{isGenerating ? "AI đang thực thi..." : (selectedPresets.size > 0 ? `Áp dụng ${selectedPresets.size} tinh chỉnh` : "Gửi yêu cầu")}</button>
                    {selectedText && (<button onClick={handleLearnStyle} className="w-full py-2 bg-orange-600/10 text-orange-400 border border-orange-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-orange-600/20 transition-all">🧬 Học phong cách đoạn này</button>)}
                    <button onClick={() => setIsRefinePanelOpen(false)} className="sm:hidden w-full py-2 text-[9px] font-black text-gray-500 uppercase">Đóng bảng AI</button>
                </div>
            </div>
        </div>
      )}
      {!isZenMode && (
        <div className="bg-gray-900 border-t border-gray-800 p-2 px-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
              <div className="flex items-center gap-2"><span className="hidden xs:inline text-[9px] font-black text-gray-600 uppercase tracking-widest">Tiến độ:</span><span className="text-[10px] font-bold text-primary-400">{wordCount} / {activeChapter.wordGoal || 2000}</span><div className="w-16 md:w-24 h-1 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-primary-500 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div></div></div>
              
              <div className="flex items-center gap-1 px-2 border-l border-gray-800 ml-1">
                  <button 
                    onClick={goToPrevChapter} 
                    disabled={!prevChapter || isGenerating}
                    title="Chương trước (Hoặc vuốt xuống ở đầu trang)"
                    className={`p-1.5 rounded transition-colors ${prevChapter && !isGenerating ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-700 cursor-not-allowed'}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button 
                    onClick={goToNextChapter} 
                    disabled={!nextChapter || isGenerating}
                    title="Chương tiếp theo (Hoặc vuốt lên ở cuối trang)"
                    className={`p-1.5 rounded transition-colors ${nextChapter && !isGenerating ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-700 cursor-not-allowed'}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => {
                      setInsertPosition('after');
                      setIsInsertModalOpen(true);
                    }} 
                    disabled={isGenerating}
                    title="Chèn chương mới vào trước hoặc sau chương này"
                    className="p-1.5 rounded transition-colors text-gray-400 hover:text-emerald-400 hover:bg-emerald-950/30 ml-0.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
              </div>
          </div>
          <div className="flex items-center gap-2 relative">
              {/* Tooltip detail panel */}
              {showTokenDetails && (
                  <div className="absolute bottom-12 right-0 bg-gray-900 border border-gray-700 rounded-2xl p-4 w-80 max-w-[calc(100vw-2rem)] shadow-2xl z-50 text-xs animate-fadeIn space-y-3">
                      <h4 className="font-bold text-white border-b border-gray-800 pb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            Hạn Mức Google Free API
                          </span>
                          <span className="text-[9px] text-gray-500 uppercase tracking-widest font-normal">AI Studio</span>
                      </h4>
                      <div className="space-y-3">
                          {/* PRO MODEL */}
                          <div className="space-y-1 text-left">
                              <div className="flex justify-between items-center font-bold">
                                  <span className="text-purple-400 uppercase text-[10px] tracking-tight truncate max-w-[150px]">{proStatus.modelId}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${proStatus.isLimited ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>
                                      {proStatus.workTimeRemaining}
                                  </span>
                              </div>
                              <div className="grid grid-cols-2 gap-y-1 text-[10px] text-gray-400 pt-1">
                                  <span>Yêu cầu/phút (RPM):</span>
                                  <span className="text-right font-mono text-white">{proStatus.rpmUsed} / {proStatus.rpmLimit}</span>
                                  <span>Token/phút (TPM):</span>
                                  <span className="text-right font-mono text-white">{proStatus.tpmUsed.toLocaleString()} / {proStatus.tpmLimit.toLocaleString()}</span>
                                  <span>Yêu cầu/ngày (RPD):</span>
                                  <span className="text-right font-mono text-white">{proStatus.rpdUsed} / {proStatus.rpdLimit}</span>
                              </div>
                          </div>
                          {/* FLASH MODEL */}
                          <div className="space-y-1 pt-2 border-t border-gray-800 text-left">
                              <div className="flex justify-between items-center font-bold">
                                  <span className="text-emerald-400 uppercase text-[10px] tracking-tight truncate max-w-[150px]">{flashStatus.modelId}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${flashStatus.isLimited ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                      {flashStatus.workTimeRemaining}
                                  </span>
                              </div>
                              <div className="grid grid-cols-2 gap-y-1 text-[10px] text-gray-400 pt-1">
                                  <span>Yêu cầu/phút (RPM):</span>
                                  <span className="text-right font-mono text-white">{flashStatus.rpmUsed} / {flashStatus.rpmLimit}</span>
                                  <span>Token/phút (TPM):</span>
                                  <span className="text-right font-mono text-white">{flashStatus.tpmUsed.toLocaleString()} / {flashStatus.tpmLimit.toLocaleString()}</span>
                                  <span>Yêu cầu/ngày (RPD):</span>
                                  <span className="text-right font-mono text-white">{flashStatus.rpdUsed} / {flashStatus.rpdLimit}</span>
                              </div>
                          </div>

                          {/* Quick Model Switch Buttons for Anti-429 */}
                          <div className="pt-2 border-t border-gray-800 space-y-1.5 text-left">
                            <span className="text-[10px] font-semibold text-gray-300 block">Đổi Model nhanh khi bị 429:</span>
                            <div className="grid grid-cols-4 gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  localStorage.setItem('aetheria_model_flash', 'gemini-4-hydrogen');
                                  window.dispatchEvent(new CustomEvent('aetheria_token_update'));
                                }}
                                className={`px-1.5 py-1 rounded text-[9px] font-medium transition-all text-center ${
                                  flashStatus.modelId === 'gemini-4-hydrogen'
                                    ? 'bg-emerald-600 text-white font-bold shadow'
                                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                                }`}
                              >
                                4 Hydrogen
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  localStorage.setItem('aetheria_model_flash', 'gemini-3.8-flash');
                                  window.dispatchEvent(new CustomEvent('aetheria_token_update'));
                                }}
                                className={`px-1.5 py-1 rounded text-[9px] font-medium transition-all text-center ${
                                  flashStatus.modelId === 'gemini-3.8-flash'
                                    ? 'bg-emerald-600 text-white font-bold shadow'
                                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                                }`}
                              >
                                3.8 Flash
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  localStorage.setItem('aetheria_model_flash', 'gemini-3.7-flash');
                                  window.dispatchEvent(new CustomEvent('aetheria_token_update'));
                                }}
                                className={`px-1.5 py-1 rounded text-[9px] font-medium transition-all text-center ${
                                  flashStatus.modelId === 'gemini-3.7-flash'
                                    ? 'bg-emerald-600 text-white font-bold shadow'
                                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                                }`}
                              >
                                3.7 Flash
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  localStorage.setItem('aetheria_model_flash', 'gemini-3.1-flash-lite');
                                  window.dispatchEvent(new CustomEvent('aetheria_token_update'));
                                }}
                                className={`px-1.5 py-1 rounded text-[9px] font-medium transition-all text-center ${
                                  flashStatus.modelId === 'gemini-3.1-flash-lite'
                                    ? 'bg-emerald-600 text-white font-bold shadow'
                                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                                }`}
                              >
                                3.1 Lite
                              </button>
                            </div>
                            <p className="text-[8px] text-gray-400 italic pt-1">
                              * Mẹo: Thêm 1-2 API Key miễn phí từ Google AI Studio vào Cài đặt (bánh răng) để nhân đôi hạn mức.
                            </p>
                          </div>
                      </div>
                  </div>
              )}

              {/* Main Trigger / Simple Bar */}
              <div 
                  onClick={() => setShowTokenDetails(!showTokenDetails)}
                  className="flex items-center gap-2 px-3 py-1 bg-gray-950/60 hover:bg-gray-950 border border-gray-800 rounded-xl cursor-pointer transition-all select-none"
              >
                  {/* AI Status */}
                  <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isGenerating ? 'bg-purple-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                      <span className="text-[8px] font-black uppercase text-gray-400 shrink-0 hidden xs:inline">
                          {isGenerating ? 'Chạy' : 'Sẵn sàng'}
                      </span>
                  </div>

                  {/* PRO Status Summary */}
                  <div className="flex items-center gap-1 border-l border-gray-800 pl-2 text-[10px]">
                      <span className="text-purple-400 font-extrabold text-[8px] tracking-tight uppercase">PRO:</span>
                      {proStatus.isLimited ? (
                          <span className="text-red-400 font-black animate-pulse text-[9px]">{proStatus.workTimeRemaining}</span>
                      ) : (
                          <span className="text-purple-300 font-bold text-[9px]">{proStatus.estimatedRemainingRequests} lượt</span>
                      )}
                  </div>

                  {/* FLASH Status Summary */}
                  <div className="flex items-center gap-1 border-l border-gray-800 pl-2 text-[10px]">
                      <span className="text-emerald-400 font-extrabold text-[8px] tracking-tight uppercase">FLASH:</span>
                      {flashStatus.isLimited ? (
                          <span className="text-red-400 font-black animate-pulse text-[9px]">{flashStatus.workTimeRemaining}</span>
                      ) : (
                          <span className="text-emerald-300 font-bold text-[9px]">{flashStatus.estimatedRemainingRequests} lượt</span>
                      )}
                  </div>

                  {/* Info Icon */}
                  <div className="text-gray-500 hover:text-gray-300 ml-0.5">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                  </div>
              </div>
          </div>
        </div>
      )}
      {showLegendModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fadeIn" onClick={() => setShowLegendModal(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Chú giải thanh tác vụ
              </h3>
              <button onClick={() => setShowLegendModal(false)} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4 text-xs text-gray-300">
              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-gray-800/50 text-gray-400 border border-gray-700 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-white text-[13px]">Về thư viện</h4>
                  <p className="text-gray-400">Tự động lưu lại tiến trình viết hiện tại và quay về màn hình danh sách truyện.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800 shrink-0">
                  <span className="p-0.5 text-gray-300"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" strokeWidth={2}/></svg></span>
                </div>
                <div>
                  <h4 className="font-bold text-white text-[13px]">Hoàn tác & Làm lại (Undo / Redo)</h4>
                  <p className="text-gray-400">Hỗ trợ khôi phục các hành động chỉnh sửa hoặc thay đổi văn bản vừa thực hiện một cách nhanh chóng.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-gray-800/50 text-gray-400 border border-gray-700 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-400 text-[13px]">AI Tóm tắt chương</h4>
                  <p className="text-gray-400">Yêu cầu AI phân tích và lập tóm tắt ngắn cho chương hiện tại để làm tài liệu định hướng trí nhớ cho các chương kế tiếp.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/50 shrink-0">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-purple-300 text-[13px]">Chia nhỏ chương (Split Chapter - Trong Menu Công cụ)</h4>
                  <p className="text-gray-400">Tự động ngắt chương dài thành các phân đoạn nhỏ hơn (theo số từ, dấu phân cảnh hoặc con trỏ). Giúp giảm tải dữ liệu gửi đi tới API, tránh nghẽn hạn mức 429 và tăng độ sắc sảo cho từng phân cảnh.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-indigo-950/40 text-indigo-300 border border-indigo-800/50 shrink-0">
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-indigo-300 text-[13px]">Gộp chương (Merge Chapters - Trong Menu Công cụ)</h4>
                  <p className="text-gray-400">Nối nhiều phần nhỏ đã hoàn thiện thành một chương hoàn chỉnh duy nhất, tự động đánh lại số thứ tự chương và dọn dẹp các phân đoạn phụ.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-primary-900/20 text-primary-400 border border-primary-900/50 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-primary-400 text-[13px]">Chế độ Sửa / Xem</h4>
                  <p className="text-gray-400">Chuyển đổi giữa chế độ <span className="text-white font-medium">Sửa</span> (soạn thảo trực tiếp nội dung và tiêu đề) và chế độ <span className="text-white font-medium">Xem</span> (trình bày sách với thụt lề trang nhã, không hiện bàn phím ảo, tránh gõ nhầm khi đang đọc; nhấp đúp để sửa ngay, hỗ trợ bôi đen câu chữ để gọi trợ lý AI).</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-gray-800/50 text-gray-400 border border-gray-700 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-white text-[13px]">AI Đại Biên Tập & Việt Hóa Văn Học</h4>
                  <p className="text-gray-400">Gọi AI chuyển ngữ và biên tập chương truyện sang tiếng Việt văn chương đỉnh cao, quét sạch 100% văn phong thô ráp, cấu trúc convert máy sượng sùng. Hỗ trợ 4 phong cách: Thuần Việt, Cổ phong Tiên hiệp, Tây phương kỳ ảo và Hiện đại đô thị.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-500/40 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-400 text-[13px]">Tự động dịch tiếp (Auto Next)</h4>
                  <p className="text-gray-400">Chế độ rảnh tay: Sau khi dịch xong chương hiện tại, hệ thống tự động nhảy sang chương tiếp theo để tiếp tục dịch không ngừng nghỉ.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-rose-950/30 text-rose-400 border border-rose-900/40 shrink-0">
                  <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-rose-400 text-[13px]">Mạch truyện (AI Co-Edit)</h4>
                  <p className="text-gray-400">Phân tích dòng chảy của truyện, lập dàn ý các mốc sự kiện quan trọng và đồng hành xây dựng thế giới nhân vật cùng AI.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/50 shrink-0">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-300 text-[13px]">Chèn chương trống (Insert Chapter)</h4>
                  <p className="text-gray-400">Chèn một chương trắng tinh vào bất kỳ vị trí nào: trước hoặc sau chương hiện tại. Hệ thống tự động đẩy thứ tự và có tùy chọn tự động tăng số thứ tự các chương phía sau (Ví dụ: Chương 2 -&gt; Chương 3).</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-purple-900/20 text-purple-400 border border-purple-900/50 shrink-0">
                  <span className="text-xs">✨</span>
                </div>
                <div>
                  <h4 className="font-bold text-purple-400 text-[13px]">Trợ lý tinh chỉnh AI</h4>
                  <p className="text-gray-400">Kích hoạt bảng công cụ nâng cao: Tỉa từ ngữ mượt mà, kích hoạt ngũ quan, đổi đại từ nhân xưng, chuyển thì, sửa đổi theo chỉ dẫn tự chọn, học hỏi văn phong...</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/40 shrink-0">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-emerald-400 text-[13px]">Vuốt chuyển chương mượt mà (Swipe Navigation)</h4>
                  <p className="text-gray-400">Khi cuộn/đọc đến cuối chương, chỉ cần vuốt hoặc cuộn tiếp lên trên để chuyển sang chương kế tiếp mà không cần bấm nút. Tương tự, vuốt xuống ở đầu chương sẽ quay lại chương trước đó.</p>
                </div>
              </div>
            </div>

            <button onClick={() => setShowLegendModal(false)} className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-purple-600/20">
              Đã hiểu
            </button>
          </div>
        </div>
      )}
      <SummaryViewModal isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} title={localTitle} summary={activeChapter.summary} chapterId={activeChapter.id} />
      <SplitChapterModal 
        isOpen={isSplitModalOpen} 
        onClose={() => setIsSplitModalOpen(false)} 
        chapter={activeChapter || null} 
        cursorPosition={textareaRef.current?.selectionStart}
        onSplit={async (segments) => {
          if (activeChapterId) {
            await splitChapter(activeChapterId, segments);
          }
        }}
      />
      <MergeChapterModal 
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        chapters={story?.chapters || []}
        activeChapterId={activeChapterId}
        onMerge={mergeChapters}
      />
      <InsertChapterModal
        isOpen={isInsertModalOpen}
        onClose={() => setIsInsertModalOpen(false)}
        chapters={story?.chapters || []}
        initialTargetChapterId={activeChapterId || undefined}
        initialPosition={insertPosition}
        onInsert={insertChapter}
      />
      <BilingualReviewModal
        isOpen={isBilingualModalOpen}
        onClose={() => setIsBilingualModalOpen(false)}
        defaultChapterId={activeChapterId}
      />
      <TranslationSettingsModal
        isOpen={showTranslateSettings}
        onClose={() => setShowTranslateSettings(false)}
        onStartTranslate={() => {
          if (activeChapterId) translateChapter(activeChapterId);
        }}
      />
    </div>
  );
};
