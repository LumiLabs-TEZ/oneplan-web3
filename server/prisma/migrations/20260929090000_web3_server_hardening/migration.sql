-- S7: one signed transaction is booked at most once. Partial (rows without a
-- signature yet are allowed); Prisma cannot express partial unique indexes, so
-- this is raw SQL and the schema only carries a comment.
CREATE UNIQUE INDEX "vault_transaction_signature_key"
  ON "oneplandb"."vault_transaction" ("signature")
  WHERE "signature" IS NOT NULL;

-- S12: a wallet public key belongs to one user.
DROP INDEX "oneplandb"."wallet_account_public_key_idx";
CREATE UNIQUE INDEX "wallet_account_public_key_key"
  ON "oneplandb"."wallet_account" ("public_key");

-- S9: ledger of built personal-wallet withdrawals (per-user minimum / daily cap).
CREATE TABLE "oneplandb"."wallet_withdrawal" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount_micro" BIGINT NOT NULL,
    "creates_recipient_account" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_withdrawal_user_id_created_at_idx"
  ON "oneplandb"."wallet_withdrawal" ("user_id", "created_at");

ALTER TABLE "oneplandb"."wallet_withdrawal"
  ADD CONSTRAINT "wallet_withdrawal_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "oneplandb"."user"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
