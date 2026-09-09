import React from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { TranslationStyleMode } from '../types.ts';

interface TranslationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTranslate?: () => void;
}

export const TranslationSettingsModal: React.FC<TranslationSettingsModalProps> = ({
  isOpen,
  onClose,
  onStartTranslate
}) => {
  const {
    translationOptions,
    setTranslationOptions,
    translateChapter,
    activeChapterId,
    isGenerating
  } = useStory();

  if (!isOpen) return null;

  const currentMode = translationOptions?.styleMode || 'natural';

  const modes: { id: TranslationStyleMode; label: string; icon: string; desc: string }[] = [
    { id: 'natural', label: 'Thuần Việt', icon: '🌟', desc: 'Mượt mà, giàu nhạc tính, câu từ gãy gọn tự nhiên, thoát ly câu trúc convert' },
    { id: 'wuxia', label: 'Tiên Hiệp', icon: '🗡️', desc: 'Hán-Việt hào sảng, tu chân kinh điển, giữ trọn thần thái kiếm hiệp cổ phong' },
    { id: 'fantasy', label: 'Tây Phương', icon: '🏰', desc: 'Trang trọng, quý tộc, huyền bí sử thi, văn phong dịch sách kinh điển' },
    { id: 'modern', label: 'Hiện Đại', icon: '🏙️', desc: 'Đời thường, sắc sảo, xưng hô linh hoạt, đối thoại chân thực gần gũi' },
  ];

  const handleSelectMode = (mode: TranslationStyleMode) => {
    setTranslationOptions(prev => ({ ...prev, styleMode: mode }));
  };

  const handleRunTranslate = () => {
    onClose();
    if (onStartTranslate) {
      onStartTranslate();
    } else if (activeChapterId) {
      translateChapter(activeChapterId);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-gray-900 border border-emerald-500/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="p-5 pb-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg shadow-sm">
              💎
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <span>Tùy Chỉnh Việt Hóa Văn Học</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-medium">
                  Đỉnh Cao
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Khử sượng convert/dịch máy, định hình văn phong mượt mà
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800/60 hover:bg-gray-800 text-gray-400 hover:text-gray-200 flex items-center justify-center transition-colors text-sm"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {/* BODY (Scrollable if needed) */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* PHONG CÁCH VĂN PHONG */}
          <div>
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block mb-2 flex items-center justify-between">
              <span>1. Chọn phong cách văn phong</span>
              <span className="text-[10px] text-emerald-400 font-normal">Tự động thích ứng thể loại</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {modes.map((m) => {
                const isSelected = currentMode === m.id;
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => handleSelectMode(m.id)}
                    className={`p-3 rounded-xl text-left border transition-all relative ${
                      isSelected
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-950/40'
                        : 'bg-gray-800/40 border-gray-800 hover:border-gray-700 hover:bg-gray-800/70 text-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>{m.icon}</span>
                        <span>{m.label}</span>
                      </div>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80"></span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      {m.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* XƯNG HÔ ƯU TIÊN */}
          <div>
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span>2. Xưng hô ưu tiên (Tùy chọn)</span>
              <span className="text-[10px] text-gray-500 font-normal">Nhất quán nhân vật</span>
            </label>
            <input
              type="text"
              placeholder="VD: Ta - Nàng, Huynh - Muội, Lãnh chúa - Thuộc hạ, Bệ hạ - Vi thần..."
              value={translationOptions?.pronounOverride || ''}
              onChange={(e) => setTranslationOptions(prev => ({ ...prev, pronounOverride: e.target.value }))}
              className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500/60 rounded-xl px-3.5 py-2.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none transition-colors"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Quy định rõ đại từ nhân xưng chủ đạo để AI duy trì cảm xúc chuẩn xác xuyên suốt chương.
            </p>
          </div>

          {/* CHỈ THỊ DỊCH BỔ SUNG */}
          <div>
            <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span>3. Chỉ thị dịch riêng (Tùy chọn)</span>
              <span className="text-[10px] text-gray-500 font-normal">Biên tập nâng cao</span>
            </label>
            <input
              type="text"
              placeholder="VD: Giữ nguyên tên chiêu thức tiếng Anh, hành văn chậm rãi, tăng tính thi vị..."
              value={translationOptions?.customInstruction || ''}
              onChange={(e) => setTranslationOptions(prev => ({ ...prev, customInstruction: e.target.value }))}
              className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500/60 rounded-xl px-3.5 py-2.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none transition-colors"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Yêu cầu cụ thể dành riêng cho AI khi trau chuốt và gọt giũa từ ngữ.
            </p>
          </div>

          {/* BẢO TOÀN DỮ LIỆU */}
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-emerald-300 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span>🛡️</span>
              <span>Bảo Toàn 100% Nguyên Tác Gốc</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Bản dịch được lưu độc lập vào tab <strong>Bản Dịch</strong> ở thanh bên và xem trực tiếp ở tab <strong>✨ Bản Dịch</strong>. Bạn có thể mở đối chiếu song ngữ 2 cột bất cứ lúc nào!
            </p>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 bg-gray-950 border-t border-gray-800 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold transition-colors"
          >
            Đóng & Lưu Cấu Hình
          </button>
          
          <button
            type="button"
            onClick={handleRunTranslate}
            disabled={isGenerating}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>Việt Hóa Ngay</span>
          </button>
        </div>
      </div>
    </div>
  );
};
