-- AlterTable
ALTER TABLE "oneplandb"."marketplace_acquisition" ADD COLUMN     "snapshot_source_updated_at" TIMESTAMPTZ(6);

-- Backfill: every pre-existing snapshot is considered current as of acquisition,
-- so listings edited after the acquisition are refreshed on next use.
UPDATE "oneplandb"."marketplace_acquisition" SET "snapshot_source_updated_at" = "acquired_at";
