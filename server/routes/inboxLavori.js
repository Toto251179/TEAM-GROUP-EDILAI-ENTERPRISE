import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const allowedFields = [
  "numeroRichiesta",
  "data",
  "clienteId",
  "clienteCode",
  "cliente",
  "referenteId",
  "referente",
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

  await query(`
    CREATE TABLE IF NOT EXISTS inbox_lavori (
      id SERIAL PRIMARY KEY,
      numero_richiesta TEXT UNIQUE,
      data DATE NOT NULL DEFAULT CURRENT_DATE,
      cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
      cliente_code TEXT,
      cliente TEXT NOT NULL,
      referente_id INTEGER REFERENCES referenti(id) ON DELETE SET NULL,
      referente TEXT,
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

  const alters = [
    "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS numero_richiesta TEXT",
    "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS data DATE NOT NULL DEFAULT CURRENT_DATE",
    "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS cliente_id INTEGER",
    "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS cliente_code TEXT",
    "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS referente_id INTEGER",
    "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS referente TEXT",
    "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS allegati JSONB NOT NULL DEFAULT '[]'::jsonb",
    "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS storico JSONB NOT NULL DEFAULT '[]'::jsonb",
    "CREATE UNIQUE INDEX IF NOT EXISTS inbox_lavori_numero_richiesta_uidx ON inbox_lavori (numero_richiesta)",
  ];

  for (const statement of alters) {
    await query(statement);
  }
}

function sanitizePayload(body) {
  const payload = allowedFields.reduce((current, field) => {
    if (body[field] !== undefined) current[field] = body[field];
    return current;
  }, {});

  if (payload.clienteId === "") payload.clienteId = null;
  if (payload.referenteId === "") payload.referenteId = null;
  return payload;
}

async function insertInbox(data) {
  const payload = { ...defaults, ...sanitizePayload(data) };
  if (!payload.numeroRichiesta) payload.numeroRichiesta = await nextNumeroRichiesta();
  const fields = Object.keys(payload);
  const columns = fields.map(toSnake);
  const values = fields.map((field) => payload[field]);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

  const result = await query(
    `INSERT INTO inbox_lavori (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    values,
  );

  await linkClienteReferente(payload.clienteId, payload.referenteId);
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

  await linkClienteReferente(payload.clienteId, payload.referenteId);
  return result.rows[0] ? toCamel(result.rows[0]) : null;
}

async function nextNumeroRichiesta() {
  const year = new Date().getFullYear();
  const result = await query(
    `SELECT numero_richiesta
     FROM inbox_lavori
     WHERE numero_richiesta LIKE $1
     ORDER BY numero_richiesta DESC
     LIMIT 1`,
    [`IN-${year}-%`],
  );

  const last = result.rows[0]?.numero_richiesta || "";
  const lastNumber = Number(last.split("-").at(-1) || 0);
  return `IN-${year}-${String(lastNumber + 1).padStart(4, "0")}`;
}

async function linkClienteReferente(clienteId, referenteId) {
  if (!clienteId || !referenteId) return;

  await query(
    `INSERT INTO clienti_referenti (cliente_id, referente_id, attivo)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (cliente_id, referente_id)
     DO UPDATE SET attivo = TRUE, data_fine = NULL, updated_at = NOW()`,
    [clienteId, referenteId],
  );
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
    referente: String(req.body.referente || "").trim(),
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
