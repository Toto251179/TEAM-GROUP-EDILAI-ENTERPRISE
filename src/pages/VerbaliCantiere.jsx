import { useState, useEffect } from "react";

function VerbaliCantiere() {
  const [cantieri, setCantieri] = useState([]);
  const [verbali, setVerbali] = useState([]);

  const [nuovoVerbale, setNuovoVerbale] = useState({
    data: new Date().toISOString().split("T")[0],
    cantiere: "",
    partecipanti: "",
    oggetto: "",
    decisioni: "",
    azioni: "",
  });

  useEffect(() => {
    const datiCantieri =
      JSON.parse(localStorage.getItem("cantieri")) || [];

    const datiVerbali =
      JSON.parse(localStorage.getItem("verbali")) || [];

    setCantieri(datiCantieri);
    setVerbali(datiVerbali);
  }, []);

  const salvaVerbali = (nuovi) => {
    setVerbali(nuovi);

    localStorage.setItem(
      "verbali",
      JSON.stringify(nuovi)
    );
  };

  const aggiungiVerbale = () => {
    if (
      !nuovoVerbale.cantiere ||
      !nuovoVerbale.oggetto
    )
      return;

    salvaVerbali([
      ...verbali,
      {
        id: Date.now(),
        ...nuovoVerbale,
      },
    ]);

    setNuovoVerbale({
      data: new Date()
        .toISOString()
        .split("T")[0],
      cantiere: "",
      partecipanti: "",
      oggetto: "",
      decisioni: "",
      azioni: "",
    });
  };

  const eliminaVerbale = (id) => {
    salvaVerbali(
      verbali.filter(
        (v) => v.id !== id
      )
    );
  };

  return (
    <div>
      <h1>📑 Verbali di Cantiere PRO</h1>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
        }}
      >
        <h2>Nuovo Verbale</h2>

        <label>Data</label>

        <br />

        <input
          type="date"
          value={nuovoVerbale.data}
          onChange={(e) =>
            setNuovoVerbale({
              ...nuovoVerbale,
              data: e.target.value,
            })
          }
        />

        <br />
        <br />

        <select
          value={nuovoVerbale.cantiere}
          onChange={(e) =>
            setNuovoVerbale({
              ...nuovoVerbale,
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
          placeholder="Partecipanti"
          value={nuovoVerbale.partecipanti}
          onChange={(e) =>
            setNuovoVerbale({
              ...nuovoVerbale,
              partecipanti:
                e.target.value,
            })
          }
        />

        <br />
        <br />

        <textarea
          rows="3"
          placeholder="Oggetto"
          value={nuovoVerbale.oggetto}
          onChange={(e) =>
            setNuovoVerbale({
              ...nuovoVerbale,
              oggetto:
                e.target.value,
            })
          }
        />

        <br />
        <br />

        <textarea
          rows="4"
          placeholder="Decisioni prese"
          value={nuovoVerbale.decisioni}
          onChange={(e) =>
            setNuovoVerbale({
              ...nuovoVerbale,
              decisioni:
                e.target.value,
            })
          }
        />

        <br />
        <br />

        <textarea
          rows="4"
          placeholder="Azioni correttive"
          value={nuovoVerbale.azioni}
          onChange={(e) =>
            setNuovoVerbale({
              ...nuovoVerbale,
              azioni:
                e.target.value,
            })
          }
        />

        <br />
        <br />

        <button
          onClick={aggiungiVerbale}
        >
          Salva Verbale
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h2>Archivio Verbali</h2>

        <table width="100%">
          <thead>
            <tr>
              <th>Data</th>
              <th>Cantiere</th>
              <th>Partecipanti</th>
              <th>Oggetto</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {verbali.map((v) => (
              <tr key={v.id}>
                <td>{v.data}</td>
                <td>{v.cantiere}</td>
                <td>
                  {v.partecipanti}
                </td>
                <td>{v.oggetto}</td>

                <td>
                  <button
                    onClick={() =>
                      eliminaVerbale(
                        v.id
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

export default VerbaliCantiere;