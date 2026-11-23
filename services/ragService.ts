import { VectorData, Story, Character, Chapter, ContinuityLedgerEntry } from '../types.ts';

export const getMagnitude = (vec: number[]): number => {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
};

const cosineSimilarityOptimized = (
  vecA: number[],
  vecB: number[],
  normA: number,
  normB: number
): number => {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
};

interface SearchOptions {
  topK?: number;
  minScore?: number;
}

export interface LexicalKnowledgeHit {
  id: string;
  category: 'lore' | 'character' | 'reference';
  title: string;
  text: string;
  score: number;
}

export interface LexicalChapterHit {
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  text: string;
  score: number;
}

function normalizeVietnameseForSearch(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearchTerms(input: string): Set<string> {
  const norm = normalizeVietnameseForSearch(input);
  const words = norm.split(' ').filter(w => w.length >= 2);
  const terms = new Set<string>(words);
  for (let i = 0; i < words.length - 1; i++) {
    terms.add(`${words[i]} ${words[i + 1]}`);
  }
  return terms;
}

function formatCharacterKnowledgeLine(c: Character): string {
  const details = [
    c.role ? `Vai trò: ${c.role}` : '',
    c.species ? `Chủng loại: ${c.species}` : '',
    `Trạng thái: ${c.status || 'alive'}`,
    c.currentLocation ? `Vị trí: ${c.currentLocation}` : '',
    c.healthStatus ? `Thể trạng: ${c.healthStatus}` : '',
    c.powerLevel ? `Thực lực: ${c.powerLevel}` : '',
    c.abilities ? `Kỹ năng: ${c.abilities}` : '',
    c.knowledge ? `Tri thức nắm giữ: ${c.knowledge}` : '',
    c.enemies ? `Đối trọng: ${c.enemies}` : '',
    c.description || ''
  ].filter(Boolean);
  return `[THỰC THỂ: ${c.name}]: ${details.join(' | ')}`;
}

export const ragService = {
  chunkText: (text: string, maxLength: number = 1000): string[] => {
    if (!text) return [];
    const paras = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let buffer = '';
    for (const p of paras) {
      if ((buffer + '\n\n' + p).length > maxLength) {
        if (buffer) chunks.push(buffer.trim());
        buffer = p;
      } else {
        buffer = buffer ? buffer + '\n\n' + p : p;
      }
    }
    if (buffer) chunks.push(buffer.trim());
    return chunks;
  },

  // Tạo "Bể tri thức" vector từ các mục đã có embedding
  buildKnowledgePool: (story: Story): VectorData[] => {
    const pool: VectorData[] = [];

    story.knowledgeLogs
      ?.filter(log => log.isActive && log.embedding && log.embedding.length > 0)
      .forEach(log => {
        pool.push({
          id: log.id,
          storyId: story.id,
          text: `[TRI THỨC · ${log.category.toUpperCase()} · ${log.title}]: ${log.content}`,
          embedding: log.embedding!,
          magnitude: getMagnitude(log.embedding!),
          createdAt: log.timestamp,
          metadata: { type: 'lore', referenceId: log.id }
        });
      });

    story.characters
      .filter(c => c.embedding && c.embedding.length > 0)
      .forEach(c => {
        pool.push({
          id: c.id,
          storyId: story.id,
          text: formatCharacterKnowledgeLine(c),
          embedding: c.embedding!,
          magnitude: getMagnitude(c.embedding!),
          createdAt: story.createdAt,
          metadata: { type: 'character', referenceId: c.id }
        });
      });

    return pool;
  },

  /**
   * Truy xuất tri thức bằng từ khóa + tên thực thể (Zero-API fallback & lexical booster).
   * Đảm bảo không bao giờ bỏ sót thiết lập/nhân vật/lore khi chưa có embedding hoặc khi dùng Custom AI Provider.
   */
  searchLexicalKnowledge: (
    queryText: string,
    story: Story,
    options: { topK?: number } = {}
  ): LexicalKnowledgeHit[] => {
    const topK = options.topK ?? 18;
    const normQuery = normalizeVietnameseForSearch(queryText);
    const queryTerms = tokenizeSearchTerms(queryText);

    const candidates: LexicalKnowledgeHit[] = [];

    // 1. Active knowledge logs
    for (const log of story.knowledgeLogs || []) {
      if (!log.isActive) continue;
      const titleNorm = normalizeVietnameseForSearch(log.title);
      const docTerms = tokenizeSearchTerms(`${log.title} ${log.content}`);
      let score = 1; // baseline so active logs remain discoverable even if query is short
      if (titleNorm && normQuery.includes(titleNorm)) {
        score += 8;
      }
      for (const term of queryTerms) {
        if (docTerms.has(term)) {
          score += term.includes(' ') ? 3 : 1;
        }
      }
      candidates.push({
        id: log.id,
        category: 'lore',
        title: log.title,
        text: `[${log.category.toUpperCase()} · ${log.title}]: ${log.content}`,
        score
      });
    }

    // 2. Reference documents (chunked)
    for (const doc of story.referenceDocs || []) {
      const chunks = ragService.chunkText(doc.content || '', 900).slice(0, 16);
      chunks.forEach((chunk, idx) => {
        const docTerms = tokenizeSearchTerms(`${doc.name} ${chunk}`);
        let score = 0.5;
        for (const term of queryTerms) {
          if (docTerms.has(term)) {
            score += term.includes(' ') ? 3 : 1;
          }
        }
        candidates.push({
          id: `${doc.id}_chunk_${idx}`,
          category: 'reference',
          title: doc.name,
          text: `[TÀI LIỆU THAM KHẢO · ${doc.name}]: ${chunk}`,
          score
        });
      });
    }

    // 3. Characters
    for (const c of story.characters || []) {
      const nameNorm = normalizeVietnameseForSearch(c.name);
      let score = c.role === 'Chính' || c.role === 'Main' ? 4 : 0.5;
      if (nameNorm && normQuery.includes(nameNorm)) {
        score += 10;
      }
      const charTerms = tokenizeSearchTerms(
        `${c.name} ${c.description} ${c.abilities || ''} ${c.currentLocation || ''} ${c.knowledge || ''} ${c.enemies || ''}`
      );
      for (const term of queryTerms) {
        if (charTerms.has(term)) {
          score += term.includes(' ') ? 2.5 : 0.8;
        }
      }
      candidates.push({
        id: c.id,
        category: 'character',
        title: c.name,
        text: formatCharacterKnowledgeLine(c),
        score
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, topK);
  },

  /**
   * Truy xuất các cảnh/sự kiện liên quan từ TẤT CẢ các chương (đặc biệt là chương xa) theo từ khóa & tên nhân vật.
   */
  searchLexicalChapters: (
    queryText: string,
    story: Story,
    options: { excludeChapterIds?: string[]; topK?: number; maxCharsPerHit?: number } = {}
  ): LexicalChapterHit[] => {
    const topK = options.topK ?? 6;
    const maxCharsPerHit = options.maxCharsPerHit ?? 950;
    const excludeSet = new Set(options.excludeChapterIds || []);
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (sortedChapters.length === 0) return [];

    const normQuery = normalizeVietnameseForSearch(queryText);
    const queryTerms = tokenizeSearchTerms(queryText);
    const charNameNorms = (story.characters || [])
      .map(c => normalizeVietnameseForSearch(c.name))
      .filter(n => n.length >= 2 && normQuery.includes(n));

    if (queryTerms.size === 0 && charNameNorms.length === 0) return [];

    // Compute document frequency across chapters so rare locations/items/events (appearing in 1-3 chapters)
    // beat ubiquitous words like the protagonist's name across all 30 chapters.
    const totalChapters = sortedChapters.length;
    const chapterTermSets = sortedChapters.map(ch => {
      const body = (ch.content?.trim() ? ch.content : ch.translatedContent || '').trim();
      const summaryOutline = `${ch.summary || ''}\n${ch.outline || ''}`.trim();
      return tokenizeSearchTerms(`${summaryOutline}\n${body}`);
    });
    const docFreq = new Map<string, number>();
    for (const term of queryTerms) {
      let count = 0;
      for (const cTerms of chapterTermSets) {
        if (cTerms.has(term)) count++;
      }
      docFreq.set(term, count);
    }

    const hits: LexicalChapterHit[] = [];

    sortedChapters.forEach((ch, idx) => {
      if (excludeSet.has(ch.id)) return;
      const body = (ch.content?.trim() ? ch.content : ch.translatedContent || '').trim();
      const summaryOutline = `${ch.summary || ''}\n${ch.outline || ''}`.trim();
      if (!body && !summaryOutline) return;

      const chunks = body ? ragService.chunkText(body, maxCharsPerHit) : [];
      if (summaryOutline) chunks.unshift(`[Tóm tắt/Đề cương]: ${summaryOutline.slice(0, maxCharsPerHit)}`);

      let bestChunk = '';
      let bestScore = 0;

      for (const chunk of chunks) {
        const chunkNorm = normalizeVietnameseForSearch(chunk);
        const chunkTerms = tokenizeSearchTerms(chunk);
        let score = 0;
        for (const cName of charNameNorms) {
          if (chunkNorm.includes(cName)) score += 4;
        }
        for (const term of queryTerms) {
          if (chunkTerms.has(term)) {
            const df = docFreq.get(term) || 1;
            const idf = 1 + Math.log((totalChapters + 1) / (df + 0.5));
            const base = term.includes(' ') ? 2.5 : 0.9;
            score += base * Math.min(3.5, idf);
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestChunk = chunk;
        }
      }

      if (bestScore >= 3 && bestChunk) {
        const title = ch.title || `Chương ${idx + 1}`;
        hits.push({
          chapterId: ch.id,
          chapterOrder: ch.order ?? idx + 1,
          chapterTitle: title,
          text: `[KÝ ỨC CHƯƠNG ${idx + 1}: ${title}]\n${bestChunk.slice(0, maxCharsPerHit)}`,
          score: bestScore
        });
      }
    });

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  },

  computeLedgerOriginKey: (chapterId: string | undefined, text: string): string => {
    const scope = chapterId || 'global';
    const norm = normalizeVietnameseForSearch(text).slice(0, 96);
    return `${scope}::${norm}`;
  },

  parseLedgerLines: (rawText: string): string[] => {
    if (!rawText || !rawText.trim()) return [];
    const normalizedText = rawText
      .replace(/\r\n/g, '\n')
      // Split inline numbered points ("1. ... 2. ...") when newlines were collapsed
      .replace(/\s+(?=\d+[.)]\s+)/g, '\n');

    const lines = normalizedText
      .split(/\n+/)
      .map(line =>
        line
          .replace(/^\s*(?:[-•*+]+|\d+[.)])\s*/, '')
          .replace(/\*\*/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(line => line.length >= 8);

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const clipped = line.length > 260 ? `${line.slice(0, 257)}...` : line;
      const norm = normalizeVietnameseForSearch(clipped).slice(0, 80);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      unique.push(clipped);
    }
    return unique.slice(0, 10);
  },

  extractChapterAutoLedgerEntries: (
    story: Story,
    ch: Chapter,
    chOrder: number,
    knownCharNamesOverride?: { raw: string; norm: string }[],
    timestampNow?: number
  ): ContinuityLedgerEntry[] => {
    const body = (ch.content?.trim() ? ch.content : ch.translatedContent || '').trim();
    const summaryText = (ch.summary || '').trim();
    const outlineText = (ch.outline || '').trim();
    if (!body && !summaryText && !outlineText) return [];

    const knownCharNames =
      knownCharNamesOverride ||
      (story.characters || [])
        .map(c => c.name.trim())
        .filter(n => n.length >= 2)
        .map(n => ({ raw: n, norm: normalizeVietnameseForSearch(n) }));

    const LOCATION_CUE_RE =
      /\b(toi|den|tai|ghe|roi|ve|quay lai|buoc vao|tien vao|dat chan|len duong|xuat phat|tron vao|an nau|chay sang|dung chan|xam nhap|kham pha|tung qua|tung den|tung toi|o lai|duoi long dat|phia bac|phia nam|phia dong|phia tay|dia diem|lich trinh|vi tri)\b/;
    const EVENT_CUE_RE =
      /\b(nhat|thu duoc|nhan duoc|danh mat|cat giu|giau|phat hien|nhin thay|nghe thay|gap|doi dau|giao chien|the|hua|giao uoc|ky ket|bi thuong|trung doc|chet|hi sinh|phong an|dot pha|thuc tinh|tiet lo|phan boi|trao cho|dau an|manh moi|bi mat|vat pham|trang thai)\b/;
    const PROPER_NOUN_PAIR_RE =
      /(?:^|\s)[A-ZĐÀÁẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ][a-zđàáảãạâấầẩẫậăắằẳẵặèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]+(?:\s+[A-ZĐÀÁẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴ][a-zđàáảãạâấầẩẫậăắằẳẵặèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]+){1,4}/g;

    const chTitle = ch.title || `Chương ${chOrder}`;
    const pickedFacts: string[] = [];

    const pushUniqueFact = (candidate: string) => {
      const clean = candidate.replace(/\s+/g, ' ').trim();
      if (clean.length < 10) return;
      const clipped = clean.length > 250 ? `${clean.slice(0, 247)}...` : clean;
      const candNorm = normalizeVietnameseForSearch(clipped).slice(0, 48);
      if (!candNorm) return;
      if (
        pickedFacts.some(p => {
          const pNorm = normalizeVietnameseForSearch(p);
          return pNorm.includes(candNorm) || candNorm.includes(pNorm.slice(0, 48));
        })
      ) {
        return;
      }
      pickedFacts.push(clipped);
    };

    // 1. Parse structured summary sections cleanly (prioritizing location, items/secrets & core plot)
    if (summaryText) {
      const summaryLines = ragService.parseLedgerLines(summaryText);
      const scoredSummary = summaryLines.map((line, idx) => {
        const norm = normalizeVietnameseForSearch(line);
        let s = 1;
        if (LOCATION_CUE_RE.test(norm)) s += 3;
        if (EVENT_CUE_RE.test(norm)) s += 2.5;
        if (idx === 0) s += 1.5; // Core plot anchor
        return { line, s, idx };
      });
      scoredSummary.sort((a, b) => b.s - a.s || a.idx - b.idx);
      const topSummary = scoredSummary.slice(0, 3).sort((a, b) => a.idx - b.idx);
      for (const item of topSummary) {
        pushUniqueFact(item.line);
      }
      if (pickedFacts.length === 0) {
        pushUniqueFact(summaryText);
      }
    }

    // 2. Scan prose sentences for additional concrete location / item / encounter footprints
    if (body && pickedFacts.length < 4) {
      const sentences = body
        .split(/(?<=[.!?…\n])\s+/)
        .map(s => s.replace(/\s+/g, ' ').trim())
        .filter(s => s.length >= 18 && s.length <= 320);

      const scored: { text: string; score: number; pos: number }[] = [];
      sentences.forEach((sent, sIdx) => {
        const norm = normalizeVietnameseForSearch(sent);
        let score = 0;

        if (LOCATION_CUE_RE.test(norm)) score += 3.5;
        if (EVENT_CUE_RE.test(norm)) score += 2.5;

        let charHits = 0;
        for (const c of knownCharNames) {
          if (norm.includes(c.norm)) charHits++;
        }
        if (charHits > 0) score += Math.min(4, charHits * 2);

        const properMatches = sent.match(PROPER_NOUN_PAIR_RE) || [];
        if (properMatches.length >= 2) score += 3;
        else if (properMatches.length === 1) score += 1.2;

        if (LOCATION_CUE_RE.test(norm) && properMatches.length >= 1) score += 2.5;

        if (score >= 4.5) {
          scored.push({ text: sent, score, pos: sIdx });
        }
      });

      scored.sort((a, b) => b.score - a.score || a.pos - b.pos);
      const remainingSlots = Math.max(1, 4 - pickedFacts.length);
      const topFacts = scored.slice(0, Math.min(summaryText ? 2 : 3, remainingSlots)).sort((a, b) => a.pos - b.pos);
      for (const f of topFacts) {
        pushUniqueFact(f.text);
      }
    }

    const now = timestampNow ?? Date.now();
    return pickedFacts.map((fact, fIdx) => {
      const originKey = ragService.computeLedgerOriginKey(ch.id, fact);
      return {
        id: `ledger_${ch.id}_${fIdx}_${originKey.slice(-12).replace(/[^a-z0-9]/gi, '')}`,
        chapterId: ch.id,
        chapterOrder: chOrder,
        chapterTitle: chTitle,
        content: fact,
        originKey,
        isManual: false,
        updatedAt: now
      };
    });
  },

  extractRawContinuityLedgerEntries: (story: Story): ContinuityLedgerEntry[] => {
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (sortedChapters.length === 0) return [];

    const knownCharNames = (story.characters || [])
      .map(c => c.name.trim())
      .filter(n => n.length >= 2)
      .map(n => ({ raw: n, norm: normalizeVietnameseForSearch(n) }));

    const result: ContinuityLedgerEntry[] = [];
    const now = Date.now();

    sortedChapters.forEach((ch, idx) => {
      const chEntries = ragService.extractChapterAutoLedgerEntries(story, ch, idx + 1, knownCharNames, now);
      result.push(...chEntries);
    });

    return result;
  },

  syncContinuityLedgerEntries: (
    story: Story,
    options: { includeSuppressed?: boolean; resetAuto?: boolean } = {}
  ): ContinuityLedgerEntry[] => {
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const chapterMetaById = new Map<string, { order: number; title: string }>();
    sortedChapters.forEach((ch, idx) => {
      chapterMetaById.set(ch.id, {
        order: idx + 1,
        title: ch.title || `Chương ${idx + 1}`
      });
    });

    const suppressedSet = new Set(options.includeSuppressed ? [] : (story.continuityLedgerSuppressedKeys || []));
    const existingRaw = Array.isArray(story.continuityLedger) ? story.continuityLedger : null;

    if (!existingRaw) {
      return ragService
        .extractRawContinuityLedgerEntries(story)
        .filter(item => !item.originKey || !suppressedSet.has(item.originKey));
    }

    const keptEntries: ContinuityLedgerEntry[] = [];
    const seenKeys = new Set<string>();

    for (const entry of existingRaw) {
      if (options.resetAuto && !entry.isManual) {
        continue;
      }
      const computedKey = ragService.computeLedgerOriginKey(entry.chapterId || 'global', entry.content);
      if (!entry.isManual && ((entry.originKey && suppressedSet.has(entry.originKey)) || suppressedSet.has(computedKey))) {
        continue;
      }
      const chMeta = entry.chapterId ? chapterMetaById.get(entry.chapterId) : undefined;
      if (entry.chapterId && entry.chapterId !== 'global' && !chMeta) {
        if (!entry.isManual) continue;
      }
      const nextEntry: ContinuityLedgerEntry = {
        ...entry,
        chapterOrder: chMeta ? chMeta.order : (entry.chapterId === 'global' || !entry.chapterId ? 0 : entry.chapterOrder),
        chapterTitle: chMeta ? chMeta.title : (entry.chapterTitle || 'Ghi chú chung')
      };
      keptEntries.push(nextEntry);
      if (nextEntry.originKey) seenKeys.add(nextEntry.originKey);
      seenKeys.add(computedKey);
    }

    const candidates = ragService.extractRawContinuityLedgerEntries(story);
    for (const cand of candidates) {
      const key = cand.originKey || ragService.computeLedgerOriginKey(cand.chapterId, cand.content);
      if (suppressedSet.has(key) || seenKeys.has(key)) continue;
      seenKeys.add(key);
      keptEntries.push(cand);
    }

    keptEntries.sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));
    return keptEntries;
  },

  /**
   * Tự động cập nhật Sổ cái cho 1 chương cụ thể (khi tóm tắt, áp dụng sửa đổi bản thảo, hoặc áp dụng đề xuất Sổ cái của AI).
   * - Luôn bảo vệ 100% các mục tác giả đã tự chốt/sửa (`isManual: true`) ở mode `'refresh_auto'` hoặc `'append'`.
   * - Xóa sạch các mục tự động cũ của chương đó (tránh sót chi tiết sai từ bản nháp cũ) rồi nạp lại từ bản mới / đề xuất AI.
   */
  upsertChapterContinuityLedger: (
    story: Story,
    chapterId: string,
    options: { explicitFacts?: string[]; mode?: 'refresh_auto' | 'replace_all' | 'append' } = {}
  ): ContinuityLedgerEntry[] => {
    const mode = options.mode ?? 'refresh_auto';
    const targetId = chapterId || 'global';
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const chIdx = targetId === 'global' ? -1 : sortedChapters.findIndex(c => c.id === targetId);
    const targetChapter = chIdx >= 0 ? sortedChapters[chIdx] : undefined;
    const resolvedOrder = targetChapter ? chIdx + 1 : 0;
    const resolvedTitle = targetChapter
      ? targetChapter.title || `Chương ${resolvedOrder}`
      : 'Ghi chú chung toàn truyện';
    const resolvedScopeId = targetChapter ? targetChapter.id : 'global';

    const baseEntries = ragService.syncContinuityLedgerEntries(story);
    const keptEntries = baseEntries.filter(entry => {
      const entryScope = entry.chapterId || 'global';
      if (entryScope !== resolvedScopeId) return true;
      if (mode === 'append') return true;
      if (mode === 'replace_all') return false;
      return Boolean(entry.isManual);
    });

    const suppressedSet = new Set(story.continuityLedgerSuppressedKeys || []);
    const existingKeys = new Set<string>();
    for (const entry of keptEntries) {
      const scope = entry.chapterId || 'global';
      if (entry.originKey) existingKeys.add(entry.originKey);
      existingKeys.add(ragService.computeLedgerOriginKey(scope, entry.content));
    }

    const now = Date.now();
    let newEntries: ContinuityLedgerEntry[] = [];

    if (options.explicitFacts && options.explicitFacts.length > 0) {
      options.explicitFacts.forEach((rawFact, idx) => {
        const clean = rawFact.replace(/\s+/g, ' ').trim();
        if (clean.length < 4) return;
        const originKey = ragService.computeLedgerOriginKey(resolvedScopeId, clean);
        if (existingKeys.has(originKey)) return;
        existingKeys.add(originKey);
        newEntries.push({
          id: `ledger_ai_${resolvedScopeId}_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          chapterId: resolvedScopeId,
          chapterOrder: resolvedOrder,
          chapterTitle: resolvedTitle,
          content: clean,
          originKey,
          isManual: false,
          updatedAt: now
        });
      });
    } else if (targetChapter) {
      const extracted = ragService.extractChapterAutoLedgerEntries(
        story,
        targetChapter,
        resolvedOrder,
        undefined,
        now
      );
      newEntries = extracted.filter(cand => {
        const key = cand.originKey || ragService.computeLedgerOriginKey(resolvedScopeId, cand.content);
        if (suppressedSet.has(key) || existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
    }

    const combined = [...keptEntries, ...newEntries];
    combined.sort((a, b) => (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0));
    return combined;
  },

  /**
   * Tạo "Sổ Cái Dấu Chân & Sự Kiện" (Zero-API, <5ms) đọc từ dữ liệu Sổ cái tác giả đã chỉnh sửa/duyệt
   * kết hợp với các chương mới chưa có trong Sổ cái (tôn trọng tuyệt đối các mục đã xóa/ẩn).
   */
  buildStoryContinuityLedger: (
    story: Story,
    options: { upToChapterId?: string; maxChars?: number } = {}
  ): string => {
    const maxChars = options.maxChars ?? 24000;
    const sortedChapters = [...(story.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const synced = ragService.syncContinuityLedgerEntries(story);
    if (synced.length === 0) return '';

    const stopIdx = options.upToChapterId
      ? sortedChapters.findIndex(c => c.id === options.upToChapterId)
      : -1;
    const maxOrder = stopIdx >= 0 ? stopIdx + 1 : Number.MAX_SAFE_INTEGER;

    const filtered = synced.filter(item => !item.chapterOrder || item.chapterOrder <= maxOrder);
    if (filtered.length === 0) return '';

    // Group entries chronologically by chapterOrder / chapterId for compact, clear prompting
    const grouped = new Map<string, { order: number; title: string; items: string[] }>();
    for (const item of filtered) {
      const groupKey = item.chapterOrder === 0 || !item.chapterId ? 'global' : item.chapterId;
      const existing = grouped.get(groupKey);
      const formattedText = item.isManual ? `[Tác giả chốt] ${item.content}` : item.content;
      if (existing) {
        existing.items.push(formattedText);
      } else {
        grouped.set(groupKey, {
          order: item.chapterOrder ?? 0,
          title: item.chapterOrder === 0 ? 'Ghi chú chung toàn truyện' : item.chapterTitle,
          items: [formattedText]
        });
      }
    }

    const lines = Array.from(grouped.values())
      .sort((a, b) => a.order - b.order)
      .map(g =>
        g.order === 0
          ? `• [Ghi chú chung toàn truyện]: ${g.items.join(' | ')}`
          : `• [Ch ${g.order} · ${g.title}]: ${g.items.join(' | ')}`
      );

    const joined = lines.join('\n');
    if (joined.length <= maxChars) return joined;

    // Preserve earliest foundational chapters + global notes + latest chapters within maxChars
    const kept: string[] = [];
    let totalLen = 0;
    const headCount = Math.min(14, Math.floor(lines.length * 0.28));
    const tailCount = Math.min(24, Math.floor(lines.length * 0.45));
    const chosenIndices = new Set<number>();
    for (let i = 0; i < headCount; i++) chosenIndices.add(i);
    for (let i = Math.max(0, lines.length - tailCount); i < lines.length; i++) chosenIndices.add(i);
    for (let i = headCount; i < lines.length - tailCount; i++) chosenIndices.add(i);

    const ordered = Array.from(chosenIndices).sort((a, b) => a - b);
    for (const idx of ordered) {
      const l = lines[idx];
      if (totalLen + l.length + 1 > maxChars) continue;
      kept.push(l);
      totalLen += l.length + 1;
    }
    return kept.join('\n');
  },

  search: (queryEmbedding: number[], pool: VectorData[], options: SearchOptions = {}): VectorData[] => {
    if (pool.length === 0) return [];
    const { topK = 8, minScore = 0.55 } = options;
    const queryNorm = getMagnitude(queryEmbedding);
    if (queryNorm === 0) return [];

    const scored = pool.map(v => {
      const vecNorm = v.magnitude || getMagnitude(v.embedding);
      const score = cosineSimilarityOptimized(queryEmbedding, v.embedding, queryNorm, vecNorm);
      return { item: v, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored
      .filter(s => s.score >= minScore)
      .slice(0, topK)
      .map(s => s.item);
  }
};
