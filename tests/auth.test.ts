import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { GET as startLogin } from "@/app/auth/github/route";
import { GET as callback } from "@/app/auth/github/callback/route";
import { POST as logout } from "@/app/auth/logout/route";
import { GET as me } from "@/app/api/me/route";
import { assignLegacyData } from "@/lib/migrate";
import { Goal, Session, Todo, User, WeeklyPlan } from "@/models";

let mongod: MongoMemoryServer;
const ORIGIN = "http://localhost:3000";

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("auth-test");
  process.env.GITHUB_CLIENT_ID = "test-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
  process.env.APP_URL = ORIGIN;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  await mongoose.connection.dropDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env.GITHUB_CLIENT_ID = "test-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
});

type Profile = { id: number; login: string; avatar_url: string };

function mockGithub(profile: Profile | null, token: string | null = "gho_token") {
  const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") {
      return Response.json(token ? { access_token: token } : { error: "bad_verification_code" });
    }
    if (url === "https://api.github.com/user") {
      return profile ? Response.json(profile) : Response.json({ message: "Bad credentials" }, { status: 401 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callbackReq = (query: string, cookie?: string) =>
  new Request(`${ORIGIN}/auth/github/callback?${query}`, { headers: cookie ? { cookie } : {} });

const cookieValue = (res: Response, name: string) => {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return line?.split(";")[0].slice(name.length + 1);
};

async function loginAs(profile: Profile) {
  mockGithub(profile);
  const res = await callback(callbackReq("code=abc&state=s1", "oauth_state=s1"));
  return { res, token: cookieValue(res, "session") };
}

describe("GET /auth/github", () => {
  it("redirects to GitHub with client_id, redirect_uri and a random state cookie", async () => {
    const res = await startLogin(new Request(`${ORIGIN}/auth/github`));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/github/callback`);
    const state = location.searchParams.get("state")!;
    expect(state).toHaveLength(32);
    expect(cookieValue(res, "oauth_state")).toBe(state);
    expect(res.headers.getSetCookie().find((c) => c.startsWith("oauth_state="))).toMatch(/HttpOnly/i);
    expect(location.toString()).not.toContain("test-client-secret");
  });

  it("uses a fresh state every time", async () => {
    const a = await startLogin(new Request(`${ORIGIN}/auth/github`));
    const b = await startLogin(new Request(`${ORIGIN}/auth/github`));
    expect(cookieValue(a, "oauth_state")).not.toBe(cookieValue(b, "oauth_state"));
  });

  it("explains the missing configuration instead of crashing", async () => {
    delete process.env.GITHUB_CLIENT_ID;
    const res = await startLogin(new Request(`${ORIGIN}/auth/github`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/GITHUB_CLIENT_ID/);
  });
});

describe("GET /auth/github/callback", () => {
  it("rejects a missing or mismatched state without calling GitHub", async () => {
    const fetchMock = mockGithub({ id: 1, login: "x", avatar_url: "" });
    for (const res of [
      await callback(callbackReq("code=abc&state=evil", "oauth_state=good")),
      await callback(callbackReq("code=abc&state=good")),
      await callback(callbackReq("code=abc", "oauth_state=good")),
      await callback(callbackReq("state=good", "oauth_state=good")),
    ]) {
      expect(res.headers.get("location")).toBe(`${ORIGIN}/?login_error=state`);
      expect(cookieValue(res, "session")).toBeUndefined();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await Session.countDocuments()).toBe(0);
  });

  it("logs in: stores username and avatar_url, creates a session cookie, redirects home", async () => {
    const profile = { id: 42, login: "octocat", avatar_url: "https://avatars.example/42.png" };
    const fetchMock = mockGithub(profile);
    const res = await callback(callbackReq("code=abc&state=s1", "oauth_state=s1"));

    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    const exchange = fetchMock.mock.calls[0];
    expect(JSON.parse(exchange[1]!.body as string)).toMatchObject({
      client_id: "test-client-id",
      client_secret: "test-client-secret",
      code: "abc",
    });

    const user = await User.findOne({ githubId: 42 }).lean();
    expect(user).toMatchObject({ username: "octocat", avatarUrl: "https://avatars.example/42.png" });

    const sessionCookie = res.headers.getSetCookie().find((c) => c.startsWith("session="))!;
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/Path=\//i);
    expect(sessionCookie).toMatch(/Max-Age=604800/i);
    // The one-time state cookie is cleared after a successful login.
    expect(res.headers.getSetCookie().find((c) => c.startsWith("oauth_state="))).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(sessionCookie).toMatch(/SameSite=lax/i);
    const token = cookieValue(res, "session")!;
    expect(token).toHaveLength(64);

    // Only a hash is stored, never the raw token.
    const stored = await Session.findOne().lean();
    expect(stored!.tokenHash).not.toBe(token);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(String(stored!.userId)).toBe(String(user!._id));
    expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("a second login reuses the user and refreshes username/avatar", async () => {
    await loginAs({ id: 7, login: "old-name", avatar_url: "https://a/1.png" });
    await loginAs({ id: 7, login: "new-name", avatar_url: "https://a/2.png" });
    const users = await User.find({ githubId: 7 }).lean();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ username: "new-name", avatarUrl: "https://a/2.png" });
    expect(await Session.countDocuments()).toBe(2);
  });

  it("re-login replaces the browser's previous server session", async () => {
    const first = await loginAs({ id: 7, login: "mona", avatar_url: "" });
    mockGithub({ id: 7, login: "mona", avatar_url: "" });
    const res = await callback(callbackReq("code=abc&state=s1", `oauth_state=s1; session=${first.token}`));
    const second = cookieValue(res, "session")!;
    expect(second).not.toBe(first.token);
    expect(await Session.countDocuments()).toBe(1);
    const me2 = await me(new Request(`${ORIGIN}/api/me`, { headers: { cookie: `session=${first.token}` } }));
    expect(me2.status).toBe(401);
  });

  it("requires APP_URL in production instead of trusting the Host header", async () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = { node: env.NODE_ENV, app: env.APP_URL };
    env.NODE_ENV = "production";
    delete env.APP_URL;
    try {
      const res = await startLogin(new Request("http://evil.example/auth/github"));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toMatch(/APP_URL/);
    } finally {
      env.NODE_ENV = saved.node;
      env.APP_URL = saved.app;
    }
  });

  it("redirects with an error and creates nothing when GitHub rejects the code", async () => {
    mockGithub(null, null);
    const res = await callback(callbackReq("code=bad&state=s1", "oauth_state=s1"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login_error=github`);
    expect(cookieValue(res, "session")).toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
    expect(await Session.countDocuments()).toBe(0);
  });

  it("redirects with an error when the profile request fails", async () => {
    mockGithub(null, "gho_token");
    const res = await callback(callbackReq("code=abc&state=s1", "oauth_state=s1"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login_error=github`);
    expect(await Session.countDocuments()).toBe(0);
  });

  it("handles the user denying access", async () => {
    const fetchMock = mockGithub({ id: 1, login: "x", avatar_url: "" });
    const res = await callback(callbackReq("error=access_denied&state=s1", "oauth_state=s1"));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/?login_error=denied`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/me and POST /auth/logout", () => {
  const meReq = (cookie?: string) => new Request(`${ORIGIN}/api/me`, { headers: cookie ? { cookie } : {} });

  it("returns the profile when logged in and 401 otherwise", async () => {
    expect((await me(meReq())).status).toBe(401);
    const { token } = await loginAs({ id: 5, login: "mona", avatar_url: "https://a/m.png" });
    const res = await me(meReq(`session=${token}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ username: "mona", avatarUrl: "https://a/m.png" });
  });

  it("logout deletes the server-side session and clears the cookie", async () => {
    const { token } = await loginAs({ id: 5, login: "mona", avatar_url: "" });
    const cookie = `session=${token}`;
    expect(await Session.countDocuments()).toBe(1);

    const res = await logout(new Request(`${ORIGIN}/auth/logout`, { method: "POST", headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(await Session.countDocuments()).toBe(0);
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith("session="))!;
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    // The old cookie value is useless afterwards.
    expect((await me(meReq(cookie))).status).toBe(401);
  });

  it("logout without a session is harmless", async () => {
    const res = await logout(new Request(`${ORIGIN}/auth/logout`, { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("logging out one session leaves the user's other sessions alone", async () => {
    const a = await loginAs({ id: 5, login: "mona", avatar_url: "" });
    const b = await loginAs({ id: 5, login: "mona", avatar_url: "" });
    await logout(new Request(`${ORIGIN}/auth/logout`, { method: "POST", headers: { cookie: `session=${a.token}` } }));
    expect((await me(meReq(`session=${a.token}`))).status).toBe(401);
    expect((await me(meReq(`session=${b.token}`))).status).toBe(200);
  });
});

describe("assignLegacyData migration", () => {
  const legacyDocs = async () => {
    const db = mongoose.connection.db!;
    await db.collection("goals").insertOne({ title: "old goal", year: 2026 });
    await db.collection("weeklyplans").insertMany([
      { title: "old plan", startDate: "2026-10-05", goalId: null },
      { title: "null owner", startDate: "2026-10-12", goalId: null, userId: null },
    ]);
    await db.collection("todos").insertMany([
      { title: "old 1", date: "2026-10-06", status: "todo", weeklyPlanId: null },
      { title: "old 2", date: "2026-10-07", status: "done", weeklyPlanId: null },
    ]);
  };

  it("gives every ownerless document to the user and is idempotent", async () => {
    await loginAs({ id: 9, login: "Owner", avatar_url: "" });
    await legacyDocs();
    const other = await User.create({ githubId: 10, username: "other" });
    await Todo.create({ userId: other._id, title: "theirs", date: "2026-10-06" });

    const first = await assignLegacyData(mongoose.connection, "owner"); // case-insensitive
    expect(first).toMatchObject({ username: "Owner", goals: 1, weeklyplans: 2, todos: 2 });

    const owner = await User.findOne({ githubId: 9 });
    expect(await Todo.countDocuments({ userId: owner!._id })).toBe(2);
    expect(await WeeklyPlan.countDocuments({ userId: owner!._id })).toBe(2);
    expect(await Goal.countDocuments({ userId: owner!._id })).toBe(1);
    expect(await Todo.countDocuments({ userId: other._id })).toBe(1);

    const second = await assignLegacyData(mongoose.connection, "Owner");
    expect(second).toMatchObject({ goals: 0, weeklyplans: 0, todos: 0 });
  });

  it("never reassigns documents that already have an owner", async () => {
    await loginAs({ id: 9, login: "owner", avatar_url: "" });
    const other = await User.create({ githubId: 10, username: "other" });
    await Todo.create({ userId: other._id, title: "theirs", date: "2026-10-06" });
    await assignLegacyData(mongoose.connection, "owner");
    expect(await Todo.countDocuments({ userId: other._id })).toBe(1);
  });

  it("fails clearly when the user has not logged in yet", async () => {
    await legacyDocs();
    await expect(assignLegacyData(mongoose.connection, "ghost")).rejects.toThrow(/log in with GitHub once first/);
    expect(await Todo.countDocuments({ userId: { $exists: true } })).toBe(0);
  });

  it("does not treat regex characters in the username as wildcards", async () => {
    await User.create({ githubId: 1, username: "axb" });
    await User.create({ githubId: 2, username: "a.b" });
    await legacyDocs();
    const r = await assignLegacyData(mongoose.connection, "a.b");
    expect(r.username).toBe("a.b");
    const axb = await User.findOne({ username: "axb" });
    expect(await Todo.countDocuments({ userId: axb!._id })).toBe(0);
  });

  it("refuses an ambiguous username and changes nothing", async () => {
    await User.create({ githubId: 1, username: "foo" });
    await User.create({ githubId: 2, username: "Foo" });
    await legacyDocs();
    await expect(assignLegacyData(mongoose.connection, "foo")).rejects.toThrow(/more than one account/);
    expect(await Todo.countDocuments({ userId: { $exists: true, $ne: null } })).toBe(0);
  });

  it("aborts without changes when a legacy plan would overlap one of the user's plans", async () => {
    const user = await User.create({ githubId: 1, username: "owner" });
    await WeeklyPlan.create({ userId: user._id, title: "mine", startDate: "2026-10-05" });
    await mongoose.connection.db!.collection("weeklyplans").insertOne({ title: "legacy", startDate: "2026-10-05", goalId: null });
    await mongoose.connection.db!.collection("todos").insertOne({ title: "old", date: "2026-10-06", status: "todo", weeklyPlanId: null });
    await expect(assignLegacyData(mongoose.connection, "owner")).rejects.toThrow(/overlap/);
    expect(await Todo.countDocuments({ userId: { $exists: true } })).toBe(0);
  });
});
