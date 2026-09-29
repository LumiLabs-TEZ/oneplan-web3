-- AlterTable
ALTER TABLE "oneplandb"."trip_plan_item" ADD COLUMN     "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
