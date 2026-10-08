
import React, { useRef, useState } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { GlobalSettingsModal } from './GlobalSettingsModal.tsx';
import { SteamOSInstallModal } from './SteamOSInstallModal.tsx';

export const StoryLibrary: React.FC<{ onCreateNew: () => void }> = ({ onCreateNew }) => {
    const { storiesList, openStory, deleteStory, exportStory, exportStoryEpub, exportAllStories, importStory, importStoryFromTxt, importStoryFromEpub } = useStory();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const txtInputRef = useRef<HTMLInputElement>(null);
    const epubInputRef = useRef<HTMLInputElement>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);
    const [isSteamOSPluginOpen, setIsSteamOSPluginOpen] = useState(false);

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                await importStory(e.target.files[0]);
            } catch (error) {
                console.error("Import failed:", error);
            }
        }
        // Reset so input can be triggered again with same file if needed
        e.target.value = '';
    };

    const handleImportTxt = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                await importStoryFromTxt(e.target.files[0]);
            } catch (error) {
                console.error("TXT Import failed:", error);
            }
        }
        e.target.value = '';
    };

    const handleImportEpub = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                await importStoryFromEpub(e.target.files[0]);
            } catch (error) {
                console.error("EPUB Import failed:", error);
            }
        }
        e.target.value = '';
    };

    const handleDeleteClick = (id: string) => {
        setDeletingId(id);
    };

    const handleConfirmDelete = async (id: string) => {
        try {
            await deleteStory(id);
        } catch (error) {
            console.error("Failed to delete story:", error);
        } finally {
            setDeletingId(null);
        }
    };

    const handleExportTxt = (id: string) => {
        const story = storiesList.find(s => s.id === id);
        if (!story) return;

        let content = `${story.title.toUpperCase()}\n`;
        content += `Thể loại: ${story.genre}\n`;
        if (story.synopsis) content += `\n[TÓM TẮT]\n${story.synopsis}\n`;
        content += `\n====================================\n\n`;

        // Sort chapters by order
        const sortedChapters = [...story.chapters].sort((a, b) => a.order - b.order);

        sortedChapters.forEach(ch => {
            content += `${ch.title.toUpperCase()}\n`;
            content += `------------------------------------\n`;
            content += `${ch.content}\n\n`;
            content += `====================================\n\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        // Sanitize filename
        const safeTitle = story.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF ]/g, '_').trim(); 
        link.download = `${safeTitle}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-full bg-gray-950 p-5 sm:p-6 md:p-8 font-sans">
             <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                    <div>
                        <button 
                            onClick={() => setIsGlobalSettingsOpen(true)}
                            title="Cài đặt Hệ thống (API & Model)"
                            className="text-3xl sm:text-4xl font-serif font-bold bg-gradient-to-r from-primary-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-1 animate-fadeIn drop-shadow-sm hover:opacity-80 transition-opacity text-left flex items-center gap-2 relative group"
                        >
                            Aetheria
                            <svg className="w-5 h-5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        <p className="text-xs sm:text-sm text-gray-400 font-medium">Quản lý các thế giới và tác phẩm của bạn.</p>
                    </div>
                    <div className="flex gap-2.5 flex-wrap">
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".json,application/json" 
                            onChange={handleImport} 
                        />
                        <input 
                            type="file" 
                            ref={txtInputRef} 
                            className="hidden" 
                            accept=".txt,.epub,application/epub+zip" 
                            onChange={handleImportTxt} 
                        />
                        <input 
                            type="file" 
                            ref={epubInputRef} 
                            className="hidden" 
                            accept=".epub,application/epub+zip" 
                            onChange={handleImportEpub} 
                        />

                        <button 
                            onClick={() => epubInputRef.current?.click()}
                            className="bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 hover:text-white font-bold py-2 px-3.5 rounded-lg shadow-md flex items-center gap-1.5 transition-all hover:-translate-y-0.5 border border-purple-700/50 text-xs sm:text-sm"
                            title="Tải lên truyện từ tệp sách điện tử EPUB"
                        >
                            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            Tải lên EPUB
                        </button>
                        <button 
                            onClick={() => txtInputRef.current?.click()}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-bold py-2 px-3.5 rounded-lg shadow-md flex items-center gap-1.5 transition-all hover:-translate-y-0.5 border border-gray-700 text-xs sm:text-sm"
                            title="Tải lên truyện từ tệp văn bản TXT"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Tải lên TXT
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-bold py-2 px-3.5 rounded-lg shadow-md flex items-center gap-1.5 transition-all hover:-translate-y-0.5 border border-gray-700 text-xs sm:text-sm"
                            title="Nhập dữ liệu sao lưu truyện định dạng JSON"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Nhập (JSON)
                        </button>
                        <button 
                            onClick={onCreateNew}
                            className="bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-500 hover:to-purple-500 text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center gap-1.5 transition-all hover:-translate-y-0.5 border border-white/10 text-xs sm:text-sm"
                        >
                            <span className="text-lg">+</span> Tạo Truyện Mới
                        </button>
                    </div>
                </div>

                {storiesList.length === 0 ? (
                    <div className="text-center py-20 bg-gray-900/50 rounded-2xl border border-gray-800 border-dashed">
                        <div className="text-6xl mb-4 opacity-20 grayscale">📚</div>
                        <h3 className="text-xl text-gray-400 font-medium mb-2">Chưa có truyện nào</h3>
                        <p className="text-gray-600 mb-6">Hãy bắt đầu hành trình sáng tạo ngay hôm nay.</p>
                        <button onClick={onCreateNew} className="text-primary-400 hover:text-primary-300 font-bold">Bắt đầu ngay &rarr;</button>
                    </div>
                ) : (
                    <div className="max-h-[72vh] overflow-y-auto custom-scrollbar pr-2 pb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                            {storiesList.map(story => (
                                <div 
                                    key={story.id} 
                                    className="group relative bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-primary-500/50 transition-all hover:shadow-xl hover:shadow-primary-900/10 flex flex-col h-[180px] cursor-pointer"
                                    onClick={() => openStory(story.id)}
                                >
                                    <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    
                                    <div className="p-3.5 flex-1 flex flex-col min-w-0">
                                        <div className="flex justify-between items-start mb-1.5" onClick={e => e.stopPropagation()}>
                                            <span className="text-[9px] font-bold text-primary-400 px-1.5 py-0.5 bg-primary-900/20 rounded border border-primary-900/50 uppercase tracking-wider">
                                                {story.genre}
                                            </span>
                                            {story.nsfw && <span className="text-[8px] text-red-500 border border-red-900/50 px-1 rounded font-bold">18+</span>}
                                        </div>
                                        
                                        <h3 className="text-[13.5px] sm:text-[14.5px] font-bold text-white mb-0.5 line-clamp-1 font-serif group-hover:text-primary-400 transition-colors leading-snug">
                                            {story.title}
                                        </h3>
                                        
                                        <p className="text-[10.5px] text-gray-500 line-clamp-2 mb-2 flex-1 leading-relaxed">
                                            {story.synopsis}
                                        </p>
                                        
                                        <div className="flex items-center gap-2 text-[10px] text-gray-600 mt-auto pt-1.5 border-t border-gray-800/60" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                                {story.chapters.length} chương
                                            </div>
                                            <div className="flex items-center gap-0.5 truncate">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                {new Date(story.chapters[0]?.lastUpdated || story.createdAt).toLocaleDateString('vi-VN')}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {deletingId === story.id ? (
                                        <div className="flex bg-red-900/20 border-t border-red-900/50 shrink-0" onClick={e => e.stopPropagation()}>
                                            <button 
                                                onClick={() => handleConfirmDelete(story.id)}
                                                className="flex-1 py-1.5 text-[10px] font-bold text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors animate-pulse"
                                            >
                                                Xác nhận?
                                            </button>
                                            <div className="w-px bg-red-900/50"></div>
                                            <button 
                                                onClick={() => setDeletingId(null)}
                                                className="px-3 py-1.5 text-[10px] font-bold text-gray-400 hover:text-white transition-colors"
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex bg-gray-950/40 border-t border-gray-800/80 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                            <button 
                                                onClick={() => openStory(story.id)}
                                                className="flex-1 py-1.5 text-[10px] font-bold text-gray-400 hover:text-primary-400 hover:bg-gray-800/40 transition-colors text-left pl-3 flex items-center gap-1"
                                            >
                                                <span>Mở Truyện</span>
                                                <span className="text-gray-650">&rarr;</span>
                                            </button>
                                            
                                            <div className="w-px bg-gray-800/60"></div>
                                            
                                            <button 
                                                onClick={() => exportStoryEpub(story.id)}
                                                className="px-2 py-1.5 text-[9px] font-black text-gray-500 hover:text-purple-400 hover:bg-gray-800/40 transition-colors flex items-center justify-center"
                                                title="Xuất sách điện tử (EPUB)"
                                            >
                                                EPUB
                                            </button>

                                            <div className="w-px bg-gray-800/60"></div>
                                            
                                            <button 
                                                onClick={() => handleExportTxt(story.id)}
                                                className="px-2 py-1.5 text-[9px] font-black text-gray-500 hover:text-blue-400 hover:bg-gray-800/40 transition-colors flex items-center justify-center"
                                                title="Xuất file văn bản (TXT)"
                                            >
                                                TXT
                                            </button>
  
                                            <div className="w-px bg-gray-800/60"></div>
                                            
                                            <button 
                                                onClick={() => exportStory(story.id)}
                                                className="px-2 py-1.5 text-[9px] font-black text-gray-500 hover:text-green-400 hover:bg-gray-800/40 transition-colors flex items-center justify-center"
                                                title="Xuất file Backup (JSON)"
                                            >
                                                JSON
                                            </button>
                                            
                                            <div className="w-px bg-gray-800/60"></div>
                                            
                                            <button 
                                                onClick={() => handleDeleteClick(story.id)}
                                                className="px-3 py-1.5 text-[10px] font-bold text-red-500/60 hover:text-red-400 hover:bg-red-950/20 transition-colors"
                                                title="Xóa truyện"
                                            >
                                                Xóa
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
             </div>
             
             <GlobalSettingsModal 
                isOpen={isGlobalSettingsOpen} 
                onClose={() => setIsGlobalSettingsOpen(false)} 
             />

             <SteamOSInstallModal
                isOpen={isSteamOSPluginOpen}
                onClose={() => setIsSteamOSPluginOpen(false)}
             />
        </div>
    );
};
