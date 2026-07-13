import { Router } from "express";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { query } from "../config/db.js";
import { createCrudRepository } from "../utils/crud.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { archiviaPdfPreventivo, assicuraCartellaPreventiviCliente, trovaPdfPreventivoArchiviato } from "../utils/preventivoPdf.js";
import {
  calcolaImportoRiga,
  calcolaQuantitaRiga,
  getPrezzoUnitarioRiga,
  getScontoRiga,
  numeroPreventivo,
} from "../utils/preventivoCalcoli.js";

const repository = createCrudRepository({
  table: "preventivi",
  allowedFields: ["clienteId", "idIndirizzo", "clienteNome", "clienteVia", "clienteCode", "numero", "data", "cliente", "cantiere", "descrizione", "importo", "stato", "pdfPath", "folderPath", "pdfFileName"],
});

const router = Router();
let preventivoRigheSchemaPromise;

function toCamel(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

async function ensurePreventivoRigheSchema() {
  if (!preventivoRigheSchemaPromise) {
    preventivoRigheSchemaPromise = (async () => {
      const colonne = await query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'preventivo_righe'`,
      );
      const nomiColonne = new Set(colonne.rows.map((row) => row.column_name));

      return {
        categoria: nomiColonne.has("categoria"),
        categoriaBloccata: nomiColonne.has("categoria_bloccata"),
        metaCategorie: await tableExists("preventivo_righe_categorie"),
      };
    })();
  }

  return preventivoRigheSchemaPromise;
}

async function tableExists(tableName) {
  const result = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );

  return Boolean(result.rows[0]?.exists);
}

async function ensureIvaTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS preventivi_iva (
      preventivo_id INTEGER PRIMARY KEY,
      iva_aliquota NUMERIC(5, 2) NOT NULL DEFAULT 22,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
}

async function risolviIdIndirizzo(clienteId, idIndirizzo) {
  if (!(await tableExists("indirizzi"))) return idIndirizzo || null;
  if (idIndirizzo) {
    const result = await query(
      `SELECT id
       FROM indirizzi
       WHERE id::text = $1::text
         AND ($2::text IS NULL OR cliente_id::text = $2::text)
       LIMIT 1`,
      [String(idIndirizzo), clienteId ? String(clienteId) : null],
    );
    if (result.rows[0]) return result.rows[0].id;
  }
  if (!clienteId) return null;

  const result = await query(
    `SELECT id
     FROM indirizzi
     WHERE cliente_id = $1
     ORDER BY principale DESC, id ASC
     LIMIT 1`,
    [clienteId],
  );

  return result.rows[0]?.id || null;
}

function normalizzaPreventivo(row) {
  const preventivo = toCamel(row);
  const indirizzo = preventivo.indirizzoRecuperatoId
    ? {
        id: preventivo.indirizzoRecuperatoId,
        via: preventivo.indirizzoVia || "",
        civico: preventivo.indirizzoCivico || "",
        cap: preventivo.indirizzoCap || "",
        comune: preventivo.indirizzoComune || "",
      }
    : null;
  const clienteAnagrafica = preventivo.clienteRagioneSociale || preventivo.cliente || "";
  const clienteIndirizzo = preventivo.clienteIndirizzo || "";
  const clienteCodeAnagrafica = preventivo.clienteCodeAnagrafica || "";

  delete preventivo.indirizzoRecuperatoId;
  delete preventivo.indirizzoVia;
  delete preventivo.indirizzoCivico;
  delete preventivo.indirizzoCap;
  delete preventivo.indirizzoComune;
  delete preventivo.clienteRagioneSociale;
  delete preventivo.clienteIndirizzo;
  delete preventivo.clienteCodeAnagrafica;
  delete preventivo.pdfPath;

  return {
    ...preventivo,
    cliente: clienteAnagrafica,
    clienteCode: preventivo.clienteCode || clienteCodeAnagrafica,
    idIndirizzo: preventivo.idIndirizzo || indirizzo?.id || null,
    indirizzo: indirizzo || (clienteIndirizzo ? { via: clienteIndirizzo, civico: "", cap: "", comune: "" } : null),
  };
}

async function getPreventiviBase(where = "", params = []) {
  const hasIndirizzi = await tableExists("indirizzi");
  const selectIndirizzo = hasIndirizzi
    ? `COALESCE(i_preventivo.id, i_cliente.id) AS indirizzo_recuperato_id,
       COALESCE(NULLIF(i_preventivo.via, ''), NULLIF(i_cliente.via, ''), c.indirizzo) AS indirizzo_via,
       COALESCE(i_preventivo.civico, i_cliente.civico) AS indirizzo_civico,
       COALESCE(i_preventivo.cap, i_cliente.cap) AS indirizzo_cap,
       COALESCE(i_preventivo.comune, i_cliente.comune) AS indirizzo_comune`
    : `NULL::integer AS indirizzo_recuperato_id,
       c.indirizzo AS indirizzo_via,
       NULL::text AS indirizzo_civico,
       NULL::text AS indirizzo_cap,
       NULL::text AS indirizzo_comune`;
  const joinIndirizzo = hasIndirizzi
    ? `LEFT JOIN indirizzi i_preventivo ON i_preventivo.id = p.id_indirizzo
       LEFT JOIN LATERAL (
         SELECT i.*
         FROM indirizzi i
         WHERE i.cliente_id = p.cliente_id
         ORDER BY i.principale DESC, i.id ASC
         LIMIT 1
       ) i_cliente ON TRUE`
    : "";
  const result = await query(
    `SELECT p.*,
            c.ragione_sociale AS cliente_ragione_sociale,
            c.indirizzo AS cliente_indirizzo,
            c.cliente_code AS cliente_code_anagrafica,
            ${selectIndirizzo}
     FROM preventivi p
     LEFT JOIN clienti c ON c.id = p.cliente_id
     ${joinIndirizzo}
     ${where}
     ORDER BY p.created_at DESC`,
    params,
  );

  return result.rows.map(normalizzaPreventivo);
}

function normalizzaIvaAliquota(ivaAliquota) {
  const valore = Number(String(ivaAliquota ?? "").replace(",", "."));
  return Number.isFinite(valore) && valore >= 0 ? valore : 22;
}

async function getClienteAnagrafica(clienteId) {
  if (!clienteId) return null;

  const result = await query(
    `SELECT id, cliente_code, ragione_sociale, indirizzo
     FROM clienti
     WHERE id::text = $1::text
     LIMIT 1`,
    [String(clienteId)],
  );

  return result.rows[0] || null;
}

async function getClienteCompleto(clienteId) {
  if (!clienteId) return null;

  const result = await query(
    `SELECT *
     FROM clienti
     WHERE id::text = $1::text
     LIMIT 1`,
    [String(clienteId)],
  );

  return result.rows[0] ? toCamel(result.rows[0]) : null;
}

async function getIndirizzoAnagrafica(idIndirizzo, clienteId) {
  if (!idIndirizzo || !(await tableExists("indirizzi"))) return null;

  const result = await query(
    `SELECT id, via, civico, cap, comune
     FROM indirizzi
     WHERE id::text = $1::text
       AND ($2::text IS NULL OR cliente_id::text = $2::text)
     LIMIT 1`,
    [String(idIndirizzo), clienteId ? String(clienteId) : null],
  );

  return result.rows[0] || null;
}

async function normalizzaPayloadClientePreventivo(data, { clienteObbligatorio = false } = {}) {
  const payload = { ...data };
  const clienteId = payload.clienteId || payload.cliente_id || null;

  if (clienteObbligatorio && !clienteId) {
    const error = new Error("Seleziona cliente dall'anagrafica.");
    error.status = 400;
    throw error;
  }

  if (!clienteId) return payload;

  const cliente = await getClienteAnagrafica(clienteId);
  if (!cliente) {
    const error = new Error("Cliente collegato non trovato in anagrafica.");
    error.status = 400;
    throw error;
  }

  const idIndirizzo = await risolviIdIndirizzo(cliente.id, payload.idIndirizzo);
  const indirizzo = await getIndirizzoAnagrafica(idIndirizzo, cliente.id);
  const via = [indirizzo?.via, indirizzo?.civico].filter(Boolean).join(" ") || cliente.indirizzo || "";

  return {
    ...payload,
    clienteId: cliente.id,
    idIndirizzo,
    clienteCode: cliente.cliente_code || "",
    clienteNome: cliente.ragione_sociale || "",
    clienteVia: via,
    cliente: cliente.ragione_sociale || payload.cliente || "",
  };
}

async function salvaIvaAliquota(preventivoId, ivaAliquota) {
  await ensureIvaTable();
  await query(
    `INSERT INTO preventivi_iva (preventivo_id, iva_aliquota)
     VALUES ($1, $2)
     ON CONFLICT (preventivo_id)
     DO UPDATE SET iva_aliquota = EXCLUDED.iva_aliquota, updated_at = NOW()`,
    [preventivoId, normalizzaIvaAliquota(ivaAliquota)],
  );
}

async function salvaArchivioPreventivo(preventivoId, archivio) {
  await query(
    `UPDATE preventivi
     SET pdf_path = $2,
         folder_path = $3,
         pdf_file_name = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [preventivoId, archivio.filePath, archivio.folderPath, archivio.fileName],
  );
}

async function getIvaAliquote(preventivoIds = []) {
  if (!preventivoIds.length) return new Map();
  if (!(await tableExists("preventivi_iva"))) return new Map();
  const result = await query(
    "SELECT preventivo_id, iva_aliquota FROM preventivi_iva WHERE preventivo_id = ANY($1::int[])",
    [preventivoIds],
  );
  return new Map(result.rows.map((row) => [Number(row.preventivo_id), Number(row.iva_aliquota)]));
}

async function getRighe(preventivoId) {
  const supportoSchema = await ensurePreventivoRigheSchema();
  const result = supportoSchema.metaCategorie
    ? await query(
        `SELECT pr.*,
                COALESCE(meta.categoria, 'Edili') AS categoria,
                COALESCE(meta.categoria_bloccata, TRUE) AS categoria_bloccata
         FROM preventivo_righe pr
         LEFT JOIN preventivo_righe_categorie meta ON meta.riga_id = pr.id
         WHERE pr.preventivo_id = $1
         ORDER BY pr.id ASC`,
        [preventivoId],
      )
    : await query(
        `SELECT pr.*, 'Edili'::text AS categoria, TRUE AS categoria_bloccata
         FROM preventivo_righe pr
         WHERE pr.preventivo_id = $1
         ORDER BY pr.id ASC`,
        [preventivoId],
      );

  return result.rows.map((row) => {
    const riga = toCamel(row);
    const quantitaCalcolata = calcolaQuantitaRiga(riga);
    const prezzoUnitario = getPrezzoUnitarioRiga(riga);
    const sconto = getScontoRiga(riga);

    return {
      ...riga,
      quantita: quantitaCalcolata,
      prezzoUnitario,
      sconto,
      totale: calcolaImportoRiga({ ...riga, quantita: quantitaCalcolata, prezzoUnitario, sconto }),
    };
  });
}

async function getPreventivoCompleto(id) {
  const preventivo = (await getPreventiviBase("WHERE p.id = $1", [id]))[0];
  if (!preventivo) return null;
  const ivaAliquote = await getIvaAliquote([preventivo.id]);

  return {
    ...preventivo,
    ivaAliquota: ivaAliquote.get(Number(preventivo.id)) ?? 22,
    righe: await getRighe(id),
  };
}

function generaCodiceElencoPrezzi(riga) {
  if (riga.codice) return String(riga.codice).trim();

  const base = `${riga.descrizione || ""}|${riga.unita || ""}`.toLowerCase();
  let hash = 0;

  for (let index = 0; index < base.length; index += 1) {
    hash = (hash * 31 + base.charCodeAt(index)) >>> 0;
  }

  return `TG-${String(hash).padStart(8, "0").slice(0, 8)}`;
}

function classificaCategoria(riga) {
  const testo = `${riga.descrizione || ""} ${riga.unita || ""}`.toLowerCase();

  if (/(elettric|quadro|cavo|presa|interrutt|illumin|lampad|impianto elettrico)/.test(testo)) return "Elettriche";
  if (/(climatizz|condizion|split|pompa di calore|unita esterna|unità esterna|unita interna|unità interna)/.test(testo)) return "Climatizzazione";
  if (/(idraulic|scaric|rubinett|sanitari|caldaia|tubaz|acqua|bagno|doccia)/.test(testo)) return "Idrauliche";
  if (/(fotovoltaic|inverter|modul|pannell|accumulo|kwp)/.test(testo)) return "Fotovoltaico";
  if (/(serrament|finestr|porta|infiss|tapparell|oscurant)/.test(testo)) return "Serramenti";
  if (/(copertur|tetto|lattoner|gronda|guaina|impermeabil)/.test(testo)) return "Coperture";
  if (/(sicurezza|ponteggio|dpi|recinzion|linea vita|d\\. lgs|d lgs)/.test(testo)) return "Sicurezza";
  if (/(demolizion|rimozion|smontagg|asportaz)/.test(testo)) return "Demolizioni";
  if (/(scav|movimento terra|reinterro|sbancament)/.test(testo)) return "Scavi";
  if (/(pittura|tinteggi|intonac|cartongess|paviment|rivestiment|finitur)/.test(testo)) return "Finiture";

  return "Edili";
}

async function aggiornaElencoPrezziDaRighe(righe = []) {
  const righeAggiornate = [];

  for (const riga of righe) {
    if (!riga.descrizione || !String(riga.descrizione).trim()) {
      righeAggiornate.push(riga);
      continue;
    }

    const codice = generaCodiceElencoPrezzi(riga);
    const prezzoUnitario = getPrezzoUnitarioRiga(riga);
    const descrizione = String(riga.descrizione).trim();
    const unita = riga.unita || "pz";
    const categoria = riga.categoria || classificaCategoria(riga);
    const categoriaBloccata = riga.categoriaBloccata !== false && riga.categoria_bloccata !== false;
    const categoriaModificataManualmente = Boolean(riga.categoriaModificataManualmente || riga.categoria_modificata_manualmente);
    const note = "Elenco prezzi proprietario TEAM GROUP - aggiornato automaticamente dai preventivi";

    const esistente = await query(
      `SELECT *
       FROM elenco_prezzi
       WHERE codice = $1
          OR (LOWER(descrizione) = LOWER($2) AND unita = $3 AND note ILIKE '%TEAM GROUP%')
       ORDER BY id ASC
       LIMIT 1`,
      [codice, descrizione, unita],
    );

    let voce;

    if (esistente.rows[0]) {
      const categoriaDaSalvare = categoriaModificataManualmente || !categoriaBloccata
        ? categoria
        : esistente.rows[0].categoria || categoria;
      const aggiornata = await query(
        `UPDATE elenco_prezzi
         SET codice = $1,
             categoria = $2,
             descrizione = $3,
             unita = $4,
             prezzo_unitario = $5,
             costo_interno = $5,
             note = $6,
             attivo = TRUE,
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [codice, categoriaDaSalvare, descrizione, unita, prezzoUnitario, note, esistente.rows[0].id],
      );
      voce = aggiornata.rows[0];
    } else {
      const creata = await query(
        `INSERT INTO elenco_prezzi
         (codice, categoria, descrizione, unita, prezzo_unitario, costo_interno, note, attivo)
         VALUES ($1, $2, $3, $4, $5, $5, $6, TRUE)
         RETURNING *`,
        [codice, categoria, descrizione, unita, prezzoUnitario, note],
      );
      voce = creata.rows[0];
    }

    righeAggiornate.push({
      ...riga,
      elencoPrezziId: voce.id,
      codice,
    });
  }

  return righeAggiornate;
}

async function salvaRighe(preventivoId, righe = []) {
  const supportoSchema = await ensurePreventivoRigheSchema();
  if (supportoSchema.metaCategorie) {
    await query(
      `DELETE FROM preventivo_righe_categorie
       WHERE riga_id IN (SELECT id FROM preventivo_righe WHERE preventivo_id = $1)`,
      [preventivoId],
    );
  }
  await query("DELETE FROM preventivo_righe WHERE preventivo_id = $1", [preventivoId]);

  const righeConElencoPrezzi = await aggiornaElencoPrezziDaRighe(righe);

  for (const riga of righeConElencoPrezzi) {
    const valoreMisuraSalvato = (valore) =>
      valore === "" || valore === null || valore === undefined ? 0 : numeroPreventivo(valore);
    const partiUguali = valoreMisuraSalvato(riga.partiUguali ?? riga.parti_uguali);
    const lunghezza = valoreMisuraSalvato(riga.lunghezza);
    const larghezza = valoreMisuraSalvato(riga.larghezza);
    const altezzaPeso = valoreMisuraSalvato(riga.altezzaPeso ?? riga.altezza_peso);
    const quantita = calcolaQuantitaRiga({ ...riga, partiUguali, lunghezza, larghezza, altezzaPeso });
    const prezzoUnitario = getPrezzoUnitarioRiga(riga);
    const sconto = getScontoRiga(riga);
    const totale = calcolaImportoRiga({ ...riga, partiUguali, lunghezza, larghezza, altezzaPeso, quantita, prezzoUnitario, sconto });
    const valoriBase = [
      preventivoId,
      riga.elencoPrezziId || null,
      riga.codice || null,
      riga.descrizione,
      riga.unita || "pz",
      partiUguali,
      lunghezza,
      larghezza,
      altezzaPeso,
      quantita,
      prezzoUnitario,
      sconto,
      totale,
    ];

    if (supportoSchema.categoria && supportoSchema.categoriaBloccata) {
      const inserita = await query(
        `INSERT INTO preventivo_righe
         (preventivo_id, elenco_prezzi_id, codice, categoria, descrizione, unita, parti_uguali, lunghezza, larghezza, altezza_peso, quantita, prezzo_unitario, sconto, totale, categoria_bloccata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          preventivoId,
          riga.elencoPrezziId || null,
          riga.codice || null,
          riga.categoria || "Edili",
          riga.descrizione,
          riga.unita || "pz",
          partiUguali,
          lunghezza,
          larghezza,
          altezzaPeso,
          quantita,
          prezzoUnitario,
          sconto,
          totale,
          riga.categoriaBloccata !== false,
        ],
      );
      if (supportoSchema.metaCategorie) {
        await query(
          `INSERT INTO preventivo_righe_categorie (riga_id, categoria, categoria_bloccata)
           VALUES ($1, $2, $3)
           ON CONFLICT (riga_id)
           DO UPDATE SET categoria = EXCLUDED.categoria, categoria_bloccata = EXCLUDED.categoria_bloccata, updated_at = NOW()`,
          [inserita.rows[0]?.id, riga.categoria || "Edili", riga.categoriaBloccata !== false],
        );
      }
    } else if (supportoSchema.categoria) {
      const inserita = await query(
        `INSERT INTO preventivo_righe
         (preventivo_id, elenco_prezzi_id, codice, categoria, descrizione, unita, parti_uguali, lunghezza, larghezza, altezza_peso, quantita, prezzo_unitario, sconto, totale)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          preventivoId,
          riga.elencoPrezziId || null,
          riga.codice || null,
          riga.categoria || "Edili",
          riga.descrizione,
          riga.unita || "pz",
          partiUguali,
          lunghezza,
          larghezza,
          altezzaPeso,
          quantita,
          prezzoUnitario,
          sconto,
          totale,
        ],
      );
      if (supportoSchema.metaCategorie) {
        await query(
          `INSERT INTO preventivo_righe_categorie (riga_id, categoria, categoria_bloccata)
           VALUES ($1, $2, $3)
           ON CONFLICT (riga_id)
           DO UPDATE SET categoria = EXCLUDED.categoria, categoria_bloccata = EXCLUDED.categoria_bloccata, updated_at = NOW()`,
          [inserita.rows[0]?.id, riga.categoria || "Edili", riga.categoriaBloccata !== false],
        );
      }
    } else {
      const inserita = await query(
        `INSERT INTO preventivo_righe
         (preventivo_id, elenco_prezzi_id, codice, descrizione, unita, parti_uguali, lunghezza, larghezza, altezza_peso, quantita, prezzo_unitario, sconto, totale)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        valoriBase,
      );
      if (supportoSchema.metaCategorie) {
        await query(
          `INSERT INTO preventivo_righe_categorie (riga_id, categoria, categoria_bloccata)
           VALUES ($1, $2, $3)
           ON CONFLICT (riga_id)
           DO UPDATE SET categoria = EXCLUDED.categoria, categoria_bloccata = EXCLUDED.categoria_bloccata, updated_at = NOW()`,
          [inserita.rows[0]?.id, riga.categoria || "Edili", riga.categoriaBloccata !== false],
        );
      }
    }
  }
}

router.get("/", asyncHandler(async (req, res) => {
  const preventivi = await getPreventiviBase();
  const ivaAliquote = await getIvaAliquote(preventivi.map((preventivo) => preventivo.id));
  const completi = await Promise.all(
    preventivi.map(async (preventivo) => ({
      ...preventivo,
      ivaAliquota: ivaAliquote.get(Number(preventivo.id)) ?? 22,
      righe: await getRighe(preventivo.id),
    })),
  );

  res.json(completi);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });
  res.json(preventivo);
}));

router.post("/", asyncHandler(async (req, res) => {
  const righe = Array.isArray(req.body.righe) ? req.body.righe : [];
  const payload = await normalizzaPayloadClientePreventivo(req.body, { clienteObbligatorio: true });
  const importo = righe.length
    ? righe.reduce((totale, riga) => totale + calcolaImportoRiga(riga), 0)
    : Number(req.body.importo || 0);

  const preventivo = await repository.create({
    ...payload,
    ivaAliquota: undefined,
    importo: Number(importo.toFixed(2)),
  });

  await salvaIvaAliquota(preventivo.id, req.body.ivaAliquota);
  await salvaRighe(preventivo.id, righe);
  res.status(201).json(await getPreventivoCompleto(preventivo.id));
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const righe = Array.isArray(req.body.righe) ? req.body.righe : null;
  const payload = await normalizzaPayloadClientePreventivo(req.body);
  const ivaAliquota = payload.ivaAliquota;
  delete payload.ivaAliquota;

  if (righe) {
    payload.importo = Number(
      righe
        .reduce((totale, riga) => totale + calcolaImportoRiga(riga), 0)
        .toFixed(2),
    );
  }

  const preventivo = await repository.update(req.params.id, payload);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  if (ivaAliquota !== undefined) await salvaIvaAliquota(req.params.id, ivaAliquota);
  if (righe) await salvaRighe(req.params.id, righe);

  res.json(await getPreventivoCompleto(req.params.id));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const item = await repository.remove(req.params.id);
  if (!item) return res.status(404).json({ message: "Preventivo non trovato" });
  res.json({ deleted: true, item });
}));

router.get("/:id/pdf", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cliente = await getClienteCompleto(preventivo.clienteId);
  const archivio = await trovaPdfPreventivoArchiviato(preventivo, cliente ? [cliente] : undefined);
  const endpoint = `/api/preventivi/${req.params.id}/pdf`;
  const pdfPath = archivio.filePath;
  console.log("pdfPath", pdfPath);
  console.log("fs.existsSync(pdfPath)", fsSync.existsSync(pdfPath));
  if (!archivio.exists) {
    console.warn("PDF preventivo non trovato", {
      status: 404,
      endpoint,
      fileName: archivio.fileName,
      filePath: pdfPath,
    });
    return res.status(404).json({
      code: "PDF_NON_GENERATO",
      message: "PDF non ancora generato",
      filename: archivio.fileName,
    });
  }

  const stat = await fs.stat(pdfPath);
  if (!stat.isFile() || stat.size <= 0) {
    console.warn("File PDF preventivo non valido", {
      status: 404,
      endpoint,
      fileName: archivio.fileName,
      filePath: pdfPath,
      size: stat.size,
    });
    return res.status(404).json({
      code: "PDF_NON_VALIDO",
      message: "File PDF non trovato",
      filename: archivio.fileName,
    });
  }

  console.info("PDF preventivo servito", {
    status: 200,
    endpoint,
    fileName: archivio.fileName,
    filePath: pdfPath,
    size: stat.size,
  });
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${archivio.fileName.replaceAll('"', "")}"`);
  res.setHeader("Content-Length", String(stat.size));
  res.sendFile(path.resolve(pdfPath));
}));

router.head("/:id/pdf", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).end();

  const cliente = await getClienteCompleto(preventivo.clienteId);
  const archivio = await trovaPdfPreventivoArchiviato(preventivo, cliente ? [cliente] : undefined);
  const pdfPath = archivio.filePath;
  console.log("pdfPath", pdfPath);
  console.log("fs.existsSync(pdfPath)", fsSync.existsSync(pdfPath));
  if (!archivio.exists) return res.status(404).end();

  const stat = await fs.stat(pdfPath);
  if (!stat.isFile() || stat.size <= 0) return res.status(404).end();

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${archivio.fileName.replaceAll('"', "")}"`);
  res.setHeader("Content-Length", String(stat.size));
  res.status(200).end();
}));

router.get("/:id/pdf-info", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cliente = await getClienteCompleto(preventivo.clienteId);
  const archivio = await trovaPdfPreventivoArchiviato(preventivo, cliente ? [cliente] : undefined);
  const pdfPath = archivio.filePath;
  console.log("pdfPath", pdfPath);
  console.log("fs.existsSync(pdfPath)", fsSync.existsSync(pdfPath));

  res.json({
    exists: archivio.exists,
    pdfUrl: `/api/preventivi/${req.params.id}/pdf`,
    filename: archivio.fileName,
    folderPath: archivio.folderPath,
  });
}));

router.post("/:id/pdf", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cliente = await getClienteCompleto(preventivo.clienteId);
  let archivio;
  const endpoint = `/api/preventivi/${req.params.id}/pdf`;
  try {
    archivio = await archiviaPdfPreventivo(preventivo, cliente ? [cliente] : undefined);
    await salvaArchivioPreventivo(req.params.id, archivio);
    const pdfPath = archivio.filePath;
    console.log("pdfPath", pdfPath);
    console.log("fs.existsSync(pdfPath)", fsSync.existsSync(pdfPath));
    const stat = await fs.stat(pdfPath);
    console.info("PDF preventivo generato", {
      status: 200,
      endpoint,
      fileName: archivio.fileName,
      filePath: pdfPath,
      size: stat.size,
    });
    res.json({
      success: true,
      message: "PDF generato e aperto",
      pdfUrl: endpoint,
      filename: archivio.fileName,
      size: stat.size,
      archivio: {
        fileName: archivio.fileName,
        folderPath: archivio.folderPath,
      },
    });
  } catch (error) {
    console.error("Errore generazione PDF preventivo", {
      status: error.code === "EBUSY" || error.code === "EACCES" ? 409 : 500,
      endpoint,
      fileName: archivio?.fileName,
      filePath: archivio?.filePath,
      error: error.message,
    });
    return res.status(error.code === "EBUSY" || error.code === "EACCES" ? 409 : 500).json({
      code: error.code === "EBUSY" || error.code === "EACCES" ? "PDF_IN_USO" : "ERRORE_GENERAZIONE_PDF",
      message: error.code === "EBUSY" || error.code === "EACCES"
        ? "Il PDF e aperto in un altro programma. Chiudilo e riprova."
        : "Errore generazione PDF",
      errore: error.message,
      filename: archivio?.fileName,
    });
  }
}));

router.get("/:id/cartella", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cliente = await getClienteCompleto(preventivo.clienteId);
  const archivio = await assicuraCartellaPreventiviCliente(preventivo, cliente ? [cliente] : undefined);
  console.log("folderPath", archivio.folderPath);
  console.log("fs.existsSync(folderPath)", fsSync.existsSync(archivio.folderPath));
  res.json({
    message: "Cartella preventivi cliente disponibile.",
    folderPath: archivio.folderPath,
    clienteFolderPath: archivio.clienteFolderPath,
    exists: archivio.exists,
  });
}));

router.post("/:id/archivia-pdf", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cliente = await getClienteCompleto(preventivo.clienteId);
  let archivio;
  try {
    archivio = await archiviaPdfPreventivo(preventivo, cliente ? [cliente] : undefined);
    await salvaArchivioPreventivo(req.params.id, archivio);
  } catch (error) {
    return res.status(500).json({
      message: "Archiviazione preventivo non riuscita.",
      percorsoCercato: process.env.PREVENTIVI_OUTPUT_DIR || "",
      errore: error.message,
      motivo: error.code || "Errore scrittura file",
    });
  }

  res.json({
    message: "Preventivo archiviato correttamente.",
    preventivo,
    archivio: {
      rootPath: archivio.rootPath,
      fileName: archivio.fileName,
      clienteFolderName: archivio.clienteFolderName,
      clienteFolderPath: archivio.clienteFolderPath,
      folderName: archivio.folderName,
      folderPath: archivio.folderPath,
    },
  });
}));

router.post("/:id/apri-cartella", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cliente = await getClienteCompleto(preventivo.clienteId);
  const archivio = await assicuraCartellaPreventiviCliente(preventivo, cliente ? [cliente] : undefined);
  const folderPath = archivio.folderPath;
  console.log("folderPath", folderPath);
  console.log("fs.existsSync(folderPath)", fsSync.existsSync(folderPath));
  res.json({ message: "Cartella preventivo disponibile.", folderPath });
}));

router.post("/:id/copia-percorso", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cliente = await getClienteCompleto(preventivo.clienteId);
  const archivio = await assicuraCartellaPreventiviCliente(preventivo, cliente ? [cliente] : undefined);
  const folderPath = archivio.folderPath;
  console.log("folderPath", folderPath);
  console.log("fs.existsSync(folderPath)", fsSync.existsSync(folderPath));

  try {
    const clip = spawn("clip.exe", [], { stdio: ["pipe", "ignore", "pipe"] });
    clip.stdin.end(folderPath);
    const [code] = await once(clip, "close");
    if (code !== 0) throw new Error(`clip.exe terminato con codice ${code}`);
  } catch (error) {
    return res.status(500).json({
      message: "Copia percorso non riuscita.",
      percorsoCercato: folderPath,
      errore: error.message,
      motivo: error.code || "Errore copia percorso",
    });
  }

  res.json({ message: "Percorso copiato.", folderPath });
}));

router.post("/:id/apri-pdf", asyncHandler(async (req, res) => {
  const preventivo = await getPreventivoCompleto(req.params.id);
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cliente = await getClienteCompleto(preventivo.clienteId);
  const archivio = await trovaPdfPreventivoArchiviato(preventivo, cliente ? [cliente] : undefined);
  const pdfPath = archivio.filePath;
  console.log("pdfPath", pdfPath);
  console.log("fs.existsSync(pdfPath)", fsSync.existsSync(pdfPath));
  if (!archivio.exists) {
    return res.status(404).json({
      code: "PDF_NON_GENERATO",
      message: "PDF non trovato",
      filename: archivio.fileName,
    });
  }

  res.json({
    message: "PDF trovato.",
    pdfUrl: `/api/preventivi/${req.params.id}/pdf`,
    filename: archivio.fileName,
  });
}));

router.post("/:id/accetta", asyncHandler(async (req, res) => {
  const preventivoAggiornato = await repository.update(req.params.id, { stato: "Accettato" });
  if (!preventivoAggiornato) return res.status(404).json({ message: "Preventivo non trovato" });
  const preventivo = await getPreventivoCompleto(req.params.id);

  const cantiereEsistente = await query(
    "SELECT * FROM cantieri WHERE preventivo_id = $1 LIMIT 1",
    [preventivo.id],
  );

  if (cantiereEsistente.rows[0]) {
    return res.json({ preventivo: await getPreventivoCompleto(req.params.id), cantiere: cantiereEsistente.rows[0] });
  }

  const cantiere = await query(
    `INSERT INTO cantieri (preventivo_id, cliente_id, cliente_code, nome, cliente, importo, stato)
     VALUES ($1, $2, $3, $4, $5, $6, 'In Corso')
     RETURNING *`,
    [preventivo.id, preventivo.clienteId, preventivo.clienteCode || "", preventivo.descrizione, preventivo.cliente, preventivo.importo],
  );

  res.json({ preventivo: await getPreventivoCompleto(req.params.id), cantiere: cantiere.rows[0] });
}));

export default router;
