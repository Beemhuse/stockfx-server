/**
 * Seeds/refreshes the single administrator account from the environment.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' node scripts/seed-admin.js
 *
 * Credentials are never hard-coded here - the server enforces the same policy
 * on boot via services/AdminInitService.js.
 */
import config from "../config.js";
import { prisma } from "../db.js";
import { ensureSingleAdmin } from "../services/AdminInitService.js";

if (!process.env.ADMIN_PASSWORD) {
  console.error(
    "[SEED] ADMIN_PASSWORD is not set. Set it in .env or pass it inline before running this script.",
  );
  process.exit(1);
}

try {
  await ensureSingleAdmin();
  console.log(`[SEED] Administrator is up to date: ${config.admin.email}`);
} catch (err) {
  console.error("[SEED] Failed:", err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
