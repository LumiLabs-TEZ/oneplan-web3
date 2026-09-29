-- Extends `expense_category` from 5 to 14 values.
--
-- Purely ADDITIVE: the original five (FOOD, STAY, TICKET, TRANSPORT, OTHER) are
-- untouched, so no row is rewritten and no data is lost. This is deliberate —
-- iOS generates a CLOSED Swift enum from this list, so removing or renaming a
-- value would make every already-installed build fail to decode the entire
-- response body of any payload carrying a category.
--
-- `ALTER TYPE ... ADD VALUE` is allowed inside a transaction block on
-- PostgreSQL 12+ (this project runs postgres:16-alpine) as long as the new
-- values are not USED in the same transaction, which they are not here. That
-- avoids the create-new-type/swap dance used by
-- 20260319065331_rename_plane_to_transport — which was only needed because that
-- migration REMOVED a value — along with its table rewrites and its risk of
-- silently missing one of the four columns that reference this type
-- (expense, trip_plan_item, trip_plan_market_item, acquisition_item).

-- AlterEnum
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'COFFEE';
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'SPA';
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'GYM';
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'NIGHT_CLUB';
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'GROCERY';
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'SHOPPING';
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'CINEMA';
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'PHARMACY';
ALTER TYPE "oneplandb"."expense_category" ADD VALUE IF NOT EXISTS 'PARK';
