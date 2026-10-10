export type Trip = { id: string; name: string; created_at: string };
export type Member = { id: string; trip_id: string; name: string; created_at: string };
export type Expense = {
  id: string;
  trip_id: string;
  payer_id: string;
  description: string;
  amount: number;
  created_at: string;
  splitAmongIds: string[];
};

export type MemberBalance = {
  memberId: string;
  memberName: string;
  totalPaid: number;
  totalShare: number;
  net: number;
};

export type Transfer = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

export type PairwiseDebt = {
  debtorId: string;
  debtorName: string;
  creditorId: string;
  creditorName: string;
  amount: number;
};

export type TripPayload = {
  trip: Trip;
  members: Member[];
  expenses: Expense[];
  summary: {
    balances: MemberBalance[];
    settlements: Transfer[];
    pairwise: PairwiseDebt[];
  };
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  createTrip: (name: string) =>
    request<{ id: string; name: string }>("/api/trips", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getTrip: (id: string) => request<TripPayload>(`/api/trips/${id}`),
  addMember: (tripId: string, name: string) =>
    request<Member>(`/api/trips/${tripId}/members`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  addExpense: (
    tripId: string,
    data: {
      payerId: string;
      description: string;
      amount: number;
      splitAmongIds: string[];
    }
  ) =>
    request<Expense>(`/api/trips/${tripId}/expenses`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateExpense: (
    id: string,
    data: {
      payerId: string;
      description: string;
      amount: number;
      splitAmongIds: string[];
    }
  ) =>
    request<Expense>(`/api/expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteExpense: (id: string) =>
    request<void>(`/api/expenses/${id}`, { method: "DELETE" }),
};

export function formatMoney(n: number, currency = "₹") {
  return `${currency}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
