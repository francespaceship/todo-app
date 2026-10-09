import { requireUser } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, nonEmptyString, ok, readBody, validId } from "@/lib/http";
import { checkGoalLink, checkPlanStart, plansWithProgress, serializePlan } from "@/lib/plans";
import { isValidDate } from "@/lib/week";
import { WeeklyPlan } from "@/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  await connectDb();
  return ok(await plansWithProgress(userId));
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  const body = await readBody(req);
  if (!body) return fail(400, "invalid JSON body");
  if (!nonEmptyString(body.title)) return fail(400, "title is required");
  if (!isValidDate(body.startDate)) return fail(400, "startDate is required (YYYY-MM-DD)");

  await connectDb();
  const bad = await checkPlanStart(userId, body.startDate);
  if (bad) return fail(bad.status, bad.error);

  let goalId: string | null = null;
  if (body.goalId != null) {
    if (!validId(body.goalId)) return fail(400, "invalid goalId");
    const badGoal = await checkGoalLink(userId, body.goalId, body.startDate);
    if (badGoal) return fail(badGoal.status, badGoal.error);
    goalId = body.goalId;
  }
  const plan = await WeeklyPlan.create({ userId, title: body.title.trim(), startDate: body.startDate, goalId });
  return ok(serializePlan(plan.toObject(), []), 201);
}
