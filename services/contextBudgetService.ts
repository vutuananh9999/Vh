import { externalProviderService } from './externalProviderService.ts';
import { estimateTokens, estimateTokensFromChars } from './tokenEstimator.ts';

export { estimateTokens, estimateTokensFromChars };

export type ContextBackendType = 'gemini' | 'external';

export const GEMINI_MAX_INPUT_TOKENS = 35_000;
export const EXTERNAL_MAX_INPUT_TOKENS = 60_000;

export interface ContextBudgetProfile {
  backend: ContextBackendType;
  maxInputTokens: number;
  maxTotalRequestChars: number;
  coEditChapterChars: number;
  knowledgeChars: number;
  logEntries: number;
  ledgerChars: number;
  rosterCount: number;
  recentPrevWindow: number;
  retrievedKnowledgeChars: number;
  retrievedChapterTopK: number;
  retrievedChapterCharsPerHit: number;
  historyTurnLimit: number;
  historyTurnMaxChars: number;
  analysisChapterChars: number;
  chapterLogicAuditChars: number;
  summarySourceChars: number;
  extractKnowledgeChars: number;
  scanBatchChars: number;
  canonContextMaxChars: number;
  systemInstructionMaxChars: number;
}

const GEMINI_BUDGET_PROFILE: ContextBudgetProfile = {
  backend: 'gemini',
  maxInputTokens: GEMINI_MAX_INPUT_TOKENS, // 35,000 tokens hard cap
  maxTotalRequestChars: 79_000,           // ~33k Vietnamese tokens target before 35k hard clamp
  coEditChapterChars: 39_000,
  knowledgeChars: 11_000,
  logEntries: 40,
  ledgerChars: 6_500,
  rosterCount: 30,
  recentPrevWindow: 3,
  retrievedKnowledgeChars: 3_600,
  retrievedChapterTopK: 4,
  retrievedChapterCharsPerHit: 600,
  historyTurnLimit: 4,
  historyTurnMaxChars: 2_000,
  analysisChapterChars: 45_000,
  chapterLogicAuditChars: 28_000,
  summarySourceChars: 22_000,
  extractKnowledgeChars: 15_000,
  scanBatchChars: 11_000,
  canonContextMaxChars: 6_000,
  systemInstructionMaxChars: 12_000
};

const EXTERNAL_BUDGET_PROFILE: ContextBudgetProfile = {
  backend: 'external',
  maxInputTokens: EXTERNAL_MAX_INPUT_TOKENS, // ~60,000 tokens ("cao hơn một chút" vs 35k Gemini)
  maxTotalRequestChars: 136_000,             // ~58k Vietnamese tokens total ceiling
  coEditChapterChars: 78_000,
  knowledgeChars: 19_000,
  logEntries: 65,
  ledgerChars: 11_000,
  rosterCount: 55,
  recentPrevWindow: 5,
  retrievedKnowledgeChars: 6_000,
  retrievedChapterTopK: 6,
  retrievedChapterCharsPerHit: 950,
  historyTurnLimit: 6,
  historyTurnMaxChars: 3_500,
  analysisChapterChars: 84_000,
  chapterLogicAuditChars: 40_000,
  summarySourceChars: 28_000,
  extractKnowledgeChars: 20_000,
  scanBatchChars: 13_000,
  canonContextMaxChars: 14_000,
  systemInstructionMaxChars: 18_000
};

export function isExternalBackendActive(tier: 'pro' | 'flash' = 'flash'): boolean {
  try {
    return externalProviderService.getCandidateProfilesForTask(tier).length > 0;
  } catch {
    return false;
  }
}

export function getContextBudget(
  tier: 'pro' | 'flash' = 'flash',
  forceBackend?: ContextBackendType
): ContextBudgetProfile {
  const backend: ContextBackendType =
    forceBackend || (isExternalBackendActive(tier) ? 'external' : 'gemini');
  return backend === 'external'
    ? { ...EXTERNAL_BUDGET_PROFILE }
    : { ...GEMINI_BUDGET_PROFILE };
}

/**
 * Preserves top structural anchors & bottom instructions/latest draft tail when truncating to fit a char cap.
 */
export function enforceCharsBudgetKeepingEnds(
  text: string,
  maxChars: number,
  notice = '\n\n[... Đã tự động rút gọn bớt phần giữa để giữ đúng giới hạn token cho AI ...]\n\n'
): string {
  if (!text || maxChars <= 0) return text || '';
  if (text.length <= maxChars) return text;
  if (maxChars < 400) return text.slice(0, maxChars);

  const usable = Math.max(200, maxChars - notice.length);
  const headChars = Math.floor(usable * 0.42);
  const tailChars = Math.max(100, usable - headChars);
  return `${text.slice(0, headChars)}${notice}${text.slice(-tailChars)}`;
}

/**
 * Trims a string iteratively until estimateTokens(result) <= maxTokens while preserving head + tail.
 */
export function trimTextToTokenBudget(text: string, maxTokens: number): string {
  if (!text || maxTokens <= 0) return '';
  let currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  const notice = '\n\n[... Đã nén bớt phần giữa để bảo đảm không vượt ngưỡng 35.000 token của Gemini ...]\n\n';
  let candidate = text;
  for (let pass = 0; pass < 4; pass++) {
    const ratio = (maxTokens / Math.max(1, currentTokens)) * 0.94;
    const targetChars = Math.max(300, Math.floor(candidate.length * ratio));
    candidate = enforceCharsBudgetKeepingEnds(candidate, targetChars, notice);
    currentTokens = estimateTokens(candidate);
    if (currentTokens <= maxTokens) {
      return candidate;
    }
  }
  return candidate.slice(0, Math.max(250, Math.floor(maxTokens * 2.0)));
}

function extractTextFromPartsContainer(container: any): string {
  if (!container) return '';
  if (typeof container === 'string') return container;
  if (Array.isArray(container)) {
    return container.map(extractTextFromPartsContainer).filter(Boolean).join('\n');
  }
  if (typeof container === 'object') {
    if (typeof container.text === 'string') return container.text;
    if (Array.isArray(container.parts)) {
      return container.parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).filter(Boolean).join('\n');
    }
    if (container.message !== undefined) {
      return extractTextFromPartsContainer(container.message);
    }
  }
  return '';
}

function replaceLastTextInPartsContainer(container: any, maxTokens: number): any {
  if (typeof container === 'string') {
    return trimTextToTokenBudget(container, maxTokens);
  }
  if (Array.isArray(container)) {
    if (container.length === 0) return container;
    const cloned = [...container];
    // Trim largest/last text block while accounting for smaller parts
    let nonLastTokens = 0;
    for (let i = 0; i < cloned.length - 1; i++) {
      nonLastTokens += estimateTokens(extractTextFromPartsContainer(cloned[i]));
    }
    const lastBudget = Math.max(500, maxTokens - nonLastTokens);
    cloned[cloned.length - 1] = replaceLastTextInPartsContainer(cloned[cloned.length - 1], lastBudget);
    // If earlier parts themselves blew past budget, trim them too
    if (nonLastTokens > maxTokens * 0.5) {
      const perEarlierBudget = Math.max(400, Math.floor((maxTokens * 0.45) / Math.max(1, cloned.length - 1)));
      for (let i = 0; i < cloned.length - 1; i++) {
        cloned[i] = replaceLastTextInPartsContainer(cloned[i], perEarlierBudget);
      }
    }
    return cloned;
  }
  if (container && typeof container === 'object') {
    if (typeof container.text === 'string') {
      return { ...container, text: trimTextToTokenBudget(container.text, maxTokens) };
    }
    if (Array.isArray(container.parts)) {
      return { ...container, parts: replaceLastTextInPartsContainer(container.parts, maxTokens) };
    }
    if (container.message !== undefined) {
      return { ...container, message: replaceLastTextInPartsContainer(container.message, maxTokens) };
    }
  }
  return container;
}

/**
 * Runtime hard guard applied strictly before invoking the Google Gemini SDK.
 * Guarantees total prompt input (systemInstruction + history + contents/message + schema margin)
 * stays strictly <= maxInputTokens (default 35,000), while leaving External Custom Providers untouched.
 */
export function clampGeminiPayloadToTokenLimit(
  params: any,
  maxInputTokens: number = GEMINI_MAX_INPUT_TOKENS,
  sendParams?: any
): {
  params: any;
  sendParams: any;
  wasTrimmed: boolean;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
} {
  const schemaOverhead = params?.config?.responseSchema ? 650 : 180;
  const safeTargetTokens = Math.max(2000, maxInputTokens - schemaOverhead);

  const sysText = extractTextFromPartsContainer(params?.config?.systemInstruction);
  const sysTokens = estimateTokens(sysText);

  const historyArr: any[] = Array.isArray(params?.history) ? params.history : [];
  let historyTokens = historyArr.reduce(
    (sum, turn) => sum + estimateTokens(extractTextFromPartsContainer(turn)),
    0
  );

  const primaryContainer = sendParams !== undefined ? sendParams : params?.contents;
  const primaryText = extractTextFromPartsContainer(primaryContainer);
  const primaryTokens = estimateTokens(primaryText);

  const estimatedTokensBefore = sysTokens + historyTokens + primaryTokens + schemaOverhead;
  if (sysTokens + historyTokens + primaryTokens <= safeTargetTokens) {
    return {
      params,
      sendParams,
      wasTrimmed: false,
      estimatedTokensBefore,
      estimatedTokensAfter: estimatedTokensBefore
    };
  }

  // Clone top-level structures without mutating caller inputs
  const nextParams = {
    ...(params || {}),
    config: params?.config ? { ...params.config } : undefined
  };
  let nextSendParams = sendParams;

  // Step 1: Drop oldest chat history turns first if needed
  let nextHistory = [...historyArr];
  if (nextHistory.length > 0) {
    const maxHistoryAllowance = Math.floor(safeTargetTokens * 0.22);
    while (nextHistory.length > 0 && (historyTokens > maxHistoryAllowance || sysTokens + historyTokens + primaryTokens > safeTargetTokens)) {
      const removed = nextHistory.shift();
      historyTokens -= estimateTokens(extractTextFromPartsContainer(removed));
      if (sysTokens + historyTokens + primaryTokens <= safeTargetTokens && historyTokens <= maxHistoryAllowance) {
        break;
      }
    }
    nextParams.history = nextHistory;
  }

  // Step 2: Cap oversized systemInstruction cleanly
  let effectiveSysTokens = sysTokens;
  const maxSysAllowance = Math.floor(safeTargetTokens * 0.26);
  if (sysTokens > maxSysAllowance && nextParams.config?.systemInstruction) {
    nextParams.config.systemInstruction = replaceLastTextInPartsContainer(
      nextParams.config.systemInstruction,
      maxSysAllowance
    );
    effectiveSysTokens = estimateTokens(extractTextFromPartsContainer(nextParams.config.systemInstruction));
  }

  // Step 3: Trim primary message/contents to fit remaining token budget
  const remainingPrimaryTokens = Math.max(1500, safeTargetTokens - effectiveSysTokens - Math.max(0, historyTokens));
  if (sendParams !== undefined) {
    nextSendParams = replaceLastTextInPartsContainer(sendParams, remainingPrimaryTokens);
  } else if (nextParams.contents !== undefined) {
    nextParams.contents = replaceLastTextInPartsContainer(nextParams.contents, remainingPrimaryTokens);
  }

  const finalSysTokens = estimateTokens(extractTextFromPartsContainer(nextParams.config?.systemInstruction));
  const finalHistTokens = Array.isArray(nextParams.history)
    ? nextParams.history.reduce((sum: number, t: any) => sum + estimateTokens(extractTextFromPartsContainer(t)), 0)
    : 0;
  const finalPrimaryTokens = estimateTokens(
    extractTextFromPartsContainer(sendParams !== undefined ? nextSendParams : nextParams.contents)
  );

  return {
    params: nextParams,
    sendParams: nextSendParams,
    wasTrimmed: true,
    estimatedTokensBefore,
    estimatedTokensAfter: finalSysTokens + finalHistTokens + finalPrimaryTokens + schemaOverhead
  };
}
