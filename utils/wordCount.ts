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
