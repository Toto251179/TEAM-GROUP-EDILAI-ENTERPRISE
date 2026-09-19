import { useState, useEffect } from "react";

function Sicurezza() {
  const [documenti, setDocumenti] = useState([]);

  const [nuovoDocumento, setNuovoDocumento] = useState({
    impresa: "",
    documento: "",
    scadenza: "",
    stato: "Valido",
  });

  useEffect(() => {
    const dati =
      JSON.parse(localStorage.getItem("sicurezza")) ||
      [];

    setDocumenti(dati);
  }, []);

  const salvaDocumenti = (nuovi) => {
    setDocumenti(nuovi);

    localStorage.setItem(
      "sicurezza",
      JSON.stringify(nuovi)
    );
  };

  const aggiornaStati = (lista) => {
    const oggi = new Date();

    return lista.map((d) => {
      const scadenza = new Date(d.scadenza);

      const giorni =
        (scadenza - oggi) /
        (1000 * 60 * 60 * 24);

      let stato = "Valido";

      if (giorni < 0)
        stato = "Scaduto";
      else if (giorni <= 30)
        stato = "In Scadenza";

      return {
        ...d,
        stato,
      };
    });
  };

  const aggiungiDocumento = () => {
    if (
      !nuovoDocumento.impresa ||
      !nuovoDocumento.documento ||
      !nuovoDocumento.scadenza
    )
      return;

    const nuovi = aggiornaStati([
      ...documenti,
      {
        id: Date.now(),
        ...nuovoDocumento,
      },
    ]);

    salvaDocumenti(nuovi);

    setNuovoDocumento({
      impresa: "",
      documento: "",
      scadenza: "",
      stato: "Valido",
    });
  };

  const eliminaDocumento = (id) => {
    salvaDocumenti(
      documenti.filter(
        (d) => d.id !== id
      )
    );
  };

  const badge = (stato) => {
    if (stato === "Scaduto")
      return {
        background: "#fecaca",
        color: "#991b1b",
      };

    if (stato === "In Scadenza")
      return {
        background: "#fde68a",
        color: "#92400e",
      };

    return {
      background: "#bbf7d0",
      color: "#166534",
    };
  };

  const validi = documenti.filter(
    (d) => d.stato === "Valido"
  ).length;

  const inScadenza = documenti.filter(
    (d) => d.stato === "In Scadenza"
  ).length;

  const scaduti = documenti.filter(
    (d) => d.stato === "Scaduto"
  ).length;

  return (
    <div>
      <h1>🦺 Sicurezza PRO</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            background: "#dcfce7",
            padding: "20px",
            borderRadius: "12px",
          }}
        >
          <h3>✅ Validi</h3>
          <h1>{validi}</h1>
        </div>

        <div
          style={{
            background: "#fde68a",
            padding: "20px",
            borderRadius: "12px",
          }}
        >
          <h3>⚠️ In Scadenza</h3>
          <h1>{inScadenza}</h1>
        </div>

        <div
          style={{
            background: "#fecaca",
            padding: "20px",
            borderRadius: "12px",
          }}
        >
          <h3>❌ Scaduti</h3>
          <h1>{scaduti}</h1>
        </div>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
        }}
      >
        <h2>Nuovo Documento</h2>

        <input
          placeholder="Impresa / Operaio"
          value={nuovoDocumento.impresa}
          onChange={(e) =>
            setNuovoDocumento({
              ...nuovoDocumento,
              impresa: e.target.value,
            })
          }
        />

        <br /><br />

        <select
          value={nuovoDocumento.documento}
          onChange={(e) =>
            setNuovoDocumento({
              ...nuovoDocumento,
              documento: e.target.value,
            })
          }
        >
          <option value="">
            Seleziona Documento
          </option>

          <option>DURC</option>
          <option>DVR</option>
          <option>POS</option>
          <option>Patentino</option>
          <option>Visita Medica</option>
          <option>Corso Sicurezza</option>
        </select>

        <br /><br />

        <input
          type="date"
          value={nuovoDocumento.scadenza}
          onChange={(e) =>
            setNuovoDocumento({
              ...nuovoDocumento,
              scadenza: e.target.value,
            })
          }
        />

        <br /><br />

        <button onClick={aggiungiDocumento}>
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
        <h2>Documenti Sicurezza</h2>

        <table width="100%">
          <thead>
            <tr>
              <th>Impresa</th>
              <th>Documento</th>
              <th>Scadenza</th>
              <th>Stato</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {documenti.map((d) => (
              <tr key={d.id}>
                <td>{d.impresa}</td>
                <td>{d.documento}</td>
                <td>{d.scadenza}</td>

                <td>
                  <span
                    style={{
                      ...badge(d.stato),
                      padding: "6px 12px",
                      borderRadius: "20px",
                    }}
                  >
                    {d.stato}
                  </span>
                </td>

                <td>
                  <button
                    onClick={() =>
                      eliminaDocumento(d.id)
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

export default Sicurezza;