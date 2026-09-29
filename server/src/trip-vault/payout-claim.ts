/**
 * payoutStatus while one submit owns the fiat leg. The claim is an atomic
 * `updateMany ... WHERE payout_status IS NULL`, so parallel submits (or the
 * reconcile cron) cannot both pay the merchant and create the expense.
 */
export const PAYOUT_SENDING = 'SENDING';
