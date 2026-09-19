import { useState, useEffect } from "react";

function Presenze() {
  const [operai, setOperai] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [presenze, setPresenze] = useState([]);
  const [ricerca, setRicerca] = useState("");

  const [nuovaPresenza, setNuovaPresenza] =
    useState({
      operaio: "",
      cantiere: "",
      data: new Date()
        .toISOString()
        .split("T")[0],
      ore: "",
    });

  useEffect(() => {
    const datiOperai =
      JSON.parse(localStorage.getItem("operai")) || [];

    const datiCantieri =
      JSON.parse(localStorage.getItem("cantieri")) || [];

    const datiPresenze =
      JSON.parse(localStorage.getItem("presenze")) || [];

    setOperai(datiOperai);
    setCantieri(datiCantieri);
    setPresenze(datiPresenze);
  }, []);

  const salvaPresenze = (nuovePresenze) => {
    setPresenze(nuovePresenze);

    localStorage.setItem(
      "presenze",
      JSON.stringify(nuovePresenze)
    );
  };

  const aggiungiPresenza = () => {
    if (
      !nuovaPresenza.operaio ||
      !nuovaPresenza.cantiere ||
      !nuovaPresenza.ore
    )
      return;

    const operaio = operai.find(
      (o) =>
        o.nome === nuovaPresenza.operaio
    );

    const costoOrario = Number(
      operaio?.costoOrario || 0
    );

    const costo =
      costoOrario *
      Number(nuovaPresenza.ore);

    const nuova = {
      id: Date.now(),
      ...nuovaPresenza,
      costoOrario,
      costo,
    };

    salvaPresenze([
      ...presenze,
      nuova,
    ]);

    setNuovaPresenza({
      operaio: "",
      cantiere: "",
      data: new Date()
        .toISOString()
        .split("T")[0],
      ore: "",
    });
  };

  const eliminaPresenza = (id) => {
    salvaPresenze(
      presenze.filter(
        (p) => p.id !== id
      )
    );
  };

  const presenzeFiltrate =
    presenze.filter(
      (p) =>
        p.operaio
          .toLowerCase()
          .includes(
            ricerca.toLowerCase()
          ) ||
        p.cantiere
          .toLowerCase()
          .includes(
            ricerca.toLowerCase()
          )
    );

  const totaleOre =
    presenze.reduce(
      (tot, p) =>
        tot +
        Number(p.ore || 0),
      0
    );

  const totaleCosto =
    presenze.reduce(
      (tot, p) =>
        tot +
        Number(p.costo || 0),
      0
    );

  const presenzeOggi =
    presenze.filter(
      (p) =>
        p.data ===
        new Date()
          .toISOString()
          .split("T")[0]
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
      <h1>🕒 Presenze PRO</h1>

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
          <h3>Presenze</h3>
          <h2>{presenze.length}</h2>
        </div>

        <div style={card}>
          <h3>Ore Totali</h3>
          <h2>{totaleOre}</h2>
        </div>

        <div style={card}>
          <h3>Costo Manodopera</h3>
          <h2>
            €
            {totaleCosto.toLocaleString(
              "it-IT"
            )}
          </h2>
        </div>

        <div style={card}>
          <h3>Presenze Oggi</h3>
          <h2>{presenzeOggi}</h2>
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
        <h2>Nuova Presenza</h2>

        <select
          value={nuovaPresenza.operaio}
          onChange={(e) =>
            setNuovaPresenza({
              ...nuovaPresenza,
              operaio: e.target.value,
            })
          }
        >
          <option value="">
            Seleziona Operaio
          </option>

          {operai.map((o) => (
            <option
              key={o.id}
              value={o.nome}
            >
              {o.nome}
            </option>
          ))}
        </select>

        <br />
        <br />

        <select
          value={nuovaPresenza.cantiere}
          onChange={(e) =>
            setNuovaPresenza({
              ...nuovaPresenza,
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

        <br />
        <br />

        <input
          type="date"
          value={nuovaPresenza.data}
          onChange={(e) =>
            setNuovaPresenza({
              ...nuovaPresenza,
              data: e.target.value,
            })
          }
        />

        <br />
        <br />

        <input
          type="number"
          placeholder="Ore lavorate"
          value={nuovaPresenza.ore}
          onChange={(e) =>
            setNuovaPresenza({
              ...nuovaPresenza,
              ore: e.target.value,
            })
          }
        />

        <br />
        <br />

        <button
          onClick={aggiungiPresenza}
        >
          Salva Presenza
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h2>Storico Presenze</h2>

        <input
          placeholder="Ricerca..."
          value={ricerca}
          onChange={(e) =>
            setRicerca(e.target.value)
          }
          style={{
            marginBottom: "15px",
            width: "300px",
          }}
        />

        <table
          width="100%"
          style={{
            borderCollapse: "collapse",
            textAlign: "center",
          }}
        >
          <thead>
            <tr>
              <th>Data</th>
              <th>Operaio</th>
              <th>Cantiere</th>
              <th>Ore</th>
              <th>Costo/H</th>
              <th>Costo</th>
              <th>Azioni</th>
            </tr>
          </thead>

          <tbody>
            {presenzeFiltrate.map(
              (p) => (
                <tr key={p.id}>
                  <td>{p.data}</td>

                  <td>
                    {p.operaio}
                  </td>

                  <td>
                    {p.cantiere}
                  </td>

                  <td>{p.ore}</td>

                  <td>
                    €
                    {Number(
                      p.costoOrario
                    ).toLocaleString(
                      "it-IT"
                    )}
                  </td>

                  <td>
                    €
                    {Number(
                      p.costo
                    ).toLocaleString(
                      "it-IT"
                    )}
                  </td>

                  <td>
                    <button
                      onClick={() =>
                        eliminaPresenza(
                          p.id
                        )
                      }
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Presenze;