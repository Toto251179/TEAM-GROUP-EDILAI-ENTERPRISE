/**
 * Migrazione prudente dell'archivio dei preventivi Team Group.
 *
 * ANTEPRIMA (non scrive nulla):
 * node scripts/migraArchivioPreventivi.mjs --origine "D:\ARCHIVIO-ESTERNO" --destinazione "D:\TEAMGROUP SERVER"
 *
 * COPIA (non elimina gli originali e non sovrascrive):
 * node scripts/migraArchivioPreventivi.mjs --origine "D:\ARCHIVIO-ESTERNO" --destinazione "D:\TEAMGROUP SERVER" --esegui
 *
 * La destinazione DEVE essere la cartella originale del server, individuata
 * dall'amministratore. Il comando non modifica le impostazioni del gestionale.
 */
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { pool, query } from "../server/config/db.js";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i < 0 ? "" : String(args[i + 1] || "").trim();
}
const origine = path.resolve(arg("--origine") || ".");
const destinazione = path.resolve(arg("--destinazione") || ".");
const esegui = args.includes("--esegui");
const stats = { preventivi: 0, cartelle: 0, fileCopiati: 0, fileIdentici: 0, conflitti: [], senzaOrigine: [] };

function sicuro(value) {
  return String(value || "").replace(/[<>:"\/\\|?*]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
}
function baseNumero(value) {
  const testo = String(value || "").trim();
  const match = testo.match(/PREV-\d+(?:[-/]\d+)?/i);
  return match ? sicuro(match[0].toUpperCase()) : sicuro(testo.replace(/Rev[._\s-]*\d+/i, "").trim());
}
async function lista(folder) {
  try { return await fs.readdir(folder, { withFileTypes: true }); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
}
async function trovaCartella(parent, prefix) {
  const dirs = await lista(parent);
  const found = dirs.find((d) => d.isDirectory() && d.name.toUpperCase().startsWith(prefix.toUpperCase()));
  return found ? path.join(parent, found.name) : null;
}
async function nomeCartella(parent, candidate) {
  const dirs = await lista(parent);
  const found = dirs.find((d) => d.isDirectory() && d.name.toUpperCase() === candidate.toUpperCase());
  return found ? path.join(parent, found.name) : path.join(parent, candidate);
}
async function copiaFile(src, dst) {
  stats.fileCopiati += 1; // Conta i file da copiare anche nell'anteprima.
  if (!esegui) return;
  await fs.mkdir(path.dirname(dst), { recursive: true });
  try {
    await fs.copyFile(src, dst, constants.COPYFILE_EXCL);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const [originale, copiato] = await Promise.all([fs.readFile(src), fs.readFile(dst)]);
    if (originale.equals(copiato)) {
      stats.fileCopiati -= 1;
      stats.fileIdentici += 1;
    } else {
      stats.fileCopiati -= 1;
      stats.conflitti.push({ origine: src, destinazione: dst });
    }
  }
}
async function copiaAlbero(src, dst) {
  for (const voce of await lista(src)) {
    const from = path.join(src, voce.name);
    const to = path.join(dst, voce.name);
    if (voce.isDirectory()) await copiaAlbero(from, to);
    else if (voce.isFile()) await copiaFile(from, to);
  }
}
async function main() {
  if (!arg("--origine") || !arg("--destinazione")) {
    throw new Error("Indicare --origine e --destinazione. L'opzione --esegui abilita soltanto la copia.");
  }
  const rel = path.relative(origine, destinazione);
  const relInv = path.relative(destinazione, origine);
  const dentro = (p) => p === "" || (!p.startsWith("..") && !path.isAbsolute(p));
  if (dentro(rel) || dentro(relInv)) {
    throw new Error("Origine e destinazione devono essere cartelle distinte e non annidate.");
  }
  const sourceClienti = await nomeCartella(origine, "Clienti");
  if (!(await lista(sourceClienti)).length) throw new Error(`Cartella Clienti sorgente vuota o non trovata: ${sourceClienti}`);

  const result = await query(`SELECT p.id, p.numero, p.descrizione,
     COALESCE(NULLIF(c.id_cliente, ''), NULLIF(c.cliente_code, ''), NULLIF(p.cliente_code, ''), 'SENZA-ID') AS codice,
     COALESCE(NULLIF(c.ragione_sociale, ''), NULLIF(p.cliente_nome, ''), 'CLIENTE') AS nome
     FROM preventivi p LEFT JOIN clienti c ON c.id = p.cliente_id
     ORDER BY p.id`);
  for (const p of result.rows) {
    stats.preventivi += 1;
    const codice = sicuro(p.codice);
    const nome = sicuro(p.nome);
    const base = sicuro(baseNumero(p.numero));
    const oggetto = sicuro(p.descrizione || "Preventivo");
    if (!base || !codice) continue;

    const sorgenteCliente = await trovaCartella(sourceClienti, `${codice} - `);
    if (!sorgenteCliente) {
      stats.senzaOrigine.push({ numero: p.numero, cliente: `${codice} - ${nome}` });
      continue;
    }
    const legacyRoot = await nomeCartella(sorgenteCliente, "Preventivi");
    const nestedLegacyFolder = await trovaCartella(legacyRoot, `${base} - `);
    const directFolder = await trovaCartella(sorgenteCliente, `${base} - `);
    const clientiDest = await nomeCartella(destinazione, "Clienti");
    const clienteDest = await trovaCartella(clientiDest, `${codice} - `) ||
      path.join(clientiDest, `${codice} - ${nome}`);
    // Nessuna cartella "Preventivi" intermedia: il numero lavoro e direttamente sotto il cliente.
    const quoteDest = await trovaCartella(clienteDest, `${base} - `) ||
      path.join(clienteDest, `${base} - ${oggetto}`);
    const gruppi = ["Analisi dei costi", "Allegati", "Preventivi", "Consuntivi"];
    stats.cartelle += 1;
    if (esegui) await Promise.all(gruppi.map((d) => fs.mkdir(path.join(quoteDest, d), { recursive: true })));

    // Vecchio archivio "piatto": Clienti/<cliente>/Preventivi/PREV-...pdf.
    for (const entry of await lista(legacyRoot)) {
      if (entry.isFile() && entry.name.toUpperCase().startsWith(base.toUpperCase() + "-") && /\.pdf$/i.test(entry.name)) {
        await copiaFile(path.join(legacyRoot, entry.name), path.join(quoteDest, "Preventivi", entry.name));
      }
    }

    // Supporta sia archivi con cartella intermedia, sia archivi gia organizzati
    // direttamente sotto il cliente. Gli originali non vengono modificati.
    const sourceFolders = [...new Set([nestedLegacyFolder, directFolder].filter(Boolean))];
    const mapping = {
      "analisi dei costi": "Analisi dei costi",
      "analisi costi": "Analisi dei costi",
      "allegati": "Allegati",
      "documenti": "Allegati",
      "foto": "Allegati",
      "preventivi": "Preventivi",
      "pdf": "Preventivi",
      "consuntivi": "Consuntivi",
    };
    for (const sourceFolder of sourceFolders) {
      for (const entry of await lista(sourceFolder)) {
        const oldPath = path.join(sourceFolder, entry.name);
        if (entry.isDirectory()) {
          if (entry.name.toLowerCase() === "superati") {
            await copiaAlbero(oldPath, path.join(quoteDest, "Preventivi", "Superati"));
            continue;
          }
          const destinazioneTipo = mapping[entry.name.toLowerCase()] || "Allegati";
          const sottocartella = mapping[entry.name.toLowerCase()] ? "" : entry.name;
          await copiaAlbero(oldPath, path.join(quoteDest, destinazioneTipo, sottocartella));
        } else if (entry.isFile()) {
          const tipo = /\.pdf$/i.test(entry.name) && entry.name.toUpperCase().startsWith(base.toUpperCase()) ? "Preventivi" : "Allegati";
          await copiaFile(oldPath, path.join(quoteDest, tipo, entry.name));
        }
      }
    }
  }
  process.stdout.write(JSON.stringify({ modalità: esegui ? "COPIA" : "ANTEPRIMA", origine, destinazione, ...stats }, null, 2) + "\n");
  if (stats.conflitti.length) process.exitCode = 2;
}
try { await main(); }
catch (error) { console.error(error); process.exitCode = 1; }
finally { await pool.end(); }
