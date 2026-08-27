import bcrypt from "bcryptjs";
import crypto from "crypto";
import config from "../config.js";
import { dbUser, dbUserAccount, prisma } from "../db.js";

/**
 * Enforces a single administrator account, defined entirely by environment
 * variables (ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME). Any other row that has
 * somehow acquired is_admin is demoted on boot.
 */
export const ensureSingleAdmin = async () => {
  const { email: adminEmail, password: adminPass, name: adminName } = config.admin;

  if (!adminPass && config.isProd) {
    throw new Error(
      "[INIT] ADMIN_PASSWORD must be set in production. Refusing to start.",
    );
  }

  try {
    let adminUser = await dbUser.findByEmail(adminEmail);
    let passwordHash = null;

    if (adminPass) {
      // An explicit ADMIN_PASSWORD is authoritative: keep the account in sync.
      const matches =
        adminUser?.password_hash &&
        (await bcrypt.compare(adminPass, adminUser.password_hash));
      if (!matches) passwordHash = await bcrypt.hash(adminPass, 12);
    } else if (!adminUser?.password_hash) {
      // No password configured and none stored: mint one rather than shipping
      // a guessable default, and print it once so it can be rotated.
      const generated = crypto.randomBytes(18).toString("base64url");
      passwordHash = await bcrypt.hash(generated, 12);
      console.warn(
        `[INIT] ADMIN_PASSWORD is not set. Generated a one-time admin password for ${adminEmail}: ${generated}`,
      );
    }

    if (!adminUser) {
      adminUser = await dbUser.create(adminEmail, passwordHash, adminName, true);
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { is_verified: true },
      });
      await dbUserAccount.ensure(adminUser.id);
      console.log(`[INIT] Seeded administrator ${adminEmail}`);
    } else {
      const updates = {};
      if (!adminUser.is_admin) updates.is_admin = true;
      if (!adminUser.is_verified) updates.is_verified = true;
      if (adminUser.status !== "active") updates.status = "active";
      if (passwordHash) updates.password_hash = passwordHash;
      if (!adminUser.name) updates.name = adminName;

      if (Object.keys(updates).length > 0) {
        await prisma.user.update({ where: { id: adminUser.id }, data: updates });
        if (updates.is_admin) console.log(`[INIT] Promoted ${adminEmail} to admin`);
        if (updates.password_hash)
          console.log(`[INIT] Refreshed the admin password from ADMIN_PASSWORD`);
      }
      await dbUserAccount.ensure(adminUser.id);
    }

    const demoted = await prisma.user.updateMany({
      where: { is_admin: true, email: { not: adminEmail } },
      data: { is_admin: false },
    });
    if (demoted.count > 0) {
      console.warn(`[INIT] Demoted ${demoted.count} unauthorised admin account(s)`);
    }
  } catch (err) {
    console.error("[INIT] Failed to enforce the single-admin policy:", err);
    throw err;
  }
};

export default ensureSingleAdmin;
