import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "../services/api";
import { disegnaIntestazioneAzienda } from "../utils/pdfAzienda";

const TIPI = ["Entrata", "Uscita"];
const CATEGORIE = [
  "Generale",
  "Materiali",
  "Manodopera",
  "Subappalti",
  "Noleggi",
  "Carburante",
  "Incasso Cliente",
  "Pagamento Fornitore",
  "Fattura Attiva",
  "Fattura Passiva",
  "SAL",
];

const movimentoVuoto = {
  id: null,
  data: new Date().toISOString().split("T")[0],
  cantiereId: "",
  cantiere: "",
  descrizione: "",
  categoria: "Generale",
  tipo: "Entrata",
  importo: "",
};

function formatEuro(value) {
  return `EUR ${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("it-IT");
}

function normalizzaData(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
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

function Contabilita() {
  const [cantieri, setCantieri] = useState([]);
  const [movimenti, setMovimenti] = useState([]);
  const [form, setForm] = useState(movimentoVuoto);
  const [ricerca, setRicerca] = useState("");
  const [filtroCantiere, setFiltroCantiere] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("Tutti");
  const [filtroCategoria, setFiltroCategoria] = useState("Tutte");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaDati() {
      try {
        const [datiCantieri, datiMovimenti] = await Promise.all([api.get("/cantieri"), api.get("/contabilita")]);

        if (componenteAttivo) {
          setCantieri(datiCantieri);
          setMovimenti(datiMovimenti);
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

  const movimentiFiltrati = useMemo(
    () =>
      movimenti.filter((movimento) => {
        const testo = [movimento.data, movimento.cantiere, movimento.descrizione, movimento.categoria, movimento.tipo]
          .join(" ")
          .toLowerCase();
        const passaRicerca = testo.includes(ricerca.toLowerCase());
        const passaCantiere = !filtroCantiere || String(movimento.cantiereId || "") === String(filtroCantiere);
        const passaTipo = filtroTipo === "Tutti" || movimento.tipo === filtroTipo;
        const passaCategoria = filtroCategoria === "Tutte" || movimento.categoria === filtroCategoria;

        return passaRicerca && passaCantiere && passaTipo && passaCategoria;
      }),
    [filtroCantiere, filtroCategoria, filtroTipo, movimenti, ricerca],
  );

  const riepilogo = useMemo(() => {
    const entrate = movimentiFiltrati
      .filter((movimento) => movimento.tipo === "Entrata")
      .reduce((totale, movimento) => totale + Number(movimento.importo || 0), 0);
    const uscite = movimentiFiltrati
      .filter((movimento) => movimento.tipo === "Uscita")
      .reduce((totale, movimento) => totale + Number(movimento.importo || 0), 0);

    return {
      entrate,
      uscite,
      saldo: entrate - uscite,
      movimenti: movimentiFiltrati.length,
    };
  }, [movimentiFiltrati]);

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const selezionaCantiere = (id) => {
    const cantiere = cantieri.find((item) => String(item.id) === String(id));

    setForm((corrente) => ({
      ...corrente,
      cantiereId: cantiere?.id || "",
      cantiere: cantiere?.nome || "",
    }));
  };

  const resetForm = () => {
    setForm({
      ...movimentoVuoto,
      data: new Date().toISOString().split("T")[0],
    });
    setErrore("");
  };

  const salvaMovimento = async () => {
    if (!form.descrizione || !form.importo) {
      setErrore("Inserisci descrizione e importo del movimento.");
      return;
    }

    setErrore("");

    const payload = {
      cantiereId: form.cantiereId || null,
      data: form.data,
      tipo: form.tipo,
      cantiere: form.cantiere,
      categoria: form.categoria,
      descrizione: form.descrizione,
      importo: Number(form.importo || 0),
    };

    try {
      if (form.id) {
        const aggiornato = await api.put(`/contabilita/${form.id}`, payload);
        setMovimenti((attuali) => attuali.map((movimento) => (movimento.id === form.id ? aggiornato : movimento)));
      } else {
        const creato = await api.post("/contabilita", payload);
        setMovimenti((attuali) => [creato, ...attuali]);
      }

      resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaMovimento = (movimento) => {
    setForm({
      id: movimento.id,
      data: normalizzaData(movimento.data) || new Date().toISOString().split("T")[0],
      cantiereId: movimento.cantiereId || "",
      cantiere: movimento.cantiere || "",
      descrizione: movimento.descrizione || "",
      categoria: movimento.categoria || "Generale",
      tipo: movimento.tipo || "Entrata",
      importo: movimento.importo || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminaMovimento = async (movimento) => {
    const conferma = window.confirm(`Eliminare il movimento "${movimento.descrizione}"?`);
    if (!conferma) return;

    setErrore("");

    try {
      await api.delete(`/contabilita/${movimento.id}`);
      setMovimenti((attuali) => attuali.filter((item) => item.id !== movimento.id));
      if (form.id === movimento.id) resetForm();
    } catch (error) {
      setErrore(error.message);
    }
  };

  const esportaPrimaNota = () => {
    esportaCsv(
      `prima-nota-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Data", "Cantiere", "Descrizione", "Categoria", "Tipo", "Importo"],
      movimentiFiltrati.map((movimento) => [
        formatDate(movimento.data),
        movimento.cantiere,
        movimento.descrizione,
        movimento.categoria,
        movimento.tipo,
        movimento.importo,
      ]),
    );
  };

  const generaPdfPrimaNota = async () => {
    const doc = new jsPDF();

    await disegnaIntestazioneAzienda(doc, 18);
    doc.setFontSize(12);
    doc.text("Prima Nota Contabile", 36, 36);
    doc.setDrawColor(21, 101, 192);
    doc.setLineWidth(0.7);
    doc.line(14, 34, 196, 34);

    autoTable(doc, {
      startY: 42,
      head: [["Data", "Cantiere", "Descrizione", "Categoria", "Tipo", "Importo"]],
      body: movimentiFiltrati.map((movimento) => [
        formatDate(movimento.data),
        movimento.cantiere || "",
        movimento.descrizione || "",
        movimento.categoria || "",
        movimento.tipo || "",
        formatEuro(movimento.importo),
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
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 34 },
        2: { cellWidth: 54 },
        3: { cellWidth: 30 },
        4: { cellWidth: 18 },
        5: { halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    const y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Entrate: ${formatEuro(riepilogo.entrate)}`, 120, y);
    doc.text(`Uscite: ${formatEuro(riepilogo.uscite)}`, 120, y + 7);
    doc.setFontSize(12);
    doc.text(`Saldo: ${formatEuro(riepilogo.saldo)}`, 120, y + 16);
    doc.save("prima-nota-contabile.pdf");
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
      <h1>Contabilita PRO</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Entrate</h3>
          <h2>{formatEuro(riepilogo.entrate)}</h2>
        </div>
        <div style={card}>
          <h3>Uscite</h3>
          <h2>{formatEuro(riepilogo.uscite)}</h2>
        </div>
        <div style={{ ...card, background: riepilogo.saldo >= 0 ? "#dcfce7" : "#fee2e2" }}>
          <h3>Saldo</h3>
          <h2>{formatEuro(riepilogo.saldo)}</h2>
        </div>
        <div style={card}>
          <h3>Movimenti</h3>
          <h2>{riepilogo.movimenti}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica Movimento" : "Nuovo Movimento"}</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "12px" }}>
          <input type="date" value={form.data} onChange={(e) => aggiornaForm("data", e.target.value)} />

          <select value={form.cantiereId} onChange={(e) => selezionaCantiere(e.target.value)}>
            <option value="">Nessun cantiere</option>
            {cantieri.map((cantiere) => (
              <option key={cantiere.id} value={cantiere.id}>
                {cantiere.nome}
              </option>
            ))}
          </select>

          <input placeholder="Cantiere" value={form.cantiere} onChange={(e) => aggiornaForm("cantiere", e.target.value)} />
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

          <select value={form.tipo} onChange={(e) => aggiornaForm("tipo", e.target.value)}>
            {TIPI.map((tipo) => (
              <option key={tipo}>{tipo}</option>
            ))}
          </select>

          <input
            type="number"
            step="0.01"
            placeholder="Importo EUR"
            value={form.importo}
            onChange={(e) => aggiornaForm("importo", e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "15px", flexWrap: "wrap" }}>
          <button onClick={salvaMovimento}>{form.id ? "Salva Modifiche" : "Aggiungi Movimento"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>Prima Nota</h2>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              placeholder="Ricerca per descrizione, cantiere, categoria"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              style={{ width: "320px" }}
            />
            <select value={filtroCantiere} onChange={(e) => setFiltroCantiere(e.target.value)}>
              <option value="">Tutti i cantieri</option>
              {cantieri.map((cantiere) => (
                <option key={cantiere.id} value={cantiere.id}>
                  {cantiere.nome}
                </option>
              ))}
            </select>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option>Tutti</option>
              {TIPI.map((tipo) => (
                <option key={tipo}>{tipo}</option>
              ))}
            </select>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option>Tutte</option>
              {CATEGORIE.map((categoria) => (
                <option key={categoria}>{categoria}</option>
              ))}
            </select>
            <button onClick={esportaPrimaNota}>Esporta CSV</button>
            <button onClick={generaPdfPrimaNota}>PDF</button>
          </div>
        </div>

        {caricamento ? (
          <p>Caricamento contabilita...</p>
        ) : (
          <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cantiere</th>
                <th>Descrizione</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th>Importo</th>
                <th>Azioni</th>
              </tr>
            </thead>

            <tbody>
              {movimentiFiltrati.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ padding: "22px", color: "#64748b" }}>
                    Nessun movimento trovato. Crea un movimento o modifica i filtri.
                  </td>
                </tr>
              )}

              {movimentiFiltrati.map((movimento) => (
                <tr key={movimento.id}>
                  <td>{formatDate(movimento.data)}</td>
                  <td>{movimento.cantiere}</td>
                  <td style={{ textAlign: "left" }}>{movimento.descrizione}</td>
                  <td>{movimento.categoria}</td>
                  <td
                    style={{
                      color: movimento.tipo === "Entrata" ? "green" : "red",
                      fontWeight: "bold",
                    }}
                  >
                    {movimento.tipo}
                  </td>
                  <td>{formatEuro(movimento.importo)}</td>
                  <td>
                    <button onClick={() => modificaMovimento(movimento)}>Modifica</button>{" "}
                    <button onClick={() => eliminaMovimento(movimento)}>Elimina</button>
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

export default Contabilita;
