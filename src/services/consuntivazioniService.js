import { operaiService } from "./operaiService.js";

const CONSUNTIVAZIONI_KEY = "teamGroup.consuntivazioniInterventi";
const MARGINE_DEFAULT_KEY = "teamGroup.consuntivoMargineDefault";
const COSTO_KM_DEFAULT = 0.75;
const COSTO_ORARIO_MANODOPERA = 28;
const SPESE_GENERALI_PERCENTUALE = 20;
export const MARGINI_CONSUNTIVO = [25, 30, 35, 40, 45, 50];

function readConsuntivazioni() {
  const saved = localStorage.getItem(CONSUNTIVAZIONI_KEY);
  return saved ? JSON.parse(saved) : [];
}

function writeConsuntivazioni(consuntivazioni) {
  localStorage.setItem(CONSUNTIVAZIONI_KEY, JSON.stringify(consuntivazioni));
  window.dispatchEvent(new Event("teamGroupDataChanged"));
  return consuntivazioni;
}

function toNumber(value) {
  const normalized = String(value ?? "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function creaId() {
  return `cons-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function margineDefault() {
  const saved = Number(localStorage.getItem(MARGINE_DEFAULT_KEY) || 30);
  return MARGINI_CONSUNTIVO.includes(saved) ? saved : 30;
}

function salvaMargineDefault(percentuale) {
  const value = Number(percentuale);
  if (MARGINI_CONSUNTIVO.includes(value)) localStorage.setItem(MARGINE_DEFAULT_KEY, String(value));
}

export function calcolaConsuntivo(dati = {}) {
  const operaiById = Object.fromEntries(operaiService.lista().map((operaio) => [operaio.id, operaio]));
  const dipendenti = Array.isArray(dati.dipendenti) ? dati.dipendenti : [];
  const materiali = Array.isArray(dati.materiali) ? dati.materiali : [];

  const righeDipendenti = dipendenti.map((riga) => {
    const operaio = operaiById[riga.dipendenteId] || {};
    const ore = toNumber(riga.ore);
    const costoOrario = COSTO_ORARIO_MANODOPERA;
    return {
      ...riga,
      nome: riga.nome || [operaio.nome, operaio.cognome].filter(Boolean).join(" "),
      squadra: riga.squadra || operaio.squadra || "",
      ruolo: riga.ruolo || operaio.ruolo || "",
      ore,
      costoOrarioInterno: costoOrario,
      totale: ore * costoOrario,
    };
  });

  const righeMateriali = materiali.map((riga) => {
    const quantita = toNumber(riga.quantita);
    const prezzoUnitario = toNumber(riga.prezzoUnitario);
    return {
      ...riga,
      materiale: riga.materiale || "",
      quantita,
      prezzoUnitario,
      totale: quantita * prezzoUnitario,
    };
  });

  const kmPercorsi = toNumber(dati.kmPercorsi);
  const costoKm = toNumber(dati.costoKm || COSTO_KM_DEFAULT);
  const costoManodopera = righeDipendenti.reduce((totale, riga) => totale + toNumber(riga.totale), 0);
  const costoMateriali = righeMateriali.reduce((totale, riga) => totale + toNumber(riga.totale), 0);
  const costoPercorso = kmPercorsi * costoKm;
  const costoDiretto = costoManodopera + costoPercorso + costoMateriali;
  const speseGeneraliPercentuale = SPESE_GENERALI_PERCENTUALE;
  const speseGenerali = costoDiretto * (speseGeneraliPercentuale / 100);
  const totaleCostoAzienda = costoDiretto + speseGenerali;
  const marginePercentuale = MARGINI_CONSUNTIVO.includes(Number(dati.marginePercentuale))
    ? Number(dati.marginePercentuale)
    : margineDefault();
  const margineAzienda = totaleCostoAzienda * (marginePercentuale / 100);
  const totaleConsuntivo = totaleCostoAzienda + margineAzienda;

  return {
    dipendenti: righeDipendenti,
    materiali: righeMateriali,
    kmPercorsi,
    costoKm,
    tempoViaggio: dati.tempoViaggio || "",
    costoManodopera,
    costoPercorso,
    costoMateriali,
    costoDiretto,
    speseGeneraliPercentuale,
    speseGenerali,
    totaleCostoAzienda,
    marginePercentuale,
    margineAzienda,
    totaleConsuntivo,
    totaleCostoInterno: costoDiretto,
    importoDaFatturare: totaleConsuntivo,
    margine: margineAzienda,
  };
}

export const consuntivazioniService = {
  lista() {
    return readConsuntivazioni();
  },

  daConsuntivare() {
    return readConsuntivazioni().filter((item) => item.stato === "DA CONSUNTIVARE");
  },

  margineDefault,

  salvaMargineDefault,

  creaDaChiamata(chiamata, datiChiusura = {}) {
    const consuntivazioni = readConsuntivazioni();
    salvaMargineDefault(datiChiusura.marginePercentuale);
    const calcoli = calcolaConsuntivo(datiChiusura);
    const esistente = consuntivazioni.find((item) => item.numeroChiamata === chiamata.numero);
    const voce = {
      ...(esistente || {}),
      id: esistente?.id || creaId(),
      chiamataId: chiamata.id,
      numeroChiamata: chiamata.numero,
      idCliente: chiamata.idCliente || "",
      cliente: chiamata.clienteAssociato || chiamata.cliente || "Cliente da associare",
      indirizzo: chiamata.indirizzo || "",
      descrizione: chiamata.descrizione || "",
      stato: "DA CONSUNTIVARE",
      noteChiusura: datiChiusura.noteChiusura || "",
      rapportino: datiChiusura.rapportino || chiamata.rapportino || "",
      trasformabileIn: ["Preventivo", "Fattura", "Report economico"],
      creatoIl: esistente?.creatoIl || new Date().toISOString(),
      aggiornatoIl: new Date().toISOString(),
      ...calcoli,
    };

    const aggiornate = esistente
      ? consuntivazioni.map((item) => (item.id === esistente.id ? voce : item))
      : [voce, ...consuntivazioni];

    return writeConsuntivazioni(aggiornate);
  },

  aggiungiMaterialiDaDdt(ddt) {
    const consuntivazioni = readConsuntivazioni();
    const righeDdt = Array.isArray(ddt.righe) ? ddt.righe : [];
    if (!righeDdt.length) return consuntivazioni;

    const index = consuntivazioni.findIndex((voce) =>
      (ddt.numeroChiamata && String(voce.numeroChiamata || "") === String(ddt.numeroChiamata)) ||
      (ddt.codiceProgetto && String(voce.codiceProgetto || "") === String(ddt.codiceProgetto)),
    );

    const materialiDdt = righeDdt.map((riga) => ({
      materiale: riga.materiale,
      codiceMateriale: riga.codiceMateriale,
      quantita: riga.quantita,
      prezzoUnitario: riga.prezzoUnitario,
      totale: riga.totale,
      fonte: `DDT ${ddt.numeroDdt}`,
      fornitore: ddt.fornitore,
      numeroDdt: ddt.numeroDdt,
      dataDdt: ddt.dataDdt,
      allegatoDdt: ddt.allegato,
    }));

    if (index < 0) {
      const nuova = {
        id: `cons-ddt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        chiamataId: "",
        numeroChiamata: ddt.numeroChiamata || "",
        codiceProgetto: ddt.codiceProgetto || "",
        idCliente: ddt.idCliente || "",
        cliente: ddt.cliente || "Cliente da associare",
        indirizzo: "",
        descrizione: `Materiali da DDT ${ddt.numeroDdt}`,
        stato: "DA CONSUNTIVARE",
        noteChiusura: "",
        rapportino: "",
        ddtAllegati: ddt.allegato ? [{ numeroDdt: ddt.numeroDdt, dataDdt: ddt.dataDdt, fornitore: ddt.fornitore, allegato: ddt.allegato }] : [],
        trasformabileIn: ["Preventivo", "Fattura", "Report economico"],
        creatoIl: new Date().toISOString(),
        aggiornatoIl: new Date().toISOString(),
        ...calcolaConsuntivo({ materiali: materialiDdt, marginePercentuale: margineDefault() }),
      };
      return writeConsuntivazioni([nuova, ...consuntivazioni]);
    }

    const voce = consuntivazioni[index];
    const materiali = [...(Array.isArray(voce.materiali) ? voce.materiali : []), ...materialiDdt];
    const ddtAllegati = [
      ...(ddt.allegato ? [{ numeroDdt: ddt.numeroDdt, dataDdt: ddt.dataDdt, fornitore: ddt.fornitore, allegato: ddt.allegato }] : []),
      ...(Array.isArray(voce.ddtAllegati) ? voce.ddtAllegati.filter((item) => item.numeroDdt !== ddt.numeroDdt) : []),
    ];
    const calcoli = calcolaConsuntivo({
      dipendenti: voce.dipendenti || [],
      materiali,
      kmPercorsi: voce.kmPercorsi,
      costoKm: voce.costoKm,
      tempoViaggio: voce.tempoViaggio,
      marginePercentuale: voce.marginePercentuale,
    });
    const aggiornata = { ...voce, ...calcoli, materiali, ddtAllegati, aggiornatoIl: new Date().toISOString() };
    return writeConsuntivazioni(consuntivazioni.map((item, itemIndex) => (itemIndex === index ? aggiornata : item)));
  },
};
