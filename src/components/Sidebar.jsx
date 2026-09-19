import { BookOpen, Building2, FileText, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { azienda } from "../config/azienda";

const items = [
  { label: "Clienti", icon: Users, path: "/clienti" },
  { label: "Preventivi", icon: FileText, path: "/preventivi" },
  { label: "Elenco Prezzi", icon: BookOpen, path: "/elenco-prezzi" },
  { label: "Cantieri", icon: Building2, path: "/cantieri" },
];

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
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                className={({ isActive }) =>
                  isActive ? "enterprise-nav-link active" : "enterprise-nav-link"
                }
                key={item.path}
                to={item.path}
                title={item.label}
              >
                <Icon size={18} strokeWidth={2.1} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div className="enterprise-sidebar-footer">
        <span>Moduli attivi</span>
        <strong>Clienti · Preventivi · Prezzi · Cantieri</strong>
      </div>
    </aside>
  );
}

export default Sidebar;
