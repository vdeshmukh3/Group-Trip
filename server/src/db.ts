import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workbookPath = path.join(
  process.env.DATA_DIR ?? path.join(__dirname, "..", "data"),
  "trips.xlsx"
);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set to connect to PostgreSQL");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type Trip = { id: string; name: string; created_at: string };
export type Member = {
  id: string;
  trip_id: string;
  name: string;
  created_at: string;
};
export type Expense = {
  id: string;
  trip_id: string;
  payer_id: string;
  description: string;
  amount: number;
  created_at: string;
};

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  return pool.query<T>(text, values);
}

async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function migrateWorkbookIfDatabaseEmpty() {
  const countResult = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM trips"
  );
  if (Number(countResult.rows[0].count) > 0 || !fs.existsSync(workbookPath)) {
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  function readSheet<T>(name: string, keys: string[]): T[] {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) return [];
    const records: T[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const values = keys.map((_, index) => row.getCell(index + 1).value);
      if (values.every((value) => value == null || value === "")) continue;
      const record: Record<string, unknown> = {};
      keys.forEach((key, index) => {
        const value = values[index];
        record[key] = value instanceof Date ? value.toISOString() : value;
      });
      records.push(record as T);
    }
    return records;
  }

  const trips = readSheet<{ id: string; name: string; created_at: string }>(
    "Trips",
    ["id", "name", "created_at"]
  );
  const members = readSheet<{
    id: string;
    trip_id: string;
    name: string;
    created_at: string;
  }>("Members", ["id", "trip_id", "name", "created_at"]);
  const expenses = readSheet<{
    id: string;
    trip_id: string;
    payer_id: string;
    description: string;
    amount: number;
    created_at: string;
  }>("Expenses", ["id", "trip_id", "payer_id", "description", "amount", "created_at"]);
  const splits = readSheet<{ expense_id: string; member_id: string }>(
    "ExpenseSplits",
    ["expense_id", "member_id"]
  );

  await withTransaction(async (client) => {
    for (const trip of trips) {
      await client.query(
        "INSERT INTO trips (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
        [trip.id, trip.name, trip.created_at]
      );
    }
    for (const member of members) {
      await client.query(
        "INSERT INTO members (id, trip_id, name, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
        [member.id, member.trip_id, member.name, member.created_at]
      );
    }
    for (const expense of expenses) {
      await client.query(
        "INSERT INTO expenses (id, trip_id, payer_id, description, amount, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
        [
          expense.id,
          expense.trip_id,
          expense.payer_id,
          expense.description,
          expense.amount,
          expense.created_at,
        ]
      );
    }
    for (const split of splits) {
      await client.query(
        "INSERT INTO expense_splits (expense_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [split.expense_id, split.member_id]
      );
    }
  });
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      payer_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (expense_id, member_id)
    );
  `);
  await migrateWorkbookIfDatabaseEmpty();
}

export { withTransaction };
