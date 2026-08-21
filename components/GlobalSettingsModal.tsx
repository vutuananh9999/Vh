import React, { useState, useEffect } from "react";
import { geminiService } from "../services/geminiService.ts";
import { tokenTracker } from "../services/tokenTracker.ts";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const GlobalSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'settings' | 'dashboard'>('settings');
    const [apiKeys, setApiKeys] = useState<string[]>([""]);
    const [showKeyIndex, setShowKeyIndex] = useState<number | null>(null);
    const [expandedStatsIndex, setExpandedStatsIndex] = useState<number | null>(null);
    const [bulkText, setBulkText] = useState("");
    const [showBulkInput, setShowBulkInput] = useState(false);
    const [modelPro, setModelPro] = useState("gemini-3.1-pro-preview");
    const [modelFlash, setModelFlash] = useState("gemini-3.7-flash");
    const [testingIndex, setTestingIndex] = useState<number | null>(null);
    const [testResults, setTestResults] = useState<{ [key: number]: { success: boolean; message: string } }>({});
    const [isFetchingAllStatuses, setIsFetchingAllStatuses] = useState(false);
    const [nowTime, setNowTime] = useState(Date.now());
    const [dashboardFilter, setDashboardFilter] = useState<'all' | 'active' | 'limited'>('all');

    // Timer for live countdown of rate-limit cooldowns
    useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => {
            setNowTime(Date.now());
        }, 1000);
        return () => clearInterval(interval);
    }, [isOpen]);

    useEffect(() => {
        const unsubscribe = tokenTracker.subscribe(() => {
            // Trigger state refresh for stats
            setApiKeys(prev => [...prev]);
        });
        return unsubscribe;
    }, []);

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
            setModelFlash(localStorage.getItem('aetheria_model_flash') || "gemini-3.7-flash");
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
                // Clear any cooldown if it succeeded
                geminiService.clearKeyCooldown(keyToTest);
            } else if (res.message?.includes('429') || res.message?.toLowerCase().includes('resource_exhausted')) {
                geminiService.markKeyRateLimited(keyToTest);
            }
        } catch (err: any) {
            const errMsg = err?.message || String(err);
            setTestResults(prev => ({
                ...prev,
                [index]: { success: false, message: errMsg }
            }));
            if (errMsg.includes('429') || errMsg.toLowerCase().includes('resource_exhausted')) {
                geminiService.markKeyRateLimited(keyToTest);
            }
        } finally {
            setTestingIndex(null);
        }
    };

    const handleFetchAllStatuses = async () => {
        setIsFetchingAllStatuses(true);
        const keysToFetch = apiKeys.map((k, i) => {
            const trimmed = k?.trim();
            if (!trimmed && i === 0) {
                return { index: i, key: (process.env as any).GEMINI_API_KEY || "" };
            }
            return { index: i, key: trimmed };
        }).filter(item => Boolean(item.key));

        if (keysToFetch.length === 0) {
            setIsFetchingAllStatuses(false);
            return;
        }

        const newResults = { ...testResults };
        await Promise.all(
            keysToFetch.map(async ({ index, key }) => {
                try {
                    const res = await geminiService.testApiKey(key);
                    newResults[index] = { success: res.success, message: res.message };
                    if (res.success) {
                        geminiService.clearKeyCooldown(key);
                    } else if (res.message?.includes('429') || res.message?.toLowerCase().includes('quota') || res.message?.toLowerCase().includes('resource_exhausted')) {
                        geminiService.markKeyRateLimited(key);
                    }
                } catch (err: any) {
                    const msg = err?.message || String(err);
                    newResults[index] = { success: false, message: msg };
                    if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource_exhausted')) {
                        geminiService.markKeyRateLimited(key);
                    }
                }
            })
        );

        setTestResults(newResults);
        setIsFetchingAllStatuses(false);
    };

    const handleClearAllCooldowns = () => {
        geminiService.clearAllCooldowns();
        setNowTime(Date.now());
    };

    const handleAddKey = () => {
        const newKeys = [...apiKeys, ""];
        setApiKeys(newKeys);
    };

    const handleRemoveKey = (index: number) => {
        const newKeys = apiKeys.filter((_, i) => i !== index);
        const resultKeys = newKeys.length > 0 ? newKeys : [""];
        setApiKeys(resultKeys);
        const filteredKeys = resultKeys.map(k => k.trim()).filter(Boolean);
        if (filteredKeys.length > 0) {
            localStorage.setItem('aetheria_api_key', JSON.stringify(filteredKeys));
        } else {
            localStorage.removeItem('aetheria_api_key');
        }
    };

    const handleKeyChange = (index: number, val: string) => {
        const newKeys = [...apiKeys];
        newKeys[index] = val;
        setApiKeys(newKeys);
        const filteredKeys = newKeys.map(k => k.trim()).filter(Boolean);
        if (filteredKeys.length > 0) {
            localStorage.setItem('aetheria_api_key', JSON.stringify(filteredKeys));
        } else {
            localStorage.removeItem('aetheria_api_key');
        }
    };

    const handleBulkImport = () => {
        if (!bulkText.trim()) return;
        const parsedKeys = bulkText
            .split(/[,\n\s]+/)
            .map(k => k.trim())
            .filter(Boolean);
        
        if (parsedKeys.length > 0) {
            const merged = Array.from(new Set([...apiKeys.filter(Boolean), ...parsedKeys]));
            const resultKeys = merged.length > 0 ? merged : [""];
            setApiKeys(resultKeys);
            setBulkText("");
            setShowBulkInput(false);
            const filteredKeys = resultKeys.map(k => k.trim()).filter(Boolean);
            if (filteredKeys.length > 0) {
                localStorage.setItem('aetheria_api_key', JSON.stringify(filteredKeys));
            }
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
        localStorage.setItem('aetheria_model_flash', modelFlash.trim() || 'gemini-3.7-flash');
        
        // Reset flags for models
        geminiService.resetProModelFailed();
        geminiService.clearAllCooldowns();
        
        onClose();
    };

    if (!isOpen) return null;

    // Derived pool statistics for Dashboard
    const keyList = apiKeys.map((k, i) => {
        const activeKey = k?.trim() || (i === 0 ? ((process.env as any).GEMINI_API_KEY || "") : "");
        const cooldown = geminiService.getKeyCooldownStatus(activeKey);
        const stats = tokenTracker.getKeyStats(activeKey);
        const testRes = testResults[i];
        return {
            index: i,
            rawKey: k,
            activeKey,
            cooldown,
            stats,
            testRes,
            isSystemKey: !k?.trim() && i === 0 && Boolean((process.env as any).GEMINI_API_KEY)
        };
    }).filter(item => Boolean(item.activeKey));

    const totalKeyCount = keyList.length;
    const rateLimitedCount = keyList.filter(k => k.cooldown.isCoolingDown).length;
    const activeHealthyCount = totalKeyCount - rateLimitedCount;

    // Total estimated remaining tokens in 1-min window across all active keys
    const totalEstRemainingFlashTokens = keyList.reduce((sum, k) => {
        if (k.cooldown.isCoolingDown) return sum;
        return sum + Math.max(0, 1000000 - k.stats.tpmUsed);
    }, 0);

    const totalEstRemainingProTokens = keyList.reduce((sum, k) => {
        if (k.cooldown.isCoolingDown) return sum;
        return sum + Math.max(0, 32000 - k.stats.tpmUsed);
    }, 0);

    const total24hTokensUsed = keyList.reduce((sum, k) => sum + k.stats.totalTokensUsed, 0);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-4 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <svg className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Cài đặt & Quản lý API Gemini
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">Cấu hình danh sách API Key và Bảng điều khiển Giới hạn Tần suất (429 Rate Limits)</p>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-gray-800 mb-5 shrink-0 gap-2">
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
                            activeTab === 'settings'
                                ? 'border-primary-500 text-primary-400 bg-primary-500/10 rounded-t-xl'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        Danh Sách Key & Models
                    </button>

                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 relative ${
                            activeTab === 'dashboard'
                                ? 'border-primary-500 text-primary-400 bg-primary-500/10 rounded-t-xl'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        API Usage Dashboard
                        {rateLimitedCount > 0 ? (
                            <span className="bg-red-500 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full animate-pulse">
                                {rateLimitedCount} 429
                            </span>
                        ) : (
                            <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono px-1.5 py-0.2 rounded-full">
                                {activeHealthyCount} OK
                            </span>
                        )}
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar text-sm space-y-6">
                    {activeTab === 'dashboard' ? (
                        /* API USAGE DASHBOARD VIEW */
                        <div className="space-y-6 animate-fadeIn">
                            {/* Summary Metrics Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl space-y-1">
                                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Tổng API Keys</div>
                                    <div className="text-xl font-bold text-white font-mono flex items-center justify-between">
                                        {totalKeyCount}
                                        <span className="text-xs font-normal text-gray-500">Keys</span>
                                    </div>
                                    <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                                        {activeHealthyCount} Sẵn sàng
                                    </div>
                                </div>

                                <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl space-y-1">
                                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Đang Hồi Chiêu (429)</div>
                                    <div className={`text-xl font-bold font-mono flex items-center justify-between ${rateLimitedCount > 0 ? 'text-red-400' : 'text-gray-300'}`}>
                                        {rateLimitedCount}
                                        <span className="text-xs font-normal text-gray-500">Keys</span>
                                    </div>
                                    <div className={`text-[10px] font-medium ${rateLimitedCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                        {rateLimitedCount > 0 ? 'Tự động xoay sang key khác' : 'Không có key bị nghẽn'}
                                    </div>
                                </div>

                                <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl space-y-1">
                                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Ước Tính Token Flash Còn Lại</div>
                                    <div className="text-lg font-bold text-emerald-400 font-mono">
                                        {totalEstRemainingFlashTokens.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-gray-500">
                                        Khung 1 Phút (Flash Tier)
                                    </div>
                                </div>

                                <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl space-y-1">
                                    <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Tổng Token Tiêu Thụ (24h)</div>
                                    <div className="text-lg font-bold text-primary-400 font-mono">
                                        {total24hTokensUsed.toLocaleString()}
                                    </div>
                                    <div className="text-[10px] text-gray-500">
                                        Tất cả các lượt gọi
                                    </div>
                                </div>
                            </div>

                            {/* Controls and Actions Header */}
                            <div className="p-3 bg-gray-950/80 border border-gray-800 rounded-xl flex flex-wrap gap-2 justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleFetchAllStatuses}
                                        disabled={isFetchingAllStatuses}
                                        className="bg-primary-600 hover:bg-primary-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {isFetchingAllStatuses ? (
                                            <>
                                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Đang Kiểm Tra Trực Tiếp Tất Cả...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                Kiểm Tra & Cập Nhật Tất Cả Status
                                            </>
                                        )}
                                    </button>

                                    {rateLimitedCount > 0 && (
                                        <button
                                            onClick={handleClearAllCooldowns}
                                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium px-3 py-1.5 rounded-lg text-xs border border-gray-700 transition-colors flex items-center gap-1"
                                            title="Xóa cờ tạm ngưng 429 nếu bạn muốn thử lại ngay"
                                        >
                                            ⚡ Xóa Cooldown 429
                                        </button>
                                    )}
                                </div>

                                {/* Filter Tabs */}
                                <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800 text-[11px]">
                                    <button
                                        onClick={() => setDashboardFilter('all')}
                                        className={`px-2.5 py-1 rounded-md transition-all font-medium ${dashboardFilter === 'all' ? 'bg-primary-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'}`}
                                    >
                                        Tất cả ({keyList.length})
                                    </button>
                                    <button
                                        onClick={() => setDashboardFilter('active')}
                                        className={`px-2.5 py-1 rounded-md transition-all font-medium ${dashboardFilter === 'active' ? 'bg-emerald-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'}`}
                                    >
                                        Sẵn sàng ({activeHealthyCount})
                                    </button>
                                    <button
                                        onClick={() => setDashboardFilter('limited')}
                                        className={`px-2.5 py-1 rounded-md transition-all font-medium ${dashboardFilter === 'limited' ? 'bg-red-600 text-white font-bold' : 'text-gray-400 hover:text-gray-200'}`}
                                    >
                                        Chạm 429 ({rateLimitedCount})
                                    </button>
                                </div>
                            </div>

                            {/* Detailed Keys List */}
                            <div className="space-y-3">
                                {keyList
                                    .filter(item => {
                                        if (dashboardFilter === 'active') return !item.cooldown.isCoolingDown;
                                        if (dashboardFilter === 'limited') return item.cooldown.isCoolingDown;
                                        return true;
                                    })
                                    .map((item) => {
                                        const { index, activeKey, cooldown, stats, testRes, isSystemKey } = item;
                                        const masked = activeKey ? `${activeKey.slice(0, 6)}...${activeKey.slice(-4)}` : "Chưa nhập";
                                        
                                        // Estimated Token calculations
                                        const flashTpmLimit = 1000000;
                                        const flashTpmRemaining = Math.max(0, flashTpmLimit - stats.tpmUsed);
                                        const flashTpmPercent = Math.min(100, Math.max(0, (flashTpmRemaining / flashTpmLimit) * 100));

                                        const proTpmLimit = 32000;
                                        const proTpmRemaining = Math.max(0, proTpmLimit - stats.tpmUsed);
                                        const proTpmPercent = Math.min(100, Math.max(0, (proTpmRemaining / proTpmLimit) * 100));

                                        const remainingCooldownSec = Math.ceil(cooldown.remainingMs / 1000);

                                        return (
                                            <div key={index} className={`p-4 bg-gray-950 border rounded-2xl space-y-3 transition-all ${
                                                cooldown.isCoolingDown 
                                                    ? 'border-red-500/50 bg-red-950/10' 
                                                    : testRes?.success === true 
                                                        ? 'border-emerald-500/40' 
                                                        : testRes?.success === false 
                                                            ? 'border-amber-500/40' 
                                                            : 'border-gray-800'
                                            }`}>
                                                {/* Header Row */}
                                                <div className="flex justify-between items-start gap-2">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs font-bold text-white bg-gray-900 px-2 py-1 rounded-md border border-gray-800">
                                                                {masked}
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-gray-400 bg-gray-900 border border-gray-800 px-2 py-0.5 rounded-md">
                                                                {isSystemKey ? 'Key Hệ Thống Fallback' : `API Key #${index + 1}`}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Status Badge */}
                                                    <div>
                                                        {cooldown.isCoolingDown ? (
                                                            <div className="px-2.5 py-1 bg-red-500/20 border border-red-500/40 text-red-400 rounded-lg text-xs font-bold flex items-center gap-1.5 animate-pulse">
                                                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                                                                Chạm 429 Quota Exceeded (Hồi chiêu {remainingCooldownSec}s)
                                                            </div>
                                                        ) : testRes?.success === true ? (
                                                            <div className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                                                                Hoạt Động Tốt (Ready)
                                                            </div>
                                                        ) : testRes?.success === false ? (
                                                            <div className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                                                                Lỗi Kết Nối / Key Không Hợp Lệ
                                                            </div>
                                                        ) : (
                                                            <div className="px-2.5 py-1 bg-gray-800 border border-gray-700 text-gray-400 rounded-lg text-xs font-medium flex items-center gap-1.5">
                                                                <span className="w-2 h-2 rounded-full bg-gray-500 inline-block"></span>
                                                                Sẵn Sàng Sử Dụng
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Error Message notice if any */}
                                                {testRes?.success === false && (
                                                    <div className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 font-mono">
                                                        ⚠️ {testRes.message}
                                                    </div>
                                                )}

                                                {/* Estimated Token Capacity Bars */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-900">
                                                    {/* Flash Tier Capacity */}
                                                    <div className="space-y-1.5 bg-gray-900/60 p-2.5 rounded-xl border border-gray-800">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-gray-300 font-bold text-[11px] flex items-center gap-1">
                                                                ⚡ Flash Token Khả Dụng (Phút)
                                                            </span>
                                                            <span className="font-mono text-[10px] text-emerald-400 font-bold">
                                                                {flashTpmRemaining.toLocaleString()} / 1M TPM
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-gray-950 rounded-full h-1.5 overflow-hidden border border-gray-800">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    cooldown.isCoolingDown ? 'bg-red-500' : flashTpmPercent < 20 ? 'bg-amber-500' : 'bg-emerald-500'
                                                                }`}
                                                                style={{ width: `${cooldown.isCoolingDown ? 0 : flashTpmPercent}%` }}
                                                            />
                                                        </div>
                                                        <div className="flex justify-between text-[10px] text-gray-500">
                                                            <span>Đã dùng trong phút: {stats.tpmUsed.toLocaleString()} tokens</span>
                                                            <span>{flashTpmPercent.toFixed(1)}% Còn lại</span>
                                                        </div>
                                                    </div>

                                                    {/* Pro Tier Capacity */}
                                                    <div className="space-y-1.5 bg-gray-900/60 p-2.5 rounded-xl border border-gray-800">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-gray-300 font-bold text-[11px] flex items-center gap-1">
                                                                💎 Pro Token Khả Dụng (Phút)
                                                            </span>
                                                            <span className="font-mono text-[10px] text-purple-400 font-bold">
                                                                {proTpmRemaining.toLocaleString()} / 32k TPM
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-gray-950 rounded-full h-1.5 overflow-hidden border border-gray-800">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    cooldown.isCoolingDown ? 'bg-red-500' : proTpmPercent < 20 ? 'bg-amber-500' : 'bg-purple-500'
                                                                }`}
                                                                style={{ width: `${cooldown.isCoolingDown ? 0 : proTpmPercent}%` }}
                                                            />
                                                        </div>
                                                        <div className="flex justify-between text-[10px] text-gray-500">
                                                            <span>Đã dùng trong phút: {stats.tpmUsed.toLocaleString()} tokens</span>
                                                            <span>{proTpmPercent.toFixed(1)}% Còn lại</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Usage Metrics Row */}
                                                <div className="flex flex-wrap justify-between items-center text-xs text-gray-400 pt-1">
                                                    <div className="flex gap-4 font-mono text-[11px]">
                                                        <span>Yêu cầu (24h): <b className="text-white">{stats.successCount + stats.failureCount}</b></span>
                                                        <span>Thành công: <b className="text-emerald-400">{stats.successCount}</b></span>
                                                        <span>Thất bại/429: <b className="text-red-400">{stats.failureCount}</b></span>
                                                        <span>Tiêu thụ 24h: <b className="text-primary-400">{stats.totalTokensUsed.toLocaleString()} tkn</b></span>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {cooldown.isCoolingDown && (
                                                            <button
                                                                onClick={() => {
                                                                    geminiService.clearKeyCooldown(activeKey);
                                                                    setNowTime(Date.now());
                                                                }}
                                                                className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium"
                                                            >
                                                                Xóa cooldown
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleTestKey(index)}
                                                            disabled={testingIndex === index}
                                                            className="text-[11px] text-primary-400 hover:text-primary-300 underline font-medium"
                                                        >
                                                            {testingIndex === index ? 'Đang test...' : 'Test Key Này'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                {keyList.length === 0 && (
                                    <div className="p-8 text-center bg-gray-950 border border-gray-800 rounded-2xl text-gray-500 text-xs space-y-2">
                                        <p>Chưa có API Key nào được cấu hình.</p>
                                        <button
                                            onClick={() => setActiveTab('settings')}
                                            className="text-primary-400 font-bold underline"
                                        >
                                            Chuyển sang tab "Danh Sách Key" để thêm API Key mới
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* SETTINGS & KEYS CONFIGURATION VIEW */
                        <div className="space-y-6">
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

                                {/* Note about 429 quota limits */}
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200/90 leading-relaxed space-y-1.5">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-400">
                                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        Cơ chế Xoay Vòng Chống Nghẽn (Rate Limit 429 Auto-Rotation)
                                    </div>
                                    <p>
                                        Mỗi API Key Gemini Free Tier có hạn mức 15 yêu cầu/phút. Khi bấm sinh văn bản, nếu Key đang dùng bị <b>Lỗi 429</b>, ứng dụng sẽ <b>tự động xoay ngay sang Key tiếp theo</b> trong danh sách mà không hủy tác vụ!
                                    </p>
                                    <p>
                                        💡 Thêm từ 2–5 API Key phụ sẽ giúp bạn nhân gấp nhiều lần tốc độ viết truyện và hoàn toàn loại bỏ tình trạng chờ ngắt quãng!
                                    </p>
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
                                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                                        {apiKeys.map((key, idx) => {
                                            const activeKey = key?.trim() || (idx === 0 ? ((process.env as any).GEMINI_API_KEY || "") : "");
                                            const stats = tokenTracker.getKeyStats(activeKey);
                                            
                                            return (
                                                <div key={idx} className="p-2.5 bg-gray-950/20 border border-gray-800/40 rounded-2xl space-y-2 animate-fadeIn">
                                                    <div className="flex gap-2 items-center">
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
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        </div>
                                                        
                                                        <button 
                                                            type="button"
                                                            onClick={() => setExpandedStatsIndex(expandedStatsIndex === idx ? null : idx)}
                                                            className={`p-2.5 rounded-xl border transition-all shrink-0 flex items-center justify-center ${
                                                                expandedStatsIndex === idx 
                                                                    ? 'bg-primary-950/40 border-primary-500/50 text-primary-400' 
                                                                    : 'bg-gray-950 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                                                            }`}
                                                            title="Xem thống kê dung lượng & token"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                            </svg>
                                                        </button>
                                                        
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

                                                    {expandedStatsIndex === idx && (
                                                        <div className="p-3 bg-gray-950/80 border border-gray-800/80 rounded-xl space-y-2.5 animate-slideDown mt-1.5 text-xs text-gray-300">
                                                            <div className="flex justify-between items-center text-xs border-b border-gray-800 pb-1.5">
                                                                <span className="font-bold text-gray-300">Thống kê & Hạn mức Key</span>
                                                                <span className="text-[10px] bg-primary-500/10 text-primary-400 border border-primary-500/20 px-1.5 py-0.5 rounded-md font-mono">
                                                                    {key ? (key.startsWith("AIzaSy") ? "Google AI Studio" : "Custom Key") : "Key hệ thống"}
                                                                </span>
                                                            </div>
                                                            
                                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                                <div>
                                                                    <div className="text-gray-500">Đã tiêu thụ (24h)</div>
                                                                    <div className="font-bold text-white font-mono mt-0.5">{stats.totalTokensUsed.toLocaleString()} tokens</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-gray-500 font-sans">Yêu cầu (Thành công/Lỗi)</div>
                                                                    <div className="font-bold text-white font-mono mt-0.5">
                                                                        <span className="text-emerald-400">{stats.successCount}</span>
                                                                        <span className="text-gray-600"> / </span>
                                                                        <span className="text-red-400">{stats.failureCount}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Pro vs Flash estimated limits */}
                                                            <div className="space-y-2 pt-1.5 border-t border-gray-800">
                                                                <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Hạn mức Free Tier còn lại (Ước tính):</div>
                                                                
                                                                {/* Flash stats */}
                                                                <div className="space-y-1">
                                                                    <div className="flex justify-between text-[10px]">
                                                                        <span className="text-gray-400 font-medium">Model Flash (gemini-3.7-flash)</span>
                                                                        <span className="text-gray-400 font-mono">{(1500 - stats.rpdUsed)} / 1,500 RPD</span>
                                                                    </div>
                                                                    <div className="w-full bg-gray-900 rounded-full h-1 overflow-hidden">
                                                                        <div 
                                                                            className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                                                                            style={{ width: `${Math.min(100, Math.max(0, (1 - stats.rpdUsed / 1500) * 100))}%` }}
                                                                        />
                                                                    </div>
                                                                    <div className="flex justify-between text-[9px] text-gray-500">
                                                                        <span>Token khả dụng phút:</span>
                                                                        <span className="font-mono">{Math.max(0, 1000000 - stats.tpmUsed).toLocaleString()} / 1,000,000 TPM</span>
                                                                    </div>
                                                                </div>

                                                                {/* Pro stats */}
                                                                <div className="space-y-1 pt-1">
                                                                    <div className="flex justify-between text-[10px]">
                                                                        <span className="text-gray-400 font-medium">Model Pro (gemini-3.1-pro-preview)</span>
                                                                        <span className="text-gray-400 font-mono">{(50 - stats.rpdUsed)} / 50 RPD</span>
                                                                    </div>
                                                                    <div className="w-full bg-gray-900 rounded-full h-1 overflow-hidden">
                                                                        <div 
                                                                            className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                                                                            style={{ width: `${Math.min(100, Math.max(0, (1 - stats.rpdUsed / 50) * 100))}%` }}
                                                                        />
                                                                    </div>
                                                                    <div className="flex justify-between text-[9px] text-gray-500">
                                                                        <span>Token khả dụng phút:</span>
                                                                        <span className="font-mono">{Math.max(0, 32000 - stats.tpmUsed).toLocaleString()} / 32,000 TPM</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                            </div>

                            {/* Pro Model Selection */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-gray-400 font-bold">Model Pro (Dành cho việc viết và suy luận phức tạp)</label>
                                    <span className="text-[10px] bg-primary-500/10 text-primary-400 border border-primary-500/20 px-1.5 py-0.5 rounded-md font-medium">Bản thảo & Suy luận</span>
                                </div>
                                <select 
                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-white outline-none focus:border-primary-500 transition-colors appearance-none"
                                    value={modelPro}
                                    onChange={(e) => setModelPro(e.target.value)}
                                >
                                    <optgroup label="Dòng Pro (Suy luận sâu & Cốt truyện phức tạp)">
                                        <option value="gemini-3.6-pro">gemini-3.6-pro (Pro 3.6 - Mới nhất, suy luận sâu & tối ưu cốt truyện)</option>
                                        <option value="gemini-2.5-pro">gemini-2.5-pro (Pro 2.5 - Cốt truyện ổn định)</option>
                                        <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Pro Preview)</option>
                                    </optgroup>
                                    <optgroup label="Dòng Flash (Tốc độ cao & Hạn mức rộng)">
                                        <option value="gemini-3.6-flash">gemini-3.6-flash (Flash 3.6 - Tương thích tất cả Key)</option>
                                        <option value="gemini-2.5-flash">gemini-2.5-flash (Flash 2.5)</option>
                                        <option value="gemini-2.0-flash">gemini-2.0-flash (Flash 2.0)</option>
                                        <option value="gemini-3.7-flash">gemini-3.7-flash (Flash 3.7)</option>
                                    </optgroup>
                                </select>
                            </div>

                            {/* Flash Model Selection */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-gray-400 font-bold">Model Flash (Dành cho tác vụ nhanh, chat & gợi ý)</label>
                                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-md font-medium">Chat & Tinh chỉnh nhanh</span>
                                </div>
                                <select 
                                    className="w-full bg-gray-950 border border-gray-700 rounded-xl p-3 text-white outline-none focus:border-primary-500 transition-colors appearance-none"
                                    value={modelFlash}
                                    onChange={(e) => setModelFlash(e.target.value)}
                                >
                                    <optgroup label="Dòng Flash (Khuyên dùng)">
                                        <option value="gemini-3.6-flash">gemini-3.6-flash (Mặc định Flash 3.6 - Tốc độ cao & Hỗ trợ tất cả Key)</option>
                                        <option value="gemini-2.5-flash">gemini-2.5-flash (Flash 2.5)</option>
                                        <option value="gemini-2.0-flash">gemini-2.0-flash (Flash 2.0)</option>
                                        <option value="gemini-3.7-flash">gemini-3.7-flash (Flash 3.7)</option>
                                    </optgroup>
                                    <optgroup label="Dòng Pro (Nếu muốn Chat bằng model mạnh hơn)">
                                        <option value="gemini-3.6-pro">gemini-3.6-pro (Pro 3.6 - Suy luận chuyên sâu)</option>
                                        <option value="gemini-2.5-pro">gemini-2.5-pro (Pro 2.5)</option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="mt-6 border-t border-gray-800 pt-4 flex justify-between items-center shrink-0">
                    <button
                        onClick={() => setActiveTab(activeTab === 'settings' ? 'dashboard' : 'settings')}
                        className="text-xs text-primary-400 hover:text-primary-300 font-bold underline flex items-center gap-1"
                    >
                        {activeTab === 'settings' ? ' Xem API Usage Dashboard »' : '« Quay lại Cài đặt Key'}
                    </button>

                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2 text-gray-400 hover:text-white font-bold transition-colors text-xs">
                            Hủy
                        </button>
                        <button onClick={handleSave} className="bg-primary-600 hover:bg-primary-500 text-white font-bold py-2 px-6 rounded-xl shadow-lg transition-colors text-xs">
                            Lưu Thay Đổi
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
