import { useEffect, useState } from "react";
import { api, type Expense, type Member } from "../api";

export type ExpenseFormValues = {
  payerId: string;
  description: string;
  amount: number;
  splitAmongIds: string[];
};

type Props = {
  tripId: string;
  members: Member[];
  expense?: Expense;
  onSaved: () => void;
  onCancel?: () => void;
  formId?: string;
};

export default function ExpenseForm({
  tripId,
  members,
  expense,
  onSaved,
  onCancel,
  formId = "expense-form",
}: Props) {
  const isEdit = Boolean(expense);

  const [payerId, setPayerId] = useState(expense?.payer_id ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(
    expense ? String(expense.amount) : ""
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(expense?.splitAmongIds ?? [])
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (expense) {
      setPayerId(expense.payer_id);
      setDescription(expense.description);
      setAmount(String(expense.amount));
      setSelected(new Set(expense.splitAmongIds));
      return;
    }
    if (members.length && !payerId) setPayerId(members[0].id);
    if (!expense) setSelected(new Set(members.map((m) => m.id)));
  }, [members, expense, payerId]);

  function toggleMember(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(members.map((m) => m.id)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (selected.size === 0) {
      setError("Select who this expense is for");
      return;
    }
    const payload: ExpenseFormValues = {
      payerId,
      description,
      amount: num,
      splitAmongIds: [...selected],
    };
    setLoading(true);
    try {
      if (isEdit && expense) {
        await api.updateExpense(expense.id, payload);
      } else {
        await api.addExpense(tripId, payload);
      }
      if (!isEdit) {
        setDescription("");
        setAmount("");
        setSelected(new Set(members.map((m) => m.id)));
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const payerFieldId = `${formId}-payer`;
  const amountFieldId = `${formId}-amount`;
  const descFieldId = `${formId}-desc`;

  return (
    <form className="expense-form" id={formId} onSubmit={submit}>
      <div className="field-row">
        <div>
          <label htmlFor={payerFieldId}>Paid by</label>
          <select
            id={payerFieldId}
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={amountFieldId}>Amount</label>
          <input
            id={amountFieldId}
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor={descFieldId}>Description</label>
        <input
          id={descFieldId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Dinner, cab, hotel…"
        />
      </div>

      <fieldset>
        <legend>
          Split among{" "}
          <button type="button" className="link-btn" onClick={selectAll}>
            (everyone)
          </button>
        </legend>
        <div className="checkbox-grid">
          {members.map((m) => (
            <label key={m.id} className="checkbox">
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => toggleMember(m.id)}
              />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={loading}>
          {loading ? "Saving…" : isEdit ? "Save changes" : "Add expense"}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
