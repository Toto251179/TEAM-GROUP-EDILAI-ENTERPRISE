import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const oggi = () => new Date().toISOString().split("T")[0];

function normalizzaData(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatEuro(value) {
  return `EUR ${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function statoMargine(margine) {
  if (margine >= 20) return { label: "Buono", color: "#1f8a4c", bg: "#dcfce7" };
  if (margine >= 10) return { label: "Da seguire", color: "#b7791f", bg: "#fef3c7" };
  return { label: "Critico", color: "#c62828", bg: "#fee2e2" };
}

function chiaveCantiere(item) {
  return item.cantiereId ? `id:${item.cantiereId}` : `nome:${item.cantiere || ""}`;
}

function chiaveDaCantiere(cantiere) {
  return `id:${cantiere.id}`;
}

function ControlloCantieri() {
  const [cantieri, setCantieri] = useState([]);
  const [rapportini, setRapportini] = useState([]);
  const [movimenti, setMovimenti] = useState([]);
  const [fatture, setFatture] = useState([]);
  const [sal, setSal] = useState([]);
  const [mese, setMese] = useState(oggi().slice(0, 7));
  const [ricerca, setRicerca] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaDati() {
      try {
        const [cantieriDb, rapportiniDb, movimentiDb, fattureDb, salDb] = await Promise.all([
          api.get("/cantieri"),
          api.get("/rapportini"),
          api.get("/contabilita"),
          api.get("/fatture"),
          api.get("/sal"),
        ]);

        if (componenteAttivo) {
          setCantieri(cantieriDb);
          setRapportini(rapportiniDb);
          setMovimenti(movimentiDb);
          setFatture(fattureDb);
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

  const datiCantieri = useMemo(() => {
    const rapportiniMese = rapportini.filter((r) => normalizzaData(r.data).startsWith(mese));
    const movimentiMese = movimenti.filter((m) => normalizzaData(m.data).startsWith(mese));
    const fattureMese = fatture.filter((f) => normalizzaData(f.data).startsWith(mese));
    const salMese = sal.filter((s) => normalizzaData(s.data).startsWith(mese));

    return cantieri.map((cantiere) => {
      const key = chiaveDaCantiere(cantiere);
      const nomeKey = `nome:${cantiere.nome || ""}`;
      const matchKey = (item) => chiaveCantiere(item) === key || chiaveCantiere(item) === nomeKey;

      const rapportiniCantiere = rapportiniMese.filter(matchKey);
      const movimentiCantiere = movimentiMese.filter(matchKey);
      const fattureCantiere = fattureMese.filter(matchKey);
      const salCantiere = salMese.filter(matchKey);

      const contratto = Number(cantiere.importo || 0);
      const ore = rapportiniCantiere.reduce((totale, r) => totale + Number(r.ore || 0), 0);
      const produzioneRapportini = rapportiniCantiere.reduce((totale, r) => totale + Number(r.importo || 0), 0);
      const entrate = movimentiCantiere
        .filter((m) => m.tipo === "Entrata")
        .reduce((totale, m) => totale + Number(m.importo || 0), 0);
      const uscite = movimentiCantiere
        .filter((m) => m.tipo === "Uscita")
        .reduce((totale, m) => totale + Number(m.importo || 0), 0);
      const fatturato = fattureCantiere
        .filter((f) => f.tipo === "Attiva")
        .reduce((totale, f) => totale + Number(f.importo || 0), 0);
      const fatturePassive = fattureCantiere
        .filter((f) => f.tipo === "Passiva")
        .reduce((totale, f) => totale + Number(f.importo || 0), 0);
      const salMaturato = salCantiere.reduce((totale, s) => totale + Number(s.maturato || 0), 0);
      const costi = uscite + fatturePassive;
      const ricavi = produzioneRapportini + entrate + fatturato;
      const utile = ricavi - costi;
      const margine = ricavi > 0 ? (utile / ricavi) * 100 : 0;
      const avanzamento = contratto > 0 ? Math.min(100, (Math.max(produzioneRapportini, salMaturato) / contratto) * 100) : 0;
      const ultimoRapportino = rapportiniCantiere
        .slice()
        .sort((a, b) => normalizzaData(b.data).localeCompare(normalizzaData(a.data)))[0];
      const stato = statoMargine(margine);

      return {
        id: cantiere.id,
        nome: cantiere.nome,
        cliente: cantiere.cliente,
        statoCantiere: cantiere.stato,
        contratto,
        ore,
        produzioneRapportini,
        salMaturato,
        ricavi,
        costi,
        utile,
        margine,
        avanzamento,
        rapportini: rapportiniCantiere.length,
        fatturato,
        ultimoRapportino: ultimoRapportino ? normalizzaData(ultimoRapportino.data) : "",
        stato,
      };
    });
  }, [cantieri, rapportini, movimenti, fatture, sal, mese]);

  const datiFiltrati = useMemo(
    () =>
      datiCantieri.filter((c) =>
        [c.nome, c.cliente, c.statoCantiere, c.stato.label]
          .join(" ")
          .toLowerCase()
          .includes(ricerca.toLowerCase()),
      ),
    [datiCantieri, ricerca],
  );

  const totali = useMemo(
    () => ({
      cantieri: datiFiltrati.length,
      ore: datiFiltrati.reduce((totale, c) => totale + c.ore, 0),
      produzione: datiFiltrati.reduce((totale, c) => totale + c.produzioneRapportini, 0),
      ricavi: datiFiltrati.reduce((totale, c) => totale + c.ricavi, 0),
      costi: datiFiltrati.reduce((totale, c) => totale + c.costi, 0),
      utile: datiFiltrati.reduce((totale, c) => totale + c.utile, 0),
      critici: datiFiltrati.filter((c) => c.stato.label === "Critico").length,
    }),
    [datiFiltrati],
  );

  const margineTotale = totali.ricavi > 0 ? (totali.utile / totali.ricavi) * 100 : 0;

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <div>
      <h1>Controllo Cantieri</h1>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "20px" }}>
        <input
          placeholder="Ricerca cantiere, cliente o stato"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          style={{ width: "380px", maxWidth: "100%" }}
        />
        <input type="month" value={mese} onChange={(e) => setMese(e.target.value)} />
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Cantieri</h3>
          <h2>{totali.cantieri}</h2>
        </div>
        <div style={card}>
          <h3>Ore Rapportini</h3>
          <h2>{totali.ore.toLocaleString("it-IT")}</h2>
        </div>
        <div style={card}>
          <h3>Produzione</h3>
          <h2>{formatEuro(totali.produzione)}</h2>
        </div>
        <div style={card}>
          <h3>Ricavi</h3>
          <h2>{formatEuro(totali.ricavi)}</h2>
        </div>
        <div style={card}>
          <h3>Costi</h3>
          <h2>{formatEuro(totali.costi)}</h2>
        </div>
        <div style={{ ...card, background: totali.utile >= 0 ? "#dcfce7" : "#fee2e2" }}>
          <h3>Utile</h3>
          <h2>{formatEuro(totali.utile)}</h2>
        </div>
        <div style={card}>
          <h3>Margine</h3>
          <h2>{formatPercent(margineTotale)}</h2>
        </div>
        <div style={{ ...card, background: totali.critici ? "#fee2e2" : "white" }}>
          <h3>Critici</h3>
          <h2>{totali.critici}</h2>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <h2>Dettaglio Controllo per Cantiere</h2>

        {caricamento ? (
          <p>Caricamento controllo cantieri...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Cantiere</th>
                <th>Cliente</th>
                <th>Stato</th>
                <th>Contratto</th>
                <th>Ore</th>
                <th>Produzione</th>
                <th>SAL</th>
                <th>Ricavi</th>
                <th>Costi</th>
                <th>Utile</th>
                <th>Margine</th>
                <th>Avanz.</th>
                <th>Ultimo Rap.</th>
                <th>Allarme</th>
              </tr>
            </thead>

            <tbody>
              {datiFiltrati.map((c) => (
                <tr key={c.id}>
                  <td style={{ textAlign: "left", fontWeight: 700 }}>{c.nome}</td>
                  <td>{c.cliente}</td>
                  <td>{c.statoCantiere}</td>
                  <td>{formatEuro(c.contratto)}</td>
                  <td>{c.ore.toLocaleString("it-IT")}</td>
                  <td>{formatEuro(c.produzioneRapportini)}</td>
                  <td>{formatEuro(c.salMaturato)}</td>
                  <td>{formatEuro(c.ricavi)}</td>
                  <td>{formatEuro(c.costi)}</td>
                  <td style={{ color: c.utile >= 0 ? "#1f8a4c" : "#c62828", fontWeight: 800 }}>
                    {formatEuro(c.utile)}
                  </td>
                  <td style={{ color: c.stato.color, fontWeight: 800 }}>{formatPercent(c.margine)}</td>
                  <td>
                    <div style={{ minWidth: "90px" }}>
                      <div style={{ height: "8px", background: "#e5e7eb", borderRadius: "999px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${c.avanzamento}%`,
                            background: "#1565c0",
                          }}
                        />
                      </div>
                      <small>{formatPercent(c.avanzamento)}</small>
                    </div>
                  </td>
                  <td>{c.ultimoRapportino || "-"}</td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        borderRadius: "999px",
                        padding: "5px 9px",
                        color: c.stato.color,
                        background: c.stato.bg,
                        fontWeight: 800,
                      }}
                    >
                      {c.stato.label}
                    </span>
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

export default ControlloCantieri;
