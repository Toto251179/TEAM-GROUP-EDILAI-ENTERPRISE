import { Router } from "express";
import { query } from "../config/db.js";
import { env } from "../config/env.js";
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

function addressFromCliente(cliente) {
  return [cliente.indirizzo, cliente.cap, cliente.comune, cliente.provincia].filter(Boolean).join(" ");
}

function markerFromRow(row) {
  if (!row.latitudine || !row.longitudine) return "rosso";
  if (Number(row.chiamate_aperte || 0) > 0) return "arancione";
  if (Number(row.cantieri_attivi || 0) > 0) return "verde";
  if (Number(row.preventivi_in_corso || 0) > 0) return "blu";
  return "grigio";
}

function normalizeCliente(row) {
  const item = toCamel(row);
  return {
    ...item,
    idCliente: item.clienteCode || "",
    ragioneSociale: item.ragioneSociale || "",
    amministratore: item.associazione || item.amministratore || "",
    emailPrincipale: item.email || item.emailPrincipale || "",
    indirizzoCompleto: addressFromCliente(item),
    preventiviCount: Number(item.preventiviCount || 0),
    preventiviInCorso: Number(item.preventiviInCorso || 0),
    cantieriCount: Number(item.cantieriCount || 0),
    cantieriAttivi: Number(item.cantieriAttivi || 0),
    chiamateCount: Number(item.chiamateCount || 0),
    chiamateAperte: Number(item.chiamateAperte || 0),
    rapportiniCount: Number(item.rapportiniCount || 0),
    fotoCount: Number(item.fotoCount || 0),
    marker: markerFromRow(row),
  };
}

async function ensureSchema() {
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS tipologia_cliente TEXT");
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS latitudine NUMERIC(10, 7)");
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS longitudine NUMERIC(10, 7)");
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS geocode_status TEXT");
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS geocode_error TEXT");
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS geocode_attempted_at TIMESTAMPTZ");
}

function baseWhere(params, filters = {}) {
  const conditions = ["TRUE"];
  const addLike = (column, value) => {
    if (!String(value || "").trim()) return;
    params.push(`%${String(value).trim().toLowerCase()}%`);
    conditions.push(`LOWER(COALESCE(${column}, '')) LIKE $${params.length}`);
  };

  addLike("c.comune", filters.comune);
  addLike("c.provincia", filters.provincia);
  addLike("c.associazione", filters.amministratore);

  if (String(filters.search || "").trim()) {
    params.push(`%${String(filters.search).trim().toLowerCase()}%`);
    conditions.push(`(
      LOWER(COALESCE(c.ragione_sociale, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.cliente_code, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.referente, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.associazione, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.telefono, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.email, '')) LIKE $${params.length}
    )`);
  }

  return conditions.join(" AND ");
}

function centroCtes() {
  return `
    WITH preventivi_stats AS (
      SELECT cliente_id,
             COUNT(*)::INTEGER AS preventivi_count,
             COUNT(*) FILTER (WHERE COALESCE(stato, '') NOT IN ('Accettato', 'Annullato', 'Chiuso', 'Concluso'))::INTEGER AS preventivi_in_corso
      FROM preventivi
      GROUP BY cliente_id
    ),
    cantieri_stats AS (
      SELECT cliente_id,
             COUNT(*)::INTEGER AS cantieri_count,
             COUNT(*) FILTER (WHERE COALESCE(stato, '') NOT IN ('Chiuso', 'Completato', 'Annullato', 'Concluso'))::INTEGER AS cantieri_attivi
      FROM cantieri
      GROUP BY cliente_id
    ),
    chiamate_stats AS (
      SELECT cliente_code,
             cliente,
             COUNT(*)::INTEGER AS chiamate_count,
             COUNT(*) FILTER (WHERE COALESCE(stato, '') NOT IN ('Completata', 'Completato', 'Annullata', 'Chiusa'))::INTEGER AS chiamate_aperte
      FROM chiamate_tecnici
      GROUP BY cliente_code, cliente
    ),
    rapportini_stats AS (
      SELECT COALESCE(r.cliente_code, ca.cliente_code) AS cliente_code,
             COALESCE(r.cliente, ca.cliente) AS cliente,
             ca.cliente_id,
             COUNT(*)::INTEGER AS rapportini_count
      FROM rapportini r
      LEFT JOIN cantieri ca ON ca.id = r.cantiere_id
      GROUP BY COALESCE(r.cliente_code, ca.cliente_code), COALESCE(r.cliente, ca.cliente), ca.cliente_id
    ),
    foto_stats AS (
      SELECT ct.cliente_code,
             ct.cliente,
             COUNT(f.id)::INTEGER AS foto_count
      FROM chiamate_tecnici_foto f
      JOIN chiamate_tecnici ct ON ct.id = f.chiamata_id
      GROUP BY ct.cliente_code, ct.cliente
    )
  `;
}

function selectClientiSql(whereSql) {
  return `
    ${centroCtes()}
    SELECT c.id,
           c.cliente_code,
           c.ragione_sociale,
           c.referente,
           c.associazione,
           c.amministratore,
           c.telefono,
           c.email,
           c.email_amministratore,
           c.email_referente,
           c.indirizzo,
           c.cap,
           c.comune,
           c.provincia,
           c.tipologia_cliente,
           c.latitudine,
           c.longitudine,
           c.created_at,
           c.updated_at,
           COALESCE(ps.preventivi_count, 0) AS preventivi_count,
           COALESCE(ps.preventivi_in_corso, 0) AS preventivi_in_corso,
           COALESCE(cs.cantieri_count, 0) AS cantieri_count,
           COALESCE(cs.cantieri_attivi, 0) AS cantieri_attivi,
           COALESCE(ch.chiamate_count, 0) AS chiamate_count,
           COALESCE(ch.chiamate_aperte, 0) AS chiamate_aperte,
           COALESCE(rs.rapportini_count, 0) AS rapportini_count,
           COALESCE(fs.foto_count, 0) AS foto_count
    FROM clienti c
    LEFT JOIN preventivi_stats ps ON ps.cliente_id = c.id
    LEFT JOIN cantieri_stats cs ON cs.cliente_id = c.id
    LEFT JOIN chiamate_stats ch ON (
      LOWER(COALESCE(ch.cliente_code, '')) = LOWER(COALESCE(c.cliente_code, ''))
      OR LOWER(COALESCE(ch.cliente, '')) = LOWER(COALESCE(c.ragione_sociale, ''))
    )
    LEFT JOIN rapportini_stats rs ON (
      rs.cliente_id = c.id
      OR LOWER(COALESCE(rs.cliente_code, '')) = LOWER(COALESCE(c.cliente_code, ''))
      OR LOWER(COALESCE(rs.cliente, '')) = LOWER(COALESCE(c.ragione_sociale, ''))
    )
    LEFT JOIN foto_stats fs ON (
      LOWER(COALESCE(fs.cliente_code, '')) = LOWER(COALESCE(c.cliente_code, ''))
      OR LOWER(COALESCE(fs.cliente, '')) = LOWER(COALESCE(c.ragione_sociale, ''))
    )
    WHERE ${whereSql}
    ORDER BY c.ragione_sociale ASC
  `;
}

function applyBooleanFilters(items, filters = {}) {
  let filtered = [...items];
  if (filters.soloSenzaCoordinate === "true") filtered = filtered.filter((item) => !item.latitudine || !item.longitudine);
  if (filters.soloCantieriAttivi === "true") filtered = filtered.filter((item) => item.cantieriAttivi > 0);
  if (filters.soloChiamateAperte === "true") filtered = filtered.filter((item) => item.chiamateAperte > 0);
  if (filters.soloPreventivi === "true") filtered = filtered.filter((item) => item.preventiviInCorso > 0);
  return filtered;
}

router.use(asyncHandler(async (_req, _res, next) => {
  await ensureSchema();
  next();
}));

router.get("/stats", asyncHandler(async (_req, res) => {
  const result = await query(selectClientiSql(baseWhere([])), []);
  const items = result.rows.map(normalizeCliente);
  const conCoordinate = items.filter((item) => item.latitudine && item.longitudine).length;
  res.json({
    totaleCondomini: items.length,
    conCoordinate,
    percentualeCoordinate: items.length ? Math.round((conCoordinate / items.length) * 100) : 0,
    cantieriAttivi: items.filter((item) => item.cantieriAttivi > 0).length,
    chiamateAperte: items.filter((item) => item.chiamateAperte > 0).length,
    preventiviInCorso: items.filter((item) => item.preventiviInCorso > 0).length,
    senzaCoordinate: items.filter((item) => !item.latitudine || !item.longitudine).length,
    lastSync: new Date().toISOString(),
  });
}));

router.get("/clienti", asyncHandler(async (req, res) => {
  const params = [];
  const result = await query(selectClientiSql(baseWhere(params, req.query)), params);
  const allItems = result.rows.map(normalizeCliente);
  const items = applyBooleanFilters(allItems, req.query);
  res.json({
    items,
    total: items.length,
    markerVisibili: items.filter((item) => item.latitudine && item.longitudine).length,
    lastSync: new Date().toISOString(),
  });
}));

router.get("/clienti/:id", asyncHandler(async (req, res) => {
  const result = await query(`${selectClientiSql("c.id::text = $1")} LIMIT 1`, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: "Cliente non trovato" });
  res.json(normalizeCliente(result.rows[0]));
}));

router.get("/clienti/:id/timeline", asyncHandler(async (req, res) => {
  const cliente = await query("SELECT id, cliente_code, ragione_sociale, created_at FROM clienti WHERE id::text = $1 LIMIT 1", [req.params.id]);
  if (!cliente.rows[0]) return res.status(404).json({ message: "Cliente non trovato" });
  const c = cliente.rows[0];
  const params = [c.id, c.cliente_code || "", c.ragione_sociale || ""];
  const result = await query(
    `SELECT * FROM (
       SELECT created_at AS data_ora, 'cliente' AS tipo, 'Cliente creato' AS titolo, ragione_sociale AS descrizione, id::TEXT AS record_id
       FROM clienti WHERE id = $1
       UNION ALL
       SELECT COALESCE(updated_at, created_at, data::timestamptz) AS data_ora, 'preventivo' AS tipo,
              'Preventivo ' || COALESCE(numero, numero_preventivo, '') AS titolo,
              COALESCE(descrizione, stato, '') AS descrizione, id::TEXT AS record_id
       FROM preventivi WHERE cliente_id = $1 OR LOWER(COALESCE(cliente_code, '')) = LOWER($2) OR LOWER(COALESCE(cliente, cliente_nome, '')) = LOWER($3)
       UNION ALL
       SELECT COALESCE(updated_at, created_at, data_inizio::timestamptz) AS data_ora, 'cantiere' AS tipo,
              'Cantiere ' || COALESCE(nome, '') AS titolo,
              COALESCE(stato, indirizzo, '') AS descrizione, id::TEXT AS record_id
       FROM cantieri WHERE cliente_id = $1 OR LOWER(COALESCE(cliente_code, '')) = LOWER($2) OR LOWER(COALESCE(cliente, '')) = LOWER($3)
       UNION ALL
       SELECT COALESCE(updated_at, created_at) AS data_ora, 'chiamata' AS tipo,
              'Chiamata ' || COALESCE(numero_chiamata, '') AS titolo,
              COALESCE(descrizione_lavori, stato, '') AS descrizione, id::TEXT AS record_id
       FROM chiamate_tecnici WHERE LOWER(COALESCE(cliente_code, '')) = LOWER($2) OR LOWER(COALESCE(cliente, '')) = LOWER($3)
       UNION ALL
       SELECT COALESCE(updated_at, created_at, data::timestamptz) AS data_ora, 'rapportino' AS tipo,
              'Rapportino lavori' AS titolo,
              COALESCE(attivita, stato, '') AS descrizione, id::TEXT AS record_id
       FROM rapportini WHERE LOWER(COALESCE(cliente_code, '')) = LOWER($2) OR LOWER(COALESCE(cliente, '')) = LOWER($3)
     ) eventi
     WHERE data_ora IS NOT NULL
     ORDER BY data_ora DESC
     LIMIT 40`,
    params,
  );
  res.json({ clienteId: c.id, items: result.rows.map(toCamel) });
}));

router.get("/squadre-live", asyncHandler(async (_req, res) => {
  const result = await query(
    `SELECT s.id,
            s.nome,
            s.mezzo_assegnato,
            s.colore,
            s.attiva,
            c.cliente,
            c.indirizzo,
            c.stato AS stato_chiamata,
            c.ora_arrivo,
            c.updated_at AS ultimo_aggiornamento
     FROM tecnici_squadre s
     LEFT JOIN LATERAL (
       SELECT *
       FROM chiamate_tecnici c
       WHERE c.squadra_id = s.id
         AND COALESCE(c.stato, '') NOT IN ('Completata', 'Completato', 'Annullata', 'Chiusa')
       ORDER BY COALESCE(c.updated_at, c.created_at) DESC
       LIMIT 1
     ) c ON TRUE
     WHERE s.attiva = TRUE
     ORDER BY s.nome ASC`,
  );

  res.json({
    items: result.rows.map((row) => {
      const item = toCamel(row);
      const hasActivity = Boolean(item.cliente || item.indirizzo);
      return {
        ...item,
        stato: hasActivity ? (item.statoChiamata || "Al lavoro") : "Offline",
        destinazione: item.cliente || "",
        indirizzo: item.indirizzo || "Posizione non disponibile",
        ultimoAggiornamento: item.ultimoAggiornamento || null,
      };
    }),
  });
}));

router.get("/filters", asyncHandler(async (_req, res) => {
  const [comuni, province, amministratori, stats] = await Promise.all([
    query("SELECT comune AS value, COUNT(*)::INTEGER AS count FROM clienti WHERE COALESCE(comune, '') <> '' GROUP BY comune ORDER BY comune"),
    query("SELECT provincia AS value, COUNT(*)::INTEGER AS count FROM clienti WHERE COALESCE(provincia, '') <> '' GROUP BY provincia ORDER BY provincia"),
    query("SELECT associazione AS value, COUNT(*)::INTEGER AS count FROM clienti WHERE COALESCE(associazione, '') <> '' GROUP BY associazione ORDER BY associazione"),
    query(selectClientiSql(baseWhere([])), []),
  ]);
  const items = stats.rows.map(normalizeCliente);
  res.json({
    comuni: comuni.rows,
    province: province.rows,
    amministratori: amministratori.rows,
    counts: {
      soloChiamateAperte: items.filter((item) => item.chiamateAperte > 0).length,
      soloCantieriAttivi: items.filter((item) => item.cantieriAttivi > 0).length,
      soloPreventivi: items.filter((item) => item.preventiviInCorso > 0).length,
      soloSenzaCoordinate: items.filter((item) => !item.latitudine || !item.longitudine).length,
    },
  });
}));

async function geocodeCliente(cliente) {
  if (!env.googleMaps.apiKey) {
    const error = new Error("Google Maps non configurato.");
    error.status = 400;
    throw error;
  }

  const address = addressFromCliente(toCamel(cliente)).trim();
  if (!address) {
    const error = new Error("Indirizzo incompleto.");
    error.status = 422;
    throw error;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("region", "it");
  url.searchParams.set("language", "it");
  url.searchParams.set("key", env.googleMaps.apiKey);
  const response = await fetch(url);
  const data = await response.json();
  const location = data.results?.[0]?.geometry?.location;
  if (!response.ok || data.status !== "OK" || !location) {
    const error = new Error(data.error_message || (data.status === "ZERO_RESULTS" ? "Indirizzo non riconosciuto." : `Geocodifica: ${data.status || response.status}`));
    error.status = 422;
    throw error;
  }
  return location;
}

router.post("/geocode-missing", asyncHandler(async (req, res) => {
  if (!env.googleMaps.apiKey) return res.status(400).json({ message: "Google Maps non configurato sul server." });

  const limit = Math.min(Math.max(Number(req.body?.limit) || 25, 1), 50);
  const retryErrors = req.body?.retryErrors === true;
  const statusCondition = retryErrors ? "TRUE" : "COALESCE(c.geocode_status, '') <> 'errore'";
  const result = await query(
    `${selectClientiSql(`c.indirizzo IS NOT NULL AND BTRIM(c.indirizzo) <> '' AND (c.latitudine IS NULL OR c.longitudine IS NULL) AND ${statusCondition}`)} LIMIT ${limit}`,
    [],
  );

  const risultati = [];
  for (const row of result.rows) {
    try {
      const location = await geocodeCliente(row);
      await query(
        `UPDATE clienti SET latitudine = $2, longitudine = $3, geocode_status = 'trovato',
         geocode_error = NULL, geocode_attempted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.id, location.lat, location.lng],
      );
      risultati.push({ id: row.id, stato: "trovato" });
    } catch (error) {
      const message = String(error.message || "Coordinate non trovate").slice(0, 500);
      await query(
        `UPDATE clienti SET geocode_status = 'errore', geocode_error = $2,
         geocode_attempted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.id, message],
      );
      risultati.push({ id: row.id, stato: "errore", errore: message });
    }
  }

  const conteggi = await query(
    `SELECT
       COUNT(*) FILTER (WHERE (latitudine IS NULL OR longitudine IS NULL)
         AND indirizzo IS NOT NULL AND BTRIM(indirizzo) <> ''
         AND COALESCE(geocode_status, '') <> 'errore')::INTEGER AS rimanenti,
       COUNT(*) FILTER (WHERE (latitudine IS NULL OR longitudine IS NULL)
         AND COALESCE(geocode_status, '') = 'errore')::INTEGER AS da_verificare,
       COUNT(*) FILTER (WHERE latitudine IS NOT NULL AND longitudine IS NOT NULL)::INTEGER AS con_coordinate
     FROM clienti`,
  );

  res.json({
    elaborati: risultati.length,
    trovati: risultati.filter((item) => item.stato === "trovato").length,
    nonTrovati: risultati.filter((item) => item.stato !== "trovato").length,
    errori: risultati.filter((item) => item.stato === "errore").length,
    rimanenti: Number(conteggi.rows[0]?.rimanenti || 0),
    daVerificare: Number(conteggi.rows[0]?.da_verificare || 0),
    conCoordinate: Number(conteggi.rows[0]?.con_coordinate || 0),
    risultati,
  });
}));

router.post("/assign-team", asyncHandler(async (req, res) => {
  const { clienteId, squadraId, conferma } = req.body || {};
  if (!clienteId || !squadraId) return res.status(400).json({ message: "Cliente e squadra sono obbligatori." });
  if (conferma !== true) return res.status(409).json({ message: "Conferma richiesta prima dell'assegnazione." });

  const [cliente, squadra] = await Promise.all([
    query("SELECT * FROM clienti WHERE id::text = $1 LIMIT 1", [clienteId]),
    query("SELECT * FROM tecnici_squadre WHERE id::text = $1 AND attiva = TRUE LIMIT 1", [squadraId]),
  ]);
  if (!cliente.rows[0]) return res.status(404).json({ message: "Cliente non trovato." });
  if (!squadra.rows[0]) return res.status(404).json({ message: "Squadra non trovata." });

  res.json({
    message: "Assegnazione confermata e pronta per App Tecnici.",
    cliente: normalizeCliente({ ...cliente.rows[0], preventivi_count: 0, preventivi_in_corso: 0, cantieri_count: 0, cantieri_attivi: 0, chiamate_count: 0, chiamate_aperte: 0, rapportini_count: 0, foto_count: 0 }),
    squadra: toCamel(squadra.rows[0]),
  });
}));

export default router;
