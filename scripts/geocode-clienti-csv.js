import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Uso: node scripts/geocode-clienti-csv.js <file-clienti.csv>");
  process.exit(1);
}

const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
if (!apiKey) {
  console.error("Imposta GOOGLE_GEOCODING_API_KEY nel file .env.");
  process.exit(1);
}

function parseCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, "").trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function sqlText(value) {
  return String(value ?? "").replaceAll("'", "''");
}

function fullAddress(row) {
  return [row.Via, row.CAP, row.Comune, row.Provincia, "Italia"]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
}

async function geocode(address, attempt = 0) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("region", "it");
  url.searchParams.set("language", "it");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const body = await response.json();
  if (body.status === "OK" && body.results?.[0]?.geometry?.location) {
    return { ok: true, ...body.results[0].geometry.location, formatted: body.results[0].formatted_address };
  }

  if ((body.status === "OVER_QUERY_LIMIT" || body.status === "UNKNOWN_ERROR") && attempt < 5) {
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    return geocode(address, attempt + 1);
  }

  return { ok: false, status: body.status || response.status, error: body.error_message || "" };
}

const raw = await fs.readFile(path.resolve(inputPath), "utf8");
const rows = parseCsv(raw);
const results = [];
let found = 0;
let failed = 0;

for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index];
  const address = fullAddress(row);
  let result;

  if (row.Latitudine && row.Longitudine) {
    result = { ok: true, lat: Number(String(row.Latitudine).replace(",", ".")), lng: Number(String(row.Longitudine).replace(",", ".")), formatted: address, existing: true };
  } else if (!row.Via) {
    result = { ok: false, status: "INDIRIZZO_MANCANTE", error: "Via mancante" };
  } else {
    result = await geocode(address);
    await new Promise((resolve) => setTimeout(resolve, 180));
  }

  if (result.ok) found += 1;
  else failed += 1;

  results.push({
    ...row,
    Latitudine: result.ok ? result.lat : "",
    Longitudine: result.ok ? result.lng : "",
    "Indirizzo Google": result.formatted || "",
    "Esito geocodifica": result.ok ? (result.existing ? "GIA_PRESENTE" : "OK") : result.status,
    "Errore geocodifica": result.error || "",
  });

  console.log(`${index + 1}/${rows.length} - trovati ${found} - errori ${failed}`);
}

const headers = [...Object.keys(rows[0]), "Indirizzo Google", "Esito geocodifica", "Errore geocodifica"];
const csv = [
  headers.map(escapeCsv).join(";"),
  ...results.map((row) => headers.map((header) => escapeCsv(row[header])).join(";")),
].join("\r\n");

const sqlRows = results.filter((row) => row.Latitudine !== "" && row.Longitudine !== "");
const sql = [
  "BEGIN;",
  ...sqlRows.map((row) =>
    `UPDATE clienti SET latitudine = ${Number(row.Latitudine)}, longitudine = ${Number(row.Longitudine)}, updated_at = NOW() WHERE LOWER(BTRIM(COALESCE(NULLIF(id_cliente, ''), cliente_code))) = LOWER(BTRIM('${sqlText(row["ID Cliente"])}'));`
  ),
  "COMMIT;",
].join("\n");

const outputDir = path.dirname(path.resolve(inputPath));
await fs.writeFile(path.join(outputDir, "clienti-con-coordinate.csv"), "\uFEFF" + csv, "utf8");
await fs.writeFile(path.join(outputDir, "aggiorna-coordinate-clienti.sql"), sql, "utf8");

console.log(`Completato. Coordinate: ${found}. Da verificare: ${failed}.`);
console.log(path.join(outputDir, "clienti-con-coordinate.csv"));
console.log(path.join(outputDir, "aggiorna-coordinate-clienti.sql"));
