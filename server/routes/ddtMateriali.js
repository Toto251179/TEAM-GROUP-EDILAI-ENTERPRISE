import { Router } from "express";
import { pool, query } from "../config/db.js";
import { env } from "../config/env.js";

const router = Router();
let schemaReady = false;

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeVat(value) {
  return clean(value).replace(/\D/g, "");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = clean(value)
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function hasExplicitPrice(value) {
  return value !== null && value !== undefined && clean(value) !== "";
}

function isoDate(value) {
  const text = clean(value);
  if (!text) return new Date().toISOString().slice(0, 10);

  const italian = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (italian) {
    const year = italian[3].length === 2 ? "20" + italian[3] : italian[3];
    return year + "-" + italian[2].padStart(2, "0") + "-" + italian[1].padStart(2, "0");
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

async function ensureSchema() {
  if (schemaReady) return;

  await query("CREATE TABLE IF NOT EXISTS ddt_fornitori (id SERIAL PRIMARY KEY, ragione_sociale TEXT NOT NULL, partita_iva TEXT, indirizzo TEXT, email TEXT, telefono TEXT, categoria TEXT NOT NULL DEFAULT 'Materiali', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await query("CREATE UNIQUE INDEX IF NOT EXISTS ddt_fornitori_partita_iva_uidx ON ddt_fornitori (partita_iva) WHERE BTRIM(COALESCE(partita_iva, '')) <> ''");

  await query("CREATE TABLE IF NOT EXISTS ddt_articoli (id SERIAL PRIMARY KEY, fornitore_id INTEGER NOT NULL REFERENCES ddt_fornitori(id) ON DELETE CASCADE, codice_articolo TEXT, descrizione TEXT NOT NULL DEFAULT '', unita_misura TEXT NOT NULL DEFAULT '', ultimo_prezzo NUMERIC(14,4) NOT NULL DEFAULT 0, prezzo_aggiornato_al TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await query("CREATE UNIQUE INDEX IF NOT EXISTS ddt_articoli_fornitore_codice_uidx ON ddt_articoli (fornitore_id, LOWER(BTRIM(codice_articolo))) WHERE BTRIM(COALESCE(codice_articolo, '')) <> ''");

  await query("CREATE TABLE IF NOT EXISTS ddt_materiali (id SERIAL PRIMARY KEY, numero_ddt TEXT NOT NULL, data_ddt DATE NOT NULL DEFAULT CURRENT_DATE, fornitore_id INTEGER REFERENCES ddt_fornitori(id) ON DELETE SET NULL, fornitore_nome TEXT NOT NULL DEFAULT '', partita_iva TEXT, numero_chiamata TEXT, codice_progetto TEXT, id_cliente TEXT, cliente TEXT, preventivo_id TEXT, preventivo_numero TEXT, consuntivo_id TEXT, magazzino TEXT, allegato_nome TEXT, allegato_mime_type TEXT, allegato_data_url TEXT, stato TEXT NOT NULL DEFAULT 'REGISTRATO', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");

  await query("CREATE TABLE IF NOT EXISTS ddt_materiali_righe (id SERIAL PRIMARY KEY, ddt_id INTEGER NOT NULL REFERENCES ddt_materiali(id) ON DELETE CASCADE, articolo_id INTEGER REFERENCES ddt_articoli(id) ON DELETE SET NULL, codice_articolo TEXT, descrizione TEXT NOT NULL DEFAULT '', unita_misura TEXT NOT NULL DEFAULT '', quantita NUMERIC(14,4) NOT NULL DEFAULT 0, prezzo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0, totale NUMERIC(14,4) NOT NULL DEFAULT 0, prezzo_da_completare BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");

  schemaReady = true;
}

function outputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  return (response?.output || [])
    .flatMap((item) => item?.content || [])
    .filter((item) => item?.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function parseJson(text) {
  const cleaned = clean(text)
    .replace(/^\x60\x60\x60json\s*/i, "")
    .replace(/^\x60\x60\x60\s*/i, "")
    .replace(/\x60\x60\x60$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
    throw new Error("La lettura AI non ha restituito un JSON valido.");
  }
}

async function findSupplier(input) {
  const vat = normalizeVat(input.partitaIVA);
  if (vat) {
    const byVat = await query("SELECT * FROM ddt_fornitori WHERE partita_iva = $1 LIMIT 1", [vat]);
    if (byVat.rows[0]) return byVat.rows[0];
  }

  const name = normalize(input.ragioneSociale);
  if (name) {
    const byName = await query("SELECT * FROM ddt_fornitori WHERE LOWER(BTRIM(ragione_sociale)) = $1 LIMIT 1", [name]);
    if (byName.rows[0]) return byName.rows[0];
  }

  return null;
}

async function loadArticlesForSupplier(fornitoreId) {
  if (!fornitoreId) return [];
  const result = await query(
    "SELECT id, fornitore_id, codice_articolo, descrizione, unita_misura, ultimo_prezzo, prezzo_aggiornato_al, updated_at FROM ddt_articoli WHERE fornitore_id = $1 ORDER BY descrizione, codice_articolo",
    [fornitoreId],
  );
  return result.rows;
}

function enrichRows(rows, articles) {
  const byCode = new Map(
    articles.filter((item) => clean(item.codice_articolo)).map((item) => [normalize(item.codice_articolo), item]),
  );
  const byDescription = new Map(
    articles.filter((item) => clean(item.descrizione)).map((item) => [normalize(item.descrizione), item]),
  );

  return (Array.isArray(rows) ? rows : []).map((raw, index) => {
    const code = clean(raw.codiceArticolo ?? raw.codice_articolo ?? raw.codice ?? raw.articolo);
    const description = clean(raw.descrizione ?? raw.materiale ?? raw.descrizioneMerce);
    const known = (code && byCode.get(normalize(code))) || (description && byDescription.get(normalize(description))) || null;
    const explicit = hasExplicitPrice(raw.prezzoUnitario ?? raw.prezzo_unitario ?? raw.prezzo);
    const extractedPrice = explicit ? toNumber(raw.prezzoUnitario ?? raw.prezzo_unitario ?? raw.prezzo) : 0;
    const knownPrice = toNumber(known?.ultimo_prezzo);
    const price = explicit ? extractedPrice : knownPrice;
    const quantity = toNumber(raw.quantita ?? raw.qta ?? 0);

    return {
      id: raw.id || "riga-ai-" + (index + 1),
      articoloId: known?.id || null,
      articoloCensito: Boolean(known),
      codiceMateriale: code || clean(known?.codice_articolo),
      materiale: description || clean(known?.descrizione),
      unitaMisura: clean(raw.unitaMisura ?? raw.unita_misura ?? raw.um) || clean(known?.unita_misura),
      quantita: quantity,
      prezzoUnitario: price,
      totale: quantity * price,
      prezzoDaCompletare: !price,
      prezzoFonte: explicit ? "DDT" : knownPrice ? "ANAGRAFICA" : "MANCANTE",
    };
  });
}

async function analyzeWithOpenAI(input) {
  if (!env.openai?.apiKey) {
    const error = new Error("OPENAI_API_KEY non configurata sul server: la lettura AI di PDF e immagini non è disponibile.");
    error.status = 503;
    error.code = "OPENAI_NOT_CONFIGURED";
    throw error;
  }

  const prompt = [
    "Leggi questo Documento di Trasporto italiano e restituisci SOLO JSON valido, senza markdown.",
    "Schema obbligatorio:",
    '{"numeroDdt":"","dataDdt":"YYYY-MM-DD","fornitore":{"ragioneSociale":"","partitaIVA":"","indirizzo":"","email":"","telefono":""},"righe":[{"codiceArticolo":"","descrizione":"","unitaMisura":"","quantita":0,"prezzoUnitario":null}]}',
    "Regole:",
    "- estrai tutte le righe merce reali del DDT;",
    "- codiceArticolo = codice/articolo/referenza del fornitore;",
    "- descrizione = descrizione merce;",
    "- unitaMisura = U.M. riportata (PZ, KG, M, M2, M3, L, CAD, ecc.);",
    "- quantita deve essere numerica;",
    "- prezzoUnitario deve essere numerico SOLO se è realmente visibile nel DDT;",
    "- se il prezzo non compare, usa null: NON inventarlo;",
    "- non inserire subtotali, trasporto, imponibile, IVA o totale documento tra le righe merce;",
    "- se un dato non è leggibile lascialo vuoto/null, non dedurlo.",
  ].join("\n");

  const mime = clean(input.mimeType).toLowerCase();
  const content = [{ type: "input_text", text: prompt }];

  if (mime.startsWith("image/")) {
    content.push({ type: "input_image", image_url: input.dataUrl, detail: "high" });
  } else if (mime.startsWith("text/") || /\.(txt|csv)$/i.test(input.fileName)) {
    const encoded = String(input.dataUrl || "").split(",").pop() || "";
    const text = Buffer.from(encoded, "base64").toString("utf8");
    content.push({ type: "input_text", text: "\nCONTENUTO DDT:\n" + text });
  } else {
    const encoded = String(input.dataUrl || "").split(",").pop() || "";
    content.push({ type: "input_file", filename: input.fileName || "ddt.pdf", file_data: encoded });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.openai.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.openai.model,
      input: [{ role: "user", content }],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Errore OpenAI HTTP " + response.status);
    error.status = 502;
    error.code = "OPENAI_DDT_ANALYSIS_FAILED";
    throw error;
  }

  return parseJson(outputText(payload));
}

async function hydrateDdt(id) {
  const headerResult = await query(
    "SELECT d.*, f.ragione_sociale AS fornitore_db, f.partita_iva AS fornitore_piva, f.indirizzo AS fornitore_indirizzo, f.email AS fornitore_email, f.telefono AS fornitore_telefono FROM ddt_materiali d LEFT JOIN ddt_fornitori f ON f.id = d.fornitore_id WHERE d.id = $1",
    [id],
  );
  const ddt = headerResult.rows[0];
  if (!ddt) return null;

  const rowsResult = await query(
    "SELECT r.* FROM ddt_materiali_righe r WHERE r.ddt_id = $1 ORDER BY r.id",
    [id],
  );

  return {
    id: ddt.id,
    numeroDdt: ddt.numero_ddt,
    dataDdt: ddt.data_ddt,
    numeroChiamata: ddt.numero_chiamata || "",
    codiceProgetto: ddt.codice_progetto || "",
    idCliente: ddt.id_cliente || "",
    cliente: ddt.cliente || "Cliente da associare",
    preventivoId: ddt.preventivo_id || "",
    preventivoNumero: ddt.preventivo_numero || "",
    consuntivoId: ddt.consuntivo_id || "",
    magazzino: ddt.magazzino || "Da caricare",
    fornitore: ddt.fornitore_db || ddt.fornitore_nome || "",
    fornitoreDati: {
      ragioneSociale: ddt.fornitore_db || ddt.fornitore_nome || "",
      partitaIVA: ddt.fornitore_piva || ddt.partita_iva || "",
      indirizzo: ddt.fornitore_indirizzo || "",
      email: ddt.fornitore_email || "",
      telefono: ddt.fornitore_telefono || "",
    },
    allegato: ddt.allegato_nome
      ? { nomeFile: ddt.allegato_nome, tipo: ddt.allegato_mime_type || "", dataUrl: ddt.allegato_data_url || "" }
      : null,
    stato: ddt.stato,
    righe: rowsResult.rows.map((row) => ({
      id: row.id,
      articoloId: row.articolo_id,
      articoloCensito: Boolean(row.articolo_id),
      codiceMateriale: row.codice_articolo || "",
      materiale: row.descrizione || "",
      unitaMisura: row.unita_misura || "",
      quantita: Number(row.quantita || 0),
      prezzoUnitario: Number(row.prezzo_unitario || 0),
      totale: Number(row.totale || 0),
      prezzoDaCompletare: Boolean(row.prezzo_da_completare),
      prezzoFonte: row.prezzo_da_completare ? "MANCANTE" : "REGISTRATO",
    })),
    creatoIl: ddt.created_at,
  };
}

router.post("/analizza", async (req, res, next) => {
  try {
    await ensureSchema();
    const fileName = req.body?.fileName || "ddt";
    const mimeType = req.body?.mimeType || "";
    const dataUrl = req.body?.dataUrl || "";
    if (!dataUrl) {
      const error = new Error("File DDT mancante.");
      error.status = 400;
      throw error;
    }

    const extracted = await analyzeWithOpenAI({ fileName, mimeType, dataUrl });
    const supplierInput = {
      ragioneSociale: extracted?.fornitore?.ragioneSociale || extracted?.fornitore || "",
      partitaIVA: extracted?.fornitore?.partitaIVA || extracted?.partitaIVA || "",
    };
    const knownSupplier = await findSupplier(supplierInput);
    const articles = await loadArticlesForSupplier(knownSupplier?.id);
    const rows = enrichRows(extracted?.righe, articles);

    res.json({
      numeroDdt: clean(extracted?.numeroDdt),
      dataDdt: isoDate(extracted?.dataDdt),
      fornitore: knownSupplier?.ragione_sociale || supplierInput.ragioneSociale,
      fornitoreId: knownSupplier?.id || null,
      fornitoreCensito: Boolean(knownSupplier),
      fornitoreDati: {
        ragioneSociale: knownSupplier?.ragione_sociale || supplierInput.ragioneSociale,
        partitaIVA: knownSupplier?.partita_iva || normalizeVat(supplierInput.partitaIVA),
        indirizzo: knownSupplier?.indirizzo || extracted?.fornitore?.indirizzo || "",
        email: knownSupplier?.email || extracted?.fornitore?.email || "",
        telefono: knownSupplier?.telefono || extracted?.fornitore?.telefono || "",
        categoria: "Materiali",
      },
      righe: rows.length
        ? rows
        : [{
            id: "riga-vuota",
            codiceMateriale: "",
            materiale: "",
            unitaMisura: "",
            quantita: 1,
            prezzoUnitario: 0,
            totale: 0,
            prezzoDaCompletare: true,
            articoloCensito: false,
            prezzoFonte: "MANCANTE",
          }],
      stato: "BOZZA",
      letturaAi: {
        esito: "OK",
        messaggio: knownSupplier
          ? "DDT letto. Fornitore riconosciuto e articoli confrontati con l'anagrafica."
          : "DDT letto. Verifica il fornitore e le righe prima della registrazione.",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/articoli", async (req, res, next) => {
  try {
    await ensureSchema();
    const supplierId = Number(req.query.fornitoreId || 0);
    const search = clean(req.query.q);
    const params = [];
    const conditions = [];

    if (supplierId) {
      params.push(supplierId);
      conditions.push("a.fornitore_id = $" + params.length);
    }

    if (search) {
      params.push("%" + search + "%");
      conditions.push("(a.codice_articolo ILIKE $" + params.length + " OR a.descrizione ILIKE $" + params.length + " OR f.ragione_sociale ILIKE $" + params.length + ")");
    }

    const sql =
      'SELECT a.id, a.fornitore_id AS "fornitoreId", f.ragione_sociale AS "fornitoreAbituale", a.codice_articolo AS "codiceMateriale", a.descrizione, a.unita_misura AS "unitaMisura", a.ultimo_prezzo AS "ultimoPrezzo", a.prezzo_aggiornato_al AS "prezzoAggiornatoAl", a.updated_at AS "aggiornatoIl" FROM ddt_articoli a JOIN ddt_fornitori f ON f.id = a.fornitore_id ' +
      (conditions.length ? "WHERE " + conditions.join(" AND ") + " " : "") +
      "ORDER BY a.updated_at DESC, a.id DESC";

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    await ensureSchema();
    const idsResult = await query("SELECT id FROM ddt_materiali ORDER BY data_ddt DESC, id DESC");
    const documents = [];
    for (const row of idsResult.rows) {
      const document = await hydrateDdt(row.id);
      if (document) documents.push(document);
    }
    res.json(documents);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  const client = await pool.connect();

  try {
    await ensureSchema();
    await client.query("BEGIN");

    const body = req.body || {};
    const supplierData = body.fornitoreDati || {};
    const supplierName = clean(supplierData.ragioneSociale || body.fornitore);
    const supplierVat = normalizeVat(supplierData.partitaIVA || supplierData.partitaIva);

    if (!supplierName) {
      const error = new Error("Fornitore obbligatorio.");
      error.status = 400;
      throw error;
    }
    if (!clean(body.numeroDdt)) {
      const error = new Error("Numero DDT obbligatorio.");
      error.status = 400;
      throw error;
    }

    let supplier = null;

    if (supplierVat) {
      const found = await client.query("SELECT * FROM ddt_fornitori WHERE partita_iva = $1 LIMIT 1", [supplierVat]);
      supplier = found.rows[0] || null;
    }
    if (!supplier) {
      const found = await client.query("SELECT * FROM ddt_fornitori WHERE LOWER(BTRIM(ragione_sociale)) = $1 LIMIT 1", [normalize(supplierName)]);
      supplier = found.rows[0] || null;
    }

    if (supplier) {
      const updated = await client.query(
        "UPDATE ddt_fornitori SET ragione_sociale = COALESCE(NULLIF($2, ''), ragione_sociale), partita_iva = COALESCE(NULLIF($3, ''), partita_iva), indirizzo = COALESCE(NULLIF($4, ''), indirizzo), email = COALESCE(NULLIF($5, ''), email), telefono = COALESCE(NULLIF($6, ''), telefono), updated_at = NOW() WHERE id = $1 RETURNING *",
        [supplier.id, supplierName, supplierVat, clean(supplierData.indirizzo), clean(supplierData.email), clean(supplierData.telefono)],
      );
      supplier = updated.rows[0];
    } else {
      const inserted = await client.query(
        "INSERT INTO ddt_fornitori (ragione_sociale, partita_iva, indirizzo, email, telefono, categoria) VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6) RETURNING *",
        [supplierName, supplierVat, clean(supplierData.indirizzo), clean(supplierData.email), clean(supplierData.telefono), clean(supplierData.categoria) || "Materiali"],
      );
      supplier = inserted.rows[0];
    }

    const attachment = body.allegato || {};
    const header = await client.query(
      "INSERT INTO ddt_materiali (numero_ddt, data_ddt, fornitore_id, fornitore_nome, partita_iva, numero_chiamata, codice_progetto, id_cliente, cliente, preventivo_id, preventivo_numero, consuntivo_id, magazzino, allegato_nome, allegato_mime_type, allegato_data_url, stato) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'REGISTRATO') RETURNING id",
      [clean(body.numeroDdt), isoDate(body.dataDdt), supplier.id, supplier.ragione_sociale, supplier.partita_iva || supplierVat, clean(body.numeroChiamata), clean(body.codiceProgetto), clean(body.idCliente), clean(body.cliente), clean(body.preventivoId), clean(body.preventivoNumero), clean(body.consuntivoId), clean(body.magazzino), clean(attachment.nomeFile), clean(attachment.tipo), clean(attachment.dataUrl)],
    );

    const ddtId = header.rows[0].id;
    const rows = Array.isArray(body.righe) ? body.righe : [];

    for (const raw of rows) {
      const code = clean(raw.codiceMateriale || raw.codiceArticolo);
      const description = clean(raw.materiale || raw.descrizione);
      if (!code && !description) continue;

      const unit = clean(raw.unitaMisura || raw.um);
      const quantity = toNumber(raw.quantita);
      const incomingHasPrice = hasExplicitPrice(raw.prezzoUnitario) && toNumber(raw.prezzoUnitario) > 0;
      const incomingPrice = incomingHasPrice ? toNumber(raw.prezzoUnitario) : 0;

      let article = null;
      if (code) {
        const found = await client.query("SELECT * FROM ddt_articoli WHERE fornitore_id = $1 AND LOWER(BTRIM(codice_articolo)) = $2 LIMIT 1", [supplier.id, normalize(code)]);
        article = found.rows[0] || null;
      } else if (description) {
        const found = await client.query("SELECT * FROM ddt_articoli WHERE fornitore_id = $1 AND LOWER(BTRIM(descrizione)) = $2 ORDER BY id DESC LIMIT 1", [supplier.id, normalize(description)]);
        article = found.rows[0] || null;
      }

      if (article) {
        const updated = await client.query(
          "UPDATE ddt_articoli SET codice_articolo = COALESCE(NULLIF($2, ''), codice_articolo), descrizione = COALESCE(NULLIF($3, ''), descrizione), unita_misura = COALESCE(NULLIF($4, ''), unita_misura), ultimo_prezzo = CASE WHEN $5 > 0 THEN $5 ELSE ultimo_prezzo END, prezzo_aggiornato_al = CASE WHEN $5 > 0 THEN NOW() ELSE prezzo_aggiornato_al END, updated_at = NOW() WHERE id = $1 RETURNING *",
          [article.id, code, description, unit, incomingPrice],
        );
        article = updated.rows[0];
      } else {
        const inserted = await client.query(
          "INSERT INTO ddt_articoli (fornitore_id, codice_articolo, descrizione, unita_misura, ultimo_prezzo, prezzo_aggiornato_al) VALUES ($1, NULLIF($2, ''), $3, $4, $5, CASE WHEN $5 > 0 THEN NOW() ELSE NULL END) RETURNING *",
          [supplier.id, code, description, unit, incomingPrice],
        );
        article = inserted.rows[0];
      }

      const effectivePrice = incomingHasPrice ? incomingPrice : toNumber(article.ultimo_prezzo);
      const finalDescription = description || article.descrizione || "";
      const finalUnit = unit || article.unita_misura || "";
      const total = quantity * effectivePrice;

      await client.query(
        "INSERT INTO ddt_materiali_righe (ddt_id, articolo_id, codice_articolo, descrizione, unita_misura, quantita, prezzo_unitario, totale, prezzo_da_completare) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [ddtId, article.id, code || article.codice_articolo || "", finalDescription, finalUnit, quantity, effectivePrice, total, !effectivePrice],
      );
    }

    await client.query("COMMIT");
    res.status(201).json(await hydrateDdt(ddtId));
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await ensureSchema();
    const result = await query("DELETE FROM ddt_materiali WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: "DDT non trovato." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
