import { requireUser } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, nonEmptyString, ok, readBody, validId } from "@/lib/http";
import { checkGoalLink, checkPlanStart, plansWithProgress } from "@/lib/plans";
import { addDays, isValidDate } from "@/lib/week";
import { Todo, WeeklyPlan } from "@/models";

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
  const plan = await WeeklyPlan.findOne({ _id: id, userId });
  if (!plan) return fail(404, "weekly plan not found");
  const notices: string[] = [];

  if ("title" in body) {
    if (!nonEmptyString(body.title)) return fail(400, "title must not be empty");
    plan.title = body.title.trim();
  }

  const startChanged = "startDate" in body && body.startDate !== plan.startDate;
  if ("startDate" in body) {
    if (!isValidDate(body.startDate)) return fail(400, "invalid startDate");
    const bad = await checkPlanStart(userId, body.startDate, plan._id);
    if (bad) return fail(bad.status, bad.error);
    plan.startDate = body.startDate;
  }

  // The edit form echoes the current goalId back; only a changed value is a link request.
  const goalChanged = "goalId" in body && String(body.goalId ?? "") !== String(plan.goalId ?? "");
  if (goalChanged && body.goalId != null) {
    if (!validId(body.goalId)) return fail(400, "invalid goalId");
    const bad = await checkGoalLink(userId, body.goalId, plan.startDate);
    if (bad) return fail(bad.status, bad.error);
    plan.goalId = body.goalId as unknown as typeof plan.goalId;
  } else if (goalChanged) {
    plan.goalId = null;
  } else if (startChanged && plan.goalId) {
    const bad = await checkGoalLink(userId, String(plan.goalId), plan.startDate);
    if (bad) {
      plan.goalId = null;
      notices.push("시작일의 연도가 바뀌어 1년 목표 연결이 해제되었습니다");
    }
  }

  await plan.save();

  if (startChanged) {
    const res = await Todo.updateMany(
      {
        weeklyPlanId: plan._id,
        userId,
        $or: [{ date: { $lt: plan.startDate } }, { date: { $gt: addDays(plan.startDate, 6) } }],
      },
      { $set: { weeklyPlanId: null } },
    );
    if (res.modifiedCount > 0) {
      notices.push(`기간 밖이 된 할 일 ${res.modifiedCount}개의 연결이 해제되었습니다`);
    }
  }
  const [out] = await plansWithProgress(userId, { _id: plan._id });
  return ok({ ...out, notices });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  const { id } = await params;
  if (!validId(id)) return fail(400, "invalid id");
  await connectDb();
  if (!(await WeeklyPlan.exists({ _id: id, userId }))) return fail(404, "weekly plan not found");
  // Unlink first so a failure never leaves todos pointing at a deleted plan.
  await Todo.updateMany({ weeklyPlanId: id, userId }, { $set: { weeklyPlanId: null } });
  await WeeklyPlan.deleteOne({ _id: id, userId });
  return ok({ ok: true });
}
