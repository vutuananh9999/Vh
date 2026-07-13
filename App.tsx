
import React, { useState } from 'react';
import { StoryProvider, useStory } from './context/StoryContext.tsx';
import { MainWorkspace } from './components/MainWorkspace.tsx';
import { CreateWizard } from './components/CreateWizard.tsx';
import { StoryLibrary } from './components/StoryLibrary.tsx';
import { Watermarks } from './components/Watermarks.tsx';

const AppContent: React.FC = () => {
    const { story, isStoriesLoaded } = useStory();
    const [viewMode, setViewMode] = useState<'library' | 'create'>('library');

    if (!isStoriesLoaded) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-950">
                <div className="loader-spinner mb-5" style={{
                    width: '48px',
                    height: '48px',
                    border: '4px solid rgba(14, 165, 233, 0.2)',
                    borderRadius: '50%',
                    borderTopColor: '#0ea5e9',
                    animation: 'spin 1s ease-in-out infinite'
                }}></div>
                <div className="text-primary-500 text-sm font-medium tracking-wide animate-pulse">
                    Đang tải dữ liệu...
                </div>
                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    return (
        <>
            {story ? (
                <MainWorkspace />
            ) : viewMode === 'create' ? (
                <CreateWizard onCancel={() => setViewMode('library')} />
            ) : (
                <StoryLibrary onCreateNew={() => setViewMode('create')} />
            )}
            
            {/* Watermark chỉ hiện ở màn hình Library hoặc Create Wizard */}
            {!story && <Watermarks />}
        </>
    );
};

const App: React.FC = () => {
  return (
    <StoryProvider>
      <AppContent />
    </StoryProvider>
  );
};

export default App;
