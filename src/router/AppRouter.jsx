import { Routes, Route } from "react-router-dom";

import Dashboard from "../pages/Dashboard";
import Clienti from "../pages/Clienti";
import Preventivi from "../pages/Preventivi";
import Computi from "../pages/Computi";
import ElencoPrezzi from "../pages/ElencoPrezzi";
import Cantieri from "../pages/Cantieri";
import Contabilita from "../pages/Contabilita";
import Magazzino from "../pages/Magazzino";
import Fornitori from "../pages/Fornitori";
import Operai from "../pages/Operai";
import GiornaleCantiere from "../pages/GiornaleCantiere";
import SAL from "../pages/SAL";
import AI from "../pages/AI";
import Impostazioni from "../pages/Impostazioni";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/clienti" element={<Clienti />} />
      <Route path="/preventivi" element={<Preventivi />} />
      <Route path="/computi" element={<Computi />} />
      <Route path="/elenco-prezzi" element={<ElencoPrezzi />} />
      <Route path="/cantieri" element={<Cantieri />} />
      <Route path="/contabilita" element={<Contabilita />} />
      <Route path="/magazzino" element={<Magazzino />} />
      <Route path="/fornitori" element={<Fornitori />} />
      <Route path="/operai" element={<Operai />} />
      <Route path="/giornale-cantiere" element={<GiornaleCantiere />} />
      <Route path="/sal" element={<SAL />} />
      <Route path="/ai" element={<AI />} />
      <Route path="/impostazioni" element={<Impostazioni />} />
    </Routes>
  );
}