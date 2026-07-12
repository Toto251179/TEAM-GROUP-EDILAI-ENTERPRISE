import { useEffect, useMemo, useState } from "react";
import { chiamateTecniciService } from "../services/chiamateTecniciService";
import { calcolaConsuntivo, consuntivazioniService, MARGINI_CONSUNTIVO } from "../services/consuntivazioniService";
import { operaiService } from "../services/operaiService";
import { squadreService } from "../services/squadreService";

const squadraVuota = {
  id: "",
  nomeSquadra: "",
  tecnici: [],
  attiva: true,
};

const rapportinoVuoto = {
  descrizioneLavoriEseguiti: "",
  dipendenti: [{ dipendenteId: "", ore: "" }],
  kmPercorsi: "",
  costoKm: "0.75",
  tempoViaggio: "",
  materiali: [{ materiale: "", quantita: "", prezzoUnitario: "" }],
  fotoPrima: "",
  fotoDopo: "",
  noteFinali: "",
  firma: "",
  marginePercentuale: "",
};

function generaGoogleMapsLink(intervento) {
  if (intervento?.linkGoogleMaps) return intervento.linkGoogleMaps;
  const query = [intervento?.indirizzoCompleto || intervento?.indirizzo, intervento?.comune, intervento?.provincia]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query).replace(/%20/g, "+")}` : "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Squadre() {
  const [squadre, setSquadre] = useState([]);
  const [operai, setOperai] = useState([]);
  const [interventi, setInterventi] = useState([]);
  const [consuntivazioni, setConsuntivazioni] = useState([]);
  const [form, setForm] = useState(squadraVuota);
  const [filtroInterventi, setFiltroInterventi] = useState("DA ASSEGNARE");
  const [assegnazioni, setAssegnazioni] = useState({});
  const [interventoDettaglioId, setInterventoDettaglioId] = useState("");
  const [assegnazioneModal, setAssegnazioneModal] = useState(null);
  const [rapportinoForm, setRapportinoForm] = useState(rapportinoVuoto);

  const caricaDati = () => {
    setOperai(operaiService.lista());
    setSquadre(squadreService.lista());
    setInterventi(chiamateTecniciService.lista());
    setConsuntivazioni(consuntivazioniService.daConsuntivare());
  };

  useEffect(() => {
    caricaDati();
    window.addEventListener("teamGroupDataChanged", caricaDati);
    return () => window.removeEventListener("teamGroupDataChanged", caricaDati);
  }, []);

  const operaioById = useMemo(() => Object.fromEntries(operai.map((operaio) => [operaio.id, operaio])), [operai]);
  const squadraById = useMemo(() => Object.fromEntries(squadre.map((squadra) => [squadra.id, squadra])), [squadre]);
  const interventiFiltrati = useMemo(
    () =>
      interventi.filter((intervento) => {
        const statoAssegnazione = intervento.statoAssegnazione || (intervento.squadraId ? "ASSEGNATO" : "DA ASSEGNARE");

        if (filtroInterventi === "TUTTI") return true;
        if (filtroInterventi === "DA ASSEGNARE") return statoAssegnazione === "DA ASSEGNARE" || !intervento.squadraId;
        return intervento.squadraId === filtroInterventi;
      }),
    [filtroInterventi, interventi],
  );
  const interventoDettaglio = useMemo(
    () => interventi.find((intervento) => intervento.id === interventoDettaglioId) || interventiFiltrati[0],
    [interventi, interventiFiltrati, interventoDettaglioId],
  );
  const anteprimaConsuntivo = useMemo(
    () => calcolaConsuntivo({
      dipendenti: rapportinoForm.dipendenti,
      materiali: rapportinoForm.materiali,
      kmPercorsi: rapportinoForm.kmPercorsi,
      costoKm: rapportinoForm.costoKm,
      marginePercentuale: rapportinoForm.marginePercentuale || consuntivazioniService.margineDefault(),
    }),
    [rapportinoForm],
  );

  const toggleTecnico = (id) => {
    setForm((corrente) => ({
      ...corrente,
      tecnici: corrente.tecnici.includes(id)
        ? corrente.tecnici.filter((tecnicoId) => tecnicoId !== id)
        : [...corrente.tecnici, id],
    }));
  };

  const salva = () => {
    if (!form.nomeSquadra.trim()) return;
    squadreService.salva(form);
    setForm(squadraVuota);
    caricaDati();
  };

  const elimina = (squadra) => {
    if (!window.confirm(`Eliminare la squadra ${squadra.nomeSquadra}?`)) return;
    squadreService.elimina(squadra.id);
    caricaDati();
  };

  const assegnaIntervento = (intervento) => {
    const squadraId = assegnazioni[intervento.id] ?? "";
    const squadraNome = squadraById[squadraId]?.nomeSquadra || "";
    if (!squadraId) return;

    chiamateTecniciService.assegnaSquadra(intervento.id, squadraId, squadraNome);
    setAssegnazioneModal(null);
    caricaDati();
  };

  const formatEuro = (value) => `${Number(value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  const apriAssegna = (intervento) => {
    setAssegnazioni((corrente) => ({ ...corrente, [intervento.id]: intervento.squadraId || "" }));
    setAssegnazioneModal(intervento);
  };

  const apriRapportino = (intervento) => {
    setInterventoDettaglioId(intervento.id);
    setRapportinoForm({
      ...rapportinoVuoto,
      descrizioneLavoriEseguiti: intervento.rapportino || "",
      kmPercorsi: intervento.datiChiusura?.kmPercorsi || "",
      costoKm: intervento.datiChiusura?.costoKm || "0.75",
      marginePercentuale: intervento.datiChiusura?.marginePercentuale || consuntivazioniService.margineDefault(),
      materiali: intervento.datiChiusura?.materiali?.length ? intervento.datiChiusura.materiali : rapportinoVuoto.materiali,
      noteFinali: intervento.noteChiusura || "",
    });
  };

  const eliminaIntervento = (intervento) => {
    if (!window.confirm(`Eliminare la chiamata ${intervento.numero}?`)) return;
    chiamateTecniciService.elimina(intervento.id);
    if (interventoDettaglioId === intervento.id) setInterventoDettaglioId("");
    caricaDati();
  };

  const aggiornaRapportino = (campo, valore) => setRapportinoForm((corrente) => ({ ...corrente, [campo]: valore }));

  const aggiornaRigaRapportino = (tipo, index, campo, valore) => {
    setRapportinoForm((corrente) => ({
      ...corrente,
      [tipo]: corrente[tipo].map((riga, rigaIndex) => (rigaIndex === index ? { ...riga, [campo]: valore } : riga)),
    }));
  };

  const aggiungiRigaRapportino = (tipo, riga) => {
    setRapportinoForm((corrente) => ({ ...corrente, [tipo]: [...corrente[tipo], riga] }));
  };

  const caricaFotoRapportino = async (campo, file) => {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    aggiornaRapportino(campo, { nomeFile: file.name, dataUrl });
  };

  const chiudiChiamata = () => {
    if (!interventoDettaglio) return;
    const dipendentiValidi = rapportinoForm.dipendenti.filter((riga) => riga.dipendenteId && Number(String(riga.ore).replace(",", ".")) > 0);
    const materialiValidi = rapportinoForm.materiali.filter((riga) => riga.materiale || riga.quantita || riga.prezzoUnitario);

    if (!rapportinoForm.descrizioneLavoriEseguiti.trim()) {
      window.alert("Inserire descrizione lavori eseguiti prima di chiudere la chiamata");
      return;
    }
    if (!dipendentiValidi.length) {
      window.alert("Inserire ore lavorate prima di chiudere la chiamata");
      return;
    }
    if (!rapportinoForm.fotoDopo?.dataUrl) {
      window.alert("Inserire foto dopo/fine lavoro prima di chiudere la chiamata");
      return;
    }

    chiamateTecniciService.chiudi(interventoDettaglio.id, {
      rapportino: rapportinoForm.descrizioneLavoriEseguiti,
      dipendenti: dipendentiValidi,
      kmPercorsi: rapportinoForm.kmPercorsi,
      costoKm: rapportinoForm.costoKm,
      tempoViaggio: rapportinoForm.tempoViaggio,
      materiali: materialiValidi,
      fotoPrima: rapportinoForm.fotoPrima,
      fotoDopo: rapportinoForm.fotoDopo,
      noteChiusura: rapportinoForm.noteFinali,
      firma: rapportinoForm.firma,
      marginePercentuale: rapportinoForm.marginePercentuale || consuntivazioniService.margineDefault(),
    });
    caricaDati();
  };

  return (
    <div>
      <h1>Squadre</h1>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginBottom: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <h2>{form.id ? "Modifica squadra" : "Nuova squadra"}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", marginBottom: "14px" }}>
          <input placeholder="Nome squadra" value={form.nomeSquadra} onChange={(e) => setForm({ ...form, nomeSquadra: e.target.value })} />
          <select value={String(form.attiva)} onChange={(e) => setForm({ ...form, attiva: e.target.value === "true" })}>
            <option value="true">Attiva</option>
            <option value="false">Non attiva</option>
          </select>
        </div>

        <h3>Tecnici assegnati</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "8px", marginBottom: "14px" }}>
          {operai.map((operaio) => (
            <label key={operaio.id} style={{ display: "flex", gap: "8px", alignItems: "center", border: "1px solid var(--enterprise-border-soft)", borderRadius: "8px", padding: "8px" }}>
              <input type="checkbox" checked={form.tecnici.includes(operaio.id)} onChange={() => toggleTecnico(operaio.id)} />
              <span>{operaio.nome} {operaio.cognome || ""} - {operaio.ruolo}</span>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={salva}>{form.id ? "Salva modifica" : "Crea squadra"}</button>
          <button onClick={() => setForm(squadraVuota)} style={{ background: "white", color: "var(--enterprise-primary)" }}>Nuova / Annulla</button>
        </div>
      </section>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <h2>Elenco squadre</h2>
        <table width="100%">
          <thead>
            <tr>
              <th>Squadra</th>
              <th>Tecnici</th>
              <th>Stato</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {squadre.map((squadra) => (
              <tr key={squadra.id}>
                <td><strong>{squadra.nomeSquadra}</strong></td>
                <td>
                  {squadra.tecnici?.length
                    ? squadra.tecnici.map((id) => operaioById[id]).filter(Boolean).map((operaio) => `${operaio.nome} ${operaio.cognome || ""}`).join(", ")
                    : "Nessun tecnico"}
                </td>
                <td>{squadra.attiva ? "Attiva" : "Non attiva"}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => setForm({ ...squadra, tecnici: squadra.tecnici || [] })}>Modifica</button>
                    <button onClick={() => elimina(squadra)} style={{ background: "var(--enterprise-danger)" }}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginTop: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <h2>Interventi manutenzione</h2>
        <p style={{ color: "var(--enterprise-muted)", marginBottom: "12px" }}>
          Gli interventi importati da CSV entrano sempre nella sezione Da assegnare. Solo l'assegnazione manuale li rende visibili nell'app tecnici.
        </p>

        <div style={{ border: "1px dashed var(--enterprise-border-soft)", borderRadius: "8px", padding: "12px", marginBottom: "12px", background: "#f8fafc" }}>
          <strong>Importa anagrafica clienti</strong>
          <p style={{ color: "var(--enterprise-muted)", margin: "6px 0 0" }}>
            Funzione pronta per la prossima fase: ID cliente - nome cliente - indirizzo - referente - telefono - email.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
          <select value={filtroInterventi} onChange={(event) => setFiltroInterventi(event.target.value)}>
            <option value="DA ASSEGNARE">Da assegnare</option>
            <option value="TUTTI">Tutti</option>
            {squadre.map((squadra) => (
              <option key={squadra.id} value={squadra.id}>{squadra.nomeSquadra}</option>
            ))}
          </select>
          <strong>{interventiFiltrati.length} interventi visualizzati</strong>
        </div>
        <table width="100%">
          <thead>
            <tr>
              <th>Numero chiamata</th>
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
            {interventiFiltrati.map((intervento) => {
              const statoAssegnazione = intervento.statoAssegnazione || (intervento.squadraId ? "ASSEGNATO" : "DA ASSEGNARE");

              return (
              <tr key={intervento.id}>
                <td><strong>{intervento.numero}</strong></td>
                <td>{intervento.idCliente || "-"}</td>
                <td>{intervento.clienteAssociato || intervento.cliente || "Cliente da associare"}</td>
                <td>{intervento.preventivoNumero || (intervento.preventivoCollegato ? "Collegato" : "-")}</td>
                <td>{intervento.importoPreventivo || "-"}</td>
                <td>{intervento.descrizione || "-"}</td>
                <td>{intervento.indirizzo || "-"}</td>
                <td>{intervento.comune || "-"}</td>
                <td>{squadraById[intervento.squadraId]?.nomeSquadra || "Non assegnata"}</td>
                <td>{statoAssegnazione}</td>
                <td>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button onClick={() => setInterventoDettaglioId(intervento.id)}>Apri</button>
                    {generaGoogleMapsLink(intervento) && (
                      <a href={generaGoogleMapsLink(intervento)} target="_blank" rel="noreferrer">
                        <button type="button">Posizione</button>
                      </a>
                    )}
                    <button onClick={() => apriRapportino(intervento)}>Rapportino</button>
                    <button onClick={() => apriAssegna(intervento)}>Assegna</button>
                    <button onClick={() => eliminaIntervento(intervento)} style={{ background: "var(--enterprise-danger)" }}>Elimina</button>
                  </div>
                </td>
              </tr>
            );
            })}
            {!interventiFiltrati.length && (
              <tr>
                <td colSpan="11" style={{ color: "var(--enterprise-muted)", padding: "18px" }}>Nessun intervento presente.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {interventoDettaglio && (
        <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginTop: "18px", boxShadow: "var(--enterprise-shadow)" }}>
          <h2>Dettaglio chiamata</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "14px" }}>
            <div>
              <p><strong>Numero chiamata:</strong> {interventoDettaglio.numero || "-"}</p>
              <p><strong>Codice progetto:</strong> {interventoDettaglio.codiceProgramma || "-"}</p>
              <p><strong>ID cliente:</strong> {interventoDettaglio.idCliente || "-"}</p>
              <p><strong>Cliente associato:</strong> {interventoDettaglio.clienteAssociato || interventoDettaglio.cliente || "Cliente da associare"}</p>
              <p><strong>Preventivo collegato:</strong> {interventoDettaglio.preventivoNumero || "-"}</p>
              <p><strong>Stato preventivo:</strong> {interventoDettaglio.statoPreventivo || "-"}</p>
              <p><strong>Importo preventivo:</strong> {interventoDettaglio.importoPreventivo || "-"}</p>
              <p><strong>DDT allegati:</strong></p>
              {Array.isArray(interventoDettaglio.ddtAllegati) && interventoDettaglio.ddtAllegati.length ? (
                interventoDettaglio.ddtAllegati.map((ddt) => (
                  <p key={ddt.id || ddt.numeroDdt}>
                    {ddt.numeroDdt} - {ddt.fornitore || "-"}<br />
                    {ddt.allegato?.dataUrl ? <a href={ddt.allegato.dataUrl} download={ddt.allegato.nomeFile}>Apri DDT</a> : null}
                  </p>
                ))
              ) : (
                <p>Nessun DDT allegato.</p>
              )}
              <p><strong>Descrizione:</strong><br />{interventoDettaglio.descrizione || "-"}</p>
              <p><strong>Note:</strong><br />{interventoDettaglio.noteUfficio || "-"}</p>
            </div>
            <div>
              <p><strong>Indirizzo completo:</strong> {interventoDettaglio.indirizzo || "-"}</p>
              <p><strong>Coordinate:</strong> {interventoDettaglio.coordinate || "-"}</p>
              <p>
                <strong>Posizione:</strong>{" "}
                {generaGoogleMapsLink(interventoDettaglio) ? (
                  <a href={generaGoogleMapsLink(interventoDettaglio)} target="_blank" rel="noreferrer">Apri posizione</a>
                ) : "-"}
              </p>
              <p><strong>Comune:</strong> {interventoDettaglio.comune || "-"}</p>
              <p><strong>Data apertura:</strong> {interventoDettaglio.dataApertura || "-"}</p>
              <p><strong>Squadra:</strong> {squadraById[interventoDettaglio.squadraId]?.nomeSquadra || "Non assegnata"}</p>
              <p><strong>Stato:</strong> {interventoDettaglio.statoAssegnazione || (interventoDettaglio.squadraId ? "ASSEGNATO" : "DA ASSEGNARE")}</p>
            </div>
            <div>
              <p><strong>Foto:</strong> {interventoDettaglio.foto?.length || 0}</p>
              <p><strong>Rapportino:</strong> {interventoDettaglio.rapportino || "Non compilato"}</p>
              <p><strong>Preventivo:</strong> {interventoDettaglio.importoPreventivo || "-"}</p>
              <p><strong>Consuntivo:</strong> {interventoDettaglio.importoConsuntivo || "-"}</p>
              <p><strong>Categoria:</strong> {interventoDettaglio.categoria || "-"}</p>
              <p><strong>Priorita:</strong> {interventoDettaglio.priorita || "-"}</p>
            </div>
          </div>

          <h3 style={{ marginTop: "14px" }}>Storico modifiche</h3>
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {[...(interventoDettaglio.storicoModifiche || []), ...(interventoDettaglio.storicoAssegnazioni || [])].map((voce, index) => (
              <li key={`${voce.data}-${index}`}>
                {new Date(voce.data).toLocaleString("it-IT")} - {voce.azione || voce.squadraNome || "Modifica"}
              </li>
            ))}
            {!interventoDettaglio.storicoModifiche?.length && !interventoDettaglio.storicoAssegnazioni?.length && (
              <li>Nessuna modifica registrata.</li>
            )}
          </ul>

          <h3 style={{ marginTop: "18px" }}>Rapportino tecnico</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "12px" }}>
            <label>
              Descrizione lavori eseguiti
              <textarea value={rapportinoForm.descrizioneLavoriEseguiti} onChange={(event) => aggiornaRapportino("descrizioneLavoriEseguiti", event.target.value)} />
            </label>
            <label>
              Km percorsi
              <input value={rapportinoForm.kmPercorsi} onChange={(event) => aggiornaRapportino("kmPercorsi", event.target.value)} />
            </label>
            <label>
              Costo €/km
              <input value={rapportinoForm.costoKm} onChange={(event) => aggiornaRapportino("costoKm", event.target.value)} />
            </label>
            <label>
              Tempo viaggio
              <input value={rapportinoForm.tempoViaggio} onChange={(event) => aggiornaRapportino("tempoViaggio", event.target.value)} />
            </label>
            <label>
              Margine azienda
              <select value={rapportinoForm.marginePercentuale || consuntivazioniService.margineDefault()} onChange={(event) => aggiornaRapportino("marginePercentuale", event.target.value)}>
                {MARGINI_CONSUNTIVO.map((percentuale) => (
                  <option key={percentuale} value={percentuale}>{percentuale}%</option>
                ))}
              </select>
            </label>
            <label>
              Firma
              <input value={rapportinoForm.firma} onChange={(event) => aggiornaRapportino("firma", event.target.value)} placeholder="Nome e cognome" />
            </label>
          </div>

          <h4>Dipendenti presenti e ore</h4>
          {rapportinoForm.dipendenti.map((riga, index) => (
            <div key={`dipendente-${index}`} style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px", marginBottom: "8px" }}>
              <select value={riga.dipendenteId} onChange={(event) => aggiornaRigaRapportino("dipendenti", index, "dipendenteId", event.target.value)}>
                <option value="">Seleziona dipendente</option>
                {operai.filter((operaio) => operaio.attivo !== false).map((operaio) => (
                  <option key={operaio.id} value={operaio.id}>{operaio.nome} {operaio.cognome || ""} - {operaio.ruolo}</option>
                ))}
              </select>
              <input placeholder="Ore" value={riga.ore} onChange={(event) => aggiornaRigaRapportino("dipendenti", index, "ore", event.target.value)} />
            </div>
          ))}
          <button type="button" onClick={() => aggiungiRigaRapportino("dipendenti", { dipendenteId: "", ore: "" })}>Aggiungi dipendente</button>

          <h4>Materiali usati</h4>
          {rapportinoForm.materiali.map((riga, index) => (
            <div key={`materiale-${index}`} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px", marginBottom: "8px" }}>
              <input placeholder="Materiale" value={riga.materiale} onChange={(event) => aggiornaRigaRapportino("materiali", index, "materiale", event.target.value)} />
              <input placeholder="Quantita" value={riga.quantita} onChange={(event) => aggiornaRigaRapportino("materiali", index, "quantita", event.target.value)} />
              <input placeholder="Prezzo unitario" value={riga.prezzoUnitario} onChange={(event) => aggiornaRigaRapportino("materiali", index, "prezzoUnitario", event.target.value)} />
            </div>
          ))}
          <button type="button" onClick={() => aggiungiRigaRapportino("materiali", { materiale: "", quantita: "", prezzoUnitario: "" })}>Aggiungi materiale</button>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px", marginTop: "12px" }}>
            <label>
              Foto prima
              <input type="file" accept="image/*" onChange={(event) => caricaFotoRapportino("fotoPrima", event.target.files?.[0])} />
              {rapportinoForm.fotoPrima?.nomeFile && <small>{rapportinoForm.fotoPrima.nomeFile}</small>}
            </label>
            <label>
              Foto dopo/fine lavoro
              <input type="file" accept="image/*" onChange={(event) => caricaFotoRapportino("fotoDopo", event.target.files?.[0])} />
              {rapportinoForm.fotoDopo?.nomeFile && <small>{rapportinoForm.fotoDopo.nomeFile}</small>}
            </label>
            <label>
              Note finali
              <textarea value={rapportinoForm.noteFinali} onChange={(event) => aggiornaRapportino("noteFinali", event.target.value)} />
            </label>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
            <button onClick={chiudiChiamata} style={{ background: "var(--enterprise-success)" }}>Chiudi chiamata</button>
          </div>

          <div style={{ marginTop: "18px", border: "1px solid var(--enterprise-border-soft)", borderRadius: "8px", padding: "14px", background: "#f8fafc" }}>
            <h3>Anteprima consuntivo</h3>
            <p><strong>Costo manodopera:</strong> {formatEuro(anteprimaConsuntivo.costoManodopera)}</p>
            <p><strong>Costo materiali:</strong> {formatEuro(anteprimaConsuntivo.costoMateriali)}</p>
            <p><strong>Costo percorso:</strong> {formatEuro(anteprimaConsuntivo.costoPercorso)}</p>
            <hr />
            <p><strong>Totale costo diretto:</strong> {formatEuro(anteprimaConsuntivo.costoDiretto)}</p>
            <p><strong>Spese generali 20%:</strong> {formatEuro(anteprimaConsuntivo.speseGenerali)}</p>
            <hr />
            <p><strong>Totale costo azienda:</strong> {formatEuro(anteprimaConsuntivo.totaleCostoAzienda)}</p>
            <p><strong>Margine {anteprimaConsuntivo.marginePercentuale}%:</strong> {formatEuro(anteprimaConsuntivo.margineAzienda)}</p>
            <hr />
            <p style={{ fontSize: "18px" }}><strong>TOTALE CONSUNTIVO:</strong> {formatEuro(anteprimaConsuntivo.totaleConsuntivo)}</p>
          </div>
        </section>
      )}

      {assegnazioneModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.42)", display: "grid", placeItems: "center", zIndex: 20 }}>
          <section style={{ background: "white", borderRadius: "8px", padding: "20px", width: "420px", maxWidth: "92vw", boxShadow: "var(--enterprise-shadow)" }}>
            <h2>Assegna chiamata</h2>
            <p><strong>{assegnazioneModal.numero}</strong> - {assegnazioneModal.clienteAssociato || assegnazioneModal.cliente || "Cliente da associare"}</p>
            <select
              value={assegnazioni[assegnazioneModal.id] ?? ""}
              onChange={(event) => setAssegnazioni((corrente) => ({ ...corrente, [assegnazioneModal.id]: event.target.value }))}
              style={{ width: "100%", margin: "12px 0" }}
            >
              <option value="">Scegli squadra</option>
              {squadre.filter((squadra) => squadra.attiva !== false).map((squadra) => (
                <option key={squadra.id} value={squadra.id}>{squadra.nomeSquadra}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setAssegnazioneModal(null)} style={{ background: "white", color: "var(--enterprise-primary)" }}>Annulla</button>
              <button type="button" onClick={() => assegnaIntervento(assegnazioneModal)}>Salva assegnazione</button>
            </div>
          </section>
        </div>
      )}

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginTop: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <h2>Da consuntivare</h2>
        <table width="100%">
          <thead>
            <tr>
              <th>Chiamata</th>
              <th>Cliente</th>
              <th>Indirizzo</th>
              <th>Manodopera</th>
              <th>Materiali</th>
              <th>Percorso</th>
              <th>Costo diretto</th>
              <th>Spese generali</th>
              <th>Costo azienda</th>
              <th>Margine</th>
              <th>Totale consuntivo</th>
              <th>Trasforma</th>
            </tr>
          </thead>
          <tbody>
            {consuntivazioni.map((voce) => (
              <tr key={voce.id}>
                <td><strong>{voce.numeroChiamata}</strong><br /><small>{voce.descrizione || "-"}</small></td>
                <td>{voce.cliente || "Cliente da associare"}<br /><small>{voce.idCliente || "-"}</small></td>
                <td>{voce.indirizzo || "-"}</td>
                <td>{formatEuro(voce.costoManodopera)}</td>
                <td>{formatEuro(voce.costoMateriali)}</td>
                <td>{formatEuro(voce.costoPercorso)}</td>
                <td>{formatEuro(voce.costoDiretto ?? voce.totaleCostoInterno)}</td>
                <td>{formatEuro(voce.speseGenerali)}<br /><small>20%</small></td>
                <td>{formatEuro(voce.totaleCostoAzienda)}</td>
                <td>{formatEuro(voce.margineAzienda ?? voce.margine)}<br /><small>{voce.marginePercentuale || "-"}%</small></td>
                <td><strong>{formatEuro(voce.totaleConsuntivo ?? voce.importoDaFatturare)}</strong></td>
                <td>{(voce.trasformabileIn || ["Preventivo", "Fattura", "Report economico"]).join(", ")}</td>
              </tr>
            ))}
            {!consuntivazioni.length && (
              <tr>
                <td colSpan="12" style={{ color: "var(--enterprise-muted)", padding: "18px" }}>Nessuna chiamata chiusa da consuntivare.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default Squadre;
