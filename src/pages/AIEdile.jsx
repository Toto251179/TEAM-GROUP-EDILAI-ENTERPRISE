import { useState } from "react";
import { azienda } from "../config/azienda";

function AIEdile() {
  const [tab, setTab] = useState("preventivi");
  const [testo, setTesto] = useState("");
  const [risultato, setRisultato] = useState("");
  const [importoStimato, setImportoStimato] =
    useState(0);

  const [tipoDocumento, setTipoDocumento] =
    useState("Relazione Tecnica");

  const [documentoAI, setDocumentoAI] =
    useState("");

  const analizzaTesto = () => {
    if (!testo) return;

    const descrizione =
      testo.toLowerCase();

    let analisi;
    let importo;

    if (
      descrizione.includes("scavo")
    ) {
      importo = 3500;

      analisi = `
🏗️ ANALISI LAVORAZIONE: SCAVO

1. Scavo di sbancamento
2. Carico e trasporto materiale
3. Conferimento in discarica
4. Oneri sicurezza

IMPORTO STIMATO:
€ ${importo.toLocaleString("it-IT")}
`;
    } else if (
      descrizione.includes("facciata") ||
      descrizione.includes("intonaco")
    ) {
      importo = 25000;

      analisi = `
🏢 ANALISI LAVORAZIONE: FACCIATA

1. Ponteggio
2. Lavaggio superfici
3. Ripristino intonaci
4. Rasatura armata
5. Tinteggiatura

IMPORTO STIMATO:
€ ${importo.toLocaleString("it-IT")}
`;
    } else if (
      descrizione.includes("cappotto")
    ) {
      importo = 45000;

      analisi = `
🧱 ANALISI LAVORAZIONE: CAPPOTTO TERMICO

1. Ponteggio
2. Isolamento
3. Tassellatura
4. Rasatura
5. Finitura

IMPORTO STIMATO:
€ ${importo.toLocaleString("it-IT")}
`;
    } else if (
      descrizione.includes("balcone") ||
      descrizione.includes("poggiolo")
    ) {
      importo = 6500;

      analisi = `
🏠 ANALISI LAVORAZIONE: POGGIOLO

1. Demolizioni
2. Smaltimenti
3. Impermeabilizzazione
4. Pavimentazione
5. Ripristini

IMPORTO STIMATO:
€ ${importo.toLocaleString("it-IT")}
`;
    } else {
      importo = 5000;

      analisi = `
🤖 ANALISI GENERICA

• Allestimento cantiere
• Sicurezza
• Demolizioni
• Smaltimenti
• Ripristini
• Finiture

IMPORTO STIMATO:
€ ${importo.toLocaleString("it-IT")}
`;
    }

    setImportoStimato(importo);
    setRisultato(analisi);
  };

  const generaPreventivo = () => {
    const preventivoAI = {
      id: Date.now(),
      numero:
        "PREV-" +
        new Date().getFullYear() +
        "-" +
        Date.now(),
      data:
        new Date().toLocaleDateString(
          "it-IT"
        ),
      cliente: "Da definire",
      descrizione: testo,
      importo: importoStimato,
      stato: "Bozza",
    };

    const preventivi =
      JSON.parse(
        localStorage.getItem(
          "preventivi"
        ) || "[]"
      );

    preventivi.push(
      preventivoAI
    );

    localStorage.setItem(
      "preventivi",
      JSON.stringify(
        preventivi
      )
    );

    alert(
      "Preventivo creato correttamente."
    );
  };

  const generaDocumento = () => {
    let contenuto;

    switch (
      tipoDocumento
    ) {
      case "Relazione Tecnica":
        contenuto = `
RELAZIONE TECNICA

Oggetto:
${testo}

Si certifica che le lavorazioni saranno eseguite a regola d'arte e nel rispetto delle normative vigenti.

${azienda.ragioneSociale}
`;
        break;

      case "Verbale Sopralluogo":
        contenuto = `
VERBALE SOPRALLUOGO

Data:
${new Date().toLocaleDateString(
          "it-IT"
        )}

Descrizione:
${testo}

Esito:
Sopralluogo effettuato.
`;
        break;

      case "Verbale Fine Lavori":
        contenuto = `
VERBALE FINE LAVORI

Oggetto:
${testo}

Le lavorazioni risultano ultimate e conformi.
`;
        break;

      case "Email Professionale":
        contenuto = `
Gentile Cliente,

facendo seguito agli accordi intercorsi, si trasmette quanto richiesto.

Cordiali saluti

${azienda.ragioneSociale}
`;
        break;

      default:
        contenuto =
          "Documento non disponibile";
    }

    setDocumentoAI(
      contenuto
    );
  };

  return (
    <div>
      <h1>🤖 AI EDILE PRO</h1>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={() =>
            setTab("preventivi")
          }
        >
          Preventivi AI
        </button>

        <button
          onClick={() =>
            setTab("documenti")
          }
        >
          Documenti AI
        </button>
      </div>

      {tab === "preventivi" && (
        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "12px",
          }}
        >
          <h2>
            📊 Analisi Preventivi AI
          </h2>

          <textarea
            value={testo}
            onChange={(e) =>
              setTesto(
                e.target.value
              )
            }
            rows={8}
            style={{
              width: "100%",
              padding: "10px",
            }}
            placeholder="Descrivi la lavorazione..."
          />

          <br />
          <br />

          <button
            onClick={
              analizzaTesto
            }
          >
            Analizza
          </button>

          {risultato && (
            <div
              style={{
                marginTop: "20px",
                background:
                  "#f4f6f9",
                padding: "20px",
                borderRadius:
                  "10px",
                whiteSpace:
                  "pre-wrap",
              }}
            >
              {risultato}

              <br />
              <br />

              <button
                onClick={
                  generaPreventivo
                }
              >
                Genera Preventivo
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "documenti" && (
        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "12px",
          }}
        >
          <h2>
            📄 Generatore Documenti AI
          </h2>

          <select
            value={
              tipoDocumento
            }
            onChange={(e) =>
              setTipoDocumento(
                e.target.value
              )
            }
          >
            <option>
              Relazione Tecnica
            </option>

            <option>
              Verbale Sopralluogo
            </option>

            <option>
              Verbale Fine Lavori
            </option>

            <option>
              Email Professionale
            </option>
          </select>

          <br />
          <br />

          <textarea
            value={testo}
            onChange={(e) =>
              setTesto(
                e.target.value
              )
            }
            rows={8}
            style={{
              width: "100%",
              padding: "10px",
            }}
            placeholder="Inserisci i dati..."
          />

          <br />
          <br />

          <button
            onClick={
              generaDocumento
            }
          >
            Genera Documento
          </button>

          {documentoAI && (
            <div
              style={{
                marginTop: "20px",
                background:
                  "#f4f6f9",
                padding: "20px",
                borderRadius:
                  "10px",
                whiteSpace:
                  "pre-wrap",
              }}
            >
              {documentoAI}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AIEdile;
