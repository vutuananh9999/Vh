
import { GoogleGenAI, GenerateContentResponse, Type, HarmCategory, HarmBlockThreshold, ThinkingLevel } from "@google/genai";
import { Character, ChatMessage, Story, Chapter, ExtractionCategory, WebInspiration, WritingDNA } from "../types.ts";
import { promptBuilderService, ORIGINAL_FIDELITY_PROTOCOL, formatSmartChapterContext, sampleManuscript } from "./promptBuilderService.ts";
import { tokenTracker } from "./tokenTracker.ts";
import { plotDebugLogger, PlotDebugLogItem } from "./plotDebugLogger.ts";
import { requestThrottleService } from "./requestThrottleService.ts";
import { externalProviderService } from "./externalProviderService.ts";

let lastKeyIndex = 0;
let lastLoggedKey = "";

// Map to track keys that are temporarily rate-limited (cooling down)
const keyCooldowns = new Map<string, number>();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isKeyCoolingDown(key: string, model?: string): boolean {
  if (!key) return false;
  const cleanK = cleanKey(key);
  if (model) {
    const modelExp = keyCooldowns.get(`${cleanK}:${model}`);
    if (modelExp && Date.now() < modelExp) return true;
  }
  const generalExp = keyCooldowns.get(cleanK);
  if (generalExp && Date.now() < generalExp) return true;
  return false;
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

function markKeyRateLimited(key: string, cooldownMs: number = 25000, model?: string) {
  if (!key) return;
  const cleanK = cleanKey(key);
  if (model) {
    keyCooldowns.set(`${cleanK}:${model}`, Date.now() + cooldownMs);
  } else {
    keyCooldowns.set(cleanK, Date.now() + cooldownMs);
  }
  const masked = `${cleanK.slice(0, 6)}...${cleanK.slice(-4)}`;
  console.warn(`[Network Layer API Key Rotation] API Key (${masked}) trên model (${model || 'chung'}) đã chạm 429. Hồi chiêu ${cooldownMs / 1000}s.`);
}

function markKeyTransientFailure(key: string, cooldownMs: number = 12000, model?: string) {
  if (!key) return;
  const cleanK = cleanKey(key);
  if (model) {
    keyCooldowns.set(`${cleanK}:${model}`, Date.now() + cooldownMs);
  } else {
    keyCooldowns.set(cleanK, Date.now() + cooldownMs);
  }
  const masked = `${cleanK.slice(0, 6)}...${cleanK.slice(-4)}`;
  console.warn(`[Network Layer API Key Rotation] API Key (${masked}) trên model (${model || 'chung'}) gặp 503/tạm gián đoạn. Tạm nghỉ ${cooldownMs / 1000}s để xoay key.`);
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
  const envKey = (typeof process !== 'undefined' && process.env && (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY))
    || (typeof import.meta !== 'undefined' && (import.meta as any).env && ((import.meta as any).env.VITE_GEMINI_API_KEY || (import.meta as any).env.GEMINI_API_KEY))
    || '';

  if (typeof window === 'undefined') {
    return envKey ? [envKey] : [];
  }
  const stored = localStorage.getItem('aetheria_api_key') || '';
  const userKeys = extractKeys(stored);
  if (userKeys.length > 0) {
    return userKeys;
  }
  return envKey ? [envKey] : [];
}

function getApiKey(rotate: boolean = false): string {
  const keys = getAllKeys();
  if (keys.length === 0) {
    const sysKey = (typeof process !== 'undefined' && process.env && (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY)) || '';
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

export function sanitizeModelText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/gi, '')
    .trim();
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

function extractHttpStatusCode(err: any): number | null {
  if (!err) return null;
  const direct = err.status ?? err.code ?? err.statusCode ?? err.error?.status ?? err.error?.code;
  if (typeof direct === 'number' && direct >= 400 && direct < 600) return direct;
  const msg = String(err?.message || '');
  const match = msg.match(/\b(500|502|503|504|429|404|403|401|400)\b/);
  return match ? Number(match[1]) : null;
}

function isTransientServerError(err: any): boolean {
  if (!err) return false;
  const status = extractHttpStatusCode(err);
  if (status === 503 || status === 502 || status === 504 || status === 500) {
    return true;
  }

  let errMsg = err?.message ? String(err.message) : '';
  try {
    errMsg += ' ' + JSON.stringify(err);
  } catch {
    errMsg += ' ' + String(err);
  }
  errMsg = errMsg.toLowerCase();

  return (
    errMsg.includes('503') ||
    errMsg.includes('service unavailable') ||
    errMsg.includes('high demand') ||
    errMsg.includes('overloaded') ||
    errMsg.includes('temporarily unavailable') ||
    errMsg.includes('unavailable') ||
    errMsg.includes('502') ||
    errMsg.includes('bad gateway') ||
    errMsg.includes('504') ||
    errMsg.includes('gateway timeout') ||
    errMsg.includes('500') ||
    errMsg.includes('internal error') ||
    errMsg.includes('deadline_exceeded') ||
    errMsg.includes('failed to fetch') ||
    errMsg.includes('networkerror') ||
    errMsg.includes('network request failed') ||
    errMsg.includes('econnreset') ||
    errMsg.includes('etimedout') ||
    errMsg.includes('timeout')
  );
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
    apiKey: apiKey
  });
}

async function withAbortTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  externalSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });
    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

let proModelFailed = false;
let proModelFailedUntil = 0;

const DEFAULT_FLASH_MODEL = 'gemini-4-hydrogen';
const DEFAULT_PRO_MODEL = 'gemini-4-argon';

const VALID_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-pro',
  'gemini-3.6-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
]);

function normalizeModel(modelName: string | null | undefined, fallback: string): string {
  if (!modelName) return fallback;
  const clean = modelName.trim().toLowerCase();
  if (VALID_MODELS.has(clean)) return clean;
  if (clean.includes('hydrogen') || (clean.includes('4') && !clean.includes('argon') && !clean.includes('carbon'))) return 'gemini-4-hydrogen';
  if (clean.includes('argon')) return 'gemini-4-argon';
  if (clean.includes('carbon')) return 'gemini-4-carbon';
  if (clean.includes('3.8')) return 'gemini-3.8-flash';
  if (clean.includes('3.7')) return 'gemini-3.7-flash';
  if (clean.includes('3.6') && clean.includes('pro')) return 'gemini-3.6-pro';
  if (clean.includes('3.6')) return 'gemini-3.6-flash';
  if (clean.includes('3.1') && clean.includes('pro')) return 'gemini-3.1-pro-preview';
  if (clean.includes('3.1') && (clean.includes('lite') || clean.includes('flash'))) return 'gemini-3.1-flash-lite';
  if (clean.includes('2.5') && clean.includes('lite')) return 'gemini-2.5-flash-lite';
  if (clean.includes('2.5') && clean.includes('pro')) return 'gemini-3.1-pro-preview';
  if (clean.includes('2.5')) return 'gemini-2.5-flash';
  if (clean.includes('latest')) return 'gemini-flash-latest';
  if (clean.includes('2.0')) return 'gemini-2.5-flash';
  if (clean.includes('pro')) return 'gemini-4-argon';
  return fallback;
}

const getFlash = () => normalizeModel(localStorage.getItem('aetheria_model_flash'), DEFAULT_FLASH_MODEL);
const getPro = () => {
  if (proModelFailed || Date.now() < proModelFailedUntil) {
    return getFlash();
  }
  return normalizeModel(localStorage.getItem('aetheria_model_pro'), DEFAULT_PRO_MODEL);
};

function getModelCascade(requestedModel: string): string[] {
  const normalized = normalizeModel(requestedModel, getFlash());
  const allProModels = [
    'gemini-4-argon',
    'gemini-4-carbon',
    'gemini-3.1-pro-preview',
    'gemini-3.6-pro',
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite'
  ];
  const allFlashModels = [
    'gemini-4-hydrogen',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.6-flash'
  ];

  if (normalized.includes('pro') || normalized.includes('argon') || normalized.includes('carbon')) {
    return Array.from(new Set([normalized, ...allProModels]));
  }
  return Array.from(new Set([normalized, ...allFlashModels]));
}

function cleanConfigForModel(config: any, targetModel: string): any {
  if (!config) return config;
  const newConfig = { ...config };
  delete newConfig._debugLogId;
  delete newConfig._debugMeta;
  const isGemini4 = targetModel.startsWith('gemini-4-');

  if (isGemini4) {
    delete newConfig.temperature;
    delete newConfig.topP;
    delete newConfig.topK;
    delete newConfig.candidateCount;

    if (newConfig.thinkingConfig) {
      const budget = newConfig.thinkingConfig.thinkingBudget;
      const existingLevel = newConfig.thinkingConfig.thinkingLevel;
      let nextLevel: ThinkingLevel | undefined = existingLevel;

      if (!nextLevel && typeof budget === 'number') {
        if (budget <= 512) nextLevel = ThinkingLevel.LOW;
        else if (budget <= 1500) nextLevel = ThinkingLevel.MEDIUM;
        else nextLevel = ThinkingLevel.HIGH;
      }

      if (nextLevel === ThinkingLevel.MINIMAL) {
        nextLevel = ThinkingLevel.LOW;
      }

      if (nextLevel) {
        newConfig.thinkingConfig = { thinkingLevel: nextLevel };
      } else {
        delete newConfig.thinkingConfig;
      }
    }
    return newConfig;
  }

  const supportsThinking =
    targetModel.includes('3.8') ||
    targetModel.includes('3.7') ||
    targetModel.includes('3.6-pro') ||
    targetModel.includes('3.1-pro');
  if (!supportsThinking && newConfig.thinkingConfig) {
    delete newConfig.thinkingConfig;
  }
  return newConfig;
}

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
    console.warn(`Model Pro (${modelId}) không được cấp quyền (403 PERMISSION_DENIED). Tự động chuyển đổi sang Flash.`);
    proModelFailed = true;
  }

  const isQuota = isQuotaError(err) || msg.includes("429") || msg.toLowerCase().includes("resource_exhausted") || msg.toLowerCase().includes("quota exceeded") || msg.toLowerCase().includes("rate_limit");
  if (isQuota) {
    return new Error(
      `Lỗi 429 (Hạn mức Tần suất Google Free Tier): Toàn bộ API Key hoặc Model (${modelId || 'Gemini'}) đang trong thời gian hạ nhiệt.\n\n• Hãy chờ 30-60 giây để Google giải phóng hạn mức.\n• Hoặc chuyển sang 'gemini-4-hydrogen' / 'gemini-3.1-flash-lite' trong Cài đặt ⚙️ để nhận hạn mức cao hơn.\n• Lưu ý: Các Key tạo trong cùng 1 Google Cloud Project dùng chung 1 hạn mức 15 RPM. Tạo Key từ tài khoản Google khác để nhân đôi hạn mức.`
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
    const keyUsed = getApiKey(false);
    const maskKey = keyUsed 
      ? `${keyUsed.slice(0, 6)}...${keyUsed.slice(-4)}` 
      : "Không tìm thấy";
      
    return new Error(
      `Lỗi xác thực API Key của Gemini (${maskKey}). Vui lòng kiểm tra lại API Key trong 'Cài đặt Toàn cầu' (icon bánh răng). Chi tiết: ${msg}`
    );
  }
  
  if (isTransientServerError(err)) {
    const code = extractHttpStatusCode(err) || 503;
    return new Error(
      `Lỗi máy chủ AI (${code} / Quá tải tạm thời): Hệ thống đã giữ nguyên model (${modelId || 'Gemini'}) và xoay vòng qua toàn bộ API Key khả dụng nhưng máy chủ hiện đang bận.\n\n• Vui lòng thử lại sau vài giây.`
    );
  }

  return err instanceof Error ? err : new Error(msg);
}

function extractDebugText(payload: any): string {
  if (!payload) return "";
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    return payload
      .map(item => extractDebugText(item))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') return payload.text;
    if (typeof payload.message === 'string') return payload.message;
    if (Array.isArray(payload.parts)) return extractDebugText(payload.parts);
    if (payload.contents) return extractDebugText(payload.contents);
  }
  return "";
}

function mapQueueJobTypeToDebugType(
  jobType: string | undefined,
  title: string,
  mode: 'generate' | 'stream' | 'chat'
): PlotDebugLogItem['type'] {
  const lower = title.toLowerCase();
  if (lower.includes('quét') || lower.includes('tri thức') || lower.includes('thực thể') || lower.includes('nhân vật')) {
    return 'entity_scan';
  }
  if (lower.includes('kiểm toán') || lower.includes('audit') || lower.includes('từ vựng')) {
    return 'audit';
  }
  if (lower.includes('tóm tắt') || lower.includes('summary')) {
    return 'chapter_summary';
  }
  if (jobType === 'plot_chat' || mode === 'chat') return 'plot_chat';
  if (jobType === 'plot_analysis') return 'plot_analysis';
  if (jobType === 'chapter_summary') return 'chapter_summary';
  if (jobType === 'content_gen') return 'content_gen';
  return mode === 'stream' ? 'content_gen' : 'system_diagnostic';
}

function inferDebugContext(
  params: any,
  mode: 'generate' | 'stream' | 'chat',
  sendParams?: any
): {
  type: PlotDebugLogItem['type'];
  title: string;
  message: string;
  systemInstruction: string;
  historyTurns: number;
} {
  const explicitMeta = params?.config?._debugMeta;
  const activeJob = requestThrottleService.getLatestRunningJob();
  const sysText = extractDebugText(params?.config?.systemInstruction);
  const rawMessage = sendParams
    ? extractDebugText(sendParams?.message ?? sendParams)
    : extractDebugText(params?.contents);

  let title = explicitMeta?.title || activeJob?.name || '';
  if (!title) {
    const taskMatch = (rawMessage || sysText).match(/\[(?:NHIỆM VỤ|TÁC VỤ|TASK)[:\s]+([^\]]+)\]/i);
    if (taskMatch?.[1]) {
      title = taskMatch[1].trim().slice(0, 70);
    } else if (mode === 'chat') {
      title = `AI Chat: ${rawMessage.slice(0, 40) || 'Hội thoại'}`;
    } else if (mode === 'stream') {
      title = `Stream AI: ${rawMessage.slice(0, 40) || 'Sáng tác / Chỉnh sửa'}`;
    } else {
      title = `Yêu cầu AI: ${rawMessage.slice(0, 40) || 'Xử lý tác vụ'}`;
    }
  }

  const type: PlotDebugLogItem['type'] =
    explicitMeta?.type || mapQueueJobTypeToDebugType(activeJob?.type, title, mode);

  const historyTurns = Array.isArray(params?.history) ? params.history.length : 0;

  return {
    type,
    title,
    message: rawMessage.length > 15000 ? rawMessage.slice(0, 15000) + '\n... [Đã cắt bớt hiển thị log]' : rawMessage,
    systemInstruction: sysText,
    historyTurns
  };
}

function extractChunkTextSafe(chunk: any): string {
  if (!chunk) return "";
  try {
    const raw = chunk.text;
    if (typeof raw === 'string' && raw !== 'undefined' && raw !== 'null') {
      return raw;
    }
  } catch {
    // ignore getter error
  }
  const parts = chunk?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((p: any) => p && typeof p.text === 'string' && !p.thought)
      .map((p: any) => p.text)
      .join('');
  }
  return "";
}

function resolveTaskTier(requestedModel: string): 'pro' | 'flash' {
  const lower = (requestedModel || '').toLowerCase();
  if (lower.includes('pro') || lower.includes('argon') || lower.includes('carbon')) {
    return 'pro';
  }
  return 'flash';
}

class DynamicAI {
  get models() {
    return {
      generateContent: async (params: any) => {
        const keys = getAllKeys();
        const keysCount = Math.max(1, keys.length);
        const requestedModel = params.model || getFlash();
        const modelCascade = getModelCascade(requestedModel);
        let lastErr: any = null;

        const externalLogId: string | undefined = params?.config?._debugLogId;
        const dbgCtx = inferDebugContext(params, 'generate');
        const initialCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
        const initialKey = keys.length > 0 ? keys[initialCursor] : getApiKey();
        const ownsLog = !externalLogId;
        const logId = externalLogId || plotDebugLogger.startLog({
          type: dbgCtx.type,
          title: dbgCtx.title,
          model: requestedModel,
          apiKey: initialKey,
          keyIndex: initialCursor + 1,
          totalKeys: keysCount,
          keySource: keys.length > 0 ? 'localStorage' : 'env',
          systemInstruction: dbgCtx.systemInstruction,
          message: dbgCtx.message,
          historyTurns: dbgCtx.historyTurns,
          currentPhase: `Đang khởi tạo request tới ${requestedModel}...`
        });

        let attemptCounter = 0;

        try {
          const extProfiles = externalProviderService.getCandidateProfilesForTask(resolveTaskTier(requestedModel));
          if (extProfiles.length > 0) {
            try {
              return await externalProviderService.executeWithPool(extProfiles, params, {
                logId,
                ownsLog,
                extractText: extractResponseText
              });
            } catch (extErr: any) {
              const routing = externalProviderService.getRoutingConfig();
              if (!routing.fallbackToGemini || keys.length === 0) {
                throw extErr;
              }
              plotDebugLogger.updateAttempt(logId, {
                model: requestedModel,
                phase: `Key ngoài gặp lỗi (${String(extErr?.message || extErr).slice(0, 60)}) — tự động dự phòng về Gemini...`
              });
            }
          }

          for (let mIdx = 0; mIdx < modelCascade.length; mIdx++) {
            const currentModelId = modelCascade[mIdx];
            const isFirstModel = mIdx === 0;
            let currentParams = {
              ...params,
              model: currentModelId,
              config: cleanConfigForModel(params.config, currentModelId)
            };

            const startCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
            const maxPassAttempts = keys.length === 1 ? 2 : keysCount;
            let triedAnyOnModel = false;
            let modelUnavailable = false;

            for (let attempt = 0; attempt < maxPassAttempts; attempt++) {
              if (keys.length === 1 && attempt > 0) {
                plotDebugLogger.updateAttempt(logId, {
                  model: currentModelId,
                  phase: `Chỉ có 1 Key — chờ 1s thử lại trên ${currentModelId}...`
                });
                await sleep(1000);
              }

              const keyIdx = keys.length > 0 ? (startCursor + attempt) % keys.length : 0;
              const key = keys.length > 0 ? keys[keyIdx] : getApiKey();

              // On first pass skip keys in cooldown; if every key was cooling on primary model, force-try at the end
              const cooling = isKeyCoolingDown(key, currentModelId);
              if (cooling && !(isFirstModel && !triedAnyOnModel && attempt === maxPassAttempts - 1)) {
                continue;
              }

              triedAnyOnModel = true;
              if (keys.length > 0) {
                lastKeyIndex = (keyIdx + 1) % keys.length;
              }

              attemptCounter++;
              plotDebugLogger.updateAttempt(logId, {
                model: currentModelId,
                apiKey: key,
                keyIndex: keyIdx + 1,
                totalKeys: keysCount,
                status: 'pending',
                attemptCount: attemptCounter,
                phase: `Đang gọi ${currentModelId} (Key #${keyIdx + 1}/${keysCount})...`
              });

              const rawModels = createGenAI(key).models;
              const reqId = tokenTracker.recordRequestStart(currentModelId, 1000, key);

              try {
                const res = await rawModels.generateContent(currentParams);
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
                if (ownsLog) {
                  plotDebugLogger.completeSuccess(logId, {
                    fullResponse: extractResponseText(res),
                    usageMetadata: res?.usageMetadata
                  });
                }
                return res;
              } catch (err: any) {
                tokenTracker.recordRequestFailure(reqId);
                lastErr = err;

                if (isQuotaError(err)) {
                  markKeyRateLimited(key, 25000, currentModelId);
                  plotDebugLogger.updateAttempt(logId, {
                    status: 'rate_limit_429',
                    phase: `Key #${keyIdx + 1}/${keysCount} chạm 429 trên ${currentModelId} — xoay Key tiếp theo...`
                  });
                  continue;
                }

                if (isTransientServerError(err)) {
                  const errCode = extractHttpStatusCode(err) || 503;
                  markKeyTransientFailure(key, 12000, currentModelId);
                  plotDebugLogger.updateAttempt(logId, {
                    phase: `Key #${keyIdx + 1}/${keysCount} gặp ${errCode}/quá tải trên ${currentModelId} — xoay Key tiếp theo...`
                  });
                  continue;
                }

                const msg = err?.message || String(err);
                const is403 = msg.includes("403") || msg.includes("PERMISSION_DENIED");
                const hasSearch = currentParams.config?.tools?.some((t: any) => t.googleSearch);

                if (is403 && hasSearch) {
                  currentParams.config = stripGoogleSearch(currentParams.config);
                  plotDebugLogger.updateAttempt(logId, {
                    phase: `Bỏ Google Search Grounding trên ${currentModelId} và thử lại...`
                  });
                  try {
                    const res = await rawModels.generateContent(currentParams);
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
                    if (ownsLog) {
                      plotDebugLogger.completeSuccess(logId, {
                        fullResponse: extractResponseText(res),
                        usageMetadata: res?.usageMetadata
                      });
                    }
                    return res;
                  } catch (retryErr: any) {
                    lastErr = retryErr;
                    if (isQuotaError(retryErr)) {
                      markKeyRateLimited(key, 25000, currentModelId);
                      continue;
                    }
                    if (isTransientServerError(retryErr)) {
                      markKeyTransientFailure(key, 12000, currentModelId);
                      continue;
                    }
                  }
                }

                if (
                  msg.includes("404") ||
                  msg.includes("not found") ||
                  msg.includes("NOT_FOUND") ||
                  (is403 && !hasSearch)
                ) {
                  modelUnavailable = true;
                  plotDebugLogger.updateAttempt(logId, {
                    phase: `Model ${currentModelId} không khả dụng — chuyển model dự phòng...`
                  });
                  console.warn(`Model ${currentModelId} không khả dụng hoặc không có quyền trên endpoint (${msg.slice(0, 80)}), chuyển sang model kế tiếp...`);
                  break;
                }

                if (msg.includes("API key") || msg.includes("API_KEY_INVALID")) {
                  markKeyTransientFailure(key, 60000);
                  plotDebugLogger.updateAttempt(logId, {
                    phase: `Key #${keyIdx + 1}/${keysCount} không hợp lệ — xoay sang Key tiếp theo...`
                  });
                  continue;
                }

                throw handleApiError(err, currentModelId);
              }
            }

            // Keep the exact requested model; only step down cascade if the model endpoint itself returned 404/403
            if (!modelUnavailable) {
              break;
            }
          }

          throw handleApiError(lastErr || new Error('Toàn bộ API Key đều đang trong thời gian hạ nhiệt.'), requestedModel);
        } catch (fatalErr: any) {
          if (ownsLog) {
            plotDebugLogger.recordFailure(logId, fatalErr);
          }
          throw fatalErr;
        }
      },

      generateContentStream: async function* (params: any) {
        const keys = getAllKeys();
        const keysCount = Math.max(1, keys.length);
        const requestedModel = params.model || getFlash();
        const modelCascade = getModelCascade(requestedModel);
        let lastErr: any = null;

        const externalLogId: string | undefined = params?.config?._debugLogId;
        const dbgCtx = inferDebugContext(params, 'stream');
        const initialCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
        const initialKey = keys.length > 0 ? keys[initialCursor] : getApiKey();
        const ownsLog = !externalLogId;
        const logId = externalLogId || plotDebugLogger.startLog({
          type: dbgCtx.type,
          title: dbgCtx.title,
          model: requestedModel,
          apiKey: initialKey,
          keyIndex: initialCursor + 1,
          totalKeys: keysCount,
          keySource: keys.length > 0 ? 'localStorage' : 'env',
          systemInstruction: dbgCtx.systemInstruction,
          message: dbgCtx.message,
          historyTurns: dbgCtx.historyTurns,
          currentPhase: `Đang mở luồng Stream tới ${requestedModel}...`
        });

        let attemptCounter = 0;

        try {
          const extProfiles = externalProviderService.getCandidateProfilesForTask(resolveTaskTier(requestedModel));
          if (extProfiles.length > 0) {
            let extYielded = false;
            try {
              for await (const chunk of externalProviderService.executeStreamWithPool(extProfiles, params, {
                logId,
                ownsLog
              })) {
                extYielded = true;
                yield chunk as GenerateContentResponse;
              }
              return;
            } catch (extErr: any) {
              const routing = externalProviderService.getRoutingConfig();
              if (extYielded || !routing.fallbackToGemini || keys.length === 0) {
                throw extErr;
              }
              plotDebugLogger.updateAttempt(logId, {
                model: requestedModel,
                phase: `Stream Key ngoài lỗi — tự động dự phòng về Gemini...`
              });
            }
          }

          for (let mIdx = 0; mIdx < modelCascade.length; mIdx++) {
            const currentModelId = modelCascade[mIdx];
            const isFirstModel = mIdx === 0;
            let currentParams = {
              ...params,
              model: currentModelId,
              config: cleanConfigForModel(params.config, currentModelId)
            };

            const startCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
            const maxPassAttempts = keys.length === 1 ? 2 : keysCount;
            let triedAnyOnModel = false;
            let modelUnavailable = false;

            for (let attempt = 0; attempt < maxPassAttempts; attempt++) {
              if (keys.length === 1 && attempt > 0) {
                plotDebugLogger.updateAttempt(logId, {
                  model: currentModelId,
                  phase: `Chỉ có 1 Key — chờ 1s thử lại stream trên ${currentModelId}...`
                });
                await sleep(1000);
              }

              const keyIdx = keys.length > 0 ? (startCursor + attempt) % keys.length : 0;
              const key = keys.length > 0 ? keys[keyIdx] : getApiKey();

              const cooling = isKeyCoolingDown(key, currentModelId);
              if (cooling && !(isFirstModel && !triedAnyOnModel && attempt === maxPassAttempts - 1)) {
                continue;
              }

              triedAnyOnModel = true;
              if (keys.length > 0) {
                lastKeyIndex = (keyIdx + 1) % keys.length;
              }

              attemptCounter++;
              plotDebugLogger.updateAttempt(logId, {
                model: currentModelId,
                apiKey: key,
                keyIndex: keyIdx + 1,
                totalKeys: keysCount,
                status: 'pending',
                attemptCount: attemptCounter,
                phase: `Đang mở Stream ${currentModelId} (Key #${keyIdx + 1}/${keysCount})...`
              });

              const rawModels = createGenAI(key).models;
              const reqId = tokenTracker.recordRequestStart(currentModelId, 1000, key);

              try {
                const stream = await rawModels.generateContentStream(currentParams);
                let finalMetadata: any = null;
                let yieldedAny = false;
                let fullAccumulated = "";

                try {
                  for await (const chunk of stream) {
                    yieldedAny = true;
                    if (chunk && chunk.usageMetadata) {
                      finalMetadata = chunk.usageMetadata;
                    }
                    const chunkText = extractChunkTextSafe(chunk);
                    if (chunkText) {
                      fullAccumulated += chunkText;
                      if (ownsLog) {
                        plotDebugLogger.updateStreaming(logId, chunkText);
                      }
                    }
                    yield chunk as GenerateContentResponse;
                  }
                } catch (streamErr: any) {
                  if (!yieldedAny && isQuotaError(streamErr)) {
                    markKeyRateLimited(key, 25000, currentModelId);
                    tokenTracker.recordRequestFailure(reqId);
                    lastErr = streamErr;
                    plotDebugLogger.updateAttempt(logId, {
                      status: 'rate_limit_429',
                      phase: `Stream chạm 429 trên Key #${keyIdx + 1}/${keysCount} — xoay Key...`
                    });
                    continue;
                  }
                  if (!yieldedAny && isTransientServerError(streamErr)) {
                    const errCode = extractHttpStatusCode(streamErr) || 503;
                    markKeyTransientFailure(key, 12000, currentModelId);
                    tokenTracker.recordRequestFailure(reqId);
                    lastErr = streamErr;
                    plotDebugLogger.updateAttempt(logId, {
                      phase: `Stream gặp ${errCode}/quá tải trên Key #${keyIdx + 1}/${keysCount} — xoay Key...`
                    });
                    continue;
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
                if (ownsLog) {
                  plotDebugLogger.completeSuccess(logId, {
                    fullResponse: fullAccumulated,
                    usageMetadata: finalMetadata
                  });
                }
                return; // Succeeded!
              } catch (err: any) {
                tokenTracker.recordRequestFailure(reqId);
                lastErr = err;

                if (isQuotaError(err)) {
                  markKeyRateLimited(key, 25000, currentModelId);
                  plotDebugLogger.updateAttempt(logId, {
                    status: 'rate_limit_429',
                    phase: `Key #${keyIdx + 1}/${keysCount} chạm 429 trên ${currentModelId} — xoay Key...`
                  });
                  continue;
                }

                if (isTransientServerError(err)) {
                  const errCode = extractHttpStatusCode(err) || 503;
                  markKeyTransientFailure(key, 12000, currentModelId);
                  plotDebugLogger.updateAttempt(logId, {
                    phase: `Key #${keyIdx + 1}/${keysCount} gặp ${errCode}/quá tải trên ${currentModelId} — xoay Key...`
                  });
                  continue;
                }

                const msg = err?.message || String(err);
                const is403 = msg.includes("403") || msg.includes("PERMISSION_DENIED");
                const hasSearch = currentParams.config?.tools?.some((t: any) => t.googleSearch);

                if (is403 && hasSearch) {
                  currentParams.config = stripGoogleSearch(currentParams.config);
                  try {
                    const stream = await rawModels.generateContentStream(currentParams);
                    let finalMetadata: any = null;
                    let retryAccumulated = "";
                    for await (const chunk of stream) {
                      if (chunk && chunk.usageMetadata) {
                        finalMetadata = chunk.usageMetadata;
                      }
                      const chunkText = extractChunkTextSafe(chunk);
                      if (chunkText) {
                        retryAccumulated += chunkText;
                        if (ownsLog) {
                          plotDebugLogger.updateStreaming(logId, chunkText);
                        }
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
                    if (ownsLog) {
                      plotDebugLogger.completeSuccess(logId, {
                        fullResponse: retryAccumulated,
                        usageMetadata: finalMetadata
                      });
                    }
                    return;
                  } catch (retryErr: any) {
                    lastErr = retryErr;
                    if (isQuotaError(retryErr)) {
                      markKeyRateLimited(key, 25000, currentModelId);
                      continue;
                    }
                    if (isTransientServerError(retryErr)) {
                      markKeyTransientFailure(key, 12000, currentModelId);
                      continue;
                    }
                  }
                }

                if (
                  msg.includes("404") ||
                  msg.includes("not found") ||
                  msg.includes("NOT_FOUND") ||
                  (is403 && !hasSearch)
                ) {
                  modelUnavailable = true;
                  plotDebugLogger.updateAttempt(logId, {
                    phase: `Stream ${currentModelId} không khả dụng — chuyển model dự phòng...`
                  });
                  console.warn(`Model ${currentModelId} không khả dụng trên stream, thử model tiếp theo...`);
                  break;
                }

                if (msg.includes("API key") || msg.includes("API_KEY_INVALID")) {
                  markKeyTransientFailure(key, 60000);
                  plotDebugLogger.updateAttempt(logId, {
                    phase: `Key #${keyIdx + 1}/${keysCount} không hợp lệ — xoay Key...`
                  });
                  continue;
                }

                throw handleApiError(err, currentModelId);
              }
            }

            if (!modelUnavailable) {
              break;
            }
          }

          throw handleApiError(lastErr || new Error('Toàn bộ API Key đều đang trong thời gian hạ nhiệt.'), requestedModel);
        } catch (fatalErr: any) {
          if (ownsLog) {
            plotDebugLogger.recordFailure(logId, fatalErr);
          }
          throw fatalErr;
        }
      },

      embedContent: async (params: any) => {
        const keys = getAllKeys();
        const keysCount = Math.max(1, keys.length);
        const startCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
        let lastErr: any = null;

        for (let attempt = 0; attempt < keysCount; attempt++) {
          const keyIdx = keys.length > 0 ? (startCursor + attempt) % keys.length : 0;
          const key = keys.length > 0 ? keys[keyIdx] : getApiKey();
          if (keys.length > 0) lastKeyIndex = (keyIdx + 1) % keys.length;
          const rawModels = createGenAI(key).models;
          try {
            return await rawModels.embedContent(params);
          } catch (err: any) {
            lastErr = err;
            if (isQuotaError(err)) {
              markKeyRateLimited(key);
              if (attempt < keysCount - 1) {
                console.warn(`[Network Layer Embed Rotation] Key #${keyIdx + 1} chạm 429. Tự động xoay sang Key tiếp theo...`);
                continue;
              }
            }
            if (isTransientServerError(err)) {
              markKeyTransientFailure(key, 12000);
              if (attempt < keysCount - 1) {
                console.warn(`[Network Layer Embed Rotation] Key #${keyIdx + 1} gặp 503/quá tải. Tự động xoay sang Key tiếp theo...`);
                continue;
              }
            }
            throw handleApiError(err);
          }
        }
        throw handleApiError(lastErr);
      },

      generateVideos: async (params: any) => {
        const keys = getAllKeys();
        const keysCount = Math.max(1, keys.length);
        const startCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
        let lastErr: any = null;

        for (let attempt = 0; attempt < keysCount; attempt++) {
          const keyIdx = keys.length > 0 ? (startCursor + attempt) % keys.length : 0;
          const key = keys.length > 0 ? keys[keyIdx] : getApiKey();
          if (keys.length > 0) lastKeyIndex = (keyIdx + 1) % keys.length;
          const rawModels = createGenAI(key).models;
          try {
            return await rawModels.generateVideos(params);
          } catch (err: any) {
            lastErr = err;
            if (isQuotaError(err)) {
              markKeyRateLimited(key);
              if (attempt < keysCount - 1) {
                console.warn(`[Network Layer Video Rotation] Key #${keyIdx + 1} chạm 429. Tự động xoay sang Key tiếp theo...`);
                continue;
              }
            }
            if (isTransientServerError(err)) {
              markKeyTransientFailure(key, 12000);
              if (attempt < keysCount - 1) {
                console.warn(`[Network Layer Video Rotation] Key #${keyIdx + 1} gặp 503/quá tải. Tự động xoay sang Key tiếp theo...`);
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
        const requestedModel = params.model || getFlash();

        const wrappedSession: any = {};

        // Wrap sendMessage with round-robin 429/503 key rotation & model cascade
        wrappedSession.sendMessage = async (sendParams: any) => {
          const modelCascade = getModelCascade(requestedModel);
          const keys = getAllKeys();
          const keysCount = Math.max(1, keys.length);
          let lastErr: any = null;
          const externalLogId: string | undefined = params?.config?._debugLogId;
          const ownsLog = !externalLogId;
          const dbgCtx = inferDebugContext(params, 'chat', sendParams);
          const initialCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
          const initialKey = keys.length > 0 ? keys[initialCursor] : getApiKey();
          const logId = externalLogId || plotDebugLogger.startLog({
            type: dbgCtx.type,
            title: dbgCtx.title,
            model: requestedModel,
            apiKey: initialKey,
            keyIndex: initialCursor + 1,
            totalKeys: keysCount,
            keySource: keys.length > 0 ? 'localStorage' : 'env',
            systemInstruction: dbgCtx.systemInstruction,
            message: dbgCtx.message,
            historyTurns: dbgCtx.historyTurns,
            currentPhase: `Đang gửi tin nhắn tới ${requestedModel}...`
          });
          let attemptCounter = 0;

          try {
            const extProfiles = externalProviderService.getCandidateProfilesForTask(resolveTaskTier(requestedModel));
            if (extProfiles.length > 0) {
              try {
                return await externalProviderService.executeWithPool(extProfiles, params, {
                  logId,
                  ownsLog,
                  sendParams,
                  extractText: extractResponseText
                });
              } catch (extErr: any) {
                const routing = externalProviderService.getRoutingConfig();
                if (!routing.fallbackToGemini || keys.length === 0) {
                  throw extErr;
                }
                plotDebugLogger.updateAttempt(logId, {
                  model: requestedModel,
                  phase: `Chat Key ngoài lỗi — dự phòng về Gemini...`
                });
              }
            }

            for (let mIdx = 0; mIdx < modelCascade.length; mIdx++) {
              const currentModelId = modelCascade[mIdx];
              const isFirstModel = mIdx === 0;
              const currentParams = {
                ...params,
                model: currentModelId,
                config: cleanConfigForModel(params.config, currentModelId)
              };

              const startCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
              const maxPassAttempts = keys.length === 1 ? 2 : keysCount;
              let triedAnyOnModel = false;
              let modelUnavailable = false;

              for (let attempt = 0; attempt < maxPassAttempts; attempt++) {
                if (keys.length === 1 && attempt > 0) {
                  plotDebugLogger.updateAttempt(logId, {
                    model: currentModelId,
                    phase: `Chỉ có 1 Key — chờ 1s thử lại chat trên ${currentModelId}...`
                  });
                  await sleep(1000);
                }

                const keyIdx = keys.length > 0 ? (startCursor + attempt) % keys.length : 0;
                const key = keys.length > 0 ? keys[keyIdx] : getApiKey();

                const cooling = isKeyCoolingDown(key, currentModelId);
                if (cooling && !(isFirstModel && !triedAnyOnModel && attempt === maxPassAttempts - 1)) {
                  continue;
                }

                triedAnyOnModel = true;
                if (keys.length > 0) {
                  lastKeyIndex = (keyIdx + 1) % keys.length;
                }

                attemptCounter++;
                plotDebugLogger.updateAttempt(logId, {
                  model: currentModelId,
                  apiKey: key,
                  keyIndex: keyIdx + 1,
                  totalKeys: keysCount,
                  status: 'pending',
                  attemptCount: attemptCounter,
                  phase: `Đang gọi ${currentModelId} (Key #${keyIdx + 1}/${keysCount})...`
                });

                const rawChats = createGenAI(key).chats;
                const currentHistory = params.history || [];
                const session = rawChats.create({
                  ...currentParams,
                  history: currentHistory
                });

                const reqId = tokenTracker.recordRequestStart(currentModelId, 1000, key);
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
                  if (ownsLog) {
                    plotDebugLogger.completeSuccess(logId, {
                      fullResponse: extractResponseText(res),
                      usageMetadata: res?.usageMetadata
                    });
                  }
                  return res;
                } catch (err: any) {
                  tokenTracker.recordRequestFailure(reqId);
                  lastErr = err;

                  if (isQuotaError(err)) {
                    markKeyRateLimited(key, 25000, currentModelId);
                    plotDebugLogger.updateAttempt(logId, {
                      status: 'rate_limit_429',
                      phase: `Key #${keyIdx + 1}/${keysCount} chạm 429 — đang xoay Key...`
                    });
                    continue;
                  }

                  if (isTransientServerError(err)) {
                    const errCode = extractHttpStatusCode(err) || 503;
                    markKeyTransientFailure(key, 12000, currentModelId);
                    plotDebugLogger.updateAttempt(logId, {
                      phase: `Key #${keyIdx + 1}/${keysCount} gặp ${errCode}/quá tải trên ${currentModelId} — xoay Key...`
                    });
                    continue;
                  }

                  const msg = err?.message || String(err);
                  if (msg.includes("404") || msg.includes("not found") || msg.includes("NOT_FOUND")) {
                    modelUnavailable = true;
                    plotDebugLogger.updateAttempt(logId, {
                      phase: `Model ${currentModelId} không tồn tại — chuyển model dự phòng...`
                    });
                    console.warn(`Chat model ${currentModelId} không tồn tại, chuyển model tiếp theo trong cascade...`);
                    break;
                  }

                  if (msg.includes("API key") || msg.includes("API_KEY_INVALID")) {
                    markKeyTransientFailure(key, 60000);
                    plotDebugLogger.updateAttempt(logId, {
                      phase: `Key #${keyIdx + 1}/${keysCount} không hợp lệ — xoay Key...`
                    });
                    continue;
                  }

                  throw handleApiError(err, currentModelId);
                }
              }

              if (!modelUnavailable) {
                break;
              }
            }
            throw handleApiError(lastErr || new Error('Toàn bộ API Key đều đang trong thời gian hạ nhiệt.'), requestedModel);
          } catch (fatalErr: any) {
            if (ownsLog) {
              plotDebugLogger.recordFailure(logId, fatalErr);
            }
            throw fatalErr;
          }
        };

        // Wrap sendMessageStream with round-robin 429/503 key rotation & model cascade
        wrappedSession.sendMessageStream = async (sendParams: any) => {
          async function* runStreamWithRetry() {
            const modelCascade = getModelCascade(requestedModel);
            const keys = getAllKeys();
            const keysCount = Math.max(1, keys.length);
            let lastErr: any = null;
            const externalLogId: string | undefined = params?.config?._debugLogId;
            const ownsLog = !externalLogId;
            const dbgCtx = inferDebugContext(params, 'chat', sendParams);
            const initialCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
            const initialKey = keys.length > 0 ? keys[initialCursor] : getApiKey();
            const logId = externalLogId || plotDebugLogger.startLog({
              type: dbgCtx.type,
              title: dbgCtx.title,
              model: requestedModel,
              apiKey: initialKey,
              keyIndex: initialCursor + 1,
              totalKeys: keysCount,
              keySource: keys.length > 0 ? 'localStorage' : 'env',
              systemInstruction: dbgCtx.systemInstruction,
              message: dbgCtx.message,
              historyTurns: dbgCtx.historyTurns,
              currentPhase: `Đang kết nối Chat Stream tới ${requestedModel}...`
            });
            let attemptCounter = 0;

            try {
              const extProfiles = externalProviderService.getCandidateProfilesForTask(resolveTaskTier(requestedModel));
              if (extProfiles.length > 0) {
                let extYielded = false;
                try {
                  for await (const chunk of externalProviderService.executeStreamWithPool(extProfiles, params, {
                    logId,
                    ownsLog,
                    sendParams
                  })) {
                    extYielded = true;
                    yield chunk as GenerateContentResponse;
                  }
                  return;
                } catch (extErr: any) {
                  const routing = externalProviderService.getRoutingConfig();
                  if (extYielded || !routing.fallbackToGemini || keys.length === 0) {
                    throw extErr;
                  }
                  plotDebugLogger.updateAttempt(logId, {
                    model: requestedModel,
                    phase: `Chat Stream Key ngoài lỗi — dự phòng về Gemini...`
                  });
                }
              }

              for (let mIdx = 0; mIdx < modelCascade.length; mIdx++) {
                const currentModelId = modelCascade[mIdx];
                const isFirstModel = mIdx === 0;
                const currentParams = {
                  ...params,
                  model: currentModelId,
                  config: cleanConfigForModel(params.config, currentModelId)
                };

                const startCursor = keys.length > 0 ? lastKeyIndex % keys.length : 0;
                const maxPassAttempts = keys.length === 1 ? 2 : keysCount;
                let triedAnyOnModel = false;
                let modelUnavailable = false;

                for (let attempt = 0; attempt < maxPassAttempts; attempt++) {
                  if (keys.length === 1 && attempt > 0) {
                    plotDebugLogger.updateAttempt(logId, {
                      model: currentModelId,
                      phase: `Chỉ có 1 Key — chờ 1s thử lại chat stream trên ${currentModelId}...`
                    });
                    await sleep(1000);
                  }

                  const keyIdx = keys.length > 0 ? (startCursor + attempt) % keys.length : 0;
                  const key = keys.length > 0 ? keys[keyIdx] : getApiKey();

                  const cooling = isKeyCoolingDown(key, currentModelId);
                  if (cooling && !(isFirstModel && !triedAnyOnModel && attempt === maxPassAttempts - 1)) {
                    continue;
                  }

                  triedAnyOnModel = true;
                  if (keys.length > 0) {
                    lastKeyIndex = (keyIdx + 1) % keys.length;
                  }

                  attemptCounter++;
                  plotDebugLogger.updateAttempt(logId, {
                    model: currentModelId,
                    apiKey: key,
                    keyIndex: keyIdx + 1,
                    totalKeys: keysCount,
                    status: 'pending',
                    attemptCount: attemptCounter,
                    phase: `Đang stream Chat ${currentModelId} (Key #${keyIdx + 1}/${keysCount})...`
                  });

                  const rawChats = createGenAI(key).chats;
                  const currentHistory = params.history || [];
                  const session = rawChats.create({
                    ...currentParams,
                    history: currentHistory
                  });

                  const reqId = tokenTracker.recordRequestStart(currentModelId, 1000, key);
                  try {
                    const rawStream = await session.sendMessageStream(sendParams);
                    let finalMetadata: any = null;
                    let yieldedAny = false;
                    let fullAccumulated = "";

                    try {
                      for await (const chunk of rawStream) {
                        yieldedAny = true;
                        if (chunk && chunk.usageMetadata) {
                          finalMetadata = chunk.usageMetadata;
                        }
                        const chunkText = extractChunkTextSafe(chunk);
                        if (chunkText) {
                          fullAccumulated += chunkText;
                          if (ownsLog) {
                            plotDebugLogger.updateStreaming(logId, chunkText);
                          }
                        }
                        yield chunk as GenerateContentResponse;
                      }
                    } catch (streamErr: any) {
                      if (!yieldedAny && isQuotaError(streamErr)) {
                        markKeyRateLimited(key, 25000, currentModelId);
                        tokenTracker.recordRequestFailure(reqId);
                        lastErr = streamErr;
                        plotDebugLogger.updateAttempt(logId, {
                          status: 'rate_limit_429',
                          phase: `Chat stream chạm 429 trên Key #${keyIdx + 1}/${keysCount} — xoay Key...`
                        });
                        continue;
                      }
                      if (!yieldedAny && isTransientServerError(streamErr)) {
                        const errCode = extractHttpStatusCode(streamErr) || 503;
                        markKeyTransientFailure(key, 12000, currentModelId);
                        tokenTracker.recordRequestFailure(reqId);
                        lastErr = streamErr;
                        plotDebugLogger.updateAttempt(logId, {
                          phase: `Chat stream gặp ${errCode}/quá tải trên Key #${keyIdx + 1}/${keysCount} — xoay Key...`
                        });
                        continue;
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

                    if (ownsLog) {
                      plotDebugLogger.completeSuccess(logId, {
                        fullResponse: fullAccumulated,
                        usageMetadata: finalMetadata
                      });
                    }
                    return; // Success
                  } catch (err: any) {
                    tokenTracker.recordRequestFailure(reqId);
                    lastErr = err;

                    if (isQuotaError(err)) {
                      markKeyRateLimited(key, 25000, currentModelId);
                      plotDebugLogger.updateAttempt(logId, {
                        status: 'rate_limit_429',
                        phase: `Key #${keyIdx + 1}/${keysCount} chạm 429 — đang xoay Key...`
                      });
                      continue;
                    }

                    if (isTransientServerError(err)) {
                      const errCode = extractHttpStatusCode(err) || 503;
                      markKeyTransientFailure(key, 12000, currentModelId);
                      plotDebugLogger.updateAttempt(logId, {
                        phase: `Key #${keyIdx + 1}/${keysCount} gặp ${errCode}/quá tải trên ${currentModelId} — xoay Key...`
                      });
                      continue;
                    }

                    const msg = err?.message || String(err);
                    if (msg.includes("404") || msg.includes("not found") || msg.includes("NOT_FOUND")) {
                      modelUnavailable = true;
                      plotDebugLogger.updateAttempt(logId, {
                        phase: `Chat model ${currentModelId} không tồn tại — thử model dự phòng...`
                      });
                      console.warn(`Chat stream model ${currentModelId} không tồn tại, thử model tiếp theo...`);
                      break;
                    }

                    if (msg.includes("API key") || msg.includes("API_KEY_INVALID")) {
                      markKeyTransientFailure(key, 60000);
                      plotDebugLogger.updateAttempt(logId, {
                        phase: `Key #${keyIdx + 1}/${keysCount} không hợp lệ — xoay Key...`
                      });
                      continue;
                    }

                    throw handleApiError(err, currentModelId);
                  }
                }

                if (!modelUnavailable) {
                  break;
                }
              }
              throw handleApiError(lastErr || new Error('Toàn bộ API Key đều đang trong thời gian hạ nhiệt.'), requestedModel);
            } catch (fatalErr: any) {
              if (ownsLog) {
                plotDebugLogger.recordFailure(logId, fatalErr);
              }
              throw fatalErr;
            }
          }

          return runStreamWithRetry() as any;
        };

        return wrappedSession;
      }
    };
  }
}
const ai = new DynamicAI() as unknown as GoogleGenAI;

const MODEL_EMBEDDING = 'gemini-embedding-2';
const MODEL_VEO = 'veo-3.1-lite-generate-preview';

// Helper for safe content generation (DynamicAI handles full modelCascade + key rotation + 503 circuit breaker)
async function safeGenerateContent(params: { model: string, contents: any, config?: any }): Promise<any> {
  return ai.models.generateContent(params);
}

const CREATIVE_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];

function extractResponseText(response: any): string {
  if (!response) return "";
  try {
    const directText = response.text;
    if (typeof directText === 'string' && directText.trim().length > 0) {
      return directText;
    }
  } catch {
    // response.text getter may throw if candidate was blocked or only contains thought parts
  }

  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    const nonThoughtText = parts
      .filter((p: any) => p && typeof p.text === 'string' && !p.thought)
      .map((p: any) => p.text)
      .join('');
    if (nonThoughtText.trim().length > 0) return nonThoughtText;

    const anyText = parts
      .filter((p: any) => p && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('');
    if (anyText.trim().length > 0) return anyText;
  }

  return "";
}

function getResponseFinishReason(response: any): string {
  return (
    response?.candidates?.[0]?.finishReason ||
    response?.promptFeedback?.blockReason ||
    'UNKNOWN'
  );
}

function sanitizeJsonControlChars(str: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) {
        out += ch;
        esc = false;
      } else if (ch === '\\') {
        out += ch;
        esc = true;
      } else if (ch === '"') {
        out += ch;
        inStr = false;
      } else if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else if (ch === '\t') {
        out += '\\t';
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

function closeOpenJsonDelimiters(str: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
    } else {
      if (ch === '"') {
        inStr = true;
      } else if (ch === '{') {
        stack.push('}');
      } else if (ch === '[') {
        stack.push(']');
      } else if ((ch === '}' || ch === ']') && stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }
  let result = str;
  if (inStr) {
    if (esc) result = result.slice(0, -1);
    result += '"';
  }
  result = result.replace(/,\s*$/g, '');
  while (stack.length > 0) {
    result += stack.pop();
  }
  return result.replace(/,\s*([}\]])/g, '$1');
}

function repairTruncatedJson(candidate: string): string | null {
  let s = sanitizeJsonControlChars(candidate).trim();
  if (!s) return null;

  // Determine whether EOF occurs inside a string and whether that string is a key or value
  let inStr = false;
  let esc = false;
  let lastQuoteStart = -1;
  let lastTokenBeforeQuote = '';
  let lastStructuralCommaOrOpen = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
    } else {
      if (ch === '"') {
        inStr = true;
        lastQuoteStart = i;
        // Look backward for last non-whitespace char
        let j = i - 1;
        while (j >= 0 && /\s/.test(s[j])) j--;
        lastTokenBeforeQuote = j >= 0 ? s[j] : '';
      } else if (ch === ',' || ch === '{' || ch === '[') {
        lastStructuralCommaOrOpen = i;
      }
    }
  }

  if (inStr) {
    if (esc) s = s.slice(0, -1);
    if (lastTokenBeforeQuote === '{' || (lastTokenBeforeQuote === ',' && lastQuoteStart > 0)) {
      // Check if we are in an object expecting a key vs array element
      // Peek at the enclosing delimiter before lastQuoteStart
      const stackCheck: string[] = [];
      let str2 = false;
      let esc2 = false;
      for (let i = 0; i < lastQuoteStart; i++) {
        const c = s[i];
        if (str2) {
          if (esc2) esc2 = false;
          else if (c === '\\') esc2 = true;
          else if (c === '"') str2 = false;
        } else {
          if (c === '"') str2 = true;
          else if (c === '{' || c === '[') stackCheck.push(c);
          else if (c === '}' || c === ']') stackCheck.pop();
        }
      }
      const enclosing = stackCheck[stackCheck.length - 1];
      if (enclosing === '{') {
        // Incomplete object key -> drop back to comma or '{'
        s = s.slice(0, lastQuoteStart).replace(/,\s*$/, '');
      } else {
        s += '"';
      }
    } else {
      s += '"';
    }
  } else {
    // Strip trailing dangling colon + key, or incomplete primitive tokens
    s = s.replace(/,\s*$/, '');
    if (/:\s*$/.test(s)) {
      s = s.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, '');
    } else if (/[:,{\[]\s*[a-zA-Z0-9_.-]+$/.test(s) && !/[:,{\[]\s*(?:true|false|null|-?\d+(?:\.\d+)?)$/.test(s)) {
      if (lastStructuralCommaOrOpen >= 0) {
        const prefix = s.slice(0, lastStructuralCommaOrOpen + 1);
        s = prefix.replace(/,\s*$/, '');
      }
    }
  }

  const repaired = closeOpenJsonDelimiters(s);
  return repaired;
}

function safeJsonParse<T>(rawText: string | null | undefined, fallback: T): T {
  if (!rawText || typeof rawText !== 'string') return fallback;
  let cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();

  // Remove markdown JSON code fences (including unclosed leading fence when truncated)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!cleaned) return fallback;

  const tryParse = (str: string): T | null => {
    try {
      return JSON.parse(str) as T;
    } catch {
      try {
        const noTrailing = sanitizeJsonControlChars(str).replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(noTrailing) as T;
      } catch {
        return null;
      }
    }
  };

  const direct = tryParse(cleaned);
  if (direct !== null) return direct;

  const firstObj = cleaned.indexOf('{');
  const firstArr = cleaned.indexOf('[');
  const startIdx =
    firstObj !== -1 && (firstArr === -1 || firstObj <= firstArr)
      ? firstObj
      : firstArr;

  if (startIdx === -1) return fallback;

  const slicedFromStart = cleaned.slice(startIdx);
  const lastBrace = Math.max(slicedFromStart.lastIndexOf('}'), slicedFromStart.lastIndexOf(']'));

  if (lastBrace > 0) {
    const exactSpan = tryParse(slicedFromStart.slice(0, lastBrace + 1));
    if (exactSpan !== null) return exactSpan;
  }

  // Attempt repair of truncated JSON (e.g., cut off at MAX_TOKENS mid-object or mid-array)
  const repaired = repairTruncatedJson(slicedFromStart);
  if (repaired) {
    const parsedRepaired = tryParse(repaired);
    if (parsedRepaired !== null) return parsedRepaired;
  }

  // Last resort: cut back to the last complete `},` before truncation point and close containers
  const lastObjEnd = slicedFromStart.lastIndexOf('},');
  if (lastObjEnd > 0) {
    const trimmedToLastObj = closeOpenJsonDelimiters(slicedFromStart.slice(0, lastObjEnd + 1));
    const parsedFallback = tryParse(trimmedToLastObj);
    if (parsedFallback !== null) return parsedFallback;
  }

  return fallback;
}

async function generateAuditJsonWithFallback(
  prompt: string,
  responseSchema: any,
  debugOptions?: { _debugLogId?: string }
): Promise<any> {
  const isAuthOrQuotaError = (err: any) => {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('quá tải tạm thời') ||
      msg.includes('hạn mức') ||
      msg.includes('api key') ||
      msg.includes('api_key_invalid') ||
      msg.includes('xác thực api key')
    );
  };

  let lastResponse: any = null;
  const _debugLogId = debugOptions?._debugLogId;

  // Attempt 1: Strict responseSchema + permissive safety + generous maxOutputTokens + light thinking
  try {
    const res1 = await safeGenerateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        _debugLogId,
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2,
        maxOutputTokens: 32768,
        safetySettings: CREATIVE_SAFETY_SETTINGS,
        thinkingConfig: { thinkingBudget: 512 }
      }
    });
    lastResponse = res1;
    const text1 = extractResponseText(res1);
    const parsed1 = safeJsonParse<any>(text1, null);
    if (parsed1 && typeof parsed1 === 'object') {
      return {
        text: text1,
        usageMetadata: res1?.usageMetadata,
        candidates: res1?.candidates,
        promptFeedback: res1?.promptFeedback,
        _parsed: parsed1
      };
    }
    console.warn(
      `Attempt 1 (responseSchema) trả về JSON không hợp lệ hoặc rỗng (finishReason=${getResponseFinishReason(res1)}, len=${text1.length}). Thử fallback không schema...`
    );
  } catch (err: any) {
    if (isAuthOrQuotaError(err)) throw err;
    console.warn("Audit attempt 1 with responseSchema failed, retrying without schema...", err);
  }

  // Attempt 2: JSON mimeType WITHOUT responseSchema & WITHOUT thinkingConfig (avoids schema rejection & thinking token overhead)
  const strictJsonPrompt = `${prompt}\n\n[LƯU Ý ĐỊNH DẠNG]: CHỈ trả về DUY NHẤT 1 JSON object hợp lệ khớp các trường yêu cầu. Không thêm markdown, không lời dẫn hay giải thích.`;
  try {
    const res2 = await safeGenerateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: strictJsonPrompt }] }],
      config: {
        _debugLogId,
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 32768,
        safetySettings: CREATIVE_SAFETY_SETTINGS
      }
    });
    lastResponse = res2;
    const text2 = extractResponseText(res2);
    const parsed2 = safeJsonParse<any>(text2, null);
    if (parsed2 && typeof parsed2 === 'object') {
      return {
        text: text2,
        usageMetadata: res2?.usageMetadata,
        candidates: res2?.candidates,
        promptFeedback: res2?.promptFeedback,
        _parsed: parsed2
      };
    }
    console.warn(
      `Attempt 2 (JSON mimeType only) trả về JSON không hợp lệ (finishReason=${getResponseFinishReason(res2)}, len=${text2.length}). Thử fallback raw JSON...`
    );
  } catch (err: any) {
    if (isAuthOrQuotaError(err)) throw err;
    console.warn("Audit attempt 2 with JSON mimeType failed, retrying raw prompt...", err);
  }

  // Attempt 3: Plain text JSON generation (no responseMimeType / no safetySettings in case model/proxy rejects them)
  const res3 = await safeGenerateContent({
    model: getFlash(),
    contents: [{ parts: [{ text: strictJsonPrompt }] }],
    config: {
      _debugLogId,
      temperature: 0.15,
      maxOutputTokens: 32768
    }
  });
  const text3 = extractResponseText(res3) || extractResponseText(lastResponse);
  const parsed3 = safeJsonParse<any>(text3, null);
  return {
    text: text3,
    usageMetadata: res3?.usageMetadata || lastResponse?.usageMetadata,
    candidates: res3?.candidates || lastResponse?.candidates,
    promptFeedback: res3?.promptFeedback || lastResponse?.promptFeedback,
    _parsed: parsed3
  };
}

// Helper for safe streaming content generation (DynamicAI handles full modelCascade + key rotation + 503 circuit breaker)
async function* safeGenerateContentStream(params: { model: string, contents: any, config?: any }): AsyncGenerator<GenerateContentResponse, void, unknown> {
  const stream = await ai.models.generateContentStream(params);
  for await (const chunk of stream) {
    yield chunk as GenerateContentResponse;
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
      const modelsToTry = ["gemini-4-hydrogen", "gemini-3.1-flash-lite", "gemini-flash-latest"];

      for (const modelName of modelsToTry) {
        try {
          const response = await withAbortTimeout(
            (signal) =>
              testAI.models.generateContent({
                model: modelName,
                contents: "Hi",
                config: {
                  ...cleanConfigForModel({
                    maxOutputTokens: 32,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                  }, modelName),
                  abortSignal: signal
                } as any
              }),
            12000,
            `Quá thời gian chờ (12s) khi ping model ${modelName}.`
          );
          if (response) {
            return {
              success: true,
              message: `Kết nối thành công! API Key hoạt động hoàn hảo (${modelName}).`
            };
          }
        } catch (genErr: any) {
          console.warn(`generateContent failed during API key test (${modelName}):`, genErr);
          const msg = (genErr?.message || String(genErr)).toLowerCase();
          const is429 = msg.includes("429") || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("limit");

          if (is429) {
            return {
              success: false,
              message: "API Key đúng cấu trúc nhưng HIỆN TẠI ĐÃ HẾT HẠN MỨC HOẶC BỊ GIỚI HẠN TẦN SUẤT (Lỗi 429 Resource Exhausted/Quota Exceeded). Vui lòng thử lại sau 1-2 phút hoặc nhập thêm API Key dự phòng khác."
            };
          }

          if (msg.includes("api_key_invalid") || msg.includes("api key not valid") || msg.includes("unauthorized") || msg.includes("403")) {
            throw genErr;
          }
        }
      }

      // Phương án dự phòng: kiểm tra cấu trúc Key qua models.list() với timeout 8s
      try {
        const modelList = await withAbortTimeout(
          () => testAI.models.list(),
          8000,
          "Quá thời gian chờ (8s) khi kiểm tra models.list()."
        );
        if (modelList) {
          return {
            success: true,
            message: "Kết nối thành công! Xác thực cấu trúc API Key hợp lệ qua Model Service (hãy chú ý hạn mức tạo văn bản)."
          };
        }
      } catch (listErr: any) {
        console.warn("models.list failed:", listErr);
        throw listErr;
      }

      return {
        success: false,
        message: "Không nhận được phản hồi hợp lệ từ máy chủ Google (Timeout / Không phản hồi)."
      };
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
      const response = await safeGenerateContent({
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
      const response = await safeGenerateContent({
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
    const dnaSchema = {
      type: Type.OBJECT,
      properties: {
        narrativeVoice: { type: Type.STRING },
        vocabularyPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
        sentenceStructure: { type: Type.STRING },
        thematicElements: { type: Type.ARRAY, items: { type: Type.STRING } },
        emotionalTone: { type: Type.STRING },
        rhythm: { type: Type.STRING }
      },
      required: ["narrativeVoice", "vocabularyPalette", "sentenceStructure", "thematicElements", "emotionalTone", "rhythm"]
    };
    const response = await requestThrottleService.enqueuePromise(
      () => generateAuditJsonWithFallback(prompt, dnaSchema),
      { name: "Chiết tách Hồn Văn", type: 'plot_analysis', priority: 'normal' }
    );
    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed) throw new Error("Không thể phân tích Hồn Văn từ văn bản.");
    return { data: parsed, usageMetadata: response?.usageMetadata };
  },

  async generateStoryFoundation(seedIdea: string, genre: string): Promise<any> {
    const prompt = promptBuilderService.buildStoryFoundationPrompt(seedIdea, genre);
    const response = await safeGenerateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", temperature: 0.7 }
    });
    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed) throw new Error("Không thể khởi tạo nền tảng truyện.");
    return { data: parsed, usageMetadata: response?.usageMetadata };
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
        const response = await safeGenerateContent({
            model: getFlash(), 
            contents: [{ parts: [{ text: prompt }] }],
            config: { temperature: 0.25 } 
        });
        const resultText = response.text?.trim() || text;
        if (resultText.length < text.length * 0.75) {
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
    canonContext: string = "",
    fandomName: string = ""
  ) {
    const systemInstruction = promptBuilderService.buildSystemInstruction(
      genre, worldBible, pov, pronounStyle, writingStyle, interactionRules, negativePrompt, nsfw, hasSystem, mechanics, persistentDirectives, writingDNA
    );
    const prompt = promptBuilderService.buildForgePrompt(
      immediateContext, worldBible, planning, characters, interactionRules, userInstruction, pronounStyle, targetWordCount, persistentDirectives, mechanics, chapterOutline, verificationReport, currentChapterTime, previousChapterTime, currentTimeline, historicalContext, canonContext, genre, fandomName
    );
    const stream = safeGenerateContentStream({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        systemInstruction, 
        temperature: 0.9, 
        topP: 0.96, 
        maxOutputTokens: 65536,
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
    return requestThrottleService.enqueuePromise(async () => {
      const safeBody = sampleManuscript(content, 24000);
      const prompt = `Hãy tóm tắt đầy đủ các sự kiện quan trọng trong chương "${title}" (khoảng 180-250 từ bằng tiếng Việt). Tập trung vào: diễn biến chính, chuyển biến tâm lý/trạng thái nhân vật, địa điểm, vật phẩm hoặc manh mối mới được tiết lộ.\n\n[NỘI DUNG CHƯƠNG]:\n${safeBody}`;
      const response = await safeGenerateContent({ 
          model: getFlash(), 
          contents: [{ parts: [{ text: prompt }] }],
          config: { temperature: 0.3 }
      });
      return { text: response.text || "", usageMetadata: response.usageMetadata };
    }, {
      name: `Tóm tắt: ${title}`,
      type: 'chapter_summary',
      priority: 'normal'
    });
  },

  async generateChapterContentFromPlot(
    chapter: Chapter,
    story: Story,
    options: { repairInstruction?: string; continuityNotes?: string } = {}
  ): Promise<any> {
    return requestThrottleService.enqueuePromise(async () => {
      const prompt = promptBuilderService.buildChapterPlotWriteOrFixPrompt(chapter, story, options);
      const response = await safeGenerateContent({ 
          model: getFlash(), 
          contents: [{ parts: [{ text: prompt }] }],
          config: {
              temperature: 0.78,
              maxOutputTokens: 65536,
              thinkingConfig: { thinkingBudget: 2048 } 
          }
      });

      return { text: response.text || "", usageMetadata: response.usageMetadata };
    }, {
      name: `Soạn/Sửa thảo: ${chapter.title}`,
      type: 'content_gen',
      priority: 'normal'
    });
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
    return requestThrottleService.enqueuePromise(async () => {
      const prompt = promptBuilderService.buildPlotArcAnalysisPrompt(storyOrChapters, storyTitle);
      const activeKey = getApiKey();
      const logId = plotDebugLogger.startLog({
        type: 'plot_analysis',
        title: `Phân tích Mạch Cốt truyện (${storyTitle || 'Toàn tác phẩm'})`,
        model: getFlash(),
        apiKey: activeKey,
        keyIndex: lastKeyIndex + 1,
        totalKeys: getAvailableKeysCount(),
        keySource: 'localStorage',
        message: prompt.substring(0, 500) + '...',
        systemInstruction: 'Plot Arc JSON Analyzer'
      });

      const plotArcSchema = {
        type: Type.OBJECT,
        properties: {
          arcAnalysis: { type: Type.STRING },
          pacingHeatmap: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          unresolvedHooks: { type: Type.ARRAY, items: { type: Type.STRING } },
          futurePredictions: { type: Type.ARRAY, items: { type: Type.STRING } },
          chapterIssues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                chapterId: { type: Type.STRING },
                chapterTitle: { type: Type.STRING },
                issue: { type: Type.STRING },
                fixSuggestion: { type: Type.STRING }
              },
              required: ["chapterTitle", "issue", "fixSuggestion"]
            }
          },
          characterArcSummary: { type: Type.STRING }
        },
        required: ["arcAnalysis", "pacingHeatmap", "unresolvedHooks", "futurePredictions"]
      };

      try {
        const response = await generateAuditJsonWithFallback(prompt, plotArcSchema, { _debugLogId: logId });
        const parsed = safeJsonParse<any>(response?.text, null);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error("AI không trả về dữ liệu phân tích cốt truyện đúng định dạng JSON.");
        }

        const normalized = {
          arcAnalysis: String(parsed.arcAnalysis || "Chưa có phân tích tổng quan."),
          pacingHeatmap: Array.isArray(parsed.pacingHeatmap)
            ? parsed.pacingHeatmap.map((n: any) => Math.max(0, Math.min(100, Number(n) || 0)))
            : [],
          unresolvedHooks: Array.isArray(parsed.unresolvedHooks)
            ? parsed.unresolvedHooks.map((x: any) => String(x)).filter(Boolean)
            : [],
          futurePredictions: Array.isArray(parsed.futurePredictions)
            ? parsed.futurePredictions.map((x: any) => String(x)).filter(Boolean)
            : [],
          chapterIssues: Array.isArray(parsed.chapterIssues)
            ? parsed.chapterIssues.map((ci: any) => ({
                chapterId: ci?.chapterId ? String(ci.chapterId) : undefined,
                chapterTitle: String(ci?.chapterTitle || "Chương truyện"),
                issue: String(ci?.issue || ""),
                fixSuggestion: String(ci?.fixSuggestion || "")
              })).filter((ci: any) => ci.issue)
            : [],
          characterArcSummary: parsed.characterArcSummary ? String(parsed.characterArcSummary) : ""
        };

        plotDebugLogger.completeSuccess(logId, {
          fullResponse: response.text || "",
          usageMetadata: response.usageMetadata
        });
        return { data: normalized, usageMetadata: response.usageMetadata };
      } catch (err: any) {
        console.error("Plot Arc Analysis failed:", err);
        plotDebugLogger.recordFailure(logId, err);
        throw err;
      }
    }, {
      name: `Phân tích Mạch truyện (${storyTitle || 'Toàn tác phẩm'})`,
      type: 'plot_analysis',
      priority: 'low'
    });
  },

  async extractKnowledge(
    text: string,
    story: Story,
    categories: ExtractionCategory[] = ['characters', 'world', 'mechanics'],
    options: { isFullStoryScan?: boolean; extraKnownCharacters?: Character[]; maxTextChars?: number } = {}
  ): Promise<any> {
    const knownCharacters = options.extraKnownCharacters || story.characters || [];

    const knowledgeSchema = {
      type: Type.OBJECT,
      properties: {
        newCharacters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              entityType: { type: Type.STRING },
              species: { type: Type.STRING },
              description: { type: Type.STRING },
              appearance: { type: Type.STRING },
              traits: { type: Type.ARRAY, items: { type: Type.STRING } },
              status: { type: Type.STRING },
              currentLocation: { type: Type.STRING },
              powerLevel: { type: Type.STRING },
              abilities: { type: Type.STRING },
              knowledge: { type: Type.STRING },
              mentors: { type: Type.STRING },
              enemies: { type: Type.STRING }
            },
            required: ["name", "description"]
          }
        },
        characterUpdates: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              status: { type: Type.STRING },
              healthStatus: { type: Type.STRING },
              combatState: { type: Type.STRING },
              currentLocation: { type: Type.STRING },
              powerLevel: { type: Type.STRING },
              abilities: { type: Type.STRING },
              realizations: { type: Type.STRING },
              knowledge: { type: Type.STRING },
              enemies: { type: Type.STRING }
            },
            required: ["name"]
          }
        },
        worldLore: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              content: { type: Type.STRING }
            },
            required: ["topic", "content"]
          }
        },
        mechanics: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              rule: { type: Type.STRING },
              detail: { type: Type.STRING }
            },
            required: ["rule", "detail"]
          }
        },
        genreSuggestion: { type: Type.STRING },
        synopsisSuggestion: { type: Type.STRING }
      },
      required: ["newCharacters", "characterUpdates", "worldLore", "mechanics"]
    };

    const runExtractionPass = async (charLimit: number) => {
      const safeText = sampleManuscript(text, charLimit);
      const prompt = promptBuilderService.buildKnowledgeExtractionPrompt(safeText, knownCharacters, categories, {
        isFullStoryScan: options.isFullStoryScan,
        storyTitle: story.title,
        storyGenre: story.genre
      });

      const response = await requestThrottleService.enqueuePromise(
        () => generateAuditJsonWithFallback(prompt, knowledgeSchema),
        { name: `Quét tri thức & nhân vật: ${story.title}`, type: 'plot_analysis', priority: 'high' }
      );

      let parsed = response?._parsed || safeJsonParse<any>(extractResponseText(response), null);
      if (Array.isArray(parsed)) {
        parsed = { newCharacters: parsed, characterUpdates: [], worldLore: [], mechanics: [] };
      }
      return { response, parsed };
    };

    const primaryLimit = options.maxTextChars || 20000;
    let { response, parsed } = await runExtractionPass(primaryLimit);

    if ((!parsed || typeof parsed !== 'object') && text.length > 9000) {
      console.warn(`extractKnowledge lần 1 (${primaryLimit} ký tự) không ra JSON hợp lệ, thử rút gọn xuống 8500 ký tự...`);
      const retry = await runExtractionPass(8500);
      response = retry.response;
      parsed = retry.parsed;
    }

    if (!parsed || typeof parsed !== 'object') {
      const finishReason = getResponseFinishReason(response);
      throw new Error(`AI không trả về dữ liệu JSON trích xuất tri thức hợp lệ (Trạng thái: ${finishReason}). Vui lòng thử lại hoặc quét từng chương ngắn hơn.`);
    }

    const normalizeChars = (arr: any[]) =>
      arr
        .filter((c: any) => c && typeof c === 'object' && String(c.name || '').trim())
        .map((c: any) => ({
          ...c,
          name: String(c.name).trim(),
          description: String(c.description || '').trim(),
          traits: Array.isArray(c.traits)
            ? c.traits.map((t: any) => String(t).trim()).filter(Boolean)
            : typeof c.traits === 'string' && c.traits.trim()
              ? c.traits.split(/[,;]/).map((t: string) => t.trim()).filter(Boolean)
              : []
        }));

    return {
      data: {
        newCharacters: Array.isArray(parsed.newCharacters) ? normalizeChars(parsed.newCharacters) : [],
        characterUpdates: Array.isArray(parsed.characterUpdates)
          ? parsed.characterUpdates.filter((u: any) => u && String(u.name || '').trim())
          : [],
        worldLore: Array.isArray(parsed.worldLore)
          ? parsed.worldLore.filter((l: any) => l && String(l.topic || '').trim() && String(l.content || '').trim())
          : [],
        mechanics: Array.isArray(parsed.mechanics)
          ? parsed.mechanics.filter((m: any) => m && String(m.rule || '').trim() && String(m.detail || '').trim())
          : [],
        genreSuggestion: parsed.genreSuggestion ? String(parsed.genreSuggestion).trim() : undefined,
        synopsisSuggestion: parsed.synopsisSuggestion ? String(parsed.synopsisSuggestion).trim() : undefined
      },
      usageMetadata: response?.usageMetadata
    };
  },

  async scanStoryEntities(
    story: Story,
    onProgress?: (progress: { current: number; total: number; label: string }) => void
  ): Promise<{ data: any; usageMetadata?: any }> {
    const sortedChapters = [...(story.chapters || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(ch => ({
        title: ch.title,
        text: (ch.content?.trim() ? ch.content : (ch.translatedContent || '')).trim()
      }))
      .filter(ch => ch.text.length > 20);

    if (sortedChapters.length === 0) {
      throw new Error("Truyện hiện chưa có nội dung chương đủ dài để quét nhân vật và bối cảnh.");
    }

    // Group chapters into compact ~12,000 char batches to prevent JSON output truncation, capped at 6 evenly spaced batches
    const allBatches: { label: string; text: string }[] = [];
    let currentTitles: string[] = [];
    let currentTexts: string[] = [];
    let currentLen = 0;

    for (const ch of sortedChapters) {
      const chBlock = `=== ${ch.title} ===\n${ch.text.length > 10000 ? sampleManuscript(ch.text, 10000) : ch.text}`;
      if (currentLen + chBlock.length > 12000 && currentTexts.length > 0) {
        allBatches.push({
          label: currentTitles.length > 1 ? `${currentTitles[0]} → ${currentTitles[currentTitles.length - 1]}` : currentTitles[0],
          text: currentTexts.join('\n\n')
        });
        currentTitles = [];
        currentTexts = [];
        currentLen = 0;
      }
      currentTitles.push(ch.title);
      currentTexts.push(chBlock);
      currentLen += chBlock.length;
    }
    if (currentTexts.length > 0) {
      allBatches.push({
        label: currentTitles.length > 1 ? `${currentTitles[0]} → ${currentTitles[currentTitles.length - 1]}` : currentTitles[0],
        text: currentTexts.join('\n\n')
      });
    }

    let selectedBatches = allBatches;
    if (allBatches.length > 6) {
      const indices = new Set<number>([
        0,
        1,
        Math.floor(allBatches.length * 0.35),
        Math.floor(allBatches.length * 0.65),
        allBatches.length - 2,
        allBatches.length - 1
      ]);
      selectedBatches = Array.from(indices).sort((a, b) => a - b).map(idx => allBatches[idx]);
    }

    const existingNamesMap = new Map<string, Character>();
    (story.characters || []).forEach(c => existingNamesMap.set(c.name.trim().toLowerCase(), c));

    const discoveredNewCharsMap = new Map<string, any>();
    const characterUpdatesMap = new Map<string, any>();
    const worldLoreMap = new Map<string, { topic: string; content: string }>();
    const mechanicsMap = new Map<string, { rule: string; detail: string }>();
    let writingDNA: WritingDNA | undefined = story.writingDNA;
    let genreSuggestion: string | undefined;
    let synopsisSuggestion: string | undefined;

    const totalSteps = selectedBatches.length + (story.writingDNA ? 0 : 1);
    let stepIdx = 0;
    let successCount = 0;
    let firstBatchError: any = null;

    for (const batch of selectedBatches) {
      stepIdx++;
      onProgress?.({ current: stepIdx, total: totalSteps, label: `Đang quét nhân vật & bối cảnh (${batch.label})...` });

      const knownList: Character[] = [
        ...(story.characters || []),
        ...Array.from(discoveredNewCharsMap.values()).map((nc, idx) => ({
          id: `temp-${idx}`,
          name: nc.name,
          role: nc.role || 'Phụ',
          description: nc.description || '',
          status: nc.status || 'alive',
          traits: nc.traits || [],
          appearance: nc.appearance || '',
          species: nc.species
        }))
      ];

      try {
        const res = await this.extractKnowledge(batch.text, story, ['characters', 'world', 'mechanics'], {
          isFullStoryScan: true,
          extraKnownCharacters: knownList,
          maxTextChars: 13000
        });

        successCount++;
        const d = res?.data;
        if (d) {
          if (!genreSuggestion && d.genreSuggestion) genreSuggestion = d.genreSuggestion;
          if (!synopsisSuggestion && d.synopsisSuggestion) synopsisSuggestion = d.synopsisSuggestion;

          for (const nc of (d.newCharacters || [])) {
            const key = String(nc?.name || '').trim().toLowerCase();
            if (!key) continue;
            if (existingNamesMap.has(key)) {
              characterUpdatesMap.set(key, {
                name: existingNamesMap.get(key)!.name,
                ...characterUpdatesMap.get(key),
                status: nc.status,
                currentLocation: nc.currentLocation,
                powerLevel: nc.powerLevel,
                abilities: nc.abilities,
                knowledge: nc.knowledge,
                enemies: nc.enemies
              });
            } else {
              const prev = discoveredNewCharsMap.get(key) || {};
              discoveredNewCharsMap.set(key, {
                ...prev,
                ...nc,
                traits: Array.from(new Set([...(prev.traits || []), ...(nc.traits || [])])),
                description: nc.description && (!prev.description || nc.description.length > prev.description.length) ? nc.description : prev.description
              });
            }
          }

          for (const upd of (d.characterUpdates || [])) {
            const key = String(upd?.name || '').trim().toLowerCase();
            if (!key) continue;
            if (discoveredNewCharsMap.has(key)) {
              const prev = discoveredNewCharsMap.get(key);
              discoveredNewCharsMap.set(key, { ...prev, ...upd, name: prev.name });
            } else {
              const prevUpd = characterUpdatesMap.get(key) || {};
              characterUpdatesMap.set(key, { ...prevUpd, ...upd });
            }
          }

          for (const lore of (d.worldLore || [])) {
            const key = String(lore?.topic || '').trim().toLowerCase();
            if (key && lore.content) worldLoreMap.set(key, lore);
          }

          for (const mech of (d.mechanics || [])) {
            const key = String(mech?.rule || '').trim().toLowerCase();
            if (key && mech.detail) mechanicsMap.set(key, mech);
          }
        }
      } catch (batchErr: any) {
        const msg = String(batchErr?.message || batchErr || '').toLowerCase();
        const isCriticalAuthOrQuota =
          msg.includes('429') ||
          msg.includes('hạn mức') ||
          msg.includes('api key') ||
          msg.includes('api_key_invalid') ||
          msg.includes('xác thực api key');
        if (isCriticalAuthOrQuota) throw batchErr;

        if (!firstBatchError) firstBatchError = batchErr;
        console.warn(`Lỗi quét batch "${batch.label}", bỏ qua batch này để tiếp tục:`, batchErr);
      }
    }

    if (successCount === 0 && firstBatchError) {
      throw firstBatchError;
    }

    if (!writingDNA && selectedBatches[0]) {
      stepIdx++;
      onProgress?.({ current: stepIdx, total: totalSteps, label: `Đang phân tích Hồn Văn (Writing DNA)...` });
      try {
        const dnaRes = await this.extractWritingDNA(selectedBatches[0].text);
        if (dnaRes?.data) writingDNA = dnaRes.data;
      } catch (e) {
        console.warn("Optional Writing DNA scan failed:", e);
      }
    }

    return {
      data: {
        newCharacters: Array.from(discoveredNewCharsMap.values()),
        characterUpdates: Array.from(characterUpdatesMap.values()),
        worldLore: Array.from(worldLoreMap.values()),
        mechanics: Array.from(mechanicsMap.values()),
        writingDNA: !story.writingDNA ? writingDNA : undefined,
        genreSuggestion: (!story.genre || story.genre === 'Chưa xác định') ? genreSuggestion : undefined,
        synopsisSuggestion: !story.synopsis?.trim() ? synopsisSuggestion : undefined
      }
    };
  },

  async *chatPlanningStream(history: ChatMessage[], message: string, story: Story) {
    const sanitizedHistory = (history || []).slice(-10).map(h => ({
      role: h.role,
      parts: (h.parts || []).map(p => ({
        text: sanitizeModelText(p.text)
      }))
    }));

    const stream = requestThrottleService.enqueueStream(async function* () {
      try {
        const chat = ai.chats.create({
          model: getFlash(),
          config: { 
            systemInstruction: `Bạn là Kiến trúc sư Cốt truyện kỳ cựu cho tác phẩm "${story.title}" (${story.genre}). Hãy thảo luận, phân tích và đồng hành phát triển cốt truyện cùng tác giả một cách sâu sắc, logic và nhất quán.\n- Bối cảnh: ${story.setting || '(Chưa có)'}\n- Cơ chế thế giới: ${story.mechanics || '(Không)'}\n- Chỉ thị bền vững: ${story.persistentDirectives || '(Không có)'}`,
            maxOutputTokens: 65536,
            temperature: 0.7,
            thinkingConfig: { thinkingBudget: 512 }
          },
          history: sanitizedHistory
        });
        const response = await chat.sendMessageStream({ message });
        for await (const chunk of response) {
          yield chunk as GenerateContentResponse;
        }
      } catch (e) {
        console.warn("chatPlanningStream failed:", e);
        throw e;
      }
    }, {
      name: `Planning Chat: ${message.substring(0, 30)}`,
      type: 'content_gen',
      priority: 'high'
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  },

  async *chatPlotStream(
    history: ChatMessage[],
    message: string,
    story: Story,
    focusChapterId?: string,
    extraContext?: { plotArcAnalysis?: any; auditReport?: any }
  ) {
    const chaptersContext = formatSmartChapterContext(story.chapters, {
      maxTotalChars: 60000,
      focusChapterId,
      targetChapterMention: message
    });

    const activeKnowledge = (story.knowledgeLogs || [])
      .filter(k => k.isActive)
      .slice(-20)
      .map(k => `- [${k.category}] ${k.title}: ${k.content}`)
      .join('\n') || '(Chưa có)';

    const rosterText = (story.characters || []).length > 0
      ? story.characters.slice(0, 35).map(c =>
          `- ${c.name} (${c.role || 'Phụ'}, ${c.species || 'Nhân'}, trạng thái: ${c.status || 'alive'}${c.currentLocation ? `, tại: ${c.currentLocation}` : ''}${c.healthStatus ? `, thể trạng: ${c.healthStatus}` : ''}${c.powerLevel ? `, thực lực: ${c.powerLevel}` : ''}${c.abilities ? `, kỹ năng: ${c.abilities}` : ''}${c.traits?.length ? `, tính cách/xưng hô: ${c.traits.join(', ')}` : ''}${c.knowledge ? `, tri thức: ${c.knowledge}` : ''}${c.enemies ? `, kẻ thù: ${c.enemies}` : ''}): ${c.description || ''}`
        ).join('\n')
      : '(Chưa có hồ sơ nhân vật — có thể hướng dẫn tác giả nhấn nút Quét Nhân Vật ở tab Thực Thể)';

    const analysisInsights: string[] = [];
    if (extraContext?.plotArcAnalysis) {
      const pa = extraContext.plotArcAnalysis;
      if (pa.unresolvedHooks?.length) analysisInsights.push(`• Nút thắt chưa giải quyết: ${pa.unresolvedHooks.join(' | ')}`);
      if (pa.chapterIssues?.length) {
        analysisInsights.push(`• Lỗi mạch lạc từng chương đã phát hiện:\n` + pa.chapterIssues.map((ci: any) => `  - ${ci.chapterTitle}: ${ci.issue} (Gợi ý sửa: ${ci.fixSuggestion})`).join('\n'));
      }
    }
    if (extraContext?.auditReport?.plotCoherence?.plotHoles?.length) {
      analysisInsights.push(`• Lỗ hổng từ Kiểm toán toàn truyện: ${extraContext.auditReport.plotCoherence.plotHoles.join(' | ')}`);
    }

    const systemInstruction = `Bạn là Chuyên gia Cố vấn & Đồng hành Hiệu đính Cốt truyện (AI Plot Collaborator & Co-Editor) của tác phẩm "${story.title}".
Nhiệm vụ của bạn là cùng tác giả phân tích mạch truyện, rà soát tính nhất quán nhân vật & thế giới, sửa chữa lỗ hổng logic và nâng cấp/viết lại chương truyện theo đúng mạch lạc toàn tác phẩm.

[HỒ SƠ WORLD BIBLE & QUY TẮC TÁC PHẨM]:
- Tên truyện: "${story.title}" | Thể loại: ${story.genre || 'Tiểu thuyết'}
- Ngôi kể (POV): ${story.pov || 'Ngôi thứ ba'} | Quy tắc xưng hô: ${story.pronounStyle || 'Nhất quán theo bối cảnh'}
- Phong cách viết / Hồn văn: ${story.writingStyle || story.writingDNA?.narrativeVoice || 'Chuẩn mực văn học'}
- Dòng thời gian: ${story.currentTimeline || '(Chưa thiết lập)'}
- Dàn ý tổng thể (Blueprint): ${story.planning || '(Chưa có)'}
- Bối cảnh thế giới (Setting): ${story.setting || '(Chưa thiết lập)'}
- Hệ thống sức mạnh / Quy tắc thế giới (Mechanics): ${story.mechanics || '(Chưa thiết lập)'}
- Quy tắc tương tác & Ràng buộc: ${story.interactionRules || '(Không có)'}
- Chỉ thị bền vững: ${story.persistentDirectives || '(Không có)'}

[TRI THỨC ĐÃ KHÓA (KNOWLEDGE LOGS)]:
${activeKnowledge}

[HỒ SƠ NHÂN VẬT (${(story.characters || []).length} nhân vật)]:
${rosterText}
${analysisInsights.length > 0 ? `\n[KẾT QUẢ PHÂN TÍCH MẠCH TRUYỆN & LỖI LOGIC HIỆN CÓ]:\n${analysisInsights.join('\n')}` : ''}

${ORIGINAL_FIDELITY_PROTOCOL}

[DỮ LIỆU CÁC CHƯƠNG - BẢN THẢO THỰC TẾ & ĐỀ CƯƠNG]:
${chaptersContext}

[GIAO THỨC BẢO TỒN BẢN THẢO & ĐỀ XUẤT SỬA ĐỔI]:
1. 📖 BẢN THẢO THỰC TẾ LÀ CHÂN LÝ DUY NHẤT:
   - Mọi nhận xét và đề xuất sửa đổi PHẢI dựa trên tình tiết thực tế, tên nhân vật, lời thoại và mạch liên kết giữa các chương. Trích dẫn cụ thể tên chương/chi tiết khi phân tích.
2. 🔧 SỬA CHỮA THEO MẠCH LẠC:
   - Khi tác giả yêu cầu sửa một chương hoặc vá lỗ hổng logic, hãy kiểm tra chương trước, chương sau, hồ sơ nhân vật (vết thương, vị trí, tri thức, xưng hô) và World Bible để bản sửa khớp nối hoàn hảo.
3. ✍️ ĐỀ XUẤT SỬA ĐỔI CÓ THỂ ÁP DỤNG TRỰC TIẾP:
   Khi đề xuất sửa đổi cụ thể, bọc nội dung hoàn chỉnh trong một trong các thẻ sau để giao diện tự động hiện nút "Xem Diff & Áp dụng":
   - Cập nhật Dàn ý tổng thể:
     [PROPOSAL_PLANNING: <nội dung dàn ý mới>]
   - Cập nhật Đề cương một chương:
     [PROPOSAL_OUTLINE_CHAPTER_<chapterId>: <nội dung đề cương mới>]
   - Cập nhật Tóm tắt một chương:
     [PROPOSAL_SUMMARY_CHAPTER_<chapterId>: <nội dung tóm tắt mới>]
   - Cập nhật/Sửa chữa toàn văn Bản thảo chương (PHẢI viết đầy đủ 100% từ đầu đến cuối, KHÔNG viết "[... giữ nguyên phần còn lại ...]"):
     [PROPOSAL_CONTENT_CHAPTER_<chapterId>: <toàn bộ nội dung bản thảo hoàn chỉnh>]

Hãy phản hồi bằng tiếng Việt sắc bén, cụ thể, có dẫn chứng và tôn trọng tuyệt đối bản sắc tác phẩm.`;

    // Retain recent message history with generous length (up to 35,000 chars per turn)
    const sanitizedHistory = (history || []).slice(-6).map(h => {
      const parts = (h.parts || []).map(p => {
        let text = sanitizeModelText(p.text);
        if (text.length > 35000) {
          text = text.substring(0, 35000) + "... [Đã giữ 35k ký tự]";
        }
        return { text };
      });
      return { role: h.role, parts };
    });

    const stream = requestThrottleService.enqueueStream(async function* () {
      let chat;
      const activeKey = getApiKey();
      const logId = plotDebugLogger.startLog({
        type: 'plot_chat',
        title: `Plot Co-Edit: ${message.substring(0, 35)}${message.length > 35 ? '...' : ''}`,
        model: getFlash(),
        apiKey: activeKey,
        keyIndex: lastKeyIndex + 1,
        totalKeys: getAvailableKeysCount(),
        keySource: 'localStorage',
        message,
        systemInstruction,
        historyTurns: sanitizedHistory.length,
        chaptersContextChars: chaptersContext.length
      });

      let fullAccumulatedResponse = "";
      let finalUsageMetadata: any = null;

      try {
        chat = ai.chats.create({
          model: getFlash(),
          config: { 
            _debugLogId: logId,
            systemInstruction,
            temperature: 0.7,
            maxOutputTokens: 65536,
            thinkingConfig: { thinkingBudget: 1024 }
          } as any,
          history: sanitizedHistory
        });
        const response = await chat.sendMessageStream({ message });
        for await (const chunk of response) {
          const rawChunkText = typeof chunk?.text === 'string' ? chunk.text : "";
          const text = (rawChunkText !== 'undefined' && rawChunkText !== 'null') ? rawChunkText : "";
          if (text) {
            fullAccumulatedResponse += text;
            plotDebugLogger.updateStreaming(logId, text);
          }
          if (chunk.usageMetadata) {
            finalUsageMetadata = chunk.usageMetadata;
          }
          yield chunk as GenerateContentResponse;
        }
        plotDebugLogger.completeSuccess(logId, {
          fullResponse: fullAccumulatedResponse,
          usageMetadata: finalUsageMetadata
        });
      } catch (e: any) {
        console.warn("Plot chat error, retrying without history:", e);
        plotDebugLogger.recordFailure(logId, e, "Thử lại lượt 2 sau khi lược bỏ toàn bộ lịch sử chat...");

        const retryLogId = plotDebugLogger.startLog({
          type: 'plot_chat',
          title: `[Retry Không Lịch Sử] Plot Co-Edit: ${message.substring(0, 35)}...`,
          model: getFlash(),
          apiKey: getApiKey(),
          keyIndex: lastKeyIndex + 1,
          totalKeys: getAvailableKeysCount(),
          keySource: 'localStorage',
          message,
          systemInstruction,
          historyTurns: 0,
          chaptersContextChars: chaptersContext.length
        });

        try {
          chat = ai.chats.create({
            model: getFlash(),
            config: { 
              _debugLogId: retryLogId,
              systemInstruction,
              temperature: 0.7,
              maxOutputTokens: 65536,
              thinkingConfig: { thinkingBudget: 0 }
            } as any,
            history: []
          });
          const response = await chat.sendMessageStream({ message });
          let retryAccumulated = "";
          let retryMetadata: any = null;
          for await (const chunk of response) {
            const rawChunkText = typeof chunk?.text === 'string' ? chunk.text : "";
            const text = (rawChunkText !== 'undefined' && rawChunkText !== 'null') ? rawChunkText : "";
            if (text) {
              retryAccumulated += text;
              plotDebugLogger.updateStreaming(retryLogId, text);
            }
            if (chunk.usageMetadata) {
              retryMetadata = chunk.usageMetadata;
            }
            yield chunk as GenerateContentResponse;
          }
          plotDebugLogger.completeSuccess(retryLogId, {
            fullResponse: retryAccumulated,
            usageMetadata: retryMetadata
          });
        } catch (retryErr: any) {
          plotDebugLogger.recordFailure(retryLogId, retryErr);
          throw retryErr;
        }
      }
    }, {
      name: `Plot Co-Edit Chat: ${message.substring(0, 30)}`,
      type: 'plot_chat',
      priority: 'high'
    });

    for await (const chunk of stream) {
      yield chunk;
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
Hãy sáng tạo thiết lập chi tiết cho thế giới này với chiều sâu và tính nhất quán cao.
TRẢ VỀ JSON HỢP LỆ:
{
  "setting": "Địa lý, xã hội, không khí bối cảnh",
  "mechanics": "Hệ thống sức mạnh / phép thuật / quy luật cốt lõi",
  "interactionRules": "Quy tắc giao tiếp, phe phái và xung đột quyền lực"
}`;

    const response = await safeGenerateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
          responseMimeType: "application/json",
          temperature: 0.85,
          thinkingConfig: { thinkingBudget: 1024 }
      }
    });
    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed) return null;
    return { data: parsed, usageMetadata: response?.usageMetadata };
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
  "archetype": "Kiểu mẫu nhân vật",
  "background": "Xuất thân & Động cơ (Ngắn gọn)"
}`;
    
    const response = await safeGenerateContent({
        model: getFlash(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { 
            responseMimeType: "application/json",
            temperature: 0.9
        }
    });
    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed) return null;
    return { data: parsed, usageMetadata: response?.usageMetadata };
  },

  async balanceChapterLength(content: string, target: number, current: number, interactionRules: string, genre: string, negativePrompt: string): Promise<any> {
    const prompt = promptBuilderService.buildBalanceLengthPrompt(content, target, current, interactionRules, genre, negativePrompt);
    const schema = {
      type: Type.OBJECT,
      properties: { edited_text: { type: Type.STRING } },
      required: ["edited_text"]
    };
    const response = await requestThrottleService.enqueuePromise(
      () => generateAuditJsonWithFallback(prompt, schema),
      { name: `Cân bằng độ dài (${target} từ)`, type: 'content_gen', priority: 'normal' }
    );
    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed || !parsed.edited_text) {
      throw new Error("AI không trả về văn bản cân bằng độ dài hợp lệ.");
    }
    return { data: parsed, usageMetadata: response?.usageMetadata };
  },

  async *refineChapterStream(content: string, worldBible: string, interactionRules: string, genre: string, writingStyle: string, pov: string, pronounStyle: string, negativePrompt: string, nsfw: boolean, customInstruction: string, persistentDirectives: string, mechanics: string, styleReference: string) {
    const prompt = promptBuilderService.buildRefineChapterPrompt(content, worldBible, interactionRules, genre, writingStyle, pov, pronounStyle, negativePrompt, nsfw, customInstruction, persistentDirectives, mechanics, styleReference || "");
    const stream = safeGenerateContentStream({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        maxOutputTokens: 65536,
        thinkingConfig: { thinkingBudget: 2048 } 
      }
    });
    for await (const chunk of stream) yield chunk;
  },

  async *refineSelectionStream(selection: string, prefix: string, suffix: string, story: Story, instruction: string) {
    const prompt = promptBuilderService.buildRefineSelectionPrompt(selection, prefix, suffix, story, instruction);
    const stream = safeGenerateContentStream({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 16384, thinkingConfig: { thinkingBudget: 1024 } }
    });
    for await (const chunk of stream) yield chunk;
  },

  async auditStoryConsistency(story: Story, focusChapterId?: string): Promise<any> {
    const prompt = promptBuilderService.buildStoryAuditPrompt(story, focusChapterId);
    const storyAuditSchema = {
      type: Type.OBJECT,
      properties: {
        overallScore: { type: Type.NUMBER },
        characterArcs: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              character: { type: Type.STRING },
              analysis: { type: Type.STRING },
              issues: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["character", "analysis", "issues"]
          }
        },
        worldBuildingGaps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              issue: { type: Type.STRING },
              fix: { type: Type.STRING }
            },
            required: ["topic", "issue", "fix"]
          }
        },
        plotCoherence: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            plotHoles: { type: Type.ARRAY, items: { type: Type.STRING } },
            blueprintAlignment: { type: Type.STRING }
          },
          required: ["summary", "plotHoles", "blueprintAlignment"]
        }
      },
      required: ["overallScore", "characterArcs", "worldBuildingGaps", "plotCoherence"]
    };

    const response = await requestThrottleService.enqueuePromise(
      () => generateAuditJsonWithFallback(prompt, storyAuditSchema),
      {
        name: `Kiểm toán toàn truyện: ${story.title}`,
        type: 'plot_analysis',
        priority: 'high'
      }
    );

    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error("AI không trả về dữ liệu JSON kiểm toán hợp lệ. Vui lòng thử lại.");
    }

    const rawScore = Number(parsed.overallScore);
    const overallScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;

    const characterArcs = Array.isArray(parsed.characterArcs)
      ? parsed.characterArcs.map((arc: any) => ({
          character: String(arc?.character || "Nhân vật"),
          analysis: String(arc?.analysis || ""),
          issues: Array.isArray(arc?.issues) ? arc.issues.map((x: any) => String(x)).filter(Boolean) : []
        }))
      : [];

    const worldBuildingGaps = Array.isArray(parsed.worldBuildingGaps)
      ? parsed.worldBuildingGaps.map((gap: any) => ({
          topic: String(gap?.topic || "Thế giới & Quy tắc"),
          issue: String(gap?.issue || ""),
          fix: String(gap?.fix || "")
        }))
      : [];

    const plotCoherence = {
      summary: String(parsed.plotCoherence?.summary || "Chưa có tổng quan cốt truyện."),
      plotHoles: Array.isArray(parsed.plotCoherence?.plotHoles)
        ? parsed.plotCoherence.plotHoles.map((x: any) => String(x)).filter(Boolean)
        : [],
      blueprintAlignment: String(parsed.plotCoherence?.blueprintAlignment || "Chưa có dữ liệu đối chiếu Blueprint.")
    };

    return {
      data: { overallScore, characterArcs, worldBuildingGaps, plotCoherence },
      usageMetadata: response?.usageMetadata
    };
  },

  async auditChapterLogic(content: string, title: string, story: Story, chapterId?: string): Promise<any> {
    const prompt = promptBuilderService.buildChapterLogicAuditPrompt(content, title, story, chapterId);
    const chapterAuditSchema = {
      type: Type.OBJECT,
      properties: {
        internalConsistency: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              issue: { type: Type.STRING },
              suggestion: { type: Type.STRING }
            },
            required: ["issue", "suggestion"]
          }
        },
        characterLogic: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              character: { type: Type.STRING },
              issue: { type: Type.STRING },
              suggestion: { type: Type.STRING }
            },
            required: ["character", "issue", "suggestion"]
          }
        },
        worldRuleViolations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              rule: { type: Type.STRING },
              issue: { type: Type.STRING }
            },
            required: ["rule", "issue"]
          }
        },
        pacingAnalysis: { type: Type.STRING }
      },
      required: ["internalConsistency", "characterLogic", "worldRuleViolations", "pacingAnalysis"]
    };

    const response = await requestThrottleService.enqueuePromise(
      () => generateAuditJsonWithFallback(prompt, chapterAuditSchema),
      {
        name: `Kiểm toán logic: ${title}`,
        type: 'plot_analysis',
        priority: 'high'
      }
    );

    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error("AI không trả về dữ liệu JSON kiểm toán chương hợp lệ. Vui lòng thử lại.");
    }

    const internalConsistency = Array.isArray(parsed.internalConsistency)
      ? parsed.internalConsistency.map((item: any) => ({
          issue: String(item?.issue || ""),
          suggestion: String(item?.suggestion || "")
        })).filter((item: any) => item.issue)
      : [];

    const characterLogic = Array.isArray(parsed.characterLogic)
      ? parsed.characterLogic.map((item: any) => ({
          character: String(item?.character || "Nhân vật"),
          issue: String(item?.issue || ""),
          suggestion: String(item?.suggestion || "")
        })).filter((item: any) => item.issue)
      : [];

    const worldRuleViolations = Array.isArray(parsed.worldRuleViolations)
      ? parsed.worldRuleViolations.map((item: any) => ({
          rule: String(item?.rule || "Quy tắc thế giới"),
          issue: String(item?.issue || "")
        })).filter((item: any) => item.issue)
      : [];

    const pacingAnalysis = String(parsed.pacingAnalysis || "").trim() || "Nhịp điệu chương ổn định, chưa ghi nhận bất thường đáng kể.";

    return {
      data: { internalConsistency, characterLogic, worldRuleViolations, pacingAnalysis },
      usageMetadata: response?.usageMetadata
    };
  },

  async analyzeVocabulary(content: string, interactionRules: string): Promise<any> {
    const prompt = promptBuilderService.buildVocabularyAnalysisPrompt(content, interactionRules);
    const vocabSchema = {
      type: Type.OBJECT,
      properties: {
        insights: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              count: { type: Type.NUMBER },
              suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
              context: { type: Type.STRING }
            },
            required: ["word", "count", "suggestions", "context"]
          }
        }
      },
      required: ["insights"]
    };
    const response = await requestThrottleService.enqueuePromise(
      () => generateAuditJsonWithFallback(prompt, vocabSchema),
      { name: "Phân tích từ vựng & lặp từ", type: 'plot_analysis', priority: 'normal' }
    );
    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed) throw new Error("AI không trả về dữ liệu phân tích từ vựng hợp lệ.");
    return {
      data: Array.isArray(parsed.insights) ? parsed.insights : (Array.isArray(parsed) ? parsed : []),
      usageMetadata: response?.usageMetadata
    };
  },

  async extractStylisticRule(text: string): Promise<any> {
    const prompt = promptBuilderService.buildStyleRuleExtractionPrompt(text);
    const response = await safeGenerateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.3 }
    });
    return { text: response.text?.trim() || "", usageMetadata: response.usageMetadata };
  },

  async deriveStylisticRule(original: string, modified: string): Promise<any> {
    const prompt = promptBuilderService.buildDeriveStylisticRulePrompt(original, modified);
    const response = await safeGenerateContent({
      model: getFlash(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.3 }
    });
    return { text: response.text?.trim() || "", usageMetadata: response.usageMetadata };
  },

  async autoUpdateCharacterStatus(character: Character, storyContext: string): Promise<any> {
    const prompt = promptBuilderService.buildAutoUpdateCharacterPrompt(character, storyContext);
    const charUpdateSchema = {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING },
        healthStatus: { type: Type.STRING },
        combatState: { type: Type.STRING },
        currentLocation: { type: Type.STRING },
        powerLevel: { type: Type.STRING },
        abilities: { type: Type.STRING },
        knowledge: { type: Type.STRING },
        mentors: { type: Type.STRING },
        enemies: { type: Type.STRING },
        description: { type: Type.STRING }
      }
    };
    const response = await requestThrottleService.enqueuePromise(
      () => generateAuditJsonWithFallback(prompt, charUpdateSchema),
      { name: `Đồng bộ nhân vật: ${character.name}`, type: 'plot_analysis', priority: 'normal' }
    );
    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Không thể phân tích cập nhật cho nhân vật ${character.name}.`);
    }
    return { data: parsed, usageMetadata: response?.usageMetadata };
  },

  async generateAdvancedChapterSuggestion(story: Story): Promise<any> {
    const prompt = promptBuilderService.buildNextChapterSuggestionPrompt(story);
    const suggestionSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        conflict: { type: Type.STRING },
        emotionalGoal: { type: Type.STRING },
        outline: { type: Type.STRING },
        logicCheck: { type: Type.STRING }
      },
      required: ["title", "conflict", "emotionalGoal", "outline", "logicCheck"]
    };
    const response = await requestThrottleService.enqueuePromise(
      () => generateAuditJsonWithFallback(prompt, suggestionSchema),
      { name: `Gợi ý chương mới: ${story.title}`, type: 'plot_analysis', priority: 'normal' }
    );
    const parsed = safeJsonParse<any>(response?.text, null);
    if (!parsed) throw new Error("AI không trả về gợi ý chương hợp lệ.");
    return { data: parsed, usageMetadata: response?.usageMetadata };
  },

  async *translateToVietnameseStream(
    content: string,
    story?: Story | null,
    options?: {
      chapterTitle?: string;
      styleMode?: string;
      customInstruction?: string;
      pronounOverride?: string;
    }
  ) {
    const prompt = promptBuilderService.buildVietnameseLocalizationPrompt(content, story, options);
    const chapterName = options?.chapterTitle || 'Chương truyện';
    
    const stream = requestThrottleService.enqueueStream(async function* () {
      const genStream = safeGenerateContentStream({ 
          model: getFlash(), 
          contents: [{ parts: [{ text: prompt }] }],
          config: { 
            temperature: 0.65,
            maxOutputTokens: 65536,
            thinkingConfig: { thinkingBudget: 2048 }
          }
      });
      for await (const chunk of genStream) {
        yield chunk;
      }
    }, {
      name: `Việt Hóa: ${chapterName}`,
      type: 'content_gen',
      priority: 'high'
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

  async testSingleKeyDirectly(
    apiKey: string,
    modelToTest?: string,
    options?: {
      timeoutMs?: number;
      signal?: AbortSignal;
      onPhase?: (phase: string, model: string) => void;
    }
  ): Promise<{ text: string; usageMetadata?: any; modelUsed: string; latencyMs: number }> {
    const rawAi = createGenAI(apiKey);
    const primaryModel = modelToTest || getFlash();
    const timeoutMs = options?.timeoutMs ?? 15000;
    const probeModels = Array.from(
      new Set([primaryModel, 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'])
    );

    let lastErr: any = null;
    for (let i = 0; i < probeModels.length; i++) {
      const targetModel = probeModels[i];
      if (options?.signal?.aborted) {
        throw new Error('Đã hủy kiểm tra Key theo yêu cầu người dùng (aborted).');
      }

      options?.onPhase?.(
        i === 0
          ? `Đang ping ${targetModel} (tối đa ${Math.round(timeoutMs / 1000)}s)...`
          : `${primaryModel} không phản hồi — thử dự phòng ${targetModel}...`,
        targetModel
      );

      const attemptStart = Date.now();
      try {
        const response = await withAbortTimeout(
          (signal) =>
            rawAi.models.generateContent({
              model: targetModel,
              contents: [{ parts: [{ text: "Ping. Reply OK." }] }],
              config: {
                ...cleanConfigForModel(
                  {
                    temperature: 0.1,
                    maxOutputTokens: 32,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
                  },
                  targetModel
                ),
                abortSignal: signal
              } as any
            }),
          timeoutMs,
          `Timeout sau ${Math.round(timeoutMs / 1000)}s khi gọi ${targetModel} (Kết nối bị treo hoặc bị chặn bởi trình duyệt/mạng).`,
          options?.signal
        );

        const latencyMs = Math.max(1, Date.now() - attemptStart);
        return {
          text: extractResponseText(response) || "OK",
          usageMetadata: response.usageMetadata,
          modelUsed: targetModel,
          latencyMs
        };
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || err || '').toLowerCase();
        // If 429 or invalid key or permission denied or manual cancel, stop immediately instead of hiding the real key error
        if (
          options?.signal?.aborted ||
          msg.includes('429') ||
          msg.includes('resource_exhausted') ||
          msg.includes('quota') ||
          msg.includes('api key') ||
          msg.includes('api_key_invalid') ||
          msg.includes('400') ||
          msg.includes('403')
        ) {
          throw err;
        }
        // Only try fallback flash-lite/latest if model was 404/NOT_FOUND or timed out
        if (i === probeModels.length - 1) {
          throw err;
        }
      }
    }

    throw lastErr || new Error('Không thể kiểm tra API Key.');
  },

  getAllKeys,
  getFlash,
  getPro,
  getKeyCooldownStatus,
  clearKeyCooldown,
  clearAllCooldowns,
  markKeyRateLimited
};
