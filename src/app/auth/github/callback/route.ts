import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  STATE_COOKIE,
  appOrigin,
  cookieOptions,
  createSession,
  githubConfig,
  hashToken,
  originIsPinned,
  parseCookies,
} from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { Session, User } from "@/models";

export const dynamic = "force-dynamic";

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type GithubProfile = { id: number; login: string; avatar_url: string };

async function fetchGithubProfile(code: string, config: { clientId: string; clientSecret: string }) {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
  });
  const tokenBody = (await tokenRes.json()) as { access_token?: string };
  if (!tokenRes.ok || !tokenBody.access_token) throw new Error("token exchange failed");

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "todo-app",
    },
  });
  const profile = (await userRes.json()) as Partial<GithubProfile>;
  if (!userRes.ok || typeof profile.id !== "number" || !profile.login) throw new Error("profile fetch failed");
  return { id: profile.id, login: profile.login, avatar_url: profile.avatar_url ?? "" };
}

export async function GET(req: Request) {
  const origin = appOrigin(req);
  const back = (error: string) => {
    const res = NextResponse.redirect(`${origin}/?login_error=${error}`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const cookies = parseCookies(req.headers.get("cookie"));
  const expected = cookies[STATE_COOKIE];
  if (params.get("error")) return back("denied");
  if (!code || !state || !expected || !sameState(state, expected)) return back("state");

  const config = githubConfig();
  if (!config || !originIsPinned()) return back("config");

  try {
    const profile = await fetchGithubProfile(code, config);
    await connectDb();
    const user = await User.findOneAndUpdate(
      { githubId: profile.id },
      { $set: { username: profile.login, avatarUrl: profile.avatar_url } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    // Re-login replaces the browser's previous session instead of leaving it alive until expiry.
    const previous = cookies[SESSION_COOKIE];
    if (previous) await Session.deleteOne({ tokenHash: hashToken(previous) });
    const { token } = await createSession(user._id);

    const res = NextResponse.redirect(`${origin}/`);
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_MS / 1000));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    return back("github");
  }
}
