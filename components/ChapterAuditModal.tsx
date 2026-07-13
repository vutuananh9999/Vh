
import React from 'react';
import { useStory } from '../context/StoryContext.tsx';

export const ChapterAuditModal: React.FC = () => {
    const { chapterAuditReport, clearChapterAuditReport } = useStory();

    if (!chapterAuditReport) return null;

    const { 
        internalConsistency = [], 
        characterLogic = [], 
        worldRuleViolations = [], 
        pacingAnalysis = "" 
    } = chapterAuditReport;

    const hasIssues = internalConsistency.length > 0 || characterLogic.length > 0 || worldRuleViolations.length > 0;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-850/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            Kiểm toán Logic Chương
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">Phân tích mâu thuẫn và tính hợp lý trong chương hiện tại.</p>
                    </div>
                    <button onClick={clearChapterAuditReport} className="text-gray-500 hover:text-white transition-colors p-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {/* Internal Consistency */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                            Mâu thuẫn Nội tại
                        </h3>
                        {internalConsistency.length > 0 ? (
                            <div className="grid gap-3">
                                {internalConsistency.map((item: any, i: number) => (
                                    <div key={i} className="bg-gray-850 border border-gray-800 p-4 rounded-xl border-l-2 border-l-blue-500">
                                        <p className="text-xs text-gray-200 mb-2 font-medium">⚠️ {item.issue}</p>
                                        <div className="text-xs text-emerald-400/90 bg-emerald-950/20 p-2 rounded">
                                            💡 Gợi ý: {item.suggestion}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-600 italic px-4">Không tìm thấy mâu thuẫn hành động hoặc vật lý.</p>
                        )}
                    </div>

                    {/* Character Logic */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                            Nhân vật (Out of Character)
                        </h3>
                        {characterLogic.length > 0 ? (
                            <div className="grid gap-3">
                                {characterLogic.map((item: any, i: number) => (
                                    <div key={i} className="bg-gray-850 border border-gray-800 p-4 rounded-xl border-l-2 border-l-purple-500">
                                        <div className="font-bold text-purple-400 text-xs mb-1 uppercase tracking-tighter">{item.character}</div>
                                        <p className="text-xs text-gray-200 mb-2 font-medium">⚠️ {item.issue}</p>
                                        <div className="text-xs text-emerald-400/90 bg-emerald-950/20 p-2 rounded">
                                            💡 Gợi ý: {item.suggestion}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-600 italic px-4">Các nhân vật hành động đúng thiết lập.</p>
                        )}
                    </div>

                    {/* World Rule Violations */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                            Vi phạm Quy tắc Thế giới
                        </h3>
                        {worldRuleViolations.length > 0 ? (
                            <div className="grid gap-3">
                                {worldRuleViolations.map((item: any, i: number) => (
                                    <div key={i} className="bg-gray-850 border border-gray-800 p-4 rounded-xl border-l-2 border-l-orange-500">
                                        <div className="font-bold text-orange-400 text-xs mb-1 uppercase tracking-tighter">{item.rule}</div>
                                        <p className="text-xs text-gray-200 font-medium">⚠️ {item.issue}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-600 italic px-4">Chương này tuân thủ đúng các quy tắc bối cảnh.</p>
                        )}
                    </div>

                    {/* Pacing Analysis */}
                    <div className="space-y-4 pt-4 border-t border-gray-800">
                         <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                            Phân tích Nhịp điệu & Pacing
                        </h3>
                        <div className="bg-emerald-900/5 border border-emerald-900/20 p-4 rounded-xl">
                            <p className="text-xs text-gray-300 leading-relaxed italic">
                                "{pacingAnalysis || "Chưa có nhận xét về nhịp điệu."}"
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-800 bg-gray-850/50 flex justify-end">
                    <button 
                        onClick={clearChapterAuditReport} 
                        className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-black text-sm shadow-lg transition-all"
                    >
                        Tiếp tục viết
                    </button>
                </div>
            </div>
        </div>
    );
};
