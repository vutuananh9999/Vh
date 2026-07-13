
import React, { useState } from 'react';
import { useStory } from '../context/StoryContext.tsx';

export const ConsistencyAuditModal: React.FC = () => {
    const { auditReport, clearAuditReport } = useStory();
    const [activeTab, setActiveTab] = useState<'chars' | 'world' | 'plot'>('chars');

    if (!auditReport) return null;

    const { 
        characterArcs = [], 
        worldBuildingGaps = [], 
        plotCoherence = { summary: "", plotHoles: [], blueprintAlignment: "" }, 
        overallScore = 0 
    } = auditReport;

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-400';
        if (score >= 60) return 'text-blue-400';
        if (score >= 40) return 'text-orange-400';
        return 'text-red-400';
    };

    const tabClass = (tab: typeof activeTab) => `
        flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2
        ${activeTab === tab 
            ? 'text-primary-400 border-primary-500 bg-primary-500/5' 
            : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-800/30'}
    `;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden border-t-4 border-t-primary-500">
                
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-850/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary-950/40 rounded-xl border border-primary-900/30">
                            <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Hồ sơ Kiểm toán Toàn hệ thống</h2>
                            <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-black">Aetheria Deep Audit Engine v2.0</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <div className={`text-3xl font-black ${getScoreColor(overallScore)}`}>{overallScore}%</div>
                            <div className="text-[9px] text-gray-500 uppercase font-black tracking-tighter">Consistency Index</div>
                        </div>
                        <button onClick={clearAuditReport} className="p-2 text-gray-500 hover:text-white transition-colors bg-gray-800 rounded-full">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex bg-gray-950/50 border-b border-gray-800">
                    <button onClick={() => setActiveTab('chars')} className={tabClass('chars')}>👤 Nhân vật & Arcs</button>
                    <button onClick={() => setActiveTab('plot')} className={tabClass('plot')}>📜 Cốt truyện & Logic</button>
                    <button onClick={() => setActiveTab('world')} className={tabClass('world')}>🌍 Thế giới & Bối cảnh</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gray-950/20">
                    
                    {activeTab === 'chars' && (
                        <div className="space-y-6 animate-fadeIn">
                            {characterArcs.length > 0 ? (
                                characterArcs.map((arc: any, i: number) => (
                                    <div key={i} className="bg-gray-850 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
                                        <div className="p-4 bg-gray-900/50 border-b border-gray-800 flex justify-between items-center">
                                            <h4 className="font-bold text-primary-400">{arc.character}</h4>
                                            <span className="text-[10px] text-gray-500 font-black uppercase">Character Arc Analysis</span>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            <div className="text-sm text-gray-300 leading-relaxed italic">
                                                {arc.analysis}
                                            </div>
                                            {arc.issues && arc.issues.length > 0 && (
                                                <div className="bg-red-900/10 border border-red-900/30 p-3 rounded-lg space-y-2">
                                                    <label className="text-[9px] font-black text-red-400 uppercase tracking-widest block">Mâu thuẫn phát hiện</label>
                                                    {arc.issues.map((issue: string, idx: number) => (
                                                        <div key={idx} className="text-xs text-red-200 flex items-start gap-2">
                                                            <span className="mt-1 w-1.5 h-1.5 bg-red-500 rounded-full shrink-0"></span>
                                                            {issue}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-20 opacity-30 italic text-sm">Không có dữ liệu nhân vật đáng kể.</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'plot' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="bg-gray-850 border border-gray-800 rounded-xl p-5 space-y-4">
                                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block">Tổng quan Cốt truyện</label>
                                <p className="text-sm text-gray-300 leading-relaxed font-serif">
                                    {plotCoherence.summary}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-gray-850 border border-gray-800 rounded-xl p-5 space-y-4">
                                    <label className="text-[10px] font-black text-red-400 uppercase tracking-widest block">Lỗ hổng Logic (Plot Holes)</label>
                                    {plotCoherence.plotHoles && plotCoherence.plotHoles.length > 0 ? (
                                        <div className="space-y-3">
                                            {plotCoherence.plotHoles.map((hole: string, i: number) => (
                                                <div key={i} className="text-xs text-red-200 bg-red-950/30 p-3 rounded-lg border-l-2 border-l-red-500">
                                                    {hole}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-600 italic">Không phát hiện lỗ hổng logic nghiêm trọng.</p>
                                    )}
                                </div>

                                <div className="bg-gray-850 border border-gray-800 rounded-xl p-5 space-y-4">
                                    <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">Độ bám sát Blueprint</label>
                                    <div className="text-xs text-emerald-100 bg-emerald-950/30 p-4 rounded-lg border-l-2 border-l-emerald-500 leading-relaxed">
                                        {plotCoherence.blueprintAlignment}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'world' && (
                        <div className="space-y-6 animate-fadeIn">
                            {worldBuildingGaps.length > 0 ? (
                                worldBuildingGaps.map((gap: any, i: number) => (
                                    <div key={i} className="bg-gray-850 border border-gray-800 rounded-xl p-5 border-l-4 border-l-orange-500 space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-bold text-orange-400 uppercase text-xs tracking-widest">{gap.topic}</h4>
                                            <span className="text-[9px] text-gray-500 font-black uppercase">World Rule Violation</span>
                                        </div>
                                        <div className="text-sm text-gray-200 font-medium">
                                            ⚠️ {gap.issue}
                                        </div>
                                        <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 rounded-lg text-xs text-emerald-300 leading-relaxed">
                                            <strong className="block text-[9px] uppercase tracking-tighter mb-1 opacity-60">Đề xuất giải pháp (Correction):</strong>
                                            {gap.fix}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-20 opacity-30 italic text-sm">Tính nhất quán của thế giới đang được bảo toàn hoàn hảo.</div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 bg-gray-850/50 flex justify-between items-center">
                    <p className="text-[10px] text-gray-500 italic">Dữ liệu được trích xuất dựa trên so sánh giữa Chapters và World Bible.</p>
                    <button 
                        onClick={clearAuditReport} 
                        className="px-10 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-black text-xs shadow-lg transition-all"
                    >
                        Tiếp nhận Báo cáo
                    </button>
                </div>
            </div>
        </div>
    );
};
