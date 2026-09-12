import React, { useState, useMemo } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { Chapter } from '../types.ts';
import { getCachedWordCount } from '../utils/wordCount.ts';
import { TranslationSettingsModal } from './TranslationSettingsModal.tsx';

interface TranslationsMenuProps {
  onOpenBilingualReview: (chapterId?: string) => void;
}

interface TranslationCardProps {
  chapter: Chapter;
  isActive: boolean;
  isViewingThisTranslation: boolean;
  onSelect: (chapter: Chapter) => void;
  onReview: (chapterId: string) => void;
  onTranslate: (chapterId: string) => void;
  onPromote: (chapter: Chapter) => void;
  isGenerating: boolean;
}

const TranslationCard = React.memo<TranslationCardProps>(({
  chapter,
  isActive,
  isViewingThisTranslation,
  onSelect,
  onReview,
  onTranslate,
  onPromote,
  isGenerating
}) => {
  const hasTranslation = !!chapter.translatedContent && chapter.translatedContent.trim().length > 0;
  const transWords = hasTranslation ? getCachedWordCount(chapter.id + '_trans', chapter.translatedContent, chapter.translationLastUpdated) : 0;
  const origWords = getCachedWordCount(chapter.id, chapter.originalContent || chapter.content || '', chapter.lastUpdated);

  return (
    <div
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
              onClick={() => onSelect(chapter)}
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
              onClick={() => onReview(chapter.id)}
              className="py-1 px-2 bg-blue-950/50 hover:bg-blue-900/50 text-blue-300 border border-blue-800/50 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1"
              title="Mở đối soát song ngữ hai cột đối chiếu"
            >
              <span>⚖️ Đối soát</span>
            </button>

            <button
              onClick={() => onTranslate(chapter.id)}
              disabled={isGenerating}
              className="py-1 px-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-[10px] transition-all disabled:opacity-40"
              title="Dịch lại chương này"
            >
              🔄
            </button>

            <button
              onClick={() => onPromote(chapter)}
              className="py-1 px-2 bg-purple-950/50 hover:bg-purple-900/50 text-purple-300 border border-purple-800/50 rounded-lg text-[10px] transition-all"
              title="Thay thế nội dung chính bằng bản dịch này"
            >
              ⭐
            </button>
          </>
        ) : (
          <button
            onClick={() => onTranslate(chapter.id)}
            disabled={isGenerating}
            className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span>⚡ Dịch ngay</span>
          </button>
        )}
      </div>
    </div>
  );
});

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
  const [displayCount, setDisplayCount] = useState(50);

  // Lấy danh sách các chương nguyên tác (không tính các chương phụ tách rời)
  const chapters = useMemo(() => {
    if (!story) return [];
    return [...story.chapters]
      .filter(c => !c.isTranslation && !c.title.startsWith('[Việt Hóa]'))
      .sort((a, b) => a.order - b.order);
  }, [story]);

  // Thống kê tiến độ dịch sử dụng LRU cached word count
  const stats = useMemo(() => {
    const total = chapters.length;
    let translatedCount = 0;
    let totalTranslatedWords = 0;
    let totalOriginalWords = 0;

    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i];
      const hasTrans = !!c.translatedContent && c.translatedContent.trim().length > 0;
      if (hasTrans) {
        translatedCount++;
        totalTranslatedWords += getCachedWordCount(c.id + '_trans', c.translatedContent, c.translationLastUpdated);
      }
      totalOriginalWords += getCachedWordCount(c.id, c.originalContent || c.content || '', c.lastUpdated);
    }
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

  const displayedChapters = useMemo(() => {
    return filteredChapters.slice(0, displayCount);
  }, [filteredChapters, displayCount]);

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
          <>
            {displayedChapters.map((chapter) => (
              <TranslationCard
                key={chapter.id}
                chapter={chapter}
                isActive={activeChapterId === chapter.id}
                isViewingThisTranslation={activeChapterId === chapter.id && editorVersion === 'translation'}
                onSelect={handleSelectChapterTranslation}
                onReview={(id) => onOpenBilingualReview(id)}
                onTranslate={(id) => {
                  selectChapter(id);
                  translateChapter(id);
                }}
                onPromote={promoteTranslationToMain}
                isGenerating={isGenerating}
              />
            ))}

            {filteredChapters.length > displayCount && (
              <button
                onClick={() => setDisplayCount(prev => prev + 50)}
                className="w-full py-2 bg-gray-950 hover:bg-gray-800 text-emerald-400 border border-emerald-900/40 rounded-xl text-[10px] font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <span>Xem thêm 50 chương nữa (còn {filteredChapters.length - displayCount} chương)</span>
                <span>↓</span>
              </button>
            )}
          </>
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
