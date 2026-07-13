
import React, { useState, useEffect } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { PRONOUN_STYLES, compilePronounStyle } from '../constants.ts';
import { ReferenceDocument } from '../types.ts';

type SettingsTab = 'general' | 'style' | 'dialogue' | 'world' | 'mechanics' | 'prohibitions';

export const StorySettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { story, updateStorySettings, isGenerating, expandSettingWithAI, suggestWorldSettings } = useStory();
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [isExpandingSetting, setIsExpandingSetting] = useState(false);
    const [fandomFiles, setFandomFiles] = useState<ReferenceDocument[]>([]);
    
    // Suggestion States
    const [suggestionData, setSuggestionData] = useState<any>(null);
    const [showSuggestionModal, setShowSuggestionModal] = useState(false);
    const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, boolean>>({});
    const [isSuggesting, setIsSuggesting] = useState(false);

    const [formData, setFormData] = useState({
        title: '', 
        synopsis: '',
        genre: '', 
        writingStyle: '', 
        pov: '', 
        pronounStyle: '', 
        interactionRules: '',
        setting: '', 
        currentTimeline: '',
        planning: '', 
        mechanics: '',
        logistics: '', // Re-purposed for Culture
        trade: '', 
        economy: '',
        maps: '',
        officials: '', // Re-purposed for Factions
        negativePrompt: '', 
        nsfw: false,
        hasSystem: false,
        isFanfiction: false,
        fandomName: ''
    });
    
    const [selectedPronounId, setSelectedPronounId] = useState<string>('custom');

    useEffect(() => {
        if (story && isOpen) {
            setFormData({
                title: story.title,
                synopsis: story.synopsis || '',
                genre: story.genre,
                writingStyle: story.writingStyle || '',
                pov: story.pov,
                pronounStyle: story.pronounStyle,
                interactionRules: story.interactionRules || '',
                setting: story.setting,
                currentTimeline: story.currentTimeline || '',
                planning: story.planning,
                mechanics: story.mechanics || '',
                logistics: story.logistics || '',
                trade: story.trade || '', 
                economy: story.economy || '',
                maps: story.maps || '',
                officials: story.officials || '',
                negativePrompt: story.negativePrompt || '',
                nsfw: story.nsfw || false,
                hasSystem: story.hasSystem || false,
                isFanfiction: story.isFanfiction || false,
                fandomName: story.fandomName || ''
            });
            setFandomFiles(story.referenceDocs || []);
            
            const preset = PRONOUN_STYLES.find(s => s.config && compilePronounStyle(s.label, s.config) === story.pronounStyle);
            setSelectedPronounId(preset ? preset.id : 'custom');
        }
    }, [story, isOpen]);

    if (!isOpen || !story) return null;

    const handlePronounPresetChange = (id: string) => {
        setSelectedPronounId(id);
        if (id !== 'custom') {
            const preset = PRONOUN_STYLES.find(s => s.id === id);
            if (preset && preset.config) {
                setFormData(prev => ({ ...prev, pronounStyle: compilePronounStyle(preset.label, preset.config!) }));
            }
        }
    };

    const handleExpandWorldBible = async () => {
        if (!formData.setting.trim() || isExpandingSetting) return;
        
        setIsExpandingSetting(true);
        try {
            const expanded = await expandSettingWithAI(formData.setting);
            setFormData(prev => ({ ...prev, setting: expanded }));
        } catch (e) {
            console.error("AI Expansion failed:", e);
        } finally {
            setIsExpandingSetting(false);
        }
    };

    const handleSuggestSettings = async () => {
        if (!formData.title || !formData.genre) {
            alert("Cần có Tiêu đề và Thể loại (Tab Tổng quan) để AI gợi ý.");
            return;
        }
        setIsSuggesting(true);
        try {
            const data = await suggestWorldSettings(formData.title, formData.genre, formData.synopsis, formData.currentTimeline);
            if (data) {
                setSuggestionData(data);
                const initialSelection: Record<string, boolean> = {};
                Object.keys(data).forEach(key => {
                    if (data[key] && typeof data[key] === 'string' && data[key].trim().length > 0) {
                        initialSelection[key] = true;
                    }
                });
                setSelectedSuggestions(initialSelection);
                setShowSuggestionModal(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSuggesting(false);
        }
    };

    const applySuggestions = () => {
        if (!suggestionData) return;
        const newFormData = { ...formData };
        
        const merge = (key: keyof typeof formData, value: string) => {
            if (selectedSuggestions[key]) {
                const current = newFormData[key] as string;
                newFormData[key] = current ? current + "\n\n" + value : value;
            }
        };

        if (selectedSuggestions['setting']) merge('setting', suggestionData.setting);
        if (selectedSuggestions['interactionRules']) merge('interactionRules', suggestionData.interactionRules);
        if (selectedSuggestions['mechanics']) merge('mechanics', suggestionData.mechanics);
        if (selectedSuggestions['negativePrompt']) merge('negativePrompt', suggestionData.negativePrompt);
        if (selectedSuggestions['maps']) merge('maps', suggestionData.maps);
        if (selectedSuggestions['officials']) merge('officials', suggestionData.officials);
        if (selectedSuggestions['logistics']) merge('logistics', suggestionData.logistics);
        if (selectedSuggestions['trade']) merge('trade', suggestionData.trade);
        if (selectedSuggestions['economy']) merge('economy', suggestionData.economy);
        if (selectedSuggestions['planning']) merge('planning', suggestionData.planning);

        setFormData(newFormData);
        setShowSuggestionModal(false);
        setSuggestionData(null);
    };

    const toggleSuggestion = (key: string) => {
        setSelectedSuggestions(prev => ({...prev, [key]: !prev[key]}));
    };

    const handleSave = async () => {
        await updateStorySettings({ ...formData, referenceDocs: fandomFiles });
        onClose();
    };

    const tabClass = (tab: SettingsTab) => `
        flex items-center gap-2 px-3 py-2 text-[11px] font-bold transition-all border-b-2 uppercase tracking-tighter shrink-0
        ${activeTab === tab 
            ? tab === 'prohibitions' ? 'text-red-400 border-red-500 bg-red-500/5' : 'text-primary-400 border-primary-500 bg-primary-500/5' 
            : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-800/50'}
    `;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
            {/* Suggestion Review Modal (Nested) */}
            {showSuggestionModal && suggestionData && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fadeIn">
                    <div className="bg-gray-900/90 border border-gray-700/50 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
                        <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-gray-900 to-gray-800 shrink-0 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-500/20 rounded-xl border border-purple-500/30">
                                    <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 1.43l-1.004.823a2 2 0 01-2.31 0l-1.004-.823a6 6 0 00-3.86-1.43l-2.387.477a2 2 0 00-1.022.547l-1.004 1.255a2 2 0 00-.32 1.637l1.004 5.023a2 2 0 001.962 1.608h15.688a2 2 0 001.962-1.608l1.004-5.023a2 2 0 00-.32-1.637l-1.004-1.255zM12 2v10m0 0l3-3m-3 3l-3-3" /></svg>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">Kiến Trúc Sư Aetheria</h2>
                                    <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Đề xuất thiết lập tự động</p>
                                </div>
                            </div>
                            <button onClick={() => setShowSuggestionModal(false)} className="p-2 text-gray-500 hover:text-white transition-colors bg-white/5 rounded-full"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-950/50">
                            {Object.keys(suggestionData).map((key) => {
                                if (!suggestionData[key]) return null;
                                const labels: Record<string, string> = {
                                    setting: "World Bible (Bối cảnh)",
                                    interactionRules: "Quy tắc Xưng hô",
                                    mechanics: "Hệ thống & Cơ chế",
                                    negativePrompt: "Điều cấm (Negative)",
                                    maps: "Bản đồ & Địa lý",
                                    officials: "Các Thế Lực & Tổ Chức (Factions)",
                                    logistics: "Văn Hóa & Tín Ngưỡng (Culture)",
                                    trade: "Giao thương",
                                    economy: "Kinh tế & Tiền tệ",
                                    planning: "Dàn ý Cốt truyện (Blueprint)"
                                };
                                return (
                                    <div key={key} className={`p-5 rounded-2xl border transition-all cursor-pointer group ${selectedSuggestions[key] ? 'bg-purple-900/20 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'bg-gray-900/40 border-gray-800 hover:bg-gray-800'}`} onClick={() => toggleSuggestion(key)}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${selectedSuggestions[key] ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-800 border-gray-600 group-hover:border-gray-500'}`}>
                                                {selectedSuggestions[key] && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                            <h4 className={`font-bold text-sm uppercase tracking-wide ${selectedSuggestions[key] ? 'text-purple-300' : 'text-gray-400 group-hover:text-gray-200'}`}>{labels[key] || key}</h4>
                                        </div>
                                        <p className="text-xs text-gray-300 leading-relaxed pl-8 line-clamp-4 font-serif italic opacity-80">{suggestionData[key]}</p>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="p-5 border-t border-gray-800 bg-gray-900/80 flex justify-end gap-3 backdrop-blur-sm">
                            <button onClick={() => setShowSuggestionModal(false)} className="px-6 py-3 text-xs font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-wider">Hủy bỏ</button>
                            <button onClick={applySuggestions} className="px-8 py-3 bg-gradient-to-r from-purple-600 to-primary-600 hover:from-purple-500 hover:to-primary-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-purple-900/30 transition-all transform hover:-translate-y-0.5">Áp dụng</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-500/10 rounded-lg">
                            <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white">Cấu hình Vũ trụ</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex border-b border-gray-800 bg-gray-900/30 shrink-0 overflow-x-auto custom-scrollbar">
                    <button onClick={() => setActiveTab('general')} className={tabClass('general')}>Tổng quan</button>
                    <button onClick={() => setActiveTab('world')} className={tabClass('world')}>Thế Giới (World Building)</button>
                    <button onClick={() => setActiveTab('mechanics')} className={tabClass('mechanics')}>Cơ chế & Hệ thống</button>
                    <button onClick={() => setActiveTab('style')} className={tabClass('style')}>Văn phong</button>
                    <button onClick={() => setActiveTab('dialogue')} className={tabClass('dialogue')}>Hội thoại</button>
                    <button onClick={() => setActiveTab('prohibitions')} className={tabClass('prohibitions')}>🛑 Cấm & Hạn chế</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-gray-950/20">
                    {activeTab === 'general' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">Tiêu đề</label>
                                    <input className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-white focus:border-primary-500 outline-none transition-all" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">Thể loại</label>
                                    <input className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-white focus:border-primary-500 outline-none transition-all" value={formData.genre} onChange={e => setFormData({...formData, genre: e.target.value})} />
                                </div>
                            </div>
                            
                            <div className="bg-gray-850/50 p-4 rounded-xl border border-gray-800 space-y-3">
                                 <div className="flex items-center gap-3">
                                     <input type="checkbox" checked={formData.isFanfiction} onChange={(e) => setFormData({...formData, isFanfiction: e.target.checked})} className="w-5 h-5 rounded bg-gray-700 text-primary-600 focus:ring-primary-500" />
                                     <div>
                                        <span className="text-sm font-bold text-white block">Chế độ Đồng Nhân (Fanfiction Mode)</span>
                                        <span className="text-[10px] text-gray-500">Kích hoạt AI tra cứu và tuân thủ thiết lập của tác phẩm gốc.</span>
                                     </div>
                                </div>
                                {formData.isFanfiction && (
                                    <div className="ml-8 space-y-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-primary-400 uppercase mb-1">Tên Fandom / Tác phẩm gốc</label>
                                            <input 
                                                className="w-full bg-gray-900 border border-primary-500/30 rounded-lg p-2 text-sm text-white focus:border-primary-500 outline-none"
                                                value={formData.fandomName}
                                                onChange={e => setFormData({...formData, fandomName: e.target.value})}
                                                placeholder="Harry Potter, Naruto, One Piece..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-primary-400 uppercase mb-1">File TXT Truyện gốc / Tài liệu bối cảnh</label>
                                            <div className="flex flex-col gap-2">
                                                {fandomFiles.length > 0 && (
                                                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                                                        {fandomFiles.map((doc, idx) => (
                                                            <div key={doc.id || idx} className="flex items-center justify-between bg-primary-950/20 border border-primary-900/30 px-3 py-1.5 rounded-lg text-xs">
                                                                <span className="text-gray-300 font-mono truncate max-w-[250px]">{doc.name}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-gray-500 text-[10px]">({(doc.content.length / 1024).toFixed(1)} KB)</span>
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={() => setFandomFiles(fandomFiles.filter((_, i) => i !== idx))} 
                                                                        className="text-red-400 hover:text-red-300 transition-colors ml-1"
                                                                        title="Xóa tệp"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-3">
                                                    <label className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-bold py-1.5 px-3 rounded-lg cursor-pointer text-[11px] transition-colors flex items-center gap-1.5">
                                                        <svg className="w-3.5 h-3.5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                        </svg>
                                                        Tải lên thêm File TXT
                                                        <input 
                                                            type="file" 
                                                            accept=".txt" 
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;
                                                                const reader = new FileReader();
                                                                reader.onload = (event) => {
                                                                    const content = event.target?.result as string;
                                                                    setFandomFiles(prev => [
                                                                        ...prev,
                                                                        {
                                                                            id: Math.random().toString(36).substring(2, 11),
                                                                            name: file.name,
                                                                            content: content,
                                                                            createdAt: Date.now(),
                                                                            analysis: {
                                                                                summary: "Dữ liệu truyện gốc tải lên tại cài đặt.",
                                                                                characterAnalysis: "Các nhân vật.",
                                                                                styleAnalysis: "Hồn văn gốc.",
                                                                                pacingAnalysis: "Nhịp điệu.",
                                                                                writingDNA: {
                                                                                    narrativeVoice: "Đồng nhân",
                                                                                    vocabularyPalette: ["nguyên tác"],
                                                                                    sentenceStructure: "Chuẩn",
                                                                                    thematicElements: ["nguyên tác"],
                                                                                    emotionalTone: "Trung lập",
                                                                                    rhythm: "Vừa"
                                                                                }
                                                                            }
                                                                        }
                                                                    ]);
                                                                };
                                                                reader.readAsText(file);
                                                            }} 
                                                            className="hidden" 
                                                        />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Niên đại / Mốc thời gian (Quan trọng)
                                </label>
                                <input 
                                    className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-orange-300 focus:border-orange-500 outline-none transition-all font-mono" 
                                    placeholder="Vd: Năm 1945, Thời Chiến Quốc, Kỷ Nguyên Thiên Khải năm thứ 3..."
                                    value={formData.currentTimeline} 
                                    onChange={e => setFormData({...formData, currentTimeline: e.target.value})} 
                                />
                                <p className="text-[10px] text-gray-500 italic">Thiết lập mốc lịch sử để AI tránh các lỗi anachronism (như dùng điện thoại thời cổ đại).</p>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">Tóm tắt cốt truyện (Synopsis)</label>
                                <textarea className="w-full h-24 bg-gray-900 border border-gray-800 rounded-xl p-3 text-white focus:border-primary-500 outline-none resize-none text-sm" value={formData.synopsis} onChange={e => setFormData({...formData, synopsis: e.target.value})} />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-emerald-400 uppercase tracking-widest">Blueprint (Dàn ý tổng thể)</label>
                                <textarea 
                                    className="w-full h-48 bg-gray-900 border border-gray-800 rounded-xl p-3 text-white text-sm outline-none resize-none focus:border-emerald-500 custom-scrollbar" 
                                    placeholder="Kế hoạch phát triển cốt truyện từ đầu đến cuối..."
                                    value={formData.planning} 
                                    onChange={e => setFormData({...formData, planning: e.target.value})} 
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'prohibitions' && (
                        <div className="space-y-6 animate-fadeIn">
                             <div className="space-y-4">
                                <div className="p-4 bg-red-900/10 border border-red-800/30 rounded-xl">
                                    <h4 className="text-xs font-bold text-red-400 mb-2 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                        Những điều Tuyệt đối Cấm (Negative Constraints)
                                    </h4>
                                    <p className="text-[10px] text-gray-400 leading-relaxed italic">
                                        AI sẽ tuân thủ nghiêm ngặt các quy tắc này. Hãy dùng để ngăn chặn các tình tiết rập khuôn hoặc các từ ngữ bạn ghét. Ví dụ: "Không được dùng từ 'bỗng nhiên'", "Không cho phép nhân vật chính có hào quang bất tử", "Tuyệt đối không viết lời dẫn chương".
                                    </p>
                                </div>
                                <textarea 
                                    className="w-full h-80 bg-gray-900 border border-red-900/20 rounded-2xl p-4 text-white font-serif text-sm leading-relaxed outline-none resize-none focus:border-red-500 transition-all shadow-inner custom-scrollbar" 
                                    placeholder="Nhập các điều cấm tại đây, mỗi điều một dòng..."
                                    value={formData.negativePrompt} 
                                    onChange={e => setFormData({...formData, negativePrompt: e.target.value})} 
                                />
                                <div className="bg-gray-900/30 p-3 rounded-lg border border-gray-800 flex items-center gap-3">
                                     <input type="checkbox" checked={formData.nsfw} onChange={(e) => setFormData({...formData, nsfw: e.target.checked})} className="w-5 h-5 rounded bg-gray-700 text-red-600 focus:ring-red-500" />
                                     <span className="text-sm font-bold text-gray-400 uppercase tracking-tighter">Bật chế độ NSFW (R-18+) - Kích hoạt bộ lọc xưng hô trần trụi</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'mechanics' && (
                        <div className="space-y-6 animate-fadeIn">
                             <div className="space-y-4">
                                <div className="p-4 bg-primary-900/10 border border-primary-800/30 rounded-xl">
                                    <h4 className="text-xs font-bold text-primary-400 mb-2 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                        Quy tắc Tính toán & Cơ chế Thế giới (Mechanics)
                                    </h4>
                                    <p className="text-[10px] text-gray-500 leading-relaxed italic">
                                        Hãy nhập các công thức logic mà AI cần tuân thủ. Ví dụ: "1 Linh thạch = 100 Vàng", "Tốc độ bay của phi kiếm = 50km/h", hoặc "Sát thương = Sức mạnh x 2".
                                    </p>
                                </div>
                                
                                <div className="bg-gray-900/30 p-3 rounded-lg border border-gray-800 flex items-center gap-3">
                                     <input type="checkbox" checked={formData.hasSystem} onChange={(e) => setFormData({...formData, hasSystem: e.target.checked})} className="w-5 h-5 rounded bg-gray-700 text-blue-600 focus:ring-blue-500" />
                                     <div>
                                        <span className="text-sm font-bold text-gray-300 block">Kích hoạt Hệ thống (System/LitRPG)</span>
                                        <span className="text-[10px] text-gray-500">Cho phép AI hiển thị Bảng trạng thái, Nhiệm vụ và Cấp độ kiểu Game.</span>
                                     </div>
                                </div>

                                <textarea 
                                    className="w-full h-80 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white font-mono text-xs leading-relaxed outline-none resize-none focus:border-primary-500 transition-all shadow-inner custom-scrollbar" 
                                    placeholder="Ví dụ:&#10;[KINH TẾ]&#10;1 Kim Nguyên Bảo = 10 Ngân Lượng&#10;1 Ngân Lượng = 1000 Đồng Tiền&#10;&#10;[TU LUYỆN]&#10;Luyện Khí: Tốc độ hồi phục 10 điểm linh lực/giờ"
                                    value={formData.mechanics} 
                                    onChange={e => setFormData({...formData, mechanics: e.target.value})} 
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'world' && (
                        <div className="space-y-8 animate-fadeIn h-full flex flex-col">
                            {/* World Bible Section */}
                            <div className="flex-1 flex flex-col space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                        Lịch sử & Thần thoại (World Bible)
                                    </label>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={handleSuggestSettings}
                                            disabled={isSuggesting}
                                            className="flex items-center gap-1.5 px-3 py-1 text-[9px] font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg shadow-lg transition-all disabled:opacity-50 active:scale-95 border border-white/10"
                                            title="AI sẽ tự động sáng tạo toàn bộ thiết lập dựa trên Tiêu đề và Thể loại"
                                        >
                                            {isSuggesting ? (
                                                <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                            ) : (
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 1.43l-1.004.823a2 2 0 01-2.31 0l-1.004-.823a6 6 0 00-3.86-1.43l-2.387.477a2 2 0 00-1.022.547l-1.004 1.255a2 2 0 00-.32 1.637l1.004 5.023a2 2 0 001.962 1.608h15.688a2 2 0 001.962-1.608l1.004-5.023a2 2 0 00-.32-1.637l-1.004-1.255zM12 2v10m0 0l3-3m-3 3l-3-3" /></svg>
                                            )}
                                            {isSuggesting ? "Đang sáng tạo..." : "✨ AI Kiến tạo Thế giới"}
                                        </button>
                                        <button 
                                            onClick={handleExpandWorldBible}
                                            disabled={isExpandingSetting || !formData.setting.trim()}
                                            className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold text-primary-400 hover:text-primary-300 hover:bg-primary-900/10 rounded transition-all disabled:opacity-50"
                                            title="Chỉ mở rộng nội dung World Bible hiện có"
                                        >
                                            {isExpandingSetting ? (
                                                <span className="w-2.5 h-2.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin"></span>
                                            ) : (
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            )}
                                            Mở rộng
                                        </button>
                                    </div>
                                </div>
                                <textarea 
                                    className="flex-1 w-full bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white font-serif text-sm leading-relaxed outline-none resize-none focus:border-purple-500 transition-all shadow-inner custom-scrollbar min-h-[200px]" 
                                    placeholder="Mô tả nguồn gốc thế giới, các kỷ nguyên lịch sử, tôn giáo, văn hóa và các sự kiện lớn trong quá khứ..."
                                    value={formData.setting} 
                                    onChange={e => setFormData({...formData, setting: e.target.value})} 
                                />
                            </div>

                            {/* Geography Section */}
                            <div className="flex-1 flex flex-col space-y-2">
                                <label className="block text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Địa lý & Bản đồ văn bản (Geography)
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                                    <textarea 
                                        className="md:col-span-2 w-full h-full bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white font-serif text-sm leading-relaxed outline-none resize-none focus:border-cyan-500 transition-all shadow-inner custom-scrollbar min-h-[150px]" 
                                        placeholder="Liệt kê các lục địa, vương quốc, thành phố, bí cảnh và đặc điểm địa hình (khí hậu, tài nguyên)..."
                                        value={formData.maps} 
                                        onChange={e => setFormData({...formData, maps: e.target.value})} 
                                    />
                                    <div className="bg-gray-850/50 border border-gray-800 rounded-2xl p-4 flex flex-col gap-2">
                                        <h5 className="text-[9px] font-black text-cyan-500 uppercase">Gợi ý thiết lập:</h5>
                                        <ul className="text-[10px] text-gray-400 space-y-2 list-disc list-inside">
                                            <li>Tên các vùng đất lớn.</li>
                                            <li>Khí hậu đặc trưng (băng giá, sa mạc, rừng rậm).</li>
                                            <li>Vị trí chiến lược (cửa ải, cảng biển).</li>
                                            <li>Khoáng sản hoặc linh mạch đặc biệt.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Society & Economy Section (Factions, Culture, Economy) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-[250px]">
                                <div className="space-y-2 h-full flex flex-col">
                                    <label className="block text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                        Các Thế Lực & Tổ Chức (Factions)
                                    </label>
                                    <textarea 
                                        className="flex-1 w-full bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white text-sm outline-none resize-none focus:border-purple-500 transition-all custom-scrollbar" 
                                        placeholder="Mô tả các tông môn, triều đình, gia tộc lớn, hiệp hội và mối quan hệ thù địch/đồng minh giữa họ..."
                                        value={formData.officials} 
                                        onChange={e => setFormData({...formData, officials: e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-2 h-full flex flex-col">
                                    <label className="block text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-8a2 2 0 012-2h14a2 2 0 012 2v8M3 21h18M3 21l8-8 8 8M3 10l9-7 9 7" /></svg>
                                        Văn Hóa & Tín Ngưỡng (Culture)
                                    </label>
                                    <textarea 
                                        className="flex-1 w-full bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white text-sm outline-none resize-none focus:border-orange-500 transition-all custom-scrollbar" 
                                        placeholder="Tôn giáo, lễ hội, phong tục tập quán, cấu trúc xã hội và các điều kiêng kỵ..."
                                        value={formData.logistics} 
                                        onChange={e => setFormData({...formData, logistics: e.target.value})} 
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-yellow-400 uppercase tracking-widest flex items-center gap-2">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Kinh Tế & Tài Nguyên (Economy)
                                </label>
                                <textarea 
                                    className="w-full h-32 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white text-sm outline-none resize-none focus:border-yellow-500 transition-all custom-scrollbar" 
                                    placeholder="Hệ thống tiền tệ, vật phẩm quý hiếm, đặc sản vùng miền, mức sống dân cư..."
                                    value={formData.economy} 
                                    onChange={e => setFormData({...formData, economy: e.target.value})} 
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'style' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-primary-400 uppercase tracking-widest">Phong cách viết</label>
                                <textarea className="w-full h-32 bg-gray-900 border border-gray-800 rounded-xl p-3 text-white focus:border-primary-500 outline-none resize-none text-sm" value={formData.writingStyle} onChange={e => setFormData({...formData, writingStyle: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">Góc nhìn (POV)</label>
                                <input className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-white focus:border-primary-500 outline-none transition-all" value={formData.pov} onChange={e => setFormData({...formData, pov: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'dialogue' && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                                <div className="lg:col-span-3 space-y-6">
                                    <div className="space-y-4">
                                        <label className="block text-[10px] font-black text-primary-400 uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"></span>
                                            Thiết lập xưng hô cơ bản (Preset)
                                        </label>
                                        <select 
                                            value={selectedPronounId} 
                                            onChange={(e) => handlePronounPresetChange(e.target.value)} 
                                            className="w-full bg-gray-850 border border-gray-700 text-xs text-gray-300 rounded-xl p-3 outline-none focus:border-primary-500 transition-all shadow-inner"
                                        >
                                            {PRONOUN_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                        </select>
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <label className="block text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                            Quy tắc tương tác & Quan hệ cụ thể
                                        </label>
                                        <textarea 
                                            className="w-full h-80 bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white font-serif text-sm leading-relaxed outline-none resize-none focus:border-emerald-500 transition-all shadow-inner custom-scrollbar" 
                                            placeholder="Ghi chú chi tiết cách các nhân vật gọi nhau..."
                                            value={formData.interactionRules} 
                                            onChange={e => setFormData({...formData, interactionRules: e.target.value})} 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-gray-800 bg-gray-900/50 flex justify-end items-center gap-3 shrink-0">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white text-sm font-bold transition-colors">Hủy</button>
                    <button onClick={handleSave} disabled={isGenerating} className="px-8 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-xl font-black shadow-lg text-sm transition-all transform hover:-translate-y-0.5">
                        {isGenerating ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                </div>
            </div>
        </div>
    );
}
