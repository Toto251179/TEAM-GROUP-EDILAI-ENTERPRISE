import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const STATI = ["In Corso", "Sospeso", "Completato"];

const cantiereVuoto = {
  id: null,
  clienteId: "",
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

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("it-IT");
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
        const testo = [cantiere.nome, cantiere.cliente, cantiere.indirizzo, cantiere.stato, cantiere.note]
          .join(" ")
          .toLowerCase();
        const passaRicerca = testo.includes(ricerca.toLowerCase());
        const passaStato = filtroStato === "Tutti" || cantiere.stato === filtroStato;

        return passaRicerca && passaStato;
      }),
    [cantieri, filtroStato, ricerca],
  );

  const riepilogo = useMemo(
    () => ({
      totale: cantieriFiltrati.length,
      inCorso: cantieriFiltrati.filter((cantiere) => cantiere.stato === "In Corso").length,
      sospesi: cantieriFiltrati.filter((cantiere) => cantiere.stato === "Sospeso").length,
      completati: cantieriFiltrati.filter((cantiere) => cantiere.stato === "Completato").length,
      importo: cantieriFiltrati.reduce((totale, cantiere) => totale + Number(cantiere.importo || 0), 0),
    }),
    [cantieriFiltrati],
  );

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const selezionaCliente = (clienteId) => {
    const cliente = clienti.find((item) => String(item.id) === String(clienteId));

    setForm((corrente) => ({
      ...corrente,
      clienteId,
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

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <div>
      <h1>Cantieri Enterprise</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Cantieri</h3>
          <h2>{riepilogo.totale}</h2>
        </div>
        <div style={card}>
          <h3>In Corso</h3>
          <h2>{riepilogo.inCorso}</h2>
        </div>
        <div style={card}>
          <h3>Sospesi</h3>
          <h2>{riepilogo.sospesi}</h2>
        </div>
        <div style={card}>
          <h3>Completati</h3>
          <h2>{riepilogo.completati}</h2>
        </div>
        <div style={card}>
          <h3>Valore</h3>
          <h2>{formatEuro(riepilogo.importo)}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica Cantiere" : "Nuovo Cantiere"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "12px" }}>
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
          style={{ width: "100%", marginTop: "12px" }}
        />

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "18px" }}>
          <button onClick={salvaCantiere}>{form.id ? "Salva Modifiche" : "Salva Cantiere"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>Elenco Cantieri</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              placeholder="Ricerca per cantiere, cliente, indirizzo o note"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              style={{ width: "360px" }}
            />
            <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)}>
              <option>Tutti</option>
              {STATI.map((stato) => (
                <option key={stato}>{stato}</option>
              ))}
            </select>
            <button onClick={esportaCantieri}>Esporta CSV</button>
          </div>
        </div>

        {caricamento ? (
          <p>Caricamento cantieri...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cliente</th>
                <th>Indirizzo</th>
                <th>Data Inizio</th>
                <th>Fine Prevista</th>
                <th>Importo</th>
                <th>Stato</th>
                <th>Note</th>
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {cantieriFiltrati.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ padding: "22px", color: "#64748b" }}>
                    Nessun cantiere trovato. Crea un nuovo cantiere o modifica i filtri.
                  </td>
                </tr>
              )}

              {cantieriFiltrati.map((cantiere) => (
                <tr key={cantiere.id}>
                  <td style={{ fontWeight: 800, textAlign: "left" }}>{cantiere.nome}</td>
                  <td>{cantiere.cliente}</td>
                  <td style={{ maxWidth: "220px", textAlign: "left" }}>{cantiere.indirizzo}</td>
                  <td>{formatDate(cantiere.dataInizio)}</td>
                  <td>{formatDate(cantiere.dataFinePrevista)}</td>
                  <td>{formatEuro(cantiere.importo)}</td>
                  <td>
                    <select
                      value={cantiere.stato || "In Corso"}
                      onChange={(e) => aggiornaStato(cantiere, e.target.value)}
                      style={{ width: "130px" }}
                    >
                      {STATI.map((stato) => (
                        <option key={stato}>{stato}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ maxWidth: "260px", textAlign: "left" }}>{cantiere.note}</td>
                  <td>
                    <button onClick={() => modificaCantiere(cantiere)}>Modifica</button>{" "}
                    <button onClick={() => apriRapportino(cantiere)}>Rapportino</button>{" "}
                    <button onClick={() => eliminaCantiere(cantiere)}>Elimina</button>
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

export default Cantieri;
