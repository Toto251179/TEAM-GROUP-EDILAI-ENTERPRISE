import { Router } from "express";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pool, query } from "../config/db.js";
import { env } from "../config/env.js";
import { createCrudRepository } from "../utils/crud.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const clienteFields = [
  "idCliente",
  "clienteCode",
  "ragioneSociale",
  "referente",
  "amministratore",
  "associazione",
  "telefono",
  "emailPrincipale",
  "email",
  "emailReferente",
  "emailAmministratore",
  "via",
  "indirizzo",
  "cap",
  "comune",
  "provincia",
  "noteCliente",
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
const SOTTOCARTELLE_CLIENTE = ["PREVENTIVI", "CANTIERI", "CHIAMATE", "RAPPORTINI", "FOTO", "DOCUMENTI"];

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

function creaErroreCliente(status, message, field, code = `HTTP_${status}`, extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.field = field;
  Object.assign(error, extra);
  return error;
}

function clienteResponse(cliente) {
  if (!cliente) return cliente;

  const idCliente = cliente.idCliente || cliente.clienteCode || "";
  const amministratore = cliente.amministratore || cliente.associazione || "";
  const emailPrincipale = cliente.emailPrincipale || cliente.email || "";
  const via = cliente.via || cliente.indirizzo || "";
  const noteCliente = cliente.noteCliente || cliente.note || "";

  return {
    ...cliente,
    idCliente,
    clienteCode: idCliente,
    amministratore,
    associazione: amministratore,
    emailPrincipale,
    email: emailPrincipale,
    via,
    indirizzo: via,
    noteCliente,
    note: noteCliente,
  };
}

function safeFolderName(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

function abbreviaPercorso(percorso) {
  const home = os.homedir();
  return percorso && percorso.startsWith(home) ? percorso.replace(home, "~") : percorso;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function leggiPercorsoArchivioConfigurato() {
  let archivePath = "";
  try {
    const result = await query("SELECT data->>'archivePath' AS archive_path FROM system_settings WHERE id = $1", ["system"]);
    archivePath = String(result.rows[0]?.archive_path || "").trim();
  } catch (error) {
    if (error.code !== "42P01") throw error;
  }

  const home = os.homedir();
  const oneDrive = process.env.OneDrive || process.env.OneDriveCommercial || process.env.OneDriveConsumer;
  const candidati = [
    archivePath,
    process.env.PREVENTIVI_OUTPUT_DIR,
    env.preventivi.outputDir,
    path.join(home, "Desktop", "PREVENTIVI TEAM GROUP"),
    oneDrive ? path.join(oneDrive, "Desktop", "PREVENTIVI TEAM GROUP") : "",
  ]
    .filter(Boolean)
    .filter((item) => !String(item).includes("<UTENTE>"))
    .map((item) => path.resolve(item));

  const unici = [...new Set(candidati)];
  if (!unici.length) return "";

  for (const candidato of unici) {
    if (await pathExists(candidato)) return candidato;
  }

  return unici[0];
}

async function trovaCartellaCliente(clientiRoot, idClienteSafe) {
  try {
    const entries = await fs.readdir(clientiRoot, { withFileTypes: true });
    return entries.find((entry) => entry.isDirectory() && entry.name.toUpperCase().startsWith(`${idClienteSafe.toUpperCase()} - `))?.name || "";
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function risolviCartellaCliente(cliente, { crea = false, apri = false } = {}) {
  const archiveRoot = await leggiPercorsoArchivioConfigurato();
  if (!archiveRoot) {
    throw creaErroreCliente(400, "Cartella archivio non configurata.", "archivePath", "ARCHIVIO_NON_CONFIGURATO");
  }

  const idCliente = cliente.idCliente || cliente.clienteCode || "";
  const ragioneSociale = cliente.ragioneSociale || "";
  const idClienteSafe = safeFolderName(idCliente);
  const ragioneSocialeSafe = safeFolderName(ragioneSociale);
  if (!idClienteSafe || !ragioneSocialeSafe) {
    throw creaErroreCliente(400, "ID Cliente e ragione sociale sono obbligatori per la cartella archivio.", "id_cliente", "CLIENTE_ARCHIVIO_DATI_MANCANTI");
  }

  const clientiRoot = path.join(archiveRoot, "CLIENTI");
  const nomeCartella = `${idClienteSafe} - ${ragioneSocialeSafe}`;
  const esistente = await trovaCartellaCliente(clientiRoot, idClienteSafe);
  const folderPath = path.join(clientiRoot, esistente || nomeCartella);
  const existsBefore = Boolean(esistente) || await pathExists(folderPath);

  if (crea) {
    await fs.mkdir(folderPath, { recursive: true });
    await Promise.all(SOTTOCARTELLE_CLIENTE.map((nome) => fs.mkdir(path.join(folderPath, nome), { recursive: true })));
  }

  const existsAfter = await pathExists(folderPath);
  let apertura = false;
  if (apri) {
    if (!existsAfter) {
      throw creaErroreCliente(404, "Cartella cliente non trovata.", "folderPath", "CARTELLA_CLIENTE_NON_TROVATA", { folderPath });
    }
    if (process.platform !== "win32") {
      throw creaErroreCliente(500, "Apertura cartella disponibile solo su desktop Windows.", "folderPath", "APERTURA_CARTELLA_NON_SUPPORTATA", { folderPath });
    }
    spawn("explorer.exe", [folderPath], { detached: true, stdio: "ignore" }).unref();
    apertura = true;
  }

  return {
    archiveRoot,
    clientiRoot,
    folderName: path.basename(folderPath),
    folderPath,
    percorsoAbbreviato: abbreviaPercorso(folderPath),
    exists: existsAfter,
    created: crea && !existsBefore,
    found: existsBefore,
    opened: apertura,
    status: existsAfter ? "Cartella collegata" : "Cartella non trovata",
    subfolders: SOTTOCARTELLE_CLIENTE,
  };
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
    idCliente: pick(row, "COD. IONE"),
    clienteCode: pick(row, "COD. IONE"),
    ragioneSociale: pick(row, "RAGIONE SOCIALE"),
    via: pick(row, "INDIRIZZO"),
    indirizzo: pick(row, "INDIRIZZO"),
    cap: pick(row, "CAP"),
    comune: pick(row, "CITTA'"),
    provincia: pick(row, "PROV"),
    referente: pick(row, "REFERENTE"),
    amministratore: pick(row, "ASSOCIAZIONE") || pick(row, "AMMINISTRATORE"),
    associazione: pick(row, "ASSOCIAZIONE") || pick(row, "AMMINISTRATORE"),
    emailPrincipale: pick(row, "MAIL"),
    email: pick(row, "MAIL"),
    tipologiaCliente: pick(row, "TIPOLOGIA CLIENTE") || pick(row, "TIPOLOGIA"),
    latitudine: pick(row, "LATITUDINE"),
    longitudine: pick(row, "LONGITUDINE"),
  };
  return cliente;
}

function mergeClientePayload(attuale, excel) {
  return {
    idCliente: pulisciValore(attuale.idCliente) || pulisciValore(attuale.clienteCode) || excel.idCliente || excel.clienteCode,
    clienteCode: pulisciValore(attuale.clienteCode) || excel.clienteCode,
    ragioneSociale: pulisciValore(attuale.ragioneSociale) || excel.ragioneSociale,
    referente: pulisciValore(attuale.referente) || excel.referente,
    amministratore: pulisciValore(attuale.amministratore) || pulisciValore(attuale.associazione) || excel.amministratore || excel.associazione,
    associazione: pulisciValore(attuale.associazione) || pulisciValore(attuale.amministratore) || excel.associazione,
    telefono: pulisciValore(attuale.telefono),
    emailPrincipale: pulisciValore(attuale.emailPrincipale) || pulisciValore(attuale.email) || excel.emailPrincipale || excel.email,
    email: pulisciValore(attuale.email) || excel.email,
    emailReferente: pulisciValore(attuale.emailReferente),
    emailAmministratore: pulisciValore(attuale.emailAmministratore),
    via: pulisciValore(attuale.via) || pulisciValore(attuale.indirizzo) || excel.via || excel.indirizzo,
    indirizzo: pulisciValore(attuale.indirizzo) || excel.indirizzo,
    cap: pulisciValore(attuale.cap) || excel.cap,
    comune: pulisciValore(attuale.comune) || excel.comune,
    provincia: pulisciValore(attuale.provincia) || excel.provincia,
    noteCliente: pulisciValore(attuale.noteCliente) || pulisciValore(attuale.note),
    note: pulisciValore(attuale.note),
    tipologiaCliente: pulisciValore(attuale.tipologiaCliente) || excel.tipologiaCliente,
    latitudine: attuale.latitudine ?? normalizzaCoordinata(excel.latitudine),
    longitudine: attuale.longitudine ?? normalizzaCoordinata(excel.longitudine),
  };
}

function indicizzaCliente(cliente, maps) {
  const codice = cliente.idCliente || cliente.clienteCode;
  if (normalizzaChiave(codice)) maps.byCode.set(normalizzaChiave(codice), cliente);
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
    ...clienteResponse(cliente),
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
    idCliente: body.idCliente ?? body.id_cliente ?? body.clienteCode ?? body.codiceCliente ?? body.codice_cliente ?? "",
    clienteCode: body.clienteCode ?? body.idCliente ?? body.id_cliente ?? body.codiceCliente ?? body.codice_cliente ?? "",
    ragioneSociale: body.ragioneSociale ?? body.ragione_sociale ?? body.condominio ?? "",
    referente: body.referente ?? "",
    amministratore: body.amministratore ?? body.associazione ?? "",
    associazione: body.associazione ?? body.amministratore ?? "",
    telefono: body.telefono ?? "",
    emailPrincipale: body.emailPrincipale ?? body.email_principale ?? body.email ?? "",
    email: body.email ?? body.emailPrincipale ?? body.email_principale ?? "",
    emailReferente: body.emailReferente ?? body.email_referente ?? "",
    emailAmministratore: body.emailAmministratore ?? body.email_amministratore ?? "",
    via: body.via ?? body.indirizzo ?? "",
    indirizzo: body.indirizzo ?? body.via ?? "",
    cap: body.cap ?? "",
    comune: body.comune ?? "",
    provincia: body.provincia ?? "",
    noteCliente: body.noteCliente ?? body.note_cliente ?? body.note ?? "",
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
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS id_cliente TEXT NOT NULL DEFAULT ''"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS amministratore TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS email_principale TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS via TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS note_cliente TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS cliente_code TEXT NOT NULL DEFAULT ''"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS associazione TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS email TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS indirizzo TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS note TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS email_referente TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS email_amministratore TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS cap TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS comune TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS provincia TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS tipologia_cliente TEXT"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS latitudine NUMERIC(10, 7)"),
      query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS longitudine NUMERIC(10, 7)"),
    ]).then(async () => {
      await query(
        `UPDATE clienti
         SET id_cliente = COALESCE(NULLIF(id_cliente, ''), cliente_code),
             cliente_code = COALESCE(NULLIF(cliente_code, ''), id_cliente),
             amministratore = COALESCE(NULLIF(amministratore, ''), associazione),
             associazione = COALESCE(NULLIF(associazione, ''), amministratore),
             email_principale = COALESCE(NULLIF(email_principale, ''), email),
             email = COALESCE(NULLIF(email, ''), email_principale),
             via = COALESCE(NULLIF(via, ''), indirizzo),
             indirizzo = COALESCE(NULLIF(indirizzo, ''), via),
             note_cliente = COALESCE(NULLIF(note_cliente, ''), note),
             note = COALESCE(NULLIF(note, ''), note_cliente)
         WHERE id_cliente = ''
            OR cliente_code = ''
            OR amministratore IS NULL
            OR associazione IS NULL
            OR email_principale IS NULL
            OR email IS NULL
            OR via IS NULL
            OR indirizzo IS NULL
            OR note_cliente IS NULL
            OR note IS NULL`,
      );
      await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS clienti_id_cliente_uidx
         ON clienti (LOWER(BTRIM(id_cliente)))
         WHERE BTRIM(id_cliente) <> ''`,
      );
    });
  }

  return schemaClientiPromise;
}

// eslint-disable-next-line no-unused-vars
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

// eslint-disable-next-line no-unused-vars
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

function validaClienteObbligatorio(body) {
  const idCliente = String(body.idCliente || body.clienteCode || "").trim();
  const ragioneSociale = String(body.ragioneSociale || "").trim();

  if (!idCliente) {
    throw creaErroreCliente(400, "Inserisci ID Cliente.", "id_cliente", "CLIENTE_VALIDAZIONE");
  }
  if (idCliente.length > 20) {
    throw creaErroreCliente(400, "ID Cliente massimo 20 caratteri.", "id_cliente", "CLIENTE_VALIDAZIONE");
  }
  if (!ragioneSociale) {
    throw creaErroreCliente(400, "Inserisci la ragione sociale del cliente.", "ragione_sociale", "CLIENTE_VALIDAZIONE");
  }

  return { idCliente, ragioneSociale };
}

async function verificaIdClienteUnivoco(idCliente, clienteId = null) {
  const result = await query(
    `SELECT id, id_cliente, cliente_code, ragione_sociale
     FROM clienti
     WHERE LOWER(BTRIM(COALESCE(NULLIF(id_cliente, ''), cliente_code))) = LOWER(BTRIM($1))
       AND ($2::text IS NULL OR id::text <> $2::text)
     LIMIT 1`,
    [idCliente, clienteId ? String(clienteId) : null],
  );

  if (result.rows.length) {
    throw creaErroreCliente(
      409,
      "ID Cliente già utilizzato.",
      "id_cliente",
      "CLIENTE_DUPLICATO",
      { existingCliente: clienteResponse(toCamel(result.rows[0])) },
    );
  }
}

async function contaCollegamentiCliente(cliente) {
  const clienteId = String(cliente.id);
  const idCliente = cliente.idCliente || cliente.clienteCode || "";
  const ragioneSociale = cliente.ragioneSociale || "";

  const [preventiviRes, cantieriRes] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count
       FROM preventivi
       WHERE cliente_id::text = $1
          OR LOWER(BTRIM(COALESCE(cliente_code, ''))) = LOWER(BTRIM($2))
          OR LOWER(BTRIM(COALESCE(cliente_nome, cliente, ''))) = LOWER(BTRIM($3))`,
      [clienteId, idCliente, ragioneSociale],
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM cantieri
       WHERE cliente_id::text = $1
          OR LOWER(BTRIM(COALESCE(cliente_code, ''))) = LOWER(BTRIM($2))
          OR LOWER(BTRIM(COALESCE(cliente, ''))) = LOWER(BTRIM($3))`,
      [clienteId, idCliente, ragioneSociale],
    ),
  ]);

  return {
    preventivi: preventiviRes.rows[0]?.count || 0,
    cantieri: cantieriRes.rows[0]?.count || 0,
  };
}

router.use(asyncHandler(async (_req, _res, next) => {
  await ensureClientiSchema();
  next();
}));

router.get("/", asyncHandler(async (req, res) => {
  res.json(await aggiungiIndirizzi((await repository.findAll()).map(clienteResponse)));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const item = await repository.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Cliente non trovato" });
  res.json((await aggiungiIndirizzi([clienteResponse(item)]))[0]);
}));

router.get("/:id/cartella", asyncHandler(async (req, res) => {
  const item = await repository.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Cliente non trovato" });
  res.json(await risolviCartellaCliente(clienteResponse(item), { crea: false, apri: false }));
}));

router.post("/:id/crea-cartella", asyncHandler(async (req, res) => {
  const item = await repository.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Cliente non trovato" });
  const archivio = await risolviCartellaCliente(clienteResponse(item), { crea: true, apri: false });
  res.status(archivio.created ? 201 : 200).json({
    message: archivio.created ? "Cartella cliente creata." : "Cartella cliente già presente.",
    archivio,
  });
}));

router.post("/:id/apri-cartella", asyncHandler(async (req, res) => {
  const item = await repository.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Cliente non trovato" });
  const archivio = await risolviCartellaCliente(clienteResponse(item), { crea: true, apri: true });
  res.json({
    message: archivio.created ? "Cartella cliente creata e aperta." : "Cartella cliente aperta.",
    archivio,
  });
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
  const { idCliente } = validaClienteObbligatorio(body);

  await verificaIdClienteUnivoco(idCliente);
  const item = await repository.create({
    ...body,
    idCliente,
    clienteCode: idCliente,
    amministratore: body.amministratore,
    associazione: body.amministratore,
    emailPrincipale: body.emailPrincipale,
    email: body.emailPrincipale,
    via: body.via,
    indirizzo: body.via,
    noteCliente: body.noteCliente,
    note: body.noteCliente,
  });
  res.status(201).json(await sincronizzaIndirizzoLegacy(clienteResponse(item)));
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const body = normalizzaPayloadCliente(req.body);
  const { idCliente } = validaClienteObbligatorio(body);

  await verificaIdClienteUnivoco(idCliente, req.params.id);
  const item = await repository.update(req.params.id, {
    ...body,
    idCliente,
    clienteCode: idCliente,
    amministratore: body.amministratore,
    associazione: body.amministratore,
    emailPrincipale: body.emailPrincipale,
    email: body.emailPrincipale,
    via: body.via,
    indirizzo: body.via,
    noteCliente: body.noteCliente,
    note: body.noteCliente,
  });
  if (!item) return res.status(404).json({ message: "Cliente non trovato" });
  res.json(await sincronizzaIndirizzoLegacy(clienteResponse(item)));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const cliente = await repository.findById(req.params.id);
  if (!cliente) return res.status(404).json({ message: "Cliente non trovato" });

  const collegamenti = await contaCollegamentiCliente(clienteResponse(cliente));
  if (collegamenti.preventivi || collegamenti.cantieri) {
    throw creaErroreCliente(
      409,
      `Cliente collegato a ${collegamenti.preventivi} preventivi e ${collegamenti.cantieri} cantieri. Eliminazione annullata.`,
      "id_cliente",
      "CLIENTE_COLLEGATO",
      { collegamenti },
    );
  }

  const item = await repository.remove(req.params.id);
  res.json({ deleted: true, message: "Cliente eliminato correttamente.", item: clienteResponse(item) });
}));

export default router;
