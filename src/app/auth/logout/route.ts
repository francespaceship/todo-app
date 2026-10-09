import { SESSION_COOKIE, hashToken, parseCookies } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { ok } from "@/lib/http";
import { Session } from "@/models";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = parseCookies(req.headers.get("cookie"))[SESSION_COOKIE];
  if (token) {
    await connectDb();
    await Session.deleteOne({ tokenHash: hashToken(token) });
  }
  const res = ok({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
