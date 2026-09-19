import { FileText } from "lucide-react";
import { NavLink } from "react-router-dom";
import { azienda } from "../config/azienda";

function Sidebar() {
  return (
    <aside className="enterprise-sidebar">
      <div className="enterprise-brand">
        {azienda.logoSrc ? (
          <img
            src={azienda.logoSrc}
            alt={`Logo ${azienda.ragioneSociale}`}
            style={{ width: "96px", height: "54px", objectFit: "contain", background: "white", borderRadius: "6px" }}
          />
        ) : (
          <div className="enterprise-brand-mark">{azienda.logoText}</div>
        )}
      </div>

      <nav className="enterprise-nav" aria-label="Navigazione principale">
        <div className="enterprise-nav-section">
          <p>Gestionale</p>
          <NavLink
            className={({ isActive }) =>
              isActive ? "enterprise-nav-link active" : "enterprise-nav-link"
            }
            to="/preventivi"
            title="Preventivi"
          >
            <FileText size={18} strokeWidth={2.1} />
            <span>Preventivi</span>
          </NavLink>
        </div>
      </nav>

      <div className="enterprise-sidebar-footer">
        <span>Modulo attivo</span>
        <strong>Preventivi</strong>
      </div>
    </aside>
  );
}

export default Sidebar;
