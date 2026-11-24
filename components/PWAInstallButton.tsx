import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { IPhoneCompanionModal } from './IPhoneCompanionModal.tsx';

interface Props {
  compact?: boolean;
  className?: string;
}

export const PWAInstallButton: React.FC<Props> = ({ compact = false, className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Per PWA standard: suppress install button when already running in standalone mode
  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-md transition-all border border-sky-400/30 ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
        } ${className}`}
        title="Cài đặt ứng dụng Aetheria lên màn hình chính"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        <span>Cài App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-200 hover:text-white font-bold shadow-md transition-all border border-indigo-500/40 ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
          } ${className}`}
          title="Hướng dẫn cài Aetheria lên Màn hình chính iPhone (iOS 18.6.2)"
        >
          <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span>Cài trên iPhone</span>
        </button>

        <IPhoneCompanionModal isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
      </>
    );
  }

  // Also offer subtle iPhone/Mobile PWA helper on non-iOS browsers without beforeinstallprompt
  return (
    <>
      <button
        type="button"
        onClick={() => setShowIOSGuide(true)}
        className={`flex items-center gap-1.5 rounded-lg bg-gray-800/90 hover:bg-gray-700 text-gray-200 font-bold shadow-md transition-all border border-gray-700 ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
        } ${className}`}
        title="Cài đặt bản iPhone PWA & Chạy ngầm"
      >
        <svg className="w-4 h-4 text-sky-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
        <span>Bản iPhone</span>
      </button>

      <IPhoneCompanionModal isOpen={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
};
