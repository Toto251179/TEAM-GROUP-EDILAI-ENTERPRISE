import { useState, useEffect } from "react";

function Fornitori() {
  const [fornitori, setFornitori] = useState([]);
  const [ordini, setOrdini] = useState([]);
  const [ricerca, setRicerca] = useState("");

  const [nuovoFornitore, setNuovoFornitore] =
    useState({
      ragioneSociale: "",
      partitaIVA: "",
      referente: "",
      telefono: "",
      email: "",
      categoria: "Materiali Edili",
    });

  useEffect(() => {
    const datiFornitori =
      JSON.parse(
        localStorage.getItem("fornitori")
      ) || [];

    const datiOrdini =
      JSON.parse(
        localStorage.getItem("ordini")
      ) || [];

    setFornitori(datiFornitori);
    setOrdini(datiOrdini);
  }, []);

  const salvaFornitori = (
    nuoviFornitori
  ) => {
    setFornitori(nuoviFornitori);

    localStorage.setItem(
      "fornitori",
      JSON.stringify(nuoviFornitori)
    );
  };

  const aggiungiFornitore = () => {
    if (
      !nuovoFornitore.ragioneSociale
    )
      return;

    salvaFornitori([
      ...fornitori,
      {
        id: Date.now(),
        ...nuovoFornitore,
      },
    ]);

    setNuovoFornitore({
      ragioneSociale: "",
      partitaIVA: "",
      referente: "",
      telefono: "",
      email: "",
      categoria: "Materiali Edili",
    });
  };

  const eliminaFornitore = (id) => {
    salvaFornitori(
      fornitori.filter(
        (f) => f.id !== id
      )
    );
  };

  const totaleOrdini =
    ordini.reduce(
      (tot, o) =>
        tot +
        Number(o.importo || 0),
      0
    );

  const fornitoriFiltrati =
    fornitori.filter(
      (f) =>
        f.ragioneSociale
          .toLowerCase()
          .includes(
            ricerca.toLowerCase()
          ) ||
        f.referente
          .toLowerCase()
          .includes(
            ricerca.toLowerCase()
          )
    );

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
      <h1>🏢 Fornitori PRO</h1>

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
          <h3>Fornitori</h3>
          <h2>{fornitori.length}</h2>
        </div>

        <div style={card}>
          <h3>Ordini Totali</h3>
          <h2>
            €
            {totaleOrdini.toLocaleString(
              "it-IT"
            )}
          </h2>
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
        <h2>Nuovo Fornitore</h2>

        <input
          placeholder="Ragione Sociale"
          value={
            nuovoFornitore.ragioneSociale
          }
          onChange={(e) =>
            setNuovoFornitore({
              ...nuovoFornitore,
              ragioneSociale:
                e.target.value,
            })
          }
        />

        <br /><br />

        <input
          placeholder="Partita IVA"
          value={
            nuovoFornitore.partitaIVA
          }
          onChange={(e) =>
            setNuovoFornitore({
              ...nuovoFornitore,
              partitaIVA:
                e.target.value,
            })
          }
        />

        <br /><br />

        <input
          placeholder="Referente"
          value={
            nuovoFornitore.referente
          }
          onChange={(e) =>
            setNuovoFornitore({
              ...nuovoFornitore,
              referente:
                e.target.value,
            })
          }
        />

        <br /><br />

        <input
          placeholder="Telefono"
          value={
            nuovoFornitore.telefono
          }
          onChange={(e) =>
            setNuovoFornitore({
              ...nuovoFornitore,
              telefono:
                e.target.value,
            })
          }
        />

        <br /><br />

        <input
          placeholder="Email"
          value={
            nuovoFornitore.email
          }
          onChange={(e) =>
            setNuovoFornitore({
              ...nuovoFornitore,
              email:
                e.target.value,
            })
          }
        />

        <br /><br />

        <select
          value={
            nuovoFornitore.categoria
          }
          onChange={(e) =>
            setNuovoFornitore({
              ...nuovoFornitore,
              categoria:
                e.target.value,
            })
          }
        >
          <option>
            Materiali Edili
          </option>
          <option>
            Ferramenta
          </option>
          <option>
            Impianti Elettrici
          </option>
          <option>
            Impianti Idraulici
          </option>
          <option>
            Noleggi
          </option>
          <option>
            Subappalti
          </option>
        </select>

        <br /><br />

        <button
          onClick={
            aggiungiFornitore
          }
        >
          Salva Fornitore
        </button>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
        }}
      >
        <h2>Elenco Fornitori</h2>

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

        <table
          width="100%"
          style={{
            borderCollapse:
              "collapse",
          }}
        >
          <thead>
            <tr>
              <th>Ragione Sociale</th>
              <th>P.IVA</th>
              <th>Referente</th>
              <th>Telefono</th>
              <th>Email</th>
              <th>Indirizzo</th>
              <th>Categoria</th>
              <th>Origine</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {fornitoriFiltrati.map(
              (f) => (
                <tr key={f.id}>
                  <td>
                    {
                      f.ragioneSociale
                    }
                  </td>

                  <td>
                    {f.partitaIVA}
                  </td>

                  <td>
                    {f.referente}
                  </td>

                  <td>
                    {f.telefono}
                  </td>

                  <td>
                    {f.email}
                  </td>

                  <td>
                    {f.indirizzo || ""}
                  </td>

                  <td>
                    {f.categoria}
                  </td>

                  <td>
                    {f.origine || ""}
                  </td>

                  <td>
                    <button
                      onClick={() =>
                        eliminaFornitore(
                          f.id
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

export default Fornitori;
