import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { query } from "../config/db.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const SETTINGS_KEY = "system";

function assertAdmin(req, res, next) {
  const role = String(req.headers["x-user-role"] || "admin").toLowerCase();
  if (role === "tecnico" || role === "technician") return res.status(403).json({ message: "Accesso riservato agli amministratori." });
  return next();
}

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS system_settings (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    google_maps_key_encrypted TEXT,
    google_maps_key_iv TEXT,
    google_maps_key_tag TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query("INSERT INTO system_settings (id, data) VALUES ($1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING", [SETTINGS_KEY]);
}

function encryptionKey() {
  return crypto.createHash("sha256").update(process.env.SYSTEM_SETTINGS_SECRET || env.db.password || "team-group-edilai").digest();
}

function encryptSecret(value) {
  const text = String(value || "").trim();
  if (!text) return { encrypted: null, iv: null, tag: null };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return { encrypted: encrypted.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function decryptSecret(row) {
  if (!row?.google_maps_key_encrypted || !row?.google_maps_key_iv || !row?.google_maps_key_tag) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.google_maps_key_iv, "base64"));
    decipher.setAuthTag(Buffer.from(row.google_maps_key_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(row.google_maps_key_encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function maskSecret(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 8) return `${text.slice(0, 2)}****${text.slice(-2)}`;
  return `${text.slice(0, 4)}***************${text.slice(-3)}`;
}

function normalizeSecret(value) {
  const text = String(value || "").trim();
  if (!text || text === "INSERIRE_QUI_LA_CHIAVE_REALE") return "";
  return text;
}

function defaultSettings() {
  return {
    archivePath: env.preventivi.outputDir,
    excelClienti: { path: process.env.CLIENTI_EXCEL_PATH || "", sheetName: "Foglio1", intervalMinutes: 10, autoSync: false },
    sync: {
      fornitori: { path: "", sheetName: "", intervalMinutes: 10, autoSync: false },
      operai: { path: "", sheetName: "", intervalMinutes: 10, autoSync: false },
      elencoPrezzi: { path: "", sheetName: "", intervalMinutes: 10, autoSync: false },
      magazzino: { path: "", sheetName: "", intervalMinutes: 10, autoSync: false },
    },
    backup: {
      path: path.join(env.preventivi.outputDir, "BACKUP"),
      retentionDays: 30,
      autoBackup: true,
      time: "23:00",
    },
    logs: {},
  };
}

async function readSettingsRow() {
  await ensureTable();
  const result = await query("SELECT * FROM system_settings WHERE id = $1", [SETTINGS_KEY]);
  return result.rows[0];
}

async function readSettings() {
  const row = await readSettingsRow();
  const data = { ...defaultSettings(), ...(row?.data || {}) };
  const googleKey =
    normalizeSecret(decryptSecret(row)) ||
    normalizeSecret(env.googleMaps.apiKey) ||
    normalizeSecret(process.env.VITE_GOOGLE_MAPS_API_KEY);
  return { row, data, googleKey };
}

async function writeSettings(data, googleKey) {
  const current = await readSettingsRow();
  const patch = {};
  const values = [SETTINGS_KEY, data];
  let sql = "UPDATE system_settings SET data = $2, updated_at = NOW()";
  if (googleKey !== undefined) {
    const encrypted = encryptSecret(normalizeSecret(googleKey));
    values.push(encrypted.encrypted, encrypted.iv, encrypted.tag);
    sql += ", google_maps_key_encrypted = $3, google_maps_key_iv = $4, google_maps_key_tag = $5";
    Object.assign(patch, encrypted);
  } else if (!decryptSecret(current) && env.googleMaps.apiKey) {
    const encrypted = encryptSecret(env.googleMaps.apiKey);
    values.push(encrypted.encrypted, encrypted.iv, encrypted.tag);
    sql += ", google_maps_key_encrypted = $3, google_maps_key_iv = $4, google_maps_key_tag = $5";
  }
  sql += " WHERE id = $1 RETURNING *";
  const result = await query(sql, values);
  return result.rows[0];
}

async function testArchiveFolder(folderPath) {
  const target = folderPath || env.preventivi.outputDir;
  await fs.mkdir(target, { recursive: true });
  const testFile = path.join(target, `.team-group-write-test-${Date.now()}.tmp`);
  await fs.writeFile(testFile, "ok");
  await fs.unlink(testFile).catch(() => {});
  return { ok: true, message: "Cartella collegata correttamente", path: target, exists: true, writable: true };
}

router.use(assertAdmin);
router.use(asyncHandler(async (_req, _res, next) => {
  await ensureTable();
  next();
}));

router.get("/", asyncHandler(async (_req, res) => {
  const { data, googleKey } = await readSettings();
  res.json({
    ...data,
    googleMaps: {
      configured: Boolean(googleKey),
      maskedKey: maskSecret(googleKey),
      lastTest: data.logs?.googleMaps?.date || null,
      status: data.logs?.googleMaps?.message || (googleKey ? "Configurato" : "Google Maps non configurato"),
    },
    database: {
      type: "PostgreSQL",
      host: env.db.host,
      port: env.db.port,
      name: env.db.database,
    },
    server: {
      url: `http://localhost:${env.port}/api`,
      port: env.port,
      version: process.env.npm_package_version || "0.0.0",
      uptime: process.uptime(),
    },
  });
}));

router.put("/", asyncHandler(async (req, res) => {
  const { data, googleKey } = await readSettings();
  const nextData = {
    ...data,
    archivePath: req.body.archivePath ?? data.archivePath,
    excelClienti: { ...data.excelClienti, ...(req.body.excelClienti || {}) },
    sync: { ...data.sync, ...(req.body.sync || {}) },
    backup: { ...data.backup, ...(req.body.backup || {}) },
    logs: data.logs || {},
  };
  const googleValue = req.body.googleMapsApiKey !== undefined ? normalizeSecret(req.body.googleMapsApiKey) : undefined;
  const saved = await writeSettings(nextData, googleValue);
  const savedKey = googleValue !== undefined ? googleValue : googleKey;
  res.json({ message: "Configurazione salvata.", googleMaps: { configured: Boolean(savedKey), maskedKey: maskSecret(savedKey) }, updatedAt: saved.updated_at });
}));

router.get("/google-maps.js", asyncHandler(async (_req, res) => {
  const { googleKey } = await readSettings();
  if (!googleKey) {
    res.type("application/javascript").send("window.__TEAM_GOOGLE_MAPS_ERROR__='Google Maps non configurato';");
    return;
  }
  const url = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleKey)}&v=weekly`;
  res.redirect(302, url);
}));

router.post("/test-google-maps", asyncHandler(async (req, res) => {
  const { data, googleKey } = await readSettings();
  const key = String(req.body.googleMapsApiKey || googleKey || "").trim();
  if (!key) return res.status(400).json({ ok: false, message: "Google Maps non configurato" });
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", "Vicenza, Italia");
  url.searchParams.set("key", key);
  const response = await fetch(url);
  const body = await response.json();
  const ok = body.status === "OK";
  const log = { ok, message: ok ? "Google Maps configurato correttamente" : body.error_message || body.status, date: new Date().toISOString() };
  await writeSettings({ ...data, logs: { ...(data.logs || {}), googleMaps: log } });
  res.status(ok ? 200 : 400).json(log);
}));

router.post("/test-archive", asyncHandler(async (req, res) => {
  const { data } = await readSettings();
  const result = await testArchiveFolder(req.body.archivePath || data.archivePath);
  await writeSettings({ ...data, archivePath: result.path, logs: { ...(data.logs || {}), archive: { ...result, date: new Date().toISOString() } } });
  res.json(result);
}));

router.post("/test-excel", asyncHandler(async (req, res) => {
  const { data } = await readSettings();
  const excel = { ...data.excelClienti, ...(req.body.excelClienti || {}) };
  if (!excel.path) return res.status(400).json({ ok: false, message: "File Excel non configurato" });
  await fs.access(excel.path);
  const XLSX = await import("xlsx");
  const workbook = XLSX.readFile(excel.path, { cellDates: false, raw: false });
  const sheet = workbook.Sheets[excel.sheetName] || workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) : [];
  const log = { ok: true, message: "File Excel letto correttamente", rows: rows.length, date: new Date().toISOString() };
  await writeSettings({ ...data, excelClienti: excel, logs: { ...(data.logs || {}), excelClienti: log } });
  res.json(log);
}));

router.post("/test-database", asyncHandler(async (_req, res) => {
  const [clienti, preventivi, cantieri, chiamate] = await Promise.all([
    query("SELECT COUNT(*)::INTEGER AS n FROM clienti"),
    query("SELECT COUNT(*)::INTEGER AS n FROM preventivi"),
    query("SELECT COUNT(*)::INTEGER AS n FROM cantieri"),
    query("SELECT COUNT(*)::INTEGER AS n FROM chiamate_tecnici"),
  ]);
  res.json({
    ok: true,
    message: "Database collegato",
    checkedAt: new Date().toISOString(),
    counts: {
      clienti: clienti.rows[0].n,
      preventivi: preventivi.rows[0].n,
      cantieri: cantieri.rows[0].n,
      chiamate: chiamate.rows[0].n,
    },
  });
}));

router.post("/backup-now", asyncHandler(async (_req, res) => {
  const { data } = await readSettings();
  const backupRoot = data.backup?.path || path.join(env.preventivi.outputDir, "BACKUP");
  const date = new Date().toISOString().slice(0, 10);
  const folder = path.join(backupRoot, date);
  await fs.mkdir(folder, { recursive: true });
  const manifest = { date: new Date().toISOString(), database: env.db.database };
  const file = path.join(folder, "backup-manifest.json");
  await fs.writeFile(file, JSON.stringify(manifest, null, 2));
  const stat = await fs.stat(file);
  const log = { ok: true, message: "Backup creato", date: new Date().toISOString(), size: stat.size, folder };
  await writeSettings({ ...data, backup: { ...data.backup, path: backupRoot }, logs: { ...(data.logs || {}), backup: log } });
  res.json(log);
}));

router.post("/test-server", asyncHandler(async (_req, res) => {
  res.json({ ok: true, message: "Server centrale operativo", uptime: process.uptime(), checkedAt: new Date().toISOString() });
}));

router.post("/test-all", asyncHandler(async (_req, res) => {
  const results = {};
  try { results.database = (await query("SELECT 1")).rowCount === 1 ? { ok: true, message: "Database collegato" } : { ok: false, message: "Database non collegato" }; } catch (error) { results.database = { ok: false, message: error.message }; }
  try { const { data } = await readSettings(); results.archive = await testArchiveFolder(data.archivePath); } catch (error) { results.archive = { ok: false, message: error.message }; }
  try { const { googleKey } = await readSettings(); results.googleMaps = googleKey ? { ok: true, message: "Chiave salvata" } : { ok: false, message: "Google Maps non configurato" }; } catch (error) { results.googleMaps = { ok: false, message: error.message }; }
  try { const { data } = await readSettings(); results.excelClienti = data.excelClienti?.path ? { ok: true, message: "File configurato" } : { ok: false, message: "File Excel non configurato" }; } catch (error) { results.excelClienti = { ok: false, message: error.message }; }
  try { const { data } = await readSettings(); await fs.mkdir(data.backup?.path || path.join(env.preventivi.outputDir, "BACKUP"), { recursive: true }); results.backup = { ok: true, message: "Cartella backup disponibile" }; } catch (error) { results.backup = { ok: false, message: error.message }; }
  results.server = { ok: true, message: "Server centrale operativo" };
  res.json(results);
}));

export default router;
