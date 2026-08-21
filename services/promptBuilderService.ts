
import { Character, Chapter, Story, ExtractionCategory, WritingDNA } from '../types.ts';
import { NSFW_INSTRUCTION } from './nsfwPrompt.ts';

const WRITING_COMMANDMENTS = `
[GIAO THỨC VIẾT VĂN TỐI THƯỢM - MASTERPIECE PROTOCOL]

1. KỸ THUẬT "DEEP POV" & "SENSORY IMMERSION":
- CẤM dùng các "từ lọc" (filter words): "Hắn cảm thấy lạnh", "Nàng nhìn thấy", "Ta nghe được".
-> SỬA THÀNH TRỰC TIẾP: "Cơn gió buốt giá luồn qua khe áo", "Bóng đen lướt qua tầm mắt", "Tiếng sấm rền vang".
- Kết hợp ít nhất 3 giác quan trong mỗi phân cảnh. Ưu tiên: Xúc giác (nhiệt độ, kết cấu), Khứu giác (mùi vị không khí) và Thính giác.

2. NGUYÊN LÝ "TẢNG BĂNG TRÔI" (SUBTEXT):
- Nhân vật không bao giờ nói toẹt ra toàn bộ suy nghĩ. Hãy để hành động, ánh mắt và những câu thoại bỏ lửng nói thay lời.
- Tạo chiều sâu tâm lý: Sự mâu thuẫn giữa hành động bên ngoài và suy nghĩ bên trong.

3. NHỊP ĐIỆU VĂN CHƯƠNG (DYNAMIC PACING):
- Cảnh hành động/Nguy hiểm: Dùng câu ngắn, động từ mạnh, tiết tấu dồn dập. Ngắt câu liên tục.
- Cảnh nội tâm/Mô tả: Dùng câu phức, câu dài, giàu tính từ và hình ảnh ẩn dụ.
- Tránh lặp lại cấu trúc câu liên tiếp (Vd: Không viết 3 câu liên tiếp bắt đầu bằng "Hắn...").

4. SỰ CHÍNH XÁC VỀ CHI TIẾT (SPECIFICITY):
- Đừng viết "một loài hoa đẹp". Hãy viết "cánh hoa Mạn Đà La đỏ thẫm như máu".
- Đừng viết "hắn cầm vũ khí". Hãy viết "ngón tay hắn siết chặt cán đao lạnh lẽo".
`;

const ASOIAF_KNOWLEDGE_MATRIX = `
[BÁCH KHOA TOÀN THƯ VŨ TRỤ A SONG OF ICE AND FIRE (GAME OF THRONES)]
AI PHẢI THAM CHIẾU DỮ LIỆU NÀY ĐỂ ĐẢM BẢO TÍNH "GRRM" (GEORGE R.R. MARTIN):

1. 🏰 CÁC ĐẠI GIA TỘC (GREAT HOUSES):
   - **Stark:** Danh dự, khắc kỷ, "Winter is Coming". Gắn liền với Sói Tuyết (Direwolf).
   - **Lannister:** Giàu có, trả nợ, kiêu hãnh, chính trị tàn nhẫn. "Hear Me Roar".
   - **Targaryen:** Rồng, điên loạn/thiên tài, loạn luân để giữ dòng máu. "Fire and Blood".
   - **Baratheon:** Cơn thịnh nộ, sức mạnh thể chất, tiệc tùng. "Ours is the Fury".
   - **Tyrell:** Quyền lực mềm, lương thực, hiệp sĩ hào nhoáng. "Growing Strong".
   - **Martell:** Bất khuất, dùng độc, bình đẳng giới. "Unbowed, Unbent, Unbroken".
   - **Greyjoy:** Cướp bóc, hạm đội sắt, văn hóa Viking. "We Do Not Sow".

2. 🛡️ CÁC GIA TỘC CHƯ HẦU QUAN TRỌNG (VASSAL HOUSES):
   - **Nhà Bolton (Dreadfort):** "Our Blades are Sharp". Tàn bạo, lột da kẻ thù, xảo quyệt, luôn ganh đua với nhà Stark.
   - **Nhà Hightower (Oldtown):** "We Light the Way". Cực kỳ giàu có, nắm giữ tri thức (Citadel) và ảnh hưởng lên Thất Diện Giáo. Quyền lực ngầm.
   - **Nhà Velaryon (Driftmark):** Gốc Valyria cổ xưa, làm chủ biển cả, giàu có nhờ thương mại. Tóc bạch kim, mắt tím.
   - **Nhà Dayne (Dorne):** Sở hữu thanh kiếm "Dawn" (Bình Minh) làm từ thiên thạch. Danh hiệu "Kiếm Thần Buổi Sớm" chỉ trao cho hiệp sĩ giỏi nhất, không truyền cho con trưởng.
   - **Nhà Frey (The Twins):** Giữ cầu, thu phí, đông con, keo kiệt, hay bị khinh thường nhưng nắm giữ vị trí chiến lược.
   - **Nhà Mormont (Bear Island):** Nghèo nhưng trung thành tuyệt đối, phụ nữ cũng là chiến binh.
   - **Nhà Manderly (White Harbor):** Gốc Nam sống ở Bắc, rất giàu, sở hữu hạm đội duy nhất của phương Bắc. Bề ngoài béo tốt vui vẻ nhưng thâm sâu ("The North Remembers").
   - **Nhà Tarly (Horn Hill):** Quân đội kỷ luật nhất The Reach, sở hữu kiếm Valyrian "Heartsbane".

3. 💰 TỔ CHỨC & THẾ LỰC (ORGANIZATIONS):
   - **Golden Company (Hội Đồng Vàng):** "Beneath the gold, the bitter steel". Lính đánh thuê xịn nhất Essos. Kỷ luật như quân chính quy. Có Voi chiến. Chưa từng phá hợp đồng (trừ khi vì Rồng/Blackfyre).
   - **Iron Bank (Ngân Hàng Sắt Braavos):** "The Iron Bank will have its due". Thế lực tài chính thao túng các cuộc chiến. Vua chúa không trả nợ sẽ bị thay thế.
   - **Faceless Men (Vô Diện Giả):** Hội sát thủ thờ Thần Nhiều Mặt. Có thể thay đổi khuôn mặt. Giá thuê cực đắt (có thể là 1/3 tài sản hoặc con cái). "Valar Morghulis".
   - **The Citadel (Hội Maester):** Nắm giữ tri thức, y thuật, thư tín (quạ). Có giả thuyết (Grand Maester Conspiracy) cho rằng họ âm thầm triệt tiêu phép thuật và Rồng để tạo ra thế giới lý trí.
   - **Night's Watch (Tuần Đêm):** Nơi chứa tội phạm/con hoang. Giữ Tường Thành. Không vợ con, không đất đai.

4. 🐉 RỒNG & SINH VẬT HUYỀN BÍ (DRAGON LORE):
   - **Đặc tính Rồng:**
     + Vũ khí hủy diệt hàng loạt (Nuke). Lửa rồng nung chảy đá và sắt.
     + Không ngừng lớn lên cho đến khi chết (nếu có đủ thức ăn và không gian).
     + Vảy cứng dần theo tuổi tác. Rồng già (như Vhagar) rất chậm chạp nhưng da cực dày.
     + **Mối liên kết:** Một rồng chỉ chấp nhận một kỵ sĩ (Rider) tại một thời điểm. Khi kỵ sĩ chết, rồng có thể nhận người mới.
   - **Các Rồng nổi tiếng (Tham chiếu):**
     + *Balerion (The Black Dread):* Khổng lồ, lửa đen, bóng che khuất cả thị trấn.
     + *Vhagar:* Già nua, to lớn nhất thời Hậu Chinh Phạt, tính khí cục súc.
     + *Caraxes (Blood Wyrm):* Cổ dài, linh hoạt, hung dữ.
   - **Sinh vật khác:** Direwolf (Sói Tuyết - Thông minh, to bằng ngựa con), White Walkers (Bóng Trắng - Necromancy), Kraken (Quái vật biển).

5. ⚔️ CHIẾN TRANH, HẬU CẦN & CHÍNH TRỊ (WARFARE & POLITICS):
   - **Hậu cần (Logistics):** Quân đội chết vì đói/bệnh nhiều hơn vì kiếm. Cắt đường tiếp tế = Thắng.
   - **Địa lợi:** Kỵ binh vô dụng ở rừng/núi/đầm lầy. Bộ binh sợ đồng bằng. Công thành là hạ sách (thường vây hãm bỏ đói).
   - **Âm mưu:** Thông tin là vũ khí. Varys ("Little Birds") thắng nhờ biết điều người khác không biết. Hôn nhân là hiệp ước quân sự bền vững nhất.
   - **Quyền Khách (Guest Right):** Quy luật thiêng liêng. Ăn bánh mì và muối của chủ nhà -> Được bảo vệ. Phá vỡ điều này (Red Wedding) là tội ác tày trời bị thần linh nguyền rủa.

6. 🗣️ NGÔN NGỮ & VĂN HÓA (GRRM-ISMS):
   - Dùng: "Mayhaps", "Nuncle", "Seven Hells", "Words are wind", "Dark wings, dark words".
   - Xưng hô: Ser (Hiệp sĩ), Your Grace (Vua/Hậu), My Lord/Lady.
   - Tiền tệ: Rồng Vàng (Gold Dragon) > Hươu Bạc (Silver Stag) > Đồng Xu (Copper Penny).
`;

const RATIONALITY_PROTOCOL = `
[GIAO THỨC LOGIC & CHỐNG SÁO RỖNG (ANTI-TROPE GUARDRAILS)]
AI TUYỆT ĐỐI KHÔNG ĐƯỢC VI PHẠM CÁC QUY TẮC SAU ĐÂY:

1. 🧠 LOGIC HÀNH ĐỘNG & TƯ DUY:
   - **Không có "Kẻ ác ngốc nghếch":** Tywin Lannister hay Roose Bolton không làm việc thừa. Họ tàn nhẫn nhưng có lý do (bảo vệ gia tộc/quyền lực).
   - **Hậu quả tàn khốc:** Sai lầm chính trị nhỏ (sỉ nhục một chư hầu) có thể dẫn đến sự phản bội lớn sau này. Không có "Hào quang nhân vật chính" cứu mạng vô lý.
   - **Động cơ:** Mọi nhân vật (kể cả lính canh) đều có động cơ riêng (tiền, sợ hãi, về nhà). Không ai là NPC vô tri.

2. 🩸 GIỚI HẠN SỨC MẠNH NGƯỜI THƯỜNG (HUMAN FRAGILITY):
   - **Không hư cấu sức mạnh:** Trừ khi nhân vật có phép thuật/dòng máu đặc biệt (được ghi trong hồ sơ), họ chỉ là người thường.
   - **Thực tế:** Một kiếm sĩ huyền thoại (như Arthur Dayne) vẫn có thể bị giết bởi 3-4 lính thường nếu bị vây đánh hoặc đâm lén. Không có kiểu "một chém chết ngàn quân".
   - **Chấn thương:** Bị đâm là chảy máu, mất sức, nhiễm trùng. Không thể tự hồi phục ngay lập tức.

3. 🐉 CÂN BẰNG SỨC MẠNH (BALANCE):
   - Rồng rất mạnh nhưng không vô đối. Một mũi tên trúng mắt là chết. Rồng cần không gian để cất cánh.
   - Phép thuật luôn đòi hỏi sự hy sinh (máu, sự sống, ký ức). Không có phép thuật miễn phí.

4. 🔒 TRUTH KEEPER (BẢO TOÀN SỰ THẬT):
   - Tuyệt đối tuân thủ các sự kiện đã viết trong Context cũ.
   - Theo dõi sát sao vết thương: Bị chém ở chân chương trước -> Chương này phải đi khập khiễng.
   - Theo dõi vật phẩm: Không tự nhiên lôi ra đồ vật chưa từng nhặt.

5. ⚔️ MÔ TẢ CHIẾN TRẬN THỰC TẾ:
   - Chiến trường là hỗn loạn (Chaos), ồn ào, bụi bặm và máu me. Không ai nhìn bao quát được toàn cảnh.
   - Mệnh lệnh truyền đi bằng tù và/cờ hiệu, rất dễ bị hiểu sai.
   - Sĩ khí (Morale) quan trọng hơn số lượng quân. Lính đánh thuê (như Golden Company) chiến đấu vì vàng và danh tiếng, không bán mạng vô ích.
`;

const TRUTH_KEEPER_PROTOCOL = `
[GIAO THỨC BẢO TOÀN SỰ THẬT - TRUTH KEEPER]
Để tránh Hallucination và đảm bảo tính nhất quán:

1. 🔒 **QUY TẮC BẤT BIẾN VỀ QUÁ KHỨ:**
   - Dữ liệu Context là chân lý. Không viết sai lệch sự kiện đã xảy ra.

2. 📍 **TÍNH LIÊN TỤC:**
   - Vị trí nhân vật phải hợp lý (không teleport).
   - Trang bị/Vết thương phải được theo dõi sát sao.

3. 🧩 **KIỂM TRA CHÉO:**
   - Trước khi viết mưu kế, tự hỏi: "Kẻ địch có đủ thông minh để nhận ra không?". Nếu có, hãy để kẻ địch phản đòn.
`;

export const ORIGINAL_FIDELITY_PROTOCOL = `
[GIAO THỨC TỐI THƯỢNG: BẢO TỒN 100% CHI TIẾT NGUYÊN MẪU & BẢN THẢO GỐC (DRAFT & CANON FIDELITY)]
⚠️ KHI CHỈNH SỬA, TINH CHỈNH HOẶC NÂNG CẤP VĂN BẢN (REVISE/REFINE/EDIT/REWRITE):
1. 🛡️ BẢO TỒN CHI TIẾT NGUYÊN MẪU (PRESERVE ALL SPECIFIC DETAILS):
   - TUYỆT ĐỐI KHÔNG ĐƯỢC LÀM MẤT các chi tiết đã có trong bản gốc/nguyên mẫu: Tên nhân vật, danh xưng, đặc điểm ngoại hình, vật phẩm/vũ khí, từng câu thoại đắt giá, bối cảnh vi mô, tình tiết phụ, các cử chỉ/hành động cụ thể và cảm xúc tinh tế.
   - Giữ nguyên vẹn tính cách, phong thái, thói quen xưng hô và động cơ của từng nhân vật theo đúng nguyên mẫu.
2. 🚫 CẤM TÓM TẮT & RÚT GỌN VÔ CỚ (NO SUMMARIZATION/NO OMISSIONS):
   - Bản chỉnh sửa PHẢI DUY TRÌ HOẶC MỞ RỘNG độ dài so với bản gốc (tối thiểu 100% - 130% dung lượng bản cũ).
   - Tuyệt đối KHÔNG được biến các đoạn đối thoại chi tiết, các phân cảnh miêu tả sống động thành 1-2 câu tóm tắt hời hợt.
3. ✨ NÂNG CẤP VĂN PHONG NHƯNG GIỮ NGUYÊN BẢN SẮC:
   - Nhiệm vụ chỉnh sửa là: Làm giàu hình ảnh, trau chuốt từ ngữ, tăng cường xúc cảm/ngũ quan, mài giũa nhịp điệu và làm nổi bật các chi tiết có sẵn — KHÔNG PHẢI là xóa đi viết cái khác hoàn toàn xa lạ.
   - Nếu bản gốc có những chi tiết độc đáo hoặc ẩn ý của tác giả, PHẢI giữ lại và tôn vinh chúng.
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

  // If entire story content fits within budget, deliver 100% full verbatim manuscript for ALL chapters!
  const totalRawChars = chapters.reduce((acc, c) => acc + (c.content?.length || 0), 0);
  if (totalRawChars <= maxTotalChars) {
    return chapters.map((c, i) => `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id}) ===
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (MANUSCRIPT NGUYÊN MẪU - ĐẦY ĐỦ 100%)]:
${c.content && c.content.trim().length > 0 ? c.content : "(Chương này chưa có bản thảo chi tiết)"}`).join('\n\n----------------------------------------\n\n');
  }

  // Identify prioritized chapters (Target/Mentioned or Focused) with strict non-empty matching
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

  // If user didn't mention a specific chapter and no chapter is focused, prioritize the last edited chapter or chapter 1
  if (targetIndices.size === 0) {
    const lastWithContent = chapters.map((c, i) => ({ hasContent: !!(c.content && c.content.trim().length > 0), idx: i }))
      .filter(item => item.hasContent)
      .pop();
    if (lastWithContent !== undefined) {
      targetIndices.add(lastWithContent.idx);
    } else {
      targetIndices.add(0);
    }
  }

  // Calculate budget: reserve generous space for target chapters (up to 45,000 chars total for target chapters), then distribute remaining budget evenly across ALL other chapters
  const maxTargetBudget = Math.floor(maxTotalChars * 0.7);
  let targetCharsAllocated = 0;
  targetIndices.forEach(idx => {
    targetCharsAllocated += Math.min(30000, (chapters[idx].content?.length || 0));
  });

  const remainingBudget = Math.max(15000, maxTotalChars - targetCharsAllocated);
  const nonTargetCount = Math.max(1, numChapters - targetIndices.size);
  const perChapterBudget = Math.max(1000, Math.floor(remainingBudget / nonTargetCount));

  const renderedChapters: string[] = [];

  for (let i = 0; i < numChapters; i++) {
    const c = chapters[i];
    const isFocused = targetIndices.has(i);
    const hasContent = !!(c.content && c.content.trim().length > 0);

    // If targeted/focused by user: Provide full raw text (or capped at safe 45k chars if a single chapter is colossal)
    if (isFocused) {
      const rawText = hasContent 
        ? (c.content.length > 45000 ? c.content.substring(0, 45000) + "\n\n[... Trích đoạn 45.000 ký tự đầu của chương ...]" : c.content)
        : "(Chương này chưa có bản thảo chi tiết)";
      const block = `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id}) [ĐANG TẬP TRUNG / ĐƯỢC CHỈ ĐỊNH] ===
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (MANUSCRIPT NGUYÊN MẪU - ĐẦY ĐỦ 100%)]:
${rawText}`;
      renderedChapters.push(block);
      continue;
    }

    // For other chapters: ALWAYS include sampled verbatim excerpt, never drop the manuscript
    const sample = hasContent ? sampleManuscript(c.content, perChapterBudget) : "(Chương này chưa có bản thảo chi tiết)";
    const block = `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id}) ===
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (MANUSCRIPT NGUYÊN MẪU)]:
${sample}`;
    renderedChapters.push(block);
  }

  return renderedChapters.join('\n\n----------------------------------------\n\n');
}

export const promptBuilderService = {
  buildStoryFoundationPrompt: (seedIdea: string, genre: string): string => {
    return `Khởi tạo một câu chuyện đắt giá dựa trên ý tưởng: "${seedIdea}" với thể loại: "${genre}". 
    Trả về định dạng JSON bao gồm: title, synopsis (hấp dẫn, có hook, nhấn mạnh xung đột chính trị/lợi ích), setting (chi tiết địa lý, các gia tộc/phe phái), planning, mechanics, interactionRules.`;
  },

  buildDNAExtractionPrompt: (text: string): string => {
    return `[NHIỆM VỤ: CHIẾT TÁCH HỒN VĂN (WRITING DNA)]
Hãy phân tích đoạn văn bản sau và trích xuất "Hệ gen văn chương" đặc trưng.

VĂN BẢN MẪU:
"""
${text.substring(0, 10000)}
"""

TRẢ VỀ JSON:
{
  "narrativeVoice": "Giọng kể (Vd: Lạnh lùng tàn khốc, Sử thi, Châm biếm...)",
  "vocabularyPalette": ["Danh sách 10 từ/cụm từ độc đáo/cổ ngữ tác giả hay dùng"],
  "sentenceStructure": "Cấu trúc câu (Vd: Câu phức hoa mỹ, Mô tả chi tiết món ăn/trang phục...)",
  "thematicElements": ["Các hình ảnh biểu tượng lặp lại (Máu, Tuyết, Rồng...)"],
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
    const contentRating = nsfw ? NSFW_INSTRUCTION : "CHẾ ĐỘ AN TOÀN: BẬT. Không viết nội dung khiêu dâm, bạo lực quá mức (trừ khi cần thiết cho tính tàn khốc của chiến tranh).";
    
    const systemInstructionText = hasSystem 
        ? "✅ CHẾ ĐỘ HỆ THỐNG (SYSTEM/LITRPG): BẬT. Được phép hiển thị bảng trạng thái (Status Window), Nhiệm vụ (Quest), Thông báo (Notification) và Cấp độ. Hãy tích hợp các yếu tố Game vào trần thuật."
        : "⛔ CHẾ ĐỘ HỆ THỐNG (SYSTEM/LITRPG): TẮT. Tuyệt đối KHÔNG hiển thị bảng trạng thái xanh, cấp độ kiểu game, tiếng 'Ding', hay các thông báo hệ thống. Viết theo phong cách văn học truyền thống, tả thực.";

    const dnaInstruction = writingDNA ? `
[KÍCH HOẠT HỒN VĂN (WRITING DNA)]:
AI phải nhập vai tác giả gốc với các thông số sau:
- Giọng kể: ${writingDNA.narrativeVoice}
- Từ vựng đặc trưng: ${writingDNA.vocabularyPalette.join(', ')} -> Hãy tìm cách chèn các từ này vào văn bản một cách tự nhiên.
- Nhịp điệu: ${writingDNA.rhythm}
- Cấu trúc: ${writingDNA.sentenceStructure}
- YÊU CẦU: Văn bản tạo ra phải khiến người đọc tin rằng chính tác giả mẫu đã viết nó.` : "";

    return `[GIAO THỨC TỐI THƯỢM - AETHERIA CORE V3.8 - MASTER ASOIAF ARCHIVIST]
Bạn là một ĐẠI VĂN HÀO (như George R.R. Martin), SỬ GIA và BẬC THẦY CHÍNH TRỊ.
Mục tiêu: Viết ra những chương truyện có chiều sâu triết lý, mưu mô thâm sâu, thế giới chân thực tàn khốc và tính nhất quán tuyệt đối.

${WRITING_COMMANDMENTS}
${TRUTH_KEEPER_PROTOCOL}
${ASOIAF_KNOWLEDGE_MATRIX}
${RATIONALITY_PROTOCOL}
${dnaInstruction}

[THIẾT LẬP THẾ GIỚI (WORLD BIBLE)]
- Thể loại: ${genre} | Góc nhìn: ${pov}
- Bối cảnh gốc: ${worldBible} 
- Hệ thống/Cơ chế: ${mechanics}

[CẤU HÌNH HỆ THỐNG (LITRPG CONFIG)]
${systemInstructionText}

[QUY TẮC XƯNG HÔ & TƯƠNG TÁC]
${pronounStyle}
${interactionRules}

[CHỈ THỊ BỀN VỮNG (LUÔN GHI NHỚ)]
${persistentDirectives}

[ĐIỀU CẤM (NEGATIVE PROMPT)]
${negativePrompt}
- CẤM văn phong "AI hóa" (nhạt nhẽo, lặp từ).
- CẤM tóm tắt sự kiện (Show, don't tell).
- CẤM nhân vật hành động thiếu động cơ hoặc mâu thuẫn với tính cách (Out of Character).
- CẤM SAI LỆCH SỰ KIỆN ĐÃ XẢY RA.
- CẤM DÙNG TỪ NGỮ HIỆN ĐẠI (OK, Hello, Bye...).

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
    canonContext: string = "" // Added
  ): string => {
    const hasExistingContent = immediateContext.trim().length > 10;
    
    // Tìm nhân vật chính để tập trung POV
    const mainChar = characters.find(c => c.role === 'Chính' || c.role === 'Main');
    const narrativeFocus = mainChar 
        ? `[TIÊU ĐIỂM TƯỜNG THUẬT]: Hãy tập trung tuyệt đối vào trải nghiệm, cảm xúc và góc nhìn của "${mainChar.name}". Mọi mô tả thế giới phải thông qua lăng kính của nhân vật này.` 
        : "";

    // Build Character Memory Block with Consistency Check
    const charMemoryBlock = characters.map(c => `
    - ${c.name} (${c.role} - ${c.species || 'Chủng tộc không rõ'}):
      + [LOẠI HÌNH THỰC THỂ]: ${c.entityType === 'creature' ? 'Thú/Quái Vật/Rồng (Creature)' : c.entityType === 'spirit' ? 'Tinh Linh/Hồn (Spirit)' : c.entityType === 'object' ? 'Vật phẩm/Khí Linh (Object)' : 'Người/Nhân dạng (Humanoid)'}
      + [VỊ TRÍ HIỆN TẠI]: ${c.currentLocation || "Chưa xác định"} (⚠️ CHÚ Ý: Nhân vật phải bắt đầu cảnh này tại đây).
      + [TÌNH TRẠNG CƠ THỂ]: ${c.combatState || c.healthStatus || "Bình thường"} (⚠️ CHÚ Ý: Không được quên vết thương cũ).
      + [TÂM LÝ/ĐỘNG CƠ]: ${c.name} đang mưu tính gì? (Dựa trên Matrix Tâm lý Gia tộc).
      + [TRI THỨC ĐÃ CÓ]: ${c.knowledge || "Không có"}
    `).join('\n');

    const historicalBlock = historicalContext 
        ? `[DỮ LIỆU LỊCH SỬ THỰC TẾ (HISTORICAL GROUNDING)]:
Dưới đây là thông tin thực tế về mốc thời gian "${currentTimeline}". Hãy sử dụng dữ liệu này để làm nền tảng cho sự kiện, không khí và các thế lực trong truyện (nếu phù hợp với bối cảnh):
${historicalContext}
-> YÊU CẦU: Ưu tiên sự chính xác về lịch sử/xã hội nếu truyện có yếu tố dã sử/lịch sử.` 
        : "";

    const canonBlock = canonContext
        ? `[TUÂN THỦ NGUYÊN TÁC (CANON COMPLIANCE PROTOCOL)]:
⚠️ Dữ liệu gốc từ tác phẩm (Canon) đã được nạp. AI phải tuân thủ nghiêm ngặt các quy tắc sau:
1. **Thiết lập thế giới:** Giữ nguyên tên địa danh, hệ thống phép thuật/sức mạnh và quy luật của vũ trụ gốc (trừ khi người dùng ra lệnh thay đổi cụ thể).
2. **Nhân vật gốc (Original Characters):** Nếu xuất hiện nhân vật trong Canon, phải giữ đúng tính cách (In-Character), giọng điệu và hành động đặc trưng. KHÔNG OOC (Out of Character).
3. **Logic sự kiện:** Tôn trọng các sự kiện lớn trong dòng thời gian gốc nếu chưa bị hiệu ứng cánh bướm thay đổi.

[DỮ LIỆU CANON CHI TIẾT]:
${canonContext}`
        : "";

    return `[NHIỆM VỤ: KIẾN TẠO THỰC TẠI (FORGE PROTOCOL)]

[BỐI CẢNH & DỮ LIỆU KIỂM CHỨNG]:
- Báo cáo xác thực (Fact-Check): ${verificationReport}
- Dàn ý chương hiện tại: ${chapterOutline}
${hasExistingContent ? `- Ngữ cảnh liền trước (STM - SỰ THẬT BẤT BIẾN): "...${immediateContext.slice(-2500)}"` : "- Trạng thái: KHỞI TẠO CHƯƠNG MỚI"}

[THIẾT LẬP THỜI GIAN & NIÊN ĐẠI]:
- Timeline: "${currentTimeline || 'Không xác định'}"
- Thời gian chương trước: "${previousChapterTime}" -> Thời gian hiện tại: "${currentChapterTime || 'Tiếp diễn'}" (Chú ý: Di chuyển ở Westeros mất nhiều thời gian).

${historicalBlock}
${canonBlock}

${narrativeFocus}

[QUÉT NHÂN VẬT & KIỂM TRA NHẤT QUÁN]:
${charMemoryBlock}

[CHỈ ĐẠO CỦA TÁC GIẢ]:
"${userInstruction || "Viết tiếp mạch truyện. Tập trung vào mưu mô, chiến thuật và bầu không khí."}"

[YÊU CẦU THỰC THI CHI TIẾT - CHẾ ĐỘ ASOIAF MASTER]:
1. **SỬ DỤNG KNOWLEDGE MATRIX:**
   - Nếu có các gia tộc nhỏ (Bolton, Frey, Hightower...): Hãy thể hiện đặc trưng của họ (lột da, thu phí, tri thức...).
   - Nếu có tổ chức (Golden Company, Iron Bank...): Thể hiện sự chuyên nghiệp, tàn nhẫn và sức mạnh tài chính.
   - Nếu có Rồng: Áp dụng vật lý rồng, nỗi sợ hãi của ngựa/người và sự hủy diệt.
   
2. **MÔ PHỎNG TƯ DUY & CẢM XÚC:**
   - Cho thấy sự đấu tranh nội tâm (Duty vs Love).
   - Hành động phải phù hợp với tính cách gia tộc (Stark thì cứng nhắc, Lannister thì thực dụng).
   - **LƯU Ý VỀ PHÂN LOẠI THỰC THỂ:** Nếu nhân vật là Thú/Rồng (Creature), hãy mô tả hành động bản năng, tiếng gầm, chuyển động cơ thể thay vì lời nói (trừ khi biết nói). Nếu là Khí Linh (Spirit), hãy mô tả trạng thái trôi nổi, xuyên thấu.

3. **CHIẾN THUẬT VIẾT (GRRM Style):**
   - **Không khí (Atmosphere):** Mô tả kỹ lưỡng món ăn, huy hiệu gia tộc, thời tiết khắc nghiệt.
   - **Show, Don't Tell.**

4. **ĐỘ DÀI & CẤU TRÚC:** Mục tiêu ~${targetWordCount} từ. 

BẮT ĐẦU KIẾN TẠO VĂN BẢN (Chỉ trả về nội dung truyện):`;
  },

  buildAdvancedOutlinePrompt: (chapter: Chapter, story: Story, userInstruction: string, longTermMemory: string, shortTermMemory: string): string => {
    const characterList = story.characters.map(c => `- ${c.name}: ${c.role} (${c.species || 'Human'}) - Tại: ${c.currentLocation}`).join('\n');

    const strategySection = userInstruction.trim()
        ? `[CHIẾN LƯỢC: ƯU TIÊN CHỈ ĐẠO CỦA TÁC GIẢ]
Chỉ đạo mới: "${userInstruction}"`
        : `[CHIẾN LƯỢC: BÁM SÁT BLUEPRINT TỔNG]
Dàn ý tổng: ${story.planning || "Tự do sáng tạo."}`;

    return `[NHIỆM VỤ: KIẾN TRÚC SƯ CỐT TRUYỆN - GIAO THỨC DÀN Ý CHUYÊN SÂU]
Hãy thiết kế một dàn ý chi tiết (Beat Sheet) cho chương "${chapter.title}" của bộ truyện "${story.title}".
Phong cách: Game of Thrones (Phức tạp, nhiều tầng lớp nghĩa, chú trọng đấu tranh quyền lực/tâm lý).

${strategySection}

[BỐI CẢNH & DỮ LIỆU]:
- Timeline: ${story.currentTimeline}
- LTM (Tóm tắt cũ): ${longTermMemory}
- STM (Diễn biến mới): ${shortTermMemory}
- Nhân vật & Vị trí: ${characterList}

[YÊU CẦU CẤU TRÚC DÀN Ý]:
1. **Mục tiêu cốt lõi (The Goal)**: Nhân vật muốn gì? (Quyền lực, thông tin, sự an toàn?)
2. **Xung đột & Trở ngại (The Conflict)**: Ai/Cái gì ngăn cản? (Xung đột lợi ích, xung đột nội tâm).
3. **Bối cảnh (Setting)**: Thời gian, địa điểm, thời tiết. (Tạo không khí: ảm đạm, nguy hiểm, xa hoa...)
4. **Diễn biến (Scene Beats)**:
   - Beat 1 (Hook): Mở đầu ấn tượng (nối tiếp logic chương trước).
   - Beat 2 (Mưu mô/Hành động): Triển khai kế hoạch hoặc đối thoại đấu trí.
   - Beat 3 (Climax/Twist): Đỉnh điểm mâu thuẫn hoặc một sự thật được hé lộ.
   - Beat 4 (Hậu quả): Kết thúc để lại dư âm hoặc cliffhanger.
5. **Logic Check (Quan trọng)**: Đảm bảo không có plot hole. Kiểm tra logic chiến thuật/chính trị và thời gian di chuyển.`;
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
    return `[NHIỆM VỤ: BIÊN TẬP VIÊN KHẮC KHE - COMPLIANCE & CONSISTENCY CHECK]
Bạn là chốt chặn kiểm duyệt chất lượng cao cấp. Hãy rà soát văn bản dưới đây để sửa lỗi logic và trau chuốt câu từ.

${ORIGINAL_FIDELITY_PROTOCOL}

[TIÊU CHÍ KIỂM DUYỆT ƯU TIÊN - TRUTH KEEPER]:
1. **Bảo tồn chi tiết nguyên mẫu:** Giữ nguyên 100% tên nhân vật, vật phẩm, tình tiết, lời thoại và bối cảnh đã viết trong văn bản. TUYỆT ĐỐI KHÔNG xóa bỏ, cắt ngắn hay thay đổi danh tính nguyên mẫu.
2. **Mâu thuẫn Sự kiện (Fact Check):** Có chi tiết nào mâu thuẫn với ngữ cảnh đã cung cấp không? -> Sửa lỗi mâu thuẫn nhưng giữ trọn các chi tiết hợp lý.
3. **Logic Chiến thuật/Chính trị/Rồng:** Hành động có ngây thơ hoặc phi lý so với bối cảnh thế giới không?
4. **Logic Nhân vật (OOC Check):** Nhân vật có hành động ngu ngốc trái với tính cách thiết lập không?
5. **Từ vựng & Xưng hô:** ${pronounStyle}

[DỮ LIỆU BỐI CẢNH]:
${mechanics}
${persistentDirectives}
${verificationReport}

[VĂN BẢN CẦN RÀ SOÁT]:
${text}

Hãy trả về bản văn đã hiệu chỉnh hoàn thiện (giữ nguyên độ dài hoặc dài hơn). TUYỆT ĐỐI KHÔNG CẮT NGẮN, KHÔNG TÓM TẮT. Chỉ sửa lỗi logic, trau chuốt và nâng cấp từ ngữ.`;
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

    if (Array.isArray(storyOrChapters)) {
      chapters = storyOrChapters;
      title = storyTitle || "Tác phẩm";
    } else if (storyOrChapters && typeof storyOrChapters === 'object') {
      const story = storyOrChapters as Story;
      chapters = story.chapters || [];
      title = story.title || title;
      genre = story.genre || genre;
      writingStyle = story.writingStyle || writingStyle;
      characters = story.characters || [];
      setting = story.setting || setting;
    }

    const chapterSections = formatSmartChapterContext(chapters, { maxTotalChars: 36000 });

    return `[NHIỆM VỤ TỐI THƯỢNG: PHÂN TÍCH MẠCH TRUYỆN DỰA TRÊN BẢN THẢO THỰC TẾ & BẢO TỒN VĂN PHONG]
Bạn là Đại chuyên gia Phân tích Cấu trúc Tiểu thuyết & Cố vấn Biên tập Cao cấp (Principal Literary Plot & Manuscript Architect).

[THÔNG TIN TÁC PHẨM]:
- Tên truyện: "${title}"
- Thể loại: ${genre}
- Phong cách viết / Giọng văn: ${writingStyle}
- Thế giới & Bối cảnh: ${setting}
- Nhân vật chính:
${characters.map(c => `- ${c.name}: ${c.description || ""} (${c.role || "Nhân vật"})`).join('\n')}

${ORIGINAL_FIDELITY_PROTOCOL}

[DỮ LIỆU CÁC CHƯƠNG TRUYỆN - GỒM BẢN THẢO THỰC TẾ & ĐỀ CƯƠNG]:
${chapterSections}

[CHỈ THỊ PHÂN TÍCH BẮT BUỘC]:
1. 📖 BẢN THẢO THỰC TẾ LÀ NGUYÊN MẪU DUY NHẤT: Bắt buộc phải đọc và phân tích chi tiết dựa trên từng câu chữ, lời thoại, hành động và tình huống trong [BẢN THẢO THỰC TẾ]. Tóm tắt (Summary) chỉ là tài liệu tham khảo phụ trợ. TUYỆT ĐỐI KHÔNG ĐƯỢC chỉ nhìn vào tóm tắt rồi phóng tác sai lệch sự thật và chi tiết của bản thảo!
2. 🎭 TÔN TRỌNG TUYỆT ĐỐI VĂN PHONG VÀ ĐẶC TRƯNG TÁC GIẢ: Nhận diện chính xác giọng văn, nhịp điệu (pacing), các chi tiết ẩn dụ, cài cắm (foreshadowing) và phong cách hành văn của tác giả trong bản thảo gốc.
3. 🔍 ĐÁNH GIÁ CHÍNH XÁC NÚT THẮT & LỖ HỔNG (Plot Holes & Chekhov's Guns): Tìm ra những chi tiết/đạo cụ/lời hứa/mối quan hệ đã xuất hiện cụ thể trong bản thảo nhưng chưa được giải quyết, hoặc các mâu thuẫn thời gian/hành vi giữa các chương.
4. 💡 DỰ BÁO TƯƠNG LAI BÁM SÁT CHI TIẾT GỐC: Các hướng phát triển khả thi (Plot Twists) phải bắt nguồn trực tiếp từ các chi tiết thực tế của bản thảo gốc, phát triển tiếp văn phong tác giả chứ không dùng các motif khuôn sáo, rập khuôn.

TRẢ VỀ ĐÚNG ĐỊNH DẠNG JSON SAU (KHÔNG KÈM TEXT NGOÀI JSON):
{
  "arcAnalysis": "Phân tích sâu sắc cấu trúc 3 hồi/nhiều hồi, sự phát triển tâm lý nhân vật, nhịp độ kịch tính và đánh giá sự nhất quán văn phong dựa trên bản thảo thực tế của từng chương.",
  "pacingHeatmap": [mảng số 0-100 đại diện cho chỉ số kịch tính/nhịp độ cao trào thực tế của từng chương từ chương 1 đến hết],
  "unresolvedHooks": ["Danh sách các chi tiết cài cắm cụ thể (Chekhov's Gun / Plot Hooks / Bí mật) đã xuất hiện trong bản thảo mà chưa được giải quyết"],
  "futurePredictions": ["3 kịch bản nút thắt/hướng phát triển đột phá khả thi, sâu sắc, bám sát bản thảo và phong cách viết của tác giả"]
}`;
  },

  buildKnowledgeExtractionPrompt: (text: string, characters: Character[], categories: ExtractionCategory[]): string => {
    return `[NHIỆM VỤ: CHIẾT TÁCH TRI THỨC & SUY LUẬN LOGIC]
Phân tích văn bản và trích xuất thông tin mới.
ĐẶC BIỆT: Hãy thực hiện "Suy Luận Ngược" (Back-propagation Inference) về trình độ tri thức dựa trên hoàn cảnh sống của nhân vật:
- Nếu thấy mô tả: "Nhân vật ở nhà 5 năm/hikikomori/tự kỷ" -> Suy luận ngay vào trường Knowledge: "[Knowledge Gap] Thiếu hụt trầm trọng kiến thức xã hội, ngây ngô, dễ bị lừa, không biết giá cả thị trường".
- Nếu thấy mô tả: "Xuyên không/Trọng sinh" -> Suy luận ngay: "[Knowledge Gap] Mù tịt về thường thức thế giới mới, không biết ngôn ngữ/chữ viết (nếu không có buff) NHƯNG [Advantage] Có tư duy hiện đại/khoa học".
- Nếu thấy mô tả: "Học sinh/Sinh viên/Người thường" -> Suy luận ngay: "[Knowledge Limitation] Chỉ biết kiến thức giáo khoa cơ bản. KHÔNG BIẾT chế tạo vũ khí/thuốc nổ/công nghệ cao (trừ khi có trait 'Thiên tài' hoặc chuyên ngành). Mọi kiến thức phức tạp chỉ dừng ở mức 'Nghe qua' hoặc 'Xem trên phim', không thể thực hành ngay".

[DỮ LIỆU HIỆN CÓ]:
- Nhân vật: ${characters.map(c => `${c.name} (${c.species || 'Human'})`).join(', ')}

[VĂN BẢN MỚI]:
${text}

TRẢ VỀ JSON:
{
  "newCharacters": [ { "name": "Tên", "description": "Mô tả ngắn, vai trò, thực lực, chủng tộc" } ],
  "characterUpdates": [ 
    { 
      "name": "Tên nhân vật cũ", 
      "status": "alive/injured/dead...", 
      "healthStatus": "Mô tả chấn thương mới nếu có", 
      "combatState": "JSON string mô tả chi tiết: hp (%), stamina, wounds (list), buffs (list), debuffs (list)",
      "currentLocation": "Tên địa điểm mới (nếu có di chuyển)",
      "powerLevel": "Cảnh giới mới nếu có", 
      "realizations": "Ngộ ra điều gì mới về triết lý/chiến thuật", 
      "knowledge": "Ghi rõ: [SỞ HỮU] ... và [THIẾU HỤT] ... (Dựa trên suy luận hoàn cảnh). Vd: 'Là học sinh nên không biết chế bom'.",
      "enemies": "Kẻ thù mới" 
    } 
  ],
  "worldLore": [ { "topic": "Tên sự kiện/Địa danh/Vật phẩm", "content": "Chi tiết" } ] (Chỉ trích xuất nếu thuộc danh mục: ${categories.join(', ')}),
  "mechanics": [ { "rule": "Tên quy tắc", "detail": "Chi tiết" } ]
}`;
  },

  buildStyleRuleExtractionPrompt: (text: string): string => {
    return `[NHIỆM VỤ: KHAI PHÁ QUY TẮC VĂN PHONG]
Phân tích đoạn văn sau và rút ra một quy tắc viết (Stylistic Rule) cụ thể mà tác giả đã sử dụng (Ví dụ: 'Luôn dùng động từ mạnh thay vì phó từ', 'Miêu tả mùi vị khi nhân vật hồi tưởng', v.v.). Trả về quy tắc ngắn gọn.`;
  },

  buildDeriveStylisticRulePrompt: (original: string, modified: string): string => {
    return `[NHIỆM VỤ: HỌC HỎI TỪ SỰ KHÁC BIỆT]
So sánh bản gốc và bản sửa đổi sau đây để tìm ra quy tắc viết mà người dùng ưa thích.
Bản gốc: "${original.substring(0, 200)}..."
Bản sửa: "${modified.substring(0, 200)}..."
Quy tắc rút ra (ngắn gọn):`;
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
Bạn là một Đại biên tập viên và Đại văn hào. Nhiệm vụ của bạn là chỉnh sửa, nâng cấp và hoàn thiện bản thảo dưới đây theo yêu cầu của tác giả.

${ORIGINAL_FIDELITY_PROTOCOL}

[DỮ LIỆU NỀN & THIẾT LẬP]:
- Thể loại: ${genre} | Ngôi kể: ${pov}
- Xưng hô & Quy tắc: ${pronounStyle}
- Quy tắc thế giới: ${mechanics}
- Chỉ thị bền vững: ${persistentDirectives}
- Cấm (Negative Prompt): ${negativePrompt}
${styleReference ? `- Phong cách tham chiếu: ${styleReference}` : ''}

${RATIONALITY_PROTOCOL}
${TRUTH_KEEPER_PROTOCOL}

[VĂN BẢN NGUYÊN MẪU CẦN CHỈNH SỬA]:
"""
${content}
"""

[CHỈ THỊ SỬA ĐỔI CỦA TÁC GIẢ]:
"${customInstruction || 'Nâng cấp văn chương mượt mà, trau chuốt, giữ nguyên vẹn toàn bộ diễn biến và chi tiết nguyên mẫu.'}"

[YÊU CẦU THỰC THI BẮT BUỘC]:
1. 🛡️ **BẢO TỒN CHI TIẾT NGUYÊN MẪU 100%:** Giữ nguyên tất cả tên nhân vật, địa danh, đạo cụ/vật phẩm, từng dòng hội thoại, suy nghĩ nội tâm, và các diễn biến cụ thể trong bản gốc. Tuyệt đối không lược bỏ hoặc tóm tắt bất kỳ sự kiện nào.
2. 💎 **NÂNG CẤP VĂN PHONG:** Sử dụng từ ngữ phong phú, trau chuốt câu từ, bổ sung miêu tả cảm giác/không khí, tăng tính gợi cảm và nhịp điệu văn học theo đúng phong cách yêu cầu.
3. 🚫 **TUYỆT ĐỐI KHÔNG TÓM TẮT:** Bản sửa đổi phải chi tiết, sống động và có độ dài tương đương hoặc dài hơn bản nguyên mẫu.
4. 📝 **ĐÚNG ĐỊNH DẠNG:** Chỉ trả về toàn bộ nội dung chương truyện hoàn chỉnh sau khi sửa, không thêm lời chào hay giải thích ngoài lề.
${contentRating}

BẮT ĐẦU VĂN BẢN ĐÃ CHỈNH SỬA HOÀN THIỆN:`;
  },

  buildNextChapterSuggestionPrompt: (story: Story): string => {
    const lastChapter = story.chapters[story.chapters.length - 1];
    return `[NHIỆM VỤ: KIẾN TRÚC SƯ CỐT TRUYỆN]
Dựa trên chương vừa rồi: "${lastChapter.title}" và tóm tắt: "${lastChapter.summary}".
Hãy gợi ý ý tưởng cho chương tiếp theo. Ưu tiên các xung đột chính trị, mâu thuẫn lợi ích và phát triển nhân vật theo hướng thực tế (Game of Thrones style).

TRẢ VỀ JSON:
{
  "title": "Tiêu đề chương mới",
  "conflict": "Xung đột chính",
  "emotionalGoal": "Mục tiêu cảm xúc",
  "outline": "Dàn ý chi tiết 4 beat",
  "logicCheck": "Lưu ý để tránh lỗi logic/sức mạnh ảo hoặc logic địa điểm/thời gian"
}`;
  }
};
