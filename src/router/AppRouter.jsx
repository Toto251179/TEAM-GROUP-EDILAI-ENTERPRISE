import { Navigate, Route, Routes } from "react-router-dom";
import Preventivi from "../pages/Preventivi.jsx";

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/preventivi" replace />} />
      <Route path="/preventivi" element={<Preventivi />} />
      <Route path="*" element={<Navigate to="/preventivi" replace />} />
    </Routes>
  );
}

export default AppRouter;
