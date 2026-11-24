
import React, { useState } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Editor } from './Editor.tsx';
import { StorySettingsModal } from './StorySettingsModal.tsx';
import { KnowledgeReviewModal } from './KnowledgeReviewModal.tsx';
import { ConsistencyAuditModal } from './ConsistencyAuditModal.tsx';
import { ChapterAuditModal } from './ChapterAuditModal.tsx';
import { VideoGenerationModal } from './VideoGenerationModal.tsx';
import { WebInspirationModal } from './WebInspirationModal.tsx';
import { PlotArcModal } from './PlotArcModal.tsx';
import { ChapterSuggestionModal } from './ChapterSuggestionModal.tsx';
import { HelpGuideModal } from './HelpGuideModal.tsx';
import { BilingualReviewModal } from './BilingualReviewModal.tsx';
import { GoogleDriveSyncModal } from './GoogleDriveSyncModal.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { isStandaloneMode } from '../services/runtimeAdapter.ts';

export const MainWorkspace: React.FC = () => {
    const { story, activeServerJobs, isWsConnected, cancelServerJob } = useStory();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isPlotArcOpen, setIsPlotArcOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isBilingualOpen, setIsBilingualOpen] = useState(false);
    const [bilingualChapterId, setBilingualChapterId] = useState<string | undefined>(undefined);
    const [isDriveSyncOpen, setIsDriveSyncOpen] = useState(false);

    if (!story) return null;

    const handleOpenBilingual = (chapterId?: string) => {
        setBilingualChapterId(chapterId);
        setIsBilingualOpen(true);
    };

    const primaryJob = activeServerJobs[0];

    return (
        <div className="flex h-full overflow-hidden bg-gray-950 text-slate-200 selection:bg-primary-500/30 selection:text-white relative">
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black/80 z-[45] md:hidden backdrop-blur-sm transition-opacity animate-fadeIn"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar Navigation */}
            <Sidebar 
                onOpenSettings={() => setIsSettingsOpen(true)} 
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onOpenPlotArc={() => setIsPlotArcOpen(true)}
                onOpenHelp={() => setIsHelpOpen(true)}
                onOpenBilingualReview={handleOpenBilingual}
                onOpenDriveSync={() => setIsDriveSyncOpen(true)}
            />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative z-0 w-full overflow-hidden">
                {!isWsConnected && !isStandaloneMode() && (
                    <div className="bg-amber-950/80 border-b border-amber-500/30 px-3 py-1.5 text-[11px] text-amber-200 flex items-center justify-center gap-2 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span>Đang kết nối lại máy chủ điều khiển từ xa (Steam Deck vẫn đang giữ tác vụ nền)...</span>
                    </div>
                )}

                {primaryJob && (
                    <div className="bg-slate-900/95 border-b border-sky-500/30 px-3 py-2 flex items-center justify-between gap-3 shrink-0 backdrop-blur-md">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-xs font-semibold text-sky-200 truncate">
                                    <span className="truncate">{primaryJob.title}</span>
                                    <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded shrink-0">
                                        {Math.round(primaryJob.progress || 0)}%
                                    </span>
                                    {primaryJob.subProgress && (
                                        <span className="text-[10px] font-mono text-emerald-300 shrink-0">
                                            ({primaryJob.subProgress.current}/{primaryJob.subProgress.total})
                                        </span>
                                    )}
                                    {activeServerJobs.length > 1 && (
                                        <span className="text-[10px] text-slate-400 shrink-0">
                                            +{activeServerJobs.length - 1} tác vụ
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                    {primaryJob.statusText}
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => void cancelServerJob(primaryJob.id)}
                            className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-300 text-[11px] font-bold shrink-0 transition-colors"
                        >
                            Hủy
                        </button>
                    </div>
                )}

                {/* Core Editor */}
                <Editor 
                    onOpenSidebar={() => setIsSidebarOpen(true)} 
                    onOpenPlotArc={() => setIsPlotArcOpen(true)}
                    onOpenBilingualReview={handleOpenBilingual}
                />
            </main>

            {/* UI Modals & Overlays */}
            <StorySettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <ErrorBoundary>
                <PlotArcModal 
                    isOpen={isPlotArcOpen} 
                    onClose={() => setIsPlotArcOpen(false)} 
                    chapters={story.chapters} 
                    storyTitle={story.title} 
                />
            </ErrorBoundary>
            <HelpGuideModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <BilingualReviewModal 
                isOpen={isBilingualOpen} 
                onClose={() => setIsBilingualOpen(false)} 
                defaultChapterId={bilingualChapterId} 
            />
            <GoogleDriveSyncModal
                isOpen={isDriveSyncOpen}
                onClose={() => setIsDriveSyncOpen(false)}
            />
            
            {/* AI Insight Modals */}
            <KnowledgeReviewModal />
            <ConsistencyAuditModal />
            <ChapterAuditModal />
            <VideoGenerationModal />
            <WebInspirationModal />
            <ChapterSuggestionModal />
        </div>
    );
};
