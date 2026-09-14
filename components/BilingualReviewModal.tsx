import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { Chapter } from '../types.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultChapterId?: string;
}

export const BilingualReviewModal: React.FC<Props> = ({ isOpen, onClose, defaultChapterId }) => {
  const { story, activeChapterId, updateChapterContent, selectChapter, bumpEditorSyncToken } = useStory();

  const [leftChapterId, setLeftChapterId] = useState<string>('');
  const [rightChapterId, setRightChapterId] = useState<string>('');
  const [customRawText, setCustomRawText] = useState<string>('');
  const [isUsingCustomRaw, setIsUsingCustomRaw] = useState(false);
  const [rightContent, setRightContent] = useState<string>('');
  const [isSaved, setIsSaved] = useState(true);
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [isSyncScroll, setIsSyncScroll] = useState(true);
  const [viewMode, setViewMode] = useState<'side_by_side' | 'paragraph_pairs'>('side_by_side');
  const [searchTerm, setSearchTerm] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const isScrollingSyncRef = useRef(false);

  // Initialize chapters based on context
  useEffect(() => {
    if (!isOpen || !story || story.chapters.length === 0) return;

    const currentId = defaultChapterId || activeChapterId || story.chapters[0].id;
    const currentChapter = story.chapters.find(c => c.id === currentId) || story.chapters[0];

    // Check if current chapter is a translation of another chapter
    if (currentChapter.sourceChapterId) {
      const source = story.chapters.find(c => c.id === currentChapter.sourceChapterId);
      if (source) {
        setLeftChapterId(source.id);
        setRightChapterId(currentChapter.id);
        setRightContent(currentChapter.content);
        setIsUsingCustomRaw(false);
        setIsSaved(true);
        return;
      }
    }

    // Check if current chapter has embedded originalContent
    if (currentChapter.originalContent && currentChapter.originalContent.trim().length > 0) {
      setLeftChapterId(currentChapter.id);
      setIsUsingCustomRaw(true);
      setCustomRawText(currentChapter.originalContent);
      setRightChapterId(currentChapter.id);
      setRightContent(currentChapter.content);
      setIsSaved(true);
      return;
    }

    // Check if current chapter is an original chapter and has a translated sibling
    const translatedSibling = story.chapters.find(
      c => c.sourceChapterId === currentChapter.id ||
           c.title === `[Việt Hóa] ${currentChapter.title}` ||
           c.title.toLowerCase().includes(`việt hóa`) && Math.abs(c.order - currentChapter.order) <= 1
    );

    if (translatedSibling) {
      setLeftChapterId(currentChapter.id);
      setRightChapterId(translatedSibling.id);
      setRightContent(translatedSibling.content);
      setIsUsingCustomRaw(false);
      setIsSaved(true);
      return;
    }

    // Fallback: Left is current, Right is next or same
    setLeftChapterId(currentChapter.id);
    const sorted = [...story.chapters].sort((a, b) => a.order - b.order);
    const currIdx = sorted.findIndex(c => c.id === currentChapter.id);
    const nextChapter = (currIdx !== -1 && currIdx < sorted.length - 1) ? sorted[currIdx + 1] : currentChapter;
    setRightChapterId(nextChapter.id);
    setRightContent(nextChapter.content);
    setIsUsingCustomRaw(false);
    setIsSaved(true);
  }, [isOpen, defaultChapterId, activeChapterId, story]);

  // Update right content when right chapter changes
  const handleRightChapterChange = (id: string) => {
    setRightChapterId(id);
    const ch = story?.chapters.find(c => c.id === id);
    if (ch) {
      setRightContent(ch.content);
      setIsSaved(true);
    }
  };

  // Update left chapter
  const handleLeftChapterChange = (val: string) => {
    if (val === '__custom__') {
      setIsUsingCustomRaw(true);
    } else {
      setIsUsingCustomRaw(false);
      setLeftChapterId(val);
    }
  };

  const leftChapter = useMemo(() => {
    return story?.chapters.find(c => c.id === leftChapterId);
  }, [story, leftChapterId]);

  const rightChapter = useMemo(() => {
    return story?.chapters.find(c => c.id === rightChapterId);
  }, [story, rightChapterId]);

  const leftText = isUsingCustomRaw ? customRawText : (leftChapter?.content || '');

  // Save changes to right chapter
  const handleSaveChanges = () => {
    if (rightChapterId && story) {
      updateChapterContent(rightChapterId, rightContent, true);
      bumpEditorSyncToken();
      setIsSaved(true);
    }
  };

  // Resizing logic
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const newPercent = (e.clientX / containerWidth) * 100;
      setSplitPercent(Math.max(20, Math.min(80, newPercent)));
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Synchronized scrolling
  const handleScroll = (source: 'left' | 'right') => {
    if (!isSyncScroll || isScrollingSyncRef.current) return;
    isScrollingSyncRef.current = true;

    const sourceEl = source === 'left' ? leftPaneRef.current : rightPaneRef.current;
    const targetEl = source === 'left' ? rightPaneRef.current : leftPaneRef.current;

    if (sourceEl && targetEl) {
      const scrollRatio = sourceEl.scrollTop / (sourceEl.scrollHeight - sourceEl.clientHeight || 1);
      targetEl.scrollTop = scrollRatio * (targetEl.scrollHeight - targetEl.clientHeight);
    }

    setTimeout(() => {
      isScrollingSyncRef.current = false;
    }, 40);
  };

  // Paragraph splitting for paragraph-pair view mode
  const paragraphPairs = useMemo(() => {
    if (viewMode !== 'paragraph_pairs') return [];
    const leftParas = leftText.split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean);
    const rightParas = rightContent.split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean);
    const maxLen = Math.max(leftParas.length, rightParas.length);

    const pairs = [];
    for (let i = 0; i < maxLen; i++) {
      pairs.push({
        index: i + 1,
        left: leftParas[i] || '',
        right: rightParas[i] || ''
      });
    }
    return pairs;
  }, [viewMode, leftText, rightContent]);

  // Statistics
  const leftWordCount = useMemo(() => leftText.trim() ? leftText.trim().split(/\s+/).length : 0, [leftText]);
  const rightWordCount = useMemo(() => rightContent.trim() ? rightContent.trim().split(/\s+/).length : 0, [rightContent]);
  const leftCharCount = leftText.length;
  const rightCharCount = rightContent.length;

  if (!isOpen) return null;

  return (
    <div 
      ref={containerRef} 
      className={`fixed inset-0 z-[150] bg-gray-950/95 backdrop-blur-md flex flex-col animate-fadeIn ${isResizing ? 'cursor-col-resize select-none' : ''}`}
    >
      {/* Top Header */}
      <div className="p-3 md:px-6 md:py-3.5 border-b border-gray-800 bg-gray-900/80 flex flex-wrap justify-between items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                <span>Đối Soát Song Ngữ</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                  Bản Gốc ⇄ Bản Dịch
                </span>
              </h2>
            </div>
            <p className="text-[11px] text-gray-400">
              Đối chiếu từng câu chữ giữa nguyên tác và bản Việt hóa. Chỉnh sửa và lưu trực tiếp bản dịch.
            </p>
          </div>
        </div>

        {/* Controls & Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* View Mode Toggle */}
          <div className="bg-gray-800/80 p-0.5 rounded-xl border border-gray-700 flex text-xs">
            <button
              onClick={() => setViewMode('side_by_side')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'side_by_side'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Song song
            </button>
            <button
              onClick={() => setViewMode('paragraph_pairs')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                viewMode === 'paragraph_pairs'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Theo từng đoạn
            </button>
          </div>

          {/* Sync Scroll Button */}
          {viewMode === 'side_by_side' && (
            <button
              onClick={() => setIsSyncScroll(!isSyncScroll)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                isSyncScroll
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
              }`}
              title="Tự động cuộn cả 2 trang song song"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              <span>{isSyncScroll ? 'Đồng bộ cuộn: Bật' : 'Đồng bộ cuộn: Tắt'}</span>
            </button>
          )}

          {/* Save Button */}
          <button
            onClick={handleSaveChanges}
            disabled={isSaved}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              isSaved
                ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-default'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{isSaved ? 'Đã lưu' : 'Lưu bản dịch'}</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Đóng cửa sổ đối soát"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sub-toolbar: Chapter Selectors & Stats */}
      <div className="px-4 py-2 bg-gray-900/50 border-b border-gray-800/80 flex flex-wrap justify-between items-center gap-3 text-xs shrink-0">
        {/* Left Side Selector */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <span className="font-bold text-amber-400 uppercase tracking-wider text-[10px] shrink-0">
            📖 Nguyên Tác:
          </span>
          <select
            value={isUsingCustomRaw ? '__custom__' : leftChapterId}
            onChange={(e) => handleLeftChapterChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-amber-500 flex-1 truncate"
          >
            {story?.chapters.map(c => (
              <option key={`left-${c.id}`} value={c.id}>
                {c.title} {c.isTranslation ? '(Bản dịch)' : ''}
              </option>
            ))}
            <option value="__custom__">📝 Nhập / Dán văn bản nguyên tác riêng...</option>
          </select>
          <span className="text-[10px] text-gray-400 shrink-0 font-mono">
            {leftWordCount.toLocaleString()} từ ({leftCharCount.toLocaleString()} ký tự)
          </span>
        </div>

        {/* Right Side Selector */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <span className="font-bold text-emerald-400 uppercase tracking-wider text-[10px] shrink-0">
            ✍️ Bản Việt Hóa:
          </span>
          <select
            value={rightChapterId}
            onChange={(e) => handleRightChapterChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-emerald-500 flex-1 truncate"
          >
            {story?.chapters.map(c => (
              <option key={`right-${c.id}`} value={c.id}>
                {c.title} {c.isTranslation ? '🌟' : ''}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-gray-400 shrink-0 font-mono">
            {rightWordCount.toLocaleString()} từ ({rightCharCount.toLocaleString()} ký tự)
          </span>
          {rightChapter && (
            <button
              onClick={() => {
                selectChapter(rightChapter.id);
                onClose();
              }}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] shrink-0 border border-gray-700"
              title="Mở chương dịch này trong Editor chính"
            >
              Mở soạn thảo
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'side_by_side' ? (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Column: Original */}
          <div
            className="flex flex-col border-r border-gray-800 h-full overflow-hidden"
            style={{ width: `${splitPercent}%` }}
          >
            <div className="px-4 py-2 bg-amber-950/20 border-b border-amber-900/30 flex justify-between items-center shrink-0">
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🏮 Bản Gốc / Raw (Nguyên tác)</span>
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(leftText);
                  alert("Đã sao chép toàn bộ nguyên tác vào bộ nhớ tạm!");
                }}
                className="text-[10px] text-gray-400 hover:text-amber-300 transition-colors flex items-center gap-1"
                title="Sao chép nguyên tác"
              >
                <span>Sao chép</span>
              </button>
            </div>

            <div
              ref={leftPaneRef}
              onScroll={() => handleScroll('left')}
              className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-gray-950/60"
            >
              {isUsingCustomRaw ? (
                <textarea
                  value={customRawText}
                  onChange={(e) => setCustomRawText(e.target.value)}
                  placeholder="Dán văn bản nguyên tác (tiếng Trung/Convert/Raw/tiếng Anh) vào đây để đối soát..."
                  className="w-full h-full bg-transparent text-gray-300 font-serif text-base leading-relaxed resize-none outline-none placeholder-gray-600"
                />
              ) : (
                <div className="max-w-3xl mx-auto text-gray-300 font-serif text-base md:text-lg leading-relaxed whitespace-pre-wrap selection:bg-amber-500/30">
                  {leftText || (
                    <div className="text-gray-600 italic text-center py-12">
                      Không có nội dung nguyên tác. Bạn có thể chọn chương khác hoặc dán văn bản nguyên tác vào ô chọn phía trên.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Resizer Handle */}
          <div
            onMouseDown={startResizing}
            className="absolute top-0 bottom-0 z-10 w-2 -ml-1 bg-transparent hover:bg-blue-500/40 transition-colors cursor-col-resize flex items-center justify-center group"
            style={{ left: `${splitPercent}%` }}
          >
            <div className="w-1 h-12 bg-gray-700 group-hover:bg-blue-400 rounded-full transition-colors"></div>
          </div>

          {/* Right Column: Localized / Translated */}
          <div
            className="flex flex-col h-full overflow-hidden"
            style={{ width: `${100 - splitPercent}%` }}
          >
            <div className="px-4 py-2 bg-emerald-950/20 border-b border-emerald-900/30 flex justify-between items-center shrink-0">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>🌟 Bản Việt Hóa (Có thể gọt giũa trực tiếp)</span>
              </span>
              <div className="flex items-center gap-3">
                {!isSaved && (
                  <span className="text-[10px] text-amber-400 animate-pulse font-medium">
                    ● Có sửa đổi chưa lưu
                  </span>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(rightContent);
                    alert("Đã sao chép bản Việt hóa vào bộ nhớ tạm!");
                  }}
                  className="text-[10px] text-gray-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                  title="Sao chép bản Việt hóa"
                >
                  <span>Sao chép</span>
                </button>
              </div>
            </div>

            <div
              ref={rightPaneRef}
              onScroll={() => handleScroll('right')}
              className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-gray-900/20 flex flex-col"
            >
              <textarea
                value={rightContent}
                onChange={(e) => {
                  setRightContent(e.target.value);
                  setIsSaved(false);
                }}
                placeholder="Nội dung bản dịch sẽ xuất hiện ở đây. Bạn có thể gõ hoặc sửa câu chữ trực tiếp..."
                className="w-full flex-1 bg-transparent text-gray-100 font-serif text-base md:text-lg leading-relaxed resize-none outline-none selection:bg-emerald-500/30 placeholder-gray-600"
              />
            </div>
          </div>
        </div>
      ) : (
        /* Paragraph Pair Mode */
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-gray-950">
          <div className="max-w-5xl mx-auto space-y-4">
            {paragraphPairs.length === 0 ? (
              <div className="text-gray-500 italic text-center py-12">
                Không có dữ liệu đoạn văn để đối chiếu.
              </div>
            ) : (
              paragraphPairs.map((pair) => (
                <div
                  key={`pair-${pair.index}`}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-gray-900/50 border border-gray-800/80 hover:border-gray-700 transition-colors"
                >
                  {/* Left paragraph */}
                  <div className="space-y-1.5 border-b md:border-b-0 md:border-r border-gray-800/80 pb-3 md:pb-0 md:pr-4">
                    <div className="flex items-center justify-between text-[10px] text-amber-500 font-mono">
                      <span>Đoạn #{pair.index} (Nguyên tác)</span>
                      <span>{pair.left.length} ký tự</span>
                    </div>
                    <p className="text-gray-300 font-serif text-sm md:text-base leading-relaxed whitespace-pre-wrap selection:bg-amber-500/30">
                      {pair.left || <span className="text-gray-600 italic">[Không có văn bản tương ứng]</span>}
                    </p>
                  </div>

                  {/* Right paragraph */}
                  <div className="space-y-1.5 md:pl-2">
                    <div className="flex items-center justify-between text-[10px] text-emerald-400 font-mono">
                      <span>Đoạn #{pair.index} (Việt hóa)</span>
                      <span>{pair.right.length} ký tự</span>
                    </div>
                    <p className="text-gray-100 font-serif text-sm md:text-base leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30">
                      {pair.right || <span className="text-gray-600 italic">[Không có văn bản tương ứng]</span>}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bottom Footer Info */}
      <div className="px-4 py-2 bg-gray-900/90 border-t border-gray-800 flex justify-between items-center text-xs text-gray-500 shrink-0">
        <div className="flex items-center gap-3">
          <span>💡 Phím tắt: Bạn có thể vừa đọc nguyên tác bên trái, vừa bấm chuột sửa câu chữ bên phải.</span>
        </div>
        <div>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors font-medium text-xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
