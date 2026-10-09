"use client";

import { ProgressBar } from "./ProgressBar";
import { today } from "@/lib/client";
import { STATUS_LABEL, type GoalItem, type PlanItem, type TodoItem } from "@/lib/types";
import { mondayOf, weekEnd } from "@/lib/week";

export function Dashboard({ todos, plans, goals }: { todos: TodoItem[]; plans: PlanItem[]; goals: GoalItem[] }) {
  const now = today();
  const start = mondayOf(now);
  const end = weekEnd(start);
  const thisWeek = todos.filter((t) => t.date >= start && t.date <= end);
  const plan = plans.find((p) => p.startDate === start) ?? null;
  const todayTodos = todos.filter((t) => t.date === now);
  const stats = [
    { label: "이번 주 할 일", value: thisWeek.length },
    { label: "이번 주 완료", value: thisWeek.filter((t) => t.status === "done").length },
    { label: "진행 중", value: todos.filter((t) => t.status === "doing").length },
    { label: "미연결", value: todos.filter((t) => t.weeklyPlanId === null).length },
  ];

  return (
    <div className="dashboard">
      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className="stat">
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <section className="panel">
          <h3>이번 주 계획 <small>{start} ~ {end}</small></h3>
          {plan ? (
            <>
              <strong>{plan.title}</strong>
              <ProgressBar value={plan.progress} />
              <small>연결된 할 일 {plan.todoCount}개</small>
            </>
          ) : (
            <p className="empty">이번 주 주간 계획이 없습니다</p>
          )}
        </section>

        <section className="panel">
          <h3>오늘 할 일 <small>{now}</small></h3>
          <ul className="list">
            {todayTodos.map((t) => (
              <li key={t.id}>
                {t.title} <small>{STATUS_LABEL[t.status]}</small>
              </li>
            ))}
            {todayTodos.length === 0 && <li className="empty">오늘 날짜의 할 일이 없습니다</li>}
          </ul>
        </section>

        <section className="panel wide-span">
          <h3>1년 목표 진행률</h3>
          <ul className="list">
            {goals.map((g) => (
              <li key={g.id}>
                <strong>{g.year} · {g.title}</strong> <small>주간 계획 {g.planCount}개</small>
                <ProgressBar value={g.progress} />
              </li>
            ))}
            {goals.length === 0 && <li className="empty">1년 목표가 없습니다</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
