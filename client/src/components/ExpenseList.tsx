import { useState } from "react";
import { formatMoney, type Expense, type Member } from "../api";
import ExpenseForm from "./ExpenseForm";

type Props = {
  tripId: string;
  expenses: Expense[];
  members: Member[];
  onChanged: () => void;
  onDelete: (id: string) => void;
};

export default function ExpenseList({
  tripId,
  expenses,
  members,
  onChanged,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  if (expenses.length === 0) {
    return <p className="hint">No expenses yet. Add the first one above.</p>;
  }

  return (
    <ul className="expense-list">
      {expenses.map((e) => {
        const isEditing = editingId === e.id;
        const splitNames = e.splitAmongIds
          .map((id) => nameById.get(id) ?? "?")
          .join(", ");
        const perPerson =
          e.splitAmongIds.length > 0 ? e.amount / e.splitAmongIds.length : 0;

        if (isEditing) {
          return (
            <li key={e.id} className="expense-item expense-item-editing">
              <p className="hint editing-label">Editing expense</p>
              <ExpenseForm
                tripId={tripId}
                members={members}
                expense={e}
                formId={`edit-expense-${e.id}`}
                onSaved={() => {
                  setEditingId(null);
                  onChanged();
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          );
        }

        return (
          <li key={e.id} className="expense-item">
            <div className="expense-main">
              <strong>{e.description}</strong>
              <span className="amount">{formatMoney(e.amount)}</span>
            </div>
            <p className="expense-detail">
              Paid by <em>{nameById.get(e.payer_id)}</em> · Split with:{" "}
              {splitNames}
              {e.splitAmongIds.length > 1 && (
                <> ({formatMoney(perPerson)} each)</>
              )}
            </p>
            <div className="expense-actions">
              <button
                type="button"
                className="link-btn"
                onClick={() => setEditingId(e.id)}
              >
                Edit
              </button>
              <button
                type="button"
                className="link-btn danger"
                onClick={() => onDelete(e.id)}
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
