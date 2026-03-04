import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import bcrypt from "bcryptjs";
import { dbUser, dbUserAccount, prisma } from "../db.js";

if (!process.env.DATABASE_URL) {
  console.error("[SEED] Error: DATABASE_URL not found in .env");
  process.exit(1);
}

async function seedAdmin() {
  const email = process.argv[2] || "admin@example.com";
  const password = process.argv[3] || "admin123";
  const name = "System Administrator";

  console.log(`[SEED] Attempting to create admin: ${email}`);

  try {
    const existing = await dbUser.findByEmail(email);
    if (existing) {
      console.log(`[SEED] User ${email} already exists. Promoting to admin...`);
      await prisma.user.update({
        where: { id: existing.id },
        data: { is_admin: true },
      });
      console.log(`[SEED] Success! ${email} is now an admin.`);
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await dbUser.create(email, hash, name, true);
    await dbUserAccount.create(user.id, 999999);

    console.log(`[SEED] Success! Admin created:`);
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
  } catch (err) {
    console.error(`[SEED] Failed:`, err);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();
