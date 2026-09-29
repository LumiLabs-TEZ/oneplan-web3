/** @jest-environment node */
import {
  MAX_AUTH_FAILURES,
  RealtimeClient,
  type ConnectionState,
  type WebSocketLike,
} from './RealtimeClient';

class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;

  readonly sent: string[] = [];
  closeCount = 0;

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCount += 1;
  }

  /* --- test drivers --- */
  open(): void {
    this.onopen?.();
  }

  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  fireClose(): void {
    this.onclose?.();
  }

  fireError(): void {
    this.onerror?.({});
  }
}

const URL = 'wss://api.test/realtime';

function makeClient(
  over: Partial<{ refresh: () => Promise<boolean>; token: string | null }> = {},
) {
  const refresh = jest.fn(over.refresh ?? (async () => true));
  const states: ConnectionState[] = [];
  const client = new RealtimeClient(URL, {
    makeSocket: (url, headers) => new FakeSocket(url, headers),
    getToken: () => (over.token === undefined ? 'tok' : over.token),
    refresh,
    random: () => 0.5,
  });
  client.onStateChange((s) => states.push(s));
  return { client, refresh, states };
}

function socket(i: number): FakeSocket {
  const instance = FakeSocket.instances[i];
  if (!instance) throw new Error(`no socket at index ${i}`);
  return instance;
}

const last = (): FakeSocket => socket(FakeSocket.instances.length - 1);

const AUTH_FAILURE = { event: 'error', data: { message: 'Authentication failed' } };

beforeEach(() => {
  FakeSocket.instances = [];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('RealtimeClient connect lifecycle', () => {
  it('is `connected` only after onopen fires', () => {
    const { client } = makeClient();
    client.connect();

    expect(client.state).toBe('connecting');
    expect(FakeSocket.instances).toHaveLength(1);
    expect(socket(0).headers).toEqual({ Authorization: 'Bearer tok' });

    socket(0).open();
    expect(client.state).toBe('connected');
  });

  it('does nothing when there is no token', () => {
    const { client } = makeClient({ token: null });
    client.connect();
    expect(FakeSocket.instances).toHaveLength(0);
    expect(client.state).toBe('disconnected');
  });

  it('is a no-op while connecting or connected', () => {
    const { client } = makeClient();
    client.connect();
    client.connect();
    expect(FakeSocket.instances).toHaveLength(1);
    socket(0).open();
    client.connect();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('emits parsed events and ignores unparseable frames', () => {
    const { client } = makeClient();
    const events: unknown[] = [];
    client.onEvent((e) => events.push(e));
    client.connect();
    socket(0).open();

    socket(0).onmessage?.({ data: 'not json' });
    socket(0).message({ event: 'tripEnded', data: { tripId: 7 } });

    expect(events).toEqual([{ event: 'tripEnded', data: { tripId: 7 } }]);
  });
});

describe('RealtimeClient rooms', () => {
  it('replays joins made before open, once, after open', () => {
    const { client } = makeClient();
    client.joinTripRoom(3);
    client.joinTripRoom(3);
    client.connect();
    expect(socket(0).sent).toEqual([]);

    socket(0).open();
    expect(socket(0).sent).toEqual([JSON.stringify({ event: 'joinTrip', data: { tripId: 3 } })]);
  });

  it('sends immediately when already open and replays after reconnect', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();
    client.joinTripRoom(5);
    expect(socket(0).sent).toEqual([JSON.stringify({ event: 'joinTrip', data: { tripId: 5 } })]);

    socket(0).fireClose();
    jest.advanceTimersByTime(60_000);
    last().open();
    expect(last().sent).toEqual([JSON.stringify({ event: 'joinTrip', data: { tripId: 5 } })]);
  });

  it('leaveTripRoom sends a leave frame and stops replaying', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();
    client.joinTripRoom(5);
    client.leaveTripRoom(5);
    expect(socket(0).sent[1]).toBe(JSON.stringify({ event: 'leaveTrip', data: { tripId: 5 } }));

    socket(0).fireClose();
    jest.advanceTimersByTime(60_000);
    last().open();
    expect(last().sent).toEqual([]);
  });
});

describe('RealtimeClient reconnect backoff', () => {
  it('reconnects after the backoff delay on an unintentional close', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();
    socket(0).fireClose();

    expect(client.state).toBe('disconnected');
    expect(FakeSocket.instances).toHaveLength(1);
    jest.advanceTimersByTime(1999);
    expect(FakeSocket.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('gives up with permanentlyDisconnected once the attempt budget is exhausted', () => {
    const { client } = makeClient();
    client.connect();
    for (let i = 0; i < 11; i++) {
      last().fireClose();
      jest.advanceTimersByTime(60_000);
    }
    expect(client.state).toBe('permanentlyDisconnected');
    expect(FakeSocket.instances).toHaveLength(11);

    // No further sockets, ever.
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(11);
  });

  it('resetAndConnect revives a permanently disconnected client', () => {
    const { client } = makeClient();
    client.connect();
    for (let i = 0; i < 11; i++) {
      last().fireClose();
      jest.advanceTimersByTime(60_000);
    }
    expect(client.state).toBe('permanentlyDisconnected');

    client.resetAndConnect();
    expect(client.state).toBe('connecting');
    expect(FakeSocket.instances).toHaveLength(12);
  });

  it('resetAndConnect closes the live socket and notifies state subscribers', () => {
    const { client, states } = makeClient();
    client.connect();
    socket(0).open();
    states.length = 0;

    client.resetAndConnect();

    expect(socket(0).closeCount).toBe(1);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(states).toEqual(['disconnected', 'connecting']);
    // The superseded socket can neither reconnect nor flip the state back.
    socket(0).fireClose();
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('ignores a close from a superseded socket (no second reconnect)', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();
    socket(0).fireClose();
    jest.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2);

    socket(0).fireClose(); // stale
    socket(0).fireError(); // stale
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(client.state).toBe('connecting');
  });

  it('treats onerror + onclose from the same socket as a single drop', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();

    // RN fires both for one failure.
    socket(0).fireError();
    socket(0).fireClose();

    expect(socket(0).closeCount).toBe(1); // the errored socket is closed
    jest.advanceTimersByTime(2000); // attempt 1 delay only
    expect(FakeSocket.instances).toHaveLength(2);
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(2); // no orphaned second timer
  });

  it('disconnect() cancels the single timer scheduled by onerror + onclose', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();
    socket(0).fireError();
    socket(0).fireClose();

    client.disconnect();
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(client.state).toBe('disconnected');
  });

  it('an intentional disconnect does not schedule a reconnect', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();
    client.disconnect();

    expect(client.state).toBe('disconnected');
    expect(socket(0).closeCount).toBe(1);
    socket(0).fireClose();
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('RealtimeClient auth failure', () => {
  it('refreshes once and reconnects on success', async () => {
    const { client, refresh } = makeClient({ refresh: async () => true });
    client.connect();
    socket(0).open();

    socket(0).message(AUTH_FAILURE);
    socket(0).message(AUTH_FAILURE); // must not start a second refresh
    await Promise.resolve();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(socket(0).closeCount).toBe(1);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(client.state).toBe('connecting');
  });

  it('goes permanentlyDisconnected when the refresh fails', async () => {
    const { client, refresh } = makeClient({ refresh: async () => false });
    client.connect();
    socket(0).open();
    socket(0).message(AUTH_FAILURE);
    await Promise.resolve();
    await Promise.resolve();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(client.state).toBe('permanentlyDisconnected');
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('gives up after MAX_AUTH_FAILURES rejections even when refresh keeps succeeding', async () => {
    const { client, refresh } = makeClient({ refresh: async () => true });
    client.connect();

    // A real WebSocket always opens before any envelope arrives, so the
    // server's accept-then-verify order (connection.service.ts) means the
    // auth-failure envelope always follows `onopen` in production. Rejections
    // 1 and 2 refresh + reconnect; the 3rd exhausts the budget.
    for (let i = 0; i < MAX_AUTH_FAILURES; i += 1) {
      last().open();
      last().message(AUTH_FAILURE);
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(refresh).toHaveBeenCalledTimes(MAX_AUTH_FAILURES - 1);
    expect(client.state).toBe('permanentlyDisconnected');
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(MAX_AUTH_FAILURES); // no socket for the give-up
  });

  it('resets the auth-failure budget on a normal envelope received on an open socket', async () => {
    const { client, refresh } = makeClient({ refresh: async () => true });
    client.connect();

    for (let i = 0; i < MAX_AUTH_FAILURES - 1; i += 1) {
      last().open();
      last().message(AUTH_FAILURE);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(client.state).toBe('connecting');

    last().open();
    // `onopen` alone cannot prove the auth was accepted (see above); a normal
    // envelope on the open socket does, and clears the count.
    last().message({ event: 'tripEnded', data: { tripId: 1 } });
    expect(client.state).toBe('connected');

    // A fresh run of rejections is tolerated again.
    for (let i = 0; i < MAX_AUTH_FAILURES - 1; i += 1) {
      last().open();
      last().message(AUTH_FAILURE);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(refresh).toHaveBeenCalledTimes((MAX_AUTH_FAILURES - 1) * 2);
    expect(client.state).toBe('connecting');
  });

  it('does not emit the auth-failure envelope to subscribers', async () => {
    const { client } = makeClient();
    const events: unknown[] = [];
    client.onEvent((e) => events.push(e));
    client.connect();
    socket(0).open();
    socket(0).message(AUTH_FAILURE);
    await Promise.resolve();
    expect(events).toEqual([]);
  });
});

describe('RealtimeClient online state', () => {
  it('setOnline(false) closes without scheduling a reconnect or burning an attempt', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();

    client.setOnline(false);
    expect(client.state).toBe('disconnected');
    expect(socket(0).closeCount).toBe(1);
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(1);

    client.setOnline(true);
    expect(FakeSocket.instances).toHaveLength(2);
    // Attempt budget was not consumed: the first retry delay is still the base one.
    last().fireClose();
    jest.advanceTimersByTime(2000);
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('a close while offline does not schedule a reconnect', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();
    client.setOnline(false);
    socket(0).fireClose();
    jest.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe('RealtimeClient foreground grace', () => {
  it('disconnects 30 s after backgrounding', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();

    client.setForeground(false);
    jest.advanceTimersByTime(29_999);
    expect(client.state).toBe('connected');
    expect(socket(0).closeCount).toBe(0);

    jest.advanceTimersByTime(1);
    expect(client.state).toBe('disconnected');
    expect(socket(0).closeCount).toBe(1);
  });

  it('returning to the foreground within the grace window cancels the disconnect', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();

    client.setForeground(false);
    jest.advanceTimersByTime(10_000);
    client.setForeground(true);
    jest.advanceTimersByTime(600_000);

    expect(client.state).toBe('connected');
    expect(socket(0).closeCount).toBe(0);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('reconnects on foreground when the socket dropped during the grace window', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();

    client.setForeground(false);
    jest.advanceTimersByTime(5_000);
    socket(0).fireClose(); // dropped while backgrounded — nothing is scheduled
    expect(client.state).toBe('disconnected');
    jest.advanceTimersByTime(5_000);
    expect(FakeSocket.instances).toHaveLength(1);

    client.setForeground(true); // at t=10 s, grace timer still pending
    expect(FakeSocket.instances).toHaveLength(2);
    expect(client.state).toBe('connecting');
    jest.advanceTimersByTime(600_000); // the cancelled grace never fires
    expect(client.state).toBe('connecting');
  });

  it('reconnects when returning to the foreground after the grace disconnect', () => {
    const { client } = makeClient();
    client.connect();
    socket(0).open();

    client.setForeground(false);
    jest.advanceTimersByTime(30_000);
    expect(client.state).toBe('disconnected');

    client.setForeground(true);
    expect(client.state).toBe('connecting');
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
