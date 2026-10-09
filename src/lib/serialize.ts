type Doc = { _id: unknown; [k: string]: unknown };

export function idStr(v: unknown): string | null {
  return v == null ? null : String(v);
}

export function serializeTodo(t: Doc) {
  return {
    id: String(t._id),
    title: t.title as string,
    date: t.date as string,
    status: t.status as string,
    weeklyPlanId: idStr(t.weeklyPlanId),
  };
}
