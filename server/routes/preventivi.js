import { Router } from "express";
import { query } from "../config/db.js";
import { createCrudRepository } from "../utils/crud.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const repository = createCrudRepository({
  table: "preventivi",
  allowedFields: ["clienteId", "numero", "data", "cliente", "cantiere", "descrizione", "importo", "stato"],
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

function normalizzaIvaAliquota(ivaAliquota) {
  const valore = Number(String(ivaAliquota ?? "").replace(",", "."));
  return Number.isFinite(valore) && valore >= 0 ? valore : 22;
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

  return result.rows.map(toCamel);
}

async function getPreventivoCompleto(id) {
  const preventivo = await repository.findById(id);
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
    const prezzoUnitario = Number(riga.prezzoUnitario || 0);
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
      valore === "" || valore === null || valore === undefined ? 0 : Number(valore || 0);
    const fattoreMisura = (valore) => (Number(valore || 0) === 0 ? 1 : Number(valore));
    const partiUguali = valoreMisuraSalvato(riga.partiUguali);
    const lunghezza = valoreMisuraSalvato(riga.lunghezza);
    const larghezza = valoreMisuraSalvato(riga.larghezza);
    const altezzaPeso = valoreMisuraSalvato(riga.altezzaPeso);
    const quantitaCalcolata =
      fattoreMisura(partiUguali) * fattoreMisura(lunghezza) * fattoreMisura(larghezza) * fattoreMisura(altezzaPeso);
    const quantita = Number(riga.quantita || quantitaCalcolata || 0);
    const prezzoUnitario = Number(riga.prezzoUnitario || 0);
    const sconto = Number(riga.sconto || 0);
    const totale = Number((quantita * prezzoUnitario * (1 - sconto / 100)).toFixed(2));
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
  const preventivi = await repository.findAll();
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
  const importo = righe.length
    ? righe.reduce((totale, riga) => {
        const quantita = Number(riga.quantita || 0);
        const prezzoUnitario = Number(riga.prezzoUnitario || 0);
        const sconto = Number(riga.sconto || 0);
        return totale + quantita * prezzoUnitario * (1 - sconto / 100);
      }, 0)
    : Number(req.body.importo || 0);

  const preventivo = await repository.create({
    ...req.body,
    ivaAliquota: undefined,
    importo: Number(importo.toFixed(2)),
  });

  await salvaIvaAliquota(preventivo.id, req.body.ivaAliquota);
  await salvaRighe(preventivo.id, righe);
  res.status(201).json(await getPreventivoCompleto(preventivo.id));
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const righe = Array.isArray(req.body.righe) ? req.body.righe : null;
  const payload = { ...req.body };
  const ivaAliquota = payload.ivaAliquota;
  delete payload.ivaAliquota;

  if (righe) {
    payload.importo = Number(
      righe
        .reduce((totale, riga) => {
          const quantita = Number(riga.quantita || 0);
          const prezzoUnitario = Number(riga.prezzoUnitario || 0);
          const sconto = Number(riga.sconto || 0);
          return totale + quantita * prezzoUnitario * (1 - sconto / 100);
        }, 0)
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

router.post("/:id/accetta", asyncHandler(async (req, res) => {
  const preventivo = await repository.update(req.params.id, { stato: "Accettato" });
  if (!preventivo) return res.status(404).json({ message: "Preventivo non trovato" });

  const cantiereEsistente = await query(
    "SELECT * FROM cantieri WHERE preventivo_id = $1 LIMIT 1",
    [preventivo.id],
  );

  if (cantiereEsistente.rows[0]) {
    return res.json({ preventivo: await getPreventivoCompleto(req.params.id), cantiere: cantiereEsistente.rows[0] });
  }

  const cantiere = await query(
    `INSERT INTO cantieri (preventivo_id, cliente_id, nome, cliente, importo, stato)
     VALUES ($1, $2, $3, $4, $5, 'In Corso')
     RETURNING *`,
    [preventivo.id, preventivo.clienteId, preventivo.descrizione, preventivo.cliente, preventivo.importo],
  );

  res.json({ preventivo: await getPreventivoCompleto(req.params.id), cantiere: cantiere.rows[0] });
}));

export default router;
