import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function HomePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [joinId, setJoinId] = useState("");
  const navigate = useNavigate();

  async function createTrip(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const trip = await api.createTrip(name);
      navigate(`/trip/${trip.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setLoading(false);
    }
  }

  function joinTrip(e: React.FormEvent) {
    e.preventDefault();
    const id = joinId.trim();
    if (id) navigate(`/trip/${id}`);
  }

  return (
    <div className="page home">
      <header className="hero">
        <p className="eyebrow">Split fairly · Travel together</p>
        <h1>Group Trip</h1>
        <p className="lead">
          Create a trip, add friends, log who paid for what and for whom — then
          see exactly who owes whom at checkout.
        </p>
      </header>

      <div className="cards">
        <section className="card">
          <h2>Start a new trip</h2>
          <form onSubmit={createTrip}>
            <label htmlFor="trip-name">Trip name</label>
            <input
              id="trip-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goa 2026"
              required
            />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create trip"}
            </button>
          </form>
        </section>

        <section className="card card-muted">
          <h2>Join existing trip</h2>
          <p className="hint">Use the trip code shared by your group.</p>
          <form onSubmit={joinTrip}>
            <label htmlFor="trip-id">Trip code</label>
            <input
              id="trip-id"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="e.g. x7Kp2mN9qL"
            />
            <button type="submit" className="secondary">
              Open trip
            </button>
          </form>
        </section>
      </div>

      <ol className="steps">
        <li>Create trip & share the link or code</li>
        <li>Add everyone in the group</li>
        <li>Log expenses — who paid, amount, split with which people</li>
        <li>View balances & simplified settlements</li>
      </ol>
    </div>
  );
}
