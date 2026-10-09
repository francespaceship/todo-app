import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { createSession } from "@/lib/auth";
import { Todo, User } from "@/models";

import { GET as listTodos, POST as createTodo } from "@/app/api/todos/route";
import { DELETE as deleteTodo, PATCH as patchTodo } from "@/app/api/todos/[id]/route";
import { GET as listPlans, POST as createPlan } from "@/app/api/weekly-plans/route";
import { DELETE as deletePlan, PATCH as patchPlan } from "@/app/api/weekly-plans/[id]/route";
import { GET as listGoals, POST as createGoal } from "@/app/api/goals/route";
import { DELETE as deleteGoal, PATCH as patchGoal } from "@/app/api/goals/[id]/route";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("todo-test");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

let cookie = "";

async function login(username: string) {
  const user = await User.create({ githubId: Math.floor(Math.random() * 1e9), username, avatarUrl: "" });
  const { token } = await createSession(user._id);
  return `session=${token}`;
}

beforeEach(async () => {
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  await mongoose.connection.dropDatabase();
  cookie = await login("alice");
});

const makeReq =
  (c: string) =>
  (body?: unknown, url = "http://x/api") =>
    new Request(url, {
      method: body === undefined ? "GET" : "POST",
      headers: c ? { cookie: c } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
const req = (body?: unknown, url?: string) => makeReq(cookie)(body, url);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (r: Response) => ({ status: r.status, body: await r.json() });

const mkPlan = async (startDate = "2026-10-05", goalId?: string) =>
  (await json(await createPlan(req({ title: "w", startDate, goalId })))).body;
const mkTodo = async (extra: Record<string, unknown> = {}) =>
  json(await createTodo(req({ title: "t", date: "2026-10-06", ...extra })));
const planProgress = async (id: string) =>
  (await json(await listPlans(req()))).body.find((p: { id: string }) => p.id === id).progress;

describe("todos", () => {
  it("rejects missing title or date with 400 and defaults status to todo", async () => {
    expect((await json(await createTodo(req({ date: "2026-10-06" })))).status).toBe(400);
    expect((await json(await createTodo(req({ title: "x" })))).status).toBe(400);
    const r = await mkTodo();
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("todo");
    expect(r.body.weeklyPlanId).toBeNull();
  });

  it("allows linking only when date is within the plan range", async () => {
    const plan = await mkPlan("2026-10-05");
    expect((await mkTodo({ weeklyPlanId: plan.id, date: "2026-10-11" })).status).toBe(201);
    expect((await mkTodo({ weeklyPlanId: plan.id, date: "2026-10-12" })).status).toBe(409);
    expect((await mkTodo({ weeklyPlanId: plan.id, date: "2026-10-04" })).status).toBe(409);
  });

  it("auto-unlinks with a notice when a date edit leaves the plan range", async () => {
    const plan = await mkPlan("2026-10-05");
    const t = (await mkTodo({ weeklyPlanId: plan.id })).body;
    const moved = await json(await patchTodo(req({ date: "2026-11-01" }), ctx(t.id)));
    expect(moved.status).toBe(200);
    expect(moved.body.weeklyPlanId).toBeNull();
    expect(moved.body.notices).toHaveLength(1);
    expect(await planProgress(plan.id)).toBe(0);
  });

  it("rejects an explicit link request whose date is out of range", async () => {
    const plan = await mkPlan("2026-10-05");
    const t = (await mkTodo({ date: "2026-11-01" })).body;
    expect((await json(await patchTodo(req({ weeklyPlanId: plan.id }), ctx(t.id)))).status).toBe(409);
    expect((await json(await patchTodo(req({ weeklyPlanId: plan.id, date: "2026-10-07" }), ctx(t.id)))).status).toBe(200);
  });

  it("status change still works when the linked plan no longer exists", async () => {
    const plan = await mkPlan("2026-10-05");
    const t = (await mkTodo({ weeklyPlanId: plan.id })).body;
    await mongoose.connection.collection("weeklyplans").deleteMany({});
    const r = await json(await patchTodo(req({ status: "done" }), ctx(t.id)));
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("done");
  });

  it("allows every status-to-status transition", async () => {
    const t = (await mkTodo()).body;
    const states = ["todo", "doing", "done"];
    for (const from of states) {
      for (const to of states) {
        await patchTodo(req({ status: from }), ctx(t.id));
        const r = await json(await patchTodo(req({ status: to }), ctx(t.id)));
        expect(r.status).toBe(200);
        expect(r.body.status).toBe(to);
      }
    }
    expect((await json(await patchTodo(req({ status: "bogus" }), ctx(t.id)))).status).toBe(400);
  });

  it("deletes and filters", async () => {
    const plan = await mkPlan();
    const a = (await mkTodo({ weeklyPlanId: plan.id, status: "done" })).body;
    await mkTodo();
    const byStatus = await json(await listTodos(req(undefined, "http://x/api/todos?status=done")));
    expect(byStatus.body.map((t: { id: string }) => t.id)).toEqual([a.id]);
    const unlinked = await json(await listTodos(req(undefined, "http://x/api/todos?weeklyPlanId=none")));
    expect(unlinked.body).toHaveLength(1);
    expect((await json(await deleteTodo(req(), ctx(a.id)))).status).toBe(200);
    expect((await json(await deleteTodo(req(), ctx(a.id)))).status).toBe(404);
  });
});

describe("weekly plan progress", () => {
  it("is 0 with no todos, tracks status/link/delete changes immediately", async () => {
    const plan = await mkPlan();
    expect(await planProgress(plan.id)).toBe(0);
    const t1 = (await mkTodo({ weeklyPlanId: plan.id })).body;
    await mkTodo({ weeklyPlanId: plan.id });
    await mkTodo({ weeklyPlanId: plan.id });
    expect(await planProgress(plan.id)).toBe(0);
    await patchTodo(req({ status: "done" }), ctx(t1.id));
    expect(await planProgress(plan.id)).toBe(33);
    await patchTodo(req({ weeklyPlanId: null }), ctx(t1.id));
    expect(await planProgress(plan.id)).toBe(0);
    await patchTodo(req({ weeklyPlanId: plan.id, status: "done" }), ctx(t1.id));
    expect(await planProgress(plan.id)).toBe(33);
    await deleteTodo(req(), ctx(t1.id));
    expect(await planProgress(plan.id)).toBe(0);
  });

  it("is 100 when all linked todos are done", async () => {
    const plan = await mkPlan();
    await mkTodo({ weeklyPlanId: plan.id, status: "done" });
    await mkTodo({ weeklyPlanId: plan.id, status: "done" });
    expect(await planProgress(plan.id)).toBe(100);
  });

  it("auto-unlinks todos that fall outside a moved week and reports a notice", async () => {
    const plan = await mkPlan("2026-10-05");
    await mkTodo({ weeklyPlanId: plan.id, date: "2026-10-06" });
    await mkTodo({ weeklyPlanId: plan.id, date: "2026-10-11" });
    const moved = await json(await patchPlan(req({ startDate: "2026-10-12" }), ctx(plan.id)));
    expect(moved.status).toBe(200);
    expect(moved.body.notices).toHaveLength(1);
    expect(moved.body.todoCount).toBe(0);
    const unlinked = await json(await listTodos(req(undefined, "http://x/api/todos?weeklyPlanId=none")));
    expect(unlinked.body).toHaveLength(2);
  });

  it("requires Monday starts and forbids overlapping plans", async () => {
    expect((await json(await createPlan(req({ title: "w", startDate: "2026-10-06" })))).status).toBe(400);
    await mkPlan("2026-10-05");
    expect((await json(await createPlan(req({ title: "dup", startDate: "2026-10-05" })))).status).toBe(409);
    const other = await mkPlan("2026-10-12");
    expect((await json(await patchPlan(req({ startDate: "2026-10-05" }), ctx(other.id)))).status).toBe(409);
    expect((await json(await patchPlan(req({ startDate: "2026-10-07" }), ctx(other.id)))).status).toBe(400);
    expect((await json(await patchPlan(req({ title: "renamed" }), ctx(other.id)))).status).toBe(200);
  });

  it("links goals only for the start year and drops the goal when the year changes", async () => {
    const g2026 = (await json(await createGoal(req({ title: "g26", year: 2026 })))).body;
    const g2027 = (await json(await createGoal(req({ title: "g27", year: 2027 })))).body;
    expect((await json(await createPlan(req({ title: "w", startDate: "2026-10-05", goalId: g2027.id })))).status).toBe(409);
    const plan = await mkPlan("2026-10-05", g2026.id);
    expect(plan.goalId).toBe(g2026.id);
    const moved = await json(await patchPlan(req({ startDate: "2027-01-04" }), ctx(plan.id)));
    expect(moved.status).toBe(200);
    expect(moved.body.goalId).toBeNull();
    expect(moved.body.notices).toHaveLength(1);
  });

  it("UI-shaped plan edit (echoed goalId) still auto-unlinks the goal on a year change", async () => {
    const g2026 = (await json(await createGoal(req({ title: "g26", year: 2026 })))).body;
    const plan = await mkPlan("2026-12-28", g2026.id);
    const moved = await json(
      await patchPlan(req({ title: "w", startDate: "2027-01-04", goalId: g2026.id }), ctx(plan.id)),
    );
    expect(moved.status).toBe(200);
    expect(moved.body.goalId).toBeNull();
    expect(moved.body.notices).toHaveLength(1);
  });

  it("UI-shaped todo edit (echoed weeklyPlanId) still auto-unlinks when the date leaves the range", async () => {
    const plan = await mkPlan("2026-10-05");
    const t = (await mkTodo({ weeklyPlanId: plan.id })).body;
    const moved = await json(await patchTodo(req({ date: "2026-11-01", weeklyPlanId: plan.id }), ctx(t.id)));
    expect(moved.status).toBe(200);
    expect(moved.body.weeklyPlanId).toBeNull();
    expect(moved.body.notices).toHaveLength(1);
  });

  it("a week spanning the year boundary belongs to its start year", async () => {
    const g2026 = (await json(await createGoal(req({ title: "g26", year: 2026 })))).body;
    const plan = await mkPlan("2026-12-28", g2026.id);
    expect(plan.goalId).toBe(g2026.id);
    expect((await mkTodo({ weeklyPlanId: plan.id, date: "2027-01-02" })).status).toBe(201);
  });
});

describe("deletion unlinks without deleting", () => {
  it("deleting a plan keeps its todos with weeklyPlanId null", async () => {
    const plan = await mkPlan();
    await mkTodo({ weeklyPlanId: plan.id });
    await mkTodo({ weeklyPlanId: plan.id });
    expect((await json(await deletePlan(req(), ctx(plan.id)))).status).toBe(200);
    const todos = (await json(await listTodos(req(undefined, "http://x/api/todos")))).body;
    expect(todos).toHaveLength(2);
    expect(todos.every((t: { weeklyPlanId: unknown }) => t.weeklyPlanId === null)).toBe(true);
  });

  it("deleting a goal keeps its plans with goalId null", async () => {
    const goal = (await json(await createGoal(req({ title: "g", year: 2026 })))).body;
    const plan = await mkPlan("2026-10-05", goal.id);
    expect(plan.goalId).toBe(goal.id);
    expect((await json(await deleteGoal(req(), ctx(goal.id)))).status).toBe(200);
    const plans = (await json(await listPlans(req()))).body;
    expect(plans).toHaveLength(1);
    expect(plans[0].goalId).toBeNull();
  });
});

describe("goal progress", () => {
  it("is the average of linked plan progress, 0 with no plans", async () => {
    const goal = (await json(await createGoal(req({ title: "g", year: 2026 })))).body;
    expect((await json(await listGoals(req()))).body[0].progress).toBe(0);
    const p1 = await mkPlan("2026-10-05", goal.id);
    const p2 = await mkPlan("2026-10-12", goal.id);
    await mkTodo({ weeklyPlanId: p1.id, status: "done" });
    await mkTodo({ weeklyPlanId: p2.id, date: "2026-10-13" });
    const g = (await json(await listGoals(req()))).body[0];
    expect(g.planCount).toBe(2);
    expect(g.progress).toBe(50);
  });

  it("excludes plans with no linked todos from the average", async () => {
    const goal = (await json(await createGoal(req({ title: "g", year: 2026 })))).body;
    const full = await mkPlan("2026-10-05", goal.id);
    await mkPlan("2026-10-12", goal.id);
    await mkTodo({ weeklyPlanId: full.id, status: "done" });
    const g = (await json(await listGoals(req()))).body[0];
    expect(g.planCount).toBe(2);
    expect(g.progress).toBe(100);
  });

  it("rejects a goal year change that strands linked plans", async () => {
    const goal = (await json(await createGoal(req({ title: "g", year: 2026 })))).body;
    await mkPlan("2026-10-05", goal.id);
    expect((await json(await patchGoal(req({ year: 2027 }), ctx(goal.id)))).status).toBe(409);
    expect((await json(await patchGoal(req({ title: "renamed" }), ctx(goal.id)))).status).toBe(200);
  });

  it("validates goal input", async () => {
    expect((await json(await createGoal(req({ title: "g" })))).status).toBe(400);
    expect((await json(await createGoal(req({ year: 2026 })))).status).toBe(400);
  });
});

describe("authentication and per-user isolation", () => {
  const anon = makeReq("");

  it("returns 401 on every data endpoint without a session", async () => {
    const id = "0123456789abcdef01234567";
    const calls = [
      () => listTodos(anon()),
      () => createTodo(anon({ title: "t", date: "2026-10-06" })),
      () => patchTodo(anon({ title: "x" }), ctx(id)),
      () => deleteTodo(anon(), ctx(id)),
      () => listPlans(anon()),
      () => createPlan(anon({ title: "w", startDate: "2026-10-05" })),
      () => patchPlan(anon({ title: "x" }), ctx(id)),
      () => deletePlan(anon(), ctx(id)),
      () => listGoals(anon()),
      () => createGoal(anon({ title: "g", year: 2026 })),
      () => patchGoal(anon({ title: "x" }), ctx(id)),
      () => deleteGoal(anon(), ctx(id)),
    ];
    for (const call of calls) expect((await call()).status).toBe(401);
  });

  it("rejects an unknown token and an expired session", async () => {
    expect((await json(await listTodos(makeReq("session=nope")()))).status).toBe(401);
    const { Session } = await import("@/models");
    const { hashToken } = await import("@/lib/auth");
    const user = await User.findOne({ username: "alice" });
    await Session.create({ tokenHash: hashToken("old"), userId: user!._id, expiresAt: new Date(Date.now() - 1000) });
    expect((await json(await listTodos(makeReq("session=old")()))).status).toBe(401);
  });

  it("hides one user's data from another and answers 404 for foreign ids", async () => {
    const plan = await mkPlan();
    const todo = (await mkTodo({ weeklyPlanId: plan.id })).body;
    const goal = (await json(await createGoal(req({ title: "g", year: 2026 })))).body;

    const bob = makeReq(await login("bob"));
    expect((await json(await listTodos(bob()))).body).toEqual([]);
    expect((await json(await listPlans(bob()))).body).toEqual([]);
    expect((await json(await listGoals(bob()))).body).toEqual([]);

    expect((await json(await patchTodo(bob({ status: "done" }), ctx(todo.id)))).status).toBe(404);
    expect((await json(await deleteTodo(bob(), ctx(todo.id)))).status).toBe(404);
    expect((await json(await patchPlan(bob({ title: "x" }), ctx(plan.id)))).status).toBe(404);
    expect((await json(await deletePlan(bob(), ctx(plan.id)))).status).toBe(404);
    expect((await json(await patchGoal(bob({ title: "x" }), ctx(goal.id)))).status).toBe(404);
    expect((await json(await deleteGoal(bob(), ctx(goal.id)))).status).toBe(404);

    // Alice's data is untouched.
    expect((await json(await listTodos(req()))).body).toHaveLength(1);
    expect(await planProgress(plan.id)).toBe(0);
  });

  it("refuses cross-user links but allows the same week for different users", async () => {
    const plan = await mkPlan("2026-10-05");
    const goal = (await json(await createGoal(req({ title: "g", year: 2026 })))).body;
    const bob = makeReq(await login("bob"));

    expect((await json(await createTodo(bob({ title: "t", date: "2026-10-06", weeklyPlanId: plan.id })))).status).toBe(404);
    expect((await json(await createPlan(bob({ title: "w", startDate: "2026-10-12", goalId: goal.id })))).status).toBe(404);

    const bobPlan = await json(await createPlan(bob({ title: "bob week", startDate: "2026-10-05" })));
    expect(bobPlan.status).toBe(201);
    expect((await json(await createPlan(bob({ title: "dup", startDate: "2026-10-05" })))).status).toBe(409);
  });

  it("deleting or moving a plan never touches another user's todos, even bad data pointing at it", async () => {
    const plan = await mkPlan("2026-10-05");
    const mine = (await mkTodo({ weeklyPlanId: plan.id })).body;
    const bob = await User.create({ githubId: 777, username: "bob" });
    // A foreign todo that (through bad data) points at Alice's plan.
    const foreign = await Todo.create({ userId: bob._id, title: "foreign", date: "2026-10-06", weeklyPlanId: plan.id });

    // Progress of Alice's plan must ignore the foreign todo.
    expect(await planProgress(plan.id)).toBe(0);
    await patchTodo(req({ status: "done" }), ctx(mine.id));
    expect(await planProgress(plan.id)).toBe(100);

    // Moving the week unlinks only Alice's todos.
    await patchPlan(req({ startDate: "2026-10-12" }), ctx(plan.id));
    expect(String((await Todo.findById(foreign._id))!.weeklyPlanId)).toBe(plan.id);
    expect((await Todo.findById(mine.id))!.weeklyPlanId).toBeNull();

    // Deleting the plan likewise leaves the foreign todo's data alone.
    await deletePlan(req(), ctx(plan.id));
    expect(String((await Todo.findById(foreign._id))!.weeklyPlanId)).toBe(plan.id);
  });

  it("refuses PATCH links to another user's plan or goal", async () => {
    const bobCookie = await login("bob");
    const bob = makeReq(bobCookie);
    const bobPlan = (await json(await createPlan(bob({ title: "bw", startDate: "2026-10-05" })))).body;
    const bobGoal = (await json(await createGoal(bob({ title: "bg", year: 2026 })))).body;

    const myTodo = (await mkTodo()).body;
    const myPlan = await mkPlan("2026-10-12");
    expect((await json(await patchTodo(req({ weeklyPlanId: bobPlan.id, date: "2026-10-06" }), ctx(myTodo.id)))).status).toBe(404);
    expect((await json(await patchPlan(req({ goalId: bobGoal.id }), ctx(myPlan.id)))).status).toBe(404);
    expect((await Todo.findById(myTodo.id))!.weeklyPlanId).toBeNull();
  });
});
