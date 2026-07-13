
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
    original: string;
    modified: string;
    onAccept: () => void;
    onDiscard: () => void;
}

export const DiffReview: React.FC<Props> = ({ original, modified, onAccept, onDiscard }) => {
    const [splitPercent, setSplitPercent] = useState(50);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing && containerRef.current) {
            const containerWidth = containerRef.current.offsetWidth;
            const newPercent = (e.clientX / containerWidth) * 100;
            setSplitPercent(Math.max(15, Math.min(85, newPercent)));
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    return (
        <div ref={containerRef} className={`fixed inset-0 z-[150] bg-black/95 backdrop-blur-md flex flex-col animate-fadeIn ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
            {/* Header */}
            <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Kiểm duyệt thay đổi của AI</h2>
                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest italic">Kéo thanh ở giữa để thay đổi góc nhìn so sánh</p>
                    </div>
                </div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={onDiscard}
                        className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold text-xs transition-all"
                    >
                        Hủy bỏ
                    </button>
                    <button 
                        onClick={onAccept}
                        className="px-8 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-xs shadow-lg shadow-emerald-900/20 transition-all"
                    >
                        Chấp nhận thay đổi
                    </button>
                </div>
            </div>

            {/* Draggable Split Content */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Original Column */}
                <div 
                    className="flex flex-col border-r border-gray-800 h-full overflow-hidden"
                    style={{ width: `${splitPercent}%` }}
                >
                    <div className="p-3 bg-red-950/20 border-b border-red-900/20 text-center shrink-0">
                        <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Bản hiện tại</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-gray-950/30">
                        <div className="max-w-2xl mx-auto text-gray-400 font-serif text-lg leading-relaxed whitespace-pre-wrap select-none opacity-60">
                            {original}
                        </div>
                    </div>
                </div>

                {/* Vertical Resizer Handle */}
                <div 
                    onMouseDown={startResizing}
                    className={`absolute top-0 bottom-0 z-10 w-1.5 -ml-[3px] bg-primary-500/10 hover:bg-primary-500 transition-colors cursor-col-resize group flex items-center justify-center`}
                    style={{ left: `${splitPercent}%` }}
                >
                    <div className="w-0.5 h-12 bg-primary-500/50 rounded-full group-hover:scale-y-125 transition-transform"></div>
                </div>

                {/* Modified Column */}
                <div 
                    className="flex flex-col h-full overflow-hidden"
                    style={{ width: `${100 - splitPercent}%` }}
                >
                    <div className="p-3 bg-emerald-950/20 border-b border-emerald-900/20 text-center shrink-0">
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Bản đề xuất của AI</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar bg-gray-900/20">
                        <div className="max-w-2xl mx-auto text-gray-100 font-serif text-lg leading-relaxed whitespace-pre-wrap animate-fadeIn">
                            {modified}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Tip */}
            <div className="p-3 bg-gray-900 border-t border-gray-800 text-center flex justify-center items-center gap-4">
                <p className="text-[10px] text-gray-600 italic">
                    Gợi ý: Soi kỹ các chi tiết AI đã "thêm mắm dặm muối" trước khi đồng ý.
                </p>
                <div className="flex gap-2 items-center">
                    <span className="w-2 h-2 rounded-full bg-red-500/40"></span>
                    <span className="text-[8px] text-gray-500 font-black uppercase">Cũ</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500/40"></span>
                    <span className="text-[8px] text-gray-500 font-black uppercase">Mới</span>
                </div>
            </div>
        </div>
    );
};
