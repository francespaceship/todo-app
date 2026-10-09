import { requireUser } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, nonEmptyString, ok, readBody, validId } from "@/lib/http";
import { goalsWithProgress } from "@/lib/plans";
import { yearOf } from "@/lib/week";
import { Goal, WeeklyPlan } from "@/models";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  const { id } = await params;
  if (!validId(id)) return fail(400, "invalid id");
  const body = await readBody(req);
  if (!body) return fail(400, "invalid JSON body");

  await connectDb();
  const goal = await Goal.findOne({ _id: id, userId });
  if (!goal) return fail(404, "goal not found");
  if ("title" in body) {
    if (!nonEmptyString(body.title)) return fail(400, "title must not be empty");
    goal.title = body.title.trim();
  }
  if ("year" in body) {
    if (typeof body.year !== "number" || !Number.isInteger(body.year)) return fail(400, "year must be an integer");
    const year = body.year;
    const linked = await WeeklyPlan.find({ goalId: goal._id, userId }).select("startDate").lean();
    if (linked.some((p) => yearOf(p.startDate) !== year)) {
      return fail(409, "linked weekly plans start in a different year");
    }
    goal.year = year;
  }
  await goal.save();
  const [out] = await goalsWithProgress(userId, { _id: goal._id });
  return ok(out);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  const { id } = await params;
  if (!validId(id)) return fail(400, "invalid id");
  await connectDb();
  if (!(await Goal.exists({ _id: id, userId }))) return fail(404, "goal not found");
  await WeeklyPlan.updateMany({ goalId: id, userId }, { $set: { goalId: null } });
  await Goal.deleteOne({ _id: id, userId });
  return ok({ ok: true });
}
