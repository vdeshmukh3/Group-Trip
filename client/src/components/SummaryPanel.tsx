import { formatMoney, type TripPayload } from "../api";

type Props = {
  summary: TripPayload["summary"];
};

export default function SummaryPanel({ summary }: Props) {
  const { balances, settlements, pairwise } = summary;

  return (
    <div className="summary-stack">
      <section className="card summary-card">
        <h2>Who spent what</h2>
        {balances.length === 0 ? (
          <p className="hint">Add members and expenses to see totals.</p>
        ) : (
          <table className="balance-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Paid</th>
                <th>Share</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.memberId}>
                  <td>{b.memberName}</td>
                  <td>{formatMoney(b.totalPaid)}</td>
                  <td>{formatMoney(b.totalShare)}</td>
                  <td className={b.net >= 0 ? "positive" : "negative"}>
                    {b.net >= 0 ? "+" : ""}
                    {formatMoney(b.net)}
                    <span className="net-hint">
                      {b.net > 0.01
                        ? " to receive"
                        : b.net < -0.01
                          ? " to pay"
                          : " settled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card summary-card">
        <h2>Give / take by person</h2>
        <p className="hint">
          Who should pay back whom for the expenses they shared — e.g. if Varad
          paid for dinner, Aparna pays Varad here.
        </p>
        {pairwise.length === 0 ? (
          <p className="muted">No pairwise debts yet.</p>
        ) : (
          <ul className="settlement-list pairwise">
            {pairwise.map((p, i) => (
              <li key={i}>
                <strong>{p.debtorName}</strong> gives{" "}
                <strong>{formatMoney(p.amount)}</strong> to{" "}
                <strong>{p.creditorName}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card summary-card">
        <h2>Settle up (fewest payments)</h2>
        <p className="hint">
          Optional shortcut: same final balances, but some pay a different
          person (e.g. Aparna → Arun instead of Varad) so the group needs fewer
          UPI transfers. Use “Give / take” above if you want to pay the person
          who actually spent.
        </p>
        {settlements.length === 0 ? (
          <p className="muted">Everyone is even — or no expenses yet.</p>
        ) : (
          <ul className="settlement-list">
            {settlements.map((t, i) => (
              <li key={i}>
                <strong>{t.fromName}</strong> pays{" "}
                <strong>{formatMoney(t.amount)}</strong> to{" "}
                <strong>{t.toName}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
