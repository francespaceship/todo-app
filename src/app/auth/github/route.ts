import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { STATE_COOKIE, STATE_TTL_S, appOrigin, cookieOptions, githubConfig, originIsPinned } from "@/lib/auth";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const config = githubConfig();
  if (!config) {
    return fail(500, "GitHub OAuth is not configured: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (see docs/AUTH.md)");
  }
  if (!originIsPinned()) return fail(500, "APP_URL must be set in production (see docs/AUTH.md)");
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", `${appOrigin(req)}/auth/github/callback`);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, cookieOptions(STATE_TTL_S));
  return res;
}
