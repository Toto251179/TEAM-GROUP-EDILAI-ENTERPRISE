import { azienda } from "../config/azienda";

function Report() {
  return (
    <div>
      <h1>📊 REPORT PRO</h1>

      <div
        style={{
          background: "white",
          padding: "30px",
          borderRadius: "10px",
        }}
      >
        <h2>Report Direzionale {azienda.ragioneSociale}</h2>

        <p>Modulo Report installato correttamente.</p>

        <ul>
          <li>Analisi economica</li>
          <li>Analisi cantieri</li>
          <li>Analisi SAL</li>
          <li>Margini di commessa</li>
          <li>Esportazione PDF</li>
          <li>Esportazione Excel</li>
        </ul>
      </div>
    </div>
  );
}

export default Report;
