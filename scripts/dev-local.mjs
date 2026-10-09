// Local dev without an installed MongoDB: runs a persistent mongod (data in .data/mongo) plus `next dev`.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";

const dbPath = ".data/mongo";
mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: { port: 27018, dbPath, storageEngine: "wiredTiger" },
});
const uri = mongod.getUri("todo");
console.log(`MongoDB: ${uri}`);

const app = spawn("npx", ["next", "dev", "-p", "3000"], {
  // DEV_AUTH_BYPASS skips GitHub login on localhost only (see docs/AUTH.md); it is ignored in production.
  env: { ...process.env, MONGODB_URI: process.env.MONGODB_URI ?? uri, DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS ?? "1" },
  stdio: "inherit",
  shell: process.platform === "win32",
});

const shutdown = async () => {
  await mongod.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
app.on("exit", shutdown);
