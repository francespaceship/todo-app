import { describe, expect, it } from "vitest";
import { addDays, isDateInWeek, isMonday, isValidDate, mondayOf, weekEnd } from "@/lib/week";
import { goalProgress, progress } from "@/lib/progress";

describe("week", () => {
  it("weekEnd is start + 6 days, across month boundary", () => {
    expect(weekEnd("2026-10-05")).toBe("2026-10-11");
    expect(weekEnd("2026-10-28")).toBe("2026-11-03");
  });
  it("isDateInWeek is inclusive on both ends", () => {
    expect(isDateInWeek("2026-10-05", "2026-10-05")).toBe(true);
    expect(isDateInWeek("2026-10-11", "2026-10-05")).toBe(true);
    expect(isDateInWeek("2026-10-12", "2026-10-05")).toBe(false);
    expect(isDateInWeek("2026-10-04", "2026-10-05")).toBe(false);
  });
  it("isValidDate rejects bad formats and impossible dates", () => {
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-2-3")).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
    expect(isValidDate("2026-10-04")).toBe(true);
  });
});

describe("monday helpers", () => {
  it("mondayOf maps any weekday (and Sunday) to its Monday", () => {
    expect(mondayOf("2026-10-04")).toBe("2026-09-28");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });
  it("isMonday and addDays", () => {
    expect(isMonday("2026-10-05")).toBe(true);
    expect(isMonday("2026-10-06")).toBe(false);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("progress", () => {
  it("is 0 with no todos", () => expect(progress([])).toBe(0));
  it("is 33 for 1 done of 3", () => expect(progress(["done", "todo", "doing"])).toBe(33));
  it("is 100 when all done", () => expect(progress(["done", "done"])).toBe(100));
  it("goalProgress averages and is 0 for none", () => {
    expect(goalProgress([])).toBe(0);
    expect(goalProgress([100, 0, 50])).toBe(50);
  });
});
