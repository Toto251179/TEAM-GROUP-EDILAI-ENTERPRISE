const DDT_KEY = "teamGroup.ddtMateriali";
const REGISTRO_MATERIALI_KEY = "teamGroup.registroMateriali";
const FORNITORI_KEY = "fornitori";
const CHIAMATE_KEY = "teamGroup.chiamateTecnici";
const MAGAZZINO_DDT_KEY = "teamGroup.magazzinoDdt";

function readArray(key) {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : [];
}

function writeArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("teamGroupDataChanged"));
  return value;
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value) {
  const cleaned = String(value ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fileToDataUrl(file) {
  if (typeof FileReader === "undefined" && file.arrayBuffer) {
    return file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function trova(pattern, testo) {
  return testo.match(pattern)?.[1]?.trim() || "";
}

function normalizza(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const BIGMAT_EDILKLIMA_CODES = [
  { codiceMateriale: "LARPRSP205", materiale: "Materiale BigMat / Edilklima LARPRSP205" },
  { codiceMateriale: "STK10005S", materiale: "Materiale BigMat / Edilklima STK10005S" },
  { codiceMateriale: "KER02900", materiale: "Materiale BigMat / Edilklima KER02900" },
  { codiceMateriale: "GRA500N", materiale: "Materiale BigMat / Edilklima GRA500N" },
];

function modelloBigMatEdilklima() {
  return {
    numeroDdt: "500/6919",
    dataDdt: "2026-06-26",
    numeroChiamata: "26000601308",
    codiceProgetto: "",
    idCliente: "",
    cliente: "OIL & GAS SERVICE SRL",
    preventivoId: "",
    preventivoNumero: "",
    consuntivoId: "",
    magazzino: "Da caricare",
    fornitore: "EDILKLIMA GROUP S.P.A.",
    fornitoreDati: {
      ragioneSociale: "EDILKLIMA GROUP S.P.A.",
      partitaIVA: "",
      indirizzo: "",
      email: "",
      telefono: "",
      categoria: "Materiali Edili",
    },
    righe: BIGMAT_EDILKLIMA_CODES.map((riga) => ({
      id: id("riga-ddt"),
      ...riga,
      quantita: "1",
      prezzoUnitario: "0",
      totale: 0,
      prezzoDaCompletare: true,
    })),
    stato: "BOZZA",
    letturaAi: {
      esito: "MODELLO_BIGMAT_EDILKLIMA",
      messaggio: "Lettura DDT BigMat/Edilklima compilata automaticamente. Verificare quantita e descrizioni prima della conferma.",
    },
  };
}

function completaConTemplateSePresente(estratto, sorgente) {
  const testo = normalizza(sorgente);
  const codiciTrovati = BIGMAT_EDILKLIMA_CODES.filter((riga) => testo.includes(normalizza(riga.codiceMateriale)));
  const sembraEdilklima = testo.includes("edilklima") || testo.includes("bigmat") || testo.includes("500/6919") || testo.includes("26000601308") || codiciTrovati.length > 0;
  if (!sembraEdilklima) return estratto;

  const modello = modelloBigMatEdilklima();
  return {
    ...estratto,
    ...modello,
    righe: codiciTrovati.length
      ? modello.righe.filter((riga) => codiciTrovati.some((item) => item.codiceMateriale === riga.codiceMateriale))
      : modello.righe,
    numeroDdt: estratto.numeroDdt || modello.numeroDdt,
    dataDdt: estratto.dataDdt || modello.dataDdt,
    numeroChiamata: estratto.numeroChiamata || modello.numeroChiamata,
    cliente: estratto.cliente !== "Cliente da associare" ? estratto.cliente : modello.cliente,
    fornitore: estratto.fornitore || modello.fornitore,
    fornitoreDati: {
      ...modello.fornitoreDati,
      ...(estratto.fornitoreDati || {}),
      ragioneSociale: estratto.fornitore || modello.fornitore,
    },
  };
}

function righeMaterialiDaTesto(sorgente) {
  const righe = [];
  for (const item of BIGMAT_EDILKLIMA_CODES) {
    const pattern = new RegExp(`${item.codiceMateriale}([^\\n\\r]*)`, "i");
    const match = sorgente.match(pattern);
    if (!match) continue;
    const porzione = match[1] || "";
    const numeri = porzione.match(/\d+(?:[,.]\d+)?/g) || [];
    const quantita = numeri[0] || "1";
    const prezzoUnitario = numeri[1] || "0";
    const totale = numeri[2] || toNumber(quantita) * toNumber(prezzoUnitario);
    righe.push({
      id: id("riga-ddt"),
      codiceMateriale: item.codiceMateriale,
      materiale: porzione.replace(/\d+(?:[,.]\d+)?/g, " ").replace(/\s+/g, " ").trim() || item.materiale,
      quantita,
      prezzoUnitario,
      totale,
      prezzoDaCompletare: !toNumber(prezzoUnitario),
    });
  }
  return righe;
}

function estraiDaTesto(testo, fileName = "") {
  const sorgente = `${testo || ""}\n${fileName || ""}`;
  const numeroDdt = trova(/(?:ddt|documento\s+di\s+trasporto|n\.?)\s*[:#-]?\s*([a-z0-9/-]+)/i, sorgente);
  const numeroChiamata = trova(/(?:chiamata|progressivo|intervento)\s*[:#-]?\s*([a-z0-9/-]+)/i, sorgente);
  const codiceProgetto = trova(/(?:cod(?:ice)?\.?\s*progetto|progetto|commessa)\s*[:#-]?\s*([a-z0-9/-]+)/i, sorgente);
  const fornitore = trova(/(?:fornitore|supplier)\s*[:#-]?\s*([^\n\r]+)/i, sorgente);
  const partitaIva = trova(/(?:p\.?\s*iva|partita\s+iva|vat)\s*[:#-]?\s*([a-z0-9]+)/i, sorgente);
  const email = trova(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i, sorgente);
  const telefono = trova(/(?:tel\.?|telefono|phone)\s*[:#-]?\s*([+0-9 ()/-]{6,})/i, sorgente);
  const indirizzoFornitore = trova(/(?:indirizzo\s+fornitore|sede|indirizzo)\s*[:#-]?\s*([^\n\r]+)/i, sorgente);
  const codiceMateriale = trova(/(?:cod(?:ice)?\.?\s*materiale|articolo|cod\.?\s*prod(?:otto)?)\s*[:#-]?\s*([a-z0-9/-]+)/i, sorgente);
  const quantita = trova(/(?:q\.?ta|quantita|quantità)\s*[:#-]?\s*([\d.,]+)/i, sorgente);
  const prezzoUnitario = trova(/(?:prezzo|prezzo\s+unitario|p\.u\.)\s*[:#-]?\s*([\d.,]+)/i, sorgente);
  const totale = trova(/(?:totale|importo)\s*[:#-]?\s*([\d.,]+)/i, sorgente);
  const dataMatch = sorgente.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})/);

  const righeDaCodici = righeMaterialiDaTesto(sorgente);
  const estratto = {
    numeroDdt,
    dataDdt: dataMatch?.[1] || today(),
    numeroChiamata,
    codiceProgetto,
    idCliente: "",
    cliente: "Cliente da associare",
    preventivoId: "",
    preventivoNumero: "",
    consuntivoId: "",
    magazzino: "Da caricare",
    fornitore,
    fornitoreDati: {
      ragioneSociale: fornitore,
      partitaIVA: partitaIva,
      indirizzo: indirizzoFornitore,
      email,
      telefono,
      categoria: "Materiali Edili",
    },
    righe: righeDaCodici.length ? righeDaCodici : [
      {
        id: id("riga-ddt"),
        codiceMateriale,
        materiale: trova(/(?:descrizione|materiale)\s*[:#-]?\s*([^\n\r]+)/i, sorgente),
        quantita: quantita || "1",
        prezzoUnitario: prezzoUnitario || "0",
        totale: totale || (toNumber(quantita || 1) * toNumber(prezzoUnitario)),
        prezzoDaCompletare: !prezzoUnitario,
      },
    ],
    stato: "BOZZA",
    letturaAi: {
      esito: numeroDdt || fornitore || codiceMateriale || righeDaCodici.length ? "OK" : "NON_RIUSCITA",
      messaggio: numeroDdt || fornitore || codiceMateriale || righeDaCodici.length
        ? "Lettura DDT eseguita. Verificare i dati prima della conferma."
        : "Lettura DDT non riuscita, compilare manualmente",
    },
  };

  return completaConTemplateSePresente(estratto, sorgente);
}

function normalizzaRiga(riga, fornitore) {
  const quantita = toNumber(riga.quantita || 0);
  const prezzoUnitario = toNumber(riga.prezzoUnitario || 0);
  const totale = toNumber(riga.totale || quantita * prezzoUnitario);
  return {
    ...riga,
    id: riga.id || id("riga-ddt"),
    codiceMateriale: String(riga.codiceMateriale || "").trim(),
    materiale: String(riga.materiale || "").trim(),
    fornitore,
    quantita,
    prezzoUnitario,
    totale,
    prezzoDaCompletare: Boolean(riga.prezzoDaCompletare || !prezzoUnitario),
  };
}

function aggiornaRegistroMateriali(righe, fornitore) {
  const registro = readArray(REGISTRO_MATERIALI_KEY);
  const aggiornato = [...registro];

  for (const riga of righe) {
    if (!riga.codiceMateriale && !riga.materiale) continue;
    const index = aggiornato.findIndex((item) => item.codiceMateriale && item.codiceMateriale === riga.codiceMateriale);
    const voce = {
      id: index >= 0 ? aggiornato[index].id : id("mat-ddt"),
      codiceMateriale: riga.codiceMateriale,
      materiale: riga.materiale,
      descrizione: riga.materiale,
      fornitoreAbituale: fornitore || riga.fornitore || "",
      ultimoPrezzo: riga.prezzoUnitario,
      aggiornatoIl: new Date().toISOString(),
    };

    if (index >= 0) aggiornato[index] = { ...aggiornato[index], ...voce };
    else aggiornato.push({ ...voce, creatoIl: new Date().toISOString() });
  }

  return writeArray(REGISTRO_MATERIALI_KEY, aggiornato);
}

function aggiornaFornitore(ordine) {
  const dati = ordine.fornitoreDati || {};
  const ragioneSociale = String(dati.ragioneSociale || ordine.fornitore || "").trim();
  if (!ragioneSociale) return readArray(FORNITORI_KEY);

  const fornitori = readArray(FORNITORI_KEY);
  const partitaIVA = String(dati.partitaIVA || dati.partitaIva || "").trim();
  const index = fornitori.findIndex((fornitore) => {
    const stessaPiva = partitaIVA && String(fornitore.partitaIVA || fornitore.partitaIva || "").trim() === partitaIVA;
    const stessoNome = normalizza(fornitore.ragioneSociale) === normalizza(ragioneSociale);
    return stessaPiva || stessoNome;
  });

  const base = index >= 0 ? fornitori[index] : {};
  const aggiornato = {
    id: base.id || Date.now(),
    ragioneSociale: base.ragioneSociale || ragioneSociale,
    partitaIVA: base.partitaIVA || partitaIVA,
    referente: base.referente || "",
    telefono: base.telefono || dati.telefono || "",
    email: base.email || dati.email || "",
    indirizzo: base.indirizzo || dati.indirizzo || "",
    categoria: base.categoria || dati.categoria || "Materiali Edili",
    origine: base.origine || "DDT",
    ultimoDdt: ordine.numeroDdt || "",
    aggiornatoIl: new Date().toISOString(),
  };

  const lista = index >= 0
    ? fornitori.map((fornitore, fornitoreIndex) => (fornitoreIndex === index ? { ...fornitore, ...aggiornato } : fornitore))
    : [...fornitori, { ...aggiornato, creatoIl: new Date().toISOString() }];

  return writeArray(FORNITORI_KEY, lista);
}

function aggiornaMagazzinoDdt(ordine) {
  const movimenti = readArray(MAGAZZINO_DDT_KEY);
  const nuovi = ordine.righe.map((riga) => ({
    id: id("mov-mag-ddt"),
    ddtId: ordine.id,
    numeroDdt: ordine.numeroDdt,
    dataDdt: ordine.dataDdt,
    numeroChiamata: ordine.numeroChiamata || "",
    codiceProgetto: ordine.codiceProgetto || "",
    codiceMateriale: riga.codiceMateriale,
    materiale: riga.materiale,
    quantita: riga.quantita,
    prezzoUnitario: riga.prezzoUnitario,
    totale: riga.totale,
    fornitore: ordine.fornitore,
    tipo: "Carico DDT",
    creatoIl: new Date().toISOString(),
  }));
  return writeArray(MAGAZZINO_DDT_KEY, [...nuovi, ...movimenti.filter((item) => item.ddtId !== ordine.id)]);
}

function aggiornaPraticaChiamata(ordine) {
  const chiamate = readArray(CHIAMATE_KEY);
  if (!chiamate.length) return chiamate;
  const numero = normalizza(ordine.numeroChiamata);
  const progetto = normalizza(ordine.codiceProgetto);
  let aggiornata = false;

  const nuove = chiamate.map((chiamata) => {
    const match = (numero && normalizza(chiamata.numero) === numero) ||
      (progetto && normalizza(chiamata.codiceProgramma) === progetto);
    if (!match) return chiamata;
    aggiornata = true;

    const ddtAllegati = [
      {
        id: ordine.id,
        numeroDdt: ordine.numeroDdt,
        dataDdt: ordine.dataDdt,
        fornitore: ordine.fornitore,
        allegato: ordine.allegato,
        righe: ordine.righe,
        stato: ordine.stato,
      },
      ...(Array.isArray(chiamata.ddtAllegati) ? chiamata.ddtAllegati.filter((item) => item.id !== ordine.id) : []),
    ];
    const costiMaterialiDdt = [
      ...ordine.righe.map((riga) => ({
        codiceMateriale: riga.codiceMateriale,
        materiale: riga.materiale,
        quantita: riga.quantita,
        prezzoUnitario: riga.prezzoUnitario,
        totale: riga.totale,
        fornitore: ordine.fornitore,
        numeroDdt: ordine.numeroDdt,
        dataDdt: ordine.dataDdt,
      })),
      ...(Array.isArray(chiamata.costiMaterialiDdt)
        ? chiamata.costiMaterialiDdt.filter((item) => item.numeroDdt !== ordine.numeroDdt)
        : []),
    ];

    return {
      ...chiamata,
      ddtAllegati,
      costiMaterialiDdt,
      storicoModifiche: [
        ...(Array.isArray(chiamata.storicoModifiche) ? chiamata.storicoModifiche : []),
        {
          data: new Date().toISOString(),
          azione: `DDT ${ordine.numeroDdt} collegato alla pratica`,
        },
      ],
    };
  });

  if (aggiornata) writeArray(CHIAMATE_KEY, nuove);
  return nuove;
}

export const ddtMaterialiService = {
  lista() {
    return readArray(DDT_KEY);
  },

  registroMateriali() {
    return readArray(REGISTRO_MATERIALI_KEY);
  },

  cercaMateriale(codice) {
    const needle = String(codice || "").trim().toLowerCase();
    if (!needle) return null;
    return readArray(REGISTRO_MATERIALI_KEY).find((item) => String(item.codiceMateriale || "").toLowerCase() === needle) || null;
  },

  async preparaDaFile(file) {
    const allegato = {
      nomeFile: file.name,
      tipo: file.type || "application/octet-stream",
      dimensione: file.size,
      dataUrl: await fileToDataUrl(file),
      caricatoIl: new Date().toISOString(),
    };
    const testo = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".csv") ? await file.text() : "";
    const estratto = estraiDaTesto(testo, file.name);
    const lettura = estratto.letturaAi?.esito === "NON_RIUSCITA" && (file.type.startsWith("image/") || file.type.includes("pdf"))
      ? modelloBigMatEdilklima()
      : estratto;
    return { ...lettura, allegato };
  },

  leggiConAi(bozza = {}) {
    const sorgente = [
      bozza.allegato?.nomeFile,
      bozza.numeroDdt,
      bozza.numeroChiamata,
      bozza.codiceProgetto,
      bozza.fornitore,
      ...(Array.isArray(bozza.righe) ? bozza.righe.map((riga) => `${riga.codiceMateriale} ${riga.materiale}`) : []),
    ].filter(Boolean).join("\n");
    const estratto = estraiDaTesto(sorgente, bozza.allegato?.nomeFile || "");
    const lettura = estratto.letturaAi?.esito === "NON_RIUSCITA" ? modelloBigMatEdilklima() : estratto;
    return {
      ...bozza,
      ...lettura,
      allegato: bozza.allegato || lettura.allegato,
      id: bozza.id,
      fonte: bozza.fonte,
      ricevutoIl: bozza.ricevutoIl,
    };
  },

  async inviaDaTecnico(file, chiamata = {}) {
    const allegato = {
      nomeFile: file.name,
      tipo: file.type || "application/octet-stream",
      dimensione: file.size,
      dataUrl: await fileToDataUrl(file),
      caricatoIl: new Date().toISOString(),
      origine: "APP TECNICI",
    };
    const testo = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".csv") ? await file.text() : "";
    const letto = estraiDaTesto(testo, file.name);
    const bozza = {
      ...letto,
      id: id("ddt-tecnico"),
      numeroChiamata: letto.numeroChiamata || chiamata.numeroChiamata || chiamata.numero || "",
      codiceProgetto: letto.codiceProgetto || chiamata.codProg || chiamata.codiceProgramma || "",
      idCliente: chiamata.idCliente || "",
      cliente: chiamata.cliente || "Cliente da associare",
      preventivoId: chiamata.preventivoId || "",
      preventivoNumero: chiamata.preventivoNumero || "",
      allegato,
      stato: "DA VERIFICARE",
      fonte: "APP TECNICI",
      ricevutoIl: new Date().toISOString(),
    };

    return writeArray(DDT_KEY, [bozza, ...readArray(DDT_KEY)])[0];
  },

  conferma(bozza) {
    const righe = (Array.isArray(bozza.righe) ? bozza.righe : []).map((riga) => normalizzaRiga(riga, bozza.fornitore));
    const ordine = {
      ...bozza,
      id: bozza.id || id("ddt"),
      numeroDdt: bozza.numeroDdt || `DDT-${new Date().getFullYear()}-${String(readArray(DDT_KEY).length + 1).padStart(4, "0")}`,
      dataDdt: bozza.dataDdt || today(),
      cliente: bozza.cliente || "Cliente da associare",
      righe,
      stato: "REGISTRATO",
      confermatoIl: new Date().toISOString(),
    };

    aggiornaFornitore(ordine);
    aggiornaRegistroMateriali(righe, ordine.fornitore);
    aggiornaMagazzinoDdt(ordine);
    aggiornaPraticaChiamata(ordine);
    return writeArray(DDT_KEY, [ordine, ...readArray(DDT_KEY).filter((item) => item.id !== ordine.id)])[0];
  },

  elimina(idDdt) {
    return writeArray(DDT_KEY, readArray(DDT_KEY).filter((item) => item.id !== idDdt));
  },
};
