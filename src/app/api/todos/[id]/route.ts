import { requireUser } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, nonEmptyString, ok, readBody, validId } from "@/lib/http";
import { serializeTodo } from "@/lib/serialize";
import { isDateInWeek, isValidDate } from "@/lib/week";
import { STATUSES, Todo, WeeklyPlan } from "@/models";

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
  const todo = await Todo.findOne({ _id: id, userId });
  if (!todo) return fail(404, "todo not found");
  const notices: string[] = [];

  if ("title" in body) {
    if (!nonEmptyString(body.title)) return fail(400, "title must not be empty");
    todo.title = body.title.trim();
  }
  if ("date" in body) {
    if (!isValidDate(body.date)) return fail(400, "invalid date");
    todo.date = body.date;
  }
  if ("status" in body) {
    if (!(STATUSES as readonly string[]).includes(body.status as string)) return fail(400, "invalid status");
    todo.status = body.status as (typeof STATUSES)[number];
  }

  // The edit form echoes the current weeklyPlanId back; only a changed value is a link request.
  const linkRequested =
    "weeklyPlanId" in body && body.weeklyPlanId != null && String(body.weeklyPlanId) !== String(todo.weeklyPlanId ?? "");
  if ("weeklyPlanId" in body) {
    if (body.weeklyPlanId == null) todo.weeklyPlanId = null;
    else if (!validId(body.weeklyPlanId)) return fail(400, "invalid weeklyPlanId");
    else todo.weeklyPlanId = body.weeklyPlanId as unknown as typeof todo.weeklyPlanId;
  }

  // Only re-check the link when the link or the date changed, so unrelated edits
  // (e.g. drag-and-drop status changes) never fail on a stale link.
  if (todo.weeklyPlanId && (linkRequested || "date" in body)) {
    const plan = await WeeklyPlan.findOne({ _id: todo.weeklyPlanId, userId }).lean();
    if (linkRequested) {
      if (!plan) return fail(404, "weekly plan not found");
      if (!isDateInWeek(todo.date, plan.startDate)) return fail(409, "date is outside the weekly plan range");
    } else if (!plan || !isDateInWeek(todo.date, plan.startDate)) {
      todo.weeklyPlanId = null;
      notices.push("날짜가 주간 계획 기간을 벗어나 연결이 해제되었습니다");
    }
  }
  await todo.save();
  return ok({ ...serializeTodo(todo.toObject()), notices });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  const { id } = await params;
  if (!validId(id)) return fail(400, "invalid id");
  await connectDb();
  const res = await Todo.deleteOne({ _id: id, userId });
  if (res.deletedCount === 0) return fail(404, "todo not found");
  return ok({ ok: true });
}
