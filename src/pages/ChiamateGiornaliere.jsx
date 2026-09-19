import { useEffect, useMemo, useState } from "react";
import { chiamateTecniciService } from "../services/chiamateTecniciService";
import { squadreService } from "../services/squadreService";

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

function dataChiamata(chiamata) {
  return normalizzaData(chiamata.oraFine || chiamata.oraArrivo || chiamata.dataApertura);
}

function generaGoogleMapsLink(chiamata) {
  if (chiamata.linkGoogleMaps) return chiamata.linkGoogleMaps;
  const query = [chiamata.indirizzoCompleto || chiamata.indirizzo, chiamata.comune, chiamata.provincia]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query).replace(/%20/g, "+")}` : "";
}

function ChiamateGiornaliere() {
  const [chiamate, setChiamate] = useState([]);
  const [squadre, setSquadre] = useState([]);
  const [data, setData] = useState(oggiIso());
  const [squadraId, setSquadraId] = useState("TUTTE");

  const caricaDati = () => {
    setChiamate(chiamateTecniciService.lista());
    setSquadre(squadreService.lista());
  };

  useEffect(() => {
    caricaDati();
    window.addEventListener("teamGroupDataChanged", caricaDati);
    return () => window.removeEventListener("teamGroupDataChanged", caricaDati);
  }, []);

  const squadraById = useMemo(() => Object.fromEntries(squadre.map((squadra) => [squadra.id, squadra])), [squadre]);

  const chiamateFiltrate = useMemo(
    () =>
      chiamate.filter((chiamata) => {
        const assegnata = chiamata.squadraId && (chiamata.statoAssegnazione || "ASSEGNATO") !== "DA ASSEGNARE";
        const passaData = !data || dataChiamata(chiamata) === data;
        const passaSquadra = squadraId === "TUTTE" || chiamata.squadraId === squadraId;
        return assegnata && passaData && passaSquadra;
      }),
    [chiamate, data, squadraId],
  );

  const gruppi = useMemo(() => {
    const map = new Map();
    for (const chiamata of chiamateFiltrate) {
      const squadra = squadraById[chiamata.squadraId]?.nomeSquadra || "Squadra non trovata";
      if (!map.has(squadra)) map.set(squadra, []);
      map.get(squadra).push(chiamata);
    }
    return Array.from(map.entries());
  }, [chiamateFiltrate, squadraById]);

  return (
    <div>
      <h1>Chiamate giornaliere squadre</h1>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginBottom: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "end" }}>
          <label>
            Data
            <input type="date" value={data} onChange={(event) => setData(event.target.value)} />
          </label>
          <label>
            Squadra
            <select value={squadraId} onChange={(event) => setSquadraId(event.target.value)}>
              <option value="TUTTE">Tutte</option>
              {squadre.map((squadra) => (
                <option key={squadra.id} value={squadra.id}>{squadra.nomeSquadra}</option>
              ))}
            </select>
          </label>
          <strong>{chiamateFiltrate.length} chiamate assegnate</strong>
        </div>
      </section>

      {gruppi.map(([squadra, righe]) => (
        <section key={squadra} style={{ background: "white", borderRadius: "8px", padding: "18px", marginBottom: "18px", boxShadow: "var(--enterprise-shadow)" }}>
          <h2>{squadra}</h2>
          <table width="100%">
            <thead>
              <tr>
                <th>Data</th>
                <th>Squadra</th>
                <th>Numero chiamata</th>
                <th>Cliente</th>
                <th>Indirizzo</th>
                <th>Descrizione</th>
                <th>Stato</th>
                <th>Posizione Google Maps</th>
                <th>Rapportino</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((chiamata) => {
                const maps = generaGoogleMapsLink(chiamata);
                return (
                  <tr key={chiamata.id}>
                    <td>{dataChiamata(chiamata) || "-"}</td>
                    <td>{squadra}</td>
                    <td><strong>{chiamata.numero}</strong></td>
                    <td>{chiamata.clienteAssociato || chiamata.cliente || "Cliente da associare"}</td>
                    <td>{chiamata.indirizzo || "-"}</td>
                    <td>{chiamata.descrizione || "-"}</td>
                    <td>{chiamata.stato || "-"}</td>
                    <td>{maps ? <a href={maps} target="_blank" rel="noreferrer">Posizione</a> : "-"}</td>
                    <td>{chiamata.rapportino || chiamata.datiChiusura?.rapportino || "Non compilato"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {!gruppi.length && (
        <section style={{ background: "white", borderRadius: "8px", padding: "18px", boxShadow: "var(--enterprise-shadow)", color: "var(--enterprise-muted)" }}>
          Nessuna chiamata assegnata per i filtri selezionati.
        </section>
      )}
    </div>
  );
}

export default ChiamateGiornaliere;
