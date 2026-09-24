import { Router } from "express";
import { query } from "../config/db.js";
import { env } from "../config/env.js";

const router = Router();
let schemaReady = false;

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = clean(value)
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function outputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text;
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
    throw new Error("La risposta AI non contiene JSON valido.");
  }
}

async function ensureSchema() {
  if (schemaReady) return;

  await query("CREATE TABLE IF NOT EXISTS analisi_costi (id SERIAL PRIMARY KEY, titolo TEXT NOT NULL DEFAULT '', file_name TEXT, file_mime TEXT, file_data_url TEXT, cliente_id TEXT, cliente_nome TEXT, preventivo_id TEXT, cantiere_id TEXT, sede TEXT NOT NULL DEFAULT 'Vicenza (VI)', destinazione TEXT, costo_manodopera_ora NUMERIC(12,2) NOT NULL DEFAULT 28, spese_generali_pct NUMERIC(6,2) NOT NULL DEFAULT 20, margine_pct NUMERIC(6,2) NOT NULL DEFAULT 10, km_andata_ritorno NUMERIC(12,2) NOT NULL DEFAULT 0, numero_viaggi NUMERIC(12,2) NOT NULL DEFAULT 0, costo_km NUMERIC(12,4) NOT NULL DEFAULT 0, pedaggi NUMERIC(12,2) NOT NULL DEFAULT 0, pasti_pernotti NUMERIC(12,2) NOT NULL DEFAULT 0, stato TEXT NOT NULL DEFAULT 'BOZZA', revisione INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");

  await query("CREATE TABLE IF NOT EXISTS analisi_costi_voci (id SERIAL PRIMARY KEY, analisi_id INTEGER NOT NULL REFERENCES analisi_costi(id) ON DELETE CASCADE, ordine INTEGER NOT NULL DEFAULT 0, codice TEXT, descrizione TEXT NOT NULL DEFAULT '', unita TEXT, quantita NUMERIC(14,4) NOT NULL DEFAULT 0, prezzo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0, importo NUMERIC(14,2) NOT NULL DEFAULT 0, tipo_costo TEXT NOT NULL DEFAULT 'Da classificare', fonte TEXT, fonte_titolo TEXT, fonte_url TEXT, fonte_data TEXT, stato TEXT NOT NULL DEFAULT 'Da verificare', componenti JSONB NOT NULL DEFAULT '{}'::jsonb, cronoprogramma JSONB NOT NULL DEFAULT '{}'::jsonb, criticita JSONB NOT NULL DEFAULT '[]'::jsonb, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");

  await query("CREATE INDEX IF NOT EXISTS analisi_costi_voci_analisi_idx ON analisi_costi_voci (analisi_id)");
  await query("CREATE TABLE IF NOT EXISTS analisi_costi_revisioni (id SERIAL PRIMARY KEY, analisi_id INTEGER NOT NULL REFERENCES analisi_costi(id) ON DELETE CASCADE, revisione INTEGER NOT NULL DEFAULT 0, snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await query("CREATE INDEX IF NOT EXISTS analisi_costi_revisioni_analisi_idx ON analisi_costi_revisioni (analisi_id, revisione DESC)");
  await query("ALTER TABLE analisi_costi ADD COLUMN IF NOT EXISTS baseline JSONB NOT NULL DEFAULT '{}'::jsonb");
  await query("ALTER TABLE analisi_costi_voci ADD COLUMN IF NOT EXISTS controllo JSONB NOT NULL DEFAULT '{}'::jsonb");
  await query("CREATE TABLE IF NOT EXISTS analisi_costi_impegni (id SERIAL PRIMARY KEY, analisi_id INTEGER NOT NULL REFERENCES analisi_costi(id) ON DELETE CASCADE, wbs_codice TEXT, categoria TEXT NOT NULL DEFAULT 'Altro', fornitore TEXT, descrizione TEXT NOT NULL DEFAULT '', importo NUMERIC(14,2) NOT NULL DEFAULT 0, data DATE NOT NULL DEFAULT CURRENT_DATE, stato TEXT NOT NULL DEFAULT 'Impegnato', fonte TEXT NOT NULL DEFAULT 'Manuale', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await query("CREATE INDEX IF NOT EXISTS analisi_costi_impegni_analisi_idx ON analisi_costi_impegni (analisi_id, data DESC)");
  await query("CREATE TABLE IF NOT EXISTS analisi_costi_varianti (id SERIAL PRIMARY KEY, analisi_id INTEGER NOT NULL REFERENCES analisi_costi(id) ON DELETE CASCADE, codice TEXT, descrizione TEXT NOT NULL DEFAULT '', importo NUMERIC(14,2) NOT NULL DEFAULT 0, impatto_costi NUMERIC(14,2) NOT NULL DEFAULT 0, impatto_giorni NUMERIC(10,2) NOT NULL DEFAULT 0, stato TEXT NOT NULL DEFAULT 'Proposta', data DATE NOT NULL DEFAULT CURRENT_DATE, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await query("CREATE INDEX IF NOT EXISTS analisi_costi_varianti_analisi_idx ON analisi_costi_varianti (analisi_id, data DESC)");
  schemaReady = true;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeVoce(raw, index) {
  return {
    id: raw.id || null,
    ordine: Number(raw.ordine ?? index),
    codice: clean(raw.codice ?? raw.code),
    descrizione: clean(raw.descrizione ?? raw.description),
    unita: clean(raw.unita ?? raw.um ?? raw["U.M."]),
    quantita: toNumber(raw.quantita ?? raw.qta),
    prezzoUnitario: toNumber(raw.prezzoUnitario ?? raw.prezzo_unitario ?? raw.prezzo),
    importo: toNumber(raw.importo ?? raw.totale),
    tipoCosto: clean(raw.tipoCosto ?? raw.tipo_costo ?? raw.tipo) || "Da classificare",
    fonte: clean(raw.fonte),
    fonteTitolo: clean(raw.fonteTitolo ?? raw.fonte_titolo),
    fonteUrl: clean(raw.fonteUrl ?? raw.fonte_url),
    fonteData: clean(raw.fonteData ?? raw.fonte_data),
    stato: clean(raw.stato) || "Da verificare",
    componenti: raw.componenti || {},
    cronoprogramma: raw.cronoprogramma || {},
    criticita: safeArray(raw.criticita),
    controllo: {
      wbsCodice: raw.controllo?.wbsCodice || "WBS-" + String(index + 1).padStart(3, "0"),
      budgetOperativo: raw.controllo?.budgetOperativo ?? toNumber(raw.importo ?? raw.totale) ?? 0,
      avanzamentoPct: raw.controllo?.avanzamentoPct ?? 0,
      quantitaEseguita: raw.controllo?.quantitaEseguita ?? 0,
      oreReali: raw.controllo?.oreReali ?? 0,
      ...(raw.controllo && typeof raw.controllo === "object" ? raw.controllo : {}),
    },
    note: clean(raw.note),
  };
}

async function lookupLocalPrice(voce) {
  const codice = clean(voce.codice);
  const descrizione = clean(voce.descrizione);

  if (codice || descrizione) {
    const params = [];
    const where = [];
    if (codice) {
      params.push(codice);
      where.push("LOWER(BTRIM(codice)) = LOWER(BTRIM($" + params.length + "))");
    }
    if (descrizione) {
      params.push("%" + descrizione + "%");
      where.push("descrizione ILIKE $" + params.length);
    }

    const listino = await query(
      "SELECT codice, descrizione, unita, prezzo_unitario, note, updated_at FROM elenco_prezzi WHERE " +
        where.join(" OR ") +
        " ORDER BY CASE WHEN note ILIKE '%Regione Veneto%' THEN 0 WHEN note ILIKE '%TEAM GROUP%' THEN 1 ELSE 2 END, updated_at DESC LIMIT 1",
      params,
    );

    if (listino.rows[0]) {
      const row = listino.rows[0];
      return {
        prezzo: Number(row.prezzo_unitario || 0),
        fonte: row.note?.includes("Regione Veneto") ? "Regione Veneto" : "Elenco Prezzi",
        titolo: row.codice + " - " + row.descrizione,
        url: "",
        data: row.updated_at,
      };
    }

    try {
      const ddt = await query(
        "SELECT a.codice_articolo, a.descrizione, a.unita_misura, a.ultimo_prezzo, a.updated_at, f.ragione_sociale FROM ddt_articoli a JOIN ddt_fornitori f ON f.id = a.fornitore_id WHERE ($1 <> '' AND LOWER(BTRIM(a.codice_articolo)) = LOWER(BTRIM($1))) OR ($2 <> '' AND a.descrizione ILIKE $3) ORDER BY a.updated_at DESC LIMIT 1",
        [codice, descrizione, "%" + descrizione + "%"],
      );
      if (ddt.rows[0]) {
        const row = ddt.rows[0];
        return {
          prezzo: Number(row.ultimo_prezzo || 0),
          fonte: "DDT",
          titolo: row.ragione_sociale + " - " + row.descrizione,
          url: "",
          data: row.updated_at,
        };
      }
    } catch {
      // Tabelle DDT non ancora presenti: prosegui con le altre fonti.
    }
  }

  return null;
}

function fallbackAnalysis(voci, settings) {
  const costoOra = toNumber(settings.costoManodoperaOra) || 28;
  return voci.map((voce, index) => {
    const totale = voce.importo || voce.quantita * voce.prezzoUnitario;
    const tipo = normalize(voce.tipoCosto);
    const isLabor = tipo.includes("manodopera");
    const isRental = tipo.includes("nolegg") || tipo.includes("attrezz");
    const isOther = tipo.includes("altri") || tipo.includes("trasfer");

    const ore = isLabor ? Math.max(1, totale / costoOra) : 0;
    const componenti = {
      materiali: isLabor || isRental || isOther ? [] : [{ descrizione: voce.descrizione, quantita: voce.quantita, unita: voce.unita, prezzoUnitario: voce.prezzoUnitario, totale }],
      manodopera: isLabor ? [{ qualifica: "Operaio", persone: 1, ore, costoOra, totale }] : [],
      noleggi: isRental ? [{ descrizione: voce.descrizione, quantita: voce.quantita || 1, unita: voce.unita || "gg", prezzoUnitario: voce.prezzoUnitario, totale }] : [],
      mezzi: [],
      altri: isOther ? [{ descrizione: voce.descrizione, totale }] : [],
    };

    return {
      ...voce,
      ordine: index,
      componenti,
      cronoprogramma: {
        persone: isLabor ? 1 : 0,
        oreTotali: ore,
        giorni: isLabor ? Math.max(1, Math.ceil(ore / 8)) : 0,
        sequenza: index + 1,
      },
      criticita: voce.prezzoUnitario <= 0 ? ["Prezzo unitario mancante"] : [],
      stato: voce.prezzoUnitario > 0 ? "OK" : "Da verificare",
    };
  });
}

async function callOpenAIForDocument({ fileName, mimeType, dataUrl, textContent }) {
  if (!env.openai?.apiKey) {
    const error = new Error("OPENAI_API_KEY non configurata: per PDF, immagini e Word è necessaria la lettura AI.");
    error.status = 503;
    error.code = "OPENAI_NOT_CONFIGURED";
    throw error;
  }

  const instructions = [
    "Analizza il documento come computo metrico, preventivo, consuntivo o elenco lavorazioni.",
    "Restituisci SOLO JSON valido senza markdown con questo schema:",
    '{"titolo":"","cliente":"","cantiere":"","voci":[{"codice":"","descrizione":"","unita":"","quantita":0,"prezzoUnitario":0,"importo":0,"tipoCosto":"Materiali|Manodopera|Noleggi|Attrezzature|Mezzi/Trasferte|Sicurezza|Altri costi|Da classificare","stato":"OK|Da verificare"}]}',
    "Regole: estrai tutte le lavorazioni reali; non inventare prezzi o quantità mancanti; se un dato manca usa 0 o stringa vuota e stato Da verificare; mantieni descrizioni tecniche complete; classifica il tipo costo solo quando ragionevolmente certo.",
  ].join("\n");

  const content = [{ type: "input_text", text: instructions }];

  if (textContent) {
    content.push({ type: "input_text", text: "\nCONTENUTO DOCUMENTO:\n" + textContent });
  } else if (clean(mimeType).startsWith("image/")) {
    content.push({ type: "input_image", image_url: dataUrl, detail: "high" });
  } else {
    const fileItem = { type: "input_file", filename: fileName || "documento.pdf", file_data: dataUrl };
    if (/\.pdf$/i.test(fileName || "") || clean(mimeType).includes("pdf")) fileItem.detail = "high";
    content.push(fileItem);
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
    const error = new Error(payload?.error?.message || "Errore durante la lettura AI del documento.");
    error.status = 502;
    error.code = "OPENAI_ANALISI_DOCUMENTO_FAILED";
    throw error;
  }

  return parseJson(outputText(payload));
}

async function callOpenAIForCostAnalysis(voci, settings) {
  if (!env.openai?.apiKey) return null;

  const compact = voci.slice(0, 80).map((voce, index) => ({
    index,
    codice: voce.codice,
    descrizione: voce.descrizione,
    unita: voce.unita,
    quantita: voce.quantita,
    prezzoUnitario: voce.prezzoUnitario,
    importo: voce.importo,
    tipoCosto: voce.tipoCosto,
    fonteLocale: voce.fonte,
  }));

  const prompt = [
    "Sei un analista costi per edilizia e manutenzione in Italia.",
    "Sede aziendale: " + (settings.sede || "Vicenza (VI)") + ".",
    "Costo manodopera: " + (toNumber(settings.costoManodoperaOra) || 28) + " EUR/ora.",
    "Per ogni voce scomponi il costo in materiali, manodopera, noleggi, mezzi/trasferte e altri costi.",
    "Quando un prezzo locale è presente usalo come priorità. Per prezzi mancanti o dubbi usa la ricerca web e indica fonte, titolo, URL e data se disponibili.",
    "Non inventare valori puntuali quando non trovi una fonte: segnala la criticità.",
    "Restituisci SOLO JSON valido senza markdown con schema:",
    '{"voci":[{"index":0,"tipoCosto":"","prezzoUnitario":0,"fonte":"","fonteTitolo":"","fonteUrl":"","fonteData":"","componenti":{"materiali":[{"descrizione":"","quantita":0,"unita":"","prezzoUnitario":0,"totale":0,"fonte":""}],"manodopera":[{"qualifica":"","persone":0,"ore":0,"costoOra":0,"totale":0}],"noleggi":[{"descrizione":"","quantita":0,"unita":"","prezzoUnitario":0,"totale":0,"fonte":""}],"mezzi":[{"descrizione":"","km":0,"viaggi":0,"costoKm":0,"pedaggi":0,"totale":0}],"altri":[{"descrizione":"","totale":0}]},"cronoprogramma":{"persone":0,"oreTotali":0,"giorni":0,"sequenza":1},"criticita":[""],"stato":"OK|Da verificare"}]}',
    "VOCI:",
    JSON.stringify(compact),
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.openai.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.openai.model,
      tools: [{ type: "web_search" }],
      input: prompt,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Analisi costi AI non riuscita.");
    error.status = 502;
    error.code = "OPENAI_ANALISI_COSTI_FAILED";
    throw error;
  }

  return parseJson(outputText(payload));
}

router.post("/analizza-documento", async (req, res, next) => {
  try {
    await ensureSchema();
    const fileName = req.body?.fileName || "documento";
    const mimeType = req.body?.mimeType || "application/octet-stream";
    const dataUrl = req.body?.dataUrl || "";
    const textContent = req.body?.textContent || "";
    const rows = safeArray(req.body?.rows);

    if (rows.length) {
      const voci = rows.map(normalizeVoce).filter((voce) => voce.descrizione || voce.codice || voce.importo);
      return res.json({ titolo: fileName, cliente: "", cantiere: "", voci });
    }

    if (!dataUrl && !textContent) {
      const error = new Error("Documento mancante.");
      error.status = 400;
      throw error;
    }

    const result = await callOpenAIForDocument({ fileName, mimeType, dataUrl, textContent });
    const voci = safeArray(result.voci).map(normalizeVoce).filter((voce) => voce.descrizione || voce.codice || voce.importo);

    res.json({
      titolo: clean(result.titolo) || fileName,
      cliente: clean(result.cliente),
      cantiere: clean(result.cantiere),
      voci,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/analizza-voci", async (req, res, next) => {
  try {
    await ensureSchema();
    const settings = req.body?.settings || {};
    const inputVoci = safeArray(req.body?.voci).map(normalizeVoce);

    const enriched = [];
    for (const voce of inputVoci) {
      const local = await lookupLocalPrice(voce);
      enriched.push({
        ...voce,
        prezzoUnitario: voce.prezzoUnitario || local?.prezzo || 0,
        importo: voce.importo || voce.quantita * (voce.prezzoUnitario || local?.prezzo || 0),
        fonte: voce.fonte || local?.fonte || "",
        fonteTitolo: voce.fonteTitolo || local?.titolo || "",
        fonteUrl: voce.fonteUrl || local?.url || "",
        fonteData: voce.fonteData || local?.data || "",
      });
    }

    let analyzed = null;
    try {
      analyzed = await callOpenAIForCostAnalysis(enriched, settings);
    } catch (error) {
      if (error.code !== "OPENAI_NOT_CONFIGURED") throw error;
    }

    if (!analyzed?.voci?.length) {
      return res.json({ voci: fallbackAnalysis(enriched, settings), modalita: "locale" });
    }

    const byIndex = new Map(analyzed.voci.map((item) => [Number(item.index), item]));
    const finalVoci = enriched.map((voce, index) => {
      const ai = byIndex.get(index) || {};
      const prezzo = toNumber(ai.prezzoUnitario) || voce.prezzoUnitario;
      return {
        ...voce,
        tipoCosto: clean(ai.tipoCosto) || voce.tipoCosto,
        prezzoUnitario: prezzo,
        importo: voce.quantita * prezzo || voce.importo,
        fonte: clean(ai.fonte) || voce.fonte,
        fonteTitolo: clean(ai.fonteTitolo) || voce.fonteTitolo,
        fonteUrl: clean(ai.fonteUrl) || voce.fonteUrl,
        fonteData: clean(ai.fonteData) || voce.fonteData,
        componenti: ai.componenti || voce.componenti || {},
        cronoprogramma: ai.cronoprogramma || voce.cronoprogramma || {},
        criticita: safeArray(ai.criticita),
        stato: clean(ai.stato) || (prezzo > 0 ? "OK" : "Da verificare"),
      };
    });

    res.json({ voci: finalVoci, modalita: "ai-web" });
  } catch (error) {
    next(error);
  }
});

router.post("/distanza", async (req, res, next) => {
  try {
    const origine = clean(req.body?.origine) || "Vicenza, VI, Italia";
    const destinazione = clean(req.body?.destinazione);
    if (!destinazione) return res.json({ origine, destinazione, kmAndataRitorno: 0, durataMinuti: 0, modalita: "manuale" });

    if (!env.googleMaps?.apiKey) {
      return res.json({ origine, destinazione, kmAndataRitorno: 0, durataMinuti: 0, modalita: "manuale" });
    }

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.googleMaps.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { address: origine },
        destination: { address: destinazione },
        travelMode: "DRIVE",
      }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.routes?.[0]) {
      return res.json({ origine, destinazione, kmAndataRitorno: 0, durataMinuti: 0, modalita: "manuale" });
    }

    const route = payload.routes[0];
    const kmOneWay = Number(route.distanceMeters || 0) / 1000;
    const durationSeconds = Number(String(route.duration || "0s").replace("s", "")) || 0;

    res.json({
      origine,
      destinazione,
      kmAndataRitorno: Number((kmOneWay * 2).toFixed(1)),
      durataMinuti: Math.round(durationSeconds / 60),
      modalita: "google-routes",
    });
  } catch (error) {
    next(error);
  }
});

async function saveRows(analisiId, rows) {
  await query("DELETE FROM analisi_costi_voci WHERE analisi_id = $1", [analisiId]);

  for (const [index, raw] of rows.entries()) {
    const voce = normalizeVoce(raw, index);
    await query(
      "INSERT INTO analisi_costi_voci (analisi_id, ordine, codice, descrizione, unita, quantita, prezzo_unitario, importo, tipo_costo, fonte, fonte_titolo, fonte_url, fonte_data, stato, componenti, cronoprogramma, criticita, controllo, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19)",
      [
        analisiId,
        voce.ordine,
        voce.codice,
        voce.descrizione,
        voce.unita,
        voce.quantita,
        voce.prezzoUnitario,
        voce.importo,
        voce.tipoCosto,
        voce.fonte,
        voce.fonteTitolo,
        voce.fonteUrl,
        voce.fonteData,
        voce.stato,
        JSON.stringify(voce.componenti || {}),
        JSON.stringify(voce.cronoprogramma || {}),
        JSON.stringify(voce.criticita || []),
        JSON.stringify(voce.controllo || {}),
        voce.note,
      ],
    );
  }
}

async function hydrate(id) {
  const header = await query("SELECT * FROM analisi_costi WHERE id = $1", [id]);
  if (!header.rows[0]) return null;
  const rows = await query("SELECT * FROM analisi_costi_voci WHERE analisi_id = $1 ORDER BY ordine, id", [id]);

  const h = header.rows[0];
  return {
    id: h.id,
    titolo: h.titolo,
    fileName: h.file_name,
    fileMime: h.file_mime,
    fileDataUrl: h.file_data_url,
    clienteId: h.cliente_id,
    clienteNome: h.cliente_nome,
    preventivoId: h.preventivo_id,
    cantiereId: h.cantiere_id,
    sede: h.sede,
    destinazione: h.destinazione,
    costoManodoperaOra: Number(h.costo_manodopera_ora || 28),
    speseGeneraliPct: Number(h.spese_generali_pct || 20),
    marginePct: Number(h.margine_pct || 10),
    kmAndataRitorno: Number(h.km_andata_ritorno || 0),
    numeroViaggi: Number(h.numero_viaggi || 0),
    costoKm: Number(h.costo_km || 0),
    pedaggi: Number(h.pedaggi || 0),
    pastiPernotti: Number(h.pasti_pernotti || 0),
    stato: h.stato,
    revisione: h.revisione,
    baseline: h.baseline || {},
    createdAt: h.created_at,
    updatedAt: h.updated_at,
    voci: rows.rows.map((row) => ({
      id: row.id,
      ordine: row.ordine,
      codice: row.codice || "",
      descrizione: row.descrizione || "",
      unita: row.unita || "",
      quantita: Number(row.quantita || 0),
      prezzoUnitario: Number(row.prezzo_unitario || 0),
      importo: Number(row.importo || 0),
      tipoCosto: row.tipo_costo || "Da classificare",
      fonte: row.fonte || "",
      fonteTitolo: row.fonte_titolo || "",
      fonteUrl: row.fonte_url || "",
      fonteData: row.fonte_data || "",
      stato: row.stato || "Da verificare",
      componenti: row.componenti || {},
      cronoprogramma: row.cronoprogramma || {},
      criticita: row.criticita || [],
      controllo: row.controllo || {},
      note: row.note || "",
    })),
  };
}

async function saveRevision(analisiId) {
  const current = await hydrate(analisiId);
  if (!current) return;
  await query(
    "INSERT INTO analisi_costi_revisioni (analisi_id, revisione, snapshot) VALUES ($1,$2,$3::jsonb)",
    [analisiId, current.revisione || 0, JSON.stringify(current)],
  );
}

function monthKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 7);
}

function monthsBetween(startValue, endValue) {
  const start = startValue ? new Date(startValue) : new Date();
  const end = endValue ? new Date(endValue) : start;
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const result = [];
  const cursor = new Date(first);
  while (cursor <= last && result.length < 120) {
    result.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result.length ? result : [new Date().toISOString().slice(0, 7)];
}

function weightedProgress(voci, fallbackPct = 0) {
  const rows = safeArray(voci);
  const totalBudget = rows.reduce((tot, voce) => {
    const budget = toNumber(voce.controllo?.budgetOperativo) || toNumber(voce.importo);
    return tot + Math.max(0, budget);
  }, 0);
  if (!totalBudget) return Math.max(0, Math.min(100, toNumber(fallbackPct)));

  const earned = rows.reduce((tot, voce) => {
    const budget = toNumber(voce.controllo?.budgetOperativo) || toNumber(voce.importo);
    const progress = Math.max(0, Math.min(100, toNumber(voce.controllo?.avanzamentoPct ?? fallbackPct)));
    return tot + budget * progress / 100;
  }, 0);
  return Math.max(0, Math.min(100, earned / totalBudget * 100));
}

function plannedProgressFromDates(startValue, endValue) {
  if (!startValue || !endValue) return 0;
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.max(0, Math.min(100, (now - start) / (end - start) * 100));
}

function weightedPlannedProgress(voci, fallbackStart, fallbackEnd) {
  const rows = safeArray(voci);
  const totalBudget = rows.reduce((tot, voce) => {
    const budget = toNumber(voce.controllo?.budgetOperativo) || toNumber(voce.importo);
    return tot + Math.max(0, budget);
  }, 0);
  if (!totalBudget) return plannedProgressFromDates(fallbackStart, fallbackEnd);

  const plannedValuePct = rows.reduce((tot, voce) => {
    const budget = toNumber(voce.controllo?.budgetOperativo) || toNumber(voce.importo);
    const start = voce.controllo?.dataInizioPrevista || fallbackStart;
    const end = voce.controllo?.dataFinePrevista || fallbackEnd;
    const pct = plannedProgressFromDates(start, end);
    return tot + budget * pct;
  }, 0);

  return Math.max(0, Math.min(100, plannedValuePct / totalBudget));
}

async function getEnterpriseDashboard(item) {
  let cantiere = null;
  let movimenti = [];
  let ordini = [];
  let rapportini = [];
  let salRows = [];
  let magazzino = [];

  if (item.cantiereId) {
    const [cantiereDb, movimentiDb, ordiniDb, rapportiniDb, salDb] = await Promise.all([
      query("SELECT id, nome, data_inizio, data_fine_prevista, importo, stato FROM cantieri WHERE id::text = $1::text LIMIT 1", [String(item.cantiereId)]),
      query("SELECT id, data, tipo, categoria, descrizione, importo FROM movimenti_contabili WHERE cantiere_id::text = $1::text ORDER BY data ASC, id ASC", [String(item.cantiereId)]),
      query("SELECT id, numero, data, fornitore, materiale, quantita, importo, stato FROM ordini_materiali WHERE cantiere_id::text = $1::text ORDER BY data ASC, id ASC", [String(item.cantiereId)]),
      query("SELECT id, data, ore, operai, attivita, materiali, mezzi FROM rapportini WHERE cantiere_id::text = $1::text ORDER BY data ASC, id ASC", [String(item.cantiereId)]),
      query("SELECT id, data, percentuale, maturato, residuo FROM sal WHERE cantiere_id::text = $1::text ORDER BY data ASC, id ASC", [String(item.cantiereId)]),
    ]);
    cantiere = cantiereDb.rows[0] || null;
    movimenti = movimentiDb.rows;
    ordini = ordiniDb.rows;
    rapportini = rapportiniDb.rows;
    salRows = salDb.rows;
  }

  try {
    const stock = await query("SELECT id, codice, descrizione, unita, quantita, costo, scorta_minima FROM materiali_magazzino ORDER BY descrizione");
    magazzino = stock.rows;
  } catch {
    magazzino = [];
  }

  const manualCommitments = await query(
    "SELECT id, wbs_codice, categoria, fornitore, descrizione, importo, data, stato, fonte FROM analisi_costi_impegni WHERE analisi_id = $1 ORDER BY data ASC, id ASC",
    [item.id],
  );
  const variationsDb = await query(
    "SELECT id, codice, descrizione, importo, impatto_costi, impatto_giorni, stato, data, note FROM analisi_costi_varianti WHERE analisi_id = $1 ORDER BY data ASC, id ASC",
    [item.id],
  );

  const budgetBase = item.voci.reduce((tot, voce) => {
    const budget = toNumber(voce.controllo?.budgetOperativo) || toNumber(voce.importo);
    return tot + Math.max(0, budget);
  }, 0);

  const variantiApprovate = variationsDb.rows.filter((row) => normalize(row.stato) === "approvata");
  const variazioniApprovate = variantiApprovate.reduce(
    (tot, row) => tot + toNumber(row.impatto_costi || row.importo),
    0,
  );
  const ricavoVariantiApprovate = variantiApprovate.reduce(
    (tot, row) => tot + toNumber(row.importo),
    0,
  );

  const baselineBudget = toNumber(item.baseline?.budgetBase || item.baseline?.budgetAutorizzato);
  const budgetAutorizzato = budgetBase + variazioniApprovate;
  const costoReale = movimenti
    .filter((row) => normalize(row.tipo) === "uscita")
    .reduce((tot, row) => tot + toNumber(row.importo), 0);

  const impegniOrdini = ordini
    .filter((row) => !["annullato", "annullata", "cancellato"].includes(normalize(row.stato)))
    .reduce((tot, row) => tot + toNumber(row.importo), 0);
  const impegniManuali = manualCommitments.rows
    .filter((row) => !["annullato", "annullata", "cancellato"].includes(normalize(row.stato)))
    .reduce((tot, row) => tot + toNumber(row.importo), 0);
  const impegnato = impegniOrdini + impegniManuali;

  const oreReali = rapportini.reduce((tot, row) => tot + toNumber(row.ore), 0);
  const costoManodoperaRealeStimato = oreReali * toNumber(item.costoManodoperaOra || 28);

  const latestSal = salRows.length ? salRows[salRows.length - 1] : null;
  const salPct = toNumber(latestSal?.percentuale);
  const avanzamentoPct = weightedProgress(item.voci, salPct);
  const plannedPct = weightedPlannedProgress(item.voci, cantiere?.data_inizio, cantiere?.data_fine_prevista);

  const earnedValue = budgetAutorizzato * avanzamentoPct / 100;
  const plannedValue = budgetAutorizzato * plannedPct / 100;
  const actualCost = costoReale;
  const cpi = actualCost > 0 ? earnedValue / actualCost : 0;
  const spi = plannedValue > 0 ? earnedValue / plannedValue : 0;
  const eacDaCpi = cpi > 0 ? budgetAutorizzato / cpi : actualCost + Math.max(0, budgetAutorizzato - earnedValue);
  const residuoBudget = Math.max(0, budgetAutorizzato - earnedValue);
  const impegniNonCoperti = Math.max(0, impegnato - actualCost);
  const etc = Math.max(0, eacDaCpi - actualCost, residuoBudget, impegniNonCoperti);
  const eac = actualCost + etc;
  const vac = budgetAutorizzato - eac;

  const ricavo = item.preventivoId
    ? await query("SELECT imponibile, totale FROM preventivi WHERE id::text = $1::text LIMIT 1", [String(item.preventivoId)])
    : { rows: [] };
  const ricavoContrattualeBase = toNumber(ricavo.rows[0]?.imponibile || ricavo.rows[0]?.totale);
  const ricavoContrattuale = ricavoContrattualeBase + ricavoVariantiApprovate;

  const datedRows = item.voci.filter(
    (voce) => voce.controllo?.dataInizioPrevista && voce.controllo?.dataFinePrevista,
  );
  const dateCandidates = datedRows.flatMap((voce) => [
    voce.controllo.dataInizioPrevista,
    voce.controllo.dataFinePrevista,
  ]);
  const globalStart = cantiere?.data_inizio || dateCandidates.sort()[0] || new Date().toISOString().slice(0, 10);
  const globalEnd = cantiere?.data_fine_prevista || dateCandidates.sort().slice(-1)[0] || globalStart;
  const months = monthsBetween(globalStart, globalEnd);
  const undatedBudget = item.voci
    .filter((voce) => !(voce.controllo?.dataInizioPrevista && voce.controllo?.dataFinePrevista))
    .reduce((tot, voce) => tot + (toNumber(voce.controllo?.budgetOperativo) || toNumber(voce.importo)), 0);
  const undatedPerMonth = months.length ? undatedBudget / months.length : undatedBudget;

  const cashflow = months.map((month) => {
    const plannedDated = datedRows.reduce((tot, voce) => {
      const voceMonths = monthsBetween(voce.controllo.dataInizioPrevista, voce.controllo.dataFinePrevista);
      if (!voceMonths.includes(month)) return tot;
      const budget = toNumber(voce.controllo?.budgetOperativo) || toNumber(voce.importo);
      return tot + (voceMonths.length ? budget / voceMonths.length : budget);
    }, 0);
    const planned = plannedDated + undatedPerMonth;

    const actual = movimenti
      .filter((row) => normalize(row.tipo) === "uscita" && monthKey(row.data) === month)
      .reduce((tot, row) => tot + toNumber(row.importo), 0);
    const committed = ordini
      .filter((row) => monthKey(row.data) === month)
      .reduce((tot, row) => tot + toNumber(row.importo), 0) +
      manualCommitments.rows
        .filter((row) => monthKey(row.data) === month)
        .reduce((tot, row) => tot + toNumber(row.importo), 0);
    return {
      mese: month,
      previsto: planned,
      consuntivo: actual,
      impegnato: committed,
      scostamento: actual - planned,
    };
  });

  const needsMap = new Map();
  for (const voce of item.voci) {
    for (const materiale of safeArray(voce.componenti?.materiali)) {
      const codice = clean(materiale.codice || materiale.codiceArticolo);
      const descrizione = clean(materiale.descrizione);
      const key = normalize(codice || descrizione);
      if (!key) continue;
      const current = needsMap.get(key) || {
        codice,
        descrizione,
        unita: clean(materiale.unita),
        richiesto: 0,
      };
      current.richiesto += toNumber(materiale.quantita);
      needsMap.set(key, current);
    }
  }

  const fabbisogni = Array.from(needsMap.values()).map((need) => {
    const stock = magazzino.find((item) =>
      (need.codice && normalize(item.codice) === normalize(need.codice)) ||
      (!need.codice && normalize(item.descrizione) === normalize(need.descrizione))
    );
    const disponibile = toNumber(stock?.quantita);
    return {
      ...need,
      disponibile,
      daOrdinare: Math.max(0, need.richiesto - disponibile),
      costoUnitarioMagazzino: toNumber(stock?.costo),
      valoreDaOrdinare: Math.max(0, need.richiesto - disponibile) * toNumber(stock?.costo),
    };
  });

  const oreRealiWbs = item.voci.reduce((tot, voce) => tot + toNumber(voce.controllo?.oreReali), 0);
  const oreEffettive = oreRealiWbs > 0 ? oreRealiWbs : oreReali;
  const produttivitaRighe = item.voci.map((voce) => {
    const qPrevista = toNumber(voce.quantita);
    const qEseguita = toNumber(voce.controllo?.quantitaEseguita);
    const orePreviste = toNumber(voce.cronoprogramma?.oreTotali);
    const oreRigaReali = toNumber(voce.controllo?.oreReali);
    const resaPrevista = qPrevista > 0 && orePreviste > 0 ? qPrevista / orePreviste : 0;
    const resaReale = qEseguita > 0 && oreRigaReali > 0 ? qEseguita / oreRigaReali : 0;
    return {
      wbsCodice: voce.controllo?.wbsCodice || "",
      descrizione: voce.descrizione,
      unita: voce.unita,
      quantitaPrevista: qPrevista,
      quantitaEseguita: qEseguita,
      orePreviste,
      oreReali: oreRigaReali,
      resaPrevista,
      resaReale,
      scostamentoResaPct: resaPrevista > 0 && resaReale > 0 ? (resaReale / resaPrevista - 1) * 100 : 0,
    };
  });

  const produttivita = {
    oreReali: oreEffettive,
    oreRealiRapportini: oreReali,
    oreRealiWbs,
    costoManodoperaRealeStimato: oreEffettive * toNumber(item.costoManodoperaOra || 28),
    righe: produttivitaRighe,
  };

  return {
    cantiere,
    kpi: {
      baselineBudget,
      budgetBase,
      variazioniApprovate,
      ricavoVariantiApprovate,
      budgetAutorizzato,
      impegnato,
      costoReale,
      etc,
      eac,
      vac,
      ricavoContrattuale,
      marginePrevisto: ricavoContrattuale - eac,
      avanzamentoPct,
      plannedPct,
      earnedValue,
      plannedValue,
      cpi,
      spi,
      oreReali,
      costoManodoperaRealeStimato,
    },
    cashflow,
    fabbisogni,
    produttivita,
    ordini,
    impegni: manualCommitments.rows,
    varianti: variationsDb.rows,
    movimenti,
    rapportini,
    sal: salRows,
  };
}

router.post("/:id/baseline", async (req, res, next) => {
  try {
    await ensureSchema();
    const item = await hydrate(req.params.id);
    if (!item) return res.status(404).json({ message: "Analisi costi non trovata." });
    const dashboard = await getEnterpriseDashboard(item);
    const snapshot = {
      impostataIl: new Date().toISOString(),
      revisione: item.revisione || 0,
      budgetBase: dashboard.kpi.budgetBase,
      budgetAutorizzato: dashboard.kpi.budgetAutorizzato,
      voci: item.voci.map((voce) => ({
        wbsCodice: voce.controllo?.wbsCodice || "",
        descrizione: voce.descrizione,
        budgetOperativo: toNumber(voce.controllo?.budgetOperativo) || toNumber(voce.importo),
        quantita: toNumber(voce.quantita),
      })),
    };
    await query("UPDATE analisi_costi SET baseline = $2::jsonb, updated_at = NOW() WHERE id = $1", [req.params.id, JSON.stringify(snapshot)]);
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

router.get("/portfolio/commesse", async (_req, res, next) => {
  try {
    await ensureSchema();
    const ids = await query("SELECT id FROM analisi_costi ORDER BY updated_at DESC, id DESC LIMIT 100");
    const portfolio = [];
    for (const row of ids.rows) {
      const item = await hydrate(row.id);
      if (!item) continue;
      const dashboard = await getEnterpriseDashboard(item);
      portfolio.push({
        id: item.id,
        titolo: item.titolo,
        clienteNome: item.clienteNome,
        cantiereId: item.cantiereId,
        stato: item.stato,
        revisione: item.revisione,
        kpi: dashboard.kpi,
      });
    }
    res.json(portfolio);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/dashboard", async (req, res, next) => {
  try {
    await ensureSchema();
    const item = await hydrate(req.params.id);
    if (!item) return res.status(404).json({ message: "Analisi costi non trovata." });
    res.json(await getEnterpriseDashboard(item));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/impegni", async (req, res, next) => {
  try {
    await ensureSchema();
    const result = await query(
      "SELECT id, wbs_codice, categoria, fornitore, descrizione, importo, data, stato, fonte FROM analisi_costi_impegni WHERE analisi_id = $1 ORDER BY data DESC, id DESC",
      [req.params.id],
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/impegni", async (req, res, next) => {
  try {
    await ensureSchema();
    const body = req.body || {};
    const result = await query(
      "INSERT INTO analisi_costi_impegni (analisi_id, wbs_codice, categoria, fornitore, descrizione, importo, data, stato, fonte) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [
        req.params.id,
        clean(body.wbsCodice),
        clean(body.categoria) || "Altro",
        clean(body.fornitore),
        clean(body.descrizione),
        toNumber(body.importo),
        clean(body.data) || new Date().toISOString().slice(0, 10),
        clean(body.stato) || "Impegnato",
        clean(body.fonte) || "Manuale",
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/impegni/:impegnoId", async (req, res, next) => {
  try {
    await ensureSchema();
    await query("DELETE FROM analisi_costi_impegni WHERE id = $1 AND analisi_id = $2", [req.params.impegnoId, req.params.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/:id/varianti", async (req, res, next) => {
  try {
    await ensureSchema();
    const result = await query(
      "SELECT id, codice, descrizione, importo, impatto_costi, impatto_giorni, stato, data, note FROM analisi_costi_varianti WHERE analisi_id = $1 ORDER BY data DESC, id DESC",
      [req.params.id],
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/varianti", async (req, res, next) => {
  try {
    await ensureSchema();
    const body = req.body || {};
    const result = await query(
      "INSERT INTO analisi_costi_varianti (analisi_id, codice, descrizione, importo, impatto_costi, impatto_giorni, stato, data, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [
        req.params.id,
        clean(body.codice),
        clean(body.descrizione),
        toNumber(body.importo),
        toNumber(body.impattoCosti ?? body.importo),
        toNumber(body.impattoGiorni),
        clean(body.stato) || "Proposta",
        clean(body.data) || new Date().toISOString().slice(0, 10),
        clean(body.note),
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put("/:id/varianti/:varianteId", async (req, res, next) => {
  try {
    await ensureSchema();
    const body = req.body || {};
    const result = await query(
      "UPDATE analisi_costi_varianti SET codice=$3, descrizione=$4, importo=$5, impatto_costi=$6, impatto_giorni=$7, stato=$8, data=$9, note=$10, updated_at=NOW() WHERE id=$1 AND analisi_id=$2 RETURNING *",
      [
        req.params.varianteId,
        req.params.id,
        clean(body.codice),
        clean(body.descrizione),
        toNumber(body.importo),
        toNumber(body.impattoCosti ?? body.importo),
        toNumber(body.impattoGiorni),
        clean(body.stato) || "Proposta",
        clean(body.data) || new Date().toISOString().slice(0, 10),
        clean(body.note),
      ],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Variante non trovata." });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id/varianti/:varianteId", async (req, res, next) => {
  try {
    await ensureSchema();
    await query("DELETE FROM analisi_costi_varianti WHERE id = $1 AND analisi_id = $2", [req.params.varianteId, req.params.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/:id/revisioni", async (req, res, next) => {
  try {
    await ensureSchema();
    const result = await query(
      "SELECT id, analisi_id, revisione, snapshot, created_at FROM analisi_costi_revisioni WHERE analisi_id = $1 ORDER BY revisione DESC, id DESC",
      [req.params.id],
    );
    res.json(result.rows.map((row) => ({
      id: row.id,
      analisiId: row.analisi_id,
      revisione: row.revisione,
      snapshot: row.snapshot,
      createdAt: row.created_at,
    })));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/confronto", async (req, res, next) => {
  try {
    await ensureSchema();
    const item = await hydrate(req.params.id);
    if (!item) return res.status(404).json({ message: "Analisi costi non trovata." });

    let preventivo = null;
    if (item.preventivoId) {
      const result = await query(
        "SELECT id, numero, imponibile, totale, stato FROM preventivi WHERE id::text = $1::text LIMIT 1",
        [String(item.preventivoId)],
      );
      preventivo = result.rows[0] || null;
    }

    let costoReale = 0;
    let movimenti = [];
    if (item.cantiereId) {
      const result = await query(
        "SELECT id, data, categoria, descrizione, importo FROM movimenti_contabili WHERE cantiere_id::text = $1::text AND LOWER(tipo) = 'uscita' ORDER BY data DESC, id DESC",
        [String(item.cantiereId)],
      );
      movimenti = result.rows;
      costoReale = result.rows.reduce((tot, row) => tot + Number(row.importo || 0), 0);
    }

    const costoPreventivato = item.voci.reduce((tot, voce) => tot + Number(voce.importo || 0), 0);
    const ricavoPreventivo = Number(preventivo?.imponibile || preventivo?.totale || 0);

    res.json({
      costoPreventivato,
      costoReale,
      scostamentoCosto: costoReale - costoPreventivato,
      ricavoPreventivo,
      margineReale: ricavoPreventivo - costoReale,
      preventivo,
      movimenti,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    await ensureSchema();
    const result = await query("SELECT id, titolo, file_name, cliente_nome, sede, destinazione, stato, revisione, created_at, updated_at FROM analisi_costi ORDER BY updated_at DESC, id DESC");
    res.json(result.rows.map((row) => ({
      id: row.id,
      titolo: row.titolo,
      fileName: row.file_name,
      clienteNome: row.cliente_nome,
      sede: row.sede,
      destinazione: row.destinazione,
      stato: row.stato,
      revisione: row.revisione,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    await ensureSchema();
    const item = await hydrate(req.params.id);
    if (!item) return res.status(404).json({ message: "Analisi costi non trovata." });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    await ensureSchema();
    const body = req.body || {};
    const result = await query(
      "INSERT INTO analisi_costi (titolo, file_name, file_mime, file_data_url, cliente_id, cliente_nome, preventivo_id, cantiere_id, sede, destinazione, costo_manodopera_ora, spese_generali_pct, margine_pct, km_andata_ritorno, numero_viaggi, costo_km, pedaggi, pasti_pernotti, stato, revisione) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0) RETURNING id",
      [
        clean(body.titolo) || clean(body.fileName) || "Analisi costi",
        clean(body.fileName),
        clean(body.fileMime),
        clean(body.fileDataUrl),
        body.clienteId || null,
        clean(body.clienteNome),
        body.preventivoId || null,
        body.cantiereId || null,
        clean(body.sede) || "Vicenza (VI)",
        clean(body.destinazione),
        toNumber(body.costoManodoperaOra) || 28,
        toNumber(body.speseGeneraliPct) || 20,
        toNumber(body.marginePct),
        toNumber(body.kmAndataRitorno),
        toNumber(body.numeroViaggi),
        toNumber(body.costoKm),
        toNumber(body.pedaggi),
        toNumber(body.pastiPernotti),
        clean(body.stato) || "BOZZA",
      ],
    );
    await saveRows(result.rows[0].id, safeArray(body.voci));
    await saveRevision(result.rows[0].id);
    res.status(201).json(await hydrate(result.rows[0].id));
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    await ensureSchema();
    const body = req.body || {};
    const updated = await query(
      "UPDATE analisi_costi SET titolo=$2, file_name=$3, file_mime=$4, file_data_url=COALESCE(NULLIF($5,''),file_data_url), cliente_id=$6, cliente_nome=$7, preventivo_id=$8, cantiere_id=$9, sede=$10, destinazione=$11, costo_manodopera_ora=$12, spese_generali_pct=$13, margine_pct=$14, km_andata_ritorno=$15, numero_viaggi=$16, costo_km=$17, pedaggi=$18, pasti_pernotti=$19, stato=$20, revisione=revisione+1, updated_at=NOW() WHERE id=$1 RETURNING id",
      [
        req.params.id,
        clean(body.titolo) || clean(body.fileName) || "Analisi costi",
        clean(body.fileName),
        clean(body.fileMime),
        clean(body.fileDataUrl),
        body.clienteId || null,
        clean(body.clienteNome),
        body.preventivoId || null,
        body.cantiereId || null,
        clean(body.sede) || "Vicenza (VI)",
        clean(body.destinazione),
        toNumber(body.costoManodoperaOra) || 28,
        toNumber(body.speseGeneraliPct) || 20,
        toNumber(body.marginePct),
        toNumber(body.kmAndataRitorno),
        toNumber(body.numeroViaggi),
        toNumber(body.costoKm),
        toNumber(body.pedaggi),
        toNumber(body.pastiPernotti),
        clean(body.stato) || "BOZZA",
      ],
    );
    if (!updated.rows[0]) return res.status(404).json({ message: "Analisi costi non trovata." });
    await saveRows(req.params.id, safeArray(body.voci));
    await saveRevision(req.params.id);
    res.json(await hydrate(req.params.id));
  } catch (error) {
    next(error);
  }
});

export default router;
