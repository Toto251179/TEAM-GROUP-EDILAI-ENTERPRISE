import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AziendaHeader from "../components/AziendaHeader";
import { api } from "../services/api";

const CATEGORIE_PROPRIETARIE = [
  "Tutte",
  "Edili",
  "Elettriche",
  "Idrauliche",
  "Climatizzazione",
  "Fotovoltaico",
  "Serramenti",
  "Coperture",
  "Sicurezza",
  "Finiture",
  "Demolizioni",
  "Scavi",
  "Da preventivi",
];

function ElencoPrezzi() {
  const navigate = useNavigate();
  const [voci, setVoci] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [categoria, setCategoria] = useState("Tutte");
  const [fonte, setFonte] = useState("aziendale");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");

  const riepilogo = useMemo(
    () => ({
      risultati: voci.length,
      attive: voci.filter((voce) => voce.attivo).length,
      categorie: new Set(voci.map((voce) => voce.categoria)).size,
    }),
    [voci],
  );

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaVoci() {
      setCaricamento(true);
      try {
        const params = new URLSearchParams({ limit: "1000" });
        if (filtro.trim()) params.set("q", filtro.trim());
        if (categoria !== "Tutte") params.set("categoria", categoria);
        if (fonte === "aziendale") params.set("aziendale", "true");
        if (fonte === "veneto") params.set("veneto", "true");

        const query = `/elenco-prezzi?${params.toString()}`;
        const dati = await api.get(query);
        if (componenteAttivo) setVoci(dati);
      } catch (error) {
        if (componenteAttivo) setErrore(error.message);
      } finally {
        if (componenteAttivo) setCaricamento(false);
      }
    }

    const timer = setTimeout(caricaVoci, 250);

    return () => {
      componenteAttivo = false;
      clearTimeout(timer);
    };
  }, [filtro, categoria, fonte]);

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  const usaNelPreventivo = (voce) => {
    localStorage.setItem("teamGroupVocePrezzario", JSON.stringify(voce));
    navigate("/preventivi");
  };

  const aggiornaCategoria = async (voce, nuovaCategoria) => {
    setErrore("");
    setMessaggio("");
    setVoci((correnti) =>
      correnti.map((item) => (item.id === voce.id ? { ...item, categoria: nuovaCategoria } : item)),
    );

    try {
      const voceAggiornata = await api.put(`/elenco-prezzi/${voce.id}`, {
        ...voce,
        categoria: nuovaCategoria,
      });
      setVoci((correnti) => correnti.map((item) => (item.id === voce.id ? voceAggiornata : item)));
      setMessaggio(`Categoria aggiornata per ${voce.codice}`);
    } catch (error) {
      setErrore(`Categoria non salvata: ${error.message}`);
      setVoci((correnti) => correnti.map((item) => (item.id === voce.id ? voce : item)));
    }
  };

  return (
    <div>
      <AziendaHeader
        titolo="Elenco Prezzi Aziendale"
        sottotitolo="Voci aggiornate automaticamente dai preventivi"
      />

      <h1>Elenco Prezzi Aziendale</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Voci Mostrate</h3>
          <h2>{riepilogo.risultati}</h2>
        </div>
        <div style={card}>
          <h3>Voci Attive</h3>
          <h2>{riepilogo.attive}</h2>
        </div>
        <div style={card}>
          <h3>Categorie</h3>
          <h2>{riepilogo.categorie}</h2>
        </div>
      </div>

      <div style={{ background: "white", padding: "20px", borderRadius: "10px", marginBottom: "20px" }}>
        <h2>Cerca nell'elenco prezzi proprietario</h2>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <input
            autoFocus
            style={{ padding: "12px", fontSize: "18px" }}
            placeholder="Scrivi codice o descrizione"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />

          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIE_PROPRIETARIE.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select value={fonte} onChange={(e) => setFonte(e.target.value)}>
            <option value="aziendale">Solo TEAM GROUP</option>
            <option value="veneto">Base Veneto</option>
            <option value="tutti">Tutto</option>
          </select>
        </div>

        <p style={{ margin: 0 }}>
          Risultati mostrati: {voci.length} - obiettivo archivio proprietario: 500-1000 voci operative
        </p>
      </div>

      {errore && <p style={{ color: "crimson" }}>{errore}</p>}
      {messaggio && <p style={{ color: "#047857", fontWeight: 700 }}>{messaggio}</p>}

      {caricamento ? (
        <p>Caricamento elenco prezzi...</p>
      ) : (
        <table style={{ width: "100%", background: "white", borderCollapse: "collapse", marginBottom: "24px" }}>
          <thead>
            <tr>
              <th>Codice</th>
              <th>Categoria</th>
              <th>Descrizione</th>
              <th>Unita</th>
              <th>Prezzo</th>
              <th>Fonte</th>
              <th>Azioni</th>
            </tr>
          </thead>

          <tbody>
            {voci.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: "22px", color: "#64748b" }}>
                  Nessuna voce trovata. Salva un preventivo o modifica la ricerca.
                </td>
              </tr>
            )}

            {voci.map((voce) => (
              <tr key={voce.id}>
                <td>{voce.codice}</td>
                <td>
                  <select
                    value={voce.categoria || "Edili"}
                    onChange={(e) => aggiornaCategoria(voce, e.target.value)}
                    title="Cambia categoria"
                    style={{
                      width: "160px",
                      padding: "9px",
                      border: "1px solid #1d4ed8",
                      borderRadius: "6px",
                      background: "#eff6ff",
                      color: "#0f172a",
                      fontWeight: 700,
                    }}
                  >
                    {CATEGORIE_PROPRIETARIE.filter((item) => item !== "Tutte").map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{voce.descrizione}</td>
                <td>{voce.unita}</td>
                <td>{Number(voce.prezzoUnitario || 0).toLocaleString("it-IT", { minimumFractionDigits: 2 })} €</td>
                <td>{voce.note || "Elenco prezzi aziendale"}</td>
                <td>
                  <button onClick={() => usaNelPreventivo(voce)}>Usa nel preventivo</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ElencoPrezzi;
