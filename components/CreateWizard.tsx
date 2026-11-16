
import React, { useState, useMemo } from 'react';
import { useStory } from '../context/StoryContext';
import { PRONOUN_STYLES, compilePronounStyle } from '../constants';
import { Character, EntityType } from '../types';
import { TokenUsageMeter } from './TokenUsageMeter';
import { calculateWizardMetrics } from '../services/tokenEstimator';
import { geminiService } from '../services/geminiService';
import { parseEpubFile } from '../utils/epubHelper';

const SUGGESTED_GENRES = [
    "Tiên Hiệp", "Huyền Huyễn", "Kiếm Hiệp", "Đô Thị", 
    "Khoa Huyễn (Sci-Fi)", "Võng Du (Game)", "Mạt Thế", 
    "Kinh Dị", "Trinh Thám", "Xuyên Không", 
    "Hệ Thống", "Ngôn Tình", "Cung Đấu", "Sắc Hiệp",
    "Dã Sử", "Trọng Sinh", "Linh Dị", "Mecha"
];

const SUGGESTED_ARCHETYPES = [
    "Phế vật", "Thiên tài", "Trọng sinh", "Xuyên không", 
    "Hệ thống", "Sát phạt quả đoán", "Cẩu đạo (Ẩn mình)", "Vô sỉ", 
    "Phản diện", "Lão hồ ly", "Vô địch", "Hắc hóa (Dark)", 
    "Thánh mẫu", "Lãnh khốc", "Đa nhân cách"
];

export const CreateWizard: React.FC<{ onCancel: () => void }> = ({ onCancel }) => {
  const { createStory, isGenerating, expandSettingWithAI, suggestWorldSettings, suggestMainCharacter } = useStory();
  const [title, setTitle] = useState("Thiên Thư Chi Vô");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("Tiên Hiệp");
  const [writingStyle, setWritingStyle] = useState(""); 
  const [pov, setPov] = useState("Ngôi thứ 3 (Toàn tri)");
  
  // Timeline State
  const [currentTimeline, setCurrentTimeline] = useState("");

  // Fanfiction State
  const [isFanfiction, setIsFanfiction] = useState(false);
  const [fandomName, setFandomName] = useState("");
  const [fanfictionFile, setFanfictionFile] = useState<{ name: string; content: string } | null>(null);

  const handleFandomScriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.name.toLowerCase().endsWith('.epub')) {
          try {
              const parsed = await parseEpubFile(file);
              const combinedText = parsed.chapters.map(c => `${c.title}\n\n${c.content}`).join('\n\n---\n\n');
              setFanfictionFile({
                  name: file.name,
                  content: combinedText
              });
              setFandomName(prev => prev || parsed.title || file.name.replace(/\.epub$/i, ""));
          } catch (err) {
              console.error("Lỗi đọc EPUB fanfiction:", err);
              alert("Không thể đọc tệp EPUB này. Vui lòng thử tệp khác.");
          }
          return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
          const content = event.target?.result as string;
          setFanfictionFile({
              name: file.name,
              content: content
          });
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
          setFandomName(prev => prev || nameWithoutExt);
      };
      reader.readAsText(file);
  };

  // Main Character State
  const [mcName, setMcName] = useState("");
  const [mcGender, setMcGender] = useState("Nam");
  const [mcArchetype, setMcArchetype] = useState("Phế vật quật khởi");
  const [mcBackground, setMcBackground] = useState("");
  const [mcSpecies, setMcSpecies] = useState("Người"); 

  const defaultStyle = PRONOUN_STYLES[0];
  const [pronounStyleId, setPronounStyleId] = useState(defaultStyle.id);
  const [interactionRules, setInteractionRules] = useState("");
  
  const [planning, setPlanning] = useState("");
  const [setting, setSetting] = useState("");
  const [mechanics, setMechanics] = useState("");
  const [logistics, setLogistics] = useState(""); // Maps to Culture
  const [trade, setTrade] = useState(""); 
  const [economy, setEconomy] = useState("");
  const [maps, setMaps] = useState("");
  const [officials, setOfficials] = useState(""); // Maps to Factions
  const [negativePrompt, setNegativePrompt] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [hasSystem, setHasSystem] = useState(false);
  const [step, setStep] = useState(1);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isSuggestingMC, setIsSuggestingMC] = useState(false);

  // Suggestion Modal State
  const [suggestionData, setSuggestionData] = useState<any>(null);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, boolean>>({});

  // Active Model State for Token Calculation & Preview
  const [activeModel, setActiveModel] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return geminiService.getFlash();
    }
    return 'gemini-4-hydrogen';
  });

  const handleModelChange = (newModelId: string) => {
    setActiveModel(newModelId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aetheria_model_flash', newModelId);
    }
  };

  const getFinalPronounPrompt = () => {
      const style = PRONOUN_STYLES.find(s => s.id === pronounStyleId);
      return style && style.config ? compilePronounStyle(style.label, style.config) : "";
  };

  // Real-time Token & Context Metrics calculation
  const wizardMetrics = useMemo(() => {
    return calculateWizardMetrics({
      title,
      synopsis,
      genre,
      currentTimeline,
      pov,
      pronounStyle: getFinalPronounPrompt(),
      isFanfiction,
      fandomName,
      fanfictionContent: fanfictionFile?.content,
      mcName,
      mcSpecies,
      mcGender,
      mcArchetype,
      mcBackground,
      interactionRules,
      setting,
      mechanics,
      hasSystem,
      negativePrompt,
      maps,
      officials,
      logistics,
      economy,
      nsfw,
      planning,
      currentStep: step
    }, activeModel);
  }, [
    title, synopsis, genre, currentTimeline, pov, pronounStyleId,
    isFanfiction, fandomName, fanfictionFile,
    mcName, mcSpecies, mcGender, mcArchetype, mcBackground,
    interactionRules, setting, mechanics, hasSystem,
    negativePrompt, maps, officials, logistics, economy, nsfw,
    planning, step, activeModel
  ]);

  const handleExpandSetting = async () => {
      if (!setting.trim()) return;
      setIsExpanding(true);
      const expanded = await expandSettingWithAI(setting);
      setSetting(expanded);
      setIsExpanding(false);
  };

  const handleSuggestSettings = async () => {
      if (!title || !genre) {
          alert("Vui lòng nhập Tiêu đề và Thể loại ở Bước 1 trước.");
          return;
      }
      setIsExpanding(true);
      const data = await suggestWorldSettings(title, genre, synopsis, currentTimeline);
      if (data) {
          setSuggestionData(data);
          // Auto select all valid keys
          const initialSelection: Record<string, boolean> = {};
          Object.keys(data).forEach(key => {
              if (data[key] && typeof data[key] === 'string' && data[key].trim().length > 0) {
                  initialSelection[key] = true;
              }
          });
          setSelectedSuggestions(initialSelection);
          setShowSuggestionModal(true);
      }
      setIsExpanding(false);
  };

  const handleSuggestMC = async () => {
      if (!title || !genre) {
          alert("Vui lòng nhập Tiêu đề và Thể loại ở Bước 1 trước.");
          return;
      }
      setIsSuggestingMC(true);
      try {
          const data = await suggestMainCharacter(title, genre, synopsis);
          if (data) {
              if (data.name) setMcName(data.name);
              if (data.gender) setMcGender(data.gender);
              if (data.species) setMcSpecies(data.species);
              if (data.archetype) setMcArchetype(data.archetype);
              if (data.background) setMcBackground(data.background);
          }
      } catch (e) {
          console.error(e);
      } finally {
          setIsSuggestingMC(false);
      }
  };

  const applySuggestions = () => {
      if (!suggestionData) return;
      
      if (selectedSuggestions['setting']) setSetting(prev => prev ? prev + "\n\n" + suggestionData.setting : suggestionData.setting);
      if (selectedSuggestions['interactionRules']) setInteractionRules(prev => prev ? prev + "\n\n" + suggestionData.interactionRules : suggestionData.interactionRules);
      if (selectedSuggestions['mechanics']) setMechanics(prev => prev ? prev + "\n\n" + suggestionData.mechanics : suggestionData.mechanics);
      if (selectedSuggestions['negativePrompt']) setNegativePrompt(prev => prev ? prev + "\n\n" + suggestionData.negativePrompt : suggestionData.negativePrompt);
      if (selectedSuggestions['maps']) setMaps(prev => prev ? prev + "\n\n" + suggestionData.maps : suggestionData.maps);
      if (selectedSuggestions['officials']) setOfficials(prev => prev ? prev + "\n\n" + suggestionData.officials : suggestionData.officials);
      if (selectedSuggestions['logistics']) setLogistics(prev => prev ? prev + "\n\n" + suggestionData.logistics : suggestionData.logistics);
      if (selectedSuggestions['economy']) setEconomy(prev => prev ? prev + "\n\n" + suggestionData.economy : suggestionData.economy);
      if (selectedSuggestions['trade']) setTrade(prev => prev ? prev + "\n\n" + suggestionData.trade : suggestionData.trade);
      if (selectedSuggestions['planning']) setPlanning(prev => prev ? prev + "\n\n" + suggestionData.planning : suggestionData.planning);

      setShowSuggestionModal(false);
      setSuggestionData(null);
  };

  const toggleSuggestion = (key: string) => {
      setSelectedSuggestions(prev => ({...prev, [key]: !prev[key]}));
  };

  const toggleGenre = (g: string) => {
      const currentGenres = genre.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (currentGenres.includes(g)) {
          setGenre(currentGenres.filter(s => s !== g).join(', '));
      } else {
          setGenre([...currentGenres, g].join(', '));
      }
  };

  const toggleArchetype = (tag: string) => {
      let current = mcArchetype.split(',').map(s => s.trim()).filter(s => s.length > 0);
      if (current.includes(tag)) {
          current = current.filter(t => t !== tag);
      } else {
          current.push(tag);
      }
      setMcArchetype(current.join(', '));
  };

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const handleCreate = async () => {
      // Create Main Character Object
      const mainChar: Character = {
          id: generateId(),
          name: mcName || "Nhân Vật Chính",
          role: "Chính", // Important role for AI focus
          description: `[Giới tính]: ${mcGender}. [Chủng tộc]: ${mcSpecies}. [Kiểu mẫu]: ${mcArchetype}. [Xuất thân]: ${mcBackground}`,
          status: "alive",
          traits: mcArchetype.split(',').map(s => s.trim()).filter(Boolean),
          appearance: "",
          healthStatus: "Bình thường",
          powerLevel: "Khởi đầu",
          entityType: 'human', 
          species: mcSpecies
      };

      const referenceDocs = [];
      if (isFanfiction && fanfictionFile) {
          referenceDocs.push({
              id: generateId(),
              name: fanfictionFile.name,
              content: fanfictionFile.content,
              analysis: {
                  summary: "Dữ liệu truyện gốc tải lên bởi người dùng.",
                  characterAnalysis: "Các nhân vật từ truyện gốc.",
                  styleAnalysis: "Văn phong dã sử/đồng nhân.",
                  pacingAnalysis: "Nhịp điệu.",
                  writingDNA: {
                      narrativeVoice: "Đồng nhân",
                      vocabularyPalette: ["nguyên tác"],
                      sentenceStructure: "Chuẩn",
                      thematicElements: ["nguyên tác"],
                      emotionalTone: "Trung lập",
                      rhythm: "Vừa"
                  }
              },
              createdAt: Date.now()
          });
      }

      await createStory({
          title,
          synopsis,
          genre,
          planning,
          setting,
          currentTimeline, // Passed timeline
          mechanics,
          interactionRules,
          writingStyle,
          pov,
          pronounStyle: getFinalPronounPrompt(),
          negativePrompt,
          nsfw,
          hasSystem,
          isFanfiction,
          fandomName,
          referenceDocs,
          logistics,
          trade,
          economy,
          maps,
          officials,
          characters: [mainChar] 
      });
  };

  const SuggestButton: React.FC<{ target?: string }> = ({ target }) => (
      <button 
        onClick={handleSuggestSettings} 
        disabled={isExpanding}
        className="ml-2 text-[10px] text-purple-400 hover:text-white bg-purple-500/10 hover:bg-purple-500 font-bold px-2.5 py-1 rounded-full border border-purple-500/30 transition-all inline-flex items-center gap-1.5 active:scale-95 group"
        title="Gợi ý nội dung từ AI"
      >
          {isExpanding ? <span className="w-2.5 h-2.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin"></span> : "✨ AI Gợi ý"}
      </button>
  );

  const totalSteps = 9;
  const progressPercentage = (step / totalSteps) * 100;

  return (
    <div className="min-h-full bg-[#050b14] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans w-full">
        {/* Animated Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-900/10 rounded-full blur-[100px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-900/10 rounded-full blur-[100px]"></div>
        </div>

        {isGenerating && (
            <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center animate-fadeIn">
                <div className="relative">
                    <div className="w-20 h-20 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl">✨</span>
                    </div>
                </div>
                <h3 className="text-xl font-bold text-white mt-6 mb-2 animate-pulse tracking-wide">Đang Kiến Tạo Thế Giới...</h3>
                <p className="text-gray-400 text-sm">Aetheria đang dệt nên các tầng thực tại cho bạn.</p>
            </div>
        )}

        {/* Suggestion Review Modal */}
        {showSuggestionModal && suggestionData && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fadeIn">
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
                                officials: "Chính trị & Quan chức",
                                logistics: "Hậu cần & Hạ tầng",
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
                        <button onClick={applySuggestions} className="px-8 py-3 bg-gradient-to-r from-purple-600 to-primary-600 hover:from-purple-500 hover:to-primary-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-purple-900/30 transition-all transform hover:-translate-y-0.5">Áp dụng đã chọn</button>
                    </div>
                </div>
            </div>
        )}

        {/* Main Wizard Card */}
        <div className={`max-w-3xl w-full glass-panel border border-white/5 bg-gray-900/60 backdrop-blur-xl rounded-3xl shadow-2xl z-10 transition-all duration-500 flex flex-col overflow-hidden ${isGenerating ? 'blur-sm scale-95 opacity-50' : ''}`}>
            
            {/* Header with Progress */}
            <div className="relative pt-8 pb-6 px-8 border-b border-white/5">
                <div className="flex justify-between items-center mb-6">
                     <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Thoát
                     </button>
                     <div className="text-center">
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">Khởi Tạo Thế Giới</h2>
                     </div>
                     <div className="w-16"></div> 
                </div>
                
                {/* Progress Bar */}
                <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-purple-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(168,85,247,0.5)]" style={{ width: `${progressPercentage}%` }}></div>
                </div>
                <div className="flex justify-between mt-2 mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    <span>Cơ bản</span>
                    <span>Nhân vật</span>
                    <span>Thế giới</span>
                    <span>Hoàn tất</span>
                </div>

                {/* Real-time Token Usage Meter */}
                <TokenUsageMeter
                    metrics={wizardMetrics}
                    activeModel={activeModel}
                    onModelChange={handleModelChange}
                />
            </div>

             <div className="p-8 overflow-y-auto custom-scrollbar max-h-[70vh]">
                {step === 1 && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Tiêu Đề Truyện</label>
                            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-gray-950/50 border border-gray-700/50 rounded-2xl px-5 py-4 text-lg text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 outline-none transition-all placeholder:text-gray-700" placeholder="Nhập tên tác phẩm..." autoFocus />
                        </div>
                        
                        <div className="bg-gray-900/40 border border-gray-800/50 rounded-2xl p-5 hover:border-primary-500/30 transition-colors cursor-pointer" onClick={() => setIsFanfiction(!isFanfiction)}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-bold text-white block mb-1">Chế độ Đồng Nhân (Fanfiction)</span>
                                    <span className="text-xs text-gray-500">Kích hoạt để AI tra cứu dữ liệu gốc (Canon).</span>
                                </div>
                                <div className={`w-11 h-6 rounded-full relative transition-colors ${isFanfiction ? 'bg-primary-600' : 'bg-gray-700'}`}>
                                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isFanfiction ? 'translate-x-5' : ''}`}></div>
                                </div>
                            </div>
                            {isFanfiction && (
                                <div className="mt-4 pt-4 border-t border-gray-800 animate-fadeIn space-y-4" onClick={(e) => e.stopPropagation()}>
                                    <div>
                                        <label className="block text-[10px] font-black text-primary-400 uppercase mb-2 ml-1">Tên Fandom / Vũ Trụ Gốc</label>
                                        <input 
                                            type="text" 
                                            value={fandomName} 
                                            onChange={(e) => setFandomName(e.target.value)} 
                                            className="w-full bg-gray-950 border border-primary-500/30 rounded-xl px-4 py-3 text-white focus:border-primary-500 outline-none text-sm placeholder:text-gray-700" 
                                            placeholder="Vd: Harry Potter, Marvel, One Piece..." 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-primary-400 uppercase mb-2 ml-1">Tải lên file TXT / EPUB truyện gốc / Tài liệu bối cảnh (không bắt buộc)</label>
                                        <div className="flex items-center gap-3">
                                            <label className="bg-gray-850 hover:bg-gray-800 border border-gray-700 text-white font-bold py-2 px-4 rounded-xl cursor-pointer text-xs transition-colors flex items-center gap-2">
                                                <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                                Chọn File TXT / EPUB
                                                <input 
                                                    type="file" 
                                                    accept=".txt,.epub,application/epub+zip" 
                                                    onChange={handleFandomScriptUpload} 
                                                    className="hidden" 
                                                />
                                            </label>
                                            {fanfictionFile ? (
                                                <div className="text-xs text-gray-300 flex items-center gap-2 bg-primary-950/40 border border-primary-900 px-3 py-1.5 rounded-lg">
                                                    <span className="font-mono text-primary-400 truncate max-w-[200px]">{fanfictionFile.name}</span>
                                                    <span className="text-gray-500">({(fanfictionFile.content.length / 1024).toFixed(1)} KB)</span>
                                                    <button 
                                                        onClick={() => setFanfictionFile(null)}
                                                        className="text-red-400 hover:text-red-300 font-bold ml-1 text-sm bg-black/30 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                                                        title="Xóa tệp"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-500">Chưa chọn tệp</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-orange-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Timeline / Niên đại
                                </label>
                                <input 
                                    type="text" 
                                    value={currentTimeline} 
                                    onChange={(e) => setCurrentTimeline(e.target.value)} 
                                    className="w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-orange-200 focus:border-orange-500 outline-none font-mono text-sm transition-all" 
                                    placeholder="Vd: Năm 2024, Thời Chiến Quốc..." 
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Góc nhìn (POV)</label>
                                <div className="relative">
                                    <select value={pov} onChange={(e) => setPov(e.target.value)} className="w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none appearance-none focus:border-primary-500 transition-all text-sm cursor-pointer">
                                        <option value="Ngôi thứ 3 (Toàn tri)">Ngôi thứ 3 (Toàn tri)</option>
                                        <option value="Ngôi thứ 3 (Giới hạn)">Ngôi thứ 3 (Giới hạn)</option>
                                        <option value="Ngôi thứ 1 (Tôi/Ta)">Ngôi thứ 1 (Tôi/Ta)</option>
                                        <option value="Ngôi thứ 2 (Bạn)">Ngôi thứ 2 (Bạn)</option>
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Hệ thống Xưng hô</label>
                                <div className="relative">
                                    <select value={pronounStyleId} onChange={(e) => setPronounStyleId(e.target.value)} className="w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none appearance-none focus:border-primary-500 transition-all text-sm cursor-pointer">
                                        {PRONOUN_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Thể Loại (Chọn nhiều)</label>
                            <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white focus:border-primary-500 outline-none text-sm transition-all mb-3" placeholder="Nhập hoặc chọn bên dưới..." />
                            <div className="flex flex-wrap gap-2">
                                {SUGGESTED_GENRES.map(g => {
                                    const isSelected = genre.split(',').map(s => s.trim()).includes(g);
                                    return (
                                        <button 
                                            key={g} 
                                            onClick={() => toggleGenre(g)} 
                                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all hover:-translate-y-0.5 ${isSelected ? 'bg-gradient-to-r from-primary-600 to-purple-600 text-white border-primary-500 shadow-lg shadow-primary-900/20' : 'bg-gray-900 text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-300'}`}
                                        >
                                            {g}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Tóm tắt (Synopsis)</label>
                            <textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} className="w-full h-24 bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none resize-none text-sm focus:border-primary-500 transition-all" placeholder="Mô tả sơ lược về câu chuyện..." />
                        </div>

                        <button onClick={() => setStep(2)} disabled={!title || !genre || (isFanfiction && !fandomName && !fanfictionFile)} className="w-full bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary-900/30 transition-all transform active:scale-95 uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                            Tiếp theo <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="bg-purple-900/10 border border-purple-500/20 p-5 rounded-2xl mb-4 flex items-start gap-4 relative">
                            <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center border border-purple-500/30 shrink-0">
                                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="text-lg font-bold text-white mb-1">Nhân Vật Chính (Protagonist)</h3>
                                        <p className="text-xs text-purple-200/60 leading-relaxed">Thiết lập tâm điểm của câu chuyện. AI sẽ ưu tiên góc nhìn và cảm xúc của nhân vật này.</p>
                                    </div>
                                    <button 
                                        onClick={handleSuggestMC} 
                                        disabled={isSuggestingMC}
                                        className="text-[10px] text-purple-400 hover:text-white bg-purple-500/10 hover:bg-purple-500 font-bold px-3 py-1.5 rounded-full border border-purple-500/30 transition-all inline-flex items-center gap-1.5 active:scale-95 whitespace-nowrap"
                                        title="AI sẽ gợi ý nhân vật dựa trên Tiêu đề và Thể loại"
                                    >
                                        {isSuggestingMC ? <span className="w-2.5 h-2.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin"></span> : "✨ AI Tạo NV"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Họ và Tên</label>
                                <input type="text" value={mcName} onChange={(e) => setMcName(e.target.value)} className="w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none transition-all placeholder:text-gray-700" placeholder="Vd: Tiêu Viêm..." />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Chủng tộc</label>
                                <input type="text" value={mcSpecies} onChange={(e) => setMcSpecies(e.target.value)} className="w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none transition-all placeholder:text-gray-700" placeholder="Vd: Người, Elf, Rồng..." />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Giới tính</label>
                                <div className="relative">
                                    <select value={mcGender} onChange={(e) => setMcGender(e.target.value)} className="w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none appearance-none focus:border-purple-500 transition-all cursor-pointer">
                                        <option value="Nam">Nam</option>
                                        <option value="Nữ">Nữ</option>
                                        <option value="Khác">Khác / Phi giới tính</option>
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Kiểu mẫu (Chọn nhiều hoặc Nhập tay)</label>
                                <input type="text" value={mcArchetype} onChange={(e) => setMcArchetype(e.target.value)} className="w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white focus:border-purple-500 outline-none transition-all placeholder:text-gray-700 mb-3" placeholder="Vd: Thiên tài sa ngã, Trọng sinh..." />
                                <div className="flex flex-wrap gap-2">
                                    {SUGGESTED_ARCHETYPES.map(tag => {
                                        const isSelected = mcArchetype.split(',').map(s => s.trim()).includes(tag);
                                        return (
                                            <button 
                                                key={tag} 
                                                onClick={() => toggleArchetype(tag)} 
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all hover:-translate-y-0.5 ${isSelected ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-900/20' : 'bg-gray-900 text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-300'}`}
                                            >
                                                {tag}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Xuất thân & Động cơ</label>
                            <textarea value={mcBackground} onChange={(e) => setMcBackground(e.target.value)} className="w-full h-32 bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none resize-none text-sm focus:border-purple-500 transition-all placeholder:text-gray-700" placeholder="Mô tả quá khứ và mục tiêu lớn nhất..." />
                        </div>

                        <div className="flex gap-4 pt-2">
                            <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl border border-gray-700 text-gray-400 font-bold hover:text-white hover:border-gray-500 transition-all text-xs uppercase tracking-wider">Quay lại</button>
                            <button onClick={() => setStep(3)} disabled={!mcName} className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-purple-900/30 transition-all transform active:scale-95 uppercase tracking-widest text-xs">Tiếp theo</button>
                        </div>
                    </div>
                )}

                {/* STEPS 3-9: Using a generic wrapper for consistency */}
                {step >= 3 && step <= 9 && (
                    <div className="space-y-6 animate-fadeIn">
                        {step === 3 && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-primary-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                    <span>Quy tắc Xưng hô cụ thể</span>
                                    <SuggestButton />
                                </label>
                                <textarea value={interactionRules} onChange={(e) => setInteractionRules(e.target.value)} className="w-full h-60 bg-gray-950/50 border border-gray-700/50 rounded-xl px-5 py-4 text-white outline-none resize-none text-sm leading-relaxed focus:border-primary-500 transition-all custom-scrollbar" placeholder="Ví dụ: Lâm Phong gọi Vân Nhi là muội muội. Hoàng thượng xưng Trẫm..." />
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                        World Bible (Thiết lập chung) <SuggestButton />
                                    </label>
                                    <button onClick={handleExpandSetting} disabled={isExpanding || !setting} className="text-[10px] text-emerald-500 hover:text-emerald-300 font-bold flex items-center gap-1 transition-all disabled:opacity-50">
                                        {isExpanding ? <span className="w-2.5 h-2.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></span> : "✨ Mở rộng ý tưởng"}
                                    </button>
                                </div>
                                <textarea value={setting} onChange={(e) => setSetting(e.target.value)} className="w-full h-60 bg-gray-950/50 border border-gray-700/50 rounded-xl px-5 py-4 text-white outline-none resize-none text-sm leading-relaxed focus:border-emerald-500 transition-all custom-scrollbar" placeholder="Lịch sử, thần thoại, các phe phái... (Bấm 'AI Gợi ý' để tự động điền)" />
                            </div>
                        )}

                        {step === 5 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-blue-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                        <span>Hệ thống & Công thức (Mechanics)</span> <SuggestButton />
                                    </label>
                                    <textarea value={mechanics} onChange={(e) => setMechanics(e.target.value)} className="w-full h-60 bg-gray-950/50 border border-gray-700/50 rounded-xl px-5 py-4 text-white outline-none resize-none font-mono text-xs leading-relaxed focus:border-blue-500 transition-all custom-scrollbar" placeholder="Quy tắc logic, cấp độ tu luyện, công thức..." />
                                </div>
                                <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl flex items-center justify-between cursor-pointer" onClick={() => setHasSystem(!hasSystem)}>
                                    <div>
                                        <span className="text-sm font-bold text-white block">Kích hoạt Hệ thống (System/LitRPG)</span>
                                        <span className="text-[10px] text-gray-400">Hiển thị Bảng trạng thái, Nhiệm vụ kiểu Game.</span>
                                    </div>
                                    <div className={`w-11 h-6 rounded-full relative transition-colors ${hasSystem ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${hasSystem ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 6 && (
                            <div className="space-y-4">
                                <div className="p-4 bg-red-900/10 border border-red-500/20 rounded-xl">
                                    <h4 className="text-xs font-bold text-red-400 mb-1 uppercase flex items-center gap-2">
                                        🛑 Những điều Tuyệt đối Cấm <SuggestButton />
                                    </h4>
                                    <p className="text-[10px] text-gray-400 italic">Đây là những hạn chế thép mà AI không bao giờ được vi phạm.</p>
                                </div>
                                <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} className="w-full h-60 bg-gray-950/50 border border-red-900/30 rounded-xl px-5 py-4 text-white outline-none resize-none text-sm leading-relaxed focus:border-red-500 transition-all custom-scrollbar" placeholder="Ví dụ: Không được dùng từ 'bỗng nhiên', nhân vật chính không được chết..." />
                            </div>
                        )}

                        {step === 7 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-80">
                                <div className="space-y-2 h-full flex flex-col">
                                    <label className="text-xs font-bold text-cyan-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                        <span>Bản đồ & Địa lý</span> <SuggestButton />
                                    </label>
                                    <textarea value={maps} onChange={(e) => setMaps(e.target.value)} className="flex-1 w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none resize-none text-sm focus:border-cyan-500 transition-all custom-scrollbar" placeholder="Mô tả địa hình..." />
                                </div>
                                <div className="space-y-2 h-full flex flex-col">
                                    <label className="text-xs font-bold text-purple-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                        <span>Các Thế Lực & Tổ Chức (Factions)</span> <SuggestButton />
                                    </label>
                                    <textarea value={officials} onChange={(e) => setOfficials(e.target.value)} className="flex-1 w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none resize-none text-sm focus:border-purple-500 transition-all custom-scrollbar" placeholder="Mô tả các tông môn, triều đình, gia tộc lớn, hiệp hội..." />
                                </div>
                            </div>
                        )}

                        {step === 8 && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-60">
                                    <div className="space-y-2 h-full flex flex-col">
                                        <label className="text-xs font-bold text-orange-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                            <span>Văn Hóa & Xã Hội (Culture)</span> <SuggestButton />
                                        </label>
                                        <textarea value={logistics} onChange={(e) => setLogistics(e.target.value)} className="flex-1 w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none resize-none text-sm focus:border-orange-500 transition-all custom-scrollbar" placeholder="Tôn giáo, lễ hội, phong tục, cấu trúc xã hội..." />
                                    </div>
                                    <div className="space-y-2 h-full flex flex-col">
                                        <label className="text-xs font-bold text-yellow-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                            <span>Kinh tế & Tiền tệ</span> <SuggestButton />
                                        </label>
                                        <textarea value={economy} onChange={(e) => setEconomy(e.target.value)} className="flex-1 w-full bg-gray-950/50 border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none resize-none text-sm focus:border-yellow-500 transition-all custom-scrollbar" placeholder="Loại tiền, giá cả, vật phẩm quý..." />
                                    </div>
                                </div>
                                <div className="bg-red-900/10 border border-red-500/20 p-4 rounded-xl flex items-center justify-between cursor-pointer" onClick={() => setNsfw(!nsfw)}>
                                    <div>
                                        <span className="text-sm font-bold text-red-400 block">Chế độ NSFW (R-18+)</span>
                                        <span className="text-[10px] text-gray-400">Cho phép nội dung người lớn và bạo lực.</span>
                                    </div>
                                    <div className={`w-11 h-6 rounded-full relative transition-colors ${nsfw ? 'bg-red-600' : 'bg-gray-700'}`}>
                                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${nsfw ? 'translate-x-5' : ''}`}></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 9 && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                                    <span>Bản kế hoạch chính (Blueprint)</span> <SuggestButton />
                                </label>
                                <textarea value={planning} onChange={(e) => setPlanning(e.target.value)} className="w-full h-80 bg-gray-950/50 border border-gray-700/50 rounded-xl px-5 py-4 text-white outline-none resize-none custom-scrollbar text-sm leading-relaxed focus:border-emerald-500 transition-all" placeholder="Lập dàn ý các sự kiện chính..." />
                            </div>
                        )}

                        {/* Navigation Buttons for Steps 3-9 */}
                        <div className="flex gap-4 pt-4 border-t border-white/5">
                            <button onClick={() => setStep(step - 1)} className="px-6 py-3 rounded-xl border border-gray-700 text-gray-400 font-bold hover:text-white hover:border-gray-500 transition-all text-xs uppercase tracking-wider">Quay lại</button>
                            {step < 9 ? (
                                <button onClick={() => setStep(step + 1)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition-all uppercase tracking-widest text-xs border border-gray-600">Tiếp theo</button>
                            ) : (
                                <button onClick={handleCreate} disabled={isGenerating} className="flex-1 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-900/30 transition-all transform active:scale-95 uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                                    Khởi tạo Vũ Trụ <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}
