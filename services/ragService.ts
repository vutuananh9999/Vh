
import { VectorData, Chapter, Story, Character, KnowledgeLog } from '../types.ts';

export const getMagnitude = (vec: number[]): number => {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
        sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
};

const cosineSimilarityOptimized = (vecA: number[], vecB: number[], normA: number, normB: number): number => {
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
              buffer = buffer ? (buffer + '\n\n' + p) : p;
          }
      }
      if (buffer) chunks.push(buffer.trim());
      return chunks;
  },

  // Tạo "Bể tri thức" tổng hợp từ toàn bộ truyện
  buildKnowledgePool: (story: Story): VectorData[] => {
    const pool: VectorData[] = [];
    
    // 1. Lore & Thư viện
    story.knowledgeLogs?.filter(log => log.isActive && log.embedding).forEach(log => {
        pool.push({
            id: log.id, storyId: story.id, text: `[TRI THỨC: ${log.title}]: ${log.content}`,
            embedding: log.embedding!, magnitude: getMagnitude(log.embedding!),
            createdAt: log.timestamp, metadata: { type: 'lore', referenceId: log.id }
        });
    });

    // 2. Nhân vật & Arcs
    story.characters.filter(c => c.embedding).forEach(c => {
        pool.push({
            id: c.id, storyId: story.id, text: `[THỰC THỂ: ${c.name}]: ${c.description}. Tình trạng: ${c.healthStatus}. Thực lực: ${c.powerLevel}.`,
            embedding: c.embedding!, magnitude: getMagnitude(c.embedding!),
            createdAt: story.createdAt, metadata: { type: 'character', referenceId: c.id }
        });
    });

    // 3. Quy tắc tiến hóa (Style Evolution)
    story.evolutionLogs?.filter(log => log.isActive).forEach(log => {
        // Có thể bổ sung embedding cho rule nếu cần, hiện tại dùng metadata text
    });

    return pool;
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
    return scored.filter(s => s.score >= minScore).slice(0, topK).map(s => s.item);
  }
};
