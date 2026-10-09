import { requireUser } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, nonEmptyString, ok, readBody } from "@/lib/http";
import { goalsWithProgress } from "@/lib/plans";
import { Goal } from "@/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  await connectDb();
  return ok(await goalsWithProgress(userId));
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  const body = await readBody(req);
  if (!body) return fail(400, "invalid JSON body");
  if (!nonEmptyString(body.title)) return fail(400, "title is required");
  if (typeof body.year !== "number" || !Number.isInteger(body.year)) return fail(400, "year is required (integer)");
  await connectDb();
  const goal = await Goal.create({ userId, title: body.title.trim(), year: body.year });
  return ok({ id: String(goal._id), title: goal.title, year: goal.year, planCount: 0, progress: 0 }, 201);
}
