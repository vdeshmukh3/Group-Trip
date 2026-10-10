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

type ExpenseInput = {
  payerId: string;
  amount: number;
  splitAmongIds: string[];
};

type MemberInput = { id: string; name: string };

/** Net balance: positive = others owe this person; negative = owes others */
export function computeBalances(
  members: MemberInput[],
  expenses: ExpenseInput[]
): MemberBalance[] {
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  for (const m of members) {
    paid.set(m.id, 0);
    share.set(m.id, 0);
  }

  for (const exp of expenses) {
    paid.set(exp.payerId, (paid.get(exp.payerId) ?? 0) + exp.amount);
    const ids = exp.splitAmongIds.filter((id) => share.has(id));
    if (ids.length === 0) continue;
    const perPerson = exp.amount / ids.length;
    for (const id of ids) {
      share.set(id, (share.get(id) ?? 0) + perPerson);
    }
  }

  return members.map((m) => {
    const totalPaid = paid.get(m.id) ?? 0;
    const totalShare = share.get(m.id) ?? 0;
    return {
      memberId: m.id,
      memberName: m.name,
      totalPaid: round2(totalPaid),
      totalShare: round2(totalShare),
      net: round2(totalPaid - totalShare),
    };
  });
}

/** Minimize cash transfers to settle all debts */
export function simplifyTransfers(balances: MemberBalance[]): Transfer[] {
  type Node = { id: string; name: string; amount: number };
  const creditors: Node[] = [];
  const debtors: Node[] = [];

  for (const b of balances) {
    const n = round2(b.net);
    if (n > 0.005) creditors.push({ id: b.memberId, name: b.memberName, amount: n });
    else if (n < -0.005) debtors.push({ id: b.memberId, name: b.memberName, amount: -n });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i].amount, creditors[j].amount));
    if (pay > 0.005) {
      transfers.push({
        fromId: debtors[i].id,
        fromName: debtors[i].name,
        toId: creditors[j].id,
        toName: creditors[j].name,
        amount: pay,
      });
    }
    debtors[i].amount = round2(debtors[i].amount - pay);
    creditors[j].amount = round2(creditors[j].amount - pay);
    if (debtors[i].amount <= 0.005) i++;
    if (creditors[j].amount <= 0.005) j++;
  }

  return transfers;
}

/**
 * Pairwise view: for each expense, payer is owed split shares from each participant (except self).
 * Aggregated by (debtor, creditor) pairs.
 */
export function computePairwiseDebts(
  members: MemberInput[],
  expenses: ExpenseInput[]
): PairwiseDebt[] {
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const pairMap = new Map<string, number>();

  for (const exp of expenses) {
    const ids = exp.splitAmongIds.filter((id) => nameById.has(id));
    if (ids.length === 0) continue;
    const perPerson = exp.amount / ids.length;
    for (const id of ids) {
      if (id === exp.payerId) continue;
      const key = `${id}|${exp.payerId}`;
      pairMap.set(key, (pairMap.get(key) ?? 0) + perPerson);
    }
  }

  const raw: PairwiseDebt[] = [];
  for (const [key, amount] of pairMap) {
    const [debtorId, creditorId] = key.split("|");
    raw.push({
      debtorId,
      debtorName: nameById.get(debtorId) ?? debtorId,
      creditorId,
      creditorName: nameById.get(creditorId) ?? creditorId,
      amount: round2(amount),
    });
  }

  return netPairwise(raw, nameById);
}

function netPairwise(
  debts: PairwiseDebt[],
  nameById: Map<string, string>
): PairwiseDebt[] {
  const net = new Map<string, number>();

  for (const d of debts) {
    const forward = `${d.debtorId}|${d.creditorId}`;
    const reverse = `${d.creditorId}|${d.debtorId}`;
    const rev = net.get(reverse);
    if (rev !== undefined && rev > 0) {
      const offset = Math.min(rev, d.amount);
      net.set(reverse, round2(rev - offset));
      const remaining = round2(d.amount - offset);
      if (remaining > 0.005) net.set(forward, (net.get(forward) ?? 0) + remaining);
    } else {
      net.set(forward, round2((net.get(forward) ?? 0) + d.amount));
    }
  }

  const result: PairwiseDebt[] = [];
  for (const [key, amount] of net) {
    if (amount <= 0.005) continue;
    const [debtorId, creditorId] = key.split("|");
    result.push({
      debtorId,
      debtorName: nameById.get(debtorId) ?? debtorId,
      creditorId,
      creditorName: nameById.get(creditorId) ?? creditorId,
      amount: round2(amount),
    });
  }

  result.sort((a, b) => a.debtorName.localeCompare(b.debtorName));
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
