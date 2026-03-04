import { dbUser } from "../db.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

export const ensureSingleAdmin = async () => {
  const adminEmail = process.env.ADMIN_EMAIL || "beemhuse@gmail.com";
  // The default password is only used if the admin is being newly created
  const adminPass = process.env.ADMIN_PASSWORD || "admin123";

  try {
    // 1. Check if the target admin exists
    let adminUser = await dbUser.findByEmail(adminEmail);

    if (!adminUser) {
      // Create the admin user
      const hash = await bcrypt.hash(adminPass, 10);
      adminUser = await dbUser.create(adminEmail, hash, "System Administrator");

      // We must use prisma directly to set is_admin = true, since dbUser.create
      // does not set is_admin natively in the standard method
      await dbUser.prisma.user.update({
        where: { id: adminUser.id },
        data: { is_admin: true, is_verified: true },
      });
      console.log(`[INIT] Seeded default admin: ${adminEmail}`);
    } else if (!adminUser.is_admin) {
      // Promote to admin if not already
      await dbUser.prisma.user.update({
        where: { id: adminUser.id },
        data: { is_admin: true },
      });
      console.log(`[INIT] Promoted ${adminEmail} to admin`);
    }

    // 2. Demote any other admins
    const demoted = await dbUser.prisma.user.updateMany({
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
