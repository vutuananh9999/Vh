
import React, { useState } from 'react';

type SectionId = 'intro' | 'forge' | 'prompting' | 'dna' | 'memory' | 'audit' | 'editor';

interface HelpSection {
    id: SectionId;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
}

export const HelpGuideModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [activeSection, setActiveSection] = useState<SectionId>('intro');

    if (!isOpen) return null;

    const sections: HelpSection[] = [
        { 
            id: 'intro', 
            label: 'Tổng quan', 
            description: 'Chào mừng đến với Aetheria.',
            color: 'text-white',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        },
        { 
            id: 'forge', 
            label: '⚡ Giao thức Forge', 
            description: 'Kiến tạo văn bản chuyên sâu.',
            color: 'text-primary-400',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        },
        { 
            id: 'prompting', 
            label: '💡 Mẹo Prompting', 
            description: 'Điều khiển AI hiệu quả.',
            color: 'text-emerald-400',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
        },
        { 
            id: 'dna', 
            label: '🧬 Hồn Văn (DNA)', 
            description: 'Phong cách cá nhân hóa.',
            color: 'text-pink-400',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 1.43" /></svg>
        },
        { 
            id: 'editor', 
            label: '✍️ Trình Biên Tập', 
            description: 'Công cụ tỉa tót văn bản.',
            color: 'text-orange-400',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        },
        { 
            id: 'memory', 
            label: '🧠 Hệ thống LTM', 
            description: 'World Bible & Archive.',
            color: 'text-blue-400',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13" /></svg>
        },
        { 
            id: 'audit', 
            label: '🔍 Kiểm Toán AI', 
            description: 'Soi lỗi logic toàn cục.',
            color: 'text-red-400',
            icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944" /></svg>
        }
    ];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn" onClick={onClose}>
            <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col md:flex-row shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
                
                {/* Left Sidebar (Navigation) */}
                <div className="w-full md:w-64 bg-gray-950 border-b md:border-b-0 md:border-r border-gray-800 flex flex-col shrink-0">
                    <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                             <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 14l9-5-9-5-9 5 9 5z" /><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" /></svg>
                        </div>
                        <h2 className="font-bold text-white tracking-tight">Học Viện</h2>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                        {sections.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${activeSection === s.id ? 'bg-gray-800 text-white shadow-lg border border-gray-700' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'}`}
                            >
                                <div className={`${activeSection === s.id ? s.color : 'text-gray-600'}`}>{s.icon}</div>
                                <div>
                                    <div className="text-xs font-bold uppercase">{s.label}</div>
                                    <div className="text-[9px] text-gray-500 truncate max-w-[120px]">{s.description}</div>
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="p-4 border-t border-gray-800 text-[10px] text-gray-600 text-center">
                        Aetheria Academy v2.0
                    </div>
                </div>

                {/* Right Content */}
                <div className="flex-1 flex flex-col bg-gray-900/50 relative">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white bg-gray-800/50 hover:bg-gray-700 rounded-full transition-all z-10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>

                    <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
                        {activeSection === 'intro' && (
                            <div className="space-y-6 animate-fadeIn">
                                <h1 className="text-3xl font-serif font-bold text-white mb-4">Chào mừng đến với Aetheria</h1>
                                <p className="text-gray-300 leading-relaxed">Aetheria không chỉ là một công cụ viết, nó là một <b>Hệ sinh thái Đồng sáng tạo (Co-creative Ecosystem)</b>. Tại đây, bạn là Kiến trúc sư, còn AI là Thợ xây lành nghề.</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                    <div className="p-5 bg-gray-800/50 rounded-2xl border border-gray-700">
                                        <h4 className="text-sm font-bold text-white mb-2">🚀 Sứ mệnh</h4>
                                        <p className="text-xs text-gray-400">Giúp các tác giả vượt qua "trang giấy trắng" và tạo ra các thế giới có chiều sâu, logic chặt chẽ.</p>
                                    </div>
                                    <div className="p-5 bg-gray-800/50 rounded-2xl border border-gray-700">
                                        <h4 className="text-sm font-bold text-white mb-2">⚡ Sức mạnh</h4>
                                        <p className="text-xs text-gray-400">Khả năng ghi nhớ dài hạn (LTM), kiểm toán logic thời gian thực và mô phỏng văn phong cá nhân.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'forge' && (
                            <div className="space-y-8 animate-fadeIn">
                                <h3 className="text-2xl font-bold text-primary-400">⚡ Giao thức Kiến tạo (Forge Protocol)</h3>
                                <div className="prose prose-invert max-w-none text-gray-300 space-y-6">
                                    <p className="text-base leading-[1.8]">Quy trình kiến tạo thực tại chuyên sâu của Aetheria gồm 4 bước:</p>
                                    <div className="grid gap-4">
                                        {[
                                            { step: 1, title: 'Đồng bộ Bộ nhớ', desc: 'AI quét 2500 chữ gần nhất, dàn ý chương và các mảnh tri thức liên quan từ World Bible.' },
                                            { step: 2, title: 'Thẩm định & Suy luận', desc: 'AI sử dụng ngân sách Thinking để tính toán cách dệt chỉ đạo của bạn vào mạch truyện mà không gây mâu thuẫn.' },
                                            { step: 3, title: 'Kiến tạo Văn bản (>2000 từ)', desc: 'AI triển khai viết với mật độ miêu tả đa giác quan cực cao.' },
                                            { step: 4, title: 'Hậu kiểm (Compliance)', desc: 'Hệ thống rà soát lại xưng hô, logic và loại bỏ các đoạn tóm tắt hời hợt.' }
                                        ].map(item => (
                                            <div key={item.step} className="p-4 bg-gray-900 border border-gray-800 rounded-2xl flex gap-4 items-start">
                                                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-black text-white shrink-0">{item.step}</div>
                                                <div>
                                                    <h5 className="text-white font-bold text-sm mb-1">{item.title}</h5>
                                                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'prompting' && (
                            <div className="space-y-8 animate-fadeIn">
                                <h3 className="text-2xl font-bold text-emerald-400">💡 Nghệ thuật điều khiển AI</h3>
                                <p className="text-gray-300">Ô "Chỉ đạo nóng" là nơi bạn truyền linh hồn cho tình tiết. Hãy áp dụng công thức: <b>Bối cảnh + Hành động + Cảm xúc</b>.</p>
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="p-5 bg-red-950/10 border border-red-900/30 rounded-2xl space-y-3">
                                        <h5 className="text-red-400 font-bold text-[10px] uppercase">❌ Cách viết hời hợt</h5>
                                        <p className="text-xs text-gray-500 italic">"Viết tiếp cảnh chiến đấu."</p>
                                        <p className="text-[10px] text-gray-600 border-t border-red-900/20 pt-2">Hệ quả: AI sẽ viết ngắn, nội dung rập khuôn.</p>
                                    </div>
                                    <div className="p-5 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-3">
                                        <h5 className="text-emerald-400 font-bold text-[10px] uppercase">✅ Cách viết chuyên sâu</h5>
                                        <p className="text-xs text-emerald-100 italic">"Triển khai cảnh giao đấu ở bìa rừng lúc hoàng hôn. Mô tả sự mệt mỏi, nhịp thở dồn dập. Kẻ thù dùng kiếm pháp tàn độc..."</p>
                                        <p className="text-[10px] text-emerald-500/70 border-t border-emerald-900/20 pt-2">Hệ quả: Văn bản sẽ dày dặn, giàu hình ảnh và đạt trên 2000 từ.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'dna' && (
                            <div className="space-y-8 animate-fadeIn">
                                <h3 className="text-2xl font-bold text-pink-400">🧬 Hồn Văn (Writing DNA)</h3>
                                <p className="text-gray-300 text-sm leading-relaxed">Writing DNA là dấu ấn cá nhân của bạn. Khi AI "nhập hồn", nó sẽ bắt chước túi từ vựng và nhịp điệu câu văn của bạn.</p>
                                <div className="grid gap-6">
                                    <div className="p-6 bg-pink-950/10 border border-pink-900/20 rounded-3xl">
                                        <h4 className="text-xs font-black text-pink-500 uppercase mb-3">Làm sao để AI học văn phong?</h4>
                                        <ul className="text-xs text-gray-400 space-y-3">
                                            <li className="flex gap-2"><span className="text-pink-500 font-bold">1.</span> Dùng tab "Nạp" để dán văn bản mẫu tâm đắc nhất của bạn.</li>
                                            <li className="flex gap-2"><span className="text-pink-500 font-bold">2.</span> Trong Editor, bôi đen đoạn văn bạn tự sửa và nhấn nút DNA (Học phong cách).</li>
                                            <li className="flex gap-2"><span className="text-pink-500 font-bold">3.</span> AI sẽ so sánh bản cũ và mới để rút ra "Quy tắc tiến hóa".</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'editor' && (
                            <div className="space-y-8 animate-fadeIn">
                                <h3 className="text-2xl font-bold text-orange-400">✍️ Quyền năng Biên tập</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-gray-900 border border-gray-800 rounded-2xl">
                                        <h5 className="text-white font-bold text-xs mb-2">Tỉa tót</h5>
                                        <p className="text-[10px] text-gray-500">Tăng nội tâm, mở rộng ẩn dụ hoặc rút gọn các đoạn rườm rà.</p>
                                    </div>
                                    <div className="p-4 bg-gray-900 border border-gray-800 rounded-2xl">
                                        <h5 className="text-white font-bold text-xs mb-2">Giác quan</h5>
                                        <p className="text-[10px] text-gray-500">Kích hoạt các giác quan (vị giác, khứu giác...) cho cảnh truyện.</p>
                                    </div>
                                    <div className="p-4 bg-gray-900 border border-gray-800 rounded-2xl">
                                        <h5 className="text-white font-bold text-xs mb-2">Biến hình</h5>
                                        <p className="text-[10px] text-gray-500">Chuyển ngôi kể, thì quá khứ/hiện tại ngay lập tức.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'memory' && (
                            <div className="space-y-8 animate-fadeIn">
                                <h3 className="text-2xl font-bold text-blue-400">🧠 Đa tầng Bộ nhớ</h3>
                                <div className="p-6 bg-blue-950/10 border border-blue-900/20 rounded-3xl space-y-4">
                                    <div>
                                        <h4 className="text-xs font-black text-blue-400 uppercase mb-2">World Bible (Settings)</h4>
                                        <p className="text-xs text-gray-400">Chứa các thiết lập nền tảng không đổi. AI LUÔN đọc phần này để giữ logic thế giới.</p>
                                    </div>
                                    <div className="pt-4 border-t border-blue-900/20">
                                        <h4 className="text-xs font-black text-blue-400 uppercase mb-2">Thư viện Aether (Archive)</h4>
                                        <p className="text-xs text-gray-400">Chứa các tri thức rời rạc. AI chỉ đọc khi bối cảnh chương truyện liên quan (Cơ chế RAG).</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'audit' && (
                            <div className="space-y-8 animate-fadeIn">
                                <h3 className="text-2xl font-bold text-red-400">🔍 Hệ thống Kiểm toán</h3>
                                <div className="space-y-4">
                                    <p className="text-gray-300 text-sm">Dùng nút <b>Kiểm toán hệ thống</b> để AI quét toàn bộ tác phẩm:</p>
                                    <div className="grid gap-3">
                                        <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                            <span className="text-xs text-gray-400">Tìm Plot Holes (lỗ hổng cốt truyện).</span>
                                        </div>
                                        <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                            <span className="text-xs text-gray-400">Soi lỗi "Out of Character".</span>
                                        </div>
                                        <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                            <span className="text-xs text-gray-400">Kiểm tra xưng hô theo đúng preset đã chọn.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
