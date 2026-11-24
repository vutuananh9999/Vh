import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="fixed left-4 z-[190] flex items-center gap-2 rounded-xl bg-amber-950/95 border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-200 shadow-2xl backdrop-blur-md"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
      <span>Mất mạng — Tác vụ AI đang chạy trên máy chủ sẽ tự đồng bộ khi có mạng lại.</span>
    </div>
  );
};
