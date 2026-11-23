import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { serverVault } from './serverVault.ts';
import { geminiService } from '../services/geminiService.ts';
import { ragService } from '../services/ragService.ts';
import { plotDebugLogger } from '../services/plotDebugLogger.ts';
import { requestThrottleService } from '../services/requestThrottleService.ts';
import {
  abortableSleep,
  createAbortError,
  isAbortError,
  registerServerJobContextProvider,
  type JobAbortContext
} from '../services/jobAbortContext.ts';
import { fastWordCount } from '../utils/wordCount.ts';
import {
  cleanAndDeduplicateContinuation,
  cleanAndDeduplicateTranslation
} from '../utils/textDeduplication.ts';
import {
  buildCompleteWorldBibleBlock,
  sampleManuscript
} from '../services/promptBuilderService.ts';
import type { ServerJobState, ServerJobType } from '../services/runtimeAdapter.ts';
import type { Chapter, ChatMessage, EvolutionLog, ExtractionCategory, Story } from '../types.ts';

const jobAbortStorage = new AsyncLocalStorage<JobAbortContext>();
registerServerJobContextProvider(() => jobAbortStorage.getStore());

function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function sanitizeChunk(chunk: any): string {
  const raw = typeof chunk?.text === 'string' ? chunk.text : '';
  return raw !== 'undefined' && raw !== 'null' ? raw : '';
}

function cleanAccumulatedText(text: string): string {
  return (text || '').replace(/(?:\s*\[?(?:undefined|null)\]?\s*)+$/i, '').trim();
}

async function getRelevantKnowledge(queryText: string, s: Story): Promise<string> {
  const seen = new Set<string>();
  const snippets: string[] = [];

  // 1. Zero-API lexical & entity-name retrieval (luôn hoạt động kể cả khi dùng Custom AI Provider hoặc chưa index vector)
  const lexicalHits = ragService.searchLexicalKnowledge(queryText, s, { topK: 14 });
  for (const hit of lexicalHits) {
    if (!seen.has(hit.text)) {
      seen.add(hit.text);
      snippets.push(hit.text);
    }
  }

  // 2. Semantic vector retrieval if embeddings exist
  const pool = ragService.buildKnowledgePool(s);
  if (pool.length > 0) {
    try {
      const queryEmbedding = await geminiService.embedText(queryText);
      if (queryEmbedding && queryEmbedding.length > 0) {
        const matches = ragService.search(queryEmbedding, pool, { topK: 10, minScore: 0.48 });
        for (const m of matches) {
          if (!seen.has(m.text)) {
            seen.add(m.text);
            snippets.push(m.text);
          }
        }
      }
    } catch {
      // Vector retrieval is additive; lexical hits remain intact
    }
  }

  return snippets.join('\n\n');
}

function getRelevantChapterMemory(
  queryText: string,
  s: Story,
  excludeChapterIds: string[] = [],
  topK = 5,
  maxCharsPerHit = 950
): { retrievedChapters: string; boostChapterIds: string[] } {
  const hits = ragService.searchLexicalChapters(queryText, s, {
    excludeChapterIds,
    topK,
    maxCharsPerHit
  });
  return {
    retrievedChapters: hits.map(h => h.text).join('\n\n'),
    boostChapterIds: hits.map(h => h.chapterId)
  };
}

const JOB_LABELS: Record<ServerJobType, string> = {
  generate_continue: 'Viết tiếp bản thảo',
  refine_chapter: 'Biên tập / Tinh chỉnh chương',
  refine_selection: 'Tinh chỉnh đoạn chọn lọc',
  generate_from_plot: 'Viết/Sửa bản thảo theo Plot',
  summarize_chapter: 'Tóm tắt chương',
  summarize_all_sequential: 'Tóm tắt toàn bộ các chương',
  translate_chapter: 'Việt hóa chương truyện',
  balance_chapter_length: 'Cân bằng dung lượng chương',
  suggest_outline: 'Gợi ý đề cương chương',
  suggest_new_chapter: 'Gợi ý chương tiếp theo',
  analyze_plot_arc: 'Phân tích mạch truyện (Plot Arc)',
  scan_story_entities: 'Quét nhân vật & World Lore toàn truyện',
  extract_knowledge: 'Trích xuất tri thức & nhân vật',
  audit_story: 'Kiểm toán toàn truyện',
  audit_chapter: 'Kiểm toán logic chương',
  analyze_vocabulary: 'Phân tích từ vựng & lặp từ',
  chat_planning: 'Cố vấn Kế hoạch (AI)',
  chat_plot: 'Thảo luận Cốt truyện (Plot AI)',
  learn_writing_dna: 'Trích xuất Hồn Văn (DNA)',
  learn_style_from_text: 'Học quy tắc văn phong',
  learn_from_interaction: 'Học quy tắc từ chỉnh sửa',
  fetch_web_inspiration: 'Tìm cảm hứng sáng tác Web',
  generate_video: 'Tạo Trailer Video (Veo)'
};

class ServerJobManager {
  private jobs: ServerJobState[] = [];
  private controllers = new Map<string, AbortController>();
  private broadcastHook: ((event: string, data: any) => void) | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.jobs = serverVault.getPersistedJobs();
  }

  public setBroadcastHook(hook: (event: string, data: any) => void): void {
    this.broadcastHook = hook;
  }

  public listJobs(): ServerJobState[] {
    return this.jobs.map(j => ({ ...j }));
  }

  public getJob(id: string): ServerJobState | undefined {
    return this.jobs.find(j => j.id === id);
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      serverVault.savePersistedJobs(this.jobs);
    }, 300);
  }

  private persistImmediate(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    serverVault.savePersistedJobs(this.jobs);
  }

  private updateJob(id: string, patch: Partial<ServerJobState>, immediatePersist = false): void {
    const idx = this.jobs.findIndex(j => j.id === id);
    if (idx === -1) return;
    const next: ServerJobState = {
      ...this.jobs[idx],
      ...patch,
      updatedAt: Date.now()
    };
    this.jobs[idx] = next;
    this.broadcastHook?.('job:updated', next);
    if (immediatePersist) {
      this.persistImmediate();
    } else {
      this.schedulePersist();
    }
  }

  public ackJob(id: string): void {
    this.updateJob(id, { acknowledged: true }, true);
  }

  public cancelJob(id: string): boolean {
    const job = this.jobs.find(j => j.id === id);
    const ctrl = this.controllers.get(id);
    if (ctrl) {
      ctrl.abort();
      this.controllers.delete(id);
    }
    const cancelledLogs = plotDebugLogger.cancelByJobId(id, 'Người dùng đã bấm Hủy lệnh AI');
    const cancelledQueue = requestThrottleService.cancelByJobId(id);

    if (!job || job.status !== 'running') {
      return Boolean(ctrl) || cancelledLogs > 0 || cancelledQueue > 0;
    }

    this.updateJob(
      id,
      {
        status: 'cancelled',
        statusText: 'Người dùng đã hủy tác vụ.',
        error: 'Cancelled by user',
        completedAt: Date.now()
      },
      true
    );
    return true;
  }

  public cancelDebugLog(logId: string): boolean {
    const log = plotDebugLogger.getLogs().find(l => l.id === logId);
    let cancelled = plotDebugLogger.cancelLog(logId, 'Người dùng đã bấm Hủy trong Debug Log');
    if (log?.jobId) {
      cancelled = this.cancelJob(log.jobId) || cancelled;
    }
    return cancelled;
  }

  public cancelAllActive(): { cancelledJobs: number; cancelledLogs: number; cancelledQueue: number } {
    let cancelledJobs = 0;
    for (const job of this.jobs) {
      if (job.status === 'running') {
        if (this.cancelJob(job.id)) {
          cancelledJobs++;
        }
      }
    }
    // Abort any dangling controllers just in case
    for (const [id, ctrl] of this.controllers.entries()) {
      ctrl.abort();
      this.controllers.delete(id);
      plotDebugLogger.cancelByJobId(id, 'Người dùng đã hủy toàn bộ lệnh AI');
      requestThrottleService.cancelByJobId(id);
    }

    const cancelledQueue = requestThrottleService.clearQueue();
    let cancelledLogs = 0;
    for (const log of plotDebugLogger.getLogs()) {
      if (log.status === 'pending' || log.status === 'streaming') {
        if (plotDebugLogger.cancelLog(log.id, 'Người dùng đã hủy toàn bộ lệnh AI')) {
          cancelledLogs++;
        }
      }
    }

    return { cancelledJobs, cancelledLogs, cancelledQueue };
  }

  public startJob(type: ServerJobType, payload: any): ServerJobState {
    const jobId = generateId();
    const now = Date.now();
    const job: ServerJobState = {
      id: jobId,
      type,
      storyId: String(payload?.storyId || ''),
      chapterId: payload?.chapterId ? String(payload.chapterId) : undefined,
      title: String(payload?.title || JOB_LABELS[type] || type),
      status: 'running',
      progress: 5,
      statusText: `Đang khởi chạy ${JOB_LABELS[type] || type}...`,
      startedAt: now,
      updatedAt: now
    };

    this.jobs.unshift(job);
    if (this.jobs.length > 30) {
      this.jobs = this.jobs.slice(0, 30);
    }

    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    this.persistImmediate();
    this.broadcastHook?.('job:updated', job);

    // Run asynchronously on the server without blocking HTTP response
    void this.executeJob(jobId, type, payload || {}, controller.signal);

    return job;
  }

  private async executeJob(
    jobId: string,
    type: ServerJobType,
    payload: any,
    signal: AbortSignal
  ): Promise<void> {
    return jobAbortStorage.run({ jobId, signal }, async () => {
    try {
      const checkAborted = () => {
        if (signal.aborted) {
          throw createAbortError('Tác vụ đã được hủy.');
        }
      };

      const storyId = String(payload.storyId || '');
      const loadStoryOrThrow = (): Story => {
        const s = serverVault.getStory(storyId);
        if (!s) throw new Error('Không tìm thấy truyện trên máy chủ.');
        return s;
      };

      switch (type) {
        case 'generate_continue': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter) throw new Error('Không tìm thấy chương cần viết tiếp.');

          const sortedChapters = [...currentStory.chapters].sort((a, b) => a.order - b.order);
          const currentIndex = sortedChapters.findIndex(c => c.id === chapterId);
          const previousChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
          const nextChapter =
            currentIndex >= 0 && currentIndex < sortedChapters.length - 1
              ? sortedChapters[currentIndex + 1]
              : null;
          const previousChapterTime = previousChapter?.timeSetting || 'Không rõ';

          const isTransMode = payload.editorVersion === 'translation';
          const mode: 'append' | 'regenerate' = payload.mode === 'regenerate' ? 'regenerate' : 'append';
          const currentBody = isTransMode ? chapter.translatedContent || '' : chapter.content || '';
          const initialContent = mode === 'regenerate' ? '' : currentBody;

          const prevText = previousChapter
            ? previousChapter.content?.trim()
              ? previousChapter.content
              : previousChapter.translatedContent || ''
            : '';
          const stmContext = initialContent.slice(-3000);
          const userInstruction = String(payload.userInstruction || '');
          const targetWordCount = Number(payload.targetWordCount || 2000);
          const entitySearchContext = [
            chapter.title,
            chapter.outline,
            userInstruction,
            stmContext,
            previousChapter?.summary,
            prevText.slice(-1500)
          ]
            .filter(Boolean)
            .join(' ');

          // Mục lục sự kiện các chương xa hơn (từ đầu đến currentIndex - 6) để AI không quên tiền truyện
          const earlierTimelineList: string[] = [];
          if (currentIndex > 6) {
            for (let ci = 0; ci < currentIndex - 6; ci++) {
              const c = sortedChapters[ci];
              const cText = (c.content?.trim() ? c.content : c.translatedContent || '').trim();
              const sum = (c.summary?.trim() || c.outline?.trim() || (cText ? sampleManuscript(cText, 240) : '(Chưa có nội dung)'))
                .replace(/\s+/g, ' ')
                .slice(0, 260);
              earlierTimelineList.push(`• Chương ${ci + 1} (${c.title}): ${sum}`);
            }
          }
          const allEarlierTimeline = earlierTimelineList.join('\n');

          // Giữ ngữ cảnh nối từ 6 chương liền trước cho dù chương hiện tại đã viết > 300 ký tự
          const recentSummariesList: string[] = [];
          for (let ci = Math.max(0, currentIndex - 6); ci < currentIndex; ci++) {
            const c = sortedChapters[ci];
            const cText = (c.content?.trim() ? c.content : c.translatedContent || '').trim();
            const sum =
              c.summary?.trim() ||
              c.outline?.trim() ||
              (cText ? sampleManuscript(cText, 600) : '(Chưa có nội dung)');
            recentSummariesList.push(`- ${c.title}: ${sum}`);
          }
          const earlierChapterSummary = [
            recentSummariesList.join('\n'),
            previousChapter && prevText.trim()
              ? `\n[ĐOẠN KẾT CHƯƠNG LIỀN TRƯỚC (${previousChapter.title}) — ĐÃ VIẾT XONG, KHÔNG LẶP LẠI]:\n"""\n${prevText.slice(-2400)}\n"""`
              : ''
          ]
            .filter(Boolean)
            .join('\n');

          const nextChapterFence = nextChapter
            ? `Chương kế tiếp: "${nextChapter.title}" — ${nextChapter.outline || nextChapter.summary || '(Chưa có đề cương)'}`
            : '';

          let canonContext = '';
          if (currentStory.isFanfiction && currentStory.referenceDocs?.length) {
            canonContext = currentStory.referenceDocs
              .map(doc => `[DỮ LIỆU TỪ LORE TẬP TIN ${doc.name}]:\n${doc.content}`)
              .join('\n\n');
          }

          this.updateJob(jobId, {
            progress: 25,
            statusText: 'Đang khóa toàn bộ World Bible, nhân vật, ký ức liên chương & ranh giới chống lặp...'
          });
          checkAborted();

          const retrievedSnippets = await getRelevantKnowledge(entitySearchContext, currentStory);
          const { retrievedChapters } = getRelevantChapterMemory(
            entitySearchContext,
            currentStory,
            [chapterId, ...(previousChapter ? [previousChapter.id] : [])],
            6,
            950
          );
          const continuityLedger = ragService.buildStoryContinuityLedger(currentStory, {
            upToChapterId: previousChapter?.id || chapterId,
            maxChars: 14000
          });
          const completeWorldBlock = buildCompleteWorldBibleBlock(currentStory, retrievedSnippets, {
            includePlanning: false,
            maxKnowledgeChars: 22000
          });

          this.updateJob(jobId, {
            progress: 45,
            statusText: 'Aetheria (Server) đang viết tiếp bản thảo...'
          });
          checkAborted();

          const stream = geminiService.generateStoryStream(
            initialContent,
            currentStory.setting || completeWorldBlock,
            currentStory.planning,
            currentStory.characters,
            currentStory.interactionRules || '',
            userInstruction,
            currentStory.genre,
            currentStory.writingStyle || '',
            currentStory.pov,
            currentStory.pronounStyle,
            currentStory.negativePrompt || '',
            currentStory.nsfw || false,
            currentStory.hasSystem || false,
            targetWordCount,
            currentStory.persistentDirectives || '',
            currentStory.mechanics || '',
            chapter.outline,
            '',
            currentStory.writingDNA,
            chapter.timeSetting || '',
            previousChapterTime,
            currentStory.currentTimeline || '',
            '',
            canonContext,
            currentStory.fandomName || '',
            {
              earlierChapterSummary,
              allEarlierTimeline,
              retrievedChapters,
              continuityLedger,
              nextChapterFence,
              completeWorldBlock,
              currentChapterTitle: chapter.title
            }
          );

          let accumulated = '';
          let lastEmit = 0;
          let progressVal = 45;
          for await (const chunk of stream) {
            checkAborted();
            const txt = sanitizeChunk(chunk);
            if (txt) {
              accumulated += txt;
              progressVal = Math.min(95, progressVal + 0.35);
              const now = Date.now();
              if (now - lastEmit > 350) {
                lastEmit = now;
                this.updateJob(jobId, {
                  progress: Math.round(progressVal),
                  streamPreview: accumulated.slice(-300)
                });
              }
            }
          }

          checkAborted();
          const rawAccumulated = cleanAccumulatedText(accumulated);
          const dedupedContinuation = cleanAndDeduplicateContinuation(rawAccumulated, initialContent);
          const finalDraft =
            initialContent +
            (initialContent && !initialContent.endsWith('\n') ? '\n\n' : '') +
            dedupedContinuation;

          const latestStory = loadStoryOrThrow();
          const storyWithDraft: Story = {
            ...latestStory,
            chapters: latestStory.chapters.map(c => {
              if (c.id !== chapterId) return c;
              if (isTransMode) {
                return {
                  ...c,
                  translatedContent: finalDraft,
                  translationLastUpdated: Date.now()
                };
              }
              return {
                ...c,
                content: finalDraft,
                lastUpdated: Date.now()
              };
            })
          };
          const updatedStory: Story = {
            ...storyWithDraft,
            continuityLedger: ragService.upsertChapterContinuityLedger(storyWithDraft, chapterId, {
              mode: 'refresh_auto'
            })
          };
          serverVault.saveStory(updatedStory);

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã viết tiếp bản thảo và lưu vào máy chủ.',
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'refine_chapter': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter) throw new Error('Không tìm thấy chương cần tinh chỉnh.');

          const isTrans =
            payload.editorVersion === 'translation' && Boolean(chapter.translatedContent?.trim());
          const sourceText = isTrans
            ? chapter.translatedContent || ''
            : chapter.content?.trim()
            ? chapter.content
            : chapter.translatedContent || '';

          if (!sourceText || sourceText.trim().length < 20) {
            throw new Error('Chương hiện tại chưa có đủ nội dung để tinh chỉnh.');
          }

          this.updateJob(jobId, {
            progress: 20,
            statusText: 'Đang truy xuất tri thức & mạch nối liên chương để tinh chỉnh...'
          });
          const ragQuery = `${chapter.title} ${chapter.outline || ''} ${sourceText.slice(0, 1500)}`.trim();
          const retrievedSnippets = await getRelevantKnowledge(ragQuery, currentStory);
          const dynamicWorldBible = buildCompleteWorldBibleBlock(currentStory, retrievedSnippets, {
            includePlanning: true,
            maxKnowledgeChars: 18000
          });

          const sortedChapters = [...currentStory.chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          const chIdx = sortedChapters.findIndex(c => c.id === chapterId);
          const prevCh = chIdx > 0 ? sortedChapters[chIdx - 1] : undefined;
          const nextCh = chIdx >= 0 && chIdx < sortedChapters.length - 1 ? sortedChapters[chIdx + 1] : undefined;
          const prevText = prevCh ? (prevCh.content?.trim() ? prevCh.content : prevCh.translatedContent || '') : '';
          const earlierTimeline = chIdx > 0
            ? sortedChapters
                .slice(0, chIdx)
                .map((c, ci) => `• Chương ${ci + 1} (${c.title}): ${(c.summary || c.outline || sampleManuscript(c.content || c.translatedContent || '', 220)).replace(/\s+/g, ' ').slice(0, 240)}`)
                .join('\n')
            : '';
          const { retrievedChapters } = getRelevantChapterMemory(
            ragQuery,
            currentStory,
            [chapterId, ...(prevCh ? [prevCh.id] : [])],
            4,
            800
          );
          const continuityLedger = prevCh
            ? ragService.buildStoryContinuityLedger(currentStory, {
                upToChapterId: prevCh.id,
                maxChars: 12000
              })
            : '';
          const continuityContext = [
            earlierTimeline ? `[DÒNG DIỄN BIẾN CÁC CHƯƠNG TRƯỚC]:\n${earlierTimeline}` : '',
            continuityLedger ? `[SỔ CÁI DẤU CHÂN, ĐỊA ĐIỂM ĐÃ ĐẾN & SỰ KIỆN TRƯỚC ĐÓ]:\n${continuityLedger}` : '',
            prevCh ? `[CHƯƠNG LIỀN TRƯỚC (${prevCh.title})]:\n- Tóm tắt: ${prevCh.summary || prevCh.outline || '(Chưa có)'}${prevText.trim() ? `\n- Đoạn kết để khớp nối:\n"""\n${prevText.slice(-1800)}\n"""` : ''}` : '',
            nextCh ? `[RANH GIỚI CHƯƠNG KẾ TIẾP (${nextCh.title})]: ${nextCh.outline || nextCh.summary || '(Chưa có)'}` : '',
            retrievedChapters ? `[TRÍCH ĐOẠN LIÊN QUAN TỪ CÁC CHƯƠNG KHÁC]:\n${retrievedChapters}` : ''
          ]
            .filter(Boolean)
            .join('\n\n');
          checkAborted();

          this.updateJob(jobId, {
            progress: 40,
            statusText: 'Đang tinh chỉnh chương với bảo tồn 100% nguyên mẫu...'
          });
          const stream = geminiService.refineChapterStream(
            sourceText,
            dynamicWorldBible,
            currentStory.interactionRules,
            currentStory.genre,
            currentStory.writingStyle || '',
            currentStory.pov,
            currentStory.pronounStyle,
            currentStory.negativePrompt,
            currentStory.nsfw || false,
            String(payload.customInstruction || payload.userInstruction || ''),
            currentStory.persistentDirectives || '',
            currentStory.mechanics || '',
            currentStory.styleReference || '',
            continuityContext
          );

          let accumulated = '';
          let lastEmit = 0;
          for await (const chunk of stream) {
            checkAborted();
            const txt = sanitizeChunk(chunk);
            if (txt) {
              accumulated += txt;
              const now = Date.now();
              if (now - lastEmit > 350) {
                lastEmit = now;
                this.updateJob(jobId, {
                  progress: 70,
                  streamPreview: accumulated.slice(-300)
                });
              }
            }
          }

          const cleanedAccumulated = cleanAccumulatedText(accumulated);
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Hoàn tất bản tinh chỉnh chương — sẵn sàng đối chiếu.',
              completedAt: Date.now(),
              result: {
                pendingEdit: {
                  chapterId,
                  original: sourceText,
                  modified: cleanedAccumulated,
                  isTranslation: isTrans
                }
              }
            },
            true
          );
          break;
        }

        case 'refine_selection': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter) throw new Error('Không tìm thấy chương.');

          const isTrans =
            payload.editorVersion === 'translation' && Boolean(chapter.translatedContent?.trim());
          const sourceText = isTrans
            ? chapter.translatedContent || ''
            : chapter.content?.trim()
            ? chapter.content
            : chapter.translatedContent || '';

          const startIdx = Number(payload.startIdx || 0);
          const endIdx = Number(payload.endIdx || sourceText.length);
          const selection = String(payload.selection || sourceText.slice(startIdx, endIdx));
          const prefix = sourceText.substring(0, startIdx);
          const suffix = sourceText.substring(endIdx);

          this.updateJob(jobId, {
            progress: 35,
            statusText: 'Đang tinh chỉnh đoạn văn bản chọn lọc...'
          });

          const stream = geminiService.refineSelectionStream(
            selection,
            prefix,
            suffix,
            currentStory,
            String(payload.customInstruction || '')
          );
          let accumulated = '';
          for await (const chunk of stream) {
            checkAborted();
            const txt = sanitizeChunk(chunk);
            if (txt) accumulated += txt;
          }
          const cleanedAccumulated = cleanAccumulatedText(accumulated);
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã tinh chỉnh đoạn văn bản.',
              completedAt: Date.now(),
              result: {
                pendingEdit: {
                  chapterId,
                  original: sourceText,
                  modified: prefix + cleanedAccumulated + suffix,
                  isTranslation: isTrans
                }
              }
            },
            true
          );
          break;
        }

        case 'generate_from_plot': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter) throw new Error('Không tìm thấy chương chỉ định.');

          this.updateJob(jobId, {
            progress: 20,
            statusText: 'Đang truy xuất World Bible & tri thức liên quan...'
          });

          const searchQuery = [
            chapter.title,
            chapter.outline,
            chapter.summary,
            payload.options?.repairInstruction,
            payload.options?.continuityNotes,
            (chapter.content || '').slice(0, 1200)
          ]
            .filter(Boolean)
            .join(' ');
          const retrievedKnowledge = await getRelevantKnowledge(searchQuery, currentStory);
          const { retrievedChapters } = getRelevantChapterMemory(searchQuery, currentStory, [chapterId], 6, 950);
          const continuityLedger = ragService.buildStoryContinuityLedger(currentStory, {
            upToChapterId: chapterId,
            maxChars: 14000
          });
          checkAborted();

          this.updateJob(jobId, {
            progress: 40,
            statusText: 'Đang dùng AI tự động viết/sửa bản thảo chương theo đúng thiết lập...'
          });

          const result = await geminiService.generateChapterContentFromPlot(
            chapter,
            currentStory,
            {
              ...(payload.options || {}),
              retrievedKnowledge,
              retrievedChapters,
              continuityLedger
            }
          );
          checkAborted();

          let finalText = chapter.content;
          if (result?.text) {
            finalText = cleanAndDeduplicateContinuation(result.text, '');
            const latest = loadStoryOrThrow();
            const storyWithDraft: Story = {
              ...latest,
              chapters: latest.chapters.map(c =>
                c.id === chapterId
                  ? {
                      ...c,
                      originalContent: c.originalContent || c.content,
                      content: finalText,
                      lastUpdated: Date.now()
                    }
                  : c
              )
            };
            const updated: Story = {
              ...storyWithDraft,
              continuityLedger: ragService.upsertChapterContinuityLedger(storyWithDraft, chapterId, {
                mode: 'refresh_auto'
              })
            };
            serverVault.saveStory(updated);
          }

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Hoàn tất viết/sửa chương từ Plot.',
              completedAt: Date.now(),
              result: { generatedText: finalText }
            },
            true
          );
          break;
        }

        case 'summarize_chapter': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const targetChapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!targetChapter) throw new Error('Không tìm thấy chương.');

          const contentText = targetChapter.content?.trim() || '';
          const outlineText = targetChapter.outline?.trim() || '';
          let sourceText = '';
          let isFromOutline = false;
          if (contentText.length >= 50) {
            sourceText = contentText;
          } else if (outlineText.length >= 10) {
            sourceText = `[Đề cương của chương]:\n${outlineText}`;
            isFromOutline = true;
          } else if (contentText.length > 0) {
            sourceText = contentText;
          }
          if (!sourceText || sourceText.trim().length < 10) {
            throw new Error(`Chương "${targetChapter.title}" chưa có bản thảo hoặc đề cương đủ dài.`);
          }

          this.updateJob(jobId, {
            progress: 40,
            statusText: `Đang tóm tắt ${targetChapter.title}...`
          });

          const result = await geminiService.generateChapterSummary(
            targetChapter.title,
            sourceText +
              (isFromOutline ? '\n\n(Lưu ý: Tóm tắt lại ngắn gọn diễn biến chính dựa trên đề cương này)' : '')
          );
          checkAborted();

          if (result?.text) {
            const latest = loadStoryOrThrow();
            const storyWithSummary: Story = {
              ...latest,
              chapters: latest.chapters.map(c =>
                c.id === chapterId ? { ...c, summary: result.text, lastUpdated: Date.now() } : c
              )
            };
            const updated: Story = {
              ...storyWithSummary,
              continuityLedger: ragService.upsertChapterContinuityLedger(storyWithSummary, chapterId, {
                mode: 'refresh_auto'
              })
            };
            serverVault.saveStory(updated);
          }

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: `Đã tóm tắt xong ${targetChapter.title}.`,
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'summarize_all_sequential': {
          const initialStory = loadStoryOrThrow();
          const sortedChapters = [...(initialStory.chapters || [])].sort((a, b) => a.order - b.order);
          if (sortedChapters.length === 0) throw new Error('Không có chương nào để tóm tắt.');

          for (let i = 0; i < sortedChapters.length; i++) {
            checkAborted();
            const latestStory = loadStoryOrThrow();
            const latestChapter =
              latestStory.chapters.find(c => c.id === sortedChapters[i].id) || sortedChapters[i];

            if (latestChapter.summary?.trim()) {
              this.updateJob(jobId, {
                progress: Math.round(((i + 1) / sortedChapters.length) * 100),
                statusText: `Bỏ qua ${latestChapter.title} (đã có tóm tắt)`,
                subProgress: {
                  current: i + 1,
                  total: sortedChapters.length,
                  label: `${latestChapter.title} (Bỏ qua - Đã có tóm tắt)`
                }
              });
              continue;
            }

            const contentText = latestChapter.content?.trim() || '';
            const outlineText = latestChapter.outline?.trim() || '';
            let sourceText = '';
            let isFromOutline = false;
            if (contentText.length >= 50) sourceText = contentText;
            else if (outlineText.length >= 10) {
              sourceText = `[Đề cương của chương]:\n${outlineText}`;
              isFromOutline = true;
            } else if (contentText.length > 0) sourceText = contentText;

            if (!sourceText || sourceText.trim().length < 10) {
              this.updateJob(jobId, {
                progress: Math.round(((i + 1) / sortedChapters.length) * 100),
                subProgress: {
                  current: i + 1,
                  total: sortedChapters.length,
                  label: `${latestChapter.title} (Bỏ qua - Chưa đủ nội dung)`
                }
              });
              continue;
            }

            this.updateJob(jobId, {
              progress: Math.max(5, Math.round((i / sortedChapters.length) * 100)),
              statusText: `Đang tóm tắt ${latestChapter.title} (${i + 1}/${sortedChapters.length})`,
              subProgress: {
                current: i + 1,
                total: sortedChapters.length,
                label: latestChapter.title
              }
            });

            try {
              const result = await geminiService.generateChapterSummary(
                latestChapter.title,
                sourceText +
                  (isFromOutline
                    ? '\n\n(Lưu ý: Tóm tắt lại ngắn gọn diễn biến chính dựa trên đề cương này)'
                    : '')
              );
              checkAborted();
              if (result?.text) {
                const reloaded = loadStoryOrThrow();
                const storyWithSummary: Story = {
                  ...reloaded,
                  chapters: reloaded.chapters.map(c =>
                    c.id === latestChapter.id
                      ? { ...c, summary: result.text, lastUpdated: Date.now() }
                      : c
                  )
                };
                const updated: Story = {
                  ...storyWithSummary,
                  continuityLedger: ragService.upsertChapterContinuityLedger(
                    storyWithSummary,
                    latestChapter.id,
                    { mode: 'refresh_auto' }
                  )
                };
                serverVault.saveStory(updated);
              }
            } catch (err: any) {
              if (signal.aborted || isAbortError(err)) throw err;
              console.error(`[JobManager] Summarize failed for ${latestChapter.title}:`, err);
            }

            await abortableSleep(700, signal);
          }

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Hoàn tất tóm tắt toàn bộ các chương!',
              subProgress: null,
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'translate_chapter': {
          const initialStory = loadStoryOrThrow();
          const startChapterId = String(payload.chapterId || '');
          const options = payload.options || { styleMode: 'natural', outputTarget: 'new_chapter' };
          const autoNext = Boolean(payload.autoNext);

          const orderedChapters = [...(initialStory.chapters || [])]
            .filter(c => !c.isTranslation && !c.title.startsWith('[Việt Hóa]'))
            .sort((a, b) => a.order - b.order);

          let startIndex = orderedChapters.findIndex(c => c.id === startChapterId);
          if (startIndex === -1) {
            const single = initialStory.chapters.find(c => c.id === startChapterId);
            if (!single) throw new Error('Không tìm thấy chương cần Việt hóa.');
            orderedChapters.push(single);
            startIndex = orderedChapters.length - 1;
          }

          const chaptersToProcess = autoNext
            ? orderedChapters.slice(startIndex)
            : [orderedChapters[startIndex]];

          for (let idx = 0; idx < chaptersToProcess.length; idx++) {
            checkAborted();
            const currentStory = loadStoryOrThrow();
            const targetChapter = currentStory.chapters.find(c => c.id === chaptersToProcess[idx].id);
            if (!targetChapter) continue;

            const sourceText = (targetChapter.originalContent || targetChapter.content || '').trim();
            if (sourceText.length < 5) {
              continue;
            }

            this.updateJob(jobId, {
              chapterId: targetChapter.id,
              progress: Math.max(5, Math.round((idx / chaptersToProcess.length) * 100)),
              statusText: `Đang Việt hóa: ${targetChapter.title} (${idx + 1}/${chaptersToProcess.length})...`,
              subProgress:
                chaptersToProcess.length > 1
                  ? { current: idx + 1, total: chaptersToProcess.length, label: targetChapter.title }
                  : null
            });

            // Clear/initialize translation slot
            const clearedStory: Story = {
              ...currentStory,
              chapters: currentStory.chapters.map(c =>
                c.id === targetChapter.id
                  ? {
                      ...c,
                      originalContent: c.originalContent || c.content,
                      translatedContent: '',
                      translationStyle: options.styleMode,
                      translationLastUpdated: Date.now()
                    }
                  : c
              )
            };
            serverVault.saveStory(clearedStory);

            const stream = geminiService.translateToVietnameseStream(sourceText, clearedStory, {
              chapterTitle: targetChapter.title,
              styleMode: options.styleMode,
              customInstruction: options.customInstruction,
              pronounOverride: options.pronounOverride
            });

            let accumulated = '';
            let lastFlush = 0;
            for await (const chunk of stream) {
              checkAborted();
              const txt = sanitizeChunk(chunk);
              if (txt) {
                accumulated += txt;
                const now = Date.now();
                if (now - lastFlush > 600) {
                  lastFlush = now;
                  const latest = loadStoryOrThrow();
                  serverVault.saveStory({
                    ...latest,
                    chapters: latest.chapters.map(c =>
                      c.id === targetChapter.id
                        ? {
                            ...c,
                            originalContent: c.originalContent || c.content,
                            translatedContent: accumulated,
                            translationStyle: options.styleMode,
                            translationLastUpdated: now
                          }
                        : c
                    )
                  });
                  this.updateJob(jobId, {
                    streamPreview: accumulated.slice(-300)
                  });
                }
              }
            }

            checkAborted();
            const cleanedTranslation =
              cleanAndDeduplicateTranslation(accumulated, sourceText) || accumulated.trim();

            const afterStory = loadStoryOrThrow();
            serverVault.saveStory({
              ...afterStory,
              chapters: afterStory.chapters.map(c =>
                c.id === targetChapter.id
                  ? {
                      ...c,
                      originalContent: c.originalContent || c.content,
                      translatedContent: cleanedTranslation,
                      translationStyle: options.styleMode,
                      translationLastUpdated: Date.now()
                    }
                  : c
              )
            });

            if (idx < chaptersToProcess.length - 1) {
              await abortableSleep(700, signal);
            }
          }

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              subProgress: null,
              statusText: autoNext
                ? 'Đã hoàn tất Việt hóa toàn bộ các chương vào Menu Bản Dịch!'
                : 'Đã hoàn tất Việt hóa chương!',
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'balance_chapter_length': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter) throw new Error('Không tìm thấy chương.');

          const isTrans =
            payload.editorVersion === 'translation' && Boolean(chapter.translatedContent?.trim());
          const sourceContent = isTrans
            ? chapter.translatedContent || ''
            : chapter.content?.trim()
            ? chapter.content
            : chapter.translatedContent || '';

          if (!sourceContent.trim() || sourceContent.trim().length < 30) {
            throw new Error('Chương hiện tại chưa có đủ nội dung để cân bằng độ dài.');
          }

          this.updateJob(jobId, {
            progress: 40,
            statusText: 'Đang cân bằng dung lượng & nhịp văn chương...'
          });

          const result = await geminiService.balanceChapterLength(
            sourceContent,
            chapter.wordGoal || 2000,
            fastWordCount(sourceContent),
            currentStory.interactionRules,
            currentStory.genre,
            currentStory.negativePrompt
          );
          checkAborted();

          if (result?.data?.edited_text) {
            const latest = loadStoryOrThrow();
            serverVault.saveStory({
              ...latest,
              chapters: latest.chapters.map(c => {
                if (c.id !== chapterId) return c;
                if (isTrans) {
                  return {
                    ...c,
                    translatedContent: result.data.edited_text,
                    translationLastUpdated: Date.now()
                  };
                }
                return {
                  ...c,
                  content: result.data.edited_text,
                  lastUpdated: Date.now()
                };
              })
            });
          }

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã cân bằng độ dài chương.',
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'suggest_outline': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter) throw new Error('Không tìm thấy chương.');

          const sorted = [...currentStory.chapters].sort((a, b) => a.order - b.order);
          const curIdx = sorted.findIndex(c => c.id === chapterId);
          const prevCh = curIdx > 0 ? sorted[curIdx - 1] : null;
          const currentBody = (
            chapter.content?.trim() ? chapter.content : chapter.translatedContent || ''
          ).slice(-3000);
          const shortTermMemory =
            currentBody ||
            (prevCh
              ? `[Cuối chương trước - ${prevCh.title}]:\n${(
                  prevCh.content ||
                  prevCh.translatedContent ||
                  ''
                ).slice(-2000)}`
              : '');
          const longTermMemory = sorted
            .slice(Math.max(0, curIdx - 5), curIdx)
            .map(
              c =>
                `[${c.title}]: ${c.summary || c.outline || sampleManuscript(c.content || c.translatedContent || '', 450)}`
            )
            .join('\n');

          this.updateJob(jobId, {
            progress: 40,
            statusText: `Đang gợi ý đề cương cho ${chapter.title}...`
          });

          const result = await geminiService.suggestOutline(
            chapter,
            currentStory,
            String(payload.userInstruction || ''),
            longTermMemory,
            shortTermMemory
          );
          checkAborted();

          if (result?.text) {
            const latest = loadStoryOrThrow();
            serverVault.saveStory({
              ...latest,
              chapters: latest.chapters.map(c =>
                c.id === chapterId ? { ...c, outline: result.text, lastUpdated: Date.now() } : c
              )
            });
          }

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã cập nhật đề cương chương.',
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'suggest_new_chapter': {
          const currentStory = loadStoryOrThrow();
          this.updateJob(jobId, {
            progress: 40,
            statusText: 'AI đang phân tích để gợi ý chương tiếp theo...'
          });
          const result = await geminiService.generateAdvancedChapterSuggestion(currentStory);
          checkAborted();
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã tạo xong gợi ý chương mới.',
              completedAt: Date.now(),
              result: { chapterSuggestion: result?.data || null }
            },
            true
          );
          break;
        }

        case 'analyze_plot_arc': {
          const currentStory = loadStoryOrThrow();
          this.updateJob(jobId, {
            progress: 35,
            statusText: 'AI đang phân tích toàn bộ mạch truyện & nút thắt...'
          });
          const result = await geminiService.analyzePlotArc(currentStory);
          checkAborted();
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Hoàn tất phân tích mạch truyện.',
              completedAt: Date.now(),
              result: { plotArcAnalysis: result?.data || null }
            },
            true
          );
          break;
        }

        case 'scan_story_entities': {
          const currentStory = loadStoryOrThrow();
          this.updateJob(jobId, {
            progress: 10,
            statusText: 'Đang chuẩn bị quét nhân vật & World Lore...',
            subProgress: { current: 0, total: 1, label: 'Đang phân tích toàn truyện...' }
          });

          const result = await geminiService.scanStoryEntities(currentStory, prog => {
            const pct = prog.total > 0 ? Math.min(95, Math.round((prog.current / prog.total) * 100)) : 50;
            this.updateJob(jobId, {
              progress: pct,
              statusText: prog.label || 'Đang quét thực thể...',
              subProgress: prog
            });
          });
          checkAborted();

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              subProgress: null,
              statusText: 'Hoàn tất quét nhân vật & World Lore.',
              completedAt: Date.now(),
              result: { consistencyReport: result?.data || null }
            },
            true
          );
          break;
        }

        case 'extract_knowledge': {
          const currentStory = loadStoryOrThrow();
          let targetContent = String(payload.text || '');
          if (!targetContent && payload.chapterId) {
            const ch = currentStory.chapters.find(c => c.id === payload.chapterId);
            if (ch) {
              targetContent =
                payload.editorVersion === 'translation' && ch.translatedContent?.trim()
                  ? ch.translatedContent
                  : ch.content?.trim()
                  ? ch.content
                  : ch.translatedContent || '';
            }
          }
          if (!targetContent || targetContent.trim().length < 20) {
            throw new Error('Nội dung quá ngắn để trích xuất tri thức.');
          }
          const categories: ExtractionCategory[] = Array.isArray(payload.categories)
            ? payload.categories
            : ['characters', 'world', 'mechanics', 'dna'];

          this.updateJob(jobId, {
            progress: 35,
            statusText: 'Đang trích xuất tri thức & nhân vật...'
          });
          const report = await geminiService.extractKnowledge(targetContent, currentStory, categories);
          checkAborted();

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã trích xuất xong tri thức.',
              completedAt: Date.now(),
              result: { consistencyReport: report?.data || null }
            },
            true
          );
          break;
        }

        case 'audit_story': {
          const currentStory = loadStoryOrThrow();
          this.updateJob(jobId, {
            progress: 30,
            statusText: 'Đang kiểm toán tính nhất quán toàn truyện...'
          });
          const report = await geminiService.auditStoryConsistency(
            currentStory,
            payload.focusChapterId ? String(payload.focusChapterId) : undefined
          );
          checkAborted();
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Hoàn tất kiểm toán toàn truyện.',
              completedAt: Date.now(),
              result: { auditReport: report?.data || null }
            },
            true
          );
          break;
        }

        case 'audit_chapter': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter) throw new Error('Không tìm thấy chương.');

          const targetContent =
            payload.editorVersion === 'translation' && chapter.translatedContent?.trim()
              ? chapter.translatedContent
              : chapter.content?.trim()
              ? chapter.content
              : chapter.translatedContent || '';
          const targetTitle =
            payload.editorVersion === 'translation' && chapter.translatedTitle?.trim()
              ? chapter.translatedTitle
              : chapter.title;

          if (!targetContent || targetContent.trim().length < 20) {
            throw new Error('Chương hiện tại chưa có đủ nội dung để kiểm toán logic.');
          }

          this.updateJob(jobId, {
            progress: 40,
            statusText: `Đang kiểm toán logic ${targetTitle}...`
          });
          const report = await geminiService.auditChapterLogic(
            targetContent,
            targetTitle,
            currentStory,
            chapter.id
          );
          checkAborted();

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Hoàn tất kiểm toán logic chương.',
              completedAt: Date.now(),
              result: { chapterAuditReport: report?.data || null }
            },
            true
          );
          break;
        }

        case 'analyze_vocabulary': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter) throw new Error('Không tìm thấy chương.');

          const targetContent =
            payload.editorVersion === 'translation' && chapter.translatedContent?.trim()
              ? chapter.translatedContent
              : chapter.content?.trim()
              ? chapter.content
              : chapter.translatedContent || '';
          if (!targetContent || targetContent.trim().length < 20) {
            throw new Error('Chương hiện tại chưa có đủ nội dung để phân tích từ vựng.');
          }

          this.updateJob(jobId, {
            progress: 45,
            statusText: 'Đang phân tích từ vựng & mật độ lặp từ...'
          });
          const report = await geminiService.analyzeVocabulary(
            targetContent,
            currentStory.interactionRules || ''
          );
          checkAborted();

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Hoàn tất phân tích từ vựng.',
              completedAt: Date.now(),
              result: { vocabularyInsights: report?.data || null }
            },
            true
          );
          break;
        }

        case 'chat_planning': {
          const currentStory = loadStoryOrThrow();
          const message = String(payload.message || '').trim();
          if (!message) throw new Error('Tin nhắn trống.');

          const baseHistory = [...(currentStory.planningChatHistory || [])];
          const withUser: ChatMessage[] = [...baseHistory, { role: 'user', parts: [{ text: message }] }];
          serverVault.saveStory({ ...currentStory, planningChatHistory: withUser });

          this.updateJob(jobId, {
            progress: 35,
            statusText: 'Cố vấn Kế hoạch đang soạn phản hồi...'
          });

          const stream = geminiService.chatPlanningStream(baseHistory, message, currentStory);
          let fullResponse = '';
          let lastSave = 0;

          for await (const chunk of stream) {
            checkAborted();
            const txt = sanitizeChunk(chunk);
            if (txt) {
              fullResponse += txt;
              const cleanDisplay = cleanAccumulatedText(fullResponse);
              const now = Date.now();
              if (now - lastSave > 500) {
                lastSave = now;
                const latest = loadStoryOrThrow();
                const curHist = [...(latest.planningChatHistory || [])];
                if (curHist.length > 0 && curHist[curHist.length - 1].role === 'model') {
                  curHist[curHist.length - 1] = { role: 'model', parts: [{ text: cleanDisplay }] };
                } else {
                  curHist.push({ role: 'model', parts: [{ text: cleanDisplay }] });
                }
                serverVault.saveStory({ ...latest, planningChatHistory: curHist });
                this.updateJob(jobId, { streamPreview: cleanDisplay.slice(-300) });
              }
            }
          }

          const finalClean = cleanAccumulatedText(fullResponse);
          const latestFinal = loadStoryOrThrow();
          const finalHist = [...(latestFinal.planningChatHistory || [])];
          if (finalHist.length > 0 && finalHist[finalHist.length - 1].role === 'model') {
            finalHist[finalHist.length - 1] = { role: 'model', parts: [{ text: finalClean }] };
          } else {
            finalHist.push({ role: 'model', parts: [{ text: finalClean }] });
          }
          serverVault.saveStory({ ...latestFinal, planningChatHistory: finalHist });

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Cố vấn Kế hoạch đã trả lời.',
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'chat_plot': {
          const currentStory = loadStoryOrThrow();
          const message = String(payload.message || '').trim();
          if (!message) throw new Error('Tin nhắn trống.');

          const baseHistory = [...(currentStory.plotChatHistory || [])];
          const withUser: ChatMessage[] = [...baseHistory, { role: 'user', parts: [{ text: message }] }];
          serverVault.saveStory({ ...currentStory, plotChatHistory: withUser });

          this.updateJob(jobId, {
            progress: 25,
            statusText: 'Đang truy xuất World Bible, Pinned Memory & ký ức các chương trước...'
          });

          const focusChapterId = payload.focusChapterId ? String(payload.focusChapterId) : undefined;
          const focusedChapter = focusChapterId
            ? currentStory.chapters.find(c => c.id === focusChapterId)
            : undefined;
          const ragQuery = [
            message,
            focusedChapter?.title,
            focusedChapter?.outline,
            focusedChapter?.summary
          ]
            .filter(Boolean)
            .join(' ');
          const retrievedKnowledge = await getRelevantKnowledge(ragQuery, currentStory);
          const { retrievedChapters, boostChapterIds } = getRelevantChapterMemory(
            ragQuery,
            currentStory,
            focusChapterId ? [focusChapterId] : [],
            7,
            900
          );
          const continuityLedger = ragService.buildStoryContinuityLedger(currentStory, {
            upToChapterId: focusChapterId,
            maxChars: 18000
          });
          checkAborted();

          this.updateJob(jobId, {
            progress: 40,
            statusText: 'Plot AI đang đối chiếu toàn bộ thiết lập, sổ cái dấu chân & phân tích...'
          });

          const stream = geminiService.chatPlotStream(
            baseHistory,
            message,
            currentStory,
            focusChapterId,
            {
              plotArcAnalysis: payload.plotArcAnalysis,
              auditReport: payload.auditReport,
              retrievedKnowledge,
              retrievedChapters,
              continuityLedger,
              boostChapterIds
            }
          );

          let fullResponse = '';
          let lastSave = 0;

          for await (const chunk of stream) {
            checkAborted();
            const txt = sanitizeChunk(chunk);
            if (txt) {
              fullResponse += txt;
              const cleanDisplay = cleanAccumulatedText(fullResponse);
              const now = Date.now();
              if (now - lastSave > 500) {
                lastSave = now;
                const latest = loadStoryOrThrow();
                const curHist = [...(latest.plotChatHistory || [])];
                if (curHist.length > 0 && curHist[curHist.length - 1].role === 'model') {
                  curHist[curHist.length - 1] = { role: 'model', parts: [{ text: cleanDisplay }] };
                } else {
                  curHist.push({ role: 'model', parts: [{ text: cleanDisplay }] });
                }
                serverVault.saveStory({ ...latest, plotChatHistory: curHist });
                this.updateJob(jobId, { streamPreview: cleanDisplay.slice(-300) });
              }
            }
          }

          const finalClean = cleanAccumulatedText(fullResponse);
          const latestFinal = loadStoryOrThrow();
          const finalHist = [...(latestFinal.plotChatHistory || [])];
          if (finalHist.length > 0 && finalHist[finalHist.length - 1].role === 'model') {
            finalHist[finalHist.length - 1] = { role: 'model', parts: [{ text: finalClean }] };
          } else {
            finalHist.push({ role: 'model', parts: [{ text: finalClean }] });
          }
          serverVault.saveStory({ ...latestFinal, plotChatHistory: finalHist });

          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Plot AI đã trả lời.',
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'learn_writing_dna': {
          const currentStory = loadStoryOrThrow();
          const text = String(payload.text || '');
          const result = await geminiService.extractWritingDNA(text);
          checkAborted();
          if (result?.data) {
            const latest = loadStoryOrThrow();
            serverVault.saveStory({ ...latest, writingDNA: result.data });
          }
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã trích xuất & lưu Hồn Văn (DNA).',
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'learn_style_from_text': {
          const currentStory = loadStoryOrThrow();
          const text = String(payload.text || '');
          const result = await geminiService.extractStylisticRule(text);
          checkAborted();
          if (result?.text) {
            const newLog: EvolutionLog = {
              id: generateId(),
              timestamp: Date.now(),
              type: 'derived_rule',
              context: text.substring(0, 100),
              learnedRule: result.text,
              isActive: true
            };
            const latest = loadStoryOrThrow();
            serverVault.saveStory({
              ...latest,
              evolutionLogs: [newLog, ...(latest.evolutionLogs || [])]
            });
          }
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: result?.text
                ? `Đã học được quy tắc mới: "${result.text}"`
                : 'Hoàn tất phân tích văn phong.',
              completedAt: Date.now(),
              result: { generatedText: result?.text || '' }
            },
            true
          );
          break;
        }

        case 'learn_from_interaction': {
          const currentStory = loadStoryOrThrow();
          const result = await geminiService.deriveStylisticRule(
            String(payload.original || ''),
            String(payload.modified || '')
          );
          checkAborted();
          if (result?.text) {
            const newLog: EvolutionLog = {
              id: generateId(),
              timestamp: Date.now(),
              type: 'derived_rule',
              context: 'User manual edit',
              learnedRule: result.text,
              isActive: true
            };
            const latest = loadStoryOrThrow();
            serverVault.saveStory({
              ...latest,
              evolutionLogs: [newLog, ...(latest.evolutionLogs || [])]
            });
          }
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã học quy tắc từ chỉnh sửa của bạn.',
              completedAt: Date.now()
            },
            true
          );
          break;
        }

        case 'fetch_web_inspiration': {
          const currentStory = loadStoryOrThrow();
          const result = await geminiService.searchCreativeInspiration(
            currentStory,
            payload.topic ? String(payload.topic) : undefined
          );
          checkAborted();
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: 'Đã tổng hợp cảm hứng sáng tác từ Web.',
              completedAt: Date.now(),
              result: { webInspiration: result?.data || null }
            },
            true
          );
          break;
        }

        case 'generate_video': {
          const currentStory = loadStoryOrThrow();
          const chapterId = String(payload.chapterId || '');
          const chapter = currentStory.chapters.find(c => c.id === chapterId);
          if (!chapter || !chapter.summary) {
            throw new Error('Cần tóm tắt chương trước khi tạo video.');
          }
          this.updateJob(jobId, {
            progress: 25,
            statusText: 'Đang khởi tạo Veo Engine trên máy chủ...'
          });
          const url = await geminiService.generateVideo(chapter.summary, currentStory.genre);
          checkAborted();
          if (url) {
            const latest = loadStoryOrThrow();
            serverVault.saveStory({
              ...latest,
              chapters: latest.chapters.map(c =>
                c.id === chapterId ? { ...c, videoUrl: url } : c
              )
            });
          }
          this.updateJob(
            jobId,
            {
              status: 'completed',
              progress: 100,
              statusText: url ? 'Đã tạo xong Trailer Video.' : 'Không nhận được URL video.',
              completedAt: Date.now(),
              result: { generatedVideoUrl: url || undefined }
            },
            true
          );
          break;
        }

        default:
          throw new Error(`Không hỗ trợ loại tác vụ "${type}".`);
      }
    } catch (err: any) {
      if (signal.aborted || isAbortError(err)) {
        plotDebugLogger.cancelByJobId(jobId, 'Tác vụ đã bị hủy bởi người dùng');
        requestThrottleService.cancelByJobId(jobId);
        this.updateJob(
          jobId,
          {
            status: 'cancelled',
            statusText: 'Tác vụ đã bị hủy.',
            error: 'Cancelled by user',
            completedAt: Date.now()
          },
          true
        );
      } else {
        this.updateJob(
          jobId,
          {
            status: 'failed',
            statusText: err?.message || 'Tác vụ thất bại.',
            error: err?.message || String(err),
            completedAt: Date.now()
          },
          true
        );
      }
    } finally {
      this.controllers.delete(jobId);
      if (signal.aborted) {
        plotDebugLogger.cancelByJobId(jobId, 'Tác vụ đã bị hủy bởi người dùng');
        requestThrottleService.cancelByJobId(jobId);
      }
    }
    });
  }

  public async runUtilityAction(action: string, payload: any): Promise<any> {
    switch (action) {
      case 'expandSettingWithAI': {
        const res = await geminiService.expandWorldBuilding(String(payload?.input || ''));
        return res?.text || String(payload?.input || '');
      }
      case 'suggestWorldSettings': {
        const res = await geminiService.suggestWorldSettings(
          String(payload?.title || ''),
          String(payload?.genre || ''),
          String(payload?.synopsis || ''),
          String(payload?.timeline || '')
        );
        return res?.data || null;
      }
      case 'suggestMainCharacter': {
        const res = await geminiService.suggestMainCharacter(
          String(payload?.title || ''),
          String(payload?.genre || ''),
          String(payload?.synopsis || '')
        );
        return res?.data || null;
      }
      case 'autoUpdateCharacter': {
        const story = serverVault.getStory(String(payload?.storyId || ''));
        if (!story) throw new Error('Không tìm thấy truyện.');
        const charId = String(payload?.charId || '');
        const character = story.characters.find(c => c.id === charId);
        if (!character) throw new Error('Không tìm thấy nhân vật.');

        const sortedChapters = [...story.chapters].sort((a, b) => a.order - b.order);
        const mentioning = sortedChapters.filter(c => {
          const haystack = `${c.title}\n${c.summary || ''}\n${c.content || ''}\n${c.translatedContent || ''}`.toLowerCase();
          return haystack.includes(character.name.toLowerCase());
        });
        const sourceChapters = (mentioning.length > 0 ? mentioning : sortedChapters).slice(-4);
        const storyContext = sourceChapters
          .map(c => {
            const rawText = (c.content?.trim() ? c.content : c.translatedContent || '').trim();
            const excerpt =
              rawText.length > 1500
                ? `${rawText.slice(0, 600)}\n...\n${rawText.slice(-900)}`
                : rawText;
            return `[${c.title}]:\nTóm tắt: ${c.summary || 'Chưa có'}\nDiễn biến:\n${excerpt}`;
          })
          .join('\n\n---\n\n');

        if (!storyContext.trim()) {
          throw new Error('Chưa có nội dung chương nào để đồng bộ tình trạng nhân vật.');
        }

        const result = await geminiService.autoUpdateCharacterStatus(character, storyContext);
        if (!result?.data) return null;

        const mergedUpdates = {
          ...result.data,
          knowledge: result.data.knowledge
            ? character.knowledge && !character.knowledge.includes(result.data.knowledge)
              ? `${character.knowledge}\n• ${result.data.knowledge}`
              : result.data.knowledge
            : character.knowledge
        };
        const updatedCharacter = { ...character, ...mergedUpdates };
        serverVault.saveStory({
          ...story,
          chapters: story.chapters,
          characters: story.characters.map(c => (c.id === charId ? updatedCharacter : c))
        });
        return updatedCharacter;
      }
      default:
        throw new Error(`Hành động AI "${action}" không hợp lệ.`);
    }
  }
}

export const serverJobManager = new ServerJobManager();
