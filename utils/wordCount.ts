/**
 * Highly optimized, O(N) time and O(1) space word counter.
 * Avoids expensive string array allocations and regex overhead,
 * preventing browser lag or crashes on large stories.
 */
export function fastWordCount(str: string | undefined | null): number {
    if (!str) return 0;
    let count = 0;
    let inWord = false;
    for (let i = 0; i < str.length; i++) {
        // Character codes > 32 represent non-whitespace characters (ASCII and all Unicode/Vietnamese characters)
        if (str.charCodeAt(i) > 32) {
            if (!inWord) {
                count++;
                inWord = true;
            }
        } else {
            inWord = false;
        }
    }
    return count;
}

// Bounded LRU cache for word counts (max 2000 entries)
const wordCountCache = new Map<string, number>();
const MAX_CACHE_SIZE = 2000;

export function getCachedWordCount(id: string, text: string | undefined | null, versionKey?: number | string): number {
    if (!text) return 0;
    const len = text.length;
    if (len === 0) return 0;
    const cacheKey = `${id}_${versionKey ?? len}_${len}`;
    const cached = wordCountCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const count = fastWordCount(text);
    if (wordCountCache.size >= MAX_CACHE_SIZE) {
        // Drop oldest entries
        const firstKeys = Array.from(wordCountCache.keys()).slice(0, 200);
        for (const k of firstKeys) wordCountCache.delete(k);
    }
    wordCountCache.set(cacheKey, count);
    return count;
}
