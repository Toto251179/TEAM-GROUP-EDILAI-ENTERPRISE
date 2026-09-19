import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  History,
  Home,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  Save,
  Upload,
  User,
} from "lucide-react";
import { apiTecnici } from "./apiTecnici";
import { ddtMaterialiService } from "../services/ddtMaterialiService";
import "./tecnici.css";

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Login({ onLogin }) {
  const [codice, setCodice] = useState("");
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(false);

  const entra = async (event) => {
    event.preventDefault();
    setErrore("");
    setCaricamento(true);

    try {
      const data = await apiTecnici.login(codice);
      localStorage.setItem("teamGroupTecniciToken", data.token);
      localStorage.setItem("teamGroupTecniciSquadra", JSON.stringify(data.squadra));
      onLogin(data.squadra);
    } catch (error) {
      setErrore(error.message);
    } finally {
      setCaricamento(false);
    }
  };

  return (
    <main className="tg-login">
      <section className="tg-login-panel">
        <img src="/logo-team-group-clean.jpg" alt="TEAM GROUP" />
        <p className="tg-eyebrow">TEAM GROUP TECNICI</p>
        <h1>Accesso squadra</h1>
        <form onSubmit={entra}>
          <label>
            Codice squadra
            <input
              autoFocus
              value={codice}
              onChange={(event) => setCodice(event.target.value)}
              placeholder="es. TEAMGROUP1"
            />
          </label>
          {errore && <p className="tg-error">{errore}</p>}
          <button type="submit" disabled={caricamento}>
            {caricamento ? "Accesso..." : "Entra"}
          </button>
        </form>
      </section>
    </main>
  );
}

const LINGUE_RAPPORTINO = ["Italiano", "Albanese", "Arabo Tunisino", "Arabo Marocchino"];
const MARGINI_CONSUNTIVO = [25, 30, 35, 40, 45, 50];

function ChiamataCard({ chiamata, selezionata, onSelect }) {
  return (
    <button className={`tg-call-card ${selezionata ? "is-active" : ""}`} onClick={() => onSelect(chiamata.id)}>
      <span className="tg-status">{chiamata.stato}</span>
      <strong>{chiamata.numeroChiamata}</strong>
      <span>{chiamata.cliente}</span>
      {chiamata.priorita && <small>Priorita: {chiamata.priorita}</small>}
      <small>{chiamata.cliente === "IP" ? chiamata.rifTicketCliente || "-" : chiamata.numeroBiglietto || "-"}</small>
      <small>Cod. Prog. {chiamata.codProg || "-"}</small>
      <small>{chiamata.indirizzo || chiamata.posizione || "-"}</small>
    </button>
  );
}

function HomeScreen({ chiamateAperte, onNavigate, onSync, caricamento }) {
  return (
    <section className="tg-home">
      <button className="tg-sync-button" onClick={onSync} disabled={caricamento}>
        <RefreshCw size={20} /> Sincronizza
      </button>

      <button className="tg-home-card" onClick={() => onNavigate("chiamate")}>
        <ClipboardList size={28} />
        <span>
          <strong>Le mie chiamate</strong>
          <small>{chiamateAperte} interventi aperti</small>
        </span>
      </button>

      <button className="tg-home-card" onClick={() => onNavigate("storico")}>
        <History size={28} />
        <span>
          <strong>Storico</strong>
          <small>Interventi chiusi</small>
        </span>
      </button>

      <button className="tg-home-card" onClick={() => onNavigate("profilo")}>
        <User size={28} />
        <span>
          <strong>Profilo</strong>
          <small>Squadra e uscita</small>
        </span>
      </button>
    </section>
  );
}

function FotoUpload({ tipo, chiamataId, onUploaded }) {
  const [caricamento, setCaricamento] = useState(false);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCaricamento(true);

    try {
      const dataUrl = await fileToDataUrl(file);
      await apiTecnici.foto(chiamataId, {
        tipo,
        nomeFile: file.name,
        mimeType: file.type,
        dataUrl,
      });
      await onUploaded();
    } finally {
      setCaricamento(false);
      event.target.value = "";
    }
  };

  return (
    <label className="tg-upload">
      <Upload size={18} />
      {caricamento ? "Carico..." : `Foto ${tipo}`}
      <input type="file" accept="image/*" capture="environment" onChange={upload} />
    </label>
  );
}

function SchedaIntervento({ chiamata, onReload, onClosed }) {
  const [noteTecnico, setNoteTecnico] = useState(chiamata.noteTecnico || "");
  const [materialeUtilizzato, setMaterialeUtilizzato] = useState(chiamata.materialeUtilizzato || "");
  const [dipendentiPresenti, setDipendentiPresenti] = useState(chiamata.dipendentiPresenti || "");
  const [oreLavorate, setOreLavorate] = useState(chiamata.oreLavorate || "");
  const [costoOrarioMedio, setCostoOrarioMedio] = useState(chiamata.costoOrarioMedio || "28");
  const [marginePercentuale, setMarginePercentuale] = useState(chiamata.marginePercentuale || "30");
  const [kmPercorsi, setKmPercorsi] = useState(chiamata.kmPercorsi || "");
  const [costoKm, setCostoKm] = useState(chiamata.costoKm || "0.75");
  const [tempoViaggio, setTempoViaggio] = useState(chiamata.tempoViaggio || "");
  const [noteChiusura, setNoteChiusura] = useState(chiamata.noteChiusura || "");
  const [materiali, setMateriali] = useState(
    Array.isArray(chiamata.materialiUsati) && chiamata.materialiUsati.length
      ? chiamata.materialiUsati
      : [{ materiale: "", quantita: "", prezzoUnitario: "" }],
  );
  const [rapportinoLingua, setRapportinoLingua] = useState(chiamata.rapportinoLingua || "Italiano");
  const [rapportino, setRapportino] = useState(chiamata.rapportinoItaliano || "");
  const [messaggio, setMessaggio] = useState("");
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(false);
  const [caricamentoDdt, setCaricamentoDdt] = useState(false);

  const fotoUfficio = useMemo(() => (chiamata.foto || []).filter((foto) => foto.tipo === "ufficio"), [chiamata.foto]);
  const fotoPrima = useMemo(() => (chiamata.foto || []).filter((foto) => foto.tipo === "prima"), [chiamata.foto]);
  const fotoDurante = useMemo(() => (chiamata.foto || []).filter((foto) => foto.tipo === "durante"), [chiamata.foto]);
  const fotoFinale = useMemo(() => (chiamata.foto || []).filter((foto) => foto.tipo === "finale"), [chiamata.foto]);

  const salva = async () => {
    setErrore("");
    setCaricamento(true);

    try {
      await apiTecnici.aggiorna(chiamata.id, {
        noteTecnico,
        materialeUtilizzato,
      });
      setMessaggio("Salvato");
      await onReload(chiamata.id);
    } catch (error) {
      setErrore(error.message);
    } finally {
      setCaricamento(false);
    }
  };

  const arrivo = async () => {
    setErrore("");
    setCaricamento(true);

    try {
      await apiTecnici.arrivo(chiamata.id);
      setMessaggio("Ora arrivo registrata");
      await onReload(chiamata.id);
    } catch (error) {
      setErrore(error.message);
    } finally {
      setCaricamento(false);
    }
  };

  const chiudi = async () => {
    if (!fotoPrima.length) {
      setErrore("Foto prima obbligatoria.");
      return;
    }
    if (!fotoFinale.length) {
      setErrore("Foto finale obbligatoria.");
      return;
    }
    if (!rapportino.trim()) {
      setErrore("Rapportino obbligatorio.");
      return;
    }
    if (!oreLavorate || Number(String(oreLavorate).replace(",", ".")) <= 0) {
      setErrore("Ore lavorate obbligatorie.");
      return;
    }
    if (!dipendentiPresenti.trim()) {
      setErrore("Dipendenti presenti obbligatori.");
      return;
    }
    if (!materialeUtilizzato.trim()) {
      setErrore("Materiale utilizzato obbligatorio. Scrivi anche 'nessun materiale'.");
      return;
    }

    const conferma = window.confirm("Chiudere l'intervento e impostarlo come COMPLETATA?");
    if (!conferma) return;

    setErrore("");
    setCaricamento(true);

    try {
      await apiTecnici.chiudi(chiamata.id, {
        noteTecnico,
        materialeUtilizzato,
        dipendentiPresenti,
        oreLavorate,
        costoOrarioMedio,
        marginePercentuale,
        kmPercorsi,
        costoKm,
        tempoViaggio,
        materiali: materiali.filter((riga) => riga.materiale || riga.quantita || riga.prezzoUnitario),
        noteChiusura,
        rapportinoLingua,
        rapportino,
      });
      setMessaggio("Intervento chiuso");
      await onClosed();
    } catch (error) {
      setErrore(error.message);
    } finally {
      setCaricamento(false);
    }
  };

  const inviaDdt = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setErrore("");
    setMessaggio("");
    setCaricamentoDdt(true);

    try {
      const ddt = await ddtMaterialiService.inviaDaTecnico(file, chiamata);
      setMessaggio(`DDT inviato all'ufficio${ddt.numeroChiamata ? ` per chiamata ${ddt.numeroChiamata}` : ""}.`);
    } catch (error) {
      setErrore(error.message || "Impossibile inviare il DDT.");
    } finally {
      setCaricamentoDdt(false);
      event.target.value = "";
    }
  };

  return (
    <section className="tg-detail">
      <div className="tg-detail-head">
        <div>
          <p className="tg-eyebrow">{chiamata.numeroChiamata}</p>
          <h2>{chiamata.cliente}</h2>
        </div>
        <span className="tg-status big">{chiamata.stato}</span>
      </div>

      <div className="tg-info-grid">
        <div>
          <small>{chiamata.cliente === "IP" ? "Rif. Ticket Cliente" : "Num. Ticket"}</small>
          <strong>{chiamata.cliente === "IP" ? chiamata.rifTicketCliente || "-" : chiamata.numeroBiglietto || "-"}</strong>
        </div>
        <div>
          <small>Cod. Prog.</small>
          <strong>{chiamata.codProg || "-"}</strong>
        </div>
        <div>
          <small>Arrivo</small>
          <strong>{formatDateTime(chiamata.oraArrivo)}</strong>
        </div>
        <div>
          <small>Fine</small>
          <strong>{formatDateTime(chiamata.oraFine)}</strong>
        </div>
      </div>

      <div className="tg-section">
        <h3>Indirizzo</h3>
        <p>{chiamata.indirizzo || chiamata.posizione || "-"}</p>
      </div>

      <div className="tg-section location">
        <MapPin size={18} />
        <span>{chiamata.posizione || "-"}</span>
      </div>

      <div className="tg-actions two">
        <a className="tg-button light" href={chiamata.linkGoogleMaps || "#"} target="_blank" rel="noreferrer">
          <Navigation size={18} /> Apri Maps
        </a>
        <button className="tg-button light" onClick={arrivo} disabled={caricamento || Boolean(chiamata.oraArrivo)}>
          <Clock size={18} /> Arrivo
        </button>
      </div>

      <div className="tg-section">
        <h3>Descrizione lavori</h3>
        <p>{chiamata.descrizioneLavori || "-"}</p>
      </div>

      <div className="tg-section">
        <h3>Priorita</h3>
        <p>{chiamata.priorita || "-"}</p>
      </div>

      <div className="tg-section">
        <h3>Foto ricevute dall'ufficio</h3>
        {fotoUfficio.length ? (
          <div className="tg-thumbs">
            {fotoUfficio.map((foto) => (
              <a key={foto.id} href={foto.dataUrl} target="_blank" rel="noreferrer">
                <img src={foto.dataUrl} alt={foto.nomeFile || "Foto ufficio"} />
              </a>
            ))}
          </div>
        ) : (
          <p>Nessuna foto ricevuta.</p>
        )}
      </div>

      <div className="tg-section">
        <h3>Note operative</h3>
        <p>{chiamata.noteUfficio || "-"}</p>
      </div>

      <div className="tg-section">
        <h3>Foto intervento</h3>
        <div className="tg-actions three">
          <FotoUpload tipo="prima" chiamataId={chiamata.id} onUploaded={() => onReload(chiamata.id)} />
          <FotoUpload tipo="durante" chiamataId={chiamata.id} onUploaded={() => onReload(chiamata.id)} />
          <FotoUpload tipo="finale" chiamataId={chiamata.id} onUploaded={() => onReload(chiamata.id)} />
        </div>
        <div className="tg-photo-counts">
          <span><Camera size={15} /> Prima: {fotoPrima.length}</span>
          <span><Camera size={15} /> Durante: {fotoDurante.length}</span>
          <span><Camera size={15} /> Finale: {fotoFinale.length}</span>
        </div>
      </div>

      <label className="tg-field">
        Note tecnico
        <textarea value={noteTecnico} onChange={(event) => setNoteTecnico(event.target.value)} />
      </label>

      <label className="tg-field">
        Materiale utilizzato
        <textarea
          value={materialeUtilizzato}
          onChange={(event) => setMaterialeUtilizzato(event.target.value)}
          placeholder="Scrivi anche: nessun materiale"
        />
      </label>

      <label className="tg-field">
        Dipendenti presenti
        <textarea
          value={dipendentiPresenti}
          onChange={(event) => setDipendentiPresenti(event.target.value)}
          placeholder="Nomi dei tecnici presenti"
        />
      </label>

      <div className="tg-info-grid">
        <label className="tg-field">
          Ore lavorate
          <input inputMode="decimal" value={oreLavorate} onChange={(event) => setOreLavorate(event.target.value)} />
        </label>
        <label className="tg-field">
          Costo orario medio
          <input inputMode="decimal" value={costoOrarioMedio} onChange={(event) => setCostoOrarioMedio(event.target.value)} />
        </label>
        <label className="tg-field">
          Margine azienda
          <select value={marginePercentuale} onChange={(event) => setMarginePercentuale(event.target.value)}>
            {MARGINI_CONSUNTIVO.map((percentuale) => (
              <option key={percentuale} value={percentuale}>{percentuale}%</option>
            ))}
          </select>
        </label>
        <label className="tg-field">
          Km percorsi
          <input inputMode="decimal" value={kmPercorsi} onChange={(event) => setKmPercorsi(event.target.value)} />
        </label>
        <label className="tg-field">
          Costo €/km
          <input inputMode="decimal" value={costoKm} onChange={(event) => setCostoKm(event.target.value)} />
        </label>
        <label className="tg-field">
          Tempo viaggio
          <input value={tempoViaggio} onChange={(event) => setTempoViaggio(event.target.value)} placeholder="es. 1h" />
        </label>
      </div>

      <div className="tg-section">
        <h3>Materiali usati</h3>
        <label className="tg-upload">
          <Upload size={18} />
          {caricamentoDdt ? "Invio DDT..." : "Foto DDT"}
          <input type="file" accept="image/*,.pdf,application/pdf" capture="environment" onChange={inviaDdt} />
        </label>
        <p className="tg-help">
          La foto del DDT viene inviata all'ufficio e agganciata alla chiamata/codice progetto.
        </p>
        {materiali.map((riga, index) => (
          <div className="tg-info-grid" key={`materiale-${index}`}>
            <label className="tg-field">
              Materiale
              <input
                value={riga.materiale}
                onChange={(event) => setMateriali((attuali) => attuali.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, materiale: event.target.value } : item
                )))}
              />
            </label>
            <label className="tg-field">
              Quantita
              <input
                inputMode="decimal"
                value={riga.quantita}
                onChange={(event) => setMateriali((attuali) => attuali.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, quantita: event.target.value } : item
                )))}
              />
            </label>
            <label className="tg-field">
              Prezzo unitario
              <input
                inputMode="decimal"
                value={riga.prezzoUnitario}
                onChange={(event) => setMateriali((attuali) => attuali.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, prezzoUnitario: event.target.value } : item
                )))}
              />
            </label>
          </div>
        ))}
        <button
          className="tg-button light"
          type="button"
          onClick={() => setMateriali((attuali) => [...attuali, { materiale: "", quantita: "", prezzoUnitario: "" }])}
        >
          Aggiungi materiale
        </button>
      </div>

      <label className="tg-field">
        Note chiusura
        <textarea value={noteChiusura} onChange={(event) => setNoteChiusura(event.target.value)} />
      </label>

      <label className="tg-field">
        Lingua rapportino
        <select value={rapportinoLingua} onChange={(event) => setRapportinoLingua(event.target.value)}>
          {LINGUE_RAPPORTINO.map((lingua) => (
            <option key={lingua} value={lingua}>
              {lingua}
            </option>
          ))}
        </select>
      </label>

      <label className="tg-field">
        Rapportino
        <textarea
          value={rapportino}
          onChange={(event) => setRapportino(event.target.value)}
          placeholder="Descrivi il lavoro eseguito"
        />
      </label>

      {errore && <p className="tg-error">{errore}</p>}
      {messaggio && <p className="tg-ok">{messaggio}</p>}

      <div className="tg-bottom-actions">
        <button className="tg-button light" onClick={salva} disabled={caricamento}>
          <Save size={18} /> Salva
        </button>
        <button className="tg-button success" onClick={chiudi} disabled={caricamento}>
          <CheckCircle2 size={18} /> Chiudi Intervento
        </button>
      </div>
    </section>
  );
}

function ListaChiamate({ chiamate, selezionataId, scheda, caricamento, onRefresh, onSelect, onReload, onClosed }) {
  return (
    <>
      <section className="tg-list-head">
        <div>
          <h2>Le mie chiamate</h2>
          <p>{chiamate.length} interventi aperti</p>
        </div>
        <button className="tg-icon-button" onClick={onRefresh} disabled={caricamento} title="Aggiorna">
          <RefreshCw size={20} />
        </button>
      </section>

      <section className="tg-calls">
        {chiamate.map((chiamata) => (
          <ChiamataCard
            key={chiamata.id}
            chiamata={chiamata}
            selezionata={chiamata.id === selezionataId}
            onSelect={onSelect}
          />
        ))}
        {!caricamento && chiamate.length === 0 && <p className="tg-empty">Nessuna chiamata assegnata.</p>}
      </section>

      {scheda && (
        <SchedaIntervento
          key={scheda.id}
          chiamata={scheda}
          onReload={onReload}
          onClosed={onClosed}
        />
      )}
    </>
  );
}

function StoricoScreen() {
  const [ricerca, setRicerca] = useState("");
  const [storico, setStorico] = useState([]);
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(false);

  const caricaStorico = useCallback(async (cerca = ricerca) => {
    setCaricamento(true);
    setErrore("");

    try {
      setStorico(await apiTecnici.storico(cerca));
    } catch (error) {
      setErrore(error.message);
    } finally {
      setCaricamento(false);
    }
  }, [ricerca]);

  useEffect(() => {
    caricaStorico("");
  }, [caricaStorico]);

  const cerca = (event) => {
    event.preventDefault();
    caricaStorico(ricerca);
  };

  return (
    <section className="tg-panel">
      <div className="tg-list-head flat">
        <div>
          <h2>Storico</h2>
          <p>{storico.length} interventi chiusi</p>
        </div>
      </div>

      <form className="tg-search" onSubmit={cerca}>
        <input
          value={ricerca}
          onChange={(event) => setRicerca(event.target.value)}
          placeholder="Cerca cliente o numero chiamata"
        />
        <button className="tg-button light" type="submit" disabled={caricamento}>Cerca</button>
      </form>

      {errore && <p className="tg-error">{errore}</p>}

      <div className="tg-calls">
        {storico.map((chiamata) => (
          <article className="tg-call-card readonly" key={chiamata.id}>
            <span className="tg-status">{chiamata.stato}</span>
            <strong>{chiamata.numeroChiamata}</strong>
            <span>{chiamata.cliente}</span>
            <small>{chiamata.cliente === "IP" ? chiamata.rifTicketCliente || "-" : chiamata.numeroBiglietto || "-"}</small>
            <small>Cod. Prog. {chiamata.codProg || "-"}</small>
            <small>Chiuso: {formatDateTime(chiamata.oraFine)}</small>
          </article>
        ))}
        {!caricamento && storico.length === 0 && <p className="tg-empty">Nessun intervento chiuso.</p>}
      </div>
    </section>
  );
}

function ProfiloScreen({ squadra, onLogout }) {
  return (
    <section className="tg-panel">
      <div className="tg-profile-card">
        <User size={38} />
        <p className="tg-eyebrow">Profilo</p>
        <h2>{squadra.nome}</h2>
        <p>Accesso tecnico limitato alle chiamate assegnate alla squadra.</p>
        <button className="tg-button danger" onClick={onLogout}>
          <LogOut size={18} /> Logout
        </button>
      </div>
    </section>
  );
}

function TecniciApp() {
  const [squadra, setSquadra] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("teamGroupTecniciSquadra") || "null");
    } catch {
      return null;
    }
  });
  const [chiamate, setChiamate] = useState([]);
  const [selezionataId, setSelezionataId] = useState(null);
  const [scheda, setScheda] = useState(null);
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(false);
  const [vista, setVista] = useState("home");

  const logout = useCallback(() => {
    localStorage.removeItem("teamGroupTecniciToken");
    localStorage.removeItem("teamGroupTecniciSquadra");
    setSquadra(null);
    setChiamate([]);
    setScheda(null);
    setSelezionataId(null);
    setVista("home");
  }, []);

  const caricaChiamate = useCallback(async () => {
    if (!localStorage.getItem("teamGroupTecniciToken")) return;
    setCaricamento(true);
    setErrore("");

    try {
      const data = await apiTecnici.chiamate();
      setChiamate(data);
      const prossimoId = data.some((chiamata) => chiamata.id === selezionataId) ? selezionataId : data[0]?.id || null;
      setSelezionataId(prossimoId);
      if (prossimoId) {
        const dettaglio = await apiTecnici.chiamata(prossimoId);
        setScheda(dettaglio);
      } else {
        setScheda(null);
      }
    } catch (error) {
      setErrore(error.message);
      if (error.message.includes("Accesso") || error.message.includes("autorizzata")) logout();
    } finally {
      setCaricamento(false);
    }
  }, [logout, selezionataId]);

  const caricaScheda = async (id) => {
    setSelezionataId(id);
    const dettaglio = await apiTecnici.chiamata(id);
    setScheda(dettaglio);
    setVista("chiamate");
  };

  useEffect(() => {
    if (!squadra) return undefined;
    const timer = window.setTimeout(() => {
      caricaChiamate();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [squadra, caricaChiamate]);

  if (!squadra) return <Login onLogin={setSquadra} />;

  return (
    <main className="tg-app">
      <header className="tg-topbar">
        <div>
          <p className="tg-eyebrow">TEAM GROUP TECNICI</p>
          <h1>{squadra.nome}</h1>
        </div>
        <div className="tg-top-actions">
          <button className="tg-icon-button" onClick={() => setVista("home")} title="Home">
            <Home size={20} />
          </button>
          <button className="tg-icon-button" onClick={logout} title="Esci">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {errore && <p className="tg-error">{errore}</p>}

      {vista === "home" && (
        <HomeScreen
          chiamateAperte={chiamate.length}
          onNavigate={setVista}
          onSync={caricaChiamate}
          caricamento={caricamento}
        />
      )}

      {vista === "chiamate" && (
        <ListaChiamate
          chiamate={chiamate}
          selezionataId={selezionataId}
          scheda={scheda}
          caricamento={caricamento}
          onRefresh={caricaChiamate}
          onSelect={caricaScheda}
          onReload={caricaScheda}
          onClosed={async () => {
            await caricaChiamate();
            setVista("home");
          }}
        />
      )}

      {vista === "storico" && <StoricoScreen />}

      {vista === "profilo" && (
        <ProfiloScreen
          squadra={squadra}
          onLogout={logout}
        />
      )}
    </main>
  );
}

export default TecniciApp;
