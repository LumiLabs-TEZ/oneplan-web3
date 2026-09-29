/**
 * Minimal Server-Sent Events frame parser over a byte stream.
 * Phase 0 ships the line framing needed for the spike; Phase 5 extends it
 * (envelope form `{type,data}`, watchdog, re-attach). Handles chunk boundaries,
 * CRLF/LF, multi-`data:` lines and comment/keepalive lines.
 */
export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export function createSseFrameParser(): {
  push: (chunk: string) => SseEvent[];
  flush: () => SseEvent[];
} {
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  let id: string | undefined;

  const dispatch = (): SseEvent | null => {
    if (data.length === 0) {
      event = 'message';
      return null;
    }
    const out: SseEvent = { event, data: data.join('\n'), ...(id ? { id } : {}) };
    event = 'message';
    data = [];
    return out;
  };

  const handleLine = (line: string): SseEvent | null => {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return null; // comment / keepalive
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        event = value;
        break;
      case 'data':
        data.push(value);
        break;
      case 'id':
        id = value;
        break;
      default:
        break; // retry / unknown fields ignored
    }
    return null;
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      const events: SseEvent[] = [];
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        const ev = handleLine(line);
        if (ev) events.push(ev);
      }
      return events;
    },
    flush() {
      const events: SseEvent[] = [];
      if (buffer.length > 0) {
        const ev = handleLine(buffer.replace(/\r$/, ''));
        buffer = '';
        if (ev) events.push(ev);
      }
      const last = dispatch();
      if (last) events.push(last);
      return events;
    },
  };
}

/** Async iteration over a ReadableStream of bytes → SSE events. */
export async function* readSseStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  onActivity?: () => void,
): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = createSseFrameParser();
  const onAbort = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done || signal?.aborted) break;
      onActivity?.();
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) yield ev;
    }
    if (signal?.aborted) return;
    for (const ev of parser.push(decoder.decode())) yield ev;
    for (const ev of parser.flush()) yield ev;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
