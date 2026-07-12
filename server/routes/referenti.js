import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const allowedFields = ["nome", "telefono", "email", "ruolo", "note", "attivo"];

function toCamel(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

function toSnake(field) {
  return field.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
}

async function ensureReferentiTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS referenti (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      ruolo TEXT,
      note TEXT,
      attivo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS clienti_referenti (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
      referente_id INTEGER NOT NULL REFERENCES referenti(id) ON DELETE CASCADE,
      attivo BOOLEAN NOT NULL DEFAULT TRUE,
      data_inizio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data_fine TIMESTAMPTZ,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cliente_id, referente_id)
    )
  `);
}

function sanitizePayload(body) {
  return allowedFields.reduce((payload, field) => {
    if (body[field] !== undefined) payload[field] = body[field];
    return payload;
  }, {});
}

router.use(asyncHandler(async (_req, _res, next) => {
  await ensureReferentiTables();
  next();
}));

router.get("/", asyncHandler(async (_req, res) => {
  const result = await query(`
    SELECT
      r.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', c.id,
            'ragioneSociale', c.ragione_sociale,
            'attivo', cr.attivo
          )
        ) FILTER (WHERE c.id IS NOT NULL),
        '[]'
      ) AS clienti
    FROM referenti r
    LEFT JOIN clienti_referenti cr ON cr.referente_id = r.id
    LEFT JOIN clienti c ON c.id = cr.cliente_id
    GROUP BY r.id
    ORDER BY r.nome ASC
  `);

  res.json(result.rows.map(toCamel));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM referenti WHERE id = $1", [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: "Referente non trovato" });
  res.json(toCamel(result.rows[0]));
}));

router.post("/", asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body);
  if (!String(payload.nome || "").trim()) {
    return res.status(400).json({ message: "Inserisci il nome del referente." });
  }

  payload.nome = String(payload.nome).trim();
  const fields = Object.keys(payload);
  const columns = fields.map(toSnake);
  const values = fields.map((field) => payload[field]);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

  const result = await query(
    `INSERT INTO referenti (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    values,
  );

  res.status(201).json(toCamel(result.rows[0]));
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const payload = sanitizePayload(req.body);
  const fields = Object.keys(payload);

  if (!fields.length) {
    const result = await query("SELECT * FROM referenti WHERE id = $1", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: "Referente non trovato" });
    return res.json(toCamel(result.rows[0]));
  }

  const values = fields.map((field) => payload[field]);
  const assignments = fields.map((field, index) => `${toSnake(field)} = $${index + 2}`);
  assignments.push("updated_at = NOW()");

  const result = await query(
    `UPDATE referenti SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`,
    [req.params.id, ...values],
  );

  if (!result.rows[0]) return res.status(404).json({ message: "Referente non trovato" });
  res.json(toCamel(result.rows[0]));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await query("DELETE FROM referenti WHERE id = $1 RETURNING *", [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: "Referente non trovato" });
  res.json({ deleted: true, item: toCamel(result.rows[0]) });
}));

export default router;
