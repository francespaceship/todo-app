"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "@/components/Board";
import { Dashboard } from "@/components/Dashboard";
import { GoalPanel } from "@/components/GoalPanel";
import { PlanPanel, type PlanDraft } from "@/components/PlanPanel";
import { ProgressBar } from "@/components/ProgressBar";
import { TodoForm, draftFrom, type TodoDraft } from "@/components/TodoForm";
import { LoginScreen } from "@/components/LoginScreen";
import { ApiError, api, today } from "@/lib/client";
import { COLUMNS, STATUS_LABEL, type GoalItem, type PlanItem, type Status, type TodoItem } from "@/lib/types";
import { addDays, mondayOf, weekEnd } from "@/lib/week";

type Section = "dashboard" | "todos" | "plans" | "goals";
const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "dashboard", label: "대시보드", icon: "📊" },
  { id: "todos", label: "할 일", icon: "✅" },
  { id: "plans", label: "주간 계획", icon: "🗓️" },
  { id: "goals", label: "1년 목표", icon: "🎯" },
];
type View = "daily" | "weekly";
const VIEW_LABEL: Record<View, string> = { daily: "일일", weekly: "주간" };
type WithNotices = { notices?: string[] };
type Me = { id: string; username: string; avatarUrl: string };

export default function Home() {
  // undefined = still checking the session, null = logged out
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [startupError, setStartupError] = useState("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [section, setSection] = useState<Section>("todos");
  const [view, setView] = useState<View>("weekly");
  const [day, setDay] = useState(today());
  const [weekStart, setWeekStart] = useState(mondayOf(today()));
  const [filter, setFilter] = useState({ status: "", date: "", plan: "" });
  const [form, setForm] = useState<{ id: string | null; draft: TodoDraft } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const reloadSeq = useRef(0);

  // Only the newest reload may write state, so a slow older response can't clobber newer data.
  const reloadAll = useCallback(async () => {
    const seq = ++reloadSeq.current;
    try {
      const [t, p, g] = await Promise.all([
        api<TodoItem[]>("/api/todos"),
        api<PlanItem[]>("/api/weekly-plans"),
        api<GoalItem[]>("/api/goals"),
      ]);
      if (seq !== reloadSeq.current) return;
      setTodos(t);
      setPlans(p);
      setGoals(g);
    } catch (err) {
      if (seq !== reloadSeq.current) return;
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else setError((err as Error).message);
    } finally {
      if (seq === reloadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    api<Me>("/api/me")
      .then((user) => {
        setMe(user);
        return reloadAll();
      })
      .catch((err) => {
        // Only a 401 means "logged out"; anything else is a server problem, not a logout.
        if (err instanceof ApiError && err.status === 401) setMe(null);
        else setStartupError((err as Error).message);
      });
  }, [reloadAll]);

  async function logout() {
    const res = await fetch("/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      setError("로그아웃하지 못했습니다. 네트워크와 서버 상태를 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    setTodos([]);
    setPlans([]);
    setGoals([]);
    setForm(null);
    setMe(null);
  }

  async function run<T>(action: () => Promise<T>): Promise<T> {
    setError("");
    try {
      const result = await action();
      const notices = (result as WithNotices | undefined)?.notices;
      if (notices?.length) setNotice(notices.join(" · "));
      return result;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else setError((err as Error).message);
      throw err;
    } finally {
      await reloadAll();
    }
  }

  async function moveTodo(id: string, status: Status) {
    const before = todos.find((t) => t.id === id)?.status;
    if (!before) return;
    reloadSeq.current++; // invalidate in-flight reloads that predate this move
    setTodos((cur) => cur.map((t) => (t.id === id ? { ...t, status } : t)));
    setError("");
    try {
      await api(`/api/todos/${id}`, "PATCH", { status });
    } catch (err) {
      // Roll back this card only, and only if a newer move hasn't changed it since.
      setTodos((cur) => cur.map((t) => (t.id === id && t.status === status ? { ...t, status: before } : t)));
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else setError(`상태 변경 실패: ${(err as Error).message}`);
    }
    // Server state is authoritative: refetch todos, plans and goals (also picks up
    // changes from any reload this move invalidated).
    await reloadAll();
  }

  async function saveTodo(d: TodoDraft) {
    const id = form?.id;
    const original = id ? todos.find((t) => t.id === id) : undefined;
    await run(() => (id ? api(`/api/todos/${id}`, "PATCH", d) : api("/api/todos", "POST", d)));
    if (original?.weeklyPlanId && !d.weeklyPlanId && original.date !== d.date) {
      setNotice("날짜가 주간 계획 기간을 벗어나 연결이 해제되었습니다");
    }
    setForm(null);
  }

  const deleteTodo = (t: TodoItem) => {
    if (confirm(`"${t.title}" 할 일을 삭제할까요?`)) void run(() => api(`/api/todos/${t.id}`, "DELETE")).catch(() => {});
  };
  const savePlan = async (id: string | null, d: PlanDraft) => {
    await run(() => (id ? api(`/api/weekly-plans/${id}`, "PATCH", d) : api("/api/weekly-plans", "POST", d)));
  };
  const deletePlan = (p: PlanItem) => {
    if (confirm(`"${p.title}" 주간 계획을 삭제할까요? 연결된 할 일은 유지됩니다.`)) {
      void run(() => api(`/api/weekly-plans/${p.id}`, "DELETE")).catch(() => {});
    }
  };
  const saveGoal = async (id: string | null, d: { title: string; year: number }) => {
    await run(() => (id ? api(`/api/goals/${id}`, "PATCH", d) : api("/api/goals", "POST", d)));
  };
  const deleteGoal = (g: GoalItem) => {
    if (confirm(`"${g.title}" 목표를 삭제할까요? 연결된 주간 계획은 유지됩니다.`)) {
      void run(() => api(`/api/goals/${g.id}`, "DELETE")).catch(() => {});
    }
  };

  const thisWeekEnd = weekEnd(weekStart);
  const currentPlan = useMemo(() => plans.find((p) => p.startDate === weekStart) ?? null, [plans, weekStart]);

  const base = useMemo(() => {
    if (view === "daily") return todos.filter((t) => t.date === day);
    return todos.filter((t) => t.date >= weekStart && t.date <= thisWeekEnd);
  }, [view, todos, day, weekStart, thisWeekEnd]);

  const visible = base.filter(
    (t) =>
      (!filter.status || t.status === filter.status) &&
      (!filter.date || t.date === filter.date) &&
      (!filter.plan || (filter.plan === "none" ? t.weeklyPlanId === null : t.weeklyPlanId === filter.plan)),
  );
  const unlinked = todos.filter((t) => t.weeklyPlanId === null);

  const openNew = () =>
    setForm({
      id: null,
      draft: {
        title: "",
        date: view === "daily" ? day : weekStart <= today() && today() <= thisWeekEnd ? today() : weekStart,
        status: "todo",
        weeklyPlanId: view === "weekly" ? currentPlan?.id ?? null : null,
      },
    });
  const openEdit = (t: TodoItem) => setForm({ id: t.id, draft: draftFrom(t) });
  const gotoPlan = (id: string | null) => {
    const plan = plans.find((p) => p.id === id);
    if (plan) {
      setWeekStart(plan.startDate);
      setView("weekly");
      setSection("todos");
    }
  };

  if (startupError) {
    return (
      <div className="login">
        <div className="login-card">
          <p className="error" role="alert">서버에 연결하지 못했습니다: {startupError}</p>
          <button onClick={() => window.location.reload()}>다시 시도</button>
        </div>
      </div>
    );
  }
  if (me === undefined) return <p style={{ padding: 16 }}>불러오는 중…</p>;
  if (me === null) return <LoginScreen />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>할 일 관리</h1>
        <nav aria-label="메뉴">
          {SECTIONS.map((s) => (
            <button key={s.id} className={`nav-item${s.id === section ? " active" : ""}`}
              aria-current={s.id === section ? "page" : undefined} onClick={() => setSection(s.id)}>
              <span className="nav-icon" aria-hidden="true">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="user-box" title={`GitHub: ${me.username}`}>
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="" width={36} height={36} className="avatar" />
          ) : (
            <span className="avatar avatar-fallback" aria-hidden="true">{me.username.slice(0, 1).toUpperCase()}</span>
          )}
          <div className="user-info">
            <span className="username">{me.username}</span>
            <button className="logout" onClick={logout}>로그아웃</button>
          </div>
        </div>
      </aside>

      <main>
      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")}>닫기</button>
        </div>
      )}
      {notice && (
        <div className="banner info" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>닫기</button>
        </div>
      )}
      {loading && <p>불러오는 중…</p>}

      {section === "dashboard" && <Dashboard todos={todos} plans={plans} goals={goals} />}

      {section === "todos" && (
          <div>
            <div className="toolbar">
              <nav className="tabs" aria-label="기간 뷰">
                {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                  <button key={v} className={v === view ? "active" : ""} onClick={() => setView(v)}>{VIEW_LABEL[v]}</button>
                ))}
              </nav>
              {view === "daily" && <input aria-label="날짜 선택" type="date" value={day} onChange={(e) => setDay(e.target.value || today())} />}
              {view === "weekly" && (
                <>
                  <button aria-label="이전 주" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
                  <button onClick={() => setWeekStart(mondayOf(today()))}>이번 주</button>
                  <button aria-label="다음 주" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
                  <strong>{weekStart} ~ {thisWeekEnd}</strong>
                  {currentPlan ? (
                    <>
                      <span>{currentPlan.title}</span>
                      <div style={{ minWidth: 160 }}><ProgressBar value={currentPlan.progress} /></div>
                    </>
                  ) : (
                    <small>이 주의 주간 계획 없음</small>
                  )}
                </>
              )}
              <button onClick={openNew}>+ 할 일 추가</button>
            </div>

            {form && (
              <TodoForm key={form.id ?? "new"} initial={form.draft} plans={plans} onSubmit={saveTodo} onCancel={() => setForm(null)} />
            )}

            <div className="filters">
              <span>필터</span>
              <select aria-label="상태 필터" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                <option value="">모든 상태</option>
                {COLUMNS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <input aria-label="날짜 필터" type="date" value={filter.date} onChange={(e) => setFilter({ ...filter, date: e.target.value })} />
              <select aria-label="주간 계획 필터" value={filter.plan} onChange={(e) => setFilter({ ...filter, plan: e.target.value })}>
                <option value="">모든 계획</option>
                <option value="none">미연결</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {(filter.status || filter.date || filter.plan) && <button onClick={() => setFilter({ status: "", date: "", plan: "" })}>초기화</button>}
            </div>

            <Board todos={visible} plans={plans} onMove={moveTodo} onEdit={openEdit} onDelete={deleteTodo} />

            <section className="panel" style={{ marginTop: 16 }}>
              <h3>미연결 할 일 <span className="count">{unlinked.length}</span></h3>
              <ul className="list" data-testid="unlinked-list">
                {unlinked.map((t) => (
                  <li key={t.id}>
                    {t.title} <small>{t.date} · {STATUS_LABEL[t.status]}</small>{" "}
                    <button onClick={() => openEdit(t)}>수정</button>
                  </li>
                ))}
                {unlinked.length === 0 && <li className="empty">모든 할 일이 주간 계획에 연결되어 있습니다</li>}
              </ul>
            </section>
          </div>
      )}

      {section === "plans" && (
        <PlanPanel plans={plans} goals={goals} selectedId={currentPlan?.id ?? null}
          onSelect={gotoPlan} onSave={savePlan} onDelete={deletePlan} defaultStart={mondayOf(today())} />
      )}

      {section === "goals" && <GoalPanel goals={goals} plans={plans} onSave={saveGoal} onDelete={deleteGoal} />}
      </main>
    </div>
  );
}
