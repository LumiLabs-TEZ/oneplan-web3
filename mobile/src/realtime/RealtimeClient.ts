import { nextDelayMs } from './backoff';
import { encodeEnvelope, isAuthFailure, parseEnvelope, type RealtimeEvent } from './envelope';

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'permanentlyDisconnected';

/** The slice of the WebSocket API this client uses (so tests can fake it). */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface RealtimeClientDeps {
  makeSocket: (url: string, headers: Record<string, string>) => WebSocketLike;
  /** Access token for the `Authorization` upgrade header; read on every connect. */
  getToken: () => string | null;
  /** One-shot token refresh; `true` when a fresh token is now in the token store. */
  refresh: () => Promise<boolean>;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout?: (handle: TimerHandle) => void;
  random?: () => number;
}

/** Grace period before a backgrounded app drops the socket (RealtimeService.swift). */
export const BACKGROUND_GRACE_MS = 30_000;

/**
 * Consecutive gateway auth rejections that end in `permanentlyDisconnected`
 * (the Nth rejection gives up rather than refreshing again).
 * `refresh()` can keep succeeding while the gateway keeps rejecting the token
 * (revoked session, clock skew, gateway misconfig), which would otherwise spin
 * connect → auth-fail → refresh → connect with no delay and no budget.
 */
export const MAX_AUTH_FAILURES = 3;

/**
 * Header-authenticated WebSocket client for `/realtime` (port of
 * `RealtimeService.swift` / `RealtimeService.kt`).
 *
 * Every socket gets a generation number; callbacks from a socket whose
 * generation is stale are dropped, so a superseded socket can never schedule a
 * second reconnect or flip the state back (RealtimeService.kt:415).
 */
export class RealtimeClient {
  private socket: WebSocketLike | null = null;
  private _state: ConnectionState = 'disconnected';
  private generation = 0;
  private attempts = 0;
  private reconnectTimer: TimerHandle | null = null;
  private graceTimer: TimerHandle | null = null;
  private online = true;
  private foreground = true;
  private refreshInFlight = false;
  /** Consecutive auth rejections; reset by a non-error envelope or an intentional disconnect. */
  private authFailures = 0;
  private readonly joinedTripIds = new Set<number>();
  private readonly stateListeners = new Set<(s: ConnectionState) => void>();
  private readonly eventListeners = new Set<(e: RealtimeEvent) => void>();
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;

  constructor(
    private readonly url: string,
    private readonly deps: RealtimeClientDeps,
  ) {
    this.setTimer = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimeout ?? ((handle) => clearTimeout(handle));
  }

  get state(): ConnectionState {
    return this._state;
  }

  onStateChange(cb: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(cb);
    return () => {
      this.stateListeners.delete(cb);
    };
  }

  onEvent(cb: (e: RealtimeEvent) => void): () => void {
    this.eventListeners.add(cb);
    return () => {
      this.eventListeners.delete(cb);
    };
  }

  /* ---------------------------------------------------------------- */
  /* Connection                                                        */
  /* ---------------------------------------------------------------- */

  connect(): void {
    if (this._state === 'connecting' || this._state === 'connected') return;
    if (this._state === 'permanentlyDisconnected') return; // use resetAndConnect()
    if (!this.online || !this.foreground) return;

    const token = this.deps.getToken();
    if (!token) return;

    this.cancelReconnect();
    const socket = this.deps.makeSocket(this.url, { Authorization: `Bearer ${token}` });
    const gen = ++this.generation;
    this.socket = socket;
    this.setState('connecting');

    socket.onopen = () => {
      if (gen !== this.generation) return;
      this.attempts = 0;
      this.setState('connected');
      this.replayRooms(socket);
    };
    socket.onmessage = (ev) => {
      if (gen !== this.generation) return;
      this.handleMessage(ev.data);
    };
    socket.onclose = () => {
      this.handleDrop(gen);
    };
    socket.onerror = () => {
      this.handleDrop(gen);
    };
  }

  /** Intentional teardown. Keeps `joinedTripIds` so a later connect re-joins. */
  disconnect(): void {
    this.cancelReconnect();
    this.cancelGrace();
    this.attempts = 0;
    this.authFailures = 0;
    this.closeSocket();
    this.setState('disconnected');
  }

  /**
   * Clears the give-up state and the attempt budget, then connects. Tears the
   * current socket down first — otherwise a second socket would join the same
   * rooms and the old one would keep delivering events (ghost connection).
   */
  resetAndConnect(): void {
    this.disconnect();
    this.connect();
  }

  /* ---------------------------------------------------------------- */
  /* Rooms                                                             */
  /* ---------------------------------------------------------------- */

  joinTripRoom(tripId: number): void {
    this.joinedTripIds.add(tripId);
    if (this._state === 'connected') this.send(encodeEnvelope('joinTrip', { tripId }));
  }

  leaveTripRoom(tripId: number): void {
    this.joinedTripIds.delete(tripId);
    if (this._state === 'connected') this.send(encodeEnvelope('leaveTrip', { tripId }));
  }

  /* ---------------------------------------------------------------- */
  /* Device state                                                      */
  /* ---------------------------------------------------------------- */

  setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    if (!online) {
      // Offline is not a failure: close quietly, keep the attempt budget intact.
      this.cancelReconnect();
      this.closeSocket();
      this.setState('disconnected');
      return;
    }
    this.attempts = 0;
    if (this._state === 'disconnected') this.connect();
  }

  setForeground(foreground: boolean): void {
    if (this.foreground === foreground) return;
    this.foreground = foreground;
    if (!foreground) {
      this.cancelGrace();
      this.graceTimer = this.setTimer(() => {
        this.graceTimer = null;
        this.cancelReconnect();
        this.closeSocket();
        this.setState('disconnected');
      }, BACKGROUND_GRACE_MS);
      return;
    }
    // Guard on the state, not on the grace timer: the socket may have dropped
    // *during* the grace window, in which case we are already disconnected and
    // a pending grace timer must not stop us from reconnecting.
    this.cancelGrace();
    if (this._state !== 'disconnected') return;
    this.attempts = 0;
    this.connect();
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    const event = parseEnvelope(data);
    if (!event) return;
    if (isAuthFailure(event)) {
      void this.handleAuthFailure();
      return;
    }
    // The server accepts the WebSocket upgrade before verifying the JWT
    // (connection.service.ts), so `onopen` always fires before an auth
    // rejection arrives as an envelope — it cannot be used to prove the
    // token was accepted. Any other envelope on an open socket does prove
    // it, so that's what resets the budget.
    this.authFailures = 0;
    for (const listener of this.eventListeners) listener(event);
  }

  /**
   * The server rejected our token. Refresh exactly once instead of looping:
   * on success reconnect immediately, on failure stop — the API middleware
   * signs the user out on its next 401.
   *
   * A refresh that keeps succeeding while the gateway keeps rejecting would
   * still loop forever, so consecutive rejections are budgeted by
   * `MAX_AUTH_FAILURES`; the budget is cleared by the first non-error
   * envelope on an open socket (proof the token was actually accepted — the
   * server accepts the upgrade before verifying the JWT, so `onopen` itself
   * cannot be used for this) or by an intentional `disconnect()`.
   */
  private async handleAuthFailure(): Promise<void> {
    if (this.refreshInFlight) return;
    if (++this.authFailures >= MAX_AUTH_FAILURES) {
      this.cancelReconnect();
      this.closeSocket();
      this.setState('permanentlyDisconnected');
      return;
    }
    this.refreshInFlight = true;
    this.cancelReconnect();
    this.closeSocket();
    this.setState('disconnected');
    const gen = this.generation;

    let ok = false;
    try {
      ok = await this.deps.refresh();
    } catch {
      ok = false;
    }
    this.refreshInFlight = false;
    if (gen !== this.generation) return; // superseded while refreshing
    if (ok) {
      this.attempts = 0;
      this.connect();
    } else {
      this.setState('permanentlyDisconnected');
    }
  }

  private handleDrop(gen: number): void {
    if (gen !== this.generation) return; // stale socket
    // RN fires `onerror` and then `onclose` for the same socket: close it here
    // (which bumps the generation) so the second callback is stale and we only
    // burn one attempt / schedule one timer.
    this.closeSocket();
    this.cancelReconnect();
    if (this._state === 'permanentlyDisconnected') return;
    if (!this.online || !this.foreground) {
      this.setState('disconnected');
      return;
    }
    const delay = nextDelayMs(++this.attempts, this.deps.random ?? Math.random);
    if (delay === null) {
      this.setState('permanentlyDisconnected');
      return;
    }
    this.setState('disconnected');
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private replayRooms(socket: WebSocketLike): void {
    for (const tripId of this.joinedTripIds) {
      try {
        socket.send(encodeEnvelope('joinTrip', { tripId }));
      } catch {
        // a send failure surfaces as onclose/onerror
      }
    }
  }

  private send(payload: string): void {
    try {
      this.socket?.send(payload);
    } catch {
      // ignored — the socket will report the drop
    }
  }

  /** Closes the current socket and invalidates its callbacks. */
  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.generation++;
    if (!socket) return;
    try {
      socket.close();
    } catch {
      // already gone
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer === null) return;
    this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private cancelGrace(): void {
    if (this.graceTimer === null) return;
    this.clearTimer(this.graceTimer);
    this.graceTimer = null;
  }

  private setState(next: ConnectionState): void {
    if (this._state === next) return;
    this._state = next;
    for (const listener of this.stateListeners) listener(next);
  }
}
