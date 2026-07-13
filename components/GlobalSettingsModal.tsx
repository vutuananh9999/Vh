import React, { useState, useEffect } from "react";
import { geminiService } from "../services/geminiService.ts";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const GlobalSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const [apiKeys, setApiKeys] = useState<string[]>([""]);
    const [showKeyIndex, setShowKeyIndex] = useState<number | null>(null);
    const [bulkText, setBulkText] = useState("");
    const [showBulkInput, setShowBulkInput] = useState(false);
    const [modelPro, setModelPro] = useState("gemini-3.1-pro-preview");
    const [modelFlash, setModelFlash] = useState("gemini-3.5-flash");
    const [testingIndex, setTestingIndex] = useState<number | null>(null);
    const [testResults, setTestResults] = useState<{ [key: number]: { success: boolean; message: string } }>({});

    useEffect(() => {
        if (isOpen) {
            const stored = localStorage.getItem('aetheria_api_key') || "";
            if (!stored) {
                setApiKeys([""]);
            } else {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        setApiKeys(parsed.length > 0 ? parsed : [""]);
                    } else {
                        setApiKeys([stored]);
                    }
                } catch (e) {
                    if (stored.includes(',') || stored.includes('\n')) {
                        setApiKeys(stored.split(/[,\n]+/).map(k => k.trim()).filter(Boolean));
                    } else {
                        setApiKeys([stored]);
                    }
                }
            }
            setModelPro(localStorage.getItem('aetheria_model_pro') || "gemini-3.1-pro-preview");
            setModelFlash(localStorage.getItem('aetheria_model_flash') || "gemini-3.5-flash");
            setShowBulkInput(false);
            setBulkText("");
            setTestResults({});
            setTestingIndex(null);
        }
    }, [isOpen]);

    const handleTestKey = async (index: number) => {
        const key = apiKeys[index]?.trim();
        let keyToTest = key;
        
        // If it's the first key and empty, we fall back to testing system key
        if (!keyToTest && index === 0) {
            keyToTest = (process.env as any).GEMINI_API_KEY || "";
        }
        
        if (!keyToTest) {
            alert("Vui lòng nhập API Key để kiểm tra.");
            return;
        }

        setTestingIndex(index);
        setTestResults(prev => {
            const copy = { ...prev };
            delete copy[index];
            return copy;
        });

        try {
            const res = await geminiService.testApiKey(keyToTest);
            setTestResults(prev => ({
                ...prev,
                [index]: { success: res.success, message: res.message }
            }));
            if (res.success) {
                alert("Kết nối thành công! API Key của bạn hoạt động bình thường.");
            } else {
                alert(res.message);
            }
        } catch (err: any) {
            setTestResults(prev => ({
                ...prev,
                [index]: { success: false, message: err?.message || String(err) }
            }));
            alert(`Lỗi kiểm tra kết nối: ${err?.message || String(err)}`);
        } finally {
            setTestingIndex(null);
        }
    };

    const handleAddKey = () => {
        setApiKeys([...apiKeys, ""]);
    };

    const handleRemoveKey = (index: number) => {
        const newKeys = apiKeys.filter((_, i) => i !== index);
        setApiKeys(newKeys.length > 0 ? newKeys : [""]);
    };

    const handleKeyChange = (index: number, val: string) => {
        const newKeys = [...apiKeys];
        newKeys[index] = val;
        setApiKeys(newKeys);
    };

    const handleBulkImport = () => {
        if (!bulkText.trim()) return;
        const parsedKeys = bulkText
            .split(/[,\n\s]+/)
            .map(k => k.trim())
            .filter(Boolean);
        
        if (parsedKeys.length > 0) {
            const merged = Array.from(new Set([...apiKeys.filter(Boolean), ...parsedKeys]));
            setApiKeys(merged.length > 0 ? merged : [""]);
            setBulkText("");
            setShowBulkInput(false);
        }
    };

    const handleSave = () => {
        const filteredKeys = apiKeys.map(k => k.trim()).filter(Boolean);
        if (filteredKeys.length > 0) {
            localStorage.setItem('aetheria_api_key', JSON.stringify(filteredKeys));
        } else {
            localStorage.removeItem('aetheria_api_key');
        }
        
        localStorage.setItem('aetheria_model_pro', modelPro.trim() || 'gemini-3.1-pro-preview');
        localStorage.setItem('aetheria_model_flash', modelFlash.trim() || 'gemini-3.5-flash');
        
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Cài đặt Hệ thống (Toàn cầu)
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="space-y-6 text-sm">
                    {/* API Keys Pool */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="block text-gray-400 font-bold">Danh sách Gemini API Key ({apiKeys.filter(Boolean).length})</label>
                            <button 
                                onClick={() => setShowBulkInput(!showBulkInput)}
                                className="text-xs text-primary-400 hover:text-primary-300 font-medium underline transition-colors"
                            >
                                {showBulkInput ? "Quay lại danh sách" : "Nhập hàng loạt"}
                            </button>
                        </div>

                        {showBulkInput ? (
                            <div className="space-y-2 p-3 bg-gray-950 border border-gray-800 rounded-xl">
                                <label className="text-xs text-gray-500 font-bold block">Nhập nhiều key, cách nhau bằng dấu phẩy hoặc dòng mới:</label>
                                <textarea
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-white text-xs font-mono outline-none focus:border-primary-500 transition-colors h-24 resize-none"
                                    placeholder="AIzaSy...&#10;AIzaSy..."
                                    value={bulkText}
                                    onChange={(e) => setBulkText(e.target.value)}
                                />
                                <div className="flex justify-end gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => setShowBulkInput(false)}
                                        className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                                    >
                                        Hủy
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={handleBulkImport}
                                        className="bg-primary-600 hover:bg-primary-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors"
                                    >
                                        Nhập & Đồng bộ
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                {apiKeys.map((key, idx) => (
                                    <div key={idx} className="flex gap-2 items-center animate-fadeIn">
                                        <div className="relative flex-1">
                                            <input 
                                                type={showKeyIndex === idx ? "text" : "password"} 
                                                className={`w-full bg-gray-950 border rounded-xl py-2.5 pl-3 pr-10 text-white text-xs font-mono outline-none transition-colors ${
                                                    testResults[idx]?.success === true 
                                                        ? 'border-emerald-500/60 focus:border-emerald-500' 
                                                        : testResults[idx]?.success === false 
                                                            ? 'border-red-500/60 focus:border-red-500' 
                                                            : 'border-gray-700 focus:border-primary-500'
                                                }`}
                                                placeholder={idx === 0 ? "Để trống để dùng key hệ thống..." : `API Key #${idx + 1}`}
                                                value={key}
                                                onChange={(e) => {
                                                    handleKeyChange(idx, e.target.value);
                                                    if (testResults[idx]) {
                                                        setTestResults(prev => {
                                                            const copy = { ...prev };
                                                            delete copy[idx];
                                                            return copy;
                                                        });
                                                    }
                                                }}
                                            />
                                            <button 
                                                type="button"
                                                onClick={() => setShowKeyIndex(showKeyIndex === idx ? null : idx)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                            >
                                                {showKeyIndex === idx ? (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                        
                                        <button 
                                            type="button"
                                            onClick={() => handleTestKey(idx)}
                                            disabled={testingIndex !== null}
                                            className={`p-2.5 rounded-xl border transition-all shrink-0 flex items-center justify-center ${
                                                testingIndex === idx 
                                                    ? 'bg-gray-800/50 border-gray-700 text-purple-400' 
                                                    : testResults[idx]?.success === true
                                                        ? 'bg-emerald-950/20 border-emerald-800/50 text-emerald-400 hover:bg-emerald-900/20'
                                                        : testResults[idx]?.success === false
                                                            ? 'bg-red-950/20 border-red-900/50 text-red-400 hover:bg-red-900/20'
                                                            : 'bg-gray-950 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                                            }`}
                                            title="Kiểm tra kết nối của Key này"
                                        >
                                            {testingIndex === idx ? (
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            ) : testResults[idx]?.success === true ? (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            ) : testResults[idx]?.success === false ? (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                            )}
                                        </button>
                                        
                                        <button 
                                            type="button"
                                            onClick={() => handleRemoveKey(idx)}
                                            disabled={apiKeys.length === 1 && !key}
                                            className="p-2.5 bg-gray-950 hover:bg-red-950/40 border border-gray-700 hover:border-red-900/50 rounded-xl text-gray-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                            title="Xóa key này"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!showBulkInput && (
                            <button 
                                type="button"
                                onClick={handleAddKey}
                                className="w-full py-2 border border-dashed border-gray-700 hover:border-primary-500/50 rounded-xl text-xs text-gray-400 hover:text-primary-400 transition-colors flex items-center justify-center gap-1"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Thêm API Key mới
                            </button>
                        )}
                        <p className="text-[10px] text-gray-500 mt-1 font-sans">Các yêu cầu AI sẽ tự động xoay vòng tuần tự qua danh sách các API Key để tối ưu hạn mức (Rate Limits).</p>
                    </div>

                    {/* Pro Model Selection */}
                    <div>
                        <label className="block text-gray-400 font-bold mb-2">Model Pro (Dành cho việc viết và suy luận phức tạp)</label>
                        <select 
                            className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-white outline-none focus:border-primary-500 transition-colors appearance-none"
                            value={modelPro}
                            onChange={(e) => setModelPro(e.target.value)}
                        >
                            <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
                            <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                            <option value="gemini-2.0-pro-exp-0205">gemini-2.0-pro-exp-0205</option>
                            <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                        </select>
                    </div>

                    {/* Flash Model Selection */}
                    <div>
                        <label className="block text-gray-400 font-bold mb-2">Model Flash (Dành cho tác vụ nhanh, ít token)</label>
                        <select 
                            className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-white outline-none focus:border-primary-500 transition-colors appearance-none"
                            value={modelFlash}
                            onChange={(e) => setModelFlash(e.target.value)}
                        >
                            <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                            <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                        </select>
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-gray-400 hover:text-white font-bold transition-colors">
                        Hủy
                    </button>
                    <button onClick={handleSave} className="bg-primary-600 hover:bg-primary-500 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg transition-colors">
                        Lưu Thay Đổi
                    </button>
                </div>
            </div>
        </div>
    );
};
