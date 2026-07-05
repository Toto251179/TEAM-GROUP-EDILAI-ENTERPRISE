import { useState, useEffect } from "react";

function Cronoprogramma() {
  const [cantieri, setCantieri] = useState([]);
  const [attivita, setAttivita] = useState([]);

  const [nuovaAttivita, setNuovaAttivita] = useState({
    cantiere: "",
    descrizione: "",
    inizio: "",
    fine: "",
    avanzamento: 0,
  });

  useEffect(() => {
    const datiAttivita =
      JSON.parse(
        localStorage.getItem("cronoprogramma")
      ) || [];

    const datiCantieri =
      JSON.parse(
        localStorage.getItem("cantieri")
      ) || [];

    setAttivita(datiAttivita);
    setCantieri(datiCantieri);
  }, []);

  const salvaAttivita = (nuove) => {
    setAttivita(nuove);

    localStorage.setItem(
      "cronoprogramma",
      JSON.stringify(nuove)
    );
  };

  const aggiungiAttivita = () => {
    if (
      !nuovaAttivita.cantiere ||
      !nuovaAttivita.descrizione
    )
      return;

    salvaAttivita([
      ...attivita,
      {
        id: Date.now(),
        ...nuovaAttivita,
      },
    ]);

    setNuovaAttivita({
      cantiere: "",
      descrizione: "",
      inizio: "",
      fine: "",
      avanzamento: 0,
    });
  };

  const eliminaAttivita = (id) => {
    salvaAttivita(
      attivita.filter(
        (a) => a.id !== id
      )
    );
  };

  return (
    <div>
      <h1>📅 Cronoprogramma Cantieri PRO</h1>

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
          <h3>Attività Totali</h3>
          <h1>{attivita.length}</h1>
        </div>

        <div
          style={{
            background: "#dbeafe",
            padding: "20px",
            borderRadius: "12px",
          }}
        >
          <h3>Cantieri</h3>
          <h1>{cantieri.length}</h1>
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
        <h2>Nuova Attività</h2>

        <select
          value={nuovaAttivita.cantiere}
          onChange={(e) =>
            setNuovaAttivita({
              ...nuovaAttivita,
              cantiere: e.target.value,
            })
          }
        >
          <option value="">
            Seleziona Cantiere
          </option>

          {cantieri.map((c) => (
            <option
              key={c.id}
              value={c.nome}
            >
              {c.nome}
            </option>
          ))}
        </select>

        <br /><br />

        <input
          placeholder="Descrizione Attività"
          value={nuovaAttivita.descrizione}
          onChange={(e) =>
            setNuovaAttivita({
              ...nuovaAttivita,
              descrizione: e.target.value,
            })
          }
        />

        <br /><br />

        <label>Data Inizio</label>
        <br />

        <input
          type="date"
          value={nuovaAttivita.inizio}
          onChange={(e) =>
            setNuovaAttivita({
              ...nuovaAttivita,
              inizio: e.target.value,
            })
          }
        />

        <br /><br />

        <label>Data Fine</label>
        <br />

        <input
          type="date"
          value={nuovaAttivita.fine}
          onChange={(e) =>
            setNuovaAttivita({
              ...nuovaAttivita,
              fine: e.target.value,
            })
          }
        />

        <br /><br />

        <label>Avanzamento (%)</label>
        <br />

        <input
          type="number"
          min="0"
          max="100"
          value={nuovaAttivita.avanzamento}
          onChange={(e) =>
            setNuovaAttivita({
              ...nuovaAttivita,
              avanzamento: e.target.value,
            })
          }
        />

        <br /><br />

        <button
          onClick={aggiungiAttivita}
        >
          Salva Attività
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h2>Cronoprogramma</h2>

        <table width="100%">
          <thead>
            <tr>
              <th>Cantiere</th>
              <th>Attività</th>
              <th>Inizio</th>
              <th>Fine</th>
              <th>Avanzamento</th>
              <th>Azioni</th>
            </tr>
          </thead>

          <tbody>
            {attivita.map((a) => (
              <tr key={a.id}>
                <td>{a.cantiere}</td>
                <td>{a.descrizione}</td>
                <td>{a.inizio}</td>
                <td>{a.fine}</td>

                <td>
                  <div
                    style={{
                      width: "150px",
                      background: "#e5e7eb",
                      borderRadius: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: `${a.avanzamento}%`,
                        background: "#22c55e",
                        color: "white",
                        textAlign: "center",
                        borderRadius: "6px",
                      }}
                    >
                      {a.avanzamento}%
                    </div>
                  </div>
                </td>

                <td>
                  <button
                    onClick={() =>
                      eliminaAttivita(a.id)
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

export default Cronoprogramma;