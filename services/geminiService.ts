
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Character, ChatMessage, Story, Chapter, ExtractionCategory, WebInspiration, WritingDNA } from "../types.ts";
import { promptBuilderService } from "./promptBuilderService.ts";
import { tokenTracker } from "./tokenTracker.ts";

let lastKeyIndex = 0;
function getApiKey(): string {
  if (typeof window === 'undefined') {
    return process.env.GEMINI_API_KEY || '';
  }
  const stored = localStorage.getItem('aetheria_api_key') || '';
  if (!stored) {
    return process.env.GEMINI_API_KEY || '';
  }
  
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const keys = parsed.map(k => k.trim()).filter(Boolean);
      if (keys.length > 0) {
        const key = keys[lastKeyIndex % keys.length];
        lastKeyIndex = (lastKeyIndex + 1) % keys.length;
        return key;
      }
    }
  } catch (e) {
    if (stored.includes(',') || stored.includes('\n')) {
      const keys = stored.split(/[,\n]+/).map(k => k.trim()).filter(Boolean);
      if (keys.length > 0) {
        const key = keys[lastKeyIndex % keys.length];
        lastKeyIndex = (lastKeyIndex + 1) % keys.length;
        return key;
      }
    }
  }
  
  return stored.trim() || process.env.GEMINI_API_KEY || '';
}

class DynamicAI {
  get models() {
    const rawModels = new GoogleGenAI({ apiKey: getApiKey() }).models;
    return {
      ...rawModels,
      generateContent: async (params: any) => {
        const modelId = params.model;
        const reqId = tokenTracker.recordRequestStart(modelId);
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
        } catch (err) {
          tokenTracker.recordRequestFailure(reqId);
          throw err;
        }
      },
      generateContentStream: async function* (params: any) {
        const modelId = params.model;
        const reqId = tokenTracker.recordRequestStart(modelId);
        try {
          const stream = await rawModels.generateContentStream(params);
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
        } catch (err) {
          tokenTracker.recordRequestFailure(reqId);
          throw err;
        }
      },
      embedContent: async (params: any) => {
        return await rawModels.embedContent(params);
      }
    };
  }

  get chats() {
    const rawChats = new GoogleGenAI({ apiKey: getApiKey() }).chats;
    return {
      ...rawChats,
      create: (params: any) => {
        const modelId = params.model;
        const session = rawChats.create(params);
        const rawSendMessageStream = session.sendMessageStream.bind(session);
        
        session.sendMessageStream = async (sendParams: any) => {
          const reqId = tokenTracker.recordRequestStart(modelId);
          try {
            const rawStream = await rawSendMessageStream(sendParams);
            
            async function* wrapperGenerator() {
              let finalMetadata: any = null;
              try {
                for await (const chunk of rawStream) {
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
              } catch (err) {
                tokenTracker.recordRequestFailure(reqId);
                throw err;
              }
            }
            
            return wrapperGenerator() as any;
          } catch (err) {
            tokenTracker.recordRequestFailure(reqId);
            throw err;
          }
        };
        
        return session;
      }
    };
  }
}
const ai = new DynamicAI() as unknown as GoogleGenAI;

const getPro = () => localStorage.getItem('aetheria_model_pro') || 'gemini-3.1-pro-preview';
const getFlash = () => localStorage.getItem('aetheria_model_flash') || 'gemini-3.5-flash';
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
  // Giao thức Thẩm định Tri thức Thực tế
  async verifyKnowledge(entities: string, story: Story): Promise<string> {
    if (!entities.trim()) return "";
    const prompt = promptBuilderService.buildKnowledgeVerificationPrompt(entities, story.setting);
    try {
      const response = await safeGenerateContent({
        model: getPro(),
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
      model: getPro(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        systemInstruction, 
        temperature: 1.0, 
        topP: 0.98, 
        thinkingConfig: { thinkingBudget: 8000 } 
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
    const prompt = `Bạn là một Nhà văn chuyên nghiệp viết tiểu thuyết trực tuyến xuất sắc.
Hãy viết hoặc chỉnh sửa/nâng cấp bản thảo (draft) cho chương "${chapter.title}" của tác phẩm "${story.title}" dựa trên các thông tin cốt truyện và định hướng mới sau đây:

[THỂ LOẠI]: ${story.genre}
[DANH SÁCH NHÂN VẬT CHÍNH]:
${story.characters?.map(c => `- ${c.name}: ${c.description} (Vai trò: ${c.role})`).join('\n')}

[BỐI CẢNH & THẾ GIỚI]:
${story.setting || "Chưa thiết lập"}

[ĐỀ CƯƠNG CHI TIẾT CHƯƠNG NÀY (OUTLINE)]:
${chapter.outline || "Chưa thiết lập. Hãy tự thiết kế các phân cảnh kịch tính."}

[BẢN THẢO HIỆN TẠI (NẾU CÓ)]:
${chapter.content || "(Trống - Hãy viết mới hoàn toàn)"}

Yêu cầu cụ thể:
1. ĐỀ CƯƠNG CHI TIẾT CHƯƠNG NÀY (OUTLINE) là nguồn ý tưởng và hướng dẫn duy nhất để viết, sửa đổi và xây dựng bản thảo chương truyện này.
2. TUYỆT ĐỐI KHÔNG sử dụng thông tin hay ý tưởng từ bất kỳ Tóm tắt (Summary) hay Dàn ý chung (Planning) nào khác của truyện để viết, tránh làm loãng hoặc gây mâu thuẫn lặp ý với Đề cương chi tiết chương này. Chỉ lấy ý từ Đề cương chi tiết (Outline).
3. Viết một chương truyện hoàn chỉnh, giàu chi tiết, nhịp điệu lôi cuốn, văn phong trau chuốt, giữ đúng tính cách các nhân vật.
4. Tuyệt đối không được tóm tắt chương, hãy viết dưới dạng truyện đọc trực tiếp (với lời thoại, hành động, miêu tả tâm lý và bối cảnh chi tiết).
5. Sử dụng các quy tắc kể chuyện từ ngôi kể: ${story.pov || "Ngôi thứ ba"} và phong cách đại từ: ${story.pronounStyle || "Tự nhiên"}.
6. Đảm bảo dung lượng đầy đủ, kịch tính, lôi cuốn.

Hãy viết/chỉnh sửa chương truyện ngay dưới đây:`;

    const response = await safeGenerateContent({ 
        model: getPro(), 
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            temperature: 0.85,
            thinkingConfig: { thinkingBudget: 16000 } 
        }
    });

    return { text: response.text || "", usageMetadata: response.usageMetadata };
  },

  async suggestOutline(chapter: Chapter, story: Story, userInstruction: string, longTermMemory: string, shortTermMemory: string): Promise<any> {
    const prompt = promptBuilderService.buildAdvancedOutlinePrompt(chapter, story, userInstruction, longTermMemory, shortTermMemory);
    const response = await safeGenerateContent({
      model: getPro(),
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 16000 } 
      }
    });
    return { text: response.text || "", usageMetadata: response.usageMetadata };
  },

  async analyzePlotArc(chapters: Chapter[], storyTitle: string): Promise<any> {
    const prompt = promptBuilderService.buildPlotArcAnalysisPrompt(chapters, storyTitle);
    try {
      const response = await safeGenerateContent({
        model: getPro(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });
      return { data: JSON.parse(response.text || "{}"), usageMetadata: response.usageMetadata };
    } catch (e) { return null; }
  },

  async extractKnowledge(text: string, story: Story, categories: ExtractionCategory[] = ['characters', 'world']): Promise<any> {
    const prompt = promptBuilderService.buildKnowledgeExtractionPrompt(text, story.characters, categories);
    try {
      const response = await safeGenerateContent({
        model: getPro(),
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
        model: getPro(),
        config: { 
          systemInstruction: `Bạn là Kiến trúc sư Cốt truyện. Hãy tư vấn dựa trên [CHỈ THỊ BỀN VỮNG]: ${story.persistentDirectives}.` 
        },
        history: history.map(h => ({ role: h.role, parts: h.parts }))
      });
      const response = await chat.sendMessageStream({ message });
      for await (const chunk of response) yield chunk as GenerateContentResponse;
    } catch (e) {
      console.warn("chatPlanningStream getPro() failed, chat falling back to getFlash():", e);
      chat = ai.chats.create({
        model: getFlash(),
        config: { 
          systemInstruction: `Bạn là Kiến trúc sư Cốt truyện. Hãy tư vấn dựa trên [CHỈ THỊ BỀN VỮNG]: ${story.persistentDirectives}.` 
        },
        history: history.map(h => ({ role: h.role, parts: h.parts }))
      });
      const response = await chat.sendMessageStream({ message });
      for await (const chunk of response) yield chunk as GenerateContentResponse;
    }
  },

  async *chatPlotStream(history: ChatMessage[], message: string, story: Story) {
    let chat;
    const chaptersContext = story.chapters.map((c, i) => `Chương ${i+1} (ID: ${c.id}) - Tiêu đề: ${c.title}:\nTóm tắt: ${c.summary || "Chưa có"}\nDàn ý: ${c.outline || "Chưa có"}\nBản thảo hiện tại (Trích đoạn): ${c.content ? (c.content.slice(0, 500) + (c.content.length > 500 ? "..." : "")) : "Chưa có"}`).join("\n\n");
    const systemInstruction = `Bạn là Chuyên gia Cố vấn & Đồng hành Hiệu đính Cốt truyện (AI Plot Collaborator & Co-Editor). Nhiệm vụ của bạn là cùng tác giả phân tích cốt truyện, phát hiện lỗ hổng logic, sửa chữa tác phẩm và đề xuất hướng phát triển cốt truyện tốt nhất.
Tên truyện: ${story.title}
Thể loại: ${story.genre}
Dàn ý tổng thể hiện tại: ${story.planning || "Chưa có"}

Các chương hiện tại:
${chaptersContext}

Bạn hãy trao đổi nhiệt tình, thân thiện và mang tính phân tích cao.
ĐẶC BIỆT: Bạn có quyền đưa ra đề xuất sửa đổi cấu trúc bằng cách thêm một trong các thẻ sau vào tin nhắn của bạn (nút "Áp dụng" sẽ tự động hiển thị cho người dùng để đồng bộ trực tiếp với bản thảo hoặc dàn ý):

- Để đề xuất cập nhật Dàn ý câu chuyện (Story Planning):
[PROPOSAL_PLANNING: <nội dung dàn ý mới>]

- Để đề xuất cập nhật Đề cương/Dàn ý một chương cụ thể (thay <chapterId> bằng ID của chương đó, ví dụ: [PROPOSAL_OUTLINE_CHAPTER_12345: nội dung đề cương]):
[PROPOSAL_OUTLINE_CHAPTER_<chapterId>: <nội dung đề cương mới>]

- Để đề xuất cập nhật Tóm tắt một chương cụ thể (thay <chapterId> bằng ID của chương đó):
[PROPOSAL_SUMMARY_CHAPTER_<chapterId>: <nội dung tóm tắt mới>]

- Để đề xuất cập nhật/sửa đổi trực tiếp Bản thảo/Nội dung chương viết (thay <chapterId> bằng ID của chương đó, ví dụ [PROPOSAL_CONTENT_CHAPTER_12345: nội dung bản thảo mới]):
[PROPOSAL_CONTENT_CHAPTER_<chapterId>: <toàn bộ nội dung bản thảo mới hoặc sửa đổi>]

Hãy viết phân tích sâu sắc và thân thiện bằng tiếng Việt.`;

    try {
      chat = ai.chats.create({
        model: getPro(),
        config: { systemInstruction },
        history: history.map(h => ({ role: h.role, parts: h.parts }))
      });
      const response = await chat.sendMessageStream({ message });
      for await (const chunk of response) yield chunk as GenerateContentResponse;
    } catch (e) {
      chat = ai.chats.create({
        model: getFlash(),
        config: { systemInstruction },
        history: history.map(h => ({ role: h.role, parts: h.parts }))
      });
      const response = await chat.sendMessageStream({ message });
      for await (const chunk of response) yield chunk as GenerateContentResponse;
    }
  },

  async searchCreativeInspiration(story: Story, customTopic?: string): Promise<any> {
    const prompt = `Nghiên cứu về: ${customTopic || story.genre}. Tìm các yếu tố phù hợp truyện "${story.title}".`;
    try {
      const response = await safeGenerateContent({
        model: getPro(),
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
            model: getPro(), 
            contents: [{ parts: [{ text: prompt }] }],
            config: { temperature: 0.8, thinkingConfig: { thinkingBudget: 4000 } }
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
        model: getPro(),
        contents: [{ parts: [{ text: prompt }] }],
        config: { 
            responseMimeType: "application/json",
            temperature: 0.95,
            thinkingConfig: { thinkingBudget: 8000 }
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
      model: getPro(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { thinkingConfig: { thinkingBudget: 16000 } }
    });
    for await (const chunk of stream) yield chunk;
  },

  async *refineSelectionStream(selection: string, prefix: string, suffix: string, story: Story, instruction: string) {
    const prompt = `Tinh chỉnh vùng chọn: "${selection}". Bối cảnh trước: "...${prefix.slice(-500)}". Bối cảnh sau: "${suffix.slice(0, 500)}...". Yêu cầu: ${instruction}.`;
    const stream = safeGenerateContentStream({
      model: getPro(),
      contents: [{ parts: [{ text: prompt }] }],
      config: { thinkingConfig: { thinkingBudget: 8000 } }
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
        model: getPro(), 
        contents: [{ parts: [{ text: prompt }] }],
        config: { temperature: 0.3, thinkingConfig: { thinkingBudget: 2000 } }
    });
    for await (const chunk of stream) {
      yield chunk;
    }
  },

  async generateVideo(summary: string, genre: string, apiKey: string): Promise<string | null> {
    const videoAi = new GoogleGenAI({ apiKey });
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
    return link ? `${link}&key=${apiKey}` : null;
  }
};
