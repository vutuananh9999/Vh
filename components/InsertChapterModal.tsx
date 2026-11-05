import React, { useState, useEffect, useMemo } from 'react';
import { Chapter } from '../types.ts';

interface InsertChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  initialTargetChapterId?: string | null;
  initialPosition?: 'before' | 'after';
  onInsert: (
    targetChapterId: string,
    position: 'before' | 'after',
    params?: { title?: string; wordGoal?: number; outline?: string },
    options?: { autoRenumberFollowing?: boolean }
  ) => Promise<string | undefined>;
}

export const InsertChapterModal: React.FC<InsertChapterModalProps> = ({
  isOpen,
  onClose,
  chapters,
  initialTargetChapterId,
  initialPosition = 'after',
  onInsert,
}) => {
  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => a.order - b.order);
  }, [chapters]);

  const [targetChapterId, setTargetChapterId] = useState<string>('');
  const [position, setPosition] = useState<'before' | 'after'>(initialPosition);
  const [title, setTitle] = useState<string>('');
  const [wordGoal, setWordGoal] = useState<number>(2000);
  const [autoRenumber, setAutoRenumber] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Sync initial target chapter
  useEffect(() => {
    if (isOpen) {
      const defaultId = initialTargetChapterId || (sortedChapters[0]?.id ?? '');
      setTargetChapterId(defaultId);
      setPosition(initialPosition);
      setAutoRenumber(true);
      setWordGoal(2000);
      setSearchFilter('');
    }
  }, [isOpen, initialTargetChapterId, initialPosition, sortedChapters]);

  // Compute suggested title & preview index whenever targetChapterId or position changes
  const targetIndex = useMemo(() => {
    return sortedChapters.findIndex(c => c.id === targetChapterId);
  }, [sortedChapters, targetChapterId]);

  const newOrderNumber = useMemo(() => {
    if (targetIndex === -1) return sortedChapters.length + 1;
    return position === 'before' ? targetIndex + 1 : targetIndex + 2;
  }, [targetIndex, position, sortedChapters.length]);

  // Auto-fill suggested title
  useEffect(() => {
    if (isOpen && targetChapterId) {
      setTitle(`Chương ${newOrderNumber}`);
    }
  }, [isOpen, targetChapterId, position, newOrderNumber]);

  const filteredChapters = useMemo(() => {
    if (!searchFilter.trim()) return sortedChapters;
    const q = searchFilter.toLowerCase();
    return sortedChapters.filter(c => 
      c.title.toLowerCase().includes(q) || 
      `chương ${c.order}`.includes(q) ||
      c.order.toString() === q
    );
  }, [sortedChapters, searchFilter]);

  if (!isOpen) return null;

  const targetChapter = sortedChapters.find(c => c.id === targetChapterId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetChapterId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onInsert(
        targetChapterId,
        position,
        {
          title: title.trim() || `Chương ${newOrderNumber}`,
          wordGoal,
          outline: '',
        },
        { autoRenumberFollowing: autoRenumber }
      );
      onClose();
    } catch (err) {
      console.error('Insert chapter failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 border border-gray-750 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Chèn Chương Trống</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  Vào Giữa
                </span>
              </h3>
              <p className="text-xs text-gray-400">Thêm một chương trắng tinh vào vị trí mong muốn trong mạch truyện</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Đóng"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar text-xs">
          {/* Position Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">
              1. Hướng chèn tương đối
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPosition('after')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  position === 'after'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm ring-1 ring-emerald-500/30'
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <span>Chèn vào SAU (Phía dưới)</span>
              </button>

              <button
                type="button"
                onClick={() => setPosition('before')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  position === 'before'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 shadow-sm ring-1 ring-emerald-500/30'
                    : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                <span>Chèn vào TRƯỚC (Phía trên)</span>
              </button>
            </div>
          </div>

          {/* Reference Chapter Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                2. Chọn chương mốc ({position === 'after' ? 'Chèn sau chương này' : 'Chèn trước chương này'})
              </label>
              {sortedChapters.length > 8 && (
                <span className="text-[10px] text-gray-500">{sortedChapters.length} chương hiện có</span>
              )}
            </div>

            {sortedChapters.length > 8 && (
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Tìm nhanh chương mốc..."
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-emerald-500"
              />
            )}

            <div className="max-h-40 overflow-y-auto space-y-1 p-1 bg-gray-950/80 rounded-xl border border-gray-800 custom-scrollbar">
              {filteredChapters.map((ch, idx) => {
                const isSelected = ch.id === targetChapterId;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setTargetChapterId(ch.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-all ${
                      isSelected
                        ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-600/50 font-bold'
                        : 'text-gray-300 hover:bg-gray-800/60 hover:text-white'
                    }`}
                  >
                    <span className="truncate flex items-center gap-2">
                      <span className="text-[10px] font-mono text-gray-500 w-5">#{idx + 1}</span>
                      <span className="truncate">{ch.title}</span>
                    </span>
                    {isSelected && (
                      <span className="text-emerald-400 shrink-0 text-xs">✓ Đang chọn</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Placement Visualization */}
          {targetChapter && (
            <div className="p-3 bg-gray-950/90 rounded-xl border border-emerald-500/20 text-xs space-y-1.5">
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>📍 Vị trí chương mới sẽ xuất hiện:</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300 font-mono text-[11px] overflow-x-auto py-1">
                {position === 'before' ? (
                  <>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/40 animate-pulse shrink-0">
                      ✨ [Chương mới #{newOrderNumber}]
                    </span>
                    <span className="text-gray-600">➔</span>
                    <span className="text-gray-400 truncate max-w-[200px] shrink-0">
                      {targetChapter.title}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-gray-400 truncate max-w-[200px] shrink-0">
                      {targetChapter.title}
                    </span>
                    <span className="text-gray-600">➔</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/40 animate-pulse shrink-0">
                      ✨ [Chương mới #{newOrderNumber}]
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Chapter Title Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block">
              3. Tiêu đề chương mới
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Vd: Chương 2: Bước ngoặt định mệnh"
              className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors"
            />
          </div>

          {/* Word Goal */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">
                4. Mục tiêu độ dài
              </label>
              <span className="text-xs font-mono text-emerald-400 font-bold">{wordGoal.toLocaleString()} từ</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="500"
                max="8000"
                step="250"
                value={wordGoal}
                onChange={e => setWordGoal(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
            <div className="flex gap-2 pt-0.5">
              {[1500, 2000, 3000, 4000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setWordGoal(val)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
                    wordGoal === val
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600/50'
                      : 'bg-gray-950 text-gray-500 border-gray-800 hover:text-gray-300'
                  }`}
                >
                  {val.toLocaleString()} từ
                </button>
              ))}
            </div>
          </div>

          {/* Auto Renumber Option */}
          <div className="pt-2 border-t border-gray-800/80">
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={autoRenumber}
                onChange={e => setAutoRenumber(e.target.checked)}
                className="mt-0.5 rounded bg-gray-950 border-gray-700 text-emerald-600 focus:ring-0 focus:ring-offset-0 cursor-pointer w-4 h-4"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-gray-200 group-hover:text-white transition-colors block">
                  Tự động tăng số thứ tự cho các chương phía sau (Chương X ➔ Chương X+1)
                </span>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Nếu các chương sau đang được đặt tên theo định dạng "Chương 2", "Chương 3", hệ thống sẽ tự động đổi thành "Chương 3", "Chương 4" để đảm bảo số chương liền mạch.
                </p>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-gray-800 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider transition-all"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!targetChapterId || isSubmitting}
              className="flex-[2] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang chèn...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Chèn chương trống ngay</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
