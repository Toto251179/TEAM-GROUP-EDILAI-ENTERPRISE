import { Database, Search, ShieldCheck } from "lucide-react";
import { azienda } from "../config/azienda";

function Header() {
  return (
    <header className="enterprise-header">
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {azienda.logoSrc ? (
          <img
            src={azienda.logoSrc}
            alt={`Logo ${azienda.ragioneSociale}`}
            style={{ width: "118px", height: "50px", objectFit: "contain" }}
          />
        ) : (
          <div className="azienda-logo">{azienda.logoText}</div>
        )}
      </div>

      <div className="enterprise-header-tools">
        <div className="enterprise-search">
          <Search size={17} />
          <span>Cerca pratica, cliente, cantiere</span>
        </div>

        <div className="enterprise-status">
          <Database size={16} />
          <span>PostgreSQL</span>
        </div>

        <div className="enterprise-status success">
          <ShieldCheck size={16} />
          <span>Operativo</span>
        </div>
      </div>
    </header>
  );
}

export default Header;
