-- Admin-managed web3 allowlist: listed users are web3-eligible from any IP.
CREATE TABLE "web3_allowlist" (
    "user_id" INTEGER NOT NULL,
    "added_by_email" VARCHAR(255) NOT NULL,
    "note" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web3_allowlist_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "web3_allowlist_created_at_idx" ON "web3_allowlist"("created_at");

ALTER TABLE "web3_allowlist" ADD CONSTRAINT "web3_allowlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
