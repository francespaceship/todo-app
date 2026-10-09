import { SESSION_COOKIE, SESSION_TTL_MS, cookieOptions, devBypassEnabled, devLogin, requireUser } from "@/lib/auth";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

const profile = (user: { _id: unknown; username: string; avatarUrl?: string | null }) => ({
  id: String(user._id),
  username: user.username,
  avatarUrl: user.avatarUrl ?? "",
});

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("user" in auth) return ok(profile(auth.user));

  // Local development only: sign in as "dev-user" instead of redirecting to GitHub.
  if (!devBypassEnabled(req)) return auth.res;
  const { user, token } = await devLogin();
  const res = ok(profile(user));
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_MS / 1000));
  return res;
}
