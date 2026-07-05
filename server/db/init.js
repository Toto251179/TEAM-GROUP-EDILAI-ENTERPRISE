import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { query, pool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, "schema.sql");
const schema = (await fs.readFile(schemaPath, "utf8")).replace(/^\uFEFF/, "");
const statements = schema
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

for (const statement of statements) {
  await query(statement);
}

await pool.end();

console.log("Database inizializzato correttamente.");
