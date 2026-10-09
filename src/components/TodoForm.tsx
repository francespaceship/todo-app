"use client";

import { useState } from "react";
import { isDateInWeek } from "@/lib/week";
import { COLUMNS, STATUS_LABEL, type PlanItem, type Status, type TodoItem } from "@/lib/types";

export type TodoDraft = { title: string; date: string; status: Status; weeklyPlanId: string | null };

export function TodoForm({ initial, plans, onSubmit, onCancel }: {
  initial: TodoDraft; plans: PlanItem[];
  onSubmit: (d: TodoDraft) => Promise<void>; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const candidates = plans.filter((p) => draft.date && isDateInWeek(draft.date, p.startDate));
  const planValue = candidates.some((p) => p.id === draft.weeklyPlanId) ? draft.weeklyPlanId ?? "" : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!draft.title.trim() || !draft.date) return setError("제목과 날짜는 필수입니다");
    try {
      await onSubmit({ ...draft, weeklyPlanId: planValue || null });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <input aria-label="제목" placeholder="할 일 제목" value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      <input aria-label="날짜" type="date" value={draft.date}
        onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
      <select aria-label="상태" value={draft.status}
        onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>
        {COLUMNS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <select aria-label="주간 계획" value={planValue}
        onChange={(e) => setDraft({ ...draft, weeklyPlanId: e.target.value || null })}>
        <option value="">미연결</option>
        {candidates.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.startDate}~{p.endDate})</option>)}
      </select>
      <button type="submit">저장</button>
      <button type="button" onClick={onCancel}>취소</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

export const draftFrom = (t: TodoItem): TodoDraft =>
  ({ title: t.title, date: t.date, status: t.status, weeklyPlanId: t.weeklyPlanId });
