import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { CharacterList } from './CharacterList.tsx';
import { Chapter, ExtractionCategory } from '../types.ts';
import { SummaryViewModal } from './SummaryViewModal.tsx';
import { DeleteChapterModal } from './DeleteChapterModal.tsx';
import { TranslationsMenu } from './TranslationsMenu.tsx';
import { MergeChapterModal } from './MergeChapterModal.tsx';
import { InsertChapterModal } from './InsertChapterModal.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { getCachedWordCount } from '../utils/wordCount.ts';

interface ChapterListItemProps {
  chapter: Chapter;
  isActive: boolean;
  isOnlyChapter: boolean;
  isRenaming: boolean;
  onSelect: (id: string) => void;
  onReorder: (id: string, dir: 'up' | 'down') => void;
  onStartRename: (e: React.MouseEvent, id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onConfirmRename: () => void;
  onUpdateTimeSetting: (id: string, time: string) => void;
  onDeleteClick: (e: React.MouseEvent, chapter: Chapter) => void;
  onInsertClick?: (e: React.MouseEvent, chapter: Chapter) => void;
}

const ChapterListItem = React.memo<ChapterListItemProps>(({
  chapter,
  isActive,
  isOnlyChapter,
  isRenaming,
  onSelect,
  onReorder,
  onStartRename,
  onUpdateTitle,
  onConfirmRename,
  onUpdateTimeSetting,
  onDeleteClick,
  onInsertClick
}) => {
  const currentWords = getCachedWordCount(chapter.id, chapter.content, chapter.lastUpdated);
  const progress = Math.min(100, (currentWords / (chapter.wordGoal || 2000)) * 100);

  return (
    <div className={`group relative rounded-md transition-all ${isActive ? 'bg-gray-800 border-l-2 border-primary-500 shadow-lg' : 'hover:bg-gray-800/40'}`}>
      <div className="flex items-center">
        <div className="flex flex-col gap-1 pr-2 pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onReorder(chapter.id, 'up')} className="p-1 text-gray-600 hover:text-primary-400" title="Chuyển lên"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 15l7-7 7 7" strokeWidth={3} /></svg></button>
          <button onClick={() => onReorder(chapter.id, 'down')} className="p-1 text-gray-600 hover:text-primary-400" title="Chuyển xuống"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" strokeWidth={3} /></svg></button>
        </div>
        <div className="flex-1 py-3 pl-1 pr-2 overflow-hidden cursor-pointer" onClick={() => onSelect(chapter.id)}>
          {isRenaming ? (
            <input autoFocus className="w-full bg-gray-950 border border-primary-500/50 rounded px-1.5 py-0.5 text-sm text-white outline-none" value={chapter.title} onChange={(e) => onUpdateTitle(chapter.id, e.target.value)} onBlur={onConfirmRename} onKeyDown={(e) => e.key === 'Enter' && onConfirmRename()} onClick={(e) => e.stopPropagation()} />
          ) : (
            <div className="flex flex-col gap-1 min-w-0">
              <div className="text-[10px] font-bold truncate text-gray-400 group-hover:text-gray-200 flex items-center justify-between">
                <span className="truncate flex items-center gap-1">
                  <span className="truncate">{chapter.title}</span>
                  {(chapter.translatedContent || chapter.isTranslation || chapter.title.startsWith('[Việt Hóa]')) && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 font-semibold shrink-0" title="Đã có bản dịch">
                      Dịch
                    </span>
                  )}
                </span>
                <span className="text-[8px] font-black text-gray-600 shrink-0 ml-2">{currentWords.toLocaleString()} / {(chapter.wordGoal || 2000).toLocaleString()}</span>
              </div>
              <div className="w-full h-1 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                <div className={`h-full transition-all duration-500 ${progress >= 100 ? 'bg-emerald-500' : 'bg-primary-600'}`} style={{ width: `${progress}%` }}></div>
              </div>
              {isActive && (
                <div className="mt-1 flex items-center gap-1.5">
                  <svg className="w-3 h-3 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <input 
                    type="text" 
                    value={chapter.timeSetting || ""} 
                    onChange={(e) => onUpdateTimeSetting(chapter.id, e.target.value)} 
                    placeholder="Thiết lập thời gian (Vd: Sáng sớm)" 
                    className="w-full bg-transparent text-[9px] text-orange-300 placeholder-gray-600 outline-none border-b border-gray-700 focus:border-orange-500 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity pr-2 gap-0.5">
          {onInsertClick && (
            <button 
              type="button" 
              onClick={(e) => onInsertClick(e, chapter)} 
              className="p-1.5 text-gray-500 hover:text-emerald-400 rounded-md hover:bg-emerald-950/50 transition-colors" 
              title="Chèn chương trống sau chương này"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <button onClick={(e) => onStartRename(e, chapter.id)} className="p-1.5 text-gray-600 hover:text-primary-400 rounded-md hover:bg-gray-700" title="Đổi tên"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth={2}/></svg></button>
          {!isOnlyChapter && (
            <button onClick={(e) => onDeleteClick(e, chapter)} className="p-1.5 text-gray-600 hover:text-red-500 rounded-md hover:bg-red-900/20" title="Xóa"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth={2}/></svg></button>
          )}
        </div>
      </div>
    </div>
  );
});

interface Props {
    onOpenSettings: () => void;
    isOpen: boolean;    
    onClose: () => void; 
    onOpenPlotArc?: () => void;
    onOpenHelp: () => void;
    onOpenBilingualReview?: (chapterId?: string) => void;
    onOpenDriveSync?: () => void;
    onOpenIPhoneCompanion?: () => void;
}

export const Sidebar: React.FC<Props> = ({ onOpenSettings, isOpen, onClose, onOpenPlotArc, onOpenHelp, onOpenBilingualReview, onOpenDriveSync, onOpenIPhoneCompanion }) => {
  const { 
    story, activeChapterId, selectChapter, addChapter, deleteChapter, 
    userInstruction, setUserInstruction,
    targetWordCount, setTargetWordCount,
    generateContinue, isGenerating, isPlanning, isAuditing, auditStory,
    sendPlanningMessage, clearPlanningChat, updateStorySettings, updateChapterOutline,
    updateChapterTitle, updateChapterTimeSetting, reorderChapter, closeStory, 
    learnFromText, isSearchingWeb, webInspiration, toggleEvolutionLog, deleteEvolutionLog,
    toggleKnowledgeLog, deleteKnowledgeLog, fetchWebInspiration, ingestRawDocument,
    suggestNewChapter, isSuggestingChapter, suggestActiveChapterOutline, isGeneratingOutline,
    triggerSave, triggerLearn, isSavingManual, isLearning, importChaptersFromTxt, importChaptersFromEpub, exportStory, exportStoryEpub,
    mergeChapters, insertChapter
  } = useStory();
  
  const [tab, setTab] = useState<'chapters' | 'translations' | 'planning' | 'knowledge'>('chapters');
  const [planningSubTab, setPlanningSubTab] = useState<'blueprint' | 'arc'>('blueprint');
  const [knowledgeSubTab, setKnowledgeSubTab] = useState<'core' | 'characters' | 'directives' | 'ingest'>('core');
  const [viewingSummary, setViewingSummary] = useState<Chapter | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
  const [insertTargetChapterId, setInsertTargetChapterId] = useState<string | null>(null);
  const [insertPosition, setInsertPosition] = useState<'before' | 'after'>('after');
  const [planInput, setPlanInput] = useState('');
  const [rawTextInput, setRawTextInput] = useState('');
  const [webTopic, setWebTopic] = useState(''); 
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [chapterToDelete, setChapterToDelete] = useState<Chapter | null>(null);

  const handleOpenInsertModal = (chapterId?: string | null, position: 'before' | 'after' = 'after') => {
    setInsertTargetChapterId(chapterId || activeChapterId || (story?.chapters?.[0]?.id ?? null));
    setInsertPosition(position);
    setIsInsertModalOpen(true);
  };
  
  // Mobile Chat State
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [isDesktopChatOpen, setIsDesktopChatOpen] = useState(true);
  
  const [chatHeight, setChatHeight] = useState(380);
  const [isResizingChat, setIsResizingChat] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<ExtractionCategory[]>(['characters', 'world']);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const mobileChatEndRef = useRef<HTMLDivElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const chapterTxtInputRef = useRef<HTMLInputElement>(null);
  const sidebarFooterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current && tab === 'planning') chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [story?.planningChatHistory, isPlanning, tab, isDesktopChatOpen]);

  useEffect(() => {
    if (isMobileChatOpen && mobileChatEndRef.current) {
        mobileChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [story?.planningChatHistory, isMobileChatOpen, isPlanning]);

  const startResizingChat = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsResizingChat(true);
    document.body.style.cursor = 'row-resize';
  }, []);

  const stopResizingChat = useCallback(() => {
    setIsResizingChat(false);
    document.body.style.cursor = 'default';
  }, []);

  const resizeChat = useCallback((e: MouseEvent | TouchEvent) => {
    if (isResizingChat) {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const windowHeight = window.innerHeight;
      const footerHeight = sidebarFooterRef.current?.offsetHeight || 220;
      const newHeight = windowHeight - clientY - footerHeight;
      setChatHeight(Math.max(150, Math.min(windowHeight * 0.75, newHeight)));
    }
  }, [isResizingChat]);

  useEffect(() => {
    if (isResizingChat) {
        window.addEventListener('mousemove', resizeChat);
        window.addEventListener('mouseup', stopResizingChat);
        window.addEventListener('touchmove', resizeChat, { passive: false });
        window.addEventListener('touchend', stopResizingChat);
    }
    return () => {
      window.removeEventListener('mousemove', resizeChat);
      window.removeEventListener('mouseup', stopResizingChat);
      window.removeEventListener('touchmove', resizeChat);
      window.removeEventListener('touchend', stopResizingChat);
    };
  }, [isResizingChat, resizeChat, stopResizingChat]);

  if (!story) return null;

  const handlePlanningSend = async () => {
    if (!planInput.trim()) return;
    const msg = planInput;
    setPlanInput('');
    await sendPlanningMessage(msg);
  };

  const handleClearChat = async () => {
      await clearPlanningChat();
  };

  const applyToOutline = (text: string) => {
      if (activeChapterId) {
          updateChapterOutline(activeChapterId, text);
          alert("Đã cập nhật dàn ý chương!");
          if (isMobileChatOpen) setIsMobileChatOpen(false);
      }
  };

  const handleDiscussOutline = async () => {
    const activeChapter = story.chapters.find(c => c.id === activeChapterId);
    if (!activeChapter || !activeChapter.outline.trim()) {
        alert("Dàn ý đang trống, hãy nhập nội dung hoặc dùng AI gợi ý trước.");
        return;
    }
    const message = `Hãy phân tích, góp ý và mở rộng dàn ý chương "${activeChapter.title}" này cho tôi:\n\n${activeChapter.outline}`;
    if (window.innerWidth < 768) setIsMobileChatOpen(true);
    else setIsDesktopChatOpen(true);
    await sendPlanningMessage(message);
  };

  const handleQuickPrompt = async (prompt: string) => {
    if (isPlanning) return;
    if (window.innerWidth < 768) setIsMobileChatOpen(true);
    else setIsDesktopChatOpen(true);
    await sendPlanningMessage(prompt);
  };

  const handleRawTextLearn = async () => {
    if (!rawTextInput.trim() || isLearning) return;
    await learnFromText(rawTextInput, selectedCategories);
    setRawTextInput('');
  };

  const handleWebSearch = async () => {
    if (!webTopic.trim() || isSearchingWeb) return;
    await fetchWebInspiration(webTopic);
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        await ingestRawDocument(file, selectedCategories);
        e.target.value = '';
    }
  };

  const handleChapterTxtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.name.toLowerCase().endsWith('.epub')) {
            await importChaptersFromEpub(file);
        } else {
            await importChaptersFromTxt(file);
        }
        e.target.value = '';
    }
  };

  const toggleCategory = (cat: ExtractionCategory) => {
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const handleStartRename = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRenamingId(id);
  };

  const handleConfirmRename = () => setRenamingId(null);
  
  const handleDeleteClick = (e: React.MouseEvent, chapter: Chapter) => {
      e.stopPropagation();
      setChapterToDelete(chapter);
  };

  const handleConfirmDelete = async () => {
      if (chapterToDelete) {
          await deleteChapter(chapterToDelete.id);
          setChapterToDelete(null);
      }
  };

  const activeChapter = story?.chapters.find(c => c.id === activeChapterId);
  const translatedCount = story ? story.chapters.filter(c => !!c.translatedContent && c.translatedContent.trim().length > 0).length : 0;
  
  const [chapterSearch, setChapterSearch] = useState('');
  const [chapterPage, setChapterPage] = useState(0);
  const CHAPTERS_PER_PAGE = 50;

  const sortedChapters = useMemo(() => {
    if (!story) return [];
    return [...story.chapters]
      .filter(c => !c.isTranslation && !c.title.startsWith('[Việt Hóa]'))
      .sort((a, b) => a.order - b.order);
  }, [story?.chapters]);

  const filteredChapters = useMemo(() => {
    if (!chapterSearch.trim()) return sortedChapters;
    const q = chapterSearch.toLowerCase().trim();
    return sortedChapters.filter((c, idx) => 
      c.title.toLowerCase().includes(q) || 
      `chương ${idx + 1}`.includes(q) || 
      `chuong ${idx + 1}`.includes(q) || 
      `c${idx + 1}`.includes(q) ||
      `c ${idx + 1}`.includes(q)
    );
  }, [sortedChapters, chapterSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredChapters.length / CHAPTERS_PER_PAGE));

  // Auto switch page to contain activeChapterId when selecting chapters
  useEffect(() => {
    if (!activeChapterId || chapterSearch.trim()) return;
    const activeIdx = sortedChapters.findIndex(c => c.id === activeChapterId);
    if (activeIdx !== -1) {
      const targetPage = Math.floor(activeIdx / CHAPTERS_PER_PAGE);
      setChapterPage(prev => (prev !== targetPage ? targetPage : prev));
    }
  }, [activeChapterId, sortedChapters, chapterSearch]);

  const displayedChapters = useMemo(() => {
    if (chapterSearch.trim()) {
      return filteredChapters.slice(0, 100);
    }
    const start = chapterPage * CHAPTERS_PER_PAGE;
    return sortedChapters.slice(start, start + CHAPTERS_PER_PAGE);
  }, [chapterSearch, filteredChapters, sortedChapters, chapterPage]);

  const containerClass = `fixed inset-y-0 left-0 z-50 w-80 bg-gray-900 border-r border-gray-800 glass-panel shadow-2xl transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col h-[100dvh] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;

  const footerClass = "shrink-0 border-t border-gray-800 bg-gray-900/95 backdrop-blur z-50 p-4 space-y-4"; 

  return (
    <div className={containerClass}>
      
      {/* HEADER */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0">
         <div className="flex flex-col overflow-hidden text-left flex-1 cursor-pointer group" onClick={onOpenSettings}>
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary-400 to-purple-400 bg-clip-text text-transparent truncate group-hover:from-primary-300 group-hover:to-purple-300 transition-all">Aetheria</h1>
            <p className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-tighter truncate flex items-center gap-1">{story.title}</p>
         </div>
         <div className="flex items-center gap-1">
             <PWAInstallButton compact />
             {onOpenIPhoneCompanion && (
               <button onClick={onOpenIPhoneCompanion} className="p-2 text-gray-500 hover:text-emerald-400 transition-colors" title="Chạy ngầm iPhone & Thông báo iOS">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
               </button>
             )}
             {onOpenDriveSync && (
               <button onClick={onOpenDriveSync} className="p-2 text-gray-500 hover:text-sky-400 transition-colors" title="Đồng bộ Google Drive">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
               </button>
             )}
             <button onClick={onOpenHelp} className="p-2 text-gray-500 hover:text-emerald-400 transition-colors" title="Học Viện Aetheria">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </button>
             <button onClick={onOpenSettings} className="p-2 text-gray-500 hover:text-primary-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             </button>
             <button onClick={onClose} className="md:hidden p-2 text-gray-500 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
             <button onClick={closeStory} className="hidden md:block p-2 text-gray-500 hover:text-white transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg></button>
         </div>
      </div>

      {/* TABS */}
      <div className="flex border-b border-gray-800 shrink-0">
        <button onClick={() => setTab('chapters')} className={`flex-1 py-3 text-[9px] font-bold uppercase transition-all ${tab === 'chapters' ? 'text-primary-400 border-b-2 border-primary-500 bg-primary-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Chương</button>
        <button onClick={() => setTab('translations')} className={`flex-1 py-3 text-[9px] font-bold uppercase transition-all ${tab === 'translations' ? 'text-emerald-400 border-b-2 border-emerald-500 bg-emerald-500/5' : 'text-gray-500 hover:text-gray-300'}`}>
          <span className="flex items-center justify-center gap-1">
            <span>Bản Dịch</span>
            {translatedCount > 0 && (
              <span className="text-[8px] px-1 py-0.2 bg-emerald-950 text-emerald-300 rounded border border-emerald-800 font-semibold">{translatedCount}</span>
            )}
          </span>
        </button>
        <button onClick={() => setTab('planning')} className={`flex-1 py-3 text-[9px] font-bold uppercase transition-all ${tab === 'planning' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Kế hoạch</button>
        <button onClick={() => setTab('knowledge')} className={`flex-1 py-3 text-[9px] font-bold uppercase transition-all ${tab === 'knowledge' ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Kho</button>
      </div>

      {/* CONTENT AREA */}
      <div className={`flex-1 flex flex-col ${tab === 'planning' && planningSubTab === 'blueprint' ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'} bg-gray-900/50`}>
        {tab === 'translations' && (
          <TranslationsMenu onOpenBilingualReview={(chId) => onOpenBilingualReview?.(chId)} />
        )}
        {tab === 'chapters' && (
          <div className={`p-2 space-y-1 pb-4`}>
            <div className="px-2 py-3 mb-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={auditStory} disabled={isAuditing} className="w-full py-2 bg-primary-600/10 hover:bg-primary-600/20 text-primary-400 border border-primary-500/30 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-1 group">
                      {isAuditing ? <span className="w-3 h-3 border-2 border-primary-400 border-t-transparent rounded-full animate-spin"></span> : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                      Kiểm toán
                    </button>
                    <button onClick={suggestNewChapter} disabled={isSuggestingChapter} className="w-full py-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-1">
                      {isSuggestingChapter ? <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span> : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                      Gợi ý chương
                    </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                    <button onClick={triggerSave} disabled={isSavingManual} className={`w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-1 border ${isSavingManual ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'}`}>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      {isSavingManual ? 'Đã lưu' : 'Lưu tay'}
                    </button>
                    <button onClick={() => exportStoryEpub(story.id)} className="w-full py-2 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-1" title="Xuất sách điện tử EPUB (chuẩn Kindle, Apple Books, Kobo)">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      EPUB
                    </button>
                    <button onClick={() => exportStory(story.id)} className="w-full py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-1" title="Xuất file sao lưu JSON">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Sao lưu
                    </button>
                    <button onClick={triggerLearn} disabled={isLearning} className="w-full py-2 bg-orange-600/10 hover:bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-1">
                      {isLearning ? <span className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></span> : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                      Học văn
                    </button>
                </div>
            </div>
            {/* THANH TÌM KIẾM & PHÂN TRANG KHI TRUYỆN DÀI (NHIỀU HƠN 50 CHƯƠNG) */}
            {sortedChapters.length > 50 && (
              <div className="px-2 mb-2 space-y-1.5">
                <div className="relative">
                  <input
                    type="text"
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    placeholder="Tìm theo số hoặc tên chương..."
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-2.5 py-1 pl-7 text-[11px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-primary-500/60"
                  />
                  <svg className="w-3 h-3 text-gray-500 absolute left-2 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {chapterSearch && (
                    <button onClick={() => setChapterSearch('')} className="absolute right-2 top-1.5 text-gray-500 hover:text-gray-300 text-[10px]">✕</button>
                  )}
                </div>

                {!chapterSearch.trim() && totalPages > 1 && (
                  <div className="flex items-center justify-between gap-1.5 bg-gray-950/80 p-1 rounded-lg border border-gray-800/80 text-[10px]">
                    <button
                      onClick={() => setChapterPage(p => Math.max(0, p - 1))}
                      disabled={chapterPage === 0}
                      className="px-2 py-0.5 rounded bg-gray-900 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 font-bold"
                      title="Trang trước"
                    >
                      ◄
                    </button>
                    <select
                      value={chapterPage}
                      onChange={(e) => setChapterPage(Number(e.target.value))}
                      className="bg-transparent text-gray-300 text-[10px] font-medium outline-none cursor-pointer text-center flex-1"
                    >
                      {Array.from({ length: totalPages }, (_, i) => {
                        const start = i * CHAPTERS_PER_PAGE + 1;
                        const end = Math.min((i + 1) * CHAPTERS_PER_PAGE, sortedChapters.length);
                        return (
                          <option key={i} value={i} className="bg-gray-900 text-gray-200">
                            Chương {start} - {end} ({sortedChapters.length})
                          </option>
                        );
                      })}
                    </select>
                    <button
                      onClick={() => setChapterPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={chapterPage >= totalPages - 1}
                      className="px-2 py-0.5 rounded bg-gray-900 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-gray-400 font-bold"
                      title="Trang sau"
                    >
                      ►
                    </button>
                  </div>
                )}
                {chapterSearch.trim() && (
                  <div className="text-[9px] text-gray-500 px-1">
                    Tìm thấy {filteredChapters.length} chương phù hợp
                  </div>
                )}
              </div>
            )}

            {displayedChapters.length === 0 ? (
              <div className="text-center py-6 text-xs text-gray-500">
                Không tìm thấy chương nào
              </div>
            ) : (
              displayedChapters.map((chapter, idx) => (
                <React.Fragment key={chapter.id}>
                  {idx === 0 && (
                    <div className="group/insert relative h-3.5 -my-1 flex items-center justify-center opacity-0 hover:opacity-100 transition-all z-10">
                      <div className="absolute inset-x-3 h-px bg-emerald-500/30 group-hover/insert:bg-emerald-500/60 transition-colors"></div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenInsertModal(chapter.id, 'before');
                        }}
                        className="relative px-2 py-0.5 rounded-full bg-gray-950 border border-emerald-500/40 text-[9px] font-bold text-emerald-400 hover:bg-emerald-950 hover:border-emerald-300 shadow-md flex items-center gap-1 transition-transform hover:scale-105 cursor-pointer"
                        title="Chèn chương trống trước chương đầu tiên"
                      >
                        <span>+ Chèn chương đầu</span>
                      </button>
                    </div>
                  )}
                  <ChapterListItem
                    chapter={chapter}
                    isActive={activeChapterId === chapter.id}
                    isOnlyChapter={sortedChapters.length <= 1}
                    isRenaming={renamingId === chapter.id}
                    onSelect={selectChapter}
                    onReorder={reorderChapter}
                    onStartRename={handleStartRename}
                    onUpdateTitle={updateChapterTitle}
                    onConfirmRename={handleConfirmRename}
                    onUpdateTimeSetting={updateChapterTimeSetting}
                    onDeleteClick={handleDeleteClick}
                    onInsertClick={(e) => {
                      e.stopPropagation();
                      handleOpenInsertModal(chapter.id, 'after');
                    }}
                  />
                  <div className="group/insert relative h-3.5 -my-1 flex items-center justify-center opacity-0 hover:opacity-100 transition-all z-10">
                    <div className="absolute inset-x-3 h-px bg-emerald-500/30 group-hover/insert:bg-emerald-500/60 transition-colors"></div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenInsertModal(chapter.id, 'after');
                      }}
                      className="relative px-2 py-0.5 rounded-full bg-gray-950 border border-emerald-500/40 text-[9px] font-bold text-emerald-400 hover:bg-emerald-950 hover:border-emerald-300 shadow-md flex items-center gap-1 transition-transform hover:scale-105 cursor-pointer"
                      title={`Chèn chương trống sau ${chapter.title}`}
                    >
                      <span>+ Chèn chương trống ở đây</span>
                    </button>
                  </div>
                </React.Fragment>
              ))
            )}
            <div className="flex gap-1.5 mt-2">
                <button 
                  onClick={() => addChapter()} 
                  className="flex-1 py-2.5 border border-dashed border-gray-700 rounded-xl text-gray-500 text-[10px] font-black uppercase hover:border-primary-500 hover:text-primary-400 transition-all"
                  title="Thêm chương mới vào cuối tác phẩm"
                >
                  + Cuối
                </button>
                <button 
                  onClick={() => handleOpenInsertModal(activeChapterId || sortedChapters[sortedChapters.length - 1]?.id, 'after')} 
                  className="flex-1 py-2.5 border border-dashed border-emerald-900/60 bg-emerald-950/20 rounded-xl text-emerald-400 hover:text-emerald-300 hover:border-emerald-500 text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                  title="Chèn chương trống vào bất kỳ vị trí nào giữa các chương"
                >
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Chèn giữa</span>
                </button>
                <button 
                  onClick={() => setIsMergeModalOpen(true)} 
                  disabled={(story?.chapters.length || 0) < 2}
                  className="px-2.5 py-2.5 border border-dashed border-gray-700 hover:border-indigo-500 text-gray-400 hover:text-indigo-400 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1 disabled:opacity-40" 
                  title="Gộp các chương hoặc nối các phần nhỏ thành 1 chương"
                >
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span>Gộp</span>
                </button>
                <input type="file" ref={chapterTxtInputRef} className="hidden" accept=".txt,.epub,application/epub+zip" onChange={handleChapterTxtUpload} />
                <button onClick={() => chapterTxtInputRef.current?.click()} className="px-2.5 py-2.5 border border-dashed border-gray-700 rounded-xl text-gray-500 text-[10px] font-black uppercase hover:border-emerald-500 hover:text-emerald-400 transition-all flex items-center justify-center" title="Tải chương từ file TXT hoặc EPUB">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </button>
            </div>
          </div>
        )}

        {tab === 'planning' && (
          <div className={`flex flex-col h-full ${planningSubTab === 'blueprint' ? 'overflow-hidden' : `overflow-y-auto pb-4`}`}>
            <div className="flex border-b border-gray-800 shrink-0 bg-gray-950/30">
                <button onClick={() => setPlanningSubTab('blueprint')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${planningSubTab === 'blueprint' ? 'text-emerald-400 bg-emerald-950/10 border-b-2 border-emerald-500' : 'text-gray-500 hover:text-gray-300'}`}>Blueprint</button>
                <button onClick={() => setPlanningSubTab('arc')} className={`flex-1 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${planningSubTab === 'arc' ? 'text-primary-400 bg-primary-950/10 border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-300'}`}>Mạch truyện</button>
                {planningSubTab === 'blueprint' && (
                    <button onClick={() => setIsDesktopChatOpen(!isDesktopChatOpen)} className="hidden md:flex items-center px-3 border-l border-gray-800 text-gray-500 hover:text-white hover:bg-gray-800 transition-colors" title={isDesktopChatOpen ? "Ẩn Chat" : "Hiện Chat"}><svg className={`w-4 h-4 transition-transform ${isDesktopChatOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
                )}
            </div>
            
            {planningSubTab === 'blueprint' ? (
                <div className="flex-col h-full flex overflow-hidden">
                    <div className={`flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 transition-all duration-300 ${!isDesktopChatOpen ? 'flex-grow' : ''}`}>
                        <div className="group">
                            <label className="block text-[9px] font-black text-gray-500 group-hover:text-emerald-500 transition-colors uppercase mb-2 tracking-widest flex items-center gap-2">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                Story Blueprint
                            </label>
                            <textarea className="w-full h-28 bg-gray-900/50 border border-gray-800 rounded-xl p-3 text-xs text-gray-300 focus:border-emerald-500 outline-none resize-none transition-all shadow-inner" value={story.planning} onChange={(e) => updateStorySettings({ planning: e.target.value })} placeholder="Kế hoạch tổng thể của toàn bộ tác phẩm..." />
                        </div>
                        
                        {activeChapter && (
                            <div className="space-y-3 animate-fadeIn">
                                    <label className="block text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13" /></svg>
                                        Dàn ý: {activeChapter.title}
                                    </label>
                                    <div className="relative group">
                                        <textarea className={`w-full bg-gray-950 border border-emerald-900/20 rounded-2xl p-4 text-[11px] text-gray-200 focus:border-emerald-500 outline-none resize-none transition-all shadow-xl font-serif leading-relaxed ${isDesktopChatOpen ? 'h-48' : 'h-96'}`} value={activeChapter.outline || ''} onChange={(e) => updateChapterOutline(activeChapter.id, e.target.value)} placeholder="Chi tiết các tình tiết diễn ra trong chương này..." />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <button onClick={() => suggestActiveChapterOutline()} disabled={isGeneratingOutline} className="py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
                                            {isGeneratingOutline ? <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                            AI Suggest
                                        </button>
                                        <button onClick={handleDiscussOutline} disabled={isPlanning} className="py-2.5 bg-primary-600/10 hover:bg-primary-600/20 text-primary-400 border border-primary-500/30 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                            Discuss
                                        </button>
                                    </div>
                            </div>
                        )}
                        
                        <button onClick={() => setIsMobileChatOpen(true)} className="md:hidden w-full py-4 bg-gray-800 border border-gray-700 rounded-2xl text-gray-300 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95">
                            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            Enter Strategist Command
                        </button>
                    </div>

                    {isDesktopChatOpen && (
                        <div className="hidden md:flex shrink-0 flex-col bg-gray-950/60 border-t border-gray-800 relative z-20 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]" style={{ height: `${chatHeight}px` }}>
                            <div onMouseDown={startResizingChat} className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-50 group">
                                <div className="w-12 h-1 bg-gray-800 rounded-full mx-auto mt-0.5 group-hover:bg-primary-500 transition-colors"></div>
                            </div>
                            
                            <div className="flex-1 p-4 flex flex-col min-h-0 bg-gradient-to-b from-gray-950/20 to-gray-900/40">
                                <div className="flex justify-between items-center mb-3 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Strategist War Room</span>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={handleClearChat} className="text-[9px] font-black text-purple-400 hover:text-purple-300 uppercase tracking-tighter transition-colors flex items-center gap-1.5 bg-purple-900/10 px-2 py-1 rounded border border-purple-500/20">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                            Mới
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto space-y-4 mb-4 custom-scrollbar pr-1">
                                    {story.planningChatHistory?.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center text-center opacity-30 space-y-3 p-6">
                                            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                            <p className="text-[10px] font-black uppercase tracking-widest">Thảo luận chiến thuật mới</p>
                                        </div>
                                    )}
                                    
                                    {story.planningChatHistory?.map((msg, i) => (
                                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start animate-fadeIn'}`}>
                                            <div className={`max-w-[90%] p-3 rounded-2xl text-[11px] leading-relaxed border shadow-sm ${msg.role === 'user' ? 'bg-emerald-950/20 text-emerald-100 border-emerald-500/20 rounded-br-none' : 'bg-gray-850/90 text-gray-300 border-gray-700 rounded-bl-none font-serif italic'}`}>
                                                {msg.parts[0]?.text?.replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '').trim() || ''}
                                            </div>
                                        </div>
                                    ))}
                                    {isPlanning && (
                                        <div className="flex justify-start">
                                            <div className="bg-gray-800 p-3 rounded-2xl rounded-bl-none border border-gray-700 flex gap-2">
                                                <div className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce"></div>
                                                <div className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                                <div className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                                
                                <div className="space-y-3 shrink-0">
                                    <div className="relative group">
                                        <input type="text" value={planInput} onChange={(e) => setPlanInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePlanningSend()} className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-4 pr-12 py-3 text-xs text-white outline-none focus:border-emerald-500 transition-all shadow-inner placeholder:text-gray-700" placeholder="Thảo luận chiến thuật cốt truyện..." />
                                        <button onClick={handlePlanningSend} disabled={!planInput.trim() || isPlanning} className={`absolute right-2 top-1.5 bottom-1.5 px-3 rounded-lg transition-all ${planInput.trim() && !isPlanning ? 'bg-emerald-600 text-white shadow-lg' : 'bg-gray-800 text-gray-600'}`}>
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 5l7 7-7 7M5 5l7 7-7 7" strokeWidth={2.5} /></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-4 space-y-6 animate-fadeIn pb-20">
                    <div className="bg-emerald-950/10 border border-emerald-900/20 p-4 rounded-2xl">
                        <h4 className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                             Plot Arc Dashboard
                        </h4>
                        <button 
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onOpenPlotArc?.();
                            }} 
                            className="w-full py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-emerald-500 transition-all active:scale-95"
                        >
                            Analyze Story Arc
                        </button>
                    </div>
                    <div className="space-y-0 relative">
                        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-800 z-0"></div>
                        {sortedChapters.slice(0, 40).map((ch) => (
                            <div key={ch.id} className={`relative pl-8 pb-8 last:pb-0 transition-all group ${activeChapterId === ch.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                                <div className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 z-10 transition-all flex items-center justify-center ${activeChapterId === ch.id ? 'bg-emerald-500 border-white shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-gray-900 border-gray-700 group-hover:border-emerald-500/50'}`}>
                                    {activeChapterId === ch.id && <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>}
                                </div>
                                <div className={`p-4 rounded-2xl border transition-all cursor-pointer ${activeChapterId === ch.id ? 'bg-gray-800 border-emerald-500/30 shadow-xl' : 'bg-gray-900/40 border-gray-800 hover:border-gray-700'}`} onClick={() => selectChapter(ch.id)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <h5 className={`text-[9px] font-black uppercase tracking-widest ${activeChapterId === ch.id ? 'text-emerald-400' : 'text-gray-500'}`}>{ch.title}</h5>
                                        <span className="text-[8px] font-bold text-gray-700">{getCachedWordCount(ch.id, ch.content, ch.lastUpdated).toLocaleString()} từ</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 leading-relaxed font-serif italic line-clamp-3">{ch.summary || "Chưa phân tích."}</p>
                                </div>
                            </div>
                        ))}
                        {sortedChapters.length > 40 && (
                            <div className="pt-2 pl-8">
                                <button
                                    onClick={() => onOpenPlotArc?.()}
                                    className="w-full py-2 bg-gray-950 hover:bg-gray-800 text-emerald-400 border border-emerald-900/40 rounded-xl text-[10px] font-bold transition-all shadow-sm"
                                >
                                    Xem toàn bộ {sortedChapters.length} chương trong Mạch truyện →
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
          </div>
        )}

        {tab === 'knowledge' && (
          <div className={`flex flex-col h-full overflow-hidden pb-4`}>
            <div className="flex border-b border-gray-800 shrink-0 overflow-x-auto custom-scrollbar bg-gray-950/50">
                <button onClick={() => setKnowledgeSubTab('core')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-tighter transition-all ${knowledgeSubTab === 'core' ? 'text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-purple-400 to-emerald-400 bg-gray-900 border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>Lõi Aether</button>
                <button onClick={() => setKnowledgeSubTab('characters')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-tighter transition-all ${knowledgeSubTab === 'characters' ? 'text-primary-400 bg-primary-950/20 border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-300'}`}>Thực Thể</button>
                <button onClick={() => setKnowledgeSubTab('directives')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-tighter transition-all ${knowledgeSubTab === 'directives' ? 'text-red-400 bg-red-950/20 border-b-2 border-red-500' : 'text-gray-500 hover:text-gray-300'}`}>Chỉ Thị</button>
                <button onClick={() => setKnowledgeSubTab('ingest')} className={`flex-1 min-w-[80px] py-3 text-[9px] font-black uppercase tracking-tighter transition-all ${knowledgeSubTab === 'ingest' ? 'text-purple-400 bg-purple-950/20 border-b-2 border-purple-500' : 'text-gray-500 hover:text-gray-300'}`}>Nạp</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {knowledgeSubTab === 'core' && (
                    <div className="p-2 space-y-2 animate-fadeIn">
                        <div className="bg-gray-900/80 border border-pink-900/30 rounded-2xl overflow-hidden shadow-lg">
                            <div className="p-3 bg-pink-950/20 border-b border-pink-900/20 flex items-center gap-2">
                                <div className="p-1 bg-pink-500/10 rounded"><svg className="w-3.5 h-3.5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 1.43l-1.004.823a2 2 0 01-2.31 0l-1.004-.823a6 6 0 00-3.86-1.43l-2.387.477a2 2 0 00-1.022.547l-1.004 1.255a2 2 0 00-.32 1.637l1.004 5.023a2 2 0 001.962 1.608h15.688a2 2 0 001.962-1.608l1.004-5.023a2 2 0 00-.32-1.637l-1.004-1.255zM12 2v10m0 0l3-3m-3 3l-3-3" /></svg></div>
                                <h3 className="text-[9px] font-black text-pink-400 uppercase tracking-widest">Hệ Gen Văn Chương</h3>
                            </div>
                            {story.writingDNA ? (
                                <div className="p-4 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><span className="text-[8px] font-black text-pink-500/70 uppercase block mb-1">Giọng kể</span><p className="text-xs text-gray-200 font-serif italic">"{story.writingDNA.narrativeVoice}"</p></div>
                                        <div><span className="text-[8px] font-black text-pink-500/70 uppercase block mb-1">Sắc thái</span><p className="text-xs text-gray-300">{story.writingDNA.emotionalTone}</p></div>
                                    </div>
                                    <button onClick={() => {if(confirm("Tẩy tủy Hồn Văn?")) updateStorySettings({writingDNA: undefined})}} className="w-full py-2 border border-dashed border-gray-800 text-[9px] text-gray-600 font-black uppercase hover:text-red-500 transition-colors">Thiết lập lại</button>
                                </div>
                            ) : (
                                <div className="p-6 text-center">
                                    <p className="text-[10px] text-gray-500 italic mb-2">Chưa có dữ liệu Hồn Văn.</p>
                                    <button onClick={() => setKnowledgeSubTab('ingest')} className="text-[9px] text-pink-400 underline decoration-dashed underline-offset-4 font-bold uppercase">Nạp để chiết xuất</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {knowledgeSubTab === 'characters' && <CharacterList characters={story.characters} />}
                
                {knowledgeSubTab === 'directives' && (
                    <div className="p-4 space-y-4 animate-fadeIn">
                        <div className="p-4 bg-red-900/10 border border-red-500/20 rounded-xl">
                            <h4 className="text-[9px] font-black text-red-400 uppercase mb-2 flex items-center gap-2">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                Chỉ thị Bền vững (Persistent Directives)
                            </h4>
                            <p className="text-[10px] text-gray-400 italic leading-relaxed">
                                Những mệnh lệnh này sẽ được AI ghi nhớ và áp dụng cho MỌI lần sinh văn bản. Dùng để duy trì văn phong hoặc quy tắc cốt lõi.
                            </p>
                        </div>
                        <textarea 
                            className="w-full h-80 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-xs text-white font-mono leading-relaxed outline-none resize-none focus:border-red-500 transition-all shadow-inner custom-scrollbar" 
                            placeholder="- Luôn miêu tả mùi hương trong mọi cảnh.\n- Không bao giờ cho nhân vật chính khóc.\n- Giữ giọng văn lạnh lùng, khách quan."
                            value={story.persistentDirectives || ""} 
                            onChange={(e) => updateStorySettings({ persistentDirectives: e.target.value })} 
                        />
                    </div>
                )}

                {knowledgeSubTab === 'ingest' && (
                    <div className="p-4 space-y-6 animate-fadeIn">
                        <div className="space-y-3">
                            <label className="text-[9px] font-black text-purple-400 uppercase tracking-widest block">Nạp Văn Bản Mẫu (Raw Text)</label>
                            <div className="flex flex-wrap gap-2 mb-2">
                                {(['characters', 'world', 'mechanics'] as ExtractionCategory[]).map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => toggleCategory(cat)}
                                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all border ${selectedCategories.includes(cat) ? 'bg-purple-600 text-white border-purple-500' : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-600'}`}
                                    >
                                        {cat === 'characters' ? 'Nhân vật' : cat === 'world' ? 'Bối cảnh' : 'Cơ chế'}
                                    </button>
                                ))}
                            </div>
                            <textarea 
                                className="w-full h-40 bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs text-white outline-none focus:border-purple-500 transition-all placeholder:text-gray-700" 
                                placeholder="Dán đoạn văn mẫu, thông tin bối cảnh hoặc ghi chú vào đây để AI học..."
                                value={rawTextInput}
                                onChange={(e) => setRawTextInput(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button onClick={handleRawTextLearn} disabled={isLearning || !rawTextInput.trim()} className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2">
                                    {isLearning ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 1.43l-1.004.823a2 2 0 01-2.31 0l-1.004-.823a6 6 0 00-3.86-1.43l-2.387.477a2 2 0 00-1.022.547l-1.004 1.255a2 2 0 00-.32 1.637l1.004 5.023a2 2 0 001.962 1.608h15.688a2 2 0 001.962-1.608l1.004-5.023a2 2 0 00-.32-1.637l-1.004-1.255zM12 2v10m0 0l3-3m-3 3l-3-3" /></svg>}
                                    Phân tích & Trích xuất
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-gray-800">
                            <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Nạp Tài Liệu (File)</label>
                            <div className="relative group">
                                <div className="flex items-center justify-center w-full">
                                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-800 border-dashed rounded-2xl cursor-pointer bg-gray-900/50 hover:bg-gray-800 hover:border-blue-500 transition-all group-hover:border-blue-500/50">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <svg className="w-8 h-8 mb-3 text-gray-500 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                            <p className="mb-2 text-[10px] text-gray-500"><span className="font-bold text-blue-400">Click để tải lên</span> hoặc kéo thả</p>
                                            <p className="text-[8px] text-gray-600">TXT, EPUB, MD, JSON (Max 15MB)</p>
                                        </div>
                                        <input type="file" className="hidden" ref={docInputRef} onChange={handleDocUpload} accept=".txt,.epub,.md,.json,application/epub+zip" />
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-gray-800">
                            <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest block">Web Research</label>
                            <div className="flex gap-2">
                                <input type="text" value={webTopic} onChange={(e) => setWebTopic(e.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-orange-500" placeholder="Chủ đề cần tìm..." />
                                <button onClick={handleWebSearch} disabled={isSearchingWeb || !webTopic.trim()} className="px-4 py-2 bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded-xl hover:bg-orange-600 hover:text-white transition-all">
                                    {isSearchingWeb ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
                                </button>
                            </div>
                        </div>
                        
                        {webInspiration && (
                            <div className="p-3 bg-gray-800 rounded-xl border border-gray-700 animate-fadeIn cursor-pointer hover:border-orange-500/50 transition-all" onClick={() => fetchWebInspiration()}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[9px] font-black text-orange-400 uppercase">Kết quả tìm kiếm</span>
                                    <span className="text-[8px] text-gray-500">{webInspiration.sources.length} nguồn</span>
                                </div>
                                <p className="text-[10px] text-gray-400 line-clamp-2">{webInspiration.insights}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div ref={sidebarFooterRef} className={footerClass}>
            <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-primary-400 uppercase tracking-widest flex items-center gap-2">Mục tiêu độ dài</label>
                    <span className="text-[10px] font-mono font-bold text-white bg-gray-800 px-2 py-0.5 rounded border border-white/5">{targetWordCount} từ</span>
                </div>
                <input type="range" min="500" max="5000" step="100" value={targetWordCount} onChange={(e) => setTargetWordCount(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary-500 transition-all hover:accent-primary-400" />
            </div>

            <textarea value={userInstruction} onChange={(e) => setUserInstruction(e.target.value)} placeholder="Chỉ đạo nóng..." className="w-full bg-black/40 border border-gray-700 rounded-xl p-3 text-xs text-white h-20 focus:border-primary-500 outline-none resize-none" />
            
            <button onClick={() => generateContinue('append')} disabled={isGenerating} className={`w-full py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${isGenerating ? 'bg-gray-800 opacity-50' : 'bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500'}`}>
                {isGenerating ? (<><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>AI Đang dệt mộng...</>) : (<><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Kiến tạo thực tại</>)}
            </button>
      </div>
      
      {/* MOBILE WAR ROOM OVERLAY */}
      {isMobileChatOpen && (
        <div className="fixed inset-0 z-[200] bg-gray-950 flex flex-col h-[100dvh] animate-fadeIn md:hidden">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg"><svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div>
                    <h3 className="font-bold text-white tracking-wide">Chiến Nhẫn (War Room)</h3>
                </div>
                <button onClick={() => setIsMobileChatOpen(false)} className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-full"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-950">
                {story.planningChatHistory?.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] p-4 rounded-2xl text-sm border ${msg.role === 'user' ? 'bg-purple-900/20 border-purple-500/30 text-purple-100 rounded-br-none' : 'bg-gray-800 border-gray-700 text-gray-200 rounded-bl-none'}`}>
                            {msg.parts?.[0]?.text?.replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '').trim() || ''}
                        </div>
                    </div>
                ))}
                <div ref={mobileChatEndRef} className="h-4" />
            </div>
            <div className="p-3 bg-gray-900 border-t border-gray-800 shrink-0 pb-safe">
                <div className="relative flex items-end gap-2">
                    <input type="text" autoFocus value={planInput} onChange={(e) => setPlanInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePlanningSend()} className="w-full bg-black/40 border border-gray-700 rounded-xl px-4 py-3 text-white outline-none focus:border-purple-500" placeholder="Thảo luận..." />
                    <button onClick={handlePlanningSend} disabled={!planInput.trim()} className={`p-3 rounded-xl transition-all ${planInput.trim() ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-500'}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
                </div>
            </div>
        </div>
      )}

      <SummaryViewModal isOpen={!!viewingSummary} onClose={() => setViewingSummary(null)} title={viewingSummary?.title || ""} summary={viewingSummary?.summary || ""} chapterId={viewingSummary?.id} />
      <DeleteChapterModal isOpen={!!chapterToDelete} onClose={() => setChapterToDelete(null)} onConfirm={handleConfirmDelete} chapterTitle={chapterToDelete?.title || ""} />
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
        initialTargetChapterId={insertTargetChapterId}
        initialPosition={insertPosition}
        onInsert={insertChapter}
      />
    </div>
  );
};