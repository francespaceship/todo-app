import { requireUser } from "@/lib/auth";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const { user } = auth;
  return ok({ id: String(user._id), username: user.username, avatarUrl: user.avatarUrl });
}
