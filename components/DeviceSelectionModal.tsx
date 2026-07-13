
import React from 'react';
import { useStory } from '../context/StoryContext.tsx';

export const DeviceSelectionModal: React.FC = () => {
    const { setDeviceMode } = useStory();

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-950 font-sans">
            <div className="max-w-3xl w-full flex flex-col items-center animate-fadeIn space-y-12">
                <div className="text-center space-y-4">
                    <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-primary-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent tracking-tighter">Aetheria</h1>
                    <p className="text-gray-400 text-sm md:text-base uppercase tracking-[0.3em] font-bold">Khởi tạo giao diện tương thích</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                    <button 
                        onClick={() => setDeviceMode('pc')}
                        className="group relative p-8 bg-gray-900 border border-gray-800 rounded-3xl hover:border-primary-500/50 transition-all hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(14,165,233,0.15)] flex flex-col items-center justify-center gap-6"
                    >
                        <div className="w-20 h-20 bg-gray-800 rounded-2xl flex items-center justify-center group-hover:bg-primary-900/30 transition-colors">
                            <svg className="w-10 h-10 text-gray-400 group-hover:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-white group-hover:text-primary-400">Máy Tính (PC)</h3>
                            <p className="text-xs text-gray-500">Giao diện chuẩn, tối ưu cho màn hình lớn và chuột.</p>
                        </div>
                    </button>

                    <button 
                        onClick={() => setDeviceMode('mobile')}
                        className="group relative p-8 bg-gray-900 border border-gray-800 rounded-3xl hover:border-purple-500/50 transition-all hover:-translate-y-2 hover:shadow-[0_0_40px_rgba(168,85,247,0.15)] flex flex-col items-center justify-center gap-6"
                    >
                        <div className="w-20 h-20 bg-gray-800 rounded-2xl flex items-center justify-center group-hover:bg-purple-900/30 transition-colors">
                            <svg className="w-10 h-10 text-gray-400 group-hover:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-white group-hover:text-purple-400">Điện Thoại</h3>
                            <p className="text-xs text-gray-500">Giao diện dọc, tối ưu bàn phím ảo, không bị che khuất.</p>
                        </div>
                    </button>
                </div>

                <p className="text-[10px] text-gray-600 font-mono">Lựa chọn của bạn sẽ được lưu lại.</p>
            </div>
        </div>
    );
};
