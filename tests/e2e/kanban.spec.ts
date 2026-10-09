import { expect, test, type Page } from "@playwright/test";

function todayStr() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function mondayOf(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

async function drag(page: Page, cardTitle: string, columnTestId: string) {
  const handle = page.getByText(cardTitle, { exact: true });
  const target = page.getByTestId(columnTestId);
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 12 });
  await page.mouse.up();
}

test("drag and drop changes status, persists, and updates plan progress", async ({ page, request }) => {
  const date = todayStr();
  const monday = mondayOf(date);
  const goal = await (
    await request.post("/api/goals", { data: { title: "E2E goal", year: Number(monday.slice(0, 4)) } })
  ).json();
  const planRes = await request.post("/api/weekly-plans", {
    data: { title: "E2E plan", startDate: monday, goalId: goal.id },
  });
  expect(planRes.status()).toBe(201);
  const plan = await planRes.json();
  for (const title of ["e2e-a", "e2e-b"]) {
    const res = await request.post("/api/todos", { data: { title, date, weeklyPlanId: plan.id } });
    expect(res.status()).toBe(201);
  }

  await page.goto("/");
  await expect(page.getByTestId("column-todo").getByText("e2e-a")).toBeVisible();

  await drag(page, "e2e-a", "column-doing");
  await expect(page.getByTestId("column-doing").getByText("e2e-a")).toBeVisible();
  await drag(page, "e2e-a", "column-done");
  await expect(page.getByTestId("column-done").getByText("e2e-a")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("column-done").getByText("e2e-a")).toBeVisible();
  await expect(page.getByTestId("column-todo").getByText("e2e-b")).toBeVisible();

  const plans = await (await request.get("/api/weekly-plans")).json();
  expect(plans.find((p: { id: string }) => p.id === plan.id).progress).toBe(50);
  const goals = await (await request.get("/api/goals")).json();
  expect(goals.find((g: { id: string }) => g.id === goal.id).progress).toBe(50);
});

test("create via form, filter, and delete a todo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ 할 일 추가" }).click();
  await page.getByLabel("제목").fill("form-made");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByTestId("column-todo").getByText("form-made")).toBeVisible();

  await page.getByLabel("상태 필터").selectOption("done");
  await expect(page.getByText("form-made", { exact: true }).first()).toBeHidden();
  await page.getByRole("button", { name: "초기화" }).click();

  page.once("dialog", (d) => d.accept());
  await page
    .getByTestId("column-todo")
    .locator(".card", { hasText: "form-made" })
    .getByRole("button", { name: "삭제" })
    .click();
  await expect(page.getByText("form-made", { exact: true })).toHaveCount(0);
});

test("sidebar menu switches between dashboard, todos, weekly plans and goals", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "메뉴" });
  for (const name of ["대시보드", "할 일", "주간 계획", "1년 목표"]) {
    await expect(menu.getByRole("button", { name })).toBeVisible();
  }

  await menu.getByRole("button", { name: "1년 목표" }).click();
  await expect(page.getByRole("heading", { name: "1년 목표" })).toBeVisible();
  await expect(page.getByText("E2E goal").first()).toBeVisible();

  await menu.getByRole("button", { name: "주간 계획" }).click();
  await expect(page.getByRole("heading", { name: "주간 계획" })).toBeVisible();
  await expect(page.getByText("E2E plan").first()).toBeVisible();

  await menu.getByRole("button", { name: "대시보드" }).click();
  await expect(page.getByText("이번 주 할 일", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1년 목표 진행률" })).toBeVisible();

  await menu.getByRole("button", { name: "할 일" }).click();
  await expect(page.getByTestId("column-todo")).toBeVisible();
});

test("default weekly board hides todos from other weeks", async ({ page, request }) => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const p = (n: number) => String(n).padStart(2, "0");
  const farDate = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const res = await request.post("/api/todos", { data: { title: "far-future", date: farDate } });
  expect(res.status()).toBe(201);
  await page.goto("/");
  await expect(page.getByTestId("column-todo")).toBeVisible();
  await expect(page.getByTestId("column-todo").getByText("far-future", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "다음 주" }).click();
  await page.getByRole("button", { name: "다음 주" }).click();
  await expect(page.getByTestId("column-todo").getByText("far-future", { exact: true })).toBeVisible();
});
