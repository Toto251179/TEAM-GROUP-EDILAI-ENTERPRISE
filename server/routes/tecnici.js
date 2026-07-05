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

function creaToken(squadra) {
  return Buffer.from(JSON.stringify({ squadraId: squadra.id, codice: squadra.codiceAccesso })).toString("base64url");
}

function leggiToken(req) {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!raw) return null;

  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

async function autenticaSquadra(req, res, next) {
  const token = leggiToken(req);
  if (!token?.squadraId) return res.status(401).json({ message: "Accesso tecnico richiesto" });

  const result = await query(
    "SELECT * FROM tecnici_squadre WHERE id = $1 AND attiva = TRUE LIMIT 1",
    [token.squadraId],
  );

  if (!result.rows[0]) return res.status(401).json({ message: "Squadra non autorizzata" });

  req.squadra = toCamel(result.rows[0]);
  return next();
}

async function getChiamataAutorizzata(chiamataId, squadraId) {
  const result = await query(
    `SELECT *
     FROM chiamate_tecnici
     WHERE id = $1 AND squadra_id = $2
     LIMIT 1`,
    [chiamataId, squadraId],
  );

  return result.rows[0] ? toCamel(result.rows[0]) : null;
}

async function getFoto(chiamataId) {
  const result = await query(
    `SELECT id, tipo, nome_file, mime_type, data_url, created_at
     FROM chiamate_tecnici_foto
     WHERE chiamata_id = $1
     ORDER BY created_at DESC`,
    [chiamataId],
  );

  return result.rows.map(toCamel);
}

let schemaUfficioPromise;

function codiceAccessoDaNome(nome) {
  return String(nome || "SQUADRA")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 24) || "SQUADRA";
}

function toNumber(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function generaGoogleMapsLink(indirizzo, posizione = "") {
  const query = String(indirizzo || posizione || "").replace(/\s+/g, " ").trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query).replace(/%20/g, "+")}` : "";
}

const SPESE_GENERALI_PERCENTUALE = 20;
const MARGINI_CONSUNTIVO = [25, 30, 35, 40, 45, 50];

async function ensureSchemaUfficio() {
  if (!schemaUfficioPromise) {
    schemaUfficioPromise = (async () => {
      await query("ALTER TABLE tecnici_squadre ADD COLUMN IF NOT EXISTS colore TEXT NOT NULL DEFAULT '#1565c0'");
      await query("ALTER TABLE tecnici_squadre ADD COLUMN IF NOT EXISTS mezzo_assegnato TEXT");
      await query("ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS coordinate TEXT");
      await query("ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS dipendenti_presenti TEXT");
      await query("ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS ore_lavorate NUMERIC DEFAULT 0");
      await query("ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS km_percorsi NUMERIC DEFAULT 0");
      await query("ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS costo_km NUMERIC DEFAULT 0.75");
      await query("ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS tempo_viaggio TEXT");
      await query("ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS materiali_usati JSONB DEFAULT '[]'::jsonb");
      await query("ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS note_chiusura TEXT");

      await query(`CREATE TABLE IF NOT EXISTS consuntivazioni_tecnici (
        id SERIAL PRIMARY KEY,
        chiamata_id INTEGER UNIQUE REFERENCES chiamate_tecnici(id) ON DELETE CASCADE,
        numero_chiamata TEXT NOT NULL,
        cliente TEXT,
        id_cliente TEXT,
        indirizzo TEXT,
        descrizione TEXT,
        dipendenti_presenti TEXT,
        ore_lavorate NUMERIC NOT NULL DEFAULT 0,
        costo_orario_medio NUMERIC NOT NULL DEFAULT 0,
        costo_manodopera NUMERIC NOT NULL DEFAULT 0,
        km_percorsi NUMERIC NOT NULL DEFAULT 0,
        costo_km NUMERIC NOT NULL DEFAULT 0.75,
        costo_percorso NUMERIC NOT NULL DEFAULT 0,
        tempo_viaggio TEXT,
        materiali JSONB NOT NULL DEFAULT '[]'::jsonb,
        costo_materiali NUMERIC NOT NULL DEFAULT 0,
        costo_diretto NUMERIC NOT NULL DEFAULT 0,
        spese_generali_percentuale NUMERIC NOT NULL DEFAULT 20,
        spese_generali NUMERIC NOT NULL DEFAULT 0,
        totale_costo_azienda NUMERIC NOT NULL DEFAULT 0,
        margine_percentuale NUMERIC NOT NULL DEFAULT 30,
        margine_azienda NUMERIC NOT NULL DEFAULT 0,
        totale_consuntivo NUMERIC NOT NULL DEFAULT 0,
        totale_costo_interno NUMERIC NOT NULL DEFAULT 0,
        importo_da_fatturare NUMERIC NOT NULL DEFAULT 0,
        margine NUMERIC NOT NULL DEFAULT 0,
        stato TEXT NOT NULL DEFAULT 'DA CONSUNTIVARE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query("ALTER TABLE consuntivazioni_tecnici ADD COLUMN IF NOT EXISTS costo_diretto NUMERIC NOT NULL DEFAULT 0");
      await query("ALTER TABLE consuntivazioni_tecnici ADD COLUMN IF NOT EXISTS spese_generali_percentuale NUMERIC NOT NULL DEFAULT 20");
      await query("ALTER TABLE consuntivazioni_tecnici ADD COLUMN IF NOT EXISTS spese_generali NUMERIC NOT NULL DEFAULT 0");
      await query("ALTER TABLE consuntivazioni_tecnici ADD COLUMN IF NOT EXISTS totale_costo_azienda NUMERIC NOT NULL DEFAULT 0");
      await query("ALTER TABLE consuntivazioni_tecnici ADD COLUMN IF NOT EXISTS margine_percentuale NUMERIC NOT NULL DEFAULT 30");
      await query("ALTER TABLE consuntivazioni_tecnici ADD COLUMN IF NOT EXISTS margine_azienda NUMERIC NOT NULL DEFAULT 0");
      await query("ALTER TABLE consuntivazioni_tecnici ADD COLUMN IF NOT EXISTS totale_consuntivo NUMERIC NOT NULL DEFAULT 0");

      await query(`CREATE TABLE IF NOT EXISTS tecnici_operatori (
        id SERIAL PRIMARY KEY,
        squadra_id INTEGER REFERENCES tecnici_squadre(id) ON DELETE SET NULL,
        nome TEXT NOT NULL,
        cognome TEXT NOT NULL,
        telefono TEXT,
        email TEXT,
        qualifica TEXT,
        lingua TEXT NOT NULL DEFAULT 'Italiano',
        stato TEXT NOT NULL DEFAULT 'Attivo',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS squadra_id INTEGER");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS nome TEXT");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS cognome TEXT");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS telefono TEXT");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS email TEXT");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS qualifica TEXT");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS lingua TEXT NOT NULL DEFAULT 'Italiano'");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'Attivo'");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS operaio_id INTEGER");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
      await query("ALTER TABLE tecnici_operatori ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
      await query("CREATE UNIQUE INDEX IF NOT EXISTS tecnici_operatori_operaio_id_unique ON tecnici_operatori(operaio_id) WHERE operaio_id IS NOT NULL");

      const tecniciCount = await query("SELECT COUNT(*)::INTEGER AS totale FROM tecnici_operatori");
      if (Number(tecniciCount.rows[0]?.totale || 0) === 0) {
        const squadra = await query(
          `INSERT INTO tecnici_squadre (nome, codice_accesso, colore, mezzo_assegnato, attiva)
           VALUES ('AMIR - SHEFI', 'AMIRSHEFI', '#1565c0', '', TRUE)
           ON CONFLICT (codice_accesso) DO UPDATE SET nome = EXCLUDED.nome
           RETURNING id`,
        );
        const squadraId = squadra.rows[0].id;

        await query(
          `INSERT INTO tecnici_operatori (squadra_id, nome, cognome, telefono, email, qualifica, lingua, stato)
           VALUES
           ($1, 'Amir', '', '', '', 'Tecnico', 'Italiano', 'Attivo'),
           ($1, 'Shefi', '', '', '', 'Tecnico', 'Italiano', 'Attivo')`,
          [squadraId],
        );

        await query(
          `INSERT INTO chiamate_tecnici
           (squadra_id, numero_chiamata, cliente, rif_ticket_cliente, numero_biglietto, cod_prog,
            descrizione_lavori, posizione, indirizzo, link_google_maps, stato, note_ufficio)
           SELECT $1, 'TG-000001', 'Cliente esempio', '', 'TK-0001', 'PRG-001',
                  'Chiamata di esempio assegnata alla squadra AMIR - SHEFI',
                  'Bolzano Vicentino (VI)',
                  'Via dell''Artigianato, 22 - Bolzano Vicentino (VI)',
                  'https://www.google.com/maps/search/?api=1&query=Via+dell+Artigianato+22+Bolzano+Vicentino+VI',
                  'Assegnato',
                  'Chiamata iniziale di esempio.'
           WHERE NOT EXISTS (SELECT 1 FROM chiamate_tecnici WHERE numero_chiamata = 'TG-000001')`,
          [squadraId],
        );
      }
    })();
  }

  return schemaUfficioPromise;
}

async function syncTecniciDaOperai() {
  const colonne = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'operai'`,
  );
  const disponibili = new Set(colonne.rows.map((row) => row.column_name));
  const cognomeExpr = disponibili.has("cognome") ? "COALESCE(o.cognome, '')" : "''";
  const emailExpr = disponibili.has("email") ? "COALESCE(o.email, '')" : "''";
  const qualificaExpr = disponibili.has("ruolo") ? "COALESCE(o.ruolo, o.mansione, 'Operaio')" : "COALESCE(o.mansione, 'Operaio')";
  const statoExpr = disponibili.has("attivo")
    ? "CASE WHEN COALESCE(o.attivo, TRUE) = TRUE AND o.stato <> 'Terminato' THEN 'Attivo' ELSE 'Non attivo' END"
    : "CASE WHEN o.stato <> 'Terminato' THEN 'Attivo' ELSE 'Non attivo' END";

  await query(
    `INSERT INTO tecnici_operatori (operaio_id, nome, cognome, telefono, email, qualifica, lingua, stato)
     SELECT o.id,
            o.nome,
            ${cognomeExpr},
            COALESCE(o.telefono, ''),
            ${emailExpr},
            ${qualificaExpr},
            'Italiano',
            ${statoExpr}
     FROM operai o
     WHERE ${qualificaExpr} IN ('Tecnico', 'Caposquadra', 'Operaio')
     ON CONFLICT (operaio_id) WHERE operaio_id IS NOT NULL DO UPDATE
     SET nome = EXCLUDED.nome,
         cognome = EXCLUDED.cognome,
         telefono = EXCLUDED.telefono,
         email = EXCLUDED.email,
         qualifica = EXCLUDED.qualifica,
         stato = EXCLUDED.stato,
         updated_at = NOW()`,
  );
}

async function generaNumeroChiamata() {
  const result = await query(
    `SELECT COALESCE(MAX((regexp_match(numero_chiamata, '^TG-([0-9]+)$'))[1]::INTEGER), 0) AS ultimo
     FROM chiamate_tecnici
     WHERE numero_chiamata ~ '^TG-[0-9]+$'`,
  );

  const prossimo = Number(result.rows[0]?.ultimo || 0) + 1;
  return `TG-${String(prossimo).padStart(6, "0")}`;
}

async function getChiamataUfficio(chiamataId) {
  const result = await query(
    `SELECT c.*, s.nome AS squadra_nome
     FROM chiamate_tecnici c
     LEFT JOIN tecnici_squadre s ON s.id = c.squadra_id
     WHERE c.id = $1
     LIMIT 1`,
    [chiamataId],
  );

  return result.rows[0] ? toCamel(result.rows[0]) : null;
}

async function getTecniciSquadra(squadraId) {
  if (!squadraId) return [];

  const result = await query(
    `SELECT id, nome, cognome, telefono, email, qualifica, lingua, stato, squadra_id
     FROM tecnici_operatori
     WHERE squadra_id = $1
     ORDER BY cognome, nome`,
    [squadraId],
  );

  return result.rows.map(toCamel);
}

async function creaConsuntivazioneDaChiamata(chiamata, body = {}) {
  const materiali = Array.isArray(body.materiali) ? body.materiali : [];
  const materialiCalcolati = materiali.map((item) => {
    const quantita = toNumber(item.quantita);
    const prezzoUnitario = toNumber(item.prezzoUnitario);
    return {
      materiale: item.materiale || "",
      quantita,
      prezzoUnitario,
      totale: quantita * prezzoUnitario,
    };
  });
  const oreLavorate = toNumber(body.oreLavorate);
  const costoOrarioMedio = toNumber(body.costoOrarioMedio);
  const costoManodopera = oreLavorate * costoOrarioMedio;
  const kmPercorsi = toNumber(body.kmPercorsi);
  const costoKm = toNumber(body.costoKm || 0.75);
  const costoPercorso = kmPercorsi * costoKm;
  const costoMateriali = materialiCalcolati.reduce((totale, item) => totale + toNumber(item.totale), 0);
  const costoDiretto = costoManodopera + costoPercorso + costoMateriali;
  const speseGenerali = costoDiretto * (SPESE_GENERALI_PERCENTUALE / 100);
  const totaleCostoAzienda = costoDiretto + speseGenerali;
  const marginePercentuale = MARGINI_CONSUNTIVO.includes(Number(body.marginePercentuale)) ? Number(body.marginePercentuale) : 30;
  const margineAzienda = totaleCostoAzienda * (marginePercentuale / 100);
  const totaleConsuntivo = totaleCostoAzienda + margineAzienda;

  await query(
    `INSERT INTO consuntivazioni_tecnici
     (chiamata_id, numero_chiamata, cliente, id_cliente, indirizzo, descrizione, dipendenti_presenti,
      ore_lavorate, costo_orario_medio, costo_manodopera, km_percorsi, costo_km, costo_percorso,
      tempo_viaggio, materiali, costo_materiali, costo_diretto, spese_generali_percentuale, spese_generali,
      totale_costo_azienda, margine_percentuale, margine_azienda, totale_consuntivo,
      totale_costo_interno, importo_da_fatturare, margine)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
     ON CONFLICT (chiamata_id) DO UPDATE
     SET dipendenti_presenti = EXCLUDED.dipendenti_presenti,
         ore_lavorate = EXCLUDED.ore_lavorate,
         costo_orario_medio = EXCLUDED.costo_orario_medio,
         costo_manodopera = EXCLUDED.costo_manodopera,
         km_percorsi = EXCLUDED.km_percorsi,
         costo_km = EXCLUDED.costo_km,
         costo_percorso = EXCLUDED.costo_percorso,
         tempo_viaggio = EXCLUDED.tempo_viaggio,
         materiali = EXCLUDED.materiali,
         costo_materiali = EXCLUDED.costo_materiali,
         costo_diretto = EXCLUDED.costo_diretto,
         spese_generali_percentuale = EXCLUDED.spese_generali_percentuale,
         spese_generali = EXCLUDED.spese_generali,
         totale_costo_azienda = EXCLUDED.totale_costo_azienda,
         margine_percentuale = EXCLUDED.margine_percentuale,
         margine_azienda = EXCLUDED.margine_azienda,
         totale_consuntivo = EXCLUDED.totale_consuntivo,
         totale_costo_interno = EXCLUDED.totale_costo_interno,
         importo_da_fatturare = EXCLUDED.importo_da_fatturare,
         margine = EXCLUDED.margine,
         updated_at = NOW()`,
    [
      chiamata.id,
      chiamata.numeroChiamata,
      chiamata.cliente,
      chiamata.rifTicketCliente || chiamata.numeroBiglietto || "",
      chiamata.indirizzo || chiamata.posizione || "",
      chiamata.descrizioneLavori || "",
      body.dipendentiPresenti || "",
      oreLavorate,
      costoOrarioMedio,
      costoManodopera,
      kmPercorsi,
      costoKm,
      costoPercorso,
      body.tempoViaggio || "",
      JSON.stringify(materialiCalcolati),
      costoMateriali,
      costoDiretto,
      SPESE_GENERALI_PERCENTUALE,
      speseGenerali,
      totaleCostoAzienda,
      marginePercentuale,
      margineAzienda,
      totaleConsuntivo,
      costoDiretto,
      totaleConsuntivo,
      margineAzienda,
    ],
  );
}

router.use("/ufficio", asyncHandler(async (_req, _res, next) => {
  await ensureSchemaUfficio();
  next();
}));

router.get("/ufficio/squadre", asyncHandler(async (_req, res) => {
  const result = await query(
    `SELECT id, nome, codice_accesso, colore, mezzo_assegnato, attiva, created_at, updated_at
     FROM tecnici_squadre
     ORDER BY nome`,
  );

  res.json(result.rows.map(toCamel));
}));

router.post("/ufficio/squadre", asyncHandler(async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  if (!nome) return res.status(400).json({ message: "Inserisci il nome squadra" });

  const codiceAccesso = String(req.body.codiceAccesso || codiceAccessoDaNome(nome)).trim().toUpperCase();
  const result = await query(
    `INSERT INTO tecnici_squadre (nome, codice_accesso, colore, mezzo_assegnato, attiva)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      nome,
      codiceAccesso,
      req.body.colore || "#1565c0",
      req.body.mezzoAssegnato || null,
      req.body.attiva !== false,
    ],
  );

  const squadra = toCamel(result.rows[0]);
  const tecnicoIds = Array.isArray(req.body.tecnicoIds) ? req.body.tecnicoIds : [];
  if (tecnicoIds.length) {
    await query("UPDATE tecnici_operatori SET squadra_id = NULL WHERE squadra_id = $1", [squadra.id]);
    await query("UPDATE tecnici_operatori SET squadra_id = $1 WHERE id = ANY($2::int[])", [squadra.id, tecnicoIds.map(Number)]);
  }

  res.status(201).json(squadra);
}));

router.put("/ufficio/squadre/:id", asyncHandler(async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  if (!nome) return res.status(400).json({ message: "Inserisci il nome squadra" });

  const result = await query(
    `UPDATE tecnici_squadre
     SET nome = $2,
         codice_accesso = $3,
         colore = $4,
         mezzo_assegnato = $5,
         attiva = $6,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      req.params.id,
      nome,
      String(req.body.codiceAccesso || codiceAccessoDaNome(nome)).trim().toUpperCase(),
      req.body.colore || "#1565c0",
      req.body.mezzoAssegnato || null,
      req.body.attiva !== false,
    ],
  );

  if (!result.rows[0]) return res.status(404).json({ message: "Squadra non trovata" });
  const squadra = toCamel(result.rows[0]);
  const tecnicoIds = Array.isArray(req.body.tecnicoIds) ? req.body.tecnicoIds : null;
  if (tecnicoIds) {
    await query("UPDATE tecnici_operatori SET squadra_id = NULL WHERE squadra_id = $1", [squadra.id]);
    if (tecnicoIds.length) {
      await query("UPDATE tecnici_operatori SET squadra_id = $1 WHERE id = ANY($2::int[])", [squadra.id, tecnicoIds.map(Number)]);
    }
  }

  res.json(squadra);
}));

router.delete("/ufficio/squadre/:id", asyncHandler(async (req, res) => {
  await query("UPDATE chiamate_tecnici SET squadra_id = NULL WHERE squadra_id = $1", [req.params.id]);
  await query("UPDATE tecnici_operatori SET squadra_id = NULL WHERE squadra_id = $1", [req.params.id]);
  const result = await query("DELETE FROM tecnici_squadre WHERE id = $1 RETURNING *", [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: "Squadra non trovata" });
  res.json({ deleted: true, item: toCamel(result.rows[0]) });
}));

router.get("/ufficio/tecnici", asyncHandler(async (_req, res) => {
  await syncTecniciDaOperai();

  const result = await query(
    `SELECT t.*, s.nome AS squadra_nome
     FROM tecnici_operatori t
     LEFT JOIN tecnici_squadre s ON s.id = t.squadra_id
     ORDER BY t.cognome, t.nome`,
  );

  res.json(result.rows.map(toCamel));
}));

router.post("/ufficio/tecnici", asyncHandler(async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const cognome = String(req.body.cognome || "").trim();
  if (!nome) return res.status(400).json({ message: "Inserisci il nome tecnico" });
  if (!cognome) return res.status(400).json({ message: "Inserisci il cognome tecnico" });

  const result = await query(
    `INSERT INTO tecnici_operatori
     (squadra_id, nome, cognome, telefono, email, qualifica, lingua, stato)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      req.body.squadraId || null,
      nome,
      cognome,
      req.body.telefono || "",
      req.body.email || "",
      req.body.qualifica || "",
      req.body.lingua || "Italiano",
      req.body.stato || "Attivo",
    ],
  );

  res.status(201).json(toCamel(result.rows[0]));
}));

router.put("/ufficio/tecnici/:id", asyncHandler(async (req, res) => {
  const nome = String(req.body.nome || "").trim();
  const cognome = String(req.body.cognome || "").trim();
  if (!nome) return res.status(400).json({ message: "Inserisci il nome tecnico" });
  if (!cognome) return res.status(400).json({ message: "Inserisci il cognome tecnico" });

  const result = await query(
    `UPDATE tecnici_operatori
     SET squadra_id = $2,
         nome = $3,
         cognome = $4,
         telefono = $5,
         email = $6,
         qualifica = $7,
         lingua = $8,
         stato = $9,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      req.params.id,
      req.body.squadraId || null,
      nome,
      cognome,
      req.body.telefono || "",
      req.body.email || "",
      req.body.qualifica || "",
      req.body.lingua || "Italiano",
      req.body.stato || "Attivo",
    ],
  );

  if (!result.rows[0]) return res.status(404).json({ message: "Tecnico non trovato" });
  res.json(toCamel(result.rows[0]));
}));

router.delete("/ufficio/tecnici/:id", asyncHandler(async (req, res) => {
  const result = await query("DELETE FROM tecnici_operatori WHERE id = $1 RETURNING *", [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: "Tecnico non trovato" });
  res.json({ deleted: true, item: toCamel(result.rows[0]) });
}));

router.get("/ufficio/chiamate", asyncHandler(async (req, res) => {
  const cerca = String(req.query.cerca || "").trim().toLowerCase();
  const stato = String(req.query.stato || "").trim();
  const params = [];
  const filtri = [];

  if (cerca) {
    params.push(`%${cerca}%`);
    filtri.push(`(
      LOWER(c.numero_chiamata) LIKE $${params.length}
      OR LOWER(c.cliente) LIKE $${params.length}
      OR LOWER(COALESCE(c.rif_ticket_cliente, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.numero_biglietto, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.cod_prog, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.indirizzo, '')) LIKE $${params.length}
    )`);
  }

  if (stato) {
    params.push(stato);
    filtri.push(`c.stato = $${params.length}`);
  }

  const where = filtri.length ? `WHERE ${filtri.join(" AND ")}` : "";
  const result = await query(
    `SELECT c.*, s.nome AS squadra_nome,
            COUNT(f.id)::INTEGER AS foto_totali
     FROM chiamate_tecnici c
     LEFT JOIN tecnici_squadre s ON s.id = c.squadra_id
     LEFT JOIN chiamate_tecnici_foto f ON f.chiamata_id = c.id
     ${where}
     GROUP BY c.id, s.nome
     ORDER BY c.updated_at DESC, c.created_at DESC`,
    params,
  );

  res.json(result.rows.map(toCamel));
}));

router.get("/ufficio/chiamate/:id", asyncHandler(async (req, res) => {
  const chiamata = await getChiamataUfficio(req.params.id);
  if (!chiamata) return res.status(404).json({ message: "Chiamata non trovata" });

  res.json({
    ...chiamata,
    foto: await getFoto(chiamata.id),
    tecnici: await getTecniciSquadra(chiamata.squadraId),
  });
}));

router.post("/ufficio/chiamate", asyncHandler(async (req, res) => {
  const numeroChiamata = String(req.body.numeroChiamata || "").trim() || await generaNumeroChiamata();
  const cliente = String(req.body.cliente || "").trim();

  if (!cliente) return res.status(400).json({ message: "Inserisci il cliente" });

  const result = await query(
    `INSERT INTO chiamate_tecnici
     (squadra_id, numero_chiamata, cliente, rif_ticket_cliente, numero_biglietto, cod_prog,
      descrizione_lavori, posizione, indirizzo, link_google_maps, stato, note_ufficio)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'Assegnato'), $12)
     RETURNING *`,
    [
      req.body.squadraId || null,
      numeroChiamata,
      cliente,
      req.body.rifTicketCliente || null,
      req.body.numeroBiglietto || null,
      req.body.codProg || null,
      req.body.descrizioneLavori || "",
      req.body.posizione || req.body.indirizzo || "",
      req.body.indirizzo || "",
      req.body.linkGoogleMaps || generaGoogleMapsLink(req.body.indirizzo, req.body.posizione),
      req.body.stato || "Assegnato",
      req.body.noteUfficio || "",
    ],
  );

  res.status(201).json(toCamel(result.rows[0]));
}));

router.put("/ufficio/chiamate/:id", asyncHandler(async (req, res) => {
  const chiamata = await getChiamataUfficio(req.params.id);
  if (!chiamata) return res.status(404).json({ message: "Chiamata non trovata" });

  const numeroChiamata = String(req.body.numeroChiamata || "").trim();
  const cliente = String(req.body.cliente || "").trim();
  if (!numeroChiamata) return res.status(400).json({ message: "Inserisci il numero chiamata" });
  if (!cliente) return res.status(400).json({ message: "Inserisci il cliente" });

  const result = await query(
    `UPDATE chiamate_tecnici
     SET squadra_id = $2,
         numero_chiamata = $3,
         cliente = $4,
         rif_ticket_cliente = $5,
         numero_biglietto = $6,
         cod_prog = $7,
         descrizione_lavori = $8,
         posizione = $9,
         indirizzo = $10,
         link_google_maps = $11,
         stato = $12,
         note_ufficio = $13,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      chiamata.id,
      req.body.squadraId || null,
      numeroChiamata,
      cliente,
      req.body.rifTicketCliente || null,
      req.body.numeroBiglietto || null,
      req.body.codProg || null,
      req.body.descrizioneLavori || "",
      req.body.posizione || req.body.indirizzo || "",
      req.body.indirizzo || "",
      req.body.linkGoogleMaps || generaGoogleMapsLink(req.body.indirizzo, req.body.posizione),
      req.body.stato || "Assegnato",
      req.body.noteUfficio || "",
    ],
  );

  res.json(toCamel(result.rows[0]));
}));

router.delete("/ufficio/chiamate/:id", asyncHandler(async (req, res) => {
  const result = await query(
    "DELETE FROM chiamate_tecnici WHERE id = $1 RETURNING *",
    [req.params.id],
  );

  if (!result.rows[0]) return res.status(404).json({ message: "Chiamata non trovata" });
  res.json({ deleted: true, item: toCamel(result.rows[0]) });
}));

router.post("/ufficio/chiamate/:id/foto-ufficio", asyncHandler(async (req, res) => {
  const chiamata = await getChiamataUfficio(req.params.id);
  if (!chiamata) return res.status(404).json({ message: "Chiamata non trovata" });
  if (!req.body.dataUrl) return res.status(400).json({ message: "Foto mancante" });

  const result = await query(
    `INSERT INTO chiamate_tecnici_foto (chiamata_id, tipo, nome_file, mime_type, data_url)
     VALUES ($1, 'ufficio', $2, $3, $4)
     RETURNING id, tipo, nome_file, mime_type, created_at`,
    [chiamata.id, req.body.nomeFile || null, req.body.mimeType || null, req.body.dataUrl],
  );

  res.status(201).json(toCamel(result.rows[0]));
}));

router.use(asyncHandler(async (_req, _res, next) => {
  await ensureSchemaUfficio();
  next();
}));

router.post("/login", asyncHandler(async (req, res) => {
  const codice = String(req.body.codice || "").trim().toUpperCase();
  if (!codice) return res.status(400).json({ message: "Inserisci il codice squadra" });

  const result = await query(
    "SELECT * FROM tecnici_squadre WHERE UPPER(codice_accesso) = $1 AND attiva = TRUE LIMIT 1",
    [codice],
  );

  if (!result.rows[0]) return res.status(401).json({ message: "Codice squadra non valido" });

  const squadra = toCamel(result.rows[0]);
  res.json({
    token: creaToken(squadra),
    squadra: {
      id: squadra.id,
      nome: squadra.nome,
    },
  });
}));

router.get("/me", autenticaSquadra, asyncHandler(async (req, res) => {
  res.json({ squadra: { id: req.squadra.id, nome: req.squadra.nome } });
}));

router.get("/chiamate", autenticaSquadra, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT *
     FROM chiamate_tecnici
     WHERE squadra_id = $1
       AND stato NOT IN ('Completato', 'CHIUSA', 'COMPLETATA')
     ORDER BY created_at DESC`,
    [req.squadra.id],
  );

  res.json(result.rows.map(toCamel));
}));

router.get("/storico", autenticaSquadra, asyncHandler(async (req, res) => {
  const cerca = String(req.query.cerca || "").trim();
  const params = [req.squadra.id];
  let filtro = "";

  if (cerca) {
    params.push(`%${cerca.toLowerCase()}%`);
    filtro = `AND (
      LOWER(cliente) LIKE $2
      OR LOWER(numero_chiamata) LIKE $2
      OR LOWER(COALESCE(rif_ticket_cliente, '')) LIKE $2
      OR LOWER(COALESCE(numero_biglietto, '')) LIKE $2
      OR LOWER(COALESCE(cod_prog, '')) LIKE $2
    )`;
  }

  const result = await query(
    `SELECT *
     FROM chiamate_tecnici
     WHERE squadra_id = $1
       AND stato IN ('Completato', 'CHIUSA', 'COMPLETATA')
       ${filtro}
     ORDER BY ora_fine DESC NULLS LAST, updated_at DESC
     LIMIT 100`,
    params,
  );

  res.json(result.rows.map(toCamel));
}));

router.get("/chiamate/:id", autenticaSquadra, asyncHandler(async (req, res) => {
  const chiamata = await getChiamataAutorizzata(req.params.id, req.squadra.id);
  if (!chiamata) return res.status(404).json({ message: "Chiamata non trovata" });

  res.json({
    ...chiamata,
    foto: await getFoto(chiamata.id),
  });
}));

router.put("/chiamate/:id/arrivo", autenticaSquadra, asyncHandler(async (req, res) => {
  const chiamata = await getChiamataAutorizzata(req.params.id, req.squadra.id);
  if (!chiamata) return res.status(404).json({ message: "Chiamata non trovata" });

  const result = await query(
    `UPDATE chiamate_tecnici
     SET ora_arrivo = COALESCE(ora_arrivo, NOW()),
         stato = CASE WHEN stato = 'Assegnato' THEN 'In Corso' ELSE stato END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [chiamata.id],
  );

  res.json({ ...toCamel(result.rows[0]), foto: await getFoto(chiamata.id) });
}));

router.put("/chiamate/:id", autenticaSquadra, asyncHandler(async (req, res) => {
  const chiamata = await getChiamataAutorizzata(req.params.id, req.squadra.id);
  if (!chiamata) return res.status(404).json({ message: "Chiamata non trovata" });

  const result = await query(
    `UPDATE chiamate_tecnici
     SET note_tecnico = $2,
         materiale_utilizzato = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [chiamata.id, req.body.noteTecnico || "", req.body.materialeUtilizzato || ""],
  );

  res.json({ ...toCamel(result.rows[0]), foto: await getFoto(chiamata.id) });
}));

router.post("/chiamate/:id/foto", autenticaSquadra, asyncHandler(async (req, res) => {
  const chiamata = await getChiamataAutorizzata(req.params.id, req.squadra.id);
  if (!chiamata) return res.status(404).json({ message: "Chiamata non trovata" });

  const tipo = String(req.body.tipo || "").trim();
  if (!["ufficio", "prima", "durante", "finale"].includes(tipo)) return res.status(400).json({ message: "Tipo foto non valido" });
  if (!req.body.dataUrl) return res.status(400).json({ message: "Foto mancante" });

  const result = await query(
    `INSERT INTO chiamate_tecnici_foto (chiamata_id, tipo, nome_file, mime_type, data_url)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, tipo, nome_file, mime_type, created_at`,
    [chiamata.id, tipo, req.body.nomeFile || null, req.body.mimeType || null, req.body.dataUrl],
  );

  res.status(201).json(toCamel(result.rows[0]));
}));

router.put("/chiamate/:id/chiudi", autenticaSquadra, asyncHandler(async (req, res) => {
  const chiamata = await getChiamataAutorizzata(req.params.id, req.squadra.id);
  if (!chiamata) return res.status(404).json({ message: "Chiamata non trovata" });

  const foto = await getFoto(chiamata.id);
  const haPrima = foto.some((item) => item.tipo === "prima");
  const haFinale = foto.some((item) => item.tipo === "finale");
  const materialeUtilizzato = String(req.body.materialeUtilizzato || "").trim();
  const rapportinoOriginale = String(req.body.rapportino || req.body.rapportinoItaliano || "").trim();
  const rapportinoLingua = req.body.rapportinoLingua || "Italiano";
  const dipendentiPresenti = String(req.body.dipendentiPresenti || "").trim();
  const oreLavorate = toNumber(req.body.oreLavorate);

  if (!haPrima) return res.status(400).json({ message: "Foto prima obbligatoria" });
  if (!haFinale) return res.status(400).json({ message: "Foto finale obbligatoria" });
  if (!materialeUtilizzato) return res.status(400).json({ message: "Materiale utilizzato obbligatorio. Scrivi anche 'nessun materiale'." });
  if (!rapportinoOriginale) return res.status(400).json({ message: "Rapportino obbligatorio" });
  if (!dipendentiPresenti) return res.status(400).json({ message: "Dipendenti presenti obbligatori" });
  if (oreLavorate <= 0) return res.status(400).json({ message: "Ore lavorate obbligatorie" });

  const result = await query(
    `UPDATE chiamate_tecnici
     SET note_tecnico = $2,
         materiale_utilizzato = $3,
         rapportino_lingua = $4,
         rapportino_italiano = $5,
         dipendenti_presenti = $6,
         ore_lavorate = $7,
         km_percorsi = $8,
         costo_km = $9,
         tempo_viaggio = $10,
         materiali_usati = $11::jsonb,
         note_chiusura = $12,
         ora_arrivo = COALESCE(ora_arrivo, NOW()),
         ora_fine = NOW(),
         stato = 'COMPLETATA',
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      chiamata.id,
      req.body.noteTecnico || "",
      materialeUtilizzato,
      rapportinoLingua,
      rapportinoOriginale,
      dipendentiPresenti,
      oreLavorate,
      toNumber(req.body.kmPercorsi),
      toNumber(req.body.costoKm || 0.75),
      req.body.tempoViaggio || "",
      JSON.stringify(Array.isArray(req.body.materiali) ? req.body.materiali : []),
      req.body.noteChiusura || "",
    ],
  );

  await creaConsuntivazioneDaChiamata(toCamel(result.rows[0]), req.body);
  res.json({ ...toCamel(result.rows[0]), foto });
}));

export default router;
