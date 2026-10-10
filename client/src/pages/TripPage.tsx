import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatMoney, type TripPayload } from "../api";
import AddMemberForm from "../components/AddMemberForm";
import AddExpenseForm from "../components/AddExpenseForm";
import ExpenseList from "../components/ExpenseList";
import SummaryPanel from "../components/SummaryPanel";

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [data, setData] = useState<TripPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    setError("");
    try {
      setData(await api.getTrip(tripId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trip not found");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/trip/${tripId}`
      : "";

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
  }

  if (loading) {
    return (
      <div className="page center">
        <p className="muted">Loading trip…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page center">
        <h1>Trip not found</h1>
        <p className="error">{error}</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }

  const { trip, members, expenses, summary } = data;
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="page trip">
      <header className="trip-header">
        <div>
          <Link to="/" className="back">
            ← All trips
          </Link>
          <h1>{trip.name}</h1>
          <p className="meta">
            Code: <code>{trip.id}</code> · {members.length} members ·{" "}
            {formatMoney(totalSpent)} total logged
          </p>
        </div>
        <button type="button" className="secondary" onClick={copyLink}>
          Copy invite link
        </button>
      </header>

      <div className="trip-grid">
        <div className="trip-main">
          <section className="card">
            <h2>People</h2>
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.id}>{m.name}</li>
              ))}
            </ul>
            {members.length === 0 && (
              <p className="hint">Add at least two people before logging expenses.</p>
            )}
            <AddMemberForm tripId={trip.id} onAdded={load} />
          </section>

          <section className="card">
            <h2>Add expense</h2>
            <AddExpenseForm
              tripId={trip.id}
              members={members}
              onAdded={load}
              disabled={members.length < 1}
            />
          </section>

          <section className="card">
            <h2>Expenses</h2>
            <ExpenseList
              tripId={trip.id}
              expenses={expenses}
              members={members}
              onChanged={load}
              onDelete={async (id) => {
                await api.deleteExpense(id);
                load();
              }}
            />
          </section>
        </div>

        <aside className="trip-aside">
          <SummaryPanel summary={summary} />
        </aside>
      </div>
    </div>
  );
}
