import type { Types } from "mongoose";
import { goalProgress, progress } from "@/lib/progress";
import { idStr } from "@/lib/serialize";
import { addDays, isMonday, weekEnd, yearOf } from "@/lib/week";
import { Goal, Todo, WeeklyPlan } from "@/models";

type PlanDoc = { _id: unknown; title: string; startDate: string; goalId?: unknown };

export function serializePlan(p: PlanDoc, statuses: string[]) {
  return {
    id: String(p._id),
    title: p.title,
    startDate: p.startDate,
    endDate: weekEnd(p.startDate),
    goalId: idStr(p.goalId),
    todoCount: statuses.length,
    progress: progress(statuses),
  };
}

export async function plansWithProgress(userId: Types.ObjectId, filter: Record<string, unknown> = {}) {
  const plans = await WeeklyPlan.find({ ...filter, userId }).sort({ startDate: 1, _id: 1 }).lean();
  const todos = await Todo.find({ userId, weeklyPlanId: { $in: plans.map((p) => p._id) } })
    .select("status weeklyPlanId")
    .lean();
  const byPlan = new Map<string, string[]>();
  for (const t of todos) {
    const k = String(t.weeklyPlanId);
    byPlan.set(k, [...(byPlan.get(k) ?? []), t.status]);
  }
  return plans.map((p) => serializePlan(p, byPlan.get(String(p._id)) ?? []));
}

export async function goalsWithProgress(userId: Types.ObjectId, filter: Record<string, unknown> = {}) {
  const goals = await Goal.find({ ...filter, userId }).sort({ year: 1, _id: 1 }).lean();
  const plans = await plansWithProgress(userId, { goalId: { $in: goals.map((g) => g._id) } });
  return goals.map((g) => {
    const linked = plans.filter((p) => p.goalId === String(g._id));
    return {
      id: String(g._id),
      title: g.title,
      year: g.year,
      planCount: linked.length,
      progress: goalProgress(linked.filter((p) => p.todoCount > 0).map((p) => p.progress)),
    };
  });
}

export type Rejection = { status: number; error: string };

/** PRD: weeks start on Monday and must not overlap another plan. */
export async function checkPlanStart(userId: Types.ObjectId, startDate: string, excludeId?: unknown): Promise<Rejection | null> {
  if (!isMonday(startDate)) return { status: 400, error: "startDate must be a Monday" };
  const filter: Record<string, unknown> = {
    userId,
    startDate: { $gte: addDays(startDate, -6), $lte: addDays(startDate, 6) },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await WeeklyPlan.exists(filter)) return { status: 409, error: "weekly plan overlaps an existing plan" };
  return null;
}

/** PRD: a plan may link only to the goal of the year its start date belongs to. */
export async function checkGoalLink(userId: Types.ObjectId, goalId: string, startDate: string): Promise<Rejection | null> {
  const goal = await Goal.findOne({ _id: goalId, userId }).lean();
  if (!goal) return { status: 404, error: "goal not found" };
  if (goal.year !== yearOf(startDate)) return { status: 409, error: "goal year must match the plan's start year" };
  return null;
}
