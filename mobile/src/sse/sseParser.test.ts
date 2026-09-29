import { createSseFrameParser, readSseStream } from './sseParser';

describe('createSseFrameParser', () => {
  it('parses a simple event', () => {
    const p = createSseFrameParser();
    expect(p.push('event: status\ndata: {"phase":"downloading"}\n\n')).toEqual([
      { event: 'status', data: '{"phase":"downloading"}' },
    ]);
  });

  it('handles chunk boundaries mid-line and CRLF', () => {
    const p = createSseFrameParser();
    expect(p.push('event: pi')).toEqual([]);
    expect(p.push('n\r\ndata: {"id"')).toEqual([]);
    expect(p.push(':1}\r\n\r\n')).toEqual([{ event: 'pin', data: '{"id":1}' }]);
  });

  it('joins multi-data lines and keeps id', () => {
    const p = createSseFrameParser();
    expect(p.push('id: 7\ndata: a\ndata: b\n\n')).toEqual([
      { event: 'message', data: 'a\nb', id: '7' },
    ]);
  });

  it('ignores comments/keepalive and blank frames', () => {
    const p = createSseFrameParser();
    expect(p.push(': keepalive\n\n\n\n')).toEqual([]);
    expect(p.push('event: keepalive\ndata: {}\n\n')).toEqual([{ event: 'keepalive', data: '{}' }]);
  });

  it('flush emits a trailing frame without final blank line', () => {
    const p = createSseFrameParser();
    expect(p.push('event: done\ndata: x')).toEqual([]);
    expect(p.flush()).toEqual([{ event: 'done', data: 'x' }]);
  });
});

describe('readSseStream', () => {
  it('iterates events from a byte stream split arbitrarily', async () => {
    const enc = new TextEncoder();
    const chunks = ['event: status\nda', 'ta: 1\n\nevent: pin\ndata: {"n":', '2}\n\n'];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
    const events = [];
    for await (const ev of readSseStream(stream)) events.push(ev);
    expect(events).toEqual([
      { event: 'status', data: '1' },
      { event: 'pin', data: '{"n":2}' },
    ]);
  });
});
