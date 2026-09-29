-- Adds an optional category to Budget, mirroring Expense.category.
--
-- Nullable with no default: budgets created before this column existed have no
-- category, and the field stays optional on create. Separate from the enum
-- migration so it can be rolled back independently.
--
-- Must run AFTER 20260721100000_extend_expense_category — it references the
-- extended type.

-- AlterTable
ALTER TABLE "oneplandb"."budget" ADD COLUMN "category" "oneplandb"."expense_category";
