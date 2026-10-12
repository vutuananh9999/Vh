/**
 * Utility functions for sanitizing and deduplicating translation text
 * to prevent AI hallucinations, prompt echoes, stream-restart duplications,
 * and repeated paragraphs.
 */

export function cleanAndDeduplicateTranslation(rawText: string, originalContent?: string): string {
  if (!rawText) return "";

  let cleaned = rawText.trim();

  // 1. Remove Markdown code block wrappers if any
  cleaned = cleaned.replace(/^```[a-zA-Z]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  // 2. Remove AI / Prompt preamble leaks and labels
  const preamblePatterns = [
    /^BẮT ĐẦU VĂN BẢN ĐÃ VIỆT HÓA & BIÊN TẬP HOÀN CHỈNH:\s*/i,
    /^BẮT ĐẦU VĂN BẢN VIỆT HÓA:\s*/i,
    /^\[BẢN VIỆT HÓA HOÀN CHỈNH\]:?\s*/i,
    /^\[BẢN DỊCH VIỆT HÓA\]:?\s*/i,
    /^\[BẢN DỊCH HOÀN CHỈNH\]:?\s*/i,
    /^\[VĂN BẢN ĐÃ VIỆT HÓA\]:?\s*/i,
    /^\[BẢN DỊCH TIẾNG VIỆT\]:?\s*/i,
    /^\[BẢN DỊCH\]:?\s*/i,
    /^Dưới đây là\s+(?:toàn bộ\s+|toàn\s+)?(?:văn bản\s+)?(?:bản\s+)?(?:Việt\s+hóa|dịch).*?:\s*/i,
    /^Sau đây là\s+(?:toàn bộ\s+|toàn\s+)?(?:văn bản\s+)?(?:bản\s+)?(?:Việt\s+hóa|dịch).*?:\s*/i,
    /^\*\*\[?Bản dịch[^\]*]*\]?\*\*:\s*/i,
  ];

  for (const pattern of preamblePatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  // 3. Remove prompt echo if the model accidentally echoed [VĂN BẢN GỐC...] block
  const rawPromptEchoMatch = cleaned.match(/\[VĂN BẢN GỐC.*?\][\s\S]*?BẮT ĐẦU VĂN BẢN.*?:\s*/i);
  if (rawPromptEchoMatch && rawPromptEchoMatch.index === 0) {
    cleaned = cleaned.slice(rawPromptEchoMatch[0].length).trim();
  }

  // 4. Remove original text if the model echoed original content verbatim before the translation
  if (originalContent && originalContent.trim().length > 50) {
    const origTrimmed = originalContent.trim();
    // If the output begins with the exact original text followed by translated text
    if (cleaned.startsWith(origTrimmed)) {
      cleaned = cleaned.slice(origTrimmed.length).trim();
      // Also strip any separator like "---" or "Bản dịch:"
      cleaned = cleaned.replace(/^(--+|\*\*\*|===+|Bản dịch:|Bản Việt hóa:)\s*/i, '').trim();
    } else {
      // Check first 150 chars of original text
      const origSample = origTrimmed.slice(0, 150);
      const sampleIdx = cleaned.indexOf(origSample);
      if (sampleIdx === 0) {
        // Echoed at start
        const nextHeaderIdx = cleaned.search(/(BẢN VIỆT HÓA|BẢN DỊCH|BẮT ĐẦU VĂN BẢN|---|\n\n\n)/i);
        if (nextHeaderIdx > 150) {
          cleaned = cleaned.slice(nextHeaderIdx).replace(/^.*?(BẢN VIỆT HÓA|BẢN DỊCH|BẮT ĐẦU VĂN BẢN|---)\s*:?\s*/i, '').trim();
        }
      }
    }
  }

  // 5. Detect and remove Stream-Restart / Generation-Restart Duplications
  // Only applies to longer documents where a genuine stream abort restarted the chapter
  cleaned = removeStreamRestartDuplicates(cleaned);

  // 6. Detect and deduplicate adjacent identical or near-identical paragraphs
  cleaned = deduplicateConsecutiveParagraphs(cleaned);

  // Fallback: If deduplication somehow wiped the entire text, preserve the trimmed raw text
  const finalResult = cleaned.trim();
  return finalResult || rawText.trim();
}

/**
 * Detects if the beginning of the text repeats later in the text due to stream/model fallback restarts.
 * Strictly limited to large texts (> 500 characters) to protect short texts (300-500 characters)
 * and poems/dialogues from being accidentally truncated.
 */
function removeStreamRestartDuplicates(text: string): string {
  // Never truncate short texts (like 300-500 character chapters or poems)
  if (text.length < 500) return text;

  // Extract a signature prefix from the start (first 60 to 120 characters, or first sentence/paragraph)
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length < 2) return text;

  const firstPara = paragraphs[0];
  // Determine sample size
  const sampleLength = Math.min(80, Math.max(45, Math.floor(firstPara.length * 0.8)));
  const sample = firstPara.slice(0, sampleLength);

  if (sample.length >= 40) {
    // Search for the sample starting well into the text (at least 200 characters)
    let searchPos = Math.max(200, sampleLength);
    while (searchPos < text.length - 100) {
      const foundIdx = text.indexOf(sample, searchPos);
      if (foundIdx === -1) break;

      // Must be at the start of a paragraph/line to avoid mid-sentence false positives
      const prevChar = text.charAt(foundIdx - 1);
      const isLineBoundary = prevChar === '\n' || prevChar === '\r' || prevChar === ' ';

      if (isLineBoundary) {
        // Compare the next 60 characters from 0 and foundIdx
        const compareLen = Math.min(60, text.length - foundIdx);
        const prefixMatch = text.slice(0, compareLen) === text.slice(foundIdx, foundIdx + compareLen);

        if (prefixMatch) {
          const partBefore = text.slice(0, foundIdx).trim();
          const partAfter = text.slice(foundIdx).trim();

          // Require at least 120 matching characters to confirm true stream restart duplicate
          const verifyLen = Math.min(120, partBefore.length, partAfter.length);
          const isTrueRestartDuplicate = verifyLen >= 60 && text.slice(0, verifyLen) === text.slice(foundIdx, foundIdx + verifyLen);

          if (isTrueRestartDuplicate) {
            // Case A: Part before is shorter (aborted stream) and part after is longer (full stream)
            // -> Discard the aborted partial prefix and keep the complete stream!
            if (partAfter.length >= partBefore.length * 0.8 && partAfter.length > 200) {
              text = partAfter;
              // Recursively re-check in case it repeated more than once
              return removeStreamRestartDuplicates(text);
            }

            // Case B: Part after is an identical duplicate of part before (or truncated duplicate appended)
            // -> Keep part before!
            if (partBefore.startsWith(partAfter) || (partBefore.length >= partAfter.length && partBefore.startsWith(partAfter.slice(0, Math.min(150, partAfter.length))))) {
              text = partBefore;
              return removeStreamRestartDuplicates(text);
            }
          }
        }
      }

      searchPos = foundIdx + sample.length;
    }
  }

  // Check if text is duplicated exactly into two halves: Part1 + Part1
  const halfLen = Math.floor(text.length / 2);
  for (let delta = -20; delta <= 20; delta++) {
    const mid = halfLen + delta;
    if (mid > 200 && mid < text.length - 200) {
      const firstHalf = text.slice(0, mid).trim();
      const secondHalf = text.slice(mid).trim();
      if (firstHalf === secondHalf) {
        return firstHalf;
      }
    }
  }

  return text;
}

/**
 * Removes duplicate consecutive paragraphs (e.g. AI echoing the same paragraph twice)
 */
function deduplicateConsecutiveParagraphs(text: string): string {
  const paragraphs = text.split(/\n/);
  const result: string[] = [];

  let lastTrimmed = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      // Keep empty line separator if not already multiple
      if (result.length > 0 && result[result.length - 1] !== "") {
        result.push("");
      }
      continue;
    }

    // If this paragraph is identical to the immediate preceding paragraph, skip duplicate
    if (trimmed.length > 20 && trimmed === lastTrimmed) {
      continue;
    }

    result.push(para);
    lastTrimmed = trimmed;
  }

  return result.join('\n');
}
