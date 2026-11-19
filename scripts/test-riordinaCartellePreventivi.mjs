import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { riordinaArchivio } from "./riordinaCartellePreventivi.mjs";

async function preparazione(t) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "teamgroup-riordino-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const radice = path.join(tmp, "archivio");
  const backup = path.join(tmp, "copia-di-sicurezza");
  const cliente = path.join(radice, "CLIENTI", "ID02201 - CONDOMINIO QUADRIFOGLIO");
  const lavoro1 = path.join(cliente, "PREV-253-26 - F.P.O DI NUOVA CALDAIA");
  const lavoro2 = path.join(cliente, "PREV-26180 - Ristrutturazione appartamento");
  await fs.mkdir(lavoro1, { recursive: true });
  await fs.mkdir(lavoro2, { recursive: true });
  return { radice, backup, cliente, lavoro1, lavoro2 };
}

test("anteprima: individua i preventivi senza spostare o eliminare nulla", async (t) => {
  const x = await preparazione(t);
  const fonte = path.join(x.lavoro1, "PREV-253-26-Rev00.pdf");
  await fs.writeFile(fonte, "prima revisione");
  const vecchia = path.join(x.cliente, "Preventivo");
  await fs.mkdir(vecchia);
  await fs.writeFile(path.join(vecchia, "PREV-26180-Rev00.pdf"), "secondo preventivo");
  const report = await riordinaArchivio({ radice: x.radice });
  assert.equal(report.documenti.length, 2);
  assert.equal(report.modalita, "ANTEPRIMA");
  await fs.access(fonte);
  await fs.access(path.join(vecchia, "PREV-26180-Rev00.pdf"));
  await assert.rejects(fs.access(path.join(x.lavoro1, "Preventivi", "PREV-253-26-Rev00.pdf")), { code: "ENOENT" });
});

test("esegui: archivia ogni PDF nella sua commessa, fa backup e rimuove soltanto cartelle vuote", async (t) => {
  const x = await preparazione(t);
  await fs.writeFile(path.join(x.lavoro1, "PREV-253-26-Rev00.pdf"), "vecchio PDF");
  await fs.mkdir(path.join(x.cliente, "Preventivo"));
  await fs.writeFile(path.join(x.cliente, "Preventivo", "PREV-26180-Rev00.pdf"), "secondo PDF");
  await fs.mkdir(path.join(x.cliente, "FOTO"));
  await fs.mkdir(path.join(x.cliente, "DOCUMENTI"));
  await fs.writeFile(path.join(x.cliente, "DOCUMENTI", "importante.txt"), "non toccare");
  const report = await riordinaArchivio({ radice: x.radice, backup: x.backup, esegui: true });
  assert.equal(report.documenti.length, 2);
  assert.equal(report.conflitti.length, 0);
  assert.equal(await fs.readFile(path.join(x.lavoro1, "Preventivi", "PREV-253-26-Rev00.pdf"), "utf8"), "vecchio PDF");
  assert.equal(await fs.readFile(path.join(x.lavoro2, "Preventivi", "PREV-26180-Rev00.pdf"), "utf8"), "secondo PDF");
  assert.equal(await fs.readFile(path.join(x.backup, "CLIENTI", "ID02201 - CONDOMINIO QUADRIFOGLIO", "Preventivo", "PREV-26180-Rev00.pdf"), "utf8"), "secondo PDF");
  await assert.rejects(fs.access(path.join(x.cliente, "FOTO")), { code: "ENOENT" });
  await assert.rejects(fs.access(path.join(x.cliente, "Preventivo")), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(x.cliente, "DOCUMENTI", "importante.txt"), "utf8"), "non toccare");
  assert.equal(report.cartelleDaVerificare.length, 1);
});

test("documento ambiguo: non lo assegna al lavoro sbagliato", async (t) => {
  const x = await preparazione(t);
  await fs.mkdir(path.join(x.cliente, "Preventivo"));
  const nonRiconosciuto = path.join(x.cliente, "Preventivo", "offerta-generica.pdf");
  await fs.writeFile(nonRiconosciuto, "non assegnabile");
  const report = await riordinaArchivio({ radice: x.radice, backup: x.backup, esegui: true });
  assert.equal(report.documenti.length, 0);
  assert.equal(report.nonAssegnati.length, 1);
  assert.equal(await fs.readFile(nonRiconosciuto, "utf8"), "non assegnabile");
});

test("conflitto: non sovrascrive PDF esistente né elimina la sorgente", async (t) => {
  const x = await preparazione(t);
  const sorgente = path.join(x.lavoro1, "PREV-253-26-Rev00.pdf");
  const destinazione = path.join(x.lavoro1, "Preventivi", "PREV-253-26-Rev00.pdf");
  await fs.writeFile(sorgente, "originale");
  await fs.mkdir(path.dirname(destinazione));
  await fs.writeFile(destinazione, "altro contenuto");
  const report = await riordinaArchivio({ radice: x.radice, backup: x.backup, esegui: true });
  assert.equal(report.conflitti.length, 1);
  assert.equal(await fs.readFile(sorgente, "utf8"), "originale");
  assert.equal(await fs.readFile(destinazione, "utf8"), "altro contenuto");
});

test("rifiuta il riordino esecutivo senza un backup esterno", async (t) => {
  const x = await preparazione(t);
  await assert.rejects(riordinaArchivio({ radice: x.radice, esegui: true }), /backup/);
  await assert.rejects(riordinaArchivio({ radice: x.radice, backup: path.join(x.radice, "backup"), esegui: true }), /non annidate/);
});
