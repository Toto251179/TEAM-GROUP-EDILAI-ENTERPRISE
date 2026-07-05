import { Route, Routes } from "react-router-dom";

import AIEdile from "../pages/AIEdile.jsx";
import Attrezzature from "../pages/Attrezzature.jsx";
import Cantieri from "../pages/Cantieri.jsx";
import ChiamateTecnici from "../pages/ChiamateTecnici.jsx";
import ChiamateGiornaliere from "../pages/ChiamateGiornaliere.jsx";
import Clienti from "../pages/Clienti.jsx";
import Contabilita from "../pages/Contabilita.jsx";
import Consuntivazione from "../pages/Consuntivazione.jsx";
import ControlloCantieri from "../pages/ControlloCantieri.jsx";
import Cronoprogramma from "../pages/Cronoprogramma.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import Documentale from "../pages/Documentale.jsx";
import ElencoPrezzi from "../pages/ElencoPrezzi.jsx";
import Fatture from "../pages/Fatture.jsx";
import Fornitori from "../pages/Fornitori.jsx";
import FotoCantiere from "../pages/FotoCantiere.jsx";
import GiornaleCantiere from "../pages/GiornaleCantiere.jsx";
import InboxLavori from "../pages/InboxLavori.jsx";
import Magazzino from "../pages/Magazzino.jsx";
import Mezzi from "../pages/Mezzi.jsx";
import Operai from "../pages/Operai.jsx";
import OrdiniMateriali from "../pages/OrdiniMateriali.jsx";
import Presenze from "../pages/Presenze.jsx";
import Preventivi from "../pages/Preventivi.jsx";
import Report from "../pages/Report.jsx";
import RiepilogoOreChiamate from "../pages/RiepilogoOreChiamate.jsx";
import SAL from "../pages/SAL.jsx";
import Scadenziario from "../pages/Scadenziario.jsx";
import Sicurezza from "../pages/Sicurezza.jsx";
import Squadre from "../pages/Squadre.jsx";
import Subappaltatori from "../pages/Subappaltatori.jsx";
import VerbaliCantiere from "../pages/VerbaliCantiere.jsx";

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/inbox-lavori" element={<InboxLavori />} />
      <Route path="/clienti" element={<Clienti />} />
      <Route path="/preventivi" element={<Preventivi />} />
      <Route path="/elenco-prezzi" element={<ElencoPrezzi />} />
      <Route path="/cantieri" element={<Cantieri />} />
      <Route path="/chiamate-tecnici" element={<ChiamateTecnici />} />
      <Route path="/chiamate-giornaliere" element={<ChiamateGiornaliere />} />
      <Route path="/riepilogo-ore-chiamate" element={<RiepilogoOreChiamate />} />
      <Route path="/squadre" element={<Squadre />} />
      <Route path="/cronoprogramma" element={<Cronoprogramma />} />
      <Route path="/subappaltatori" element={<Subappaltatori />} />
      <Route path="/attrezzature" element={<Attrezzature />} />
      <Route path="/documentale" element={<Documentale />} />
      <Route path="/foto-cantiere" element={<FotoCantiere />} />
      <Route path="/verbali-cantiere" element={<VerbaliCantiere />} />
      <Route path="/contabilita" element={<Contabilita />} />
      <Route path="/consuntivazione" element={<Consuntivazione />} />
      <Route path="/fatture" element={<Fatture />} />
      <Route path="/sal" element={<SAL />} />
      <Route path="/ordini-materiali" element={<OrdiniMateriali />} />
      <Route path="/magazzino" element={<Magazzino />} />
      <Route path="/fornitori" element={<Fornitori />} />
      <Route path="/giornale-cantiere" element={<GiornaleCantiere />} />
      <Route path="/operai" element={<Operai />} />
      <Route path="/presenze" element={<Presenze />} />
      <Route path="/controllo-cantieri" element={<ControlloCantieri />} />
      <Route path="/mezzi" element={<Mezzi />} />
      <Route path="/scadenziario" element={<Scadenziario />} />
      <Route path="/sicurezza" element={<Sicurezza />} />
      <Route path="/ai-edile" element={<AIEdile />} />
      <Route path="/report" element={<Report />} />
    </Routes>
  );
}

export default AppRouter;
