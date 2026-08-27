-- AlterTable
ALTER TABLE "user_accounts" ADD COLUMN IF NOT EXISTS "active_trades" INTEGER DEFAULT 0;
