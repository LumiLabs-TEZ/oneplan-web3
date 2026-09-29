-- CreateEnum
CREATE TYPE "oneplandb"."trip_end_request_status" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "oneplandb"."trip_end_vote_decision" AS ENUM ('APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "oneplandb"."TripMemberRole" AS ENUM ('HOST', 'CO_HOST', 'MEMBER');

-- CreateEnum
CREATE TYPE "oneplandb"."vault_status" AS ENUM ('ACTIVE', 'SETTLING', 'CLOSED');

-- CreateEnum
CREATE TYPE "oneplandb"."wallet_provider" AS ENUM ('PRIVY');

-- CreateEnum
CREATE TYPE "oneplandb"."vault_tx_kind" AS ENUM ('DEPOSIT', 'SPEND', 'REVERT', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "oneplandb"."vault_tx_source" AS ENUM ('VAULT', 'PERSONAL');

-- CreateEnum
CREATE TYPE "oneplandb"."vault_tx_status" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- AlterTable
ALTER TABLE "oneplandb"."trip_member" ADD COLUMN     "role" "oneplandb"."TripMemberRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "vault_leave_cleared_at" TIMESTAMPTZ(6),
ADD COLUMN     "vault_leave_request_net_micro" BIGINT,
ADD COLUMN     "vault_leave_requested_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "oneplandb"."vault_cash_settlement" (
    "id" SERIAL NOT NULL,
    "trip_vault_id" INTEGER NOT NULL,
    "from_user_id" INTEGER NOT NULL,
    "to_user_id" INTEGER NOT NULL,
    "amount_micro" BIGINT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_cash_settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oneplandb"."trip_end_request" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "requested_by" INTEGER NOT NULL,
    "status" "oneplandb"."trip_end_request_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "trip_end_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oneplandb"."trip_end_vote" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "decision" "oneplandb"."trip_end_vote_decision" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_end_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oneplandb"."trip_vault" (
    "id" SERIAL NOT NULL,
    "trip_id" INTEGER NOT NULL,
    "vault_pda" VARCHAR(64) NOT NULL,
    "usdc_ata" VARCHAR(64) NOT NULL,
    "threshold_micro" BIGINT NOT NULL,
    "daily_limit_micro" BIGINT NOT NULL,
    "status" "oneplandb"."vault_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oneplandb"."wallet_account" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "public_key" VARCHAR(64) NOT NULL,
    "provider" "oneplandb"."wallet_provider" NOT NULL DEFAULT 'PRIVY',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oneplandb"."vault_transaction" (
    "id" SERIAL NOT NULL,
    "trip_vault_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "kind" "oneplandb"."vault_tx_kind" NOT NULL,
    "source" "oneplandb"."vault_tx_source" NOT NULL DEFAULT 'VAULT',
    "status" "oneplandb"."vault_tx_status" NOT NULL DEFAULT 'PENDING',
    "amount_micro" BIGINT NOT NULL,
    "signature" VARCHAR(128),
    "payout_ref" VARCHAR(64),
    "payout_status" VARCHAR(32),
    "proposal_pda" VARCHAR(64),
    "approved_at" TIMESTAMP(3),
    "expense_id" INTEGER,
    "bank_bin" VARCHAR(16),
    "bank_account" VARCHAR(64),
    "amount_vnd" BIGINT,
    "failure_code" VARCHAR(64),
    "recipient_name" VARCHAR(255),
    "qr_payload" VARCHAR(512),
    "fee_micro" BIGINT,
    "rate" VARCHAR(32),
    "note" VARCHAR(255),
    "expense_name" VARCHAR(255),
    "expense_category" "oneplandb"."expense_category",
    "share_with_user_ids" INTEGER[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vault_cash_settlement_trip_vault_id_from_user_id_to_user_id_key" ON "oneplandb"."vault_cash_settlement"("trip_vault_id", "from_user_id", "to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_end_request_trip_id_key" ON "oneplandb"."trip_end_request"("trip_id");

-- CreateIndex
CREATE INDEX "trip_end_request_status_idx" ON "oneplandb"."trip_end_request"("status");

-- CreateIndex
CREATE INDEX "trip_end_vote_user_id_idx" ON "oneplandb"."trip_end_vote"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_end_vote_request_id_user_id_key" ON "oneplandb"."trip_end_vote"("request_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_vault_trip_id_key" ON "oneplandb"."trip_vault"("trip_id");

-- CreateIndex
CREATE INDEX "trip_vault_status_idx" ON "oneplandb"."trip_vault"("status");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_account_user_id_key" ON "oneplandb"."wallet_account"("user_id");

-- CreateIndex
CREATE INDEX "wallet_account_public_key_idx" ON "oneplandb"."wallet_account"("public_key");

-- CreateIndex
CREATE UNIQUE INDEX "vault_transaction_payout_ref_key" ON "oneplandb"."vault_transaction"("payout_ref");

-- CreateIndex
CREATE UNIQUE INDEX "vault_transaction_expense_id_key" ON "oneplandb"."vault_transaction"("expense_id");

-- CreateIndex
CREATE INDEX "vault_transaction_trip_vault_id_status_idx" ON "oneplandb"."vault_transaction"("trip_vault_id", "status");

-- CreateIndex
CREATE INDEX "vault_transaction_status_created_at_idx" ON "oneplandb"."vault_transaction"("status", "created_at");

-- AddForeignKey
ALTER TABLE "oneplandb"."vault_cash_settlement" ADD CONSTRAINT "vault_cash_settlement_trip_vault_id_fkey" FOREIGN KEY ("trip_vault_id") REFERENCES "oneplandb"."trip_vault"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."vault_cash_settlement" ADD CONSTRAINT "vault_cash_settlement_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "oneplandb"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."vault_cash_settlement" ADD CONSTRAINT "vault_cash_settlement_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "oneplandb"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."trip_end_request" ADD CONSTRAINT "trip_end_request_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "oneplandb"."trip"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."trip_end_request" ADD CONSTRAINT "trip_end_request_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "oneplandb"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."trip_end_vote" ADD CONSTRAINT "trip_end_vote_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "oneplandb"."trip_end_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."trip_end_vote" ADD CONSTRAINT "trip_end_vote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "oneplandb"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."trip_vault" ADD CONSTRAINT "trip_vault_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "oneplandb"."trip"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."wallet_account" ADD CONSTRAINT "wallet_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "oneplandb"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."vault_transaction" ADD CONSTRAINT "vault_transaction_trip_vault_id_fkey" FOREIGN KEY ("trip_vault_id") REFERENCES "oneplandb"."trip_vault"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."vault_transaction" ADD CONSTRAINT "vault_transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "oneplandb"."user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."vault_transaction" ADD CONSTRAINT "vault_transaction_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "oneplandb"."expense"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Backfill: trips created before this migration never had a HOST row. Vault
-- checks key on role=HOST (assertHost, approverUserIds, syncRoles) while the
-- leave/end-consensus code keys on trip.created_by_id; without this the two
-- disagree for every pre-existing trip the moment the feature is enabled.
UPDATE "oneplandb"."trip_member" tm
SET "role" = 'HOST'
FROM "oneplandb"."trip" t
WHERE t."id" = tm."trip_id" AND t."created_by_id" = tm."user_id";
