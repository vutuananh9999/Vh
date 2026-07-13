
import React, { useState, useEffect } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { Character, KnowledgeLog, WritingDNA } from '../types.ts';

const generateId = () => {
    try {
        return crypto.randomUUID();
    } catch (e) {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
};

interface SelectionState {
    characters: boolean[];
    newCharacters: boolean[];
    lore: boolean[];
    mechanics: boolean[];
    dna: boolean;
}

export const KnowledgeReviewModal: React.FC = () => {
    const { 
        consistencyReport, 
        clearConsistencyReport, 
        addCharacterManual, 
        updateCharacter,
        updateStorySettings,
        story 
    } = useStory();

    const [selected, setSelected] = useState<SelectionState | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        if (consistencyReport) {
            setSelected({
                characters: new Array(consistencyReport.characterUpdates?.length || 0).fill(true),
                newCharacters: new Array(consistencyReport.newCharacters?.length || 0).fill(true),
                lore: new Array(consistencyReport.worldLore?.length || 0).fill(true),
                mechanics: new Array(consistencyReport.mechanics?.length || 0).fill(true),
                dna: !!consistencyReport.writingDNA
            });
        }
    }, [consistencyReport]);

    if (!consistencyReport || !selected) return null;

    const { 
        characterUpdates = [], 
        newCharacters = [],
        worldLore = [], 
        mechanics = [],
        writingDNA = null
    } = consistencyReport;

    const toggle = (type: keyof SelectionState, index?: number) => {
        const next = { ...selected };
        if (typeof index === 'number') {
            (next[type] as boolean[])[index] = !(next[type] as boolean[])[index];
        } else {
            (next[type] as boolean) = !(next[type] as boolean);
        }
        setSelected(next);
    };

    const handleApplySelected = async () => {
        setIsSyncing(true);
        const newKnowledgeLogs: KnowledgeLog[] = [];

        try {
            // 1. New Characters Discovery
            for (let i = 0; i < newCharacters.length; i++) {
                if (selected.newCharacters[i]) {
                    const char = newCharacters[i];
                    await addCharacterManual(char);
                }
            }

            // 2. Character Status Updates
            for (let i = 0; i < characterUpdates.length; i++) {
                const update = characterUpdates[i];
                if (selected.characters[i]) {
                    const existing = story?.characters.find(c => c.name.toLowerCase() === update.name.toLowerCase());
                    if (existing) {
                        const cleanedUpdate = { ...update };
                        delete cleanedUpdate.name;
                        updateCharacter(existing.id, cleanedUpdate);
                    }
                }
            }

            // 3. Hồn văn (Literary DNA)
            if (selected.dna && writingDNA) {
                updateStorySettings({ writingDNA: writingDNA as WritingDNA });
            }

            // 4. Bối cảnh & Lore
            let additionalSetting = "";
            for (let i = 0; i < worldLore.length; i++) {
                const l = worldLore[i];
                if (selected.lore[i]) {
                    additionalSetting += `\n### ${l.topic}\n${l.content}`;
                    newKnowledgeLogs.push({
                        id: generateId(),
                        timestamp: Date.now(),
                        category: 'world',
                        title: `Sự kiện: ${l.topic}`,
                        content: l.content,
                        isActive: true
                    });
                }
            }
            if (additionalSetting && story) {
                updateStorySettings({ setting: (story.setting || '') + '\n' + additionalSetting });
            }

            if (newKnowledgeLogs.length > 0 && story) {
                updateStorySettings({ knowledgeLogs: [...(story.knowledgeLogs || []), ...newKnowledgeLogs] });
            }

            clearConsistencyReport();
        } catch (e) { } finally { setIsSyncing(false); }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border-t-4 border-t-emerald-500">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-850/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
                            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Trung tâm Tiếp nhận Tri thức</h2>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-gray-950/20">
                    {characterUpdates.length > 0 && (
                        <div className="space-y-4 animate-fadeIn">
                            <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">Cập nhật Nhân vật ({characterUpdates.length})</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {characterUpdates.map((update: any, i: number) => (
                                    <div key={i} onClick={() => toggle('characters', i)} className={`p-4 rounded-xl border cursor-pointer transition-all relative ${selected.characters[i] ? 'bg-purple-900/10 border-purple-500/40 shadow-lg' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-bold text-white text-sm">{update.name}</div>
                                            <span className="text-[9px] px-2 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-400 uppercase">{update.status || 'Unknown'}</span>
                                        </div>
                                        <div className="space-y-2 text-xs text-gray-400">
                                            {update.powerLevel && <p><span className="text-purple-400 font-bold">Thực lực:</span> {update.powerLevel}</p>}
                                            {update.healthStatus && <p><span className="text-red-400 font-bold">Tình trạng:</span> {update.healthStatus}</p>}
                                            {update.knowledge && (
                                                <div className="bg-blue-950/20 p-2 rounded border border-blue-900/30">
                                                    <span className="text-blue-400 font-bold block mb-1">📚 Tri thức mới:</span> 
                                                    <span className="text-blue-100">{update.knowledge}</span>
                                                </div>
                                            )}
                                            {update.realizations && <p className="italic text-gray-500">" {update.realizations} "</p>}
                                        </div>
                                        {selected.characters[i] && <div className="absolute top-2 right-2"><div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"></div></div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {writingDNA && (
                         <div className="space-y-4 animate-fadeIn">
                            <h3 className="text-[10px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86 1.43l-1.004.823a2 2 0 01-2.31 0l-1.004-.823a6 6 0 00-3.86-1.43l-2.387.477a2 2 0 00-1.022.547l-1.004 1.255a2 2 0 00-.32 1.637l1.004 5.023a2 2 0 001.962 1.608h15.688a2 2 0 001.962-1.608l1.004-5.023a2 2 0 00-.32-1.637l-1.004-1.255z" /></svg>
                                Phát hiện Hồn Văn (Literary DNA)
                            </h3>
                            <div onClick={() => toggle('dna')} className={`p-5 rounded-2xl border cursor-pointer transition-all relative ${selected.dna ? 'bg-pink-900/10 border-pink-500/40 shadow-lg' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                <div className="absolute top-4 right-4">
                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selected.dna ? 'bg-pink-500 border-pink-400' : 'bg-gray-800 border-gray-700'}`}>
                                        {selected.dna && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <span className="text-[9px] font-black text-pink-500 uppercase block mb-1">Giọng kể</span>
                                        <p className="text-sm text-gray-200">{writingDNA.narrativeVoice}</p>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-black text-pink-500 uppercase block mb-1">Cảm xúc chủ đạo</span>
                                        <p className="text-sm text-gray-200">{writingDNA.emotionalTone}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-[9px] font-black text-pink-500 uppercase block mb-1">Nhịp điệu văn chương</span>
                                        <p className="text-sm text-gray-300 italic">"{writingDNA.rhythm}"</p>
                                    </div>
                                </div>
                            </div>
                         </div>
                    )}

                    {newCharacters.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">Nhân vật mới ({newCharacters.length})</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {newCharacters.map((char: any, i: number) => (
                                    <div key={i} onClick={() => toggle('newCharacters', i)} className={`p-4 rounded-xl border cursor-pointer transition-all relative ${selected.newCharacters[i] ? 'bg-emerald-900/10 border-emerald-500/40 shadow-lg' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                        <div className="font-bold text-white mb-1">{char.name}</div>
                                        <p className="text-[10px] text-gray-400 line-clamp-2">{char.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-gray-800 bg-gray-850/50 flex justify-end items-center gap-3 shrink-0">
                    <button onClick={clearConsistencyReport} className="px-6 py-2.5 text-xs font-black text-gray-400 hover:text-white uppercase tracking-widest transition-colors">Bỏ qua</button>
                    <button onClick={handleApplySelected} disabled={isSyncing} className="px-10 py-3 bg-gradient-to-r from-emerald-600 to-primary-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center gap-2">
                        {isSyncing && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                        Đồng bộ Hồn Văn & Tri thức
                    </button>
                </div>
            </div>
        </div>
    );
};
