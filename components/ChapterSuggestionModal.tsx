
import React from 'react';
import { useStory } from '../context/StoryContext.tsx';

export const ChapterSuggestionModal: React.FC = () => {
    const { chapterSuggestion, setChapterSuggestion, addChapter } = useStory();

    if (!chapterSuggestion) return null;

    const handleAccept = async () => {
        await addChapter({
            title: chapterSuggestion.title,
            outline: chapterSuggestion.outline,
            summary: `Gợi ý từ AI: ${chapterSuggestion.conflict}`
        });
        setChapterSuggestion(null);
    };

    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
            <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border-t-4 border-t-emerald-500">
                <div className="p-6 border-b border-gray-800 bg-gray-850/50">
                    <h2 className="text-xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        Kiến tạo Chương tiếp theo
                    </h2>
                </div>

                <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tiêu đề đề xuất</label>
                        <div className="text-lg font-serif font-bold text-emerald-400">{chapterSuggestion.title}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-850 border border-gray-800 rounded-2xl">
                            <label className="text-[9px] font-black text-purple-400 uppercase block mb-1">Mục tiêu cảm xúc</label>
                            <p className="text-sm text-gray-200 italic">"{chapterSuggestion.emotionalGoal}"</p>
                        </div>
                        <div className="p-4 bg-gray-850 border border-gray-800 rounded-2xl">
                            <label className="text-[9px] font-black text-orange-400 uppercase block mb-1">Xung đột chính</label>
                            <p className="text-sm text-gray-200">{chapterSuggestion.conflict}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Dàn ý AI kiến nghị</label>
                        <div className="bg-black/20 p-4 rounded-2xl border border-white/5 font-serif text-sm text-gray-300 leading-relaxed whitespace-pre-wrap shadow-inner italic">
                            {chapterSuggestion.outline}
                        </div>
                    </div>

                    <div className="p-3 bg-blue-900/10 border border-blue-900/30 rounded-xl flex items-start gap-3">
                        <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <div>
                            <span className="text-[9px] font-black text-blue-400 uppercase block">Lưu ý Logic</span>
                            <p className="text-[11px] text-gray-400">{chapterSuggestion.logicCheck}</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-800 bg-gray-850/50 flex gap-3 justify-end">
                    <button onClick={() => setChapterSuggestion(null)} className="px-6 py-2.5 text-xs font-bold text-gray-400 hover:text-white transition-colors">Bỏ qua</button>
                    <button onClick={handleAccept} className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl transition-all">Thiết lập Chương này</button>
                </div>
            </div>
        </div>
    );
};
