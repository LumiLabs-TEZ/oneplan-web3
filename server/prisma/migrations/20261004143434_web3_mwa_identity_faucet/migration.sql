-- AlterEnum
ALTER TYPE "wallet_provider" ADD VALUE 'MWA';

-- AlterTable
ALTER TABLE "wallet_account" ADD COLUMN     "seeker_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "seeker_genesis_mint" VARCHAR(64),
ADD COLUMN     "skr_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "skr_domain" VARCHAR(64);

-- CreateTable
CREATE TABLE "web3_faucet_claim" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount_micro" BIGINT NOT NULL,
    "signature" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web3_faucet_claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web3_faucet_claim_user_id_created_at_idx" ON "web3_faucet_claim"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "web3_faucet_claim" ADD CONSTRAINT "web3_faucet_claim_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
