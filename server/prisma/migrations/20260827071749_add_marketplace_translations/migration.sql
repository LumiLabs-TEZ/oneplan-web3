-- CreateEnum
CREATE TYPE "oneplandb"."content_locale" AS ENUM ('en', 'vi');

-- AlterTable
ALTER TABLE "oneplandb"."marketplace_listing" ADD COLUMN     "source_locale" "oneplandb"."content_locale" NOT NULL DEFAULT 'vi';

-- CreateTable
CREATE TABLE "oneplandb"."marketplace_listing_translation" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "locale" "oneplandb"."content_locale" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_listing_translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oneplandb"."trip_plan_market_item_translation" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "locale" "oneplandb"."content_locale" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_plan_market_item_translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_listing_translation_listing_id_locale_key" ON "oneplandb"."marketplace_listing_translation"("listing_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "trip_plan_market_item_translation_item_id_locale_key" ON "oneplandb"."trip_plan_market_item_translation"("item_id", "locale");

-- AddForeignKey
ALTER TABLE "oneplandb"."marketplace_listing_translation" ADD CONSTRAINT "marketplace_listing_translation_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "oneplandb"."marketplace_listing"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oneplandb"."trip_plan_market_item_translation" ADD CONSTRAINT "trip_plan_market_item_translation_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "oneplandb"."trip_plan_market_item"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
