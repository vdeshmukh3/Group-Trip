import express, { type RequestHandler } from "express";
import cors from "cors";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";
import {
  initializeDatabase,
  query,
  withTransaction,
  type Expense,
  type Member,
  type Trip,
} from "./db.js";
import {
  computeBalances,
  computePairwiseDebts,
  simplifyTransfers,
} from "./settlement.js";

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const asyncRoute = (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

async function getTripPayload(tripId: string) {
  const tripResult = await query<Trip>("SELECT * FROM trips WHERE id = $1", [
    tripId,
  ]);
  const trip = tripResult.rows[0];
  if (!trip) return null;

  const [memberResult, expenseResult] = await Promise.all([
    query<Member>(
      "SELECT * FROM members WHERE trip_id = $1 ORDER BY created_at",
      [tripId]
    ),
    query<Expense>(
      "SELECT * FROM expenses WHERE trip_id = $1 ORDER BY created_at DESC",
      [tripId]
    ),
  ]);
  const members = memberResult.rows;
  const expenses = expenseResult.rows;
  const expenseIds = expenses.map((expense) => expense.id);
  const splitResult = expenseIds.length
    ? await query<{ expense_id: string; member_id: string }>(
        "SELECT expense_id, member_id FROM expense_splits WHERE expense_id = ANY($1::text[])",
        [expenseIds]
      )
    : { rows: [] };
  const splitsByExpense = new Map<string, string[]>();
  for (const split of splitResult.rows) {
    const ids = splitsByExpense.get(split.expense_id) ?? [];
    ids.push(split.member_id);
    splitsByExpense.set(split.expense_id, ids);
  }

  const expensesWithSplits = expenses.map((expense) => ({
    ...expense,
    splitAmongIds: splitsByExpense.get(expense.id) ?? [],
  }));
  const membersInput = members.map(({ id, name }) => ({ id, name }));
  const expenseInput = expensesWithSplits.map((expense) => ({
    payerId: expense.payer_id,
    amount: expense.amount,
    splitAmongIds: expense.splitAmongIds,
  }));
  const balances = computeBalances(membersInput, expenseInput);

  return {
    trip,
    members,
    expenses: expensesWithSplits,
    summary: {
      balances,
      settlements: simplifyTransfers(balances),
      pairwise: computePairwiseDebts(membersInput, expenseInput),
    },
  };
}

app.post(
  "/api/trips",
  asyncRoute(async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Trip name is required" });
      return;
    }
    const trip = {
      id: nanoid(10),
      name,
      created_at: new Date().toISOString(),
    };
    await query(
      "INSERT INTO trips (id, name, created_at) VALUES ($1, $2, $3)",
      [trip.id, trip.name, trip.created_at]
    );
    res.status(201).json({ id: trip.id, name: trip.name });
  })
);

app.get(
  "/api/trips/:id",
  asyncRoute(async (req, res) => {
    const payload = await getTripPayload(req.params.id);
    if (!payload) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }
    res.json(payload);
  })
);

app.post(
  "/api/trips/:id/members",
  asyncRoute(async (req, res) => {
    const tripId = req.params.id;
    const trip = await query("SELECT id FROM trips WHERE id = $1", [tripId]);
    if (trip.rowCount === 0) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Member name is required" });
      return;
    }
    const member = {
      id: nanoid(10),
      trip_id: tripId,
      name,
      created_at: new Date().toISOString(),
    };
    await query(
      "INSERT INTO members (id, trip_id, name, created_at) VALUES ($1, $2, $3, $4)",
      [member.id, member.trip_id, member.name, member.created_at]
    );
    res.status(201).json(member);
  })
);

app.post(
  "/api/trips/:id/expenses",
  asyncRoute(async (req, res) => {
    const tripId = req.params.id;
    const trip = await query("SELECT id FROM trips WHERE id = $1", [tripId]);
    if (trip.rowCount === 0) {
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

    const memberResult = await query<{ id: string }>(
      "SELECT id FROM members WHERE trip_id = $1",
      [tripId]
    );
    const memberIds = new Set(memberResult.rows.map((member) => member.id));
    if (!memberIds.has(payerId)) {
      res.status(400).json({ error: "Payer must be a trip member" });
      return;
    }
    if (splitAmongIds.some((id) => !memberIds.has(id))) {
      res.status(400).json({ error: "Invalid split member" });
      return;
    }

    const expense = {
      id: nanoid(10),
      trip_id: tripId,
      payer_id: payerId,
      description,
      amount,
      created_at: new Date().toISOString(),
    };
    await withTransaction(async (client) => {
      await client.query(
        "INSERT INTO expenses (id, trip_id, payer_id, description, amount, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          expense.id,
          expense.trip_id,
          expense.payer_id,
          expense.description,
          expense.amount,
          expense.created_at,
        ]
      );
      for (const memberId of new Set(splitAmongIds)) {
        await client.query(
          "INSERT INTO expense_splits (expense_id, member_id) VALUES ($1, $2)",
          [expense.id, memberId]
        );
      }
    });

    res.status(201).json({ ...expense, splitAmongIds });
  })
);

function parseExpenseBody(body: unknown) {
  const data = body as {
    payerId?: string;
    description?: string;
    amount?: number;
    splitAmongIds?: unknown[];
  };
  return {
    payerId: String(data?.payerId ?? ""),
    description: String(data?.description ?? "").trim() || "Expense",
    amount: Number(data?.amount),
    splitAmongIds: Array.isArray(data?.splitAmongIds)
      ? data.splitAmongIds.map(String)
      : [],
  };
}

async function validateExpenseForTrip(
  tripId: string,
  payerId: string,
  amount: number,
  splitAmongIds: string[]
): Promise<string | null> {
  if (!payerId || !Number.isFinite(amount) || amount <= 0) {
    return "Valid payer and amount are required";
  }
  if (splitAmongIds.length === 0) {
    return "Select at least one person to split with";
  }
  const result = await query<{ id: string }>(
    "SELECT id FROM members WHERE trip_id = $1",
    [tripId]
  );
  const memberIds = new Set(result.rows.map((member) => member.id));
  if (!memberIds.has(payerId)) return "Payer must be a trip member";
  if (splitAmongIds.some((id) => !memberIds.has(id))) return "Invalid split member";
  return null;
}

app.patch(
  "/api/expenses/:id",
  asyncRoute(async (req, res) => {
    const expenseId = req.params.id;
    const existingResult = await query<Expense>(
      "SELECT * FROM expenses WHERE id = $1",
      [expenseId]
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    const { payerId, description, amount, splitAmongIds } = parseExpenseBody(
      req.body
    );
    const error = await validateExpenseForTrip(
      existing.trip_id,
      payerId,
      amount,
      splitAmongIds
    );
    if (error) {
      res.status(400).json({ error });
      return;
    }

    await withTransaction(async (client) => {
      await client.query(
        "UPDATE expenses SET payer_id = $1, description = $2, amount = $3 WHERE id = $4",
        [payerId, description, amount, expenseId]
      );
      await client.query("DELETE FROM expense_splits WHERE expense_id = $1", [
        expenseId,
      ]);
      for (const memberId of new Set(splitAmongIds)) {
        await client.query(
          "INSERT INTO expense_splits (expense_id, member_id) VALUES ($1, $2)",
          [expenseId, memberId]
        );
      }
    });

    res.json({
      id: expenseId,
      trip_id: existing.trip_id,
      payer_id: payerId,
      description,
      amount,
      splitAmongIds,
    });
  })
);

app.delete(
  "/api/expenses/:id",
  asyncRoute(async (req, res) => {
    const result = await query("DELETE FROM expenses WHERE id = $1", [
      req.params.id,
    ]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    res.status(204).send();
  })
);

const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Not found");
  });
});

app.use(
  (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Unexpected server error" });
  }
);

const PORT = process.env.PORT ?? 3001;
await initializeDatabase();
app.listen(PORT, () => {
  console.log(`Group Trip API on http://localhost:${PORT}`);
});
