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
    /^Dưới đây là bản dịch.*?:\s*\n+/i,
    /^Dưới đây là bản Việt hóa.*?:\s*\n+/i,
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
  // E.g., when a generation restarted midway and emitted:
  // [Partial chapter starting with text A] + [Full chapter starting with text A]
  // Or [Full chapter] + [Full chapter duplicate]
  cleaned = removeStreamRestartDuplicates(cleaned);

  // 6. Detect and deduplicate adjacent identical or near-identical paragraphs
  cleaned = deduplicateConsecutiveParagraphs(cleaned);

  return cleaned.trim();
}

/**
 * Detects if the beginning of the text repeats later in the text due to stream/model fallback restarts
 */
function removeStreamRestartDuplicates(text: string): string {
  if (text.length < 150) return text;

  // Extract a signature prefix from the start (first 60 to 120 characters, or first sentence/paragraph)
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return text;

  const firstPara = paragraphs[0];
  // Determine sample size
  const sampleLength = Math.min(80, Math.max(35, Math.floor(firstPara.length * 0.8)));
  const sample = firstPara.slice(0, sampleLength);

  if (sample.length >= 30) {
    // Search for the sample in the remainder of text (starting after sampleLength)
    let searchPos = sampleLength;
    while (searchPos < text.length) {
      const foundIdx = text.indexOf(sample, searchPos);
      if (foundIdx === -1) break;

      // Found the signature sample repeating at foundIdx!
      // Check if this looks like a restart of the chapter:
      // Compare the next 60 characters from 0 and foundIdx
      const compareLen = Math.min(60, text.length - foundIdx);
      const prefixMatch = text.slice(0, compareLen) === text.slice(foundIdx, foundIdx + compareLen);

      if (prefixMatch) {
        const partBefore = text.slice(0, foundIdx).trim();
        const partAfter = text.slice(foundIdx).trim();

        // Case A: Part before is shorter (aborted stream) and part after is longer (full stream)
        // -> Discard the aborted partial prefix and keep the complete stream!
        if (partAfter.length >= partBefore.length * 0.7) {
          text = partAfter;
          // Recursively re-check in case it repeated more than once
          return removeStreamRestartDuplicates(text);
        }

        // Case B: Part after is an identical duplicate of part before (or truncated duplicate appended)
        // -> Keep part before!
        if (partBefore.startsWith(partAfter) || partBefore.length >= partAfter.length) {
          text = partBefore;
          return removeStreamRestartDuplicates(text);
        }
      }

      searchPos = foundIdx + sample.length;
    }
  }

  // Check if text is duplicated exactly into two halves: Part1 + Part1
  const halfLen = Math.floor(text.length / 2);
  for (let delta = -20; delta <= 20; delta++) {
    const mid = halfLen + delta;
    if (mid > 50 && mid < text.length - 50) {
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
