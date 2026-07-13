export function numeroPreventivo(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = raw.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function arrotondaEuro(value) {
  return Number(numeroPreventivo(value).toFixed(2));
}

export function getUnitaRiga(riga = {}) {
  return String(riga.unita ?? riga.unitaMisura ?? riga.unita_misura ?? riga.um ?? "").trim();
}

export function getPrezzoUnitarioRiga(riga = {}) {
  return numeroPreventivo(
    riga.prezzoUnitario ??
    riga.prezzo_unitario ??
    riga.prezzo ??
    riga.unitPrice ??
    riga.unit_price ??
    riga.importoUnitario ??
    riga.importo_unitario,
  );
}

export function getScontoRiga(riga = {}) {
  return numeroPreventivo(riga.sconto ?? riga.discount);
}

function getMisureRiga(riga = {}) {
  return {
    partiUguali: numeroPreventivo(riga.partiUguali ?? riga.parti_uguali ?? riga.parUg ?? riga.par_ug),
    lunghezza: numeroPreventivo(riga.lunghezza ?? riga.length),
    larghezza: numeroPreventivo(riga.larghezza ?? riga.width),
    altezzaPeso: numeroPreventivo(riga.altezzaPeso ?? riga.altezza_peso ?? riga.heightWeight ?? riga.height_weight),
  };
}

function prodottoMisure(misure) {
  return Number(
    [misure.partiUguali, misure.lunghezza, misure.larghezza, misure.altezzaPeso]
      .map((valore) => (valore > 0 ? valore : 1))
      .reduce((prodotto, valore) => prodotto * valore, 1)
      .toFixed(2),
  );
}

export function calcolaQuantitaRiga(riga = {}) {
  const misure = getMisureRiga(riga);
  const unita = getUnitaRiga(riga).toLowerCase();
  const quantitaEsplicita = numeroPreventivo(
    riga.quantita ?? riga.quantity ?? riga.qty ?? riga.qta,
  );

  if (unita.includes("corpo") || unita === "cad" || unita === "pz") {
    return quantitaEsplicita > 0 ? Number(quantitaEsplicita.toFixed(2)) : 1;
  }

  const haDimensioniReali =
    misure.lunghezza > 0 ||
    misure.larghezza > 0 ||
    misure.altezzaPeso > 0 ||
    misure.partiUguali > 1;

  if (haDimensioniReali) return prodottoMisure(misure);
  if (quantitaEsplicita > 0) return Number(quantitaEsplicita.toFixed(2));

  const haAlmenoUnaMisura = Object.values(misure).some((valore) => valore > 0);
  if (haAlmenoUnaMisura) return prodottoMisure(misure);

  const prezzo = getPrezzoUnitarioRiga(riga);
  const totaleEsplicito = numeroPreventivo(riga.totaleRiga ?? riga.totale_riga ?? riga.importo ?? riga.totale);
  if (prezzo > 0 && totaleEsplicito > 0) {
    return Number((totaleEsplicito / prezzo).toFixed(2));
  }

  if (prezzo > 0) return 1;
  return 0;
}

export function calcolaImportoLordoRiga(riga = {}) {
  const quantita = calcolaQuantitaRiga(riga);
  const prezzoUnitario = getPrezzoUnitarioRiga(riga);
  return arrotondaEuro(quantita * prezzoUnitario);
}

export function calcolaScontoImportoRiga(riga = {}) {
  return arrotondaEuro(calcolaImportoLordoRiga(riga) * getScontoRiga(riga) / 100);
}

export function calcolaImportoRiga(riga = {}) {
  return arrotondaEuro(calcolaImportoLordoRiga(riga) - calcolaScontoImportoRiga(riga));
}

export function normalizzaIvaAliquota(ivaAliquota, valorePredefinito = 22) {
  if (ivaAliquota === "" || ivaAliquota === null || ivaAliquota === undefined) return valorePredefinito;
  const valore = numeroPreventivo(ivaAliquota);
  return valore >= 0 && Number.isFinite(valore) ? valore : valorePredefinito;
}

export function calcolaTotaliPreventivo(righe = [], ivaAliquota = 22) {
  const righeNormalizzate = Array.isArray(righe) ? righe : [];
  const lordo = arrotondaEuro(
    righeNormalizzate.reduce((totale, riga) => totale + calcolaImportoLordoRiga(riga), 0),
  );
  const sconto = arrotondaEuro(
    righeNormalizzate.reduce((totale, riga) => totale + calcolaScontoImportoRiga(riga), 0),
  );
  const imponibile = arrotondaEuro(
    righeNormalizzate.reduce((totale, riga) => totale + calcolaImportoRiga(riga), 0),
  );
  const ivaPercentuale = normalizzaIvaAliquota(ivaAliquota, 22);
  const ivaImporto = arrotondaEuro(imponibile * ivaPercentuale / 100);
  const totale = arrotondaEuro(imponibile + ivaImporto);

  return {
    lordo,
    sconto,
    imponibile,
    ivaPercentuale,
    ivaAliquota: ivaPercentuale,
    ivaImporto,
    iva: ivaImporto,
    totale,
  };
}

function chiaveRigaPdf(riga = {}) {
  const normalizzaTesto = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const misure = getMisureRiga(riga);

  return [
    normalizzaTesto(riga.codice ?? riga.codiceTariffa ?? riga.codice_tariffa),
    normalizzaTesto(riga.descrizione),
    normalizzaTesto(getUnitaRiga(riga)),
    calcolaQuantitaRiga(riga).toFixed(4),
    getPrezzoUnitarioRiga(riga).toFixed(4),
    getScontoRiga(riga).toFixed(4),
    misure.partiUguali.toFixed(4),
    misure.lunghezza.toFixed(4),
    misure.larghezza.toFixed(4),
    misure.altezzaPeso.toFixed(4),
  ].join("|");
}

export function deduplicaRighePdf(righe = []) {
  const risultato = [];
  let chiavePrecedente = null;

  for (const riga of Array.isArray(righe) ? righe : []) {
    const chiave = chiaveRigaPdf(riga);
    if (chiave && chiave === chiavePrecedente) continue;
    risultato.push(riga);
    chiavePrecedente = chiave;
  }

  return risultato;
}
