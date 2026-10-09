import type { Types } from "mongoose";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { fail } from "@/lib/http";
import { Session, User } from "@/models";

export const SESSION_COOKIE = "session";
export const STATE_COOKIE = "oauth_state";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const STATE_TTL_S = 10 * 60;

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // malformed cookie value: ignore it
    }
  }
  return out;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(userId: Types.ObjectId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await Session.create({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getUser(req: Request) {
  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (!token) return null;
  await connectDb();
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  return User.findById(session.userId).lean();
}

type AuthedUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

/** Resolves the logged-in user or a ready-made 401 response. */
export async function requireUser(req: Request): Promise<{ user: AuthedUser } | { res: NextResponse }> {
  const user = await getUser(req);
  return user ? { user } : { res: fail(401, "authentication required") };
}

export function appOrigin(req: Request): string {
  return (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
}

export function githubConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** In production the redirect origin must be pinned by APP_URL, not taken from the Host header. */
export const originIsPinned = () => process.env.NODE_ENV !== "production" || Boolean(process.env.APP_URL);
