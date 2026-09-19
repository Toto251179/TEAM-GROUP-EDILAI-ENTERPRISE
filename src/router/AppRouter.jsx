import { Navigate, Route, Routes } from "react-router-dom";

import Clienti from "../pages/Clienti.jsx";
import Preventivi from "../pages/Preventivi.jsx";
import ElencoPrezzi from "../pages/ElencoPrezzi.jsx";
import Cantieri from "../pages/Cantieri.jsx";

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/preventivi" replace />} />
      <Route path="/clienti" element={<Clienti />} />
      <Route path="/preventivi" element={<Preventivi />} />
      <Route path="/elenco-prezzi" element={<ElencoPrezzi />} />
      <Route path="/cantieri" element={<Cantieri />} />
      <Route path="*" element={<Navigate to="/preventivi" replace />} />
    </Routes>
  );
}

export default AppRouter;
