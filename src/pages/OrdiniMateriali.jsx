import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { chiamateTecniciService } from "../services/chiamateTecniciService";
import { consuntivazioniService } from "../services/consuntivazioniService";
import { ddtMaterialiService } from "../services/ddtMaterialiService";
import { squadreService } from "../services/squadreService";

const ordineVuoto = {
  data: new Date().toISOString().split("T")[0],
  cantiereId: "",
  cantiere: "",
  fornitore: "",
  codiceMateriale: "",
  materiale: "",
  quantita: "",
  prezzoUnitario: "",
  importo: "",
  stato: "Da Ordinare",
};

const ddtVuoto = {
  numeroDdt: "",
  dataDdt: new Date().toISOString().slice(0, 10),
  numeroChiamata: "",
  codiceProgetto: "",
  idCliente: "",
  cliente: "Cliente da associare",
  preventivoId: "",
  preventivoNumero: "",
  consuntivoId: "",
  magazzino: "Da caricare",
  fornitore: "",
  fornitoreDati: {
    ragioneSociale: "",
    partitaIVA: "",
    indirizzo: "",
    email: "",
    telefono: "",
    categoria: "Materiali Edili",
  },
  stato: "BOZZA",
  allegato: null,
  righe: [{ codiceMateriale: "", materiale: "", quantita: "1", prezzoUnitario: "", totale: "" }],
};

function toNumber(value) {
  const normalized = String(value ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatEuro(value) {
  return `${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EUR`;
}

function prossimoStato(stato) {
  if (stato === "Da Ordinare") return "Ordinato";
  if (stato === "Ordinato") return "Consegnato";
  return "Consegnato";
}

function ricalcolaRiga(riga) {
  const quantita = toNumber(riga.quantita);
  const prezzoUnitario = toNumber(riga.prezzoUnitario);
  return { ...riga, totale: quantita * prezzoUnitario };
}

function normalizza(value) {
  return String(value || "").trim().toLowerCase();
}

function panelStyle() {
  return {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    marginBottom: "20px",
    boxShadow: "var(--enterprise-shadow)",
  };
}

function OrdiniMateriali() {
  const [cantieri, setCantieri] = useState([]);
  const [ordini, setOrdini] = useState([]);
  const [ddt, setDdt] = useState([]);
  const [chiamate, setChiamate] = useState([]);
  const [squadre, setSquadre] = useState([]);
  const [registroMateriali, setRegistroMateriali] = useState([]);
  const [ricerca, setRicerca] = useState("");
  const [nuovoOrdine, setNuovoOrdine] = useState(ordineVuoto);
  const [anteprimaDdt, setAnteprimaDdt] = useState(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");

  const caricaLocali = () => {
    setDdt(ddtMaterialiService.lista());
    setRegistroMateriali(ddtMaterialiService.registroMateriali());
    setChiamate(chiamateTecniciService.lista());
    setSquadre(squadreService.lista());
  };

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaDati() {
      try {
        const [cantieriDb, ordiniDb] = await Promise.all([
          api.get("/cantieri"),
          api.get("/ordini-materiali"),
        ]);

        if (componenteAttivo) {
          setCantieri(cantieriDb);
          setOrdini(ordiniDb);
          caricaLocali();
        }
      } catch (error) {
        if (componenteAttivo) {
          setErrore(error.message);
          caricaLocali();
        }
      } finally {
        if (componenteAttivo) setCaricamento(false);
      }
    }

    caricaDati();
    window.addEventListener("teamGroupDataChanged", caricaLocali);

    return () => {
      componenteAttivo = false;
      window.removeEventListener("teamGroupDataChanged", caricaLocali);
    };
  }, []);

  const generaNumero = () => {
    const anno = new Date().getFullYear();
    return `ORD-${anno}-${String(ordini.length + ddt.length + 1).padStart(4, "0")}`;
  };

  const squadraById = useMemo(() => Object.fromEntries(squadre.map((squadra) => [squadra.id, squadra])), [squadre]);

  const chiamataTrovata = useMemo(() => {
    if (!anteprimaDdt) return null;
    const numero = normalizza(anteprimaDdt.numeroChiamata);
    const progetto = normalizza(anteprimaDdt.codiceProgetto);
    if (!numero && !progetto) return null;

    return chiamate.find((chiamata) =>
      (numero && normalizza(chiamata.numero) === numero) ||
      (progetto && normalizza(chiamata.codiceProgramma) === progetto),
    ) || null;
  }, [anteprimaDdt, chiamate]);

  const collegaChiamataTrovata = () => {
    if (!chiamataTrovata) return;
    setAnteprimaDdt((corrente) => ({
      ...corrente,
      numeroChiamata: chiamataTrovata.numero || corrente.numeroChiamata,
      codiceProgetto: chiamataTrovata.codiceProgramma || corrente.codiceProgetto,
      idCliente: chiamataTrovata.idCliente || corrente.idCliente,
      cliente: chiamataTrovata.clienteAssociato || chiamataTrovata.cliente || corrente.cliente || "Cliente da associare",
      preventivoNumero: chiamataTrovata.preventivoNumero || corrente.preventivoNumero || "",
      preventivoId: chiamataTrovata.preventivoId || corrente.preventivoId || "",
    }));
    setMessaggio(`DDT collegato alla chiamata ${chiamataTrovata.numero}. Ora puoi confermare la registrazione.`);
  };

  const aggiornaCantiere = (cantiereId) => {
    const cantiere = cantieri.find((item) => String(item.id) === cantiereId);
    setNuovoOrdine({
      ...nuovoOrdine,
      cantiereId,
      cantiere: cantiere?.nome || "",
    });
  };

  const autocompletaMaterialeOrdine = (codiceMateriale) => {
    const materiale = ddtMaterialiService.cercaMateriale(codiceMateriale);
    setNuovoOrdine((corrente) => ({
      ...corrente,
      codiceMateriale,
      materiale: materiale?.descrizione || corrente.materiale,
      prezzoUnitario: materiale?.ultimoPrezzo ?? corrente.prezzoUnitario,
      fornitore: materiale?.fornitoreAbituale || corrente.fornitore,
      importo: materiale?.ultimoPrezzo && corrente.quantita ? toNumber(corrente.quantita) * toNumber(materiale.ultimoPrezzo) : corrente.importo,
    }));
  };

  const aggiungiOrdine = async () => {
    if (!nuovoOrdine.fornitore || !nuovoOrdine.materiale) {
      setErrore("Inserisci fornitore e materiale prima di salvare l'ordine.");
      return;
    }

    setErrore("");

    try {
      const ordineCreato = await api.post("/ordini-materiali", {
        ...nuovoOrdine,
        numero: generaNumero(),
        cantiereId: nuovoOrdine.cantiereId ? Number(nuovoOrdine.cantiereId) : null,
        quantita: Number(nuovoOrdine.quantita || 0),
        importo: Number(nuovoOrdine.importo || toNumber(nuovoOrdine.quantita) * toNumber(nuovoOrdine.prezzoUnitario)),
      });

      setOrdini((ordiniAttuali) => [ordineCreato, ...ordiniAttuali]);
      setNuovoOrdine(ordineVuoto);
      setMessaggio("Ordine manuale salvato.");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const eliminaOrdine = async (id) => {
    setErrore("");

    try {
      await api.delete(`/ordini-materiali/${id}`);
      setOrdini((ordiniAttuali) => ordiniAttuali.filter((ordine) => ordine.id !== id));
    } catch (error) {
      setErrore(error.message);
    }
  };

  const cambiaStato = async (ordine) => {
    const stato = prossimoStato(ordine.stato);
    setErrore("");

    try {
      const ordineAggiornato = await api.put(`/ordini-materiali/${ordine.id}`, { stato });
      setOrdini((ordiniAttuali) =>
        ordiniAttuali.map((item) => (item.id === ordine.id ? ordineAggiornato : item)),
      );
    } catch (error) {
      setErrore(error.message);
    }
  };

  const caricaDdt = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrore("");
    setMessaggio("");

    try {
      const bozza = await ddtMaterialiService.preparaDaFile(file);
      setAnteprimaDdt({ ...ddtVuoto, ...bozza });
      setMessaggio("DDT caricato. Controlla e correggi l'anteprima prima di registrare.");
    } catch (error) {
      setErrore(error.message || "Impossibile caricare il DDT.");
    } finally {
      event.target.value = "";
    }
  };

  const aggiornaAnteprima = (campo, valore) => {
    setAnteprimaDdt((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const aggiornaFornitoreDdt = (campo, valore) => {
    setAnteprimaDdt((corrente) => ({
      ...corrente,
      fornitore: campo === "ragioneSociale" ? valore : corrente.fornitore,
      fornitoreDati: {
        ...(corrente.fornitoreDati || {}),
        [campo]: valore,
      },
    }));
  };

  const aggiornaRigaDdt = (index, campo, valore) => {
    setAnteprimaDdt((corrente) => ({
      ...corrente,
      righe: corrente.righe.map((riga, rigaIndex) => {
        if (rigaIndex !== index) return riga;
        const aggiornata = { ...riga, [campo]: valore };
        const materiale = campo === "codiceMateriale" ? ddtMaterialiService.cercaMateriale(valore) : null;
        const conRegistro = materiale
          ? {
              ...aggiornata,
              materiale: aggiornata.materiale || materiale.descrizione,
              prezzoUnitario: aggiornata.prezzoUnitario || materiale.ultimoPrezzo,
            }
          : aggiornata;
        return ricalcolaRiga(conRegistro);
      }),
    }));
  };

  const aggiungiRigaDdt = () => {
    setAnteprimaDdt((corrente) => ({
      ...corrente,
      righe: [...corrente.righe, { codiceMateriale: "", materiale: "", quantita: "1", prezzoUnitario: "", totale: "" }],
    }));
  };

  const eliminaRigaDdt = (index) => {
    setAnteprimaDdt((corrente) => ({ ...corrente, righe: corrente.righe.filter((_, rigaIndex) => rigaIndex !== index) }));
  };

  const leggiDdtConAi = () => {
    if (!anteprimaDdt) return;
    const letto = ddtMaterialiService.leggiConAi(anteprimaDdt);
    setAnteprimaDdt(letto);
    setMessaggio(letto.letturaAi?.messaggio || "Lettura DDT eseguita. Verificare l'anteprima prima della conferma.");
  };

  const confermaDdt = () => {
    if (!anteprimaDdt?.allegato) {
      setErrore("Carica un allegato DDT prima di registrare.");
      return;
    }
    if (!String(anteprimaDdt.fornitore || anteprimaDdt.fornitoreDati?.ragioneSociale || "").trim()) {
      setErrore("Inserisci il fornitore prima di confermare il DDT.");
      return;
    }
    if (!String(anteprimaDdt.numeroDdt || "").trim()) {
      setErrore("Inserisci il numero DDT prima di confermare.");
      return;
    }
    if (!String(anteprimaDdt.dataDdt || "").trim()) {
      setErrore("Inserisci la data DDT prima di confermare.");
      return;
    }
    if (!anteprimaDdt.numeroChiamata && !anteprimaDdt.codiceProgetto) {
      setErrore("Collega il DDT a numero chiamata o codice progetto.");
      return;
    }
    if (!anteprimaDdt.righe.some((riga) => riga.codiceMateriale || riga.materiale)) {
      setErrore("Inserisci almeno una riga materiale.");
      return;
    }

    const registrato = ddtMaterialiService.conferma(anteprimaDdt);
    consuntivazioniService.aggiungiMaterialiDaDdt(registrato);
    setAnteprimaDdt(null);
    caricaLocali();
    setMessaggio(`DDT ${registrato.numeroDdt} registrato e collegato alla consuntivazione.`);
  };

  const eliminaDdt = (id) => {
    if (!window.confirm("Eliminare il DDT registrato?")) return;
    ddtMaterialiService.elimina(id);
    caricaLocali();
  };

  const apriDdt = (id) => {
    const documento = ddt.find((item) => item.id === id);
    if (!documento) return;
    setAnteprimaDdt({
      ...ddtVuoto,
      ...documento,
      righe: documento.righe?.length ? documento.righe : ddtVuoto.righe,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const righeDdt = useMemo(
    () =>
      ddt.flatMap((documento) =>
        (documento.righe || []).map((riga) => ({
          ...riga,
          ddtId: documento.id,
          numeroDdt: documento.numeroDdt,
          dataDdt: documento.dataDdt,
          numeroChiamata: documento.numeroChiamata,
          codiceProgetto: documento.codiceProgetto,
          cliente: documento.cliente,
          preventivoNumero: documento.preventivoNumero,
          fornitore: documento.fornitore,
          allegato: documento.allegato,
          stato: documento.stato,
        })),
      ),
    [ddt],
  );

  const ordiniManuali = useMemo(
    () =>
      ordini.map((ordine) => ({
        ddtId: `ordine-${ordine.id}`,
        numeroDdt: ordine.numero,
        dataDdt: ordine.data,
        numeroChiamata: "",
        codiceProgetto: "",
        cliente: ordine.cantiere || "Cliente da associare",
        fornitore: ordine.fornitore,
        codiceMateriale: ordine.codiceMateriale || "",
        materiale: ordine.materiale,
        quantita: ordine.quantita,
        prezzoUnitario: "",
        totale: ordine.importo,
        allegato: null,
        stato: ordine.stato,
        ordineOriginale: ordine,
      })),
    [ordini],
  );

  const righeFiltrate = useMemo(
    () =>
      [...righeDdt, ...ordiniManuali].filter((riga) =>
        [
          riga.numeroDdt,
          riga.numeroChiamata,
          riga.codiceProgetto,
          riga.fornitore,
          riga.codiceMateriale,
          riga.materiale,
          riga.stato,
        ].join(" ").toLowerCase().includes(ricerca.toLowerCase()),
      ),
    [ordiniManuali, ricerca, righeDdt],
  );

  const totali = useMemo(() => {
    const totaleOrdini = righeFiltrate.reduce((totale, ordine) => totale + Number(ordine.totale || 0), 0);
    const totaleConsegnati = righeFiltrate
      .filter((ordine) => ordine.stato === "Consegnato" || ordine.stato === "REGISTRATO")
      .reduce((totale, ordine) => totale + Number(ordine.totale || 0), 0);

    return {
      totaleOrdini,
      totaleConsegnati,
      totaleDaConsegnare: totaleOrdini - totaleConsegnati,
    };
  }, [righeFiltrate]);

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <div>
      <h1>Ordini Materiali PRO</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "20px", marginBottom: "25px" }}>
        <div style={card}>
          <h3>DDT / Ordini</h3>
          <h2>{righeFiltrate.length}</h2>
        </div>
        <div style={card}>
          <h3>Totale Acquisti</h3>
          <h2>{formatEuro(totali.totaleOrdini)}</h2>
        </div>
        <div style={card}>
          <h3>Registrati</h3>
          <h2>{formatEuro(totali.totaleConsegnati)}</h2>
        </div>
        <div style={card}>
          <h3>Da Consegnare</h3>
          <h2>{formatEuro(totali.totaleDaConsegnare)}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson" }}>{errore}</p>}
      {messaggio && <p style={{ color: "#166534", fontWeight: 700 }}>{messaggio}</p>}

      <section style={panelStyle()}>
        <h2>Caricamento DDT</h2>
        <p style={{ color: "var(--enterprise-muted)" }}>
          Carica foto, PDF o scansione. Il documento viene salvato alla chiamata/codice progetto; l'anteprima resta modificabile prima della registrazione.
        </p>
        <label>
          <button type="button" onClick={() => document.getElementById("ddt-upload").click()}>Carica DDT</button>
          <input
            id="ddt-upload"
            type="file"
            accept="image/*,.pdf,application/pdf,.txt,.csv"
            onChange={caricaDdt}
            style={{ display: "none" }}
          />
        </label>
      </section>

      {anteprimaDdt && (
        <section style={panelStyle()}>
          <h2>Anteprima DDT modificabile</h2>
          {anteprimaDdt.fonte === "APP TECNICI" && (
            <p style={{ color: "#166534", fontWeight: 700 }}>
              DDT ricevuto dall'app tecnici: verificare i dati letti prima della registrazione.
            </p>
          )}
          {anteprimaDdt.letturaAi?.messaggio && (
            <p style={{ color: anteprimaDdt.letturaAi.esito === "NON_RIUSCITA" ? "crimson" : "#166534", fontWeight: 700 }}>
              {anteprimaDdt.letturaAi.messaggio}
            </p>
          )}
          {chiamataTrovata && (
            <div style={{ border: "2px solid #16a34a", background: "#f0fdf4", borderRadius: "8px", padding: "14px", marginBottom: "14px" }}>
              <h3 style={{ marginTop: 0, color: "#166534" }}>✓ Chiamata trovata</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px", marginBottom: "12px" }}>
                <p><strong>Cliente:</strong><br />{chiamataTrovata.clienteAssociato || chiamataTrovata.cliente || "Cliente da associare"}</p>
                <p><strong>Squadra:</strong><br />{squadraById[chiamataTrovata.squadraId]?.nomeSquadra || "Non assegnata"}</p>
                <p><strong>Preventivo:</strong><br />{chiamataTrovata.preventivoNumero || "-"}</p>
              </div>
              <p style={{ fontWeight: 700 }}>Vuoi collegare automaticamente questo DDT?</p>
              <button type="button" onClick={collegaChiamataTrovata}>SI, collega automaticamente</button>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "12px", marginBottom: "14px" }}>
            <input placeholder="Numero DDT" value={anteprimaDdt.numeroDdt} onChange={(e) => aggiornaAnteprima("numeroDdt", e.target.value)} />
            <input type="date" value={String(anteprimaDdt.dataDdt || "").slice(0, 10)} onChange={(e) => aggiornaAnteprima("dataDdt", e.target.value)} />
            <input placeholder="Numero chiamata" value={anteprimaDdt.numeroChiamata} onChange={(e) => aggiornaAnteprima("numeroChiamata", e.target.value)} />
            <input placeholder="Codice progetto" value={anteprimaDdt.codiceProgetto} onChange={(e) => aggiornaAnteprima("codiceProgetto", e.target.value)} />
            <input placeholder="ID cliente/impianto" value={anteprimaDdt.idCliente} onChange={(e) => aggiornaAnteprima("idCliente", e.target.value)} />
            <input placeholder="Cliente/condominio" value={anteprimaDdt.cliente} onChange={(e) => aggiornaAnteprima("cliente", e.target.value || "Cliente da associare")} />
            <input placeholder="Fornitore" value={anteprimaDdt.fornitoreDati?.ragioneSociale || anteprimaDdt.fornitore} onChange={(e) => aggiornaFornitoreDdt("ragioneSociale", e.target.value)} />
            <input placeholder="Partita IVA fornitore" value={anteprimaDdt.fornitoreDati?.partitaIVA || ""} onChange={(e) => aggiornaFornitoreDdt("partitaIVA", e.target.value)} />
            <input placeholder="Indirizzo fornitore" value={anteprimaDdt.fornitoreDati?.indirizzo || ""} onChange={(e) => aggiornaFornitoreDdt("indirizzo", e.target.value)} />
            <input placeholder="Email fornitore" value={anteprimaDdt.fornitoreDati?.email || ""} onChange={(e) => aggiornaFornitoreDdt("email", e.target.value)} />
            <input placeholder="Telefono fornitore" value={anteprimaDdt.fornitoreDati?.telefono || ""} onChange={(e) => aggiornaFornitoreDdt("telefono", e.target.value)} />
            <input placeholder="Consuntivo lavori" value={anteprimaDdt.consuntivoId} onChange={(e) => aggiornaAnteprima("consuntivoId", e.target.value)} />
            <input placeholder="Magazzino" value={anteprimaDdt.magazzino} onChange={(e) => aggiornaAnteprima("magazzino", e.target.value)} />
          </div>
          <p><strong>Allegato:</strong> {anteprimaDdt.allegato?.nomeFile || "-"}</p>

          <table width="100%">
            <thead>
              <tr>
                <th>Codice materiale</th>
                <th>Materiale</th>
                <th>Quantita</th>
                <th>Prezzo unitario</th>
                <th>Totale riga</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {anteprimaDdt.righe.map((riga, index) => (
                <tr key={riga.id || index}>
                  <td><input value={riga.codiceMateriale || ""} onChange={(e) => aggiornaRigaDdt(index, "codiceMateriale", e.target.value)} /></td>
                  <td><input value={riga.materiale || ""} onChange={(e) => aggiornaRigaDdt(index, "materiale", e.target.value)} /></td>
                  <td><input value={riga.quantita || ""} onChange={(e) => aggiornaRigaDdt(index, "quantita", e.target.value)} /></td>
                  <td><input value={riga.prezzoUnitario || ""} onChange={(e) => aggiornaRigaDdt(index, "prezzoUnitario", e.target.value)} /></td>
                  <td>
                    {formatEuro(riga.totale || toNumber(riga.quantita) * toNumber(riga.prezzoUnitario))}
                    {!toNumber(riga.prezzoUnitario) && <br />}
                    {!toNumber(riga.prezzoUnitario) && <small style={{ color: "#b45309" }}>prezzo da completare</small>}
                  </td>
                  <td><button type="button" onClick={() => eliminaRigaDdt(index)}>Rimuovi</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
            <button type="button" onClick={leggiDdtConAi}>Leggi DDT con AI</button>
            <button type="button" onClick={aggiungiRigaDdt}>Aggiungi riga materiale</button>
            <button type="button" onClick={confermaDdt}>Conferma e registra DDT</button>
            <button type="button" onClick={() => setAnteprimaDdt(null)} style={{ background: "white", color: "var(--enterprise-primary)" }}>Annulla</button>
          </div>
        </section>
      )}

      <section style={panelStyle()}>
        <h2>Nuovo ordine manuale</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
          <input type="date" value={nuovoOrdine.data} onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, data: e.target.value })} />
          <select value={nuovoOrdine.cantiereId} onChange={(e) => aggiornaCantiere(e.target.value)}>
            <option value="">Seleziona Cantiere</option>
            {cantieri.map((cantiere) => <option key={cantiere.id} value={cantiere.id}>{cantiere.nome}</option>)}
          </select>
          <input placeholder="Fornitore" value={nuovoOrdine.fornitore} onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, fornitore: e.target.value })} />
          <input placeholder="Codice prodotto" value={nuovoOrdine.codiceMateriale} onChange={(e) => autocompletaMaterialeOrdine(e.target.value)} />
          <input placeholder="Materiale" value={nuovoOrdine.materiale} onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, materiale: e.target.value })} />
          <input placeholder="Quantita" value={nuovoOrdine.quantita} onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, quantita: e.target.value })} />
          <input placeholder="Prezzo unitario EUR" value={nuovoOrdine.prezzoUnitario} onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, prezzoUnitario: e.target.value, importo: toNumber(nuovoOrdine.quantita) * toNumber(e.target.value) })} />
          <input placeholder="Importo EUR" value={nuovoOrdine.importo} onChange={(e) => setNuovoOrdine({ ...nuovoOrdine, importo: e.target.value })} />
        </div>

        <button style={{ marginTop: "15px" }} onClick={aggiungiOrdine}>Salva ordine manuale</button>
      </section>

      <section style={panelStyle()}>
        <h2>Elenco Ordini Materiali / DDT</h2>
        <input
          placeholder="Ricerca per DDT, chiamata, progetto, fornitore o materiale"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          style={{ marginBottom: "15px", width: "420px", maxWidth: "100%" }}
        />

        {caricamento ? (
          <p>Caricamento ordini...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Numero DDT</th>
                <th>Data</th>
                <th>Numero chiamata</th>
                <th>Codice progetto</th>
                <th>Fornitore</th>
                <th>Preventivo</th>
                <th>Codice materiale</th>
                <th>Materiale</th>
                <th>Quantita</th>
                <th>Prezzo unitario</th>
                <th>Totale</th>
                <th>Allegato DDT</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {righeFiltrate.map((riga, index) => (
                <tr key={`${riga.ddtId}-${riga.codiceMateriale}-${index}`}>
                  <td>{riga.numeroDdt}</td>
                  <td>{riga.dataDdt}</td>
                  <td>{riga.numeroChiamata || "-"}</td>
                  <td>{riga.codiceProgetto || "-"}</td>
                  <td>{riga.fornitore || "-"}</td>
                  <td>{riga.preventivoNumero || "-"}</td>
                  <td>{riga.codiceMateriale || "-"}</td>
                  <td>{riga.materiale || "-"}</td>
                  <td>{Number(riga.quantita || 0).toLocaleString("it-IT")}</td>
                  <td>{riga.prezzoUnitario ? formatEuro(riga.prezzoUnitario) : <span style={{ color: "#b45309" }}>0,00 EUR<br /><small>prezzo da completare</small></span>}</td>
                  <td>{formatEuro(riga.totale)}</td>
                  <td>{riga.allegato?.dataUrl ? <a href={riga.allegato.dataUrl} download={riga.allegato.nomeFile}>Apri DDT</a> : "-"}</td>
                  <td>{riga.stato}</td>
                  <td>
                    {riga.ordineOriginale ? (
                      <>
                        <button onClick={() => cambiaStato(riga.ordineOriginale)}>Avanza Stato</button>{" "}
                        <button onClick={() => eliminaOrdine(riga.ordineOriginale.id)}>Elimina</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => apriDdt(riga.ddtId)}>{riga.stato === "DA VERIFICARE" ? "Verifica" : "Apri"}</button>{" "}
                        <button onClick={() => eliminaDdt(riga.ddtId)}>Elimina</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!righeFiltrate.length && (
                <tr>
                  <td colSpan="14" style={{ color: "var(--enterprise-muted)", padding: "18px" }}>Nessun DDT o ordine materiale presente.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <section style={panelStyle()}>
        <h2>Registro materiali</h2>
        <table width="100%">
          <thead>
            <tr>
              <th>Codice</th>
              <th>Descrizione</th>
              <th>Fornitore abituale</th>
              <th>Ultimo prezzo</th>
              <th>Aggiornato</th>
            </tr>
          </thead>
          <tbody>
            {registroMateriali.map((materiale) => (
              <tr key={materiale.id}>
                <td>{materiale.codiceMateriale || "-"}</td>
                <td>{materiale.descrizione || "-"}</td>
                <td>{materiale.fornitoreAbituale || "-"}</td>
                <td>{formatEuro(materiale.ultimoPrezzo)}</td>
                <td>{materiale.aggiornatoIl ? new Date(materiale.aggiornatoIl).toLocaleString("it-IT") : "-"}</td>
              </tr>
            ))}
            {!registroMateriali.length && (
              <tr>
                <td colSpan="5" style={{ color: "var(--enterprise-muted)", padding: "18px" }}>Il registro si alimenta confermando i DDT.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default OrdiniMateriali;
