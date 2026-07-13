
import React, { useState, useEffect } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { fastWordCount } from '../utils/wordCount.ts';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    summary: string;
    chapterId?: string;
}

export const SummaryViewModal: React.FC<Props> = ({ isOpen, onClose, title, summary, chapterId }) => {
    const { updateChapterSummary } = useStory();
    const [isEditing, setIsEditing] = useState(false);
    const [editedSummary, setEditedSummary] = useState(summary);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setEditedSummary(summary);
            setIsEditing(false);
            setIsCopied(false);
        }
    }, [isOpen, summary]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (chapterId) {
            updateChapterSummary(chapterId, editedSummary);
        }
        setIsEditing(false);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(editedSummary || summary);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const wordCount = fastWordCount(editedSummary);
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl h-[80vh] shadow-2xl overflow-hidden animate-fadeIn flex flex-col" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-850/50 shrink-0">
                    <div className="flex flex-col min-w-0 pr-4">
                        <h3 className="text-sm font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 truncate">
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Tóm tắt: {title}
                        </h3>
                        <div className="flex gap-3 mt-1">
                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-tighter">Độ dài: {wordCount} từ</span>
                            <span className="text-[9px] text-gray-500 uppercase font-bold tracking-tighter">~{readingTime} phút đọc</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                        <button 
                            onClick={handleCopy}
                            className={`p-2 rounded-lg transition-all ${isCopied ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}
                            title="Sao chép tóm tắt"
                        >
                            {isCopied ? (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            )}
                        </button>
                        <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Content Area (Scrollable) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-950/20 p-8 md:p-10">
                    {isEditing ? (
                        <textarea 
                            autoFocus
                            className="w-full h-full min-h-[300px] bg-transparent text-gray-200 font-serif text-lg leading-relaxed outline-none resize-none border-none focus:ring-0"
                            value={editedSummary}
                            onChange={(e) => setEditedSummary(e.target.value)}
                            placeholder="Nhập nội dung tóm tắt tại đây..."
                        />
                    ) : (
                        <div className="animate-fadeIn pb-10">
                             <p className="text-gray-300 font-serif text-lg md:text-xl leading-relaxed italic whitespace-pre-wrap">
                                "{editedSummary || summary || "Chương này chưa có nội dung tóm tắt."}"
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex flex-wrap gap-4 justify-between items-center shrink-0">
                    <div className="text-[10px] text-gray-600 italic">
                        {isEditing ? "Đang trong chế độ chỉnh sửa thủ công." : "Dùng con lăn chuột để xem toàn bộ nội dung."}
                    </div>
                    <div className="flex gap-3">
                        {isEditing ? (
                            <>
                                <button 
                                    onClick={() => { setEditedSummary(summary); setIsEditing(false); }}
                                    className="px-5 py-2 text-gray-400 text-xs font-bold hover:text-white transition-colors"
                                >
                                    Hủy
                                </button>
                                <button 
                                    onClick={handleSave}
                                    className="px-6 py-2 bg-emerald-600 text-white text-xs font-black rounded-lg hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20"
                                >
                                    Lưu thay đổi
                                </button>
                            </>
                        ) : (
                            <>
                                <button 
                                    onClick={() => setIsEditing(true)}
                                    className="px-5 py-2 bg-gray-800 text-gray-300 text-xs font-bold rounded-lg hover:bg-gray-700 transition-colors border border-gray-700"
                                >
                                    Biên tập thủ công
                                </button>
                                <button 
                                    onClick={onClose} 
                                    className="px-8 py-2 bg-primary-600 text-white text-xs font-black rounded-lg hover:bg-primary-500 transition-all shadow-lg"
                                >
                                    Đã hiểu
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
