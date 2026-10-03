/**
 * Create or reset an admin account.
 *   npm run admin:create -- <login> <role: owner|manager|waiter> [name]
 * The password is read from ADMIN_PASSWORD (never from argv, so it does not land in shell history).
 */
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { adminSessions, adminUsers, type AdminRole } from "@/lib/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/security/password";

async function main() {
  const [login, role = "manager", ...nameParts] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD;
  if (!login || !["owner", "manager", "waiter"].includes(role)) {
    throw new Error("usage: create-admin <login> <owner|manager|waiter> [name]");
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`set ADMIN_PASSWORD (≥ ${MIN_PASSWORD_LENGTH} chars)`);
  }
  const db = await getDb();
  const passwordHash = await hashPassword(password);
  const name = nameParts.join(" ") || login;
  const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.login, login));
  if (existing) {
    await db
      .update(adminUsers)
      .set({ passwordHash, role: role as AdminRole, isActive: true })
      .where(eq(adminUsers.id, existing.id));
    await db.delete(adminSessions).where(eq(adminSessions.userId, existing.id));
    console.log(`Updated ${login} (${role}); all their sessions were revoked`);
  } else {
    await db.insert(adminUsers).values({ login, name, passwordHash, role: role as AdminRole });
    console.log(`Created ${login} (${role})`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
