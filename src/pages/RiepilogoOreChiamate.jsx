import { useEffect, useMemo, useState } from "react";
import { chiamateTecniciService } from "../services/chiamateTecniciService";
import { operaiService } from "../services/operaiService";
import { squadreService } from "../services/squadreService";

const COSTO_ORARIO = 28;

function oggiIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizzaData(value) {
  if (!value) return "";
  const testo = String(value).trim();
  const matchIt = testo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchIt) {
    const [, giorno, mese, anno] = matchIt;
    return `${anno}-${mese.padStart(2, "0")}-${giorno.padStart(2, "0")}`;
  }
  const parsed = new Date(testo);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return testo.slice(0, 10);
}

function toNumber(value) {
  const numero = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

function formatEuro(value) {
  return `${Number(value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function RiepilogoOreChiamate() {
  const [chiamate, setChiamate] = useState([]);
  const [operai, setOperai] = useState([]);
  const [squadre, setSquadre] = useState([]);
  const [data, setData] = useState(oggiIso());

  const caricaDati = () => {
    setChiamate(chiamateTecniciService.lista());
    setOperai(operaiService.lista());
    setSquadre(squadreService.lista());
  };

  useEffect(() => {
    caricaDati();
    window.addEventListener("teamGroupDataChanged", caricaDati);
    return () => window.removeEventListener("teamGroupDataChanged", caricaDati);
  }, []);

  const operaioById = useMemo(() => Object.fromEntries(operai.map((operaio) => [operaio.id, operaio])), [operai]);
  const squadraById = useMemo(() => Object.fromEntries(squadre.map((squadra) => [squadra.id, squadra])), [squadre]);

  const righe = useMemo(() => {
    const result = [];
    for (const chiamata of chiamate) {
      const dataChiamata = normalizzaData(chiamata.oraFine || chiamata.dataApertura);
      if (data && dataChiamata !== data) continue;

      const dipendenti = Array.isArray(chiamata.datiChiusura?.dipendenti) ? chiamata.datiChiusura.dipendenti : [];
      for (const riga of dipendenti) {
        const operaio = operaioById[riga.dipendenteId] || {};
        const ore = toNumber(riga.ore);
        const totale = ore * COSTO_ORARIO;
        result.push({
          data: dataChiamata,
          numero: chiamata.numero,
          cliente: chiamata.clienteAssociato || chiamata.cliente || "Cliente da associare",
          squadra: squadraById[chiamata.squadraId]?.nomeSquadra || "Non assegnata",
          dipendente: [operaio.nome, operaio.cognome].filter(Boolean).join(" ") || riga.nome || "Dipendente",
          ore,
          costoOrario: COSTO_ORARIO,
          totale,
        });
      }
    }
    return result;
  }, [chiamate, data, operaioById, squadraById]);

  const totaliChiamata = useMemo(() => {
    const map = new Map();
    for (const riga of righe) {
      const key = riga.numero;
      const corrente = map.get(key) || { label: key, ore: 0, totale: 0 };
      corrente.ore += riga.ore;
      corrente.totale += riga.totale;
      map.set(key, corrente);
    }
    return Array.from(map.values());
  }, [righe]);

  const totaliSquadra = useMemo(() => {
    const map = new Map();
    for (const riga of righe) {
      const corrente = map.get(riga.squadra) || { label: riga.squadra, ore: 0, totale: 0 };
      corrente.ore += riga.ore;
      corrente.totale += riga.totale;
      map.set(riga.squadra, corrente);
    }
    return Array.from(map.values());
  }, [righe]);

  const totaliDipendente = useMemo(() => {
    const map = new Map();
    for (const riga of righe) {
      const corrente = map.get(riga.dipendente) || { label: riga.dipendente, ore: 0, totale: 0 };
      corrente.ore += riga.ore;
      corrente.totale += riga.totale;
      map.set(riga.dipendente, corrente);
    }
    return Array.from(map.values());
  }, [righe]);

  const totaleGiorno = useMemo(
    () => ({
      ore: righe.reduce((totale, riga) => totale + riga.ore, 0),
      totale: righe.reduce((totale, riga) => totale + riga.totale, 0),
    }),
    [righe],
  );

  const SummaryTable = ({ title, rows }) => (
    <section style={{ background: "white", borderRadius: "8px", padding: "18px", boxShadow: "var(--enterprise-shadow)" }}>
      <h2>{title}</h2>
      <table width="100%">
        <thead>
          <tr>
            <th>Voce</th>
            <th>Totale ore</th>
            <th>Totale EUR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.ore.toLocaleString("it-IT")}</td>
              <td>{formatEuro(row.totale)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan="3" style={{ color: "var(--enterprise-muted)" }}>Nessun dato.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );

  return (
    <div>
      <h1>Riepilogo ore chiamate</h1>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginBottom: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" }}>
          <label>
            Data
            <input type="date" value={data} onChange={(event) => setData(event.target.value)} />
          </label>
          <strong>Totale giorno: {totaleGiorno.ore.toLocaleString("it-IT")} ore - {formatEuro(totaleGiorno.totale)}</strong>
        </div>
      </section>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginBottom: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <h2>Dettaglio ore</h2>
        <table width="100%">
          <thead>
            <tr>
              <th>Data</th>
              <th>Numero chiamata</th>
              <th>Cliente</th>
              <th>Squadra</th>
              <th>Dipendente</th>
              <th>Ore lavorate</th>
              <th>Costo orario</th>
              <th>Totale manodopera</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((riga, index) => (
              <tr key={`${riga.numero}-${riga.dipendente}-${index}`}>
                <td>{riga.data || "-"}</td>
                <td><strong>{riga.numero}</strong></td>
                <td>{riga.cliente}</td>
                <td>{riga.squadra}</td>
                <td>{riga.dipendente}</td>
                <td>{riga.ore.toLocaleString("it-IT")}</td>
                <td>{formatEuro(riga.costoOrario)}</td>
                <td><strong>{formatEuro(riga.totale)}</strong></td>
              </tr>
            ))}
            {!righe.length && (
              <tr>
                <td colSpan="8" style={{ color: "var(--enterprise-muted)", padding: "18px" }}>
                  Nessun rapportino chiuso per la data selezionata.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "18px" }}>
        <SummaryTable title="Totale per chiamata" rows={totaliChiamata} />
        <SummaryTable title="Totale per squadra" rows={totaliSquadra} />
        <SummaryTable title="Totale per dipendente" rows={totaliDipendente} />
      </div>
    </div>
  );
}

export default RiepilogoOreChiamate;
