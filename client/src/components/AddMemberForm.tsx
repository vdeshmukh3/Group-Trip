import { useState } from "react";
import { api } from "../api";

type Props = {
  tripId: string;
  onAdded: () => void;
};

export default function AddMemberForm({ tripId, onAdded }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.addMember(tripId, name);
      setName("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Person's name"
        required
      />
      <button type="submit" disabled={loading}>
        Add person
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
