import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatNumeroPreventivo, parseNumeroRevisione } from "../server/utils/preventivoPdf.js";
import { risolviCartellaClientiArchivio } from "../server/utils/archivioRoot.js";

test("identificativi preventivo: il numero del lavoro non deve essere troncato", () => {
  const casi = [
    ["PREV-253-26", "PREV-253-26", "Rev00"],
    ["PREV-253-26 -Rev01", "PREV-253-26", "Rev01"],
    ["PREV-26180", "PREV-26180", "Rev00"],
    ["PREV-274/26 -Rev02", "PREV-274-26", "Rev02"],
    ["PREV-2026-0274 -Rev12", "PREV-2026-0274", "Rev12"],
  ];
  for (const [input, base, revisione] of casi) {
    assert.deepEqual(parseNumeroRevisione(input), { base, revisione });
    assert.equal(formatNumeroPreventivo(input), input.includes("Rev") ? input : input + " -Rev00");
  }
});

test("usa CLIENTI esistente senza crearne un duplicato con maiuscole diverse", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "teamgroup-clienti-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const existing = path.join(root, "CLIENTI");
  await fs.mkdir(existing);
  assert.equal(await risolviCartellaClientiArchivio(root), existing);
  assert.equal((await fs.readdir(root)).length, 1);
});
