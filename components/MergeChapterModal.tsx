import React, { useState, useEffect, useMemo } from 'react';
import { Chapter } from '../types.ts';
import { getCachedWordCount } from '../utils/wordCount.ts';

interface MergeChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  activeChapterId?: string | null;
  onMerge: (
    chapterIds: string[],
    options: { newTitle: string; separator?: string; mergeTranslations?: boolean }
  ) => Promise<void>;
}

// Regex to detect "Chương 1 (Phần 1)", "Chương 1 - Phần 2", "Chapter 1 (Part 1)", etc.
const EXTRACT_BASE_TITLE_REGEX = /^(.*?)(?:\s*[-–—:]?\s*(?:\(|\[)?\s*(?:Phần|phần|Part|part|Hồi|Quyển|Tập)?\s*(\d+)\s*(?:\)|\])?\s*)$/i;

export const MergeChapterModal: React.FC<MergeChapterModalProps> = ({
  isOpen,
  onClose,
  chapters,
  activeChapterId,
  onMerge,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState<string>('');
  const [separatorType, setSeparatorType] = useState<string>('double_newline');
  const [customSeparator, setCustomSeparator] = useState<string>('\n\n***\n\n');
  const [mergeTranslations, setMergeTranslations] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  // Sorted chapters by original order
  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => a.order - b.order);
  }, [chapters]);

  // Detect chapters that appear to be split parts of the same chapter
  const detectedPartGroups = useMemo(() => {
    const groups: { baseTitle: string; chapters: Chapter[] }[] = [];
    const map = new Map<string, Chapter[]>();

    for (const ch of sortedChapters) {
      const match = ch.title.match(EXTRACT_BASE_TITLE_REGEX);
      if (match && match[1]?.trim()) {
        const base = match[1].trim();
        if (!map.has(base)) {
          map.set(base, []);
        }
        map.get(base)!.push(ch);
      }
    }

    for (const [baseTitle, chList] of map.entries()) {
      if (chList.length >= 2) {
        groups.push({ baseTitle, chapters: chList });
      }
    }
    return groups;
  }, [sortedChapters]);

  // Compute clean title recommendation when selectedIds change
  const suggestTitle = (ids: string[]): string => {
    if (ids.length === 0) return '';
    const selected = sortedChapters.filter(c => ids.includes(c.id));
    if (selected.length === 0) return '';

    // Check if they share a common part base title
    const firstTitle = selected[0].title;
    const match = firstTitle.match(EXTRACT_BASE_TITLE_REGEX);
    if (match && match[1]?.trim()) {
      const base = match[1].trim();
      const allMatchBase = selected.every(c => {
        const m = c.title.match(EXTRACT_BASE_TITLE_REGEX);
        return m && m[1]?.trim().toLowerCase() === base.toLowerCase();
      });
      if (allMatchBase) {
        return base;
      }
    }

    // Default: title of the first selected chapter without (Phần...)
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
    return firstTitle;
  };

  // Initialize selection when opening modal
  useEffect(() => {
    if (!isOpen) {
      setSelectedIds([]);
      setNewTitle('');
      setIsProcessing(false);
      setShowPreview(false);
      setSearchQuery('');
      return;
    }

    // If activeChapterId is provided
    if (activeChapterId) {
      const currentIdx = sortedChapters.findIndex(c => c.id === activeChapterId);
      if (currentIdx !== -1) {
        const currentCh = sortedChapters[currentIdx];
        // Check if current chapter belongs to a detected part group
        const matchedGroup = detectedPartGroups.find(g =>
          g.chapters.some(c => c.id === activeChapterId)
        );

        if (matchedGroup) {
          const groupIds = matchedGroup.chapters.map(c => c.id);
          setSelectedIds(groupIds);
          setNewTitle(matchedGroup.baseTitle);
          return;
        }

        // If not in a group, default to current chapter + next chapter if available
        if (currentIdx < sortedChapters.length - 1) {
          const nextCh = sortedChapters[currentIdx + 1];
          const initial = [currentCh.id, nextCh.id];
          setSelectedIds(initial);
          setNewTitle(suggestTitle(initial));
          return;
        }

        // Only current chapter
        setSelectedIds([currentCh.id]);
        setNewTitle(currentCh.title);
        return;
      }
    }

    // Default fallback: first 2 chapters
    if (sortedChapters.length >= 2) {
      const initial = [sortedChapters[0].id, sortedChapters[1].id];
      setSelectedIds(initial);
      setNewTitle(suggestTitle(initial));
    }
  }, [isOpen, activeChapterId]);

  // Selected Chapter objects in current selection order
  const selectedChapters = useMemo(() => {
    return selectedIds
      .map(id => sortedChapters.find(c => c.id === id))
      .filter((c): c is Chapter => !!c);
  }, [selectedIds, sortedChapters]);

  // Filtered chapters for display in list
  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return sortedChapters;
    const q = searchQuery.toLowerCase().trim();
    return sortedChapters.filter(c =>
      c.title.toLowerCase().includes(q) ||
      `chương ${c.order}`.toLowerCase().includes(q)
    );
  }, [sortedChapters, searchQuery]);

  // Calculate actual separator string
  const actualSeparator = useMemo(() => {
    switch (separatorType) {
      case 'double_newline':
        return '\n\n';
      case 'asterisk':
        return '\n\n***\n\n';
      case 'divider':
        return '\n\n---\n\n';
      case 'scene_break':
        return '\n\n~ * ~ * ~\n\n';
      case 'custom':
        return customSeparator;
      default:
        return '\n\n';
    }
  }, [separatorType, customSeparator]);

  // Statistics
  const totalCombinedWords = useMemo(() => {
    return selectedChapters.reduce(
      (acc, c) => acc + getCachedWordCount(c.id, c.content, c.lastUpdated),
      0
    );
  }, [selectedChapters]);

  const totalTranslatedWords = useMemo(() => {
    return selectedChapters.reduce(
      (acc, c) =>
        acc +
        (c.translatedContent
          ? getCachedWordCount(c.id + '_trans', c.translatedContent, c.translationLastUpdated)
          : 0),
      0
    );
  }, [selectedChapters]);

  const hasAnyTranslation = useMemo(() => {
    return selectedChapters.some(
      c => !!c.translatedContent && c.translatedContent.trim().length > 0
    );
  }, [selectedChapters]);

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      let next: string[];
      if (prev.includes(id)) {
        next = prev.filter(item => item !== id);
      } else {
        // Append in natural chapter order
        const currentSelected = [...prev, id];
        next = sortedChapters
          .filter(c => currentSelected.includes(c.id))
          .map(c => c.id);
      }
      setNewTitle(suggestTitle(next));
      return next;
    });
  };

  // Quick select group
  const handleSelectGroup = (group: { baseTitle: string; chapters: Chapter[] }) => {
    const ids = group.chapters.map(c => c.id);
    setSelectedIds(ids);
    setNewTitle(group.baseTitle);
  };

  // Quick adjacent chapter additions
  const handleAddNext = () => {
    if (selectedIds.length === 0) return;
    const lastId = selectedIds[selectedIds.length - 1];
    const idx = sortedChapters.findIndex(c => c.id === lastId);
    if (idx !== -1 && idx < sortedChapters.length - 1) {
      const nextId = sortedChapters[idx + 1].id;
      if (!selectedIds.includes(nextId)) {
        const next = [...selectedIds, nextId];
        setSelectedIds(next);
        setNewTitle(suggestTitle(next));
      }
    }
  };

  const handleAddPrev = () => {
    if (selectedIds.length === 0) return;
    const firstId = selectedIds[0];
    const idx = sortedChapters.findIndex(c => c.id === firstId);
    if (idx > 0) {
      const prevId = sortedChapters[idx - 1].id;
      if (!selectedIds.includes(prevId)) {
        const next = [prevId, ...selectedIds];
        setSelectedIds(next);
        setNewTitle(suggestTitle(next));
      }
    }
  };

  // Move order up/down within selection
  const handleMoveOrder = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === selectedIds.length - 1)
    ) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newSelected = [...selectedIds];
    const temp = newSelected[index];
    newSelected[index] = newSelected[targetIndex];
    newSelected[targetIndex] = temp;
    setSelectedIds(newSelected);
  };

  // Execute merge
  const handleConfirmMerge = async () => {
    if (selectedIds.length < 2) {
      alert('Vui lòng chọn ít nhất 2 chương để tiến hành gộp.');
      return;
    }

    if (!newTitle.trim()) {
      alert('Vui lòng nhập tên cho chương sau khi gộp.');
      return;
    }

    setIsProcessing(true);
    try {
      await onMerge(selectedIds, {
        newTitle: newTitle.trim(),
        separator: actualSeparator,
        mergeTranslations,
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert('Đã xảy ra lỗi khi gộp chương.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-900/30 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Gộp Các Chương / Nối Các Phần Nhỏ</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  Merge Chapters
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Nối các chương đã chia nhỏ thành 1 chương hoàn chỉnh sau khi xử lý xong
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-300 rounded-xl hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Smart suggestions if any detected groups */}
          {detectedPartGroups.length > 0 && (
            <div className="p-3.5 bg-indigo-950/30 border border-indigo-800/40 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs">💡</span>
                <span className="text-xs font-bold text-indigo-300">
                  Phát hiện các chương có đánh số phần tự động:
                </span>
                <span className="text-[10px] text-gray-400">
                  (Nhấp vào để chọn nhanh toàn bộ các phần)
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {detectedPartGroups.map(group => {
                  const isCurrentGroupSelected =
                    group.chapters.length === selectedIds.length &&
                    group.chapters.every(c => selectedIds.includes(c.id));
                  return (
                    <button
                      key={group.baseTitle}
                      onClick={() => handleSelectGroup(group)}
                      className={`text-xs px-3 py-1.5 rounded-xl font-medium border transition-all flex items-center gap-1.5 ${
                        isCurrentGroupSelected
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md font-bold'
                          : 'bg-gray-900/80 hover:bg-indigo-900/40 text-indigo-200 border-indigo-800/50'
                      }`}
                    >
                      <span>📁 {group.baseTitle}</span>
                      <span className="text-[10px] opacity-75">
                        ({group.chapters.length} phần)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grid Layout: Left = Selection & Reorder, Right = Configuration & Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Chapter Selection (7 cols) */}
            <div className="lg:col-span-7 space-y-3 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                  <span>1. Chọn các chương cần gộp</span>
                  <span className="text-[11px] font-normal text-indigo-400">
                    ({selectedIds.length} chương đã chọn)
                  </span>
                </label>

                {/* Quick adjacent buttons */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleAddPrev}
                    className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                    title="Thêm chương liền trước vào danh sách gộp"
                  >
                    + Trước
                  </button>
                  <button
                    type="button"
                    onClick={handleAddNext}
                    className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                    title="Thêm chương liền sau vào danh sách gộp"
                  >
                    + Sau
                  </button>
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="text-[10px] px-2 py-1 rounded-lg bg-gray-800 hover:bg-red-950/50 hover:text-red-300 text-gray-400 transition-colors"
                    >
                      Bỏ chọn hết
                    </button>
                  )}
                </div>
              </div>

              {/* Search bar */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Lọc chương theo tên hoặc số thứ tự..."
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 pl-8 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
                <svg
                  className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* Chapter Checkbox List */}
              <div className="border border-gray-800 rounded-2xl bg-gray-950/40 divide-y divide-gray-800/60 max-h-72 overflow-y-auto custom-scrollbar">
                {filteredChapters.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-500">
                    Không tìm thấy chương nào
                  </div>
                ) : (
                  filteredChapters.map(chapter => {
                    const isSelected = selectedIds.includes(chapter.id);
                    const selectedIndex = selectedIds.indexOf(chapter.id);
                    const wordCount = getCachedWordCount(
                      chapter.id,
                      chapter.content,
                      chapter.lastUpdated
                    );
                    const hasTrans =
                      !!chapter.translatedContent &&
                      chapter.translatedContent.trim().length > 0;

                    return (
                      <div
                        key={chapter.id}
                        onClick={() => handleToggleSelect(chapter.id)}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-indigo-950/40 border-l-2 border-indigo-500'
                            : 'hover:bg-gray-800/40'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'border-gray-700 bg-gray-900'
                          }`}
                        >
                          {isSelected && (
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>

                        {/* Title & info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-200 truncate">
                              {chapter.title}
                            </span>
                            {hasTrans && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 shrink-0">
                                Đã dịch
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {wordCount.toLocaleString()} từ • Thứ tự #{chapter.order}
                          </div>
                        </div>

                        {/* Sequence badge & ordering buttons */}
                        {isSelected && (
                          <div
                            className="flex items-center gap-1 shrink-0"
                            onClick={e => e.stopPropagation()}
                          >
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                              {selectedIndex + 1}
                            </span>
                            <div className="flex flex-col">
                              <button
                                type="button"
                                disabled={selectedIndex === 0}
                                onClick={() => handleMoveOrder(selectedIndex, 'up')}
                                className="text-gray-500 hover:text-indigo-400 disabled:opacity-20 text-[9px] leading-none px-1"
                                title="Đưa phần này lên trước"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={selectedIndex === selectedIds.length - 1}
                                onClick={() => handleMoveOrder(selectedIndex, 'down')}
                                className="text-gray-500 hover:text-indigo-400 disabled:opacity-20 text-[9px] leading-none px-1"
                                title="Đưa phần này xuống sau"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Order preview explanation */}
              {selectedIds.length > 0 && (
                <div className="text-[10px] text-gray-400 bg-gray-950/60 p-2.5 rounded-xl border border-gray-800">
                  <span className="font-semibold text-indigo-300">Thứ tự ghép nối: </span>
                  {selectedChapters.map((c, i) => (
                    <span key={c.id}>
                      <span className="text-gray-200 font-medium">{c.title}</span>
                      {i < selectedChapters.length - 1 && (
                        <span className="text-indigo-500 mx-1.5 font-bold">➔</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Settings & Live Preview (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <label className="text-xs font-bold text-gray-300 block">
                2. Thiết lập chương sau khi gộp
              </label>

              {/* Merged Title input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Tiêu đề chương mới:</span>
                  <button
                    type="button"
                    onClick={() => setNewTitle(suggestTitle(selectedIds))}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    🪄 Gợi ý tên chuẩn
                  </button>
                </div>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Ví dụ: Chương 1 hoặc Tên chương..."
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Separator selection */}
              <div className="space-y-1.5">
                <span className="text-xs text-gray-400 block">Ký hiệu nối các phân đoạn:</span>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSeparatorType('double_newline')}
                    className={`py-1.5 px-2 rounded-xl border text-left transition-all ${
                      separatorType === 'double_newline'
                        ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 font-semibold'
                        : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="text-[11px]">2 Dòng trống</div>
                    <div className="text-[9px] text-gray-500">Mặc định (Liền mạch)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeparatorType('asterisk')}
                    className={`py-1.5 px-2 rounded-xl border text-left transition-all ${
                      separatorType === 'asterisk'
                        ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 font-semibold'
                        : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="text-[11px]">Dấu sao ***</div>
                    <div className="text-[9px] text-gray-500">Phân cách cảnh</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeparatorType('divider')}
                    className={`py-1.5 px-2 rounded-xl border text-left transition-all ${
                      separatorType === 'divider'
                        ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 font-semibold'
                        : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="text-[11px]">Đường gạch ---</div>
                    <div className="text-[9px] text-gray-500">Phân đoạn rõ ràng</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeparatorType('custom')}
                    className={`py-1.5 px-2 rounded-xl border text-left transition-all ${
                      separatorType === 'custom'
                        ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 font-semibold'
                        : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <div className="text-[11px]">Tùy chỉnh...</div>
                    <div className="text-[9px] text-gray-500">Nhập ký hiệu riêng</div>
                  </button>
                </div>

                {separatorType === 'custom' && (
                  <input
                    type="text"
                    value={customSeparator}
                    onChange={e => setCustomSeparator(e.target.value)}
                    placeholder="Nhập chuỗi nối, ví dụ: \n\n***\n\n"
                    className="w-full mt-1.5 bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 font-mono focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              {/* Translation merge toggle */}
              {hasAnyTranslation && (
                <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-2xl">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mergeTranslations}
                      onChange={e => setMergeTranslations(e.target.checked)}
                      className="mt-0.5 rounded border-gray-700 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-emerald-300">
                        Đồng thời gộp cả bản dịch ({totalTranslatedWords.toLocaleString()} từ)
                      </div>
                      <div className="text-[10px] text-emerald-400/80 mt-0.5">
                        Các bản dịch tương ứng của các phần sẽ được tự động nối liền mạch vào chương mới.
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {/* Statistical card */}
              <div className="bg-gray-950/80 p-3.5 rounded-2xl border border-gray-800 space-y-2">
                <div className="text-xs font-bold text-gray-300 flex items-center justify-between">
                  <span>Thông số sau khi gộp:</span>
                  <span className="text-[10px] font-normal text-gray-500">
                    {selectedChapters.length} phần
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Tổng độ dài nội dung:</span>
                  <span className="font-bold text-indigo-400">
                    {totalCombinedWords.toLocaleString()} từ
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Vị trí trong danh sách:</span>
                  <span className="font-medium text-gray-300">
                    {selectedChapters[0] ? `Chương #${selectedChapters[0].order}` : '—'}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-800">
                  ⚠️ Các chương còn lại sẽ được tự động đánh số lại theo thứ tự liền mạch.
                </div>
              </div>

              {/* Preview Toggle */}
              {selectedChapters.length >= 2 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className="w-full py-1.5 px-3 bg-gray-950 hover:bg-gray-800 text-gray-300 border border-gray-800 rounded-xl text-xs font-medium flex items-center justify-between transition-colors"
                  >
                    <span>👁️ {showPreview ? 'Ẩn xem trước' : 'Xem trước điểm nối'}</span>
                    <span>{showPreview ? '▲' : '▼'}</span>
                  </button>

                  {showPreview && (
                    <div className="mt-2 p-3 bg-gray-950 border border-gray-800 rounded-xl text-[11px] text-gray-400 font-serif leading-relaxed max-h-40 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                      <span className="text-indigo-400 font-sans font-bold text-[10px] block mb-1">
                        Cuối {selectedChapters[0].title}:
                      </span>
                      ...{selectedChapters[0].content.slice(-180)}
                      <span className="text-amber-400 font-mono font-bold block my-1">
                        {actualSeparator.replace(/\n/g, '\\n')}
                      </span>
                      <span className="text-indigo-400 font-sans font-bold text-[10px] block mb-1">
                        Đầu {selectedChapters[1].title}:
                      </span>
                      {selectedChapters[1].content.slice(0, 180)}...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-gray-950/60 shrink-0">
          <div className="text-xs text-gray-400">
            {selectedIds.length < 2 ? (
              <span className="text-amber-400 font-medium">
                Vui lòng chọn ít nhất 2 chương để gộp
              </span>
            ) : (
              <span>
                Sẵn sàng gộp{' '}
                <strong className="text-white">{selectedIds.length}</strong> chương thành{' '}
                <strong className="text-indigo-300">"{newTitle || '...'}"</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmMerge}
              disabled={isProcessing || selectedIds.length < 2 || !newTitle.trim()}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Đang gộp chương...</span>
                </>
              ) : (
                <>
                  <span>Tiến hành Gộp {selectedIds.length} Chương</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
