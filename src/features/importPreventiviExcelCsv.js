import * as XLSX from "xlsx";
import { API_BASE_URL } from "../services/api";

const TESTO_PULSANTE_EXPORT = "esporta csv";
const ID_PULSANTE = "team-group-importa-preventivi";
const ID_INPUT = "team-group-importa-preventivi-file";

function normalizzaTesto(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizzaChiave(value) {
  return normalizzaTesto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function numero(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!raw) return fallback;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = raw.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDataExcel(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const data = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      return data.toISOString().slice(0, 10);
    }
  }
  const testo = String(value).trim();
  const italiano = testo.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (italiano) return `${italiano[3]}-${italiano[2].padStart(2, "0")}-${italiano[1].padStart(2, "0")}`;
  const data = new Date(testo);
  return Number.isNaN(data.getTime()) ? new Date().toISOString().slice(0, 10) : data.toISOString().slice(0, 10);
}

function valoreRiga(riga, aliases) {
  const mappa = Object.fromEntries(Object.entries(riga).map(([key, value]) => [normalizzaChiave(key), value]));
  for (const alias of aliases) {
    const value = mappa[normalizzaChiave(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizzaCategoria(value) {
  const testo = normalizzaTesto(value);
  const categorie = {
    edili: "Edili",
    elettriche: "Elettriche",
    elettrico: "Elettriche",
    idrauliche: "Idrauliche",
    idraulico: "Idrauliche",
    climatizzazione: "Climatizzazione",
    fotovoltaico: "Fotovoltaico",
    serramenti: "Serramenti",
    coperture: "Coperture",
    sicurezza: "Sicurezza",
    finiture: "Finiture",
    demolizioni: "Demolizioni",
    scavi: "Scavi",
  };
  return categorie[testo] || String(value || "Edili").trim() || "Edili";
}

function normalizzaStato(value) {
  const stato = String(value || "Bozza").trim().toLowerCase();
  const stati = { bozza: "Bozza", inviato: "Inviato", accettato: "Accettato", rifiutato: "Rifiutato", annullato: "Annullato" };
  return stati[stato] || "Bozza";
}

function normalizzaNumeroPreventivo(value) {
  const testo = String(value || "").trim();
  const match = testo.match(/PREV[-\s]*(\d+).*?REV[-\s]*(\d+)/i);
  if (match) return `PREV-${match[1]} -Rev${String(match[2]).padStart(2, "0")}`;
  return testo;
}

function creaIdLocale() {
  return globalThis.crypto?.randomUUID?.() || `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function richiesta(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(data?.message || `Errore HTTP ${response.status}`);
  return data;
}

function leggiFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: "array", cellDates: true });
        const nomeFoglio = workbook.SheetNames.find((nome) => normalizzaTesto(nome) === "import gestionale") || workbook.SheetNames[0];
        if (!nomeFoglio) throw new Error("Il file non contiene fogli leggibili.");
        const righe = XLSX.utils.sheet_to_json(workbook.Sheets[nomeFoglio], { defval: "", raw: true });
        if (!righe.length) throw new Error("Il foglio selezionato non contiene righe da importare.");
        resolve({ nomeFoglio, righe });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Impossibile leggere il file selezionato."));
    reader.readAsArrayBuffer(file);
  });
}

function preparaImportazione(righeOriginali) {
  const righeValide = righeOriginali.filter((riga) => {
    const descrizione = valoreRiga(riga, ["Descrizione", "Descrizione lavori"]);
    const tipo = valoreRiga(riga, ["Tipo riga"]);
    return String(descrizione || tipo).trim();
  });
  if (!righeValide.length) throw new Error("Nessuna lavorazione valida trovata nel file.");

  const prima = righeValide[0];
  const numeroPreventivo = normalizzaNumeroPreventivo(valoreRiga(prima, ["Numero preventivo", "N. Preventivo", "Preventivo"]));
  const clienteNome = String(valoreRiga(prima, ["Cliente", "Ragione sociale"])).trim();
  const clienteCode = String(valoreRiga(prima, ["ID Cliente", "ID cliente", "Codice cliente"])).trim();
  const oggetto = String(valoreRiga(prima, ["Oggetto", "Oggetto lavori", "Descrizione preventivo"])).trim();
  const indirizzo = String(valoreRiga(prima, ["Indirizzo", "Via"])).trim();
  const cantiere = String(valoreRiga(prima, ["Cantiere"])).trim();
  const data = formatDataExcel(valoreRiga(prima, ["Data", "Data preventivo"]));
  const stato = normalizzaStato(valoreRiga(prima, ["Stato"]));
  const ivaRaw = numero(valoreRiga(prima, ["IVA", "IVA %", "Aliquota IVA"]), 22);
  const ivaAliquota = ivaRaw > 0 && ivaRaw <= 1 ? ivaRaw * 100 : ivaRaw;

  if (!numeroPreventivo) throw new Error("Manca il numero del preventivo.");
  if (!clienteNome && !clienteCode) throw new Error("Mancano cliente e ID cliente.");
  if (!oggetto) throw new Error("Manca l'oggetto del preventivo.");

  const righe = righeValide.map((riga, index) => {
    const tipoRaw = String(valoreRiga(riga, ["Tipo riga"])).trim().toUpperCase();
    const tipoRiga = tipoRaw.includes("TITOLO") ? "TITOLO" : tipoRaw.includes("NOTA") ? "NOTA" : "ECONOMICA";
    const descrizione = String(valoreRiga(riga, ["Descrizione", "Descrizione lavori"])).trim();
    if (tipoRiga !== "ECONOMICA") {
      return {
        idLocale: creaIdLocale(),
        tipoRiga,
        descrizione,
        mostraSubtotaleCapitolo: false,
        ordineRiga: index,
      };
    }
    const quantita = numero(valoreRiga(riga, ["Quantità", "Quantita", "Q.tà", "Qta"]), 1);
    const prezzoUnitario = numero(valoreRiga(riga, ["Prezzo unitario", "Prezzo", "P. unitario"]), 0);
    const sconto = numero(valoreRiga(riga, ["Sconto", "Sconto %"]), 0);
    if (!descrizione) throw new Error(`Descrizione mancante alla riga ${index + 2}.`);
    if (quantita <= 0) throw new Error(`Quantità non valida alla riga ${index + 2}.`);
    if (prezzoUnitario < 0) throw new Error(`Prezzo unitario non valido alla riga ${index + 2}.`);
    return {
      idLocale: creaIdLocale(),
      tipoRiga: "ECONOMICA",
      codice: String(valoreRiga(riga, ["Codice voce", "Codice", "Tariffa"])).trim(),
      categoria: normalizzaCategoria(valoreRiga(riga, ["Categoria"])),
      categoriaBloccata: true,
      categoriaModificataManualmente: false,
      descrizione,
      unita: String(valoreRiga(riga, ["U.M.", "UM", "Unità di misura", "Unita"])).trim() || "a corpo",
      partiUguali: "",
      lunghezza: "",
      larghezza: "",
      altezzaPeso: "",
      quantita,
      prezzoUnitario,
      sconto,
      ordineRiga: index,
    };
  });

  const imponibile = righe
    .filter((riga) => riga.tipoRiga === "ECONOMICA")
    .reduce((totale, riga) => totale + numero(riga.quantita, 1) * numero(riga.prezzoUnitario) * (1 - numero(riga.sconto) / 100), 0);

  return { numeroPreventivo, clienteNome, clienteCode, oggetto, indirizzo, cantiere, data, stato, ivaAliquota, righe, imponibile };
}

function trovaCliente(clienti, importazione) {
  const code = normalizzaTesto(importazione.clienteCode);
  const nome = normalizzaTesto(importazione.clienteNome);
  return clienti.find((cliente) => code && normalizzaTesto(cliente.clienteCode) === code)
    || clienti.find((cliente) => nome && normalizzaTesto(cliente.ragioneSociale || cliente.ragione_sociale || cliente.nome) === nome)
    || null;
}

function trovaIndirizzo(cliente, indirizzoImportato) {
  const indirizzi = Array.isArray(cliente?.indirizzi) ? cliente.indirizzi : [];
  if (!indirizzi.length) return null;
  const cercato = normalizzaTesto(indirizzoImportato);
  return indirizzi.find((indirizzo) => {
    const completo = [indirizzo.via, indirizzo.civico, indirizzo.cap, indirizzo.comune].filter(Boolean).join(" ");
    return cercato && (normalizzaTesto(completo).includes(cercato) || cercato.includes(normalizzaTesto(completo)));
  }) || indirizzi[0];
}

function formatEuro(value) {
  return Number(value || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function chiudiModal(modal) {
  modal?.remove();
}

function mostraAnteprima({ file, nomeFoglio, importazione, cliente, duplicato, onConferma }) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px";
  const modal = document.createElement("div");
  modal.style.cssText = "background:#fff;border-radius:14px;max-width:920px;width:100%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.28);font-family:Arial,sans-serif";
  const righeEconomiche = importazione.righe.filter((riga) => riga.tipoRiga === "ECONOMICA");
  modal.innerHTML = `
    <h2 style="margin:0 0 8px">Anteprima importazione preventivo</h2>
    <p style="color:#475569;margin-top:0">File: <strong>${file.name}</strong> · Foglio: <strong>${nomeFoglio}</strong></p>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;background:#f8fafc;padding:14px;border-radius:10px">
      <div><strong>Numero:</strong> ${importazione.numeroPreventivo}</div>
      <div><strong>Data:</strong> ${importazione.data}</div>
      <div><strong>Cliente:</strong> ${importazione.clienteNome || cliente?.ragioneSociale || ""}</div>
      <div><strong>ID cliente:</strong> ${importazione.clienteCode || cliente?.clienteCode || ""}</div>
      <div style="grid-column:1/-1"><strong>Oggetto:</strong> ${importazione.oggetto}</div>
      <div><strong>Stato:</strong> ${importazione.stato}</div>
      <div><strong>IVA:</strong> ${importazione.ivaAliquota}%</div>
      <div><strong>Righe economiche:</strong> ${righeEconomiche.length}</div>
      <div><strong>Imponibile calcolato:</strong> ${formatEuro(importazione.imponibile)}</div>
    </div>
    ${duplicato ? `<div style="margin-top:14px;padding:12px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;color:#9a3412"><strong>Attenzione:</strong> esiste già un preventivo con questo numero. Confermando verrà aggiornato.</div>` : ""}
    <div style="margin-top:16px;max-height:280px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;background:#eaf2fb"><tr><th style="padding:8px;text-align:left">Codice</th><th style="padding:8px;text-align:left">Descrizione</th><th style="padding:8px">Q.tà</th><th style="padding:8px;text-align:right">Prezzo</th><th style="padding:8px;text-align:right">Importo</th></tr></thead>
        <tbody>${righeEconomiche.slice(0, 100).map((riga) => `<tr style="border-top:1px solid #e2e8f0"><td style="padding:7px">${riga.codice || ""}</td><td style="padding:7px">${riga.descrizione}</td><td style="padding:7px;text-align:center">${riga.quantita}</td><td style="padding:7px;text-align:right">${formatEuro(riga.prezzoUnitario)}</td><td style="padding:7px;text-align:right">${formatEuro(numero(riga.quantita, 1) * numero(riga.prezzoUnitario) * (1 - numero(riga.sconto) / 100))}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    <div data-import-status style="margin-top:14px;color:#475569"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
      <button data-annulla type="button" style="padding:10px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;cursor:pointer">Annulla</button>
      <button data-conferma type="button" style="padding:10px 16px;border:0;background:#1565c0;color:#fff;border-radius:7px;font-weight:700;cursor:pointer">${duplicato ? "Aggiorna preventivo" : "Conferma importazione"}</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  modal.querySelector("[data-annulla]").addEventListener("click", () => chiudiModal(overlay));
  overlay.addEventListener("click", (event) => { if (event.target === overlay) chiudiModal(overlay); });
  modal.querySelector("[data-conferma]").addEventListener("click", async () => {
    const button = modal.querySelector("[data-conferma]");
    const status = modal.querySelector("[data-import-status]");
    button.disabled = true;
    status.textContent = "Importazione in corso...";
    try {
      await onConferma();
      status.style.color = "#15803d";
      status.textContent = "Preventivo importato correttamente. La pagina verrà aggiornata.";
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      button.disabled = false;
      status.style.color = "#b91c1c";
      status.textContent = error.message;
    }
  });
}

async function gestisciFile(file) {
  const { nomeFoglio, righe } = await leggiFile(file);
  const importazione = preparaImportazione(righe);
  const [clienti, preventivi] = await Promise.all([
    richiesta("/clienti"),
    richiesta("/preventivi"),
  ]);
  const cliente = trovaCliente(clienti, importazione);
  if (!cliente) {
    throw new Error(`Cliente ${importazione.clienteCode || importazione.clienteNome} non trovato in anagrafica. Crearlo prima dell'importazione.`);
  }
  const indirizzo = trovaIndirizzo(cliente, importazione.indirizzo);
  const duplicato = preventivi.find((preventivo) => normalizzaNumeroPreventivo(preventivo.numero) === importazione.numeroPreventivo);
  const clienteVia = indirizzo ? [indirizzo.via, indirizzo.civico].filter(Boolean).join(" ") : importazione.indirizzo;
  const payload = {
    clienteId: cliente.id,
    idIndirizzo: indirizzo?.id || null,
    clienteNome: cliente.ragioneSociale || importazione.clienteNome,
    clienteVia,
    clienteCode: cliente.clienteCode || importazione.clienteCode,
    numero: importazione.numeroPreventivo,
    data: importazione.data,
    cliente: cliente.ragioneSociale || importazione.clienteNome,
    cantiere: importazione.cantiere,
    descrizione: importazione.oggetto,
    ivaAliquota: importazione.ivaAliquota,
    stato: importazione.stato,
    righe: importazione.righe,
  };

  mostraAnteprima({
    file,
    nomeFoglio,
    importazione,
    cliente,
    duplicato,
    onConferma: async () => {
      const salvato = duplicato
        ? await richiesta(`/preventivi/${duplicato.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await richiesta("/preventivi", { method: "POST", body: JSON.stringify(payload) });
      try {
        await richiesta(`/preventivi/${salvato.id}/pdf`, { method: "POST", body: JSON.stringify({}) });
      } catch (error) {
        console.warn("Preventivo importato, ma PDF non generato automaticamente", error);
      }
    },
  });
}

function creaControlliImportazione(bottoneExport) {
  if (document.getElementById(ID_PULSANTE)) return;
  const input = document.createElement("input");
  input.id = ID_INPUT;
  input.type = "file";
  input.accept = ".xlsx,.xls,.csv";
  input.hidden = true;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      await gestisciFile(file);
    } catch (error) {
      window.alert(`Importazione non riuscita: ${error.message}`);
    }
  });

  const button = bottoneExport.cloneNode(false);
  button.id = ID_PULSANTE;
  button.type = "button";
  button.textContent = "Importa Excel/CSV";
  button.addEventListener("click", () => input.click());
  bottoneExport.parentElement?.insertBefore(button, bottoneExport);
  bottoneExport.parentElement?.insertBefore(input, bottoneExport);
}

function cercaPulsanteExport() {
  if (!window.location.pathname.toLowerCase().includes("preventiv")) return;
  const bottone = [...document.querySelectorAll("button")].find((elemento) => normalizzaTesto(elemento.textContent) === TESTO_PULSANTE_EXPORT);
  if (bottone) creaControlliImportazione(bottone);
}

const observer = new MutationObserver(cercaPulsanteExport);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("DOMContentLoaded", cercaPulsanteExport);
cercaPulsanteExport();
