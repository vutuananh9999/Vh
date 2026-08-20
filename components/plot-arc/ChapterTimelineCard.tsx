import React, { useMemo } from 'react';
import { Chapter } from '../../types.ts';
import { fastWordCount } from '../../utils/wordCount.ts';

interface ChapterTimelineCardProps {
    chapter: Chapter;
    index: number;
    isExpanded: boolean;
    currentTab: 'summary' | 'outline' | 'content';
    isEditing: boolean;
    editingValue: string;
    isSummarizing: boolean;
    isGeneratingContent: boolean;
    onToggleExpand: (chapterId: string) => void;
    onSetTab: (chapterId: string, tab: 'summary' | 'outline' | 'content') => void;
    onStartEditing: (chapterId: string, field: 'summary' | 'outline' | 'content') => void;
    onCancelEditing: () => void;
    onSaveEditing: () => void;
    onEditingValueChange: (val: string) => void;
    onSummarize: (chapterId: string) => void;
    onGenerateContent: (chapterId: string) => void;
}

export const ChapterTimelineCard: React.FC<ChapterTimelineCardProps> = React.memo(({
    chapter,
    index,
    isExpanded,
    currentTab,
    isEditing,
    editingValue,
    isSummarizing,
    isGeneratingContent,
    onToggleExpand,
    onSetTab,
    onStartEditing,
    onCancelEditing,
    onSaveEditing,
    onEditingValueChange,
    onSummarize,
    onGenerateContent
}) => {
    const wordCount = useMemo(() => fastWordCount(chapter.content), [chapter.content]);
    const editingWordCount = useMemo(() => isEditing ? fastWordCount(editingValue) : 0, [isEditing, editingValue]);

    const displayContent = isEditing
        ? editingValue
        : (currentTab === 'summary'
            ? chapter.summary
            : (currentTab === 'outline'
                ? chapter.outline
                : chapter.content));

    if (!isExpanded) {
        return (
            <div className="relative pl-8 sm:pl-12 border-l-2 border-emerald-900/30 animate-fadeIn">
                {/* Timeline Node */}
                <div className="absolute -left-[11px] top-4 w-5 h-5 rounded-full bg-gray-900 border-2 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                </div>

                <div 
                    onClick={() => onToggleExpand(chapter.id)}
                    className="bg-gray-850/40 border border-gray-800/60 hover:border-emerald-500/30 p-4 rounded-2xl relative group transition-all shadow-sm cursor-pointer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-emerald-500/70 uppercase tracking-[0.2em]">Tập tin {index + 1}</span>
                            <span className="text-[10px] text-gray-500 font-mono">| {wordCount} từ</span>
                        </div>
                        <h3 className="text-base font-serif font-bold text-gray-200 group-hover:text-emerald-400 transition-colors truncate">{chapter.title}</h3>
                        <p className="text-[11px] text-gray-400 font-serif italic line-clamp-1">
                            {chapter.summary || "Chưa có tóm tắt chương này."}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                        {/* Quick tab indicator badges */}
                        <div className="hidden md:flex items-center gap-1.5 text-[9px] font-bold text-gray-500">
                            <span className={`px-2 py-0.5 rounded ${chapter.summary ? 'bg-emerald-950/30 text-emerald-500/80' : 'bg-gray-900'}`}>Tóm tắt</span>
                            <span className={`px-2 py-0.5 rounded ${chapter.outline ? 'bg-purple-950/30 text-purple-500/80' : 'bg-gray-900'}`}>Đề cương</span>
                            <span className={`px-2 py-0.5 rounded ${chapter.content ? 'bg-rose-950/30 text-rose-500/80' : 'bg-gray-900'}`}>Bản thảo</span>
                        </div>
                        <div className="p-1.5 bg-gray-900 group-hover:bg-gray-800 border border-gray-800 rounded-lg text-gray-500 group-hover:text-gray-300 transition-all">
                            <svg className="w-4 h-4 transform group-hover:translate-y-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative pl-8 sm:pl-12 border-l-2 border-emerald-900/30 animate-fadeIn">
            {/* Timeline Node */}
            <div className="absolute -left-[11px] top-0 w-5 h-5 rounded-full bg-gray-900 border-2 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            </div>
            
            <div className="mb-4 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
                <div className="cursor-pointer group flex items-start gap-2" onClick={() => onToggleExpand(chapter.id)}>
                    <div>
                        <span className="text-[10px] font-black text-emerald-500/70 uppercase tracking-[0.2em] mb-1 block">Tập tin {index + 1}</span>
                        <h3 className="text-xl sm:text-2xl font-serif font-bold text-gray-100 group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                            {chapter.title}
                            <svg className="w-4 h-4 text-gray-500 group-hover:text-emerald-400 transform rotate-180 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </h3>
                    </div>
                </div>

                {/* Subtabs for Chapter attributes */}
                <div className="flex bg-gray-950 p-1 rounded-xl border border-gray-800 self-start">
                    <button 
                        onClick={() => onSetTab(chapter.id, 'summary')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentTab === 'summary' ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/25' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Tóm tắt
                    </button>
                    <button 
                        onClick={() => onSetTab(chapter.id, 'outline')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentTab === 'outline' ? 'bg-purple-600/10 text-purple-400 border border-purple-500/25' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Đề cương
                    </button>
                    <button 
                        onClick={() => onSetTab(chapter.id, 'content')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${currentTab === 'content' ? 'bg-rose-600/10 text-rose-400 border border-rose-500/25' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Bản thảo
                    </button>
                </div>
            </div>

            <div className="bg-gray-850/40 border border-gray-800 p-4 sm:p-6 rounded-2xl relative group hover:border-emerald-500/30 transition-all shadow-inner space-y-4">
                {isEditing ? (
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                Đang chỉnh sửa: {currentTab === 'summary' ? 'Tóm tắt' : currentTab === 'outline' ? 'Đề cương' : 'Bản thảo'}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono">
                                {editingValue.length} ký tự | {editingWordCount} từ
                            </span>
                        </div>
                        <textarea 
                            value={editingValue}
                            onChange={(e) => onEditingValueChange(e.target.value)}
                            className="w-full h-48 bg-gray-950 border border-gray-700 hover:border-gray-600 focus:border-emerald-500 rounded-xl p-4 text-xs sm:text-sm text-gray-200 font-serif leading-relaxed outline-none transition-all resize-y custom-scrollbar"
                            placeholder={`Nhập ${currentTab === 'summary' ? 'tóm tắt' : currentTab === 'outline' ? 'đề cương' : 'nội dung bản thảo'} của chương...`}
                        />
                        <div className="flex justify-end gap-2">
                            <button 
                                onClick={onCancelEditing}
                                className="px-4 py-2 bg-gray-900 hover:bg-gray-850 border border-gray-750 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-all"
                            >
                                Hủy bỏ
                            </button>
                            <button 
                                onClick={onSaveEditing}
                                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-primary-600 hover:from-emerald-500 hover:to-primary-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all"
                            >
                                Lưu thay đổi
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-start gap-4">
                            <div className="flex-1">
                                {displayContent ? (
                                    <p className="text-gray-300 font-serif text-sm sm:text-base leading-relaxed italic whitespace-pre-wrap">
                                        {displayContent}
                                    </p>
                                ) : (
                                    <p className="text-gray-500 font-serif text-xs sm:text-sm italic">
                                        {currentTab === 'summary' 
                                            ? "Chương này chưa được tóm tắt nhanh." 
                                            : (currentTab === 'outline' 
                                                ? "Đề cương chương này đang để trống." 
                                                : "Bản thảo chương này đang để trống. Hãy viết bản thảo tại không gian biên tập!")}
                                    </p>
                                )}
                            </div>
                            
                            <button 
                                onClick={() => onStartEditing(chapter.id, currentTab)}
                                className="w-full sm:w-auto px-4 py-2.5 sm:px-2.5 sm:py-1.5 bg-gray-900 hover:bg-gray-850 border border-gray-750 hover:border-gray-700 text-gray-400 hover:text-emerald-400 rounded-xl sm:rounded-lg text-xs sm:text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shrink-0"
                                title="Sửa nội dung"
                            >
                                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Sửa nội dung
                            </button>
                        </div>

                        {currentTab === 'summary' && (
                            <div className="pt-2 border-t border-gray-800/40 flex flex-col sm:flex-row sm:items-center gap-2">
                                <button 
                                    onClick={() => onSummarize(chapter.id)}
                                    disabled={isSummarizing}
                                    className={`w-full sm:w-auto px-4 py-2.5 sm:px-3 sm:py-1.5 bg-emerald-650/10 hover:bg-emerald-650/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs sm:text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${isSummarizing ? 'animate-pulse cursor-not-allowed' : ''}`}
                                >
                                    <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    {isSummarizing ? "Đang tóm tắt bằng AI..." : (chapter.summary ? "🔄 Cập nhật Tóm tắt bằng AI" : "⚡ Tự động Tóm tắt nhanh")}
                                </button>
                                <span className="text-[10px] text-gray-500 italic text-center sm:text-left">
                                    *(Hỗ trợ tự động tóm tắt từ bản thảo hoặc đề cương)
                                </span>
                            </div>
                        )}

                        {currentTab === 'content' && (
                            <div className="pt-2 border-t border-gray-800/40 flex flex-col sm:flex-row sm:items-center gap-2">
                                <button 
                                    onClick={() => onGenerateContent(chapter.id)}
                                    disabled={isGeneratingContent}
                                    className={`w-full sm:w-auto px-4 py-2.5 sm:px-3 sm:py-1.5 bg-gradient-to-r from-purple-600/20 to-rose-600/20 hover:from-purple-600 hover:to-rose-600 text-purple-300 hover:text-white border border-purple-500/30 rounded-xl text-xs sm:text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${isGeneratingContent ? 'animate-pulse cursor-not-allowed' : ''}`}
                                >
                                    {isGeneratingContent ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4 sm:h-3.5 sm:w-3.5 text-purple-400" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Đang tự viết bằng AI...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            🤖 AI Tự động viết/sửa bản thảo theo cốt truyện
                                        </>
                                    )}
                                </button>
                                <span className="text-[10px] text-gray-500 italic text-center sm:text-left">
                                    *(Nâng cấp/Sinh bản thảo chi tiết dựa trên Đề cương và Tóm tắt mới của chương)
                                </span>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-gray-800/60 flex items-center gap-4">
                    <span className="text-[8px] text-gray-500 uppercase font-black tracking-widest">Độ dài bản thảo</span>
                    <span className="text-[10px] font-mono text-gray-400">
                        {(chapter.content || "").length} ký tự | {wordCount} từ
                    </span>
                    <div className="flex-1 h-1 bg-gray-950 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-rose-500" 
                            style={{ width: `${Math.min(100, ((chapter.content || "").length / 5000) * 100)}%` }}
                            title="Độ dài tương đối của chương"
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
});
