import { useState, useEffect } from "react";
import { jsPDF } from "jspdf";

function Preventivi() {
  const [preventivi, setPreventivi] = useState([]);

  const [nuovoPreventivo, setNuovoPreventivo] = useState({
    cliente: "",
    descrizione: "",
    importo: "",
  });

  useEffect(() => {
    const dati =
      JSON.parse(localStorage.getItem("preventivi")) || [];

    setPreventivi(dati);
  }, []);

  const salvaPreventivi = (nuoviPreventivi) => {
    setPreventivi(nuoviPreventivi);

    localStorage.setItem(
      "preventivi",
      JSON.stringify(nuoviPreventivi)
    );
  };

  const aggiungiPreventivo = () => {
    if (
      !nuovoPreventivo.cliente ||
      !nuovoPreventivo.descrizione ||
      !nuovoPreventivo.importo
    )
      return;

    const nuovo = {
      id: Date.now(),
      numero:
        "PREV-" +
        new Date().getFullYear() +
        "-" +
        Date.now(),
      data: new Date().toLocaleDateString("it-IT"),
      cliente: nuovoPreventivo.cliente,
      descrizione: nuovoPreventivo.descrizione,
      importo: Number(nuovoPreventivo.importo),
      stato: "Bozza",
    };

    salvaPreventivi([...preventivi, nuovo]);

    setNuovoPreventivo({
      cliente: "",
      descrizione: "",
      importo: "",
    });
  };

  const eliminaPreventivo = (id) => {
    const aggiornati = preventivi.filter(
      (p) => p.id !== id
    );

    salvaPreventivi(aggiornati);
  };

  const accettaPreventivo = (id) => {
    const preventivo = preventivi.find(
      (p) => p.id === id
    );

    if (!preventivo) return;

    const aggiornati = preventivi.map((p) =>
      p.id === id
        ? { ...p, stato: "Accettato" }
        : p
    );

    salvaPreventivi(aggiornati);

    const cantieri =
      JSON.parse(
        localStorage.getItem("cantieri")
      ) || [];

    const esiste = cantieri.find(
      (c) => c.preventivoId === id
    );

    if (!esiste) {
      cantieri.push({
        id: Date.now(),
        preventivoId: id,
        nome: preventivo.descrizione,
        cliente: preventivo.cliente,
        importo: preventivo.importo,
        stato: "In Corso",
      });

      localStorage.setItem(
        "cantieri",
        JSON.stringify(cantieri)
      );
    }

    alert("Preventivo accettato e cantiere creato");
  };

  const apriPreventivo = (preventivo) => {
    alert(
      `CLIENTE: ${preventivo.cliente}

DESCRIZIONE:
${preventivo.descrizione}

IMPORTO:
€ ${preventivo.importo}

STATO:
${preventivo.stato}`
    );
  };

  const generaPDF = (preventivo) => {
    const doc = new jsPDF();

    const imponibile = Number(
      preventivo.importo || 0
    );

    const iva = imponibile * 0.22;
    const totale = imponibile + iva;

    doc.setFontSize(22);
    doc.text(
      "TEAM GROUP ITALIA SRL",
      20,
      20
    );

    doc.setFontSize(16);
    doc.text("PREVENTIVO", 20, 35);

    doc.setFontSize(11);

    doc.text(
      `Numero: ${preventivo.numero}`,
      20,
      50
    );

    doc.text(
      `Data: ${preventivo.data}`,
      20,
      60
    );

    doc.text(
      `Cliente: ${preventivo.cliente}`,
      20,
      75
    );

    doc.text(
      "Descrizione lavori:",
      20,
      90
    );

    const testo = doc.splitTextToSize(
      preventivo.descrizione,
      160
    );

    doc.text(testo, 20, 100);

    doc.line(20, 140, 190, 140);

    doc.text(
      `Imponibile: € ${imponibile.toLocaleString(
        "it-IT"
      )}`,
      20,
      155
    );

    doc.text(
      `IVA 22%: € ${iva.toFixed(2)}`,
      20,
      165
    );

    doc.setFontSize(14);

    doc.text(
      `TOTALE: € ${totale.toFixed(2)}`,
      20,
      180
    );

    doc.save(`${preventivo.numero}.pdf`);
  };

  return (
    <div>
      <h1>Preventivi</h1>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "10px",
          marginBottom: "20px",
        }}
      >
        <h2>Nuovo Preventivo</h2>

        <input
          placeholder="Cliente"
          value={nuovoPreventivo.cliente}
          onChange={(e) =>
            setNuovoPreventivo({
              ...nuovoPreventivo,
              cliente: e.target.value,
            })
          }
        />

        <br />
        <br />

        <textarea
          placeholder="Descrizione lavori"
          rows="4"
          style={{ width: "400px" }}
          value={nuovoPreventivo.descrizione}
          onChange={(e) =>
            setNuovoPreventivo({
              ...nuovoPreventivo,
              descrizione: e.target.value,
            })
          }
        />

        <br />
        <br />

        <input
          type="number"
          placeholder="Importo €"
          value={nuovoPreventivo.importo}
          onChange={(e) =>
            setNuovoPreventivo({
              ...nuovoPreventivo,
              importo: e.target.value,
            })
          }
        />

        <br />
        <br />

        <button onClick={aggiungiPreventivo}>
          Salva Preventivo
        </button>
      </div>

      <table
        style={{
          width: "100%",
          background: "white",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            <th>Numero</th>
            <th>Cliente</th>
            <th>Importo</th>
            <th>Stato</th>
            <th>Azioni</th>
          </tr>
        </thead>

        <tbody>
          {preventivi.map((preventivo) => (
            <tr key={preventivo.id}>
              <td>{preventivo.numero}</td>
              <td>{preventivo.cliente}</td>
              <td>
                €
                {Number(
                  preventivo.importo
                ).toLocaleString("it-IT")}
              </td>
              <td>{preventivo.stato}</td>

              <td>
                <button
                  onClick={() =>
                    apriPreventivo(preventivo)
                  }
                >
                  Apri
                </button>

                {" "}

                <button
                  onClick={() =>
                    generaPDF(preventivo)
                  }
                >
                  PDF
                </button>

                {" "}

                <button
                  onClick={() =>
                    accettaPreventivo(
                      preventivo.id
                    )
                  }
                >
                  Accetta
                </button>

                {" "}

                <button
                  onClick={() =>
                    eliminaPreventivo(
                      preventivo.id
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
  );
}

export default Preventivi;