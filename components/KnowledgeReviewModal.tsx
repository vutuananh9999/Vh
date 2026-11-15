import React, { useState, useEffect } from 'react';
import { useStory } from '../context/StoryContext.tsx';
import { WritingDNA } from '../types.ts';

interface SelectionState {
    characters: boolean[];
    newCharacters: boolean[];
    lore: boolean[];
    mechanics: boolean[];
    dna: boolean;
    genre: boolean;
    synopsis: boolean;
}

export const KnowledgeReviewModal: React.FC = () => {
    const { 
        consistencyReport, 
        clearConsistencyReport, 
        applyKnowledgeExtraction,
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
                dna: !!consistencyReport.writingDNA,
                genre: !!consistencyReport.genreSuggestion && (!story?.genre || story.genre === 'Chưa xác định'),
                synopsis: !!consistencyReport.synopsisSuggestion && !(story?.synopsis || '').trim(),
            });
        }
    }, [consistencyReport, story?.genre, story?.synopsis]);

    if (!consistencyReport || !selected) return null;

    const { 
        characterUpdates = [], 
        newCharacters = [],
        worldLore = [], 
        mechanics = [],
        writingDNA = null,
        genreSuggestion = '',
        synopsisSuggestion = ''
    } = consistencyReport;

    const toggle = (type: keyof SelectionState, index?: number) => {
        const next = { ...selected };
        if (typeof index === 'number') {
            const arr = [...(next[type] as boolean[])];
            arr[index] = !arr[index];
            (next as any)[type] = arr;
        } else {
            (next as any)[type] = !next[type];
        }
        setSelected(next);
    };

    const toggleAll = (value: boolean) => {
        setSelected({
            characters: new Array(characterUpdates.length).fill(value),
            newCharacters: new Array(newCharacters.length).fill(value),
            lore: new Array(worldLore.length).fill(value),
            mechanics: new Array(mechanics.length).fill(value),
            dna: !!writingDNA && value,
            genre: !!genreSuggestion && value,
            synopsis: !!synopsisSuggestion && value
        });
    };

    const handleApplySelected = async () => {
        setIsSyncing(true);
        try {
            await applyKnowledgeExtraction({
                newCharacters: newCharacters.filter((_: any, i: number) => selected.newCharacters[i]),
                characterUpdates: characterUpdates.filter((_: any, i: number) => selected.characters[i]),
                worldLore: worldLore.filter((_: any, i: number) => selected.lore[i]),
                mechanics: mechanics.filter((_: any, i: number) => selected.mechanics[i]),
                writingDNA: selected.dna ? (writingDNA as WritingDNA) : null,
                genreSuggestion: selected.genre ? genreSuggestion : undefined,
                synopsisSuggestion: selected.synopsis ? synopsisSuggestion : undefined,
            });
        } catch (e: any) {
            console.error(e);
            alert(e?.message || "Lỗi khi đồng bộ tri thức vào truyện.");
        } finally {
            setIsSyncing(false);
        }
    };

    const selectedCount =
        selected.newCharacters.filter(Boolean).length +
        selected.characters.filter(Boolean).length +
        selected.lore.filter(Boolean).length +
        selected.mechanics.filter(Boolean).length +
        (selected.dna ? 1 : 0) +
        (selected.genre ? 1 : 0) +
        (selected.synopsis ? 1 : 0);

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden border-t-4 border-t-emerald-500">
                <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-850/50 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-500/30 shrink-0">
                            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">Trung tâm Tiếp nhận Tri thức & Nhân vật</h2>
                            <p className="text-[11px] text-gray-400">Chọn các mục chính xác để lưu vào hồ sơ truyện (đã chọn {selectedCount} mục)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleAll(true)} className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-[10px] font-bold">Chọn hết</button>
                        <button onClick={() => toggleAll(false)} className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-[10px] font-bold">Bỏ chọn</button>
                        <button onClick={clearConsistencyReport} className="p-2 text-gray-400 hover:text-white bg-gray-800 rounded-full transition-colors">✕</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-gray-950/20">
                    {/* Optional Story Genre & Synopsis Suggestions */}
                    {(genreSuggestion || synopsisSuggestion) && (
                        <div className="space-y-3 animate-fadeIn">
                            <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Đề xuất Hồ sơ Truyện</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {genreSuggestion && (
                                    <div onClick={() => toggle('genre')} className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${selected.genre ? 'bg-cyan-950/20 border-cyan-500/40' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                        <div>
                                            <span className="text-[9px] font-black text-cyan-400 uppercase block">Thể loại phát hiện</span>
                                            <p className="text-sm text-white font-semibold mt-0.5">{genreSuggestion}</p>
                                        </div>
                                        <span className="text-xs">{selected.genre ? '✅' : '⬜'}</span>
                                    </div>
                                )}
                                {synopsisSuggestion && (
                                    <div onClick={() => toggle('synopsis')} className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${selected.synopsis ? 'bg-cyan-950/20 border-cyan-500/40' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                        <div>
                                            <span className="text-[9px] font-black text-cyan-400 uppercase block">Tóm tắt cốt truyện (Synopsis)</span>
                                            <p className="text-xs text-gray-300 mt-1 leading-relaxed">{synopsisSuggestion}</p>
                                        </div>
                                        <span className="text-xs shrink-0">{selected.synopsis ? '✅' : '⬜'}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* New Characters Discovery */}
                    {newCharacters.length > 0 && (
                        <div className="space-y-4 animate-fadeIn">
                            <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                Nhân vật mới phát hiện ({newCharacters.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {newCharacters.map((char: any, i: number) => (
                                    <div key={i} onClick={() => toggle('newCharacters', i)} className={`p-4 rounded-xl border cursor-pointer transition-all relative ${selected.newCharacters[i] ? 'bg-emerald-900/15 border-emerald-500/40 shadow-lg' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <div>
                                                <div className="font-bold text-white text-sm">{char.name}</div>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {char.role && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-bold">{char.role}</span>}
                                                    {char.species && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">{char.species}</span>}
                                                    {char.powerLevel && <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-500/30">{char.powerLevel}</span>}
                                                </div>
                                            </div>
                                            <span className="text-xs">{selected.newCharacters[i] ? '✅' : '⬜'}</span>
                                        </div>
                                        <p className="text-xs text-gray-300 leading-relaxed mt-2">{char.description || 'Chưa có mô tả chi tiết.'}</p>
                                        {char.currentLocation && <p className="text-[10px] text-indigo-400 mt-1.5">📍 {char.currentLocation}</p>}
                                        {Array.isArray(char.traits) && char.traits.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {char.traits.slice(0, 4).map((t: string, idx: number) => (
                                                    <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-gray-800/80 text-gray-400 rounded">{t}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Existing Character Updates */}
                    {characterUpdates.length > 0 && (
                        <div className="space-y-4 animate-fadeIn">
                            <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                Cập nhật Nhân vật hiện có ({characterUpdates.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {characterUpdates.map((update: any, i: number) => (
                                    <div key={i} onClick={() => toggle('characters', i)} className={`p-4 rounded-xl border cursor-pointer transition-all relative ${selected.characters[i] ? 'bg-purple-900/15 border-purple-500/40 shadow-lg' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="font-bold text-white text-sm">{update.name}</div>
                                            <span className="text-[9px] px-2 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-300 uppercase">{update.status || 'alive'}</span>
                                        </div>
                                        <div className="space-y-1.5 text-xs text-gray-300">
                                            {update.powerLevel && <p><span className="text-purple-400 font-bold">Thực lực:</span> {update.powerLevel}</p>}
                                            {update.currentLocation && <p><span className="text-indigo-400 font-bold">Vị trí:</span> {update.currentLocation}</p>}
                                            {update.healthStatus && <p><span className="text-red-400 font-bold">Tình trạng:</span> {update.healthStatus}</p>}
                                            {update.abilities && <p><span className="text-amber-400 font-bold">Kỹ năng:</span> {update.abilities}</p>}
                                            {update.knowledge && (
                                                <div className="bg-blue-950/30 p-2 rounded border border-blue-900/30 mt-1">
                                                    <span className="text-blue-400 font-bold block mb-0.5">📚 Tri thức / Bí mật mới:</span>
                                                    <span className="text-blue-100">{update.knowledge}</span>
                                                </div>
                                            )}
                                            {update.realizations && <p className="italic text-gray-400">"{update.realizations}"</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* World Lore */}
                    {worldLore.length > 0 && (
                        <div className="space-y-4 animate-fadeIn">
                            <h3 className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                                Bối cảnh, Địa danh & Thế lực ({worldLore.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {worldLore.map((lore: any, i: number) => (
                                    <div key={i} onClick={() => toggle('lore', i)} className={`p-4 rounded-xl border cursor-pointer transition-all ${selected.lore[i] ? 'bg-amber-950/15 border-amber-500/40' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="font-bold text-amber-300 text-xs">{lore.topic}</span>
                                            <span className="text-xs">{selected.lore[i] ? '✅' : '⬜'}</span>
                                        </div>
                                        <p className="text-xs text-gray-300 leading-relaxed">{lore.content}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mechanics / Rules */}
                    {mechanics.length > 0 && (
                        <div className="space-y-4 animate-fadeIn">
                            <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                                Hệ thống Sức mạnh & Quy tắc Thế giới ({mechanics.length})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {mechanics.map((mech: any, i: number) => (
                                    <div key={i} onClick={() => toggle('mechanics', i)} className={`p-4 rounded-xl border cursor-pointer transition-all ${selected.mechanics[i] ? 'bg-indigo-950/20 border-indigo-500/40' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="font-bold text-indigo-300 text-xs">{mech.name || mech.rule}</span>
                                            <span className="text-xs">{selected.mechanics[i] ? '✅' : '⬜'}</span>
                                        </div>
                                        <p className="text-xs text-gray-300 leading-relaxed">{mech.detail || mech.rule}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Writing DNA */}
                    {writingDNA && (
                         <div className="space-y-4 animate-fadeIn">
                            <h3 className="text-[10px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-2">
                                Phát hiện Hồn Văn (Literary DNA)
                            </h3>
                            <div onClick={() => toggle('dna')} className={`p-5 rounded-2xl border cursor-pointer transition-all relative ${selected.dna ? 'bg-pink-900/15 border-pink-500/40 shadow-lg' : 'bg-gray-900/40 border-gray-800 opacity-50'}`}>
                                <div className="absolute top-4 right-4 text-sm">{selected.dna ? '✅' : '⬜'}</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-[9px] font-black text-pink-500 uppercase block mb-1">Giọng kể</span>
                                        <p className="text-sm text-gray-200">{writingDNA.narrativeVoice}</p>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-black text-pink-500 uppercase block mb-1">Cảm xúc chủ đạo</span>
                                        <p className="text-sm text-gray-200">{writingDNA.emotionalTone}</p>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <span className="text-[9px] font-black text-pink-500 uppercase block mb-1">Nhịp điệu văn chương</span>
                                        <p className="text-sm text-gray-300 italic">"{writingDNA.rhythm}"</p>
                                    </div>
                                </div>
                            </div>
                         </div>
                    )}
                </div>

                <div className="p-5 border-t border-gray-800 bg-gray-850/50 flex justify-end items-center gap-3 shrink-0">
                    <button onClick={clearConsistencyReport} className="px-6 py-2.5 text-xs font-black text-gray-400 hover:text-white uppercase tracking-widest transition-colors">Bỏ qua</button>
                    <button onClick={handleApplySelected} disabled={isSyncing || selectedCount === 0} className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-primary-600 hover:from-emerald-500 hover:to-primary-500 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl transition-all flex items-center gap-2">
                        {isSyncing && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                        Đồng bộ {selectedCount} mục vào Truyện
                    </button>
                </div>
            </div>
        </div>
    );
};
