import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { isCapacitorNative } from './iosNativeBridge.ts';

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) return record;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => {
      record[k] = v;
    });
    return record;
  }
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) {
      record[k] = v;
    }
    return record;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === 'string') {
      record[k] = v;
    }
  }
  return record;
}

function buildResponseFromCapacitor(res: HttpResponse): Response {
  const rawData =
    typeof res.data === 'string'
      ? res.data
      : res.data === undefined || res.data === null
      ? ''
      : JSON.stringify(res.data);

  const respHeaders = new Headers();
  if (res.headers && typeof res.headers === 'object') {
    for (const [k, v] of Object.entries(res.headers)) {
      if (typeof v === 'string') {
        respHeaders.set(k, v);
      }
    }
  }
  respHeaders.set('x-aetheria-native-http', '1');

  const status = typeof res.status === 'number' && res.status >= 200 ? res.status : 500;
  return new Response(rawData, {
    status,
    headers: respHeaders
  });
}

/**
 * Uses standard `fetch` first (preserving real ReadableStream SSE streaming),
 * and on native Capacitor iOS automatically falls back to `CapacitorHttp` (URLSession)
 * whenever WKWebView CORS blocks a third-party AI API or local LAN HTTP endpoint.
 */
export async function nativeAwareFetch(
  url: string,
  init: RequestInit = {},
  options: { preferNative?: boolean } = {}
): Promise<Response> {
  const native = isCapacitorNative();

  if (native && options.preferNative) {
    if (init.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const headers = headersToRecord(init.headers);
    let data: any = undefined;
    if (typeof init.body === 'string') {
      try {
        data = JSON.parse(init.body);
      } catch {
        data = init.body;
      }
    }
    const res = await CapacitorHttp.request({
      url,
      method: (init.method || 'GET').toUpperCase(),
      headers,
      data,
      responseType: 'text'
    });
    return buildResponseFromCapacitor(res);
  }

  try {
    return await fetch(url, init);
  } catch (err: any) {
    if (!native) throw err;
    if (err?.name === 'AbortError' || init.signal?.aborted) throw err;

    // CORS / network failure inside WKWebView -> execute natively via iOS URLSession
    const headers = headersToRecord(init.headers);
    let data: any = undefined;
    if (typeof init.body === 'string') {
      try {
        data = JSON.parse(init.body);
      } catch {
        data = init.body;
      }
    }

    const res = await CapacitorHttp.request({
      url,
      method: (init.method || 'GET').toUpperCase(),
      headers,
      data,
      responseType: 'text'
    });
    return buildResponseFromCapacitor(res);
  }
}
