/**
 * Error classification for UI: offline banner vs. timeout vs. HTTP vs. signed out.
 * Also the typed 402/409 bodies used by the Board flow.
 */
export type ApiErrorKind = 'offline' | 'timeout' | 'http' | 'auth_expired' | 'unknown';

export interface ClassifiedError {
  kind: ApiErrorKind;
  status?: number;
  message: string;
  body?: unknown;
}

export interface InsufficientScanCreditsBody {
  code: 'insufficient_scan_credits';
  message: string;
  available: number;
  nextProGrantAt: string | null;
  canPurchase: boolean;
}

export interface ExtractionInProgressBody {
  code: 'extraction_in_progress';
  sessionId: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function classifyError(
  input: unknown,
  response?: { status: number } | null,
): ClassifiedError {
  if (response) {
    if (response.status === 401) {
      return { kind: 'auth_expired', status: 401, message: 'Session expired', body: input };
    }
    const message =
      (isRecord(input) && typeof input.message === 'string' && input.message) ||
      `HTTP ${response.status}`;
    return { kind: 'http', status: response.status, message, body: input };
  }
  if (input instanceof Error) {
    const name = input.name.toLowerCase();
    const msg = input.message.toLowerCase();
    if (name === 'aborterror' || name === 'timeouterror' || msg.includes('timed out')) {
      return { kind: 'timeout', message: input.message };
    }
    if (
      msg.includes('network request failed') ||
      msg.includes('failed to fetch') ||
      msg.includes('offline')
    ) {
      return { kind: 'offline', message: input.message };
    }
    return { kind: 'unknown', message: input.message };
  }
  return { kind: 'unknown', message: String(input) };
}

export function isInsufficientCredits(
  status: number | undefined,
  body: unknown,
): body is InsufficientScanCreditsBody {
  return status === 402 && isRecord(body) && body.code === 'insufficient_scan_credits';
}

/** 409 from `POST /board/pins/extract`: attach to the running session. */
export function conflictSessionId(status: number | undefined, body: unknown): string | null {
  if (status !== 409 || !isRecord(body) || body.code !== 'extraction_in_progress') return null;
  return typeof body.sessionId === 'string' ? body.sessionId : null;
}
