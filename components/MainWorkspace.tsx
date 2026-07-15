
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
import { ErrorBoundary } from './ErrorBoundary.tsx';

export const MainWorkspace: React.FC = () => {
    const { story } = useStory();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isPlotArcOpen, setIsPlotArcOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    if (!story) return null;

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
            />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative z-0 w-full overflow-hidden">
                {/* Core Editor */}
                <Editor 
                    onOpenSidebar={() => setIsSidebarOpen(true)} 
                    onOpenPlotArc={() => setIsPlotArcOpen(true)}
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
