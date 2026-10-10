import ExcelJS from "exceljs";
import Database from "better-sqlite3";
import fsSync from "fs";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? path.join(__dirname, "..", "data");
const workbookPath =
  process.env.EXCEL_PATH ?? path.join(dataDir, "trips.xlsx");
const legacyDatabasePath =
  process.env.DATABASE_PATH ?? path.join(dataDir, "trips.db");

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
export type ExpenseSplit = { expense_id: string; member_id: string };

type WorkbookData = {
  trips: Trip[];
  members: Member[];
  expenses: Expense[];
  expenseSplits: ExpenseSplit[];
};

const columns = {
  Trips: ["id", "name", "created_at"],
  Members: ["id", "trip_id", "name", "created_at"],
  Expenses: [
    "id",
    "trip_id",
    "payer_id",
    "description",
    "amount",
    "created_at",
  ],
  ExpenseSplits: ["expense_id", "member_id"],
} as const;

function readSheet<T>(
  workbook: ExcelJS.Workbook,
  name: keyof typeof columns,
  keys: readonly string[]
): T[] {
  const sheet = workbook.getWorksheet(name);
  if (!sheet || sheet.rowCount < 2) return [];
  const result: T[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = keys.map((_, index) => row.getCell(index + 1).value);
    if (values.every((value) => value == null || value === "")) {
      continue;
    }
    const record: Record<string, unknown> = {};
    keys.forEach((key, index) => {
      const value = row.getCell(index + 1).value;
      record[key] = value instanceof Date ? value.toISOString() : value;
    });
    result.push(record as T);
  }
  return result;
}

function migrateSqlite(): WorkbookData | null {
  if (!fsSync.existsSync(legacyDatabasePath)) return null;
  const legacy = new Database(legacyDatabasePath, { readonly: true });
  try {
    const trips = legacy.prepare("SELECT * FROM trips").all() as Trip[];
    const members = legacy.prepare("SELECT * FROM members").all() as Member[];
    const expenses = legacy.prepare("SELECT * FROM expenses").all() as Expense[];
    const expenseSplits = legacy
      .prepare("SELECT * FROM expense_splits")
      .all() as ExpenseSplit[];
    return { trips, members, expenses, expenseSplits };
  } finally {
    legacy.close();
  }
}

export class ExcelStore {
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(private data: WorkbookData) {}

  static async open(): Promise<ExcelStore> {
    await fs.mkdir(path.dirname(workbookPath), { recursive: true });
    let data: WorkbookData = {
      trips: [],
      members: [],
      expenses: [],
      expenseSplits: [],
    };

    if (fsSync.existsSync(workbookPath)) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(workbookPath);
      data = {
        trips: readSheet<Trip>(workbook, "Trips", columns.Trips),
        members: readSheet<Member>(workbook, "Members", columns.Members),
        expenses: readSheet<Expense>(workbook, "Expenses", columns.Expenses),
        expenseSplits: readSheet<ExpenseSplit>(
          workbook,
          "ExpenseSplits",
          columns.ExpenseSplits
        ),
      };
    } else {
      data = migrateSqlite() ?? data;
      const store = new ExcelStore(data);
      await store.save();
      return store;
    }

    return new ExcelStore(data);
  }

  get trips() {
    return this.data.trips;
  }

  get members() {
    return this.data.members;
  }

  get expenses() {
    return this.data.expenses;
  }

  get expenseSplits() {
    return this.data.expenseSplits;
  }

  async addTrip(trip: Trip) {
    this.data.trips.push(trip);
    await this.save();
  }

  async addMember(member: Member) {
    this.data.members.push(member);
    await this.save();
  }

  async addExpense(expense: Expense, splitMemberIds: string[]) {
    this.data.expenses.push(expense);
    this.data.expenseSplits.push(
      ...splitMemberIds.map((member_id) => ({
        expense_id: expense.id,
        member_id,
      }))
    );
    await this.save();
  }

  async updateExpense(
    expenseId: string,
    changes: Pick<Expense, "payer_id" | "description" | "amount">,
    splitMemberIds: string[]
  ) {
    const expense = this.data.expenses.find((item) => item.id === expenseId);
    if (!expense) return false;
    Object.assign(expense, changes);
    this.data.expenseSplits = this.data.expenseSplits.filter(
      (split) => split.expense_id !== expenseId
    );
    this.data.expenseSplits.push(
      ...splitMemberIds.map((member_id) => ({
        expense_id: expenseId,
        member_id,
      }))
    );
    await this.save();
    return true;
  }

  async deleteExpense(expenseId: string) {
    const before = this.data.expenses.length;
    this.data.expenses = this.data.expenses.filter(
      (expense) => expense.id !== expenseId
    );
    if (before === this.data.expenses.length) return false;
    this.data.expenseSplits = this.data.expenseSplits.filter(
      (split) => split.expense_id !== expenseId
    );
    await this.save();
    return true;
  }

  async save() {
    const snapshot: WorkbookData = {
      trips: this.data.trips.map((row) => ({ ...row })),
      members: this.data.members.map((row) => ({ ...row })),
      expenses: this.data.expenses.map((row) => ({ ...row })),
      expenseSplits: this.data.expenseSplits.map((row) => ({ ...row })),
    };
    this.writeQueue = this.writeQueue.then(async () => {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Group Trip";
      workbook.created = new Date();
      this.addSheet(workbook, "Trips", columns.Trips, snapshot.trips);
      this.addSheet(workbook, "Members", columns.Members, snapshot.members);
      this.addSheet(workbook, "Expenses", columns.Expenses, snapshot.expenses);
      this.addSheet(
        workbook,
        "ExpenseSplits",
        columns.ExpenseSplits,
        snapshot.expenseSplits
      );

      const temporaryPath = `${workbookPath}.tmp`;
      await workbook.xlsx.writeFile(temporaryPath);
      await fs.rename(temporaryPath, workbookPath);
    });
    await this.writeQueue;
  }

  private addSheet<T extends Record<string, unknown>>(
    workbook: ExcelJS.Workbook,
    name: string,
    keys: readonly string[],
    records: T[]
  ) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = keys.map((key) => ({
      header: key,
      key,
      width: Math.max(key.length + 2, 16),
    }));
    sheet.addRows(records);
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF245B59" },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, records.length + 1), column: keys.length },
    };
  }
}

export const db = await ExcelStore.open();
