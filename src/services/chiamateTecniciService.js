import { squadreService } from "./squadreService.js";
import { consuntivazioniService } from "./consuntivazioniService.js";

const CHIAMATE_KEY = "teamGroup.chiamateTecnici";
const CHIAMATE_GIORNALIERE_KEY = "teamGroup.chiamateGiornaliere";
const ORE_GIORNALIERE_KEY = "teamGroup.oreGiornaliere";

function generaGoogleMapsLink(indirizzo, comune, provincia) {
  const query = [indirizzo, comune, provincia]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query).replace(/%20/g, "+")}` : "";
}

const chiamataDemo = {
  id: "chiamata-demo-1",
  numero: "TG-000001",
  idCliente: "IP",
  cliente: "IP",
  clienteAssociato: "IP",
  ticketCliente: "TICKET-DEMO",
  codiceProgramma: "CP-DEMO",
  comune: "Bolzano Vicentino",
  provincia: "VI",
  indirizzo: "Via dell'Artigianato, 22 - Bolzano Vicentino (VI)",
  indirizzoCompleto: "Via dell'Artigianato, 22 - Bolzano Vicentino (VI)",
  linkGoogleMaps: generaGoogleMapsLink("Via dell'Artigianato, 22", "Bolzano Vicentino", "VI"),
  coordinate: "",
  descrizione: "Chiamata demo assegnata alla squadra AMIR - SHEFI.",
  noteUfficio: "Verificare intervento e compilare rapportino.",
  squadraId: "squadra-amir-shefi",
  statoAssegnazione: "ASSEGNATO",
  stato: "Assegnata",
  oraArrivo: "",
  oraFine: "",
  foto: [],
  rapportino: "",
  categoria: "",
  priorita: "",
  dataApertura: "",
  importoPreventivo: "",
  importoConsuntivo: "",
  fonte: "Demo",
  storicoAssegnazioni: [
    {
      data: new Date().toISOString(),
      squadraId: "squadra-amir-shefi",
      squadraNome: "AMIR - SHEFI",
      azione: "Assegnazione demo",
    },
  ],
};

function parseCsvLine(line, separator = ";") {
  const cells = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"" && nextChar === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      insideQuotes = !insideQuotes;
    } else if (char === separator && !insideQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function normalizzaHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseCsv(text) {
  const righe = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (righe.length < 2) return [];

  const headers = parseCsvLine(righe[0]).map(normalizzaHeader);

  return righe.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function csvValue(row, header) {
  return row[normalizzaHeader(header)] || "";
}

function firstCsvValue(row, headers) {
  return headers.map((header) => csvValue(row, header)).find(Boolean) || "";
}

function normalizzaIdCliente(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function trovaIdClienteCsv(row) {
  return normalizzaIdCliente(csvValue(row, "Codice Impianto"));
}

function trovaCodiceProgettoCsv(row) {
  return firstCsvValue(row, [
    "Cod. Progetto Gamma",
    "Cod Progetto Gamma",
    "Codice Progetto Gamma",
    "Cod. Progetto",
    "Codice Progetto",
  ]).trim();
}

function normalizzaClienteAssociato(value) {
  const cliente = String(value || "").trim();
  if (!cliente) return "";
  if (/^\d+$/.test(cliente)) return "";
  if (/^ID[A-Z0-9]+$/i.test(normalizzaIdCliente(cliente))) return "";
  const clientePulito = cliente.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clientePulito === "TEAMGROUPSRL") return "";
  if (clientePulito === "CLIENTEDAASSOCIARE") return "";
  return cliente;
}

function normalizzaTesto(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizzaCodice(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function testoPreventivo(preventivo) {
  return normalizzaTesto([
    preventivo.numero,
    preventivo.numeroChiamata,
    preventivo.codiceProgramma,
    preventivo.codiceProgetto,
    preventivo.idCliente,
    preventivo.clienteId,
    preventivo.cliente,
    preventivo.cantiere,
    preventivo.descrizione,
    preventivo.oggetto,
    preventivo.note,
  ].filter(Boolean).join(" "));
}

function descrizioneSimile(a, b) {
  const paroleA = new Set(normalizzaTesto(a).split(" ").filter((parola) => parola.length > 3));
  const paroleB = new Set(normalizzaTesto(b).split(" ").filter((parola) => parola.length > 3));
  if (!paroleA.size || !paroleB.size) return false;
  const comuni = [...paroleA].filter((parola) => paroleB.has(parola)).length;
  return comuni >= Math.min(3, paroleA.size);
}

function readPreventiviLocali() {
  const keys = ["preventivi", "teamGroup.preventivi"];
  for (const key of keys) {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignora cache locali non valide.
    }
  }
  return [];
}

function importoPreventivo(preventivo) {
  if (preventivo.importo !== undefined && preventivo.importo !== null) return preventivo.importo;
  if (preventivo.totale !== undefined && preventivo.totale !== null) return preventivo.totale;
  const righe = Array.isArray(preventivo.righe) ? preventivo.righe : [];
  const totaleRighe = righe.reduce((totale, riga) => totale + toNumber(riga.totale ?? riga.importo), 0);
  return totaleRighe || "";
}

function trovaPreventivoCollegato(intervento, preventiviEsterni = []) {
  const preventivi = [...preventiviEsterni, ...readPreventiviLocali()].filter(Boolean);
  if (!preventivi.length) return null;

  const numeroChiamata = normalizzaCodice(intervento.numero);
  const codiceProgetto = normalizzaCodice(intervento.codiceProgramma);
  const idCliente = normalizzaCodice(intervento.idCliente);

  const matchNumero = preventivi.find((preventivo) => {
    const valoriNumero = [
      preventivo.numeroChiamata,
      preventivo.numero_chiamata,
      preventivo.chiamata,
      preventivo.ticketCliente,
      preventivo.ticket,
    ].map(normalizzaCodice);
    return valoriNumero.includes(numeroChiamata) || testoPreventivo(preventivo).includes(normalizzaTesto(numeroChiamata));
  });
  if (matchNumero) return matchNumero;

  if (codiceProgetto) {
    const matchProgetto = preventivi.find((preventivo) => {
      const valoriProgetto = [
        preventivo.codiceProgramma,
        preventivo.codiceProgetto,
        preventivo.codice_progetto,
        preventivo.commessa,
      ].map(normalizzaCodice);
      return valoriProgetto.includes(codiceProgetto) || testoPreventivo(preventivo).includes(normalizzaTesto(codiceProgetto));
    });
    if (matchProgetto) return matchProgetto;
  }

  if (idCliente && intervento.descrizione) {
    return preventivi.find((preventivo) => {
      const contieneId = testoPreventivo(preventivo).includes(normalizzaTesto(idCliente));
      return contieneId && descrizioneSimile(intervento.descrizione, preventivo.descrizione || preventivo.oggetto || "");
    }) || null;
  }

  return null;
}

function collegaPreventivo(intervento, preventivi = []) {
  const preventivo = trovaPreventivoCollegato(intervento, preventivi);
  if (!preventivo) {
    return {
      ...intervento,
      stato: "DA VERIFICARE / DA PREVENTIVARE",
      statoAssegnazione: "DA ASSEGNARE",
      preventivoCollegato: false,
      preventivoId: "",
      preventivoNumero: "",
      statoPreventivo: "",
      importoPreventivo: intervento.importoPreventivo || "",
    };
  }

  return {
    ...intervento,
    cliente: normalizzaClienteAssociato(preventivo.cliente) || "Cliente da associare",
    clienteAssociato: normalizzaClienteAssociato(preventivo.cliente),
    stato: "PREVENTIVO COLLEGATO",
    statoAssegnazione: "DA ASSEGNARE",
    preventivoCollegato: true,
    preventivoId: preventivo.id || "",
    preventivoNumero: preventivo.numero || "",
    statoPreventivo: preventivo.stato || "",
    importoPreventivo: importoPreventivo(preventivo),
    storicoModifiche: [
      ...(Array.isArray(intervento.storicoModifiche) ? intervento.storicoModifiche : []),
      {
        data: new Date().toISOString(),
        azione: `Preventivo collegato${preventivo.numero ? `: ${preventivo.numero}` : ""}`,
      },
    ],
  };
}

function creaInterventoDaCsv(row, preventivi = []) {
  const progressivo = csvValue(row, "Progressivo");
  const idCliente = trovaIdClienteCsv(row);
  const codiceProgetto = trovaCodiceProgettoCsv(row);
  const comune = csvValue(row, "Localita Impianto");
  const provincia = csvValue(row, "Provincia");
  const stato = [csvValue(row, "Stato"), csvValue(row, "Avanzamento")].filter(Boolean).join(" / ");
  const indirizzo = [
    csvValue(row, "Indirizzo Impianto"),
    comune,
    provincia,
  ].filter(Boolean).join(" - ");
  const indirizzoCompleto = [
    csvValue(row, "Indirizzo Impianto"),
    comune,
    provincia,
  ].filter(Boolean).join(" ");
  const categoria = [
    csvValue(row, "Categoria Intervento Descrizione"),
    csvValue(row, "Sottocategoria Intervento Descrizione"),
  ].filter(Boolean).join(" / ");
  const dataApertura = [
    csvValue(row, "Data Apertura Intervento"),
    csvValue(row, "Ora Apertura Intervento"),
  ].filter(Boolean).join(" ");

  return collegaPreventivo({
    id: "",
    numero: progressivo,
    idCliente,
    cliente: "Cliente da associare",
    clienteAssociato: "",
    ticketCliente: progressivo,
    codiceProgramma: codiceProgetto,
    comune,
    provincia,
    indirizzo,
    indirizzoCompleto,
    linkGoogleMaps: generaGoogleMapsLink(csvValue(row, "Indirizzo Impianto"), comune, provincia),
    coordinate: firstCsvValue(row, ["Coordinate", "Latitudine Longitudine", "GPS", "Posizione GPS"]),
    descrizione: csvValue(row, "Descrizione Pubblica"),
    noteUfficio: csvValue(row, "Descrizione Privata"),
    squadraId: "",
    statoAssegnazione: "DA ASSEGNARE",
    stato: stato || "Da assegnare",
    oraArrivo: "",
    oraFine: "",
    foto: [],
    rapportino: "",
    categoria,
    priorita: csvValue(row, "Descrizione Priorita"),
    dataApertura,
    importoPreventivo: csvValue(row, "Importo Preventivo"),
    importoConsuntivo: csvValue(row, "Importo Consuntivo"),
    fonte: "CSV manutenzione",
    storicoAssegnazioni: [],
    storicoModifiche: [
      {
        data: new Date().toISOString(),
        azione: "Importazione CSV manutenzione",
      },
    ],
  }, preventivi);
}

function readChiamate() {
  squadreService.lista();
  const saved = localStorage.getItem(CHIAMATE_KEY);
  if (saved) {
    return JSON.parse(saved).map((chiamata) => {
      const clienteAssociato = normalizzaClienteAssociato(chiamata.clienteAssociato || chiamata.cliente);
      return {
        ...chiamata,
        idCliente: normalizzaIdCliente(chiamata.idCliente),
        cliente: clienteAssociato || "Cliente da associare",
        clienteAssociato,
      };
    });
  }
  localStorage.setItem(CHIAMATE_KEY, JSON.stringify([chiamataDemo]));
  return [chiamataDemo];
}

function writeChiamate(chiamate) {
  localStorage.setItem(CHIAMATE_KEY, JSON.stringify(chiamate));
  window.dispatchEvent(new Event("teamGroupDataChanged"));
  return chiamate;
}

function creaId() {
  return `chiamata-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumber(value) {
  const numero = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

function dataIso(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const testo = String(value).trim();
  const matchIt = testo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchIt) {
    const [, giorno, mese, anno] = matchIt;
    return `${anno}-${mese.padStart(2, "0")}-${giorno.padStart(2, "0")}`;
  }
  const parsed = new Date(testo);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return testo.slice(0, 10);
}

function readStorageArray(key) {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : [];
}

function writeStorageArray(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function creaRecordGiornalieri(chiamata, datiChiusura = {}) {
  const data = dataIso(chiamata.oraFine || new Date().toISOString());
  const cliente = chiamata.clienteAssociato || chiamata.cliente || "Cliente da associare";
  const chiamateGiornaliere = readStorageArray(CHIAMATE_GIORNALIERE_KEY).filter((item) => item.chiamataId !== chiamata.id);
  const chiamataGiornaliera = {
    id: `giorno-${chiamata.id}`,
    chiamataId: chiamata.id,
    numeroChiamata: chiamata.numero,
    data,
    idCliente: chiamata.idCliente || "",
    cliente,
    squadraId: chiamata.squadraId || "",
    indirizzo: chiamata.indirizzo || "",
    descrizione: chiamata.descrizione || "",
    stato: "COMPLETATA",
    linkGoogleMaps: chiamata.linkGoogleMaps || "",
    rapportino: datiChiusura.rapportino || chiamata.rapportino || "",
    creatoIl: new Date().toISOString(),
  };
  writeStorageArray(CHIAMATE_GIORNALIERE_KEY, [chiamataGiornaliera, ...chiamateGiornaliere]);

  const righeOre = readStorageArray(ORE_GIORNALIERE_KEY).filter((item) => item.chiamataId !== chiamata.id);
  const dipendenti = Array.isArray(datiChiusura.dipendenti) ? datiChiusura.dipendenti : [];
  const nuoveOre = dipendenti.map((riga, index) => {
    const ore = toNumber(riga.ore);
    const costoOrario = 28;
    return {
      id: `ore-${chiamata.id}-${riga.dipendenteId || index}`,
      chiamataId: chiamata.id,
      numeroChiamata: chiamata.numero,
      data,
      cliente,
      squadraId: chiamata.squadraId || "",
      dipendenteId: riga.dipendenteId || "",
      dipendente: riga.nome || "",
      ore,
      costoOrario,
      totaleManodopera: ore * costoOrario,
      creatoIl: new Date().toISOString(),
    };
  });
  writeStorageArray(ORE_GIORNALIERE_KEY, [...nuoveOre, ...righeOre]);
}

function prossimoNumero(chiamate) {
  const massimo = chiamate.reduce((max, chiamata) => {
    const numero = Number(String(chiamata.numero || "").replace("TG-", ""));
    return Number.isFinite(numero) ? Math.max(max, numero) : max;
  }, 0);
  return `TG-${String(massimo + 1).padStart(6, "0")}`;
}

export const chiamateTecniciService = {
  lista() {
    return readChiamate();
  },

  salva(chiamata) {
    const chiamate = readChiamate();
    const normalizzata = {
      id: chiamata.id || creaId(),
      numero: chiamata.numero || prossimoNumero(chiamate),
      idCliente: normalizzaIdCliente(chiamata.idCliente),
      cliente: normalizzaClienteAssociato(chiamata.cliente) || chiamata.clienteAssociato || "Cliente da associare",
      clienteAssociato: normalizzaClienteAssociato(chiamata.clienteAssociato || chiamata.cliente),
      ticketCliente: chiamata.ticketCliente?.trim() || "",
      codiceProgramma: chiamata.codiceProgramma?.trim() || "",
      comune: chiamata.comune?.trim() || "",
      provincia: chiamata.provincia?.trim() || "",
      indirizzo: chiamata.indirizzo?.trim() || "",
      indirizzoCompleto: chiamata.indirizzoCompleto?.trim() || chiamata.indirizzo?.trim() || "",
      linkGoogleMaps: chiamata.linkGoogleMaps || generaGoogleMapsLink(chiamata.indirizzo, chiamata.comune, chiamata.provincia),
      coordinate: chiamata.coordinate?.trim() || "",
      descrizione: chiamata.descrizione?.trim() || "",
      noteUfficio: chiamata.noteUfficio?.trim() || "",
      squadraId: chiamata.squadraId || "",
      statoAssegnazione: chiamata.squadraId ? "ASSEGNATO" : "DA ASSEGNARE",
      stato: chiamata.squadraId
        ? chiamata.stato || "Assegnata"
        : chiamata.stato === "Assegnata"
          ? "Da assegnare"
          : chiamata.stato || "Da assegnare",
      oraArrivo: chiamata.oraArrivo || "",
      oraFine: chiamata.oraFine || "",
      foto: Array.isArray(chiamata.foto) ? chiamata.foto : [],
      rapportino: chiamata.rapportino || "",
      categoria: chiamata.categoria || "",
      priorita: chiamata.priorita || "",
      dataApertura: chiamata.dataApertura || "",
      importoPreventivo: chiamata.importoPreventivo || "",
      importoConsuntivo: chiamata.importoConsuntivo || "",
      preventivoCollegato: Boolean(chiamata.preventivoCollegato),
      preventivoId: chiamata.preventivoId || "",
      preventivoNumero: chiamata.preventivoNumero || "",
      statoPreventivo: chiamata.statoPreventivo || "",
      fonte: chiamata.fonte || "",
      storicoAssegnazioni: Array.isArray(chiamata.storicoAssegnazioni) ? chiamata.storicoAssegnazioni : [],
      storicoModifiche: Array.isArray(chiamata.storicoModifiche) ? chiamata.storicoModifiche : [],
      datiChiusura: chiamata.datiChiusura || null,
    };

    const aggiornate = chiamate.some((item) => item.id === normalizzata.id)
      ? chiamate.map((item) => (item.id === normalizzata.id ? normalizzata : item))
      : [...chiamate, normalizzata];

    return writeChiamate(aggiornate);
  },

  elimina(id) {
    return writeChiamate(readChiamate().filter((chiamata) => chiamata.id !== id));
  },

  assegnaSquadra(id, squadraId, squadraNome = "") {
    const chiamate = readChiamate();
    const aggiornate = chiamate.map((chiamata) => {
      if (chiamata.id !== id) return chiamata;

      const storicoAssegnazioni = Array.isArray(chiamata.storicoAssegnazioni)
        ? chiamata.storicoAssegnazioni
        : [];

      return {
        ...chiamata,
        squadraId: squadraId || "",
        statoAssegnazione: squadraId ? "ASSEGNATO" : "DA ASSEGNARE",
        stato: squadraId
          ? chiamata.stato === "Da assegnare" ? "Assegnata" : chiamata.stato
          : chiamata.stato === "Assegnata" ? "Da assegnare" : chiamata.stato,
        storicoAssegnazioni: [
          ...storicoAssegnazioni,
          {
            data: new Date().toISOString(),
            squadraId: squadraId || "",
            squadraNome: squadraNome || "Non assegnata",
            azione: squadraId ? "Assegnazione manuale" : "Rimozione assegnazione",
          },
        ],
        storicoModifiche: [
          ...(Array.isArray(chiamata.storicoModifiche) ? chiamata.storicoModifiche : []),
          {
            data: new Date().toISOString(),
            azione: squadraId ? `Assegnata a ${squadraNome || "squadra"}` : "Rimossa assegnazione squadra",
          },
        ],
      };
    });

    return writeChiamate(aggiornate);
  },

  preparaCsv(text, preventivi = []) {
    return parseCsv(text)
      .map((row) => creaInterventoDaCsv(row, preventivi))
      .filter((intervento) => intervento.numero);
  },

  importaCsv(text, preventivi = []) {
    const chiamate = readChiamate();
    const numeriEsistenti = new Set(chiamate.map((chiamata) => String(chiamata.numero || "").trim()));
    const interventi = this.preparaCsv(text, preventivi);
    const nuovi = [];
    const duplicati = [];

    for (const intervento of interventi) {
      if (numeriEsistenti.has(String(intervento.numero).trim())) {
        duplicati.push(intervento);
      } else {
        nuovi.push({ ...intervento, id: creaId() });
        numeriEsistenti.add(String(intervento.numero).trim());
      }
    }

    if (nuovi.length) writeChiamate([...nuovi, ...chiamate]);

    return { importati: nuovi.length, duplicati: duplicati.length, totaleCsv: interventi.length, interventi, nuovi, duplicati };
  },

  chiudi(id, datiChiusura = {}) {
    let chiamataChiusa = null;
    const aggiornate = readChiamate().map((chiamata) => {
      if (chiamata.id !== id) return chiamata;

      chiamataChiusa = {
        ...chiamata,
        stato: "COMPLETATA",
        oraFine: chiamata.oraFine || new Date().toISOString(),
        rapportino: datiChiusura.rapportino || chiamata.rapportino || "",
        noteChiusura: datiChiusura.noteChiusura || "",
        datiChiusura,
        storicoModifiche: [
          ...(Array.isArray(chiamata.storicoModifiche) ? chiamata.storicoModifiche : []),
          {
            data: new Date().toISOString(),
            azione: "Chiamata chiusa e inviata in consuntivazione",
          },
        ],
      };

      return chiamataChiusa;
    });

    writeChiamate(aggiornate);
    if (chiamataChiusa) {
      creaRecordGiornalieri(chiamataChiusa, datiChiusura);
      consuntivazioniService.creaDaChiamata(chiamataChiusa, datiChiusura);
    }
    return chiamataChiusa;
  },
};
