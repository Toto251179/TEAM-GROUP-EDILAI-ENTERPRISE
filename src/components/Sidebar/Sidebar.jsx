import { NavLink } from "react-router-dom";
import {
  Dashboard,
  People,
  Description,
  Calculate,
  MenuBook,
  Engineering,
  Assessment,
  AccountBalance,
  Inventory,
  LocalShipping,
  Badge,
  SmartToy,
  Settings,
} from "@mui/icons-material";

const menu = [
  { text: "Dashboard", icon: <Dashboard />, path: "/" },
  { text: "Clienti", icon: <People />, path: "/clienti" },
  { text: "Preventivi", icon: <Description />, path: "/preventivi" },
  { text: "Computi Metrici", icon: <Calculate />, path: "/computi" },
  { text: "Elenco Prezzi", icon: <MenuBook />, path: "/elenco-prezzi" },
  { text: "Cantieri", icon: <Engineering />, path: "/cantieri" },
  { text: "SAL", icon: <Assessment />, path: "/sal" },
  { text: "Contabilità", icon: <AccountBalance />, path: "/contabilita" },
  { text: "Magazzino", icon: <Inventory />, path: "/magazzino" },
  { text: "Fornitori", icon: <LocalShipping />, path: "/fornitori" },
  { text: "Operai", icon: <Badge />, path: "/operai" },
  { text: "AI Edile", icon: <SmartToy />, path: "/ai" },
  { text: "Impostazioni", icon: <Settings />, path: "/impostazioni" },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        width: 270,
        background: "#1e293b",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <div
        style={{
          padding: 25,
          borderBottom: "1px solid #334155",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: 0 }}>TEAM GROUP</h2>
        <p
          style={{
            margin: "5px 0 0",
            color: "#94a3b8",
            fontSize: 14,
          }}
        >
          EDILAI ENTERPRISE
        </p>
      </div>

      <div style={{ flex: 1, padding: 10 }}>
        {menu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 15px",
              marginBottom: 6,
              borderRadius: 10,
              color: "#fff",
              textDecoration: "none",
              background: isActive ? "#2563eb" : "transparent",
              transition: "0.2s",
            })}
          >
            {item.icon}
            <span>{item.text}</span>
          </NavLink>
        ))}
      </div>

      <div
        style={{
          padding: 15,
          borderTop: "1px solid #334155",
          fontSize: 13,
          color: "#94a3b8",
          textAlign: "center",
        }}
      >
        Versione 1.0
      </div>
    </aside>
  );
}