-- CreateTable
CREATE TABLE "oneplandb"."mission_setting" (
    "key" VARCHAR(64) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mission_setting_pkey" PRIMARY KEY ("key")
);
