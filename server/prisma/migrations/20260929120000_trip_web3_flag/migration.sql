-- Per-trip web3 flag, fixed at creation. Existing trips that already have a
-- vault are web3 trips; everything else stays web2.
ALTER TABLE "trip" ADD COLUMN "web3" BOOLEAN NOT NULL DEFAULT false;

UPDATE "trip" SET "web3" = true
WHERE "id" IN (SELECT "trip_id" FROM "trip_vault");
