import { NavLink } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Camera,
  Car,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FolderOpen,
  HardHat,
  LayoutDashboard,
  Map,
  MapPinned,
  PackageCheck,
  Receipt,
  Settings,
  Truck,
  Users,
  Wallet,
  Wrench,
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
    title: "Centro Operativo",
    items: [
      { label: "Centro Operativo", icon: MapPinned, path: "/centro-operativo" },
      { label: "Calendario Interventi", icon: CalendarDays, path: "/centro-operativo/calendario-interventi" },
      { label: "Squadre e Tecnici", icon: Users, path: "/centro-operativo/squadre-tecnici" },
      { label: "Percorsi e Navigazione", icon: Map, path: "/centro-operativo/percorsi-navigazione" },
    ],
  },
  {
    title: "Produzione",
    items: [
      { label: "Cronoprogramma", icon: CalendarDays, path: "/cronoprogramma" },
      { label: "Chiamate Tecnici", icon: ClipboardCheck, path: "/chiamate-tecnici" },
      { label: "SAL", icon: BarChart3, path: "/sal" },
      { label: "Rapportini Lavori", icon: ClipboardList, path: "/rapportini" },
      { label: "Controllo Cantieri", icon: ClipboardCheck, path: "/controllo-cantieri" },
      { label: "Foto Cantieri", icon: Camera, path: "/foto-cantiere" },
      { label: "Giornale Cantiere", icon: ClipboardList, path: "/giornale-cantiere" },
      { label: "Verbali Cantiere", icon: FileText, path: "/verbali-cantiere" },
    ],
  },
  {
    title: "Acquisti e Risorse",
    items: [
      { label: "Ordini Materiali", icon: PackageCheck, path: "/ordini-materiali" },
      { label: "Magazzino", icon: Boxes, path: "/magazzino" },
      { label: "Fornitori", icon: Truck, path: "/fornitori" },
      { label: "Subappaltatori", icon: BriefcaseBusiness, path: "/subappaltatori" },
      { label: "Operai", icon: HardHat, path: "/operai" },
      { label: "Squadre", icon: Users, path: "/squadre" },
      { label: "Presenze Operai", icon: CalendarDays, path: "/presenze" },
      { label: "Mezzi Aziendali", icon: Car, path: "/mezzi" },
      { label: "Attrezzature e DPI", icon: Wrench, path: "/attrezzature" },
    ],
  },
  {
    title: "Amministrazione",
    items: [
      { label: "Contabilita", icon: Wallet, path: "/contabilita" },
      { label: "Fatture", icon: Receipt, path: "/fatture" },
      { label: "Documenti", icon: FolderOpen, path: "/documentale" },
      { label: "Impostazioni", icon: Settings, path: "/impostazioni/configurazione-sistema" },
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
