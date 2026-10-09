"use client";

import { useState } from "react";
import { ProgressBar } from "./ProgressBar";
import type { GoalItem, PlanItem } from "@/lib/types";

export function GoalPanel({ goals, plans, onSave, onDelete }: {
  goals: GoalItem[]; plans: PlanItem[];
  onSave: (id: string | null, d: { title: string; year: number }) => Promise<void>;
  onDelete: (g: GoalItem) => void;
}) {
  const [editing, setEditing] = useState<{ id: string | null; title: string; year: string } | null>(null);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      await onSave(editing.id, { title: editing.title, year: Number(editing.year) });
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="panel wide">
      <h3>1년 목표</h3>
      <ul className="list">
        {goals.map((g) => (
          <li key={g.id}>
            <strong>{g.year} · {g.title}</strong> <small>주간 계획 {g.planCount}개</small>
            <ProgressBar value={g.progress} />
            <ul className="sublist">
              {plans.filter((p) => p.goalId === g.id).map((p) => (
                <li key={p.id}>{p.title} <small>{p.startDate}~{p.endDate}</small> <ProgressBar value={p.progress} /></li>
              ))}
            </ul>
            <div className="card-actions">
              <button onClick={() => setEditing({ id: g.id, title: g.title, year: String(g.year) })}>수정</button>
              <button onClick={() => onDelete(g)}>삭제</button>
            </div>
          </li>
        ))}
        {goals.length === 0 && <li className="empty">1년 목표가 없습니다</li>}
      </ul>
      {editing ? (
        <form className="form" onSubmit={save}>
          <input aria-label="목표 제목" placeholder="1년 목표 제목" value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          <input aria-label="연도" type="number" value={editing.year}
            onChange={(e) => setEditing({ ...editing, year: e.target.value })} />
          <button type="submit">저장</button>
          <button type="button" onClick={() => setEditing(null)}>취소</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      ) : (
        <button className="primary" onClick={() => setEditing({ id: null, title: "", year: String(new Date().getFullYear()) })}>
          + 1년 목표 추가
        </button>
      )}
    </section>
  );
}
