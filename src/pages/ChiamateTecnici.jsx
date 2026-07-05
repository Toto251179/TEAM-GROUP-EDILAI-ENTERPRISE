import { useEffect, useMemo, useState } from "react";
import { chiamateTecniciService } from "../services/chiamateTecniciService";
import { operaiService } from "../services/operaiService";
import { squadreService } from "../services/squadreService";
import { api } from "../services/api";

const stati = ["Assegnata", "In corso", "Completata", "Annullata"];

const chiamataVuota = {
  id: "",
  numero: "",
  idCliente: "",
  cliente: "",
  clienteAssociato: "",
  ticketCliente: "",
  codiceProgramma: "",
  comune: "",
  provincia: "",
  indirizzo: "",
  descrizione: "",
  noteUfficio: "",
  squadraId: "",
  stato: "Da assegnare",
  oraArrivo: "",
  oraFine: "",
  foto: [],
  rapportino: "",
};

function panelStyle() {
  return {
    background: "white",
    border: "1px solid var(--enterprise-border-soft)",
    borderRadius: "8px",
    boxShadow: "var(--enterprise-shadow)",
    padding: "18px",
    marginBottom: "18px",
  };
}

function ChiamateTecnici() {
  const [chiamate, setChiamate] = useState([]);
  const [squadre, setSquadre] = useState([]);
  const [operai, setOperai] = useState([]);
  const [form, setForm] = useState(chiamataVuota);
  const [selezionataId, setSelezionataId] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [csvText, setCsvText] = useState("");
  const [anteprimaCsv, setAnteprimaCsv] = useState([]);
  const [messaggioImport, setMessaggioImport] = useState("");
  const [preventivi, setPreventivi] = useState([]);

  const caricaDati = async () => {
    setOperai(operaiService.lista());
    setSquadre(squadreService.lista());
    setChiamate(chiamateTecniciService.lista());
    try {
      const preventiviDb = await api.get("/preventivi");
      setPreventivi(Array.isArray(preventiviDb) ? preventiviDb : []);
    } catch {
      setPreventivi([]);
    }
  };

  useEffect(() => {
    caricaDati();
    const aggiorna = () => caricaDati();
    window.addEventListener("teamGroupDataChanged", aggiorna);
    return () => window.removeEventListener("teamGroupDataChanged", aggiorna);
  }, []);

  const squadraById = useMemo(() => Object.fromEntries(squadre.map((squadra) => [squadra.id, squadra])), [squadre]);
  const operaioById = useMemo(() => Object.fromEntries(operai.map((operaio) => [operaio.id, operaio])), [operai]);

  const chiamateFiltrate = useMemo(
    () =>
      chiamate.filter((chiamata) =>
        [chiamata.numero, chiamata.cliente, chiamata.ticketCliente, chiamata.codiceProgramma, chiamata.indirizzo, chiamata.descrizione]
          .join(" ")
          .toLowerCase()
          .includes(ricerca.toLowerCase()),
      ),
    [chiamate, ricerca],
  );

  const chiamataSelezionata = chiamate.find((chiamata) => chiamata.id === selezionataId) || chiamate[0];
  const squadraForm = squadraById[form.squadraId];
  const tecniciForm = squadraForm?.tecnici?.map((id) => operaioById[id]).filter(Boolean) || [];
  const squadraDettaglio = chiamataSelezionata ? squadraById[chiamataSelezionata.squadraId] : null;
  const tecniciDettaglio = squadraDettaglio?.tecnici?.map((id) => operaioById[id]).filter(Boolean) || [];

  const aggiorna = (campo, valore) => setForm((corrente) => ({ ...corrente, [campo]: valore }));

  const salva = () => {
    if (!form.cliente.trim()) return;
    chiamateTecniciService.salva(form);
    setForm(chiamataVuota);
    caricaDati();
  };

  const modifica = (chiamata) => {
    setForm({ ...chiamata });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const elimina = (chiamata) => {
    if (!window.confirm(`Eliminare la chiamata ${chiamata.numero}?`)) return;
    chiamateTecniciService.elimina(chiamata.id);
    if (selezionataId === chiamata.id) setSelezionataId("");
    caricaDati();
  };

  const caricaCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const anteprima = chiamateTecniciService.preparaCsv(text, preventivi);
    setCsvText(text);
    setAnteprimaCsv(anteprima);
    setMessaggioImport(`Anteprima pronta: ${anteprima.length} interventi trovati nel CSV.`);
    event.target.value = "";
  };

  const importaCsv = () => {
    const esito = chiamateTecniciService.importaCsv(csvText, preventivi);
    setMessaggioImport(`Importati ${esito.importati} interventi. Duplicati saltati: ${esito.duplicati}. Totale righe CSV valide: ${esito.totaleCsv}.`);
    setCsvText("");
    setAnteprimaCsv([]);
    caricaDati();
  };

  return (
    <div>
      <h1>Chiamate Tecnici</h1>

      <section style={panelStyle()}>
        <h2>Importa CSV interventi manutenzione</h2>
        <p style={{ color: "var(--enterprise-muted)", marginBottom: "12px" }}>
          Il CSV deve usare il separatore punto e virgola. Il campo Progressivo diventa il numero chiamata e non viene duplicato se gia presente.
        </p>
        <div style={{ border: "1px dashed var(--enterprise-border-soft)", borderRadius: "8px", padding: "12px", marginBottom: "12px", background: "#f8fafc" }}>
          <strong>Importa anagrafica condomini/clienti</strong>
          <p style={{ color: "var(--enterprise-muted)", margin: "6px 0 0" }}>
            Funzione futura: ID cliente - nome cliente - indirizzo - referente - telefono - email.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept=".csv,text/csv" onChange={caricaCsv} />
          <button disabled={!anteprimaCsv.length} onClick={importaCsv}>Importa anteprima</button>
          {messaggioImport && <strong style={{ color: "#166534" }}>{messaggioImport}</strong>}
        </div>

        {anteprimaCsv.length > 0 && (
          <div style={{ marginTop: "14px", overflowX: "auto" }}>
            <h3>Anteprima importazione</h3>
            <table width="100%">
              <thead>
                <tr>
                  <th>Progressivo</th>
                  <th>Cod. progetto</th>
                  <th>ID cliente</th>
                  <th>Cliente</th>
                  <th>Preventivo</th>
                  <th>Importo</th>
                  <th>Indirizzo</th>
                  <th>Stato</th>
                  <th>Assegnazione</th>
                  <th>Data apertura</th>
                </tr>
              </thead>
              <tbody>
                {anteprimaCsv.slice(0, 20).map((intervento) => (
                  <tr key={intervento.numero}>
                    <td><strong>{intervento.numero}</strong></td>
                    <td>{intervento.codiceProgramma || "-"}</td>
                    <td>{intervento.idCliente || "-"}</td>
                    <td>{intervento.clienteAssociato || intervento.cliente || "Cliente da associare"}</td>
                    <td>{intervento.preventivoNumero || "Da verificare"}</td>
                    <td>{intervento.importoPreventivo || "-"}</td>
                    <td>{intervento.indirizzo || "-"}</td>
                    <td>{intervento.stato || "-"}</td>
                    <td>{intervento.statoAssegnazione || "DA ASSEGNARE"}</td>
                    <td>{intervento.dataApertura || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {anteprimaCsv.length > 20 && <p style={{ marginTop: "8px", color: "var(--enterprise-muted)" }}>Mostrate le prime 20 righe su {anteprimaCsv.length}.</p>}
          </div>
        )}
      </section>

      <section style={panelStyle()}>
        <h2>Nuova chiamata</h2>
        <p style={{ color: "var(--enterprise-muted)", marginBottom: "12px" }}>
          Il numero viene generato automaticamente in formato TG-000001.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
          <input placeholder="ID cliente" value={form.idCliente} onChange={(e) => aggiorna("idCliente", e.target.value)} />
          <input placeholder="Cliente associato" value={form.clienteAssociato || form.cliente} onChange={(e) => {
            aggiorna("clienteAssociato", e.target.value);
            aggiorna("cliente", e.target.value || "Cliente da associare");
          }} />
          <input placeholder="Rif. Ticket Cliente / Num. Ticket" value={form.ticketCliente} onChange={(e) => aggiorna("ticketCliente", e.target.value)} />
          <input placeholder="Cod. Prog." value={form.codiceProgramma} onChange={(e) => aggiorna("codiceProgramma", e.target.value)} />
          <select value={form.squadraId} onChange={(e) => aggiorna("squadraId", e.target.value)}>
            <option value="">Non assegnata</option>
            {squadre.filter((squadra) => squadra.attiva !== false).map((squadra) => (
              <option key={squadra.id} value={squadra.id}>{squadra.nomeSquadra}</option>
            ))}
          </select>
          <select value={form.stato} onChange={(e) => aggiorna("stato", e.target.value)}>
            {stati.map((stato) => <option key={stato}>{stato}</option>)}
          </select>
          <input placeholder="Indirizzo" value={form.indirizzo} onChange={(e) => aggiorna("indirizzo", e.target.value)} />
          <input placeholder="Comune" value={form.comune || ""} onChange={(e) => aggiorna("comune", e.target.value)} />
          <textarea placeholder="Descrizione lavori" value={form.descrizione} onChange={(e) => aggiorna("descrizione", e.target.value)} />
          <textarea placeholder="Note ufficio" value={form.noteUfficio} onChange={(e) => aggiorna("noteUfficio", e.target.value)} />
        </div>

        <div style={{ marginTop: "12px", padding: "12px", borderRadius: "8px", background: "#f8fafc" }}>
          <strong>Tecnici squadra selezionata:</strong>{" "}
          {tecniciForm.length ? tecniciForm.map((tecnico) => `${tecnico.nome} ${tecnico.cognome || ""}`).join(", ") : "Nessun tecnico assegnato."}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
          <button onClick={salva}>{form.id ? "Salva modifica" : "Crea chiamata"}</button>
          <button onClick={() => setForm(chiamataVuota)} style={{ background: "white", color: "var(--enterprise-primary)" }}>
            Nuova / Annulla
          </button>
        </div>
      </section>

      <section style={panelStyle()}>
        <h2>Elenco chiamate</h2>
        <input
          placeholder="Cerca per numero, cliente, ticket, cod. prog."
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          style={{ width: "420px", maxWidth: "100%", marginBottom: "12px" }}
        />

        <table width="100%">
          <thead>
            <tr>
              <th>Numero</th>
              <th>ID cliente</th>
              <th>Cliente</th>
              <th>Preventivo</th>
              <th>Importo prev.</th>
              <th>Descrizione intervento</th>
              <th>Indirizzo</th>
              <th>Comune</th>
              <th>Squadra</th>
              <th>Stato</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {chiamateFiltrate.map((chiamata) => {
              const squadra = squadraById[chiamata.squadraId];
              const statoAssegnazione = chiamata.statoAssegnazione || (chiamata.squadraId ? "ASSEGNATO" : "DA ASSEGNARE");
              return (
                <tr key={chiamata.id}>
                  <td><strong>{chiamata.numero}</strong></td>
                  <td>{chiamata.idCliente || "-"}</td>
                  <td>{chiamata.clienteAssociato || chiamata.cliente || "Cliente da associare"}</td>
                  <td>{chiamata.preventivoNumero || (chiamata.preventivoCollegato ? "Collegato" : "-")}</td>
                  <td>{chiamata.importoPreventivo || "-"}</td>
                  <td>{chiamata.descrizione || "-"}</td>
                  <td>{chiamata.indirizzo || "-"}</td>
                  <td>{chiamata.comune || "-"}</td>
                  <td>{squadra?.nomeSquadra || "Non assegnata"}</td>
                  <td>{statoAssegnazione}</td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button onClick={() => setSelezionataId(chiamata.id)}>Apri</button>
                      <button onClick={() => modifica(chiamata)} style={{ background: "white", color: "var(--enterprise-primary)" }}>Modifica</button>
                      <button onClick={() => elimina(chiamata)} style={{ background: "var(--enterprise-danger)" }}>Elimina</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={panelStyle()}>
        <h2>Dettaglio chiamata</h2>
        {chiamataSelezionata ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "18px" }}>
              <div>
                <h3>{chiamataSelezionata.numero}</h3>
                <h2>{chiamataSelezionata.clienteAssociato || chiamataSelezionata.cliente || "Cliente da associare"}</h2>
                <p><strong>ID cliente:</strong> {chiamataSelezionata.idCliente || "-"}</p>
                <p><strong>Cliente associato:</strong> {chiamataSelezionata.clienteAssociato || chiamataSelezionata.cliente || "Cliente da associare"}</p>
                <p><strong>Ticket:</strong> {chiamataSelezionata.ticketCliente || "-"}</p>
                <p><strong>Cod. Prog.:</strong> {chiamataSelezionata.codiceProgramma || "-"}</p>
                <p><strong>Preventivo collegato:</strong> {chiamataSelezionata.preventivoNumero || "-"}</p>
                <p><strong>Stato preventivo:</strong> {chiamataSelezionata.statoPreventivo || "-"}</p>
                <p><strong>Importo preventivo:</strong> {chiamataSelezionata.importoPreventivo || "-"}</p>
                <p><strong>Data apertura:</strong> {chiamataSelezionata.dataApertura || "-"}</p>
                <p><strong>Indirizzo completo:</strong> {chiamataSelezionata.indirizzo || "-"}</p>
                <p><strong>Coordinate:</strong> {chiamataSelezionata.coordinate || "-"}</p>
                <p>
                  <strong>Posizione:</strong>{" "}
                  {chiamataSelezionata.linkGoogleMaps ? (
                    <a href={chiamataSelezionata.linkGoogleMaps} target="_blank" rel="noreferrer">Apri posizione</a>
                  ) : "-"}
                </p>
                <p><strong>Assegnazione:</strong> {chiamataSelezionata.statoAssegnazione || (chiamataSelezionata.squadraId ? "ASSEGNATO" : "DA ASSEGNARE")}</p>
                <p style={{ marginTop: "10px" }}><strong>Descrizione:</strong><br />{chiamataSelezionata.descrizione || "-"}</p>
                <p style={{ marginTop: "10px" }}><strong>Note ufficio:</strong><br />{chiamataSelezionata.noteUfficio || "-"}</p>
              </div>
              <div>
                <p><strong>Squadra:</strong> {squadraDettaglio?.nomeSquadra || "Non assegnata"}</p>
                <p style={{ marginTop: "10px" }}>
                  <strong>Tecnici assegnati:</strong><br />
                  {tecniciDettaglio.length
                    ? tecniciDettaglio.map((tecnico) => `${tecnico.nome} ${tecnico.cognome || ""}${tecnico.telefono ? ` - ${tecnico.telefono}` : ""}`).join(", ")
                    : "Nessun tecnico assegnato."}
                </p>
                <p style={{ marginTop: "10px" }}><strong>Foto:</strong> {chiamataSelezionata.foto?.length || 0}</p>
                <p><strong>Stato chiamata:</strong> {chiamataSelezionata.stato || "-"}</p>
                <p><strong>Priorita:</strong> {chiamataSelezionata.priorita || "-"}</p>
                <p><strong>Categoria:</strong> {chiamataSelezionata.categoria || "-"}</p>
                <p><strong>Importo consuntivo:</strong> {chiamataSelezionata.importoConsuntivo || "-"}</p>
                <p><strong>Rapportino:</strong> {chiamataSelezionata.rapportino || "Non compilato"}</p>
                <div style={{ marginTop: "10px" }}>
                  <strong>DDT allegati:</strong>
                  {Array.isArray(chiamataSelezionata.ddtAllegati) && chiamataSelezionata.ddtAllegati.length ? (
                    chiamataSelezionata.ddtAllegati.map((ddt) => (
                      <p key={ddt.id || ddt.numeroDdt}>
                        {ddt.numeroDdt} - {ddt.fornitore || "-"}<br />
                        {ddt.allegato?.dataUrl ? <a href={ddt.allegato.dataUrl} download={ddt.allegato.nomeFile}>Apri DDT</a> : null}
                      </p>
                    ))
                  ) : (
                    <p>Nessun DDT allegato.</p>
                  )}
                </div>
                <div style={{ marginTop: "10px" }}>
                  <strong>Costi materiali DDT:</strong>
                  {Array.isArray(chiamataSelezionata.costiMaterialiDdt) && chiamataSelezionata.costiMaterialiDdt.length ? (
                    chiamataSelezionata.costiMaterialiDdt.map((materiale, index) => (
                      <p key={`${materiale.numeroDdt}-${index}`}>
                        {materiale.codiceMateriale || "-"} - {materiale.materiale || "-"}: {materiale.quantita} x {materiale.prezzoUnitario} EUR = {materiale.totale} EUR
                      </p>
                    ))
                  ) : (
                    <p>Nessun materiale DDT registrato.</p>
                  )}
                </div>
              </div>
            </div>
            <div style={{ marginTop: "14px" }}>
              <h3>Storico modifiche</h3>
              <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {[...(chiamataSelezionata.storicoModifiche || []), ...(chiamataSelezionata.storicoAssegnazioni || [])].map((voce, index) => (
                  <li key={`${voce.data}-${index}`}>
                    {new Date(voce.data).toLocaleString("it-IT")} - {voce.azione || voce.squadraNome || "Modifica"}
                  </li>
                ))}
                {!chiamataSelezionata.storicoModifiche?.length && !chiamataSelezionata.storicoAssegnazioni?.length && (
                  <li>Nessuna modifica registrata.</li>
                )}
              </ul>
            </div>
          </>
        ) : (
          <p>Nessuna chiamata presente.</p>
        )}
      </section>
    </div>
  );
}

export default ChiamateTecnici;
