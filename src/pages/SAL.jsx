import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { generaPDFSAL } from "../utils/pdfSAL.js";

const salVuoto = {
  id: null,
  cantiereId: "",
  data: new Date().toISOString().split("T")[0],
  cantiere: "",
  cliente: "",
  contratto: "",
  percentuale: "",
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

function calcolaSAL(contratto, percentuale) {
  const valoreContratto = Number(contratto || 0);
  const valorePercentuale = Number(percentuale || 0);
  const maturato = Number(((valoreContratto * valorePercentuale) / 100).toFixed(2));
  const residuo = Number((valoreContratto - maturato).toFixed(2));

  return { maturato, residuo };
}

function generaNumeroFatturaSal() {
  return `FA-SAL-${new Date().getFullYear()}-${Date.now()}`;
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

function SAL() {
  const [cantieri, setCantieri] = useState([]);
  const [sal, setSal] = useState([]);
  const [form, setForm] = useState(salVuoto);
  const [ricerca, setRicerca] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaDati() {
      try {
        const [cantieriDb, salDb] = await Promise.all([api.get("/cantieri"), api.get("/sal")]);

        if (componenteAttivo) {
          setCantieri(cantieriDb);
          setSal(salDb);
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

  const salFiltrati = useMemo(
    () =>
      sal.filter((item) =>
        [item.cantiere, item.cliente, item.data, item.percentuale]
          .join(" ")
          .toLowerCase()
          .includes(ricerca.toLowerCase()),
      ),
    [ricerca, sal],
  );

  const riepilogo = useMemo(
    () => ({
      emessi: salFiltrati.length,
      totaleContratti: salFiltrati.reduce((totale, item) => totale + Number(item.contratto || 0), 0),
      totaleMaturato: salFiltrati.reduce((totale, item) => totale + Number(item.maturato || 0), 0),
      totaleResiduo: salFiltrati.reduce((totale, item) => totale + Number(item.residuo || 0), 0),
      avanzamentoMedio: salFiltrati.length
        ? salFiltrati.reduce((totale, item) => totale + Number(item.percentuale || 0), 0) / salFiltrati.length
        : 0,
    }),
    [salFiltrati],
  );

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const aggiornaCantiere = (cantiereId) => {
    const cantiere = cantieri.find((item) => String(item.id) === String(cantiereId));

    setForm((corrente) => ({
      ...corrente,
      cantiereId,
      cantiere: cantiere?.nome || "",
      cliente: cantiere?.cliente || "",
      contratto: cantiere?.importo || corrente.contratto,
    }));
  };

  const resetForm = () => {
    setForm({
      ...salVuoto,
      data: new Date().toISOString().split("T")[0],
    });
    setErrore("");
  };

  const salvaSAL = async () => {
    if (!form.cantiere && !form.cantiereId) {
      setErrore("Seleziona o inserisci il cantiere.");
      return;
    }

    if (!form.percentuale) {
      setErrore("Inserisci la percentuale di avanzamento.");
      return;
    }

    const { maturato, residuo } = calcolaSAL(form.contratto, form.percentuale);

    setErrore("");

    const payload = {
      cantiereId: form.cantiereId ? Number(form.cantiereId) : null,
      data: form.data,
      cantiere: form.cantiere,
      cliente: form.cliente,
      contratto: Number(form.contratto || 0),
      percentuale: Number(form.percentuale || 0),
      maturato,
      residuo,
    };

    try {
      if (form.id) {
        const aggiornato = await api.put(`/sal/${form.id}`, payload);
        setSal((attuali) => attuali.map((item) => (item.id === form.id ? aggiornato : item)));
      } else {
        const creato = await api.post("/sal", payload);
        setSal((attuali) => [creato, ...attuali]);
      }

      resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaSAL = (item) => {
    setForm({
      id: item.id,
      cantiereId: item.cantiereId || "",
      data: normalizzaData(item.data) || new Date().toISOString().split("T")[0],
      cantiere: item.cantiere || "",
      cliente: item.cliente || "",
      contratto: item.contratto || "",
      percentuale: item.percentuale || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminaSAL = async (item) => {
    const conferma = window.confirm(`Eliminare il SAL del cantiere ${item.cantiere}?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.delete(`/sal/${item.id}`);
      setSal((attuali) => attuali.filter((salItem) => salItem.id !== item.id));
      if (form.id === item.id) resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const generaFatturaDaSAL = async (item) => {
    const conferma = window.confirm(`Generare una fattura attiva dal SAL di ${item.cantiere}?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.post("/fatture", {
        numero: generaNumeroFatturaSal(),
        tipo: "Attiva",
        data: new Date().toISOString().split("T")[0],
        cantiereId: item.cantiereId || null,
        cantiere: item.cantiere,
        soggetto: item.cliente,
        importo: Number(item.maturato || 0),
        stato: "Da Pagare",
      });
      alert("Fattura generata dal SAL.");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const esportaSAL = () => {
    esportaCsv(
      `sal-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Data", "Cantiere", "Cliente", "Contratto", "Percentuale", "Maturato", "Residuo"],
      salFiltrati.map((item) => [
        formatDate(item.data),
        item.cantiere,
        item.cliente,
        item.contratto,
        item.percentuale,
        item.maturato,
        item.residuo,
      ]),
    );
  };

  const preview = calcolaSAL(form.contratto, form.percentuale);

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <div>
      <h1>SAL PRO</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>SAL Emessi</h3>
          <h2>{riepilogo.emessi}</h2>
        </div>
        <div style={card}>
          <h3>Contratti</h3>
          <h2>{formatEuro(riepilogo.totaleContratti)}</h2>
        </div>
        <div style={card}>
          <h3>Maturato</h3>
          <h2>{formatEuro(riepilogo.totaleMaturato)}</h2>
        </div>
        <div style={card}>
          <h3>Residuo</h3>
          <h2>{formatEuro(riepilogo.totaleResiduo)}</h2>
        </div>
        <div style={card}>
          <h3>Avanzamento Medio</h3>
          <h2>{riepilogo.avanzamentoMedio.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica SAL" : "Nuovo SAL"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
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
          <input placeholder="Cliente" value={form.cliente} onChange={(e) => aggiornaForm("cliente", e.target.value)} />
          <input
            type="number"
            step="0.01"
            placeholder="Contratto EUR"
            value={form.contratto}
            onChange={(e) => aggiornaForm("contratto", e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder="% avanzamento"
            value={form.percentuale}
            onChange={(e) => aggiornaForm("percentuale", e.target.value)}
          />
          <input readOnly value={`Maturato: ${formatEuro(preview.maturato)}`} />
          <input readOnly value={`Residuo: ${formatEuro(preview.residuo)}`} />
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "15px", flexWrap: "wrap" }}>
          <button onClick={salvaSAL}>{form.id ? "Salva Modifiche" : "Salva SAL"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>Storico SAL</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              placeholder="Ricerca per cantiere, cliente o data"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              style={{ width: "320px" }}
            />
            <button onClick={esportaSAL}>Esporta CSV</button>
          </div>
        </div>

        {caricamento ? (
          <p>Caricamento SAL...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cantiere</th>
                <th>Cliente</th>
                <th>Contratto</th>
                <th>SAL %</th>
                <th>Maturato</th>
                <th>Residuo</th>
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {salFiltrati.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ padding: "22px", color: "#64748b" }}>
                    Nessun SAL trovato. Crea un nuovo SAL o modifica la ricerca.
                  </td>
                </tr>
              )}

              {salFiltrati.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.data)}</td>
                  <td style={{ fontWeight: 800, textAlign: "left" }}>{item.cantiere}</td>
                  <td>{item.cliente}</td>
                  <td>{formatEuro(item.contratto)}</td>
                  <td>{Number(item.percentuale || 0).toLocaleString("it-IT")}%</td>
                  <td>{formatEuro(item.maturato)}</td>
                  <td>{formatEuro(item.residuo)}</td>
                  <td>
                    <button onClick={() => modificaSAL(item)}>Modifica</button>{" "}
                    <button onClick={() => generaPDFSAL(item)}>PDF</button>{" "}
                    <button onClick={() => generaFatturaDaSAL(item)}>Genera fattura</button>{" "}
                    <button onClick={() => eliminaSAL(item)}>Elimina</button>
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

export default SAL;
