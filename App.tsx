
import React, { useState, useEffect } from 'react';
import { StoryProvider, useStory } from './context/StoryContext.tsx';
import { MainWorkspace } from './components/MainWorkspace.tsx';
import { CreateWizard } from './components/CreateWizard.tsx';
import { StoryLibrary } from './components/StoryLibrary.tsx';
import { Watermarks } from './components/Watermarks.tsx';

const AppContent: React.FC = () => {
    const { story, isStoriesLoaded } = useStory();
    const [viewMode, setViewMode] = useState<'library' | 'create'>('library');

    useEffect(() => {
        let wakeLock: any = null;

        const requestWakeLock = async () => {
            if (!('wakeLock' in navigator)) {
                return;
            }
            if (wakeLock !== null) {
                return; // Wake lock is already active
            }
            try {
                wakeLock = await (navigator as any).wakeLock.request('screen');
                console.log('[Wake Lock] Screen Wake Lock is active');
                
                // Track if the browser automatically releases the lock
                wakeLock.addEventListener('release', () => {
                    console.log('[Wake Lock] Screen Wake Lock was released by browser');
                    wakeLock = null;
                });
            } catch (err) {
                console.warn('[Wake Lock] Failed to acquire screen wake lock:', err);
            }
        };

        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible') {
                await requestWakeLock();
            }
        };

        const handleInteraction = async () => {
            await requestWakeLock();
        };

        // Try to request immediately (may fail if no user gesture has occurred yet, which is expected)
        requestWakeLock();

        // Listen for user interactions to successfully acquire wake lock on browsers like Safari
        const interactionEvents = ['click', 'touchstart', 'pointerdown', 'keydown', 'scroll'];
        interactionEvents.forEach(event => {
            document.addEventListener(event, handleInteraction, { passive: true });
        });

        // Re-acquire lock when the app becomes visible again
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            interactionEvents.forEach(event => {
                document.removeEventListener(event, handleInteraction);
            });
            if (wakeLock) {
                wakeLock.release()
                    .then(() => {
                        console.log('[Wake Lock] Screen Wake Lock manually released');
                    })
                    .catch((err: any) => {
                        console.error('[Wake Lock] Error releasing wake lock:', err);
                    });
            }
        };
    }, []);

    if (!isStoriesLoaded) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-950">
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
