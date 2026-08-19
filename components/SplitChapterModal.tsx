import React, { useState, useEffect, useMemo } from 'react';
import { Chapter } from '../types.ts';
import { fastWordCount } from '../utils/wordCount.ts';

interface SplitChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapter: Chapter | null;
  cursorPosition?: number;
  onSplit: (segments: { title: string; content: string; outline?: string }[]) => Promise<void>;
}

type SplitMode = 'word_count' | 'scene_marker' | 'equal_parts' | 'cursor';

export const SplitChapterModal: React.FC<SplitChapterModalProps> = ({
  isOpen,
  onClose,
  chapter,
  cursorPosition,
  onSplit
}) => {
  const [splitMode, setSplitMode] = useState<SplitMode>('word_count');
  const [targetWordCount, setTargetWordCount] = useState<number>(1000);
  const [sceneMarker, setSceneMarker] = useState<string>('***');
  const [numParts, setNumParts] = useState<number>(2);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Editable segments state
  const [previewSegments, setPreviewSegments] = useState<{ title: string; content: string; wordCount: number }[]>([]);

  const rawContent = chapter?.content || '';
  const totalWords = useMemo(() => fastWordCount(rawContent), [rawContent]);

  // Intelligent word-based split algorithm: splits at natural paragraph/sentence boundaries
  const splitByWordCount = (content: string, targetWords: number): string[] => {
    if (!content.trim()) return [];
    const paragraphs = content.split(/\n+/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return [content];

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentCount = 0;

    for (const para of paragraphs) {
      const paraWords = fastWordCount(para);

      if (currentCount + paraWords > targetWords && currentChunk.length > 0) {
        // If current chunk has enough words, seal it
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [para];
        currentCount = paraWords;
      } else {
        currentChunk.push(para);
        currentCount += paraWords;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n'));
    }

    // If only 1 chunk produced but totalWords > targetWords * 1.5, try sentence-level split
    if (chunks.length <= 1 && totalWords > targetWords * 1.4) {
      const sentences = content.match(/[^.!?\n]+[.!?\n]+/g) || [content];
      const subChunks: string[] = [];
      let subCurrent: string[] = [];
      let subCount = 0;

      for (const sent of sentences) {
        const sentWords = fastWordCount(sent);
        if (subCount + sentWords > targetWords && subCurrent.length > 0) {
          subChunks.push(subCurrent.join(' ').trim());
          subCurrent = [sent];
          subCount = sentWords;
        } else {
          subCurrent.push(sent);
          subCount += sentWords;
        }
      }
      if (subCurrent.length > 0) {
        subChunks.push(subCurrent.join(' ').trim());
      }
      return subChunks.length > 0 ? subChunks : [content];
    }

    return chunks;
  };

  // Scene Marker split algorithm
  const splitByMarker = (content: string, marker: string): string[] => {
    if (!marker.trim()) return [content];
    const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:\\n|^)\\s*${escapedMarker}\\s*(?:\\n|$)`, 'g');
    const parts = content.split(regex).map(p => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [content];
  };

  // Equal parts split algorithm
  const splitByEqualParts = (content: string, parts: number): string[] => {
    if (parts <= 1) return [content];
    const wordsPerPart = Math.max(200, Math.ceil(totalWords / parts));
    return splitByWordCount(content, wordsPerPart);
  };

  // Cursor position split
  const splitAtCursor = (content: string, pos?: number): string[] => {
    if (pos === undefined || pos <= 0 || pos >= content.length) {
      // Default to half if cursor is invalid
      const mid = Math.floor(content.length / 2);
      return [content.substring(0, mid).trim(), content.substring(mid).trim()].filter(Boolean);
    }
    const part1 = content.substring(0, pos).trim();
    const part2 = content.substring(pos).trim();
    return [part1, part2].filter(Boolean);
  };

  // Re-calculate segments whenever mode or parameters change
  useEffect(() => {
    if (!isOpen || !chapter) return;

    let rawChunks: string[] = [];
    if (splitMode === 'word_count') {
      rawChunks = splitByWordCount(rawContent, targetWordCount);
    } else if (splitMode === 'scene_marker') {
      rawChunks = splitByMarker(rawContent, sceneMarker);
    } else if (splitMode === 'equal_parts') {
      rawChunks = splitByEqualParts(rawContent, numParts);
    } else if (splitMode === 'cursor') {
      rawChunks = splitAtCursor(rawContent, cursorPosition);
    }

    if (rawChunks.length === 0) {
      rawChunks = [rawContent];
    }

    const baseTitle = chapter.title || 'Chương';
    const formatted = rawChunks.map((chunk, idx) => {
      const segTitle = rawChunks.length === 1 
        ? baseTitle 
        : `${baseTitle} (Phần ${idx + 1})`;
      return {
        title: segTitle,
        content: chunk,
        wordCount: fastWordCount(chunk)
      };
    });

    setPreviewSegments(formatted);
  }, [isOpen, chapter, splitMode, targetWordCount, sceneMarker, numParts, cursorPosition, rawContent, totalWords]);

  const handleTitleChange = (index: number, newTitle: string) => {
    setPreviewSegments(prev => {
      const copy = [...prev];
      if (copy[index]) copy[index].title = newTitle;
      return copy;
    });
  };

  const handleContentChange = (index: number, newContent: string) => {
    setPreviewSegments(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index].content = newContent;
        copy[index].wordCount = fastWordCount(newContent);
      }
      return copy;
    });
  };

  const handleMergeWithNext = (index: number) => {
    if (index >= previewSegments.length - 1) return;
    setPreviewSegments(prev => {
      const copy = [...prev];
      const mergedContent = copy[index].content + '\n\n' + copy[index + 1].content;
      copy[index] = {
        ...copy[index],
        content: mergedContent,
        wordCount: fastWordCount(mergedContent)
      };
      copy.splice(index + 1, 1);
      return copy;
    });
  };

  const handleConfirmSplit = async () => {
    if (previewSegments.length <= 1) {
      alert("Vui lòng chọn tùy chọn chia để tạo ít nhất 2 phân đoạn.");
      return;
    }

    setIsProcessing(true);
    try {
      await onSplit(previewSegments.map(s => ({
        title: s.title,
        content: s.content
      })));
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Lỗi trong quá trình chia chương.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !chapter) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-gray-900 border border-gray-800 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-950/40 text-purple-400 border border-purple-800/40">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                Chia Nhỏ Chương Truyện
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-700/40 font-mono">
                  {totalWords.toLocaleString()} chữ
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Chia nhỏ chương giúp AI xử lý sâu sắc hơn, chống tràn hạn mức API (429) và giữ trọn 100% chi tiết.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {/* Mode Selector */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              Phương thức chia nhỏ
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSplitMode('word_count')}
                className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-left flex flex-col gap-1 ${
                  splitMode === 'word_count'
                    ? 'bg-purple-950/50 border-purple-500/80 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.15)]'
                    : 'bg-gray-950/40 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                <span className="font-semibold text-gray-200">Theo Dung lượng từ</span>
                <span className="text-[11px] text-gray-500">Tự động ngắt đoạn thông minh</span>
              </button>

              <button
                type="button"
                onClick={() => setSplitMode('scene_marker')}
                className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-left flex flex-col gap-1 ${
                  splitMode === 'scene_marker'
                    ? 'bg-purple-950/50 border-purple-500/80 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.15)]'
                    : 'bg-gray-950/40 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                <span className="font-semibold text-gray-200">Theo Dấu phân cảnh</span>
                <span className="text-[11px] text-gray-500">Tách tại *** hoặc ký tự</span>
              </button>

              <button
                type="button"
                onClick={() => setSplitMode('equal_parts')}
                className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-left flex flex-col gap-1 ${
                  splitMode === 'equal_parts'
                    ? 'bg-purple-950/50 border-purple-500/80 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.15)]'
                    : 'bg-gray-950/40 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                <span className="font-semibold text-gray-200">Chia đều N phần</span>
                <span className="text-[11px] text-gray-500">2, 3 hoặc 4 phần bằng nhau</span>
              </button>

              <button
                type="button"
                onClick={() => setSplitMode('cursor')}
                className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all text-left flex flex-col gap-1 ${
                  splitMode === 'cursor'
                    ? 'bg-purple-950/50 border-purple-500/80 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.15)]'
                    : 'bg-gray-950/40 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                <span className="font-semibold text-gray-200">Tại Vị trí con trỏ</span>
                <span className="text-[11px] text-gray-500">Tách tại điểm đang soạn thảo</span>
              </button>
            </div>
          </div>

          {/* Mode Configuration Controls */}
          <div className="p-4 bg-gray-950/50 rounded-xl border border-gray-800/80">
            {splitMode === 'word_count' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-300">Dung lượng mục tiêu mỗi phân đoạn:</span>
                  <span className="text-xs font-mono font-bold text-purple-400">{targetWordCount} từ/phần</span>
                </div>
                <div className="flex gap-2">
                  {[700, 900, 1100, 1300, 1500].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTargetWordCount(val)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                        targetWordCount === val
                          ? 'bg-purple-900/40 text-purple-300 border-purple-600'
                          : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-gray-200'
                      }`}
                    >
                      ~{val} từ
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min="400"
                  max="2500"
                  step="50"
                  value={targetWordCount}
                  onChange={e => setTargetWordCount(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            )}

            {splitMode === 'scene_marker' && (
              <div className="space-y-3">
                <label className="text-xs font-medium text-gray-300 block">Ký hiệu phân cảnh dùng để ngắt:</label>
                <div className="flex gap-2">
                  {['***', '---', '###', '--- Hồi ---', '==='].map(marker => (
                    <button
                      key={marker}
                      type="button"
                      onClick={() => setSceneMarker(marker)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        sceneMarker === marker
                          ? 'bg-purple-900/40 text-purple-300 border-purple-600'
                          : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-gray-200'
                      }`}
                    >
                      {marker}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={sceneMarker}
                  onChange={e => setSceneMarker(e.target.value)}
                  placeholder="Nhập ký hiệu phân cảnh tùy chỉnh..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-purple-500"
                />
              </div>
            )}

            {splitMode === 'equal_parts' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-300">Số lượng phần muốn chia:</span>
                  <span className="text-xs font-mono font-bold text-purple-400">{numParts} phần</span>
                </div>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map(parts => (
                    <button
                      key={parts}
                      type="button"
                      onClick={() => setNumParts(parts)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                        numParts === parts
                          ? 'bg-purple-900/40 text-purple-300 border-purple-600'
                          : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-gray-200'
                      }`}
                    >
                      {parts} phần (~{Math.round(totalWords / parts)} từ/phần)
                    </button>
                  ))}
                </div>
              </div>
            )}

            {splitMode === 'cursor' && (
              <div className="text-xs text-gray-400 leading-relaxed">
                Văn bản sẽ được ngắt thành 2 chương con tại vị trí con trỏ chuột hiện thời trong khung soạn thảo ({cursorPosition ? `ký tự thứ ${cursorPosition}` : 'vị trí giữa'}).
              </div>
            )}
          </div>

          {/* Interactive Preview List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Xem trước kết quả ({previewSegments.length} phân đoạn)
              </label>
              {previewSegments.length > 1 && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Đã sẵn sàng chia thành {previewSegments.length} chương
                </span>
              )}
            </div>

            <div className="space-y-3">
              {previewSegments.map((seg, idx) => (
                <div 
                  key={idx}
                  className="p-4 bg-gray-950/60 rounded-xl border border-gray-800/80 hover:border-gray-700/80 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 text-purple-300 font-bold shrink-0">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={seg.title}
                        onChange={e => handleTitleChange(idx, e.target.value)}
                        className="flex-1 px-2.5 py-1 bg-gray-900 border border-gray-800 rounded-lg text-xs font-semibold text-gray-100 focus:outline-none focus:border-purple-500"
                        placeholder="Tiêu đề chương con..."
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-gray-400 bg-gray-900 px-2 py-1 rounded border border-gray-800">
                        {seg.wordCount.toLocaleString()} từ
                      </span>
                      {idx < previewSegments.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMergeWithNext(idx)}
                          className="p-1 rounded text-gray-500 hover:text-amber-400 hover:bg-gray-800 transition-colors"
                          title="Gộp với phần tiếp theo"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-400 bg-gray-900/80 p-2.5 rounded-lg border border-gray-800/50 line-clamp-3 font-mono leading-relaxed select-none">
                    {seg.content.slice(0, 300)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between bg-gray-950/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Hủy bỏ
          </button>
          
          <button
            type="button"
            disabled={isProcessing || previewSegments.length <= 1}
            onClick={handleConfirmSplit}
            className="px-5 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shadow-lg shadow-purple-900/30 transition-all flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Đang xử lý tách chương...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
                Xác nhận Chia thành {previewSegments.length} Chương
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
