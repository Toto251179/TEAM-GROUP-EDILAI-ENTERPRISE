import { useState, useEffect } from "react";

function Subappaltatori() {
  const [cantieri, setCantieri] = useState([]);
  const [subappaltatori, setSubappaltatori] = useState([]);

  const [nuovoSub, setNuovoSub] = useState({
    ragioneSociale: "",
    partitaIVA: "",
    referente: "",
    telefono: "",
    cantiere: "",
    importo: "",
    durcScadenza: "",
  });

  useEffect(() => {
    const datiCantieri =
      JSON.parse(localStorage.getItem("cantieri")) || [];

    const datiSub =
      JSON.parse(localStorage.getItem("subappaltatori")) || [];

    setCantieri(datiCantieri);
    setSubappaltatori(datiSub);
  }, []);

  const salvaSubappaltatori = (nuovi) => {
    setSubappaltatori(nuovi);

    localStorage.setItem(
      "subappaltatori",
      JSON.stringify(nuovi)
    );
  };

  const aggiungiSubappaltatore = () => {
    if (
      !nuovoSub.ragioneSociale ||
      !nuovoSub.cantiere
    )
      return;

    const nuovo = {
      id: Date.now(),
      ...nuovoSub,
    };

    salvaSubappaltatori([
      ...subappaltatori,
      nuovo,
    ]);

    setNuovoSub({
      ragioneSociale: "",
      partitaIVA: "",
      referente: "",
      telefono: "",
      cantiere: "",
      importo: "",
      durcScadenza: "",
    });
  };

  const eliminaSubappaltatore = (id) => {
    salvaSubappaltatori(
      subappaltatori.filter(
        (s) => s.id !== id
      )
    );
  };

  const statoDurc = (data) => {
    if (!data) return "N/D";

    const oggi = new Date();
    const scadenza = new Date(data);

    const giorni =
      (scadenza - oggi) /
      (1000 * 60 * 60 * 24);

    if (giorni < 0) {
      return "❌ Scaduto";
    }

    if (giorni <= 30) {
      return "⚠️ In Scadenza";
    }

    return "✅ Valido";
  };

  return (
    <div>
      <h1>🏢 Subappaltatori PRO</h1>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
        }}
      >
        <h2>Nuovo Subappaltatore</h2>

        <input
          placeholder="Ragione Sociale"
          value={nuovoSub.ragioneSociale}
          onChange={(e) =>
            setNuovoSub({
              ...nuovoSub,
              ragioneSociale: e.target.value,
            })
          }
        />

        <br />
        <br />

        <input
          placeholder="Partita IVA"
          value={nuovoSub.partitaIVA}
          onChange={(e) =>
            setNuovoSub({
              ...nuovoSub,
              partitaIVA: e.target.value,
            })
          }
        />

        <br />
        <br />

        <input
          placeholder="Referente"
          value={nuovoSub.referente}
          onChange={(e) =>
            setNuovoSub({
              ...nuovoSub,
              referente: e.target.value,
            })
          }
        />

        <br />
        <br />

        <input
          placeholder="Telefono"
          value={nuovoSub.telefono}
          onChange={(e) =>
            setNuovoSub({
              ...nuovoSub,
              telefono: e.target.value,
            })
          }
        />

        <br />
        <br />

        <select
          value={nuovoSub.cantiere}
          onChange={(e) =>
            setNuovoSub({
              ...nuovoSub,
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
          type="number"
          placeholder="Importo Contratto €"
          value={nuovoSub.importo}
          onChange={(e) =>
            setNuovoSub({
              ...nuovoSub,
              importo: e.target.value,
            })
          }
        />

        <br />
        <br />

        <label>
          Scadenza DURC
        </label>

        <br />

        <input
          type="date"
          value={nuovoSub.durcScadenza}
          onChange={(e) =>
            setNuovoSub({
              ...nuovoSub,
              durcScadenza: e.target.value,
            })
          }
        />

        <br />
        <br />

        <button
          onClick={aggiungiSubappaltatore}
        >
          Salva Subappaltatore
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h2>Elenco Subappaltatori</h2>

        <table width="100%">
          <thead>
            <tr>
              <th>Impresa</th>
              <th>Cantiere</th>
              <th>Referente</th>
              <th>Importo</th>
              <th>DURC</th>
              <th>Azioni</th>
            </tr>
          </thead>

          <tbody>
            {subappaltatori.map((s) => (
              <tr key={s.id}>
                <td>{s.ragioneSociale}</td>
                <td>{s.cantiere}</td>
                <td>{s.referente}</td>

                <td>
                  €
                  {Number(
                    s.importo
                  ).toLocaleString("it-IT")}
                </td>

                <td>
                  {statoDurc(
                    s.durcScadenza
                  )}
                </td>

                <td>
                  <button
                    onClick={() =>
                      eliminaSubappaltatore(
                        s.id
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

export default Subappaltatori;
