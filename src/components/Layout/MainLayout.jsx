import Header from "../Header/Header";
import Sidebar from "../Sidebar/Sidebar";

export default function MainLayout({ children }) {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#f5f7fa",
        }}
      >
        <Header />

        <main
          style={{
            flex: 1,
            padding: "25px",
            overflow: "auto",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}