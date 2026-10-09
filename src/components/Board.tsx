"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { COLUMNS, STATUS_LABEL, type PlanItem, type Status, type TodoItem } from "@/lib/types";

function Card({ todo, plan, onEdit, onDelete }: {
  todo: TodoItem; plan?: PlanItem; onEdit: (t: TodoItem) => void; onDelete: (t: TodoItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: todo.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={`card${isDragging ? " dragging" : ""}`} data-testid={`card-${todo.id}`}>
      <div className="card-title" {...listeners} {...attributes}>{todo.title}</div>
      <div className="card-meta">
        {todo.date}{plan ? ` · ${plan.title}` : " · 미연결"}
      </div>
      <div className="card-actions">
        <button onClick={() => onEdit(todo)}>수정</button>
        <button onClick={() => onDelete(todo)}>삭제</button>
      </div>
    </div>
  );
}

function Column({ status, children, count }: { status: Status; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={`column${isOver ? " over" : ""}`} data-testid={`column-${status}`}>
      <h3>{STATUS_LABEL[status]} <span className="count">{count}</span></h3>
      <div className="column-body">{children}</div>
    </section>
  );
}

export function Board({ todos, plans, onMove, onEdit, onDelete }: {
  todos: TodoItem[]; plans: PlanItem[];
  onMove: (id: string, status: Status) => void;
  onEdit: (t: TodoItem) => void; onDelete: (t: TodoItem) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const planById = new Map(plans.map((p) => [p.id, p]));

  function handleDragEnd(e: DragEndEvent) {
    const target = e.over?.id as Status | undefined;
    if (!target || !COLUMNS.includes(target)) return;
    const todo = todos.find((t) => t.id === e.active.id);
    if (todo && todo.status !== target) onMove(todo.id, target);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="board">
        {COLUMNS.map((status) => {
          const items = todos.filter((t) => t.status === status);
          return (
            <Column key={status} status={status} count={items.length}>
              {items.map((t) => (
                <Card key={t.id} todo={t} plan={t.weeklyPlanId ? planById.get(t.weeklyPlanId) : undefined}
                  onEdit={onEdit} onDelete={onDelete} />
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}
