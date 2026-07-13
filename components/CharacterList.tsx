
import React, { useState } from 'react';
import { Character, CharacterStatus, EntityType } from '../types.ts';
import { useStory } from '../context/StoryContext.tsx';

interface Props {
  characters: Character[];
}

export const CharacterList: React.FC<Props> = ({ characters }) => {
  const { addCharacterManual, updateCharacter, deleteCharacter, autoUpdateCharacter } = useStory();
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'stats' | 'memory' | 'relations'>('info');
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  
  const [editForm, setEditForm] = useState<Partial<Character>>({});
  const [newCharForm, setNewCharForm] = useState<Partial<Character>>({
    name: '',
    role: 'Phụ',
    description: '',
    appearance: '',
    traits: [],
    status: 'alive',
    entityType: 'human',
    species: ''
  });

  const getStatusColor = (status: CharacterStatus | undefined) => {
      switch (status) {
          case 'alive': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
          case 'injured': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
          case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse';
          case 'missing': return 'bg-gray-500/20 text-gray-400 border-gray-500/30 border-dashed';
          case 'sealed': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
          case 'deceased': return 'bg-gray-800 text-gray-600 border-gray-700 line-through';
          default: return 'bg-gray-800 text-gray-400 border-gray-700';
      }
  };

  const getStatusLabel = (status: CharacterStatus | undefined) => {
      switch (status) {
          case 'alive': return 'Bình thường';
          case 'injured': return 'Bị thương';
          case 'critical': return 'Nguy kịch';
          case 'missing': return 'Mất tích';
          case 'sealed': return 'Phong ấn';
          case 'deceased': return 'Tử vong';
          default: return 'Không rõ';
      }
  };

  const getEntityIcon = (type?: EntityType) => {
      switch (type) {
          case 'creature': return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; // Replace with proper beast/dragon icon if available
          case 'spirit': return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
          case 'object': return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
          default: return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
      }
  };

  const handleOpenView = (char: Character) => {
    setSelectedChar(char);
    setEditForm(char);
    setIsEditing(false);
    setActiveTab('info');
  };

  const handleSaveEdit = () => {
    if (selectedChar && editForm.name) {
      updateCharacter(selectedChar.id, editForm);
      setIsEditing(false);
      setSelectedChar({ ...selectedChar, ...editForm } as Character);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteCharacter(id);
    setConfirmDeleteId(null);
    setSelectedChar(null);
  };

  const handleAutoSync = async () => {
    if (!selectedChar || isAutoSyncing) return;
    setIsAutoSyncing(true);
    try {
        const updated = await autoUpdateCharacter(selectedChar.id);
        if (updated) {
            setSelectedChar(updated);
            setEditForm(updated);
            alert(`Đã đồng bộ tình trạng cho ${updated.name}!`);
        }
    } catch (e) { console.error(e); }
    finally { setIsAutoSyncing(false); }
  };

  const filteredCharacters = characters.filter(char => 
    char.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    char.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderCombatState = (combatStateJson: string | undefined) => {
      if (!combatStateJson) return <p className="text-xs text-gray-500 italic">Chưa có dữ liệu chiến trạng.</p>;
      try {
          const data = JSON.parse(combatStateJson);
          return (
              <div className="space-y-3">
                  <div className="flex gap-4">
                      <div className="flex-1 bg-red-900/10 border border-red-500/20 p-3 rounded-xl">
                          <span className="text-[9px] font-black text-red-400 uppercase block mb-1">HP (Sinh lực)</span>
                          <div className="text-lg font-bold text-white">{data.hp || '???'}</div>
                      </div>
                      <div className="flex-1 bg-blue-900/10 border border-blue-500/20 p-3 rounded-xl">
                          <span className="text-[9px] font-black text-blue-400 uppercase block mb-1">Stamina (Thể lực)</span>
                          <div className="text-lg font-bold text-white">{data.stamina || '???'}</div>
                      </div>
                  </div>
                  {data.injuries && data.injuries.length > 0 && (
                      <div className="bg-orange-900/10 border border-orange-500/20 p-3 rounded-xl">
                          <span className="text-[9px] font-black text-orange-400 uppercase block mb-1">Thương tích</span>
                          <ul className="list-disc list-inside text-xs text-orange-200">
                              {data.injuries.map((inj: string, i: number) => <li key={i}>{inj}</li>)}
                          </ul>
                      </div>
                  )}
                  {data.debuffs && data.debuffs.length > 0 && (
                      <div className="bg-purple-900/10 border border-purple-500/20 p-3 rounded-xl">
                          <span className="text-[9px] font-black text-purple-400 uppercase block mb-1">Trạng thái xấu (Debuffs)</span>
                          <ul className="list-disc list-inside text-xs text-purple-200">
                              {data.debuffs.map((db: string, i: number) => <li key={i}>{db}</li>)}
                          </ul>
                      </div>
                  )}
              </div>
          );
      } catch (e) {
          return <p className="text-xs text-gray-400 italic bg-gray-800 p-2 rounded">{combatStateJson}</p>;
      }
  };

  return (
    <>
      <div className="p-4 border-b border-gray-800 space-y-3 shrink-0 bg-gray-900/50">
          <div className="relative group">
              <input 
                type="text"
                placeholder="Tìm nhân vật..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-8 pr-3 py-2 text-xs text-gray-300 focus:border-primary-500 outline-none transition-all placeholder:text-gray-600"
              />
              <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-600 group-focus-within:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
          </div>

          <button onClick={() => setIsAdding(!isAdding)} className={`w-full py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all border shadow-lg ${isAdding ? 'bg-red-900/20 text-red-400 border-red-900/50' : 'bg-primary-600/10 text-primary-400 border-primary-500/30 hover:bg-primary-600/20'}`}>
            {isAdding ? 'Hủy bỏ' : '+ Tạo nhân vật mới'}
          </button>
          
          {isAdding && (
              <div className="mt-4 space-y-3 bg-gray-950/60 p-4 rounded-xl border border-gray-800 animate-fadeIn shadow-2xl">
                  <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Tên nhân vật..." className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-white outline-none focus:border-primary-500" value={newCharForm.name} onChange={e => setNewCharForm({...newCharForm, name: e.target.value})} />
                      <input placeholder="Chủng tộc (Vd: Rồng)..." className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-white outline-none focus:border-primary-500" value={newCharForm.species} onChange={e => setNewCharForm({...newCharForm, species: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                      <select className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-white outline-none focus:border-primary-500" value={newCharForm.entityType} onChange={e => setNewCharForm({...newCharForm, entityType: e.target.value as EntityType})}>
                          <option value="human">Người</option>
                          <option value="creature">Thú/Rồng</option>
                          <option value="spirit">Tinh Linh</option>
                          <option value="object">Pháp Bảo</option>
                      </select>
                      <select className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-white outline-none focus:border-primary-500" value={newCharForm.role} onChange={e => setNewCharForm({...newCharForm, role: e.target.value})}>
                          <option value="Chính">Chính</option>
                          <option value="Phụ">Phụ</option>
                          <option value="Phản diện">Ác</option>
                          <option value="Ẩn số">Ẩn</option>
                      </select>
                      <select className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-white outline-none focus:border-primary-500" value={newCharForm.status} onChange={e => setNewCharForm({...newCharForm, status: e.target.value as CharacterStatus})}>
                          <option value="alive">Sống</option>
                          <option value="injured">Bị thương</option>
                          <option value="deceased">Chết</option>
                      </select>
                  </div>
                  <textarea placeholder="Mô tả sơ lược..." className="w-full h-20 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-white resize-none outline-none focus:border-primary-500" value={newCharForm.description} onChange={e => setNewCharForm({...newCharForm, description: e.target.value})} />
                  <button onClick={() => { if (newCharForm.name) { addCharacterManual(newCharForm); setIsAdding(false); setNewCharForm({name:'', role:'Phụ', description:'', status: 'alive', entityType: 'human', species: ''}); } }} className="w-full py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all">Xác nhận tạo</button>
              </div>
          )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {filteredCharacters.map(char => {
          const isDeceased = char.status === 'deceased';
          const icon = getEntityIcon(char.entityType);
          return (
            <div 
              key={char.id} 
              className={`group relative bg-gray-850 border border-gray-800 rounded-xl overflow-hidden hover:border-primary-500/50 transition-all cursor-pointer shadow-sm hover:shadow-primary-900/10 ${selectedChar?.id === char.id ? 'ring-1 ring-primary-500 border-primary-500' : ''} ${isDeceased ? 'opacity-60' : ''}`} 
              onClick={() => handleOpenView(char)}
            >
              <div className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={`text-gray-500 ${char.entityType === 'creature' ? 'text-orange-400' : ''}`}>{icon}</span>
                          <h4 className={`font-bold transition-colors truncate pr-2 ${isDeceased ? 'text-gray-500 line-through decoration-red-500/50' : 'text-gray-200 group-hover:text-primary-400'}`}>{char.name}</h4>
                      </div>
                      <div className="flex gap-1 items-center">
                        {char.species && <span className="shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-gray-800 text-gray-400 border border-gray-700">{char.species}</span>}
                        <span className={`shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase border ${getStatusColor(char.status)}`}>{getStatusLabel(char.status)}</span>
                      </div>
                  </div>
                  <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                          <p className="text-[11px] text-gray-500 line-clamp-1 leading-relaxed">{char.description || 'Chưa có mô tả.'}</p>
                          {char.currentLocation && (
                              <div className="flex items-center gap-1 mt-1 text-[9px] text-indigo-400 font-medium">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                  {char.currentLocation}
                              </div>
                          )}
                      </div>
                      <span className={`shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase border ${char.role === 'Chính' ? 'bg-primary-950 text-primary-400 border-primary-500/30' : 'bg-gray-900 text-gray-500 border-gray-800'}`}>{char.role}</span>
                  </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedChar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn" onClick={() => setSelectedChar(null)}>
            <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
                
                <div className="p-6 border-b border-gray-800 flex justify-between items-start bg-gray-850/50">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            {getEntityIcon(selectedChar.entityType)}
                            <h3 className={`text-2xl font-bold truncate ${selectedChar.status === 'deceased' ? 'text-gray-500 line-through' : 'text-white'}`}>{selectedChar.name}</h3>
                            <span className="text-[10px] px-2 py-0.5 bg-primary-950 text-primary-400 rounded-full font-black border border-primary-500/20">{selectedChar.role}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black border uppercase ${getStatusColor(selectedChar.status)}`}>{getStatusLabel(selectedChar.status)}</span>
                            {selectedChar.species && <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-gray-800 text-gray-300 border border-gray-700 uppercase">{selectedChar.species}</span>}
                            {selectedChar.currentLocation && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                    {selectedChar.currentLocation}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {selectedChar.status !== 'deceased' && (
                            <button onClick={handleAutoSync} disabled={isAutoSyncing} className={`p-2 rounded-full transition-all bg-emerald-950/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white ${isAutoSyncing ? 'animate-pulse' : ''}`} title="AI Tự động cập nhật tình trạng">
                                <svg className={`w-5 h-5 ${isAutoSyncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                        )}
                        <button onClick={() => setIsEditing(!isEditing)} className={`p-2 rounded-full transition-all ${isEditing ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button onClick={() => setConfirmDeleteId(selectedChar.id)} className="p-2 bg-gray-800 text-gray-400 hover:text-red-500 rounded-full transition-all">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex bg-gray-950 border-b border-gray-800 shrink-0 overflow-x-auto">
                    <button onClick={() => setActiveTab('info')} className={`flex-1 min-w-[80px] py-3 text-[10px] font-black uppercase transition-all ${activeTab === 'info' ? 'text-primary-400 border-b-2 border-primary-500 bg-primary-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Thông tin</button>
                    <button onClick={() => setActiveTab('stats')} className={`flex-1 min-w-[80px] py-3 text-[10px] font-black uppercase transition-all ${activeTab === 'stats' ? 'text-red-400 border-b-2 border-red-500 bg-red-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Chiến Trạng</button>
                    <button onClick={() => setActiveTab('memory')} className={`flex-1 min-w-[80px] py-3 text-[10px] font-black uppercase transition-all ${activeTab === 'memory' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Tri Thức</button>
                    <button onClick={() => setActiveTab('relations')} className={`flex-1 min-w-[80px] py-3 text-[10px] font-black uppercase transition-all ${activeTab === 'relations' ? 'text-orange-400 border-b-2 border-orange-500 bg-orange-500/5' : 'text-gray-500 hover:text-gray-300'}`}>Quan hệ</button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gray-900">
                    {activeTab === 'info' && (
                        <div className="space-y-6 animate-fadeIn">
                            {isEditing ? (
                                <div className="space-y-4">
                                    <input className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <select className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white outline-none" value={editForm.entityType || 'human'} onChange={e => setEditForm({...editForm, entityType: e.target.value as EntityType})}>
                                            <option value="human">Người</option>
                                            <option value="creature">Thú/Rồng</option>
                                            <option value="spirit">Tinh Linh</option>
                                            <option value="object">Pháp Bảo</option>
                                        </select>
                                        <input className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white" value={editForm.species || ''} onChange={e => setEditForm({...editForm, species: e.target.value})} placeholder="Chủng tộc (Vd: Rồng)..." />
                                    </div>
                                    <input className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white font-medium text-indigo-400" value={editForm.currentLocation} onChange={e => setEditForm({...editForm, currentLocation: e.target.value})} placeholder="Vị trí hiện tại..." />
                                    <textarea className="w-full h-24 bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} />
                                    <textarea className="w-full h-24 bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white placeholder:italic" placeholder="Ngoại hình..." value={editForm.appearance} onChange={e => setEditForm({...editForm, appearance: e.target.value})} />
                                    <button onClick={handleSaveEdit} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest">Lưu hồ sơ</button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="bg-gray-850/50 p-4 rounded-2xl border border-gray-800">
                                        <label className="block text-[9px] font-black text-gray-500 uppercase mb-2">Mô tả</label>
                                        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{selectedChar.description || 'Không.'}</div>
                                    </div>
                                    <div className="bg-gray-850/50 p-4 rounded-2xl border border-gray-800">
                                        <label className="block text-[9px] font-black text-gray-500 uppercase mb-2">Ngoại hình</label>
                                        <div className="text-sm text-gray-300 italic whitespace-pre-wrap">{selectedChar.appearance || 'Không.'}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'stats' && (
                        <div className="space-y-6 animate-fadeIn">
                             {isEditing ? (
                                 <div className="space-y-4">
                                     <div className="grid grid-cols-2 gap-4">
                                         <select className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white outline-none" value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value as CharacterStatus})}>
                                              <option value="alive">Bình thường</option>
                                              <option value="injured">Bị thương</option>
                                              <option value="critical">Nguy kịch</option>
                                              <option value="missing">Mất tích</option>
                                              <option value="sealed">Phong ấn</option>
                                              <option value="deceased">Tử vong</option>
                                         </select>
                                         <input className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white" value={editForm.powerLevel} onChange={e => setEditForm({...editForm, powerLevel: e.target.value})} placeholder="Thực lực..." />
                                     </div>
                                     <textarea className="w-full h-24 bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-white font-mono" value={editForm.combatState} onChange={e => setEditForm({...editForm, combatState: e.target.value})} placeholder='JSON Combat State: {"hp": "100%", "injuries": []}' />
                                     <input className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white" value={editForm.healthStatus} onChange={e => setEditForm({...editForm, healthStatus: e.target.value})} placeholder="Tóm tắt tình trạng..." />
                                     <button onClick={handleSaveEdit} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black uppercase">Cập nhật thực lực</button>
                                 </div>
                             ) : (
                                <div className="space-y-6">
                                    <div className="p-4 bg-purple-950/20 border border-purple-900/20 rounded-2xl flex justify-between items-center">
                                        <div>
                                            <label className="text-[9px] font-black text-purple-400 uppercase block mb-1">Cảnh giới / Sức mạnh</label>
                                            <div className="text-lg font-bold text-white">{selectedChar.powerLevel || 'Vô'}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-gray-850/50 p-4 rounded-2xl border border-gray-800">
                                        <label className="text-[9px] font-black text-red-400 uppercase block mb-3 flex items-center gap-2">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            Bộ Nhớ Chiến Trạng (Combat State)
                                        </label>
                                        {renderCombatState(selectedChar.combatState)}
                                    </div>

                                    <div className="p-4 bg-gray-850/50 border border-gray-800 rounded-2xl">
                                        <label className="text-[9px] font-black text-gray-500 uppercase block mb-2">Kỹ năng / Chiêu thức</label>
                                        <div className="text-sm text-gray-300 italic">{selectedChar.abilities || 'Chưa có.'}</div>
                                    </div>
                                </div>
                             )}
                        </div>
                    )}
                    {activeTab === 'memory' && (
                        <div className="space-y-6 animate-fadeIn">
                            {isEditing ? (
                                <div className="space-y-4">
                                    <textarea className="w-full h-60 bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-white" value={editForm.knowledge} onChange={e => setEditForm({...editForm, knowledge: e.target.value})} placeholder="Nhập các kiến thức, bí mật nhân vật đã biết..." />
                                    <button onClick={handleSaveEdit} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black uppercase">Lưu tri thức</button>
                                </div>
                            ) : (
                                <div className="bg-blue-950/10 border border-blue-900/20 p-5 rounded-3xl space-y-4">
                                    <label className="text-[9px] font-black text-blue-400 uppercase block mb-2 flex items-center gap-2">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                        Bộ Nhớ Tri Thức (Knowledge Bank)
                                    </label>
                                    <div className="text-sm text-blue-100/80 leading-relaxed whitespace-pre-wrap font-serif">
                                        {selectedChar.knowledge || 'Nhân vật này chưa có ký ức tri thức đặc biệt nào.'}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'relations' && (
                        <div className="space-y-6 animate-fadeIn">
                             <div className="bg-orange-950/10 border border-orange-900/20 p-5 rounded-3xl space-y-4">
                                <div className="grid gap-3">
                                    <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                        <label className="text-[8px] font-black text-gray-600 uppercase mb-1 block">Người hướng dẫn</label>
                                        <p className="text-xs text-gray-300">{selectedChar.mentors || 'Không có.'}</p>
                                    </div>
                                    <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                        <label className="text-[8px] font-black text-gray-600 uppercase mb-1 block">Đối trọng</label>
                                        <p className="text-xs text-red-400 font-bold">{selectedChar.enemies || 'Vô ưu.'}</p>
                                    </div>
                                </div>
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={() => setConfirmDeleteId(null)}>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                <div className="text-center">
                    <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3 border border-red-500/30">
                        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-white">Xóa nhân vật này?</h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Hành động này không thể hoàn tác. Dữ liệu về "{characters.find(c => c.id === confirmDeleteId)?.name}" sẽ bị mất vĩnh viễn.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold text-xs transition-all">Hủy</button>
                    <button onClick={() => handleDelete(confirmDeleteId)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-xs shadow-lg transition-all">Xác nhận xóa</button>
                </div>
            </div>
        </div>
      )}
    </>
  );
};
