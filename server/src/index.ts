import express from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import {
  computeBalances,
  computePairwiseDebts,
  simplifyTransfers,
} from "./settlement.js";

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getTripPayload(tripId: string) {
  const trip = db.trips.find((item) => item.id === tripId);
  if (!trip) return null;

  const members = db.members
    .filter((member) => member.trip_id === tripId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const expenses = db.expenses
    .filter((expense) => expense.trip_id === tripId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const expensesWithSplits = expenses.map((e) => ({
    ...e,
    splitAmongIds: db.expenseSplits
      .filter((split) => split.expense_id === e.id)
      .map((split) => split.member_id),
  }));

  const membersInput = members.map((m) => ({ id: m.id, name: m.name }));
  const expenseInput = expensesWithSplits.map((e) => ({
    payerId: e.payer_id,
    amount: e.amount,
    splitAmongIds: e.splitAmongIds,
  }));

  const balances = computeBalances(membersInput, expenseInput);
  const settlements = simplifyTransfers(balances);
  const pairwise = computePairwiseDebts(membersInput, expenseInput);

  return {
    trip,
    members,
    expenses: expensesWithSplits,
    summary: { balances, settlements, pairwise },
  };
}

app.post("/api/trips", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Trip name is required" });
    return;
  }
  const id = nanoid(10);
  await db.addTrip({ id, name, created_at: new Date().toISOString() });
  res.status(201).json({ id, name });
});

app.get("/api/trips/:id", (req, res) => {
  const payload = getTripPayload(req.params.id);
  if (!payload) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }
  res.json(payload);
});

app.post("/api/trips/:id/members", async (req, res) => {
  const tripId = req.params.id;
  const trip = db.trips.find((item) => item.id === tripId);
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Member name is required" });
    return;
  }
  const id = nanoid(10);
  const member = { id, trip_id: tripId, name, created_at: new Date().toISOString() };
  await db.addMember(member);
  res.status(201).json(member);
});

app.post("/api/trips/:id/expenses", async (req, res) => {
  const tripId = req.params.id;
  const trip = db.trips.find((item) => item.id === tripId);
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  const payerId = String(req.body?.payerId ?? "");
  const description = String(req.body?.description ?? "").trim() || "Expense";
  const amount = Number(req.body?.amount);
  const splitAmongIds: string[] = Array.isArray(req.body?.splitAmongIds)
    ? req.body.splitAmongIds.map(String)
    : [];

  if (!payerId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Valid payer and amount are required" });
    return;
  }
  if (splitAmongIds.length === 0) {
    res.status(400).json({ error: "Select at least one person to split with" });
    return;
  }

  const memberIds = new Set(
    db.members.filter((member) => member.trip_id === tripId).map((m) => m.id)
  );
  if (!memberIds.has(payerId)) {
    res.status(400).json({ error: "Payer must be a trip member" });
    return;
  }
  for (const id of splitAmongIds) {
    if (!memberIds.has(id)) {
      res.status(400).json({ error: "Invalid split member" });
      return;
    }
  }

  const id = nanoid(10);
  const created_at = new Date().toISOString();
  await db.addExpense(
    { id, trip_id: tripId, payer_id: payerId, description, amount, created_at },
    splitAmongIds
  );

  res.status(201).json({
    id,
    trip_id: tripId,
    payer_id: payerId,
    description,
    amount,
    created_at,
    splitAmongIds,
  });
});

function parseExpenseBody(body: unknown) {
  const payerId = String((body as { payerId?: string })?.payerId ?? "");
  const description =
    String((body as { description?: string })?.description ?? "").trim() ||
    "Expense";
  const amount = Number((body as { amount?: number })?.amount);
  const splitAmongIds: string[] = Array.isArray(
    (body as { splitAmongIds?: unknown })?.splitAmongIds
  )
    ? (body as { splitAmongIds: unknown[] }).splitAmongIds.map(String)
    : [];
  return { payerId, description, amount, splitAmongIds };
}

function validateExpenseForTrip(
  tripId: string,
  payerId: string,
  amount: number,
  splitAmongIds: string[]
): string | null {
  if (!payerId || !Number.isFinite(amount) || amount <= 0) {
    return "Valid payer and amount are required";
  }
  if (splitAmongIds.length === 0) {
    return "Select at least one person to split with";
  }
  const memberIds = new Set(
    db.members.filter((member) => member.trip_id === tripId).map((m) => m.id)
  );
  if (!memberIds.has(payerId)) return "Payer must be a trip member";
  for (const id of splitAmongIds) {
    if (!memberIds.has(id)) return "Invalid split member";
  }
  return null;
}

app.patch("/api/expenses/:id", async (req, res) => {
  const expenseId = req.params.id;
  const existing = db.expenses.find((expense) => expense.id === expenseId);
  if (!existing) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  const { payerId, description, amount, splitAmongIds } = parseExpenseBody(
    req.body
  );
  const err = validateExpenseForTrip(
    existing.trip_id,
    payerId,
    amount,
    splitAmongIds
  );
  if (err) {
    res.status(400).json({ error: err });
    return;
  }

  await db.updateExpense(
    expenseId,
    { payer_id: payerId, description, amount },
    splitAmongIds
  );

  res.json({
    id: expenseId,
    trip_id: existing.trip_id,
    payer_id: payerId,
    description,
    amount,
    splitAmongIds,
  });
});

app.delete("/api/expenses/:id", async (req, res) => {
  const deleted = await db.deleteExpense(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.status(204).send();
});

const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Not found");
  });
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`Group Trip API on http://localhost:${PORT}`);
});
