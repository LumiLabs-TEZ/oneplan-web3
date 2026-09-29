import { ApiMutationError } from '@/api/mutationError';
import type { CreditError, ExtractedPin, ExtractionSession } from '@/features/board/types';
import { usePinExtractionStore as store } from './pinExtractionStore';
import { readSseStream, type SseEvent } from './sseParser';

export interface ExtractionTransport {
  start: (url: string) => Promise<string>;
  active: () => Promise<ExtractionSession | null>;
  snapshot: (id: string) => Promise<ExtractionSession>;
  cancel: (id: string) => Promise<void>;
  stream: (id: string, signal: AbortSignal) => Promise<Response>;
  enrich?: (pin: ExtractedPin, signal: AbortSignal) => Promise<ExtractedPin>;
  creditsChanged: () => void;
}
export function extractionEvent(frame: SseEvent): { type: string; data: unknown } | null {
  if (frame.event === 'keepalive') return null;
  try {
    const data: unknown = JSON.parse(frame.data);
    if (
      frame.event === 'message' &&
      data &&
      typeof data === 'object' &&
      'type' in data &&
      'data' in data &&
      typeof data.type === 'string'
    ) {
      return data.type === 'keepalive' ? null : { type: data.type, data: data.data };
    }
    return { type: frame.event, data };
  } catch {
    return null;
  }
}
const running = (session: ExtractionSession) =>
  session.status === 'QUEUED' || session.status === 'RUNNING';
/** One owner per authenticated app session. Generation checks also fence uncancellable HTTP work. */
export class PinExtractionClient {
  private generation = 0;
  private controller: AbortController | null = null;
  private enrichmentController: AbortController | null = null;
  private starting: number | null = null;
  private refreshing: number | null = null;
  constructor(private readonly transport: ExtractionTransport) {}

  detach() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.enrichmentController?.abort();
    this.enrichmentController = null;
    store.setState({ connecting: false });
  }
  reset() {
    this.detach();
    this.starting = null;
    this.refreshing = null;
    store.getState().reset();
  }

  async start(url: string) {
    if (this.starting !== null) return;
    this.detach();
    const generation = this.generation;
    this.starting = generation;
    store.setState({ connecting: true, error: null, creditError: null });
    try {
      let id: string;
      try {
        id = await this.transport.start(url);
      } catch (error) {
        const body = error instanceof ApiMutationError ? error.body : null;
        if (
          error instanceof ApiMutationError &&
          error.status === 409 &&
          body &&
          typeof body === 'object' &&
          'sessionId' in body &&
          typeof body.sessionId === 'string'
        )
          id = body.sessionId;
        else throw error;
      }
      if (generation !== this.generation) return;
      this.transport.creditsChanged();
      await this.attach(id);
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof ApiMutationError && error.status === 402) {
        const body = error.body;
        if (
          body &&
          typeof body === 'object' &&
          'available' in body &&
          typeof body.available === 'number'
        ) {
          store.setState({ creditError: body as CreditError });
        }
      }
      store.setState({ error: 'Failed to extract pins. Please try again.' });
    } finally {
      if (this.starting === generation) this.starting = null;
      if (generation === this.generation) store.setState({ connecting: false });
    }
  }
  async refresh() {
    if (this.starting !== null || this.refreshing !== null) return;
    const generation = this.generation;
    this.refreshing = generation;
    try {
      const session = await this.transport.active();
      if (generation !== this.generation) return;
      if (!session) {
        this.detach();
        store.getState().snapshot(null);
        return;
      }
      if (!running(session)) this.detach();
      store.getState().snapshot(session);
      if (running(session)) await this.attach(session.id);
      else this.enrichSnapshot(session, this.generation);
    } catch {
      if (generation === this.generation)
        store.setState({ error: 'Please check your connection and try again.' });
    } finally {
      if (this.refreshing === generation) this.refreshing = null;
    }
  }
  private enrichSnapshot(session: ExtractionSession, generation: number) {
    if (!this.transport.enrich) return;
    const controller = this.enrichmentController ?? new AbortController();
    this.enrichmentController = controller;
    const queue = session.pins.filter(
      (pin) => pin.latitude === undefined || pin.longitude === undefined,
    );
    const worker = async () => {
      while (queue.length && !controller.signal.aborted && generation === this.generation) {
        const pin = queue.shift()!;
        try {
          const enriched = await this.transport.enrich!(pin, controller.signal);
          const current = store.getState().session;
          if (
            !controller.signal.aborted &&
            generation === this.generation &&
            current?.id === session.id
          )
            store.getState().snapshot({ ...current, pins: [enriched] });
        } catch {
          /* Keep the original pin and unverified label. */
        }
      }
    };
    for (let index = 0; index < Math.min(3, queue.length); index++) void worker();
  }
  async attach(id: string) {
    this.detach();
    const generation = this.generation;
    store.setState({ connecting: true, error: null });
    try {
      const session = await this.transport.snapshot(id);
      if (generation !== this.generation) return;
      store.getState().snapshot(session);
      store.setState({ connecting: false });
      this.enrichSnapshot(session, generation);
      if (running(session)) void this.consume(id, generation);
    } catch {
      if (generation === this.generation)
        store.setState({ connecting: false, error: 'Please check your connection and try again.' });
    }
  }
  async cancel() {
    const id = store.getState().session?.id;
    if (!id) return;
    const generation = this.generation;
    await this.transport.cancel(id);
    if (generation === this.generation) this.reset();
  }
  private async consume(id: string, generation: number) {
    const deadline = Date.now() + 600_000;
    const enriched = new Set<number>();
    while (generation === this.generation && Date.now() < deadline) {
      const controller = new AbortController();
      this.controller = controller;
      let lastByte = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastByte >= 60_000 || Date.now() >= deadline) controller.abort();
      }, 1000);
      try {
        const response = await this.transport.stream(id, controller.signal);
        if (!response.ok || !response.body) throw new Error('stream unavailable');
        for await (const frame of readSseStream(response.body, controller.signal, () => {
          lastByte = Date.now();
        })) {
          if (generation !== this.generation) return;
          const event = extractionEvent(frame);
          const session = store.getState().session;
          if (!event || !session || session.id !== id) continue;
          if (event.type === 'done' || event.type === 'error') {
            const snapshot = await this.transport.snapshot(id);
            if (generation === this.generation) {
              store.getState().snapshot(snapshot);
              this.enrichSnapshot(snapshot, generation);
              this.transport.creditsChanged();
            }
            return;
          }
          const data = event.data;
          if (!data || typeof data !== 'object') continue;
          if (event.type === 'status' && 'phase' in data && typeof data.phase === 'string')
            store.getState().snapshot({ ...session, phase: data.phase, status: 'RUNNING' });
          if (event.type === 'video_meta')
            store.getState().snapshot({ ...session, videoMeta: data });
          if (
            event.type === 'pin' &&
            'index' in data &&
            Number.isInteger(data.index) &&
            'name' in data &&
            typeof data.name === 'string'
          ) {
            const pin = data as ExtractedPin;
            store.getState().snapshot({ ...session, pins: [pin] });
            if (this.transport.enrich && !enriched.has(pin.index)) {
              enriched.add(pin.index);
              void this.transport
                .enrich(pin, (this.enrichmentController ??= new AbortController()).signal)
                .then((result) => {
                  const current = store.getState().session;
                  if (
                    generation === this.generation &&
                    !this.enrichmentController?.signal.aborted &&
                    current?.id === id
                  )
                    store.getState().snapshot({ ...current, pins: [result] });
                })
                .catch(() => undefined);
            }
          }
        }
      } catch {
        /* Reconcile before reconnecting; never repeat POST /extract. */
      } finally {
        clearInterval(watchdog);
        controller.abort();
      }
      if (generation !== this.generation) return;
      try {
        const snapshot = await this.transport.snapshot(id);
        if (generation !== this.generation) return;
        store.getState().snapshot(snapshot);
        if (!running(snapshot)) {
          this.enrichSnapshot(snapshot, generation);
          this.transport.creditsChanged();
          return;
        }
      } catch {
        /* bounded retry below */
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (generation === this.generation)
      store.setState({ error: 'Please check your connection and try again.' });
  }
}
