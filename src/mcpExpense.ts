import fs from "fs";
import path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";

type ExpenseRow = {
  id: number;
  amount: number;
  expenseDate: string;
  category: string;
  sideNote: string;
  createdAt: string;
  updatedAt: string;
};

const VALID_CATEGORIES = new Set([
  "travel",
  "food",
  "shopping",
  "bills",
  "entertainment",
  "health",
  "education",
  "rent",
  "miscellaneous",
]);

function normalizeCategory(raw?: string): string {
  if (!raw) return "miscellaneous";
  const v = raw.trim().toLowerCase();
  return VALID_CATEGORIES.has(v) ? v : "miscellaneous";
}

function detectCategory(text: string): string {
  const t = text.toLowerCase();

  if (
    /(travel|trip|flight|train|bus|taxi|cab|uber|ola|auto|petrol|fuel|rajkot|ahmd|ahmedabad)/.test(
      t,
    )
  )
    return "travel";
  if (
    /(food|restaurant|meal|dinner|lunch|breakfast|swiggy|zomato|snack|tea|coffee)/.test(
      t,
    )
  )
    return "food";
  if (/(shop|shopping|amazon|flipkart|purchase|buy)/.test(t)) return "shopping";
  if (/(bill|electricity|water|internet|wifi|mobile|recharge)/.test(t))
    return "bills";
  if (/(movie|netflix|game|concert|party)/.test(t)) return "entertainment";
  if (/(doctor|hospital|medicine|pharmacy|health)/.test(t)) return "health";
  if (/(course|book|tuition|education|training)/.test(t)) return "education";
  if (/(rent|landlord|lease)/.test(t)) return "rent";

  return "miscellaneous";
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDateFromText(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("yesterday")) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (t.includes("today")) return todayISODate();

  const m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return m?.[1] ?? todayISODate();
}

function parseAmountFromText(text: string): number {
  const m = text.match(/\b(\d+(?:\.\d+)?)\s*(?:rs|rupees?|inr)?\b/i);
  if (!m) throw new Error("Amount not found in text.");
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Invalid amount.");
  return amount;
}

function buildSideNote(text: string): string {
  const cleaned = text
    .replace(/^add\s+expense\s*/i, "")
    .replace(/^for\s+/i, "")
    .trim();

  return cleaned.length >= 4 ? cleaned : "Miscellaneous expense";
}

function parseExpenseInput(text: string): {
  amount: number;
  expenseDate: string;
  category: string;
  sideNote: string;
} {
  const amount = parseAmountFromText(text);
  const expenseDate = parseDateFromText(text);
  const forCategory = text.match(/for\s+([a-zA-Z]+)/i)?.[1];
  const category = normalizeCategory(forCategory ?? detectCategory(text));
  const sideNote = buildSideNote(text);

  return { amount, expenseDate, category, sideNote };
}

const dbDir = path.resolve(process.cwd(), "data");
fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, "expenses.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL CHECK(amount >= 0),
    expenseDate TEXT NOT NULL,
    category TEXT NOT NULL,
    sideNote TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertStmt = db.prepare(`
  INSERT INTO expenses (amount, expenseDate, category, sideNote, createdAt, updatedAt)
  VALUES (@amount, @expenseDate, @category, @sideNote, datetime('now'), datetime('now'))
`);

const getByIdStmt = db.prepare(`
  SELECT id, amount, expenseDate, category, sideNote, createdAt, updatedAt
  FROM expenses
  WHERE id = ?
`);

const deleteByIdStmt = db.prepare(`DELETE FROM expenses WHERE id = ?`);

const server = new McpServer({
  name: "expense-mcp-server",
  version: "1.0.0",
});

(server.tool as any)(
  "create_expense",
  "Create an expense record.",
  {
    amount: z.number().positive(),
    expenseDate: z
      .string()
      .optional()
      .describe("YYYY-MM-DD. Defaults to today."),
    category: z.string().optional(),
    sideNote: z.string().optional(),
  },
  async ({
    amount,
    expenseDate,
    category,
    sideNote,
  }: {
    amount: number;
    expenseDate?: string;
    category?: string;
    sideNote?: string;
  }) => {
    const payload = {
      amount,
      expenseDate: expenseDate ?? todayISODate(),
      category: normalizeCategory(category ?? detectCategory(sideNote ?? "")),
      sideNote: sideNote?.trim() || "Miscellaneous expense",
    };

    const result = insertStmt.run(payload);
    const row = getByIdStmt.get(result.lastInsertRowid) as
      | ExpenseRow
      | undefined;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(row ?? { id: result.lastInsertRowid }, null, 2),
        },
      ],
    };
  },
);

(server.tool as any)(
  "create_expense_from_text",
  "Create expense from natural language. Example: add expense for travel for 100rs from ahmd to rajkot",
  {
    text: z.string().min(1),
  },
  async ({ text }: { text: string }) => {
    const parsed = parseExpenseInput(text);
    const result = insertStmt.run(parsed);
    const row = getByIdStmt.get(result.lastInsertRowid) as
      | ExpenseRow
      | undefined;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(row ?? { id: result.lastInsertRowid }, null, 2),
        },
      ],
    };
  },
);

(server.tool as any)(
  "get_expense",
  "Get one expense by id.",
  { id: z.number().int().positive() },
  async ({ id }: { id: number }) => {
    const row = getByIdStmt.get(id) as ExpenseRow | undefined;
    return {
      content: [{ type: "text", text: JSON.stringify(row ?? null, null, 2) }],
    };
  },
);

(server.tool as any)(
  "list_expenses",
  "List expenses (optional filters).",
  {
    category: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    limit: z.number().int().positive().max(500).optional(),
  },
  async ({
    category,
    fromDate,
    toDate,
    limit,
  }: {
    category?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }) => {
    const filters: string[] = [];
    const params: (string | number)[] = [];

    if (category) {
      filters.push("category = ?");
      params.push(normalizeCategory(category));
    }
    if (fromDate) {
      filters.push("expenseDate >= ?");
      params.push(fromDate);
    }
    if (toDate) {
      filters.push("expenseDate <= ?");
      params.push(toDate);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const lim = limit ?? 100;

    const rows = db
      .prepare(
        `SELECT id, amount, expenseDate, category, sideNote, createdAt, updatedAt
         FROM expenses
         ${where}
         ORDER BY expenseDate DESC, id DESC
         LIMIT ?`,
      )
      .all(...params, lim) as ExpenseRow[];

    return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
  },
);

(server.tool as any)(
  "update_expense",
  "Update an expense by id.",
  {
    id: z.number().int().positive(),
    amount: z.number().positive().optional(),
    expenseDate: z.string().optional(),
    category: z.string().optional(),
    sideNote: z.string().optional(),
  },
  async ({
    id,
    amount,
    expenseDate,
    category,
    sideNote,
  }: {
    id: number;
    amount?: number;
    expenseDate?: string;
    category?: string;
    sideNote?: string;
  }) => {
    const existing = getByIdStmt.get(id) as ExpenseRow | undefined;
    if (!existing) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "Expense not found" }, null, 2),
          },
        ],
      };
    }

    const updated = {
      amount: amount ?? existing.amount,
      expenseDate: expenseDate ?? existing.expenseDate,
      category: normalizeCategory(category ?? existing.category),
      sideNote: sideNote ?? existing.sideNote,
      id,
    };

    db.prepare(
      `UPDATE expenses
       SET amount = @amount,
           expenseDate = @expenseDate,
           category = @category,
           sideNote = @sideNote,
           updatedAt = datetime('now')
       WHERE id = @id`,
    ).run(updated);

    const row = getByIdStmt.get(id) as ExpenseRow | undefined;
    return {
      content: [{ type: "text", text: JSON.stringify(row ?? null, null, 2) }],
    };
  },
);

(server.tool as any)(
  "delete_expense",
  "Delete an expense by id.",
  { id: z.number().int().positive() },
  async ({ id }: { id: number }) => {
    const result = deleteByIdStmt.run(id);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ deleted: result.changes > 0, id }, null, 2),
        },
      ],
    };
  },
);

async function startServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

startServer().catch((error) => {
  console.error("Failed to start expense MCP server:", error);
  process.exit(1);
});
