import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const clienteVuoto = {
  id: null,
  ragioneSociale: "",
  referente: "",
  telefono: "",
  email: "",
  partitaIva: "",
  indirizzo: "",
  note: "",
};

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

function Clienti() {
  const [clienti, setClienti] = useState([]);
  const [preventivi, setPreventivi] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [form, setForm] = useState(clienteVuoto);
  const [ricerca, setRicerca] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaClienti() {
      try {
        const [clientiDb, preventiviDb, cantieriDb] = await Promise.all([
          api.get("/clienti"),
          api.get("/preventivi"),
          api.get("/cantieri"),
        ]);

        if (componenteAttivo) {
          setClienti(clientiDb);
          setPreventivi(preventiviDb);
          setCantieri(cantieriDb);
        }
      } catch (error) {
        if (componenteAttivo) setErrore(error.message);
      } finally {
        if (componenteAttivo) setCaricamento(false);
      }
    }

    caricaClienti();

    return () => {
      componenteAttivo = false;
    };
  }, []);

  const clientiFiltrati = useMemo(
    () =>
      clienti.filter((cliente) =>
        [
          cliente.ragioneSociale,
          cliente.referente,
          cliente.telefono,
          cliente.email,
          cliente.partitaIva,
          cliente.indirizzo,
          cliente.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(ricerca.toLowerCase()),
      ),
    [clienti, ricerca],
  );

  const riepilogo = useMemo(
    () => ({
      totale: clienti.length,
      conEmail: clienti.filter((cliente) => cliente.email).length,
      conTelefono: clienti.filter((cliente) => cliente.telefono).length,
      cantieri: cantieri.length,
      preventivi: preventivi.length,
      filtrati: clientiFiltrati.length,
    }),
    [cantieri.length, clienti, clientiFiltrati, preventivi.length],
  );

  const contaPreventiviCliente = (cliente) =>
    preventivi.filter(
      (preventivo) =>
        String(preventivo.clienteId || "") === String(cliente.id) || preventivo.cliente === cliente.ragioneSociale,
    ).length;

  const contaCantieriCliente = (cliente) =>
    cantieri.filter(
      (cantiere) => String(cantiere.clienteId || "") === String(cliente.id) || cantiere.cliente === cliente.ragioneSociale,
    ).length;

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const resetForm = () => {
    setForm(clienteVuoto);
    setErrore("");
  };

  const salvaCliente = async () => {
    if (!form.ragioneSociale.trim()) {
      setErrore("Inserisci la ragione sociale del cliente.");
      return;
    }

    setErrore("");

    const payload = {
      ragioneSociale: form.ragioneSociale.trim(),
      referente: form.referente.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim(),
      partitaIva: form.partitaIva.trim(),
      indirizzo: form.indirizzo.trim(),
      note: form.note.trim(),
    };

    try {
      if (form.id) {
        const aggiornato = await api.put(`/clienti/${form.id}`, payload);
        setClienti((attuali) => attuali.map((cliente) => (cliente.id === form.id ? aggiornato : cliente)));
      } else {
        const creato = await api.post("/clienti", payload);
        setClienti((attuali) => [...attuali, creato].sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale)));
      }

      resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaCliente = (cliente) => {
    setForm({
      id: cliente.id,
      ragioneSociale: cliente.ragioneSociale || "",
      referente: cliente.referente || "",
      telefono: cliente.telefono || "",
      email: cliente.email || "",
      partitaIva: cliente.partitaIva || "",
      indirizzo: cliente.indirizzo || "",
      note: cliente.note || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminaCliente = async (cliente) => {
    const conferma = window.confirm(`Eliminare il cliente ${cliente.ragioneSociale}?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.delete(`/clienti/${cliente.id}`);
      setClienti((attuali) => attuali.filter((item) => item.id !== cliente.id));
      if (form.id === cliente.id) resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const creaPreventivoCliente = (cliente) => {
    localStorage.setItem(
      "teamGroupPreventivoCliente",
      JSON.stringify({
        clienteId: cliente.id,
        cliente: cliente.ragioneSociale,
        cantiere: "",
      }),
    );
    window.location.href = "/preventivi";
  };

  const creaCantiereCliente = async (cliente) => {
    const nome = window.prompt(`Nome del nuovo cantiere per ${cliente.ragioneSociale}`);
    if (!nome) return;

    setErrore("");

    try {
      const creato = await api.post("/cantieri", {
        clienteId: cliente.id,
        nome,
        cliente: cliente.ragioneSociale,
        indirizzo: cliente.indirizzo || "",
        importo: 0,
        stato: "In Corso",
        note: "",
      });
      setCantieri((attuali) => [creato, ...attuali]);
    } catch (error) {
      setErrore(error.message);
    }
  };

  const esportaClienti = () => {
    esportaCsv(
      `clienti-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Ragione sociale", "Referente", "Telefono", "Email", "Partita IVA", "Indirizzo", "Note"],
      clientiFiltrati.map((cliente) => [
        cliente.ragioneSociale,
        cliente.referente,
        cliente.telefono,
        cliente.email,
        cliente.partitaIva,
        cliente.indirizzo,
        cliente.note,
      ]),
    );
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
      <h1>Anagrafica Clienti Enterprise</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Clienti</h3>
          <h2>{riepilogo.totale}</h2>
        </div>
        <div style={card}>
          <h3>Risultati</h3>
          <h2>{riepilogo.filtrati}</h2>
        </div>
        <div style={card}>
          <h3>Con Email</h3>
          <h2>{riepilogo.conEmail}</h2>
        </div>
        <div style={card}>
          <h3>Con Telefono</h3>
          <h2>{riepilogo.conTelefono}</h2>
        </div>
        <div style={card}>
          <h3>Preventivi</h3>
          <h2>{riepilogo.preventivi}</h2>
        </div>
        <div style={card}>
          <h3>Cantieri</h3>
          <h2>{riepilogo.cantieri}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica Cliente" : "Nuovo Cliente"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "12px" }}>
          <input
            placeholder="Ragione Sociale"
            value={form.ragioneSociale}
            onChange={(e) => aggiornaForm("ragioneSociale", e.target.value)}
          />
          <input
            placeholder="Referente"
            value={form.referente}
            onChange={(e) => aggiornaForm("referente", e.target.value)}
          />
          <input
            placeholder="Telefono"
            value={form.telefono}
            onChange={(e) => aggiornaForm("telefono", e.target.value)}
          />
          <input placeholder="Email" value={form.email} onChange={(e) => aggiornaForm("email", e.target.value)} />
          <input
            placeholder="Partita IVA"
            value={form.partitaIva}
            onChange={(e) => aggiornaForm("partitaIva", e.target.value)}
          />
          <input
            placeholder="Indirizzo"
            value={form.indirizzo}
            onChange={(e) => aggiornaForm("indirizzo", e.target.value)}
          />
        </div>

        <textarea
          placeholder="Note cliente"
          value={form.note}
          onChange={(e) => aggiornaForm("note", e.target.value)}
          style={{ width: "100%", marginTop: "12px" }}
        />

        <div style={{ display: "flex", gap: "10px", marginTop: "18px", flexWrap: "wrap" }}>
          <button onClick={salvaCliente}>{form.id ? "Salva Modifiche" : "Aggiungi Cliente"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>Elenco Clienti</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              placeholder="Ricerca per cliente, referente, telefono, email, P.IVA"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              style={{ width: "360px" }}
            />
            <button onClick={esportaClienti}>Esporta CSV</button>
          </div>
        </div>

        {caricamento ? (
          <p>Caricamento clienti...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Ragione Sociale</th>
                <th>Referente</th>
                <th>Telefono</th>
                <th>Email</th>
                <th>P.IVA</th>
                <th>Indirizzo</th>
                <th>Preventivi</th>
                <th>Cantieri</th>
                <th>Note</th>
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {clientiFiltrati.length === 0 && (
                <tr>
                  <td colSpan="10" style={{ padding: "22px", color: "#64748b" }}>
                    Nessun cliente trovato. Crea una nuova anagrafica o modifica la ricerca.
                  </td>
                </tr>
              )}

              {clientiFiltrati.map((cliente) => (
                <tr key={cliente.id}>
                  <td style={{ fontWeight: 800, textAlign: "left" }}>{cliente.ragioneSociale}</td>
                  <td>{cliente.referente}</td>
                  <td>{cliente.telefono}</td>
                  <td>{cliente.email}</td>
                  <td>{cliente.partitaIva}</td>
                  <td style={{ maxWidth: "220px", textAlign: "left" }}>{cliente.indirizzo}</td>
                  <td>{contaPreventiviCliente(cliente)}</td>
                  <td>{contaCantieriCliente(cliente)}</td>
                  <td style={{ maxWidth: "260px", textAlign: "left" }}>{cliente.note}</td>
                  <td>
                    <button onClick={() => modificaCliente(cliente)}>Modifica</button>{" "}
                    <button onClick={() => creaPreventivoCliente(cliente)}>Nuovo preventivo</button>{" "}
                    <button onClick={() => creaCantiereCliente(cliente)}>Nuovo cantiere</button>{" "}
                    <button onClick={() => eliminaCliente(cliente)}>Elimina</button>
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

export default Clienti;
