export interface ModelContextDef {
  id: string;
  name: string;
  contextLimit: number;
  tpmFreeLimit: number;
  description: string;
}

export const MODEL_CONTEXT_LIMITS: Record<string, ModelContextDef> = {
  'gemini-4-hydrogen': {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen (Flash 4)',
    contextLimit: 1048576, // 1M tokens
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Thế hệ 4 mới nhất, cân bằng tốc độ & tư duy sâu, hỗ trợ mọi Key.'
  },
  'gemini-4-argon': {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon (Pro 4)',
    contextLimit: 2097152, // 2M tokens
    tpmFreeLimit: 32000,
    description: '2,097,152 tokens (~2M). Dòng Pro thế hệ 4: suy luận phức tạp, viết & biên tập chuyên sâu.'
  },
  'gemini-4-carbon': {
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon (Deep Reasoning)',
    contextLimit: 2097152, // 2M tokens
    tpmFreeLimit: 32000,
    description: '2,097,152 tokens (~2M). Suy luận đa tầng sâu nhất dòng 4 cho kiến trúc cốt truyện & kiểm toán logic.'
  },
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    contextLimit: 1048576, // 1M tokens
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Thế hệ 3.8 tốc độ cao, ổn định & hỗ trợ mọi Key.'
  },
  'gemini-3.7-flash': {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    contextLimit: 1048576,
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Xử lý ngữ cảnh cực nhanh, hybrid reasoning.'
  },
  'gemini-3.6-pro': {
    id: 'gemini-3.6-pro',
    name: 'Gemini 3.6 Pro',
    contextLimit: 2097152, // 2M tokens
    tpmFreeLimit: 32000,
    description: '2,097,152 tokens (~2M). Suy luận chuyên sâu dòng 3.6.'
  },
  'gemini-3.6-flash': {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    contextLimit: 1048576,
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Ổn định & tương thích cao.'
  },
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    contextLimit: 2097152, // 2M tokens
    tpmFreeLimit: 32000,
    description: '2,097,152 tokens (~2M). Suy luận logic sâu dòng 3.1.'
  },
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    contextLimit: 1048576,
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Siêu nhẹ, phản hồi tức thì, tối ưu hạn mức & kháng 429 tốt nhất.'
  },
  'gemini-flash-latest': {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash Latest',
    contextLimit: 1048576,
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Luôn tự động trỏ về phiên bản Flash mới nhất của Google.'
  },
  'gemma-4-31b-queen': {
    id: 'gemma-4-31b-queen',
    name: 'Gemma 4 31B Queen',
    contextLimit: 262144, // 256K tokens
    tpmFreeLimit: 1000000,
    description: '262,144 tokens (~256K). Gemma 4 31B Queen thế hệ mới, tối ưu sáng tác & độ ổn định cao.'
  }
};

export const DEFAULT_MODEL_DEF = MODEL_CONTEXT_LIMITS['gemini-4-hydrogen'];

/**
 * Calibrated Vietnamese + English token estimator.
 * Matches Google's empirical Vietnamese prose rate (~2.32 chars/token; e.g., 450k chars ≈ 190k tokens)
 * while still handling pure ASCII/JSON (~3.5 chars/token) accurately.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  const len = text.length;
  if (len === 0) return 0;

  let nonAsciiCount = 0;
  for (let i = 0; i < len; i++) {
    if (text.charCodeAt(i) > 127) {
      nonAsciiCount++;
    }
  }
  const asciiCount = len - nonAsciiCount;
  return Math.max(1, Math.ceil(asciiCount / 3.5 + nonAsciiCount * 1.05));
}

export function estimateTokensFromChars(chars: number, isLikelyVietnamese = true): number {
  if (!chars || chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / (isLikelyVietnamese ? 2.32 : 3.5)));
}

export interface PromptBreakdownItem {
  id: string;
  name: string;
  category: string;
  chars: number;
  tokens: number;
  percentage: number;
  icon: string;
}

export interface WizardPromptMetrics {
  totalTokens: number;
  totalChars: number;
  model: ModelContextDef;
  usageRatio: number; // 0 to 1
  usagePercentage: number; // 0 to 100
  status: 'safe' | 'moderate' | 'warning' | 'critical';
  warningMessage?: string;
  tpmFreeWarning?: string;
  items: PromptBreakdownItem[];
  currentStepTokens: number;
  currentStepActionTokens: number;
  currentStepActionLabel?: string;
}

export function calculateWizardMetrics(
  wizardState: {
    title: string;
    synopsis: string;
    genre: string;
    currentTimeline: string;
    pov: string;
    pronounStyle: string;
    isFanfiction: boolean;
    fandomName: string;
    fanfictionContent?: string;
    mcName: string;
    mcSpecies: string;
    mcGender: string;
    mcArchetype: string;
    mcBackground: string;
    interactionRules: string;
    setting: string;
    mechanics: string;
    hasSystem: boolean;
    negativePrompt: string;
    maps: string;
    officials: string;
    logistics: string;
    economy: string;
    nsfw: boolean;
    planning: string;
    currentStep: number;
  },
  modelId = 'gemini-4-hydrogen'
): WizardPromptMetrics {
  const model = MODEL_CONTEXT_LIMITS[modelId] || DEFAULT_MODEL_DEF;

  const basicText = [
    `Tiêu đề: ${wizardState.title}`,
    `Thể loại: ${wizardState.genre}`,
    `Niên đại: ${wizardState.currentTimeline}`,
    `Góc nhìn (POV): ${wizardState.pov}`,
    `Tóm tắt: ${wizardState.synopsis}`,
    `Hệ thống xưng hô: ${wizardState.pronounStyle}`
  ].filter(Boolean).join('\n');

  const fanfictionText = wizardState.isFanfiction
    ? `[FANDOM / VŨ TRỤ GỐC]: ${wizardState.fandomName || 'Chưa đặt tên'}\n${wizardState.fanfictionContent || ''}`
    : '';

  const mcText = [
    `[Nhân vật chính]: ${wizardState.mcName || 'Chưa đặt tên'}`,
    `[Giới tính]: ${wizardState.mcGender}`,
    `[Chủng tộc]: ${wizardState.mcSpecies}`,
    `[Kiểu mẫu]: ${wizardState.mcArchetype}`,
    `[Xuất thân & Động cơ]: ${wizardState.mcBackground}`
  ].filter(Boolean).join('\n');

  const rulesText = wizardState.interactionRules;
  const settingText = wizardState.setting;
  const mechanicsText = wizardState.mechanics + (wizardState.hasSystem ? '\n[Chế độ Game LitRPG / System: Đã kích hoạt]' : '');
  const negativeText = wizardState.negativePrompt;
  const mapsAndFactionsText = [
    wizardState.maps ? `[Bản đồ & Địa lý]:\n${wizardState.maps}` : '',
    wizardState.officials ? `[Thế lực & Tổ chức]:\n${wizardState.officials}` : ''
  ].filter(Boolean).join('\n\n');
  const cultureAndEconomyText = [
    wizardState.logistics ? `[Văn hóa & Xã hội]:\n${wizardState.logistics}` : '',
    wizardState.economy ? `[Kinh tế & Tiền tệ]:\n${wizardState.economy}` : '',
    wizardState.nsfw ? '[Chế độ NSFW / R-18+: Đã kích hoạt]' : ''
  ].filter(Boolean).join('\n\n');
  const planningText = wizardState.planning;

  const rawItems = [
    { id: 'basic', name: 'Thông tin cơ bản & Xưng hô', category: 'Bước 1', text: basicText, icon: '📝' },
    { id: 'fanfiction', name: 'Tệp Đồng nhân (Fanfiction)', category: 'Bước 1', text: fanfictionText, icon: '📚' },
    { id: 'mc', name: 'Nhân vật chính (Protagonist)', category: 'Bước 2', text: mcText, icon: '👤' },
    { id: 'rules', name: 'Quy tắc Xưng hô', category: 'Bước 3', text: rulesText, icon: '🗣️' },
    { id: 'setting', name: 'World Bible (Bối cảnh)', category: 'Bước 4', text: settingText, icon: '🌍' },
    { id: 'mechanics', name: 'Hệ thống & Cơ chế', category: 'Bước 5', text: mechanicsText, icon: '⚙️' },
    { id: 'negative', name: 'Điều Tuyệt đối Cấm', category: 'Bước 6', text: negativeText, icon: '🛑' },
    { id: 'maps', name: 'Bản đồ & Thế lực', category: 'Bước 7', text: mapsAndFactionsText, icon: '🗺️' },
    { id: 'culture', name: 'Văn hóa & Kinh tế', category: 'Bước 8', text: cultureAndEconomyText, icon: '🏛️' },
    { id: 'planning', name: 'Dàn ý Cốt truyện (Blueprint)', category: 'Bước 9', text: planningText, icon: '📜' }
  ];

  // Calculate items
  const items: PromptBreakdownItem[] = [];
  let totalChars = 0;
  let totalTokens = 0;

  rawItems.forEach(raw => {
    const chars = raw.text.length;
    const tokens = estimateTokens(raw.text);
    totalChars += chars;
    totalTokens += tokens;
    items.push({
      id: raw.id,
      name: raw.name,
      category: raw.category,
      chars,
      tokens,
      percentage: 0,
      icon: raw.icon
    });
  });

  // Calculate percentage of total for each item
  items.forEach(item => {
    item.percentage = totalTokens > 0 ? Math.round((item.tokens / totalTokens) * 100) : 0;
  });

  // Calculate tokens for current step text
  let currentStepTokens = 0;
  let currentStepActionTokens = 0;
  let currentStepActionLabel: string | undefined;

  switch (wizardState.currentStep) {
    case 1:
      currentStepTokens = estimateTokens(basicText + '\n' + fanfictionText);
      break;
    case 2:
      currentStepTokens = estimateTokens(mcText);
      currentStepActionTokens = estimateTokens(`[NHIỆM VỤ: SÁNG TẠO NHÂN VẬT CHÍNH]\n${basicText}`);
      currentStepActionLabel = 'AI Tạo NV';
      break;
    case 3:
      currentStepTokens = estimateTokens(rulesText);
      currentStepActionTokens = estimateTokens(`[NHIỆM VỤ: KIẾN TRÚC SƯ THẾ GIỚI]\n${basicText}`);
      currentStepActionLabel = 'AI Gợi ý';
      break;
    case 4:
      currentStepTokens = estimateTokens(settingText);
      currentStepActionTokens = estimateTokens(`[NHIỆM VỤ: MỞ RỘNG BỐI CẢNH]\n${settingText}`);
      currentStepActionLabel = 'Mở rộng ý tưởng';
      break;
    case 5:
      currentStepTokens = estimateTokens(mechanicsText);
      currentStepActionTokens = estimateTokens(`[NHIỆM VỤ: KIẾN TRÚC SƯ THẾ GIỚI]\n${basicText}`);
      currentStepActionLabel = 'AI Gợi ý';
      break;
    case 6:
      currentStepTokens = estimateTokens(negativeText);
      currentStepActionTokens = estimateTokens(`[NHIỆM VỤ: KIẾN TRÚC SƯ THẾ GIỚI]\n${basicText}`);
      currentStepActionLabel = 'AI Gợi ý';
      break;
    case 7:
      currentStepTokens = estimateTokens(mapsAndFactionsText);
      currentStepActionTokens = estimateTokens(`[NHIỆM VỤ: KIẾN TRÚC SƯ THẾ GIỚI]\n${basicText}`);
      currentStepActionLabel = 'AI Gợi ý';
      break;
    case 8:
      currentStepTokens = estimateTokens(cultureAndEconomyText);
      currentStepActionTokens = estimateTokens(`[NHIỆM VỤ: KIẾN TRÚC SƯ THẾ GIỚI]\n${basicText}`);
      currentStepActionLabel = 'AI Gợi ý';
      break;
    case 9:
      currentStepTokens = estimateTokens(planningText);
      currentStepActionTokens = estimateTokens(`[NHIỆM VỤ: KIẾN TRÚC SƯ THẾ GIỚI]\n${basicText}`);
      currentStepActionLabel = 'AI Gợi ý';
      break;
    default:
      currentStepTokens = totalTokens;
  }

  const usageRatio = Math.min(1, totalTokens / model.contextLimit);
  const usagePercentage = Math.round(usageRatio * 1000) / 10; // e.g. 12.4%

  // Determine status & warning
  let status: 'safe' | 'moderate' | 'warning' | 'critical' = 'safe';
  let warningMessage: string | undefined;
  let tpmFreeWarning: string | undefined;

  if (totalTokens >= model.contextLimit * 0.9) {
    status = 'critical';
    warningMessage = `⚠️ NGUY HIỂM: Dung lượng (${totalTokens.toLocaleString()} tokens) đã vượt quá 90% giới hạn tối đa (${model.contextLimit.toLocaleString()}) của ${model.name}. Request có thể bị Google từ chối hoặc lỗi timeout. Hãy tinh giản bớt tệp tải lên hoặc World Bible.`;
  } else if (totalTokens >= model.contextLimit * 0.75) {
    status = 'warning';
    warningMessage = `⚠️ CẢNH BÁO: Dung lượng (${totalTokens.toLocaleString()} tokens) đang tiến sát giới hạn ngữ cảnh của ${model.name} (${(usagePercentage)}%).`;
  } else if (totalTokens >= model.contextLimit * 0.5) {
    status = 'moderate';
  } else {
    status = 'safe';
  }

  // Check if Pro model has Free Tier TPM quota issue (32k tokens/min on Free Tier)
  if ((model.id.includes('pro') || model.id.includes('argon') || model.id.includes('carbon')) && totalTokens > model.tpmFreeLimit) {
    tpmFreeWarning = `💡 Lưu ý Free Tier: Gói Pro miễn phí của Google chỉ cho phép 32,000 Token/phút (TPM). Tổng thiết lập hiện tại (~${totalTokens.toLocaleString()} tokens) có thể gây lỗi 429 nếu gọi liên tục bằng Model Pro. Nên chọn ${MODEL_CONTEXT_LIMITS['gemini-4-hydrogen'].name} (1,000,000 TPM) để vận hành mượt mà.`;
  }

  return {
    totalTokens,
    totalChars,
    model,
    usageRatio,
    usagePercentage,
    status,
    warningMessage,
    tpmFreeWarning,
    items,
    currentStepTokens,
    currentStepActionTokens,
    currentStepActionLabel
  };
}
