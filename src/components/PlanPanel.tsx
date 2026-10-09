"use client";

import { useState } from "react";
import { ProgressBar } from "./ProgressBar";
import type { GoalItem, PlanItem } from "@/lib/types";

export type PlanDraft = { title: string; startDate: string; goalId: string | null };

export function PlanPanel({ plans, goals, selectedId, onSelect, onSave, onDelete, defaultStart }: {
  plans: PlanItem[]; goals: GoalItem[]; selectedId: string | null; defaultStart: string;
  onSelect: (id: string | null) => void;
  onSave: (id: string | null, d: PlanDraft) => Promise<void>;
  onDelete: (p: PlanItem) => void;
}) {
  const [editing, setEditing] = useState<{ id: string | null; draft: PlanDraft } | null>(null);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      await onSave(editing.id, editing.draft);
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <aside className="panel">
      <h3>주간 계획</h3>
      <ul className="list">
        {plans.map((p) => (
          <li key={p.id} className={p.id === selectedId ? "selected" : ""}>
            <button className="link" onClick={() => onSelect(p.id === selectedId ? null : p.id)}>
              {p.title} <small>{p.startDate}~{p.endDate}</small>
            </button>
            <ProgressBar value={p.progress} />
            <div className="card-actions">
              <button onClick={() => setEditing({ id: p.id, draft: { title: p.title, startDate: p.startDate, goalId: p.goalId } })}>수정</button>
              <button onClick={() => onDelete(p)}>삭제</button>
            </div>
          </li>
        ))}
        {plans.length === 0 && <li className="empty">주간 계획이 없습니다</li>}
      </ul>
      {editing ? (
        <form className="form" onSubmit={save}>
          <input aria-label="계획 제목" placeholder="주간 계획 제목" value={editing.draft.title}
            onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, title: e.target.value } })} />
          <input aria-label="시작일" type="date" value={editing.draft.startDate}
            onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, startDate: e.target.value } })} />
          <select aria-label="1년 목표" value={editing.draft.goalId ?? ""}
            onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, goalId: e.target.value || null } })}>
            <option value="">목표 미연결</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.year} {g.title}</option>)}
          </select>
          <button type="submit">저장</button>
          <button type="button" onClick={() => setEditing(null)}>취소</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      ) : (
        <button onClick={() => setEditing({ id: null, draft: { title: "", startDate: defaultStart, goalId: null } })}>
          + 주간 계획 추가
        </button>
      )}
    </aside>
  );
}
