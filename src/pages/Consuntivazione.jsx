import { useEffect, useMemo, useState } from "react";
import { consuntivazioniService } from "../services/consuntivazioniService";

function formatEuro(value) {
  return `${Number(value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function Consuntivazione() {
  const [consuntivazioni, setConsuntivazioni] = useState([]);
  const [stato, setStato] = useState("DA CONSUNTIVARE");

  const caricaDati = () => {
    setConsuntivazioni(consuntivazioniService.lista());
  };

  useEffect(() => {
    caricaDati();
    window.addEventListener("teamGroupDataChanged", caricaDati);
    return () => window.removeEventListener("teamGroupDataChanged", caricaDati);
  }, []);

  const righe = useMemo(
    () => consuntivazioni.filter((voce) => stato === "TUTTE" || voce.stato === stato),
    [consuntivazioni, stato],
  );

  const totali = useMemo(
    () => ({
      costoDiretto: righe.reduce((totale, voce) => totale + Number(voce.costoDiretto ?? voce.totaleCostoInterno ?? 0), 0),
      speseGenerali: righe.reduce((totale, voce) => totale + Number(voce.speseGenerali || 0), 0),
      costoAzienda: righe.reduce((totale, voce) => totale + Number(voce.totaleCostoAzienda || 0), 0),
      margine: righe.reduce((totale, voce) => totale + Number(voce.margineAzienda ?? voce.margine ?? 0), 0),
      totaleConsuntivo: righe.reduce((totale, voce) => totale + Number(voce.totaleConsuntivo ?? voce.importoDaFatturare ?? 0), 0),
    }),
    [righe],
  );

  return (
    <div>
      <h1>Consuntivazione lavori</h1>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", marginBottom: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "end", flexWrap: "wrap" }}>
          <label>
            Stato
            <select value={stato} onChange={(event) => setStato(event.target.value)}>
              <option value="DA CONSUNTIVARE">Da consuntivare</option>
              <option value="TUTTE">Tutte</option>
            </select>
          </label>
          <strong>{righe.length} consuntivazioni</strong>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "12px", marginBottom: "18px" }}>
        {[
          ["Costo diretto", totali.costoDiretto],
          ["Spese generali", totali.speseGenerali],
          ["Costo azienda", totali.costoAzienda],
          ["Margine", totali.margine],
          ["Totale consuntivo", totali.totaleConsuntivo],
        ].map(([label, value]) => (
          <div key={label} style={{ background: "white", borderRadius: "8px", padding: "14px", boxShadow: "var(--enterprise-shadow)" }}>
            <small>{label}</small>
            <h2 style={{ margin: "6px 0 0" }}>{formatEuro(value)}</h2>
          </div>
        ))}
      </section>

      <section style={{ background: "white", borderRadius: "8px", padding: "18px", boxShadow: "var(--enterprise-shadow)" }}>
        <h2>Elenco consuntivazioni</h2>
        <table width="100%">
          <thead>
            <tr>
              <th>Chiamata</th>
              <th>Cliente</th>
              <th>Descrizione</th>
              <th>Manodopera</th>
              <th>Materiali</th>
              <th>DDT</th>
              <th>Percorso</th>
              <th>Costo diretto</th>
              <th>Spese generali 20%</th>
              <th>Costo azienda</th>
              <th>Margine</th>
              <th>Totale consuntivo</th>
              <th>Trasforma</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((voce) => (
              <tr key={voce.id}>
                <td><strong>{voce.numeroChiamata}</strong><br /><small>{voce.stato}</small></td>
                <td>{voce.cliente || "Cliente da associare"}<br /><small>{voce.idCliente || "-"}</small></td>
                <td>{voce.descrizione || "-"}</td>
                <td>{formatEuro(voce.costoManodopera)}</td>
                <td>
                  {formatEuro(voce.costoMateriali)}
                  {Array.isArray(voce.materiali) && voce.materiali.length > 0 && (
                    <div style={{ marginTop: "6px", fontSize: "12px", textAlign: "left" }}>
                      {voce.materiali.slice(0, 4).map((materiale, index) => (
                        <div key={`${materiale.numeroDdt || "mat"}-${index}`}>
                          {materiale.codiceMateriale || "-"} - {materiale.materiale || materiale.descrizione || "-"} ({materiale.quantita || 0} x {formatEuro(materiale.prezzoUnitario)})
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {Array.isArray(voce.ddtAllegati) && voce.ddtAllegati.length ? voce.ddtAllegati.map((ddt) => (
                    <div key={`${ddt.numeroDdt}-${ddt.dataDdt}`}>
                      <strong>{ddt.numeroDdt}</strong><br />
                      <small>{ddt.dataDdt || "-"} - {ddt.fornitore || "-"}</small><br />
                      {ddt.allegato?.dataUrl ? <a href={ddt.allegato.dataUrl} download={ddt.allegato.nomeFile}>Apri DDT</a> : null}
                    </div>
                  )) : "-"}
                </td>
                <td>{formatEuro(voce.costoPercorso)}</td>
                <td>{formatEuro(voce.costoDiretto ?? voce.totaleCostoInterno)}</td>
                <td>{formatEuro(voce.speseGenerali)}</td>
                <td>{formatEuro(voce.totaleCostoAzienda)}</td>
                <td>{formatEuro(voce.margineAzienda ?? voce.margine)}<br /><small>{voce.marginePercentuale || "-"}%</small></td>
                <td><strong>{formatEuro(voce.totaleConsuntivo ?? voce.importoDaFatturare)}</strong></td>
                <td>{(voce.trasformabileIn || ["Preventivo", "Fattura", "Report economico"]).join(", ")}</td>
              </tr>
            ))}
            {!righe.length && (
              <tr>
                <td colSpan="13" style={{ color: "var(--enterprise-muted)", padding: "18px" }}>
                  Nessuna consuntivazione visibile. Chiudi una chiamata dal rapportino tecnico per crearla automaticamente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default Consuntivazione;
