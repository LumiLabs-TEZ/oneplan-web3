/**
 * Query-key factory. Keep keys hierarchical so `invalidateQueries(keys.trips.detail(id))`
 * clears every sub-resource of a trip.
 */
export const keys = {
  me: ['me'] as const,
  trips: {
    all: ['trips'] as const,
    list: (status?: string) => ['trips', 'list', { status }] as const,
    detail: (id: number) => ['trips', id] as const,
    budgets: (id: number) => ['trips', id, 'budgets'] as const,
    expenses: (id: number) => ['trips', id, 'expenses'] as const,
    expenseDetail: (tripId: number, id: number) => ['trips', tripId, 'expenses', id] as const,
    planItems: (id: number) => ['trips', id, 'plan-items'] as const,
    planItem: (tripId: number, id: number) => ['trips', tripId, 'plan-items', id] as const,
    /** Prefix for invalidating every date's route for a trip — always invalidate with this. */
    planRoutes: (id: number) => ['trips', id, 'plan-route'] as const,
    planRoute: (id: number, date: string) => ['trips', id, 'plan-route', date] as const,
    /** Planning-mode day (items keyed by `dayNumber`) — same prefix as `planRoutes`. */
    planRouteDay: (id: number, day: number) => ['trips', id, 'plan-route', 'day', day] as const,
    notes: (id: number) => ['trips', id, 'notes'] as const,
    photos: (id: number) => ['trips', id, 'photos'] as const,
    breakdown: (id: number) => ['trips', id, 'breakdown'] as const,
    settlements: (id: number) => ['trips', id, 'settlements'] as const,
    leavePreview: (id: number) => ['trips', id, 'leave-preview'] as const,
    pendingInvites: ['trips', 'invites', 'pending'] as const,
    invitePreview: (code: string) => ['trips', 'invite-preview', code] as const,
  },
  currencies: ['currencies'] as const,
  locations: {
    search: (q: string) => ['locations', 'search', q] as const,
  },
  recentLocations: ['me', 'recent-locations'] as const,
  places: {
    /** `bias` is "lat,lng" rounded to 3dp, or null when no bias is available. */
    search: (q: string, bias: string | null) => ['places', 'search', q, bias] as const,
    nearby: (bias: string) => ['places', 'nearby', bias] as const,
  },
  planStats: {
    locationCount: (name: string) => ['plan-items', 'location-count', name] as const,
  },
  uploads: {
    url: (objectKey: string) => ['uploads', 'url', objectKey] as const,
  },
  subscription: {
    status: ['subscription', 'status'] as const,
  },
  scanCredits: {
    balance: ['scan-credits', 'balance'] as const,
  },
  board: {
    all: ['board'] as const,
    detail: (id: number) => ['board', id] as const,
    extract: (sessionId: string) => ['board', 'extract', sessionId] as const,
  },
  market: {
    all: ['market'] as const,
    feed: (filters: Record<string, unknown>) => ['market', 'feed', filters] as const,
    listing: (id: number | string) => ['market', 'listing', String(id)] as const,
    applied: (id: number) => ['market', 'applied', id] as const,
    acquisition: (id: number) => ['market', 'acquisition', id] as const,
    creator: (userId: number) => ['market', 'creator', userId] as const,
    mine: ['market', 'mine'] as const,
    unlocked: ['market', 'unlocked'] as const,
  },
  friends: {
    all: ['friends'] as const,
    requests: ['friends', 'requests'] as const,
    preview: (code: string) => ['friends', 'preview', code] as const,
    profile: (userId: number) => ['friends', 'profile', userId] as const,
  },
  passport: (year: number | null) => ['me', 'passport', year] as const,
  health: ['health', 'live'] as const,
  missions: ['missions'] as const,
  exchangeRate: (from: string, to: string) => ['exchange-rate', from, to] as const,
  /** Server-decided web3 eligibility of this device's IP + web3-trip membership. */
  web3Eligibility: ['web3', 'eligibility'] as const,
  vault: {
    balance: (tripId: number) => ['vault', tripId, 'balance'] as const,
    myWallet: (tripId: number) => ['vault', tripId, 'my-wallet'] as const,
    history: (tripId: number) => ['vault', tripId, 'history'] as const,
    transaction: (tripId: number, id: number) => ['vault', tripId, 'transaction', id] as const,
    settlement: (tripId: number) => ['vault', tripId, 'settlement'] as const,
    /** Host-side pending vault-leave announcements (Wave E). */
    leaveRequests: (tripId: number) => ['vault', tripId, 'leave-requests'] as const,
    endRequest: (tripId: number) => ['vault', tripId, 'end-request'] as const,
    endReview: (tripId: number) => ['vault', tripId, 'end-request', 'review'] as const,
  },
  wallet: {
    balance: ['wallet', 'balance'] as const,
    history: ['wallet', 'history'] as const,
  },
} as const;
