import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { pool, query } from "../config/db.js";
import { createCrudRepository } from "../utils/crud.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const clienteFields = [
  "clienteCode",
  "ragioneSociale",
  "referente",
  "associazione",
  "telefono",
  "email",
  "emailReferente",
  "emailAmministratore",
  "indirizzo",
  "cap",
  "comune",
  "provincia",
  "note",
  "tipologiaCliente",
  "latitudine",
  "longitudine",
];

const repository = createCrudRepository({
  table: "clienti",
  allowedFields: clienteFields,
  defaultOrder: "ragione_sociale ASC",
});

const router = Router();

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

function pulisciValore(value) {
  const text = String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text === "0" || text.toUpperCase() === "#N/A") return "";
  return text;
}

function normalizzaChiave(value) {
  return pulisciValore(value).toUpperCase();
}

function normalizzaNome(value) {
  return pulisciValore(value).toLowerCase();
}

function normalizzaIntestazione(value) {
  return pulisciValore(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function pick(row, header) {
  if (row[header] !== undefined) return pulisciValore(row[header]);
  const headerNormalizzato = normalizzaIntestazione(header);
  const entry = Object.entries(row).find(([key]) => normalizzaIntestazione(key) === headerNormalizzato);
  return pulisciValore(entry?.[1]);
}

function clienteDaExcel(row) {
  const cliente = {
    clienteCode: pick(row, "COD. IONE"),
    ragioneSociale: pick(row, "RAGIONE SOCIALE"),
    indirizzo: pick(row, "INDIRIZZO"),
    cap: pick(row, "CAP"),
    comune: pick(row, "CITTA'"),
    provincia: pick(row, "PROV"),
    referente: pick(row, "REFERENTE"),
    associazione: pick(row, "ASSOCIAZIONE") || pick(row, "AMMINISTRATORE"),
    email: pick(row, "MAIL"),
    tipologiaCliente: pick(row, "TIPOLOGIA CLIENTE") || pick(row, "TIPOLOGIA"),
    latitudine: pick(row, "LATITUDINE"),
    longitudine: pick(row, "LONGITUDINE"),
  };
  return cliente;
}

function mergeClientePayload(attuale, excel) {
  return {
    clienteCode: pulisciValore(attuale.clienteCode) || excel.clienteCode,
    ragioneSociale: pulisciValore(attuale.ragioneSociale) || excel.ragioneSociale,
    referente: pulisciValore(attuale.referente) || excel.referente,
    associazione: pulisciValore(attuale.associazione) || pulisciValore(attuale.amministratore) || excel.associazione,
    telefono: pulisciValore(attuale.telefono),
    email: pulisciValore(attuale.email) || excel.email,
    emailReferente: pulisciValore(attuale.emailReferente),
    emailAmministratore: pulisciValore(attuale.emailAmministratore),
    indirizzo: pulisciValore(attuale.indirizzo) || excel.indirizzo,
    cap: pulisciValore(attuale.cap) || excel.cap,
    comune: pulisciValore(attuale.comune) || excel.comune,
    provincia: pulisciValore(attuale.provincia) || excel.provincia,
    note: pulisciValore(attuale.note),
    tipologiaCliente: pulisciValore(attuale.tipologiaCliente) || excel.tipologiaCliente,
    latitudine: attuale.latitudine ?? normalizzaCoordinata(excel.latitudine),
    longitudine: attuale.longitudine ?? normalizzaCoordinata(excel.longitudine),
  };
}

function indicizzaCliente(cliente, maps) {
  if (normalizzaChiave(cliente.clienteCode)) maps.byCode.set(normalizzaChiave(cliente.clienteCode), cliente);
  if (normalizzaNome(cliente.ragioneSociale)) maps.byName.set(normalizzaNome(cliente.ragioneSociale), cliente);
}

async function tableExists(tableName) {
  const result = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );

  return Boolean(result.rows[0]?.exists);
}

async function getIndirizziCliente(clienteId) {
  if (!(await tableExists("indirizzi"))) return [];

  const result = await query(
    `SELECT *
     FROM indirizzi
     WHERE cliente_id = $1
     ORDER BY principale DESC, id ASC`,
    [clienteId],
  );

  return result.rows.map(toCamel);
}

async function aggiungiIndirizzi(clienti) {
  if (!(await tableExists("indirizzi"))) {
    return clienti.map((cliente) => ({ ...cliente, indirizzi: [] }));
  }

  const ids = clienti.map((cliente) => cliente.id);
  if (!ids.length) return clienti.map((cliente) => ({ ...cliente, indirizzi: [] }));

  const result = await query(
    `SELECT *
     FROM indirizzi
     WHERE cliente_id::text = ANY($1::text[])
     ORDER BY principale DESC, id ASC`,
    [ids.map(String)],
  );
  const indirizziPerCliente = new Map();

  result.rows.map(toCamel).forEach((indirizzo) => {
    const chiave = String(indirizzo.clienteId);
    indirizziPerCliente.set(chiave, [...(indirizziPerCliente.get(chiave) || []), indirizzo]);
  });

  return clienti.map((cliente) => ({
    ...cliente,
    indirizzi: indirizziPerCliente.get(String(cliente.id)) || [],
  }));
}

async function sincronizzaIndirizzoLegacy(cliente) {
  if (!cliente?.id || !(await tableExists("indirizzi"))) return cliente;
  const indirizzo = String(cliente.indirizzo || "").trim();
  if (!indirizzo) return { ...cliente, indirizzi: await getIndirizziCliente(cliente.id) };

  await query(
    `INSERT INTO indirizzi (cliente_id, via, principale)
     SELECT $1, $2, TRUE
     WHERE NOT EXISTS (
       SELECT 1
       FROM indirizzi
       WHERE cliente_id = $1 AND via = $2
     )`,
    [cliente.id, indirizzo],
  );

  return { ...cliente, indirizzi: await getIndirizziCliente(cliente.id) };
}

function normalizzaCoordinata(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizzaPayloadCliente(body = {}) {
  return {
    ...body,
    clienteCode: body.clienteCode ?? body.idCliente ?? body.id_cliente ?? body.codiceCliente ?? body.codice_cliente ?? "",
    ragioneSociale: body.ragioneSociale ?? body.ragione_sociale ?? body.condominio ?? "",
    referente: body.referente ?? "",
    associazione: body.associazione ?? body.amministratore ?? "",
    telefono: body.telefono ?? "",
    email: body.email ?? body.emailPrincipale ?? body.email_principale ?? "",
    emailReferente: body.emailReferente ?? body.email_referente ?? "",
    emailAmministratore: body.emailAmministratore ?? body.email_amministratore ?? "",
    indirizzo: body.indirizzo ?? body.via ?? "",
    cap: body.cap ?? "",
    comune: body.comune ?? "",
    provincia: body.provincia ?? "",
    note: body.note ?? body.noteCliente ?? body.note_cliente ?? "",
    tipologiaCliente: body.tipologiaCliente ?? body.tipologia_cliente ?? "",
    latitudine: normalizzaCoordinata(body.latitudine),
    longitudine: normalizzaCoordinata(body.longitudine),
  };
}

let schemaClientiPromise;

function ensureClientiSchema() {
  if (!schemaClientiPromise) {
    schemaClientiPromise = Promise.all([
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS tipologia_cliente TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS latitudine NUMERIC(10, 7)"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS longitudine NUMERIC(10, 7)"),
    ]);
  }

  return schemaClientiPromise;
}

async function verificaClienteCodeUnivoco(clienteCode, clienteId = null) {
  const codice = String(clienteCode || "").trim();
  if (!codice) return;

  const result = await query(
    `SELECT id
     FROM clienti
     WHERE LOWER(BTRIM(cliente_code)) = LOWER(BTRIM($1))
       AND ($2::text IS NULL OR id::text <> $2::text)
     LIMIT 1`,
    [codice, clienteId ? String(clienteId) : null],
  );

  if (result.rows.length) {
    const error = new Error("ID Cliente già utilizzato.");
    error.status = 409;
    throw error;
  }
}

async function verificaRagioneSocialeUnivoca(ragioneSociale, clienteId = null) {
  const nome = String(ragioneSociale || "").trim();
  if (!nome) return;

  const result = await query(
    `SELECT id
     FROM clienti
     WHERE LOWER(BTRIM(ragione_sociale)) = LOWER(BTRIM($1))
       AND ($2::text IS NULL OR id::text <> $2::text)
     LIMIT 1`,
    [nome, clienteId ? String(clienteId) : null],
  );

  if (result.rows.length) {
    const error = new Error("Cliente già presente in anagrafica.");
    error.status = 409;
    throw error;
  }
}

router.use(asyncHandler(async (_req, _res, next) => {
  await ensureClientiSchema();
  next();
}));

router.get("/", asyncHandler(async (req, res) => {
  res.json(await aggiungiIndirizzi(await repository.findAll()));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const item = await repository.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Cliente non trovato" });
  res.json((await aggiungiIndirizzi([item]))[0]);
}));

router.post("/import-excel", asyncHandler(async (req, res) => {
  const mode = req.body.mode === "import" ? "import" : "preview";
  const base64 = String(req.body.fileBase64 || "").split(",").pop();
  if (!base64) return res.status(400).json({ message: "File Excel mancante." });

  let workbook;
  try {
    const XLSX = await import("xlsx");
    workbook = XLSX.read(Buffer.from(base64, "base64"), { type: "buffer", cellDates: false, raw: false });
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" || String(error.message || "").includes("xlsx")) {
      return res.status(500).json({ message: "Dipendenza xlsx non installata. Esegui npm install prima dell'importazione." });
    }
    throw error;
  }

  const XLSX = await import("xlsx");
  const sheet = workbook.Sheets.Foglio1 || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return res.status(400).json({ message: "Foglio1 non trovato nel file Excel." });

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const excelClienti = rows.map(clienteDaExcel);
  const codiciVisti = new Set();
  const summary = {
    righeLette: rows.length,
    nuoviClienti: 0,
    clientiAggiornati: 0,
    duplicatiEvitati: 0,
    righeSaltate: 0,
    errori: 0,
    righeIncomplete: 0,
    mode,
  };
  const errori = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const clientiDb = (await client.query("SELECT * FROM clienti")).rows.map(toCamel);
    const byCode = new Map();
    const byName = new Map();

    const maps = { byCode, byName };
    clientiDb.forEach((cliente) => indicizzaCliente(cliente, maps));

    for (const excel of excelClienti) {
      const codeKey = normalizzaChiave(excel.clienteCode);
      if (!excel.clienteCode || !excel.ragioneSociale) {
        summary.righeIncomplete += 1;
        summary.righeSaltate += 1;
        continue;
      }
      if (codiciVisti.has(codeKey)) {
        summary.duplicatiEvitati += 1;
        continue;
      }
      codiciVisti.add(codeKey);

      const clienteEsistente =
        byCode.get(codeKey) ||
        byName.get(normalizzaNome(excel.ragioneSociale));

      if (clienteEsistente) {
        summary.clientiAggiornati += 1;
        const payload = mergeClientePayload(clienteEsistente, excel);
        indicizzaCliente({ ...clienteEsistente, ...payload }, maps);
        if (mode === "import") {
          const fields = clienteFields.filter((field) => payload[field] !== undefined);
          const assignments = fields.map((field, index) => `${toSnake(field)} = $${index + 2}`);
          const aggiornata = await client.query(
            `UPDATE clienti SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $1`,
            [clienteEsistente.id, ...fields.map((field) => payload[field])],
          );
          indicizzaCliente(toCamel(aggiornata.rows[0] || { id: clienteEsistente.id, ...payload }), maps);
        }
      } else {
        summary.nuoviClienti += 1;
        indicizzaCliente(excel, maps);
        if (mode === "import") {
          const fields = clienteFields.filter((field) => excel[field] !== undefined);
          const columns = fields.map(toSnake);
          const placeholders = fields.map((_, index) => `$${index + 1}`);
          const values = fields.map((field) => excel[field]);
          const inserita = await client.query(
            `INSERT INTO clienti (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
            values,
          );
          indicizzaCliente(toCamel(inserita.rows[0] || excel), maps);
        }
      }
    }

    if (mode === "import") {
      const backupDir = path.resolve("backups");
      await fs.mkdir(backupDir, { recursive: true });
      await fs.writeFile(
        path.join(backupDir, `clienti-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
        JSON.stringify(clientiDb, null, 2),
      );

      await client.query(
        `UPDATE preventivi p
         SET cliente_id = c.id,
             cliente_code = c.cliente_code,
             cliente_nome = COALESCE(NULLIF(p.cliente_nome, ''), c.ragione_sociale),
             updated_at = NOW()
         FROM clienti c
         WHERE (
             p.cliente_id = c.id
             OR LOWER(BTRIM(COALESCE(p.cliente_nome, p.cliente, ''))) = LOWER(BTRIM(c.ragione_sociale))
           )
           AND BTRIM(COALESCE(c.cliente_code, '')) <> ''
           AND (p.cliente_code IS NULL OR BTRIM(p.cliente_code) = '' OR p.cliente_code <> c.cliente_code)`,
      );
    }

    if (mode === "preview") {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    res.json({ ...summary, errori });
  } catch (error) {
    await client.query("ROLLBACK");
    summary.errori += 1;
    errori.push(error.message);
    res.status(500).json({ ...summary, errori, message: "Importazione annullata: nessun dato modificato." });
  } finally {
    client.release();
  }
}));

router.post("/", asyncHandler(async (req, res) => {
  const body = normalizzaPayloadCliente(req.body);
  const clienteCode = String(body.clienteCode || "").trim();
  if (!clienteCode) return res.status(400).json({ message: "Inserisci ID Cliente." });
  if (clienteCode.length > 20) return res.status(400).json({ message: "ID Cliente massimo 20 caratteri." });

  await verificaClienteCodeUnivoco(clienteCode);
  await verificaRagioneSocialeUnivoca(body.ragioneSociale);
  const item = await repository.create({
    ...body,
    clienteCode,
    associazione: body.associazione,
  });
  res.status(201).json(await sincronizzaIndirizzoLegacy(item));
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const body = normalizzaPayloadCliente(req.body);
  const clienteCode = String(body.clienteCode || "").trim();
  if (!clienteCode) return res.status(400).json({ message: "Inserisci ID Cliente." });
  if (clienteCode.length > 20) return res.status(400).json({ message: "ID Cliente massimo 20 caratteri." });

  await verificaClienteCodeUnivoco(clienteCode, req.params.id);
  await verificaRagioneSocialeUnivoca(body.ragioneSociale, req.params.id);
  const item = await repository.update(req.params.id, {
    ...body,
    clienteCode,
    associazione: body.associazione,
  });
  if (!item) return res.status(404).json({ message: "Cliente non trovato" });
  res.json(await sincronizzaIndirizzoLegacy(item));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const item = await repository.remove(req.params.id);
  if (!item) return res.status(404).json({ message: "Cliente non trovato" });
  res.json({ deleted: true, item });
}));

export default router;
