/**
 * Who is owed what when a trip vault is wound up.
 *
 * Everything here is integer micro-USDC. The vault ledger never leaves that
 * unit, so unlike the web2 breakdown there is no FX conversion and no rounding
 * to two decimal places to reason about.
 */

export interface SettlementInput {
  /** Accepted trip member user ids. */
  memberIds: number[];
  /** Confirmed deposits, by depositor. */
  depositsByUser: Map<number, bigint>;
  /** Confirmed spends: how much, and who agreed to share it. */
  spends: { amountMicro: bigint; shareWithUserIds: number[] }[];
  /** What the vault actually holds right now. */
  balanceMicro: bigint;
}

/** One cash debt between two people, settled outside the app. */
export interface CashDebt {
  fromUserId: number;
  toUserId: number;
  amountMicro: bigint;
}

/** One expense row under a cash-debt card; amounts always sum to the debt. */
export interface CashDebtLine {
  title: string;
  amountMicro: bigint;
}

export interface SettlementShare {
  userId: number;
  /** Positive: the group owes them. Negative: they owe the group. */
  netMicro: bigint;
  /** Paid from the vault on chain. Never negative. */
  onChainMicro: bigint;
  /** Left over once the vault is empty. Settled in cash. */
  offChainMicro: bigint;
}

/**
 * Splits an amount across members, giving the remainder to the earliest ids.
 *
 * Integer division alone loses up to n-1 micro-USDC per expense, and those
 * losses accumulate until the shares no longer add up to what was spent. The
 * vault invariant is exact, so the split has to be exact too.
 */
export function splitEvenly(
  amountMicro: bigint,
  userIds: number[],
): Map<number, bigint> {
  const out = new Map<number, bigint>();
  if (userIds.length === 0) {
    return out;
  }
  const count = BigInt(userIds.length);
  const base = amountMicro / count;
  let remainder = amountMicro - base * count;

  // Sorted so the same input always produces the same split, whoever asks.
  for (const userId of [...userIds].sort((a, b) => a - b)) {
    let share = base;
    if (remainder > 0n) {
      share += 1n;
      remainder -= 1n;
    }
    out.set(userId, share);
  }
  return out;
}

/**
 * Works out the settlement.
 *
 * The identity that makes this safe: the net positions always sum to the vault
 * balance, because every micro-USDC in the vault was deposited by someone and
 * every micro-USDC spent was shared by someone.
 *
 *     sum(net) = sum(deposits) - sum(spends) = balance
 *
 * So when somebody is short — typically a member with no crypto who never
 * deposited — the positive claims exceed the balance by exactly what that
 * person owes. Paying the balance out pro rata leaves each creditor short by
 * their portion of that debt, which is precisely what the debtor owes them.
 * Nothing is lost; it moves off chain.
 */
export function computeSettlement(input: SettlementInput): SettlementShare[] {
  const shareTotals = new Map<number, bigint>();
  for (const spend of input.spends) {
    // An empty share list means everyone, which is how the app records a
    // group expense.
    const participants =
      spend.shareWithUserIds.length > 0
        ? spend.shareWithUserIds
        : input.memberIds;
    for (const [userId, amount] of splitEvenly(
      spend.amountMicro,
      participants,
    )) {
      shareTotals.set(userId, (shareTotals.get(userId) ?? 0n) + amount);
    }
  }

  const nets = input.memberIds.map((userId) => ({
    userId,
    netMicro:
      (input.depositsByUser.get(userId) ?? 0n) -
      (shareTotals.get(userId) ?? 0n),
  }));

  const totalPositive = nets.reduce(
    (sum, entry) => (entry.netMicro > 0n ? sum + entry.netMicro : sum),
    0n,
  );

  // Nothing to distribute, or nobody is owed anything.
  if (totalPositive === 0n || input.balanceMicro === 0n) {
    return nets.map((entry) => ({
      userId: entry.userId,
      netMicro: entry.netMicro,
      onChainMicro: 0n,
      offChainMicro: entry.netMicro > 0n ? entry.netMicro : 0n,
    }));
  }

  // Cannot pay out more than the vault holds even if the ledger says otherwise;
  // the chain would reject it and the drift belongs in reconciliation, not here.
  const distributable =
    input.balanceMicro < totalPositive ? input.balanceMicro : totalPositive;

  const creditors = nets.filter((entry) => entry.netMicro > 0n);
  let allocated = 0n;
  const onChain = new Map<number, bigint>();

  creditors.forEach((entry, index) => {
    const isLast = index === creditors.length - 1;
    // The last creditor absorbs the rounding dust, so the payouts sum to
    // exactly `distributable` rather than one or two micro-USDC under it.
    const amount = isLast
      ? distributable - allocated
      : (entry.netMicro * distributable) / totalPositive;
    onChain.set(entry.userId, amount);
    allocated += amount;
  });

  return nets.map((entry) => {
    const paid = onChain.get(entry.userId) ?? 0n;
    return {
      userId: entry.userId,
      netMicro: entry.netMicro,
      onChainMicro: paid,
      offChainMicro: entry.netMicro > 0n ? entry.netMicro - paid : 0n,
    };
  });
}

/**
 * Turns net positions into concrete "A pays B" debts.
 *
 * The aggregate view says Carol owes fifty dollars, which is useless when she
 * actually has to hand cash to two different people. This pairs each debtor
 * against each creditor so every debt names both sides and can be confirmed on
 * its own.
 *
 * Largest against largest, which yields at most one transfer fewer than there
 * are participants. Sorted by amount then user id so the same ledger always
 * produces the same pairs, whoever asks and whenever: the debts are derived
 * rather than stored, so an unstable order would rename them between requests.
 */
export function cashDebts(shares: SettlementShare[]): CashDebt[] {
  const creditors = shares
    .filter((share) => share.offChainMicro > 0n)
    .map((share) => ({ userId: share.userId, remaining: share.offChainMicro }))
    .sort((a, b) =>
      a.remaining === b.remaining
        ? a.userId - b.userId
        : Number(b.remaining - a.remaining),
    );

  const debtors = shares
    .filter((share) => share.netMicro < 0n)
    .map((share) => ({ userId: share.userId, remaining: -share.netMicro }))
    .sort((a, b) =>
      a.remaining === b.remaining
        ? a.userId - b.userId
        : Number(b.remaining - a.remaining),
    );

  const debts: CashDebt[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount =
      creditor.remaining < debtor.remaining
        ? creditor.remaining
        : debtor.remaining;

    if (amount > 0n) {
      debts.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountMicro: amount,
      });
      creditor.remaining -= amount;
      debtor.remaining -= amount;
    }

    if (creditor.remaining === 0n) ci += 1;
    if (debtor.remaining === 0n) di += 1;
  }

  return debts;
}

/**
 * Breakdown under a cash-debt card so the line amounts sum to the debt.
 *
 * Uses the debtor's share of each spend as weights, then scales those weights
 * to the actual off-chain debt (deposits / vault payout already netted into
 * `amountMicro`). When the debtor has no spend share, a single "Settlement"
 * line carries the whole amount.
 */
export function cashDebtLines(
  debt: CashDebt,
  spends: {
    amountMicro: bigint;
    shareWithUserIds: number[];
    title: string | null;
  }[],
  memberIds: number[],
): CashDebtLine[] {
  const weights: { title: string; weight: bigint }[] = [];
  for (const spend of spends) {
    const participants =
      spend.shareWithUserIds.length > 0 ? spend.shareWithUserIds : memberIds;
    if (!participants.includes(debt.fromUserId)) {
      continue;
    }
    const share =
      splitEvenly(spend.amountMicro, participants).get(debt.fromUserId) ?? 0n;
    if (share <= 0n) {
      continue;
    }
    const title = spend.title?.trim() || 'Payment';
    weights.push({ title, weight: share });
  }

  const totalWeight = weights.reduce((sum, row) => sum + row.weight, 0n);
  if (totalWeight === 0n || weights.length === 0) {
    return [{ title: 'Settlement', amountMicro: debt.amountMicro }];
  }

  let allocated = 0n;
  const lines: CashDebtLine[] = [];
  weights.forEach((row, index) => {
    const isLast = index === weights.length - 1;
    const amount = isLast
      ? debt.amountMicro - allocated
      : (debt.amountMicro * row.weight) / totalWeight;
    allocated += amount;
    if (amount > 0n) {
      lines.push({ title: row.title, amountMicro: amount });
    }
  });
  return lines;
}
