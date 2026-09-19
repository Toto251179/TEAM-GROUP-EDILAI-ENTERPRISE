import { useState, useEffect } from "react";

function Documentale() {
  const [documenti, setDocumenti] = useState([]);

  const [nuovoDocumento, setNuovoDocumento] =
    useState({
      categoria: "",
      descrizione: "",
      scadenza: "",
    });

  useEffect(() => {
    const dati =
      JSON.parse(
        localStorage.getItem("documentale")
      ) || [];

    setDocumenti(dati);
  }, []);

  const salvaDocumenti = (nuovi) => {
    setDocumenti(nuovi);

    localStorage.setItem(
      "documentale",
      JSON.stringify(nuovi)
    );
  };

  const aggiungiDocumento = () => {
    if (
      !nuovoDocumento.categoria ||
      !nuovoDocumento.descrizione
    )
      return;

    salvaDocumenti([
      ...documenti,
      {
        id: Date.now(),
        ...nuovoDocumento,
      },
    ]);

    setNuovoDocumento({
      categoria: "",
      descrizione: "",
      scadenza: "",
    });
  };

  const eliminaDocumento = (id) => {
    salvaDocumenti(
      documenti.filter(
        (d) => d.id !== id
      )
    );
  };

  const statoScadenza = (data) => {
    if (!data) return "N/D";

    const oggi = new Date();
    const scadenza = new Date(data);

    const giorni =
      (scadenza - oggi) /
      (1000 * 60 * 60 * 24);

    if (giorni < 0)
      return "❌ Scaduto";

    if (giorni <= 30)
      return "⚠️ In Scadenza";

    return "✅ Valido";
  };

  return (
    <div>
      <h1>📁 Gestione Documentale PRO</h1>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
        }}
      >
        <h2>Nuovo Documento</h2>

        <select
          value={nuovoDocumento.categoria}
          onChange={(e) =>
            setNuovoDocumento({
              ...nuovoDocumento,
              categoria: e.target.value,
            })
          }
        >
          <option value="">
            Categoria
          </option>

          <option>DURC</option>
          <option>POS</option>
          <option>PSC</option>
          <option>Contratto</option>
          <option>Certificazione</option>
          <option>Libretto Mezzo</option>
          <option>Altro</option>
        </select>

        <br /><br />

        <input
          placeholder="Descrizione"
          value={
            nuovoDocumento.descrizione
          }
          onChange={(e) =>
            setNuovoDocumento({
              ...nuovoDocumento,
              descrizione:
                e.target.value,
            })
          }
        />

        <br /><br />

        <label>Scadenza</label>

        <br />

        <input
          type="date"
          value={nuovoDocumento.scadenza}
          onChange={(e) =>
            setNuovoDocumento({
              ...nuovoDocumento,
              scadenza:
                e.target.value,
            })
          }
        />

        <br /><br />

        <button
          onClick={aggiungiDocumento}
        >
          Salva Documento
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h2>Archivio Documenti</h2>

        <table width="100%">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Descrizione</th>
              <th>Scadenza</th>
              <th>Stato</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {documenti.map((d) => (
              <tr key={d.id}>
                <td>{d.categoria}</td>
                <td>{d.descrizione}</td>
                <td>{d.scadenza}</td>
                <td>
                  {statoScadenza(
                    d.scadenza
                  )}
                </td>

                <td>
                  <button
                    onClick={() =>
                      eliminaDocumento(
                        d.id
                      )
                    }
                  >
                    Elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Documentale;