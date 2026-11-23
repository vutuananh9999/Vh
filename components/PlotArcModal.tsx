import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Chapter, ChatMessage, ContinuityLedgerEntry } from '../types.ts';
import { useStory } from '../context/StoryContext.tsx';
import { fastWordCount } from '../utils/wordCount.ts';
import { ChapterTimelineCard } from './plot-arc/ChapterTimelineCard.tsx';
import { PlotArcDebugConsole } from './plot-arc/PlotArcDebugConsole.tsx';
import { plotDebugLogger } from '../services/plotDebugLogger.ts';
import { runtimeKV } from '../services/runtimeAdapter.ts';
import { ragService } from '../services/ragService.ts';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    chapters: Chapter[];
    storyTitle: string;
}

interface Proposal {
    type: 'planning' | 'outline' | 'summary' | 'content' | 'ledger';
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
        plotArcError,
        isAnalyzingPlotArc, 
        scanStoryCharactersAndLore,
        isScanningStory,
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
        updateChapterContent,
        setPendingEdit,
        bumpEditorSyncToken
    } = useStory();

    const [activeTab, setActiveTab] = useState<'timeline' | 'intelligence' | 'co-edit' | 'ledger' | 'debug'>('timeline');
    const [focusedCoEditChapterId, setFocusedCoEditChapterId] = useState<string>('');
    const [debugErrorCount, setDebugErrorCount] = useState(0);
    const [ledgerSearch, setLedgerSearch] = useState('');
    const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
    const [editingLedgerText, setEditingLedgerText] = useState('');
    const [editingLedgerChapterId, setEditingLedgerChapterId] = useState<string>('global');
    const [isAddingLedger, setIsAddingLedger] = useState(false);
    const [newLedgerText, setNewLedgerText] = useState('');
    const [newLedgerChapterId, setNewLedgerChapterId] = useState<string>('global');

    useEffect(() => {
        const unsubscribe = plotDebugLogger.subscribe(logs => {
            const errs = logs.filter(l => l.status === 'rate_limit_429' || (l.status !== 'success' && l.status !== 'pending' && l.status !== 'streaming')).length;
            setDebugErrorCount(errs);
        });
        return () => unsubscribe();
    }, []);
    const [coEditSubTab, setCoEditSubTab] = useState<'chat' | 'proposals'>('chat');
    const [coEditInput, setCoEditInput] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const [isAutoAnalyze, setIsAutoAnalyze] = useState(() => {
        return runtimeKV.getItem('aetheria_auto_analyze_plot') !== 'false';
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
    const [expandedProposals, setExpandedProposals] = useState<Record<string, boolean>>({});

    const toggleExpandProposal = useCallback((key: string) => {
        setExpandedProposals(prev => ({ ...prev, [key]: !prev[key] }));
    }, []);

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
                setToast("🎉 Đã cập nhật tóm tắt & đồng bộ Sổ cái thành công!");
            } else if (editingField === 'outline') {
                await updateChapterOutline(editingChapterId, editingValue);
                setToast("🎉 Đã cập nhật đề cương thành công!");
            } else if (editingField === 'content') {
                await updateChapterContent(editingChapterId, editingValue);
                if (story) {
                    const nextStorySnapshot = {
                        ...story,
                        chapters: (story.chapters || []).map(c =>
                            c.id === editingChapterId ? { ...c, content: editingValue, lastUpdated: Date.now() } : c
                        )
                    };
                    const nextLedger = ragService.upsertChapterContinuityLedger(nextStorySnapshot, editingChapterId, {
                        mode: 'refresh_auto'
                    });
                    await updateStorySettings({ continuityLedger: nextLedger });
                }
                bumpEditorSyncToken();
                setToast("🎉 Đã cập nhật bản thảo & đồng bộ Sổ cái thành công!");
            }
            setEditingChapterId(null);
        } catch (e) {
            setToast("❌ Lỗi khi cập nhật nội dung.");
        }
    }, [editingChapterId, editingField, editingValue, story, updateChapterSummary, updateChapterOutline, updateChapterContent, updateStorySettings, bumpEditorSyncToken]);

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
        runtimeKV.setItem('aetheria_auto_analyze_plot', String(isAutoAnalyze));
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

    // Automatic plot arc analysis on change or tab switch (only when substantial text exists)
    useEffect(() => {
        if (!isOpen || activeTab !== 'intelligence' || !isAutoAnalyze) return;
        if (isSequentiallySummarizing) return;

        const hasText = (chapters || []).some(
            c => (c.content || c.translatedContent || c.summary || c.outline || '').trim().length >= 30
        );
        if (!hasText) return;

        const currentHash = (chapters || []).map(c => `${c.id}:${c.summary?.length || 0}:${c.content?.length || 0}`).join('|');

        if (currentHash !== prevHashRef.current && !isAnalyzingPlotArc) {
            prevHashRef.current = currentHash;
            analyzeStoryPlotArc();
        }
    }, [isOpen, activeTab, isAutoAnalyze, chapters, isAnalyzingPlotArc, isSequentiallySummarizing, analyzeStoryPlotArc]);

    const sortedChapters = useMemo(() => [...(chapters || [])].sort((a, b) => a.order - b.order), [chapters]);

    const prevActiveChapterIdRef = useRef<string | undefined>(activeChapterId);
    useEffect(() => {
        const activeChanged = prevActiveChapterIdRef.current !== activeChapterId;
        prevActiveChapterIdRef.current = activeChapterId;

        const stillExists = focusedCoEditChapterId
            ? sortedChapters.some(c => c.id === focusedCoEditChapterId)
            : false;

        if ((activeChanged && activeChapterId) || (!stillExists && (activeChapterId || sortedChapters.length > 0))) {
            setFocusedCoEditChapterId(activeChapterId || sortedChapters[0]?.id || '');
        }
    }, [activeChapterId, sortedChapters, focusedCoEditChapterId]);

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

    const handleSendChat = async (messageText?: string, overrideChapterId?: string) => {
        const textToSend = messageText || coEditInput;
        if (!textToSend.trim() || isPlotPlanning) return;
        
        if (!messageText) setCoEditInput('');
        const focusedId = overrideChapterId || focusedCoEditChapterId || activeChapterId || Object.keys(expandedChapters).find(k => expandedChapters[k]);
        await sendPlotChatMessage(textToSend, focusedId);
    };

    // Helper to resolve chapter flexibly by ID, order number ("2", "Chương 2", "c2"), or title
    const resolveChapter = useCallback((identifier: string | undefined): Chapter | undefined => {
        if (!chapters || chapters.length === 0) return undefined;
        if (!identifier || !identifier.trim()) {
            return (activeChapterId ? chapters.find(c => c.id === activeChapterId) : undefined) || chapters[0];
        }

        const cleanId = identifier.trim();
        // 1. Exact ID match
        let match = chapters.find(c => c.id === cleanId);
        if (match) return match;

        // 2. Numeric order match (e.g. "2" or "Chương 2" or "chuong 2" or "c2")
        const numMatch = cleanId.match(/\d+/);
        if (numMatch) {
            const orderNum = parseInt(numMatch[0], 10);
            match = chapters.find(c => c.order === orderNum);
            if (match) return match;
            if (orderNum >= 1 && orderNum <= chapters.length) {
                return chapters[orderNum - 1];
            }
        }

        // 3. Title match (case-insensitive substring)
        const lowerId = cleanId.toLowerCase();
        match = chapters.find(c => 
            c.title.toLowerCase().includes(lowerId) || 
            lowerId.includes(c.title.toLowerCase())
        );
        if (match) return match;

        // 4. Fallback to activeChapter or first chapter
        return (activeChapterId ? chapters.find(c => c.id === activeChapterId) : undefined) || chapters[0];
    }, [chapters, activeChapterId]);

    // Parse message into conversational text and interactive proposal blocks safely
    // CRITICAL: A proposal can ONLY be ended by the next [PROPOSAL_ tag or end of text.
    // Internal markdown brackets like [1], [Hệ thống], [Keng!] must NEVER prematurely cut off the chapter manuscript!
    const parseMessageData = useCallback((text: string): { cleanText: string; proposals: Proposal[] } => {
        if (!text) return { cleanText: "", proposals: [] };
        const raw = text.replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '').trim();
        
        const proposals: Proposal[] = [];
        let cleanText = "";
        let index = 0;

        while (index < raw.length) {
            // Match the beginning of any proposal tag
            const match = raw.slice(index).match(/\[PROPOSAL_(PLANNING|OUTLINE_CHAPTER_|SUMMARY_CHAPTER_|CONTENT_CHAPTER_|LEDGER_CHAPTER_|LEDGER\b)/i);
            if (!match || match.index === undefined) {
                cleanText += raw.substring(index);
                break;
            }

            const startIdx = index + match.index;
            // Any text prior to this proposal belongs to conversational cleanText
            cleanText += raw.substring(index, startIdx);

            const tagTypeRaw = match[1].toUpperCase();
            const prefixStr = match[0];
            const afterPrefixStart = startIdx + prefixStr.length;

            // Find where this proposal ends:
            // 1. Next proposal tag: [PROPOSAL_
            // 2. A closing bracket on its own line: \n\]\s*(?:\n|$)
            // 3. A closing bracket at the very end of the raw text: \]\s*$
            // 4. Or the end of the text (preserving streaming and unclosed outputs completely)
            const remainingFromTag = raw.slice(afterPrefixStart);
            const nextTagMatch = remainingFromTag.match(/\[PROPOSAL_(?:PLANNING|OUTLINE_CHAPTER_|SUMMARY_CHAPTER_|CONTENT_CHAPTER_|LEDGER_CHAPTER_|LEDGER\b)/i);
            
            let proposalEndIdx = -1;
            let nextIndex = raw.length;

            if (nextTagMatch && nextTagMatch.index !== undefined) {
                const endOfCurrentProposal = afterPrefixStart + nextTagMatch.index;
                proposalEndIdx = endOfCurrentProposal;
                nextIndex = endOfCurrentProposal;
            } else {
                const isolatedClosingBracket = remainingFromTag.search(/\n\]\s*$/);
                if (isolatedClosingBracket !== -1) {
                    proposalEndIdx = afterPrefixStart + isolatedClosingBracket;
                    nextIndex = raw.length;
                } else if (remainingFromTag.endsWith(']')) {
                    proposalEndIdx = raw.length - 1;
                    nextIndex = raw.length;
                } else {
                    proposalEndIdx = raw.length;
                    nextIndex = raw.length;
                }
            }

            const rawTagBody = raw.substring(afterPrefixStart, proposalEndIdx);

            const formatExistingLedger = (scopeId: string) =>
                (story?.continuityLedger || [])
                    .filter(e => (e.chapterId || 'global') === scopeId)
                    .map(e => `- ${e.content}`)
                    .join('\n');

            if (tagTypeRaw === 'PLANNING') {
                const cleanBody = rawTagBody
                    .replace(/^[:\]\s]+/, '')
                    .replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '')
                    .trim();
                if (cleanBody) {
                    proposals.push({
                        type: 'planning',
                        content: cleanBody,
                        originalContent: story?.planning || ""
                    });
                }
            } else if (tagTypeRaw === 'LEDGER') {
                const cleanBody = rawTagBody
                    .replace(/^[:\]\s]+/, '')
                    .replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '')
                    .trim();
                if (cleanBody) {
                    proposals.push({
                        type: 'ledger',
                        chapterId: 'global',
                        chapterTitle: 'Ghi chú chung toàn truyện',
                        content: cleanBody,
                        originalContent: formatExistingLedger('global')
                    });
                }
            } else {
                const type: Proposal['type'] = 
                    tagTypeRaw.startsWith('OUTLINE') ? 'outline' :
                    tagTypeRaw.startsWith('SUMMARY') ? 'summary' :
                    tagTypeRaw.startsWith('LEDGER') ? 'ledger' : 'content';

                // Look for delimiter separating chapter ID from content: e.g. "2: ...", "2]: ...", "2]\n...", "2\n..."
                const headerMatch = rawTagBody.match(/^([^:\n\]]+)(?:\]\s*:?|:\s*|\n\s*)([\s\S]*)$/);
                let rawId = "";
                let bodyContent = "";

                if (headerMatch) {
                    rawId = headerMatch[1].trim();
                    bodyContent = headerMatch[2].trim();
                } else {
                    rawId = rawTagBody.split('\n')[0].replace(/[\]:]/g, '').trim();
                    bodyContent = rawTagBody.slice(rawId.length).replace(/^[:\]\s]+/, '').trim();
                }

                bodyContent = bodyContent.replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '').trim();

                if (type === 'ledger' && rawId.toLowerCase() === 'global') {
                    if (bodyContent) {
                        proposals.push({
                            type: 'ledger',
                            chapterId: 'global',
                            chapterTitle: 'Ghi chú chung toàn truyện',
                            content: bodyContent,
                            originalContent: formatExistingLedger('global')
                        });
                    }
                } else {
                    const resolvedCh = resolveChapter(rawId);
                    const fallbackCh = resolvedCh || (activeChapterId ? chapters?.find(c => c.id === activeChapterId) : undefined) || (chapters && chapters[0]);
                    
                    const chapterId = fallbackCh?.id || rawId || 'ch_target';
                    const chapterTitle = fallbackCh?.title || (rawId ? `Chương ${rawId}` : 'Chương được chọn');

                    if (bodyContent) {
                        proposals.push({
                            type,
                            chapterId,
                            chapterTitle,
                            content: bodyContent,
                            originalContent:
                                type === 'content'
                                    ? (fallbackCh?.content || "")
                                    : type === 'outline'
                                        ? (fallbackCh?.outline || "")
                                        : type === 'ledger'
                                            ? formatExistingLedger(chapterId)
                                            : (fallbackCh?.summary || "")
                        });
                    }
                }
            }

            index = nextIndex;
        }

        return {
            cleanText: cleanText.replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '').trim(),
            proposals
        };
    }, [story?.planning, story?.continuityLedger, resolveChapter, activeChapterId, chapters]);

    // Helper to extract active proposals from chat logs
    const parseProposals = useCallback((messages: ChatMessage[]): Proposal[] => {
        const proposals: Proposal[] = [];
        if (!messages) return proposals;

        messages.forEach((msg) => {
            if (msg.role !== 'model') return;
            const text = msg.parts?.[0]?.text || "";
            const { proposals: msgProposals } = parseMessageData(text);
            proposals.push(...msgProposals);
        });

        const latestMap: { [key: string]: Proposal } = {};
        proposals.forEach(p => {
            const key = p.type === 'planning' ? 'planning' : `${p.type}_${p.chapterId || 'global'}`;
            latestMap[key] = p;
        });

        return Object.values(latestMap);
    }, [parseMessageData]);

    const activeProposals = useMemo(() => parseProposals(story?.plotChatHistory || []), [story?.plotChatHistory, parseProposals]);

    const applyProposal = async (proposal: Proposal, mode: 'replace' | 'append' = 'replace') => {
        try {
            if (proposal.type === 'planning') {
                const newPlanning = mode === 'append' && story?.planning 
                    ? `${story.planning}\n\n${proposal.content}` 
                    : proposal.content;
                await updateStorySettings({ planning: newPlanning });
                setToast("🎉 Đã áp dụng đề xuất Dàn ý tổng thể mới thành công!");
            } else if (proposal.type === 'ledger') {
                if (!story) return;
                const targetId = proposal.chapterId || 'global';
                const facts = ragService.parseLedgerLines(proposal.content);
                if (facts.length === 0) {
                    setToast("⚠️ Không tách được dòng ghi chú hợp lệ trong đề xuất Sổ cái.");
                    return;
                }
                const nextLedger = ragService.upsertChapterContinuityLedger(story, targetId, {
                    explicitFacts: facts,
                    mode: mode === 'append' ? 'append' : 'refresh_auto'
                });
                await updateStorySettings({ continuityLedger: nextLedger });
                setToast(
                    mode === 'append'
                        ? `📒 Đã thêm ${facts.length} mục mới vào Sổ cái (${proposal.chapterTitle || 'Toàn truyện'})!`
                        : `📒 Đã cập nhật ${facts.length} mục Sổ cái cho "${proposal.chapterTitle || 'Toàn truyện'}" (vẫn giữ nguyên các mục [Tác giả chốt])!`
                );
            } else if (proposal.type === 'outline' && proposal.chapterId) {
                const currentCh = chapters?.find(c => c.id === proposal.chapterId);
                const newOutline = mode === 'append' && currentCh?.outline 
                    ? `${currentCh.outline}\n\n${proposal.content}` 
                    : proposal.content;
                await updateChapterOutline(proposal.chapterId, newOutline);
                setToast(`🎉 Đã áp dụng đề xuất Đề cương mới cho "${proposal.chapterTitle}"!`);
            } else if (proposal.type === 'summary' && proposal.chapterId) {
                const currentCh = chapters?.find(c => c.id === proposal.chapterId);
                const newSummary = mode === 'append' && currentCh?.summary 
                    ? `${currentCh.summary}\n\n${proposal.content}` 
                    : proposal.content;
                await updateChapterSummary(proposal.chapterId, newSummary);
                setToast(`🎉 Đã áp dụng tóm tắt & tự động cập nhật Sổ cái cho "${proposal.chapterTitle}"!`);
            } else if (proposal.type === 'content' && proposal.chapterId) {
                const currentCh = chapters?.find(c => c.id === proposal.chapterId);
                const newContent = mode === 'append' && currentCh?.content 
                    ? `${currentCh.content}\n\n${proposal.content}` 
                    : proposal.content;
                await updateChapterContent(proposal.chapterId, newContent);

                // If AI also emitted a paired summary / ledger proposal for this chapter, auto-sync them to keep long-term memory & Sổ cái accurate
                const pairedSummary = activeProposals.find(
                    p => p.type === 'summary' && p.chapterId === proposal.chapterId && p.content?.trim()
                );
                const pairedLedger = activeProposals.find(
                    p => p.type === 'ledger' && p.chapterId === proposal.chapterId && p.content?.trim()
                );
                const appliedSummary = pairedSummary && mode === 'replace' ? pairedSummary.content : currentCh?.summary;

                if (pairedSummary && mode === 'replace') {
                    await updateChapterSummary(proposal.chapterId, pairedSummary.content);
                }

                if (story) {
                    const nextStorySnapshot = {
                        ...story,
                        chapters: (story.chapters || []).map(c =>
                            c.id === proposal.chapterId
                                ? {
                                      ...c,
                                      content: newContent,
                                      ...(appliedSummary !== undefined ? { summary: appliedSummary } : {}),
                                      lastUpdated: Date.now()
                                  }
                                : c
                        )
                    };
                    const explicitFacts =
                        pairedLedger && mode === 'replace'
                            ? ragService.parseLedgerLines(pairedLedger.content)
                            : undefined;
                    const nextLedger = ragService.upsertChapterContinuityLedger(nextStorySnapshot, proposal.chapterId, {
                        explicitFacts: explicitFacts && explicitFacts.length > 0 ? explicitFacts : undefined,
                        mode: 'refresh_auto'
                    });
                    await updateStorySettings({ continuityLedger: nextLedger });
                }

                bumpEditorSyncToken();
                setToast(mode === 'append' 
                    ? `🎉 Đã ghép nối tiếp nội dung & tự động cập nhật Sổ cái "${proposal.chapterTitle}"!` 
                    : pairedSummary || pairedLedger
                        ? `🎉 Đã đồng bộ bản thảo, tóm tắt & tự động cập nhật Sổ cái cho "${proposal.chapterTitle}"!`
                        : `🎉 Đã áp dụng bản thảo & tự động cập nhật Sổ cái cho "${proposal.chapterTitle}"!`);
            }
        } catch (e) {
            setToast("❌ Lỗi khi áp dụng đề xuất.");
        }
    };

    const handleContinueWritingProposal = useCallback((prop: Proposal) => {
        const lastExcerpt = prop.content.slice(-150).trim();
        const prompt = `Phần bản thảo chương "${prop.chapterTitle}" ở trên viết rất tốt nhưng dường như chưa ra hết toàn bộ nội dung (hoặc đang dừng ở giữa chừng).
Hãy VIẾT TIẾP TỤC toàn bộ phần còn lại, nối tiếp mượt mà ngay từ câu cuối cùng:
"...${lastExcerpt}"
Yêu cầu tối thượng: Viết toàn văn 100%, không tóm tắt, giữ trọn vẹn từng chi tiết, lời thoại và bối cảnh cho đến hết chương trong thẻ:
[PROPOSAL_CONTENT_CHAPTER_${prop.chapterId}: <nội dung viết tiếp hoàn chỉnh>]`;
        handleSendChat(prompt);
    }, [handleSendChat]);

    const activeChapter = (chapters || []).find(c => c.id === activeChapterId);
    const focusedChapter = (chapters || []).find(c => c.id === focusedCoEditChapterId) || activeChapter || sortedChapters[0];

    const handleRepairIssueInCoEdit = useCallback(async (issue: { chapterTitle?: string; chapterOrder?: number; issue: string; fixSuggestion?: string }) => {
        const target =
            (issue.chapterOrder ? sortedChapters.find(c => c.order === issue.chapterOrder) : undefined) ||
            (issue.chapterTitle ? resolveChapter(issue.chapterTitle) : undefined) ||
            focusedChapter;

        if (!target) return;
        setFocusedCoEditChapterId(target.id);
        setActiveTab('co-edit');
        setCoEditSubTab('chat');

        const prompt = `Tôi cần sửa lỗi mạch lạc ở chương "${target.title}" (ID: ${target.id}):
- Vấn đề phát hiện: ${issue.issue}
${issue.fixSuggestion ? `- Hướng xử lý tham khảo: ${issue.fixSuggestion}\n` : ''}
Hãy đối chiếu với bối cảnh thế giới, hồ sơ nhân vật và các chương liền kề để viết lại bản thảo hoàn chỉnh cho chương "${target.title}" khắc phục triệt để lỗi này nhưng vẫn giữ 100% văn phong và các tình tiết đúng đắn khác. Bọc toàn bộ bản thảo mới trong thẻ:
[PROPOSAL_CONTENT_CHAPTER_${target.id}: <nội dung bản thảo chương đã sửa>]
và kèm cập nhật Sổ cái dấu chân mới cho chương này trong thẻ:
[PROPOSAL_LEDGER_CHAPTER_${target.id}: <các gạch đầu dòng sự kiện, địa danh đã đến & trạng thái mới>]`;
        await handleSendChat(prompt, target.id);
    }, [sortedChapters, resolveChapter, focusedChapter, handleSendChat]);

    const handlePreviewDiff = useCallback((prop: Proposal) => {
        if (!prop.chapterId) return;
        const currentCh = chapters?.find(c => c.id === prop.chapterId);
        const orig = currentCh?.content?.trim() ? currentCh.content : (currentCh?.translatedContent || prop.originalContent || '');
        setPendingEdit({
            chapterId: prop.chapterId,
            original: orig,
            modified: prop.content
        });
        onClose();
    }, [chapters, setPendingEdit, onClose]);

    const ledgerEntries = useMemo<ContinuityLedgerEntry[]>(() => {
        if (!story) return [];
        return ragService.syncContinuityLedgerEntries(story);
    }, [story]);

    const filteredLedgerEntries = useMemo(() => {
        if (!ledgerSearch.trim()) return ledgerEntries;
        const q = ledgerSearch.toLowerCase().trim();
        return ledgerEntries.filter(entry =>
            entry.content.toLowerCase().includes(q) ||
            entry.chapterTitle.toLowerCase().includes(q) ||
            `ch ${entry.chapterOrder}`.includes(q) ||
            `chương ${entry.chapterOrder}`.includes(q)
        );
    }, [ledgerEntries, ledgerSearch]);

    const suppressedLedgerCount = story?.continuityLedgerSuppressedKeys?.length || 0;

    const resolveLedgerChapterMeta = useCallback((chId: string) => {
        if (!chId || chId === 'global') {
            return { chapterId: 'global', chapterOrder: 0, chapterTitle: 'Ghi chú chung toàn truyện' };
        }
        const idx = sortedChapters.findIndex(c => c.id === chId);
        const ch = idx >= 0 ? sortedChapters[idx] : undefined;
        return {
            chapterId: ch?.id || chId,
            chapterOrder: idx >= 0 ? idx + 1 : 0,
            chapterTitle: ch?.title || 'Ghi chú chung'
        };
    }, [sortedChapters]);

    const handleStartEditLedger = useCallback((entry: ContinuityLedgerEntry) => {
        setEditingLedgerId(entry.id);
        setEditingLedgerText(entry.content);
        setEditingLedgerChapterId(entry.chapterId || 'global');
    }, []);

    const handleSaveEditLedger = useCallback(async () => {
        if (!story || !editingLedgerId) return;
        const trimmed = editingLedgerText.trim();
        if (!trimmed) {
            setToast('⚠️ Nội dung mục Sổ cái không được để trống (nếu muốn bỏ, hãy bấm Xóa).');
            return;
        }
        const meta = resolveLedgerChapterMeta(editingLedgerChapterId);
        const suppressedSet = new Set(story.continuityLedgerSuppressedKeys || []);
        const nextEntries = ledgerEntries
            .map(entry => {
                if (entry.id !== editingLedgerId) return entry;
                if (entry.originKey) suppressedSet.add(entry.originKey);
                suppressedSet.add(ragService.computeLedgerOriginKey(entry.chapterId, entry.content));
                return {
                    ...entry,
                    chapterId: meta.chapterId,
                    chapterOrder: meta.chapterOrder,
                    chapterTitle: meta.chapterTitle,
                    content: trimmed,
                    isManual: true,
                    updatedAt: Date.now()
                };
            })
            .sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));

        await updateStorySettings({
            continuityLedger: nextEntries,
            continuityLedgerSuppressedKeys: Array.from(suppressedSet)
        });
        setEditingLedgerId(null);
        setToast('✅ Đã sửa Sổ cái! AI sẽ tuân theo chi tiết bạn vừa chốt.');
    }, [story, editingLedgerId, editingLedgerText, editingLedgerChapterId, ledgerEntries, resolveLedgerChapterMeta, updateStorySettings]);

    const handleDeleteLedgerEntry = useCallback(async (entry: ContinuityLedgerEntry) => {
        if (!story) return;
        const suppressedSet = new Set(story.continuityLedgerSuppressedKeys || []);
        if (entry.originKey) suppressedSet.add(entry.originKey);
        suppressedSet.add(ragService.computeLedgerOriginKey(entry.chapterId, entry.content));

        const nextEntries = ledgerEntries.filter(e => e.id !== entry.id);
        await updateStorySettings({
            continuityLedger: nextEntries,
            continuityLedgerSuppressedKeys: Array.from(suppressedSet)
        });
        if (editingLedgerId === entry.id) setEditingLedgerId(null);
        setToast('🗑️ Đã xóa chi tiết khỏi Sổ cái (sẽ không tự hiện lại khi quét).');
    }, [story, ledgerEntries, editingLedgerId, updateStorySettings]);

    const handleAddManualLedgerEntry = useCallback(async () => {
        if (!story) return;
        const trimmed = newLedgerText.trim();
        if (!trimmed) {
            setToast('⚠️ Vui lòng nhập nội dung chi tiết cần ghi vào Sổ cái.');
            return;
        }
        const meta = resolveLedgerChapterMeta(newLedgerChapterId);
        const newEntry: ContinuityLedgerEntry = {
            id: `ledger_manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            chapterId: meta.chapterId,
            chapterOrder: meta.chapterOrder,
            chapterTitle: meta.chapterTitle,
            content: trimmed,
            isManual: true,
            updatedAt: Date.now()
        };
        const nextEntries = [...ledgerEntries, newEntry].sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));
        await updateStorySettings({ continuityLedger: nextEntries });
        setNewLedgerText('');
        setIsAddingLedger(false);
        setToast('📌 Đã thêm ghi chú mới vào Sổ cái!');
    }, [story, newLedgerText, newLedgerChapterId, ledgerEntries, resolveLedgerChapterMeta, updateStorySettings]);

    const handleRescanLedger = useCallback(async () => {
        if (!story) return;
        const beforeCount = Array.isArray(story.continuityLedger) ? story.continuityLedger.length : 0;
        const synced = ragService.syncContinuityLedgerEntries(story);
        await updateStorySettings({ continuityLedger: synced });
        const diff = synced.length - beforeCount;
        setToast(
            diff > 0
                ? `🔄 Đã quét bổ sung ${diff} mục mới từ bản thảo (vẫn giữ nguyên các mục bạn đã sửa/xóa).`
                : '🔄 Sổ cái đã đồng bộ mới nhất với bản thảo hiện tại.'
        );
    }, [story, updateStorySettings]);

    const handleRestoreSuppressedLedger = useCallback(async () => {
        if (!story) return;
        const restoredStory = { ...story, continuityLedgerSuppressedKeys: [] };
        const synced = ragService.syncContinuityLedgerEntries(restoredStory, { includeSuppressed: true });
        await updateStorySettings({
            continuityLedger: synced,
            continuityLedgerSuppressedKeys: []
        });
        setToast('↩️ Đã khôi phục các mục tự động từng xóa trước đó.');
    }, [story, updateStorySettings]);

    if (!isOpen) return null;

    const promptPresets = [
        ...(focusedChapter ? [{
            label: `✍️ Viết/Nối tiếp: ${focusedChapter.title}`,
            prompt: `Hãy kiểm tra toàn bộ World Bible, Hồ sơ nhân vật (vị trí, vết thương, tri thức, dấu chân đã đi qua), Sổ cái sự kiện và các chương trước/sau để VIẾT ĐẦY ĐỦ / VIẾT TIẾP chương "${focusedChapter.title}" (ID: ${focusedChapter.id}) cho liền mạch tuyệt đối, KHÔNG quên thiết lập cũ và KHÔNG lặp lại chương trước. Bọc bản thảo trong:\n[PROPOSAL_CONTENT_CHAPTER_${focusedChapter.id}: <toàn bộ nội dung bản thảo>]\nkèm tóm tắt trong:\n[PROPOSAL_SUMMARY_CHAPTER_${focusedChapter.id}: <tóm tắt ngắn>]\nvà cập nhật Sổ cái dấu chân trong:\n[PROPOSAL_LEDGER_CHAPTER_${focusedChapter.id}: - <địa điểm đã đến/đi qua, vật phẩm, nhân vật gặp & trạng thái mới>]`
        }, {
            label: `🔧 Sửa mạch lạc: ${focusedChapter.title}`,
            prompt: `Dựa trên hồ sơ nhân vật, bối cảnh thế giới, Sổ cái dấu chân và các chương trước/sau, hãy kiểm tra và viết lại toàn văn bản thảo chương "${focusedChapter.title}" (ID: ${focusedChapter.id}) cho mạch lạc hơn, khắc phục sạn logic nếu có nhưng giữ nguyên 100% văn phong và chi tiết đắt giá của nguyên tác. Bọc toàn bộ kết quả trong thẻ:\n[PROPOSAL_CONTENT_CHAPTER_${focusedChapter.id}: <nội dung bản thảo mới đã sửa>]\n[PROPOSAL_SUMMARY_CHAPTER_${focusedChapter.id}: <tóm tắt sự kiện, địa điểm đã đi qua & thay đổi trạng thái>]\n[PROPOSAL_LEDGER_CHAPTER_${focusedChapter.id}: - <các gạch đầu dòng Sổ cái đã cập nhật>]`
        }, {
            label: `📒 Cập nhật Sổ cái: ${focusedChapter.title}`,
            prompt: `Hãy đọc kỹ toàn văn bản thảo & tóm tắt chương "${focusedChapter.title}" (ID: ${focusedChapter.id}), đối chiếu với Sổ cái hiện tại, rồi trích xuất/cập nhật đầy đủ mọi chi tiết dấu chân quan trọng (địa điểm đã đến hoặc đi qua ở đầu/giữa/cuối chương, nhân vật gặp gỡ, vật phẩm thu/mất, bí mật, lời hứa, thương tích/cảnh giới) theo từng gạch đầu dòng ngắn gọn trong thẻ:\n[PROPOSAL_LEDGER_CHAPTER_${focusedChapter.id}: <danh sách gạch đầu dòng sự kiện & dấu chân của chương>]`
        }] : []),
        { label: "🔍 Quét lỗ hổng toàn truyện", prompt: "Hãy đối chiếu toàn bộ các chương, danh sách nhân vật, dấu chân địa điểm và bối cảnh thế giới để chỉ ra các lỗ hổng mạch lạc (plot holes), chi tiết tiền hậu bất nhất, hoặc mâu thuẫn tính cách/thực lực." },
        { label: "🎭 Tạo nút thắt hợp logic", prompt: "Dựa trên các chi tiết đã cài cắm trong cốt truyện và tính cách nhân vật hiện tại, hãy đề xuất một nút thắt (plot twist) bất ngờ nhưng logic để đẩy kịch tính lên cao trào." },
        { label: "⚔️ Đồng bộ tâm lý & lời thoại", prompt: "Rà soát diễn biến tâm lý và thoại của các nhân vật ở chương đang chọn xem có bị OOC (lệch tính cách) hay thiếu động cơ không, và đề xuất cách chỉnh sửa." },
        { label: "✨ Tối ưu Dàn ý tổng thể", prompt: "Dựa trên tiến trình hiện tại của truyện, hãy đề xuất dàn ý phát triển mạch lạc cho các chương tiếp theo trong khối [PROPOSAL_PLANNING: ...]." }
    ];

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center sm:p-4 bg-black/95 backdrop-blur-md animate-fadeIn" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-850 sm:border-gray-800 rounded-none sm:rounded-3xl w-full max-w-6xl h-full sm:h-[90vh] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] sm:pt-0 sm:pb-0 flex flex-col shadow-2xl overflow-hidden animate-fadeIn border-t sm:border-t-2 border-t-emerald-500/80" onClick={e => e.stopPropagation()}>
                
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
                            <button 
                                onClick={() => setActiveTab('ledger')} 
                                className={`px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9.5px] text-center font-black uppercase rounded-md transition-all flex items-center gap-1 ${activeTab === 'ledger' ? 'bg-amber-600 text-white shadow' : 'text-gray-400 hover:text-amber-300'}`}
                                title="Xem, sửa hoặc xóa các chi tiết trong Sổ cái dấu chân & sự kiện"
                            >
                                <span>📒 Sổ cái</span>
                                <span className={`px-1 rounded text-[8px] font-mono ${activeTab === 'ledger' ? 'bg-black/30 text-white' : 'bg-gray-800 text-amber-400'}`}>
                                    {ledgerEntries.length}
                                </span>
                            </button>
                            <button 
                                onClick={() => setActiveTab('debug')} 
                                className={`relative px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9.5px] text-center font-black uppercase rounded-md transition-all flex items-center gap-1 ${activeTab === 'debug' ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                                title="Debug Console - Xem chi tiết log API, nguyên nhân lỗi 429 và kiểm tra API Key"
                            >
                                <svg className="w-2.5 h-2.5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>Debug Log</span>
                                {debugErrorCount > 0 && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                )}
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

                <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
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

                                    <button
                                        onClick={scanStoryCharactersAndLore}
                                        disabled={isScanningStory || isAnalyzingPlotArc}
                                        className="flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600/20 hover:bg-cyan-600/35 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto shrink-0"
                                    >
                                        {isScanningStory ? '⏳ Đang quét nhân vật...' : '🔍 Quét nhân vật & Lore'}
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
                            <div className="w-full md:w-[440px] bg-gray-900/40 p-4 sm:p-6 space-y-6 overflow-y-visible md:overflow-y-auto custom-scrollbar">
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
                                        {isAnalyzingPlotArc ? 'Đang phân tích...' : 'Phân tích lại'}
                                    </button>
                                </div>

                                {plotArcError && (
                                    <div className="p-3.5 bg-rose-950/30 border border-rose-500/40 rounded-xl text-xs text-rose-200 space-y-2">
                                        <div className="font-bold text-rose-400">⚠️ Không thể phân tích cốt truyện</div>
                                        <p className="text-[11px] leading-relaxed">{plotArcError}</p>
                                        <button onClick={analyzeStoryPlotArc} className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold">
                                            Thử lại ngay
                                        </button>
                                    </div>
                                )}

                                {!plotArcAnalysis ? (
                                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 opacity-60">
                                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-700 flex items-center justify-center">
                                            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        </div>
                                        <p className="text-[11px] font-bold text-gray-400 leading-relaxed max-w-[240px]">
                                            Nhấn "Phân tích lại" để AI rà soát cốt truyện, lỗ hổng mạch lạc và tuyến nhân vật.
                                        </p>
                                    </div>
                                ) : (() => {
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

                                    const chapterIssues = Array.isArray(analysisObj.chapterIssues) ? analysisObj.chapterIssues : [];
                                    const characterArcSummary = typeof analysisObj.characterArcSummary === 'string' ? analysisObj.characterArcSummary : '';

                                    return (
                                        <div className="space-y-6 animate-fadeIn">
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Cấu trúc & Nhịp điệu</label>
                                                <p className="text-xs text-gray-300 leading-relaxed font-serif bg-black/20 p-3 rounded-xl border border-white/5 shadow-inner whitespace-pre-wrap">
                                                    {arcAnalysis}
                                                </p>
                                            </div>

                                            {characterArcSummary && (
                                              <div className="space-y-2">
                                                  <label className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Tuyến Nhân vật & Động cơ</label>
                                                  <p className="text-xs text-cyan-100/90 leading-relaxed bg-cyan-950/15 p-3 rounded-xl border border-cyan-500/20 whitespace-pre-wrap">
                                                      {characterArcSummary}
                                                  </p>
                                              </div>
                                            )}

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
                                                                    title={`Chương ${i+1}: Nhịp ${numericVal}%`}
                                                                ></div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-gray-500 italic">Chưa thiết lập biểu đồ kịch tính.</p>
                                                )}
                                            </div>

                                            {chapterIssues.length > 0 && (
                                                <div className="space-y-2.5 pt-2 border-t border-gray-800">
                                                    <label className="text-[9px] font-black text-rose-400 uppercase tracking-widest block">
                                                        Lỗ hổng Mạch lạc theo Chương ({chapterIssues.length})
                                                    </label>
                                                    <div className="space-y-2.5">
                                                        {chapterIssues.map((item: any, idx: number) => (
                                                            <div key={idx} className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-[10px] font-black text-rose-300 truncate">
                                                                        {item.chapterTitle || `Chương ${item.chapterOrder || idx + 1}`}
                                                                    </span>
                                                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-200 border border-rose-500/30 shrink-0">
                                                                        {item.severity || 'medium'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-[11px] text-gray-200 leading-relaxed">{item.issue}</p>
                                                                {item.fixSuggestion && (
                                                                    <p className="text-[10px] text-emerald-300/90 bg-emerald-950/20 p-2 rounded border border-emerald-500/20">
                                                                        💡 Gợi ý sửa: {item.fixSuggestion}
                                                                    </p>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRepairIssueInCoEdit(item)}
                                                                    disabled={isPlotPlanning}
                                                                    className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow cursor-pointer disabled:opacity-40"
                                                                >
                                                                    🔧 Sửa chương này với AI (Co-Edit)
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

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
                        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-gray-950/40">
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

                            <div className="flex-1 flex flex-col lg:flex-row min-w-0 min-h-0 overflow-hidden">
                                {/* Left Column: Chat Container */}
                                <div className={`flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-gray-900/10 border-r border-gray-800/80 ${
                                    coEditSubTab === 'chat' ? 'flex' : 'hidden lg:flex'
                                }`}>
                                    {/* Chat Header Info + Target Chapter Selector */}
                                    <div className="p-3 sm:p-4 bg-gray-950/50 border-b border-gray-800/60 flex flex-wrap justify-between items-center gap-2">
                                        <div className="min-w-0">
                                            <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                                                <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
                                                Không gian Đồng Sáng Tạo & Sửa Mạch Lạc
                                            </h3>
                                            <p className="text-[9px] sm:text-[10px] text-gray-400">AI nắm toàn bộ nhân vật, bối cảnh & kiểm toán để cùng bạn sửa chương</p>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {sortedChapters.length > 0 && (
                                                <select
                                                    value={focusedCoEditChapterId || focusedChapter?.id || ''}
                                                    onChange={(e) => setFocusedCoEditChapterId(e.target.value)}
                                                    className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-[10px] text-emerald-300 font-bold max-w-[160px] outline-none focus:border-emerald-500"
                                                    title="Chọn chương trọng tâm để AI sửa chữa"
                                                >
                                                    {sortedChapters.map((c, idx) => (
                                                        <option key={c.id} value={c.id}>
                                                            {idx + 1}. {c.title}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('ledger')}
                                                className="text-[9px] sm:text-[10px] bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 px-2.5 py-1.5 rounded-lg font-bold transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                                                title="Mở Sổ cái dấu chân & sự kiện để xem, sửa chi tiết AI nhớ nhầm hoặc xóa mục sai"
                                            >
                                                <span>📒 Sổ cái ({ledgerEntries.length})</span>
                                            </button>
                                            <button 
                                                onClick={clearPlotChat}
                                                className="text-[9px] sm:text-[10px] bg-gray-850 hover:bg-gray-800 text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-gray-750 transition-colors shrink-0"
                                            >
                                                Xóa hội thoại
                                            </button>
                                        </div>
                                    </div>

                                    {/* Message Log */}
                                    <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-4 custom-scrollbar">
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
                                                const rawText = msg.parts?.[0]?.text || "";
                                                const parsed = parseMessageData(rawText);
                                                const hasContent = parsed.cleanText || parsed.proposals.length > 0;
                                                if (!hasContent && !isUser) return null;

                                                return (
                                                    <div key={i} className={`flex gap-3 min-w-0 max-w-[92%] sm:max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                                                        {/* Avatar Icon */}
                                                        <div className={`w-8 h-8 rounded-xl shrink-0 border flex items-center justify-center text-xs font-black uppercase ${isUser ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400'}`}>
                                                            {isUser ? 'U' : 'AI'}
                                                        </div>

                                                        <div className={`min-w-0 max-w-full overflow-hidden p-3.5 sm:p-4 rounded-2xl text-[13.5px] sm:text-sm border leading-relaxed shadow-md ${
                                                            isUser 
                                                                ? 'bg-rose-950/20 border-rose-500/30 text-rose-100 rounded-tr-none' 
                                                                : 'bg-gray-800 border-gray-700/60 text-gray-200 rounded-tl-none font-serif shadow-inner'
                                                        }`}>
                                                            {parsed.cleanText && (
                                                                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{parsed.cleanText}</div>
                                                            )}

                                                             {parsed.proposals.map((prop, pIdx) => {
                                                                const propKey = `${prop.type}_${prop.chapterId || 'p'}_${pIdx}`;
                                                                const isExpanded = !!expandedProposals[propKey];
                                                                const wordCount = prop.content.trim().split(/\s+/).filter(Boolean).length;

                                                                return (
                                                                <div key={pIdx} className={`${parsed.cleanText ? 'mt-3 pt-3 border-t border-purple-500/20' : ''} font-sans not-italic text-left space-y-2.5`}>
                                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className={`px-2 py-0.5 rounded font-bold text-xs flex items-center gap-1.5 border ${
                                                                                prop.type === 'ledger'
                                                                                    ? 'bg-amber-900/50 text-amber-300 border-amber-500/40'
                                                                                    : 'bg-purple-900/60 text-purple-300 border-purple-500/30'
                                                                            }`}>
                                                                                <span>{prop.type === 'ledger' ? '📒' : '📝'}</span>
                                                                                <span>
                                                                                    {prop.type === 'content'
                                                                                        ? `Bản Thảo: ${prop.chapterTitle}`
                                                                                        : prop.type === 'outline'
                                                                                            ? `Đề Cương: ${prop.chapterTitle}`
                                                                                            : prop.type === 'summary'
                                                                                                ? `Tóm Tắt: ${prop.chapterTitle}`
                                                                                                : prop.type === 'ledger'
                                                                                                    ? `Sổ cái: ${prop.chapterTitle}`
                                                                                                    : 'Dàn Ý Truyện'}
                                                                                </span>
                                                                            </span>
                                                                            <span className="px-2 py-0.5 rounded bg-gray-900 text-gray-300 text-[11px] font-mono border border-gray-750">
                                                                                ~{wordCount.toLocaleString()} từ
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            {/* Áp dụng ghi đè */}
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => applyProposal(prop, 'replace')}
                                                                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                                                                                title={prop.type === 'ledger' ? 'Cập nhật lại các mục Sổ cái tự động của chương này (vẫn giữ mục [Tác giả chốt])' : 'Đồng bộ ngay vào bản thảo (ghi đè)'}
                                                                            >
                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                                                Áp dụng
                                                                            </button>
                                                                            {prop.type === 'ledger' && (
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={() => applyProposal(prop, 'append')}
                                                                                    className="px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-600 text-amber-100 font-bold text-xs shadow transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                                                                                    title="Thêm các dòng này vào Sổ cái hiện tại mà không xóa các mục cũ"
                                                                                >
                                                                                    ➕ Thêm vào Sổ cái
                                                                                </button>
                                                                            )}
                                                                            {/* Xem Diff trước khi áp dụng */}
                                                                            {prop.type === 'content' && prop.chapterId && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handlePreviewDiff(prop)}
                                                                                    className="px-2 py-1 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-indigo-100 font-bold text-xs shadow transition-all active:scale-95 cursor-pointer"
                                                                                    title="Mở đối chiếu Diff từng dòng trong Trình soạn thảo trước khi lưu"
                                                                                >
                                                                                    👁️ Xem Diff
                                                                                </button>
                                                                            )}
                                                                            {/* Ghép nối tiếp */}
                                                                            {prop.type === 'content' && (
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={() => applyProposal(prop, 'append')}
                                                                                    className="px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-600 text-teal-100 font-bold text-xs shadow transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                                                                                    title="Ghép nối tiếp vào cuối bản thảo hiện tại mà không ghi đè"
                                                                                >
                                                                                    ➕ Ghép nối tiếp
                                                                                </button>
                                                                            )}
                                                                            {/* Viết tiếp phần còn lại */}
                                                                            {prop.type === 'content' && (
                                                                                <button 
                                                                                    type="button"
                                                                                    onClick={() => handleContinueWritingProposal(prop)}
                                                                                    disabled={isPlotPlanning}
                                                                                    className="px-2 py-1 rounded-lg bg-purple-700 hover:bg-purple-600 text-purple-100 font-bold text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                                                                    title="Yêu cầu AI viết tiếp tục toàn bộ đoạn còn lại nếu văn bản bị dừng nửa chừng"
                                                                                >
                                                                                    ⚡ Viết tiếp
                                                                                </button>
                                                                            )}
                                                                            {/* Sao chép */}
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    navigator.clipboard.writeText(prop.content);
                                                                                    setToast("📋 Đã sao chép nội dung đề xuất!");
                                                                                }}
                                                                                className="px-2 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs transition-all cursor-pointer"
                                                                            >
                                                                                Sao chép
                                                                            </button>
                                                                            {/* Mở rộng / Thu gọn */}
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => toggleExpandProposal(propKey)}
                                                                                className="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-all cursor-pointer"
                                                                                title={isExpanded ? "Thu gọn hộp xem" : "Mở rộng toàn bộ văn bản"}
                                                                            >
                                                                                {isExpanded ? "Thu gọn" : "Mở rộng"}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className={`${isExpanded ? 'max-h-none' : 'max-h-96'} overflow-y-auto overflow-x-hidden p-3.5 rounded-xl bg-gray-950/90 border border-gray-750 text-xs sm:text-[13px] font-serif leading-relaxed text-gray-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text custom-scrollbar`}>
                                                                        {prop.content}
                                                                    </div>
                                                                </div>
                                                                );
                                                            })}
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
                                    <div className="p-3 sm:p-4 bg-gray-900/60 border-t border-gray-800 shrink-0 min-w-0 space-y-2">
                                        {/* Quick Presets Bar */}
                                        {!isPlotPlanning && (
                                            <div className="flex flex-wrap items-center gap-1.5 pb-0.5 text-[11px]">
                                                {promptPresets.map((preset, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => handleSendChat(preset.prompt)}
                                                        className="px-2.5 py-1 rounded-lg bg-gray-800/90 hover:bg-purple-900/50 text-gray-200 border border-gray-700 hover:border-purple-500/40 max-w-full truncate transition-all cursor-pointer font-semibold"
                                                    >
                                                        {preset.label}
                                                    </button>
                                                ))}
                                                {activeProposals.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const latestProp = activeProposals[activeProposals.length - 1];
                                                            handleContinueWritingProposal(latestProp);
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-500/30 shrink-0 flex items-center gap-1 transition-all cursor-pointer"
                                                    >
                                                        ⚡ Viết tiếp phần còn lại
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <div className="relative flex items-end min-w-0 bg-black/40 border border-gray-700 hover:border-gray-600 focus-within:border-rose-500 rounded-xl transition-all pl-1 pr-1.5 py-1 sm:py-1.5">
                                            <textarea 
                                                rows={2}
                                                value={coEditInput}
                                                onChange={(e) => setCoEditInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any)?.isComposing) {
                                                        e.preventDefault();
                                                        handleSendChat();
                                                    }
                                                }}
                                                disabled={isPlotPlanning}
                                                className="flex-1 min-w-0 bg-transparent px-3 py-1.5 text-base sm:text-sm text-white outline-none placeholder:text-gray-600 resize-none max-h-36 custom-scrollbar"
                                                placeholder="Nhập chỉ đạo viết hoặc sửa chương trong Co-Edit (Enter để gửi, Shift+Enter xuống dòng)..."
                                            />
                                            <button 
                                                onClick={() => handleSendChat()}
                                                disabled={!coEditInput.trim() || isPlotPlanning}
                                                className="px-3.5 py-2 mb-0.5 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-lg text-[10.5px] sm:text-xs uppercase tracking-wider transition-all disabled:opacity-40 active:scale-95 shrink-0 flex items-center gap-1 shadow-md"
                                            >
                                                ⚡ Gửi
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Revision Proposals Drawer */}
                                <div className={`w-full lg:w-96 shrink-0 flex flex-col h-full min-w-0 bg-gray-900/40 p-4 sm:p-6 space-y-4 overflow-y-auto overflow-x-hidden custom-scrollbar ${
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
                                                const isLedger = proposal.type === 'ledger';
                                                const label = isPlanning 
                                                    ? "Dàn ý tổng thể truyện" 
                                                    : isOutline 
                                                        ? `Đề cương: ${proposal.chapterTitle}` 
                                                        : isContent
                                                            ? `Bản thảo: ${proposal.chapterTitle}`
                                                            : isLedger
                                                                ? `📒 Sổ cái: ${proposal.chapterTitle}`
                                                                : `Tóm tắt: ${proposal.chapterTitle}`;
                                                
                                                const borderClass = isPlanning 
                                                    ? "border-cyan-500/20 hover:border-cyan-500/40 bg-cyan-950/10" 
                                                    : isOutline 
                                                        ? "border-purple-500/20 hover:border-purple-500/40 bg-purple-950/10" 
                                                        : isContent
                                                            ? "border-rose-500/20 hover:border-rose-500/40 bg-rose-950/10"
                                                            : isLedger
                                                                ? "border-amber-500/30 hover:border-amber-500/50 bg-amber-950/15"
                                                                : "border-orange-500/20 hover:border-orange-500/40 bg-orange-950/10";
                                                
                                                const badgeColor = isPlanning 
                                                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" 
                                                    : isOutline 
                                                        ? "bg-purple-500/10 text-purple-400 border-purple-500/20" 
                                                        : isContent
                                                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                                            : isLedger
                                                                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                                                : "bg-orange-500/10 text-orange-400 border-orange-500/20";

                                                 const wordCount = proposal.content.trim().split(/\s+/).filter(Boolean).length;
                                                 return (
                                                    <div key={idx} className={`border rounded-2xl p-4 space-y-3 transition-all ${borderClass}`}>
                                                        <div className="flex justify-between items-center gap-2 flex-wrap">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border truncate ${badgeColor}`}>
                                                                    {label}
                                                                </span>
                                                                <span className="text-[9px] font-mono text-gray-400 bg-gray-950 px-1.5 py-0.5 rounded border border-gray-800">
                                                                    ~{wordCount} từ
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => applyProposal(proposal, 'replace')}
                                                                    className="text-[9px] bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase px-2 py-1 rounded-lg transition-all active:scale-95 shadow-md shrink-0 cursor-pointer"
                                                                    title={isLedger ? "Cập nhật mục tự động trong Sổ cái" : "Ghi đè bản thảo"}
                                                                >
                                                                    Áp dụng
                                                                </button>
                                                                {isLedger && (
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => applyProposal(proposal, 'append')}
                                                                        className="text-[9px] bg-amber-700 hover:bg-amber-600 text-amber-100 font-bold px-1.5 py-1 rounded-lg transition-all active:scale-95 shadow-md shrink-0 cursor-pointer"
                                                                        title="Thêm vào Sổ cái hiện tại (giữ mục cũ)"
                                                                    >
                                                                        ➕ Thêm
                                                                    </button>
                                                                )}
                                                                {isContent && proposal.chapterId && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handlePreviewDiff(proposal)}
                                                                        className="text-[9px] bg-indigo-700 hover:bg-indigo-600 text-indigo-100 font-bold px-1.5 py-1 rounded-lg transition-all active:scale-95 shadow-md shrink-0 cursor-pointer"
                                                                        title="So sánh Diff chi tiết"
                                                                    >
                                                                        👁️ Diff
                                                                    </button>
                                                                )}
                                                                {isContent && (
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => applyProposal(proposal, 'append')}
                                                                        className="text-[9px] bg-teal-700 hover:bg-teal-600 text-teal-100 font-bold px-1.5 py-1 rounded-lg transition-all active:scale-95 shadow-md shrink-0 cursor-pointer"
                                                                        title="Ghép nối tiếp vào cuối chương hiện tại"
                                                                    >
                                                                        ➕ Nối tiếp
                                                                    </button>
                                                                )}
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(proposal.content);
                                                                        setToast("📋 Đã sao chép đề xuất!");
                                                                    }}
                                                                    className="text-[9px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-1.5 py-1 rounded-lg transition-all cursor-pointer"
                                                                    title="Sao chép"
                                                                >
                                                                    Copy
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Side-by-side / Compare View Box */}
                                                        <div className="space-y-2 min-w-0">
                                                            {proposal.originalContent && (
                                                                <div className="space-y-1 min-w-0">
                                                                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider block">Nội dung hiện tại:</span>
                                                                    <p className="text-[10px] text-gray-400 bg-black/30 p-2 rounded-lg max-h-20 overflow-y-auto overflow-x-hidden font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-3">
                                                                        {proposal.originalContent}
                                                                    </p>
                                                                </div>
                                                            )}
                                                            <div className="space-y-1 min-w-0">
                                                                <span className="text-[8px] font-bold text-rose-400 uppercase tracking-wider block">Đề xuất cập nhật:</span>
                                                                <p className="text-[10px] text-gray-200 bg-black/60 p-2.5 rounded-lg border border-white/5 max-h-36 overflow-y-auto overflow-x-hidden font-serif whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text">
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

                    {/* Tab 4: Editable Continuity Ledger */}
                    {activeTab === 'ledger' && (
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar bg-gray-950/30">
                            <div className="bg-gradient-to-r from-amber-950/40 via-gray-900 to-gray-900 border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="space-y-1.5">
                                    <h3 className="text-sm sm:text-base font-bold text-amber-300 flex items-center gap-2">
                                        <span>📒 Sổ Cái Dấu Chân, Địa Điểm & Sự Kiện Xuyên Suốt</span>
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-200">
                                            {ledgerEntries.length} mục
                                        </span>
                                    </h3>
                                    <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
                                        AI đọc trực tiếp Sổ cái này trước mỗi lượt viết/sửa ở <strong>mọi API</strong>. Nếu phát hiện chi tiết AI trích sai hoặc tình tiết sai logic, bạn có thể <strong>Sửa</strong> hoặc <strong>Xóa</strong> ngay tại đây — bản sửa của bạn được lưu cứng và ưu tiên tuyệt đối.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('co-edit')}
                                        className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow"
                                    >
                                        💬 Quay lại Co-Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewLedgerChapterId(focusedChapter?.id || 'global');
                                            setIsAddingLedger(v => !v);
                                        }}
                                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow"
                                    >
                                        + Thêm ghi chú
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRescanLedger}
                                        className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-amber-200 border border-amber-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                        title="Quét thêm tình tiết từ các chương mới mà không ghi đè các mục bạn đã sửa hoặc xóa"
                                    >
                                        🔄 Quét thêm từ bản thảo
                                    </button>
                                    {suppressedLedgerCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleRestoreSuppressedLedger}
                                            className="px-3 py-2 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                                            title="Khôi phục lại các mục tự động bạn đã xóa trước đây"
                                        >
                                            ↩️ Khôi phục ({suppressedLedgerCount} đã xóa)
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isAddingLedger && (
                                <div className="p-4 bg-emerald-950/20 border border-emerald-500/40 rounded-2xl space-y-3 animate-fadeIn">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-emerald-300">📌 Thêm chi tiết mới vào Sổ cái</span>
                                        <select
                                            value={newLedgerChapterId}
                                            onChange={(e) => setNewLedgerChapterId(e.target.value)}
                                            className="bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-emerald-500 max-w-xs"
                                        >
                                            <option value="global">📌 Ghi chú chung toàn truyện</option>
                                            {sortedChapters.map((c, idx) => (
                                                <option key={c.id} value={c.id}>
                                                    Ch {idx + 1}: {c.title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <textarea
                                        rows={2}
                                        value={newLedgerText}
                                        onChange={(e) => setNewLedgerText(e.target.value)}
                                        placeholder="Ví dụ: Giữa chương 2, Lâm Phong bí mật ghé Cổ Mộ Hắc Ám dưới lòng đất Lạc Dương và giữ Ngọc Bội Huyết Long..."
                                        className="w-full bg-gray-950 border border-gray-700 focus:border-emerald-500 rounded-xl p-3 text-xs sm:text-sm text-gray-100 outline-none resize-y"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsAddingLedger(false)}
                                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-semibold cursor-pointer"
                                        >
                                            Hủy
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAddManualLedgerEntry}
                                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                                        >
                                            💾 Lưu vào Sổ cái
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Search Bar */}
                            <div className="relative">
                                <svg className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={ledgerSearch}
                                    onChange={(e) => setLedgerSearch(e.target.value)}
                                    placeholder="Lọc trong Sổ cái theo số chương, địa danh, vật phẩm hoặc tên nhân vật..."
                                    className="w-full pl-10 pr-8 py-2.5 bg-gray-900 border border-gray-800 focus:border-amber-500 rounded-xl text-xs text-gray-200 outline-none placeholder:text-gray-500"
                                />
                                {ledgerSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setLedgerSearch('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {filteredLedgerEntries.length === 0 ? (
                                <div className="text-center py-12 bg-gray-900/40 border border-dashed border-gray-800 rounded-2xl text-xs text-gray-400 space-y-2">
                                    <p>{ledgerSearch ? `Không tìm thấy mục nào khớp với "${ledgerSearch}".` : 'Chưa có dữ liệu trong Sổ cái.'}</p>
                                    {!ledgerSearch && (
                                        <p className="text-gray-500">Hãy viết thêm nội dung chương hoặc bấm "+ Thêm ghi chú" để ghi sự kiện quan trọng.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {filteredLedgerEntries.map((entry) => {
                                        const isEditing = editingLedgerId === entry.id;
                                        return (
                                            <div
                                                key={entry.id}
                                                className={`p-3.5 rounded-xl border transition-all ${
                                                    entry.isManual
                                                        ? 'bg-emerald-950/15 border-emerald-500/30 hover:border-emerald-500/50'
                                                        : 'bg-gray-900/70 border-gray-800 hover:border-amber-500/30'
                                                }`}
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 rounded bg-gray-950 border border-gray-700 text-[10px] font-bold text-amber-300">
                                                            {entry.chapterOrder === 0
                                                                ? '📌 Ghi chú chung'
                                                                : `Ch ${entry.chapterOrder} · ${entry.chapterTitle}`}
                                                        </span>
                                                        {entry.isManual ? (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                                                                ✓ Tác giả chốt
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded bg-gray-800 text-[10px] font-medium text-gray-400">
                                                                Tự động trích
                                                            </span>
                                                        )}
                                                    </div>
                                                    {!isEditing && (
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStartEditLedger(entry)}
                                                                className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-amber-600/80 text-gray-200 hover:text-white text-[11px] font-semibold transition-all cursor-pointer"
                                                            >
                                                                ✏️ Sửa
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteLedgerEntry(entry)}
                                                                className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-rose-600/80 text-rose-300 hover:text-white text-[11px] font-semibold transition-all cursor-pointer"
                                                            >
                                                                🗑️ Xóa
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {isEditing ? (
                                                    <div className="space-y-2.5 pt-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[11px] text-gray-400 shrink-0">Gắn với chương:</span>
                                                            <select
                                                                value={editingLedgerChapterId}
                                                                onChange={(e) => setEditingLedgerChapterId(e.target.value)}
                                                                className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 outline-none focus:border-amber-500 max-w-xs"
                                                            >
                                                                <option value="global">📌 Ghi chú chung toàn truyện</option>
                                                                {sortedChapters.map((c, idx) => (
                                                                    <option key={c.id} value={c.id}>
                                                                        Ch {idx + 1}: {c.title}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <textarea
                                                            rows={3}
                                                            value={editingLedgerText}
                                                            onChange={(e) => setEditingLedgerText(e.target.value)}
                                                            className="w-full bg-gray-950 border border-amber-500/50 rounded-xl p-2.5 text-xs sm:text-sm text-gray-100 outline-none resize-y"
                                                        />
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingLedgerId(null)}
                                                                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-semibold cursor-pointer"
                                                            >
                                                                Hủy
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleSaveEditLedger}
                                                                className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                                                            >
                                                                💾 Lưu thay đổi
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs sm:text-[13px] text-gray-200 leading-relaxed whitespace-pre-wrap">
                                                        {entry.content}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab 5: Debug Log Console */}
                    {activeTab === 'debug' && (
                        <PlotArcDebugConsole onSwitchToChat={() => setActiveTab('co-edit')} />
                    )}
                </div>
            </div>
        </div>
    );
};
