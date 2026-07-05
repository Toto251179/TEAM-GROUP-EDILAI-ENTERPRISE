import { BrowserRouter } from "react-router-dom";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AppRouter from "./router/AppRouter.jsx";

function App() {
  return (
    <BrowserRouter>
      <div className="enterprise-shell">
        <Sidebar />

        <div className="enterprise-workspace">
          <Header />

          <main className="enterprise-main">
            <AppRouter />
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
