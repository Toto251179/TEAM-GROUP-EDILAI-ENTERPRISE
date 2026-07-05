import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const allowedFields = [
  "cliente",
  "telefono",
  "email",
  "indirizzo",
  "tipoRichiesta",
  "provenienza",
  "descrizione",
  "serveSopralluogo",
  "priorita",
  "stato",
  "note",
];

const defaults = {
  tipoRichiesta: "Edilizia",
  provenienza: "Telefonata",
  serveSopralluogo: false,
  priorita: "Media",
  stato: "Nuova",
};

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

async function ensureInboxTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS inbox_lavori (
      id SERIAL PRIMARY KEY,
      cliente TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      indirizzo TEXT,
      tipo_richiesta TEXT NOT NULL DEFAULT 'Edilizia',
      provenienza TEXT NOT NULL DEFAULT 'Telefonata',
      descrizione TEXT,
      serve_sopralluogo BOOLEAN NOT NULL DEFAULT FALSE,
      priorita TEXT NOT NULL DEFAULT 'Media',
      stato TEXT NOT NULL DEFAULT 'Nuova',
      data_creazione TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function sanitizePayload(body) {
  return allowedFields.reduce((payload, field) => {
    if (body[field] !== undefined) payload[field] = body[field];
    return payload;
  }, {});
}

async function insertInbox(data) {
  const payload = { ...defaults, ...sanitizePayload(data) };
  const fields = Object.keys(payload);
  const columns = fields.map(toSnake);
  const values = fields.map((field) => payload[field]);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

  const result = await query(
    `INSERT INTO inbox_lavori (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    values,
  );

  return toCamel(result.rows[0]);
}

async function updateInbox(id, data) {
  const payload = sanitizePayload(data);
  const fields = Object.keys(payload);
  if (!fields.length) {
    const result = await query("SELECT * FROM inbox_lavori WHERE id = $1", [id]);
    return result.rows[0] ? toCamel(result.rows[0]) : null;
  }

  const values = fields.map((field) => payload[field]);
  const assignments = fields.map((field, index) => `${toSnake(field)} = $${index + 2}`);
  assignments.push("updated_at = NOW()");

  const result = await query(
    `UPDATE inbox_lavori SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`,
    [id, ...values],
  );

  return result.rows[0] ? toCamel(result.rows[0]) : null;
}

router.use(asyncHandler(async (_req, _res, next) => {
  await ensureInboxTable();
  next();
}));

router.get("/", asyncHandler(async (_req, res) => {
  const result = await query("SELECT * FROM inbox_lavori ORDER BY data_creazione DESC, id DESC");
  res.json(result.rows.map(toCamel));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const result = await query("SELECT * FROM inbox_lavori WHERE id = $1", [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: "Richiesta non trovata" });
  res.json(toCamel(result.rows[0]));
}));

router.post("/", asyncHandler(async (req, res) => {
  if (!String(req.body.cliente || "").trim()) {
    return res.status(400).json({ message: "Inserisci il cliente." });
  }

  const item = await insertInbox({
    ...req.body,
    cliente: String(req.body.cliente).trim(),
  });
  res.status(201).json(item);
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const item = await updateInbox(req.params.id, req.body);
  if (!item) return res.status(404).json({ message: "Richiesta non trovata" });
  res.json(item);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await query("DELETE FROM inbox_lavori WHERE id = $1 RETURNING *", [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: "Richiesta non trovata" });
  res.json({ deleted: true, item: toCamel(result.rows[0]) });
}));

export default router;
