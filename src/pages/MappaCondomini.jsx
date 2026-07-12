import { useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE_URL } from "../services/api";

const rawGoogleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAPS_API_KEY = rawGoogleMapsApiKey === "INSERIRE_QUI_LA_CHIAVE_REALE" ? "" : rawGoogleMapsApiKey;
const VICENZA_CENTER = { lat: 45.5455, lng: 11.5354 };
let googleMapsPromise = null;

const markerColors = {
  arancione: "#f97316",
  verde: "#16a34a",
  blu: "#2563eb",
  grigio: "#64748b",
  rosso: "#dc2626",
};

const filtriVuoti = {
  search: "",
  comune: "",
  provincia: "",
  amministratore: "",
  soloChiamateAperte: false,
  soloCantieriAttivi: false,
  soloPreventivi: false,
  soloSenzaCoordinate: false,
};

function googleMapsUrl(condominio) {
  const query = condominio.latitudine && condominio.longitudine
    ? `${condominio.latitudine},${condominio.longitudine}`
    : condominio.indirizzoCompleto || condominio.ragioneSociale;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "")}`;
}

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector("script[data-team-google-maps]");
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.google.maps), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Chiave Google Maps non valida o Maps JavaScript API non abilitata.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.dataset.teamGoogleMaps = "true";
      script.async = true;
      script.defer = true;
      script.src = apiKey
        ? `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
        : `${API_BASE_URL}/system-settings/google-maps.js`;
      script.onload = () => resolve(window.google.maps);
      script.onerror = () => reject(new Error("Chiave Google Maps non valida o Maps JavaScript API non abilitata."));
      document.head.appendChild(script);
    });
  }
  return googleMapsPromise;
}

function markerDaAttivita(cliente) {
  if (!cliente.latitudine || !cliente.longitudine) return "rosso";
  if (cliente.chiamateAperte > 0) return "arancione";
  if (cliente.cantieriAttivi > 0) return "verde";
  if (cliente.preventiviInCorso > 0) return "blu";
  return "grigio";
}

function normalizzaClienteFallback(cliente, preventivi = [], cantieri = [], chiamate = []) {
  const clienteId = String(cliente.id || "");
  const clienteCode = cliente.clienteCode || "";
  const nome = cliente.ragioneSociale || "";
  const preventiviCliente = preventivi.filter((preventivo) =>
    String(preventivo.clienteId || "") === clienteId ||
    String(preventivo.clienteCode || "") === clienteCode ||
    String(preventivo.cliente || "").toLowerCase().trim() === nome.toLowerCase().trim()
  );
  const cantieriCliente = cantieri.filter((cantiere) =>
    String(cantiere.clienteId || "") === clienteId ||
    String(cantiere.clienteCode || "") === clienteCode ||
    String(cantiere.cliente || "").toLowerCase().trim() === nome.toLowerCase().trim()
  );
  const chiamateCliente = chiamate.filter((chiamata) =>
    String(chiamata.clienteCode || "") === clienteCode ||
    String(chiamata.cliente || "").toLowerCase().trim() === nome.toLowerCase().trim()
  );
  const normalizzato = {
    ...cliente,
    idCliente: clienteCode,
    amministratore: cliente.associazione || "",
    emailPrincipale: cliente.email || "",
    indirizzoCompleto: [cliente.indirizzo, cliente.cap, cliente.comune, cliente.provincia].filter(Boolean).join(" "),
    preventiviCount: preventiviCliente.length,
    preventiviInCorso: preventiviCliente.filter((preventivo) => !["Accettato", "Annullato"].includes(preventivo.stato || "")).length,
    cantieriAttivi: cantieriCliente.filter((cantiere) => !["Chiuso", "Completato", "Annullato"].includes(cantiere.stato || "")).length,
    chiamateAperte: chiamateCliente.filter((chiamata) => !["Completata", "Completato", "Annullata"].includes(chiamata.stato || "")).length,
  };
  return { ...normalizzato, marker: markerDaAttivita(normalizzato) };
}

function MappaCondomini() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [condomini, setCondomini] = useState([]);
  const [stats, setStats] = useState(null);
  const [filtri, setFiltri] = useState(filtriVuoti);
  const [selezionatoId, setSelezionatoId] = useState("");
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [googleMapsConfigured, setGoogleMapsConfigured] = useState(false);
  const [mapsErrore, setMapsErrore] = useState("");

  const caricaDati = async () => {
    setErrore("");
    setCaricamento(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filtri).forEach(([key, value]) => {
        if (typeof value === "boolean") {
          if (value) params.set(key, "true");
        } else if (String(value || "").trim()) {
          params.set(key, value);
        }
      });

      try {
        const [mappa, statistiche] = await Promise.all([
          api.get(`/condomini/mappa?${params.toString()}`),
          api.get("/condomini/stats"),
        ]);
        setCondomini(mappa.items || []);
        setStats(statistiche);
        setLastSync(mappa.lastSync || new Date().toISOString());
        setGoogleMapsConfigured(Boolean(GOOGLE_MAPS_API_KEY));
        setSelezionatoId((corrente) => corrente || mappa.items?.[0]?.id || "");
      } catch (error) {
        if (!String(error.message || "").toLowerCase().includes("endpoint non trovato")) throw error;

        const [clientiDb, preventiviDb, cantieriDb, chiamateResult] = await Promise.all([
          api.get("/clienti"),
          api.get("/preventivi"),
          api.get("/cantieri"),
          api.get("/tecnici/ufficio/chiamate").catch(() => []),
        ]);
        let items = clientiDb.map((cliente) => normalizzaClienteFallback(cliente, preventiviDb, cantieriDb, chiamateResult));
        const search = filtri.search.toLowerCase().trim();
        if (search) {
          items = items.filter((item) =>
            [item.clienteCode, item.ragioneSociale, item.referente, item.amministratore, item.telefono, item.emailPrincipale]
              .join(" ")
              .toLowerCase()
              .includes(search),
          );
        }
        if (filtri.comune) items = items.filter((item) => item.comune === filtri.comune);
        if (filtri.provincia) items = items.filter((item) => item.provincia === filtri.provincia);
        if (filtri.amministratore) items = items.filter((item) => String(item.amministratore || "").toLowerCase().includes(filtri.amministratore.toLowerCase()));
        if (filtri.soloSenzaCoordinate) items = items.filter((item) => !item.latitudine || !item.longitudine);
        if (filtri.soloCantieriAttivi) items = items.filter((item) => item.cantieriAttivi > 0);
        if (filtri.soloChiamateAperte) items = items.filter((item) => item.chiamateAperte > 0);
        if (filtri.soloPreventivi) items = items.filter((item) => item.preventiviInCorso > 0);

        setCondomini(items);
        setStats({
          totaleCondomini: clientiDb.length,
          cantieriAttivi: clientiDb.map((cliente) => normalizzaClienteFallback(cliente, preventiviDb, cantieriDb, chiamateResult)).filter((item) => item.cantieriAttivi > 0).length,
          chiamateAperte: clientiDb.map((cliente) => normalizzaClienteFallback(cliente, preventiviDb, cantieriDb, chiamateResult)).filter((item) => item.chiamateAperte > 0).length,
          preventiviInCorso: clientiDb.map((cliente) => normalizzaClienteFallback(cliente, preventiviDb, cantieriDb, chiamateResult)).filter((item) => item.preventiviInCorso > 0).length,
          senzaCoordinate: clientiDb.filter((cliente) => !cliente.latitudine || !cliente.longitudine).length,
        });
        setLastSync(new Date().toISOString());
        setGoogleMapsConfigured(Boolean(GOOGLE_MAPS_API_KEY));
        setSelezionatoId((corrente) => corrente || items[0]?.id || "");
        setErrore("");
      }
    } catch (error) {
      setErrore(error.message);
    } finally {
      setCaricamento(false);
    }
  };

  useEffect(() => {
    caricaDati();
  }, []);

  useEffect(() => {
    let active = true;

    async function renderMap() {
      if (!mapRef.current) return;
      try {
        const maps = await loadGoogleMaps(GOOGLE_MAPS_API_KEY);
        if (!maps) throw new Error(window.__TEAM_GOOGLE_MAPS_ERROR__ || "Google Maps non configurato.");
        if (!active || !mapRef.current) return;
        setMapsErrore("");
        setGoogleMapsConfigured(true);

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new maps.Map(mapRef.current, {
            center: VICENZA_CENTER,
            zoom: 10,
            mapTypeControl: true,
            streetViewControl: true,
            fullscreenControl: true,
          });
        }

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        const bounds = new maps.LatLngBounds();
        let markersCount = 0;
        condomini.forEach((condominio) => {
          const lat = Number(condominio.latitudine);
          const lng = Number(condominio.longitudine);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

          const marker = new maps.Marker({
            map: mapInstanceRef.current,
            position: { lat, lng },
            title: `${condominio.clienteCode || ""} - ${condominio.ragioneSociale || ""}`.trim(),
            icon: {
              path: maps.SymbolPath.CIRCLE,
              fillColor: markerColors[condominio.marker] || markerColors.grigio,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
              scale: 8,
            },
          });
          marker.addListener("click", () => setSelezionatoId(condominio.id));
          markersRef.current.push(marker);
          bounds.extend({ lat, lng });
          markersCount += 1;
        });

        if (markersCount > 0) {
          mapInstanceRef.current.fitBounds(bounds);
        } else {
          mapInstanceRef.current.setCenter(VICENZA_CENTER);
          mapInstanceRef.current.setZoom(10);
        }
      } catch (error) {
        if (active) setMapsErrore(error.message || "Errore caricamento Google Maps.");
      }
    }

    renderMap();
    return () => {
      active = false;
    };
  }, [condomini]);

  const comuni = useMemo(() => [...new Set(condomini.map((item) => item.comune).filter(Boolean))].sort(), [condomini]);
  const province = useMemo(() => [...new Set(condomini.map((item) => item.provincia).filter(Boolean))].sort(), [condomini]);
  const selezionato = condomini.find((item) => String(item.id) === String(selezionatoId)) || condomini[0];

  const aggiornaFiltro = (campo, valore) => setFiltri((corrente) => ({ ...corrente, [campo]: valore }));

  const apriSchedaCliente = () => {
    if (selezionato?.id) window.location.href = `/clienti?clienteId=${encodeURIComponent(selezionato.id)}`;
  };

  const apriPreventivi = () => {
    if (selezionato?.id) window.location.href = `/preventivi?clienteId=${encodeURIComponent(selezionato.id)}&clienteCode=${encodeURIComponent(selezionato.clienteCode || "")}&cliente=${encodeURIComponent(selezionato.ragioneSociale || "")}`;
  };

  const apriChiamate = () => {
    if (selezionato?.clienteCode) window.location.href = `/chiamate-tecnici?clienteCode=${encodeURIComponent(selezionato.clienteCode)}`;
  };

  return (
    <div className="mappa-condomini-page">
      <div className="mappa-heading">
        <div>
          <h1>Mappa Condomini</h1>
          <p>Clienti condominiali, cantieri, chiamate e preventivi collegati.</p>
        </div>
        <input
          placeholder="Ricerca cliente, ID, referente o amministratore"
          value={filtri.search}
          onChange={(event) => aggiornaFiltro("search", event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") caricaDati();
          }}
        />
      </div>

      {errore && <p className="mappa-error">{errore}</p>}

      <div className="mappa-stats">
        <div><span>Totale condomini</span><strong>{stats?.totaleCondomini ?? condomini.length}</strong></div>
        <div><span>Cantieri attivi</span><strong>{stats?.cantieriAttivi ?? 0}</strong></div>
        <div><span>Chiamate aperte</span><strong>{stats?.chiamateAperte ?? 0}</strong></div>
        <div><span>Preventivi in corso</span><strong>{stats?.preventiviInCorso ?? 0}</strong></div>
        <div><span>Senza coordinate</span><strong>{stats?.senzaCoordinate ?? 0}</strong></div>
      </div>

      <div className="mappa-layout">
        <aside className="mappa-filters">
          <h2>Filtri</h2>
          <input placeholder="Cerca condominio" value={filtri.search} onChange={(event) => aggiornaFiltro("search", event.target.value)} />
          <select value={filtri.comune} onChange={(event) => aggiornaFiltro("comune", event.target.value)}>
            <option value="">Comune</option>
            {comuni.map((comune) => <option key={comune}>{comune}</option>)}
          </select>
          <select value={filtri.provincia} onChange={(event) => aggiornaFiltro("provincia", event.target.value)}>
            <option value="">Provincia</option>
            {province.map((provincia) => <option key={provincia}>{provincia}</option>)}
          </select>
          <input placeholder="Amministratore" value={filtri.amministratore} onChange={(event) => aggiornaFiltro("amministratore", event.target.value)} />
          <label><input type="checkbox" checked={filtri.soloChiamateAperte} onChange={(event) => aggiornaFiltro("soloChiamateAperte", event.target.checked)} /> Solo chiamate aperte</label>
          <label><input type="checkbox" checked={filtri.soloCantieriAttivi} onChange={(event) => aggiornaFiltro("soloCantieriAttivi", event.target.checked)} /> Solo cantieri attivi</label>
          <label><input type="checkbox" checked={filtri.soloPreventivi} onChange={(event) => aggiornaFiltro("soloPreventivi", event.target.checked)} /> Solo preventivi</label>
          <label><input type="checkbox" checked={filtri.soloSenzaCoordinate} onChange={(event) => aggiornaFiltro("soloSenzaCoordinate", event.target.checked)} /> Solo senza coordinate</label>
          <div className="mappa-filter-actions">
            <button onClick={caricaDati}>Applica filtri</button>
            <button onClick={() => setFiltri(filtriVuoti)}>Reset</button>
          </div>

          <h2>Elenco condomini</h2>
          <div className="mappa-list">
            {caricamento && <p>Caricamento...</p>}
            {!caricamento && condomini.length === 0 && <p>Nessun condominio trovato.</p>}
            {condomini.map((condominio) => (
              <button
                key={condominio.id}
                className={String(selezionato?.id) === String(condominio.id) ? "active" : ""}
                onClick={() => setSelezionatoId(condominio.id)}
              >
                <span style={{ background: markerColors[condominio.marker] || markerColors.grigio }} />
                <strong>{condominio.clienteCode}</strong>
                {condominio.ragioneSociale}
              </button>
            ))}
          </div>
        </aside>

        <section className="mappa-map-panel">
          {mapsErrore && <div className="mappa-not-configured">{mapsErrore}</div>}
          <div ref={mapRef} className="mappa-canvas" aria-label="Google Maps condomini" />

          {selezionato && (
            <div className="mappa-detail">
              <h2>{selezionato.ragioneSociale}</h2>
              <p><strong>ID Cliente:</strong> {selezionato.clienteCode}</p>
              <p><strong>Indirizzo:</strong> {selezionato.indirizzoCompleto || "-"}</p>
              <p><strong>Amministratore:</strong> {selezionato.amministratore || "-"}</p>
              <p><strong>Referente:</strong> {selezionato.referente || "-"}</p>
              <p><strong>Telefono:</strong> {selezionato.telefono || "-"}</p>
              <p><strong>Email:</strong> {selezionato.emailPrincipale || "-"}</p>
              <div className="mappa-detail-counts">
                <span>Preventivi {selezionato.preventiviCount}</span>
                <span>Chiamate {selezionato.chiamateAperte}</span>
                <span>Cantieri {selezionato.cantieriAttivi}</span>
              </div>
              <div className="mappa-detail-actions">
                <button onClick={apriSchedaCliente}>Apri scheda cliente</button>
                <button onClick={() => window.open(googleMapsUrl(selezionato), "_blank", "noopener,noreferrer")}>Indicazioni stradali</button>
                <button onClick={() => window.open(googleMapsUrl(selezionato), "_blank", "noopener,noreferrer")}>Apri in Google Maps</button>
                <button onClick={apriPreventivi}>Preventivi</button>
                <button onClick={apriChiamate}>Chiamate</button>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="mappa-footer">
        Ultima sincronizzazione: {lastSync ? new Date(lastSync).toLocaleString("it-IT") : "-"} | Condomini visualizzati: {condomini.length}
      </div>
    </div>
  );
}

export default MappaCondomini;
