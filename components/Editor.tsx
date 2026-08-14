
import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { SummaryViewModal } from './SummaryViewModal.tsx';
import { DiffReview } from './DiffReview.tsx';
import { fastWordCount } from '../utils/wordCount.ts';
import { tokenTracker } from '../services/tokenTracker.ts';

type EditorTab = 'refine' | 'sensory' | 'transform' | 'critique';

interface EditorProps {
  onOpenSidebar?: () => void;
  onOpenPlotArc?: () => void;
}

export const Editor: React.FC<EditorProps> = ({ onOpenSidebar, onOpenPlotArc }) => {
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
    isAutoTranslateEnabled,
    setIsAutoTranslateEnabled
  } = useStory();

  const [isEditMode, setIsEditMode] = useState(true);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [refineCommand, setRefineCommand] = useState('');
  const [isRefinePanelOpen, setIsRefinePanelOpen] = useState(false);
  const [activeAITab, setActiveAITab] = useState<EditorTab>('refine');
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  
  const [localContent, setLocalContent] = useState('');
  const [localTitle, setLocalTitle] = useState('');
  
  const [proStatus, setProStatus] = useState(() => tokenTracker.getModelStatus(localStorage.getItem('aetheria_model_pro') || 'gemini-3.1-pro-preview'));
  const [flashStatus, setFlashStatus] = useState(() => tokenTracker.getModelStatus(localStorage.getItem('aetheria_model_flash') || 'gemini-3.7-flash'));
  const [showTokenDetails, setShowTokenDetails] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);

  useEffect(() => {
    const update = () => {
      setProStatus(tokenTracker.getModelStatus(localStorage.getItem('aetheria_model_pro') || 'gemini-3.1-pro-preview'));
      setFlashStatus(tokenTracker.getModelStatus(localStorage.getItem('aetheria_model_flash') || 'gemini-3.7-flash'));
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
  const lastSentContentRef = useRef('');
  const lastSentTitleRef = useRef('');
  const initialContentRef = useRef<string>('');
  const prevActiveChapterIdRef = useRef<string | null>(null);
  const prevIsGeneratingRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const activeChapter = story?.chapters.find(c => c.id === activeChapterId);

  const sortedChapters = useMemo(() => {
    return story?.chapters ? [...story.chapters].sort((a, b) => a.order - b.order) : [];
  }, [story?.chapters]);

  const currentIndex = sortedChapters.findIndex(c => c.id === activeChapterId);
  const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Do not initiate swipe if touching interactive buttons, inputs, fixed menus, or textarea when editing
    if (
      target.tagName === 'BUTTON' || 
      target.closest('button') || 
      target.tagName === 'INPUT' || 
      target.closest('input') ||
      target.closest('.fixed') ||
      (isEditMode && (target.tagName === 'TEXTAREA' || target.closest('textarea')))
    ) {
      return;
    }
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;

    // Reset touch coordinates
    touchStartX.current = null;
    touchStartY.current = null;

    const minSwipeDistance = 50; // Minimum horizontal distance in px
    const maxVerticalRatio = 1.0; // Vertical distance can be up to 100% of horizontal distance (diagonal swipe)

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaY) / Math.abs(deltaX) < maxVerticalRatio) {
      if (deltaX < 0) {
        // Swipe Left -> Next Chapter
        if (nextChapter && !isGenerating) {
          selectChapter(nextChapter.id);
        }
      } else {
        // Swipe Right -> Previous Chapter
        if (prevChapter && !isGenerating) {
          selectChapter(prevChapter.id);
        }
      }
    }
  };

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  useEffect(() => {
    if (activeChapter) {
        const isChapterSwitch = prevActiveChapterIdRef.current !== activeChapterId;
        const isGenerationFinish = prevIsGeneratingRef.current && !isGenerating;
        const isExternalContentUpdate = activeChapter.content !== localContent && activeChapter.content !== lastSentContentRef.current;
        const isExternalTitleUpdate = activeChapter.title !== localTitle && activeChapter.title !== lastSentTitleRef.current;

        if (isChapterSwitch || isGenerationFinish || isExternalContentUpdate || isExternalTitleUpdate) {
            setLocalTitle(activeChapter.title);
            setLocalContent(activeChapter.content);
            initialContentRef.current = activeChapter.content;
            lastSentContentRef.current = activeChapter.content;
            lastSentTitleRef.current = activeChapter.title;
        }
    }
    prevActiveChapterIdRef.current = activeChapterId;
    prevIsGeneratingRef.current = isGenerating;
  }, [activeChapterId, activeChapter?.content, activeChapter?.title, isGenerating]);

  useLayoutEffect(() => {
    if (textareaRef.current && isEditMode) {
        const textarea = textareaRef.current;
        textarea.style.height = 'auto'; 
        textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [localContent, isEditMode, activeChapterId]);

  // Scroll to top when switching chapters
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeChapterId]);

  const wordCount = useMemo(() => {
    return fastWordCount(localContent);
  }, [localContent]);

  const performSave = useCallback((content: string) => {
    if (activeChapterId) {
        lastSentContentRef.current = content;
        updateChapterContent(activeChapterId, content);
    }
  }, [activeChapterId, updateChapterContent]);

  const handleManualSave = () => {
    setIsSavingManual(true);
    performSave(localContent);
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
        performSave(localContentRef.current);
      }
    };
  }, [activeChapterId, performSave]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalContent(newVal);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
        performSave(newVal);
    }, 1500);
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
    if (activeChapterId) {
        lastSentTitleRef.current = newTitle;
        updateChapterTitle(activeChapterId, newTitle);
    }
  };

  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        performSave(localContent);
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
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [localContent, isGenerating, performSave, generateContinue, undo, redo]);

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

  if (!activeChapter) return null;
  const progressPercent = Math.min(100, (wordCount / (activeChapter.wordGoal || 2000)) * 100);

  return (
    <div className={`flex-1 flex flex-col overflow-hidden bg-gray-950 transition-all duration-700 ${(isGenerating || isAuditingChapter || isCheckingErrors) ? 'ring-inset ring-1 ring-purple-500/20 shadow-[inset_0_0_50px_rgba(168,85,247,0.05)]' : ''}`}>
      {pendingEdit && <DiffReview original={pendingEdit.original} modified={pendingEdit.modified} onAccept={applyPendingEdit} onDiscard={discardPendingEdit} />}
      <div className="z-40 flex items-center px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0 gap-2 overflow-x-auto custom-scrollbar no-scrollbar">
          {onOpenSidebar && (
            <button 
              onClick={onOpenSidebar}
              className="md:hidden p-2 rounded bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 transition-all border border-gray-700 flex items-center shrink-0"
              title="Mở Menu"
              aria-label="Mở Sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <button onClick={closeStory} title="Về thư viện (Lưu trữ)" className="p-2 rounded bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 transition-all border border-gray-700 flex items-center shrink-0 shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          
          <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800 shrink-0">
              <button onClick={undo} disabled={!canUndo || isGenerating} className={`p-1.5 rounded transition-colors ${canUndo ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700'}`} title="Hoàn tác"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" strokeWidth={2}/></svg></button>
              <button onClick={redo} disabled={!canRedo || isGenerating} className={`p-1.5 rounded transition-colors ${canRedo ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700'}`} title="Làm lại"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" strokeWidth={2}/></svg></button>
          </div>

          <div className="h-4 w-px bg-gray-800 mx-1 shrink-0"></div>

          {/* Tóm tắt */}
          <button onClick={handleSummarize} disabled={isSummarizing} className="p-2 rounded text-gray-400 hover:text-emerald-400 transition-colors border border-gray-800 shrink-0" title="AI Tóm tắt chương">
            <svg className={`w-4 h-4 ${isSummarizing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Chế độ Viết / Đọc */}
          <button 
            onClick={() => setIsEditMode(!isEditMode)} 
            className={`p-2 rounded transition-all border shrink-0 flex items-center justify-center ${isEditMode ? 'bg-primary-900/20 text-primary-400 border-primary-900/50' : 'bg-gray-800/50 text-gray-400 border-gray-700 hover:text-white'}`}
            title={isEditMode ? "Chuyển sang Chế độ Đọc" : "Chuyển sang Chế độ Viết"}
          >
            {isEditMode ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            )}
          </button>

          {/* Dịch sang Tiếng Việt */}
          <button onClick={() => translateChapter(activeChapterId!)} disabled={isGenerating} className="p-2 rounded text-gray-400 hover:text-emerald-400 transition-colors border border-gray-800 shrink-0" title="AI Dịch sang Tiếng Việt">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </button>

          {/* Auto Next (Dịch tự động) */}
          <button 
            onClick={() => setIsAutoTranslateEnabled(!isAutoTranslateEnabled)} 
            className={`p-2 rounded transition-all border shrink-0 flex items-center justify-center relative ${isAutoTranslateEnabled ? 'bg-emerald-900/30 text-emerald-400 border-emerald-500/40' : 'bg-gray-800/30 text-gray-500 border-gray-800 hover:border-gray-700'}`}
            title="Dịch tự động hàng loạt & Chuyển chương tiếp theo (Auto Next)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-950 ${isAutoTranslateEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`}></div>
          </button>

          {/* Mạch truyện (AI Co-Edit) */}
          {onOpenPlotArc && (
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenPlotArc();
              }}
              className="p-2 rounded transition-all border bg-rose-950/30 text-rose-400 border-rose-900/40 hover:bg-rose-900/20 hover:border-rose-500/50 shrink-0 flex items-center justify-center shadow-sm"
              title="Phân tích mạch truyện & Đồng sáng tạo cốt truyện cùng AI"
            >
              <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          )}

          {/* Trợ lý tinh chỉnh AI */}
          <button 
            onClick={() => setIsRefinePanelOpen(!isRefinePanelOpen)} 
            className={`p-2 rounded transition-all border shadow-lg shrink-0 flex items-center justify-center ${isRefinePanelOpen ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.3)]' : 'bg-purple-900/20 text-purple-400 border-purple-900/50 hover:border-purple-500/50'}`}
            title="Trợ lý tinh chỉnh AI (Văn phong, Đối thoại, Giác quan)"
          >
            <span className="text-sm">✨</span>
          </button>

          <div className="h-4 w-px bg-gray-800 mx-1 shrink-0"></div>

          {/* Nút Xem Chú Giải (Help Button) */}
          <button 
            onClick={() => setShowLegendModal(true)} 
            className="p-2 rounded text-gray-500 hover:text-gray-300 transition-colors border border-gray-800 hover:border-gray-700 shrink-0 flex items-center justify-center"
            title="Xem chú giải chi tiết các nút"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
      </div>
      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-y-auto relative custom-scrollbar bg-gray-950 pb-20"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isGenerating && <div className="sticky top-0 left-0 right-0 z-[60] h-1 w-full bg-gray-900 overflow-hidden"><div className="absolute top-0 bottom-0 bg-primary-500 transition-all duration-300" style={{ width: `${generationProgress}%` }}></div></div>}
        <div className="max-w-3xl mx-auto py-6 px-4 md:py-16 md:px-8 min-h-screen">
          <input type="text" value={localTitle} onChange={handleTitleChange} className="w-full bg-transparent text-2xl md:text-4xl font-serif font-bold text-gray-100 mb-6 md:mb-8 outline-none border-b border-transparent focus:border-primary-500/20 pb-2" placeholder="Tiêu đề chương..." />
          <div className="relative text-base md:text-lg leading-relaxed font-serif"><textarea ref={textareaRef} value={localContent} onChange={handleContentChange} onKeyDown={handleKeyDown} onSelect={handleSelection} placeholder="Hành trình bắt đầu từ đây..." className={`w-full bg-transparent text-gray-300 focus:outline-none resize-none overflow-hidden p-0 border-none m-0 leading-[1.8] ${!isEditMode ? 'hidden' : 'block'}`} spellCheck={false} readOnly={isGenerating} />{!isEditMode && <div className="whitespace-pre-wrap text-gray-300 leading-[1.8]">{localContent}</div>}</div>
        </div>
      </div>
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
                        <button onClick={auditActiveChapter} disabled={isAuditingChapter} className="w-full py-4 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl text-[10px] font-black uppercase hover:bg-blue-600/30 transition-all flex items-center justify-center gap-2 shadow-xl">{isAuditingChapter ? <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span> : '🔍 Toàn văn phân tích'}</button>
                        {chapterAuditReport && (<div className="p-4 bg-blue-950/20 border border-blue-900/30 rounded-2xl animate-fadeIn"><h5 className="text-[9px] font-black text-blue-400 uppercase mb-2">Lời khuyên của AI:</h5><p className="text-[11px] text-gray-300 leading-relaxed italic">"{chapterAuditReport.pacingAnalysis || 'Đang chờ dữ liệu...'}"</p></div>)}
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
      <div className="bg-gray-900 border-t border-gray-800 p-2 px-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
              <div className="flex items-center gap-2"><span className="hidden xs:inline text-[9px] font-black text-gray-600 uppercase tracking-widest">Tiến độ:</span><span className="text-[10px] font-bold text-primary-400">{wordCount} / {activeChapter.wordGoal || 2000}</span><div className="w-16 md:w-24 h-1 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-primary-500 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div></div></div>
              
              <div className="flex items-center gap-1 px-2 border-l border-gray-800 ml-1">
                  <button 
                    onClick={() => prevChapter && selectChapter(prevChapter.id)} 
                    disabled={!prevChapter || isGenerating}
                    title="Chương trước"
                    className={`p-1.5 rounded transition-colors ${prevChapter && !isGenerating ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-700 cursor-not-allowed'}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => nextChapter && selectChapter(nextChapter.id)} 
                    disabled={!nextChapter || isGenerating}
                    title="Chương tiếp theo"
                    className={`p-1.5 rounded transition-colors ${nextChapter && !isGenerating ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-700 cursor-not-allowed'}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
              </div>
          </div>
          <div className="flex items-center gap-2 relative">
              {/* Tooltip detail panel */}
              {showTokenDetails && (
                  <div className="absolute bottom-12 right-0 bg-gray-900 border border-gray-700 rounded-2xl p-4 w-72 shadow-2xl z-50 text-xs animate-fadeIn space-y-3">
                      <h4 className="font-bold text-white border-b border-gray-800 pb-1 flex items-center justify-between">
                          <span>Hạn Mức Google Free API</span>
                          <span className="text-[8px] text-gray-500 uppercase tracking-widest font-normal">Google AI Studio</span>
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
                <div className="p-1.5 rounded bg-primary-900/20 text-primary-400 border border-primary-900/50 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-primary-400 text-[13px]">Chế độ Viết / Đọc</h4>
                  <p className="text-gray-400">Chuyển đổi giữa chế độ <span className="text-white font-medium">Viết</span> (soạn thảo trực tiếp) và <span className="text-white font-medium">Đọc</span> (không làm xuất hiện bàn phím ảo, tránh gõ nhầm khi đang thưởng thức).</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2 hover:bg-gray-800/30 rounded-xl transition-all">
                <div className="p-1.5 rounded bg-gray-800/50 text-gray-400 border border-gray-700 shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-white text-[13px]">AI Dịch sang Tiếng Việt</h4>
                  <p className="text-gray-400">Gọi AI dịch nghĩa toàn bộ nội dung của chương hiện tại sang tiếng Việt với văn phong mượt mà, lưu loát.</p>
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
                <div className="p-1.5 rounded bg-purple-900/20 text-purple-400 border border-purple-900/50 shrink-0">
                  <span className="text-xs">✨</span>
                </div>
                <div>
                  <h4 className="font-bold text-purple-400 text-[13px]">Trợ lý tinh chỉnh AI</h4>
                  <p className="text-gray-400">Kích hoạt bảng công cụ nâng cao: Tỉa từ ngữ mượt mà, kích hoạt ngũ quan, đổi đại từ nhân xưng, chuyển thì, sửa đổi theo chỉ dẫn tự chọn, học hỏi văn phong...</p>
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
    </div>
  );
};
