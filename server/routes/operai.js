import { Router } from "express";
import { query } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

function toCamel(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

async function colonneOperai() {
  const result = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'operai'`,
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function pushField(fields, values, columns, column, value) {
  if (!columns.has(column)) return;
  fields.push(column);
  values.push(value);
}

router.get("/", asyncHandler(async (_req, res) => {
  const result = await query("SELECT * FROM operai ORDER BY nome ASC");
  res.json(result.rows.map((row) => {
    const item = toCamel(row);
    return {
      ...item,
      ruolo: item.ruolo || item.mansione || "Operaio",
      attivo: item.attivo ?? item.stato !== "Terminato",
    };
  }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const columns = await colonneOperai();
  const nome = String(req.body.nome || "").trim();
  if (!nome) return res.status(400).json({ message: "Inserisci il nome" });

  const fields = [];
  const values = [];
  const nomeSalvato = columns.has("cognome") ? nome : `${nome} ${req.body.cognome || ""}`.trim();
  const ruolo = req.body.ruolo || req.body.mansione || "Operaio";
  const attivo = req.body.attivo !== false;

  pushField(fields, values, columns, "nome", nomeSalvato);
  pushField(fields, values, columns, "cognome", req.body.cognome || "");
  pushField(fields, values, columns, "telefono", req.body.telefono || "");
  pushField(fields, values, columns, "email", req.body.email || "");
  pushField(fields, values, columns, "ruolo", ruolo);
  pushField(fields, values, columns, "mansione", ruolo);
  pushField(fields, values, columns, "costo_orario", Number(req.body.costoOrario || 0));
  pushField(fields, values, columns, "data_assunzione", req.body.dataAssunzione || null);
  pushField(fields, values, columns, "data_inizio_lavoro", req.body.dataInizioLavoro || null);
  pushField(fields, values, columns, "data_fine_lavoro", req.body.dataFineLavoro || null);
  pushField(fields, values, columns, "stato", attivo ? "Attivo" : "Terminato");
  pushField(fields, values, columns, "attivo", attivo);
  pushField(fields, values, columns, "note", req.body.note || "");

  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const result = await query(
    `INSERT INTO operai (${fields.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    values,
  );

  const item = toCamel(result.rows[0]);
  res.status(201).json({ ...item, ruolo: item.ruolo || item.mansione || ruolo, attivo: item.attivo ?? attivo });
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const columns = await colonneOperai();
  const fields = [];
  const values = [];
  const ruolo = req.body.ruolo || req.body.mansione;

  const addUpdate = (column, value) => {
    if (!columns.has(column) || value === undefined) return;
    values.push(value);
    fields.push(`${column} = $${values.length + 1}`);
  };

  const nomeSalvato = columns.has("cognome")
    ? req.body.nome
    : req.body.nome === undefined ? undefined : `${req.body.nome || ""} ${req.body.cognome || ""}`.trim();

  addUpdate("nome", nomeSalvato);
  addUpdate("cognome", req.body.cognome);
  addUpdate("telefono", req.body.telefono);
  addUpdate("email", req.body.email);
  addUpdate("ruolo", ruolo);
  addUpdate("mansione", ruolo);
  addUpdate("costo_orario", req.body.costoOrario === undefined ? undefined : Number(req.body.costoOrario || 0));
  addUpdate("data_assunzione", req.body.dataAssunzione);
  addUpdate("data_inizio_lavoro", req.body.dataInizioLavoro);
  addUpdate("data_fine_lavoro", req.body.dataFineLavoro === undefined ? undefined : req.body.dataFineLavoro);
  addUpdate("stato", req.body.stato);
  addUpdate("attivo", req.body.attivo);
  addUpdate("note", req.body.note);

  if (columns.has("updated_at")) fields.push("updated_at = NOW()");
  if (!fields.length) {
    const current = await query("SELECT * FROM operai WHERE id = $1", [req.params.id]);
    return current.rows[0] ? res.json(toCamel(current.rows[0])) : res.status(404).json({ message: "Operaio non trovato" });
  }

  const result = await query(
    `UPDATE operai SET ${fields.join(", ")} WHERE id = $1 RETURNING *`,
    [req.params.id, ...values],
  );

  if (!result.rows[0]) return res.status(404).json({ message: "Operaio non trovato" });
  const item = toCamel(result.rows[0]);
  res.json({ ...item, ruolo: item.ruolo || item.mansione || "Operaio", attivo: item.attivo ?? item.stato !== "Terminato" });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await query("DELETE FROM operai WHERE id = $1 RETURNING *", [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: "Operaio non trovato" });
  res.json({ deleted: true, item: toCamel(result.rows[0]) });
}));

export default router;
