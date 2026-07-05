import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { api } from "../services/api";
import { disegnaIntestazioneAzienda } from "../utils/pdfAzienda";

const oggi = () => new Date().toISOString().split("T")[0];
const STATI_RAPPORTINO = ["In Corso", "Chiusa", "Da Fatturare", "Fatturata"];

const rapportinoVuoto = {
  data: oggi(),
  ordineNumero: "",
  commessaNumero: "",
  cliente: "",
  cantiereId: "",
  cantiere: "",
  localita: "",
  provincia: "",
  attivita: "",
  oraInizio: "08:00",
  oraFine: "17:00",
  ore: "8",
  importo: "",
  stato: "In Corso",
  operai: "",
  note: "",
};

function generaNumeroCommessa(cantiereId) {
  const anno = new Date().getFullYear();
  const progressivo = String(cantiereId || Date.now()).padStart(4, "0");

  return `COM-${anno}-${progressivo}`;
}

function normalizzaData(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("it-IT");
}

function formatEuro(value) {
  return `EUR ${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function calcolaOre(oraInizio, oraFine) {
  if (!oraInizio || !oraFine) return "";

  const [inizioOre, inizioMinuti] = oraInizio.split(":").map(Number);
  const [fineOre, fineMinuti] = oraFine.split(":").map(Number);
  const inizio = inizioOre * 60 + inizioMinuti;
  const fine = fineOre * 60 + fineMinuti;
  const differenza = fine - inizio;

  if (Number.isNaN(differenza) || differenza <= 0) return "";

  return (differenza / 60).toFixed(2);
}

function giorniDelMese(mese) {
  if (!mese) return [];

  const [anno, numeroMese] = mese.split("-").map(Number);
  const ultimoGiorno = new Date(anno, numeroMese, 0).getDate();

  return Array.from({ length: ultimoGiorno }, (_, index) => {
    const giorno = index + 1;
    const data = new Date(anno, numeroMese - 1, giorno);

    return {
      giorno,
      key: `${anno}-${String(numeroMese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`,
      festivo: data.getDay() === 0,
    };
  });
}

function scaricaCsv(nomeFile, righe) {
  const contenuto = righe
    .map((riga) =>
      riga
        .map((valore) => `"${String(valore ?? "").replaceAll('"', '""')}"`)
        .join(";"),
    )
    .join("\n");

  const blob = new Blob([contenuto], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeFile;
  link.click();
  URL.revokeObjectURL(url);
}

function GiornaleCantiere() {
  const [cantieri, setCantieri] = useState([]);
  const [rapportini, setRapportini] = useState([]);
  const [nuovoRapportino, setNuovoRapportino] = useState(rapportinoVuoto);
  const [ricerca, setRicerca] = useState("");
  const [filtroStato, setFiltroStato] = useState("Tutti");
  const [mese, setMese] = useState(oggi().slice(0, 7));
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaDati() {
      try {
        const [cantieriDb, rapportiniDb] = await Promise.all([
          api.get("/cantieri"),
          api.get("/rapportini"),
        ]);

        if (componenteAttivo) {
          const prefillRaw = localStorage.getItem("teamGroupRapportinoCantiere");
          let prefill = null;

          try {
            prefill = prefillRaw ? JSON.parse(prefillRaw) : null;
          } catch {
            prefill = null;
          }

          if (prefillRaw) localStorage.removeItem("teamGroupRapportinoCantiere");

          setCantieri(cantieriDb);
          setRapportini(rapportiniDb);
          if (prefill) {
            const cantiere = cantieriDb.find((item) => String(item.id) === String(prefill.cantiereId));

            setNuovoRapportino((corrente) => ({
              ...corrente,
              cantiereId: prefill.cantiereId || "",
              cantiere: prefill.cantiere || cantiere?.nome || "",
              cliente: prefill.cliente || cantiere?.cliente || "",
              commessaNumero: generaNumeroCommessa(prefill.cantiereId),
              importo: cantiere?.importo || corrente.importo,
            }));
          }
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

  const aggiornaCampo = (campo, valore) => {
    const aggiornato = { ...nuovoRapportino, [campo]: valore };

    if (campo === "oraInizio" || campo === "oraFine") {
      const ore = calcolaOre(
        campo === "oraInizio" ? valore : aggiornato.oraInizio,
        campo === "oraFine" ? valore : aggiornato.oraFine,
      );

      aggiornato.ore = ore || aggiornato.ore;
    }

    setNuovoRapportino(aggiornato);
  };

  const aggiornaCantiere = (cantiereId) => {
    const cantiere = cantieri.find((item) => String(item.id) === cantiereId);

    setNuovoRapportino({
      ...nuovoRapportino,
      cantiereId,
      cantiere: cantiere?.nome || "",
      cliente: cantiere?.cliente || nuovoRapportino.cliente,
      importo: cantiere?.importo || nuovoRapportino.importo,
    });
  };

  const salvaRapportino = async () => {
    if (!nuovoRapportino.commessaNumero || !nuovoRapportino.data) return;

    setErrore("");

    try {
      const payload = {
        ...nuovoRapportino,
        cantiereId: nuovoRapportino.cantiereId ? Number(nuovoRapportino.cantiereId) : null,
        ore: Number(nuovoRapportino.ore || 0),
        importo: Number(nuovoRapportino.importo || 0),
        meteo: "Sereno",
        capocantiere: "",
        mezzi: "",
        materiali: "",
      };

      if (nuovoRapportino.id) {
        const rapportinoAggiornato = await api.put(`/rapportini/${nuovoRapportino.id}`, payload);
        setRapportini((rapportiniAttuali) =>
          rapportiniAttuali.map((rapportino) =>
            rapportino.id === nuovoRapportino.id ? rapportinoAggiornato : rapportino,
          ),
        );
        setMese(normalizzaData(rapportinoAggiornato.data).slice(0, 7));
      } else {
        const rapportinoCreato = await api.post("/rapportini", payload);
        setRapportini((rapportiniAttuali) => [rapportinoCreato, ...rapportiniAttuali]);
        setMese(normalizzaData(rapportinoCreato.data).slice(0, 7));
      }

      setNuovoRapportino(rapportinoVuoto);
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaRapportino = (rapportino) => {
    setNuovoRapportino({
      id: rapportino.id,
      data: normalizzaData(rapportino.data) || oggi(),
      ordineNumero: rapportino.ordineNumero || "",
      commessaNumero: rapportino.commessaNumero || "",
      cliente: rapportino.cliente || "",
      cantiereId: rapportino.cantiereId || "",
      cantiere: rapportino.cantiere || "",
      localita: rapportino.localita || "",
      provincia: rapportino.provincia || "",
      attivita: rapportino.attivita || "",
      oraInizio: rapportino.oraInizio || "08:00",
      oraFine: rapportino.oraFine || "17:00",
      ore: rapportino.ore || "",
      importo: rapportino.importo || "",
      stato: rapportino.stato || "In Corso",
      operai: rapportino.operai || "",
      note: rapportino.note || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetRapportino = () => {
    setNuovoRapportino(rapportinoVuoto);
    setErrore("");
  };

  const eliminaRapportino = async (rapportino) => {
    const conferma = window.confirm(`Eliminare il rapportino della commessa ${rapportino.commessaNumero || ""}?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.delete(`/rapportini/${rapportino.id}`);
      setRapportini((rapportiniAttuali) => rapportiniAttuali.filter((item) => item.id !== rapportino.id));
    } catch (error) {
      setErrore(error.message);
    }
  };

  const rapportiniFiltrati = useMemo(
    () =>
      rapportini.filter((rapportino) => {
        const passaStato = filtroStato === "Tutti" || rapportino.stato === filtroStato;
        const passaRicerca = [
          rapportino.ordineNumero,
          rapportino.commessaNumero,
          rapportino.cliente,
          rapportino.localita,
          rapportino.provincia,
          rapportino.attivita,
          rapportino.stato,
        ]
          .join(" ")
          .toLowerCase()
          .includes(ricerca.toLowerCase());

        return passaStato && passaRicerca;
      }),
    [filtroStato, rapportini, ricerca],
  );

  const rapportiniDelMese = useMemo(
    () => rapportini.filter((rapportino) => normalizzaData(rapportino.data).startsWith(mese)),
    [rapportini, mese],
  );

  const giorni = useMemo(() => giorniDelMese(mese), [mese]);

  const riepilogoMensile = useMemo(() => {
    const mappa = new Map();

    for (const rapportino of rapportiniDelMese) {
      const key = rapportino.commessaNumero || "Senza commessa";
      const data = normalizzaData(rapportino.data);

      if (!mappa.has(key)) {
        mappa.set(key, {
          ordineNumero: rapportino.ordineNumero || "",
          commessaNumero: key,
          cliente: rapportino.cliente || "",
          localita: rapportino.localita || "",
          provincia: rapportino.provincia || "",
          attivita: rapportino.attivita || "",
          importo: Number(rapportino.importo || 0),
          stato: rapportino.stato || "",
          giorni: {},
          totaleOre: 0,
          totaleImporto: 0,
        });
      }

      const riga = mappa.get(key);
      const ore = Number(rapportino.ore || 0);

      riga.giorni[data] = Number(riga.giorni[data] || 0) + ore;
      riga.totaleOre += ore;
      riga.totaleImporto += Number(rapportino.importo || 0);
      riga.stato = rapportino.stato || riga.stato;
    }

    return Array.from(mappa.values()).sort((a, b) => a.commessaNumero.localeCompare(b.commessaNumero));
  }, [rapportiniDelMese]);

  const totali = useMemo(
    () => ({
      rapportini: rapportiniDelMese.length,
      ore: rapportiniDelMese.reduce((totale, rapportino) => totale + Number(rapportino.ore || 0), 0),
      importo: rapportiniDelMese.reduce((totale, rapportino) => totale + Number(rapportino.importo || 0), 0),
      commesse: riepilogoMensile.length,
    }),
    [rapportiniDelMese, riepilogoMensile],
  );

  const esportaGiornaliero = () => {
    scaricaCsv("rapportini_giornalieri.csv", [
      ["Data", "Ordine", "Commessa", "Cliente", "Localita", "Provincia", "Attivita", "Inizio", "Fine", "Ore", "Importo", "Stato"],
      ...rapportiniFiltrati.map((r) => [
        formatDate(r.data),
        r.ordineNumero,
        r.commessaNumero,
        r.cliente,
        r.localita,
        r.provincia,
        r.attivita,
        r.oraInizio,
        r.oraFine,
        r.ore,
        r.importo,
        r.stato,
      ]),
    ]);
  };

  const esportaMensile = () => {
    scaricaCsv(`riepilogo_${mese}.csv`, [
      ["Ordine", "Commessa", "Cliente", "Localita", "Provincia", "Attivita", ...giorni.map((g) => g.giorno), "Totale ore", "Produzione"],
      ...riepilogoMensile.map((riga) => [
        riga.ordineNumero,
        riga.commessaNumero,
        riga.cliente,
        riga.localita,
        riga.provincia,
        riga.attivita,
        ...giorni.map((g) => riga.giorni[g.key] || ""),
        riga.totaleOre,
        riga.totaleImporto,
      ]),
    ]);
  };

  const generaPdfRapportino = async (rapportino) => {
    const doc = new jsPDF();
    let y = 18;

    await disegnaIntestazioneAzienda(doc, y);
    y += 18;
    doc.setFontSize(12);
    doc.text("Rapportino giornaliero lavori", 36, y);
    y += 8;
    doc.setDrawColor(21, 101, 192);
    doc.setLineWidth(0.7);
    doc.line(14, y, 196, y);
    y += 10;

    doc.setFontSize(10);
    [
      ["Data", formatDate(rapportino.data)],
      ["Ordine N.", rapportino.ordineNumero || ""],
      ["Commessa / Chiamata N.", rapportino.commessaNumero || ""],
      ["Cliente", rapportino.cliente || ""],
      ["Cantiere", rapportino.cantiere || ""],
      ["Localita", `${rapportino.localita || ""} ${rapportino.provincia || ""}`.trim()],
      ["Orario", `${rapportino.oraInizio || ""} - ${rapportino.oraFine || ""}`],
      ["Ore", Number(rapportino.ore || 0).toLocaleString("it-IT")],
      ["Produzione", formatEuro(rapportino.importo)],
      ["Stato", rapportino.stato || ""],
      ["Operai / squadra", rapportino.operai || ""],
    ].forEach(([label, value]) => {
      doc.setFont(undefined, "bold");
      doc.text(`${label}:`, 14, y);
      doc.setFont(undefined, "normal");
      doc.text(String(value), 58, y);
      y += 7;
    });

    y += 4;
    doc.setFont(undefined, "bold");
    doc.text("Attivita svolta", 14, y);
    y += 7;
    doc.setFont(undefined, "normal");
    doc.text(doc.splitTextToSize(rapportino.attivita || "", 180), 14, y);
    y += 24;

    doc.setFont(undefined, "bold");
    doc.text("Note operative", 14, y);
    y += 7;
    doc.setFont(undefined, "normal");
    doc.text(doc.splitTextToSize(rapportino.note || "", 180), 14, y);
    y += 24;

    doc.text("Firma responsabile", 14, y);
    doc.line(14, y + 12, 82, y + 12);
    doc.text("Firma cliente / referente", 118, y);
    doc.line(118, y + 12, 196, y + 12);

    doc.save(`rapportino-${rapportino.commessaNumero || rapportino.id}.pdf`);
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
      <h1>Rapportini Lavori</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Rapportini Mese</h3>
          <h2>{totali.rapportini}</h2>
        </div>
        <div style={card}>
          <h3>Ore Eseguite</h3>
          <h2>{totali.ore.toLocaleString("it-IT")}</h2>
        </div>
        <div style={card}>
          <h3>Commesse</h3>
          <h2>{totali.commesse}</h2>
        </div>
        <div style={card}>
          <h3>Produzione</h3>
          <h2>{formatEuro(totali.importo)}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{nuovoRapportino.id ? "Modifica Rapportino Giornaliero" : "Nuovo Rapportino Giornaliero"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
          <input type="date" value={nuovoRapportino.data} onChange={(e) => aggiornaCampo("data", e.target.value)} />
          <input
            placeholder="Ordine N."
            value={nuovoRapportino.ordineNumero}
            onChange={(e) => aggiornaCampo("ordineNumero", e.target.value)}
          />
          <input
            placeholder="Commessa / Chiamata N."
            value={nuovoRapportino.commessaNumero}
            onChange={(e) => aggiornaCampo("commessaNumero", e.target.value)}
          />
          <input
            placeholder="Cliente"
            value={nuovoRapportino.cliente}
            onChange={(e) => aggiornaCampo("cliente", e.target.value)}
          />
          <select value={nuovoRapportino.cantiereId} onChange={(e) => aggiornaCantiere(e.target.value)}>
            <option value="">Collega Cantiere</option>
            {cantieri.map((cantiere) => (
              <option key={cantiere.id} value={cantiere.id}>
                {cantiere.nome}
              </option>
            ))}
          </select>
          <input
            placeholder="Localita"
            value={nuovoRapportino.localita}
            onChange={(e) => aggiornaCampo("localita", e.target.value)}
          />
          <input
            placeholder="Provincia"
            value={nuovoRapportino.provincia}
            onChange={(e) => aggiornaCampo("provincia", e.target.value)}
          />
          <input type="time" value={nuovoRapportino.oraInizio} onChange={(e) => aggiornaCampo("oraInizio", e.target.value)} />
          <input type="time" value={nuovoRapportino.oraFine} onChange={(e) => aggiornaCampo("oraFine", e.target.value)} />
          <input
            type="number"
            placeholder="Ore"
            value={nuovoRapportino.ore}
            onChange={(e) => aggiornaCampo("ore", e.target.value)}
          />
          <input
            type="number"
            placeholder="Importo produzione EUR"
            value={nuovoRapportino.importo}
            onChange={(e) => aggiornaCampo("importo", e.target.value)}
          />
          <select value={nuovoRapportino.stato} onChange={(e) => aggiornaCampo("stato", e.target.value)}>
            {STATI_RAPPORTINO.map((stato) => (
              <option key={stato}>{stato}</option>
            ))}
          </select>
          <input
            placeholder="Operai / squadra"
            value={nuovoRapportino.operai}
            onChange={(e) => aggiornaCampo("operai", e.target.value)}
          />
          <textarea
            placeholder="Attivita svolta"
            value={nuovoRapportino.attivita}
            onChange={(e) => aggiornaCampo("attivita", e.target.value)}
          />
          <textarea
            placeholder="Note chiusura / note operative"
            value={nuovoRapportino.note}
            onChange={(e) => aggiornaCampo("note", e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "15px", flexWrap: "wrap" }}>
          <button onClick={salvaRapportino}>{nuovoRapportino.id ? "Salva Modifiche" : "Salva Rapportino"}</button>
          <button onClick={resetRapportino}>Nuovo / Annulla</button>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>File Giornaliero Rapportini</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)}>
              <option>Tutti</option>
              {STATI_RAPPORTINO.map((stato) => (
                <option key={stato}>{stato}</option>
              ))}
            </select>
            <button onClick={esportaGiornaliero}>Esporta CSV</button>
          </div>
        </div>

        <input
          placeholder="Ricerca per ordine, commessa, cliente, localita o attivita"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          style={{ width: "420px", maxWidth: "100%", marginBottom: "15px" }}
        />

        {caricamento ? (
          <p>Caricamento rapportini...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Ordine</th>
                <th>Commessa</th>
                <th>Cliente</th>
                <th>Localita</th>
                <th>Attivita</th>
                <th>Inizio</th>
                <th>Fine</th>
                <th>Ore</th>
                <th>Importo</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rapportiniFiltrati.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.data)}</td>
                  <td>{r.ordineNumero}</td>
                  <td>{r.commessaNumero}</td>
                  <td>{r.cliente}</td>
                  <td>{r.localita}</td>
                  <td style={{ maxWidth: "360px" }}>{r.attivita}</td>
                  <td>{r.oraInizio}</td>
                  <td>{r.oraFine}</td>
                  <td>{Number(r.ore || 0).toLocaleString("it-IT")}</td>
                  <td>{formatEuro(r.importo)}</td>
                  <td>{r.stato}</td>
                  <td>
                    <button onClick={() => modificaRapportino(r)}>Modifica</button>{" "}
                    <button onClick={() => generaPdfRapportino(r)}>PDF</button>{" "}
                    <button onClick={() => eliminaRapportino(r)}>Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>File Mensile Produzione per Commessa</h2>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input type="month" value={mese} onChange={(e) => setMese(e.target.value)} />
            <button onClick={esportaMensile}>Esporta CSV</button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table width="100%" style={{ minWidth: "1500px", borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Ordine N.</th>
                <th>Commessa N.</th>
                <th>Cliente</th>
                <th>Localita</th>
                <th>Provincia</th>
                {giorni.map((giorno) => (
                  <th key={giorno.key} style={{ background: giorno.festivo ? "#fff200" : "#f8fafc" }}>
                    {giorno.giorno}
                  </th>
                ))}
                <th>Totale Ore</th>
                <th>Produzione</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {riepilogoMensile.map((riga) => (
                <tr key={riga.commessaNumero}>
                  <td>{riga.ordineNumero}</td>
                  <td>{riga.commessaNumero}</td>
                  <td>{riga.cliente}</td>
                  <td>{riga.localita}</td>
                  <td>{riga.provincia}</td>
                  {giorni.map((giorno) => (
                    <td key={giorno.key} style={{ background: giorno.festivo ? "#fff9a6" : undefined }}>
                      {riga.giorni[giorno.key] ? Number(riga.giorni[giorno.key]).toLocaleString("it-IT") : ""}
                    </td>
                  ))}
                  <td>{riga.totaleOre.toLocaleString("it-IT")}</td>
                  <td>{formatEuro(riga.totaleImporto)}</td>
                  <td>{riga.stato}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default GiornaleCantiere;
