/**
 * Fast, zero-dependency text compression utility for chapter archives.
 * Uses native CompressionStream (gzip) with transparent raw-string fallback.
 */

const COMPRESSED_PREFIX = '§GZ:';

export async function compressText(text: string): Promise<string> {
  if (!text || text.length < 512) {
    // Only compress text of meaningful length
    return text;
  }

  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
      const buffer = await new Response(stream).arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      
      // Convert to binary string safely without stack overflow
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize) as unknown as number[]);
      }
      return COMPRESSED_PREFIX + btoa(binary);
    } catch {
      return text;
    }
  }

  return text;
}

export async function decompressText(data: string): Promise<string> {
  if (!data || !data.startsWith(COMPRESSED_PREFIX)) {
    return data;
  }

  if (typeof DecompressionStream !== 'undefined') {
    try {
      const rawBase64 = data.slice(COMPRESSED_PREFIX.length);
      const binary = atob(rawBase64);
      const uint8 = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        uint8[i] = binary.charCodeAt(i);
      }

      const stream = new Blob([uint8]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    } catch {
      return data;
    }
  }

  return data;
}
