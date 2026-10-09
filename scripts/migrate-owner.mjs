// Usage: npm run migrate:owner -- <github-username>
// Assigns goals, weekly plans and todos that have no userId to that user.
import mongoose from "mongoose";
import { assignLegacyData } from "../src/lib/migrate.ts";

const username = process.argv[2];
const uri = process.env.MONGODB_URI;
if (!username || !uri) {
  console.error("Usage: MONGODB_URI=<uri> npm run migrate:owner -- <github-username>");
  process.exit(1);
}

try {
  await mongoose.connect(uri);
  const r = await assignLegacyData(mongoose.connection, username);
  console.log(`Assigned to ${r.username}: ${r.goals} goals, ${r.weeklyplans} weekly plans, ${r.todos} todos`);
} catch (err) {
  console.error(`Migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
