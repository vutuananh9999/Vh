import React, { useState, useMemo } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { Chapter } from '../types.ts';
import { fastWordCount } from '../utils/wordCount.ts';
import { TranslationSettingsModal } from './TranslationSettingsModal.tsx';

interface TranslationsMenuProps {
  onOpenBilingualReview: (chapterId?: string) => void;
}

export const TranslationsMenu: React.FC<TranslationsMenuProps> = ({ onOpenBilingualReview }) => {
  const {
    story,
    activeChapterId,
    selectChapter,
    translateChapter,
    isGenerating,
    editorVersion,
    setEditorVersion,
    exportAllTranslations,
    promoteTranslationToMain,
    isAutoTranslateEnabled,
    setIsAutoTranslateEnabled,
    translationOptions
  } = useStory();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'translated' | 'untranslated'>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Lấy danh sách các chương nguyên tác (không tính các chương phụ tách rời)
  const chapters = useMemo(() => {
    if (!story) return [];
    return [...story.chapters]
      .filter(c => !c.isTranslation && !c.title.startsWith('[Việt Hóa]'))
      .sort((a, b) => a.order - b.order);
  }, [story]);

  // Thống kê tiến độ dịch
  const stats = useMemo(() => {
    const total = chapters.length;
    const translatedList = chapters.filter(c => !!c.translatedContent && c.translatedContent.trim().length > 0);
    const translatedCount = translatedList.length;
    const totalTranslatedWords = translatedList.reduce((acc, c) => acc + fastWordCount(c.translatedContent || ''), 0);
    const totalOriginalWords = chapters.reduce((acc, c) => acc + fastWordCount(c.originalContent || c.content || ''), 0);
    const percent = total > 0 ? Math.round((translatedCount / total) * 100) : 0;
    return { total, translatedCount, totalTranslatedWords, totalOriginalWords, percent };
  }, [chapters]);

  // Lọc chương theo tìm kiếm và trạng thái
  const filteredChapters = useMemo(() => {
    return chapters.filter(ch => {
      const hasTranslation = !!ch.translatedContent && ch.translatedContent.trim().length > 0;
      if (filterMode === 'translated' && !hasTranslation) return false;
      if (filterMode === 'untranslated' && hasTranslation) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = ch.title.toLowerCase().includes(q);
        const matchTransTitle = ch.translatedTitle ? ch.translatedTitle.toLowerCase().includes(q) : false;
        return matchTitle || matchTransTitle;
      }
      return true;
    });
  }, [chapters, filterMode, searchQuery]);

  const handleSelectChapterTranslation = (chapter: Chapter) => {
    selectChapter(chapter.id);
    setEditorVersion('translation');
  };

  const handleTranslateAllUntranslated = async () => {
    const untranslated = chapters.filter(c => !c.translatedContent || c.translatedContent.trim().length === 0);
    if (untranslated.length === 0) {
      alert("Tất cả các chương đã có bản dịch!");
      return;
    }
    const first = untranslated[0];
    selectChapter(first.id);
    setIsAutoTranslateEnabled(true);
    translateChapter(first.id);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-3 space-y-3 bg-gray-900/60">
      
      {/* BANNER THỐNG KÊ TIẾN ĐỘ BẢN DỊCH */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-950/40 via-emerald-950/30 to-gray-900 border border-emerald-500/20 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">💎</span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              Menu Bản Dịch & Việt Hóa
            </h3>
          </div>
          <span className="text-xs font-extrabold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
            {stats.percent}% ({stats.translatedCount}/{stats.total})
          </span>
        </div>

        {/* Thanh tiến độ */}
        <div className="w-full h-1.5 bg-gray-950 rounded-full overflow-hidden border border-gray-800 mb-2.5">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500" 
            style={{ width: `${stats.percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-gray-400 mb-3">
          <span>Tổng số từ Việt hóa: <strong className="text-emerald-300">{stats.totalTranslatedWords.toLocaleString()}</strong> từ</span>
          <span>Nguyên tác: <strong>{stats.totalOriginalWords.toLocaleString()}</strong> từ</span>
        </div>

        {/* Nút tác vụ nhanh */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleTranslateAllUntranslated}
            disabled={isGenerating}
            className="py-2 px-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            title="Tự động dịch lần lượt tất cả các chương chưa dịch"
          >
            <span>⚡</span>
            <span>Dịch tự động loạt</span>
          </button>

          <button
            onClick={exportAllTranslations}
            disabled={stats.translatedCount === 0}
            className="py-2 px-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            title="Tải về file TXT gộp toàn bộ các chương đã Việt hóa"
          >
            <span>📥</span>
            <span>Xuất toàn bộ (.TXT)</span>
          </button>
        </div>

        {/* Nút tùy chỉnh phong cách dịch */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="w-full mt-2.5 py-1.5 px-3 bg-gray-950/80 hover:bg-gray-800 text-gray-300 hover:text-emerald-300 border border-gray-800 hover:border-emerald-500/40 rounded-xl text-[10px] font-medium transition-all flex items-center justify-between shadow-sm"
          title="Tùy chỉnh phong cách & đại từ xưng hô Việt hóa"
        >
          <span className="flex items-center gap-1.5">
            <span>⚙️</span>
            <span>Phong cách: <strong className="text-emerald-300 font-semibold">
              {translationOptions?.styleMode === 'wuxia' ? 'Tiên Hiệp' :
               translationOptions?.styleMode === 'fantasy' ? 'Tây Phương' :
               translationOptions?.styleMode === 'modern' ? 'Hiện Đại' : 'Thuần Việt'}
            </strong></span>
          </span>
          <span className="text-[9px] text-emerald-400 font-semibold">Tùy chỉnh →</span>
        </button>
      </div>

      {/* THANH TÌM KIẾM & BỘ LỌC */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm chương dịch..."
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 pl-8 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500/50"
          />
          <svg className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex rounded-xl bg-gray-950 p-1 border border-gray-800 text-[10px] font-bold">
          <button
            onClick={() => setFilterMode('all')}
            className={`flex-1 py-1 rounded-lg transition-all ${filterMode === 'all' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Tất cả ({chapters.length})
          </button>
          <button
            onClick={() => setFilterMode('translated')}
            className={`flex-1 py-1 rounded-lg transition-all ${filterMode === 'translated' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Đã dịch ({stats.translatedCount})
          </button>
          <button
            onClick={() => setFilterMode('untranslated')}
            className={`flex-1 py-1 rounded-lg transition-all ${filterMode === 'untranslated' ? 'bg-gray-800 text-orange-400' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Chưa dịch ({stats.total - stats.translatedCount})
          </button>
        </div>
      </div>

      {/* DANH SÁCH BẢN DỊCH TRONG MENU */}
      <div className="space-y-1.5">
        {filteredChapters.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-500">
            Không tìm thấy chương nào phù hợp
          </div>
        ) : (
          filteredChapters.map((chapter) => {
            const hasTranslation = !!chapter.translatedContent && chapter.translatedContent.trim().length > 0;
            const transWords = hasTranslation ? fastWordCount(chapter.translatedContent!) : 0;
            const origWords = fastWordCount(chapter.originalContent || chapter.content || '');
            const isActive = activeChapterId === chapter.id;
            const isViewingThisTranslation = isActive && editorVersion === 'translation';

            return (
              <div
                key={chapter.id}
                className={`p-2.5 rounded-xl border transition-all ${
                  isViewingThisTranslation
                    ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30'
                    : isActive
                    ? 'bg-gray-800/60 border-gray-700'
                    : 'bg-gray-900/40 border-gray-800/80 hover:bg-gray-800/40 hover:border-gray-700'
                }`}
              >
                {/* Dòng tiêu đề & Badge */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold truncate text-gray-200" title={chapter.title}>
                        {chapter.title}
                      </span>
                    </div>

                    {/* Tiêu đề bản dịch nếu có */}
                    {chapter.translatedTitle && (
                      <div className="text-[10px] text-emerald-400 font-medium truncate mt-0.5">
                        ↳ {chapter.translatedTitle}
                      </div>
                    )}
                  </div>

                  {/* Badge trạng thái */}
                  {hasTranslation ? (
                    <span className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-600/50 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span>Đã dịch</span>
                    </span>
                  ) : (
                    <span className="shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-950 text-gray-500 border border-gray-800">
                      Chưa dịch
                    </span>
                  )}
                </div>

                {/* Thống kê số từ */}
                <div className="flex items-center justify-between text-[9px] text-gray-500 mb-2">
                  {hasTranslation ? (
                    <>
                      <span>Bản dịch: <strong className="text-emerald-300 font-semibold">{transWords.toLocaleString()}</strong> từ</span>
                      <span>Gốc: {origWords.toLocaleString()} từ</span>
                    </>
                  ) : (
                    <span>Nguyên tác: {origWords.toLocaleString()} từ</span>
                  )}
                </div>

                {/* Hàng nút chức năng */}
                <div className="flex items-center gap-1 pt-1 border-t border-gray-800/60">
                  {hasTranslation ? (
                    <>
                      <button
                        onClick={() => handleSelectChapterTranslation(chapter)}
                        className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-semibold transition-all flex items-center justify-center gap-1 ${
                          isViewingThisTranslation
                            ? 'bg-emerald-600 text-white font-bold shadow'
                            : 'bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-800/50'
                        }`}
                        title="Mở xem và chỉnh sửa bản dịch trong Editor"
                      >
                        <span>{isViewingThisTranslation ? '✓ Đang xem' : '👁️ Xem bản dịch'}</span>
                      </button>

                      <button
                        onClick={() => onOpenBilingualReview(chapter.id)}
                        className="py-1 px-2 bg-blue-950/50 hover:bg-blue-900/50 text-blue-300 border border-blue-800/50 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1"
                        title="Mở đối soát song ngữ hai cột đối chiếu"
                      >
                        <span>⚖️ Đối soát</span>
                      </button>

                      <button
                        onClick={() => {
                          selectChapter(chapter.id);
                          translateChapter(chapter.id);
                        }}
                        disabled={isGenerating}
                        className="p-1 text-gray-500 hover:text-emerald-400 hover:bg-emerald-950/40 rounded-md transition-all"
                        title="Dịch lại chương này"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        selectChapter(chapter.id);
                        translateChapter(chapter.id);
                      }}
                      disabled={isGenerating}
                      className="w-full py-1.5 px-3 bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/50 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <span>⚡</span>
                      <span>Việt Hóa Ngay Chương Này</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL TÙY CHỈNH PHONG CÁCH VIỆT HÓA */}
      <TranslationSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
