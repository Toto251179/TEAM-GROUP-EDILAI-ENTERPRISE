import { useState, useEffect } from "react";

function Scadenziario() {
  const [scadenze, setScadenze] = useState([]);
  const [ricerca, setRicerca] = useState("");

  const [nuovaScadenza, setNuovaScadenza] =
    useState({
      descrizione: "",
      categoria: "Amministrativa",
      data: "",
    });

  useEffect(() => {
    const dati =
      JSON.parse(
        localStorage.getItem("scadenze")
      ) || [];

    const mezzi =
      JSON.parse(
        localStorage.getItem("mezzi")
      ) || [];

    const fatture =
      JSON.parse(
        localStorage.getItem("fatture")
      ) || [];

    let automatiche = [];

    mezzi.forEach((m) => {
      if (m.revisione) {
        automatiche.push({
          id:
            "REV-" + m.id,
          descrizione:
            "Revisione " +
            m.descrizione,
          categoria:
            "Mezzi",
          data:
            m.revisione,
        });
      }

      if (m.assicurazione) {
        automatiche.push({
          id:
            "ASS-" + m.id,
          descrizione:
            "Assicurazione " +
            m.descrizione,
          categoria:
            "Mezzi",
          data:
            m.assicurazione,
        });
      }

      if (m.bollo) {
        automatiche.push({
          id:
            "BOL-" + m.id,
          descrizione:
            "Bollo " +
            m.descrizione,
          categoria:
            "Mezzi",
          data:
            m.bollo,
        });
      }
    });

    fatture.forEach((f) => {
      if (
        f.scadenza &&
        f.stato !==
          "Incassata"
      ) {
        automatiche.push({
          id:
            "FAT-" + f.id,
          descrizione:
            "Fattura " +
            f.numero,
          categoria:
            "Fatture",
          data:
            f.scadenza,
        });
      }
    });

    setScadenze([
      ...dati,
      ...automatiche,
    ]);
  }, []);

  const salvaScadenze = (
    nuoveScadenze
  ) => {
    const manuali =
      nuoveScadenze.filter(
        (s) =>
          typeof s.id ===
          "number"
      );

    localStorage.setItem(
      "scadenze",
      JSON.stringify(
        manuali
      )
    );

    setScadenze(
      nuoveScadenze
    );
  };

  const aggiungiScadenza = () => {
    if (
      !nuovaScadenza.descrizione ||
      !nuovaScadenza.data
    )
      return;

    salvaScadenze([
      ...scadenze,
      {
        id: Date.now(),
        ...nuovaScadenza,
      },
    ]);

    setNuovaScadenza({
      descrizione: "",
      categoria:
        "Amministrativa",
      data: "",
    });
  };

  const eliminaScadenza = (id) => {
    if (
      typeof id !==
      "number"
    ) {
      alert(
        "Scadenza automatica non eliminabile"
      );
      return;
    }

    salvaScadenze(
      scadenze.filter(
        (s) => s.id !== id
      )
    );
  };

  const giorniAllaScadenza = (
    data
  ) => {
    const oggi =
      new Date();

    const scadenza =
      new Date(data);

    return Math.ceil(
      (scadenza - oggi) /
        (1000 *
          60 *
          60 *
          24)
    );
  };

  const scadenzeFiltrate =
    scadenze.filter(
      (s) =>
        s.descrizione
          .toLowerCase()
          .includes(
            ricerca.toLowerCase()
          ) ||
        s.categoria
          .toLowerCase()
          .includes(
            ricerca.toLowerCase()
          )
    );

  const scadute =
    scadenze.filter(
      (s) =>
        giorniAllaScadenza(
          s.data
        ) < 0
    ).length;

  const entro30 =
    scadenze.filter(
      (s) => {
        const g =
          giorniAllaScadenza(
            s.data
          );

        return (
          g >= 0 &&
          g <= 30
        );
      }
    ).length;

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "12px",
    textAlign: "center",
    boxShadow:
      "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <div>
      <h1>
        📅 Scadenziario PRO
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <div style={card}>
          <h3>Totali</h3>
          <h2>
            {scadenze.length}
          </h2>
        </div>

        <div
          style={{
            ...card,
            background:
              "#fee2e2",
          }}
        >
          <h3>Scadute</h3>
          <h2>
            {scadute}
          </h2>
        </div>

        <div
          style={{
            ...card,
            background:
              "#fef3c7",
          }}
        >
          <h3>
            Entro 30 Giorni
          </h3>
          <h2>
            {entro30}
          </h2>
        </div>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom:
            "20px",
        }}
      >
        <h2>
          Nuova Scadenza
        </h2>

        <input
          placeholder="Descrizione"
          value={
            nuovaScadenza.descrizione
          }
          onChange={(e) =>
            setNuovaScadenza({
              ...nuovaScadenza,
              descrizione:
                e.target.value,
            })
          }
        />

        <br />
        <br />

        <select
          value={
            nuovaScadenza.categoria
          }
          onChange={(e) =>
            setNuovaScadenza({
              ...nuovaScadenza,
              categoria:
                e.target.value,
            })
          }
        >
          <option>
            Amministrativa
          </option>
          <option>
            Cantiere
          </option>
          <option>
            Mezzi
          </option>
          <option>
            Sicurezza
          </option>
        </select>

        <br />
        <br />

        <input
          type="date"
          value={
            nuovaScadenza.data
          }
          onChange={(e) =>
            setNuovaScadenza({
              ...nuovaScadenza,
              data:
                e.target.value,
            })
          }
        />

        <br />
        <br />

        <button
          onClick={
            aggiungiScadenza
          }
        >
          Salva
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h2>
          Elenco Scadenze
        </h2>

        <input
          placeholder="Ricerca..."
          value={ricerca}
          onChange={(e) =>
            setRicerca(
              e.target.value
            )
          }
        />

        <br />
        <br />

        <table width="100%">
          <thead>
            <tr>
              <th>
                Descrizione
              </th>
              <th>
                Categoria
              </th>
              <th>Data</th>
              <th>
                Giorni
              </th>
              <th>
                Stato
              </th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {scadenzeFiltrate.map(
              (s) => {
                const giorni =
                  giorniAllaScadenza(
                    s.data
                  );

                let stato =
                  "Regolare";

                let colore =
                  "green";

                if (
                  giorni < 0
                ) {
                  stato =
                    "Scaduta";
                  colore =
                    "red";
                } else if (
                  giorni <=
                  30
                ) {
                  stato =
                    "In Scadenza";
                  colore =
                    "orange";
                }

                return (
                  <tr
                    key={s.id}
                  >
                    <td>
                      {
                        s.descrizione
                      }
                    </td>

                    <td>
                      {
                        s.categoria
                      }
                    </td>

                    <td>
                      {s.data}
                    </td>

                    <td>
                      {giorni}
                    </td>

                    <td
                      style={{
                        color:
                          colore,
                        fontWeight:
                          "bold",
                      }}
                    >
                      {stato}
                    </td>

                    <td>
                      <button
                        onClick={() =>
                          eliminaScadenza(
                            s.id
                          )
                        }
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Scadenziario;