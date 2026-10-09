export type Status = "todo" | "doing" | "done";
export const STATUS_LABEL: Record<Status, string> = { todo: "할 일", doing: "진행 중", done: "완료" };
export const COLUMNS: Status[] = ["todo", "doing", "done"];

export type TodoItem = { id: string; title: string; date: string; status: Status; weeklyPlanId: string | null };
export type PlanItem = {
  id: string; title: string; startDate: string; endDate: string;
  goalId: string | null; todoCount: number; progress: number;
};
export type GoalItem = { id: string; title: string; year: number; planCount: number; progress: number };
