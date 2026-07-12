import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const clienteVuoto = {
  id: null,
  clienteCode: "",
  ragioneSociale: "",
  referente: "",
  associazione: "",
  telefono: "",
  email: "",
  emailReferente: "",
  emailAmministratore: "",
  indirizzo: "",
  cap: "",
  comune: "",
  provincia: "",
  note: "",
  tipologiaCliente: "",
  latitudine: "",
  longitudine: "",
};

function valoreCliente(cliente, campoUfficiale, campoLegacy = campoUfficiale) {
  return cliente?.[campoUfficiale] ?? cliente?.[campoLegacy] ?? "";
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

function Clienti() {
  const [clienti, setClienti] = useState([]);
  const [preventivi, setPreventivi] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [form, setForm] = useState(clienteVuoto);
  const [ricerca, setRicerca] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [importazione, setImportazione] = useState(null);
  const [fileImport, setFileImport] = useState(null);

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
          valoreCliente(cliente, "idCliente", "clienteCode"),
          cliente.ragioneSociale,
          cliente.referente,
          valoreCliente(cliente, "amministratore", "associazione"),
          cliente.telefono,
          valoreCliente(cliente, "emailPrincipale", "email"),
          cliente.emailReferente,
          cliente.emailAmministratore,
          valoreCliente(cliente, "via", "indirizzo"),
          cliente.cap,
          cliente.comune,
          cliente.provincia,
          valoreCliente(cliente, "noteCliente", "note"),
          cliente.tipologiaCliente,
          cliente.latitudine,
          cliente.longitudine,
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
      conEmail: clienti.filter((cliente) => valoreCliente(cliente, "emailPrincipale", "email")).length,
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
        String(preventivo.clienteId || "") === String(cliente.id) ||
        preventivo.clienteCode === valoreCliente(cliente, "idCliente", "clienteCode") ||
        preventivo.cliente === cliente.ragioneSociale,
    ).length;

  const contaCantieriCliente = (cliente) =>
    cantieri.filter(
      (cantiere) =>
        String(cantiere.clienteId || "") === String(cliente.id) ||
        cantiere.clienteCode === valoreCliente(cliente, "idCliente", "clienteCode") ||
        cantiere.cliente === cliente.ragioneSociale,
    ).length;

  const aggiornaVistaDaDatabase = async () => {
    const [clientiDb, preventiviDb, cantieriDb] = await Promise.all([
      api.get("/clienti"),
      api.get("/preventivi"),
      api.get("/cantieri"),
    ]);

    setClienti(clientiDb);
    setPreventivi(preventiviDb);
    setCantieri(cantieriDb);
  };

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const resetForm = () => {
    setForm(clienteVuoto);
    setErrore("");
  };

  const salvaCliente = async () => {
    const idCliente = form.clienteCode.trim();
    if (!idCliente) {
      setErrore("Inserisci ID Cliente.");
      setMessaggio("");
      return;
    }
    if (idCliente.length > 20) {
      setErrore("ID Cliente massimo 20 caratteri.");
      setMessaggio("");
      return;
    }
    if (!form.ragioneSociale.trim()) {
      setErrore("Inserisci la ragione sociale del cliente.");
      setMessaggio("");
      return;
    }

    setErrore("");
    setMessaggio("");

    const payload = {
      idCliente,
      clienteCode: idCliente,
      ragioneSociale: form.ragioneSociale.trim(),
      referente: form.referente.trim(),
      amministratore: form.associazione.trim(),
      associazione: form.associazione.trim(),
      telefono: form.telefono.trim(),
      emailPrincipale: form.email.trim(),
      email: form.email.trim(),
      emailReferente: form.emailReferente.trim(),
      emailAmministratore: form.emailAmministratore.trim(),
      via: form.indirizzo.trim(),
      indirizzo: form.indirizzo.trim(),
      cap: form.cap.trim(),
      comune: form.comune.trim(),
      provincia: form.provincia.trim(),
      noteCliente: form.note.trim(),
      note: form.note.trim(),
      tipologiaCliente: form.tipologiaCliente.trim(),
      latitudine: form.latitudine === "" ? null : form.latitudine,
      longitudine: form.longitudine === "" ? null : form.longitudine,
    };

    try {
      if (form.id) {
        await api.put(`/clienti/${form.id}`, payload);
      } else {
        await api.post("/clienti", payload);
      }

      await aggiornaVistaDaDatabase();
      resetForm();
      setMessaggio("Cliente salvato correttamente");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaCliente = (cliente) => {
    setForm({
      id: cliente.id,
      clienteCode: valoreCliente(cliente, "idCliente", "clienteCode"),
      ragioneSociale: cliente.ragioneSociale || "",
      referente: cliente.referente || "",
      associazione: valoreCliente(cliente, "amministratore", "associazione"),
      telefono: cliente.telefono || "",
      email: valoreCliente(cliente, "emailPrincipale", "email"),
      emailReferente: cliente.emailReferente || "",
      emailAmministratore: cliente.emailAmministratore || "",
      indirizzo: valoreCliente(cliente, "via", "indirizzo"),
      cap: cliente.cap || "",
      comune: cliente.comune || "",
      provincia: cliente.provincia || "",
      note: valoreCliente(cliente, "noteCliente", "note"),
      tipologiaCliente: cliente.tipologiaCliente || "",
      latitudine: cliente.latitudine ?? "",
      longitudine: cliente.longitudine ?? "",
    });
    setErrore("");
    setMessaggio("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminaCliente = async (cliente) => {
    const conferma = window.confirm(`Eliminare il cliente ${cliente.ragioneSociale}?`);
    if (!conferma) return;

    setErrore("");
    setMessaggio("");

    try {
      const response = await api.delete(`/clienti/${cliente.id}`);
      await aggiornaVistaDaDatabase();
      if (form.id === cliente.id) resetForm();
      setMessaggio(response?.message || "Cliente eliminato correttamente.");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const creaPreventivoCliente = (cliente) => {
    const params = new URLSearchParams({
      clienteId: String(cliente.id || ""),
      clienteCode: valoreCliente(cliente, "idCliente", "clienteCode"),
      cliente: cliente.ragioneSociale || "",
      idIndirizzo: Array.isArray(cliente.indirizzi) ? String(cliente.indirizzi[0]?.id || "") : "",
    });
    window.location.href = `/preventivi?${params.toString()}`;
  };

  const creaCantiereCliente = async (cliente) => {
    const nome = window.prompt(`Nome del nuovo cantiere per ${cliente.ragioneSociale}`);
    if (!nome) return;

    setErrore("");
    setMessaggio("");

    try {
      const creato = await api.post("/cantieri", {
        clienteId: cliente.id,
        clienteCode: valoreCliente(cliente, "idCliente", "clienteCode"),
        nome,
        cliente: cliente.ragioneSociale,
        indirizzo: valoreCliente(cliente, "via", "indirizzo"),
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
      ["ID Cliente", "Ragione Sociale", "Referente", "Amministratore", "Telefono", "Email principale", "Email amministratore", "Email referente", "Via", "CAP", "Comune", "Provincia", "Tipo Cliente", "Latitudine", "Longitudine", "Note Cliente"],
      clientiFiltrati.map((cliente) => [
        valoreCliente(cliente, "idCliente", "clienteCode"),
        cliente.ragioneSociale,
        cliente.referente,
        valoreCliente(cliente, "amministratore", "associazione"),
        cliente.telefono,
        valoreCliente(cliente, "emailPrincipale", "email"),
        cliente.emailAmministratore,
        cliente.emailReferente,
        valoreCliente(cliente, "via", "indirizzo"),
        cliente.cap,
        cliente.comune,
        cliente.provincia,
        cliente.tipologiaCliente,
        cliente.latitudine,
        cliente.longitudine,
        valoreCliente(cliente, "noteCliente", "note"),
      ]),
    );
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",").pop());
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const anteprimaImportExcel = async (file) => {
    if (!file) return;
    setFileImport(file);
    setErrore("");
    setMessaggio("");
    setImportazione(null);

    try {
      const fileBase64 = await fileToBase64(file);
      const riepilogo = await api.post("/clienti/import-excel", { mode: "preview", fileBase64 });
      setImportazione(riepilogo);
    } catch (error) {
      setErrore(error.message);
    }
  };

  const confermaImportExcel = async () => {
    if (!fileImport) return;
    setErrore("");
    setMessaggio("");

    try {
      const fileBase64 = await fileToBase64(fileImport);
      const riepilogo = await api.post("/clienti/import-excel", { mode: "import", fileBase64 });
      setImportazione(riepilogo);
      await aggiornaVistaDaDatabase();
      setMessaggio("Importazione clienti completata.");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <div className="clienti-page">
      <h1>Anagrafica Clienti</h1>

      <div
        className="clienti-dashboard"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Totale Clienti</h3>
          <h2>{riepilogo.totale}</h2>
        </div>
        <div style={card}>
          <h3>Elenco Clienti</h3>
          <h2>{riepilogo.filtrati}</h2>
        </div>
        <div style={card}>
          <h3>Clienti con Email</h3>
          <h2>{riepilogo.conEmail}</h2>
        </div>
        <div style={card}>
          <h3>Clienti con Telefono</h3>
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
      {messaggio && <p style={{ color: "green", marginBottom: "15px" }}>{messaggio}</p>}

      <div className="clienti-form-panel" style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica Cliente" : "Nuovo Cliente"}</h2>

        <div className="clienti-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "12px" }}>
          <input
            placeholder="ID Cliente *"
            value={form.clienteCode}
            maxLength={20}
            onChange={(e) => aggiornaForm("clienteCode", e.target.value)}
          />
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
            placeholder="Amministratore"
            value={form.associazione}
            onChange={(e) => aggiornaForm("associazione", e.target.value)}
          />
          <input
            placeholder="Telefono"
            value={form.telefono}
            onChange={(e) => aggiornaForm("telefono", e.target.value)}
          />
          <input placeholder="Email principale" value={form.email} onChange={(e) => aggiornaForm("email", e.target.value)} />
          <input placeholder="Email amministratore" value={form.emailAmministratore} onChange={(e) => aggiornaForm("emailAmministratore", e.target.value)} />
          <input placeholder="Email referente" value={form.emailReferente} onChange={(e) => aggiornaForm("emailReferente", e.target.value)} />
          <input
            placeholder="Via"
            value={form.indirizzo}
            onChange={(e) => aggiornaForm("indirizzo", e.target.value)}
          />
          <input placeholder="CAP" value={form.cap} onChange={(e) => aggiornaForm("cap", e.target.value)} />
          <input placeholder="Comune" value={form.comune} onChange={(e) => aggiornaForm("comune", e.target.value)} />
          <input placeholder="Provincia" value={form.provincia} onChange={(e) => aggiornaForm("provincia", e.target.value)} />
          <input placeholder="Tipo Cliente" value={form.tipologiaCliente} onChange={(e) => aggiornaForm("tipologiaCliente", e.target.value)} />
          <input placeholder="Latitudine" value={form.latitudine} onChange={(e) => aggiornaForm("latitudine", e.target.value)} />
          <input placeholder="Longitudine" value={form.longitudine} onChange={(e) => aggiornaForm("longitudine", e.target.value)} />
        </div>

        <textarea
          placeholder="Note Cliente"
          value={form.note}
          onChange={(e) => aggiornaForm("note", e.target.value)}
          style={{ width: "100%", marginTop: "12px" }}
        />

        <div style={{ display: "flex", gap: "10px", marginTop: "18px", flexWrap: "wrap" }}>
          <button onClick={salvaCliente}>{form.id ? "Salva Modifiche" : "Aggiungi Cliente"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <div className="clienti-table-panel" style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div className="clienti-list-toolbar" style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>Elenco Clienti</h2>
          <div className="clienti-list-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              placeholder="Ricerca per ID cliente, cliente, referente, amministratore, telefono, email, comune"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              style={{ width: "500px" }}
            />
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <button type="button" onClick={() => document.getElementById("import-clienti-excel")?.click()}>
                Importa Excel
              </button>
              <input
                id="import-clienti-excel"
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={(e) => anteprimaImportExcel(e.target.files?.[0])}
              />
            </label>
            <button onClick={esportaClienti}>Esporta CSV</button>
          </div>
        </div>

        {importazione && (
          <div style={{ margin: "12px 0", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", textAlign: "left" }}>
            <strong>{importazione.mode === "import" ? "Importazione completata." : "Anteprima importazione"}</strong>
            <p style={{ margin: "8px 0" }}>
              Righe lette: {importazione.righeLette} | Nuovi clienti: {importazione.nuoviClienti} | Clienti aggiornati: {importazione.clientiAggiornati} | Righe incomplete: {importazione.righeIncomplete} | Duplicati rilevati: {importazione.duplicatiEvitati} | Righe saltate: {importazione.righeSaltate} | Errori: {importazione.errori}
            </p>
            {importazione.mode !== "import" && (
              <button onClick={confermaImportExcel}>Conferma importazione</button>
            )}
          </div>
        )}

        {caricamento ? (
          <p>Caricamento clienti...</p>
        ) : (
          <div className="clienti-table-wrap">
            <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
              <thead>
                <tr>
                  <th>ID Cliente</th>
                  <th>Ragione Sociale</th>
                  <th>Amministratore</th>
                  <th>Telefono</th>
                  <th>Email principale</th>
                  <th>Comune</th>
                  <th>Provincia</th>
                  <th>Tipo Cliente</th>
                  <th>Via</th>
                  <th>Note Cliente</th>
                  <th>Azioni</th>
                </tr>
              </thead>

              <tbody>
                {clientiFiltrati.length === 0 && (
                  <tr>
                    <td colSpan="11" style={{ padding: "22px", color: "#64748b" }}>
                      Nessun cliente trovato. Crea una nuova anagrafica o modifica la ricerca.
                    </td>
                  </tr>
                )}

                {clientiFiltrati.map((cliente) => (
                  <tr key={cliente.id}>
                    <td style={{ fontWeight: 800 }}>{valoreCliente(cliente, "idCliente", "clienteCode")}</td>
                    <td style={{ fontWeight: 800, textAlign: "left" }}>{cliente.ragioneSociale}</td>
                    <td>{valoreCliente(cliente, "amministratore", "associazione")}</td>
                    <td>{cliente.telefono}</td>
                    <td>{valoreCliente(cliente, "emailPrincipale", "email")}</td>
                    <td>{cliente.comune}</td>
                    <td>{cliente.provincia}</td>
                    <td>{cliente.tipologiaCliente}</td>
                    <td style={{ textAlign: "left" }}>{valoreCliente(cliente, "via", "indirizzo")}</td>
                    <td style={{ textAlign: "left" }}>{valoreCliente(cliente, "noteCliente", "note")}</td>
                    <td>
                      <button onClick={() => modificaCliente(cliente)}>Modifica</button>{" "}
                      <button onClick={() => creaPreventivoCliente(cliente)}>Nuovo preventivo</button>{" "}
                      <button onClick={() => creaCantiereCliente(cliente)}>Nuovo cantiere</button>{" "}
                      <button onClick={() => eliminaCliente(cliente)}>Elimina</button>
                      <span style={{ display: "none" }}>
                        {contaPreventiviCliente(cliente)} {contaCantieriCliente(cliente)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Clienti;
