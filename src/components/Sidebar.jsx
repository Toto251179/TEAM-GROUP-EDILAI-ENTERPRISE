import { NavLink } from "react-router-dom";
import {
  BookOpen,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HardHat,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { azienda } from "../config/azienda";

const menuSections = [
  {
    title: "Gestionale",
    items: [
      { label: "Pannello di controllo", icon: LayoutDashboard, path: "/" },
      { label: "Clienti", icon: Users, path: "/clienti" },
      { label: "Preventivi", icon: FileText, path: "/preventivi" },
      { label: "Elenco Prezzi", icon: BookOpen, path: "/elenco-prezzi" },
      { label: "Cantieri", icon: Building2, path: "/cantieri" },
    ],
  },
  {
    title: "Produzione",
    items: [
      { label: "Chiamate Tecnici", icon: ClipboardCheck, path: "/chiamate-tecnici" },
      { label: "Rapportini", icon: ClipboardList, path: "/giornale-cantiere" },
      { label: "Operai", icon: HardHat, path: "/operai" },
      { label: "Squadre", icon: Users, path: "/squadre" },
    ],
  },
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
        {menuSections.map((section) => (
          <div className="enterprise-nav-section" key={section.title}>
            <p>{section.title}</p>

            {section.items.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  className={({ isActive }) =>
                    isActive ? "enterprise-nav-link active" : "enterprise-nav-link"
                  }
                  key={item.path}
                  to={item.path}
                  end={item.path === "/"}
                  title={item.label}
                >
                  <Icon size={18} strokeWidth={2.1} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="enterprise-sidebar-footer">
        <span>Versione operativa</span>
        <strong>Database attivo</strong>
      </div>
    </aside>
  );
}

export default Sidebar;
