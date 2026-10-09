import { expect, test } from "@playwright/test";
import { sessionState } from "../../playwright.config";

test.describe("logged out", () => {
  test.use({ storageState: sessionState(undefined) });

  test("shows only the login screen and every data API answers 401", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "GitHub로 로그인" })).toBeVisible();
    await expect(page.getByTestId("column-todo")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "메뉴" })).toHaveCount(0);
    for (const path of ["/api/todos", "/api/weekly-plans", "/api/goals", "/api/me"]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
  });

  test("/auth/github redirects to GitHub with a state cookie", async ({ request }) => {
    const res = await request.get("/auth/github", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const location = res.headers()["location"];
    expect(location).toContain("https://github.com/login/oauth/authorize?client_id=e2e-client-id");
    expect(location).not.toContain("e2e-client-secret");
    expect(res.headers()["set-cookie"]).toContain("oauth_state=");
  });

  test("a callback with a bad state goes back to the login screen with an error", async ({ page }) => {
    await page.goto("/auth/github/callback?code=x&state=y");
    await expect(page.locator("p.error")).toContainText("다시 시도");
    await expect(page.getByRole("link", { name: "GitHub로 로그인" })).toBeVisible();
  });
});

test.describe("logout", () => {
  test.use({ storageState: sessionState(process.env.E2E_LOGOUT_TOKEN) });

  test("returns to the login screen and the old session token stops working", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.getByText("e2e-user")).toBeVisible();
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page.getByRole("link", { name: "GitHub로 로그인" })).toBeVisible();
    await expect(page.getByTestId("column-todo")).toHaveCount(0);

    const replay = await request.get("/api/me", {
      headers: { cookie: `session=${process.env.E2E_LOGOUT_TOKEN}` },
    });
    expect(replay.status()).toBe(401);

    await page.reload();
    await expect(page.getByRole("link", { name: "GitHub로 로그인" })).toBeVisible();
  });
});
