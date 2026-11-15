
import { Character, Chapter, Story, ExtractionCategory, WritingDNA } from '../types.ts';
import { NSFW_INSTRUCTION } from './nsfwPrompt.ts';

const isAsoiafUniverse = (...fields: (string | undefined)[]): boolean => {
  const combined = fields.filter(Boolean).join(' ').toLowerCase();
  if (!combined) return false;
  return /asoiaf|a song of ice and fire|game of thrones|westeros|targaryen|stark|lannister|baratheon|valyrian|dragonstone|trò chơi vương quyền|bài ca băng và lửa|gia tộc rồng|bảy vương quốc/.test(combined);
};

const isModernOrContemporaryGenre = (genre?: string, setting?: string): boolean => {
  const combined = `${genre || ''} ${setting || ''}`.toLowerCase();
  return /hiện đại|đô thị|ngôn tình|trinh thám|kinh dị|học đường|khoa huyễn|sci-fi|cyberpunk|slice of life|modern|urban|contemporary|light novel|isekai/.test(combined);
};

const WRITING_COMMANDMENTS = `
[GIAO THỨC VIẾT VĂN CHUYÊN NGHIỆP - LITERARY CRAFT PROTOCOL]

1. KỸ THUẬT "DEEP POV" & "SENSORY IMMERSION":
- HẠN CHẾ các "từ lọc" (filter words) làm xa cách người đọc: "Hắn cảm thấy lạnh", "Nàng nhìn thấy", "Ta nghe được".
-> VIẾT TRỰC TIẾP: "Cơn gió buốt giá luồn qua khe áo", "Bóng đen lướt qua tầm mắt", "Tiếng sấm rền vang".
- Kết hợp linh hoạt nhiều giác quan trong phân cảnh quan trọng (Thị giác, Thính giác, Xúc giác, Khứu giác, Vị giác) phù hợp với bối cảnh truyện.

2. NGUYÊN LÝ "TẢNG BĂNG TRÔI" (SUBTEXT):
- Nhân vật không nói toẹt ra toàn bộ suy nghĩ. Hãy để hành động, ánh mắt, khoảng lặng và những câu thoại có ẩn ý bộc lộ nội tâm.
- Tạo chiều sâu tâm lý: Sự giằng xé giữa lý trí và cảm xúc, giữa mục tiêu cá nhân và hoàn cảnh.

3. NHỊP ĐIỆU VĂN CHƯƠNG (DYNAMIC PACING):
- Cảnh hành động/Nguy hiểm: Dùng câu ngắn, động từ mạnh, tiết tấu dồn dập.
- Cảnh nội tâm/Mô tả: Dùng câu giàu hình ảnh, nhịp điệu lắng đọng, gợi cảm.
- Tránh lặp lại cấu trúc đầu câu liên tiếp (Vd: Không viết 3-4 câu liền cùng mở đầu bằng "Hắn...").

4. SỰ CHÍNH XÁC VỀ CHI TIẾT (SPECIFICITY):
- Ưu tiên chi tiết cụ thể, sống động thay cho tính từ chung chung sáo rỗng.
`;

const ASOIAF_KNOWLEDGE_MATRIX = `
[BÁCH KHOA VŨ TRỤ A SONG OF ICE AND FIRE (GAME OF THRONES) - CHỈ ÁP DỤNG CHO ĐỒNG NHÂN/BỐI CẢNH WESTEROS]:
1. Các Đại Gia Tộc & Chư Hầu: Stark, Lannister, Targaryen, Baratheon, Tyrell, Martell, Greyjoy, Bolton, Hightower, Velaryon, Dayne, Frey, Mormont, Manderly, Tarly.
2. Tổ chức & Thế lực: Golden Company, Iron Bank, Faceless Men, Citadel (Maester), Night's Watch.
3. Quy tắc Rồng, Chiến tranh & Văn hóa: Hậu cần chiến trường, Quyền Khách (Guest Right), lời thề phong kiến, chi phí phép thuật, tiền tệ (Rồng Vàng, Hươu Bạc).
`;

const UNIVERSAL_RATIONALITY_PROTOCOL = `
[GIAO THỨC LOGIC & CHỐNG SÁO RỖNG (CONSISTENCY & RATIONALITY GUARDRAILS)]
AI TUYỆT ĐỐI KHÔNG ĐƯỢC VI PHẠM CÁC QUY TẮC SAU ĐÂY:

1. 🧠 LOGIC HÀNH ĐỘNG & TÂM LÝ NHÂN VẬT:
   - Không có nhân vật hành động ngu ngốc chỉ để đẩy cốt truyện. Mọi nhân vật (kể cả phản diện hay nhân vật phụ) đều phải có động cơ, lợi ích và giới hạn nhận thức hợp lý.
   - Không bẻ cong tính cách (OOC): Hành động, lời thoại và cách xưng hô phải nhất quán với hồ sơ nhân vật và các chương trước.

2. ⚖️ NHẤT QUÁN HỆ THỐNG SỨC MẠNH & GIỚI HẠN VẬT LÝ:
   - Tuân thủ nghiêm ngặt quy tắc thế giới / hệ thống sức mạnh (Mechanics) đã thiết lập. Không tự ý buff/nerf vô lý hay xuất hiện năng lực từ hư không.
   - Chấn thương, thể lực và tài nguyên tiêu hao phải có hậu quả thực tế qua từng phân cảnh.

3. 🔒 TRUTH KEEPER (BẢO TOÀN SỰ THẬT & LIÊN TỤC):
   - Tuyệt đối tuân thủ các sự kiện, mốc thời gian, địa điểm và vật phẩm đã xuất hiện trong các chương trước.
   - Vị trí nhân vật phải hợp lý (không dịch chuyển tức thời vô giải thích).
   - Tri thức nhân vật phải khớp thời điểm: Nhân vật chưa chứng kiến sự kiện A thì không thể hành động như đã biết sự kiện A.
`;

const TRUTH_KEEPER_PROTOCOL = `
[GIAO THỨC BẢO TOÀN SỰ THẬT - TRUTH KEEPER]
Để tránh Hallucination và đảm bảo tính liên tục mạch truyện:
1. 🔒 **QUY TẮC BẤT BIẾN VỀ QUÁ KHỨ:** Mọi chi tiết đã xảy ra trong bản thảo các chương trước là sự thật nền tảng. Không viết mâu thuẫn với diễn biến cũ trừ khi đang chủ đích sửa lỗi đó theo yêu cầu tác giả.
2. 📍 **TÍNH LIÊN TỤC KHÔNG-THỜI GIAN:** Vị trí, vết thương, trang bị, mối quan hệ và xưng hô của nhân vật phải nối tiếp mượt mà giữa các chương.
3. 🧩 **ĐỐI CHIẾU CHÉO:** Luôn kiểm tra xem chi tiết sắp viết có làm vỡ lời hứa cốt truyện (plot hook) hoặc quy tắc thế giới hay không.
`;

export const ORIGINAL_FIDELITY_PROTOCOL = `
[GIAO THỨC TỐI THƯỢNG: BẢO TỒN 100% CHI TIẾT NGUYÊN MẪU & BẢN THẢO GỐC (DRAFT & CANON FIDELITY)]
⚠️ KHI CHỈNH SỬA, TINH CHỈNH HOẶC NÂNG CẤP VĂN BẢN (REVISE/REFINE/EDIT/REWRITE):
1. 🛡️ BẢO TỒN CHI TIẾT NGUYÊN MẪU (PRESERVE ALL SPECIFIC DETAILS):
   - TUYỆT ĐỐI KHÔNG ĐƯỢC LÀM MẤT các chi tiết đã có trong bản gốc/nguyên mẫu: Tên nhân vật, danh xưng, đặc điểm ngoại hình, vật phẩm/vũ khí, từng câu thoại đắt giá, bối cảnh vi mô, tình tiết phụ, các cử chỉ/hành động cụ thể và cảm xúc tinh tế.
   - Giữ nguyên vẹn tính cách, phong thái, thói quen xưng hô và động cơ của từng nhân vật theo đúng nguyên mẫu.
2. 🚫 CẤM TÓM TẮT & RÚT GỌN VÔ CỚ (NO SUMMARIZATION/NO OMISSIONS):
   - Bản chỉnh sửa PHẢI DUY TRÌ HOẶC MỞ RỘNG độ dài so với bản gốc (tối thiểu 100% - 130% dung lượng bản cũ, trừ khi người dùng yêu cầu rút gọn).
   - Tuyệt đối KHÔNG được biến các đoạn đối thoại chi tiết, các phân cảnh miêu tả sống động thành 1-2 câu tóm tắt hời hợt.
3. ✨ NÂNG CẤP VĂN PHONG NHƯNG GIỮ NGUYÊN BẢN SẮC:
   - Nhiệm vụ chỉnh sửa là: Làm giàu hình ảnh, trau chuốt từ ngữ, vá lỗi mâu thuẫn logic/liên kết mạch truyện và giữ đúng bản sắc tác giả — KHÔNG PHẢI là xóa đi viết câu chuyện hoàn toàn xa lạ.
`;

export function sampleManuscript(content: string, maxChars: number): string {
  if (!content || content.trim().length === 0) return "(Chưa có bản thảo)";
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) return trimmed;

  const openingLen = Math.floor(maxChars * 0.40);
  const midLen = Math.floor(maxChars * 0.35);
  const endingLen = Math.floor(maxChars * 0.25);

  const opening = trimmed.slice(0, openingLen);
  const midStart = Math.max(openingLen, Math.floor((trimmed.length - midLen) / 2));
  const middle = trimmed.slice(midStart, midStart + midLen);
  const ending = trimmed.slice(Math.max(0, trimmed.length - endingLen));

  return `${opening}\n\n[... Trích đoạn diễn biến thân bài ...]\n\n${middle}\n\n[... Trích đoạn phân cảnh kết chương ...]\n\n${ending}`;
}

export function formatSmartChapterContext(
  chapters: Chapter[], 
  options: { 
    maxTotalChars?: number;
    focusChapterId?: string;
    targetChapterMention?: string;
  } = {}
): string {
  if (!chapters || chapters.length === 0) return "(Chưa có chương truyện nào)";

  const maxTotalChars = options.maxTotalChars || 65000;
  const numChapters = chapters.length;
  const focusId = options.focusChapterId;
  const mentionText = (options.targetChapterMention || "").trim().toLowerCase();

  const getDisplayText = (c: Chapter) => (c.content?.trim() ? c.content : (c.translatedContent || ''));

  // If entire story content fits within budget, deliver 100% full verbatim manuscript for ALL chapters!
  const totalRawChars = chapters.reduce((acc, c) => acc + getDisplayText(c).length, 0);
  if (totalRawChars <= maxTotalChars) {
    return chapters.map((c, i) => {
      const text = getDisplayText(c);
      return `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id}) ===
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (MANUSCRIPT NGUYÊN MẪU - ĐẦY ĐỦ 100%)]:
${text.trim().length > 0 ? text : "(Chương này chưa có bản thảo chi tiết)"}`;
    }).join('\n\n----------------------------------------\n\n');
  }

  // Identify prioritized chapters (Target/Mentioned or Focused)
  const isTarget = (c: Chapter, i: number) => {
    if (focusId && c.id === focusId) return true;
    if (mentionText.length >= 2) {
      const chNum = i + 1;
      const patterns = [
        `chương ${chNum}`,
        `chuong ${chNum}`,
        `chương ${chNum}:`,
        `c${chNum}`,
        `c ${chNum}`
      ];
      if (patterns.some(p => mentionText.includes(p))) return true;
      if (c.title && c.title.trim().length >= 3 && mentionText.includes(c.title.trim().toLowerCase())) return true;
      if (c.id && c.id.trim().length >= 4 && mentionText.includes(c.id.trim())) return true;
    }
    return false;
  };

  const targetIndices = new Set<number>();
  chapters.forEach((c, idx) => {
    if (isTarget(c, idx)) targetIndices.add(idx);
  });

  if (targetIndices.size === 0) {
    const lastWithContent = chapters.map((c, i) => ({ hasContent: getDisplayText(c).trim().length > 0, idx: i }))
      .filter(item => item.hasContent)
      .pop();
    if (lastWithContent !== undefined) {
      targetIndices.add(lastWithContent.idx);
    } else {
      targetIndices.add(0);
    }
  }

  const neighborIndices = new Set<number>();
  targetIndices.forEach(idx => {
    if (idx > 0) neighborIndices.add(idx - 1);
    if (idx < numChapters - 1) neighborIndices.add(idx + 1);
  });
  neighborIndices.add(0);
  if (numChapters > 1) neighborIndices.add(numChapters - 1);
  targetIndices.forEach(idx => neighborIndices.delete(idx));

  const targetCharsAllocated = Math.min(35000, Math.floor(maxTotalChars * 0.58));
  const perTargetBudget = Math.floor(targetCharsAllocated / Math.max(1, targetIndices.size));

  const isLargeStory = numChapters > 25;
  const remainingBudget = Math.max(5000, maxTotalChars - targetCharsAllocated);
  const sampleCandidateCount = isLargeStory ? Math.max(1, neighborIndices.size) : Math.max(1, numChapters - targetIndices.size);
  const perSampleBudget = Math.min(3500, Math.max(350, Math.floor((remainingBudget * 0.7) / sampleCandidateCount)));

  const renderedChapters: string[] = [];
  const distantSummaries: string[] = [];

  for (let i = 0; i < numChapters; i++) {
    const c = chapters[i];
    const isFocused = targetIndices.has(i);
    const isNeighbor = neighborIndices.has(i);
    const fullText = getDisplayText(c);
    const hasContent = fullText.trim().length > 0;

    if (isFocused) {
      const rawText = hasContent
        ? (fullText.length > perTargetBudget ? fullText.substring(0, perTargetBudget) + `\n\n[... Trích đoạn ${perTargetBudget.toLocaleString()} ký tự đầu của chương ...]` : fullText)
        : "(Chương này chưa có bản thảo chi tiết)";
      const block = `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id}) [ĐANG TẬP TRUNG / ĐƯỢC CHỈ ĐỊNH] ===
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (MANUSCRIPT NGUYÊN MẪU)]:
${rawText}`;
      renderedChapters.push(block);
      continue;
    }

    if (!isLargeStory || isNeighbor) {
      const sample = hasContent ? sampleManuscript(fullText, perSampleBudget) : "(Chương này chưa có bản thảo chi tiết)";
      const block = `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id}) ===
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (TRÍCH ĐOẠN)]:
${sample}`;
      renderedChapters.push(block);
      continue;
    }

    const compactSummary = c.summary?.trim() || c.outline?.trim() || (hasContent ? sampleManuscript(fullText, 240) : "(Chưa có nội dung)");
    distantSummaries.push(`• Chương ${i + 1} (${c.title}): ${compactSummary.slice(0, 220)}`);
  }

  if (distantSummaries.length > 0) {
    renderedChapters.push(`=== TỔNG QUAN CÁC CHƯƠNG KHÁC TRONG BỘ TRUYỆN (${distantSummaries.length} chương) ===\n${distantSummaries.join('\n')}`);
  }

  const fullResult = renderedChapters.join('\n\n----------------------------------------\n\n');
  if (fullResult.length > maxTotalChars) {
    return fullResult.substring(0, maxTotalChars) + "\n\n[... Đã cắt bớt để bảo toàn giới hạn ngữ cảnh ...]";
  }
  return fullResult;
}

const formatCharacterRosterForPrompt = (characters: Character[], maxCount = 35): string => {
  if (!characters || characters.length === 0) return "(Chưa có hồ sơ nhân vật)";
  return characters.slice(0, maxCount).map(c => {
    const entityLabel = c.entityType === 'creature' ? 'Sinh vật/Thú' : c.entityType === 'spirit' ? 'Tinh linh/Hồn' : c.entityType === 'object' ? 'Pháp bảo/Vật phẩm' : 'Nhân vật';
    const parts = [
      `Vai trò: ${c.role || 'Phụ'}`,
      `Loại: ${entityLabel}${c.species ? ` (${c.species})` : ''}`,
      `Trạng thái: ${c.status || 'alive'}`,
      c.currentLocation ? `Vị trí: ${c.currentLocation}` : '',
      c.healthStatus ? `Thể trạng/Vết thương: ${c.healthStatus}` : '',
      c.combatState ? `Chiến trạng: ${c.combatState}` : '',
      c.powerLevel ? `Thực lực/Cảnh giới: ${c.powerLevel}` : '',
      c.abilities ? `Kỹ năng: ${c.abilities}` : '',
      c.traits?.length ? `Tính cách/Đặc trưng: ${c.traits.join(', ')}` : '',
      c.knowledge ? `Tri thức nắm giữ: ${c.knowledge}` : '',
      c.mentors ? `Người dẫn dắt: ${c.mentors}` : '',
      c.enemies ? `Đối trọng/Kẻ thù: ${c.enemies}` : '',
      c.appearance ? `Ngoại hình: ${c.appearance}` : '',
      c.description ? `Mô tả: ${c.description}` : ''
    ].filter(Boolean);
    return `- ${c.name}: ${parts.join(' | ')}`;
  }).join('\n');
};

export const promptBuilderService = {
  buildStoryFoundationPrompt: (seedIdea: string, genre: string): string => {
    return `Khởi tạo nền tảng một tác phẩm tiểu thuyết đắt giá dựa trên ý tưởng: "${seedIdea}" với thể loại: "${genre}".
Trả về JSON hợp lệ gồm các trường:
{
  "title": "Tên truyện ấn tượng",
  "synopsis": "Văn án hấp dẫn, có hook và nêu bật xung đột cốt lõi",
  "setting": "Mô tả chi tiết bối cảnh thế giới, địa lý, xã hội và các thế lực chính",
  "planning": "Dàn ý tổng thể 3-4 hồi phát triển cốt truyện",
  "mechanics": "Hệ thống sức mạnh, phép thuật, công nghệ hoặc quy luật đặc thù của tác phẩm",
  "interactionRules": "Quy tắc xưng hô, văn hóa giao tiếp và ràng buộc logic quan trọng"
}`;
  },

  buildDNAExtractionPrompt: (text: string): string => {
    return `[NHIỆM VỤ: CHIẾT TÁCH HỒN VĂN (WRITING DNA)]
Hãy phân tích đoạn văn bản sau và trích xuất "Hệ gen văn chương" đặc trưng của tác giả.

VĂN BẢN MẪU:
"""
${sampleManuscript(text, 14000)}
"""

TRẢ VỀ JSON:
{
  "narrativeVoice": "Giọng kể (Vd: Lạnh lùng, Sử thi, Trữ tình, Châm biếm, Tự sự ngôi 1...)",
  "vocabularyPalette": ["Danh sách 8-12 từ/cụm từ đặc trưng tác giả hay dùng"],
  "sentenceStructure": "Cấu trúc câu đặc trưng",
  "thematicElements": ["Các mô-típ/hình ảnh biểu tượng lặp lại"],
  "emotionalTone": "Sắc thái cảm xúc chủ đạo",
  "rhythm": "Nhịp điệu văn chương"
}`;
  },

  buildSystemInstruction: (
    genre: string, 
    worldBible: string, 
    pov: string, 
    pronounStyle: string, 
    writingStyle: string,
    interactionRules: string,
    negativePrompt: string,
    nsfw: boolean = false,
    hasSystem: boolean = false,
    mechanics: string = "",
    persistentDirectives: string = "",
    writingDNA?: WritingDNA
  ): string => {
    const contentRating = nsfw ? NSFW_INSTRUCTION : "CHẾ ĐỘ AN TOÀN: BẬT. Tránh nội dung phản cảm quá mức không phục vụ mạch truyện.";
    
    const systemInstructionText = hasSystem 
        ? "✅ CHẾ ĐỘ HỆ THỐNG (SYSTEM/LITRPG): BẬT. Được phép hiển thị bảng trạng thái (Status Window), Nhiệm vụ (Quest), Thông báo hệ thống và chỉ số nhân vật phù hợp bối cảnh."
        : "⛔ CHẾ ĐỘ HỆ THỐNG (SYSTEM/LITRPG): TẮT. Không tự ý chèn bảng trạng thái game, thông báo hệ thống hay hiệu ứng 'Ding!' nếu truyện không thuộc thể loại Hệ thống.";

    const dnaInstruction = writingDNA ? `
[KÍCH HOẠT HỒN VĂN (WRITING DNA)]:
Hãy viết bám sát dấu ấn văn phong đặc trưng của tác phẩm:
- Giọng kể: ${writingDNA.narrativeVoice}
- Từ vựng đặc trưng: ${(writingDNA.vocabularyPalette || []).join(', ')}
- Nhịp điệu: ${writingDNA.rhythm}
- Cấu trúc câu: ${writingDNA.sentenceStructure}
- Sắc thái cảm xúc: ${writingDNA.emotionalTone}` : "";

    const asoiafBlock = isAsoiafUniverse(genre, worldBible, mechanics, interactionRules) ? ASOIAF_KNOWLEDGE_MATRIX : "";
    const languageToneRule = isModernOrContemporaryGenre(genre, worldBible)
      ? "- TUÂN THỦ NGÔN NGỮ BỐI CẢNH HIỆN ĐẠI/CẬN ĐẠI: Lời thoại và trần thuật tự nhiên, tránh dùng từ cổ trang Hán-Việt gượng gạo ('bản tọa', 'ngươi-ta') trừ khi là biệt danh/trích dẫn."
      : `- TUÂN THỦ NGÔN NGỮ ĐÚNG THỂ LOẠI (${genre || 'Tiểu thuyết'}): Tránh dùng từ ngữ lạc tông hoặc từ tiếng Anh hiện đại sáo rỗng ('OK', 'Hello', 'Bye') trong bối cảnh cổ đại/huyền huyễn.`;

    return `[GIAO THỨC VIẾT TRUYỆN CHUYÊN NGHIỆP - AETHERIA LITERARY ENGINE]
Bạn là một Nhà văn & Tổng biên tập tiểu thuyết kỳ cựu chuyên viết thể loại: ${genre || 'Tiểu thuyết'}.
Mục tiêu: Tạo ra những chương truyện có mạch lạc chặt chẽ, tâm lý nhân vật có chiều sâu, nhất quán tuyệt đối với toàn bộ tác phẩm và trung thành với văn phong của bộ truyện.

${WRITING_COMMANDMENTS}
${TRUTH_KEEPER_PROTOCOL}
${asoiafBlock}
${UNIVERSAL_RATIONALITY_PROTOCOL}
${dnaInstruction}

[THIẾT LẬP THẾ GIỚI (WORLD BIBLE)]
- Thể loại: ${genre || 'Tiểu thuyết'} | Góc nhìn (POV): ${pov || 'Ngôi thứ 3'}
- Phong cách mong muốn: ${writingStyle || 'Tự nhiên, lôi cuốn, giàu hình ảnh'}
- Bối cảnh thế giới: ${worldBible || '(Chưa thiết lập chi tiết)'}
- Hệ thống sức mạnh / Cơ chế thế giới (Mechanics): ${mechanics || '(Không có quy tắc đặc biệt)'}

[CẤU HÌNH HỆ THỐNG (LITRPG CONFIG)]
${systemInstructionText}

[QUY TẮC XƯNG HÔ & TƯƠNG TÁC]
- Quy tắc xưng hô: ${pronounStyle || 'Nhất quán theo vai vế và bối cảnh truyện'}
- Quy tắc tương tác: ${interactionRules || '(Không có ràng buộc thêm)'}

[CHỈ THỊ BỀN VỮNG (LUÔN GHI NHỚ)]
${persistentDirectives || '(Không có)'}

[ĐIỀU CẤM (NEGATIVE PROMPT)]
${negativePrompt || '(Không có)'}
- CẤM văn phong sáo rỗng, lặp cấu trúc câu, kể lể thay vì miêu tả (Show, don't tell).
- CẤM nhân vật hành động thiếu động cơ hoặc mâu thuẫn tính cách (OOC).
- CẤM sai lệch các sự kiện, vật phẩm, thương tích và vị trí nhân vật đã xảy ra trước đó.
${languageToneRule}

${contentRating}`;
  },

  buildForgePrompt: (
    immediateContext: string,
    worldBible: string,
    planning: string,
    characters: Character[],
    interactionRules: string,
    userInstruction: string = "",
    pronounStyle: string = "",
    targetWordCount: number = 2000,
    persistentDirectives: string = "",
    mechanics: string = "",
    chapterOutline: string = "",
    verificationReport: string = "",
    currentChapterTime: string = "",
    previousChapterTime: string = "",
    currentTimeline: string = "",
    historicalContext: string = "",
    canonContext: string = "",
    genre: string = "",
    fandomName: string = ""
  ): string => {
    const hasExistingContent = immediateContext.trim().length > 10;
    const isAsoiaf = isAsoiafUniverse(genre, worldBible, mechanics, fandomName);
    
    const mainChar = characters.find(c => c.role === 'Chính' || c.role === 'Main');
    const narrativeFocus = mainChar 
        ? `[TIÊU ĐIỂM TƯỜNG THUẬT]: Chú trọng góc nhìn, cảm xúc và mục tiêu hiện tại của nhân vật chính "${mainChar.name}".` 
        : "";

    const charMemoryBlock = characters.length > 0
      ? formatCharacterRosterForPrompt(characters, 25)
      : "(Chưa có hồ sơ nhân vật cụ thể — hãy dựa vào ngữ cảnh bản thảo)";

    const historicalBlock = historicalContext 
        ? `[DỮ LIỆU LỊCH SỬ THỰC TẾ (HISTORICAL GROUNDING)]:
Mốc thời gian "${currentTimeline}":
${historicalContext}` 
        : "";

    const canonBlock = canonContext
        ? `[TUÂN THỦ NGUYÊN TÁC (CANON COMPLIANCE PROTOCOL)]:
Giữ đúng thiết lập thế giới, tính cách nhân vật và quy luật vũ trụ gốc:
${canonContext}`
        : "";

    return `[NHIỆM VỤ: VIẾT TIẾP / KIẾN TẠO MẠCH TRUYỆN NHẤT QUÁN]

[TÓM TẮT ĐỊNH HƯỚNG TỔNG THỂ (MASTER BLUEPRINT)]:
${planning ? planning.slice(0, 3000) : "(Chưa có dàn ý tổng thể)"}

[BỐI CẢNH & TRI THỨC LIÊN QUAN]:
${worldBible ? worldBible.slice(0, 6000) : "(Theo ngữ cảnh chương trước)"}
${mechanics ? `\n- Quy tắc / Hệ thống sức mạnh: ${mechanics}` : ""}
${interactionRules ? `\n- Quy tắc tương tác & Xưng hô (${pronounStyle}): ${interactionRules}` : (pronounStyle ? `\n- Quy tắc xưng hô: ${pronounStyle}` : "")}
${persistentDirectives ? `\n- Chỉ thị bền vững: ${persistentDirectives}` : ""}
${verificationReport ? `\n- Xác thực tri thức: ${verificationReport}` : ""}

[NGỮ CẢNH CHƯƠNG HIỆN TẠI & LIỀN TRƯỚC]:
- Dàn ý chương đang viết: ${chapterOutline || "(Tự triển khai nối tiếp tự nhiên từ diễn biến trước)"}
${hasExistingContent ? `- Đoạn văn bản liền trước (BẮT BUỘC NỐI TIẾP LIỀN MẠCH KHÔNG LẶP LẠI):\n"""\n${immediateContext.slice(-3500)}\n"""` : "- Trạng thái: KHỞI TẠO PHÂN CẢNH MỞ ĐẦU CHƯƠNG MỚI"}

[MỐC THỜI GIAN]:
- Dòng thời gian truyện: "${currentTimeline || 'Không xác định'}"
- Thời gian chương trước: "${previousChapterTime || 'Không rõ'}" -> Thời gian chương hiện tại: "${currentChapterTime || 'Tiếp diễn tự nhiên'}"

${historicalBlock}
${canonBlock}
${narrativeFocus}

[HỒ SƠ NHÂN VẬT & TRẠNG THÁI HIỆN TẠI]:
${charMemoryBlock}

[CHỈ ĐẠO CỦA TÁC GIẢ CHO ĐOẠN NÀY]:
"${userInstruction || "Viết tiếp mạch truyện một cách tự nhiên, nhất quán với tâm lý nhân vật, bối cảnh thế giới và các chi tiết đã xảy ra."}"

[YÊU CẦU THỰC THI]:
1. **Nối tiếp liền mạch tuyệt đối:** Tiếp tục ngay từ điểm dừng cuối cùng, tôn trọng vị trí, vết thương, tri thức, xưng hô và vật phẩm của từng nhân vật.
2. **Show, Don't Tell:** Tái hiện cảnh qua hành động, đối thoại có hồn, cảm giác trực tiếp và diễn biến tâm lý tinh tế; không tóm tắt sự kiện.
3. **Phân biệt loại thực thể:** Nếu nhân vật là Thú/Sinh vật hoặc Tinh linh/Khí linh, hãy mô tả hành vi, giao tiếp và năng lực đúng bản chất chủng loài của thực thể đó.
${isAsoiaf ? "4. **Hương vị Westeros/ASOIAF:** Giữ đúng bầu không khí chính trị thực tế, gia tộc và ngôn ngữ đặc trưng." : `4. **Độ dài & Nhịp điệu:** Viết khoảng ~${targetWordCount} từ với nhịp điệu chặt chẽ, phù hợp thể loại ${genre || 'của truyện'}.`}

BẮT ĐẦU VIẾT TIẾP NỘI DUNG TRUYỆN (Chỉ trả về phần văn bản truyện nối tiếp, không lặp lại đoạn cũ và không thêm lời bình luận):`;
  },

  buildChapterPlotWriteOrFixPrompt: (
    chapter: Chapter,
    story: Story,
    options: { repairInstruction?: string; continuityNotes?: string } = {}
  ): string => {
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = sortedChapters.findIndex(c => c.id === chapter.id);
    const prevChapter = idx > 0 ? sortedChapters[idx - 1] : undefined;
    const nextChapter = idx >= 0 && idx < sortedChapters.length - 1 ? sortedChapters[idx + 1] : undefined;

    const currentDraft = chapter.content?.trim() ? chapter.content : (chapter.translatedContent || '');
    const hasOriginalDraft = currentDraft.trim().length > 30;
    const prevDraft = prevChapter ? (prevChapter.content?.trim() ? prevChapter.content : (prevChapter.translatedContent || '')) : '';

    const activeKnowledge = (story.knowledgeLogs || [])
      .filter(k => k.isActive)
      .slice(-20)
      .map(k => `- [${k.category}] ${k.title}: ${k.content}`)
      .join('\n') || '(Chưa có)';

    const dnaBlock = story.writingDNA
      ? `[HỒN VĂN TÁC GIẢ]: Giọng kể: ${story.writingDNA.narrativeVoice} | Nhịp: ${story.writingDNA.rhythm} | Sắc thái: ${story.writingDNA.emotionalTone} | Từ vựng đặc trưng: ${(story.writingDNA.vocabularyPalette || []).join(', ')}`
      : '';

    return `[NHIỆM VỤ: ${hasOriginalDraft ? 'SỬA CHỮA & HOÀN THIỆN BẢN THẢO CHƯƠNG THEO MẠCH LẠC TOÀN TRUYỆN' : 'SOẠN THẢO BẢN THẢO CHƯƠNG MỚI THEO CỐT TRUYỆN'}]
Bạn là Đại biên tập và Nhà văn chủ bút của bộ truyện "${story.title}".

[HỒ SƠ THẾ GIỚI & QUY TẮC CỐT LÕI]:
- Thể loại: ${story.genre || 'Tiểu thuyết'} | Ngôi kể (POV): ${story.pov || 'Ngôi thứ ba'} | Xưng hô chuẩn: ${story.pronounStyle || 'Nhất quán theo vai vế'}
- Dàn ý tổng thể (Master Blueprint): ${story.planning || '(Chưa thiết lập)'}
- Bối cảnh (Setting): ${story.setting || '(Chưa thiết lập)'}
- Hệ thống / Quy tắc thế giới (Mechanics): ${story.mechanics || '(Chưa thiết lập)'}
- Quy tắc tương tác & Ràng buộc: ${story.interactionRules || '(Không có)'}
- Chỉ thị bền vững: ${story.persistentDirectives || '(Không có)'}
${story.negativePrompt ? `- Điều cấm (Negative Prompt): ${story.negativePrompt}` : ''}
${dnaBlock}

[TRI THỨC NỀN ĐÃ KHÓA]:
${activeKnowledge}

[DANH SÁCH NHÂN VẬT & TRẠNG THÁI]:
${formatCharacterRosterForPrompt(story.characters || [], 30)}

[NGỮ CẢNH LIỀN KỀ ĐỂ BẢO ĐẢM MẠCH LẠC]:
- Chương trước: ${prevChapter ? `"${prevChapter.title}"\n  * Tóm tắt: ${prevChapter.summary || prevChapter.outline || '(Chưa có)'}\n  * Đoạn kết chương trước (điểm nối đầu chương này):\n"""\n${prevDraft.slice(-1800) || '(Trống)'}\n"""` : '(Đây là chương đầu tiên)'}
- Chương kế tiếp: ${nextChapter ? `"${nextChapter.title}" — ${nextChapter.summary || nextChapter.outline || '(Chưa có tóm tắt/đề cương)'}` : '(Chưa có chương kế tiếp)'}

[CHƯƠNG MỤC TIÊU: "${chapter.title}"]
- Mốc thời gian: ${chapter.timeSetting || '(Tiếp nối tự nhiên)'}
- Đề cương / Mục tiêu chương (Outline): ${chapter.outline || '(Chưa thiết lập đề cương — bám sát mạch truyện và diễn biến sẵn có)'}
${chapter.summary ? `- Tóm tắt chương (Summary): ${chapter.summary}` : ''}
${options.continuityNotes ? `- Vấn đề mạch lạc / logic cần vá:\n${options.continuityNotes}` : ''}
${options.repairInstruction ? `- Yêu cầu sửa chữa cụ thể từ tác giả:\n${options.repairInstruction}` : ''}

[BẢN THẢO HIỆN TẠI CỦA CHƯƠNG "${chapter.title}"]:
${hasOriginalDraft ? currentDraft : '(Trống — Hãy viết mới hoàn toàn dựa trên đề cương và mạch truyện)'}

${ORIGINAL_FIDELITY_PROTOCOL}

[YÊU CẦU BẮT BUỘC]:
1. ${hasOriginalDraft
  ? 'BẢO TỒN 100% các chi tiết, tên nhân vật, lời thoại, vật phẩm và diễn biến hay trong bản thảo hiện tại; CHỈ sửa chữa những chỗ gãy mạch, mâu thuẫn logic, lệch xưng hô, lặp ý hoặc nâng cấp văn phong theo yêu cầu.'
  : 'Bám sát Đề cương chương và điểm nối cuối chương trước để viết thành chương truyện hoàn chỉnh giàu chi tiết, lời thoại và tâm lý.'}
2. Khớp nối mượt mà với đoạn kết chương trước và mở đường hợp lý sang chương kế tiếp.
3. Tuyệt đối KHÔNG tóm tắt, KHÔNG rút gọn, KHÔNG viết chú thích của AI ở đầu hoặc cuối. Chỉ trả về toàn văn chương truyện hoàn chỉnh.`;
  },

  buildAdvancedOutlinePrompt: (chapter: Chapter, story: Story, userInstruction: string, longTermMemory: string, shortTermMemory: string): string => {
    const characterList = formatCharacterRosterForPrompt(story.characters || [], 25);

    const strategySection = userInstruction.trim()
        ? `[CHIẾN LƯỢC: ƯU TIÊN CHỈ ĐẠO CỦA TÁC GIẢ]\nChỉ đạo mới: "${userInstruction}"`
        : `[CHIẾN LƯỢC: BÁM SÁT BLUEPRINT TỔNG]\nDàn ý tổng: ${story.planning || "(Phát triển tự nhiên dựa trên bối cảnh và diễn biến hiện tại)"}`;

    return `[NHIỆM VỤ: KIẾN TRÚC SƯ CỐT TRUYỆN - THIẾT KẾ DÀN Ý CHƯƠNG NHẤT QUÁN]
Hãy thiết kế một dàn ý chi tiết (Beat Sheet) cho chương "${chapter.title}" của bộ truyện "${story.title}".
Thể loại: ${story.genre || 'Tiểu thuyết'} | Phong cách viết: ${story.writingStyle || story.writingDNA?.narrativeVoice || 'Sâu sắc, logic, lôi cuốn'}.

${strategySection}

[BỐI CẢNH & DỮ LIỆU LIÊN TỤC]:
- Thế giới & Quy tắc: ${story.setting || '(Chưa có)'} ${story.mechanics ? `| Cơ chế: ${story.mechanics}` : ''}
- Dòng thời gian: ${story.currentTimeline || '(Không xác định)'}
- LTM (Các chương trước): ${longTermMemory || '(Chưa có tóm tắt chương trước)'}
- STM (Nội dung/Diễn biến gần nhất): ${shortTermMemory || '(Chưa có)'}
- Hồ sơ nhân vật:\n${characterList}

[YÊU CẦU CẤU TRÚC DÀN Ý]:
1. **Mục tiêu cốt lõi (The Goal)**: Mục tiêu và động cơ của các nhân vật xuất hiện trong chương.
2. **Xung đột & Trở ngại (The Conflict)**: Mâu thuẫn nội tâm, xung đột lợi ích hoặc thế lực cản trở.
3. **Bối cảnh & Không khí (Setting & Atmosphere)**: Thời gian, địa điểm, cảm giác chủ đạo phù hợp thể loại.
4. **Diễn biến chi tiết (4 Scene Beats)**:
   - Beat 1 (Hook): Nối tiếp mượt mà điểm kết chương trước.
   - Beat 2 (Triển khai): Đấu trí, hành động hoặc khai phá chi tiết mới.
   - Beat 3 (Cao trào/Bước ngoặt): Đỉnh điểm xung đột hoặc nút thắt bất ngờ nhưng hợp logic.
   - Beat 4 (Dư âm/Chuyển tiếp): Hậu quả và móc nối sang chương sau.
5. **Logic & Continuity Check**: Kiểm tra vị trí nhân vật, trạng thái vết thương, vật phẩm và tri thức để tránh plot hole.`;
  },

  buildComplianceGuardrailPrompt: (
    text: string,
    interactionRules: string,
    negativePrompt: string,
    mechanics: string,
    pronounStyle: string,
    persistentDirectives: string,
    verificationReport: string
  ): string => {
    return `[NHIỆM VỤ: BIÊN TẬP VIÊN KIỂM SOÁT CHẤT LƯỢNG & NHẤT QUÁN]
Hãy rà soát văn bản dưới đây để sửa lỗi logic, lỗi xưng hô và trau chuốt câu từ.

${ORIGINAL_FIDELITY_PROTOCOL}

[TIÊU CHÍ KIỂM DUYỆT ƯU TIÊN - TRUTH KEEPER]:
1. **Bảo tồn chi tiết nguyên mẫu:** Giữ nguyên 100% tên nhân vật, vật phẩm, tình tiết, lời thoại và bối cảnh.
2. **Mâu thuẫn Sự kiện (Fact Check):** Kiểm tra tính hợp lý với ngữ cảnh và diễn biến bên trong văn bản.
3. **Logic Thế giới & Hệ thống:** ${mechanics || '(Không có quy tắc riêng)'}
4. **Quy tắc tương tác & Điều cấm:** ${interactionRules || '(Không)'} | Cấm: ${negativePrompt || '(Không)'}
5. **Từ vựng & Xưng hô:** ${pronounStyle || '(Nhất quán theo vai vế)'}
6. **Chỉ thị bền vững:** ${persistentDirectives || '(Không)'}
${verificationReport ? `7. **Xác thực:** ${verificationReport}` : ''}

[VĂN BẢN CẦN RÀ SOÁT]:
${text}

Hãy trả về toàn văn bản đã hiệu chỉnh hoàn thiện (giữ nguyên độ dài hoặc dài hơn). TUYỆT ĐỐI KHÔNG CẮT NGẮN, KHÔNG TÓM TẮT.`;
  },

  buildKnowledgeVerificationPrompt: (entities: string, internalContext: string): string => {
    return `[NHIỆM VỤ: THẨM ĐỊNH TRI THỨC]
Xác minh tính chính xác cho: "${entities}".

DỮ LIỆU RA JSON:
{
  "verifiedFacts": "Sự thật khách quan (Lịch sử/Khoa học/Địa lý thực tế)",
  "complianceNote": "Lưu ý để AI không viết sai logic so với bối cảnh nội tại: ${internalContext}"
}`;
  },

  buildPlotArcAnalysisPrompt: (storyOrChapters: Story | Chapter[], storyTitle?: string): string => {
    let chapters: Chapter[] = [];
    let title = storyTitle || "Tác phẩm";
    let genre = "Tiểu thuyết";
    let writingStyle = "Chuẩn mực văn học";
    let characters: Character[] = [];
    let setting = "Chưa thiết lập";
    let planning = "";
    let mechanics = "";
    let timeline = "";

    if (Array.isArray(storyOrChapters)) {
      chapters = storyOrChapters;
      title = storyTitle || "Tác phẩm";
    } else if (storyOrChapters && typeof storyOrChapters === 'object') {
      const story = storyOrChapters as Story;
      chapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      title = story.title || title;
      genre = story.genre || genre;
      writingStyle = story.writingStyle || story.writingDNA?.narrativeVoice || writingStyle;
      characters = story.characters || [];
      setting = story.setting || setting;
      planning = story.planning || "";
      mechanics = story.mechanics || "";
      timeline = story.currentTimeline || "";
    }

    const chapterSections = formatSmartChapterContext(chapters, { maxTotalChars: 42000 });

    return `[NHIỆM VỤ TỐI THƯỢNG: PHÂN TÍCH MẠCH TRUYỆN & PHÁT HIỆN VẤN ĐỀ CẦN SỬA CHỮA]
Bạn là Chuyên gia Phân tích Cấu trúc Tiểu thuyết & Cố vấn Biên tập Cốt truyện (Principal Literary Plot & Continuity Architect).

[THÔNG TIN TÁC PHẨM]:
- Tên truyện: "${title}"
- Thể loại: ${genre}
- Phong cách viết / Giọng văn: ${writingStyle}
- Dòng thời gian: ${timeline || '(Chưa thiết lập)'}
- Dàn ý tổng thể (Planning): ${planning || '(Chưa thiết lập)'}
- Thế giới & Bối cảnh: ${setting}
- Cơ chế / Quy tắc thế giới: ${mechanics || '(Chưa thiết lập)'}
- Hồ sơ nhân vật:
${formatCharacterRosterForPrompt(characters, 30)}

${ORIGINAL_FIDELITY_PROTOCOL}

[DỮ LIỆU CÁC CHƯƠNG TRUYỆN (${chapters.length} chương) - GỒM BẢN THẢO THỰC TẾ, TÓM TẮT & ĐỀ CƯƠNG]:
${chapterSections}

[CHỈ THỊ PHÂN TÍCH BẮT BUỘC]:
1. 📖 ĐỌC TRỰC TIẾP BẢN THẢO THỰC TẾ: Phân tích dựa trên tình tiết, lời thoại, hành động cụ thể trong từng chương; tuyệt đối không bịa chi tiết không tồn tại.
2. 📊 BIỂU ĐỒ KỊCH TÍNH (pacingHeatmap): Trả về mảng số nguyên từ 0-100 tương ứng ĐÚNG thứ tự từng chương hiện có (${chapters.length} phần tử nếu có thể).
3. 🔍 PHÁT HIỆN NỖI THẮT & LỖ HỔNG CỤ THỂ (unresolvedHooks & chapterIssues):
   - Chỉ rõ những chi tiết đã cài cắm mà chưa giải quyết.
   - Chỉ rõ từng chương có vấn đề về mạch lạc, nhảy cóc thời gian/địa điểm, mâu thuẫn tính cách nhân vật hoặc nhịp điệu rời rạc, KÈM ĐỀ XUẤT CÁCH SỬA CỤ THỂ để tác giả đưa thẳng vào Co-Edit sửa chữa.
4. 👤 TỔNG QUAN TUYẾN NHÂN VẬT (characterArcSummary): Đánh giá sự phát triển, động cơ và độ nhất quán của dàn nhân vật xuyên suốt truyện.
5. 💡 DỰ BÁO / HƯỚNG PHÁT TRIỂN TIẾP THEO (futurePredictions): 3 kịch bản đột phá bám sát các chi tiết gốc.

TRẢ VỀ ĐÚNG 1 JSON OBJECT HỢP LỆ (KHÔNG KÈM TEXT NGOÀI JSON):
{
  "arcAnalysis": "Phân tích sâu sắc cấu trúc cốt truyện, diễn biến nhịp điệu, sự liên kết giữa các hồi/chương và chất lượng văn phong thực tế.",
  "pacingHeatmap": [50],
  "unresolvedHooks": ["Danh sách từng chi tiết cài cắm / bí mật / lời hứa chưa giải quyết (ghi rõ xuất hiện ở chương nào nếu thấy)"],
  "futurePredictions": ["Kịch bản 1...", "Kịch bản 2...", "Kịch bản 3..."],
  "chapterIssues": [
    {
      "chapterId": "ID hoặc số thứ tự chương nếu xác định được",
      "chapterTitle": "Tên chương (Vd: Chương 3: ...)",
      "issue": "Mô tả cụ thể lỗi mạch lạc, mâu thuẫn logic hoặc chỗ gãy nhịp trong chương này",
      "fixSuggestion": "Hướng sửa chữa cụ thể giữ nguyên tinh thần tác phẩm"
    }
  ],
  "characterArcSummary": "Đánh giá tổng quan sự nhất quán và tiến hóa tâm lý của các nhân vật chính/phụ trong bản thảo."
}`;
  },

  buildKnowledgeExtractionPrompt: (
    text: string,
    characters: Character[],
    categories: ExtractionCategory[],
    options: { isFullStoryScan?: boolean; storyTitle?: string; storyGenre?: string } = {}
  ): string => {
    const existingList = characters.length > 0
      ? characters.map(c => `- ${c.name} (${c.role || 'Phụ'}, ${c.species || 'Human'}, trạng thái: ${c.status || 'alive'})`).join('\n')
      : '(Chưa có nhân vật nào trong hồ sơ)';

    return `[NHIỆM VỤ: QUÉT TOÀN DIỆN NHÂN VẬT, BỐI CẢNH & TRI THỨC TỪ VĂN BẢN]
${options.isFullStoryScan ? `Bạn đang quét tác phẩm "${options.storyTitle || 'Truyện'}" (${options.storyGenre || 'Chưa rõ thể loại'}) để xây dựng Hồ sơ Nhân vật & World Bible từ chính câu chữ trong truyện.` : 'Hãy phân tích văn bản bên dưới để chiết xuất nhân vật mới, cập nhật trạng thái nhân vật cũ, tri thức thế giới và quy luật.'}

[HƯỚNG DẪN CHI TIẾT]:
1. **Nhân vật mới (newCharacters)**:
   - Liệt kê tối đa 15 nhân vật có tên riêng hoặc thực thể quan trọng nhất (người, sinh vật, tinh linh, thần thú, khí linh...) xuất hiện trong đoạn truyện mà CHƯA có trong [DANH SÁCH NHÂN VẬT HIỆN CÓ]. Bỏ qua nhân vật quần chúng vô danh.
   - Viết SÚC TÍCH (1-2 câu ngắn gọn mỗi trường): vai trò ('Chính', 'Phụ', 'Phản diện', 'Ẩn số'), loại thực thể (entityType: 'human' | 'creature' | 'spirit' | 'object'), chủng tộc (species), mô tả thân phận, ngoại hình, tính cách (traits: 2-4 từ khóa ngắn), vị trí hiện tại (currentLocation), thực lực (powerLevel), kỹ năng (abilities), trạng thái (status: 'alive' | 'injured' | 'critical' | 'missing' | 'deceased' | 'sealed'), tri thức/bí mật họ nắm giữ (knowledge), đồng minh (mentors), kẻ thù (enemies).
   - Thực hiện suy luận hợp lý về giới hạn tri thức của nhân vật dựa theo xuất thân (Vd: người bình thường thời cổ đại không hiểu khoa học hiện đại).
2. **Cập nhật nhân vật đã có (characterUpdates)**:
   - Chỉ ghi nhận khi nhân vật trong [DANH SÁCH HIỆN CÓ] có thay đổi rõ rệt về vị trí, thương tích, sức mạnh, mối quan hệ hoặc tri thức mới; giữ tên khớp chính xác tên cũ.
3. **Bối cảnh & Quy luật (worldLore, mechanics)**:
   - Chỉ trích xuất tối đa 10 địa danh/phe phái/sự kiện/bảo vật nổi bật nhất (thuộc danh mục: ${categories.join(', ')}) và tối đa 8 quy luật sức mạnh/xã hội cốt lõi. Mỗi mục giải thích ngắn gọn trong 1-2 câu.
4. **Thông tin nền tảng đề xuất (synopsisSuggestion, genreSuggestion)**:
   - Nếu đoạn văn cho thấy rõ thể loại hoặc cốt truyện nền tảng của tác phẩm, đề xuất ngắn gọn.

[DANH SÁCH NHÂN VẬT HIỆN CÓ]:
${existingList}

[NỘI DUNG CẦN QUÉT]:
"""
${text}
"""

TRẢ VỀ DUY NHẤT 1 JSON OBJECT HỢP LỆ:
{
  "newCharacters": [
    {
      "name": "Tên nhân vật",
      "role": "Chính",
      "entityType": "human",
      "species": "Chủng tộc",
      "description": "Thân phận, vai trò và tính cách cốt lõi trong truyện",
      "appearance": "Mô tả ngoại hình nổi bật (nếu có trong văn bản)",
      "traits": ["Tính cách 1", "Cách xưng hô / đặc điểm"],
      "status": "alive",
      "currentLocation": "Địa điểm xuất hiện gần nhất",
      "powerLevel": "Thực lực / cảnh giới / chức vị (nếu có)",
      "abilities": "Kỹ năng / vũ khí / sở trường",
      "knowledge": "Những điều nhân vật biết hoặc chưa biết",
      "mentors": "Sư phụ / đồng minh / gia tộc thân cận",
      "enemies": "Kẻ thù / phe đối lập"
    }
  ],
  "characterUpdates": [
    {
      "name": "Tên chính xác của nhân vật cũ",
      "status": "alive",
      "healthStatus": "Thương tích hoặc trạng thái sức khỏe mới",
      "combatState": "{\"hp\":\"100%\",\"injuries\":[],\"debuffs\":[]}",
      "currentLocation": "Vị trí mới",
      "powerLevel": "Thực lực mới",
      "abilities": "Kỹ năng mới",
      "realizations": "Chuyển biến tâm lý / nhận thức mới",
      "knowledge": "Tri thức / bí mật mới",
      "enemies": "Kẻ thù mới"
    }
  ],
  "worldLore": [
    { "topic": "Tên địa danh / phe phái / sự kiện / bảo vật", "content": "Mô tả súc tích chính xác theo truyện" }
  ],
  "mechanics": [
    { "rule": "Tên quy tắc / hệ thống sức mạnh / luật xã hội", "detail": "Cách vận hành" }
  ],
  "genreSuggestion": "Thể loại phù hợp nhất (nếu nhận diện được)",
  "synopsisSuggestion": "Tóm tắt 2-3 câu về cốt truyện nếu đọc từ mở đầu"
}`;
  },

  buildAutoUpdateCharacterPrompt: (character: Character, storyContext: string): string => {
    return `[NHIỆM VỤ: PHÂN TÍCH TIẾN HÓA & ĐỒNG BỘ HỒ SƠ NHÂN VẬT TỪ BẢN THẢO]
Hãy đọc kỹ hồ sơ cũ và các trích đoạn chương truyện gần đây để cập nhật chính xác tình trạng mới nhất của nhân vật "${character.name}".

[HỒ SƠ HIỆN TẠI CỦA "${character.name}"]:
- Vai trò: ${character.role} | Chủng loại: ${character.species || 'Chưa rõ'} (${character.entityType || 'human'})
- Trạng thái: ${character.status} | Thể trạng: ${character.healthStatus || 'Bình thường'}
- Vị trí cũ: ${character.currentLocation || 'Chưa rõ'}
- Thực lực cũ: ${character.powerLevel || 'Chưa rõ'} | Kỹ năng: ${character.abilities || 'Chưa rõ'}
- Mô tả: ${character.description || 'Chưa có'}
- Tri thức cũ: ${character.knowledge || 'Chưa có'}
- Đồng minh/Dẫn dắt: ${character.mentors || 'Chưa có'} | Kẻ thù: ${character.enemies || 'Chưa có'}

[DIỄN BIẾN & TRÍCH ĐOẠN TRONG TRUYỆN LIÊN QUAN]:
${storyContext}

[YÊU CẦU]:
Chỉ cập nhật những thông tin thực sự có căn cứ trong diễn biến truyện bên trên; giữ nguyên ý đúng của hồ sơ cũ nếu chưa có sự kiện mới làm thay đổi.
TRẢ VỀ JSON HỢP LỆ:
{
  "status": "alive | injured | critical | missing | deceased | sealed",
  "healthStatus": "Mô tả tình trạng cơ thể/tinh thần hiện tại",
  "combatState": "{\"hp\":\"...\",\"stamina\":\"...\",\"injuries\":[],\"debuffs\":[]}",
  "currentLocation": "Vị trí mới nhất của nhân vật",
  "powerLevel": "Cảnh giới / thực lực mới nhất",
  "abilities": "Kỹ năng / trang bị mới nhất",
  "knowledge": "Tổng hợp tri thức, bí mật hoặc nhận thức mới nhân vật đã thu thập",
  "mentors": "Người dẫn dắt / đồng minh",
  "enemies": "Kẻ thù / đối trọng",
  "description": "Cập nhật mô tả tổng quan (ngắn gọn, súc tích)"
}`;
  },

  buildRefineSelectionPrompt: (selection: string, prefix: string, suffix: string, story: Story, instruction: string): string => {
    const activeChars = (story.characters || []).slice(0, 20).map(c => `- ${c.name} (${c.role}${c.traits?.length ? `: ${c.traits.join(', ')}` : ''})`).join('\n');
    return `[NHIỆM VỤ: TINH CHỈNH ĐOẠN VĂN BẢN CHỌN LỌC NHẤT QUÁN VỚI TÁC PHẨM]
Bạn là Biên tập viên văn học cao cấp của tác phẩm "${story.title}" (${story.genre || 'Tiểu thuyết'}).
Hãy chỉnh sửa đoạn văn bản dưới đây theo yêu cầu của tác giả sao cho khớp nối hoàn hảo với toàn truyện.

[THIẾT LẬP TÁC PHẨM]:
- Ngôi kể (POV): ${story.pov || 'Ngôi thứ ba'} | Quy tắc xưng hô: ${story.pronounStyle || 'Nhất quán theo bối cảnh'}
${story.setting ? `- Bối cảnh: ${story.setting.slice(0, 1200)}` : ''}
${story.mechanics ? `- Quy tắc/Sức mạnh: ${story.mechanics.slice(0, 800)}` : ''}
${story.writingDNA ? `- Giọng văn tác giả: ${story.writingDNA.narrativeVoice} (${story.writingDNA.emotionalTone})` : ''}
${activeChars ? `- Nhân vật liên quan:\n${activeChars}` : ''}

${ORIGINAL_FIDELITY_PROTOCOL}

[BỐI CẢNH LIỀN TRƯỚC]:
"...${prefix.slice(-900)}"

[ĐOẠN VĂN NGUYÊN MẪU CẦN SỬA]:
"""
${selection}
"""

[BỐI CẢNH LIỀN SAU]:
"${suffix.slice(0, 900)}..."

[YÊU CẦU CHỈNH SỬA CỤ THỂ]:
"${instruction || 'Trau chuốt văn phong mượt mà, giàu cảm xúc và sửa lỗi logic/xưng hô nếu có'}"

[QUY TẮC BẮT BUỘC]:
1. 🛡️ Giữ nguyên toàn bộ chi tiết cốt lõi, hành động, đồ vật, tên nhân vật và lời thoại (chỉ sửa khi được yêu cầu sửa lỗi logic/xưng hô).
2. 🚫 Tuyệt đối không tóm tắt hay rút gọn làm mất cảnh.
3. 🔗 Khớp nối mượt mà về thì, ngôi kể, xưng hô và không khí với đoạn trước & đoạn sau.
4. 📝 Chỉ trả về duy nhất đoạn văn đã chỉnh sửa thay thế, không kèm lời giải thích hay chào hỏi.

BẮT ĐẦU ĐOẠN VĂN ĐÃ CHỈNH SỬA:`;
  },

  buildBalanceLengthPrompt: (content: string, target: number, current: number, interactionRules: string, genre: string, negativePrompt: string): string => {
    const mode = target >= current ? `MỞ RỘNG chi tiết (từ ~${current} từ lên khoảng ~${target} từ)` : `CÔ ĐỌNG nhịp văn (từ ~${current} từ xuống khoảng ~${target} từ) nhưng KHÔNG làm mất tình tiết cốt lõi`;
    return `[NHIỆM VỤ: ĐIỀU CHỈNH ĐỘ DÀI & NHỊP VĂN CHƯƠNG TRUYỆN]
Hãy ${mode} cho chương truyện thể loại "${genre || 'Tiểu thuyết'}" dưới đây.
- Quy tắc tương tác & xưng hô: ${interactionRules || '(Theo nguyên bản)'}
- Điều cấm: ${negativePrompt || '(Không)'}
- Yêu cầu: Giữ nguyên toàn bộ tên nhân vật, sự kiện, lời thoại quan trọng và văn phong gốc. Nếu mở rộng, hãy bổ sung miêu tả tâm lý, ngũ quan, không khí và hành động hợp logic — tuyệt đối không lặp chữ vô nghĩa.

[BẢN THẢO GỐC]:
"""
${content.slice(0, 32000)}
"""

TRẢ VỀ JSON HỢP LỆ:
{ "edited_text": "Toàn bộ văn bản chương đã cân bằng độ dài..." }`;
  },

  buildVocabularyAnalysisPrompt: (content: string, interactionRules: string): string => {
    return `[NHIỆM VỤ: PHÂN TÍCH TỪ VỰNG, LẶP TỪ & ĐỀ XUẤT TRAU CHUỐT VĂN CHƯƠNG]
Hãy đọc kỹ văn bản dưới đây và tìm các từ/cụm từ bị lặp nhiều lần, từ dùng thô/thiếu tự nhiên (hoặc còn dấu vết convert/dịch máy), và gợi ý phương án thay thế hay hơn phù hợp ngữ cảnh.
${interactionRules ? `Quy tắc văn phong/xưng hô cần tôn trọng: ${interactionRules}` : ''}

[VĂN BẢN CẦN PHÂN TÍCH]:
"""
${sampleManuscript(content, 18000)}
"""

TRẢ VỀ JSON OBJECT VỚI MẢNG "insights" (tối đa 10 mục nổi bật nhất):
{
  "insights": [
    {
      "word": "Từ hoặc cụm từ bị lặp / cần trau chuốt",
      "count": 4,
      "suggestions": ["Phương án thay thế 1", "Phương án thay thế 2", "Phương án thay thế 3"],
      "context": "Nhận xét ngắn gọn lý do và ngữ cảnh nên thay đổi"
    }
  ]
}`;
  },

  buildStyleRuleExtractionPrompt: (text: string): string => {
    return `[NHIỆM VỤ: KHAI PHÁ QUY TẮC VĂN PHONG]
Phân tích đoạn văn sau và rút ra một quy tắc viết (Stylistic Rule) cụ thể, rõ ràng mà tác giả đã sử dụng (Ví dụ: 'Dùng động từ mạnh tả trạng thái thay vì kể cảm xúc', 'Ngắt câu ngắn khi cao trào'). Trả về quy tắc ngắn gọn trong 1-2 câu tiếng Việt.

[ĐOẠN VĂN]:
"""
${text.slice(0, 4000)}
"""`;
  },

  buildDeriveStylisticRulePrompt: (original: string, modified: string): string => {
    return `[NHIỆM VỤ: HỌC HỎI TỪ SỰ KHÁC BIỆT]
So sánh bản gốc và bản sửa đổi sau đây để rút ra 1 quy tắc viết ngắn gọn phản ánh gu biên tập của tác giả.
Bản gốc: "${original.substring(0, 800)}"
Bản sửa: "${modified.substring(0, 800)}"
Quy tắc rút ra (1-2 câu tiếng Việt):`;
  },

  buildRefineChapterPrompt: (
    content: string, 
    worldBible: string, 
    interactionRules: string, 
    genre: string, 
    writingStyle: string, 
    pov: string, 
    pronounStyle: string, 
    negativePrompt: string, 
    nsfw: boolean, 
    customInstruction: string, 
    persistentDirectives: string, 
    mechanics: string, 
    styleReference: string
  ): string => {
    const contentRating = nsfw ? NSFW_INSTRUCTION : "";
    return `[NHIỆM VỤ: TINH CHỈNH & ĐẠI TU VĂN BẢN CHUYÊN NGHIỆP]
Bạn là một Đại biên tập viên và Nhà văn chủ bút. Nhiệm vụ của bạn là chỉnh sửa, nâng cấp và vá lỗi mạch lạc/logic cho bản thảo dưới đây theo yêu cầu của tác giả.

${ORIGINAL_FIDELITY_PROTOCOL}

[DỮ LIỆU NỀN & THIẾT LẬP]:
- Thể loại: ${genre || 'Tiểu thuyết'} | Ngôi kể: ${pov || 'Ngôi thứ ba'} | Văn phong: ${writingStyle || 'Tự nhiên, sâu sắc'}
- Xưng hô & Quy tắc: ${pronounStyle || '(Theo ngữ cảnh)'} ${interactionRules ? `| ${interactionRules}` : ''}
- Bối cảnh & Tri thức liên quan: ${worldBible ? worldBible.slice(0, 5000) : '(Theo bản thảo)'}
- Quy tắc thế giới (Mechanics): ${mechanics || '(Không có)'}
- Chỉ thị bền vững: ${persistentDirectives || '(Không có)'}
- Cấm (Negative Prompt): ${negativePrompt || '(Không có)'}
${styleReference ? `- Phong cách tham chiếu: ${styleReference}` : ''}

${UNIVERSAL_RATIONALITY_PROTOCOL}
${TRUTH_KEEPER_PROTOCOL}

[VĂN BẢN NGUYÊN MẪU CẦN CHỈNH SỬA]:
"""
${content}
"""

[CHỈ THỊ SỬA ĐỔI CỦA TÁC GIẢ]:
"${customInstruction || 'Nâng cấp văn chương mượt mà, trau chuốt câu từ, sửa lỗi xưng hô/logic nếu có và giữ nguyên vẹn toàn bộ diễn biến nguyên mẫu.'}"

[YÊU CẦU THỰC THI BẮT BUỘC]:
1. 🛡️ **BẢO TỒN CHI TIẾT NGUYÊN MẪU 100%:** Giữ nguyên tên nhân vật, địa danh, vật phẩm, lời thoại, suy nghĩ nội tâm và diễn biến cốt lõi trong bản gốc (chỉ điều chỉnh chỗ mâu thuẫn nếu có yêu cầu).
2. 💎 **NÂNG CẤP VĂN PHONG & MẠCH LẠC:** Câu chữ giàu hình ảnh, cảm xúc, nhịp điệu mượt mà, thống nhất xưng hô.
3. 🚫 **TUYỆT ĐỐI KHÔNG TÓM TẮT:** Bản sửa đổi phải giữ độ dài đầy đủ tương đương hoặc dài hơn bản nguyên mẫu.
4. 📝 **ĐÚNG ĐỊNH DẠNG:** Chỉ trả về toàn bộ nội dung chương truyện hoàn chỉnh sau khi sửa, không thêm lời chào hay giải thích ngoài lề.
${contentRating}

BẮT ĐẦU VĂN BẢN ĐÃ CHỈNH SỬA HOÀN THIỆN:`;
  },

  buildNextChapterSuggestionPrompt: (story: Story): string => {
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const lastChapter = sortedChapters.length > 0 ? sortedChapters[sortedChapters.length - 1] : undefined;
    const recentSummaries = sortedChapters.slice(-4).map((c, idx) => {
      const text = c.content?.trim() ? c.content : (c.translatedContent || '');
      const excerpt = c.summary?.trim() || c.outline?.trim() || sampleManuscript(text, 600);
      return `- ${c.title || `Chương ${idx + 1}`}: ${excerpt}`;
    }).join('\n');

    const lastEnding = lastChapter
      ? (lastChapter.content?.trim() || lastChapter.translatedContent?.trim() || '').slice(-1500)
      : '';

    return `[NHIỆM VỤ: KIẾN TRÚC SƯ CỐT TRUYỆN - GỢI Ý CHƯƠNG KẾ TIẾP]
Hãy gợi ý ý tưởng chi tiết cho chương tiếp theo của tác phẩm "${story.title}" (${story.genre || 'Tiểu thuyết'}).
- Văn phong chủ đạo: ${story.writingStyle || story.writingDNA?.narrativeVoice || 'Nhất quán với bản thảo hiện có'}
- Dàn ý tổng thể: ${story.planning || '(Chưa thiết lập)'}
- Bối cảnh & Quy tắc: ${story.setting || '(Chưa thiết lập)'} ${story.mechanics ? `| ${story.mechanics}` : ''}
- Nhân vật hiện tại:\n${formatCharacterRosterForPrompt(story.characters || [], 20)}

[DIỄN BIẾN GẦN NHẤT]:
${recentSummaries || '(Đây là chương mở đầu của tác phẩm)'}
${lastEnding ? `\n[ĐOẠN KẾT CHƯƠNG VỪA RỒI (${lastChapter?.title})]:\n"""\n${lastEnding}\n"""` : ''}

Hãy bám sát mạch truyện, hậu quả từ chương vừa rồi, động cơ nhân vật và các nút thắt chưa giải quyết để đề xuất chương mới tự nhiên, kịch tính và logic.
TRẢ VỀ JSON HỢP LỆ:
{
  "title": "Tiêu đề chương mới",
  "conflict": "Xung đột chính và vấn đề cần giải quyết trong chương",
  "emotionalGoal": "Mục tiêu cảm xúc và chuyển biến tâm lý nhân vật",
  "outline": "Dàn ý chi tiết 4 beat nối tiếp mượt mà chương trước",
  "logicCheck": "Lưu ý về vị trí nhân vật, vết thương, tri thức, thời gian và quy tắc thế giới để tránh plot hole"
}`;
  },

  buildVietnameseLocalizationPrompt: (
    content: string, 
    story?: Story | null, 
    options?: {
      chapterTitle?: string;
      styleMode?: string;
      customInstruction?: string;
      pronounOverride?: string;
    }
  ): string => {
    const genre = story?.genre || "Tiểu thuyết";
    const pronounStyle = options?.pronounOverride || story?.pronounStyle || "Tự nhiên, phù hợp bối cảnh & quan hệ";
    const setting = story?.setting || "";
    const mechanics = story?.mechanics || "";
    const persistentDirectives = story?.persistentDirectives || "";
    const styleMode = options?.styleMode || "natural";
    const chapterName = options?.chapterTitle || "Chương truyện";
    const customInst = options?.customInstruction || "";
    const nsfwRating = story?.nsfw ? NSFW_INSTRUCTION : "";

    let styleModeGuidance = "";
    switch (styleMode) {
      case "wuxia":
        styleModeGuidance = `
- PHONG CÁCH CỔ PHONG / TIÊN HIỆP / KIẾM HIỆP:
  * Sử dụng hệ từ vựng Hán-Việt tinh hoa, hào sảng, uy phong, thấm đượm khí chất giang hồ hoặc tu chân phiêu dật.
  * Xưng hô chuẩn mực: Đạo hữu, huynh đệ, sư huynh/sư muội, vãn bối/tiền bối, bản tọa, lão phu, tại hạ, các hạ.
  * Giữ đúng thuật ngữ tu tiên, công pháp, linh bảo, cảnh giới, chiêu thức võ công, không dịch ngô nghê.`;
        break;
      case "fantasy":
        styleModeGuidance = `
- PHONG CÁCH TÂY PHƯƠNG KỲ ẢO / SỬ THI (EPIC FANTASY):
  * Mang âm hưởng dịch thuật tiểu thuyết phương Tây kinh điển (như Chúa Nhẫn, Trò Chơi Vương Quyền, Harry Potter).
  * Lời văn trang trọng, cổ kính, u trầm và giàu tính gợi cảm không gian sử thi.
  * Xưng hô chuẩn phong vị quý tộc phương Tây: Lãnh chúa, Ngài, Bệ hạ, Hiệp sĩ, Huân tước, Phu nhân, Tiểu thư.
  * TUYỆT ĐỐI KHÔNG dùng từ Hán-Việt cổ trang phương Đông gượng gạo (như "sư huynh", "tiểu tử", "bản tọa") trong bối cảnh lâu đài hiệp sĩ phương Tây.`;
        break;
      case "modern":
        styleModeGuidance = `
- PHONG CÁCH ĐÔ THỊ / HIỆN ĐẠI / KHOA HUYỄN:
  * Ngôn ngữ gãy gọn, nhịp điệu nhanh, phản ánh đúng hơi thở đời sống hiện đại.
  * Lời thoại chân thực, sắc sảo, tự nhiên như lời ăn tiếng nói ngoài đời (Tôi - anh, cậu - tớ, ông - tôi, hắn - cô ta, mày - tao khi giận dữ).
  * Tuyệt đối tránh các từ xưng hô cổ trang sượng sùng như "ngươi - ta" trong bối cảnh hiện đại.`;
        break;
      case "natural":
      default:
        styleModeGuidance = `
- PHONG CÁCH THUẦN VIỆT VĂN CHƯƠNG (KHUYÊN DÙNG):
  * Ưu tiên cao nhất là sự mềm mại, uyển chuyển, giàu nhạc tính và trong sáng của tiếng Việt.
  * Đọc lên êm tai, câu cú liên kết mượt mà như được chấp bút trực tiếp bởi tác giả tiếng Việt xuất sắc.
  * Khử sạch 100% cảm giác dịch thô, dịch máy hay cấu trúc câu convert gượng gạo.`;
        break;
    }

    const charactersContext = story?.characters && story.characters.length > 0
      ? `[HỒ SƠ NHÂN VẬT THAM CHIẾU (GIỮ ĐÚNG TÊN & XƯNG HÔ)]:\n` +
        story.characters.slice(0, 20).map(c => `- ${c.name} (${c.role}): ${c.description || ''}; Xưng hô/tính cách: ${c.traits?.join(', ') || 'Bình thường'}`).join('\n')
      : '';

    return `[NHIỆM VỤ: ĐẠI BIÊN TẬP & VIỆT HÓA VĂN HỌC ĐỈNH CAO - ERADICATE ROUGHNESS & ZERO DUPLICATION]
Bạn là một Đại dịch giả văn học và Trưởng ban biên tập tiểu thuyết kỳ cựu.
Nhiệm vụ của bạn là VIỆT HÓA VÀ BIÊN TẬP LẠI TOÀN BỘ VĂN BẢN dưới đây thành tiếng Việt văn học đỉnh cao, mượt mà, sâu sắc, xóa bỏ triệt để mọi dấu vết "thô cứng", "sượng sùng" hay "văn phong convert/dịch máy".

[GIAO THỨC TỐI THƯỢNG: TRUNG THỰC NGUYÊN TÁC & CHỐNG TRÙNG LẶP (ZERO DUPLICATION MANDATE)]:
1. 🛡️ BẢO TỒN 100% CỐT TRUYỆN & TÌNH TIẾT:
   - Dịch đầy đủ, chính xác từng câu thoại, hành động, diễn biến tâm lý, chi tiết đạo cụ và bối cảnh.
   - TUYỆT ĐỐI KHÔNG TỰ BỊA THÊM tình tiết lạ ngoài nguyên tác, không xuyên tạc nội dung.
   - TUYỆT ĐỐI KHÔNG LƯỢC BỎ HAY TÓM TẮT bất kỳ phân đoạn nào.
2. ⚡ ĐẶC TRỊ VĂN BẢN GỐC NGẮN / PHÂN ĐOẠN 300 - 500 KÝ TỰ (TUYỆT ĐỐI KHÔNG BỎ QUA):
   - Cho dù văn bản gốc rất ngắn (khoảng 300 - 500 ký tự hay thậm chí chỉ vài dòng), TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ ĐỘNG BỎ QUA, KHÔNG ĐƯỢC COI LÀ LỖI VÀ KHÔNG ĐƯỢC TỪ CHỐI DỊCH.
   - BẮT BUỘC dịch và trau chuốt 100% từng câu chữ từ đầu đến cuối sang tiếng Việt mượt mà.
3. 🚫 TUYỆT ĐỐI CHỐNG TRÙNG LẶP NỘI DUNG (STRICT NO-DUPLICATION):
   - TUYỆT ĐỐI KHÔNG lặp lại bất kỳ câu, đoạn văn hay phân cảnh nào đã dịch.
   - TUYỆT ĐỐI KHÔNG in lại văn bản gốc, KHÔNG xuất bản song ngữ.

[THIẾT LẬP TÁC PHẨM]:
- Tiêu đề chương: ${chapterName}
- Thể loại truyện: ${genre}
- Hệ thống xưng hô định hình: ${pronounStyle}
${setting ? `- Bối cảnh thế giới: ${setting}` : ''}
${mechanics ? `- Quy tắc/Thuật ngữ đặc thù: ${mechanics}` : ''}
${persistentDirectives ? `- Chỉ thị phong cách bền vững: ${persistentDirectives}` : ''}
${charactersContext}

[ĐỊNH HƯỚNG PHONG CÁCH VIỆT HÓA]:
${styleModeGuidance}
${customInst ? `\n- CHỈ THỊ RIÊNG CỦA TÁC GIẢ: "${customInst}"` : ''}

[XÓA BỎ VĂN PHONG "CONVERT / DỊCH MÁY"]:
- Khử các cấu trúc sượng ("trong lòng không khỏi...", "nhịn không được...", "khóe miệng co quắp một trận", "một đạo thân ảnh", "sắc mặt biến đổi một trận", lặp "Hắn..." liên tục).
- Đảm bảo xưng hô tự nhiên, khẩu khí nhân vật rõ ràng, giữ nguyên danh từ riêng đã định hình.

${nsfwRating}

[VĂN BẢN GỐC CẦN VIỆT HÓA & TRAU CHUỐT]:
"""
${content}
"""

BẮT ĐẦU VĂN BẢN ĐÃ VIỆT HÓA & BIÊN TẬP HOÀN CHỈNH (Chỉ xuất toàn văn tiếng Việt):`;
  },

  buildStoryAuditPrompt: (story: Story, focusChapterId?: string): string => {
    const sortedChapters = [...(story.chapters || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(ch => ({
        ...ch,
        content: ch.content?.trim() ? ch.content : (ch.translatedContent || '')
      }));

    const chapterContext = sortedChapters.length > 0
      ? formatSmartChapterContext(sortedChapters, { maxTotalChars: 48000, focusChapterId })
      : '(Chưa có chương truyện nào được viết)';

    const activeKnowledge = (story.knowledgeLogs || [])
      .filter(k => k.isActive)
      .slice(-25)
      .map(k => `- [${k.category}] ${k.title}: ${k.content}`)
      .join('\n') || '(Chưa có tri thức trích xuất)';

    const activeEvolution = (story.evolutionLogs || [])
      .filter(e => e.isActive)
      .slice(-15)
      .map(e => `- ${e.learnedRule}`)
      .join('\n') || '(Chưa có)';

    const charactersProfile = formatCharacterRosterForPrompt(story.characters || [], 40);

    return `[NHIỆM VỤ TỐI THƯỢNG: KIỂM TOÁN TÍNH NHẤT QUÁN TOÀN BỘ TÁC PHẨM (DEEP CONSISTENCY AUDIT)]
Bạn là Tổng Biên Tập & Chuyên gia Kiểm toán Logic Văn học (Principal Story Continuity Auditor).
Hãy đọc kỹ TẤT CẢ dữ liệu World Bible, Hồ sơ nhân vật, Blueprint cốt truyện và Nội dung các chương dưới đây để thực hiện cuộc kiểm toán thực chất, khách quan và chính xác tuyệt đối.

[QUY TẮC KIỂM TOÁN BẮT BUỘC]:
1. 🔍 CHỈ BÁO CÁO DỰA TRÊN BẰNG CHỨNG THỰC TẾ: Mọi nhận xét, mâu thuẫn hoặc lỗ hổng logic PHẢI dẫn chiếu cụ thể tên chương (Vd: Chương 3), tên nhân vật, sự kiện hoặc quy tắc thế giới có trong dữ liệu bên dưới. KHÔNG bịa đặt chi tiết không tồn tại.
2. 👤 ĐỐI CHIẾU NHÂN VẬT & ARCS: Kiểm tra xem hành động, tính cách (OOC), xưng hô, vết thương/trạng thái sống-chết, vị trí địa lý và tri thức của từng nhân vật xuất hiện trong các chương có khớp với Hồ sơ nhân vật và diễn biến chương trước hay không.
3. 📜 ĐỐI CHIẾU CỐT TRUYỆN & BLUEPRINT: Tìm lỗ hổng logic (plot holes), lỗi dòng thời gian (timeline), sự kiện bị bỏ quên (unresolved hooks), chi tiết dịch thô/lặp đoạn nghiêm trọng (nếu có), và đánh giá mức độ bám sát với Dàn ý tổng (Blueprint).
4. 🌍 ĐỐI CHIẾU THẾ GIỚI & QUY TẮC: Kiểm tra mâu thuẫn về hệ thống sức mạnh/phép thuật (Mechanics), quy tắc tương tác, địa lý, hậu cần/kinh tế hoặc thiết lập bối cảnh.
5. 📊 CHẤM ĐIỂM THỰC CHẤT (overallScore từ 0 đến 100):
   - 85-100: Rất chặt chẽ, gần như không có lỗi logic nghiêm trọng.
   - 65-84: Tốt, có vài hạt sạn nhỏ về chi tiết, nhịp điệu hoặc chưa giải thích rõ.
   - 40-64: Có một số mâu thuẫn đáng chú ý về nhân vật, timeline hoặc quy tắc thế giới.
   - Dưới 40: Mâu thuẫn nghiêm trọng hoặc rời rạc lớn với World Bible.

[HỒ SƠ TÁC PHẨM & WORLD BIBLE]:
- Tên tác phẩm: "${story.title}"
- Thể loại: ${story.genre || 'Chưa rõ'} | Góc nhìn (POV): ${story.pov || 'Chưa rõ'} | Xưng hô chuẩn: ${story.pronounStyle || 'Chưa rõ'}
- Tóm tắt cốt truyện (Synopsis): ${story.synopsis || '(Chưa có)'}
- Dàn ý tổng thể (Master Blueprint / Planning): ${story.planning || '(Chưa thiết lập)'}
- Bối cảnh & Địa lý (Setting): ${story.setting || '(Chưa thiết lập)'}
- Dòng thời gian hiện tại (Timeline): ${story.currentTimeline || '(Chưa thiết lập)'}
- Quy tắc & Hệ thống sức mạnh (Mechanics): ${story.mechanics || '(Chưa thiết lập)'}
- Quy tắc tương tác & Ràng buộc (Interaction Rules): ${story.interactionRules || '(Chưa thiết lập)'}
- Chỉ thị bền vững (Persistent Directives): ${story.persistentDirectives || '(Không có)'}
${story.logistics ? `- Hậu cần (Logistics): ${story.logistics}` : ''}
${story.economy || story.trade ? `- Kinh tế & Thương mại: ${[story.economy, story.trade].filter(Boolean).join(' | ')}` : ''}
${story.maps || story.officials ? `- Bản đồ & Quan chức/Thế lực: ${[story.maps, story.officials].filter(Boolean).join(' | ')}` : ''}

[TRI THỨC ĐÃ KHÓA TRONG BỘ NHỚ (KNOWLEDGE LOGS)]:
${activeKnowledge}

[QUY TẮC TÁC GIẢ ĐÃ HỌC (EVOLUTION LOGS)]:
${activeEvolution}

[HỒ SƠ NHÂN VẬT HIỆN TẠI (${(story.characters || []).length} nhân vật)]:
${charactersProfile}

[NỘI DUNG CÁC CHƯƠNG TRUYỆN (${sortedChapters.length} chương)]:
${chapterContext}

[ĐỊNH DẠNG ĐẦU RA JSON BẮT BUỘC]:
Trả về duy nhất 1 JSON object hợp lệ (bằng tiếng Việt, KHÔNG kèm markdown ngoài JSON):
{
  "overallScore": 78,
  "characterArcs": [
    {
      "character": "Tên nhân vật",
      "analysis": "Đánh giá tổng quan tuyến phát triển, động cơ và tính nhất quán của nhân vật qua các chương.",
      "issues": ["Liệt kê cụ thể mâu thuẫn (kèm tên chương), hoặc mảng rỗng [] nếu nhất quán"]
    }
  ],
  "worldBuildingGaps": [
    {
      "topic": "Chủ đề (Vd: Hệ thống phép thuật / Địa lý / Thời gian / Kinh tế)",
      "issue": "Mô tả cụ thể lỗ hổng hoặc sự vi phạm quy tắc đã phát hiện",
      "fix": "Đề xuất cách chỉnh sửa cụ thể để vá lỗ hổng"
    }
  ],
  "plotCoherence": {
    "summary": "Đánh giá tổng quan mạch truyện hiện tại qua các chương đã viết.",
    "plotHoles": ["Danh sách từng lỗ hổng logic / mâu thuẫn tình tiết cụ thể phát hiện được (hoặc [] nếu không có)"],
    "blueprintAlignment": "Đánh giá chi tiết mức độ bám sát Dàn ý tổng thể (Blueprint) và các điểm đã chệch hướng (nếu có)."
  }
}`;
  },

  buildChapterLogicAuditPrompt: (content: string, title: string, story: Story, chapterId?: string): string => {
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const currentIdx = chapterId
      ? sortedChapters.findIndex(c => c.id === chapterId)
      : sortedChapters.findIndex(c => c.title === title);

    const activeChapter = currentIdx >= 0 ? sortedChapters[currentIdx] : undefined;
    const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : undefined;
    const nextChapter = currentIdx >= 0 && currentIdx < sortedChapters.length - 1 ? sortedChapters[currentIdx + 1] : undefined;

    const prevContent = prevChapter
      ? (prevChapter.content?.trim() || prevChapter.translatedContent?.trim() || '')
      : '';
    const prevContext = prevChapter
      ? `- Chương trước (${prevChapter.title}):
  * Tóm tắt: ${prevChapter.summary || prevChapter.outline || '(Chưa có)'}
  * Đoạn kết chương trước (để đối chiếu điểm nối): ${prevContent ? prevContent.slice(-1500) : '(Trống)'}`
      : '- Đây là chương đầu tiên hoặc chưa có chương liền trước.';

    const nextContext = nextChapter
      ? `- Chương kế tiếp (${nextChapter.title}): ${nextChapter.summary || nextChapter.outline || '(Chưa có tóm tắt/đề cương)'}`
      : '';

    const activeKnowledge = (story.knowledgeLogs || [])
      .filter(k => k.isActive)
      .slice(-15)
      .map(k => `- [${k.category}] ${k.title}: ${k.content}`)
      .join('\n') || '(Không có)';

    const charactersProfile = formatCharacterRosterForPrompt(story.characters || [], 30);

    const safeContent = content.length > 40000
      ? sampleManuscript(content, 40000)
      : content;

    return `[NHIỆM VỤ: KIỂM TOÁN LOGIC & VĂN PHONG CHUYÊN SÂU CHO CHƯƠNG TRUYỆN]
Bạn là Biên Tập Viên Pháp Y Văn Học (Forensic Story Editor). Hãy kiểm toán kỹ lưỡng từng phân đoạn trong chương dưới đây đối chiếu với chính nội dung chương đó, chương liền kề, hồ sơ nhân vật và quy tắc thế giới.

[THÔNG TIN TÁC PHẨM & CHƯƠNG]:
- Tác phẩm: "${story.title}" | Thể loại: ${story.genre || 'Chưa rõ'}
- Góc nhìn (POV): ${story.pov || 'Chưa rõ'} | Quy tắc xưng hô chuẩn: ${story.pronounStyle || 'Chưa rõ'}
- Tên chương đang kiểm toán: "${title}"
${activeChapter?.timeSetting ? `- Mốc thời gian của chương: ${activeChapter.timeSetting}` : ''}
${activeChapter?.outline ? `- Đề cương dự kiến của chương: ${activeChapter.outline}` : ''}
- Bối cảnh & Luật thế giới: ${story.setting || '(Chưa thiết lập)'}
- Cơ chế sức mạnh / Thuật ngữ (Mechanics): ${story.mechanics || '(Chưa thiết lập)'}
- Quy tắc tương tác (Interaction Rules): ${story.interactionRules || '(Chưa thiết lập)'}
${story.persistentDirectives ? `- Chỉ thị phong cách bền vững: ${story.persistentDirectives}` : ''}

[NGỮ CẢNH LIỀN KỀ]:
${prevContext}
${nextContext}

[TRI THỨC ĐÃ KHÓA]:
${activeKnowledge}

[NHÂN VẬT LIÊN QUAN]:
${charactersProfile}

[NỘI DUNG ĐẦY ĐỦ CỦA CHƯƠNG "${title}" (${content.length.toLocaleString()} ký tự)]:
"""
${safeContent}
"""

[TIÊU CHÍ KIỂM TOÁN BẮT BUỘC]:
1. **internalConsistency (Mâu thuẫn Nội tại)**:
   - Kiểm tra lỗi vật lý/không gian/thời gian (đang ở nơi A bỗng xuất hiện ở B không chuyển cảnh, ngày/đêm đảo lộn, vật phẩm biến mất/xuất hiện vô lý, vết thương bỗng lành).
   - Kiểm tra sự nối tiếp với đoạn kết chương trước.
   - Kiểm tra lỗi biên tập/dịch thuật nghiêm trọng (đoạn văn bị lặp, câu cụt nghĩa, đổi ngôi kể bất thường).
   - Nếu không có lỗi, trả về mảng rỗng [].
2. **characterLogic (Nhân vật / OOC / Xưng hô)**:
   - Kiểm tra hành vi trái tính cách/động cơ (Out of Character), biết thông tin lẽ ra chưa biết, hoặc lỗi XƯNG HÔ bất nhất (Vd: lúc gọi "ngươi-ta", lúc nhảy sang "cậu-tớ" hay sai thứ bậc vai vế).
   - Nếu hợp lý hoàn toàn, trả về mảng rỗng [].
3. **worldRuleViolations (Vi phạm Quy tắc Thế giới)**:
   - Kiểm tra việc sử dụng phép thuật/cảnh giới/công nghệ/văn hóa trái với Mechanics, Setting hoặc Knowledge Logs đã khóa.
   - Nếu tuân thủ hoàn toàn, trả về mảng rỗng [].
4. **pacingAnalysis (Phân tích Nhịp điệu & Pacing)**:
   - Đánh giá ngắn gọn, súc tích, thực tế (3-5 câu) về nhịp truyện, sự cân bằng giữa thoại/hành động/miêu tả, điểm mạnh và chỗ còn lê thê hoặc vội vàng trong chính chương này.

[ĐỊNH DẠNG ĐẦU RA JSON BẮT BUỘC]:
Trả về duy nhất 1 JSON object hợp lệ (bằng tiếng Việt, KHÔNG kèm markdown ngoài JSON):
{
  "internalConsistency": [
    { "issue": "Mô tả lỗi nội tại cụ thể (trích dẫn chi tiết trong chương)", "suggestion": "Cách sửa cụ thể" }
  ],
  "characterLogic": [
    { "character": "Tên nhân vật", "issue": "Lỗi tính cách / tri thức / xưng hô cụ thể", "suggestion": "Cách điều chỉnh cụ thể" }
  ],
  "worldRuleViolations": [
    { "rule": "Tên quy tắc / thiết lập bị vi phạm", "issue": "Chi tiết vi phạm trong chương" }
  ],
  "pacingAnalysis": "Nhận xét chi tiết về nhịp điệu, cao trào và chất lượng hành văn của chương này."
}`;
  }
};
