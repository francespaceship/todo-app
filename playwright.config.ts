import { defineConfig } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3100";

export const sessionState = (token: string | undefined) => ({
  cookies: token
    ? [
        {
          name: "session",
          value: token,
          domain: new URL(baseURL).hostname,
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax" as const,
          expires: -1,
        },
      ]
    : [],
  origins: [],
});

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL, headless: true, storageState: sessionState(process.env.E2E_SESSION_TOKEN) },
});
