
import React from 'react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    chapterTitle: string;
}

export const DeleteChapterModal: React.FC<Props> = ({ isOpen, onClose, onConfirm, chapterTitle }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn" onClick={onClose}>
            <div className="bg-gray-900 border border-red-900/50 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
                
                {/* Header Warning */}
                <div className="p-6 pb-0 flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 mb-2">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </div>
                    
                    <h3 className="text-xl font-bold text-white">Xóa chương vĩnh viễn?</h3>
                    
                    <div className="bg-red-950/30 border border-red-900/30 p-4 rounded-xl w-full">
                        <p className="text-sm text-red-200">
                            Bạn đang chuẩn bị xóa chương:
                        </p>
                        <p className="text-lg font-serif font-bold text-red-400 mt-1 line-clamp-2">
                            "{chapterTitle}"
                        </p>
                    </div>

                    <p className="text-xs text-gray-500 leading-relaxed px-4">
                        Hành động này <span className="text-red-400 font-bold">không thể hoàn tác</span>. Toàn bộ nội dung, dàn ý và thiết lập riêng của chương này sẽ bị mất vĩnh viễn khỏi dòng thời gian.
                    </p>
                </div>

                {/* Actions */}
                <div className="p-6 pt-8 flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold text-xs transition-all uppercase tracking-wider"
                    >
                        Hủy bỏ
                    </button>
                    <button 
                        onClick={() => { onConfirm(); onClose(); }}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-xs shadow-lg shadow-red-900/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Xác nhận xóa
                    </button>
                </div>
            </div>
        </div>
    );
};
