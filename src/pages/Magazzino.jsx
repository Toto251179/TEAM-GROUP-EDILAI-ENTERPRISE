import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "../services/api";
import { disegnaIntestazioneAzienda } from "../utils/pdfAzienda";

const CATEGORIE = ["Materiali Edili", "Ferramenta", "Impianti", "Finiture", "DPI", "Attrezzature", "Altro"];

const materialeVuoto = {
  id: null,
  codice: "",
  descrizione: "",
  categoria: "Materiali Edili",
  unita: "pz",
  quantita: "",
  costo: "",
  scortaMinima: 10,
};

function formatEuro(value) {
  return `EUR ${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function generaCodiceMateriale(materiali) {
  const progressivi = materiali
    .map((materiale) => materiale.codice || "")
    .filter((codice) => codice.startsWith("MAT-"))
    .map((codice) => Number(codice.replace("MAT-", "")))
    .filter((numero) => !Number.isNaN(numero));
  const prossimo = progressivi.length ? Math.max(...progressivi) + 1 : 1;

  return `MAT-${String(prossimo).padStart(4, "0")}`;
}

function Magazzino() {
  const [materiali, setMateriali] = useState([]);
  const [movimentiDdt, setMovimentiDdt] = useState([]);
  const [ricerca, setRicerca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("Tutte");
  const [soloSottoScorta, setSoloSottoScorta] = useState(false);
  const [form, setForm] = useState(materialeVuoto);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaMateriali() {
      try {
        const dati = await api.get("/magazzino");
        if (componenteAttivo) {
          setMateriali(dati);
          setMovimentiDdt(JSON.parse(localStorage.getItem("teamGroup.magazzinoDdt") || "[]"));
          setForm((corrente) => ({ ...corrente, codice: generaCodiceMateriale(dati) }));
        }
      } catch (error) {
        if (componenteAttivo) setErrore(error.message);
      } finally {
        if (componenteAttivo) setCaricamento(false);
      }
    }

    caricaMateriali();

    return () => {
      componenteAttivo = false;
    };
  }, []);

  useEffect(() => {
    const aggiornaDdt = () => setMovimentiDdt(JSON.parse(localStorage.getItem("teamGroup.magazzinoDdt") || "[]"));
    window.addEventListener("teamGroupDataChanged", aggiornaDdt);
    return () => window.removeEventListener("teamGroupDataChanged", aggiornaDdt);
  }, []);

  const materialiFiltrati = useMemo(
    () =>
      materiali.filter((materiale) => {
        const testo = [materiale.codice, materiale.descrizione, materiale.categoria, materiale.unita]
          .join(" ")
          .toLowerCase();
        const passaRicerca = testo.includes(ricerca.toLowerCase());
        const passaCategoria = filtroCategoria === "Tutte" || materiale.categoria === filtroCategoria;
        const passaScorta =
          !soloSottoScorta || Number(materiale.quantita || 0) <= Number(materiale.scortaMinima || 0);

        return passaRicerca && passaCategoria && passaScorta;
      }),
    [filtroCategoria, materiali, ricerca, soloSottoScorta],
  );

  const riepilogo = useMemo(() => {
    const valore = materialiFiltrati.reduce(
      (totale, materiale) => totale + Number(materiale.quantita || 0) * Number(materiale.costo || 0),
      0,
    );
    const sottoScorta = materialiFiltrati.filter(
      (materiale) => Number(materiale.quantita || 0) <= Number(materiale.scortaMinima || 0),
    ).length;

    return {
      articoli: materialiFiltrati.length,
      valore,
      sottoScorta,
      quantitaTotale: materialiFiltrati.reduce((totale, materiale) => totale + Number(materiale.quantita || 0), 0),
    };
  }, [materialiFiltrati]);

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const resetForm = () => {
    setForm({
      ...materialeVuoto,
      codice: generaCodiceMateriale(materiali),
    });
    setErrore("");
  };

  const salvaMateriale = async () => {
    if (!form.descrizione) {
      setErrore("Inserisci la descrizione del materiale.");
      return;
    }

    setErrore("");

    const payload = {
      codice: form.codice || generaCodiceMateriale(materiali),
      descrizione: form.descrizione,
      categoria: form.categoria,
      unita: form.unita,
      quantita: Number(form.quantita || 0),
      costo: Number(form.costo || 0),
      scortaMinima: Number(form.scortaMinima || 0),
    };

    try {
      if (form.id) {
        const aggiornato = await api.put(`/magazzino/${form.id}`, payload);
        setMateriali((attuali) => attuali.map((materiale) => (materiale.id === form.id ? aggiornato : materiale)));
      } else {
        const creato = await api.post("/magazzino", payload);
        setMateriali((attuali) => [...attuali, creato]);
      }

      resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaMateriale = (materiale) => {
    setForm({
      id: materiale.id,
      codice: materiale.codice || "",
      descrizione: materiale.descrizione || "",
      categoria: materiale.categoria || "Materiali Edili",
      unita: materiale.unita || "pz",
      quantita: materiale.quantita || "",
      costo: materiale.costo || "",
      scortaMinima: materiale.scortaMinima || 0,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminaMateriale = async (materiale) => {
    const conferma = window.confirm(`Eliminare il materiale ${materiale.codice} - ${materiale.descrizione}?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.delete(`/magazzino/${materiale.id}`);
      setMateriali((attuali) => attuali.filter((item) => item.id !== materiale.id));
      if (form.id === materiale.id) resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const registraMovimento = async (materiale, tipo) => {
    const quantita = Number(window.prompt(`Quantita da ${tipo === "Carico" ? "caricare" : "scaricare"}`));
    if (!quantita) return;

    const note = window.prompt("Note movimento", tipo === "Carico" ? "Carico magazzino" : "Scarico magazzino");

    setErrore("");

    try {
      const result = await api.post(`/magazzino/${materiale.id}/movimenti`, { tipo, quantita, note });
      setMateriali((attuali) =>
        attuali.map((item) =>
          item.id === materiale.id
            ? {
                ...item,
                ...result.materiale,
              }
            : item,
        ),
      );
    } catch (error) {
      setErrore(error.message);
    }
  };

  const esportaMagazzino = () => {
    esportaCsv(
      `magazzino-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Codice", "Descrizione", "Categoria", "UM", "Quantita", "Costo", "Valore", "Scorta minima"],
      materialiFiltrati.map((materiale) => [
        materiale.codice,
        materiale.descrizione,
        materiale.categoria,
        materiale.unita,
        materiale.quantita,
        materiale.costo,
        Number(materiale.quantita || 0) * Number(materiale.costo || 0),
        materiale.scortaMinima,
      ]),
    );
  };

  const generaPdfMagazzino = async () => {
    const doc = new jsPDF();

    await disegnaIntestazioneAzienda(doc, 18);
    doc.setFontSize(12);
    doc.text("Inventario Magazzino", 36, 36);
    doc.setDrawColor(21, 101, 192);
    doc.setLineWidth(0.7);
    doc.line(14, 34, 196, 34);

    autoTable(doc, {
      startY: 42,
      head: [["Codice", "Materiale", "Categoria", "UM", "Q.ta", "Costo", "Valore", "Scorta"]],
      body: materialiFiltrati.map((materiale) => [
        materiale.codice,
        materiale.descrizione,
        materiale.categoria,
        materiale.unita,
        Number(materiale.quantita || 0).toLocaleString("it-IT"),
        formatEuro(materiale.costo),
        formatEuro(Number(materiale.quantita || 0) * Number(materiale.costo || 0)),
        Number(materiale.scortaMinima || 0).toLocaleString("it-IT"),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [21, 101, 192],
        textColor: 255,
        fontStyle: "bold",
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: "linebreak",
      },
      margin: { left: 14, right: 14 },
    });

    const y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.text(`Valore magazzino: ${formatEuro(riepilogo.valore)}`, 120, y);
    doc.text(`Articoli sotto scorta: ${riepilogo.sottoScorta}`, 120, y + 8);
    doc.save("inventario-magazzino.pdf");
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
      <h1>Magazzino PRO</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Articoli</h3>
          <h2>{riepilogo.articoli}</h2>
        </div>
        <div style={card}>
          <h3>Valore Magazzino</h3>
          <h2>{formatEuro(riepilogo.valore)}</h2>
        </div>
        <div style={card}>
          <h3>Sotto Scorta</h3>
          <h2>{riepilogo.sottoScorta}</h2>
        </div>
        <div style={card}>
          <h3>Quantita Totale</h3>
          <h2>{riepilogo.quantitaTotale.toLocaleString("it-IT")}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica Materiale" : "Nuovo Materiale"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
          <input placeholder="Codice" value={form.codice} onChange={(e) => aggiornaForm("codice", e.target.value)} />
          <input
            placeholder="Descrizione"
            value={form.descrizione}
            onChange={(e) => aggiornaForm("descrizione", e.target.value)}
          />
          <select value={form.categoria} onChange={(e) => aggiornaForm("categoria", e.target.value)}>
            {CATEGORIE.map((categoria) => (
              <option key={categoria}>{categoria}</option>
            ))}
          </select>
          <input placeholder="Unita di misura" value={form.unita} onChange={(e) => aggiornaForm("unita", e.target.value)} />
          <input
            type="number"
            step="0.01"
            placeholder="Quantita"
            value={form.quantita}
            onChange={(e) => aggiornaForm("quantita", e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Costo unitario EUR"
            value={form.costo}
            onChange={(e) => aggiornaForm("costo", e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Scorta minima"
            value={form.scortaMinima}
            onChange={(e) => aggiornaForm("scortaMinima", e.target.value)}
          />
          <input readOnly value={`Valore: ${formatEuro(Number(form.quantita || 0) * Number(form.costo || 0))}`} />
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "15px", flexWrap: "wrap" }}>
          <button onClick={salvaMateriale}>{form.id ? "Salva Modifiche" : "Salva Materiale"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>Giacenze Magazzino</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              placeholder="Ricerca per codice o materiale"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              style={{ width: "300px" }}
            />
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option>Tutte</option>
              {CATEGORIE.map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={soloSottoScorta}
                onChange={(e) => setSoloSottoScorta(e.target.checked)}
              />
              Sotto scorta
            </label>
            <button onClick={esportaMagazzino}>Esporta CSV</button>
            <button onClick={generaPdfMagazzino}>PDF</button>
          </div>
        </div>

        {caricamento ? (
          <p>Caricamento magazzino...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Codice</th>
                <th>Materiale</th>
                <th>Categoria</th>
                <th>UM</th>
                <th>Quantita</th>
                <th>Scorta Min.</th>
                <th>Costo</th>
                <th>Valore</th>
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {materialiFiltrati.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ padding: "22px", color: "#64748b" }}>
                    Nessun materiale trovato. Crea un articolo o modifica i filtri.
                  </td>
                </tr>
              )}

              {materialiFiltrati.map((materiale) => (
                <tr
                  key={materiale.id}
                  style={{
                    background:
                      Number(materiale.quantita || 0) <= Number(materiale.scortaMinima || 0)
                        ? "#fee2e2"
                        : "white",
                  }}
                >
                  <td style={{ fontWeight: 800 }}>{materiale.codice}</td>
                  <td style={{ textAlign: "left" }}>{materiale.descrizione}</td>
                  <td>{materiale.categoria}</td>
                  <td>{materiale.unita}</td>
                  <td>{Number(materiale.quantita || 0).toLocaleString("it-IT")}</td>
                  <td>{Number(materiale.scortaMinima || 0).toLocaleString("it-IT")}</td>
                  <td>{formatEuro(materiale.costo)}</td>
                  <td>{formatEuro(Number(materiale.quantita || 0) * Number(materiale.costo || 0))}</td>
                  <td>
                    <button onClick={() => registraMovimento(materiale, "Carico")}>Carico</button>{" "}
                    <button onClick={() => registraMovimento(materiale, "Scarico")}>Scarico</button>{" "}
                    <button onClick={() => modificaMateriale(materiale)}>Modifica</button>{" "}
                    <button onClick={() => eliminaMateriale(materiale)}>Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginTop: "20px" }}>
        <h2>Movimenti da DDT</h2>
        <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
          <thead>
            <tr>
              <th>Data DDT</th>
              <th>Numero DDT</th>
              <th>Chiamata</th>
              <th>Codice progetto</th>
              <th>Fornitore</th>
              <th>Codice materiale</th>
              <th>Materiale</th>
              <th>Quantita</th>
              <th>Prezzo</th>
              <th>Totale</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {movimentiDdt.map((movimento) => (
              <tr key={movimento.id}>
                <td>{movimento.dataDdt || "-"}</td>
                <td><strong>{movimento.numeroDdt || "-"}</strong></td>
                <td>{movimento.numeroChiamata || "-"}</td>
                <td>{movimento.codiceProgetto || "-"}</td>
                <td>{movimento.fornitore || "-"}</td>
                <td>{movimento.codiceMateriale || "-"}</td>
                <td style={{ textAlign: "left" }}>{movimento.materiale || "-"}</td>
                <td>{Number(movimento.quantita || 0).toLocaleString("it-IT")}</td>
                <td>{formatEuro(movimento.prezzoUnitario)}</td>
                <td>{formatEuro(movimento.totale)}</td>
                <td>{movimento.tipo || "Carico DDT"}</td>
              </tr>
            ))}
            {!movimentiDdt.length && (
              <tr>
                <td colSpan="11" style={{ padding: "18px", color: "#64748b" }}>
                  Nessun movimento DDT registrato. Conferma un DDT da Ordini Materiali per alimentare il magazzino.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Magazzino;
