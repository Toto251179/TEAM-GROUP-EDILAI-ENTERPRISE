import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Box,
  Button as MuiButton,
  Chip,
  FormControl,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { azienda } from "../config/azienda";
import { API_BASE_URL, api } from "../services/api";
import { disegnaIntestazioneAzienda } from "../utils/pdfAzienda";

const STATI = ["Bozza", "Inviato", "Accettato", "Rifiutato", "Annullato"];
const IVA_DEFAULT = 22;
const CATEGORIE_COMPUTO = [
  "Edili",
  "Elettriche",
  "Idrauliche",
  "Climatizzazione",
  "Fotovoltaico",
  "Serramenti",
  "Coperture",
  "Sicurezza",
  "Finiture",
  "Demolizioni",
  "Scavi",
];

function backendUrl(pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = API_BASE_URL.replace(/\/api\/?$/i, "");
  if (pathOrUrl.startsWith("/api/")) return `${origin}${pathOrUrl}`;
  return `${API_BASE_URL}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function apriFinestraPdfAttesa(preventivo) {
  const pdfWindow = window.open("", "_blank");
  if (pdfWindow) {
    pdfWindow.document.title = "Apertura PDF";
    pdfWindow.document.body.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 24px;">
        <h1 style="font-size: 18px;">Apertura PDF in corso...</h1>
        <p>Preventivo ${String(preventivo?.numero || preventivo?.id || "").replace(/[<>&]/g, "")}</p>
      </div>
    `;
  }
  return pdfWindow;
}

const preventivoVuoto = {
  id: null,
  numero: "",
  data: new Date().toISOString().split("T")[0],
  clienteId: "",
  idIndirizzo: "",
  indirizzo: null,
  clienteCode: "",
  cliente: "",
  cantiere: "",
  descrizione: "",
  ivaAliquota: IVA_DEFAULT,
  stato: "Bozza",
  righe: [],
};

const rigaVuota = {
  categoria: "Edili",
  categoriaBloccata: true,
  categoriaModificataManualmente: false,
  descrizione: "",
  unita: "mq",
  partiUguali: "",
  lunghezza: "",
  larghezza: "",
  altezzaPeso: "",
  quantita: "1",
  prezzoUnitario: "",
  sconto: "0",
};

function formatEuro(value) {
  const importo = Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (value !== Symbol.for("team-group-unused-format")) return `${importo} €`;
  return `${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("it-IT");
}

function formatNumero(value) {
  return Number(value || 0).toLocaleString("it-IT", {
    maximumFractionDigits: 2,
  });
}

function formatNumeroConDecimali(value) {
  return Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMisuraPdf(riga, campo) {
  const campiMisura = ["partiUguali", "lunghezza", "larghezza", "altezzaPeso"];
  const valoriMisura = campiMisura.map((nomeCampo) => riga[nomeCampo]);
  const sonoTuttiUno = valoriMisura.every((valore) => Number(valore || 0) === 1);

  if (riga[campo] === "" || riga[campo] === null || riga[campo] === undefined) return "";
  if (Number(riga[campo] || 0) === 0) return "";
  if (sonoTuttiUno) return "";
  if (campo !== "partiUguali" && Number(riga[campo] || 0) === 1) return "";

  return campo === "partiUguali" ? formatNumero(riga[campo]) : formatNumeroConDecimali(riga[campo]);
}

function calcolaQuantitaRiga(riga) {
  const campiMisura = [riga.partiUguali, riga.lunghezza, riga.larghezza, riga.altezzaPeso];
  const usaMisure = campiMisura.some((valore) => valore !== undefined && valore !== "" && numeroPreventivo(valore) !== 0);

  if (!usaMisure) return numeroPreventivo(riga.quantita);

  const [partiUguali, lunghezza, larghezza, altezzaPeso] = campiMisura.map((valore) => {
    const numero = numeroPreventivo(valore);
    return numero > 0 ? numero : 1;
  });
  return Number((partiUguali * lunghezza * larghezza * altezzaPeso).toFixed(2));
}

function calcolaLordoRiga(riga) {
  const quantita = calcolaQuantitaRiga(riga);
  const prezzoUnitario = numeroPreventivo(riga.prezzoUnitario);

  return Number((quantita * prezzoUnitario).toFixed(2));
}

function calcolaImportoRiga(riga) {
  const sconto = numeroPreventivo(riga.sconto);

  return Number((calcolaLordoRiga(riga) * (1 - sconto / 100)).toFixed(2));
}

function numeroPreventivo(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "")
    .trim()
    .replace(/[^\d,.-]/g, "");

  if (!raw) return 0;

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
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPrezzoUnitarioRiga(riga) {
  return numeroPreventivo(riga.prezzoUnitario ?? riga.prezzo_unitario);
}

function getScontoRiga(riga) {
  return numeroPreventivo(riga.sconto);
}

function getQuantitaPdfRiga(riga) {
  const quantitaCalcolata = calcolaQuantitaRiga(riga);
  if (quantitaCalcolata > 0) return quantitaCalcolata;

  const quantitaEsplicita = numeroPreventivo(riga.quantita);
  if (quantitaEsplicita > 0) return quantitaEsplicita;

  const unita = String(riga.unita || "").toLowerCase();
  const totaleEsplicito = numeroPreventivo(riga.totaleRiga ?? riga.importo ?? riga.totale);
  const prezzo = getPrezzoUnitarioRiga(riga);

  if (prezzo > 0 && totaleEsplicito > 0) return Number((totaleEsplicito / prezzo).toFixed(2));
  if (unita.includes("corpo")) return 1;

  return 0;
}

function getImportoPdfRiga(riga) {
  const totaleEsplicito = numeroPreventivo(riga.totaleRiga ?? riga.importo ?? riga.totale);
  if (totaleEsplicito > 0) return Number(totaleEsplicito.toFixed(2));

  const quantita = getQuantitaPdfRiga(riga);
  const prezzo = getPrezzoUnitarioRiga(riga);
  const sconto = getScontoRiga(riga);

  return Number((quantita * prezzo * (1 - sconto / 100)).toFixed(2));
}

function calcolaTotaliPdf(righe = [], ivaAliquota = IVA_DEFAULT) {
  const imponibile = Number(righe.reduce((totale, riga) => totale + getImportoPdfRiga(riga), 0).toFixed(2));
  const aliquota = normalizzaIvaAliquota(ivaAliquota);
  const iva = Number((imponibile * (aliquota / 100)).toFixed(2));
  const totale = Number((imponibile + iva).toFixed(2));

  return { imponibile, iva, totale, ivaAliquota: aliquota };
}

function normalizzaIvaAliquota(ivaAliquota) {
  const valore = Number(String(ivaAliquota ?? "").replace(",", "."));
  return Number.isFinite(valore) && valore >= 0 ? valore : IVA_DEFAULT;
}

function calcolaTotali(righe = [], ivaAliquota = IVA_DEFAULT) {
  const lordo = Number(righe.reduce((totale, riga) => totale + calcolaLordoRiga(riga), 0).toFixed(2));
  const imponibile = Number(righe.reduce((totale, riga) => totale + calcolaImportoRiga(riga), 0).toFixed(2));
  const sconto = Number((lordo - imponibile).toFixed(2));
  const aliquota = normalizzaIvaAliquota(ivaAliquota);
  const iva = Number((imponibile * (aliquota / 100)).toFixed(2));
  const totale = Number((imponibile + iva).toFixed(2));

  return { lordo, sconto, imponibile, iva, totale, ivaAliquota: aliquota };
}

function normalizzaRiga(riga) {
  const rigaConMisure = {
    ...riga,
    categoria: riga.categoria || "Edili",
    categoriaBloccata: riga.categoriaBloccata !== false,
    categoriaModificataManualmente: Boolean(riga.categoriaModificataManualmente),
    partiUguali: riga.partiUguali === "" || riga.partiUguali === null || riga.partiUguali === undefined ? "" : Number(riga.partiUguali),
    lunghezza: riga.lunghezza === "" || riga.lunghezza === null || riga.lunghezza === undefined ? "" : Number(riga.lunghezza),
    larghezza: riga.larghezza === "" || riga.larghezza === null || riga.larghezza === undefined ? "" : Number(riga.larghezza),
    altezzaPeso: riga.altezzaPeso === "" || riga.altezzaPeso === null || riga.altezzaPeso === undefined ? "" : Number(riga.altezzaPeso),
  };
  const quantita = calcolaQuantitaRiga(rigaConMisure);

  return {
    ...rigaConMisure,
    quantita,
    prezzoUnitario: Number(riga.prezzoUnitario || 0),
    sconto: Number(riga.sconto || 0),
    totale: calcolaImportoRiga({ ...rigaConMisure, quantita }),
  };
}

function generaNumeroPreventivo(preventivi) {
  const prefisso = "PREV-";
  const progressivi = preventivi
    .map((preventivo) => preventivo.numero || "")
    .map((numero) => {
      const match = String(numero).match(/PREV-(?:\d{4}-)?(\d+)/);
      return match ? Number(match[1]) : Number.NaN;
    })
    .filter((numero) => !Number.isNaN(numero));
  const prossimo = progressivi.length ? Math.max(...progressivi) + 1 : 1;

  return `${prefisso}${String(prossimo).padStart(4, "0")} -Rev00`;
}

function formatNumeroPreventivo(numero) {
  const valore = String(numero || "").trim();
  const match = valore.match(/PREV-(?:\d{4}-)?(\d+)/);
  if (!match) return valore;

  const revisioneTrovata = valore.match(/\bRev[._\s-]*(\d+)/i)?.[1];
  const revisione = revisioneTrovata && revisioneTrovata.length <= 2 ? revisioneTrovata : "00";
  return `PREV-${match[1]} -Rev${String(revisione).padStart(2, "0")}`;
}

function formatIndirizzoCompleto(indirizzo) {
  if (!indirizzo) return "";
  return [formatViaCivico(indirizzo), indirizzo.cap, indirizzo.comune].filter(Boolean).join(", ");
}

function formatViaCivico(indirizzo) {
  if (!indirizzo) return "";
  return [indirizzo.via, indirizzo.civico].filter(Boolean).join(" ");
}

function getClienteNome(preventivo, clientiArchivio = []) {
  const cliente = preventivo.cliente;
  const clienteId = preventivo.clienteId || preventivo.idCliente || cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));
  const nomeCliente = typeof cliente === "object" && cliente !== null
    ? cliente.ragioneSociale || cliente.ragione_sociale || cliente.nome || cliente.denominazione || ""
    : cliente;
  return String(
    nomeCliente ||
    preventivo.clienteNome ||
    preventivo.nomeCliente ||
    clienteDaArchivio?.ragioneSociale ||
    clienteDaArchivio?.ragione_sociale ||
    clienteDaArchivio?.nome ||
    "",
  ).replace(/^ID\s*\d+\s*-\s*/i, "").trim();
}

function normalizzaViaPreventivo(value) {
  if (!value) return "";
  if (typeof value === "object") {
    return [value.via || value.indirizzo || "", value.civico || ""].filter(Boolean).join(" ");
  }
  return String(value).trim();
}

function getClienteVia(preventivo, clientiArchivio = []) {
  const clienteId = preventivo.clienteId || preventivo.idCliente || preventivo.cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));

  return (
    normalizzaViaPreventivo(preventivo.clienteVia) ||
    normalizzaViaPreventivo(preventivo.cliente?.via) ||
    normalizzaViaPreventivo(preventivo.cliente?.indirizzo) ||
    normalizzaViaPreventivo(preventivo.cliente?.address) ||
    normalizzaViaPreventivo(preventivo.cliente?.sede) ||
    normalizzaViaPreventivo(clienteDaArchivio?.via) ||
    normalizzaViaPreventivo(clienteDaArchivio?.indirizzo) ||
    normalizzaViaPreventivo(clienteDaArchivio?.address) ||
    normalizzaViaPreventivo(clienteDaArchivio?.sede) ||
    normalizzaViaPreventivo(preventivo.via) ||
    normalizzaViaPreventivo(preventivo.indirizzo)
  );
}

function getClienteCode(preventivo, clientiArchivio = []) {
  const clienteId = preventivo.clienteId || preventivo.idCliente || preventivo.cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));
  const nomePreventivo = String(preventivo.clienteNome || preventivo.cliente || "").trim().toLowerCase();
  const clienteDaNome = clientiArchivio.find(
    (item) => String(item.ragioneSociale || item.ragione_sociale || item.nome || "").trim().toLowerCase() === nomePreventivo,
  );

  return String(
    preventivo.clienteCode ||
    preventivo.cliente?.clienteCode ||
    clienteDaArchivio?.clienteCode ||
    clienteDaNome?.clienteCode ||
    "",
  ).trim();
}

function disegnaRiquadroClienteCode(doc, clienteCode) {
  if (!clienteCode) return;
  const x = 164;
  const y = 16;
  const width = 36;
  const height = 18;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.3);
  doc.rect(x, y, width, height);
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  doc.text(String(clienteCode), x + width / 2, y + height / 2 + 1, { align: "center" });
}

function indirizzoDaCliente(cliente, idIndirizzo) {
  const indirizzi = Array.isArray(cliente?.indirizzi) ? cliente.indirizzi : [];
  return indirizzi.find((indirizzo) => String(indirizzo.id) === String(idIndirizzo)) || null;
}

function generaNumeroRevisione(numero) {
  const valore = formatNumeroPreventivo(numero);
  const match = valore.match(/PREV-(\d+)\s*-\s*Rev(\d+)/i);
  if (!match) return valore;

  const revisione = Number(match[2]);
  return `PREV-${match[1]} -Rev${String(revisione + 1).padStart(2, "0")}`;
}

function generaNumeroFattura() {
  return `FAT-${new Date().getFullYear()}-${Date.now()}`;
}

function esportaCsv(nomeFile, intestazioni, righe) {
  const escapeCsv = (valore) => `"${String(valore ?? "").replaceAll('"', '""')}"`;
  const contenuto = [intestazioni, ...righe]
    .map((rigaCsv) => rigaCsv.map(escapeCsv).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${contenuto}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = nomeFile;
  link.click();
  URL.revokeObjectURL(url);
}

function Preventivi() {
  const [preventivi, setPreventivi] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [form, setForm] = useState(preventivoVuoto);
  const [riga, setRiga] = useState(rigaVuota);
  const [ricercaPrezzario, setRicercaPrezzario] = useState("");
  const [vociPrezzario, setVociPrezzario] = useState([]);
  const [caricamentoPrezzario, setCaricamentoPrezzario] = useState(false);
  const [ricerca, setRicerca] = useState("");
  const [filtroClienteCode, setFiltroClienteCode] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroNumeroPreventivo, setFiltroNumeroPreventivo] = useState("");
  const [filtroStato, setFiltroStato] = useState("Tutti");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [archivioInCorso, setArchivioInCorso] = useState("");
  const [menuAzioni, setMenuAzioni] = useState({ anchorEl: null, preventivo: null });

  const menuAzioniAperto = Boolean(menuAzioni.anchorEl);
  const actionButtonSx = {
    width: 96,
    minWidth: 96,
    height: 34,
    px: 1.5,
    justifyContent: "center",
    whiteSpace: "nowrap",
    fontWeight: 700,
    borderRadius: "6px",
    textTransform: "none",
  };

  const apriMenuAzioni = (event, preventivo) => {
    setMenuAzioni({ anchorEl: event.currentTarget, preventivo });
  };

  const chiudiMenuAzioni = () => {
    setMenuAzioni({ anchorEl: null, preventivo: null });
  };

  const eseguiAzioneMenu = (azione) => {
    const preventivo = menuAzioni.preventivo;
    chiudiMenuAzioni();
    if (preventivo) azione(preventivo);
  };

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaDati() {
      try {
        const preventiviDb = await api.get("/preventivi");
        const [clientiResult, cantieriResult] = await Promise.allSettled([
          api.get("/clienti"),
          api.get("/cantieri"),
        ]);
        const clientiDb = clientiResult.status === "fulfilled" ? clientiResult.value : [];
        const cantieriDb = cantieriResult.status === "fulfilled" ? cantieriResult.value : [];

        if (componenteAttivo) {
          setErrore("");
          const params = new URLSearchParams(window.location.search);
          const clientePrefill = params.get("clienteId")
            ? {
                clienteId: params.get("clienteId") || "",
                idIndirizzo: params.get("idIndirizzo") || "",
                clienteCode: params.get("clienteCode") || "",
                cliente: params.get("cliente") || "",
                cantiere: "",
              }
            : null;

          const vocePrezzarioRaw = localStorage.getItem("teamGroupVocePrezzario");
          let vocePrezzario = null;

          try {
            vocePrezzario = vocePrezzarioRaw ? JSON.parse(vocePrezzarioRaw) : null;
          } catch {
            vocePrezzario = null;
          }

          if (vocePrezzarioRaw) localStorage.removeItem("teamGroupVocePrezzario");

          setPreventivi(preventiviDb);
          setClienti(clientiDb);
          setCantieri(cantieriDb);
          if (vocePrezzario) {
            setRiga({
              elencoPrezziId: vocePrezzario.id,
              codice: vocePrezzario.codice,
              categoria: vocePrezzario.categoria || "Edili",
              categoriaBloccata: true,
              categoriaModificataManualmente: false,
              descrizione: vocePrezzario.descrizione,
              unita: vocePrezzario.unita || "pz",
              partiUguali: "",
              lunghezza: "",
              larghezza: "",
              altezzaPeso: "",
              quantita: "1",
              prezzoUnitario: Number(vocePrezzario.prezzoUnitario || 0),
              sconto: "0",
            });
            setRicercaPrezzario(vocePrezzario.codice || "");
          }
          setForm((corrente) => ({
            ...corrente,
            numero: generaNumeroPreventivo(preventiviDb),
            clienteId: clientePrefill?.clienteId || corrente.clienteId,
            clienteCode: clientePrefill?.clienteCode || corrente.clienteCode,
            cliente: clientePrefill?.cliente || corrente.cliente,
            cantiere: clientePrefill?.cantiere || corrente.cantiere,
            idIndirizzo:
              clientePrefill?.idIndirizzo ||
              clientiDb.find((cliente) => String(cliente.id) === String(clientePrefill?.clienteId))?.indirizzi?.[0]?.id ||
              corrente.idIndirizzo,
            indirizzo:
              clientiDb.find((cliente) => String(cliente.id) === String(clientePrefill?.clienteId))?.indirizzi?.[0] ||
              corrente.indirizzo,
          }));
        }
      } catch (error) {
        if (componenteAttivo) setErrore(error.message);
      } finally {
        if (componenteAttivo) setCaricamento(false);
      }
    }

    caricaDati();

    return () => {
      componenteAttivo = false;
    };
  }, []);

  useEffect(() => {
    let componenteAttivo = true;
    const ricercaPulita = ricercaPrezzario.trim();

    async function cercaPrezzario() {
      if (ricercaPulita.length < 2) {
        setVociPrezzario([]);
        return;
      }

      setCaricamentoPrezzario(true);

      try {
        const risultati = await api.get(`/elenco-prezzi?veneto=true&q=${encodeURIComponent(ricercaPulita)}&limit=25`);
        if (componenteAttivo) setVociPrezzario(risultati.filter((voce) => voce.attivo));
      } catch (error) {
        if (componenteAttivo) setErrore(error.message);
      } finally {
        if (componenteAttivo) setCaricamentoPrezzario(false);
      }
    }

    const timer = setTimeout(cercaPrezzario, 250);

    return () => {
      componenteAttivo = false;
      clearTimeout(timer);
    };
  }, [ricercaPrezzario]);

  const totaliForm = useMemo(() => calcolaTotali(form.righe, form.ivaAliquota), [form.righe, form.ivaAliquota]);

  const preventiviFiltrati = useMemo(
    () =>
      preventivi.filter((preventivo) => {
        const testo = [
          preventivo.numero,
          getClienteCode(preventivo, clienti),
          preventivo.clienteCode,
          preventivo.cliente,
          preventivo.clienteNome,
          preventivo.cantiere,
          preventivo.descrizione,
          preventivo.stato,
        ]
          .join(" ")
          .toLowerCase();
        const passaRicerca = testo.includes(ricerca.toLowerCase());
        const passaClienteCode =
          !filtroClienteCode.trim() ||
          getClienteCode(preventivo, clienti).toLowerCase().includes(filtroClienteCode.trim().toLowerCase());
        const passaCliente =
          !filtroCliente.trim() ||
          [preventivo.cliente, preventivo.clienteNome].join(" ").toLowerCase().includes(filtroCliente.trim().toLowerCase());
        const passaNumero =
          !filtroNumeroPreventivo.trim() ||
          formatNumeroPreventivo(preventivo.numero).toLowerCase().includes(filtroNumeroPreventivo.trim().toLowerCase());
        const passaStato = filtroStato === "Tutti" || preventivo.stato === filtroStato;

        return passaRicerca && passaClienteCode && passaCliente && passaNumero && passaStato;
      }),
    [preventivi, ricerca, filtroClienteCode, filtroCliente, filtroNumeroPreventivo, filtroStato, clienti],
  );

  const riepilogo = useMemo(
    () => ({
      totalePreventivi: preventiviFiltrati.length,
      imponibile: preventiviFiltrati.reduce((totale, preventivo) => totale + Number(preventivo.importo || 0), 0),
      accettati: preventiviFiltrati.filter((preventivo) => preventivo.stato === "Accettato").length,
      bozze: preventiviFiltrati.filter((preventivo) => preventivo.stato === "Bozza").length,
    }),
    [preventiviFiltrati],
  );

  const indirizziClienteForm = useMemo(() => {
    const cliente = clienti.find((item) => String(item.id) === String(form.clienteId));
    return Array.isArray(cliente?.indirizzi) ? cliente.indirizzi : [];
  }, [clienti, form.clienteId]);

  const aggiornaVistaDaDatabase = async () => {
    const preventiviDb = await api.get("/preventivi");
    const [clientiResult, cantieriResult] = await Promise.allSettled([
      api.get("/clienti"),
      api.get("/cantieri"),
    ]);

    setPreventivi(preventiviDb);
    if (clientiResult.status === "fulfilled") setClienti(clientiResult.value);
    if (cantieriResult.status === "fulfilled") setCantieri(cantieriResult.value);

    return { preventiviDb, clientiDb: clientiResult.value || [], cantieriDb: cantieriResult.value || [] };
  };

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const selezionaCliente = (clienteId) => {
    const cliente = clienti.find((item) => String(item.id) === String(clienteId));
    const primoIndirizzo = Array.isArray(cliente?.indirizzi) ? cliente.indirizzi[0] : null;
    setForm((corrente) => ({
      ...corrente,
      clienteId,
      clienteCode: cliente?.clienteCode || "",
      cliente: cliente?.ragioneSociale || corrente.cliente,
      idIndirizzo: primoIndirizzo?.id || "",
      indirizzo: primoIndirizzo || null,
    }));
  };

  const selezionaIndirizzo = (idIndirizzo) => {
    const cliente = clienti.find((item) => String(item.id) === String(form.clienteId));
    setForm((corrente) => ({
      ...corrente,
      idIndirizzo,
      indirizzo: indirizzoDaCliente(cliente, idIndirizzo),
    }));
  };

  const selezionaCantiere = (nome) => {
    const cantiere = cantieri.find((item) => item.nome === nome);
    setForm((corrente) => ({
      ...corrente,
      cantiere: nome,
      cliente: cantiere?.cliente || corrente.cliente,
    }));
  };

  const aggiungiRiga = () => {
    if (!riga.descrizione || !riga.quantita || !riga.prezzoUnitario) return;

    setForm((corrente) => ({
      ...corrente,
      righe: [...corrente.righe, normalizzaRiga(riga)],
    }));
    setRiga(rigaVuota);
  };

  const selezionaVocePrezzario = (voceId) => {
    const voce = vociPrezzario.find((item) => String(item.id) === String(voceId));
    if (!voce) return;

    setRiga({
      elencoPrezziId: voce.id,
      codice: voce.codice,
      categoria: voce.categoria || "Edili",
      categoriaBloccata: true,
      categoriaModificataManualmente: false,
      descrizione: voce.descrizione,
      unita: voce.unita || "pz",
      partiUguali: "",
      lunghezza: "",
      larghezza: "",
      altezzaPeso: "",
      quantita: "1",
      prezzoUnitario: Number(voce.prezzoUnitario || 0),
      sconto: "0",
    });
  };

  const aggiornaRigaPreventivo = (index, campo, valore) => {
    setForm((corrente) => ({
      ...corrente,
      righe: corrente.righe.map((item, itemIndex) =>
        itemIndex === index ? normalizzaRiga({ ...item, [campo]: valore }) : item,
      ),
    }));
  };

  const abilitaCambioCategoriaRiga = (index) => {
    setForm((corrente) => ({
      ...corrente,
      righe: corrente.righe.map((item, itemIndex) =>
        itemIndex === index ? { ...item, categoriaBloccata: false } : item,
      ),
    }));
  };

  const cambiaCategoriaRiga = (index, categoria) => {
    setForm((corrente) => ({
      ...corrente,
      righe: corrente.righe.map((item, itemIndex) =>
        itemIndex === index
          ? normalizzaRiga({
              ...item,
              categoria,
              categoriaBloccata: true,
              categoriaModificataManualmente: true,
            })
          : item,
      ),
    }));
  };

  const rimuoviRiga = (index) => {
    setForm((corrente) => ({
      ...corrente,
      righe: corrente.righe.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const duplicaRiga = (index) => {
    setForm((corrente) => {
      const rigaDaDuplicare = corrente.righe[index];
      if (!rigaDaDuplicare) return corrente;

      const righe = [...corrente.righe];
      righe.splice(index + 1, 0, normalizzaRiga({ ...rigaDaDuplicare }));

      return { ...corrente, righe };
    });
  };

  const spostaRiga = (index, direzione) => {
    setForm((corrente) => {
      const nuovoIndex = index + direzione;
      if (nuovoIndex < 0 || nuovoIndex >= corrente.righe.length) return corrente;

      const righe = [...corrente.righe];
      const [rigaSpostata] = righe.splice(index, 1);
      righe.splice(nuovoIndex, 0, rigaSpostata);

      return { ...corrente, righe };
    });
  };

  const resetForm = (preventiviBase = preventivi) => {
    setForm({
      ...preventivoVuoto,
      numero: generaNumeroPreventivo(preventiviBase),
      data: new Date().toISOString().split("T")[0],
    });
    setRiga(rigaVuota);
    setMessaggio("");
  };

  const modificaPreventivo = (preventivo) => {
    setForm({
      id: preventivo.id,
      numero: formatNumeroPreventivo(preventivo.numero),
      data: String(preventivo.data || new Date().toISOString()).slice(0, 10),
      clienteId: preventivo.clienteId || "",
      idIndirizzo: preventivo.idIndirizzo || "",
      indirizzo: preventivo.indirizzo || null,
      clienteCode: preventivo.clienteCode || "",
      cliente: preventivo.cliente || "",
      cantiere: preventivo.cantiere || "",
      descrizione: preventivo.descrizione || "",
      ivaAliquota: normalizzaIvaAliquota(preventivo.ivaAliquota),
      stato: preventivo.stato || "Bozza",
      righe: (preventivo.righe || []).map(normalizzaRiga),
    });
    setRiga(rigaVuota);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const archiviaPreventivoPdf = async (preventivo) => {
    setErrore("");
    setMessaggio("");
    setMessaggio("");
    setArchivioInCorso(String(preventivo.id));

    try {
      const risposta = await api.post(`/preventivi/${preventivo.id}/archivia-pdf`, {});
      setMessaggio(risposta.message || "Preventivo archiviato correttamente.");
      await aggiornaVistaDaDatabase();
      return risposta;
    } catch (error) {
      setErrore(error.message);
      return null;
    } finally {
      setArchivioInCorso("");
    }
  };

  const apriCartellaPreventivo = async (preventivo) => {
    setErrore("");
    setMessaggio("");

    try {
      await api.post(`/preventivi/${preventivo.id}/apri-cartella`, {});
    } catch (error) {
      setErrore(error.message);
    }
  };

  const apriPdfDaUrl = async (pdfUrl, nuovaScheda, preventivo) => {
    const endpoint = backendUrl(pdfUrl);
    console.info("Apertura PDF preventivo", {
      endpoint,
      id: preventivo?.id,
      numero: preventivo?.numero,
      revisione: preventivo?.revisione,
    });
    const response = await fetch(endpoint);
    const contentType = response.headers.get("content-type") || "";
    console.info("Risposta PDF preventivo", {
      endpoint,
      status: response.status,
      contentType,
      id: preventivo?.id,
      numero: preventivo?.numero,
      revisione: preventivo?.revisione,
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = contentType.includes("application/json")
          ? JSON.stringify(await response.json())
          : await response.text();
      } catch {
        detail = "";
      }
      const message = response.status === 404
        ? "PDF non trovato"
        : `Errore PDF HTTP ${response.status}${detail ? ` - ${detail.slice(0, 300)}` : ""}`;
      console.error("Errore apertura PDF", { status: response.status, endpoint, detail });
      throw new Error(message);
    }

    if (!contentType.includes("application/pdf")) {
      const text = await response.text();
      console.error("Risposta PDF non valida", { status: response.status, endpoint, contentType, detail: text.slice(0, 300) });
      throw new Error(`Risposta non PDF: ${contentType}. Dettaglio: ${text.slice(0, 300)}`);
    }

    const blob = await response.blob();
    if (!blob.size) {
      console.error("File PDF vuoto", { status: response.status, endpoint, contentType });
      throw new Error("Il PDF restituito è vuoto.");
    }
    console.info("Blob PDF preventivo", {
      endpoint,
      status: response.status,
      contentType,
      size: blob.size,
      id: preventivo?.id,
      numero: preventivo?.numero,
      revisione: preventivo?.revisione,
    });

    const objectUrl = URL.createObjectURL(blob);
    if (nuovaScheda && !nuovaScheda.closed) {
      nuovaScheda.location.href = objectUrl;
    } else {
      window.open(objectUrl, "_blank");
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return { contentType, size: blob.size };
  };

  const apriPdfPreventivo = async (preventivo) => {
    setErrore("");
    setMessaggio("");
    const nuovaScheda = apriFinestraPdfAttesa(preventivo);

    try {
      await apriPdfDaUrl(`/api/preventivi/${preventivo.id}/pdf`, nuovaScheda, preventivo);
      setMessaggio("PDF aperto");
    } catch (error) {
      if (nuovaScheda && !nuovaScheda.closed) nuovaScheda.close();
      console.error("Errore apertura PDF preventivo", {
        id: preventivo?.id,
        numero: preventivo?.numero,
        revisione: preventivo?.revisione,
        message: error.message,
      });
      setErrore(error.message);
    }
  };

  const salvaPreventivo = async (statoForzato) => {
    if (!form.cliente || !form.descrizione || form.righe.length === 0) {
      setErrore("Inserisci cliente, oggetto lavori e almeno una riga lavorazione.");
      return;
    }
    if (!form.clienteId) {
      setErrore("Seleziona cliente dall'anagrafica.");
      return;
    }

    setErrore("");
    const clienteSelezionato = clienti.find((clienteItem) => String(clienteItem.id) === String(form.clienteId));
    const clienteNome = getClienteNome({ ...form, cliente: clienteSelezionato || form.cliente }, clienti);
    const clienteVia = getClienteVia({ ...form, cliente: clienteSelezionato || form.cliente }, clienti);
    const clienteCode = getClienteCode({ ...form, cliente: clienteSelezionato || form.cliente }, clienti);

    const payload = {
      clienteId: clienteSelezionato?.id || form.clienteId || null,
      idIndirizzo: form.idIndirizzo || null,
      clienteNome,
      clienteVia,
      clienteCode,
      numero: formatNumeroPreventivo(form.numero) || generaNumeroPreventivo(preventivi),
      data: form.data,
      cliente: clienteNome || form.cliente,
      cantiere: form.cantiere,
      descrizione: form.descrizione,
      ivaAliquota: normalizzaIvaAliquota(form.ivaAliquota),
      stato: statoForzato || form.stato,
      righe: form.righe.map((rigaPreventivo) => normalizzaRiga({ ...rigaPreventivo, categoriaBloccata: true })),
    };

    try {
      let salvato;
      if (form.id) {
        salvato = await api.put(`/preventivi/${form.id}`, payload);
      } else {
        salvato = await api.post("/preventivi", payload);
      }

      if (payload.stato === "Accettato") {
        await api.post(`/preventivi/${salvato.id}/accetta`, {});
        await aggiornaVistaDaDatabase();
        window.location.href = "/cantieri";
        return;
      }

      await archiviaPreventivoPdf(salvato);
      const { preventiviDb } = await aggiornaVistaDaDatabase();
      resetForm(preventiviDb);
    } catch (error) {
      await aggiornaVistaDaDatabase().catch(() => {});
      setErrore(error.message);
    }
  };

  const eliminaPreventivo = async (preventivo) => {
    const conferma = window.confirm(`Eliminare il preventivo ${preventivo.numero}?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.delete(`/preventivi/${preventivo.id}`);
      await aggiornaVistaDaDatabase();
      if (form.id === preventivo.id) resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const aggiornaStato = async (preventivo, stato) => {
    setErrore("");

    try {
      if (stato === "Accettato") {
        await api.post(`/preventivi/${preventivo.id}/accetta`, {});
        await aggiornaVistaDaDatabase();
        window.location.href = "/cantieri";
        return;
      }

      await api.put(`/preventivi/${preventivo.id}`, { stato });
      await aggiornaVistaDaDatabase();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const accettaECreaCantiere = async (preventivo) => {
    const conferma = window.confirm(`Trasformare il preventivo ${preventivo.numero} in cantiere?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.post(`/preventivi/${preventivo.id}/accetta`, {});
      await aggiornaVistaDaDatabase();
      window.location.href = "/cantieri";
    } catch (error) {
      setErrore(error.message);
    }
  };

  const generaFatturaDaPreventivo = async (preventivo) => {
    if (preventivo.stato !== "Accettato") {
      setErrore("Puoi generare la fattura solo da un preventivo accettato.");
      return;
    }

    const conferma = window.confirm(`Generare una fattura attiva dal preventivo ${preventivo.numero}?`);
    if (!conferma) return;

    const totali = calcolaTotali(preventivo.righe || [], preventivo.ivaAliquota);
    const importo = totali.totale || Number(preventivo.importo || 0) * (1 + normalizzaIvaAliquota(preventivo.ivaAliquota) / 100);

    setErrore("");

    try {
      await api.post("/fatture", {
        numero: generaNumeroFattura(),
        tipo: "Attiva",
        data: new Date().toISOString().split("T")[0],
        cantiere: preventivo.cantiere,
        clienteCode: getClienteCode(preventivo, clienti),
        soggetto: preventivo.cliente,
        importo,
        stato: "Da Pagare",
      });
      alert("Fattura generata correttamente.");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const creaRevisionePreventivo = async (preventivo) => {
    const numeroCorrente = formatNumeroPreventivo(preventivo.numero);
    const numeroRevisione = generaNumeroRevisione(preventivo.numero);
    const conferma = window.confirm(
      `Creare la revisione ${numeroRevisione} e annullare ${numeroCorrente}?`,
    );
    if (!conferma) return;

    setErrore("");

    const payload = {
      clienteId: preventivo.clienteId || null,
      idIndirizzo: preventivo.idIndirizzo || null,
      clienteNome: getClienteNome(preventivo, clienti),
      clienteVia: getClienteVia(preventivo, clienti),
      clienteCode: getClienteCode(preventivo, clienti),
      numero: numeroRevisione,
      data: new Date().toISOString().split("T")[0],
      cliente: preventivo.cliente,
      cantiere: preventivo.cantiere,
      descrizione: preventivo.descrizione,
      ivaAliquota: normalizzaIvaAliquota(preventivo.ivaAliquota),
      stato: "Bozza",
      righe: (preventivo.righe || []).map(normalizzaRiga),
    };

    try {
      await api.put(`/preventivi/${preventivo.id}`, { stato: "Annullato" });
      const creato = await api.post("/preventivi", payload);
      await aggiornaVistaDaDatabase();
      modificaPreventivo(creato);
    } catch (error) {
      setErrore(error.message);
    }
  };

  const generaPDF = async (preventivo) => {
    setErrore("");
    setMessaggio("");
    setArchivioInCorso(String(preventivo.id));
    const nuovaScheda = apriFinestraPdfAttesa(preventivo);

    try {
      const risposta = await api.post(`/preventivi/${preventivo.id}/pdf`, {});
      if (!risposta?.success || !risposta?.pdfUrl) {
        throw new Error("Errore generazione PDF");
      }
      await apriPdfDaUrl(risposta.pdfUrl, nuovaScheda, preventivo);
      setMessaggio("PDF generato e aperto");
      await aggiornaVistaDaDatabase();
    } catch (error) {
      if (nuovaScheda && !nuovaScheda.closed) nuovaScheda.close();
      console.error("Errore generazione PDF", {
        status: error.status,
        endpoint: `/api/preventivi/${preventivo.id}/pdf`,
        error: error.message,
      });
      setErrore(error.message || "Errore generazione PDF");
    } finally {
      setArchivioInCorso("");
    }
    return;

    const doc = new jsPDF();
    const righe = preventivo.righe || [];
    const totaliPdf = calcolaTotaliPdf(righe, preventivo.ivaAliquota);
    let y = 18;

    await disegnaIntestazioneAzienda(doc, y);
    disegnaRiquadroClienteCode(doc, getClienteCode(preventivo, clienti));
    y = 42;

    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.setTextColor(255, 0, 0);
    doc.text("PREVENTIVO", 105, y, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");
    y += 10;

    const commessa = formatNumeroPreventivo(preventivo.numero);
    doc.setFontSize(8.3);
    const dettaglioX = 8;
    const dettaglioValoreX = 28;
    const dettaglioValoreMaxWidth = 164;
    [
      ["Cliente:", getClienteNome(preventivo, clienti)],
      ["Via:", getClienteVia(preventivo, clienti)],
      ["Oggetto:", preventivo.descrizione || ""],
      ["Commessa:", commessa],
    ].forEach(([label, value]) => {
      const righeValore = doc.splitTextToSize(String(value), dettaglioValoreMaxWidth);
      doc.setFont(undefined, "bolditalic");
      doc.text(label, dettaglioX, y);
      doc.setFont(undefined, "bold");
      doc.text(righeValore, dettaglioValoreX, y);
      y += Math.max(4.8, righeValore.length * 4.2);
    });
    doc.setFont(undefined, "normal");

    y += 5;

    const computoRows = [];

    righe.forEach((rigaPdf, index) => {
      const descrizione = rigaPdf.descrizione || "";
      const parti = formatMisuraPdf(rigaPdf, "partiUguali");
      const lunghezza = formatMisuraPdf(rigaPdf, "lunghezza");
      const larghezza = formatMisuraPdf(rigaPdf, "larghezza");
      const altezzaPeso = formatMisuraPdf(rigaPdf, "altezzaPeso");
      const quantita = formatNumeroConDecimali(getQuantitaPdfRiga(rigaPdf));
      const prezzo = formatEuro(getPrezzoUnitarioRiga(rigaPdf));
      const importo = formatEuro(getImportoPdfRiga(rigaPdf));

      computoRows.push(
        [
          rigaPdf.codice || index + 1,
          descrizione,
          parti,
          lunghezza,
          larghezza,
          altezzaPeso,
          "",
          "",
          "",
        ],
        ["", `SOMMANO a ${rigaPdf.unita || ""}`, "", "", "", "", quantita, prezzo, importo],
      );
    });

    autoTable(doc, {
      startY: y,
      head: [
        [
          { content: "Num.Ord.\nTARIFFA", rowSpan: 2 },
          { content: "DESIGNAZIONE DEI LAVORI", rowSpan: 2 },
          { content: "D I M E N S I O N I", colSpan: 4 },
          { content: "Quantita", rowSpan: 2 },
          { content: "I M P O R T I", colSpan: 2 },
        ],
        ["par.ug.", "lung.", "larg.", "H/peso", "unitario", "TOTALE"],
      ],
      body: computoRows,
      theme: "grid",
      styles: {
        fontSize: 7.2,
        cellPadding: { top: 1.3, right: 0.8, bottom: 1.3, left: 0.8 },
        overflow: "linebreak",
        valign: "top",
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: { top: 0, right: 0.12, bottom: 0, left: 0.12 },
      },
      headStyles: {
        fillColor: [244, 177, 131],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        halign: "center",
        lineColor: [0, 0, 0],
        lineWidth: 0.15,
      },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" },
        1: { cellWidth: 80 },
        2: { cellWidth: 12, halign: "center" },
        3: { cellWidth: 12, halign: "right" },
        4: { cellWidth: 12, halign: "right" },
        5: { cellWidth: 12, halign: "right" },
        6: { cellWidth: 12, halign: "right" },
        7: { cellWidth: 15, halign: "right" },
        8: { cellWidth: 16, halign: "right" },
      },
      margin: { left: 8, right: 8 },
      didParseCell: (data) => {
        const rawRow = data.row.raw || [];
        const isSommano = typeof rawRow[1] === "string" && rawRow[1].startsWith("SOMMANO");

        if (data.row.section === "body" && isSommano) {
          data.cell.styles.fontStyle = data.column.index === 1 ? "italic" : "normal";
          if (data.column.index === 1) data.cell.styles.halign = "right";
          if ([6, 7, 8].includes(data.column.index)) data.cell.styles.fontStyle = "normal";
        }
        if (data.row.section === "body") {
          data.cell.styles.lineWidth = { top: 0, right: 0.12, bottom: 0, left: 0.12 };
        }
      },
    });

    const tabellaComputo = doc.lastAutoTable;
    y = tabellaComputo.finalY;

    if (y > 235) {
      doc.addPage();
      y = 20;
    }

    const larghezzaTabella = tabellaComputo?.columns?.reduce((somma, colonna) => somma + Number(colonna.width || 0), 0);
    const totaleX = tabellaComputo?.settings?.margin?.left || 8;
    const totaleY = y + 2;
    const totaleWidth = larghezzaTabella || 184;
    const totaleHeight = 5.2;
    const totaleImportoWidth = 20;
    const totaleImportoX = totaleX + totaleWidth - totaleImportoWidth;

    doc.setFillColor(244, 177, 131);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.18);
    doc.rect(totaleX, totaleY, totaleWidth, totaleHeight, "FD");
    doc.line(totaleImportoX, totaleY, totaleImportoX, totaleY + totaleHeight);
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");
    doc.text("TOTALE", totaleImportoX - 7, totaleY + 3.7, { align: "right" });
    doc.text(formatEuro(totaliPdf.imponibile), totaleX + totaleWidth - 1.2, totaleY + 3.7, {
      align: "right",
    });
    doc.setFont(undefined, "normal");

    y = totaleY + totaleHeight + 10;
    if (y > 235) {
      doc.addPage();
      y = 20;
    }

    doc.setFont(undefined, "bold");
    doc.setFontSize(8.4);
    doc.text("CONDIZIONI DI FORNITURA:", 14, y);
    doc.setFont(undefined, "normal");
    y += 6;
    [
      "- Importi IVA esclusa.",
      "- Pagamento: da concordare.",
      "- Validita offerta: 15 giorni.",
      "- Inizio lavori: da concordare.",
    ].forEach((rigaCondizione) => {
      doc.text(rigaCondizione, 14, y);
      y += 4.4;
    });

    if (y > 245) {
      doc.addPage();
      y = 24;
    } else {
      y += 4;
    }

    doc.setFont(undefined, "bold");
    doc.text("ESCLUSIONI:", 14, y);
    doc.setFont(undefined, "normal");
    y += 7;
    [
      "- La stesura e presentazione agli Enti preposti delle pratiche necessarie all'esecuzione delle opere ed ogni altro annesso.",
      "- Oneri per richieste di allacciamenti agli enti competenti ed eventuali opere edili accessorie.",
      "- Eventuali opere aggiuntive e non espressamente indicate nella presente offerta, richieste dagli Enti interessati.",
      "- Tutto quanto non espressamente citato nella presente offerta.",
    ].forEach((rigaEsclusione) => {
      const split = doc.splitTextToSize(rigaEsclusione, 182);
      doc.text(split, 14, y);
      y += split.length * 4.4 + 1.4;
    });

    y += 2;
    if (y > 245) {
      doc.addPage();
      y = 24;
    }

    doc.setFont(undefined, "bold");
    doc.text("NOTE:", 14, y);
    doc.setFont(undefined, "normal");
    y += 7;
    const noteX = 14;
    [
      "- Eventuali lavori extra eseguiti, non espressamente citati nella presente, saranno richiesti dalla Committente e regolarmente assegnati previa accettazione di relativo preventivo Extra dedicato.",
      '- I lavori oggetto del presente preventivo vengono affidati al Fornitore "A MISURA".',
      "- La Committente dovra mettere a disposizione dell'Impresa energia elettrica e acqua, ai fini dell'esecuzione delle opere.",
    ].forEach((rigaNota) => {
      const split = doc.splitTextToSize(rigaNota, 182);
      split.forEach((rigaSpezzata) => {
        doc.text(rigaSpezzata, noteX, y);
        y += 4.4;
      });
      y += 1.4;
    });

    y += 18;
    if (y > 272) {
      doc.addPage();
      y = 24;
    }
    doc.setFont(undefined, "bolditalic");
    doc.text("Vicenza,", 154, y);
    doc.text(formatDate(preventivo.data || new Date()), 178, y);
    y += 6;
    doc.setFont(undefined, "bold");
    doc.text(azienda.ragioneSociale, 178, y, { align: "center" });
    doc.setFont(undefined, "normal");

    const pageCount = doc.internal.getNumberOfPages();
    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      doc.setPage(pageIndex);
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.setFont(undefined, "italic");
      doc.text(`Pagina ${pageIndex} di ${pageCount}`, 105, 286, { align: "center" });
      doc.setTextColor(40, 85, 155);
      doc.text(azienda.sede, 105, 293, { align: "center" });
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, "normal");
    }

    doc.save(`${formatNumeroPreventivo(preventivo.numero) || "preventivo"}.pdf`);
  };

  const esportaElencoPreventivi = () => {
    esportaCsv(
      `elenco-preventivi-${new Date().toISOString().slice(0, 10)}.csv`,
      ["ID Cliente", "Numero", "Data", "Cliente", "Cantiere", "Oggetto", "Righe", "Lordo", "Sconto", "Imponibile", "IVA %", "IVA", "Totale", "Stato"],
      preventiviFiltrati.map((preventivo) => {
        const righe = preventivo.righe || [];
        const totali = calcolaTotali(righe, preventivo.ivaAliquota);

        return [
          getClienteCode(preventivo, clienti),
          formatNumeroPreventivo(preventivo.numero),
          formatDate(preventivo.data),
          preventivo.cliente,
          preventivo.cantiere,
          preventivo.descrizione,
          righe.length,
          totali.lordo,
          totali.sconto,
          totali.imponibile || preventivo.importo,
          totali.ivaAliquota,
          totali.iva,
          totali.totale || Number(preventivo.importo || 0) * (1 + totali.ivaAliquota / 100),
          preventivo.stato,
        ];
      }),
    );
  };

  const esportaComputoCsv = (preventivo) => {
    esportaCsv(
      `computo-${formatNumeroPreventivo(preventivo.numero) || "preventivo"}.csv`,
      [
        "N.",
        "Codice",
        "Categoria",
        "Descrizione",
        "UM",
        "Parti uguali",
        "Lunghezza",
        "Larghezza",
        "Altezza/Peso",
        "Quantita",
        "Prezzo unitario",
        "Sconto %",
        "Importo",
      ],
      (preventivo.righe || []).map((rigaCsv, index) => [
        index + 1,
        rigaCsv.codice,
        rigaCsv.categoria,
        rigaCsv.descrizione,
        rigaCsv.unita,
        rigaCsv.partiUguali,
        rigaCsv.lunghezza,
        rigaCsv.larghezza,
        rigaCsv.altezzaPeso,
        calcolaQuantitaRiga(rigaCsv),
        rigaCsv.prezzoUnitario,
        rigaCsv.sconto,
        calcolaImportoRiga(rigaCsv),
      ]),
    );
  };

  const righePreventiviGrid = useMemo(
    () =>
      preventiviFiltrati.map((preventivo) => {
        const righe = preventivo.righe || [];
        const totali = calcolaTotali(righe, preventivo.ivaAliquota);
        const imponibile = totali.imponibile || Number(preventivo.importo || 0);
        const totale = totali.totale || Number(preventivo.importo || 0) * (1 + totali.ivaAliquota / 100);

        return {
          ...preventivo,
          id: preventivo.id,
          clienteCodeGrid: getClienteCode(preventivo, clienti),
          numeroFormattato: formatNumeroPreventivo(preventivo.numero),
          dataFormattata: formatDate(preventivo.data),
          oggetto: preventivo.descrizione || "",
          importoGrid: imponibile,
          totaleGrid: totale,
          righeCount: righe.length,
        };
      }),
    [preventiviFiltrati, clienti],
  );

  const colonnePreventiviGrid = useMemo(
    () => [
      {
        field: "clienteCodeGrid",
        headerName: "ID Cliente",
        minWidth: 120,
        flex: 0.55,
      },
      {
        field: "numeroFormattato",
        headerName: "N. Preventivo",
        minWidth: 170,
        flex: 0.8,
      },
      {
        field: "cliente",
        headerName: "Cliente",
        minWidth: 220,
        flex: 1,
      },
      {
        field: "oggetto",
        headerName: "Oggetto",
        minWidth: 300,
        flex: 1.4,
      },
      {
        field: "importoGrid",
        headerName: "Importo",
        minWidth: 140,
        type: "number",
        align: "right",
        headerAlign: "right",
        valueFormatter: (value) => formatEuro(value),
      },
      {
        field: "stato",
        headerName: "Stato",
        minWidth: 140,
        renderCell: (params) => (
          <Chip
            size="small"
            label={params.value || "Bozza"}
            color={params.value === "Accettato" ? "success" : params.value === "Rifiutato" || params.value === "Annullato" ? "error" : "primary"}
            variant={params.value === "Bozza" ? "outlined" : "filled"}
          />
        ),
      },
      {
        field: "dataFormattata",
        headerName: "Data",
        minWidth: 120,
      },
      {
        field: "azioni",
        headerName: "Azioni",
        minWidth: 460,
        flex: 1,
        sortable: false,
        filterable: false,
        renderCell: (params) => {
          const preventivo = params.row;
          return (
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                alignItems: "center",
                justifyContent: "flex-start",
                height: "100%",
                width: "100%",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <MuiButton size="small" variant="outlined" sx={actionButtonSx} onClick={() => modificaPreventivo(preventivo)}>
                Modifica
              </MuiButton>
              <MuiButton size="small" variant="outlined" sx={actionButtonSx} onClick={() => generaPDF(preventivo)}>
                {archivioInCorso === String(preventivo.id) ? "Archivio..." : "PDF"}
              </MuiButton>
              <MuiButton size="small" variant="outlined" sx={actionButtonSx} disabled={preventivo.stato === "Annullato"} onClick={() => creaRevisionePreventivo(preventivo)}>
                Duplica
              </MuiButton>
              <MuiButton size="small" variant="contained" sx={actionButtonSx} onClick={(event) => apriMenuAzioni(event, preventivo)}>
                Altro
              </MuiButton>
            </Stack>
          );
        },
      },
    ],
    [clienti, archivioInCorso],
  );

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <div className="preventivi-page" style={{ width: "100%", maxWidth: "none" }}>
      <h1>Preventivi Enterprise</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Preventivi</h3>
          <h2>{riepilogo.totalePreventivi}</h2>
        </div>
        <div style={card}>
          <h3>Imponibile</h3>
          <h2>{formatEuro(riepilogo.imponibile)}</h2>
        </div>
        <div style={card}>
          <h3>Accettati</h3>
          <h2>{riepilogo.accettati}</h2>
        </div>
        <div style={card}>
          <h3>Bozze</h3>
          <h2>{riepilogo.bozze}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}
      {messaggio && <p style={{ color: "#15803d", marginBottom: "15px", fontWeight: 700 }}>{messaggio}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica Preventivo" : "Nuovo Preventivo"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
          <input
            placeholder="Numero"
            value={form.numero}
            onChange={(e) => aggiornaForm("numero", e.target.value)}
            onBlur={(e) => aggiornaForm("numero", formatNumeroPreventivo(e.target.value))}
          />
          <input type="date" value={form.data} onChange={(e) => aggiornaForm("data", e.target.value)} />

          <select value={form.clienteId} onChange={(e) => selezionaCliente(e.target.value)}>
            <option value="">Cliente da anagrafica</option>
            {clienti.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.ragioneSociale}
              </option>
            ))}
          </select>

          <input placeholder="Cliente" value={form.cliente} onChange={(e) => aggiornaForm("cliente", e.target.value)} />

          <select value={form.idIndirizzo} onChange={(e) => selezionaIndirizzo(e.target.value)} disabled={!indirizziClienteForm.length}>
            <option value="">Indirizzo preventivo</option>
            {indirizziClienteForm.map((indirizzo) => (
              <option key={indirizzo.id} value={indirizzo.id}>
                {formatIndirizzoCompleto(indirizzo)}
              </option>
            ))}
          </select>

          <select value={form.cantiere} onChange={(e) => selezionaCantiere(e.target.value)}>
            <option value="">Cantiere esistente</option>
            {cantieri.map((cantiere) => (
              <option key={cantiere.id} value={cantiere.nome}>
                {cantiere.nome}
              </option>
            ))}
          </select>

          <input placeholder="Cantiere" value={form.cantiere} onChange={(e) => aggiornaForm("cantiere", e.target.value)} />

          <select value={form.stato} onChange={(e) => aggiornaForm("stato", e.target.value)}>
            {STATI.map((stato) => (
              <option key={stato}>{stato}</option>
            ))}
          </select>

          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="IVA %"
            value={form.ivaAliquota}
            onChange={(e) => aggiornaForm("ivaAliquota", e.target.value)}
            onBlur={(e) => aggiornaForm("ivaAliquota", normalizzaIvaAliquota(e.target.value))}
          />
        </div>

        <textarea
          placeholder="Oggetto lavori"
          value={form.descrizione}
          onChange={(e) => aggiornaForm("descrizione", e.target.value)}
          style={{ width: "100%", marginTop: "12px" }}
        />

        {form.indirizzo && (
          <div style={{ marginTop: "10px", color: "#475569", fontWeight: 700 }}>
            Cliente: {getClienteNome(form, clienti)}<br />
            Via: {formatViaCivico(form.indirizzo)}<br />
            CAP: {form.indirizzo.cap || ""}<br />
            Comune: {form.indirizzo.comune || ""}
          </div>
        )}

        <h2 style={{ marginTop: "22px" }}>Righe Lavorazioni</h2>

        <div style={{ background: "#f8fafc", border: "1px solid #edf0f5", borderRadius: "8px", padding: "14px", marginBottom: "14px" }}>
          <h3 style={{ marginBottom: "10px" }}>Cerca nel Prezzario Veneto</h3>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(320px, 2fr)", gap: "10px" }}>
            <input
              placeholder="Cerca codice o lavorazione, esempio: scavo"
              value={ricercaPrezzario}
              onChange={(e) => setRicercaPrezzario(e.target.value)}
            />
            <select defaultValue="" onChange={(e) => selezionaVocePrezzario(e.target.value)}>
              <option value="">
                {caricamentoPrezzario ? "Ricerca in corso..." : "Seleziona voce prezzario"}
              </option>
              {vociPrezzario.map((voce) => (
                <option key={voce.id} value={voce.id}>
                  {voce.codice} - {voce.descrizione} | {voce.unita} | {formatEuro(voce.prezzoUnitario)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ overflowX: "visible" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "130px 150px minmax(500px,1fr) 70px repeat(4,82px) 95px 135px 90px 130px 92px",
              gap: "10px",
              minWidth: "1660px",
            }}
          >
            <input
              placeholder="Codice"
              value={riga.codice || ""}
              onChange={(e) => setRiga({ ...riga, codice: e.target.value })}
            />
            <select value={riga.categoria || "Edili"} onChange={(e) => setRiga({ ...riga, categoria: e.target.value })}>
              {CATEGORIE_COMPUTO.map((categoriaItem) => (
                <option key={categoriaItem} value={categoriaItem}>
                  {categoriaItem}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Descrizione lavorazione"
              value={riga.descrizione}
              onChange={(e) => setRiga({ ...riga, descrizione: e.target.value })}
              style={{ minHeight: "72px", resize: "vertical" }}
            />
            <input placeholder="UM" value={riga.unita} onChange={(e) => setRiga({ ...riga, unita: e.target.value })} />
            <input
              type="number"
              step="0.01"
              placeholder="P. ug."
              value={riga.partiUguali}
              onChange={(e) => setRiga({ ...riga, partiUguali: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Lung."
              value={riga.lunghezza}
              onChange={(e) => setRiga({ ...riga, lunghezza: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Larg."
              value={riga.larghezza}
              onChange={(e) => setRiga({ ...riga, larghezza: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              placeholder="H/Peso"
              value={riga.altezzaPeso}
              onChange={(e) => setRiga({ ...riga, altezzaPeso: e.target.value })}
            />
            <input readOnly value={formatNumero(calcolaQuantitaRiga(riga))} title="Quantita calcolata" />
            <input
              type="number"
              step="0.01"
              placeholder="Prezzo unitario"
              value={riga.prezzoUnitario}
              onChange={(e) => setRiga({ ...riga, prezzoUnitario: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Sconto %"
              value={riga.sconto}
              onChange={(e) => setRiga({ ...riga, sconto: e.target.value })}
            />
            <input readOnly value={formatEuro(calcolaImportoRiga(riga))} />
            <button onClick={aggiungiRiga}>Aggiungi</button>
          </div>
        </div>

        <table width="100%" style={{ borderCollapse: "collapse", marginTop: "15px", minWidth: "1740px", textAlign: "center" }}>
          <thead>
            <tr>
              <th>N.</th>
              <th>Codice</th>
              <th>Categoria</th>
              <th>Descrizione</th>
              <th>UM</th>
              <th>P. Ug.</th>
              <th>Lung.</th>
              <th>Larg.</th>
              <th>H/Peso</th>
              <th>Quantita</th>
              <th>Prezzo Unitario</th>
              <th>Sconto</th>
              <th>Importo</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {form.righe.map((rigaPreventivo, index) => (
              <tr key={`${rigaPreventivo.descrizione}-${index}`}>
                <td>{index + 1}</td>
                <td>
                  <input
                    value={rigaPreventivo.codice || ""}
                    onChange={(e) => aggiornaRigaPreventivo(index, "codice", e.target.value)}
                    style={{ width: "110px" }}
                  />
                </td>
                <td>
                  <div style={{ display: "grid", gap: "6px", minWidth: "150px" }}>
                    <select
                      value={rigaPreventivo.categoria || "Edili"}
                      disabled={rigaPreventivo.categoriaBloccata !== false}
                      onChange={(e) => cambiaCategoriaRiga(index, e.target.value)}
                      style={{ width: "150px" }}
                    >
                      {CATEGORIE_COMPUTO.map((categoriaItem) => (
                        <option key={categoriaItem} value={categoriaItem}>
                          {categoriaItem}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => abilitaCambioCategoriaRiga(index)}
                      style={{ background: "#ffffff", color: "#1565c0", padding: "5px 7px", minHeight: "30px" }}
                    >
                      Cambia categoria
                    </button>
                  </div>
                </td>
                <td>
                  <textarea
                    value={rigaPreventivo.descrizione}
                    onChange={(e) => aggiornaRigaPreventivo(index, "descrizione", e.target.value)}
                    style={{ minHeight: "76px", minWidth: "430px", resize: "vertical", width: "100%" }}
                  />
                </td>
                <td>
                  <input
                    value={rigaPreventivo.unita}
                    onChange={(e) => aggiornaRigaPreventivo(index, "unita", e.target.value)}
                    style={{ width: "70px" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={rigaPreventivo.partiUguali}
                    onChange={(e) => aggiornaRigaPreventivo(index, "partiUguali", e.target.value)}
                    style={{ width: "76px" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={rigaPreventivo.lunghezza}
                    onChange={(e) => aggiornaRigaPreventivo(index, "lunghezza", e.target.value)}
                    style={{ width: "76px" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={rigaPreventivo.larghezza}
                    onChange={(e) => aggiornaRigaPreventivo(index, "larghezza", e.target.value)}
                    style={{ width: "76px" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={rigaPreventivo.altezzaPeso}
                    onChange={(e) => aggiornaRigaPreventivo(index, "altezzaPeso", e.target.value)}
                    style={{ width: "76px" }}
                  />
                </td>
                <td>
                  <input
                    readOnly
                    value={formatNumero(calcolaQuantitaRiga(rigaPreventivo))}
                    style={{ width: "100px" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={rigaPreventivo.prezzoUnitario}
                    onChange={(e) => aggiornaRigaPreventivo(index, "prezzoUnitario", e.target.value)}
                    style={{ width: "120px" }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={rigaPreventivo.sconto}
                    onChange={(e) => aggiornaRigaPreventivo(index, "sconto", e.target.value)}
                    style={{ width: "90px" }}
                  />
                </td>
                <td>{formatEuro(calcolaImportoRiga(rigaPreventivo))}</td>
                <td style={{ minWidth: "260px", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                    <button disabled={index === 0} onClick={() => spostaRiga(index, -1)}>
                      Su
                    </button>
                    <button disabled={index === form.righe.length - 1} onClick={() => spostaRiga(index, 1)}>
                      Giu
                    </button>
                    <button onClick={() => duplicaRiga(index)}>Copia</button>
                    <button onClick={() => rimuoviRiga(index)}>Rimuovi</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: "24px",
            alignItems: "center",
            marginTop: "18px",
            fontWeight: 800,
          }}
        >
          <span>Lordo: {formatEuro(totaliForm.lordo)}</span>
          <span>Sconto: {formatEuro(totaliForm.sconto)}</span>
          <span>Imponibile: {formatEuro(totaliForm.imponibile)}</span>
          <span>IVA {formatNumero(totaliForm.ivaAliquota)}%: {formatEuro(totaliForm.iva)}</span>
          <span>Totale: {formatEuro(totaliForm.totale)}</span>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
          <button onClick={() => salvaPreventivo()}>{form.id ? "Salva Modifiche" : "Salva Preventivo"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <Paper className="preventivi-list-panel" elevation={0} sx={{ width: "100%", maxWidth: "none", p: 2.5, borderRadius: 2, border: "1px solid #e2e8f0" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", md: "center" }, mb: 2 }}>
          <Box>
            <h2 style={{ margin: 0 }}>Elenco Preventivi</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>{righePreventiviGrid.length} preventivi visualizzati</p>
          </Box>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ alignItems: { xs: "stretch", md: "center" } }}>
            <TextField
              size="small"
              label="Ricerca"
              placeholder="ID cliente, numero, cliente o oggetto"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              sx={{ minWidth: 340 }}
            />
            <TextField
              size="small"
              label="ID Cliente"
              value={filtroClienteCode}
              onChange={(e) => setFiltroClienteCode(e.target.value)}
              sx={{ minWidth: 140 }}
            />
            <TextField
              size="small"
              label="Cliente"
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              sx={{ minWidth: 180 }}
            />
            <TextField
              size="small"
              label="Numero Preventivo"
              value={filtroNumeroPreventivo}
              onChange={(e) => setFiltroNumeroPreventivo(e.target.value)}
              sx={{ minWidth: 180 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="preventivi-filtro-stato">Stato</InputLabel>
              <Select
                labelId="preventivi-filtro-stato"
                label="Stato"
                value={filtroStato}
                onChange={(e) => setFiltroStato(e.target.value)}
              >
                <MenuItem value="Tutti">Tutti</MenuItem>
                {STATI.map((stato) => (
                  <MenuItem key={stato} value={stato}>{stato}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <MuiButton variant="contained" onClick={resetForm}>Nuovo</MuiButton>
            <MuiButton variant="outlined" onClick={esportaElencoPreventivi}>Esporta CSV</MuiButton>
          </Stack>
        </Stack>

        <Box sx={{ width: "100%", minHeight: 520, overflow: "hidden" }}>
          <DataGrid
            rows={righePreventiviGrid}
            columns={colonnePreventiviGrid}
            loading={caricamento}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10, page: 0 } },
            }}
            localeText={{
              noRowsLabel: "Nessun preventivo trovato. Crea un nuovo preventivo o modifica i filtri di ricerca.",
              footerRowSelected: (count) => `${count} righe selezionate`,
            }}
            sx={{
              border: "1px solid #e2e8f0",
              width: "100%",
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor: "#f8fafc",
                fontWeight: 800,
              },
              "& .MuiDataGrid-cell": {
                alignItems: "center",
              },
              "& .MuiDataGrid-cell[data-field='azioni']": {
                overflow: "visible",
              },
            }}
          />
          <Menu
            anchorEl={menuAzioni.anchorEl}
            open={menuAzioniAperto}
            onClose={chiudiMenuAzioni}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <MenuItem onClick={() => eseguiAzioneMenu(accettaECreaCantiere)}>Trasforma in Cantiere</MenuItem>
            <MenuItem onClick={() => eseguiAzioneMenu(apriPdfPreventivo)}>Apri PDF</MenuItem>
            <MenuItem sx={{ color: "error.main" }} onClick={() => eseguiAzioneMenu(eliminaPreventivo)}>Elimina</MenuItem>
          </Menu>
        </Box>
      </Paper>

    </div>
  );
}

export default Preventivi;
