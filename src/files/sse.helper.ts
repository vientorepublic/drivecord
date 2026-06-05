import type { Response } from 'express';
import { SseEventType } from '../types';

/** Set SSE headers and flush to the client immediately. */
export function setupSseResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/** Write a single SSE data frame. No-ops if the response is already closed. */
export function writeSSE(res: Response, data: object): void {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

/**
 * Wire an AbortController to `res.on('close')`, run `handler`, then
 * send an SSE error event on failure and always close the response.
 *
 * `handler` receives:
 *  - `signal`  — AbortSignal to forward to async operations
 *  - `write`   — convenience wrapper around writeSSE
 */
export async function runSseHandler(
  res: Response,
  handler: (signal: AbortSignal, write: (data: object) => void) => Promise<void>,
): Promise<void> {
  const abortCtrl = new AbortController();
  const onClose = () => abortCtrl.abort();
  res.on('close', onClose);

  try {
    await handler(abortCtrl.signal, (data) => writeSSE(res, data));
  } catch (err) {
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    writeSSE(res, {
      type: SseEventType.Error,
      message: isAbort ? '취소됨' : err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.off('close', onClose);
    if (!res.writableEnded) res.end();
  }
}
