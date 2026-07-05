import { Link } from "react-router-dom";
import { azienda } from "../config/azienda";

function Sidebar() {
  return (
    <div
      style={{
        width: "250px",
        background: "#1f2937",
        color: "white",
        minHeight: "100vh",
        padding: "20px",
        overflowY: "auto",
      }}
    >
      <h2>{azienda.ragioneSociale}</h2>
      <h3>{azienda.partitaIva}</h3>

      <hr />

      <p><Link to="/" style={{ color: "white", textDecoration: "none" }}>🏠 Dashboard</Link></p>

      <p><Link to="/clienti" style={{ color: "white", textDecoration: "none" }}>👥 Clienti</Link></p>

      <p><Link to="/preventivi" style={{ color: "white", textDecoration: "none" }}>📄 Preventivi</Link></p>

      <p><Link to="/cantieri" style={{ color: "white", textDecoration: "none" }}>🏗️ Cantieri</Link></p>

      <p><Link to="/contabilita" style={{ color: "white", textDecoration: "none" }}>💰 Contabilità</Link></p>

      <p><Link to="/fatture" style={{ color: "white", textDecoration: "none" }}>🧾 Fatture</Link></p>

      <p><Link to="/sal" style={{ color: "white", textDecoration: "none" }}>📊 SAL</Link></p>

      <p><Link to="/ordini-materiali" style={{ color: "white", textDecoration: "none" }}>📦 Ordini Materiali</Link></p>

      <p><Link to="/magazzino" style={{ color: "white", textDecoration: "none" }}>📦 Magazzino</Link></p>

      <p><Link to="/fornitori" style={{ color: "white", textDecoration: "none" }}>🚚 Fornitori</Link></p>

      <p><Link to="/giornale-cantiere" style={{ color: "white", textDecoration: "none" }}>📋 Giornale Cantiere</Link></p>

      <p><Link to="/operai" style={{ color: "white", textDecoration: "none" }}>👷 Operai</Link></p>

      <p><Link to="/presenze" style={{ color: "white", textDecoration: "none" }}>🕒 Presenze Operai</Link></p>

      <p><Link to="/controllo-cantieri" style={{ color: "white", textDecoration: "none" }}>📈 Controllo Cantieri</Link></p>

      <p><Link to="/mezzi" style={{ color: "white", textDecoration: "none" }}>🚛 Mezzi Aziendali</Link></p>

      <p><Link to="/scadenziario" style={{ color: "white", textDecoration: "none" }}>📑 Scadenziario</Link></p>

      <p><Link to="/sicurezza" style={{ color: "white", textDecoration: "none" }}>🦺 Sicurezza PRO</Link></p>

      <p><Link to="/ai-edile" style={{ color: "white", textDecoration: "none" }}>🧠 AI Edile</Link></p>

      <p><Link to="/report" style={{ color: "white", textDecoration: "none" }}>📊 Report PRO</Link></p>
    </div>
  );
}

export default Sidebar;
