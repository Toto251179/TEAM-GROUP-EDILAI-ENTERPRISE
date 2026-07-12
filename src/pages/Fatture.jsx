import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { azienda } from "../config/azienda";
import { api } from "../services/api";
import { disegnaIntestazioneAzienda } from "../utils/pdfAzienda";

const STATI = ["Da Pagare", "Pagata", "Scaduta"];
const TIPI = ["Attiva", "Passiva"];

const fatturaVuota = {
  id: null,
  numero: "",
  tipo: "Attiva",
  data: new Date().toISOString().split("T")[0],
  cantiereId: "",
  clienteCode: "",
  cantiere: "",
  soggetto: "",
  importo: "",
  scadenza: "",
  stato: "Da Pagare",
};

function formatEuro(value) {
  return `EUR ${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("it-IT");
}

function normalizzaData(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
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

function generaNumeroFattura(fatture, tipo) {
  const anno = new Date().getFullYear();
  const sigla = tipo === "Passiva" ? "FP" : "FA";
  const prefisso = `${sigla}-${anno}-`;
  const progressivi = fatture
    .map((fattura) => fattura.numero || "")
    .filter((numero) => numero.startsWith(prefisso))
    .map((numero) => Number(numero.replace(prefisso, "")))
    .filter((numero) => !Number.isNaN(numero));
  const prossimo = progressivi.length ? Math.max(...progressivi) + 1 : 1;

  return `${prefisso}${String(prossimo).padStart(4, "0")}`;
}

function statoEffettivo(fattura) {
  if (fattura.stato === "Pagata") return "Pagata";
  if (fattura.scadenza && new Date(fattura.scadenza) < new Date(new Date().toISOString().slice(0, 10))) return "Scaduta";

  return fattura.stato || "Da Pagare";
}

function Fatture() {
  const [fatture, setFatture] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [form, setForm] = useState(fatturaVuota);
  const [ricerca, setRicerca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("Tutte");
  const [filtroStato, setFiltroStato] = useState("Tutti");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaDati() {
      try {
        const [fattureDb, cantieriDb] = await Promise.all([api.get("/fatture"), api.get("/cantieri")]);

        if (componenteAttivo) {
          setFatture(fattureDb);
          setCantieri(cantieriDb);
          setForm((corrente) => ({
            ...corrente,
            numero: generaNumeroFattura(fattureDb, corrente.tipo),
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

  const fattureFiltrate = useMemo(
    () =>
      fatture.filter((fattura) => {
        const testo = [fattura.clienteCode, fattura.numero, fattura.tipo, fattura.cantiere, fattura.soggetto, statoEffettivo(fattura)]
          .join(" ")
          .toLowerCase();
        const passaRicerca = testo.includes(ricerca.toLowerCase());
        const passaTipo = filtroTipo === "Tutte" || fattura.tipo === filtroTipo;
        const passaStato = filtroStato === "Tutti" || statoEffettivo(fattura) === filtroStato;

        return passaRicerca && passaTipo && passaStato;
      }),
    [fatture, filtroStato, filtroTipo, ricerca],
  );

  const totali = useMemo(() => {
    const attive = fattureFiltrate.filter((fattura) => fattura.tipo === "Attiva");
    const passive = fattureFiltrate.filter((fattura) => fattura.tipo === "Passiva");
    const aperte = fattureFiltrate.filter((fattura) => statoEffettivo(fattura) !== "Pagata");
    const scadute = fattureFiltrate.filter((fattura) => statoEffettivo(fattura) === "Scaduta");

    return {
      totaleAttive: attive.reduce((totale, fattura) => totale + Number(fattura.importo || 0), 0),
      totalePassive: passive.reduce((totale, fattura) => totale + Number(fattura.importo || 0), 0),
      aperte: aperte.reduce((totale, fattura) => totale + Number(fattura.importo || 0), 0),
      scadute: scadute.reduce((totale, fattura) => totale + Number(fattura.importo || 0), 0),
    };
  }, [fattureFiltrate]);

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => {
      const aggiornato = { ...corrente, [campo]: valore };

      if (campo === "tipo" && !corrente.id) {
        aggiornato.numero = generaNumeroFattura(fatture, valore);
      }

      return aggiornato;
    });
  };

  const aggiornaCantiere = (cantiereId) => {
    const cantiere = cantieri.find((item) => String(item.id) === String(cantiereId));

    setForm((corrente) => ({
      ...corrente,
      cantiereId,
      clienteCode: cantiere?.clienteCode || corrente.clienteCode || "",
      cantiere: cantiere?.nome || "",
      soggetto: corrente.soggetto || cantiere?.cliente || "",
    }));
  };

  const resetForm = () => {
    setForm({
      ...fatturaVuota,
      data: new Date().toISOString().split("T")[0],
      numero: generaNumeroFattura(fatture, "Attiva"),
    });
    setErrore("");
  };

  const salvaFattura = async () => {
    if (!form.soggetto || !form.importo) {
      setErrore("Inserisci soggetto e importo della fattura.");
      return;
    }

    setErrore("");

    const payload = {
      numero: form.numero || generaNumeroFattura(fatture, form.tipo),
      tipo: form.tipo,
      data: form.data,
      cantiereId: form.cantiereId ? Number(form.cantiereId) : null,
      clienteCode: form.clienteCode || "",
      cantiere: form.cantiere,
      soggetto: form.soggetto,
      importo: Number(form.importo || 0),
      scadenza: form.scadenza || null,
      stato: form.stato,
    };

    try {
      if (form.id) {
        const aggiornata = await api.put(`/fatture/${form.id}`, payload);
        setFatture((attuali) => attuali.map((fattura) => (fattura.id === form.id ? aggiornata : fattura)));
      } else {
        const creata = await api.post("/fatture", payload);
        setFatture((attuali) => [creata, ...attuali]);
      }

      resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaFattura = (fattura) => {
    setForm({
      id: fattura.id,
      numero: fattura.numero || "",
      tipo: fattura.tipo || "Attiva",
      data: normalizzaData(fattura.data) || new Date().toISOString().split("T")[0],
      cantiereId: fattura.cantiereId || "",
      clienteCode: fattura.clienteCode || "",
      cantiere: fattura.cantiere || "",
      soggetto: fattura.soggetto || "",
      importo: fattura.importo || "",
      scadenza: normalizzaData(fattura.scadenza),
      stato: fattura.stato || "Da Pagare",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cambiaStato = async (fattura, stato) => {
    setErrore("");

    try {
      const aggiornata = await api.put(`/fatture/${fattura.id}`, { stato });
      setFatture((attuali) => attuali.map((item) => (item.id === fattura.id ? aggiornata : item)));
    } catch (error) {
      setErrore(error.message);
    }
  };

  const eliminaFattura = async (fattura) => {
    const conferma = window.confirm(`Eliminare la fattura ${fattura.numero}?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.delete(`/fatture/${fattura.id}`);
      setFatture((attuali) => attuali.filter((item) => item.id !== fattura.id));
      if (form.id === fattura.id) resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const esportaFatture = () => {
    esportaCsv(
      `fatture-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Numero", "Tipo", "Data", "Cantiere", "Soggetto", "Scadenza", "Importo", "Stato"],
      fattureFiltrate.map((fattura) => [
        fattura.numero,
        fattura.tipo,
        formatDate(fattura.data),
        fattura.cantiere,
        fattura.soggetto,
        formatDate(fattura.scadenza),
        fattura.importo,
        statoEffettivo(fattura),
      ]),
    );
  };

  const generaPdfFattura = async (fattura) => {
    const doc = new jsPDF();
    let y = 20;

    await disegnaIntestazioneAzienda(doc, y);
    y += 18;
    doc.setFontSize(12);
    doc.text(`Fattura ${fattura.tipo || ""}`, 36, y);
    y += 10;
    doc.setDrawColor(21, 101, 192);
    doc.setLineWidth(0.7);
    doc.line(14, y, 196, y);
    y += 12;

    doc.setFontSize(10);
    [
      ["Numero", fattura.numero],
      ["Data", formatDate(fattura.data)],
      ["Scadenza", formatDate(fattura.scadenza)],
      ["Cantiere", fattura.cantiere],
      ["Cliente / Fornitore", fattura.soggetto],
      ["Stato", statoEffettivo(fattura)],
    ].forEach(([label, value]) => {
      doc.setFont(undefined, "bold");
      doc.text(`${label}:`, 14, y);
      doc.setFont(undefined, "normal");
      doc.text(String(value || ""), 58, y);
      y += 8;
    });

    y += 8;
    doc.setFontSize(14);
    doc.text(`Totale documento: ${formatEuro(fattura.importo)}`, 120, y);
    y += 22;
    doc.setFontSize(9);
    doc.text(`Documento gestionale generato da ${azienda.ragioneSociale}`, 14, y);

    doc.save(`${fattura.numero || "fattura"}.pdf`);
  };

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <div>
      <h1>Fatture PRO</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Attive</h3>
          <h2>{formatEuro(totali.totaleAttive)}</h2>
        </div>
        <div style={card}>
          <h3>Passive</h3>
          <h2>{formatEuro(totali.totalePassive)}</h2>
        </div>
        <div style={card}>
          <h3>Saldo</h3>
          <h2>{formatEuro(totali.totaleAttive - totali.totalePassive)}</h2>
        </div>
        <div style={card}>
          <h3>Aperte</h3>
          <h2>{formatEuro(totali.aperte)}</h2>
        </div>
        <div style={card}>
          <h3>Scadute</h3>
          <h2>{formatEuro(totali.scadute)}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica Fattura" : "Nuova Fattura"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
          <input placeholder="Numero" value={form.numero} onChange={(e) => aggiornaForm("numero", e.target.value)} />

          <select value={form.tipo} onChange={(e) => aggiornaForm("tipo", e.target.value)}>
            {TIPI.map((tipo) => (
              <option key={tipo}>{tipo}</option>
            ))}
          </select>

          <input type="date" value={form.data} onChange={(e) => aggiornaForm("data", e.target.value)} />

          <select value={form.cantiereId} onChange={(e) => aggiornaCantiere(e.target.value)}>
            <option value="">Seleziona Cantiere</option>
            {cantieri.map((cantiere) => (
              <option key={cantiere.id} value={cantiere.id}>
                {cantiere.nome}
              </option>
            ))}
          </select>

          <input placeholder="Cantiere" value={form.cantiere} onChange={(e) => aggiornaForm("cantiere", e.target.value)} />
          <input
            placeholder="Cliente / Fornitore"
            value={form.soggetto}
            onChange={(e) => aggiornaForm("soggetto", e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Importo EUR"
            value={form.importo}
            onChange={(e) => aggiornaForm("importo", e.target.value)}
          />
          <input type="date" value={form.scadenza} onChange={(e) => aggiornaForm("scadenza", e.target.value)} />
          <select value={form.stato} onChange={(e) => aggiornaForm("stato", e.target.value)}>
            {STATI.map((stato) => (
              <option key={stato}>{stato}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "15px", flexWrap: "wrap" }}>
          <button onClick={salvaFattura}>{form.id ? "Salva Modifiche" : "Salva Fattura"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>Elenco Fatture</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              placeholder="Ricerca per numero, cantiere, soggetto o stato"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              style={{ width: "360px" }}
            />
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option>Tutte</option>
              {TIPI.map((tipo) => (
                <option key={tipo}>{tipo}</option>
              ))}
            </select>
            <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)}>
              <option>Tutti</option>
              {STATI.map((stato) => (
                <option key={stato}>{stato}</option>
              ))}
            </select>
            <button onClick={esportaFatture}>Esporta CSV</button>
          </div>
        </div>

        {caricamento ? (
          <p>Caricamento fatture...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Numero</th>
                <th>Tipo</th>
                <th>Data</th>
                <th>Cantiere</th>
                <th>Soggetto</th>
                <th>Scadenza</th>
                <th>Importo</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {fattureFiltrate.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ padding: "22px", color: "#64748b" }}>
                    Nessuna fattura trovata. Crea una nuova fattura o modifica i filtri.
                  </td>
                </tr>
              )}

              {fattureFiltrate.map((fattura) => (
                <tr key={fattura.id}>
                  <td style={{ fontWeight: 800 }}>{fattura.numero}</td>
                  <td>{fattura.tipo}</td>
                  <td>{formatDate(fattura.data)}</td>
                  <td>{fattura.cantiere}</td>
                  <td>{fattura.soggetto}</td>
                  <td>{formatDate(fattura.scadenza)}</td>
                  <td>{formatEuro(fattura.importo)}</td>
                  <td>
                    <select
                      value={fattura.stato || "Da Pagare"}
                      onChange={(e) => cambiaStato(fattura, e.target.value)}
                      style={{ width: "130px" }}
                    >
                      {STATI.map((stato) => (
                        <option key={stato}>{stato}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button onClick={() => modificaFattura(fattura)}>Modifica</button>{" "}
                    <button onClick={() => generaPdfFattura(fattura)}>PDF</button>{" "}
                    <button onClick={() => eliminaFattura(fattura)}>Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Fatture;
