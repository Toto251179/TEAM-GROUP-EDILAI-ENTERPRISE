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

function mapsAddress(cliente) {
  return [cliente.indirizzo, cliente.cap, cliente.comune, cliente.provincia].filter(Boolean).join(" ");
}

function getMarkerStatus(row) {
  if (!row.latitudine || !row.longitudine) return "rosso";
  if (Number(row.chiamate_aperte || 0) > 0) return "arancione";
  if (Number(row.cantieri_attivi || 0) > 0) return "verde";
  if (Number(row.preventivi_in_corso || 0) > 0) return "blu";
  return "grigio";
}

function normalizeCondominio(row) {
  const item = toCamel(row);
  return {
    ...item,
    idCliente: item.clienteCode,
    ragioneSociale: item.ragioneSociale,
    amministratore: item.associazione || "",
    emailPrincipale: item.email || "",
    indirizzoCompleto: mapsAddress(item),
    preventiviCount: Number(item.preventiviCount || 0),
    preventiviInCorso: Number(item.preventiviInCorso || 0),
    cantieriAttivi: Number(item.cantieriAttivi || 0),
    chiamateAperte: Number(item.chiamateAperte || 0),
    marker: getMarkerStatus(row),
  };
}

async function ensureCondominiSchema() {
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS tipologia_cliente TEXT");
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS latitudine NUMERIC(10, 7)");
  await query("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS longitudine NUMERIC(10, 7)");
}

function baseWhere(params, queryParams = {}) {
  const conditions = ["TRUE"];

  const addLike = (column, value) => {
    if (!String(value || "").trim()) return;
    params.push(`%${String(value).trim().toLowerCase()}%`);
    conditions.push(`LOWER(COALESCE(${column}, '')) LIKE $${params.length}`);
  };

  addLike("c.comune", queryParams.comune);
  addLike("c.provincia", queryParams.provincia);
  addLike("c.associazione", queryParams.amministratore);

  if (String(queryParams.search || "").trim()) {
    params.push(`%${String(queryParams.search).trim().toLowerCase()}%`);
    conditions.push(`(
      LOWER(c.ragione_sociale) LIKE $${params.length}
      OR LOWER(COALESCE(c.cliente_code, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.referente, '')) LIKE $${params.length}
      OR LOWER(COALESCE(c.associazione, '')) LIKE $${params.length}
    )`);
  }

  return conditions.join(" AND ");
}

function statsCtes() {
  return `
    WITH preventivi_stats AS (
      SELECT cliente_id,
             COUNT(*)::INTEGER AS preventivi_count,
             COUNT(*) FILTER (WHERE COALESCE(stato, '') NOT IN ('Accettato', 'Annullato'))::INTEGER AS preventivi_in_corso
      FROM preventivi
      GROUP BY cliente_id
    ),
    cantieri_stats AS (
      SELECT cliente_id,
             COUNT(*) FILTER (WHERE COALESCE(stato, '') NOT IN ('Chiuso', 'Completato', 'Annullato'))::INTEGER AS cantieri_attivi
      FROM cantieri
      GROUP BY cliente_id
    ),
    chiamate_stats AS (
      SELECT cliente_code,
             cliente,
             COUNT(*) FILTER (WHERE COALESCE(stato, '') NOT IN ('Completata', 'Completato', 'Annullata'))::INTEGER AS chiamate_aperte
      FROM chiamate_tecnici
      GROUP BY cliente_code, cliente
    )
  `;
}

function selectCondominiSql(whereSql) {
  return `
    ${statsCtes()}
    SELECT c.id,
           c.cliente_code,
           c.ragione_sociale,
           c.referente,
           c.associazione,
           c.telefono,
           c.email,
           c.indirizzo,
           c.cap,
           c.comune,
           c.provincia,
           c.tipologia_cliente,
           c.latitudine,
           c.longitudine,
           COALESCE(ps.preventivi_count, 0) AS preventivi_count,
           COALESCE(ps.preventivi_in_corso, 0) AS preventivi_in_corso,
           COALESCE(ca.cantieri_attivi, 0) AS cantieri_attivi,
           COALESCE(ch.chiamate_aperte, 0) AS chiamate_aperte
    FROM clienti c
    LEFT JOIN preventivi_stats ps ON ps.cliente_id = c.id
    LEFT JOIN cantieri_stats ca ON ca.cliente_id = c.id
    LEFT JOIN chiamate_stats ch ON (
      LOWER(COALESCE(ch.cliente_code, '')) = LOWER(COALESCE(c.cliente_code, ''))
      OR LOWER(COALESCE(ch.cliente, '')) = LOWER(c.ragione_sociale)
    )
    WHERE ${whereSql}
    ORDER BY c.ragione_sociale ASC
  `;
}

router.use(asyncHandler(async (_req, _res, next) => {
  await ensureCondominiSchema();
  next();
}));

router.get("/mappa", asyncHandler(async (req, res) => {
  const params = [];
  let whereSql = baseWhere(params, req.query);
  const result = await query(selectCondominiSql(whereSql), params);
  let items = result.rows.map(normalizeCondominio);

  if (req.query.soloSenzaCoordinate === "true") items = items.filter((item) => !item.latitudine || !item.longitudine);
  if (req.query.soloCantieriAttivi === "true") items = items.filter((item) => item.cantieriAttivi > 0);
  if (req.query.soloChiamateAperte === "true") items = items.filter((item) => item.chiamateAperte > 0);
  if (req.query.soloPreventivi === "true") items = items.filter((item) => item.preventiviInCorso > 0);

  res.json({
    googleMapsConfigured: Boolean(env.googleMaps.apiKey),
    lastSync: new Date().toISOString(),
    items,
  });
}));

router.get("/stats", asyncHandler(async (_req, res) => {
  const result = await query(selectCondominiSql(baseWhere([])), []);
  const items = result.rows.map(normalizeCondominio);
  res.json({
    totaleCondomini: items.length,
    cantieriAttivi: items.filter((item) => item.cantieriAttivi > 0).length,
    chiamateAperte: items.filter((item) => item.chiamateAperte > 0).length,
    preventiviInCorso: items.filter((item) => item.preventiviInCorso > 0).length,
    senzaCoordinate: items.filter((item) => !item.latitudine || !item.longitudine).length,
    googleMapsConfigured: Boolean(env.googleMaps.apiKey),
    lastSync: new Date().toISOString(),
  });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const params = [req.params.id];
  const result = await query(`${selectCondominiSql(`${baseWhere([])} AND c.id::text = $1`)} LIMIT 1`, params);
  if (!result.rows[0]) return res.status(404).json({ message: "Condominio non trovato" });
  res.json(normalizeCondominio(result.rows[0]));
}));

async function geocodeCliente(cliente) {
  if (!env.googleMaps.apiKey) {
    const error = new Error("Google Maps non configurato.");
    error.status = 400;
    throw error;
  }

  const address = mapsAddress(cliente);
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", env.googleMaps.apiKey);
  const response = await fetch(url);
  const data = await response.json();
  const location = data.results?.[0]?.geometry?.location;
  if (!location) {
    const error = new Error("Coordinate non trovate per l'indirizzo.");
    error.status = 422;
    throw error;
  }
  return location;
}

router.post("/:id/geocode", asyncHandler(async (req, res) => {
  const clienteResult = await query("SELECT * FROM clienti WHERE id::text = $1", [req.params.id]);
  const cliente = clienteResult.rows[0] ? toCamel(clienteResult.rows[0]) : null;
  if (!cliente) return res.status(404).json({ message: "Condominio non trovato" });
  if (cliente.latitudine && cliente.longitudine && req.body?.force !== true) {
    return res.json({ message: "Coordinate gia presenti.", cliente });
  }

  const location = await geocodeCliente(cliente);
  const updated = await query(
    `UPDATE clienti SET latitudine = $2, longitudine = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [cliente.id, location.lat, location.lng],
  );
  res.json({ message: "Coordinate aggiornate.", cliente: normalizeCondominio(updated.rows[0]) });
}));

router.post("/geocode-missing", asyncHandler(async (_req, res) => {
  if (!env.googleMaps.apiKey) return res.status(400).json({ message: "Google Maps non configurato." });
  const result = await query(`${selectCondominiSql(`${baseWhere([])} AND (c.latitudine IS NULL OR c.longitudine IS NULL)`)} LIMIT 25`, []);
  const risultati = [];
  for (const row of result.rows) {
    try {
      const cliente = toCamel(row);
      const location = await geocodeCliente(cliente);
      await query("UPDATE clienti SET latitudine = $2, longitudine = $3, updated_at = NOW() WHERE id = $1", [cliente.id, location.lat, location.lng]);
      risultati.push({ id: cliente.id, stato: "aggiornato" });
    } catch (error) {
      risultati.push({ id: row.id, stato: "errore", errore: error.message });
    }
  }
  res.json({ aggiornati: risultati.filter((item) => item.stato === "aggiornato").length, risultati });
}));

export default router;
