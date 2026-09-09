export interface ModelContextDef {
  id: string;
  name: string;
  contextLimit: number;
  tpmFreeLimit: number;
  description: string;
}

export const MODEL_CONTEXT_LIMITS: Record<string, ModelContextDef> = {
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    contextLimit: 1048576, // 1M tokens
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Thế hệ mới nhất, tốc độ cao, tư duy sắc bén & hỗ trợ mọi Key.'
  },
  'gemini-3.1-pro-preview': {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    contextLimit: 2097152, // 2M tokens
    tpmFreeLimit: 32000,
    description: '2,097,152 tokens (~2M). Suy luận logic sâu nhất & kiến tạo cốt truyện phức tạp.'
  },
  'gemini-3.7-flash': {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    contextLimit: 1048576,
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Xử lý ngữ cảnh cực nhanh, hybrid reasoning.'
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
  'gemini-3.6-pro': {
    id: 'gemini-3.6-pro',
    name: 'Gemini 3.6 Pro',
    contextLimit: 2097152, // 2M tokens
    tpmFreeLimit: 32000,
    description: '2,097,152 tokens (~2M). Suy luận chuyên sâu (Free Tier: 32k TPM).'
  },
  'gemini-3.6-flash': {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    contextLimit: 1048576,
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Ổn định & tương thích cao.'
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    contextLimit: 1048576,
    tpmFreeLimit: 1000000,
    description: '1,048,576 tokens (~1M). Hạn mức dự phòng ổn định.'
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    contextLimit: 2097152,
    tpmFreeLimit: 32000,
    description: '2,097,152 tokens (~2M). Dự phòng suy luận sâu.'
  }
};

export const DEFAULT_MODEL_DEF = MODEL_CONTEXT_LIMITS['gemini-3.8-flash'];

/**
 * Estimates token count for a string with accurate weights for Vietnamese, English, and punctuation.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  // Count non-ASCII characters (Vietnamese accented vowels, diacritics, CJK)
  const nonAsciiCount = (trimmed.match(/[^\x00-\x7F]/g) || []).length;
  // Count words
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Tokenizer heuristic:
  // English words ~ 1.25 tokens / word, ~ 4.0 chars / token
  // Vietnamese accented text ~ 1.35 tokens / word, ~ 2.8 - 3.4 chars / token
  const charRatio = nonAsciiCount > 0 ? 3.2 : 3.8;
  const charBased = Math.ceil(trimmed.length / charRatio) + Math.ceil(nonAsciiCount * 0.1);
  const wordBased = Math.ceil(wordCount * (nonAsciiCount > 0 ? 1.35 : 1.25));

  return Math.max(1, Math.round((charBased * 0.6) + (wordBased * 0.4)));
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
  modelId = 'gemini-3.8-flash'
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
  if (model.id.includes('pro') && totalTokens > model.tpmFreeLimit) {
    tpmFreeWarning = `💡 Lưu ý Free Tier: Gói Pro miễn phí của Google chỉ cho phép 32,000 Token/phút (TPM). Tổng thiết lập hiện tại (~${totalTokens.toLocaleString()} tokens) có thể gây lỗi 429 nếu gọi liên tục bằng Model Pro. Nên chọn ${MODEL_CONTEXT_LIMITS['gemini-3.8-flash'].name} (1,000,000 TPM) để vận hành mượt mà.`;
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
