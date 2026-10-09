import { requireUser } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { fail, nonEmptyString, ok, readBody, validId } from "@/lib/http";
import { serializeTodo } from "@/lib/serialize";
import { isDateInWeek, isValidDate } from "@/lib/week";
import { STATUSES, type Status, Todo, WeeklyPlan } from "@/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  await connectDb();
  const q = new URL(req.url).searchParams;
  const filter: Record<string, unknown> = { userId };
  const status = q.get("status");
  const date = q.get("date");
  const plan = q.get("weeklyPlanId");
  if (status) {
    if (!(STATUSES as readonly string[]).includes(status)) return fail(400, "invalid status");
    filter.status = status;
  }
  if (date) {
    if (!isValidDate(date)) return fail(400, "invalid date");
    filter.date = date;
  }
  if (plan) {
    if (plan === "none") filter.weeklyPlanId = null;
    else if (validId(plan)) filter.weeklyPlanId = plan;
    else return fail(400, "invalid weeklyPlanId");
  }
  const todos = await Todo.find(filter).sort({ date: 1, _id: 1 }).lean();
  return ok(todos.map(serializeTodo));
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("res" in auth) return auth.res;
  const userId = auth.user._id;
  const body = await readBody(req);
  if (!body) return fail(400, "invalid JSON body");
  if (!nonEmptyString(body.title)) return fail(400, "title is required");
  if (!isValidDate(body.date)) return fail(400, "date is required (YYYY-MM-DD)");
  const status = (body.status ?? "todo") as string;
  if (!(STATUSES as readonly string[]).includes(status)) return fail(400, "invalid status");

  await connectDb();
  let weeklyPlanId: string | null = null;
  if (body.weeklyPlanId != null) {
    if (!validId(body.weeklyPlanId)) return fail(400, "invalid weeklyPlanId");
    const plan = await WeeklyPlan.findOne({ _id: body.weeklyPlanId, userId }).lean();
    if (!plan) return fail(404, "weekly plan not found");
    if (!isDateInWeek(body.date, plan.startDate)) return fail(409, "date is outside the weekly plan range");
    weeklyPlanId = body.weeklyPlanId;
  }
  const todo = await Todo.create({ userId, title: body.title.trim(), date: body.date, status: status as Status, weeklyPlanId });
  return ok(serializeTodo(todo.toObject()), 201);
}
