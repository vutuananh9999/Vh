export interface JobAbortContext {
  jobId?: string;
  signal?: AbortSignal;
}

type JobContextProvider = () => JobAbortContext | undefined;

let serverJobContextProvider: JobContextProvider | null = null;

/**
 * Allows server-side job manager (Node AsyncLocalStorage) to expose the active
 * jobId & AbortSignal without importing Node-only modules into shared client bundles.
 */
export function registerServerJobContextProvider(provider: JobContextProvider | null): void {
  serverJobContextProvider = provider;
}

export function getActiveJobAbortContext(explicitSignal?: AbortSignal): JobAbortContext {
  let ctx: JobAbortContext | undefined;
  try {
    ctx = serverJobContextProvider?.();
  } catch {
    ctx = undefined;
  }
  return {
    jobId: ctx?.jobId,
    signal: explicitSignal || ctx?.signal
  };
}

export function createAbortError(message: string = 'Tác vụ AI đã được hủy bởi người dùng.'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  (err as any).code = 'ABORT_ERR';
  (err as any).errorCode = 'CANCELLED';
  return err;
}

export function isAbortError(err: any): boolean {
  if (!err) return false;
  if (err.name === 'AbortError' || err.code === 'ABORT_ERR' || err.errorCode === 'CANCELLED') {
    return true;
  }
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('đã hủy bởi người dùng') ||
    msg.includes('tác vụ đã được hủy') ||
    msg.includes('tác vụ đã bị hủy') ||
    msg.includes('cancelled by user') ||
    msg.includes('canceled by user') ||
    msg.includes('request was aborted') ||
    msg.includes('operation was aborted') ||
    msg.includes('this operation was aborted') ||
    msg.includes('aborterror')
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  const effectiveSignal = signal || getActiveJobAbortContext().signal;
  if (effectiveSignal?.aborted) {
    throw createAbortError();
  }
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  const effectiveSignal = signal || getActiveJobAbortContext().signal;
  if (effectiveSignal?.aborted) {
    return Promise.reject(createAbortError());
  }
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (effectiveSignal) {
        effectiveSignal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(createAbortError());
    };

    if (effectiveSignal) {
      effectiveSignal.addEventListener('abort', onAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, ms);
  });
}

export function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  const effectiveSignal = signal || getActiveJobAbortContext().signal;
  if (!effectiveSignal) {
    return promise;
  }
  if (effectiveSignal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(createAbortError());
    };

    effectiveSignal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      val => {
        effectiveSignal.removeEventListener('abort', onAbort);
        if (!settled) {
          settled = true;
          resolve(val);
        }
      },
      err => {
        effectiveSignal.removeEventListener('abort', onAbort);
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    );
  });
}
