import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

const client = new Client({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "team_group_edilai",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

await client.connect();

const tablesRes = await client.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);

const tables = tablesRes.rows.map((row) => row.table_name);
const backup = {
  createdAt: new Date().toISOString(),
  database: process.env.DB_NAME || "team_group_edilai",
  tables: {},
};
const counts = {};

for (const table of tables) {
  const countRes = await client.query(`SELECT COUNT(*)::int AS count FROM ${quoteIdent(table)}`);
  counts[table] = countRes.rows[0].count;

  const rowsRes = await client.query(`SELECT * FROM ${quoteIdent(table)}`);
  backup.tables[table] = rowsRes.rows;
}

await client.end();

fs.mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join("backups", `db-backup-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify(backup, null, 2));

console.log(JSON.stringify({ file, tables, counts }, null, 2));
