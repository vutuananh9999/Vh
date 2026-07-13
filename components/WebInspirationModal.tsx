
import React from 'react';
import { useStory } from '../context/StoryContext.tsx';

export const WebInspirationModal: React.FC = () => {
  const { webInspiration, clearWebInspiration, updateStorySettings, story, isSearchingWeb } = useStory();

  if (!webInspiration && !isSearchingWeb) return null;

  const handleAddToBible = async () => {
    if (!story || !webInspiration) return;
    const currentSetting = story.setting || "";
    const newContent = `\n\n--- CẢM HỨNG TỪ THƯ VIỆN AETHERIA ---\n${webInspiration.insights}\n`;
    try {
        await updateStorySettings({ setting: currentSetting + newContent });
        alert("Đã hợp nhất tri thức mới vào World Bible thành công!");
    } catch (e) {
        alert("Có lỗi xảy ra khi lưu vào World Bible.");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fadeIn">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden border-t-4 border-t-primary-500">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-850/50 shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-950/40 rounded-xl border border-primary-900/30">
              <svg className="w-6 h-6 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Thư viện Tri thức Aetheria</h2>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-black">AI Deep Web Research & Genre Analysis</p>
            </div>
          </div>
          <button onClick={clearWebInspiration} className="p-2 text-gray-500 hover:text-white transition-colors bg-gray-800 rounded-full">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-950/20">
          {isSearchingWeb ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-8 h-8 text-primary-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Đang kết nối với tri thức toàn cầu...</h3>
                <p className="text-sm text-gray-500 max-w-sm">Aetheria đang tìm kiếm các sự kiện lịch sử, phân tích các bộ truyện nổi tiếng và đúc kết kỹ thuật viết cho bạn.</p>
              </div>
            </div>
          ) : (
            <div className="p-8 space-y-10 animate-fadeIn">
              {/* Insights Report */}
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                  <h3 className="text-xs font-black text-primary-400 uppercase tracking-widest">Báo cáo Phân tích & Gợi ý Sáng tạo</h3>
                </div>
                <div className="bg-gray-850/50 border border-gray-800 rounded-2xl p-6 text-sm text-gray-200 leading-relaxed font-serif whitespace-pre-wrap">
                  {webInspiration?.insights}
                </div>
              </div>

              {/* Source Links (Grounding) */}
              {webInspiration?.sources && webInspiration.sources.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                    <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest">Nguồn tham khảo tin cậy (Grounding)</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {webInspiration.sources.map((source, i) => (
                      <a 
                        key={i} 
                        href={source.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-primary-500/50 hover:bg-gray-800 transition-all group"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="text-xs font-bold text-white truncate group-hover:text-primary-400">{source.title}</div>
                          <div className="text-[10px] text-gray-500 truncate">{new URL(source.url).hostname}</div>
                        </div>
                        <svg className="w-4 h-4 text-gray-600 group-hover:text-primary-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isSearchingWeb && (
          <div className="p-6 border-t border-gray-800 bg-gray-850/50 flex justify-between items-center shrink-0">
            <p className="text-[10px] text-gray-500 italic">Dữ liệu được tổng hợp từ các nguồn web uy tín và phân tích xu hướng văn học hiện đại.</p>
            <div className="flex gap-4">
              <button onClick={clearWebInspiration} className="px-6 py-2.5 text-xs font-bold text-gray-400 hover:text-white transition-colors">Đóng</button>
              <button 
                onClick={handleAddToBible}
                className="px-8 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-black text-xs shadow-lg transition-all transform hover:-translate-y-0.5"
              >
                Hợp nhất vào World Bible
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
