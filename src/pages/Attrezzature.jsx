import { useState, useEffect } from "react";

function Attrezzature() {
  const [attrezzature, setAttrezzature] = useState([]);

  const [nuovaAttrezzatura, setNuovaAttrezzatura] =
    useState({
      descrizione: "",
      matricola: "",
      assegnatoA: "",
      verifica: "",
    });

  useEffect(() => {
    const dati =
      JSON.parse(
        localStorage.getItem("attrezzature")
      ) || [];

    setAttrezzature(dati);
  }, []);

  const salvaAttrezzature = (nuove) => {
    setAttrezzature(nuove);

    localStorage.setItem(
      "attrezzature",
      JSON.stringify(nuove)
    );
  };

  const aggiungiAttrezzatura = () => {
    if (!nuovaAttrezzatura.descrizione) return;

    salvaAttrezzature([
      ...attrezzature,
      {
        id: Date.now(),
        ...nuovaAttrezzatura,
      },
    ]);

    setNuovaAttrezzatura({
      descrizione: "",
      matricola: "",
      assegnatoA: "",
      verifica: "",
    });
  };

  const eliminaAttrezzatura = (id) => {
    salvaAttrezzature(
      attrezzature.filter(
        (a) => a.id !== id
      )
    );
  };

  const statoVerifica = (data) => {
    if (!data) return "N/D";

    const oggi = new Date();
    const scadenza = new Date(data);

    const giorni =
      (scadenza - oggi) /
      (1000 * 60 * 60 * 24);

    if (giorni < 0)
      return "❌ Scaduta";

    if (giorni <= 30)
      return "⚠️ In Scadenza";

    return "✅ Valida";
  };

  return (
    <div>
      <h1>🦺 Attrezzature e DPI</h1>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
        }}
      >
        <h2>Nuova Attrezzatura</h2>

        <input
          placeholder="Descrizione"
          value={
            nuovaAttrezzatura.descrizione
          }
          onChange={(e) =>
            setNuovaAttrezzatura({
              ...nuovaAttrezzatura,
              descrizione: e.target.value,
            })
          }
        />

        <br /><br />

        <input
          placeholder="Matricola"
          value={
            nuovaAttrezzatura.matricola
          }
          onChange={(e) =>
            setNuovaAttrezzatura({
              ...nuovaAttrezzatura,
              matricola: e.target.value,
            })
          }
        />

        <br /><br />

        <input
          placeholder="Assegnato a"
          value={
            nuovaAttrezzatura.assegnatoA
          }
          onChange={(e) =>
            setNuovaAttrezzatura({
              ...nuovaAttrezzatura,
              assegnatoA: e.target.value,
            })
          }
        />

        <br /><br />

        <label>
          Scadenza Verifica
        </label>

        <br />

        <input
          type="date"
          value={
            nuovaAttrezzatura.verifica
          }
          onChange={(e) =>
            setNuovaAttrezzatura({
              ...nuovaAttrezzatura,
              verifica: e.target.value,
            })
          }
        />

        <br /><br />

        <button
          onClick={aggiungiAttrezzatura}
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
        <h2>Archivio</h2>

        <table width="100%">
          <thead>
            <tr>
              <th>Descrizione</th>
              <th>Matricola</th>
              <th>Assegnato</th>
              <th>Verifica</th>
              <th>Stato</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {attrezzature.map((a) => (
              <tr key={a.id}>
                <td>{a.descrizione}</td>
                <td>{a.matricola}</td>
                <td>{a.assegnatoA}</td>
                <td>{a.verifica}</td>
                <td>
                  {statoVerifica(
                    a.verifica
                  )}
                </td>

                <td>
                  <button
                    onClick={() =>
                      eliminaAttrezzatura(
                        a.id
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

export default Attrezzature;