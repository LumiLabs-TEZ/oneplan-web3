-- Missions & Rewards (spark ⚡ ledger).
-- DDL-only: the new enum values must NOT be used (INSERT/UPDATE) in this same
-- migration — Postgres forbids using an enum value added in the current tx.

-- New analytics events (server-emitted BOARD_CREATED / MISSION_COMPLETED /
-- REWARD_REDEEMED; client-emitted MISSIONS_SHEET_VIEWED).
ALTER TYPE "oneplandb"."analytics_event_name" ADD VALUE 'BOARD_CREATED';
ALTER TYPE "oneplandb"."analytics_event_name" ADD VALUE 'MISSION_COMPLETED';
ALTER TYPE "oneplandb"."analytics_event_name" ADD VALUE 'REWARD_REDEEMED';
ALTER TYPE "oneplandb"."analytics_event_name" ADD VALUE 'MISSIONS_SHEET_VIEWED';

-- Who brought a member into a trip: the inviting member (inviteMembers) or the
-- trip creator (joinTrip-by-code). Drives friend_joined / invite_2 missions.
ALTER TABLE "oneplandb"."trip_member"
  ADD COLUMN "invited_by_id" INTEGER;

ALTER TABLE "oneplandb"."trip_member"
  ADD CONSTRAINT "trip_member_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "oneplandb"."user"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "trip_member_invited_by_id_idx"
  ON "oneplandb"."trip_member"("invited_by_id");

-- Earn side: one row per mission completion (append-only).
CREATE TABLE "oneplandb"."mission_completion" (
  "id"            SERIAL PRIMARY KEY,
  "user_id"       INTEGER NOT NULL,
  "mission_id"    VARCHAR(40) NOT NULL,
  "reward_amount" INTEGER NOT NULL,
  "external_ref"  VARCHAR(64),
  "period_key"    VARCHAR(16),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mission_completion_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "oneplandb"."user"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "mission_completion_reward_amount_check"
    CHECK ("reward_amount" > 0)
);

CREATE INDEX "mission_completion_user_id_idx"
  ON "oneplandb"."mission_completion"("user_id");
CREATE INDEX "mission_completion_user_id_mission_id_period_key_idx"
  ON "oneplandb"."mission_completion"("user_id", "mission_id", "period_key");

-- Idempotency. A plain unique over nullable external_ref would not dedupe
-- (Postgres treats NULLs as distinct), hence the two partial indexes:
--   one-time missions write external_ref = NULL,
--   per-entity/per-period missions write their dedup key into external_ref.
CREATE UNIQUE INDEX "mission_completion_once_key"
  ON "oneplandb"."mission_completion"("user_id", "mission_id")
  WHERE "external_ref" IS NULL;
CREATE UNIQUE INDEX "mission_completion_ref_key"
  ON "oneplandb"."mission_completion"("user_id", "mission_id", "external_ref")
  WHERE "external_ref" IS NOT NULL;

-- Spend side: one row per reward-shop redemption (append-only). Items repeat;
-- per-item caps (e.g. pro_7d 2/quarter) are enforced in code by counting rows
-- per period_key inside the per-user advisory-lock transaction.
CREATE TABLE "oneplandb"."reward_redemption" (
  "id"         SERIAL PRIMARY KEY,
  "user_id"    INTEGER NOT NULL,
  "item_id"    VARCHAR(32) NOT NULL,
  "price"      INTEGER NOT NULL,
  "listing_id" INTEGER,
  "period_key" VARCHAR(16),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reward_redemption_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "oneplandb"."user"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "reward_redemption_price_check"
    CHECK ("price" > 0)
);

CREATE INDEX "reward_redemption_user_id_idx"
  ON "oneplandb"."reward_redemption"("user_id");
CREATE INDEX "reward_redemption_user_id_item_id_period_key_idx"
  ON "oneplandb"."reward_redemption"("user_id", "item_id", "period_key");
