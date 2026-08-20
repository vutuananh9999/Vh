import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Chapter, ChatMessage } from '../types.ts';
import { useStory } from '../context/StoryContext.tsx';
import { fastWordCount } from '../utils/wordCount.ts';
import { ChapterTimelineCard } from './plot-arc/ChapterTimelineCard.tsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    chapters: Chapter[];
    storyTitle: string;
}

interface Proposal {
    type: 'planning' | 'outline' | 'summary' | 'content';
    chapterId?: string;
    chapterTitle?: string;
    content: string;
    originalContent: string;
}

export const PlotArcModal: React.FC<Props> = ({ isOpen, onClose, chapters, storyTitle }) => {
    const { 
        story,
        analyzeStoryPlotArc, 
        plotArcAnalysis, 
        isAnalyzingPlotArc, 
        summarizeChapter,
        isSummarizing,
        isSequentiallySummarizing,
        sequentialSummaryProgress,
        summarizeAllChaptersSequentially,
        generateChapterContentFromPlot,
        sendPlotChatMessage,
        clearPlotChat,
        isPlotPlanning,
        updateStorySettings,
        updateChapterOutline,
        updateChapterSummary,
        activeChapterId,
        updateChapterContent
    } = useStory();

    const [activeTab, setActiveTab] = useState<'timeline' | 'intelligence' | 'co-edit'>('timeline');
    const [coEditSubTab, setCoEditSubTab] = useState<'chat' | 'proposals'>('chat');
    const [coEditInput, setCoEditInput] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const [isAutoAnalyze, setIsAutoAnalyze] = useState(() => {
        return localStorage.getItem('aetheria_auto_analyze_plot') !== 'false';
    });

    const prevHashRef = useRef('');

    const [chapterSearch, setChapterSearch] = useState('');
    const [visibleChapterCount, setVisibleChapterCount] = useState(40);
    const [activeChapterTabs, setActiveChapterTabs] = useState<Record<string, 'summary' | 'outline' | 'content'>>({});
    const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
    const [editingField, setEditingField] = useState<'summary' | 'outline' | 'content'>('summary');
    const [editingValue, setEditingValue] = useState('');
    const [generatingContentChapterId, setGeneratingContentChapterId] = useState<string | null>(null);

    const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

    const toggleChapterExpand = useCallback((chapterId: string) => {
        setExpandedChapters(prev => ({
            ...prev,
            [chapterId]: !prev[chapterId]
        }));
    }, []);

    const expandAllChapters = useCallback(() => {
        const expanded: Record<string, boolean> = {};
        (chapters || []).forEach(ch => {
            expanded[ch.id] = true;
        });
        setExpandedChapters(expanded);
    }, [chapters]);

    const collapseAllChapters = useCallback(() => {
        setExpandedChapters({});
    }, []);

    useEffect(() => {
        if (isOpen && activeChapterId) {
            setExpandedChapters(prev => ({
                ...prev,
                [activeChapterId]: true
            }));
        }
    }, [isOpen, activeChapterId]);

    const getChapterTab = useCallback((chapterId: string) => {
        return activeChapterTabs[chapterId] || 'summary';
    }, [activeChapterTabs]);

    const setChapterTab = useCallback((chapterId: string, tab: 'summary' | 'outline' | 'content') => {
        setActiveChapterTabs(prev => ({ ...prev, [chapterId]: tab }));
        if (editingChapterId === chapterId) {
            const ch = (chapters || []).find(c => c.id === chapterId);
            if (ch) {
                setEditingField(tab);
                setEditingValue(ch[tab] || '');
            }
        }
    }, [editingChapterId, chapters]);

    const startEditing = useCallback((chapterId: string, field: 'summary' | 'outline' | 'content') => {
        const ch = (chapters || []).find(c => c.id === chapterId);
        if (ch) {
            setEditingChapterId(chapterId);
            setEditingField(field);
            setEditingValue(ch[field] || '');
        }
    }, [chapters]);

    const cancelEditing = useCallback(() => {
        setEditingChapterId(null);
    }, []);

    const saveEditing = useCallback(async () => {
        if (!editingChapterId) return;
        try {
            if (editingField === 'summary') {
                await updateChapterSummary(editingChapterId, editingValue);
            } else if (editingField === 'outline') {
                await updateChapterOutline(editingChapterId, editingValue);
            } else if (editingField === 'content') {
                await updateChapterContent(editingChapterId, editingValue);
            }
            setToast("🎉 Đã cập nhật nội dung thành công!");
            setEditingChapterId(null);
        } catch (e) {
            setToast("❌ Lỗi khi cập nhật nội dung.");
        }
    }, [editingChapterId, editingField, editingValue, updateChapterSummary, updateChapterOutline, updateChapterContent]);

    const handleSummarize = useCallback(async (id: string) => {
        await summarizeChapter(id);
    }, [summarizeChapter]);

    const handleGenerateChapterContent = useCallback(async (chapterId: string) => {
        setGeneratingContentChapterId(chapterId);
        try {
            await generateChapterContentFromPlot(chapterId);
            setToast("🎉 Đã dùng AI tự động soạn thảo/sửa nội dung bản thảo dựa trên cốt truyện và đề cương thành công!");
        } catch (e) {
            console.error(e);
            setToast("❌ Lỗi khi tự động soạn thảo bằng AI.");
        } finally {
            setGeneratingContentChapterId(null);
        }
    }, [generateChapterContentFromPlot]);

    const onEditingValueChange = useCallback((val: string) => {
        setEditingValue(val);
    }, []);

    useEffect(() => {
        localStorage.setItem('aetheria_auto_analyze_plot', String(isAutoAnalyze));
    }, [isAutoAnalyze]);

    // Auto scroll chat to bottom
    useEffect(() => {
        if (activeTab === 'co-edit') {
            setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }, [story?.plotChatHistory, activeTab, isPlotPlanning]);

    // Toast auto-clear
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3500);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Automatic plot arc analysis on change or tab switch
    useEffect(() => {
        if (!isOpen || activeTab !== 'intelligence' || !isAutoAnalyze) return;
        if (isSequentiallySummarizing) return;

        const currentHash = (chapters || []).map(c => `${c.id}:${c.summary?.length || 0}:${c.content?.length || 0}`).join('|');

        if (currentHash !== prevHashRef.current && !isAnalyzingPlotArc) {
            prevHashRef.current = currentHash;
            analyzeStoryPlotArc();
        }
    }, [isOpen, activeTab, isAutoAnalyze, chapters, isAnalyzingPlotArc, isSequentiallySummarizing, analyzeStoryPlotArc]);

    const sortedChapters = useMemo(() => [...(chapters || [])].sort((a, b) => a.order - b.order), [chapters]);

    const filteredChapters = useMemo(() => {
        if (!chapterSearch.trim()) return sortedChapters;
        const q = chapterSearch.toLowerCase().trim();
        return sortedChapters.filter((c, idx) => 
            c.title.toLowerCase().includes(q) || 
            `chương ${idx + 1}`.includes(q) || 
            `chuong ${idx + 1}`.includes(q) ||
            `tập tin ${idx + 1}`.includes(q) ||
            (c.summary && c.summary.toLowerCase().includes(q))
        );
    }, [sortedChapters, chapterSearch]);

    const displayedChapters = useMemo(() => {
        return filteredChapters.slice(0, visibleChapterCount);
    }, [filteredChapters, visibleChapterCount]);

    const handleSendChat = async (messageText?: string) => {
        const textToSend = messageText || coEditInput;
        if (!textToSend.trim() || isPlotPlanning) return;
        
        if (!messageText) setCoEditInput('');
        const focusedId = activeChapterId || Object.keys(expandedChapters).find(k => expandedChapters[k]);
        await sendPlotChatMessage(textToSend, focusedId);
    };

    // Helper to strip proposed revision tags from rendering in Chat Bubble safely without RegExp backtracking
    const cleanMessageText = (text: string): string => {
        let result = "";
        let index = 0;
        const tagPrefixes = [
            '[PROPOSAL_PLANNING:',
            '[PROPOSAL_OUTLINE_CHAPTER_',
            '[PROPOSAL_SUMMARY_CHAPTER_',
            '[PROPOSAL_CONTENT_CHAPTER_'
        ];
        
        while (index < text.length) {
            const startIdx = text.indexOf('[', index);
            if (startIdx === -1) {
                result += text.substring(index);
                break;
            }
            
            result += text.substring(index, startIdx);
            
            let foundTag = false;
            for (const prefix of tagPrefixes) {
                if (text.startsWith(prefix, startIdx)) {
                    foundTag = true;
                    break;
                }
            }
            
            if (foundTag) {
                const endIdx = text.indexOf(']', startIdx);
                if (endIdx === -1) {
                    result += text.substring(startIdx);
                    break;
                }
                index = endIdx + 1;
            } else {
                result += '[';
                index = startIdx + 1;
            }
        }
        return result.trim();
    };

    // Helper to extract active proposals from chat logs safely without RegExp backtracking
    const parseProposals = (messages: ChatMessage[]): Proposal[] => {
        const proposals: Proposal[] = [];
        if (!messages) return proposals;

        messages.forEach((msg) => {
            if (msg.role !== 'model') return;
            const text = msg.parts?.[0]?.text || "";
            
            let index = 0;
            const tagPrefixes = [
                '[PROPOSAL_PLANNING:',
                '[PROPOSAL_OUTLINE_CHAPTER_',
                '[PROPOSAL_SUMMARY_CHAPTER_',
                '[PROPOSAL_CONTENT_CHAPTER_'
            ];
            
            while (index < text.length) {
                const startIdx = text.indexOf('[', index);
                if (startIdx === -1) break;
                
                let foundPrefix = "";
                for (const prefix of tagPrefixes) {
                    if (text.startsWith(prefix, startIdx)) {
                        foundPrefix = prefix;
                        break;
                    }
                }
                
                if (foundPrefix) {
                    const endIdx = text.indexOf(']', startIdx);
                    if (endIdx === -1) {
                        index = startIdx + 1;
                        continue;
                    }
                    
                    const tagContent = text.substring(startIdx, endIdx + 1);
                    
                    if (foundPrefix === '[PROPOSAL_PLANNING:') {
                        const content = tagContent.substring('[PROPOSAL_PLANNING:'.length, tagContent.length - 1).trim();
                        if (content) {
                            proposals.push({
                                type: 'planning',
                                content,
                                originalContent: story?.planning || ""
                            });
                        }
                    } else if (foundPrefix === '[PROPOSAL_OUTLINE_CHAPTER_') {
                        const colonIdx = tagContent.indexOf(':');
                        if (colonIdx !== -1) {
                            const chapterId = tagContent.substring('[PROPOSAL_OUTLINE_CHAPTER_'.length, colonIdx).trim();
                            const content = tagContent.substring(colonIdx + 1, tagContent.length - 1).trim();
                            const ch = (chapters || []).find(c => c.id === chapterId);
                            if (content && ch) {
                                proposals.push({
                                    type: 'outline',
                                    chapterId,
                                    chapterTitle: ch.title,
                                    content,
                                    originalContent: ch.outline || ""
                                });
                            }
                        }
                    } else if (foundPrefix === '[PROPOSAL_SUMMARY_CHAPTER_') {
                        const colonIdx = tagContent.indexOf(':');
                        if (colonIdx !== -1) {
                            const chapterId = tagContent.substring('[PROPOSAL_SUMMARY_CHAPTER_'.length, colonIdx).trim();
                            const content = tagContent.substring(colonIdx + 1, tagContent.length - 1).trim();
                            const ch = (chapters || []).find(c => c.id === chapterId);
                            if (content && ch) {
                                proposals.push({
                                    type: 'summary',
                                    chapterId,
                                    chapterTitle: ch.title,
                                    content,
                                    originalContent: ch.summary || ""
                                });
                            }
                        }
                    } else if (foundPrefix === '[PROPOSAL_CONTENT_CHAPTER_') {
                        const colonIdx = tagContent.indexOf(':');
                        if (colonIdx !== -1) {
                            const chapterId = tagContent.substring('[PROPOSAL_CONTENT_CHAPTER_'.length, colonIdx).trim();
                            const content = tagContent.substring(colonIdx + 1, tagContent.length - 1).trim();
                            const ch = (chapters || []).find(c => c.id === chapterId);
                            if (content && ch) {
                                proposals.push({
                                    type: 'content',
                                    chapterId,
                                    chapterTitle: ch.title,
                                    content,
                                    originalContent: ch.content || ""
                                });
                            }
                        }
                    }
                    
                    index = endIdx + 1;
                } else {
                    index = startIdx + 1;
                }
            }
        });

        const latestMap: { [key: string]: Proposal } = {};
        proposals.forEach(p => {
            const key = p.type === 'planning' ? 'planning' : `${p.type}_${p.chapterId}`;
            latestMap[key] = p;
        });

        return Object.values(latestMap);
    };

    const applyProposal = async (proposal: Proposal) => {
        try {
            if (proposal.type === 'planning') {
                await updateStorySettings({ planning: proposal.content });
                setToast("🎉 Đã áp dụng đề xuất Dàn ý tổng thể mới thành công!");
            } else if (proposal.type === 'outline' && proposal.chapterId) {
                await updateChapterOutline(proposal.chapterId, proposal.content);
                setToast(`🎉 Đã áp dụng đề xuất Đề cương mới cho "${proposal.chapterTitle}"!`);
            } else if (proposal.type === 'summary' && proposal.chapterId) {
                await updateChapterSummary(proposal.chapterId, proposal.content);
                setToast(`🎉 Đã áp dụng đề xuất Tóm tắt mới cho "${proposal.chapterTitle}"!`);
            } else if (proposal.type === 'content' && proposal.chapterId) {
                await updateChapterContent(proposal.chapterId, proposal.content);
                setToast(`🎉 Đã đồng bộ đề xuất nội dung vào Bản thảo chương "${proposal.chapterTitle}"!`);
            }
        } catch (e) {
            setToast("❌ Lỗi khi áp dụng đề xuất.");
        }
    };

    const activeProposals = useMemo(() => parseProposals(story?.plotChatHistory || []), [story?.plotChatHistory, chapters]);

    const activeChapter = (chapters || []).find(c => c.id === activeChapterId);

    if (!isOpen) return null;

    const promptPresets = [
        { label: "🔍 Tìm lỗ hổng bản thảo", prompt: "Hãy phân tích toàn bộ [BẢN THẢO THỰC TẾ] của các chương truyện và chỉ ra các lỗ hổng cốt truyện (plot holes), chi tiết cài cắm chưa mở, hoặc mâu thuẫn thời gian/hành vi." },
        ...(activeChapter ? [{
            label: `✍️ Sửa bản thảo: ${activeChapter.title}`,
            prompt: `Dựa trên [BẢN THẢO THỰC TẾ] của chương "${activeChapter.title}" (ID: ${activeChapter.id}), hãy chỉnh sửa và nâng cấp toàn diện bản thảo này theo đúng văn phong tác giả, bảo tồn 100% các chi tiết, tên nhân vật, đạo cụ, lời thoại và diễn biến gốc của nguyên mẫu (TUYỆT ĐỐI KHÔNG phóng tác từ tóm tắt làm mất chi tiết). Sau đó bọc toàn bộ nội dung hoàn chỉnh trong thẻ: [PROPOSAL_CONTENT_CHAPTER_${activeChapter.id}: <nội dung bản thảo mới đã sửa>]`
        }] : []),
        { label: "🎭 Nút thắt kịch tính", prompt: "Dựa trên các chi tiết và cài cắm đã xuất hiện trong [BẢN THẢO THỰC TẾ], hãy đề xuất một nút thắt (plot twist) bất ngờ nhưng hoàn toàn hợp logic để đẩy kịch tính lên cao trào." },
        { label: "⚔️ Đẩy mâu thuẫn nhân vật", prompt: "Phân tích diễn biến tâm lý và các lời thoại trong [BẢN THẢO THỰC TẾ] để đề xuất cách làm sắc nét hơn xung đột hoặc mâu thuẫn của nhân vật chính." },
        { label: "✨ Đề xuất bản chỉnh sửa dàn ý", prompt: "Dựa trên [BẢN THẢO THỰC TẾ] của các chương đã viết, hãy đề xuất một dàn ý phát triển tiếp theo hoàn chỉnh trong khối [PROPOSAL_PLANNING: ...] để tôi có thể áp dụng." }
    ];

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center sm:p-4 bg-black/95 backdrop-blur-md animate-fadeIn" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-850 sm:border-gray-800 rounded-none sm:rounded-3xl w-full max-w-6xl h-full sm:h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn border-t-4 border-t-emerald-500" onClick={e => e.stopPropagation()}>
                
                {/* Responsive Compact Header */}
                <div className="p-2.5 sm:p-3 border-b border-gray-800 flex flex-col md:flex-row md:justify-between md:items-center gap-2.5 bg-gray-850/50 shrink-0 relative pr-10 sm:pr-14">
                    <div className="flex items-center gap-2 min-w-0 pr-4 md:pr-0">
                        <div className="p-1 sm:p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 shrink-0">
                            <svg className="w-4 h-4 sm:w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xs sm:text-base font-bold text-white tracking-tight truncate leading-tight">{storyTitle}</h2>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 mt-0.5">
                                <p className="text-[7.5px] sm:text-[8.5px] text-emerald-500 uppercase tracking-[0.15em] font-black shrink-0">Plot Command Center v4.0</p>
                                <span className="text-gray-750 text-[8px] sm:text-[9px] shrink-0">•</span>
                                <div className="flex items-center gap-1 shrink-0">
                                    <span className="w-1 h-1 bg-emerald-500 rounded-full shrink-0"></span>
                                    <span className="text-[7.5px] sm:text-[8.5px] text-gray-500 font-bold uppercase tracking-tight">Tóm tắt: {sortedChapters.filter(c => c.summary).length}/{sortedChapters.length}</span>
                                </div>
                                <span className="text-gray-750 text-[8px] sm:text-[9px] shrink-0">•</span>
                                <div className="flex items-center gap-1 shrink-0">
                                    <span className="w-1 h-1 bg-purple-500 rounded-full animate-pulse shrink-0"></span>
                                    <span className="text-[7.5px] sm:text-[8.5px] text-gray-500 font-bold uppercase tracking-tight">Sync</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-row items-center gap-2 mt-0.5 md:mt-0 w-full md:w-auto overflow-x-auto sm:overflow-visible custom-scrollbar pb-0.5 sm:pb-0">
                        <button 
                            onClick={analyzeStoryPlotArc}
                            disabled={isAnalyzingPlotArc}
                            className={`flex items-center justify-center gap-1 px-2 py-1 bg-gradient-to-r from-purple-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white rounded-lg text-[9px] sm:text-[11px] font-bold shadow shadow-purple-950/40 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none shrink-0 ${isAnalyzingPlotArc ? 'animate-pulse' : ''}`}
                            title="Phân tích toàn bộ mạch truyện và tìm lỗ hổng"
                        >
                            {isAnalyzingPlotArc ? (
                                <>
                                    <svg className="animate-spin h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Đang phân tích...
                                </>
                            ) : (
                                <>
                                    <svg className="w-2.5 h-2.5 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    Phân tích Mạch truyện (AI)
                                </>
                            )}
                        </button>

                        <div className="flex bg-gray-950 rounded-lg p-0.5 border border-gray-800 shrink-0">
                            <button 
                                onClick={() => setActiveTab('timeline')} 
                                className={`px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9.5px] text-center font-black uppercase rounded-md transition-all ${activeTab === 'timeline' ? 'bg-emerald-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Timeline
                            </button>
                            <button 
                                onClick={() => setActiveTab('intelligence')} 
                                className={`px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9.5px] text-center font-black uppercase rounded-md transition-all ${activeTab === 'intelligence' ? 'bg-purple-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Intel
                            </button>
                            <button 
                                onClick={() => setActiveTab('co-edit')} 
                                className={`px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9.5px] text-center font-black uppercase rounded-md transition-all ${activeTab === 'co-edit' ? 'bg-rose-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                                Co-Edit
                            </button>
                        </div>
                    </div>

                    {/* Single Unified Close Button - compact & elegant */}
                    <button 
                        onClick={onClose} 
                        className="p-1 sm:p-1.5 text-gray-400 hover:text-white bg-gray-850 hover:bg-gray-800 rounded-full transition-all border border-gray-750 hover:border-gray-700 absolute top-2 sm:top-2.5 right-2 sm:right-3.5 z-20 shrink-0 shadow-md"
                        title="Đóng bảng điều khiển"
                    >
                        <svg className="w-3.5 h-3.5 sm:w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Floating Toast Notification */}
                {toast && (
                    <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-[200] bg-emerald-600 text-white font-bold py-3 px-6 rounded-2xl shadow-2xl border border-emerald-400/30 flex items-center gap-2 animate-bounce text-xs sm:text-sm">
                        <svg className="w-5 h-5 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        <span>{toast}</span>
                    </div>
                )}

                <div className="flex-1 flex overflow-hidden">
                    {/* Tab 1: Timeline */}
                    {activeTab === 'timeline' && (
                        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-10 custom-scrollbar bg-gray-950/20">
                            
                            {/* Prominent Control & Stat Banner at the top of Timeline */}
                            <div className="bg-gradient-to-r from-purple-950/40 via-emerald-950/20 to-gray-900 border border-purple-500/30 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 animate-fadeIn shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
                                <div className="space-y-2 relative z-10">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-2.5 w-2.5 relative">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
                                        </span>
                                        <h4 className="text-sm sm:text-base font-bold text-purple-300">Tính năng Phân tích & Theo dõi Mạch truyện tự động</h4>
                                    </div>
                                    <p className="text-xs text-gray-400 leading-relaxed max-w-2xl">
                                        Hệ thống AI tự động dò quét dàn ý, tóm tắt và bản thảo các chương để vẽ biểu đồ kịch tính, phát hiện lỗ hổng logic (plot holes), đề xuất các nút thắt gay cấn và dự đoán kịch bản kế tiếp.
                                    </p>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto shrink-0 relative z-10">
                                    <div className="flex items-center justify-between sm:justify-start gap-3 bg-black/40 px-4 py-2.5 rounded-xl border border-gray-800/80 w-full sm:w-auto">
                                        <span className="text-xs font-bold text-gray-400">Tự động phân tích:</span>
                                        <label className="relative inline-flex items-center cursor-pointer select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={isAutoAnalyze} 
                                                onChange={(e) => {
                                                    setIsAutoAnalyze(e.target.checked);
                                                    if (e.target.checked) {
                                                        analyzeStoryPlotArc();
                                                    }
                                                }}
                                                className="sr-only peer" 
                                            />
                                            <div className="w-10 h-6 bg-gray-800 border border-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
                                        </label>
                                    </div>

                                    <button 
                                        onClick={analyzeStoryPlotArc}
                                        disabled={isAnalyzingPlotArc || isSequentiallySummarizing}
                                        className={`flex items-center justify-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-purple-950/40 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none w-full sm:w-auto shrink-0 ${isAnalyzingPlotArc ? 'animate-pulse' : ''}`}
                                    >
                                        {isAnalyzingPlotArc ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Đang chạy AI...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4 text-purple-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                                Phân tích kịch tính toàn bộ
                                            </>
                                        )}
                                    </button>

                                    <button 
                                        onClick={summarizeAllChaptersSequentially}
                                        disabled={isSequentiallySummarizing || isAnalyzingPlotArc}
                                        className={`flex items-center justify-center gap-2 px-5 py-3 bg-emerald-650 hover:bg-emerald-550 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-950/40 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none w-full sm:w-auto shrink-0 ${isSequentiallySummarizing ? 'animate-pulse' : ''}`}
                                    >
                                        {isSequentiallySummarizing ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Đang tóm tắt...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                </svg>
                                                Tự động tóm tắt toàn bộ
                                            </>
                                        )}
                                    </button>

                                    <div className="flex bg-gray-950 rounded-xl p-1 border border-gray-800 w-full sm:w-auto shrink-0">
                                        <button 
                                            type="button"
                                            onClick={expandAllChapters}
                                            className="flex-1 sm:flex-none px-3 py-1.5 text-center text-[10px] font-black uppercase rounded-lg text-gray-400 hover:text-white transition-all"
                                            title="Mở rộng tất cả các chương"
                                        >
                                            Mở rộng tất cả
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={collapseAllChapters}
                                            className="flex-1 sm:flex-none px-3 py-1.5 text-center text-[10px] font-black uppercase rounded-lg text-gray-400 hover:text-white transition-all border-l border-gray-800"
                                            title="Thu gọn tất cả các chương"
                                        >
                                            Thu gọn tất cả
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {isSequentiallySummarizing && sequentialSummaryProgress && (
                                <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 animate-pulse shadow-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 shrink-0">
                                            <svg className="w-4 h-4 text-emerald-400 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Đang tự động tóm tắt tuần tự từng chương ({sequentialSummaryProgress.current}/{sequentialSummaryProgress.total})</div>
                                            <div className="text-xs text-white font-bold">{sequentialSummaryProgress.chapterTitle}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs font-black text-emerald-300 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 text-center shrink-0">
                                        {Math.round((sequentialSummaryProgress.current / sequentialSummaryProgress.total) * 100)}% Hoàn thành
                                    </div>
                                </div>
                            )}

                            {/* Search & Filter Bar for large stories (100+ chapters) */}
                            {sortedChapters.length > 5 && (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-gray-900/60 p-3 rounded-2xl border border-gray-800">
                                    <div className="relative flex-1">
                                        <svg className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            value={chapterSearch}
                                            onChange={(e) => setChapterSearch(e.target.value)}
                                            placeholder={`Tìm kiếm trong ${sortedChapters.length} chương (tiêu đề, số thứ tự, nội dung tóm tắt)...`}
                                            className="w-full pl-10 pr-8 py-2 bg-gray-950/80 border border-gray-750 focus:border-emerald-500 rounded-xl text-xs text-gray-200 outline-none transition-all placeholder:text-gray-500"
                                        />
                                        {chapterSearch && (
                                            <button
                                                type="button"
                                                onClick={() => setChapterSearch('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-2 text-[11px] text-gray-400 font-medium px-1">
                                        <span>Hiển thị <strong className="text-emerald-400">{displayedChapters.length}</strong> / {filteredChapters.length} chương</span>
                                    </div>
                                </div>
                            )}

                            {filteredChapters.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 bg-gray-900/20 rounded-2xl border border-gray-800">
                                    Không tìm thấy chương nào khớp với "{chapterSearch}".
                                </div>
                            ) : (
                                displayedChapters.map((ch, i) => {
                                    const currentTab = getChapterTab(ch.id);
                                    const isEditingThis = editingChapterId === ch.id;
                                    const isExpanded = expandedChapters[ch.id] || false;

                                    return (
                                        <ChapterTimelineCard
                                            key={ch.id}
                                            chapter={ch}
                                            index={i}
                                            isExpanded={isExpanded}
                                            currentTab={currentTab}
                                            isEditing={isEditingThis}
                                            editingValue={editingValue}
                                            isSummarizing={isSummarizing}
                                            isGeneratingContent={generatingContentChapterId === ch.id}
                                            onToggleExpand={toggleChapterExpand}
                                            onSetTab={setChapterTab}
                                            onStartEditing={startEditing}
                                            onCancelEditing={cancelEditing}
                                            onSaveEditing={saveEditing}
                                            onEditingValueChange={onEditingValueChange}
                                            onSummarize={handleSummarize}
                                            onGenerateContent={handleGenerateChapterContent}
                                        />
                                    );
                                })
                            )}

                            {/* Load more button for 100+ chapters */}
                            {filteredChapters.length > displayedChapters.length && (
                                <div className="text-center pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setVisibleChapterCount(prev => prev + 40)}
                                        className="px-6 py-3 bg-gray-900 hover:bg-gray-800 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg"
                                    >
                                        Tải thêm 40 chương tiếp theo (Còn {filteredChapters.length - displayedChapters.length} chương)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 2: Intelligence */}
                    {activeTab === 'intelligence' && (
                        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden bg-gray-950/20">
                            {/* Left Side: Overview & Concepts */}
                            <div className="flex-1 p-4 sm:p-8 space-y-6 sm:space-y-10 border-b md:border-b-0 md:border-r border-gray-800/60 overflow-y-visible md:overflow-y-auto custom-scrollbar">
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2">Mô hình Phân tích Mạch truyện tự động</h3>
                                    <p className="text-xs sm:text-sm text-gray-400 leading-relaxed max-w-2xl font-serif italic">
                                        "Một cốt truyện hoàn hảo không chỉ cần cao trào dồn dập, mà là nhịp độ bùng nổ đúng thời khắc và các nút thắt chưa giải quyết được rải đều hợp lý."
                                    </p>
                                </div>
                                <div className="border border-gray-800 bg-gray-950/40 p-4 sm:p-6 rounded-2xl">
                                    <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">Cấu trúc đề xuất chuẩn:</p>
                                    <ul className="text-xs text-gray-300 space-y-2 list-disc pl-5">
                                        <li>Mở đầu thiết lập thế giới và động cơ nhân vật chính.</li>
                                        <li>Cài cắm các chi tiết ẩn dụ (mồi nhử) và phát triển xung đột leo thang.</li>
                                        <li>Cao trào mang tính thay đổi toàn cục cốt truyện.</li>
                                    </ul>
                                </div>

                                <div className="border border-purple-500/20 bg-purple-950/10 p-4 sm:p-6 rounded-2xl space-y-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <h4 className="text-xs font-bold text-purple-300">Tự động phân tích cốt truyện</h4>
                                            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">Cập nhật biểu đồ kịch tính và lỗi logic ngay khi thay đổi dàn ý hoặc bản thảo chương.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                                            <input 
                                                type="checkbox" 
                                                checked={isAutoAnalyze} 
                                                onChange={(e) => {
                                                    setIsAutoAnalyze(e.target.checked);
                                                    if (e.target.checked) {
                                                        analyzeStoryPlotArc();
                                                    }
                                                }}
                                                className="sr-only peer" 
                                            />
                                            <div className="w-10 h-6 bg-gray-800 border border-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
                                        </label>
                                    </div>
                                    
                                    {isAutoAnalyze && (
                                        <div className="flex items-center gap-2 text-[10px] text-purple-350 bg-purple-950/30 px-3 py-2 rounded-xl border border-purple-500/10 animate-fadeIn">
                                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-ping shrink-0"></span>
                                            <span>Mạch truyện sẽ tự động cập nhật trong nền khi nội dung thay đổi.</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Right Side: Analytical Outputs */}
                            <div className="w-full md:w-96 bg-gray-900/40 p-4 sm:p-6 space-y-6 overflow-y-visible md:overflow-y-auto custom-scrollbar">
                                <div className="flex justify-between items-center">
                                    <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                        Plot Intelligence
                                    </h4>
                                    <button 
                                        onClick={analyzeStoryPlotArc}
                                        disabled={isAnalyzingPlotArc}
                                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg transition-all disabled:opacity-30"
                                    >
                                        {isAnalyzingPlotArc ? 'Analyzing...' : 'Refresh'}
                                    </button>
                                </div>

                                {!plotArcAnalysis ? (
                                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 opacity-50 grayscale">
                                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-700 flex items-center justify-center">
                                            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        </div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed max-w-[200px]">
                                            Nhấn Refresh để AI phân tích mạch truyện của bạn
                                        </p>
                                    </div>
                                ) : (() => {
                                    // Extremely defensive processing of the AI response to prevent application crashes
                                    const analysisObj = typeof plotArcAnalysis === 'object' && plotArcAnalysis !== null ? plotArcAnalysis : {};
                                    const arcAnalysis = typeof analysisObj.arcAnalysis === 'string' 
                                        ? analysisObj.arcAnalysis 
                                        : (typeof plotArcAnalysis === 'string' ? plotArcAnalysis : "Không có dữ liệu phân tích chi tiết.");
                                    
                                    const rawPacingHeatmap = analysisObj.pacingHeatmap;
                                    const pacingHeatmap = Array.isArray(rawPacingHeatmap)
                                        ? rawPacingHeatmap
                                        : (rawPacingHeatmap && typeof rawPacingHeatmap === 'object' 
                                            ? Object.values(rawPacingHeatmap) 
                                            : []);

                                    const rawUnresolvedHooks = analysisObj.unresolvedHooks;
                                    const unresolvedHooks = Array.isArray(rawUnresolvedHooks)
                                        ? rawUnresolvedHooks
                                        : (typeof rawUnresolvedHooks === 'string' && rawUnresolvedHooks.trim()
                                            ? [rawUnresolvedHooks]
                                            : []);

                                    const rawFuturePredictions = analysisObj.futurePredictions;
                                    const futurePredictions = Array.isArray(rawFuturePredictions)
                                        ? rawFuturePredictions
                                        : (typeof rawFuturePredictions === 'string' && rawFuturePredictions.trim()
                                            ? [rawFuturePredictions]
                                            : []);

                                    return (
                                        <div className="space-y-6 animate-fadeIn">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Cấu trúc & Nhịp điệu</label>
                                                <p className="text-xs text-gray-300 leading-relaxed font-serif bg-black/20 p-3 rounded-xl border border-white/5 shadow-inner whitespace-pre-wrap">
                                                    {arcAnalysis}
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Biểu đồ kịch tính</label>
                                                {pacingHeatmap.length > 0 ? (
                                                    <div className="flex items-end gap-1 h-12 bg-black/40 rounded-lg p-2">
                                                        {pacingHeatmap.map((val: any, i: number) => {
                                                            const numericVal = typeof val === 'number' ? val : parseFloat(val) || 0;
                                                            return (
                                                                <div 
                                                                    key={i} 
                                                                    className="flex-1 bg-emerald-500/50 rounded-t-sm hover:bg-emerald-400 transition-all cursor-help"
                                                                    style={{ height: `${Math.min(100, Math.max(5, numericVal))}%` }}
                                                                    title={`Chapter ${i+1}: Intensity ${numericVal}%`}
                                                                ></div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-gray-500 italic">Chưa thiết lập biểu đồ kịch tính.</p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Cài cắm chưa giải quyết (Hooks)</label>
                                                <div className="space-y-2">
                                                    {unresolvedHooks.length > 0 ? (
                                                        unresolvedHooks.map((hook: any, i: number) => (
                                                            <div key={i} className="text-[10px] text-orange-200/80 bg-orange-950/20 p-2 rounded-lg border-l-2 border-l-orange-500">
                                                                • {typeof hook === 'string' ? hook : JSON.stringify(hook)}
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <p className="text-[10px] text-gray-500 italic">Không tìm thấy cài cắm chưa giải quyết.</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-3 pt-4 border-t border-gray-800">
                                                <label className="text-[9px] font-black text-purple-400 uppercase tracking-widest block">Dự báo Tương lai (Foresight)</label>
                                                {futurePredictions.length > 0 ? (
                                                    futurePredictions.map((pred: any, i: number) => (
                                                        <div key={i} className="p-3 bg-purple-950/10 border border-purple-500/20 rounded-xl group hover:border-purple-500/40 transition-all">
                                                            <span className="text-[8px] font-black text-purple-500 uppercase block mb-1">Kịch bản {i+1}</span>
                                                            <p className="text-xs text-gray-200 leading-relaxed italic">"{typeof pred === 'string' ? pred : JSON.stringify(pred)}"</p>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-[10px] text-gray-500 italic">Chưa có dự báo.</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* Tab 3: Co-Edit (User-AI Collaborative plot & manuscript repair workshop) */}
                    {activeTab === 'co-edit' && (
                        <div className="flex-1 flex flex-col overflow-hidden bg-gray-950/40">
                            {/* Responsive Mobile Sub-Tab Bar - Displays ONLY on screens below lg */}
                            <div className="lg:hidden flex p-2 bg-gray-950/60 border-b border-gray-850 gap-2 shrink-0">
                                <button 
                                    onClick={() => setCoEditSubTab('chat')} 
                                    className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all ${
                                        coEditSubTab === 'chat' 
                                            ? 'bg-rose-600 text-white shadow-md' 
                                            : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    💬 Trò chuyện AI
                                </button>
                                <button 
                                    onClick={() => setCoEditSubTab('proposals')} 
                                    className={`flex-1 py-2 text-center text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
                                        coEditSubTab === 'proposals' 
                                            ? 'bg-rose-600 text-white shadow-md' 
                                            : 'text-gray-400 hover:text-gray-200'
                                    }`}
                                >
                                    📝 Đề xuất sửa đổi
                                    {activeProposals.length > 0 && (
                                        <span className="px-1.5 py-0.5 text-[8px] font-black bg-rose-500 text-white rounded-full animate-pulse shrink-0">
                                            {activeProposals.length}
                                        </span>
                                    )}
                                </button>
                            </div>

                            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                                {/* Left Column: Chat Container */}
                                <div className={`flex-1 flex flex-col h-full bg-gray-900/10 border-r border-gray-800/80 ${
                                    coEditSubTab === 'chat' ? 'flex' : 'hidden lg:flex'
                                }`}>
                                    {/* Chat Header Info */}
                                    <div className="p-3 sm:p-4 bg-gray-950/50 border-b border-gray-800/60 flex justify-between items-center">
                                        <div>
                                            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                                                <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
                                                Không gian Đồng Sáng Tạo Cốt Truyện
                                            </h3>
                                            <p className="text-[9px] sm:text-[10px] text-gray-400">Thảo luận sửa chữa lỗi logic, nút thắt kịch tính cùng AI</p>
                                        </div>
                                        <button 
                                            onClick={clearPlotChat}
                                            className="text-[9px] sm:text-[10px] bg-gray-850 hover:bg-gray-800 text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-gray-750 transition-colors"
                                        >
                                            Xóa hội thoại
                                        </button>
                                    </div>

                                    {/* Message Log */}
                                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
                                        {(!story?.plotChatHistory || story.plotChatHistory.length === 0) ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center p-6 sm:p-8 space-y-4 max-w-md mx-auto">
                                                <div className="p-4 bg-rose-500/10 rounded-full border border-rose-500/20">
                                                    <svg className="w-8 h-8 sm:w-10 h-10 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                    </svg>
                                                </div>
                                                <h4 className="text-sm sm:text-base font-bold text-white">Bạn đồng hành Cốt truyện AI đã sẵn sàng!</h4>
                                                <p className="text-xs text-gray-400 leading-relaxed font-serif italic">
                                                    "Chào tác giả! Tôi đã đọc hết tác phẩm của bạn. Hãy cùng nhau mổ xẻ mạch truyện, đặt các nút thắt đột phá và tối ưu hóa cấu trúc tác phẩm nhé!"
                                                </p>
                                            </div>
                                        ) : (
                                            story.plotChatHistory.map((msg, i) => {
                                                const isUser = msg.role === 'user';
                                                const cleanedText = cleanMessageText(msg.parts?.[0]?.text || "");
                                                if (!cleanedText && !isUser) return null; // Hide if text becomes completely empty (only tags existed)

                                                return (
                                                    <div key={i} className={`flex gap-3 max-w-[92%] sm:max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                                                        {/* Avatar Icon */}
                                                        <div className={`w-8 h-8 rounded-xl shrink-0 border flex items-center justify-center text-xs font-black uppercase ${isUser ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400'}`}>
                                                            {isUser ? 'U' : 'AI'}
                                                        </div>

                                                        <div className={`p-3.5 sm:p-4 rounded-2xl text-[13.5px] sm:text-sm border leading-relaxed whitespace-pre-wrap shadow-md ${
                                                            isUser 
                                                                ? 'bg-rose-950/20 border-rose-500/30 text-rose-100 rounded-tr-none' 
                                                                : 'bg-gray-800 border-gray-700/60 text-gray-200 rounded-tl-none font-serif shadow-inner'
                                                        }`}>
                                                            {cleanedText}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}

                                        {/* AI Typing Loader */}
                                        {isPlotPlanning && (
                                            <div className="flex gap-3 max-w-[85%] mr-auto">
                                                <div className="w-8 h-8 rounded-xl shrink-0 border flex items-center justify-center text-xs font-bold bg-purple-500/10 border-purple-500/20 text-purple-400 animate-pulse">
                                                    AI
                                                </div>
                                                <div className="flex items-center gap-2 p-3.5 sm:p-4 bg-gray-800/40 border border-gray-750 rounded-2xl rounded-tl-none">
                                                    <span className="text-[13px] sm:text-sm text-purple-400 font-bold animate-pulse">AI đang phân tích...</span>
                                                    <div className="flex gap-1">
                                                        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></div>
                                                        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                                        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={chatEndRef} />
                                    </div>



                                    {/* Chat Input bar */}
                                    <div className="p-3 sm:p-4 bg-gray-900/60 border-t border-gray-800 shrink-0">
                                        <div className="relative flex items-center bg-black/40 border border-gray-700 hover:border-gray-600 focus-within:border-rose-500 rounded-xl transition-all pl-1 pr-1.5 py-1 sm:py-1.5">
                                            <input 
                                                type="text"
                                                value={coEditInput}
                                                onChange={(e) => setCoEditInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                                disabled={isPlotPlanning}
                                                className="flex-1 bg-transparent px-3 py-1.5 sm:py-2 text-base sm:text-sm text-white outline-none placeholder:text-gray-600"
                                                placeholder="Nhập nội dung trao đổi cùng AI..."
                                            />
                                            <button 
                                                onClick={() => handleSendChat()}
                                                disabled={!coEditInput.trim() || isPlotPlanning}
                                                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-lg text-[10.5px] sm:text-xs uppercase tracking-wider transition-all disabled:opacity-40 active:scale-95 shrink-0 flex items-center gap-1 shadow-md"
                                            >
                                                ⚡ Gửi
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Revision Proposals Drawer */}
                                <div className={`w-full lg:w-96 flex flex-col h-full bg-gray-900/40 p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar ${
                                    coEditSubTab === 'proposals' ? 'flex' : 'hidden lg:flex'
                                }`}>
                                    <div className="shrink-0 border-b border-gray-800 pb-3">
                                        <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                                            <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                            Khung Đề Xuất Sửa Đổi
                                        </h4>
                                        <p className="text-[10px] text-gray-500 mt-1">Các thay đổi cốt truyện đề xuất được thu thập tại đây để xem trước & áp dụng.</p>
                                    </div>

                                    {activeProposals.length === 0 ? (
                                        <div className="flex-1 border border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 space-y-3 opacity-60">
                                            <div className="w-12 h-12 bg-gray-950 rounded-full flex items-center justify-center">
                                                <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                            </div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Chưa có đề xuất</p>
                                            <p className="text-[10px] text-gray-500 leading-relaxed max-w-[200px]">Hãy yêu cầu AI viết đề xuất trong ô chat (ví dụ có chứa PROPOSAL) để xuất hiện các thẻ xem trước tại đây.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {activeProposals.map((proposal, idx) => {
                                                const isPlanning = proposal.type === 'planning';
                                                const isOutline = proposal.type === 'outline';
                                                const isContent = proposal.type === 'content';
                                                const label = isPlanning 
                                                    ? "Dàn ý tổng thể truyện" 
                                                    : isOutline 
                                                        ? `Đề cương: ${proposal.chapterTitle}` 
                                                        : isContent
                                                            ? `Bản thảo: ${proposal.chapterTitle}`
                                                            : `Tóm tắt: ${proposal.chapterTitle}`;
                                                
                                                const borderClass = isPlanning 
                                                    ? "border-cyan-500/20 hover:border-cyan-500/40 bg-cyan-950/10" 
                                                    : isOutline 
                                                        ? "border-purple-500/20 hover:border-purple-500/40 bg-purple-950/10" 
                                                        : isContent
                                                            ? "border-rose-500/20 hover:border-rose-500/40 bg-rose-950/10"
                                                            : "border-orange-500/20 hover:border-orange-500/40 bg-orange-950/10";
                                                
                                                const badgeColor = isPlanning 
                                                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" 
                                                    : isOutline 
                                                        ? "bg-purple-500/10 text-purple-400 border-purple-500/20" 
                                                        : isContent
                                                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                                            : "bg-orange-500/10 text-orange-400 border-orange-500/20";

                                                return (
                                                    <div key={idx} className={`border rounded-2xl p-4 space-y-3 transition-all ${borderClass}`}>
                                                        <div className="flex justify-between items-center gap-2">
                                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border truncate ${badgeColor}`}>
                                                                {label}
                                                            </span>
                                                            <button 
                                                                onClick={() => applyProposal(proposal)}
                                                                className="text-[9px] bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase px-2.5 py-1.5 rounded-lg transition-all active:scale-95 shadow-md shrink-0"
                                                            >
                                                                Áp dụng
                                                            </button>
                                                        </div>

                                                        {/* Side-by-side / Compare View Box */}
                                                        <div className="space-y-2">
                                                            {proposal.originalContent && (
                                                                <div className="space-y-1">
                                                                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider block">Nội dung hiện tại:</span>
                                                                    <p className="text-[10px] text-gray-400 bg-black/30 p-2 rounded-lg max-h-20 overflow-y-auto font-mono whitespace-pre-wrap line-clamp-3">
                                                                        {proposal.originalContent}
                                                                    </p>
                                                                </div>
                                                            )}
                                                            <div className="space-y-1">
                                                                <span className="text-[8px] font-bold text-rose-400 uppercase tracking-wider block">Đề xuất cập nhật:</span>
                                                                <p className="text-[10px] text-gray-200 bg-black/60 p-2.5 rounded-lg border border-white/5 max-h-32 overflow-y-auto font-serif whitespace-pre-wrap">
                                                                    {proposal.content}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
