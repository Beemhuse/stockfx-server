import { dbUser, prisma } from "../db.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_ADMIN_EMAIL = "beemhuse@gmail.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_ADMIN_NAME = "System Administrator";

const getAdminEmail = () =>
  (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase().trim();

const getAdminPassword = () =>
  process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

const getAdminName = () => process.env.ADMIN_NAME || DEFAULT_ADMIN_NAME;

export const ensureSingleAdmin = async () => {
  const adminEmail = getAdminEmail();
  const adminPass = getAdminPassword();
  const adminName = getAdminName();

  try {
    console.log(`[INIT] Checking for admin user: ${adminEmail}`);

    let adminUser = await dbUser.findByEmail(adminEmail);
    let passwordHash = null;

    if (adminUser?.password_hash) {
      const passwordMatches = await bcrypt.compare(
        adminPass,
        adminUser.password_hash,
      );
      if (!passwordMatches) {
        passwordHash = await bcrypt.hash(adminPass, 10);
      }
    } else {
      passwordHash = await bcrypt.hash(adminPass, 10);
    }

    if (!adminUser) {
      adminUser = await dbUser.create(adminEmail, passwordHash, adminName, true);
      adminUser = await prisma.user.update({
        where: { id: adminUser.id },
        data: { is_verified: true },
      });
      console.log(`[INIT] Seeded default admin: ${adminEmail}`);
    } else {
      const updates = {};

      if (!adminUser.is_admin) {
        updates.is_admin = true;
      }
      if (!adminUser.is_verified) {
        updates.is_verified = true;
      }
      if (passwordHash) {
        updates.password_hash = passwordHash;
      }
      if (!adminUser.name) {
        updates.name = adminName;
      }

      if (Object.keys(updates).length > 0) {
        adminUser = await prisma.user.update({
          where: { id: adminUser.id },
          data: updates,
        });
      }

      if (updates.is_admin) {
        console.log(`[INIT] Promoted ${adminEmail} to admin`);
      }
      if (updates.password_hash) {
        console.log(`[INIT] Updated admin password for ${adminEmail}`);
      }
    }

    const demoted = await prisma.user.updateMany({
      where: {
        is_admin: true,
        email: { not: adminEmail },
      },
      data: { is_admin: false },
    });

    if (demoted.count > 0) {
      console.log(`[INIT] Demoted ${demoted.count} unauthorized admin(s)`);
    }
  } catch (err) {
    console.error("[INIT] Failed to enforce single admin policy:", err);
  }
};
