import type { Connection } from "mongoose";

const OWNED_COLLECTIONS = ["goals", "weeklyplans", "todos"] as const;
const NO_OWNER = { $or: [{ userId: { $exists: false } }, { userId: null }] };
const DAY_MS = 86_400_000;

export type MigrationResult = Record<(typeof OWNED_COLLECTIONS)[number], number> & { username: string };

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

/**
 * Assigns every goal, weekly plan and todo that has no owner to the given GitHub user.
 * Idempotent, and never reassigns documents that already have an owner. Aborts without
 * changing anything when the username is ambiguous or a legacy plan would overlap one
 * of the user's existing plans.
 */
export async function assignLegacyData(conn: Connection, username: string): Promise<MigrationResult> {
  const db = conn.db;
  if (!db) throw new Error("database connection is not open");

  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = await db
    .collection("users")
    .find({ username: { $regex: `^${escaped}$`, $options: "i" } })
    .limit(2)
    .toArray();
  if (matches.length === 0) {
    throw new Error(`user "${username}" not found: log in with GitHub once first, then run the migration again`);
  }
  if (matches.length > 1) {
    throw new Error(`username "${username}" matches more than one account; refusing to guess who owns the legacy data`);
  }
  const user = matches[0];

  const legacyPlans = await db.collection("weeklyplans").find(NO_OWNER).project({ startDate: 1, title: 1 }).toArray();
  if (legacyPlans.length > 0) {
    const mine = await db.collection("weeklyplans").find({ userId: user._id }).project({ startDate: 1 }).toArray();
    const conflicts = legacyPlans.filter((legacy) =>
      mine.some((m) => Math.abs(dayNumber(m.startDate) - dayNumber(legacy.startDate)) < 7),
    );
    if (conflicts.length > 0) {
      const list = conflicts.map((p) => `${p.title} (${p.startDate})`).join(", ");
      throw new Error(`legacy weekly plans overlap existing plans of this user: ${list}. Delete or move them, then rerun`);
    }
  }

  const result = { username: String(user.username) } as MigrationResult;
  for (const name of OWNED_COLLECTIONS) {
    const res = await db.collection(name).updateMany(NO_OWNER, { $set: { userId: user._id } });
    result[name] = res.modifiedCount;
  }
  return result;
}
