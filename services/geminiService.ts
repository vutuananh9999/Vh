
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Character, ChatMessage, Story, Chapter, ExtractionCategory, WebInspiration, WritingDNA } from "../types.ts";
import { promptBuilderService, ORIGINAL_FIDELITY_PROTOCOL, formatSmartChapterContext } from "./promptBuilderService.ts";
import { tokenTracker } from "./tokenTracker.ts";

let lastKeyIndex = 0;
let lastLoggedKey = "";

// Map to track keys that are temporarily rate-limited (cooling down)
const keyCooldowns = new Map<string, number>();

function isKeyCoolingDown(key: string, model?: string): boolean {
  if (!key) return false;
  const cleanK = cleanKey(key);
  const modelKey = model ? `${cleanK}:${model}` : cleanK;
  const expiresAt = keyCooldowns.get(modelKey) || keyCooldowns.get(cleanK);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    keyCooldowns.delete(modelKey);
    keyCooldowns.delete(cleanK);
    return false;
  }
  return true;
}

function getKeyCooldownStatus(key: string): { isCoolingDown: boolean; remainingMs: number } {
  if (!key) return { isCoolingDown: false, remainingMs: 0 };
  const cleanK = cleanKey(key);
  const expiresAt = keyCooldowns.get(cleanK);
  if (!expiresAt) return { isCoolingDown: false, remainingMs: 0 };
  const diff = expiresAt - Date.now();
  if (diff <= 0) {
    keyCooldowns.delete(cleanK);
    return { isCoolingDown: false, remainingMs: 0 };
  }
  return { isCoolingDown: true, remainingMs: diff };
}

function clearKeyCooldown(key: string) {
  if (key) {
    const cleanK = cleanKey(key);
    keyCooldowns.delete(cleanK);
    // Also delete any model-specific keys
    for (const k of Array.from(keyCooldowns.keys())) {
      if (k.startsWith(cleanK)) {
        keyCooldowns.delete(k);
      }
    }
  }
}

function clearAllCooldowns() {
  keyCooldowns.clear();
}

function markKeyRateLimited(key: string, cooldownMs: number = 30000, model?: string) {
  if (!key) return;
  const cleanK = cleanKey(key);
  const isPro = model && (model.includes('pro') || model === getPro());
  if (isPro) {
    keyCooldowns.set(`${cleanK}:${model}`, Date.now() + cooldownMs);
    proModelFailedUntil = Date.now() + 180000; // 3 minutes cooldown for Pro
    console.warn(`[Network Layer API Key Rotation] Pro model (${model}) đã chạm hạn mức. Tạm chuyển hướng toàn bộ sang Flash trong 3 phút.`);
  } else {
    keyCooldowns.set(cleanK, Date.now() + cooldownMs);
  }
  const masked = `${cleanK.slice(0, 6)}...${cleanK.slice(-4)}`;
  console.warn(`[Network Layer API Key Rotation] API Key (${masked}) đã chạm giới hạn 429. Đánh dấu tạm ngưng trong ${cooldownMs / 1000}s và chuyển sang Key khả dụng tiếp theo.`);
}

function cleanKey(val: string): string {
  if (!val) return "";
  let clean = val.trim();
  while ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  clean = clean.replace(/[\[\]\{\}]/g, '').trim();
  return clean;
}

function extractKeys(stored: string): string[] {
  if (!stored || !stored.trim()) return [];
  
  const keys: string[] = [];
  
  // 1. Try to parse as JSON first (since GlobalSettingsModal always saves it as JSON stringify array)
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      parsed.forEach(item => {
        if (item && typeof item === 'string') {
          const clean = cleanKey(item);
          if (clean) keys.push(clean);
        }
      });
    } else if (typeof parsed === 'string') {
      const clean = cleanKey(parsed);
      if (clean) keys.push(clean);
    }
  } catch (e) {
    // Fallback: it's not JSON
  }
  
  // 2. If JSON parsing yielded no keys, try to extract standard Google API Keys starting with AIzaSy
  if (keys.length === 0) {
    const regex = /AIzaSy[A-Za-z0-9_-]+/g;
    const matches = stored.match(regex);
    if (matches && matches.length > 0) {
      return matches.map(cleanKey).filter(Boolean);
    }
  }
  
  // 3. Last fallback: split by comma, semicolon, whitespace, newlines
  if (keys.length === 0) {
    const parts = stored.split(/[\s,;\n\r\t]+/).map(cleanKey).filter(Boolean) as string[];
    keys.push(...parts);
  }
  
  return keys.filter(k => k.length > 5);
}

function getAllKeys(): string[] {
  if (typeof window === 'undefined') {
    const sys = process.env.GEMINI_API_KEY || '';
    return sys ? [sys] : [];
  }
  const stored = localStorage.getItem('aetheria_api_key') || '';
  const userKeys = extractKeys(stored);
  if (userKeys.length > 0) {
    return userKeys;
  }
  const sysKey = process.env.GEMINI_API_KEY || '';
  return sysKey ? [sysKey] : [];
}

function getApiKey(rotate: boolean = false): string {
  const keys = getAllKeys();
  if (keys.length === 0) {
    const sysKey = process.env.GEMINI_API_KEY || '';
    logKeyChange(sysKey, true);
    return sysKey;
  }
  
  if (rotate) {
    lastKeyIndex = (lastKeyIndex + 1) % keys.length;
    console.log(`[Gemini API Debug] Rotate key. Index mới: ${lastKeyIndex}/${keys.length}`);
  }
  
  // Choose key: prefer non-cooling key
  let selectedIndex = lastKeyIndex % keys.length;
  let keyToUse = keys[selectedIndex];

  if (isKeyCoolingDown(keyToUse)) {
    // Try to find first key that is not in cooldown
    for (let i = 0; i < keys.length; i++) {
      const candidateIdx = (lastKeyIndex + i) % keys.length;
      const candidateKey = keys[candidateIdx];
      if (!isKeyCoolingDown(candidateKey)) {
        lastKeyIndex = candidateIdx;
        selectedIndex = candidateIdx;
        keyToUse = candidateKey;
        break;
      }
    }
  }

  const maskedUse = keyToUse ? `${keyToUse.slice(0, 6)}...${keyToUse.slice(-4)}` : "Rỗng";
  console.log(`[Gemini API Debug] Key đang được chọn sử dụng: ${maskedUse} (Index: ${selectedIndex}/${keys.length})`);
  
  logKeyChange(keyToUse, false);
  return keyToUse;
}

function getAvailableKeysCount(): number {
  return getAllKeys().length;
}

function isQuotaError(err: any): boolean {
  if (!err) return false;
  
  // Direct check on common property locations
  if (err.status === 429 || err.code === 429 || err.statusCode === 429) return true;
  if (err.error) {
    if (err.error.status === 429 || err.error.code === 429 || err.error.statusCode === 429) return true;
    if (err.error.status === 'RESOURCE_EXHAUSTED' || (typeof err.error.message === 'string' && err.error.message.toLowerCase().includes('resource_exhausted'))) return true;
  }
  if (err.status === 'RESOURCE_EXHAUSTED') return true;

  let errMsg = "";
  if (err.message) {
    errMsg += " " + err.message;
  }
  
  // Serialize the full error object if possible to inspect nested fields (like err.error.message or err.error.code)
  try {
    errMsg += " " + JSON.stringify(err);
  } catch (e) {
    errMsg += " " + String(err);
  }
  
  errMsg = errMsg.toLowerCase();
  
  const hasQuotaKeyword = 
    errMsg.includes("429") ||
    errMsg.includes("resource_exhausted") ||
    errMsg.includes("quota exceeded") ||
    errMsg.includes("rate limit") ||
    errMsg.includes("limit exceeded") ||
    errMsg.includes("exhausted") ||
    errMsg.includes("too many requests");
    
  return hasQuotaKeyword;
}

function logKeyChange(key: string, isSystem: boolean) {
  if (typeof window !== 'undefined' && key !== lastLoggedKey) {
    lastLoggedKey = key;
    if (key) {
      const masked = `${key.slice(0, 6)}...${key.slice(-4)}`;
      console.log(`%c[Gemini API Network Layer] Sử dụng API Key ${isSystem ? "hệ thống mặc định" : "người dùng"} (${masked})`, "color: #10b981; font-weight: bold;");
    } else {
      console.warn("[Gemini API Network Layer] Không tìm thấy API Key hoạt động!");
    }
  }
}

function createGenAI(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

let proModelFailed = false;
let proModelFailedUntil = 0;
const getFlash = () => localStorage.getItem('aetheria_model_flash') || 'gemini-3.7-flash';
const getPro = () => {
  if (proModelFailed || Date.now() < proModelFailedUntil) {
    return getFlash();
  }
  return localStorage.getItem('aetheria_model_pro') || 'gemini-3.7-flash';
};

function stripGoogleSearch(config: any): any {
  if (!config) return config;
  const newConfig = { ...config };
  if (Array.isArray(newConfig.tools)) {
    newConfig.tools = newConfig.tools.filter((t: any) => !t.googleSearch);
    if (newConfig.tools.length === 0) {
      delete newConfig.tools;
    }
  }
  return newConfig;
}

function handleApiError(err: any, modelId?: string): Error {
  console.error("Gemini API Error caught:", err);
  const msg = err?.message || String(err);
  
  const is403 = msg.includes("403") || msg.includes("PERMISSION_DENIED");
  if (is403 && modelId && modelId === getPro() && !proModelFailed) {
    console.warn(`Model Pro (${modelId}) không được cấp quyền (403 PERMISSION_DENIED). Tự động chuyển đổi sang Model Flash cho các yêu cầu tiếp theo.`);
    proModelFailed = true;
  }

  const isQuota = isQuotaError(err) || msg.includes("429") || msg.toLowerCase().includes("resource_exhausted") || msg.toLowerCase().includes("quota exceeded") || msg.toLowerCase().includes("rate_limit");
  if (isQuota) {
    if (modelId && (modelId.includes("pro") || modelId === getPro())) {
      console.warn(`Model Pro (${modelId}) bị 429 Quota Exceeded. Tạm thời chuyển hướng sang Flash trong 3 phút...`);
      proModelFailedUntil = Date.now() + 180000;
    }
    return new Error(
      `Lỗi 429 (Hạn mức/Tần suất Gemini bị vượt quá): Bán kính tất cả API Key hiện tại đã chạm giới hạn tần suất (Free Tier: 15 yêu cầu/phút hoặc 250,000 tokens đầu vào/phút cho Flash). \nHướng khắc phục:\n1. Vui lòng chờ 1 phút rồi thử lại để hệ thống hồi chiêu (cooldown).\n2. Nhập thêm API Key phụ trong 'Cài đặt Toàn cầu' (icon bánh răng) để kích hoạt cơ chế xoay vòng tự động nhân gấp nhiều lần hạn mức.\n3. Rút ngắn văn bản truyện đang soạn thảo hoặc bắt đầu một Chương mới/phiên chat mới để giảm dung lượng tokens truyền lên.`
    );
  }

  const isKeyError = 
    msg.includes("API key") || 
    msg.includes("API_KEY_INVALID") || 
    msg.includes("INVALID_ARGUMENT") && msg.toLowerCase().includes("key") ||
    msg.includes("Key not found") ||
    msg.toLowerCase().includes("unauthorized") ||
    msg.toLowerCase().includes("api key is invalid") ||
    msg.includes("400") && msg.toLowerCase().includes("key");

  if (isKeyError) {
    const keyUsed = getApiKey(false); // Peek current key, do not rotate when displaying error
    const maskKey = keyUsed 
      ? `${keyUsed.slice(0, 6)}...${keyUsed.slice(-4)}` 
      : "Không tìm thấy key nào";
      
    return new Error(
      `Lỗi xác thực API Key của Gemini (Đang dùng: ${maskKey}). Vui lòng kiểm tra lại độ chính xác của API Key trong 'Cài đặt Toàn cầu' (nhấp vào icon bánh răng ở thanh bên) hoặc cài đặt biến môi trường của AI Studio. Chi tiết: ${msg}`
    );
  }
  
  return err instanceof Error ? err : new Error(msg);
}

class DynamicAI {
  get models() {
    return {
      generateContent: async (params: any) => {
        const keysCount = Math.max(1, getAvailableKeysCount());
        let lastErr: any = null;
        
        for (let attempt = 0; attempt < keysCount; attempt++) {
          // Xoay vòng key (lần 0 chọn key hiện tại, từ lần 1 xoay key tiếp theo)
          const key = getApiKey(attempt > 0);
          const rawModels = createGenAI(key).models;
          const modelId = params.model;
          const reqId = tokenTracker.recordRequestStart(modelId, 1000, key);
          
          try {
            const res = await rawModels.generateContent(params);
            if (res && res.usageMetadata) {
              tokenTracker.recordRequestSuccess(
                reqId,
                res.usageMetadata.promptTokenCount || 0,
                res.usageMetadata.candidatesTokenCount || 0,
                res.usageMetadata.totalTokenCount || 0
              );
            } else {
              tokenTracker.recordRequestSuccess(reqId, 0, 0, 0);
            }
            return res;
          } catch (err: any) {
            tokenTracker.recordRequestFailure(reqId);
            lastErr = err;
            
            if (isQuotaError(err)) {
              markKeyRateLimited(key);
              if (attempt < keysCount - 1) {
                console.warn(`[Network Layer Key Rotation] Key (${key.slice(0, 6)}...) bị chạm 429 Quota Exceeded. Tự động chuyển sang Key tiếp theo (Lượt thử ${attempt + 1}/${keysCount})...`);
                continue;
              }
              // All keys hit 429 quota. If model was Pro, try Flash fallback immediately!
              if (modelId === getPro() && getPro() !== getFlash()) {
                console.warn(`[Network Layer Quota Recovery] Model Pro (${modelId}) đã chạm trần hạn ngạch (429). Tự động hạ cấp sang Flash (${getFlash()}) để hoàn thành tác vụ ngay lập tức...`);
                const fallbackParams = {
                  ...params,
                  model: getFlash(),
                  config: params.config ? {
                    ...params.config,
                    thinkingConfig: params.config.thinkingConfig ? {
                      thinkingBudget: Math.min(2048, params.config.thinkingConfig.thinkingBudget || 2048)
                    } : undefined
                  } : undefined
                };
                try {
                  const fallbackRes = await rawModels.generateContent(fallbackParams);
                  if (fallbackRes && fallbackRes.usageMetadata) {
                    tokenTracker.recordRequestSuccess(
                      reqId,
                      fallbackRes.usageMetadata.promptTokenCount || 0,
                      fallbackRes.usageMetadata.candidatesTokenCount || 0,
                      fallbackRes.usageMetadata.totalTokenCount || 0
                    );
                  } else {
                    tokenTracker.recordRequestSuccess(reqId, 0, 0, 0);
                  }
                  return fallbackRes;
                } catch (fallbackErr) {
                  throw handleApiError(fallbackErr, getFlash());
                }
              }
            }
            
            const msg = err?.message || String(err);
            const is403 = msg.includes("403") || msg.includes("PERMISSION_DENIED");
            const hasSearch = params.config?.tools?.some((t: any) => t.googleSearch);
            
            if (is403 && hasSearch) {
              console.warn("Google Search tool returned 403 PERMISSION_DENIED. Retrying without search grounding...");
              const cleanConfig = stripGoogleSearch(params.config);
              try {
                const res = await rawModels.generateContent({
                  ...params,
                  config: cleanConfig
                });
                if (res && res.usageMetadata) {
                  tokenTracker.recordRequestSuccess(
                    reqId,
                    res.usageMetadata.promptTokenCount || 0,
                    res.usageMetadata.candidatesTokenCount || 0,
                    res.usageMetadata.totalTokenCount || 0
                  );
                } else {
                  tokenTracker.recordRequestSuccess(reqId, 0, 0, 0);
                }
                return res;
              } catch (retryErr) {
                if (isQuotaError(retryErr)) {
                  markKeyRateLimited(key);
                  if (attempt < keysCount - 1) {
                    continue;
                  }
                }
                throw handleApiError(retryErr, modelId);
              }
            }
            
            throw handleApiError(err, modelId);
          }
        }
        throw handleApiError(lastErr, params.model);
      },

      generateContentStream: async function* (params: any) {
        const keysCount = Math.max(1, getAvailableKeysCount());
        let lastErr: any = null;
        
        for (let attempt = 0; attempt < keysCount; attempt++) {
          const key = getApiKey(attempt > 0);
          const rawModels = createGenAI(key).models;
          const modelId = params.model;
          const reqId = tokenTracker.recordRequestStart(modelId, 1000, key);
          
          try {
            const stream = await rawModels.generateContentStream(params);
            let finalMetadata: any = null;
            let yieldedAny = false;

            try {
              for await (const chunk of stream) {
                yieldedAny = true;
                if (chunk && chunk.usageMetadata) {
                  finalMetadata = chunk.usageMetadata;
                }
                yield chunk as GenerateContentResponse;
              }
            } catch (streamErr: any) {
              if (!yieldedAny && isQuotaError(streamErr)) {
                markKeyRateLimited(key);
                tokenTracker.recordRequestFailure(reqId);
                lastErr = streamErr;
                if (attempt < keysCount - 1) {
                  console.warn(`[Network Layer Stream Rotation] Stream bị 429 trước khi phát dữ liệu. Tự động chuyển sang Key tiếp theo (Lượt thử ${attempt + 1}/${keysCount})...`);
                  continue;
                }
              }
              throw streamErr;
            }

            if (finalMetadata) {
              tokenTracker.recordRequestSuccess(
                reqId,
                finalMetadata.promptTokenCount || 0,
                finalMetadata.candidatesTokenCount || 0,
                finalMetadata.totalTokenCount || 0
              );
            } else {
              tokenTracker.recordRequestSuccess(reqId, 0, 0, 0);
            }
            return;
          } catch (err: any) {
            tokenTracker.recordRequestFailure(reqId);
            lastErr = err;
            
            if (isQuotaError(err)) {
              markKeyRateLimited(key);
              if (attempt < keysCount - 1) {
                console.warn(`[Network Layer Stream Rotation] Key (${key.slice(0, 6)}...) bị chạm 429 Quota Exceeded trong Stream. Tự động xoay sang API Key tiếp theo (Lượt thử ${attempt + 1}/${keysCount})...`);
                continue;
              }
              // All keys hit 429 quota. If model was Pro, try Flash fallback stream immediately!
              if (modelId === getPro() && getPro() !== getFlash()) {
                console.warn(`[Network Layer Stream Recovery] Model Pro (${modelId}) bị chạm 429 trong Stream. Tự động chuyển đổi sang Flash (${getFlash()})...`);
                const fallbackParams = {
                  ...params,
                  model: getFlash(),
                  config: params.config ? {
                    ...params.config,
                    thinkingConfig: params.config.thinkingConfig ? {
                      thinkingBudget: Math.min(2048, params.config.thinkingConfig.thinkingBudget || 2048)
                    } : undefined
                  } : undefined
                };
                try {
                  const fallbackStream = await rawModels.generateContentStream(fallbackParams);
                  let finalMetadata: any = null;
                  for await (const chunk of fallbackStream) {
                    if (chunk && chunk.usageMetadata) {
                      finalMetadata = chunk.usageMetadata;
                    }
                    yield chunk as GenerateContentResponse;
                  }
                  if (finalMetadata) {
                    tokenTracker.recordRequestSuccess(
                      reqId,
                      finalMetadata.promptTokenCount || 0,
                      finalMetadata.candidatesTokenCount || 0,
                      finalMetadata.totalTokenCount || 0
                    );
                  } else {
                    tokenTracker.recordRequestSuccess(reqId, 0, 0, 0);
                  }
                  return;
                } catch (fallbackErr) {
                  throw handleApiError(fallbackErr, getFlash());
                }
              }
            }
            
            const msg = err?.message || String(err);
            const is403 = msg.includes("403") || msg.includes("PERMISSION_DENIED");
            const hasSearch = params.config?.tools?.some((t: any) => t.googleSearch);
            
            if (is403 && hasSearch) {
              console.warn("Google Search tool returned 403 PERMISSION_DENIED in stream. Retrying without search grounding...");
              const cleanConfig = stripGoogleSearch(params.config);
              try {
                const stream = await rawModels.generateContentStream({
                  ...params,
                  config: cleanConfig
                });
                let finalMetadata: any = null;
                for await (const chunk of stream) {
                  if (chunk && chunk.usageMetadata) {
                    finalMetadata = chunk.usageMetadata;
                  }
                  yield chunk as GenerateContentResponse;
                }
                if (finalMetadata) {
                  tokenTracker.recordRequestSuccess(
                    reqId,
                    finalMetadata.promptTokenCount || 0,
                    finalMetadata.candidatesTokenCount || 0,
                    finalMetadata.totalTokenCount || 0
                  );
                } else {
                  tokenTracker.recordRequestSuccess(reqId, 0, 0, 0);
                }
                return;
              } catch (retryErr) {
                if (isQuotaError(retryErr)) {
                  markKeyRateLimited(key);
                  if (attempt < keysCount - 1) {
                    continue;
                  }
                }
                throw handleApiError(retryErr, modelId);
              }
            }
            
            throw handleApiError(err, modelId);
          }
        }
        throw handleApiError(lastErr, params.model);
      },

      embedContent: async (params: any) => {
        const keysCount = Math.max(1, getAvailableKeysCount());
        let lastErr: any = null;

        for (let attempt = 0; attempt < keysCount; attempt++) {
          const key = getApiKey(attempt > 0);
          const rawModels = createGenAI(key).models;
          try {
            return await rawModels.embedContent(params);
          } catch (err: any) {
            lastErr = err;
            if (isQuotaError(err)) {
              markKeyRateLimited(key);
              if (attempt < keysCount - 1) {
                console.warn(`[Network Layer Embed Rotation] Key bị chạm 429 Quota Exceeded. Tự động xoay sang Key tiếp theo...`);
                continue;
              }
            }
            throw handleApiError(err);
          }
        }
        throw handleApiError(lastErr);
      },

      generateVideos: async (params: any) => {
        const keysCount = Math.max(1, getAvailableKeysCount());
        let lastErr: any = null;

        for (let attempt = 0; attempt < keysCount; attempt++) {
          const key = getApiKey(attempt > 0);
          const rawModels = createGenAI(key).models;
          try {
            return await rawModels.generateVideos(params);
          } catch (err: any) {
            lastErr = err;
            if (isQuotaError(err)) {
              markKeyRateLimited(key);
              if (attempt < keysCount - 1) {
                console.warn(`[Network Layer Video Rotation] Key bị chạm 429 Quota Exceeded. Tự động xoay sang Key tiếp theo...`);
                continue;
              }
            }
            throw handleApiError(err);
          }
        }
        throw handleApiError(lastErr);
      }
    };
  }

  get chats() {
    return {
      create: (params: any) => {
        let currentKey = getApiKey(false);
        let rawChats = createGenAI(currentKey).chats;
        const modelId = params.model;
        let session = rawChats.create(params);
        
        const wrappedSession: any = { ...session };

        // Wrap sendMessage with 429 key rotation
        wrappedSession.sendMessage = async (sendParams: any) => {
          const keysCount = Math.max(1, getAvailableKeysCount());
          let lastErr: any = null;

          for (let attempt = 0; attempt < keysCount; attempt++) {
            if (attempt > 0) {
              currentKey = getApiKey(true);
              rawChats = createGenAI(currentKey).chats;
              const currentHistory = (session as any).history || params.history || [];
              session = rawChats.create({
                ...params,
                history: currentHistory
              });
            }

            const reqId = tokenTracker.recordRequestStart(modelId, 1000, currentKey);
            try {
              const res = await session.sendMessage(sendParams);
              if (res && res.usageMetadata) {
                tokenTracker.recordRequestSuccess(
                  reqId,
                  res.usageMetadata.promptTokenCount || 0,
                  res.usageMetadata.candidatesTokenCount || 0,
                  res.usageMetadata.totalTokenCount || 0
                );
              } else {
                tokenTracker.recordRequestSuccess(reqId, 0, 0, 0);
              }
              return res;
            } catch (err: any) {
              tokenTracker.recordRequestFailure(reqId);
              lastErr = err;

              if (isQuotaError(err)) {
                markKeyRateLimited(currentKey);
                if (attempt < keysCount - 1) {
                  console.warn(`[Network Layer Chat Rotation] Key bị chạm 429 Quota Exceeded. Xoay vòng sang API Key tiếp theo và thử lại (Lượt thử ${attempt + 1}/${keysCount})...`);
                  continue;
                }
              }

              throw handleApiError(err, modelId);
            }
          }
          throw handleApiError(lastErr, modelId);
        };

        // Wrap sendMessageStream with 429 key rotation
        wrappedSession.sendMessageStream = async (sendParams: any) => {
          const keysCount = Math.max(1, getAvailableKeysCount());
          
          async function* runStreamWithRetry() {
            let lastErr: any = null;
            
            for (let attempt = 0; attempt < keysCount; attempt++) {
              if (attempt > 0) {
                currentKey = getApiKey(true);
                rawChats = createGenAI(currentKey).chats;
                const currentHistory = (session as any).history || params.history || [];
                session = rawChats.create({
                  ...params,
                  history: currentHistory
                });
              }
              
              const reqId = tokenTracker.recordRequestStart(modelId, 1000, currentKey);
              try {
                const rawStream = await session.sendMessageStream(sendParams);
                let finalMetadata: any = null;
                let yieldedAny = false;
                
                try {
                  for await (const chunk of rawStream) {
                    yieldedAny = true;
                    if (chunk && chunk.usageMetadata) {
                      finalMetadata = chunk.usageMetadata;
                    }
                    yield chunk as GenerateContentResponse;
                  }
                } catch (streamErr: any) {
                  if (!yieldedAny && isQuotaError(streamErr)) {
                    markKeyRateLimited(currentKey);
                    tokenTracker.recordRequestFailure(reqId);
                    lastErr = streamErr;
                    if (attempt < keysCount - 1) {
                      console.warn(`[Network Layer Chat Stream Rotation] 429 trước khi phát chunk. Xoay sang Key tiếp theo (Lượt thử ${attempt + 1}/${keysCount})...`);
                      continue;
                    }
                  }
                  throw streamErr;
                }
                
                if (finalMetadata) {
                  tokenTracker.recordRequestSuccess(
                    reqId,
                    finalMetadata.promptTokenCount || 0,
                    finalMetadata.candidatesTokenCount || 0,
                    finalMetadata.totalTokenCount || 0
                  );
                } else {
                  tokenTracker.recordRequestSuccess(reqId, 0, 0, 0);
                }
                
                return; // Success
              } catch (err: any) {
                tokenTracker.recordRequestFailure(reqId);
                lastErr = err;
                
                if (isQuotaError(err)) {
                  markKeyRateLimited(currentKey);
                  if (attempt < keysCount - 1) {
                    console.warn(`[Network Layer Chat Stream Rotation] Key bị chạm 429 Quota Exceeded. Xoay vòng sang API Key tiếp theo và thử lại (Lượt thử ${attempt + 1}/${keysCount})...`);
                    continue;
                  }
                }
                
                throw handleApiError(err, modelId);
              }
            }
            throw handleApiError(lastErr, modelId);
          }
          
          return runStreamWithRetry() as any;
        };
        
        return wrappedSession;
      }
    };
  }
}
const ai = new DynamicAI() as unknown as GoogleGenAI;

const MODEL_EMBEDDING = 'gemini-embedding-2-preview';
const MODEL_VEO = 'veo-3.1-lite-generate-preview';

// Helper for safe content generation with fallback
async function safeGenerateContent(params: { model: string, contents: any, config?: any }): Promise<any> {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    if (params.model === getPro()) {
      console.warn("getPro() failed, falling back to getFlash():", error);
      const fallbackConfig = params.config ? { ...params.config } : {};
      if (fallbackConfig.thinkingConfig) {
        delete fallbackConfig.thinkingConfig;
      }
      return await ai.models.generateContent({
        ...params,
        model: getFlash(),
        config: fallbackConfig
      });
    }
    throw error;
  }
}

// Helper for safe streaming content generation with fallback
async function* safeGenerateContentStream(params: { model: string, contents: any, config?: any }): AsyncGenerator<GenerateContentResponse, void, unknown> {
  try {
    const stream = await ai.models.generateContentStream(params);
    for await (const chunk of stream) {
      yield chunk as GenerateContentResponse;
    }
  } catch (error: any) {
    if (params.model === getPro()) {
      console.warn("getPro() stream failed, falling back to getFlash() stream:", error);
      const fallbackConfig = params.config ? { ...params.config } : {};
      if (fallbackConfig.thinkingConfig) {
        delete fallbackConfig.thinkingConfig;
      }
      const streamFallback = await ai.models.generateContentStream({
        ...params,
        model: getFlash(),
        config: fallbackConfig
      });
      for await (const chunk of streamFallback) {
        yield chunk as GenerateContentResponse;
      }
    } else {
      throw error;
    }
  }
}

export const geminiService = {
  // Trả về API Key đang hoạt động
  getApiKey() {
    return getApiKey();
  },

  // Reset trạng thái lỗi của Model Pro khi lưu/cập nhật API Key mới
  resetProModelFailed() {
    proModelFailed = false;
    console.log("Đã khôi phục trạng thái Model Pro.");
  },

  // Kiểm tra tính hợp lệ của API Key
  async testApiKey(key: string): Promise<{ success: boolean; message: string }> {
    if (!key || !key.trim()) {
      return { success: false, message: "Vui lòng nhập API Key để kiểm tra." };
    }
    try {
      const testAI = createGenAI(key.trim());
      
      // Thử thực tế generateContent trước bằng gemini-3.7-flash để kiểm tra xem key có bị dính 429 / hết hạn mức không.
      // (Vì models.list() chỉ kiểm tra xác thực signature của key chứ không kiểm tra được hạn mức sinh văn bản thực tế).
      try {
        const response = await testAI.models.generateContent({
          model: "gemini-3.7-flash",
          contents: "Hi",
          config: { maxOutputTokens: 2 }
        });
        if (response) {
          return { 
            success: true, 
            message: "Kết nối thành công! API Key hoạt động hoàn hảo và sẵn sàng tạo nội dung." 
          };
        }
      } catch (genErr: any) {
        console.warn("generateContent failed during API key test:", genErr);
        const msg = (genErr?.message || String(genErr)).toLowerCase();
        const is429 = msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("limit");
        
        if (is429) {
          return {
            success: false,
            message: "API Key đúng cấu trúc nhưng HIỆN TẠI ĐÃ HẾT HẠN MỨC HOẶC BỊ GIỚI HẠN TẦN SUẤT (Lỗi 429 Resource Exhausted/Quota Exceeded). Vui lòng thử lại sau 1-2 phút hoặc nhập thêm API Key dự phòng khác."
          };
        }
        
        // Nếu là lỗi xác thực (sai key hoàn toàn), ta ném lỗi ra ngoài để xử lý ở catch chính
        if (msg.includes("key") || msg.includes("invalid") || msg.includes("unauthorized") || msg.includes("400") || msg.includes("403")) {
          throw genErr;
        }
      }

      // Phương án dự phòng: Nếu generateContent lỗi vì lý do đặc thù khác, thử list models để xem key có hợp lệ cấu trúc không.
      try {
        const modelList = await testAI.models.list();
        if (modelList) {
          return { 
            success: true, 
            message: "Kết nối thành công! Xác thực cấu trúc API Key hợp lệ qua Model Service (nhưng hãy chú ý hạn mức tạo văn bản có thể bị hạn chế)." 
          };
        }
      } catch (listErr: any) {
        console.warn("models.list failed, trying generateContent fallback:", listErr);
      }

      // Nếu list thất bại hoặc không được hỗ trợ (ví dụ một số key giới hạn quyền), thử generateContent với các model khác nhau làm fallback
      const modelsToTry = ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        try {
          const response = await testAI.models.generateContent({
            model: modelName,
            contents: "hi",
            config: { maxOutputTokens: 5 }
          });
          if (response) {
            return { 
              success: true, 
              message: `Kết nối thành công! API Key hoạt động chính xác (đã xác thực qua model ${modelName}).` 
            };
          }
        } catch (genErr: any) {
          console.warn(`generateContent with ${modelName} failed:`, genErr);
          lastError = genErr;
        }
      }

      // Nếu tất cả đều thất bại, báo lỗi cụ thể của lần thử cuối cùng
      throw lastError || new Error("Không thể kết nối tới bất kỳ model nào.");
    } catch (e: any) {
      console.error("Test API key error:", e);
      const msg = (e?.message || String(e)).toLowerCase();
      const is429 = msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("limit");
      
      if (is429) {
        return {
          success: false,
          message: "API Key đúng cấu trúc nhưng HIỆN TẠI ĐÃ HẾT HẠN MỨC/GIỚI HẠN TẦN SUẤT (Lỗi 429 Resource Exhausted). Vui lòng đợi 1-2 phút hoặc sử dụng key khác."
        };
      }
      
      return { 
        success: false, 
        message: `Kết nối thất bại: API Key không chính xác hoặc không hợp lệ. Chi tiết: ${e?.message || e || "Lỗi cấu trúc Key"}`
      };
    }
  },

  // Giao thức Thẩm định Tri thức Thực tế
  async verifyKnowledge(entities: string, story: Story): Promise<string> {
    if (!entities.trim()) return "";
    const prompt = promptBuilderService.buildKnowledgeVerificationPrompt(entities, story.setting);
    try {
      const response = await safeGenerateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }], temperature: 0.1 }
      });
      const citations = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c:any) => c.web?.uri).filter(Boolean) || [];
      const citationText = citations.length > 0 ? `\n(Nguồn xác minh: ${citations.slice(0, 3).join(', ')})` : "";
      return response.text + citationText;
    } catch (e) { return ""; }
  },

  // Tìm kiếm bối cảnh lịch sử dựa trên Timeline
  async fetchHistoricalContext(timeline: string): Promise<string> {
    if (!timeline || timeline.length < 4) return "";
    const prompt = `Tìm kiếm dữ liệu lịch sử cụ thể cho mốc thời gian: "${timeline}".
    Liệt kê ngắn gọn:
    1. Các sự kiện lớn đang diễn ra.
    2. Các phe phái/quốc gia nắm quyền.
    3. Các nhân vật lịch sử nổi tiếng còn sống vào thời điểm này.
    4. Đặc điểm xã hội/trang phục/công nghệ.`;
    
    try {
      const response = await ai.models.generateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }] }
      });
      return response.text || "";
    } catch (e) {
      console.warn("Historical fetch failed, skipping.", e);
      return "";
    }
  },

  // Tìm kiếm dữ liệu Đồng nhân (Canon)
  async fetchCanonContext(fandomName: string): Promise<string> {
    if (!fandomName || fandomName.length < 2) return "";
    const prompt = `Tra cứu và tổng hợp thông tin cốt lõi về tác phẩm/vũ trụ: "${fandomName}".
    Tập trung vào:
    1. Hệ thống sức mạnh/phép thuật chính.
    2. Các nhân vật chủ chốt và tính cách đặc trưng (để đảm bảo In-Character).
    3. Các địa danh và sự kiện quan trọng nhất.
    4. Quy tắc thế giới đặc thù (Luật lệ, Cấm kỵ).
    Mục tiêu: Cung cấp dữ liệu nền tảng chính xác để viết đồng nhân (fanfiction).`;

    try {
      const response = await ai.models.generateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }] }
      });
      return response.text || "";
    } catch (e) {
      console.warn("Canon fetch failed, skipping.", e);
      return "";
    }
  },

  // Chiết tách Hồn Văn (Literary DNA)
  async extractWritingDNA(text: string): Promise<any | null> {
    if (!text.trim()) return null;
    const prompt = promptBuilderService.buildDNAExtractionPrompt(text);
    try {
      const response = await ai.models.generateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      return { data: JSON.parse(response.text || "null"), usageMetadata: response.usageMetadata };
    } catch (e) {
      console.error("DNA Extraction failed:", e);
      return null;
    }
  },

  async generateStoryFoundation(seedIdea: string, genre: string): Promise<any> {
    const prompt = promptBuilderService.buildStoryFoundationPrompt(seedIdea, genre);
    try {
      const response = await ai.models.generateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
    } catch (e) { return null; }
  },

  async enforceCompliance(text: string, story: Story, verificationReport: string = ""): Promise<any> {
    const prompt = promptBuilderService.buildComplianceGuardrailPrompt(
        text, 
        story.interactionRules || "", 
        story.negativePrompt || "", 
        story.mechanics || "",
        story.pronounStyle || "",
        story.persistentDirectives || "",
        verificationReport
    );
    try {
        const response = await ai.models.generateContent({
            model: getFlash(), 
            contents: [{ parts: [{ text: prompt }] }],
            config: { 
                temperature: 0.2
            } 
        });
        const resultText = response.text?.trim() || text;
        if (resultText.length < text.length * 0.8) {
            return { text, usageMetadata: response.usageMetadata };
        }
        return { text: resultText, usageMetadata: response.usageMetadata };
    } catch (e) {
        return { text, usageMetadata: null };
    }
  },

  async *generateStoryStream(
    immediateContext: string,
    worldBible: string,
    planning: string,
    characters: Character[],
    interactionRules: string,
    userInstruction: string,
    genre: string,
    writingStyle: string,
    pov: string,
    pronounStyle: string,
    negativePrompt: string,
    nsfw: boolean,
    hasSystem: boolean,
    targetWordCount: number,
    persistentDirectives: string,
    mechanics: string,
    chapterOutline: string,
    verificationReport: string = "",
    writingDNA?: WritingDNA,
    currentChapterTime: string = "",
    previousChapterTime: string = "",
    currentTimeline: string = "",
    historicalContext: string = "",
    canonContext: string = "" 
  ) {
    const systemInstruction = promptBuilderService.buildSystemInstruction(
      genre, worldBible, pov, pronounStyle, writingStyle, interactionRules, negativePrompt, nsfw, hasSystem, mechanics, persistentDirectives, writingDNA
    );
    const prompt = promptBuilderService.buildForgePrompt(
      immediateContext, worldBible, planning, characters, interactionRules, userInstruction, pronounStyle, targetWordCount, persistentDirectives, mechanics, chapterOutline, verificationReport, currentChapterTime, previousChapterTime, currentTimeline, historicalContext, canonContext
    );
    const stream = safeGenerateContentStream({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        systemInstruction, 
        temperature: 1.0, 
        topP: 0.98, 
        thinkingConfig: { thinkingBudget: 2048 } 
      }
    });
    for await (const chunk of stream) yield chunk;
  },

  async embedText(text: string): Promise<number[]> {
    if (!text.trim()) return [];
    try {
      const response = await ai.models.embedContent({
        model: MODEL_EMBEDDING,
        contents: [{ parts: [{ text }] }]
      });
      return response.embeddings[0].values;
    } catch (e) { return []; }
  },

  async generateChapterSummary(title: string, content: string): Promise<any> {
    const prompt = `Hãy tóm tắt đầy đủ các sự kiện quan trọng trong chương "${title}" (khoảng 200 từ). Tập trung vào chuyển biến của nhân vật và các vật phẩm/thông tin mới. [NỘI DUNG]: ${content.substring(0, 10000)}`;
    const response = await ai.models.generateContent({ 
        model: getFlash(), 
        contents: [{ parts: [{ text: prompt }] }] 
    });
    return { text: response.text || "", usageMetadata: response.usageMetadata };
  },

  async generateChapterContentFromPlot(chapter: Chapter, story: Story): Promise<any> {
    const hasOriginalDraft = !!(chapter.content && chapter.content.trim().length > 30);
    const prompt = `Bạn là một Đại văn hào chuyên nghiệp viết tiểu thuyết trực tuyến xuất sắc.
Hãy viết hoặc chỉnh sửa/nâng cấp bản thảo (draft) cho chương "${chapter.title}" của tác phẩm "${story.title}" dựa trên các thông tin cốt truyện và định hướng sau đây:

[THỂ LOẠI]: ${story.genre}
[DANH SÁCH NHÂN VẬT CHÍNH]:
${story.characters?.map(c => `- ${c.name}: ${c.description} (Vai trò: ${c.role})`).join('\n')}

[BỐI CẢNH & THẾ GIỚI]:
${story.setting || "Chưa thiết lập"}

[ĐỀ CƯƠNG CHI TIẾT CHƯƠNG NÀY (OUTLINE)]:
${chapter.outline || "Chưa thiết lập. Hãy tự thiết kế các phân cảnh kịch tính."}

[BẢN THẢO / NGUYÊN MẪU HIỆN TẠI (NẾU CÓ - ĐẦY ĐỦ 100%)]:
${chapter.content || "(Trống - Hãy viết mới hoàn toàn)"}

${ORIGINAL_FIDELITY_PROTOCOL}

Yêu cầu cụ thể:
1. ${hasOriginalDraft ? '⚠️ ĐÃ CÓ BẢN THẢO / NGUYÊN MẪU GỐC: Bạn PHẢI BẢO TỒN 100% các chi tiết đắt giá, tên nhân vật, đạo cụ, từng lời thoại và diễn biến cụ thể trong bản thảo hiện tại. Hãy trau chuốt, nâng cấp văn phong và kết hợp mở rộng theo định hướng của Đề cương chi tiết (Outline). TUYỆT ĐỐI KHÔNG xóa bỏ, không tóm tắt hay làm mất các chi tiết của bản thảo nguyên mẫu.' : 'Hãy bám sát Đề cương chi tiết (Outline) để kiến tạo nên một chương truyện hoàn chỉnh, giàu chi tiết và cảm xúc.'}
2. BẢO TỒN TOÀN BỘ CHI TIẾT: Tuyệt đối không lược bỏ tên nhân vật, vật phẩm, tình huống, tâm lý hay các phân cảnh của nguyên mẫu.
3. Viết một chương truyện hoàn chỉnh, giàu chi tiết, nhịp điệu lôi cuốn, văn phong trau chuốt, giữ đúng tính cách các nhân vật.
4. Tuyệt đối không được tóm tắt chương, hãy viết dưới dạng truyện đọc trực tiếp (với lời thoại, hành động, miêu tả tâm lý và bối cảnh chi tiết).
5. Sử dụng các quy tắc kể chuyện từ ngôi kể: ${story.pov || "Ngôi thứ ba"} và phong cách đại từ: ${story.pronounStyle || "Tự nhiên"}.
6. Đảm bảo dung lượng đầy đủ, kịch tính, lôi cuốn (tối thiểu bằng hoặc dài hơn bản thảo hiện tại).

Hãy viết/chỉnh sửa chương truyện ngay dưới đây:`;

    const response = await safeGenerateContent({ 
        model: getFlash(), 
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            temperature: 0.85,
            thinkingConfig: { thinkingBudget: 2048 } 
        }
    });

    return { text: response.text || "", usageMetadata: response.usageMetadata };
  },

  async suggestOutline(chapter: Chapter, story: Story, userInstruction: string, longTermMemory: string, shortTermMemory: string): Promise<any> {
    const prompt = promptBuilderService.buildAdvancedOutlinePrompt(chapter, story, userInstruction, longTermMemory, shortTermMemory);
    const response = await safeGenerateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 2048 } 
      }
    });
    return { text: response.text || "", usageMetadata: response.usageMetadata };
  },

  async analyzePlotArc(storyOrChapters: Story | Chapter[], storyTitle?: string): Promise<any> {
    const prompt = promptBuilderService.buildPlotArcAnalysisPrompt(storyOrChapters, storyTitle);
    try {
      const response = await safeGenerateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 2048 }
        }
      });
      return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
    } catch (e) {
      try {
        const response = await safeGenerateContent({
          model: getFlash(),
          contents: [{ parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" }
        });
        return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
      } catch (err) {
        console.error("Plot Arc Analysis failed:", err);
        return null;
      }
    }
  },

  async extractKnowledge(text: string, story: Story, categories: ExtractionCategory[] = ['characters', 'world']): Promise<any> {
    const prompt = promptBuilderService.buildKnowledgeExtractionPrompt(text, story.characters, categories);
    try {
      const response = await safeGenerateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
    } catch (e) { return null; }
  },

  async *chatPlanningStream(history: ChatMessage[], message: string, story: Story) {
    let chat;
    try {
      chat = ai.chats.create({
        model: getFlash(),
        config: { 
          systemInstruction: `Bạn là Kiến trúc sư Cốt truyện. Hãy tư vấn dựa trên [CHỈ THỊ BỀN VỮNG]: ${story.persistentDirectives}.` 
        },
        history: history.map(h => ({ role: h.role, parts: h.parts }))
      });
      const response = await chat.sendMessageStream({ message });
      for await (const chunk of response) yield chunk as GenerateContentResponse;
    } catch (e) {
      console.warn("chatPlanningStream failed:", e);
    }
  },

  async *chatPlotStream(history: ChatMessage[], message: string, story: Story) {
    let chat;
    const chaptersContext = formatSmartChapterContext(story.chapters, {
      maxTotalChars: 250000,
      targetChapterMention: message
    });

    const systemInstruction = `Bạn là Chuyên gia Cố vấn & Đồng hành Hiệu đính Cốt truyện (AI Plot Collaborator & Co-Editor). Nhiệm vụ của bạn là cùng tác giả phân tích cốt truyện, phát hiện lỗ hổng logic, sửa chữa tác phẩm và đề xuất hướng phát triển cốt truyện tốt nhất.
Tên truyện: "${story.title}"
Thể loại: ${story.genre}
Phong cách viết / Giọng văn: ${story.writingStyle || "Chuẩn mực văn học"}
Dàn ý tổng thể hiện tại: ${story.planning || "Chưa có"}
Nhân vật chính: ${story.characters?.map(c => `${c.name} (${c.role || 'Nhân vật'})`).join(', ') || "Chưa thiết lập"}

${ORIGINAL_FIDELITY_PROTOCOL}

[DỮ LIỆU CÁC CHƯƠNG - BẢN THẢO THỰC TẾ & ĐỀ CƯƠNG]:
${chaptersContext}

[GIAO THỨC TỐI THƯỢNG VỀ BẢO TỒN BẢN THẢO & VĂN PHONG]:
1. 📖 BẢN THẢO THỰC TẾ LÀ NGUYÊN MẪU DUY NHẤT: Bắt buộc phải đọc và phân tích chi tiết dựa trên từng câu chữ, lời thoại, hành động và tình huống trong [BẢN THẢO THỰC TẾ]. Tóm tắt (Summary) chỉ là tài liệu tham khảo phụ trợ. TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ nhìn vào tóm tắt rồi phóng tác sai lệch sự thật và chi tiết của bản thảo!
2. 🎭 TÔN TRỌNG VĂN PHONG TÁC GIẢ: Bám sát giọng điệu, nhịp điệu và phong cách kể chuyện đặc trưng của tác giả.
3. ✍️ ĐỀ XUẤT SỬA BẢN THẢO [PROPOSAL_CONTENT_CHAPTER_<id>]: Khi đưa ra đề xuất sửa đổi bản thảo chương, BẮT BUỘC PHẢI DÙNG BẢN THẢO NGUYÊN MẪU CỦA CHƯƠNG ĐÓ LÀM GỐC. Giữ trọn vẹn 100% các chi tiết, tên nhân vật, vật phẩm, tình huống, lời thoại đắt giá, chỉ chỉnh sửa trau chuốt hoặc bổ sung theo yêu cầu, TUYỆT ĐỐI KHÔNG tóm tắt hay làm mất bất kỳ chi tiết nào của bản thảo gốc.

Bạn hãy trao đổi nhiệt tình, thân thiện và mang tính phân tích sâu sắc.
ĐẶC BIỆT: Bạn có quyền đưa ra đề xuất sửa đổi cấu trúc bằng cách thêm một trong các thẻ sau vào tin nhắn của bạn (nút "Áp dụng" sẽ tự động hiển thị cho người dùng để đồng bộ trực tiếp với bản thảo hoặc dàn ý):

- Để đề xuất cập nhật Dàn ý câu chuyện (Story Planning):
[PROPOSAL_PLANNING: <nội dung dàn ý mới>]

- Để đề xuất cập nhật Đề cương/Dàn ý một chương cụ thể (thay <chapterId> bằng ID của chương đó, ví dụ: [PROPOSAL_OUTLINE_CHAPTER_12345: nội dung đề cương]):
[PROPOSAL_OUTLINE_CHAPTER_<chapterId>: <nội dung đề cương mới>]

- Để đề xuất cập nhật Tóm tắt một chương cụ thể (thay <chapterId> bằng ID của chương đó):
[PROPOSAL_SUMMARY_CHAPTER_<chapterId>: <nội dung tóm tắt mới>]

- Để đề xuất cập nhật/sửa đổi trực tiếp Bản thảo/Nội dung chương viết (thay <chapterId> bằng ID của chương đó, ví dụ [PROPOSAL_CONTENT_CHAPTER_12345: nội dung bản thảo mới]):
[PROPOSAL_CONTENT_CHAPTER_<chapterId>: <toàn bộ nội dung bản thảo mới hoặc sửa đổi>]

Hãy viết phân tích sâu sắc, bảo tồn nguyên vẹn văn phong và phản hồi bằng tiếng Việt.`;

    // Sanitize and limit chat history to recent messages to prevent token accumulation
    const sanitizedHistory = (history || []).slice(-4).map(h => {
      const parts = (h.parts || []).map(p => {
        let text = p.text || "";
        if (text.length > 1500) {
          text = text.substring(0, 1500) + "... [Đã lược bớt lịch sử]";
        }
        return { text };
      });
      return { role: h.role, parts };
    });

    try {
      chat = ai.chats.create({
        model: getFlash(),
        config: { systemInstruction },
        history: sanitizedHistory
      });
      const response = await chat.sendMessageStream({ message });
      for await (const chunk of response) yield chunk as GenerateContentResponse;
    } catch (e) {
      console.warn("Plot chat error, retrying without history:", e);
      chat = ai.chats.create({
        model: getFlash(),
        config: { systemInstruction },
        history: []
      });
      const response = await chat.sendMessageStream({ message });
      for await (const chunk of response) yield chunk as GenerateContentResponse;
    }
  },

  async searchCreativeInspiration(story: Story, customTopic?: string): Promise<any> {
    const prompt = `Nghiên cứu về: ${customTopic || story.genre}. Tìm các yếu tố phù hợp truyện "${story.title}".`;
    try {
      const response = await safeGenerateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }] }
      });
      const insights = response.text || "";
      const sources: WebInspiration[] = [];
      response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((chunk: any) => {
        if (chunk.web) sources.push({ title: chunk.web.title, url: chunk.web.uri, snippet: "", sourceType: 'general' });
      });
      return { data: { insights, sources }, usageMetadata: response.usageMetadata };
    } catch (e) { return null; }
  },

  async expandWorldBuilding(input: string): Promise<any> {
    const prompt = `[NHIỆM VỤ: KIẾN TRÚC SƯ THẾ GIỚI - MỞ RỘNG BỐI CẢNH]
Dựa trên đoạn văn bản thiết lập thế giới (World Setting) dưới đây, hãy viết mở rộng thêm để làm phong phú chiều sâu.
[VĂN BẢN GỐC]:
${input}
[YÊU CẦU MỞ RỘNG]:
1. **Địa lý & Môi trường:** Mô tả chi tiết hơn về địa hình, khí hậu, tài nguyên thiên nhiên hoặc các địa danh đặc biệt (nếu chưa rõ).
2. **Văn hóa & Lịch sử:** Bổ sung các phong tục tập quán, lễ hội, tín ngưỡng hoặc các sự kiện lịch sử đã hình thành nên bối cảnh hiện tại.
3. **Giữ nguyên văn phong:** Duy trì giọng văn và các thuật ngữ đã có trong bản gốc.
4. **Kết quả:** Trả về văn bản đã được mở rộng và trau chuốt (Bao gồm cả nội dung cũ và mới, liền mạch).`;
    
    try {
        const response = await safeGenerateContent({ 
            model: getFlash(), 
            contents: [{ parts: [{ text: prompt }] }],
            config: { temperature: 0.8, thinkingConfig: { thinkingBudget: 2048 } }
        });
        return { text: response.text || input, usageMetadata: response.usageMetadata };
    } catch (e) { return null; }
  },

  async suggestWorldSettings(title: string, genre: string, synopsis: string, timeline: string): Promise<any> {
    const prompt = `[NHIỆM VỤ: KIẾN TRÚC SƯ THẾ GIỚI - AETHERIA ARCHITECT]
Dựa trên thông tin đầu vào:
- Tiêu đề: "${title}"
- Thể loại: "${genre}"
- Tóm tắt: "${synopsis}"
- Niên đại: "${timeline}"
Let's sáng tạo toàn bộ thiết lập chi tiết cho thế giới này. Đảm bảo tính nhất quán và chiều sâu.
TRẢ VỀ ĐỊNH DẠNG JSON CHUẨN...`;

    try {
      const response = await safeGenerateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { 
            responseMimeType: "application/json",
            temperature: 0.95,
            thinkingConfig: { thinkingBudget: 2048 }
        }
      });
      return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
    } catch (e) { return null; }
  },

  async suggestMainCharacter(title: string, genre: string, synopsis: string): Promise<any> {
    const prompt = `[NHIỆM VỤ: SÁNG TẠO NHÂN VẬT CHÍNH]
Dựa trên ý tưởng truyện:
- Tiêu đề: "${title}"
- Thể loại: "${genre}"
- Tóm tắt: "${synopsis}"

Hãy thiết kế một Nhân Vật Chính (Protagonist) có chiều sâu, động cơ rõ ràng và phù hợp với thế giới này.
TRẢ VỀ JSON:
{
  "name": "Tên nhân vật (Phù hợp bối cảnh)",
  "gender": "Giới tính",
  "species": "Chủng tộc (Vd: Nhân tộc, Yêu hồ...)",
  "archetype": "Kiểu mẫu nhân vật (Vd: Phế vật nghịch thiên, Xuyên không...)",
  "background": "Xuất thân & Động cơ (Ngắn gọn)"
}`;
    
    try {
        const response = await ai.models.generateContent({
            model: getFlash(),
            contents: [{ parts: [{ text: prompt }] }],
            config: { 
                responseMimeType: "application/json",
                temperature: 1.0
            }
        });
        return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
    } catch (e) { return null; }
  },

  async balanceChapterLength(content: string, target: number, current: number, interactionRules: string, genre: string, negativePrompt: string): Promise<any> {
    const prompt = `Cân bằng độ dài (${target} từ). JSON: { "edited_text": "..." }. VĂN BẢN: ${content.substring(0, 10000)}`;
    const response = await ai.models.generateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });
    return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
  },

  async *refineChapterStream(content: string, worldBible: string, interactionRules: string, genre: string, writingStyle: string, pov: string, pronounStyle: string, negativePrompt: string, nsfw: boolean, customInstruction: string, persistentDirectives: string, mechanics: string, styleReference: string) {
    const prompt = promptBuilderService.buildRefineChapterPrompt(content, worldBible, interactionRules, genre, writingStyle, pov, pronounStyle, negativePrompt, nsfw, customInstruction, persistentDirectives, mechanics, styleReference || "");
    const stream = safeGenerateContentStream({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { thinkingConfig: { thinkingBudget: 2048 } }
    });
    for await (const chunk of stream) yield chunk;
  },

  async *refineSelectionStream(selection: string, prefix: string, suffix: string, story: Story, instruction: string) {
    const prompt = `[NHIỆM VỤ: TINH CHỈNH ĐOẠN VĂN BẢN CHỌN LỌC]
Bạn là Biên tập viên văn học cao cấp. Hãy chỉnh sửa và nâng cấp đoạn văn bản sau đây theo yêu cầu của tác giả.

${ORIGINAL_FIDELITY_PROTOCOL}

[BỐI CẢNH LIỀN TRƯỚC]:
"...${prefix.slice(-600)}"

[ĐOẠN VĂN NGUYÊN MẪU CẦN SỬA]:
"""
${selection}
"""

[BỐI CẢNH LIỀN SAU]:
"${suffix.slice(0, 600)}..."

[YÊU CẦU CHỈNH SỬA CỤ THỂ]:
"${instruction || 'Trau chuốt văn phong mượt mà, giàu cảm xúc và hình ảnh'}"

[QUY TẮC BẮT BUỘC]:
1. 🛡️ GIỮ NGUYÊN TOÀN BỘ CỐT LÕI NGUYÊN MẪU: Giữ nguyên mọi chi tiết, hành động của nhân vật, đồ vật, lời thoại và ý nghĩa của đoạn văn gốc.
2. 🚫 KHÔNG TẮT HOẶC CẮT BỚT: Tuyệt đối không tóm tắt hay làm mất các chi tiết đặc sắc trong bản gốc.
3. 🔗 LIỀN MẠCH: Đảm bảo đoạn văn sau khi sửa khớp nối hoàn hảo và mượt mà với bối cảnh trước và sau.
4. 📝 Chỉ trả về đúng đoạn văn đã chỉnh sửa thay thế, không kèm lời dẫn giải hay chào hỏi.

BẮT ĐẦU ĐOẠN VĂN ĐÃ CHỈNH SỬA:`;
    const stream = safeGenerateContentStream({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { thinkingConfig: { thinkingBudget: 2048 } }
    });
    for await (const chunk of stream) yield chunk;
  },

  async auditStoryConsistency(story: Story): Promise<any> {
    const prompt = `Kiểm toán toàn diện truyện "${story.title}". Đối chiếu Chapters với World Bible. Trả về JSON.`;
    const response = await ai.models.generateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });
    return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
  },

  async auditChapterLogic(content: string, title: string, story: Story): Promise<any> {
    const prompt = `Kiểm toán logic chương "${title}". Tìm lỗi xưng hô, vật lý hoặc mâu thuẫn nhân vật. JSON.`;
    const response = await ai.models.generateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });
    return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
  },

  async analyzeVocabulary(content: string, interactionRules: string): Promise<any> {
    const prompt = `Phân tích từ vựng và gợi ý tinh chỉnh văn chương. JSON.`;
    const response = await ai.models.generateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });
    return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
  },

  async extractStylisticRule(text: string): Promise<any> {
    const prompt = promptBuilderService.buildStyleRuleExtractionPrompt(text);
    const response = await ai.models.generateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }]
    });
    return { text: response.text || "", usageMetadata: response.usageMetadata };
  },

  async deriveStylisticRule(original: string, modified: string): Promise<any> {
    const prompt = promptBuilderService.buildDeriveStylisticRulePrompt(original, modified);
    const response = await ai.models.generateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }]
    });
    return { text: response.text || "", usageMetadata: response.usageMetadata };
  },

  async autoUpdateCharacterStatus(character: Character, longTermMemory: string, shortTermMemory: string): Promise<any> {
    const prompt = `[NHIỆM VỤ: PHÂN TÍCH TIẾN HÓA NHÂN VẬT & CẬP NHẬT TRI THỨC]...`;
    const response = await ai.models.generateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });
    return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
  },

  async generateAdvancedChapterSuggestion(story: Story): Promise<any> {
    const prompt = promptBuilderService.buildNextChapterSuggestionPrompt(story);
    try {
      const response = await ai.models.generateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { 
            responseMimeType: "application/json", 
            temperature: 0.8
        }
      });
      return { data: JSON.parse(response.text || "null"), usageMetadata: response.usageMetadata };
    } catch (e) { return null; }
  },

  async *translateToVietnameseStream(content: string) {
    const prompt = `Hãy dịch đoạn văn sau sang tiếng Việt một cách mượt mà, văn chương, phù hợp với phong cách tiểu thuyết. Giữ nguyên các danh từ riêng nếu cần thiết hoặc dịch chúng sao cho hay nhất. [VĂN BẢN]: ${content.substring(0, 10000)}`;
    const stream = safeGenerateContentStream({ 
        model: getFlash(), 
        contents: [{ parts: [{ text: prompt }] }],
        config: { temperature: 0.3 }
    });
    for await (const chunk of stream) {
      yield chunk;
    }
  },

  async generateVideo(summary: string, genre: string, apiKey?: string): Promise<string | null> {
    const key = apiKey || getApiKey();
    const videoAi = createGenAI(key);
    let operation = await videoAi.models.generateVideos({
      model: MODEL_VEO,
      prompt: `Cinematic trailer for a ${genre} story: ${summary}. High quality, atmospheric.`,
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
    });
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await videoAi.operations.getVideosOperation({ operation: operation });
    }
    const link = operation.response?.generatedVideos?.[0]?.video?.uri;
    return link ? `${link}&key=${key}` : null;
  },

  getKeyCooldownStatus,
  clearKeyCooldown,
  clearAllCooldowns,
  markKeyRateLimited
};
