import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pubblicaPdfConStorico } from "../server/utils/pdfSuperati.js";

async function testDir(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamgroup-superati-"));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "Clienti", "ID02201 - CONDOMINIO QUADRIFOGLIO", "PREV-274 - Opere edili", "Preventivi");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

test("prima creazione: PDF attivo e nessun file Superato", async (t) => {
  const dir = await testDir(t);
  const filePath = path.join(dir, "PREV-274-Rev00.pdf");
  const pdf = Buffer.from("%PDF versione iniziale");
  const primo = await pubblicaPdfConStorico({ filePath, buffer: pdf, base: "PREV-274" });
  assert.equal(primo.superati.length, 0);
  assert.equal(await fs.readFile(filePath, "utf8"), pdf.toString());

  const identico = await pubblicaPdfConStorico({ filePath, buffer: pdf, base: "PREV-274" });
  assert.equal(identico.invariato, true);
  assert.equal((await fs.readdir(path.join(dir, "Superati"))).length, 0);
});

test("modifica stessa revisione: archivia la vecchia prima di aggiornare", async (t) => {
  const dir = await testDir(t);
  const filePath = path.join(dir, "PREV-274-Rev00.pdf");
  const vecchio = Buffer.from("%PDF prima versione");
  const nuovo = Buffer.from("%PDF seconda versione");
  await pubblicaPdfConStorico({ filePath, buffer: vecchio, base: "PREV-274" });
  const res = await pubblicaPdfConStorico({ filePath, buffer: nuovo, base: "PREV-274" });
  assert.equal(await fs.readFile(filePath, "utf8"), nuovo.toString());
  assert.equal(res.superati.length, 1);
  const storico = await fs.readdir(path.join(dir, "Superati"));
  assert.match(storico[0], /^PREV-274-Rev00_SUPERATO_.*\.pdf$/);
  assert.equal(await fs.readFile(res.superati[0], "utf8"), vecchio.toString());
});

test("nuova revisione: sposta la precedente in Superati e non tocca gli allegati", async (t) => {
  const dir = await testDir(t);
  const old = path.join(dir, "PREV-274-Rev00.pdf");
  const next = path.join(dir, "PREV-274-Rev01.pdf");
  const manuale = path.join(dir, "capitolato.pdf");
  await pubblicaPdfConStorico({ filePath: old, buffer: Buffer.from("vecchio"), base: "PREV-274" });
  await fs.writeFile(manuale, "allegato");
  const res = await pubblicaPdfConStorico({ filePath: next, buffer: Buffer.from("nuovo"), base: "PREV-274" });
  await assert.rejects(fs.access(old), { code: "ENOENT" });
  assert.equal(await fs.readFile(next, "utf8"), "nuovo");
  assert.equal(await fs.readFile(manuale, "utf8"), "allegato");
  assert.equal(await fs.readFile(res.superati[0], "utf8"), "vecchio");
});

test("errore prima dell'archiviazione: non modifica il PDF esistente", async (t) => {
  const dir = await testDir(t);
  const filePath = path.join(dir, "PREV-274-Rev00.pdf");
  await fs.writeFile(filePath, "vecchio");
  // Un file denominato Superati impedisce la creazione della cartella.
  await fs.writeFile(path.join(dir, "Superati"), "blocco");
  await assert.rejects(pubblicaPdfConStorico({ filePath, buffer: Buffer.from("nuovo"), base: "PREV-274" }));
  assert.equal(await fs.readFile(filePath, "utf8"), "vecchio");
});
