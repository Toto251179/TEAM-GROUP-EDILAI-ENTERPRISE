import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Download,
  Euro,
  FileText,
  Folder,
  MoreVertical,
  RotateCcw,
  Save,
  Search,
  Trophy,
} from "lucide-react";
import { api } from "../services/api";

const STATI = ["In Corso", "Pianificato", "Completato", "Sospeso", "Annullato"];
const RIGHE_PER_PAGINA = [10, 25, 50];

const cantiereVuoto = {
  id: null,
  clienteId: "",
  clienteCode: "",
  nome: "",
  cliente: "",
  indirizzo: "",
  dataInizio: "",
  dataFinePrevista: "",
  importo: "",
  stato: "In Corso",
  note: "",
};

function formatEuro(value) {
  return `EUR ${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statoCanonico(stato) {
  const normalizzato = String(stato || "").trim().toLowerCase();

  if (["completato", "completata", "concluso", "conclusa", "chiuso", "chiusa"].includes(normalizzato)) return "Completato";
  if (["sospeso", "sospesa", "pausa", "in pausa"].includes(normalizzato)) return "Sospeso";
  if (["annullato", "annullata", "cancellato", "cancellata", "eliminato", "eliminata"].includes(normalizzato)) return "Annullato";
  if (["pianificato", "pianificata", "programmato", "programmata"].includes(normalizzato)) return "Pianificato";
  return "In Corso";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("it-IT");
}

function dividiIndirizzo(indirizzo) {
  if (!indirizzo) return ["-", ""];
  const parti = String(indirizzo).split(",").map((parte) => parte.trim()).filter(Boolean);
  if (parti.length <= 1) return [indirizzo, ""];
  return [parti[0], parti.slice(1).join(", ")];
}

function statoVisuale(stato) {
  const statoNormalizzato = statoCanonico(stato);
  const palette = {
    "In Corso": { background: "#dbeafe", color: "#1d4ed8" },
    Pianificato: { background: "#e2e8f0", color: "#475569" },
    Completato: { background: "#dcfce7", color: "#15803d" },
    Sospeso: { background: "#ffedd5", color: "#c2410c" },
    Annullato: { background: "#fee2e2", color: "#b91c1c" },
  };

  return palette[statoNormalizzato] || palette["In Corso"];
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

function Cantieri() {
  const [cantieri, setCantieri] = useState([]);
  const [clienti, setClienti] = useState([]);
  const [form, setForm] = useState(cantiereVuoto);
  const [ricerca, setRicerca] = useState("");
  const [filtroStato, setFiltroStato] = useState("Tutti");
  const [pagina, setPagina] = useState(1);
  const [righePerPagina, setRighePerPagina] = useState(10);
  const [menuAzioniId, setMenuAzioniId] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaDati() {
      try {
        const [cantieriDb, clientiDb] = await Promise.all([api.get("/cantieri"), api.get("/clienti")]);

        if (componenteAttivo) {
          setCantieri(cantieriDb);
          setClienti(clientiDb);
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

  const cantieriFiltrati = useMemo(
    () =>
      cantieri.filter((cantiere) => {
        const testo = [cantiere.clienteCode, cantiere.nome, cantiere.cliente, cantiere.indirizzo, cantiere.stato, cantiere.note]
          .join(" ")
          .toLowerCase();
        const passaRicerca = testo.includes(ricerca.toLowerCase());
        const passaStato = filtroStato === "Tutti" || statoCanonico(cantiere.stato) === filtroStato;

        return passaRicerca && passaStato;
      }),
    [cantieri, filtroStato, ricerca],
  );

  const riepilogo = useMemo(
    () => ({
      totale: cantieriFiltrati.length,
      inCorso: cantieriFiltrati.filter((cantiere) => statoCanonico(cantiere.stato) === "In Corso").length,
      sospesi: cantieriFiltrati.filter((cantiere) => statoCanonico(cantiere.stato) === "Sospeso").length,
      completati: cantieriFiltrati.filter((cantiere) => statoCanonico(cantiere.stato) === "Completato").length,
      importo: cantieriFiltrati.reduce((totale, cantiere) => totale + Number(cantiere.importo || 0), 0),
    }),
    [cantieriFiltrati],
  );

  const totalePagine = Math.max(1, Math.ceil(cantieriFiltrati.length / righePerPagina));
  const paginaCorrente = Math.min(pagina, totalePagine);
  const indiceInizio = (paginaCorrente - 1) * righePerPagina;
  const indiceFine = Math.min(indiceInizio + righePerPagina, cantieriFiltrati.length);
  const cantieriPagina = cantieriFiltrati.slice(indiceInizio, indiceFine);
  const testoVista =
    cantieriFiltrati.length === 0
      ? "Vista da 0 a 0 di 0 risultati"
      : `Vista da ${indiceInizio + 1} a ${indiceFine} di ${cantieriFiltrati.length} risultati`;

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const aggiornaRicerca = (valore) => {
    setRicerca(valore);
    setPagina(1);
  };

  const aggiornaFiltroStato = (valore) => {
    setFiltroStato(valore);
    setPagina(1);
  };

  const aggiornaRighePerPagina = (valore) => {
    setRighePerPagina(Number(valore));
    setPagina(1);
  };

  const selezionaCliente = (clienteId) => {
    const cliente = clienti.find((item) => String(item.id) === String(clienteId));

    setForm((corrente) => ({
      ...corrente,
      clienteId,
      clienteCode: cliente?.clienteCode || "",
      cliente: cliente?.ragioneSociale || corrente.cliente,
      indirizzo: cliente?.indirizzo || corrente.indirizzo,
    }));
  };

  const resetForm = () => {
    setForm(cantiereVuoto);
    setErrore("");
  };

  const salvaCantiere = async () => {
    if (!form.nome.trim()) {
      setErrore("Inserisci il nome del cantiere.");
      return;
    }

    setErrore("");

    const payload = {
      clienteId: form.clienteId || null,
      clienteCode: form.clienteCode || "",
      nome: form.nome.trim(),
      cliente: form.cliente.trim(),
      indirizzo: form.indirizzo.trim(),
      dataInizio: form.dataInizio || null,
      dataFinePrevista: form.dataFinePrevista || null,
      importo: Number(form.importo || 0),
      stato: form.stato,
      note: form.note.trim(),
    };

    try {
      if (form.id) {
        const aggiornato = await api.put(`/cantieri/${form.id}`, payload);
        setCantieri((attuali) => attuali.map((cantiere) => (cantiere.id === form.id ? aggiornato : cantiere)));
      } else {
        const creato = await api.post("/cantieri", payload);
        setCantieri((attuali) => [creato, ...attuali]);
      }

      resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaCantiere = (cantiere) => {
    setForm({
      id: cantiere.id,
      clienteId: cantiere.clienteId || "",
      clienteCode: cantiere.clienteCode || "",
      nome: cantiere.nome || "",
      cliente: cantiere.cliente || "",
      indirizzo: cantiere.indirizzo || "",
      dataInizio: String(cantiere.dataInizio || "").slice(0, 10),
      dataFinePrevista: String(cantiere.dataFinePrevista || "").slice(0, 10),
      importo: cantiere.importo || "",
      stato: cantiere.stato || "In Corso",
      note: cantiere.note || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const aggiornaStato = async (cantiere, stato) => {
    setErrore("");

    try {
      const aggiornato = await api.put(`/cantieri/${cantiere.id}`, { stato });
      setCantieri((attuali) => attuali.map((item) => (item.id === cantiere.id ? aggiornato : item)));
    } catch (error) {
      setErrore(error.message);
    }
  };

  const eliminaCantiere = async (cantiere) => {
    const conferma = window.confirm(`Eliminare il cantiere ${cantiere.nome}?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.delete(`/cantieri/${cantiere.id}`);
      setCantieri((attuali) => attuali.filter((item) => item.id !== cantiere.id));
      if (form.id === cantiere.id) resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const esportaCantieri = () => {
    esportaCsv(
      `cantieri-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Nome", "Cliente", "Indirizzo", "Data inizio", "Fine prevista", "Importo", "Stato", "Note"],
      cantieriFiltrati.map((cantiere) => [
        cantiere.nome,
        cantiere.cliente,
        cantiere.indirizzo,
        formatDate(cantiere.dataInizio),
        formatDate(cantiere.dataFinePrevista),
        cantiere.importo,
        cantiere.stato,
        cantiere.note,
      ]),
    );
  };

  const apriRapportino = (cantiere) => {
    localStorage.setItem(
      "teamGroupRapportinoCantiere",
      JSON.stringify({
        cantiereId: cantiere.id,
        cantiere: cantiere.nome,
        cliente: cantiere.cliente,
      }),
    );
    window.location.href = "/giornale-cantiere";
  };

  const apriDettaglio = (cantiere) => {
    modificaCantiere(cantiere);
  };

  const apriGiornaleCantiere = (cantiere) => {
    apriRapportino(cantiere);
  };

  const eseguiAzioneMenu = (azione, cantiere) => {
    setMenuAzioniId(null);
    azione(cantiere);
  };

  const actionButton = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    height: "34px",
    minWidth: "104px",
    padding: "0 14px",
    borderRadius: "6px",
    border: "1px solid #bfdbfe",
    background: "#ffffff",
    color: "#1d4ed8",
    fontWeight: 700,
    whiteSpace: "nowrap",
    cursor: "pointer",
  };

  const styles = `
    .cantieri-enterprise {
      background: #f6f8fb;
      color: #0f172a;
      min-width: 0;
      padding-bottom: 28px;
    }

    .cantieri-enterprise h1,
    .cantieri-enterprise h2,
    .cantieri-enterprise h3,
    .cantieri-enterprise p {
      margin-top: 0;
    }

    .cantieri-heading {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 18px;
    }

    .cantieri-heading h1 {
      margin: 0 0 5px;
      font-size: 30px;
      line-height: 1.12;
    }

    .cantieri-heading p {
      color: #64748b;
      font-size: 14px;
      font-weight: 700;
    }

    .cantieri-stats {
      display: grid;
      grid-template-columns: repeat(5, minmax(170px, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }

    .cantieri-stat-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      min-height: 92px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 17px 18px;
      background: #ffffff;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
    }

    .cantieri-stat-card span {
      display: block;
      color: #64748b;
      font-size: 12px;
      font-weight: 850;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .cantieri-stat-card strong {
      display: block;
      margin-top: 7px;
      color: #0f172a;
      font-size: 24px;
      line-height: 1;
    }

    .cantieri-stat-card.value strong {
      font-size: 21px;
    }

    .cantieri-stat-icon {
      display: grid;
      width: 42px;
      height: 42px;
      flex: 0 0 42px;
      place-items: center;
      border-radius: 8px;
      background: #eff6ff;
      color: #1d4ed8;
    }

    .cantieri-form-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 18px;
      background: #ffffff;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
    }

    .cantieri-form-card h2 {
      margin-bottom: 14px;
      font-size: 20px;
    }

    .cantieri-form-grid {
      display: grid;
      grid-template-columns: minmax(220px, 1.4fr) minmax(220px, 1.2fr) minmax(220px, 1.2fr) minmax(220px, 1.2fr);
      gap: 10px;
    }

    .cantieri-form-grid input,
    .cantieri-form-grid select,
    .cantieri-form-card textarea {
      width: 100%;
      border-color: #cbd5e1;
      border-radius: 6px;
    }

    .cantieri-form-card textarea {
      margin-top: 10px;
    }

    .cantieri-form-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
    }

    .cantieri-form-actions button,
    .cantieri-toolbar button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
    }

    .cantieri-form-actions .secondary {
      border-color: #bfdbfe;
      background: #ffffff;
      color: #1d4ed8;
    }

    .cantieri-list-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
      overflow: visible;
    }

    .cantieri-list-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      padding: 22px;
      border-bottom: 1px solid #e2e8f0;
    }

    .cantieri-list-header h2 {
      font-size: 24px;
      line-height: 1.2;
      margin: 0 0 6px;
      color: #0f172a;
    }

    .cantieri-list-header p {
      margin: 0;
      color: #64748b;
      font-size: 14px;
    }

    .cantieri-toolbar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }

    .cantieri-search {
      position: relative;
    }

    .cantieri-search svg {
      position: absolute;
      top: 50%;
      left: 11px;
      color: #64748b;
      transform: translateY(-50%);
    }

    .cantieri-toolbar input,
    .cantieri-toolbar select {
      height: 38px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #0f172a;
      padding: 0 12px;
      font-size: 14px;
    }

    .cantieri-toolbar input {
      width: min(420px, 42vw);
      padding-left: 34px;
    }

    .cantieri-toolbar button,
    .cantieri-pagination button {
      height: 38px;
      border: 1px solid #1d4ed8;
      border-radius: 6px;
      background: #1d4ed8;
      color: #ffffff;
      font-weight: 700;
      padding: 0 14px;
      white-space: nowrap;
      cursor: pointer;
    }

    .cantieri-table-shell {
      overflow-x: auto;
      overflow-y: visible;
    }

    .cantieri-table {
      width: 100%;
      min-width: 1220px;
      border-collapse: separate;
      border-spacing: 0;
      text-align: left;
    }

    .cantieri-table th {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      color: #475569;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0;
      padding: 13px 14px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .cantieri-table td {
      border-bottom: 1px solid #eef2f7;
      color: #0f172a;
      font-size: 14px;
      padding: 14px;
      vertical-align: middle;
    }

    .cantieri-table th:nth-child(1),
    .cantieri-table td:nth-child(1) {
      width: 28%;
    }

    .cantieri-table th:nth-child(2),
    .cantieri-table td:nth-child(2) {
      width: 20%;
    }

    .cantieri-table th:nth-child(6),
    .cantieri-table td:nth-child(6) {
      width: 130px;
      text-align: right;
    }

    .cantieri-row-title {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 180px;
    }

    .cantieri-folder {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 34px;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: #dbeafe;
      color: #1d4ed8;
    }

    .cantieri-primary {
      display: block;
      font-weight: 800;
      line-height: 1.25;
      color: #0f172a;
    }

    .cantieri-secondary {
      display: block;
      margin-top: 4px;
      color: #64748b;
      font-size: 12px;
      line-height: 1.25;
    }

    .cantieri-address,
    .cantieri-note {
      max-width: 220px;
      color: #334155;
      line-height: 1.35;
    }

    .cantieri-money {
      color: #0f172a;
      font-weight: 800;
      white-space: nowrap;
    }

    .cantieri-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 94px;
      border: 0;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      padding: 7px 10px;
      text-align: center;
      white-space: nowrap;
    }

    .cantieri-status option {
      color: #0f172a;
      background: #ffffff;
    }

    .cantieri-actions {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      min-width: 278px;
      position: relative;
      white-space: nowrap;
    }

    .cantieri-menu-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      min-width: 34px;
      height: 34px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #334155;
      cursor: pointer;
    }

    .cantieri-action-menu {
      position: absolute;
      right: 0;
      top: 42px;
      z-index: 30;
      min-width: 190px;
      overflow: hidden;
      border: 1px solid #dbe3ef;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 16px 36px rgba(15, 23, 42, 0.16);
    }

    .cantieri-action-menu button {
      display: block;
      width: 100%;
      border: 0;
      background: #ffffff;
      color: #0f172a;
      font-weight: 700;
      padding: 11px 13px;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
    }

    .cantieri-action-menu button:hover {
      background: #f8fafc;
    }

    .cantieri-action-menu button.danger {
      color: #b91c1c;
    }

    .cantieri-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 16px 22px;
      color: #64748b;
      font-size: 14px;
    }

    .cantieri-pagination-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cantieri-pagination select {
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      padding: 0 8px;
    }

    .cantieri-pagination button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      padding: 0;
    }

    .cantieri-pagination button:disabled {
      border-color: #cbd5e1;
      background: #e2e8f0;
      color: #94a3b8;
      cursor: not-allowed;
    }

    .cantieri-mobile-list {
      display: none;
      padding: 14px;
      gap: 12px;
    }

    @media (max-width: 1024px) {
      .cantieri-stats {
        grid-template-columns: repeat(2, minmax(170px, 1fr));
      }

      .cantieri-form-grid {
        grid-template-columns: repeat(2, minmax(220px, 1fr));
      }

      .cantieri-list-header {
        flex-direction: column;
      }

      .cantieri-toolbar {
        justify-content: flex-start;
        width: 100%;
      }

      .cantieri-toolbar input {
        width: min(100%, 420px);
      }
    }

    @media (max-width: 720px) {
      .cantieri-heading {
        align-items: flex-start;
        flex-direction: column;
      }

      .cantieri-stats,
      .cantieri-form-grid {
        grid-template-columns: 1fr;
      }

      .cantieri-table-shell {
        display: none;
      }

      .cantieri-mobile-list {
        display: grid;
      }

      .cantieri-list-header,
      .cantieri-pagination {
        padding: 16px;
      }

      .cantieri-toolbar,
      .cantieri-toolbar input,
      .cantieri-toolbar select,
      .cantieri-toolbar button {
        width: 100%;
      }

      .cantieri-mobile-card {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #ffffff;
        padding: 14px;
      }

      .cantieri-mobile-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        margin: 14px 0;
      }

      .cantieri-actions {
        min-width: 0;
        width: 100%;
      }

      .cantieri-actions > button:not(.cantieri-menu-button) {
        flex: 1;
        min-width: 0 !important;
      }

      .cantieri-pagination {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `;

  return (
    <div className="cantieri-enterprise">
      <style>{styles}</style>
      <div className="cantieri-heading">
        <div>
          <h1>Cantieri Enterprise</h1>
          <p>Gestione operativa dei cantieri collegata ai dati PostgreSQL.</p>
        </div>
      </div>

      <div className="cantieri-stats">
        <div className="cantieri-stat-card">
          <div>
            <span>Cantieri</span>
            <strong>{riepilogo.totale}</strong>
          </div>
          <span className="cantieri-stat-icon"><BriefcaseBusiness size={22} /></span>
        </div>
        <div className="cantieri-stat-card">
          <div>
            <span>In Corso</span>
            <strong>{riepilogo.inCorso}</strong>
          </div>
          <span className="cantieri-stat-icon"><CirclePlay size={22} /></span>
        </div>
        <div className="cantieri-stat-card">
          <div>
            <span>Completati</span>
            <strong>{riepilogo.completati}</strong>
          </div>
          <span className="cantieri-stat-icon"><Trophy size={22} /></span>
        </div>
        <div className="cantieri-stat-card">
          <div>
            <span>Sospesi</span>
            <strong>{riepilogo.sospesi}</strong>
          </div>
          <span className="cantieri-stat-icon"><CirclePause size={22} /></span>
        </div>
        <div className="cantieri-stat-card value">
          <div>
            <span>Valore</span>
            <strong>{formatEuro(riepilogo.importo)}</strong>
          </div>
          <span className="cantieri-stat-icon"><Euro size={22} /></span>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div className="cantieri-form-card">
        <h2>{form.id ? "Modifica Cantiere" : "Nuovo Cantiere"}</h2>

        <div className="cantieri-form-grid">
          <input placeholder="Nome cantiere" value={form.nome} onChange={(e) => aggiornaForm("nome", e.target.value)} />

          <select value={form.clienteId} onChange={(e) => selezionaCliente(e.target.value)}>
            <option value="">Cliente da anagrafica</option>
            {clienti.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.ragioneSociale}
              </option>
            ))}
          </select>

          <input placeholder="Cliente" value={form.cliente} onChange={(e) => aggiornaForm("cliente", e.target.value)} />
          <input
            placeholder="Indirizzo"
            value={form.indirizzo}
            onChange={(e) => aggiornaForm("indirizzo", e.target.value)}
          />
          <input
            type="date"
            value={form.dataInizio}
            onChange={(e) => aggiornaForm("dataInizio", e.target.value)}
          />
          <input
            type="date"
            value={form.dataFinePrevista}
            onChange={(e) => aggiornaForm("dataFinePrevista", e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Importo EUR"
            value={form.importo}
            onChange={(e) => aggiornaForm("importo", e.target.value)}
          />
          <select value={form.stato} onChange={(e) => aggiornaForm("stato", e.target.value)}>
            {STATI.map((stato) => (
              <option key={stato}>{stato}</option>
            ))}
          </select>
        </div>

        <textarea
          placeholder="Note cantiere"
          value={form.note}
          onChange={(e) => aggiornaForm("note", e.target.value)}
        />

        <div className="cantieri-form-actions">
          <button onClick={salvaCantiere}><Save size={16} /> {form.id ? "Salva Modifiche" : "Salva Cantiere"}</button>
          <button className="secondary" onClick={resetForm}><RotateCcw size={16} /> Nuovo / Annulla</button>
        </div>
      </div>

      <div className="cantieri-list-card">
        <div className="cantieri-list-header">
          <div>
            <h2>Elenco Cantieri</h2>
            <p>Gestione completa dei cantieri aziendali</p>
          </div>
          <div className="cantieri-toolbar">
            <div className="cantieri-search">
              <Search size={16} />
              <input
                placeholder="Ricerca per cantiere, cliente, indirizzo o nota"
                value={ricerca}
                onChange={(e) => aggiornaRicerca(e.target.value)}
              />
            </div>
            <select value={filtroStato} onChange={(e) => aggiornaFiltroStato(e.target.value)}>
              <option value="Tutti">Tutti gli stati</option>
              {STATI.map((stato) => (
                <option key={stato}>{stato}</option>
              ))}
            </select>
            <button onClick={esportaCantieri}><Download size={16} /> Esporta CSV</button>
          </div>
        </div>

        {caricamento ? (
          <p style={{ padding: "22px", margin: 0 }}>Caricamento cantieri...</p>
        ) : (
          <>
            <div className="cantieri-table-shell">
              <table className="cantieri-table">
                <thead>
                  <tr>
                    <th>NOME</th>
                    <th>CLIENTE</th>
                    <th>INDIRIZZO</th>
                    <th>DATA ULTIMO</th>
                    <th>FINE PREVISTA</th>
                    <th>VOLUME</th>
                    <th>STATO</th>
                    <th>NOTA</th>
                    <th>AZIONI</th>
                  </tr>
                </thead>

                <tbody>
                  {cantieriFiltrati.length === 0 && (
                    <tr>
                      <td colSpan="9" style={{ padding: "22px", color: "#64748b", textAlign: "center" }}>
                        Nessun cantiere trovato. Crea un nuovo cantiere o modifica i filtri.
                      </td>
                    </tr>
                  )}

                  {cantieriPagina.map((cantiere) => {
                    const [indirizzoRigaUno, indirizzoRigaDue] = dividiIndirizzo(cantiere.indirizzo);
                    const stato = statoCanonico(cantiere.stato);
                    const statoStyle = statoVisuale(stato);

                    return (
                      <tr key={cantiere.id}>
                        <td>
                          <div className="cantieri-row-title">
                            <span className="cantieri-folder" aria-hidden="true">
                              <Folder size={18} />
                            </span>
                            <span>
                              <span className="cantieri-primary">{cantiere.nome || "-"}</span>
                              <span className="cantieri-secondary">ID cantiere {cantiere.id}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="cantieri-primary">{cantiere.cliente || "-"}</span>
                          {cantiere.clienteCode && <span className="cantieri-secondary">ID cliente {cantiere.clienteCode}</span>}
                        </td>
                        <td>
                          <div className="cantieri-address">
                            <span>{indirizzoRigaUno}</span>
                            {indirizzoRigaDue && <span className="cantieri-secondary">{indirizzoRigaDue}</span>}
                          </div>
                        </td>
                        <td>{formatDate(cantiere.dataInizio) || "-"}</td>
                        <td>{formatDate(cantiere.dataFinePrevista) || "-"}</td>
                        <td className="cantieri-money">{formatEuro(cantiere.importo)}</td>
                        <td>
                          <select
                            className="cantieri-status"
                            value={stato}
                            onChange={(e) => aggiornaStato(cantiere, e.target.value)}
                            style={statoStyle}
                          >
                            {STATI.map((stato) => (
                              <option key={stato}>{stato}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="cantieri-note">{cantiere.note || "-"}</div>
                        </td>
                        <td>
                          <div className="cantieri-actions">
                            <button style={actionButton} onClick={() => modificaCantiere(cantiere)}>Modifica</button>
                            <button style={actionButton} onClick={() => apriRapportino(cantiere)}>Rapportino</button>
                            <button
                              className="cantieri-menu-button"
                              aria-label={`Altre azioni ${cantiere.nome || cantiere.id}`}
                              onClick={() => setMenuAzioniId(menuAzioniId === cantiere.id ? null : cantiere.id)}
                            >
                              <MoreVertical size={18} />
                            </button>
                            {menuAzioniId === cantiere.id && (
                              <div className="cantieri-action-menu">
                                <button onClick={() => eseguiAzioneMenu(apriDettaglio, cantiere)}>Dettaglio</button>
                                <button onClick={() => eseguiAzioneMenu(apriGiornaleCantiere, cantiere)}>Giornale Cantiere</button>
                                <button className="danger" onClick={() => eseguiAzioneMenu(eliminaCantiere, cantiere)}>Elimina</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="cantieri-mobile-list">
              {cantieriPagina.map((cantiere) => {
                const [indirizzoRigaUno, indirizzoRigaDue] = dividiIndirizzo(cantiere.indirizzo);
                const stato = statoCanonico(cantiere.stato);
                const statoStyle = statoVisuale(stato);

                return (
                  <article className="cantieri-mobile-card" key={`mobile-${cantiere.id}`}>
                    <div className="cantieri-row-title">
                      <span className="cantieri-folder" aria-hidden="true">
                        <Folder size={18} />
                      </span>
                      <span>
                        <span className="cantieri-primary">{cantiere.nome || "-"}</span>
                        <span className="cantieri-secondary">ID cantiere {cantiere.id}</span>
                      </span>
                    </div>
                    <div className="cantieri-mobile-grid">
                      <div>
                        <span className="cantieri-secondary">Cliente</span>
                        <span className="cantieri-primary">{cantiere.cliente || "-"}</span>
                        {cantiere.clienteCode && <span className="cantieri-secondary">ID cliente {cantiere.clienteCode}</span>}
                      </div>
                      <div>
                        <span className="cantieri-secondary">Indirizzo</span>
                        <div className="cantieri-address">
                          <span>{indirizzoRigaUno}</span>
                          {indirizzoRigaDue && <span className="cantieri-secondary">{indirizzoRigaDue}</span>}
                        </div>
                      </div>
                      <div>
                        <span className="cantieri-secondary">Date</span>
                        <span className="cantieri-primary">{formatDate(cantiere.dataInizio) || "-"} / {formatDate(cantiere.dataFinePrevista) || "-"}</span>
                      </div>
                      <div>
                        <span className="cantieri-secondary">Volume</span>
                        <span className="cantieri-money">{formatEuro(cantiere.importo)}</span>
                      </div>
                      <div>
                        <span className="cantieri-secondary">Stato</span>
                        <select
                          className="cantieri-status"
                          value={stato}
                          onChange={(e) => aggiornaStato(cantiere, e.target.value)}
                          style={statoStyle}
                        >
                          {STATI.map((stato) => (
                            <option key={stato}>{stato}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="cantieri-secondary">Nota</span>
                        <div className="cantieri-note">{cantiere.note || "-"}</div>
                      </div>
                    </div>
                    <div className="cantieri-actions">
                      <button style={actionButton} onClick={() => modificaCantiere(cantiere)}>Modifica</button>
                      <button style={actionButton} onClick={() => apriRapportino(cantiere)}>
                        <FileText size={15} /> Rapportino
                      </button>
                      <button
                        className="cantieri-menu-button"
                        aria-label={`Altre azioni ${cantiere.nome || cantiere.id}`}
                        onClick={() => setMenuAzioniId(menuAzioniId === `mobile-${cantiere.id}` ? null : `mobile-${cantiere.id}`)}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {menuAzioniId === `mobile-${cantiere.id}` && (
                        <div className="cantieri-action-menu">
                          <button onClick={() => eseguiAzioneMenu(apriDettaglio, cantiere)}>Dettaglio</button>
                          <button onClick={() => eseguiAzioneMenu(apriGiornaleCantiere, cantiere)}>Giornale Cantiere</button>
                          <button className="danger" onClick={() => eseguiAzioneMenu(eliminaCantiere, cantiere)}>Elimina</button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="cantieri-pagination">
              <div>
                <select value={righePerPagina} onChange={(e) => aggiornaRighePerPagina(e.target.value)}>
                  {RIGHE_PER_PAGINA.map((righe) => (
                    <option key={righe} value={righe}>{righe} righe</option>
                  ))}
                </select>
              </div>
              <span>{testoVista}</span>
              <div className="cantieri-pagination-controls">
                <button disabled={paginaCorrente <= 1} onClick={() => setPagina((corrente) => Math.max(1, corrente - 1))} aria-label="Pagina precedente">
                  <ChevronLeft size={18} />
                </button>
                <strong>{paginaCorrente} / {totalePagine}</strong>
                <button disabled={paginaCorrente >= totalePagine} onClick={() => setPagina((corrente) => Math.min(totalePagine, corrente + 1))} aria-label="Pagina successiva">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Cantieri;
