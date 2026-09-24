import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import AziendaHeader from "../components/AziendaHeader";

const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const card = {
  background: "#fff",
  border: "1px solid #dbe3ee",
  borderRadius: "10px",
  padding: "16px 18px",
  minHeight: "88px",
  boxShadow: "0 1px 2px rgba(15,23,42,.03)",
};

function numero(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : 0;
}

function normalizzaVoce(riga, index) {
  return {
    id: riga.ID || index + 1,
    tipo: String(riga["TIPO COSTO"] || "").trim(),
    famiglia: String(riga.FAMIGLIA || "").trim(),
    disciplina: String(riga.DISCIPLINA || "").trim(),
    sezione: String(riga.SEZIONE || "").trim(),
    descrizione: String(riga.DESCRIZIONE || "").trim(),
    codice: String(riga.CODICE || "").trim(),
    produttore: String(riga.PRODUTTORE || "").trim(),
    um: String(riga.UM || "").trim(),
    quantita: numero(riga["QUANTITÀ"]),
    prezzoUnitario: numero(riga["PREZZO UNITARIO"]),
    importo: numero(riga.IMPORTO),
    fonte: String(riga["FONTE FOGLIO"] || "").trim(),
    stato: String(riga.STATO || "Da verificare").trim() || "Da verificare",
  };
}

function AnalisiCosti() {
  const inputRef = useRef(null);
  const [fileNome, setFileNome] = useState("");
  const [voci, setVoci] = useState([]);
  const [errore, setErrore] = useState("");
  const [tab, setTab] = useState("voci");
  const [ricerca, setRicerca] = useState("");
  const [sede, setSede] = useState("Vicenza (VI)");
  const [prezzario, setPrezzario] = useState("Regione Veneto / DEI");

  const totali = useMemo(() => {
    const somma = (tipi) =>
      voci
        .filter((voce) => tipi.includes(voce.tipo))
        .reduce((tot, voce) => tot + numero(voce.importo), 0);

    return {
      materiali: somma(["Materiali"]),
      noleggi: somma(["Noleggi", "Attrezzature"]),
      manodopera: somma(["Manodopera"]),
      altri: somma(["Mezzi/Trasferte", "Altri costi"]),
      diretto: voci.reduce((tot, voce) => tot + numero(voce.importo), 0),
      daVerificare: voci.filter((voce) => voce.stato !== "OK").length,
    };
  }, [voci]);

  const vociFiltrate = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    if (!q) return voci;
    return voci.filter((voce) =>
      [voce.descrizione, voce.codice, voce.tipo, voce.sezione, voce.fonte]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [ricerca, voci]);

  const gruppi = useMemo(() => {
    const mappa = new Map();
    for (const voce of voci) {
      const tipo = voce.tipo || "Da classificare";
      const corrente = mappa.get(tipo) || { tipo, voci: 0, totale: 0 };
      corrente.voci += 1;
      corrente.totale += numero(voce.importo);
      mappa.set(tipo, corrente);
    }
    return Array.from(mappa.values()).sort((a, b) => b.totale - a.totale);
  }, [voci]);

  async function caricaFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrore("");

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const foglioNome = workbook.SheetNames.includes("AI_COSTI_IMPORT")
        ? "AI_COSTI_IMPORT"
        : workbook.SheetNames[0];
      const foglio = workbook.Sheets[foglioNome];
      if (!foglio) throw new Error("Nessun foglio leggibile trovato.");

      const righe = XLSX.utils.sheet_to_json(foglio, {
        defval: "",
        range: foglioNome === "AI_COSTI_IMPORT" ? 3 : 0,
      });

      const riconosciute = righe
        .map(normalizzaVoce)
        .filter((voce) => voce.descrizione || voce.codice || voce.importo);

      if (!riconosciute.length) {
        throw new Error("Nessuna voce riconosciuta nel documento.");
      }

      const riepilogo = workbook.Sheets.AI_COSTI_RIEPILOGO;
      if (riepilogo) {
        const sedeFile = riepilogo.B14?.v;
        const prezzarioFile = riepilogo.B7?.v;
        const fonteAlternativa = riepilogo.B8?.v;
        if (sedeFile) setSede(String(sedeFile));
        if (prezzarioFile || fonteAlternativa) {
          setPrezzario([prezzarioFile, fonteAlternativa].filter(Boolean).join(" / "));
        }
      }

      setFileNome(file.name);
      setVoci(riconosciute);
      setTab("voci");
    } catch (error) {
      setVoci([]);
      setFileNome("");
      setErrore(error.message || "Impossibile leggere il documento.");
    } finally {
      event.target.value = "";
    }
  }

  const tabs = [
    ["voci", "Voci di costo"],
    ["dettaglio", "Analisi dettagliata"],
    ["criticita", "Criticità"],
    ["suggerimenti", "Suggerimenti"],
    ["prezzi", "Elenco prezzi"],
  ];

  return (
    <div>
      <AziendaHeader
        titolo="Analisi Costi"
        sottotitolo="Materiali, noli, manodopera, trasferte e criticità"
      />

      <div style={{ background: "#f3f6fa", borderRadius: "12px", padding: "18px" }}>
        <div
          style={{
            background: "#fff",
            border: "1px solid #dbe3ee",
            borderRadius: "10px",
            padding: "13px 16px",
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1.3fr auto",
            gap: "14px",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          <div>
            <strong style={{ color: "#102a43" }}>
              Documento: {fileNome || "nessun documento caricato"}
            </strong>
          </div>
          <div style={{ color: "#52606d" }}>Sede: {sede}</div>
          <div style={{ color: "#52606d" }}>Prezzario: {prezzario}</div>
          <div>
            <button type="button" onClick={() => inputRef.current?.click()}>
              <Upload size={16} style={{ verticalAlign: "middle", marginRight: "7px" }} />
              Carica documento
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv,.ods"
              onChange={caricaFile}
              style={{ display: "none" }}
            />
          </div>
        </div>

        {errore && (
          <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", padding: "12px", borderRadius: "8px", color: "#be123c", marginBottom: "14px" }}>
            {errore}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "14px" }}>
          {[
            ["1. Carica documento", Boolean(fileNome)],
            ["2. Analisi e riconoscimento", voci.length > 0],
            ["3. Dettaglio e criticità", voci.length > 0],
          ].map(([label, completed]) => (
            <div
              key={label}
              style={{
                background: "#fff",
                border: "1px solid #dbe3ee",
                borderLeft: "4px solid #0b63ce",
                borderRadius: "8px",
                padding: "13px",
                color: "#102a43",
                fontWeight: 700,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {label}
              {completed ? <CheckCircle2 size={18} color="#15803d" /> : <span style={{ color: "#94a3b8" }}>—</span>}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "16px" }}>
          {[
            ["Materiali", totali.materiali],
            ["Noleggi / Attrezzature", totali.noleggi],
            ["Manodopera", totali.manodopera],
            ["Altri costi", totali.altri],
          ].map(([label, value]) => (
            <div key={label} style={card}>
              <div style={{ color: "#52606d", fontWeight: 700, fontSize: "13px" }}>{label}</div>
              <div style={{ color: "#102a43", fontWeight: 800, fontSize: "22px", marginTop: "10px" }}>
                {euro.format(value)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "7px", marginBottom: "14px", flexWrap: "wrap" }}>
          {tabs.map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setTab(value)}
              style={{
                border: tab === value ? "1px solid #0b63ce" : "1px solid #dbe3ee",
                background: tab === value ? "#0b63ce" : "#fff",
                color: tab === value ? "#fff" : "#102a43",
                padding: "9px 13px",
                fontWeight: 700,
                borderRadius: "7px",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "voci" && (
          <div style={{ background: "#fff", borderRadius: "10px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
              <h2 style={{ margin: 0 }}>Voci di costo</h2>
              <input
                placeholder="Cerca voce, codice o tipo costo"
                value={ricerca}
                onChange={(e) => setRicerca(e.target.value)}
                style={{ minWidth: "290px" }}
              />
            </div>

            <div style={{ overflowX: "auto", border: "1px solid #dbe3ee", borderRadius: "8px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#edf2f7", color: "#102a43" }}>
                    {["N.", "Descrizione", "U.M.", "Q.tà", "Prezzo unit.", "Importo", "Tipo costo", "Stato"].map((label) => (
                      <th key={label} style={{ padding: "10px", textAlign: label === "Descrizione" ? "left" : "center", borderBottom: "1px solid #dbe3ee", whiteSpace: "nowrap" }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vociFiltrate.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                        Carica il file Analisi Costi per visualizzare le voci.
                      </td>
                    </tr>
                  ) : (
                    vociFiltrate.map((voce, index) => (
                      <tr key={`${voce.id}-${index}`} style={{ borderBottom: "1px solid #eef2f6" }}>
                        <td style={{ padding: "10px", textAlign: "center" }}>{voce.id}</td>
                        <td style={{ padding: "10px", minWidth: "300px" }}>
                          <strong>{voce.descrizione || "-"}</strong>
                          {(voce.codice || voce.sezione) && (
                            <div style={{ color: "#7b8794", fontSize: "12px", marginTop: "3px" }}>
                              {[voce.codice, voce.sezione].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center" }}>{voce.um || "-"}</td>
                        <td style={{ padding: "10px", textAlign: "right" }}>{voce.quantita.toLocaleString("it-IT")}</td>
                        <td style={{ padding: "10px", textAlign: "right", whiteSpace: "nowrap" }}>{euro.format(voce.prezzoUnitario)}</td>
                        <td style={{ padding: "10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{euro.format(voce.importo)}</td>
                        <td style={{ padding: "10px", textAlign: "center" }}>{voce.tipo || "-"}</td>
                        <td style={{ padding: "10px", textAlign: "center" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              borderRadius: "999px",
                              padding: "5px 8px",
                              fontWeight: 700,
                              fontSize: "12px",
                              color: voce.stato === "OK" ? "#166534" : "#92400e",
                              background: voce.stato === "OK" ? "#dcfce7" : "#fef3c7",
                            }}
                          >
                            {voce.stato === "OK" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                            {voce.stato}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "dettaglio" && (
          <div style={{ background: "#fff", borderRadius: "10px", padding: "18px" }}>
            <h2>Analisi dettagliata</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "12px" }}>
              {gruppi.map((gruppo) => (
                <div key={gruppo.tipo} style={card}>
                  <strong>{gruppo.tipo}</strong>
                  <div style={{ color: "#64748b", marginTop: "6px" }}>{gruppo.voci} voci</div>
                  <div style={{ fontSize: "20px", fontWeight: 800, marginTop: "8px" }}>{euro.format(gruppo.totale)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "criticita" && (
          <div style={{ background: "#fff", borderRadius: "10px", padding: "18px" }}>
            <h2>Criticità</h2>
            <p>
              <strong>{totali.daVerificare}</strong> voci richiedono verifica manuale.
            </p>
            {voci.filter((voce) => voce.stato !== "OK").slice(0, 80).map((voce) => (
              <div key={voce.id} style={{ display: "flex", gap: "10px", padding: "9px 0", borderBottom: "1px solid #eef2f6" }}>
                <AlertTriangle size={17} color="#b45309" />
                <span>{voce.descrizione || voce.codice || `Voce ${voce.id}`}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "suggerimenti" && (
          <div style={{ background: "#fff", borderRadius: "10px", padding: "18px" }}>
            <h2>Suggerimenti</h2>
            <p>Completa prima le voci “Da verificare”, controlla prezzi nulli e quantità pari a zero, quindi confronta i valori con il prezzario selezionato.</p>
            <p>Costo diretto rilevato: <strong>{euro.format(totali.diretto)}</strong>.</p>
          </div>
        )}

        {tab === "prezzi" && (
          <div style={{ background: "#fff", borderRadius: "10px", padding: "18px" }}>
            <h2>Elenco prezzi</h2>
            <p>Riferimento attivo: <strong>{prezzario}</strong>.</p>
            <p>La consultazione delle voci ufficiali resta disponibile nella pagina “Elenco Prezzi”.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalisiCosti;
