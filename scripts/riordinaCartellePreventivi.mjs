/**
 * Riposiziona i PDF già esistenti nelle cartelle dei singoli lavori.
 *
 * ANTEPRIMA (non modifica nulla):
 *   node scripts/riordinaCartellePreventivi.mjs --radice "PERCORSO_ARCHIVIO"
 *
 * ESECUZIONE (richiede un backup SEPARATO dalla cartella originale):
 *   node scripts/riordinaCartellePreventivi.mjs --radice "PERCORSO_ARCHIVIO" --backup "PERCORSO_BACKUP" --esegui
 *
 * Nessuna cartella con contenuto non riconosciuto viene cancellata.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { pathToFileURL } from "node:url";

const nonPertinenti = new Set(["CONTABILITÀ", "CONTABILITA", "DOCUMENTI", "FORNITORI", "FOTO", "PROGETTI", "PREVENTIVO", "PREVENTIVI", "PDF"]);
const sorgentiLegacy = new Set(["PREVENTIVO", "PREVENTIVI", "PDF"]);

function identificativo(value) {
  const match = String(value).match(/^PREV-\d+(?:[-/]\d+)?/i);
  return match ? match[0].replace("/", "-").toUpperCase() : "";
}
async function voci(folder) {
  try { return await fs.readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
async function fileEsistente(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
async function fileUguali(a, b) {
  const [ba, bb] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
  return ba.equals(bb);
}
function contenuto(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
async function trovaDirectory(parent, name) {
  const found = (await voci(parent)).find((x) => x.isDirectory() && x.name.toUpperCase() === name.toUpperCase());
  return found ? path.join(parent, found.name) : "";
}
async function scansionePdf(dir, risultati = []) {
  for (const entry of await voci(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await scansionePdf(full, risultati);
    else if (entry.isFile() && /\.pdf$/i.test(entry.name)) risultati.push(full);
  }
  return risultati;
}
async function rimuoviSoltantoVuote(folder, removals) {
  for (const entry of await voci(folder)) {
    if (entry.isDirectory()) await rimuoviSoltantoVuote(path.join(folder, entry.name), removals);
  }
  if ((await voci(folder)).length === 0) {
    try { await fs.rmdir(folder); removals.push(folder); }
    catch (error) { if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error; }
  }
}
export async function riordinaArchivio({ radice, backup = "", esegui = false }) {
  if (!radice || !path.isAbsolute(radice)) throw new Error("Indicare una --radice assoluta.");
  const root = path.resolve(radice);
  const clientiRoot = await trovaDirectory(root, "CLIENTI");
  if (!clientiRoot) throw new Error("Nessuna cartella CLIENTI trovata nella radice: " + root);
  let backupRoot = "";
  if (esegui) {
    if (!backup || !path.isAbsolute(backup)) throw new Error("Per --esegui è obbligatorio un percorso --backup assoluto.");
    backupRoot = path.resolve(backup);
    if (contenuto(root, backupRoot) || contenuto(backupRoot, root)) {
      throw new Error("Backup e archivio originale devono trovarsi in cartelle separate, non annidate.");
    }
    await fs.mkdir(backupRoot, { recursive: true });
  }
  const report = {
    modalita: esegui ? "ESECUZIONE" : "ANTEPRIMA",
    radice: root,
    documenti: [],
    nonAssegnati: [],
    conflitti: [],
    cartelleEliminate: [],
    cartelleDaVerificare: [],
  };
  for (const cliente of await voci(clientiRoot)) {
    if (!cliente.isDirectory()) continue;
    const clienteDir = path.join(clientiRoot, cliente.name);
    const lavori = (await voci(clienteDir))
      .filter((entry) => entry.isDirectory() && identificativo(entry.name))
      .map((entry) => ({ id: identificativo(entry.name), path: path.join(clienteDir, entry.name) }));
    if (!lavori.length) continue;
    const lavoriPerId = new Map();
    for (const lavoro of lavori) {
      if (!lavoriPerId.has(lavoro.id)) lavoriPerId.set(lavoro.id, []);
      lavoriPerId.get(lavoro.id).push(lavoro);
    }
    const fileTrovati = [];
    for (const lavoro of lavori) {
      for (const entry of await voci(lavoro.path)) {
        if (entry.isFile() && /\.pdf$/i.test(entry.name)) fileTrovati.push(path.join(lavoro.path, entry.name));
      }
    }
    for (const entry of await voci(clienteDir)) {
      if (entry.isDirectory() && sorgentiLegacy.has(entry.name.toUpperCase())) {
        await scansionePdf(path.join(clienteDir, entry.name), fileTrovati);
      }
    }
    for (const file of fileTrovati) {
      const id = identificativo(path.basename(file));
      const possibili = lavoriPerId.get(id) || [];
      if (!id || possibili.length !== 1) {
        report.nonAssegnati.push(file);
        continue;
      }
      const destinatario = path.join(possibili[0].path, "Preventivi", path.basename(file));
      if (path.resolve(file).toUpperCase() === path.resolve(destinatario).toUpperCase()) continue;
      const targetEsistente = await fileEsistente(destinatario);
      if (targetEsistente && !(await fileUguali(file, destinatario))) {
        report.conflitti.push({ origine: file, destinazione: destinatario });
        continue;
      }
      report.documenti.push({ origine: file, destinazione: destinatario, giaPresente: targetEsistente });
      if (!esegui) continue;

      // Copia di sicurezza verificata prima di effettuare ogni spostamento.
      const relativo = path.relative(clientiRoot, file);
      const copia = path.join(backupRoot, "CLIENTI", relativo);
      await fs.mkdir(path.dirname(copia), { recursive: true });
      try { await fs.copyFile(file, copia, constants.COPYFILE_EXCL); }
      catch (error) { if (error.code !== "EEXIST" || !(await fileUguali(file, copia))) throw error; }
      if (!(await fileUguali(file, copia))) throw new Error("Copia di sicurezza non valida: " + file);
      await fs.mkdir(path.dirname(destinatario), { recursive: true });
      if (!targetEsistente) {
        try { await fs.copyFile(file, destinatario, constants.COPYFILE_EXCL); }
        catch (error) {
          if (error.code !== "EEXIST" || !(await fileUguali(file, destinatario))) throw error;
        }
      }
      if (!(await fileUguali(file, destinatario))) throw new Error("Copia destinazione non valida: " + file);
      await fs.unlink(file);
    }

    for (const entry of await voci(clienteDir)) {
      if (!entry.isDirectory() || !nonPertinenti.has(entry.name.toUpperCase())) continue;
      const dir = path.join(clienteDir, entry.name);
      if (esegui) await rimuoviSoltantoVuote(dir, report.cartelleEliminate);
      if (await fileEsistente(dir)) report.cartelleDaVerificare.push(dir);
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const valore = (flag) => {
    const pos = args.indexOf(flag);
    return pos === -1 ? "" : args[pos + 1] || "";
  };
  riordinaArchivio({ radice: valore("--radice"), backup: valore("--backup"), esegui: args.includes("--esegui") })
    .then((risultato) => {
      console.log(JSON.stringify(risultato, null, 2));
      if (risultato.conflitti.length || risultato.nonAssegnati.length) process.exitCode = 2;
    })
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
