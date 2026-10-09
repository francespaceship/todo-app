// Starts an in-memory MongoDB, the built Next app, then runs the Playwright suite.
import { execSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const APP_PORT = 3100;
const shell = process.platform === "win32";

function killAppPort() {
  if (!shell) return;
  // npx spawns grandchildren, so kill whatever still listens on the app port.
  try {
    const out = execSync(`netstat -ano | findstr :${APP_PORT}`, { encoding: "utf8" });
    const pids = new Set(
      out
        .split("\n")
        .filter((l) => l.includes("LISTENING"))
        .map((l) => l.trim().split(/\s+/).pop()),
    );
    for (const pid of pids) execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  } catch {}
}

killAppPort();
const mongod = await MongoMemoryServer.create({ instance: { port: 27099 } });
const uri = mongod.getUri("todo-e2e");

// Seed a user with two sessions (one is consumed by the logout test) so tests start logged in.
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const tokens = { E2E_SESSION_TOKEN: randomBytes(32).toString("hex"), E2E_LOGOUT_TOKEN: randomBytes(32).toString("hex") };
const seed = await mongoose.createConnection(uri).asPromise();
const { insertedId } = await seed.collection("users").insertOne({ githubId: 1, username: "e2e-user", avatarUrl: "" });
for (const token of Object.values(tokens)) {
  await seed
    .collection("sessions")
    .insertOne({ tokenHash: sha256(token), userId: insertedId, expiresAt: new Date(Date.now() + 3_600_000) });
}
await seed.close();

const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, MONGODB_URI: uri, APP_URL: `http://127.0.0.1:${APP_PORT}`, GITHUB_CLIENT_ID: "e2e-client-id", GITHUB_CLIENT_SECRET: "e2e-client-secret" },
  stdio: "inherit",
  shell,
});

async function waitForApp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/me`, { signal: AbortSignal.timeout(40000) });
      if (res.status === 401) return; // up, and correctly refusing anonymous requests
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("app did not start");
}

let code = 1;
try {
  await waitForApp();
  code = await new Promise((resolve) => {
    const pw = spawn("npx", ["playwright", "test"], {
      env: { ...process.env, ...tokens, BASE_URL: `http://127.0.0.1:${APP_PORT}` },
      stdio: "inherit",
      shell,
    });
    pw.on("exit", (c) => resolve(c ?? 1));
  });
} finally {
  killAppPort();
  if (!shell) app.kill();
  await mongod.stop();
}
process.exit(code);
