import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  MapPin,
  PackageSearch,
  Save,
  Search,
  Upload,
} from "lucide-react";
import AziendaHeader from "../components/AziendaHeader";
import { api } from "../services/api";

const TIPI_COSTO = [
  "Materiali",
  "Manodopera",
  "Noleggi",
  "Attrezzature",
  "Mezzi/Trasferte",
  "Sicurezza",
  "Altri costi",
  "Da classificare",
];

const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function numero(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function dataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function pick(row, names) {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const found = entries.find(([key]) => String(key).trim().toLowerCase() === name.toLowerCase());
    if (found && found[1] !== undefined && found[1] !== null && found[1] !== "") return found[1];
  }
  return "";
}

function normalizzaRigaFoglio(row, index) {
  const descrizione = pick(row, ["DESCRIZIONE", "descrizione", "lavorazione", "voce", "articolo", "materiale"]);
  const codice = pick(row, ["CODICE", "codice", "cod.", "articolo"]);
  const unita = pick(row, ["UM", "U.M.", "unita", "unità", "unita misura", "unità di misura"]);
  const quantita = pick(row, ["QUANTITÀ", "quantita", "quantità", "q.tà", "qta"]);
  const prezzo = pick(row, ["PREZZO UNITARIO", "prezzo unitario", "prezzo", "p.u.", "pu"]);
  const importo = pick(row, ["IMPORTO", "importo", "totale", "tot"]);
  const tipo = pick(row, ["TIPO COSTO", "tipo costo", "categoria", "tipo"]);
  const fonte = pick(row, ["FONTE FOGLIO", "fonte", "source"]);
  const stato = pick(row, ["STATO", "stato"]);

  return {
    id: pick(row, ["ID", "N.", "N", "numero"]) || index + 1,
    ordine: index,
    codice: String(codice || "").trim(),
    descrizione: String(descrizione || "").trim(),
    unita: String(unita || "").trim(),
    quantita: numero(quantita),
    prezzoUnitario: numero(prezzo),
    importo: numero(importo) || numero(quantita) * numero(prezzo),
    tipoCosto: String(tipo || "Da classificare").trim(),
    fonte: String(fonte || "").trim(),
    fonteTitolo: "",
    fonteUrl: "",
    fonteData: "",
    stato: String(stato || (numero(prezzo) > 0 ? "OK" : "Da verificare")).trim(),
    componenti: {},
    cronoprogramma: {},
    criticita: numero(prezzo) > 0 ? [] : ["Prezzo unitario mancante"],
    controllo: {
      wbsCodice: "WBS-" + String(index + 1).padStart(3, "0"),
      budgetOperativo: numero(importo) || numero(quantita) * numero(prezzo),
      avanzamentoPct: 0,
      quantitaEseguita: 0,
    },
    note: "",
  };
}

function generaNumeroPreventivo(preventivi) {
  const progressivi = (preventivi || [])
    .map((item) => String(item.numero || ""))
    .map((value) => {
      const match = value.match(/PREV-(?:\d{4}-)?(\d+)/);
      return match ? Number(match[1]) : Number.NaN;
    })
    .filter((value) => Number.isFinite(value));
  const next = progressivi.length ? Math.max(...progressivi) + 1 : 1;
  return "PREV-" + String(next).padStart(4, "0") + " -Rev00";
}

function cardStyle() {
  return {
    background: "#fff",
    border: "1px solid #dbe3ee",
    borderRadius: "10px",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(15,23,42,.05)",
  };
}

function AnalisiCosti() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [analisiId, setAnalisiId] = useState(null);
  const [fileNome, setFileNome] = useState("");
  const [fileMime, setFileMime] = useState("");
  const [fileDataUrl, setFileDataUrl] = useState("");
  const [titolo, setTitolo] = useState("Analisi Costi");
  const [voci, setVoci] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [cantiereId, setCantiereId] = useState("");
  const [preventivoId, setPreventivoId] = useState(null);
  const [revisioni, setRevisioni] = useState([]);
  const [confronto, setConfronto] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [portfolio, setPortfolio] = useState([]);
  const [impegni, setImpegni] = useState([]);
  const [varianti, setVarianti] = useState([]);
  const [nuovoImpegno, setNuovoImpegno] = useState({
    wbsCodice: "",
    categoria: "Subappalto",
    fornitore: "",
    descrizione: "",
    importo: "",
    stato: "Impegnato",
  });
  const [nuovaVariante, setNuovaVariante] = useState({
    codice: "",
    descrizione: "",
    importo: "",
    impattoCosti: "",
    impattoGiorni: "",
    stato: "Proposta",
  });
  const [storico, setStorico] = useState([]);
  const [storicoId, setStoricoId] = useState("");
  const [tab, setTab] = useState("voci");
  const [ricerca, setRicerca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("Tutti");
  const [filtroStato, setFiltroStato] = useState("Tutti");
  const [selezionata, setSelezionata] = useState(0);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [caricamento, setCaricamento] = useState(false);
  const [analizzando, setAnalizzando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [sede, setSede] = useState("Vicenza (VI)");
  const [destinazione, setDestinazione] = useState("");
  const [costoManodoperaOra, setCostoManodoperaOra] = useState(28);
  const [speseGeneraliPct, setSpeseGeneraliPct] = useState(20);
  const [marginePct, setMarginePct] = useState(10);
  const [kmAndataRitorno, setKmAndataRitorno] = useState(0);
  const [numeroViaggi, setNumeroViaggi] = useState(0);
  const [costoKm, setCostoKm] = useState(0.55);
  const [pedaggi, setPedaggi] = useState(0);
  const [pastiPernotti, setPastiPernotti] = useState(0);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [clientiDb, cantieriDb, storicoDb] = await Promise.all([
          api.get("/clienti"),
          api.get("/cantieri"),
          api.get("/analisi-costi"),
        ]);
        setClienti(Array.isArray(clientiDb) ? clientiDb : []);
        setCantieri(Array.isArray(cantieriDb) ? cantieriDb : []);
        setStorico(Array.isArray(storicoDb) ? storicoDb : []);
      } catch {
        // La pagina resta utilizzabile anche se storico/clienti non sono disponibili.
      }
    }
    bootstrap();
  }, []);

  const cliente = useMemo(
    () => clienti.find((item) => String(item.id) === String(clienteId)) || null,
    [clienti, clienteId],
  );

  const costoTrasferteExtra = useMemo(
    () =>
      numero(kmAndataRitorno) * numero(numeroViaggi) * numero(costoKm) +
      numero(pedaggi) +
      numero(pastiPernotti),
    [kmAndataRitorno, numeroViaggi, costoKm, pedaggi, pastiPernotti],
  );

  const riepilogo = useMemo(() => {
    const somma = (tipi) =>
      voci
        .filter((voce) => tipi.includes(voce.tipoCosto))
        .reduce((tot, voce) => tot + numero(voce.importo), 0);

    const materiali = somma(["Materiali"]);
    const noleggi = somma(["Noleggi", "Attrezzature"]);
    const manodopera = somma(["Manodopera"]);
    const altri = somma(["Mezzi/Trasferte", "Sicurezza", "Altri costi"]) + costoTrasferteExtra;
    const diretto = materiali + noleggi + manodopera + altri;
    const speseGenerali = diretto * (numero(speseGeneraliPct) / 100);
    const baseMargine = diretto + speseGenerali;
    const margine = baseMargine * (numero(marginePct) / 100);
    const vendita = baseMargine + margine;
    const daVerificare = voci.filter((voce) => voce.stato !== "OK").length;
    const criticita = voci.reduce((count, voce) => count + (Array.isArray(voce.criticita) ? voce.criticita.length : 0), 0);

    return {
      materiali,
      noleggi,
      manodopera,
      altri,
      diretto,
      speseGenerali,
      margine,
      vendita,
      daVerificare,
      criticita,
    };
  }, [voci, costoTrasferteExtra, speseGeneraliPct, marginePct]);

  const vociFiltrate = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    return voci.filter((voce) => {
      const matchText =
        !q ||
        [voce.codice, voce.descrizione, voce.unita, voce.tipoCosto, voce.fonte]
          .join(" ")
          .toLowerCase()
          .includes(q);
      const matchTipo = filtroTipo === "Tutti" || voce.tipoCosto === filtroTipo;
      const matchStato = filtroStato === "Tutti" || voce.stato === filtroStato;
      return matchText && matchTipo && matchStato;
    });
  }, [voci, ricerca, filtroTipo, filtroStato]);

  const voceSelezionata = voci[selezionata] || null;

  const cronoprogramma = useMemo(
    () =>
      voci
        .map((voce, index) => ({
          index,
          descrizione: voce.descrizione,
          persone: numero(voce.cronoprogramma?.persone),
          oreTotali: numero(voce.cronoprogramma?.oreTotali),
          giorni: numero(voce.cronoprogramma?.giorni),
          sequenza: numero(voce.cronoprogramma?.sequenza) || index + 1,
        }))
        .filter((item) => item.oreTotali || item.giorni)
        .sort((a, b) => a.sequenza - b.sequenza),
    [voci],
  );

  const oreUomoTotali = cronoprogramma.reduce((tot, item) => tot + item.oreTotali, 0);
  const giorniTotali = cronoprogramma.reduce((tot, item) => tot + item.giorni, 0);

  function aggiornaVoce(index, campo, valore) {
    setVoci((correnti) =>
      correnti.map((voce, i) => {
        if (i !== index) return voce;
        const next = { ...voce, [campo]: valore };
        if (campo === "quantita" || campo === "prezzoUnitario") {
          next.importo = numero(next.quantita) * numero(next.prezzoUnitario);
        }
        if (campo === "prezzoUnitario") {
          next.stato = numero(valore) > 0 ? "OK" : "Da verificare";
          next.criticita = numero(valore) > 0
            ? (next.criticita || []).filter((item) => item !== "Prezzo unitario mancante")
            : Array.from(new Set([...(next.criticita || []), "Prezzo unitario mancante"]));
        }
        return next;
      }),
    );
  }

  function aggiornaControlloVoce(index, campo, valore) {
    setVoci((correnti) =>
      correnti.map((voce, i) => {
        if (i !== index) return voce;
        const controllo = {
          ...(voce.controllo || {}),
          [campo]: valore,
        };
        return { ...voce, controllo };
      }),
    );
  }

  function confermaVoce(index) {
    setVoci((correnti) =>
      correnti.map((voce, i) =>
        i === index
          ? { ...voce, stato: "OK", criticita: (voce.criticita || []).filter((item) => item !== "Prezzo unitario mancante") }
          : voce,
      ),
    );
  }

  function eliminaVoce(index) {
    setVoci((correnti) => correnti.filter((_, i) => i !== index).map((voce, i) => ({ ...voce, ordine: i })));
    setSelezionata(0);
  }

  async function caricaDocumento(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrore("");
    setMessaggio("");
    setCaricamento(true);

    try {
      const lower = file.name.toLowerCase();
      const encoded = await dataUrl(file);
      setFileNome(file.name);
      setFileMime(file.type || "application/octet-stream");
      setFileDataUrl(encoded);

      let payload;

      if (/\.(xlsx|xls|xlsm|csv|ods)$/.test(lower)) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheetName = workbook.SheetNames.includes("AI_COSTI_IMPORT")
          ? "AI_COSTI_IMPORT"
          : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
          range: sheetName === "AI_COSTI_IMPORT" ? 3 : 0,
        });
        const normalized = rows
          .map(normalizzaRigaFoglio)
          .filter((row) => row.descrizione || row.codice || row.importo);

        payload = await api.post("/analisi-costi/analizza-documento", {
          fileName: file.name,
          mimeType: file.type,
          rows: normalized,
        });
      } else if (/\.(txt|rtf)$/.test(lower) || file.type.startsWith("text/")) {
        payload = await api.post("/analisi-costi/analizza-documento", {
          fileName: file.name,
          mimeType: file.type,
          textContent: await file.text(),
        });
      } else {
        payload = await api.post("/analisi-costi/analizza-documento", {
          fileName: file.name,
          mimeType: file.type,
          dataUrl: encoded,
        });
      }

      setTitolo(payload.titolo || file.name);
      setVoci((payload.voci || []).map((voce, index) => ({ ...voce, ordine: index })));
      setAnalisiId(null);
      setPreventivoId(null);
      setTab("voci");
      setMessaggio("Documento letto. Ora puoi eseguire l'analisi dettagliata dei costi.");
    } catch (error) {
      setErrore(error.message || "Impossibile leggere il documento.");
    } finally {
      setCaricamento(false);
      event.target.value = "";
    }
  }

  async function analizzaCosti() {
    if (!voci.length) {
      setErrore("Carica prima un documento con almeno una lavorazione.");
      return;
    }

    setErrore("");
    setMessaggio("");
    setAnalizzando(true);

    try {
      const result = await api.post("/analisi-costi/analizza-voci", {
        settings: {
          sede,
          destinazione,
          costoManodoperaOra,
          speseGeneraliPct,
          marginePct,
          kmAndataRitorno,
          numeroViaggi,
          costoKm,
          pedaggi,
          pastiPernotti,
        },
        voci,
      });

      setVoci((result.voci || []).map((voce, index) => ({ ...voce, ordine: index })));
      setMessaggio(
        result.modalita === "ai-web"
          ? "Analisi completata con confronto prezzi locali e ricerca web."
          : "Analisi completata con i dati locali disponibili.",
      );
      setTab("dettaglio");
    } catch (error) {
      setErrore(error.message || "Analisi costi non riuscita.");
    } finally {
      setAnalizzando(false);
    }
  }

  async function calcolaDistanza() {
    setErrore("");
    try {
      const result = await api.post("/analisi-costi/distanza", {
        origine: sede,
        destinazione,
      });
      if (result.kmAndataRitorno) setKmAndataRitorno(result.kmAndataRitorno);
      if (result.modalita === "manuale") {
        setMessaggio("Percorrenza automatica non disponibile: inserisci manualmente i km A/R.");
      } else {
        setMessaggio("Percorrenza calcolata automaticamente.");
      }
    } catch (error) {
      setErrore(error.message || "Calcolo percorso non riuscito.");
    }
  }

  function payloadAnalisi() {
    return {
      titolo,
      fileName: fileNome,
      fileMime,
      fileDataUrl,
      clienteId: clienteId || null,
      clienteNome: cliente?.ragioneSociale || cliente?.ragione_sociale || "",
      cantiereId: cantiereId || null,
      preventivoId,
      sede,
      destinazione,
      costoManodoperaOra,
      speseGeneraliPct,
      marginePct,
      kmAndataRitorno,
      numeroViaggi,
      costoKm,
      pedaggi,
      pastiPernotti,
      stato: riepilogo.daVerificare ? "DA VERIFICARE" : "CONFERMATA",
      voci,
    };
  }

  async function caricaControlloEnterprise(id) {
    if (!id) {
      setDashboard(null);
      setImpegni([]);
      setVarianti([]);
      return null;
    }

    try {
      const data = await api.get("/analisi-costi/" + id + "/dashboard");
      setDashboard(data || null);
      setImpegni(Array.isArray(data?.impegni) ? data.impegni : []);
      setVarianti(Array.isArray(data?.varianti) ? data.varianti : []);
      return data;
    } catch {
      setDashboard(null);
      return null;
    }
  }

  async function salvaAnalisi() {
    if (!voci.length) {
      setErrore("Non ci sono voci da salvare.");
      return null;
    }

    setSalvando(true);
    setErrore("");
    try {
      const saved = analisiId
        ? await api.put("/analisi-costi/" + analisiId, payloadAnalisi())
        : await api.post("/analisi-costi", payloadAnalisi());

      setAnalisiId(saved.id);
      setMessaggio("Analisi costi salvata nel database.");
      const [storicoDb, revDb, confDb] = await Promise.all([
        api.get("/analisi-costi"),
        api.get("/analisi-costi/" + saved.id + "/revisioni"),
        api.get("/analisi-costi/" + saved.id + "/confronto"),
      ]);
      setStorico(Array.isArray(storicoDb) ? storicoDb : []);
      setRevisioni(Array.isArray(revDb) ? revDb : []);
      setConfronto(confDb || null);
      await caricaControlloEnterprise(saved.id);
      return saved;
    } catch (error) {
      setErrore(error.message || "Salvataggio non riuscito.");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function apriAnalisiSalvata(id) {
    if (!id) return;
    setCaricamento(true);
    setErrore("");
    try {
      const saved = await api.get("/analisi-costi/" + id);
      setAnalisiId(saved.id);
      setTitolo(saved.titolo || "Analisi Costi");
      setFileNome(saved.fileName || "");
      setFileMime(saved.fileMime || "");
      setFileDataUrl(saved.fileDataUrl || "");
      setClienteId(saved.clienteId || "");
      setCantiereId(saved.cantiereId || "");
      setPreventivoId(saved.preventivoId || null);
      setSede(saved.sede || "Vicenza (VI)");
      setDestinazione(saved.destinazione || "");
      setCostoManodoperaOra(saved.costoManodoperaOra ?? 28);
      setSpeseGeneraliPct(saved.speseGeneraliPct ?? 20);
      setMarginePct(saved.marginePct ?? 10);
      setKmAndataRitorno(saved.kmAndataRitorno || 0);
      setNumeroViaggi(saved.numeroViaggi || 0);
      setCostoKm(saved.costoKm || 0.55);
      setPedaggi(saved.pedaggi || 0);
      setPastiPernotti(saved.pastiPernotti || 0);
      setVoci(saved.voci || []);
      const [revDb, confDb] = await Promise.all([
        api.get("/analisi-costi/" + saved.id + "/revisioni"),
        api.get("/analisi-costi/" + saved.id + "/confronto"),
      ]);
      setRevisioni(Array.isArray(revDb) ? revDb : []);
      setConfronto(confDb || null);
      await caricaControlloEnterprise(saved.id);
      setMessaggio("Analisi salvata caricata.");
    } catch (error) {
      setErrore(error.message || "Impossibile aprire l'analisi.");
    } finally {
      setCaricamento(false);
    }
  }

  async function salvaSuPreventivo() {
    if (!clienteId) {
      setErrore("Seleziona il cliente prima di generare il preventivo.");
      return;
    }
    if (!voci.length) {
      setErrore("Non ci sono lavorazioni da trasferire al preventivo.");
      return;
    }

    setSalvando(true);
    setErrore("");

    try {
      const moltiplicatore = (1 + numero(speseGeneraliPct) / 100) * (1 + numero(marginePct) / 100);
      const righePreventivo = voci.map((voce, index) => ({
        codice: voce.codice || "",
        categoria: "Edili",
        descrizione: voce.descrizione,
        unita: voce.unita || "cad",
        partiUguali: 1,
        lunghezza: numero(voce.quantita) || 1,
        larghezza: 1,
        altezzaPeso: 1,
        quantita: numero(voce.quantita) || 1,
        prezzoUnitario: numero(voce.prezzoUnitario) * moltiplicatore,
        sconto: 0,
        tipoRiga: "ECONOMICA",
        ordineRiga: index,
      }));

      if (costoTrasferteExtra > 0) {
        righePreventivo.push({
          codice: "TG-TRASFERTA",
          categoria: "Edili",
          descrizione: "Trasferte e percorrenze da " + sede + (destinazione ? " a " + destinazione : ""),
          unita: "a corpo",
          partiUguali: 1,
          lunghezza: 1,
          larghezza: 1,
          altezzaPeso: 1,
          quantita: 1,
          prezzoUnitario: costoTrasferteExtra * moltiplicatore,
          sconto: 0,
          tipoRiga: "ECONOMICA",
          ordineRiga: righePreventivo.length,
        });
      }

      const base = {
        clienteId,
        cliente: cliente?.ragioneSociale || cliente?.ragione_sociale || "",
        descrizione: titolo || "Preventivo da Analisi Costi",
        data: new Date().toISOString().slice(0, 10),
        stato: "Bozza",
        ivaPercentuale: 22,
        righe: righePreventivo,
      };

      let preventivo;
      if (preventivoId) {
        preventivo = await api.put("/preventivi/" + preventivoId, base);
      } else {
        const preventivi = await api.get("/preventivi");
        preventivo = await api.post("/preventivi", {
          ...base,
          numero: generaNumeroPreventivo(preventivi),
        });
        setPreventivoId(preventivo.id);
      }

      const savePayload = { ...payloadAnalisi(), preventivoId: preventivo.id };
      if (analisiId) {
        await api.put("/analisi-costi/" + analisiId, savePayload);
      } else {
        const saved = await api.post("/analisi-costi", savePayload);
        setAnalisiId(saved.id);
      }

      setMessaggio("Preventivo creato/aggiornato correttamente.");
      navigate("/preventivi");
    } catch (error) {
      setErrore(error.message || "Creazione preventivo non riuscita.");
    } finally {
      setSalvando(false);
    }
  }

  function esportaExcel() {
    const rows = voci.map((voce) => ({
      N: voce.ordine + 1,
      Codice: voce.codice,
      Descrizione: voce.descrizione,
      UM: voce.unita,
      Quantita: voce.quantita,
      PrezzoUnitario: voce.prezzoUnitario,
      Importo: voce.importo,
      TipoCosto: voce.tipoCosto,
      Fonte: voce.fonte,
      Stato: voce.stato,
      Criticita: (voce.criticita || []).join(" | "),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Analisi Costi");

    const summary = XLSX.utils.aoa_to_sheet([
      ["Parametro", "Valore"],
      ["Costo diretto", riepilogo.diretto],
      ["Spese generali %", speseGeneraliPct],
      ["Spese generali", riepilogo.speseGenerali],
      ["Margine %", marginePct],
      ["Margine", riepilogo.margine],
      ["Prezzo di vendita", riepilogo.vendita],
      ["Ore uomo", oreUomoTotali],
      ["Giorni programmati", giorniTotali],
      ["Km A/R", kmAndataRitorno],
      ["Viaggi", numeroViaggi],
    ]);
    XLSX.utils.book_append_sheet(wb, summary, "Riepilogo");

    const controlloRows = voci.map((voce, index) => ({
      WBS: voce.controllo?.wbsCodice || "WBS-" + String(index + 1).padStart(3, "0"),
      Descrizione: voce.descrizione,
      BudgetAnalisi: numero(voce.importo),
      BudgetOperativo: numero(voce.controllo?.budgetOperativo ?? voce.importo),
      AvanzamentoPct: numero(voce.controllo?.avanzamentoPct),
      QuantitaPrevista: numero(voce.quantita),
      QuantitaEseguita: numero(voce.controllo?.quantitaEseguita),
      OrePreviste: numero(voce.cronoprogramma?.oreTotali),
      OreReali: numero(voce.controllo?.oreReali),
      InizioPrevisto: voce.controllo?.dataInizioPrevista || "",
      FinePrevista: voce.controllo?.dataFinePrevista || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(controlloRows), "WBS Controllo");

    if (dashboard?.cashflow?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dashboard.cashflow), "Cash Flow");
    }
    if (dashboard?.fabbisogni?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dashboard.fabbisogni), "Fabbisogni");
    }
    if (varianti.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(varianti), "Varianti");
    }
    if (impegni.length || dashboard?.ordini?.length) {
      const impegniExport = [
        ...(dashboard?.ordini || []).map((item) => ({
          Fonte: "Ordine",
          WBS: "",
          Categoria: "Materiali",
          Fornitore: item.fornitore,
          Descrizione: item.materiale,
          Importo: numero(item.importo),
          Stato: item.stato,
        })),
        ...impegni.map((item) => ({
          Fonte: item.fonte || "Manuale",
          WBS: item.wbs_codice || item.wbsCodice || "",
          Categoria: item.categoria,
          Fornitore: item.fornitore,
          Descrizione: item.descrizione,
          Importo: numero(item.importo),
          Stato: item.stato,
        })),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(impegniExport), "Impegni");
    }

    XLSX.writeFile(wb, (titolo || "analisi-costi").replace(/[^a-z0-9_-]/gi, "_") + ".xlsx");
  }

  function esportaPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(titolo || "Analisi Costi", 14, 15);
    doc.setFontSize(9);
    doc.text("Sede: " + sede + " | Destinazione: " + (destinazione || "-"), 14, 22);
    doc.text("Costo diretto: " + euro.format(riepilogo.diretto) + " | Prezzo vendita: " + euro.format(riepilogo.vendita), 14, 28);
    if (dashboard?.kpi) {
      doc.text(
        "Budget autorizzato: " + euro.format(dashboard.kpi.budgetAutorizzato || 0) +
          " | Impegnato: " + euro.format(dashboard.kpi.impegnato || 0) +
          " | EAC: " + euro.format(dashboard.kpi.eac || 0) +
          " | Margine previsto: " + euro.format(dashboard.kpi.marginePrevisto || 0),
        14,
        33,
      );
    }

    autoTable(doc, {
      startY: dashboard?.kpi ? 39 : 34,
      head: [["N.", "Descrizione", "UM", "Q.tà", "Prezzo unit.", "Importo", "Tipo", "Fonte", "Stato"]],
      body: voci.map((voce) => [
        voce.ordine + 1,
        voce.descrizione,
        voce.unita,
        voce.quantita,
        euro.format(voce.prezzoUnitario),
        euro.format(voce.importo),
        voce.tipoCosto,
        voce.fonte,
        voce.stato,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [15, 42, 67] },
    });

    doc.save((titolo || "analisi-costi").replace(/[^a-z0-9_-]/gi, "_") + ".pdf");
  }

  async function aggiungiDaDdt() {
    const ricercaArticolo = window.prompt("Inserisci codice o descrizione dell'articolo DDT da aggiungere:");
    if (!ricercaArticolo) return;

    setErrore("");
    try {
      const risultati = await api.get("/ddt-materiali/articoli?q=" + encodeURIComponent(ricercaArticolo));
      const articolo = risultati?.[0];
      if (!articolo) {
        setErrore("Nessun articolo DDT trovato.");
        return;
      }
      setVoci((correnti) => [
        ...correnti,
        {
          id: "ddt-" + articolo.id,
          ordine: correnti.length,
          codice: articolo.codiceMateriale || "",
          descrizione: articolo.descrizione || "",
          unita: articolo.unitaMisura || "",
          quantita: 1,
          prezzoUnitario: numero(articolo.ultimoPrezzo),
          importo: numero(articolo.ultimoPrezzo),
          tipoCosto: "Materiali",
          fonte: "DDT",
          fonteTitolo: articolo.fornitoreAbituale || "",
          fonteUrl: "",
          fonteData: articolo.prezzoAggiornatoAl || "",
          stato: numero(articolo.ultimoPrezzo) > 0 ? "OK" : "Da verificare",
          componenti: {},
          cronoprogramma: {},
          criticita: numero(articolo.ultimoPrezzo) > 0 ? [] : ["Prezzo unitario mancante"],
          controllo: {
            wbsCodice: "WBS-" + String(correnti.length + 1).padStart(3, "0"),
            budgetOperativo: numero(articolo.ultimoPrezzo),
            avanzamentoPct: 0,
            quantitaEseguita: 0,
          },
        },
      ]);
      setMessaggio("Articolo DDT aggiunto all'analisi.");
    } catch (error) {
      setErrore(error.message || "Impossibile recuperare l'articolo DDT.");
    }
  }

  async function caricaPortfolio() {
    try {
      const data = await api.get("/analisi-costi/portfolio/commesse");
      setPortfolio(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrore(error.message || "Impossibile caricare il portfolio commesse.");
    }
  }

  async function impostaBaseline() {
    const id = await assicuraAnalisiSalvata();
    if (!id) return;
    try {
      await api.post("/analisi-costi/" + id + "/baseline", {});
      await caricaControlloEnterprise(id);
      setMessaggio("Baseline economica impostata sulla revisione corrente.");
    } catch (error) {
      setErrore(error.message || "Impossibile impostare la baseline.");
    }
  }

  async function assicuraAnalisiSalvata() {
    if (analisiId) return analisiId;
    const saved = await salvaAnalisi();
    return saved?.id || null;
  }

  async function aggiungiImpegno() {
    const id = await assicuraAnalisiSalvata();
    if (!id) return;
    if (!String(nuovoImpegno.descrizione || "").trim() || !numero(nuovoImpegno.importo)) {
      setErrore("Inserisci descrizione e importo dell'impegno.");
      return;
    }

    try {
      await api.post("/analisi-costi/" + id + "/impegni", {
        ...nuovoImpegno,
        importo: numero(nuovoImpegno.importo),
        data: new Date().toISOString().slice(0, 10),
      });
      setNuovoImpegno({
        wbsCodice: "",
        categoria: "Subappalto",
        fornitore: "",
        descrizione: "",
        importo: "",
        stato: "Impegnato",
      });
      await caricaControlloEnterprise(id);
      setMessaggio("Impegno aggiunto al controllo commessa.");
    } catch (error) {
      setErrore(error.message || "Impossibile aggiungere l'impegno.");
    }
  }

  async function eliminaImpegno(idImpegno) {
    if (!analisiId || !idImpegno) return;
    try {
      await api.delete("/analisi-costi/" + analisiId + "/impegni/" + idImpegno);
      await caricaControlloEnterprise(analisiId);
    } catch (error) {
      setErrore(error.message || "Impossibile eliminare l'impegno.");
    }
  }

  async function aggiungiVariante() {
    const id = await assicuraAnalisiSalvata();
    if (!id) return;
    if (!String(nuovaVariante.descrizione || "").trim()) {
      setErrore("Inserisci la descrizione della variante.");
      return;
    }

    try {
      await api.post("/analisi-costi/" + id + "/varianti", {
        ...nuovaVariante,
        importo: numero(nuovaVariante.importo),
        impattoCosti: numero(nuovaVariante.impattoCosti || nuovaVariante.importo),
        impattoGiorni: numero(nuovaVariante.impattoGiorni),
        data: new Date().toISOString().slice(0, 10),
      });
      setNuovaVariante({
        codice: "",
        descrizione: "",
        importo: "",
        impattoCosti: "",
        impattoGiorni: "",
        stato: "Proposta",
      });
      await caricaControlloEnterprise(id);
      setMessaggio("Variante aggiunta.");
    } catch (error) {
      setErrore(error.message || "Impossibile aggiungere la variante.");
    }
  }

  async function aggiornaStatoVariante(variante, stato) {
    if (!analisiId || !variante?.id) return;
    try {
      await api.put("/analisi-costi/" + analisiId + "/varianti/" + variante.id, {
        codice: variante.codice,
        descrizione: variante.descrizione,
        importo: variante.importo,
        impattoCosti: variante.impatto_costi ?? variante.impattoCosti ?? variante.importo,
        impattoGiorni: variante.impatto_giorni ?? variante.impattoGiorni ?? 0,
        stato,
        data: variante.data,
        note: variante.note,
      });
      await caricaControlloEnterprise(analisiId);
    } catch (error) {
      setErrore(error.message || "Impossibile aggiornare la variante.");
    }
  }

  async function eliminaVariante(idVariante) {
    if (!analisiId || !idVariante) return;
    try {
      await api.delete("/analisi-costi/" + analisiId + "/varianti/" + idVariante);
      await caricaControlloEnterprise(analisiId);
    } catch (error) {
      setErrore(error.message || "Impossibile eliminare la variante.");
    }
  }

  const controlloKpi = dashboard?.kpi || {
    budgetBase: voci.reduce((tot, voce) => tot + (numero(voce.controllo?.budgetOperativo) || numero(voce.importo)), 0),
    variazioniApprovate: 0,
    budgetAutorizzato: voci.reduce((tot, voce) => tot + (numero(voce.controllo?.budgetOperativo) || numero(voce.importo)), 0),
    impegnato: 0,
    costoReale: 0,
    etc: 0,
    eac: 0,
    vac: 0,
    marginePrevisto: 0,
    avanzamentoPct: 0,
    plannedPct: 0,
    earnedValue: 0,
    plannedValue: 0,
    cpi: 0,
    spi: 0,
    oreReali: 0,
    costoManodoperaRealeStimato: 0,
  };

  const tabs = [
    ["voci", "Voci di costo"],
    ["dettaglio", "Analisi dettagliata"],
    ["controllo", "Controllo commessa"],
    ["portfolio", "Portfolio"],
    ["cashflow", "Cash flow"],
    ["fabbisogni", "Fabbisogni"],
    ["varianti", "Varianti"],
    ["criticita", "Criticità (" + riepilogo.criticita + ")"],
    ["suggerimenti", "Suggerimenti"],
    ["prezzi", "Elenco prezzi"],
  ];

  return (
    <div>
      <AziendaHeader
        titolo="Analisi Costi"
        sottotitolo="Analisi automatica di preventivi, computi, DDT e documenti di cantiere"
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "end", marginBottom: "14px" }}>
        <div>
          <h1 style={{ marginBottom: "4px" }}>Analisi Costi</h1>
          <p style={{ margin: 0, color: "var(--enterprise-muted)" }}>
            Materiali, manodopera, noleggi, trasferte, spese generali, margine e criticità.
          </p>
        </div>
        <div style={{ minWidth: "270px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700 }}>Analisi salvate</label>
          <select
            value={storicoId}
            onChange={(e) => {
              setStoricoId(e.target.value);
              apriAnalisiSalvata(e.target.value);
            }}
            style={{ width: "100%" }}
          >
            <option value="">Apri analisi salvata...</option>
            {storico.map((item) => (
              <option key={item.id} value={item.id}>
                {item.titolo || item.fileName || "Analisi"} - Rev.{item.revisione || 0}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errore && (
        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", padding: "11px 14px", borderRadius: "8px", marginBottom: "12px" }}>
          {errore}
        </div>
      )}
      {messaggio && (
        <div style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", color: "#166534", padding: "11px 14px", borderRadius: "8px", marginBottom: "12px" }}>
          {messaggio}
        </div>
      )}

      <section style={{ ...cardStyle(), padding: "16px", marginBottom: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "14px" }}>
          <div
            style={{
              border: "1px dashed #9db7d4",
              borderRadius: "10px",
              minHeight: "100px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "14px",
              padding: "18px",
              background: "#fbfdff",
            }}
          >
            <Upload size={34} color="#0b63ce" />
            <div>
              <strong>Trascina o carica un documento</strong>
              <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                PDF, scansioni, immagini, Word, Excel, CSV, ODS, TXT
              </div>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={caricamento}>
              {caricamento ? <Loader2 size={16} /> : <Upload size={16} />} Carica documento
            </button>
            <button type="button" onClick={aggiungiDaDdt} style={{ background: "#fff", color: "#0b63ce" }}>
              <PackageSearch size={16} /> Carica da DDT
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.xlsm,.csv,.ods,.doc,.docx,.rtf,.txt,image/*"
              onChange={caricaDocumento}
              style={{ display: "none" }}
            />
          </div>

          <div style={{ background: "#f5f9fd", border: "1px solid #d8e6f4", borderRadius: "10px", padding: "14px" }}>
            <strong>Documento caricato</strong>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "12px" }}>
              {fileNome ? <FileText size={30} color="#d32f2f" /> : <FileSpreadsheet size={30} color="#64748b" />}
              <div>
                <div style={{ fontWeight: 700 }}>{fileNome || "Nessun documento"}</div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>{voci.length} voci riconosciute</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle(), padding: "11px", marginBottom: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
          {[
            ["1. Carica documento", Boolean(fileNome || voci.length)],
            ["2. Analisi e riconoscimento", voci.length > 0],
            ["3. Dettaglio e criticità", voci.some((voce) => Object.keys(voce.componenti || {}).length || (voce.criticita || []).length)],
          ].map(([label, done], index) => (
            <div key={label} style={{ display: "flex", gap: "9px", alignItems: "center", fontWeight: 700 }}>
              <span
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  background: done ? "#16a34a" : index === 1 && analizzando ? "#0b63ce" : "#b6c4d4",
                }}
              >
                {done ? <Check size={15} /> : index + 1}
              </span>
              {label}
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr) 1.05fr", gap: "12px", marginBottom: "14px" }}>
        {[
          ["Materiali", riepilogo.materiali],
          ["Noleggi / Attrezzature", riepilogo.noleggi],
          ["Manodopera", riepilogo.manodopera],
          ["Altri costi", riepilogo.altri],
        ].map(([label, value]) => (
          <div key={label} style={cardStyle()}>
            <div style={{ color: "#52606d", fontSize: "12px", fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: "22px", fontWeight: 800, marginTop: "8px", color: "#102a43" }}>{euro.format(value)}</div>
          </div>
        ))}

        <div style={{ ...cardStyle(), background: "#f4f9ff", borderColor: "#c9def6" }}>
          <div style={{ fontWeight: 800, color: "#102a43" }}>Totale stimato</div>
          <div style={{ fontSize: "26px", fontWeight: 900, color: "#0b63ce", margin: "6px 0" }}>{euro.format(riepilogo.diretto)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px", fontSize: "12px" }}>
            <span>Spese generali ({speseGeneraliPct}%)</span><strong>{euro.format(riepilogo.speseGenerali)}</strong>
            <span>Margine ({marginePct}%)</span><strong>{euro.format(riepilogo.margine)}</strong>
            <span style={{ borderTop: "1px solid #cbd5e1", paddingTop: "5px" }}>Prezzo vendita</span>
            <strong style={{ borderTop: "1px solid #cbd5e1", paddingTop: "5px" }}>{euro.format(riepilogo.vendita)}</strong>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle(), marginBottom: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(130px,1fr))", gap: "10px" }}>
          <label>
            Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Seleziona cliente</option>
              {clienti.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.ragioneSociale || item.ragione_sociale || item.cliente || item.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantiere
            <select value={cantiereId} onChange={(e) => setCantiereId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Seleziona cantiere</option>
              {cantieri.map((item) => (
                <option key={item.id} value={item.id}>{item.nome || item.cantiere || item.id}</option>
              ))}
            </select>
          </label>
          <label>
            Sede
            <input value={sede} onChange={(e) => setSede(e.target.value)} />
          </label>
          <label style={{ gridColumn: "span 2" }}>
            Destinazione cantiere
            <div style={{ display: "flex", gap: "6px" }}>
              <input value={destinazione} onChange={(e) => setDestinazione(e.target.value)} placeholder="Indirizzo cantiere" style={{ flex: 1 }} />
              <button type="button" onClick={calcolaDistanza} title="Calcola percorrenza">
                <MapPin size={16} />
              </button>
            </div>
          </label>
          <label>
            Manodopera €/h
            <input type="number" step="0.01" value={costoManodoperaOra} onChange={(e) => setCostoManodoperaOra(e.target.value)} />
          </label>
          <label>
            Spese generali %
            <input type="number" step="0.1" value={speseGeneraliPct} onChange={(e) => setSpeseGeneraliPct(e.target.value)} />
          </label>
          <label>
            Margine %
            <input type="number" step="0.1" value={marginePct} onChange={(e) => setMarginePct(e.target.value)} />
          </label>
          <label>
            Km A/R
            <input type="number" step="0.1" value={kmAndataRitorno} onChange={(e) => setKmAndataRitorno(e.target.value)} />
          </label>
          <label>
            N. viaggi
            <input type="number" step="1" value={numeroViaggi} onChange={(e) => setNumeroViaggi(e.target.value)} />
          </label>
          <label>
            Costo €/km
            <input type="number" step="0.01" value={costoKm} onChange={(e) => setCostoKm(e.target.value)} />
          </label>
          <label>
            Pedaggi €
            <input type="number" step="0.01" value={pedaggi} onChange={(e) => setPedaggi(e.target.value)} />
          </label>
          <label>
            Pasti/Pernotti €
            <input type="number" step="0.01" value={pastiPernotti} onChange={(e) => setPastiPernotti(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
          <button type="button" onClick={analizzaCosti} disabled={analizzando || !voci.length}>
            {analizzando ? <Loader2 size={16} /> : <Search size={16} />} Analizza costi e cerca prezzi
          </button>
          <button type="button" onClick={salvaAnalisi} disabled={salvando || !voci.length} style={{ background: "#fff", color: "#0b63ce" }}>
            <Save size={16} /> Salva analisi
          </button>
          <span style={{ marginLeft: "auto", color: "#64748b", alignSelf: "center", fontSize: "12px" }}>
            Trasferte extra: <strong>{euro.format(costoTrasferteExtra)}</strong>
          </span>
        </div>
      </section>

      <section style={{ ...cardStyle(), padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: "6px", padding: "12px", borderBottom: "1px solid #dbe3ee", flexWrap: "wrap" }}>
          {tabs.map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => {
                setTab(value);
                if (value === "portfolio") caricaPortfolio();
              }}
              style={{
                background: tab === value ? "#0b63ce" : "#fff",
                color: tab === value ? "#fff" : "#102a43",
                border: "1px solid " + (tab === value ? "#0b63ce" : "#dbe3ee"),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "voci" && (
          <div style={{ padding: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: "8px", marginBottom: "12px" }}>
              <input placeholder="Cerca descrizione, codice o voce..." value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
                <option value="Tutti">Tutti i tipi</option>
                {TIPI_COSTO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
              <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)}>
                <option value="Tutti">Tutti gli stati</option>
                <option value="OK">OK</option>
                <option value="Da verificare">Da verificare</option>
              </select>
              <button type="button" onClick={esportaExcel} style={{ background: "#fff", color: "#166534" }}>
                <Download size={16} /> Excel
              </button>
              <button type="button" onClick={esportaPdf} style={{ background: "#fff", color: "#b91c1c" }}>
                <Download size={16} /> PDF
              </button>
            </div>

            <div style={{ overflowX: "auto", border: "1px solid #dbe3ee", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1180px" }}>
                <thead>
                  <tr style={{ background: "#edf2f7", color: "#102a43" }}>
                    {["N.", "Descrizione", "U.M.", "Q.tà", "Prezzo unit.", "Importo", "Tipo costo", "Fonte", "Stato", "Azioni"].map((label) => (
                      <th key={label} style={{ padding: "9px", borderBottom: "1px solid #dbe3ee", fontSize: "12px" }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vociFiltrate.map((voce) => {
                    const index = voci.indexOf(voce);
                    return (
                      <tr key={String(voce.id || index) + "-" + index} style={{ borderBottom: "1px solid #eef2f6" }}>
                        <td style={{ padding: "7px", textAlign: "center" }}>{index + 1}</td>
                        <td style={{ padding: "7px", minWidth: "320px" }}>
                          <input
                            value={voce.descrizione || ""}
                            onChange={(e) => aggiornaVoce(index, "descrizione", e.target.value)}
                            style={{ width: "100%" }}
                          />
                          {voce.codice && <small style={{ color: "#64748b" }}>{voce.codice}</small>}
                        </td>
                        <td style={{ padding: "7px" }}>
                          <input value={voce.unita || ""} onChange={(e) => aggiornaVoce(index, "unita", e.target.value)} style={{ width: "70px" }} />
                        </td>
                        <td style={{ padding: "7px" }}>
                          <input type="number" step="0.01" value={voce.quantita} onChange={(e) => aggiornaVoce(index, "quantita", e.target.value)} style={{ width: "90px" }} />
                        </td>
                        <td style={{ padding: "7px" }}>
                          <input type="number" step="0.01" value={voce.prezzoUnitario} onChange={(e) => aggiornaVoce(index, "prezzoUnitario", e.target.value)} style={{ width: "105px" }} />
                        </td>
                        <td style={{ padding: "7px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{euro.format(voce.importo)}</td>
                        <td style={{ padding: "7px" }}>
                          <select value={voce.tipoCosto} onChange={(e) => aggiornaVoce(index, "tipoCosto", e.target.value)}>
                            {TIPI_COSTO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "7px", minWidth: "130px" }}>
                          {voce.fonteUrl ? (
                            <a href={voce.fonteUrl} target="_blank" rel="noreferrer">{voce.fonte || "Fonte"}</a>
                          ) : (
                            <span>{voce.fonte || "-"}</span>
                          )}
                        </td>
                        <td style={{ padding: "7px", textAlign: "center" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: voce.stato === "OK" ? "#dcfce7" : "#fef3c7",
                              color: voce.stato === "OK" ? "#166534" : "#92400e",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {voce.stato}
                          </span>
                        </td>
                        <td style={{ padding: "7px", whiteSpace: "nowrap" }}>
                          <button type="button" onClick={() => { setSelezionata(index); setTab("dettaglio"); }} title="Dettaglio" style={{ padding: "6px 8px" }}>
                            Dettaglio
                          </button>{" "}
                          <button type="button" onClick={() => confermaVoce(index)} title="Conferma" style={{ padding: "6px 8px", background: "#16a34a" }}>
                            <Check size={14} />
                          </button>{" "}
                          <button type="button" onClick={() => eliminaVoce(index)} title="Elimina" style={{ padding: "6px 8px", background: "#fff", color: "#b91c1c" }}>
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!vociFiltrate.length && (
                    <tr>
                      <td colSpan="10" style={{ padding: "28px", textAlign: "center", color: "#64748b" }}>
                        Carica un documento per iniziare l'analisi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", color: "#64748b", fontSize: "12px" }}>
              <span>Totale voci: {voci.length}</span>
              <button type="button" onClick={salvaSuPreventivo} disabled={salvando || !voci.length}>
                <Save size={16} /> {preventivoId ? "Aggiorna preventivo" : "Salva su preventivo"}
              </button>
            </div>
          </div>
        )}

        {tab === "dettaglio" && (
          <div style={{ padding: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "16px" }}>
              <div style={cardStyle()}>
                <strong>Seleziona lavorazione</strong>
                <select value={selezionata} onChange={(e) => setSelezionata(Number(e.target.value))} style={{ width: "100%", marginTop: "8px" }}>
                  {voci.map((voce, index) => (
                    <option key={String(voce.id || index)} value={index}>{index + 1}. {voce.descrizione}</option>
                  ))}
                </select>
                {voceSelezionata && (
                  <div style={{ marginTop: "14px", fontSize: "13px" }}>
                    <div><strong>Quantità:</strong> {voceSelezionata.quantita} {voceSelezionata.unita}</div>
                    <div><strong>Costo:</strong> {euro.format(voceSelezionata.importo)}</div>
                    <div><strong>Fonte:</strong> {voceSelezionata.fonte || "-"}</div>
                    <div><strong>Stato:</strong> {voceSelezionata.stato}</div>
                  </div>
                )}
              </div>

              <div>
                <h2 style={{ marginTop: 0 }}>Scomposizione costi</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "10px" }}>
                  {[
                    ["Materiali", voceSelezionata?.componenti?.materiali || []],
                    ["Manodopera", voceSelezionata?.componenti?.manodopera || []],
                    ["Noleggi", voceSelezionata?.componenti?.noleggi || []],
                    ["Mezzi", voceSelezionata?.componenti?.mezzi || []],
                    ["Altri", voceSelezionata?.componenti?.altri || []],
                  ].map(([label, items]) => (
                    <div key={label} style={cardStyle()}>
                      <strong>{label}</strong>
                      <div style={{ fontSize: "19px", fontWeight: 800, marginTop: "8px" }}>
                        {euro.format(items.reduce((tot, item) => tot + numero(item.totale), 0))}
                      </div>
                      <small>{items.length} componenti</small>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: "14px", border: "1px solid #dbe3ee", borderRadius: "8px", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#edf2f7" }}>
                        <th style={{ padding: "8px" }}>Categoria</th>
                        <th style={{ padding: "8px" }}>Descrizione / Qualifica</th>
                        <th style={{ padding: "8px" }}>Quantità/Ore</th>
                        <th style={{ padding: "8px" }}>Prezzo/Costo h</th>
                        <th style={{ padding: "8px" }}>Totale</th>
                        <th style={{ padding: "8px" }}>Fonte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {voceSelezionata &&
                        Object.entries(voceSelezionata.componenti || {}).flatMap(([categoria, items]) =>
                          (Array.isArray(items) ? items : []).map((item, idx) => (
                            <tr key={categoria + "-" + idx} style={{ borderBottom: "1px solid #eef2f6" }}>
                              <td style={{ padding: "8px" }}>{categoria}</td>
                              <td style={{ padding: "8px" }}>{item.descrizione || item.qualifica || "-"}</td>
                              <td style={{ padding: "8px" }}>{item.ore || item.quantita || item.km || "-"}</td>
                              <td style={{ padding: "8px" }}>{euro.format(item.costoOra || item.prezzoUnitario || item.costoKm || 0)}</td>
                              <td style={{ padding: "8px", fontWeight: 700 }}>{euro.format(item.totale || 0)}</td>
                              <td style={{ padding: "8px" }}>{item.fonte || "-"}</td>
                            </tr>
                          )),
                        )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <h2>Cronoprogramma manodopera</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "12px" }}>
              <div style={cardStyle()}><strong>Ore-uomo totali</strong><div style={{ fontSize: "22px", fontWeight: 800 }}>{oreUomoTotali.toFixed(1)}</div></div>
              <div style={cardStyle()}><strong>Giorni programmati</strong><div style={{ fontSize: "22px", fontWeight: 800 }}>{giorniTotali.toFixed(1)}</div></div>
              <div style={cardStyle()}><strong>Costo orario</strong><div style={{ fontSize: "22px", fontWeight: 800 }}>{euro.format(costoManodoperaOra)}</div></div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#edf2f7" }}><th>Seq.</th><th>Lavorazione</th><th>Persone</th><th>Ore</th><th>Giorni</th><th>Costo manodopera</th></tr></thead>
              <tbody>
                {cronoprogramma.map((item) => (
                  <tr key={item.index} style={{ borderBottom: "1px solid #eef2f6" }}>
                    <td style={{ padding: "8px", textAlign: "center" }}>{item.sequenza}</td>
                    <td style={{ padding: "8px" }}>{item.descrizione}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{item.persone}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{item.oreTotali.toFixed(1)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{item.giorni.toFixed(1)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{euro.format(item.oreTotali * numero(costoManodoperaOra))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "controllo" && (
          <div style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <div>
                <h2 style={{ margin: 0 }}>Controllo economico commessa</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  Budget operativo, impegni, costi reali, costo a finire e forecast finale.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" onClick={impostaBaseline} disabled={!voci.length} style={{ background: "#fff", color: "#0b63ce" }}>
                  Imposta baseline
                </button>
                <button type="button" onClick={salvaAnalisi} disabled={!voci.length || salvando}>
                  Salva e aggiorna controllo
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px,1fr))", gap: "10px", marginBottom: "14px" }}>
              {[
                ["Baseline", controlloKpi.baselineBudget, "#64748b"],
                ["Budget base", controlloKpi.budgetBase, "#102a43"],
                ["Varianti approvate", controlloKpi.variazioniApprovate, "#7c3aed"],
                ["Budget autorizzato", controlloKpi.budgetAutorizzato, "#0b63ce"],
                ["Impegnato", controlloKpi.impegnato, "#b45309"],
                ["Costo reale", controlloKpi.costoReale, "#be123c"],
                ["ETC - Costo a finire", controlloKpi.etc, "#475569"],
                ["EAC - Costo finale previsto", controlloKpi.eac, numero(controlloKpi.vac) < 0 ? "#be123c" : "#166534"],
                ["Margine finale previsto", controlloKpi.marginePrevisto, numero(controlloKpi.marginePrevisto) < 0 ? "#be123c" : "#166534"],
              ].map(([label, value, color]) => (
                <div key={label} style={cardStyle()}>
                  <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: "21px", fontWeight: 900, marginTop: "7px", color }}>{euro.format(value || 0)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "10px", marginBottom: "16px" }}>
              <div style={cardStyle()}><strong>Avanzamento fisico</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{numero(controlloKpi.avanzamentoPct).toFixed(1)}%</div></div>
              <div style={cardStyle()}><strong>Avanzamento pianificato</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{numero(controlloKpi.plannedPct).toFixed(1)}%</div></div>
              <div style={cardStyle()}><strong>EV</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{euro.format(controlloKpi.earnedValue || 0)}</div></div>
              <div style={cardStyle()}><strong>PV</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{euro.format(controlloKpi.plannedValue || 0)}</div></div>
              <div style={{ ...cardStyle(), background: numero(controlloKpi.cpi) >= 1 ? "#f0fdf4" : "#fff7ed" }}><strong>CPI</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{numero(controlloKpi.cpi).toFixed(2)}</div><small>Efficienza costi</small></div>
              <div style={{ ...cardStyle(), background: numero(controlloKpi.spi) >= 1 ? "#f0fdf4" : "#fff7ed" }}><strong>SPI</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{numero(controlloKpi.spi).toFixed(2)}</div><small>Efficienza tempi</small></div>
            </div>

            <h3>WBS / Budget operativo</h3>
            <div style={{ overflowX: "auto", border: "1px solid #dbe3ee", borderRadius: "8px", marginBottom: "18px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1050px" }}>
                <thead>
                  <tr style={{ background: "#edf2f7" }}>
                    <th style={{ padding: "8px" }}>WBS</th>
                    <th style={{ padding: "8px" }}>Lavorazione</th>
                    <th style={{ padding: "8px" }}>Budget analisi</th>
                    <th style={{ padding: "8px" }}>Budget operativo</th>
                    <th style={{ padding: "8px" }}>Avanzamento %</th>
                    <th style={{ padding: "8px" }}>Q.tà prevista</th>
                    <th style={{ padding: "8px" }}>Q.tà eseguita</th>
                    <th style={{ padding: "8px" }}>Inizio previsto</th>
                    <th style={{ padding: "8px" }}>Fine prevista</th>
                    <th style={{ padding: "8px" }}>Ore previste</th>
                    <th style={{ padding: "8px" }}>Ore reali</th>
                  </tr>
                </thead>
                <tbody>
                  {voci.map((voce, index) => (
                    <tr key={String(voce.id || index)} style={{ borderBottom: "1px solid #eef2f6" }}>
                      <td style={{ padding: "7px" }}>
                        <input
                          value={voce.controllo?.wbsCodice || "WBS-" + String(index + 1).padStart(3, "0")}
                          onChange={(e) => aggiornaControlloVoce(index, "wbsCodice", e.target.value)}
                          style={{ width: "95px" }}
                        />
                      </td>
                      <td style={{ padding: "7px", minWidth: "260px" }}>{voce.descrizione}</td>
                      <td style={{ padding: "7px", textAlign: "right" }}>{euro.format(voce.importo || 0)}</td>
                      <td style={{ padding: "7px" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={voce.controllo?.budgetOperativo ?? voce.importo ?? 0}
                          onChange={(e) => aggiornaControlloVoce(index, "budgetOperativo", e.target.value)}
                          style={{ width: "110px" }}
                        />
                      </td>
                      <td style={{ padding: "7px" }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={voce.controllo?.avanzamentoPct ?? 0}
                          onChange={(e) => aggiornaControlloVoce(index, "avanzamentoPct", e.target.value)}
                          style={{ width: "80px" }}
                        />
                      </td>
                      <td style={{ padding: "7px", textAlign: "right" }}>{numero(voce.quantita).toLocaleString("it-IT")}</td>
                      <td style={{ padding: "7px" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={voce.controllo?.quantitaEseguita ?? 0}
                          onChange={(e) => aggiornaControlloVoce(index, "quantitaEseguita", e.target.value)}
                          style={{ width: "90px" }}
                        />
                      </td>
                      <td style={{ padding: "7px" }}>
                        <input
                          type="date"
                          value={voce.controllo?.dataInizioPrevista || ""}
                          onChange={(e) => aggiornaControlloVoce(index, "dataInizioPrevista", e.target.value)}
                          style={{ width: "135px" }}
                        />
                      </td>
                      <td style={{ padding: "7px" }}>
                        <input
                          type="date"
                          value={voce.controllo?.dataFinePrevista || ""}
                          onChange={(e) => aggiornaControlloVoce(index, "dataFinePrevista", e.target.value)}
                          style={{ width: "135px" }}
                        />
                      </td>
                      <td style={{ padding: "7px", textAlign: "right" }}>{numero(voce.cronoprogramma?.oreTotali).toFixed(1)}</td>
                      <td style={{ padding: "7px" }}>
                        <input
                          type="number"
                          step="0.1"
                          value={voce.controllo?.oreReali ?? 0}
                          onChange={(e) => aggiornaControlloVoce(index, "oreReali", e.target.value)}
                          style={{ width: "85px" }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: "16px" }}>
              <div>
                <h3>Impegni / Ordini / Subappalti</h3>
                <div style={{ display: "grid", gridTemplateColumns: "110px 130px 1fr 140px 130px auto", gap: "7px", marginBottom: "10px" }}>
                  <input placeholder="WBS" value={nuovoImpegno.wbsCodice} onChange={(e) => setNuovoImpegno({ ...nuovoImpegno, wbsCodice: e.target.value })} />
                  <select value={nuovoImpegno.categoria} onChange={(e) => setNuovoImpegno({ ...nuovoImpegno, categoria: e.target.value })}>
                    <option>Subappalto</option>
                    <option>Noleggio</option>
                    <option>Materiali</option>
                    <option>Servizi</option>
                    <option>Altro</option>
                  </select>
                  <input placeholder="Descrizione impegno" value={nuovoImpegno.descrizione} onChange={(e) => setNuovoImpegno({ ...nuovoImpegno, descrizione: e.target.value })} />
                  <input placeholder="Fornitore" value={nuovoImpegno.fornitore} onChange={(e) => setNuovoImpegno({ ...nuovoImpegno, fornitore: e.target.value })} />
                  <input type="number" step="0.01" placeholder="Importo €" value={nuovoImpegno.importo} onChange={(e) => setNuovoImpegno({ ...nuovoImpegno, importo: e.target.value })} />
                  <button type="button" onClick={aggiungiImpegno}>Aggiungi</button>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "#edf2f7" }}><th>Fonte</th><th>WBS</th><th>Categoria</th><th>Fornitore</th><th>Descrizione</th><th>Importo</th><th>Stato</th><th></th></tr></thead>
                  <tbody>
                    {(dashboard?.ordini || []).map((item) => (
                      <tr key={"ordine-" + item.id} style={{ borderBottom: "1px solid #eef2f6" }}>
                        <td style={{ padding: "7px" }}>Ordine</td><td style={{ padding: "7px" }}>-</td><td style={{ padding: "7px" }}>Materiali</td><td style={{ padding: "7px" }}>{item.fornitore}</td><td style={{ padding: "7px" }}>{item.materiale}</td><td style={{ padding: "7px", textAlign: "right" }}>{euro.format(item.importo || 0)}</td><td style={{ padding: "7px" }}>{item.stato}</td><td></td>
                      </tr>
                    ))}
                    {impegni.map((item) => (
                      <tr key={"impegno-" + item.id} style={{ borderBottom: "1px solid #eef2f6" }}>
                        <td style={{ padding: "7px" }}>{item.fonte || "Manuale"}</td>
                        <td style={{ padding: "7px" }}>{item.wbs_codice || item.wbsCodice || "-"}</td>
                        <td style={{ padding: "7px" }}>{item.categoria}</td>
                        <td style={{ padding: "7px" }}>{item.fornitore || "-"}</td>
                        <td style={{ padding: "7px" }}>{item.descrizione}</td>
                        <td style={{ padding: "7px", textAlign: "right" }}>{euro.format(item.importo || 0)}</td>
                        <td style={{ padding: "7px" }}>{item.stato}</td>
                        <td style={{ padding: "7px" }}><button type="button" onClick={() => eliminaImpegno(item.id)} style={{ background: "#fff", color: "#b91c1c" }}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3>Produttività manodopera</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "10px" }}>
                  <div style={cardStyle()}><strong>Ore reali utilizzate</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{numero(dashboard?.produttivita?.oreReali).toFixed(1)}</div></div>
                  <div style={cardStyle()}><strong>Costo ore stimato</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{euro.format(dashboard?.produttivita?.costoManodoperaRealeStimato || 0)}</div></div>
                  <div style={cardStyle()}><strong>Ore da rapportini</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{numero(dashboard?.produttivita?.oreRealiRapportini).toFixed(1)}</div></div>
                  <div style={cardStyle()}><strong>Ore imputate WBS</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{numero(dashboard?.produttivita?.oreRealiWbs).toFixed(1)}</div></div>
                </div>
                <div style={{ maxHeight: "270px", overflow: "auto", border: "1px solid #dbe3ee", borderRadius: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead><tr style={{ background: "#edf2f7" }}><th>WBS</th><th>Lavorazione</th><th>Resa prevista</th><th>Resa reale</th><th>Scostamento</th></tr></thead>
                    <tbody>
                      {(dashboard?.produttivita?.righe || []).map((row, index) => (
                        <tr key={(row.wbsCodice || "") + index} style={{ borderBottom: "1px solid #eef2f6" }}>
                          <td style={{ padding: "6px" }}>{row.wbsCodice || "-"}</td>
                          <td style={{ padding: "6px" }}>{row.descrizione}</td>
                          <td style={{ padding: "6px", textAlign: "right" }}>{numero(row.resaPrevista).toFixed(2)} {row.unita || ""}/h</td>
                          <td style={{ padding: "6px", textAlign: "right" }}>{numero(row.resaReale).toFixed(2)} {row.unita || ""}/h</td>
                          <td style={{ padding: "6px", textAlign: "right", fontWeight: 700, color: numero(row.scostamentoResaPct) < 0 ? "#be123c" : "#166534" }}>{numero(row.scostamentoResaPct).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "portfolio" && (
          <div style={{ padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <h2 style={{ margin: 0 }}>Portfolio cantieri</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>Visione sintetica di budget, forecast e margini delle analisi salvate.</p>
              </div>
              <button type="button" onClick={caricaPortfolio}>Aggiorna portfolio</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "14px" }}>
              <div style={cardStyle()}><strong>Commesse</strong><div style={{ fontSize: "22px", fontWeight: 900 }}>{portfolio.length}</div></div>
              <div style={cardStyle()}><strong>Budget autorizzato</strong><div style={{ fontSize: "22px", fontWeight: 900 }}>{euro.format(portfolio.reduce((tot, item) => tot + numero(item.kpi?.budgetAutorizzato), 0))}</div></div>
              <div style={cardStyle()}><strong>EAC portfolio</strong><div style={{ fontSize: "22px", fontWeight: 900 }}>{euro.format(portfolio.reduce((tot, item) => tot + numero(item.kpi?.eac), 0))}</div></div>
              <div style={cardStyle()}><strong>Margine previsto</strong><div style={{ fontSize: "22px", fontWeight: 900 }}>{euro.format(portfolio.reduce((tot, item) => tot + numero(item.kpi?.marginePrevisto), 0))}</div></div>
            </div>

            <div style={{ overflowX: "auto", border: "1px solid #dbe3ee", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1000px" }}>
                <thead><tr style={{ background: "#edf2f7" }}><th>Commessa</th><th>Cliente</th><th>Budget</th><th>Impegnato</th><th>Costo reale</th><th>EAC</th><th>VAC</th><th>CPI</th><th>SPI</th><th>Margine previsto</th><th>Stato</th></tr></thead>
                <tbody>
                  {portfolio.map((item) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #eef2f6" }}>
                      <td style={{ padding: "8px", fontWeight: 700 }}>{item.titolo}</td>
                      <td style={{ padding: "8px" }}>{item.clienteNome || "-"}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(item.kpi?.budgetAutorizzato || 0)}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(item.kpi?.impegnato || 0)}</td>
                      <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(item.kpi?.costoReale || 0)}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{euro.format(item.kpi?.eac || 0)}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: numero(item.kpi?.vac) < 0 ? "#be123c" : "#166534" }}>{euro.format(item.kpi?.vac || 0)}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: numero(item.kpi?.cpi) < 1 ? "#b45309" : "#166534" }}>{numero(item.kpi?.cpi).toFixed(2)}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: numero(item.kpi?.spi) < 1 ? "#b45309" : "#166534" }}>{numero(item.kpi?.spi).toFixed(2)}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: numero(item.kpi?.marginePrevisto) < 0 ? "#be123c" : "#166534" }}>{euro.format(item.kpi?.marginePrevisto || 0)}</td>
                      <td style={{ padding: "8px" }}>{item.stato}</td>
                    </tr>
                  ))}
                  {!portfolio.length && <tr><td colSpan="11" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>Nessuna analisi salvata nel portfolio.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "cashflow" && (
          <div style={{ padding: "16px" }}>
            <h2>Cash flow di commessa</h2>
            <p style={{ color: "#64748b" }}>Confronto mensile tra costo previsto, consuntivato e impegni assunti.</p>
            <div style={{ overflowX: "auto", border: "1px solid #dbe3ee", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#edf2f7" }}><th>Mese</th><th>Previsto</th><th>Consuntivo</th><th>Impegnato</th><th>Scostamento</th><th>Indicatore</th></tr></thead>
                <tbody>
                  {(dashboard?.cashflow || []).map((row) => {
                    const max = Math.max(numero(row.previsto), numero(row.consuntivo), numero(row.impegnato), 1);
                    return (
                      <tr key={row.mese} style={{ borderBottom: "1px solid #eef2f6" }}>
                        <td style={{ padding: "8px", fontWeight: 700 }}>{row.mese}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(row.previsto || 0)}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(row.consuntivo || 0)}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(row.impegnato || 0)}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: numero(row.scostamento) > 0 ? "#be123c" : "#166534", fontWeight: 700 }}>{euro.format(row.scostamento || 0)}</td>
                        <td style={{ padding: "8px", minWidth: "220px" }}>
                          <div style={{ height: "7px", background: "#e2e8f0", borderRadius: "99px", overflow: "hidden", marginBottom: "3px" }}><div style={{ height: "100%", width: Math.min(100, numero(row.previsto) / max * 100) + "%", background: "#0b63ce" }} /></div>
                          <div style={{ height: "7px", background: "#e2e8f0", borderRadius: "99px", overflow: "hidden", marginBottom: "3px" }}><div style={{ height: "100%", width: Math.min(100, numero(row.consuntivo) / max * 100) + "%", background: "#16a34a" }} /></div>
                          <div style={{ height: "7px", background: "#e2e8f0", borderRadius: "99px", overflow: "hidden" }}><div style={{ height: "100%", width: Math.min(100, numero(row.impegnato) / max * 100) + "%", background: "#f59e0b" }} /></div>
                        </td>
                      </tr>
                    );
                  })}
                  {!dashboard?.cashflow?.length && <tr><td colSpan="6" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>Salva l'analisi e collega un cantiere con date e movimenti contabili per generare il cash flow.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "fabbisogni" && (
          <div style={{ padding: "16px" }}>
            <h2>Fabbisogno materiali</h2>
            <p style={{ color: "#64748b" }}>Materiali richiesti dall'analisi confrontati con le giacenze di magazzino.</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#edf2f7" }}><th>Codice</th><th>Materiale</th><th>U.M.</th><th>Richiesto</th><th>Disponibile</th><th>Da ordinare</th><th>Valore da ordinare</th><th>Stato</th></tr></thead>
              <tbody>
                {(dashboard?.fabbisogni || []).map((item, index) => (
                  <tr key={(item.codice || item.descrizione) + index} style={{ borderBottom: "1px solid #eef2f6" }}>
                    <td style={{ padding: "8px" }}>{item.codice || "-"}</td>
                    <td style={{ padding: "8px" }}>{item.descrizione}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{item.unita || "-"}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{numero(item.richiesto).toLocaleString("it-IT")}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{numero(item.disponibile).toLocaleString("it-IT")}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontWeight: 700 }}>{numero(item.daOrdinare).toLocaleString("it-IT")}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(item.valoreDaOrdinare || 0)}</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: "6px", background: numero(item.daOrdinare) > 0 ? "#fef3c7" : "#dcfce7", color: numero(item.daOrdinare) > 0 ? "#92400e" : "#166534", fontWeight: 700 }}>
                        {numero(item.daOrdinare) > 0 ? "Da ordinare" : "Coperto"}
                      </span>
                    </td>
                  </tr>
                ))}
                {!dashboard?.fabbisogni?.length && <tr><td colSpan="8" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>Esegui l'analisi dettagliata per generare il fabbisogno materiali.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "varianti" && (
          <div style={{ padding: "16px" }}>
            <h2>Varianti / Change order</h2>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 130px 130px 110px 130px auto", gap: "8px", marginBottom: "14px" }}>
              <input placeholder="Codice" value={nuovaVariante.codice} onChange={(e) => setNuovaVariante({ ...nuovaVariante, codice: e.target.value })} />
              <input placeholder="Descrizione variante" value={nuovaVariante.descrizione} onChange={(e) => setNuovaVariante({ ...nuovaVariante, descrizione: e.target.value })} />
              <input type="number" step="0.01" placeholder="Valore €" value={nuovaVariante.importo} onChange={(e) => setNuovaVariante({ ...nuovaVariante, importo: e.target.value })} />
              <input type="number" step="0.01" placeholder="Costo €" value={nuovaVariante.impattoCosti} onChange={(e) => setNuovaVariante({ ...nuovaVariante, impattoCosti: e.target.value })} />
              <input type="number" step="1" placeholder="Giorni" value={nuovaVariante.impattoGiorni} onChange={(e) => setNuovaVariante({ ...nuovaVariante, impattoGiorni: e.target.value })} />
              <select value={nuovaVariante.stato} onChange={(e) => setNuovaVariante({ ...nuovaVariante, stato: e.target.value })}>
                <option>Proposta</option>
                <option>Approvata</option>
                <option>Rifiutata</option>
              </select>
              <button type="button" onClick={aggiungiVariante}>Aggiungi</button>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#edf2f7" }}><th>Codice</th><th>Descrizione</th><th>Valore</th><th>Impatto costi</th><th>Giorni</th><th>Stato</th><th>Azioni</th></tr></thead>
              <tbody>
                {varianti.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #eef2f6" }}>
                    <td style={{ padding: "8px" }}>{item.codice || "-"}</td>
                    <td style={{ padding: "8px" }}>{item.descrizione}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(item.importo || 0)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(item.impatto_costi ?? item.impattoCosti ?? item.importo ?? 0)}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{numero(item.impatto_giorni ?? item.impattoGiorni).toFixed(0)}</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: "6px", background: normalizeStatus(item.stato) === "approvata" ? "#dcfce7" : normalizeStatus(item.stato) === "rifiutata" ? "#fee2e2" : "#fef3c7", color: "#334155", fontWeight: 700 }}>
                        {item.stato}
                      </span>
                    </td>
                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                      {normalizeStatus(item.stato) !== "approvata" && <button type="button" onClick={() => aggiornaStatoVariante(item, "Approvata")} style={{ background: "#16a34a", padding: "6px 8px" }}>Approva</button>}{" "}
                      <button type="button" onClick={() => eliminaVariante(item.id)} style={{ background: "#fff", color: "#b91c1c", padding: "6px 8px" }}>×</button>
                    </td>
                  </tr>
                ))}
                {!varianti.length && <tr><td colSpan="7" style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>Nessuna variante registrata.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "criticita" && (
          <div style={{ padding: "16px" }}>
            <h2>Criticità rilevate</h2>
            {voci.flatMap((voce, index) =>
              (voce.criticita || []).map((criticita, cIndex) => (
                <div key={index + "-" + cIndex} style={{ display: "flex", gap: "10px", padding: "10px 0", borderBottom: "1px solid #eef2f6" }}>
                  <AlertTriangle size={18} color="#b45309" />
                  <div>
                    <strong>{index + 1}. {voce.descrizione}</strong>
                    <div style={{ color: "#92400e" }}>{criticita}</div>
                  </div>
                </div>
              )),
            )}
            {!riepilogo.criticita && <p style={{ color: "#166534", fontWeight: 700 }}>Nessuna criticità rilevata.</p>}
          </div>
        )}

        {tab === "suggerimenti" && (
          <div style={{ padding: "16px" }}>
            <h2>Suggerimenti operativi</h2>
            <ul>
              {riepilogo.daVerificare > 0 && <li>Completa e conferma le {riepilogo.daVerificare} voci ancora da verificare.</li>}
              {voci.some((voce) => !voce.fonte) && <li>Ricerca una fonte prezzo per le voci che non hanno ancora riferimento DDT, prezzario o mercato.</li>}
              {cronoprogramma.length === 0 && <li>Esegui “Analizza costi e cerca prezzi” per generare il cronoprogramma della manodopera.</li>}
              {numeroViaggi === 0 && destinazione && <li>Definisci il numero di viaggi previsti per includere correttamente le percorrenze.</li>}
              <li>Verifica il margine del {marginePct}% prima di trasferire le voci al preventivo.</li>
            </ul>

            {confronto && (
              <div style={{ marginTop: "16px" }}>
                <h3>Confronto preventivo / consuntivo</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px" }}>
                  <div style={cardStyle()}><strong>Costo preventivato</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{euro.format(confronto.costoPreventivato || 0)}</div></div>
                  <div style={cardStyle()}><strong>Costo reale</strong><div style={{ fontSize: "20px", fontWeight: 800 }}>{euro.format(confronto.costoReale || 0)}</div></div>
                  <div style={cardStyle()}><strong>Scostamento costo</strong><div style={{ fontSize: "20px", fontWeight: 800, color: numero(confronto.scostamentoCosto) > 0 ? "#b91c1c" : "#166534" }}>{euro.format(confronto.scostamentoCosto || 0)}</div></div>
                  <div style={cardStyle()}><strong>Margine reale</strong><div style={{ fontSize: "20px", fontWeight: 800, color: numero(confronto.margineReale) < 0 ? "#b91c1c" : "#166534" }}>{euro.format(confronto.margineReale || 0)}</div></div>
                </div>
              </div>
            )}

            {revisioni.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <h3>Storico revisioni</h3>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {revisioni.map((rev) => (
                    <span key={rev.id} style={{ border: "1px solid #dbe3ee", borderRadius: "999px", padding: "6px 10px", background: "#fff" }}>
                      Rev.{rev.revisione} · {new Date(rev.createdAt).toLocaleString("it-IT")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ ...cardStyle(), maxWidth: "520px", marginTop: "14px" }}>
              <strong>Riepilogo economico</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "7px", marginTop: "10px" }}>
                <span>Costi diretti</span><strong>{euro.format(riepilogo.diretto)}</strong>
                <span>Spese generali</span><strong>{euro.format(riepilogo.speseGenerali)}</strong>
                <span>Margine</span><strong>{euro.format(riepilogo.margine)}</strong>
                <span style={{ borderTop: "1px solid #dbe3ee", paddingTop: "8px" }}>Prezzo vendita</span>
                <strong style={{ borderTop: "1px solid #dbe3ee", paddingTop: "8px", color: "#0b63ce" }}>{euro.format(riepilogo.vendita)}</strong>
              </div>
            </div>
          </div>
        )}

        {tab === "prezzi" && (
          <div style={{ padding: "16px" }}>
            <h2>Fonti prezzi utilizzate</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#edf2f7" }}><th>Voce</th><th>Prezzo</th><th>Fonte</th><th>Riferimento</th><th>Data</th></tr></thead>
              <tbody>
                {voci.map((voce, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #eef2f6" }}>
                    <td style={{ padding: "8px" }}>{voce.descrizione}</td>
                    <td style={{ padding: "8px", textAlign: "right" }}>{euro.format(voce.prezzoUnitario)}</td>
                    <td style={{ padding: "8px" }}>{voce.fonte || "-"}</td>
                    <td style={{ padding: "8px" }}>
                      {voce.fonteUrl ? <a href={voce.fonteUrl} target="_blank" rel="noreferrer">{voce.fonteTitolo || "Apri fonte"}</a> : voce.fonteTitolo || "-"}
                    </td>
                    <td style={{ padding: "8px" }}>{voce.fonteData ? new Date(voce.fonteData).toLocaleDateString("it-IT") : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AnalisiCosti;
