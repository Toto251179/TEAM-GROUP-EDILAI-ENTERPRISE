import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentPath = process.argv[2] || path.resolve(__dirname, "../../prezzario_veneto_2025_ods/content.xml");

function decodeXml(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function readCellValue(attrs, body = "") {
  const numeric = attrs.match(/office:value="([^"]+)"/);
  if (numeric) return numeric[1];
  return decodeXml(body);
}

function parseRows(xml) {
  const rows = [];
  const rowMatches = xml.matchAll(/<table:table-row[\s\S]*?<\/table:table-row>/g);

  for (const rowMatch of rowMatches) {
    const row = rowMatch[0];
    const cells = [];
    const cellMatches = row.matchAll(/<table:table-cell([^>]*)>([\s\S]*?)<\/table:table-cell>|<table:table-cell([^>]*)\/>/g);

    for (const cellMatch of cellMatches) {
      const attrs = cellMatch[1] || cellMatch[3] || "";
      const body = cellMatch[2] || "";
      const repeat = Number(attrs.match(/table:number-columns-repeated="(\d+)"/)?.[1] || 1);
      const value = readCellValue(attrs, body);

      for (let index = 0; index < Math.min(repeat, 20); index += 1) {
        cells.push(value);
      }
    }

    rows.push(cells);
  }

  return rows;
}

function isPriceRow(row) {
  return /^VEN25-/.test(row[0] || "") && row[3] && Number(row[4]) > 0;
}

function isCategoryRow(row) {
  return /^VEN25-/.test(row[0] || "") && row[2] && !row[3] && !row[4];
}

const xml = fs.readFileSync(contentPath, "utf8");
const rows = parseRows(xml);
const items = [];
const categoryStack = [];

for (const row of rows) {
  const codice = row[0] || "";
  const descrizione = row[2] || "";

  if (isCategoryRow(row)) {
    const depth = codice.split(".").length - 1;
    categoryStack[depth] = descrizione;
    categoryStack.length = depth + 1;
  }

  if (isPriceRow(row)) {
    const ex = row[1] || "";
    const unita = row[3] || "pz";
    const prezzo = Number(row[4] || 0);
    const manodopera = row[5] || "";
    const categoria = categoryStack.filter(Boolean).join(" / ") || "Prezzario Veneto 2025";

    items.push({
      codice,
      categoria,
      descrizione,
      unita,
      prezzoUnitario: prezzo,
      costoInterno: 0,
      note: `Prezzario Regione Veneto LLPP 2025${ex ? ` | Ex: ${ex}` : ""}${manodopera ? ` | Manodopera: ${manodopera}` : ""}`,
      attivo: true,
    });
  }
}

try {
  await query("BEGIN");
  await query("DELETE FROM elenco_prezzi WHERE codice LIKE 'VEN25-%'");

  for (const item of items) {
    await query(
      `INSERT INTO elenco_prezzi
       (codice, categoria, descrizione, unita, prezzo_unitario, costo_interno, note, attivo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        item.codice,
        item.categoria,
        item.descrizione,
        item.unita,
        item.prezzoUnitario,
        item.costoInterno,
        item.note,
        item.attivo,
      ],
    );
  }

  await query("COMMIT");
  console.log(`Importate ${items.length} voci dal Prezzario Regione Veneto 2025.`);
} catch (error) {
  await query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}
