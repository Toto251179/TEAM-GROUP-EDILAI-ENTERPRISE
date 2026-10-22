import { query } from "../config/db.js";

let runtimeSchemaPromise;

export function ensureRuntimeSchema() {
  if (!runtimeSchemaPromise) {
    runtimeSchemaPromise = (async () => {
      const statements = [
        "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS pdf_path TEXT",
        "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS folder_path TEXT",
        "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS pdf_file_name TEXT",
      ];

      for (const statement of statements) {
        await query(statement);
      }
    })().catch((error) => {
      runtimeSchemaPromise = null;
      throw error;
    });
  }

  return runtimeSchemaPromise;
}
