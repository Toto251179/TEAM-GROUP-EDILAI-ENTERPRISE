import pg from "pg";
import { env } from "../config/env.js";

const adminUser = process.env.DB_ADMIN_USER || "postgres";
const adminPassword = process.env.DB_ADMIN_PASSWORD;
const targetUser = process.env.DB_GRANT_USER || env.db.user;

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

if (!adminPassword) {
  console.error("Imposta DB_ADMIN_PASSWORD prima di eseguire questo comando.");
  process.exit(1);
}

const pool = new pg.Pool({
  ...env.db,
  user: adminUser,
  password: adminPassword,
});

try {
  const databaseName = quoteIdent(env.db.database);
  const roleName = quoteIdent(targetUser);

  await pool.query(`GRANT CONNECT ON DATABASE ${databaseName} TO ${roleName}`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleName}`);
  await pool.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${roleName}`);
  await pool.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${roleName}`,
  );
  await pool.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${roleName}`,
  );

  console.log(`Permessi PostgreSQL concessi correttamente a ${targetUser}.`);
} finally {
  await pool.end();
}
