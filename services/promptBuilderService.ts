
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
  rawChapters: Chapter[],
  options: {
    maxTotalChars?: number;
    focusChapterId?: string;
    targetChapterMention?: string;
    boostChapterIds?: string[];
    recentPrevWindow?: number;
  } = {}
): string {
  if (!rawChapters || rawChapters.length === 0) return "(Chưa có chương truyện nào)";

  const chapters = [...rawChapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const maxTotalChars = options.maxTotalChars || 95000;
  const numChapters = chapters.length;
  const focusId = options.focusChapterId;
  const recentPrevWindow = options.recentPrevWindow ?? 3;
  const boostSet = new Set(options.boostChapterIds || []);
  const mentionText = (options.targetChapterMention || "").trim().toLowerCase();

  const getDisplayText = (c: Chapter) => (c.content?.trim() ? c.content : (c.translatedContent || ''));

  // If entire story content fits within budget, deliver 100% full verbatim manuscript for ALL chapters!
  const totalRawChars = chapters.reduce((acc, c) => acc + getDisplayText(c).length, 0);
  if (totalRawChars <= maxTotalChars) {
    return chapters.map((c, i) => {
      const text = getDisplayText(c);
      const isFocusedTag = focusId && c.id === focusId ? ' [ĐANG TẬP TRUNG / ĐƯỢC CHỈ ĐỊNH]' : '';
      return `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id})${isFocusedTag} ===
[Mốc thời gian]: ${c.timeSetting || '(Tiếp nối)'}
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (MANUSCRIPT NGUYÊN MẪU - ĐẦY ĐỦ 100%)]:
${text.trim().length > 0 ? text : "(Chương này chưa có bản thảo chi tiết)"}`;
    }).join('\n\n----------------------------------------\n\n');
  }

  // Identify prioritized chapters (Target/Mentioned or Focused) using boundary-aware number matching
  const isTarget = (c: Chapter, i: number) => {
    if (focusId && c.id === focusId) return true;
    if (mentionText.length >= 2) {
      const chNum = i + 1;
      const numBoundaryRegex = new RegExp(`(?:chương|chuong|chapter|tập tin|ch\\.|c)\\s*0*${chNum}(?![0-9])`, 'i');
      if (numBoundaryRegex.test(mentionText)) return true;
      if (c.order && c.order !== chNum) {
        const orderRegex = new RegExp(`(?:chương|chuong|chapter|c)\\s*0*${c.order}(?![0-9])`, 'i');
        if (orderRegex.test(mentionText)) return true;
      }
      if (c.title && c.title.trim().length >= 4 && mentionText.includes(c.title.trim().toLowerCase())) return true;
      if (c.id && c.id.trim().length >= 6 && mentionText.includes(c.id.trim().toLowerCase())) return true;
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
    for (let offset = 1; offset <= recentPrevWindow; offset++) {
      if (idx - offset >= 0) neighborIndices.add(idx - offset);
    }
    if (idx + 1 < numChapters) neighborIndices.add(idx + 1);
  });
  chapters.forEach((c, idx) => {
    if (boostSet.has(c.id)) neighborIndices.add(idx);
  });
  neighborIndices.add(0);
  if (numChapters > 1) neighborIndices.add(numChapters - 1);
  targetIndices.forEach(idx => neighborIndices.delete(idx));

  // Reserve guaranteed space for chronological timeline across ALL chapters, while ensuring renderedChapters (especially focused/latest chapter) are NEVER tail-sliced off!
  const timelineReserve = Math.min(28000, Math.max(4500, numChapters * 340));
  const workingBudget = Math.max(14000, maxTotalChars - timelineReserve);
  const targetCharsAllocated = Math.min(54000, Math.floor(workingBudget * 0.52));
  const perTargetBudget = Math.floor(targetCharsAllocated / Math.max(1, targetIndices.size));

  const remainingBudget = Math.max(8000, workingBudget - targetCharsAllocated);
  const sampleCandidateCount = Math.max(1, neighborIndices.size);
  const perSampleBudget = Math.min(6000, Math.max(1100, Math.floor(remainingBudget / sampleCandidateCount)));

  const perChapterTimelineCap = Math.max(160, Math.min(480, Math.floor((timelineReserve - 400) / Math.max(1, numChapters)) - 45));

  const renderedChapters: string[] = [];
  const chronologicalTimeline: string[] = [];

  for (let i = 0; i < numChapters; i++) {
    const c = chapters[i];
    const isFocused = targetIndices.has(i);
    const isNeighbor = neighborIndices.has(i);
    const fullText = getDisplayText(c);
    const hasContent = fullText.trim().length > 0;
    const chLabel = `Chương ${i + 1}${c.title ? ` (${c.title})` : ''}`;

    let timelineSummary = c.summary?.trim() || c.outline?.trim() || '';
    if (!timelineSummary && hasContent) {
      if (fullText.length <= perChapterTimelineCap) {
        timelineSummary = fullText.replace(/\s+/g, ' ');
      } else {
        // 4-point digest (head, 1/3 mid, 2/3 mid, tail) when chapter hasn't been summarized yet
        const partLen = Math.max(40, Math.floor((perChapterTimelineCap - 16) / 4));
        const p1 = fullText.slice(0, partLen);
        const p2 = fullText.slice(Math.floor(fullText.length * 0.33), Math.floor(fullText.length * 0.33) + partLen);
        const p3 = fullText.slice(Math.floor(fullText.length * 0.66), Math.floor(fullText.length * 0.66) + partLen);
        const p4 = fullText.slice(-partLen);
        timelineSummary = `${p1} … ${p2} … ${p3} … ${p4}`.replace(/\s+/g, ' ');
      }
    }
    if (!timelineSummary) timelineSummary = '(Chưa viết)';
    chronologicalTimeline.push(`• ${chLabel} [${c.timeSetting || '—'}]: ${timelineSummary.slice(0, perChapterTimelineCap)}`);

    if (isFocused) {
      let rawText = "(Chương này chưa có bản thảo chi tiết)";
      if (hasContent) {
        if (fullText.length <= perTargetBudget) {
          rawText = fullText;
        } else {
          // Preserve head (35%), middle (15%), and tail (50%) — never blind-cut off chapter endings!
          const headLen = Math.floor(perTargetBudget * 0.35);
          const midLen = Math.floor(perTargetBudget * 0.15);
          const tailLen = Math.max(1000, perTargetBudget - headLen - midLen);
          const midStart = Math.max(headLen, Math.floor((fullText.length - tailLen - midLen) / 2));
          rawText = `${fullText.slice(0, headLen)}\n\n[... Đoạn giữa ...]\n\n${fullText.slice(midStart, midStart + midLen)}\n\n[... PHẦN KẾT CHƯƠNG ...]\n\n${fullText.slice(-tailLen)}`;
        }
      }
      const block = `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id}) [ĐANG TẬP TRUNG / ĐƯỢC CHỈ ĐỊNH] ===
[Mốc thời gian]: ${c.timeSetting || '(Tiếp nối)'}
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (MANUSCRIPT NGUYÊN MẪU)]:
${rawText}`;
      renderedChapters.push(block);
      continue;
    }

    if (isNeighbor) {
      const sample = hasContent ? sampleManuscript(fullText, perSampleBudget) : "(Chương này chưa có bản thảo chi tiết)";
      const relationTag = boostSet.has(c.id) ? ' [KHỚP NGỮ CẢNH/TỪ KHÓA]' : ' [LIỀN KỀ / GẦN ĐÂY]';
      const block = `=== CHƯƠNG ${i + 1}: ${c.title || `Chương ${i + 1}`} (ID: ${c.id})${relationTag} ===
[Mốc thời gian]: ${c.timeSetting || '(Tiếp nối)'}
[Đề cương (Outline)]: ${c.outline || "(Chưa có)"}
[Tóm tắt sơ lược (Summary)]: ${c.summary || "(Chưa có)"}
[BẢN THẢO THỰC TẾ (TRÍCH ĐOẠN)]:
${sample}`;
      renderedChapters.push(block);
    }
  }

  let timelineSection = `=== MỤC LỤC DIỄN BIẾN XUYÊN SUỐT TOÀN BỘ ${numChapters} CHƯƠNG (KHÔNG ĐƯỢC QUÊN) ===\n${chronologicalTimeline.join('\n')}`;
  let renderedJoined = renderedChapters.join('\n\n----------------------------------------\n\n');
  const combined = `${timelineSection}\n\n========================================\n\n${renderedJoined}`;
  if (combined.length > maxTotalChars) {
    // Protect renderedChapters (especially focused/latest chapter at bottom!) by trimming excess timelineSection first, then keeping head+tail of renderedJoined
    const timelineMax = Math.max(3000, Math.floor(maxTotalChars * 0.25));
    if (timelineSection.length > timelineMax) {
      timelineSection = timelineSection.slice(0, timelineMax) + '\n[... Đã nén bớt mô tả mục lục phụ ...]';
    }
    const bodyBudget = Math.max(4000, maxTotalChars - timelineSection.length - 80);
    if (renderedJoined.length > bodyBudget) {
      // Keep the most recent/focused chapters at the tail + opening chapter at the head
      const headKeep = Math.floor(bodyBudget * 0.25);
      const tailKeep = bodyBudget - headKeep;
      renderedJoined = `${renderedJoined.slice(0, headKeep)}\n\n[... Đã lược bớt trích đoạn giữa để bảo toàn 100% chương trọng tâm & các chương gần nhất ...]\n\n${renderedJoined.slice(-tailKeep)}`;
    }
    return `${timelineSection}\n\n========================================\n\n${renderedJoined}`;
  }
  return combined;
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

const formatPinnedMemoryBlock = (story: Story): string => {
  const pm = story.pinnedMemory;
  if (!pm) return '';
  const sections = [
    pm.physical?.length ? `- Thể chất/Thương tích đang ghim: ${pm.physical.join('; ')}` : '',
    pm.emotional?.length ? `- Trạng thái tâm lý đang ghim: ${pm.emotional.join('; ')}` : '',
    pm.relational?.length ? `- Quan hệ nhân vật đang ghim: ${pm.relational.join('; ')}` : '',
    pm.world?.length ? `- Sự thật thế giới đang ghim: ${pm.world.join('; ')}` : '',
    pm.inventory?.length ? `- Hành trang/Vật phẩm đang mang: ${pm.inventory.join('; ')}` : ''
  ].filter(Boolean);
  return sections.join('\n');
};

export function buildCompleteWorldBibleBlock(
  story: Story,
  retrievedKnowledge?: string,
  options: { includePlanning?: boolean; maxKnowledgeChars?: number; maxLogEntries?: number } = {}
): string {
  const includePlanning = options.includePlanning !== false;
  const maxKnowledgeChars = options.maxKnowledgeChars ?? 22000;
  const maxLogEntries = options.maxLogEntries ?? 60;

  // High-priority anchor sections that must NEVER be truncated off by a large setting/log section
  const criticalAnchors: string[] = [];
  if (story.persistentDirectives?.trim()) {
    criticalAnchors.push(`- Chỉ thị bền vững (BẮT BUỘC TUÂN THỦ): ${story.persistentDirectives.trim()}`);
  }
  if (story.negativePrompt?.trim()) {
    criticalAnchors.push(`- Điều cấm (Negative Prompt): ${story.negativePrompt.trim()}`);
  }
  if (story.pronounStyle?.trim()) {
    criticalAnchors.push(`- Quy tắc xưng hô chuẩn: ${story.pronounStyle.trim()}`);
  }
  if (story.interactionRules?.trim()) {
    criticalAnchors.push(`- Quy tắc tương tác & Ràng buộc: ${story.interactionRules.trim()}`);
  }
  if (story.mechanics?.trim()) {
    criticalAnchors.push(`- Hệ thống sức mạnh / Cơ chế thế giới (Mechanics): ${story.mechanics.trim().slice(0, 4500)}`);
  }
  if (story.currentTimeline?.trim()) {
    criticalAnchors.push(`- Dòng thời gian tổng: ${story.currentTimeline.trim()}`);
  }

  const pinnedBlock = formatPinnedMemoryBlock(story);
  if (pinnedBlock) {
    criticalAnchors.push(`\n[TRẠNG THÁI & KÝ ỨC ĐANG GHIM (PINNED MEMORY)]:\n${pinnedBlock}`);
  }

  const coreWorld: string[] = [];
  if (story.synopsis?.trim()) coreWorld.push(`- Văn án / Trục cốt truyện: ${story.synopsis.trim().slice(0, 2500)}`);
  if (includePlanning && story.planning?.trim()) {
    coreWorld.push(`- Dàn ý tổng thể (Master Blueprint): ${story.planning.trim().slice(0, 4500)}`);
  }
  coreWorld.push(`- Bối cảnh thế giới (Setting): ${story.setting?.trim().slice(0, 6000) || '(Chưa thiết lập)'}`);
  if (story.maps?.trim()) coreWorld.push(`- Bản đồ & Địa lý: ${story.maps.trim().slice(0, 2500)}`);
  if (story.officials?.trim()) coreWorld.push(`- Thế lực, Tổ chức & Hệ thống quan chức: ${story.officials.trim().slice(0, 2500)}`);
  if (story.logistics?.trim()) coreWorld.push(`- Hậu cần, Đời sống & Tổ chức xã hội: ${story.logistics.trim().slice(0, 1500)}`);
  if (story.economy?.trim() || story.trade?.trim()) {
    coreWorld.push(`- Kinh tế, Tiền tệ & Giao thương: ${[story.economy, story.trade].filter(Boolean).join(' | ').slice(0, 1500)}`);
  }
  if (story.styleReference?.trim()) coreWorld.push(`- Phong cách tham chiếu: ${story.styleReference.trim().slice(0, 1200)}`);

  const secondarySections: string[] = [];
  const activeEvolution = (story.evolutionLogs || [])
    .filter(l => l.isActive)
    .slice(0, 20)
    .map(l => `- ${l.learnedRule}`)
    .join('\n');
  if (activeEvolution) {
    secondarySections.push(`\n[QUY TẮC VĂN PHONG TÁC GIẢ ĐÃ HỌC]:\n${activeEvolution}`);
  }

  const retrievedNorm = (retrievedKnowledge || '').trim();
  if (retrievedNorm) {
    secondarySections.push(`\n[TRI THỨC LIÊN QUAN TRUY XUẤT THEO NGỮ CẢNH]:\n${retrievedNorm.slice(0, 6500)}`);
  }

  const allActiveLogs = (story.knowledgeLogs || []).filter(k => k.isActive);
  // Keep earliest foundational logs + newest logs (up to maxLogEntries total), skipping duplicates already in retrievedKnowledge
  const headLogs = Math.floor(maxLogEntries * 0.4);
  const tailLogs = maxLogEntries - headLogs;
  const selectedLogs =
    allActiveLogs.length <= maxLogEntries
      ? allActiveLogs
      : [...allActiveLogs.slice(0, headLogs), ...allActiveLogs.slice(-tailLogs)];
  const activeLogLines = selectedLogs
    .filter(k => !retrievedNorm.includes(k.title) || !retrievedNorm.includes(k.content.slice(0, 50)))
    .map(k => `- [${k.category.toUpperCase()}] ${k.title}: ${k.content}`)
    .join('\n');
  if (activeLogLines) {
    const logCharLimit = Math.min(28000, Math.max(12000, Math.floor(maxKnowledgeChars * 0.45)));
    secondarySections.push(`\n[TRI THỨC THẾ GIỚI & LUẬT LỆ ĐÃ KHÓA]:\n${activeLogLines.slice(0, logCharLimit)}`);
  }

  if (!story.isFanfiction && story.referenceDocs?.length) {
    const refExcerpts = story.referenceDocs
      .slice(0, 5)
      .map(d => `- [${d.name}]: ${sampleManuscript(d.content || d.analysis?.summary || '', 1400)}`)
      .join('\n');
    if (refExcerpts) {
      secondarySections.push(`\n[TƯ LIỆU THAM KHẢO ĐÍNH KÈM]:\n${refExcerpts}`);
    }
  }

  const criticalText = criticalAnchors.join('\n');
  const remainingForCoreAndSecondary = Math.max(2000, maxKnowledgeChars - criticalText.length - 80);
  const coreText = coreWorld.join('\n');
  const secText = secondarySections.join('\n');

  let variablePart = [coreText, secText].filter(Boolean).join('\n');
  if (variablePart.length > remainingForCoreAndSecondary) {
    const coreBudget = Math.floor(remainingForCoreAndSecondary * 0.55);
    const secBudget = Math.max(500, remainingForCoreAndSecondary - coreBudget);
    const trimmedCore = coreText.length > coreBudget ? coreText.slice(0, coreBudget) + '\n[... Đã tóm gọn bớt mô tả nền ...]' : coreText;
    const trimmedSec = secText.length > secBudget ? secText.slice(0, secBudget) + '\n[... Đã tóm gọn bớt nhật ký phụ ...]' : secText;
    variablePart = [trimmedCore, trimmedSec].filter(Boolean).join('\n');
  }

  return [criticalText, variablePart].filter(Boolean).join('\n\n');
}

export const promptBuilderService = {
  buildCompleteWorldBibleBlock,

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

    const compactSettingAnchor = worldBible ? sampleManuscript(worldBible, 2200) : '(Xem chi tiết World Bible trong ngữ cảnh nhiệm vụ)';

    return `[GIAO THỨC VIẾT TRUYỆN CHUYÊN NGHIỆP - AETHERIA LITERARY ENGINE]
Bạn là một Nhà văn & Tổng biên tập tiểu thuyết kỳ cựu chuyên viết thể loại: ${genre || 'Tiểu thuyết'}.
Mục tiêu: Tạo ra những chương truyện có mạch lạc chặt chẽ, tâm lý nhân vật có chiều sâu, TUYỆT ĐỐI TRUNG THÀNH với toàn bộ thiết lập thế giới/nhân vật và KHÔNG viết lan man hay chồng chéo nội dung.

${WRITING_COMMANDMENTS}
${TRUTH_KEEPER_PROTOCOL}
${asoiafBlock}
${UNIVERSAL_RATIONALITY_PROTOCOL}

[GIAO THỨC CHỐNG QUÊN THIẾT LẬP & CHỐNG CHỒNG CHÉO (MANDATORY ANTI-DRIFT & ANTI-OVERLAP)]:
1. 🔒 **KHÓA CHẶT THIẾT LẬP (ZERO INVENTION AGAINST CANON):** Mọi địa danh, thế lực, cấp bậc sức mạnh, quy tắc xã hội, xưng hô, vết thương và tri thức nhân vật phải lấy từ [THIẾT LẬP THẾ GIỚI] và [HỒ SƠ NHÂN VẬT]. Tuyệt đối không tự bịa cơ chế trái luật hoặc quên đặc điểm nhân vật.
2. 🎯 **KHÔNG VIẾT LIÊN THIÊN / LẠC ĐỀ:** Mọi phân cảnh viết ra phải đẩy trực tiếp [ĐỀ CƯƠNG CHƯƠNG] hoặc [CHỈ ĐẠO TÁC GIẢ] tiến về phía trước. Cấm kéo dài cảnh phụ vô nghĩa hoặc đưa nhân vật đi lạc khỏi mục tiêu chương.
3. 🚫 **KHÔNG CHỒNG CHÉO NỘI DUNG:**
   - KHÔNG lặp lại câu/đoạn vừa kết thúc, KHÔNG tóm tắt lại những gì đã xảy ra ở đầu/giữa chương hiện tại hoặc chương trước.
   - KHÔNG giải quyết trước hoặc viết lấn sang sự kiện đã thuộc về [RANH GIỚI CHƯƠNG KẾ TIẾP].
${dnaInstruction}

[NEO THIẾT LẬP CỐT LÕI (CORE ANCHORS)]
- Thể loại: ${genre || 'Tiểu thuyết'} | Góc nhìn (POV): ${pov || 'Ngôi thứ 3'}
- Phong cách mong muốn: ${writingStyle || 'Tự nhiên, lôi cuốn, giàu hình ảnh'}
- Tóm tắt bối cảnh nền: ${compactSettingAnchor}
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
    fandomName: string = "",
    extraContext?: {
      nextChapterFence?: string;
      earlierChapterSummary?: string;
      allEarlierTimeline?: string;
      retrievedChapters?: string;
      continuityLedger?: string;
      completeWorldBlock?: string;
      currentChapterTitle?: string;
    }
  ): string => {
    const trimmedContext = (immediateContext || '').trim();
    const hasExistingContent = trimmedContext.length > 10;
    const isAsoiaf = isAsoiafUniverse(genre, worldBible, mechanics, fandomName);
    
    const mainChar = characters.find(c => c.role === 'Chính' || c.role === 'Main');
    const narrativeFocus = mainChar 
        ? `[TIÊU ĐIỂM TƯỜNG THUẬT]: Chú trọng góc nhìn, cảm xúc và mục tiêu hiện tại của nhân vật chính "${mainChar.name}".` 
        : "";

    const charMemoryBlock = characters.length > 0
      ? formatCharacterRosterForPrompt(characters, 40)
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

    let contextSection = "- Trạng thái: KHỞI TẠO PHÂN CẢNH MỞ ĐẦU CHƯƠNG MỚI";
    if (hasExistingContent) {
      if (trimmedContext.length <= 9000) {
        contextSection = `- Toàn bộ nội dung đã viết cho đến hiện tại (ĐÃ XẢY RA — BẮT BUỘC NỐI TIẾP TỊNH TIẾN, TUYỆT ĐỐI KHÔNG VIẾT LẠI BẤT KỲ CẢNH NÀO ĐÃ CÓ BÊN DƯỚI):\n"""\n${trimmedContext}\n"""`;
      } else {
        const earlierPart = trimmedContext.slice(0, trimmedContext.length - 5500);
        const tailPart = trimmedContext.slice(-5500);
        contextSection = `- Phần mở đầu/giữa đã viết trong chương này (CHỈ ĐỂ NHỚ MẠCH SỰ KIỆN — CẤM VIẾT LẠI):\n"""\n${sampleManuscript(earlierPart, 3500)}\n"""\n\n- Đoạn kết gần nhất (ĐIỂM DỪNG CUỐI CÙNG — HÃY VIẾT TIẾP NGAY TỪ CHỮ CUỐI CÙNG DƯỚI ĐÂY):\n"""\n${tailPart}\n"""`;
      }
    }

    const effectiveWorldBlock = extraContext?.completeWorldBlock?.trim()
      ? extraContext.completeWorldBlock
      : (worldBible ? worldBible.slice(0, 22000) : "(Theo ngữ cảnh chương trước)");

    return `[NHIỆM VỤ: VIẾT TIẾP / KIẾN TẠO MẠCH TRUYỆN NHẤT QUÁN${extraContext?.currentChapterTitle ? ` — ${extraContext.currentChapterTitle}` : ''}]

[TÓM TẮT ĐỊNH HƯỚNG TỔNG THỂ (MASTER BLUEPRINT)]:
${planning ? planning.slice(0, 4500) : "(Chưa có dàn ý tổng thể)"}

[HỒ SƠ THẾ GIỚI, LUẬT LỆ & TRI THỨC ĐẦY ĐỦ]:
${effectiveWorldBlock}
${!extraContext?.completeWorldBlock && mechanics ? `\n- Quy tắc / Hệ thống sức mạnh: ${mechanics}` : ""}
${!extraContext?.completeWorldBlock && (interactionRules || pronounStyle) ? `\n- Quy tắc tương tác & Xưng hô (${pronounStyle}): ${interactionRules || pronounStyle}` : ""}
${!extraContext?.completeWorldBlock && persistentDirectives ? `\n- Chỉ thị bền vững: ${persistentDirectives}` : ""}
${extraContext?.allEarlierTimeline ? `\n[DÒNG SỰ KIỆN TỪ ĐẦU TRUYỆN ĐẾN NAY (KHÔNG ĐƯỢC QUÊN)]:\n${extraContext.allEarlierTimeline}` : ""}
${extraContext?.continuityLedger ? `\n[SỔ CÁI DẤU CHÂN, ĐỊA ĐIỂM & SỰ KIỆN ĐÃ QUA]:\n${extraContext.continuityLedger}` : ""}
${extraContext?.earlierChapterSummary ? `\n[TÓM TẮT CHI TIẾT CÁC CHƯƠNG GẦN NHẤT (ĐÃ XẢY RA — CẤM LẶP LẠI)]:\n${extraContext.earlierChapterSummary}` : ""}
${extraContext?.retrievedChapters ? `\n[CẢNH/SỰ KIỆN LIÊN QUAN TỪ CÁC CHƯƠNG TRƯỚC (TRUY XUẤT THEO NGỮ CẢNH)]:\n${extraContext.retrievedChapters}` : ""}
${verificationReport ? `\n[GHI CHÚ KIỂM TRA / ĐỐI CHIẾU]:\n${verificationReport}` : ""}

[NGỮ CẢNH CHƯƠNG ĐANG VIẾT]:
- Dàn ý chương đang viết (BẮT BUỘC BÁM SÁT): ${chapterOutline || "(Tự triển khai nối tiếp tự nhiên từ diễn biến trước)"}
${contextSection}
${extraContext?.nextChapterFence ? `\n[RANH GIỚI CHƯƠNG KẾ TIẾP — TUYỆT ĐỐI KHÔNG VIẾT LẤN SANG SỰ KIỆN CỦA CHƯƠNG SAU]:\n${extraContext.nextChapterFence}` : ""}

[MỐC THỜI GIAN]:
- Dòng thời gian truyện: "${currentTimeline || 'Không xác định'}"
- Thời gian chương trước: "${previousChapterTime || 'Không rõ'}" -> Thời gian chương hiện tại: "${currentChapterTime || 'Tiếp diễn tự nhiên'}"

${historicalBlock}
${canonBlock}
${narrativeFocus}

[HỒ SƠ NHÂN VẬT & TRẠNG THÁI HIỆN TẠI (${characters.length} nhân vật)]:
${charMemoryBlock}

[CHỈ ĐẠO CỦA TÁC GIẢ CHO ĐOẠN NÀY]:
"${userInstruction || "Viết tiếp mạch truyện tịnh tiến rõ ràng theo đề cương chương, tuân thủ 100% thiết lập thế giới và hồ sơ nhân vật."}"

[YÊU CẦU THỰC THI NGHIÊM NGẶT]:
1. **Tiếp diễn tịnh tiến, CẤM lặp/chồng chéo:** Tiếp tục ngay sau câu cuối cùng ở trên; KHÔNG lặp lại ý vừa nói, KHÔNG kể lại sự kiện đã có ở phần đầu chương hoặc chương trước, KHÔNG nhảy cóc sang phần việc của [RANH GIỚI CHƯƠNG KẾ TIẾP].
2. **Bám sát 100% Thiết lập & Nhân vật:** Kiểm tra lại tên, danh xưng, vị trí địa lý, thương tích, cảnh giới, vật phẩm và giới hạn hiểu biết của từng nhân vật trước khi cho họ hành động/đối thoại.
3. **Show, Don't Tell:** Tái hiện cảnh qua hành động, đối thoại có hồn, cảm giác trực tiếp và diễn biến tâm lý tinh tế; không viết lan man dài dòng vô mục đích.
4. **Phân biệt loại thực thể:** Nếu nhân vật là Thú/Sinh vật hoặc Tinh linh/Khí linh, mô tả hành vi và năng lực đúng bản chất chủng loài.
${isAsoiaf ? "5. **Hương vị Westeros/ASOIAF:** Giữ đúng bầu không khí chính trị thực tế, gia tộc và ngôn ngữ đặc trưng." : `5. **Độ dài & Nhịp điệu:** Viết khoảng ~${targetWordCount} từ với nhịp điệu chặt chẽ, phù hợp thể loại ${genre || 'của truyện'}.`}

BẮT ĐẦU VIẾT TIẾP NỘI DUNG TRUYỆN (Chỉ xuất phần văn bản mới nối tiếp, không lặp lại đoạn kết cũ và không thêm lời bình luận):`;
  },

  buildChapterPlotWriteOrFixPrompt: (
    chapter: Chapter,
    story: Story,
    options: { repairInstruction?: string; continuityNotes?: string; retrievedKnowledge?: string; retrievedChapters?: string; continuityLedger?: string } = {}
  ): string => {
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = sortedChapters.findIndex(c => c.id === chapter.id);
    const prevChapter = idx > 0 ? sortedChapters[idx - 1] : undefined;
    const nextChapter = idx >= 0 && idx < sortedChapters.length - 1 ? sortedChapters[idx + 1] : undefined;

    const currentDraft = chapter.content?.trim() ? chapter.content : (chapter.translatedContent || '');
    const hasOriginalDraft = currentDraft.trim().length > 30;
    const prevDraft = prevChapter ? (prevChapter.content?.trim() ? prevChapter.content : (prevChapter.translatedContent || '')) : '';

    const earlierTimeline = idx > 5
      ? sortedChapters
          .slice(0, idx - 5)
          .map((c, ci) => `• Chương ${ci + 1} (${c.title}): ${(c.summary || c.outline || sampleManuscript(c.content || c.translatedContent || '', 260)).replace(/\s+/g, ' ').slice(0, 280)}`)
          .join('\n')
      : '';

    const earlierChaptersSummary = sortedChapters
      .slice(Math.max(0, idx - 5), Math.max(0, idx))
      .map(c => `- ${c.title}: ${c.summary || c.outline || sampleManuscript(c.content || c.translatedContent || '', 450)}`)
      .join('\n');

    const worldBlock = buildCompleteWorldBibleBlock(story, options.retrievedKnowledge, {
      includePlanning: true,
      maxKnowledgeChars: 20000
    });

    const dnaBlock = story.writingDNA
      ? `[HỒN VĂN TÁC GIẢ]: Giọng kể: ${story.writingDNA.narrativeVoice} | Nhịp: ${story.writingDNA.rhythm} | Sắc thái: ${story.writingDNA.emotionalTone} | Từ vựng đặc trưng: ${(story.writingDNA.vocabularyPalette || []).join(', ')}`
      : '';

    const canonBlock = story.isFanfiction && story.referenceDocs?.length
      ? `\n[TUÂN THỦ NGUYÊN TÁC (${story.fandomName || 'Fanfiction'})]:\n${story.referenceDocs
          .slice(0, 4)
          .map(d => `- ${d.name}: ${sampleManuscript(d.content || '', 2000)}`)
          .join('\n')}`
      : '';

    return `[NHIỆM VỤ: ${hasOriginalDraft ? 'SỬA CHỮA & HOÀN THIỆN BẢN THẢO CHƯƠNG THEO MẠCH LẠC TOÀN TRUYỆN' : 'SOẠN THẢO BẢN THẢO CHƯƠNG MỚI THEO CỐT TRUYỆN'}]
Bạn là Đại biên tập và Nhà văn chủ bút của bộ truyện "${story.title}".

[HỒ SƠ THẾ GIỚI & QUY TẮC CỐT LÕI ĐẦY ĐỦ]:
- Thể loại: ${story.genre || 'Tiểu thuyết'} | Ngôi kể (POV): ${story.pov || 'Ngôi thứ ba'} | Xưng hô chuẩn: ${story.pronounStyle || 'Nhất quán theo vai vế'}
${worldBlock}
${dnaBlock}
${canonBlock}

[DANH SÁCH NHÂN VẬT & TRẠNG THÁI (${(story.characters || []).length} nhân vật)]:
${formatCharacterRosterForPrompt(story.characters || [], 40)}

${earlierTimeline ? `[DÒNG SỰ KIỆN TỪ ĐẦU TRUYỆN (CÁC CHƯƠNG XA HƠN)]:\n${earlierTimeline}\n` : ''}
${options.continuityLedger ? `[SỔ CÁI DẤU CHÂN, ĐỊA ĐIỂM & SỰ KIỆN TỪ CÁC CHƯƠNG TRƯỚC]:\n${options.continuityLedger}\n` : ''}
[CHUỖI DIỄN BIẾN CÁC CHƯƠNG GẦN NHẤT (ĐÃ XẢY RA — CẤM VIẾT LẠI)]:
${earlierChaptersSummary || '(Đây là chương đầu tiên)'}
${options.retrievedChapters ? `\n[TRÍCH ĐOẠN LIÊN QUAN TỪ CÁC CHƯƠNG TRƯỚC]:\n${options.retrievedChapters}` : ''}

[ĐIỂM NỐI LIỀN KỀ & RANH GIỚI KHÔNG CHỒNG CHÉO]:
- Chương liền trước: ${prevChapter ? `"${prevChapter.title}"\n  * Tóm tắt: ${prevChapter.summary || prevChapter.outline || '(Chưa có)'}\n  * Đoạn kết chương trước (ĐIỂM BẮT ĐẦU NỐI TIẾP — KHÔNG VIẾT LẠI CÁC SỰ KIỆN TRONG ĐOẠN NÀY):\n"""\n${prevDraft.slice(-2400) || '(Trống)'}\n"""` : '(Đây là chương đầu tiên)'}
- Ranh giới Chương kế tiếp (KHÔNG VIẾT LẤN SANG): ${nextChapter ? `"${nextChapter.title}" — ${nextChapter.outline || nextChapter.summary || '(Chưa có tóm tắt/đề cương)'}` : '(Chưa có chương kế tiếp)'}

[CHƯƠNG MỤC TIÊU: "${chapter.title}"]
- Mốc thời gian: ${chapter.timeSetting || '(Tiếp nối tự nhiên)'}
- Đề cương / Mục tiêu chương (Outline): ${chapter.outline || '(Chưa thiết lập đề cương — bám sát mạch truyện và diễn biến sẵn có)'}
${chapter.summary ? `- Tóm tắt chương (Summary): ${chapter.summary}` : ''}
${options.continuityNotes ? `- Vấn đề mạch lạc / logic cần vá:\n${options.continuityNotes}` : ''}
${options.repairInstruction ? `- Yêu cầu sửa chữa cụ thể từ tác giả:\n${options.repairInstruction}` : ''}

[BẢN THẢO HIỆN TẠI CỦA CHƯƠNG "${chapter.title}"]:
${hasOriginalDraft ? currentDraft : '(Trống — Hãy viết mới hoàn toàn dựa trên đề cương và mạch truyện)'}

${hasOriginalDraft ? ORIGINAL_FIDELITY_PROTOCOL : ''}

[YÊU CẦU BẮT BUỘC]:
1. ${hasOriginalDraft
  ? 'BẢO TỒN 100% các chi tiết, tên nhân vật, lời thoại, vật phẩm và diễn biến hay trong bản thảo hiện tại; CHỈ sửa chữa những chỗ gãy mạch, mâu thuẫn logic, lệch xưng hô, lặp ý hoặc nâng cấp văn phong theo yêu cầu.'
  : 'Bám sát Đề cương chương, Hồ sơ Thế giới & Nhân vật để viết thành chương truyện hoàn chỉnh giàu chi tiết, lời thoại và tâm lý.'}
2. **Chống chồng chéo:** Khớp nối mượt mà từ đoạn kết chương trước mà KHÔNG lặp lại tình tiết chương trước; dừng đúng ranh giới để mở đường sang chương kế tiếp mà KHÔNG viết trước sự kiện của chương kế tiếp.
3. **Chống quên thiết lập:** Kiểm tra kỹ vị trí, thương tích, cảnh giới, vật phẩm và quy tắc thế giới xuyên suốt toàn chương.
4. Tuyệt đối KHÔNG tóm tắt, KHÔNG rút gọn, KHÔNG viết chú thích của AI ở đầu hoặc cuối. Chỉ trả về toàn văn chương truyện hoàn chỉnh.`;
  },

  buildAdvancedOutlinePrompt: (chapter: Chapter, story: Story, userInstruction: string, longTermMemory: string, shortTermMemory: string): string => {
    const characterList = formatCharacterRosterForPrompt(story.characters || [], 35);
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = sortedChapters.findIndex(c => c.id === chapter.id);
    const nextChapter = idx >= 0 && idx < sortedChapters.length - 1 ? sortedChapters[idx + 1] : undefined;
    const worldBlock = buildCompleteWorldBibleBlock(story, '', { includePlanning: true, maxKnowledgeChars: 10000 });

    const strategySection = userInstruction.trim()
        ? `[CHIẾN LƯỢC: ƯU TIÊN CHỈ ĐẠO CỦA TÁC GIẢ]\nChỉ đạo mới: "${userInstruction}"`
        : `[CHIẾN LƯỢC: BÁM SÁT BLUEPRINT TỔNG]\nDàn ý tổng: ${story.planning || "(Phát triển tự nhiên dựa trên bối cảnh và diễn biến hiện tại)"}`;

    return `[NHIỆM VỤ: KIẾN TRÚC SƯ CỐT TRUYỆN - THIẾT KẾ DÀN Ý CHƯƠNG NHẤT QUÁN & KHÔNG CHỒNG CHÉO]
Hãy thiết kế một dàn ý chi tiết (Beat Sheet) cho chương "${chapter.title}" của bộ truyện "${story.title}".
Thể loại: ${story.genre || 'Tiểu thuyết'} | Phong cách viết: ${story.writingStyle || story.writingDNA?.narrativeVoice || 'Sâu sắc, logic, lôi cuốn'}.

${strategySection}

[HỒ SƠ THẾ GIỚI & QUY TẮC ĐẦY ĐỦ]:
${worldBlock}

[MẠCH LIÊN TỤC & RANH GIỚI KHÔNG CHỒNG CHÉO]:
- LTM (Các chương trước — ĐÃ XẢY RA, KHÔNG LẶP LẠI): ${longTermMemory || '(Chưa có tóm tắt chương trước)'}
- STM (Nội dung/Diễn biến gần nhất): ${shortTermMemory || '(Chưa có)'}
${nextChapter ? `- Chương kế tiếp (RANH GIỚI — KHÔNG XẾP SỰ KIỆN NÀY VÀO DÀN Ý HIỆN TẠI): "${nextChapter.title}" — ${nextChapter.outline || nextChapter.summary || '(Chưa có)'}` : ''}
- Hồ sơ nhân vật:\n${characterList}

[YÊU CẦU CẤU TRÚC DÀN Ý]:
1. **Mục tiêu cốt lõi (The Goal)**: Mục tiêu và động cơ của các nhân vật xuất hiện trong chương.
2. **Xung đột & Trở ngại (The Conflict)**: Mâu thuẫn nội tâm, xung đột lợi ích hoặc thế lực cản trở.
3. **Bối cảnh & Không khí (Setting & Atmosphere)**: Thời gian, địa điểm, cảm giác chủ đạo đúng với World Bible.
4. **Diễn biến chi tiết (4 Scene Beats)**:
   - Beat 1 (Hook): Nối tiếp mượt mà điểm kết chương trước (KHÔNG viết lại đoạn kết chương trước).
   - Beat 2 (Triển khai): Đấu trí, hành động hoặc khai phá chi tiết mới.
   - Beat 3 (Cao trào/Bước ngoặt): Đỉnh điểm xung đột hoặc nút thắt bất ngờ nhưng hợp logic.
   - Beat 4 (Dư âm/Chuyển tiếp): Hậu quả và móc nối tự nhiên sang chương sau.
5. **Logic & Continuity Check**: Chốt rõ vị trí nhân vật, trạng thái vết thương, vật phẩm, xưng hô và tri thức để khi viết văn bản thảo không bị sai thiết lập hay lặp ý.`;
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
    let fullWorldBlock = "Chưa thiết lập";
    let timeline = "";

    if (Array.isArray(storyOrChapters)) {
      chapters = [...storyOrChapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      title = storyTitle || "Tác phẩm";
    } else if (storyOrChapters && typeof storyOrChapters === 'object') {
      const story = storyOrChapters as Story;
      chapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      title = story.title || title;
      genre = story.genre || genre;
      writingStyle = story.writingStyle || story.writingDNA?.narrativeVoice || writingStyle;
      characters = story.characters || [];
      timeline = story.currentTimeline || "";
      fullWorldBlock = buildCompleteWorldBibleBlock(story, '', {
        includePlanning: true,
        maxKnowledgeChars: 16000
      });
    }

    const chapterSections = formatSmartChapterContext(chapters, { maxTotalChars: 95000 });

    return `[NHIỆM VỤ TỐI THƯỢNG: PHÂN TÍCH MẠCH TRUYỆN & PHÁT HIỆN VẤN ĐỀ CẦN SỬA CHỮA]
Bạn là Chuyên gia Phân tích Cấu trúc Tiểu thuyết & Cố vấn Biên tập Cốt truyện (Principal Literary Plot & Continuity Architect).

[THÔNG TIN & WORLD BIBLE ĐẦY ĐỦ CỦA TÁC PHẨM]:
- Tên truyện: "${title}"
- Thể loại: ${genre}
- Phong cách viết / Giọng văn: ${writingStyle}
- Dòng thời gian: ${timeline || '(Chưa thiết lập)'}
${fullWorldBlock}

[HỒ SƠ NHÂN VẬT (${characters.length} nhân vật)]:
${formatCharacterRosterForPrompt(characters, 40)}

${ORIGINAL_FIDELITY_PROTOCOL}

[DỮ LIỆU CÁC CHƯƠNG TRUYỆN (${chapters.length} chương) - GỒM MỤC LỤC TOÀN BỘ, BẢN THẢO THỰC TẾ, TÓM TẮT & ĐỀ CƯƠNG]:
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
   - BẮT BUỘC ghi rõ vào trường "knowledge" những nơi nhân vật ĐÃ TỪNG ĐẾN / ĐI QUA, người đã gặp và bí mật/sự kiện vừa biết (Vd: "Đã từng đến Hang Cổ Mộ ở phía Bắc, nhặt được Huyết Ngọc") để các chương sau không bao giờ quên dấu chân của nhân vật.
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
    const activeChars = formatCharacterRosterForPrompt(story.characters || [], 25);
    const worldAnchors = buildCompleteWorldBibleBlock(story, '', { includePlanning: false, maxKnowledgeChars: 7000 });
    return `[NHIỆM VỤ: TINH CHỈNH ĐOẠN VĂN BẢN CHỌN LỌC NHẤT QUÁN VỚI TÁC PHẨM]
Bạn là Biên tập viên văn học cao cấp của tác phẩm "${story.title}" (${story.genre || 'Tiểu thuyết'}).
Hãy chỉnh sửa đoạn văn bản dưới đây theo yêu cầu của tác giả sao cho khớp nối hoàn hảo với toàn bộ thiết lập thế giới, nhân vật và các chương trước.

[THIẾT LẬP TÁC PHẨM ĐẦY ĐỦ]:
- Ngôi kể (POV): ${story.pov || 'Ngôi thứ ba'} | Quy tắc xưng hô: ${story.pronounStyle || 'Nhất quán theo bối cảnh'}
${story.writingDNA ? `- Giọng văn tác giả: ${story.writingDNA.narrativeVoice} (${story.writingDNA.emotionalTone})` : ''}
${worldAnchors}

[HỒ SƠ NHÂN VẬT LIÊN QUAN]:
${activeChars}

${ORIGINAL_FIDELITY_PROTOCOL}

[BỐI CẢNH LIỀN TRƯỚC]:
"...${prefix.slice(-1400)}"

[ĐOẠN VĂN NGUYÊN MẪU CẦN SỬA]:
"""
${selection}
"""

[BỐI CẢNH LIỀN SAU]:
"${suffix.slice(0, 1200)}..."

[YÊU CẦU CHỈNH SỬA CỤ THỂ]:
"${instruction || 'Trau chuốt văn phong mượt mà, giàu cảm xúc và sửa lỗi logic/xưng hô nếu có'}"

[QUY TẮC BẮT BUỘC]:
1. 🛡️ Giữ nguyên toàn bộ chi tiết cốt lõi, hành động, đồ vật, tên nhân vật và lời thoại (chỉ sửa khi được yêu cầu sửa lỗi logic/xưng hô).
2. 🚫 Tuyệt đối không tóm tắt hay rút gọn làm mất cảnh.
3. 🔗 Khớp nối mượt mà về thì, ngôi kể, xưng hô, trạng thái nhân vật (pinned memory) và bối cảnh thế giới.
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
    styleReference: string,
    continuityContext: string = ''
  ): string => {
    const contentRating = nsfw ? NSFW_INSTRUCTION : "";
    return `[NHIỆM VỤ: TINH CHỈNH & ĐẠI TU VĂN BẢN CHUYÊN NGHIỆP]
Bạn là một Đại biên tập viên và Nhà văn chủ bút. Nhiệm vụ của bạn là chỉnh sửa, nâng cấp và vá lỗi mạch lạc/logic cho bản thảo dưới đây theo yêu cầu của tác giả.

${ORIGINAL_FIDELITY_PROTOCOL}

[DỮ LIỆU NỀN & THIẾT LẬP]:
- Thể loại: ${genre || 'Tiểu thuyết'} | Ngôi kể: ${pov || 'Ngôi thứ ba'} | Văn phong: ${writingStyle || 'Tự nhiên, sâu sắc'}
- Xưng hô & Quy tắc: ${pronounStyle || '(Theo ngữ cảnh)'} ${interactionRules ? `| ${interactionRules}` : ''}
- Bối cảnh & Tri thức liên quan: ${worldBible ? worldBible.slice(0, 18000) : '(Theo bản thảo)'}
- Quy tắc thế giới (Mechanics): ${mechanics || '(Không có)'}
- Chỉ thị bền vững: ${persistentDirectives || '(Không có)'}
- Cấm (Negative Prompt): ${negativePrompt || '(Không có)'}
${styleReference ? `- Phong cách tham chiếu: ${styleReference}` : ''}
${continuityContext ? `\n[MẠCH LIÊN TỤC VỚI CÁC CHƯƠNG TRƯỚC & SAU]:\n${continuityContext}` : ''}

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
2. 💎 **NÂNG CẤP VĂN PHONG & MẠCH LẠC:** Câu chữ giàu hình ảnh, cảm xúc, nhịp điệu mượt mà, thống nhất xưng hô và khớp nối tự nhiên với chương trước/sau.
3. 🚫 **TUYỆT ĐỐI KHÔNG TÓM TẮT:** Bản sửa đổi phải giữ độ dài đầy đủ tương đương hoặc dài hơn bản nguyên mẫu.
4. 📝 **ĐÚNG ĐỊNH DẠNG:** Chỉ trả về toàn bộ nội dung chương truyện hoàn chỉnh sau khi sửa, không thêm lời chào hay giải thích ngoài lề.
${contentRating}

BẮT ĐẦU VĂN BẢN ĐÃ CHỈNH SỬA HOÀN THIỆN:`;
  },

  compactCoEditHistoryTurn: (text: string, role: string): string => {
    const cleaned = (text || '').replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/gi, '').trim();
    if (!cleaned) return '';
    if (role !== 'model' && role !== 'assistant') {
      return cleaned.length > 3000 ? `${cleaned.slice(0, 3000)}\n... [Đã rút gọn bớt phần trích cũ]` : cleaned;
    }
    // Replace huge old [PROPOSAL_*] chapter walls with compact markers so stale drafts never override current live chapters/settings!
    const compacted = cleaned.replace(
      /\[PROPOSAL_(PLANNING|OUTLINE_CHAPTER_|SUMMARY_CHAPTER_|CONTENT_CHAPTER_)([^\]:\n]+)[:\]\s]*([\s\S]*?)(?=(?:\[PROPOSAL_|$))/gi,
      (_m, kind, idPart, body) => {
        const cleanBody = String(body || '').trim();
        if (cleanBody.length <= 500) {
          return `[PROPOSAL_${kind}${idPart}: ${cleanBody}]`;
        }
        return `[PROPOSAL_${kind}${idPart}: (${cleanBody.length.toLocaleString()} ký tự — đã tóm gọn trong lịch sử hội thoại để ưu tiên BẢN THẢO HIỆN HÀNH bên dưới)\nĐầu đoạn: ${cleanBody.slice(0, 220)}...\nCuối đoạn: ...${cleanBody.slice(-180)}]`;
      }
    );
    return compacted.length > 3200
      ? `${compacted.slice(0, 2000)}\n... [Đã rút gọn lịch sử AI cũ để tiết kiệm token & giữ ngữ cảnh hiện hành sắc nét]\n${compacted.slice(-1000)}`
      : compacted;
  },

  buildCoEditSystemInstruction: (story: Story): string => {
    const shortAnchors = [
      story.persistentDirectives?.trim() ? `- Chỉ thị bền vững: ${story.persistentDirectives.trim().slice(0, 1800)}` : '',
      story.negativePrompt?.trim() ? `- Điều cấm: ${story.negativePrompt.trim().slice(0, 1000)}` : '',
      story.interactionRules?.trim() ? `- Quy tắc tương tác: ${story.interactionRules.trim().slice(0, 1200)}` : '',
      story.mechanics?.trim() ? `- Cơ chế thế giới (tóm tắt): ${story.mechanics.trim().slice(0, 1500)}` : '',
      formatPinnedMemoryBlock(story)
    ].filter(Boolean).join('\n');

    return `Bạn là Chuyên gia Cố vấn & Đồng hành Hiệu đính Cốt truyện (AI Plot Collaborator & Co-Editor) của tác phẩm "${story.title}" (${story.genre || 'Tiểu thuyết'}).
Nhiệm vụ của bạn là cùng tác giả phân tích mạch truyện, rà soát tính nhất quán nhân vật & thế giới, sửa chữa lỗ hổng logic, viết mới và nâng cấp/viết lại chương truyện theo đúng thiết lập và diễn biến toàn tác phẩm.

${UNIVERSAL_RATIONALITY_PROTOCOL}
${ORIGINAL_FIDELITY_PROTOCOL}

[NEO THIẾT LẬP BẤT BIẾN CỦA TÁC PHẨM]:
- Tên truyện: "${story.title}" | Thể loại: ${story.genre || 'Tiểu thuyết'}
- Ngôi kể (POV): ${story.pov || 'Ngôi thứ ba'} | Quy tắc xưng hô: ${story.pronounStyle || 'Nhất quán theo bối cảnh'}
- Phong cách viết / Hồn văn: ${story.writingStyle || story.writingDNA?.narrativeVoice || 'Chuẩn mực văn học'}
${shortAnchors ? `${shortAnchors}\n(Hồ sơ World Bible đầy đủ, Nhân vật & Sổ cái nằm ngay trong dữ liệu tác phẩm ở lượt tin nhắn bên dưới)` : ''}

[GIAO THỨC CHỐNG QUÊN THIẾT LẬP, CHỐNG LẶP & BẢO TỒN BẢN THẢO]:
1. 📖 HỒ SƠ & BẢN THẢO TRONG [DỮ LIỆU TÁC PHẨM HIỆN HÀNH] LÀ CHÂN LÝ DUY NHẤT:
   - Luôn đối chiếu mọi chi tiết (địa danh nhân vật từng đi qua, hệ thống sức mạnh, vết thương, trang bị, xưng hô, tri thức nhân vật, pinned memory) với dữ liệu thực tế & [SỔ CÁI DẤU CHÂN, ĐỊA ĐIỂM & SỰ KIỆN] được cung cấp ở lượt hiện tại — KHÔNG lấy nhầm các bản nháp cũ trong lịch sử chat nếu bản thảo thực tế khác.
   - Mọi mục trong Sổ cái (đặc biệt mục có nhãn [Tác giả chốt]) là SỰ THẬT ĐÃ ĐƯỢC TÁC GIẢ DUYỆT/CHỈNH SỬA: nếu thấy mâu thuẫn giữa một chi tiết nhầm trong bản thảo chương cũ và Sổ cái, BẮT BUỘC tuân theo Sổ cái!
2. 🔍 ĐỐI CHIẾU LIÊN CHƯƠNG & DẤU CHÂN NHÂN VẬT:
   - Trước khi viết mới hay sửa chương N, BẮT BUỘC kiểm tra xem nhân vật đã từng đến địa điểm đó chưa, đã gặp người đó chưa, đã biết bí mật đó ở các chương 1..N-1 chưa (tránh cảnh "gặp lại lần đầu" hoặc "chưa từng nghe nói" với nơi/người đã xuất hiện ở chương trước).
   - Luôn kiểm tra đoạn kết chương trước và ranh giới chương sau để không lặp tình tiết cũ và không viết lấn sang chương kế tiếp.
3. ✍️ ĐỀ XUẤT SỬA ĐỔI CÓ THỂ ÁP DỤNG TRỰC TIẾP:
   Khi đề xuất viết hoặc sửa đổi cụ thể, bọc nội dung hoàn chỉnh trong các thẻ sau để giao diện tự động hiện nút "Xem Diff & Áp dụng":
   - Cập nhật Dàn ý tổng thể:
     [PROPOSAL_PLANNING: <nội dung dàn ý mới>]
   - Cập nhật Đề cương một chương:
     [PROPOSAL_OUTLINE_CHAPTER_<chapterId>: <nội dung đề cương mới>]
   - Cập nhật Tóm tắt một chương:
     [PROPOSAL_SUMMARY_CHAPTER_<chapterId>: <tóm tắt sự kiện + địa điểm nhân vật đã đi qua + vật phẩm/bí mật/thương tích mới>]
   - Viết mới / Sửa chữa toàn văn Bản thảo chương (PHẢI viết đầy đủ 100% từ đầu đến cuối, KHÔNG viết "[... giữ nguyên phần còn lại ...]"):
     [PROPOSAL_CONTENT_CHAPTER_<chapterId>: <toàn bộ nội dung bản thảo hoàn chỉnh>]
   * KHUYẾN NGHỊ TỰ ĐỘNG CẬP NHẬT TRÍ NHỚ: Mỗi khi xuất [PROPOSAL_CONTENT_CHAPTER_<chapterId>: ...], hãy kèm thêm 1 khối ngắn [PROPOSAL_SUMMARY_CHAPTER_<chapterId>: ...] ngay phía dưới (3-5 dòng ghi rõ sự kiện chính, địa danh nhân vật đã đến/đi qua, vật phẩm & thay đổi trạng thái) để giao diện tự động đồng bộ vào trí nhớ dài hạn khi tác giả bấm Áp dụng!

Hãy phản hồi bằng tiếng Việt sắc bén, cụ thể, có dẫn chứng và tôn trọng tuyệt đối bản sắc & thiết lập tác phẩm.`;
  },

  buildCoEditGroundedMessage: (
    story: Story,
    message: string,
    options: {
      focusChapterId?: string;
      retrievedKnowledge?: string;
      retrievedChapters?: string;
      continuityLedger?: string;
      boostChapterIds?: string[];
      plotArcAnalysis?: any;
      auditReport?: any;
      maxChapterChars?: number;
      maxKnowledgeChars?: number;
    } = {}
  ): string => {
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const focusedChapter =
      (options.focusChapterId ? sortedChapters.find(c => c.id === options.focusChapterId) : undefined) ||
      sortedChapters[0];

    const chaptersContext = formatSmartChapterContext(sortedChapters, {
      maxTotalChars: options.maxChapterChars ?? 85000,
      focusChapterId: focusedChapter?.id,
      targetChapterMention: message,
      boostChapterIds: options.boostChapterIds,
      recentPrevWindow: 3
    });

    const fullWorldBlock = buildCompleteWorldBibleBlock(story, options.retrievedKnowledge, {
      includePlanning: true,
      maxKnowledgeChars: options.maxKnowledgeChars ?? 22000,
      maxLogEntries: 60
    });

    const rosterText = formatCharacterRosterForPrompt(story.characters || [], 50);

    const analysisInsights: string[] = [];
    if (options.plotArcAnalysis) {
      const pa = options.plotArcAnalysis;
      if (pa.unresolvedHooks?.length) analysisInsights.push(`• Nút thắt chưa giải quyết: ${pa.unresolvedHooks.join(' | ')}`);
      if (pa.chapterIssues?.length) {
        analysisInsights.push(
          `• Lỗi mạch lạc từng chương đã phát hiện:\n` +
            pa.chapterIssues.map((ci: any) => `  - ${ci.chapterTitle}: ${ci.issue} (Gợi ý sửa: ${ci.fixSuggestion})`).join('\n')
        );
      }
    }
    if (options.auditReport?.plotCoherence?.plotHoles?.length) {
      analysisInsights.push(`• Lỗ hổng từ Kiểm toán toàn truyện: ${options.auditReport.plotCoherence.plotHoles.join(' | ')}`);
    }

    const focusMeta = focusedChapter
      ? `- Chương trọng tâm đang chọn: "${focusedChapter.title}" (ID: ${focusedChapter.id}, Thứ tự: ${sortedChapters.findIndex(c => c.id === focusedChapter.id) + 1}/${sortedChapters.length})`
      : '';

    return `[DỮ LIỆU TÁC PHẨM HIỆN HÀNH — ĐỐI CHIẾU TRỰC TIẾP TRƯỚC KHI TRẢ LỜI]
${focusMeta}

[HỒ SƠ WORLD BIBLE, PINNED MEMORY & TRI THỨC ĐẦY ĐỦ]:
${fullWorldBlock}

[HỒ SƠ NHÂN VẬT (${(story.characters || []).length} nhân vật)]:
${rosterText}
${analysisInsights.length > 0 ? `\n[KẾT QUẢ PHÂN TÍCH MẠCH TRUYỆN & LỖI LOGIC HIỆN CÓ]:\n${analysisInsights.join('\n')}` : ''}
${options.continuityLedger ? `\n[SỔ CÁI DẤU CHÂN, ĐỊA ĐIỂM ĐÃ ĐẾN & SỰ KIỆN XUYÊN SUỐT CÁC CHƯƠNG (CHÂN LÝ TÁC GIẢ ĐÃ DUYỆT)]:\n${options.continuityLedger}` : ''}
${options.retrievedChapters ? `\n[TRÍCH ĐOẠN CHƯƠNG LIÊN QUAN ĐẾN CÂU HỎI]:\n${options.retrievedChapters}` : ''}

[DỮ LIỆU CÁC CHƯƠNG THỰC TẾ (ĐÃ SẮP XẾP THEO THỨ TỰ)]:
${chaptersContext}

----------------------------------------
[YÊU CẦU HIỆN TẠI CỦA TÁC GIẢ]:
${message}`;
  },

  buildNextChapterSuggestionPrompt: (story: Story): string => {
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const lastChapter = sortedChapters.length > 0 ? sortedChapters[sortedChapters.length - 1] : undefined;
    const recentSummaries = sortedChapters.slice(-5).map((c, idx) => {
      const text = c.content?.trim() ? c.content : (c.translatedContent || '');
      const excerpt = c.summary?.trim() || c.outline?.trim() || sampleManuscript(text, 700);
      return `- ${c.title || `Chương ${idx + 1}`}: ${excerpt}`;
    }).join('\n');

    const lastEnding = lastChapter
      ? (lastChapter.content?.trim() || lastChapter.translatedContent?.trim() || '').slice(-1800)
      : '';
    const worldBlock = buildCompleteWorldBibleBlock(story, '', { includePlanning: true, maxKnowledgeChars: 10000 });

    return `[NHIỆM VỤ: KIẾN TRÚC SƯ CỐT TRUYỆN - GỢI Ý CHƯƠNG KẾ TIẾP NHẤT QUÁN]
Hãy gợi ý ý tưởng chi tiết cho chương tiếp theo của tác phẩm "${story.title}" (${story.genre || 'Tiểu thuyết'}).
- Văn phong chủ đạo: ${story.writingStyle || story.writingDNA?.narrativeVoice || 'Nhất quán với bản thảo hiện có'}

[HỒ SƠ THẾ GIỚI & THIẾT LẬP ĐẦY ĐỦ]:
${worldBlock}

- Nhân vật hiện tại (${(story.characters || []).length} nhân vật):\n${formatCharacterRosterForPrompt(story.characters || [], 35)}

[DIỄN BIẾN ĐÃ XẢY RA (KHÔNG VIẾT LẶP LẠI)]:
${recentSummaries || '(Đây là chương mở đầu của tác phẩm)'}
${lastEnding ? `\n[ĐOẠN KẾT CHƯƠNG VỪA RỒI (${lastChapter?.title})]:\n"""\n${lastEnding}\n"""` : ''}

Hãy bám sát thiết lập thế giới, hậu quả trực tiếp từ chương vừa rồi, động cơ nhân vật và các nút thắt chưa giải quyết để đề xuất chương mới tiến triển hợp lý — TUYỆT ĐỐI KHÔNG lặp lại sự kiện đã giải quyết trong các chương trên.
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
      ? formatSmartChapterContext(sortedChapters, { maxTotalChars: 160000, focusChapterId })
      : '(Chưa có chương truyện nào được viết)';

    const worldBibleBlock = buildCompleteWorldBibleBlock(story, '', {
      includePlanning: true,
      maxKnowledgeChars: 22000
    });

    const charactersProfile = formatCharacterRosterForPrompt(story.characters || [], 45);

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

[HỒ SƠ TÁC PHẨM & WORLD BIBLE ĐẦY ĐỦ]:
- Tên tác phẩm: "${story.title}" | Thể loại: ${story.genre || 'Chưa rõ'} | Góc nhìn (POV): ${story.pov || 'Chưa rõ'}
${worldBibleBlock}

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
