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
  cluster: "#7c3aed",
};

const filtriIniziali = {
  search: "",
  comune: "",
  provincia: "",
  amministratore: "",
  soloChiamateAperte: false,
  soloCantieriAttivi: false,
  soloPreventivi: false,
  soloSenzaCoordinate: false,
};

function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector("script[data-team-google-maps]");
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.google?.maps), { once: true });
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
      script.onload = () => resolve(window.google?.maps);
      script.onerror = () => reject(new Error("Chiave Google Maps non valida o Maps JavaScript API non abilitata."));
      document.head.appendChild(script);
    });
  }
  return googleMapsPromise;
}

function parametriDaFiltri(filtri) {
  const params = new URLSearchParams();
  Object.entries(filtri).forEach(([key, value]) => {
    if (typeof value === "boolean") {
      if (value) params.set(key, "true");
    } else if (String(value || "").trim()) {
      params.set(key, value);
    }
  });
  return params.toString();
}

function directionsUrl(cliente) {
  const destination = cliente.latitudine && cliente.longitudine
    ? `${cliente.latitudine},${cliente.longitudine}`
    : cliente.indirizzoCompleto || cliente.ragioneSociale;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination || "")}`;
}

function streetViewUrl(cliente) {
  if (cliente.latitudine && cliente.longitudine) {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${cliente.latitudine},${cliente.longitudine}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cliente.indirizzoCompleto || cliente.ragioneSociale || "")}`;
}

function statusLabel(marker) {
  if (marker === "arancione") return "Chiamata aperta";
  if (marker === "verde") return "Cantiere attivo";
  if (marker === "blu") return "Preventivo in corso";
  if (marker === "rosso") return "Senza coordinate";
  return "Nessuna attivita";
}

function CentroOperativo() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [stats, setStats] = useState(null);
  const [clienti, setClienti] = useState([]);
  const [filtersData, setFiltersData] = useState({ comuni: [], province: [], amministratori: [], counts: {} });
  const [filtri, setFiltri] = useState(filtriIniziali);
  const [selectedId, setSelectedId] = useState("");
  const [detailOpen, setDetailOpen] = useState(true);
  const [timeline, setTimeline] = useState([]);
  const [squadre, setSquadre] = useState([]);
  const [visibleLimit, setVisibleLimit] = useState(80);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapsError, setMapsError] = useState("");
  const [geocodeResult, setGeocodeResult] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedSquadra, setSelectedSquadra] = useState("");

  const selected = useMemo(
    () => clienti.find((item) => String(item.id) === String(selectedId)) || clienti[0],
    [clienti, selectedId],
  );
  const visibleClienti = clienti.slice(0, visibleLimit);
  const markerCount = clienti.filter((item) => item.latitudine && item.longitudine).length;

  const caricaDati = async (filtriOverride = filtri) => {
    setLoading(true);
    setError("");
    try {
      const query = parametriDaFiltri(filtriOverride);
      const [statsRes, clientiRes, filtersRes, squadreRes] = await Promise.all([
        api.get("/centro-operativo/stats"),
        api.get(`/centro-operativo/clienti${query ? `?${query}` : ""}`),
        api.get("/centro-operativo/filters"),
        api.get("/centro-operativo/squadre-live"),
      ]);
      setStats(statsRes);
      setClienti(clientiRes.items || []);
      setFiltersData(filtersRes);
      setSquadre(squadreRes.items || []);
      setSelectedId((current) => current || clientiRes.items?.[0]?.id || "");
    } catch (err) {
      setError(err.message || "Errore caricamento Centro Operativo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    caricaDati();
  }, []);

  useEffect(() => {
    if (!selected?.id) {
      setTimeline([]);
      return;
    }
    api.get(`/centro-operativo/clienti/${selected.id}/timeline`)
      .then((res) => setTimeline(res.items || []))
      .catch((err) => setTimeline([{ tipo: "errore", titolo: err.message, dataOra: new Date().toISOString() }]));
  }, [selected?.id]);

  useEffect(() => {
    let active = true;

    async function renderMap() {
      if (!mapRef.current) return;
      try {
        const maps = await loadGoogleMaps(GOOGLE_MAPS_API_KEY);
        if (!maps) throw new Error(window.__TEAM_GOOGLE_MAPS_ERROR__ || "Google Maps non configurato.");
        if (!active || !mapRef.current) return;
        setMapsError("");

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
        const grouped = new Map();
        clienti.forEach((cliente) => {
          const lat = Number(cliente.latitudine);
          const lng = Number(cliente.longitudine);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
          grouped.set(key, [...(grouped.get(key) || []), cliente]);
        });

        grouped.forEach((group) => {
          const first = group[0];
          const lat = Number(first.latitudine);
          const lng = Number(first.longitudine);
          const isCluster = group.length > 1;
          const marker = new maps.Marker({
            map: mapInstanceRef.current,
            position: { lat, lng },
            title: isCluster ? `${group.length} clienti` : `${first.clienteCode || ""} - ${first.ragioneSociale || ""}`.trim(),
            label: isCluster ? { text: String(group.length), color: "#ffffff", fontWeight: "800" } : undefined,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              fillColor: isCluster ? markerColors.cluster : markerColors[first.marker] || markerColors.grigio,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
              scale: isCluster ? 14 : 8,
            },
          });
          marker.addListener("click", () => {
            setSelectedId(first.id);
            setDetailOpen(true);
          });
          markersRef.current.push(marker);
          bounds.extend({ lat, lng });
        });

        if (grouped.size > 0) mapInstanceRef.current.fitBounds(bounds);
        else {
          mapInstanceRef.current.setCenter(VICENZA_CENTER);
          mapInstanceRef.current.setZoom(10);
        }
      } catch (err) {
        if (active) setMapsError(err.message || "Errore caricamento Google Maps.");
      }
    }

    renderMap();
    return () => {
      active = false;
    };
  }, [clienti]);

  useEffect(() => {
    if (!selected || !mapInstanceRef.current || !window.google?.maps) return;
    const lat = Number(selected.latitudine);
    const lng = Number(selected.longitudine);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapInstanceRef.current.panTo({ lat, lng });
    mapInstanceRef.current.setZoom(Math.max(mapInstanceRef.current.getZoom() || 10, 14));
  }, [selected?.id]);

  const aggiornaFiltro = (key, value) => setFiltri((current) => ({ ...current, [key]: value }));

  const resetFiltri = () => {
    setFiltri(filtriIniziali);
    setVisibleLimit(80);
    caricaDati(filtriIniziali);
  };

  const geocodificaMancanti = async () => {
    if (geocoding) return;
    setGeocoding(true);
    setGeocodeResult("Preparazione geocodifica...");
    let elaborati = 0;
    let trovati = 0;
    let errori = 0;

    try {
      while (true) {
        const res = await api.post("/centro-operativo/geocode-missing", { limit: 25 });
        elaborati += Number(res.elaborati || 0);
        trovati += Number(res.trovati || 0);
        errori += Number(res.errori || 0);
        const rimanenti = Number(res.rimanenti || 0);
        setGeocodeResult(
          `Elaborati ${elaborati} - trovati ${trovati} - da verificare ${errori} - rimanenti ${rimanenti}`,
        );
        if (rimanenti === 0 || Number(res.elaborati || 0) === 0) break;
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      await caricaDati();
      setGeocodeResult(`Completato: ${trovati} condomini posizionati, ${errori} indirizzi da verificare.`);
    } catch (err) {
      setGeocodeResult(`${err.message || "Geocodifica non riuscita"} Dopo ${elaborati} indirizzi elaborati.`);
      await caricaDati();
    } finally {
      setGeocoding(false);
    }
  };

  const assegnaSquadra = async () => {
    if (!selected?.id || !selectedSquadra) return;
    try {
      const res = await api.post("/centro-operativo/assign-team", { clienteId: selected.id, squadraId: selectedSquadra, conferma: true });
      setGeocodeResult(res.message);
      setAssignOpen(false);
    } catch (err) {
      setGeocodeResult(err.message || "Assegnazione non riuscita");
    }
  };

  const apri = (url) => {
    window.location.href = url;
  };

  return (
    <div className="centro-operativo-page">
      <div className="centro-heading">
        <div>
          <h1>CENTRO OPERATIVO</h1>
          <p>Visualizza e gestisci clienti, attivita e squadre in tempo reale</p>
        </div>
        <input
          placeholder="Cerca condominio, cliente, ID o amministratore"
          value={filtri.search}
          onChange={(event) => aggiornaFiltro("search", event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") caricaDati();
          }}
        />
      </div>

      {error && <p className="centro-error">{error}</p>}

      <div className="centro-stats">
        <div><span>TOTALE CONDOMINI</span><strong>{stats?.totaleCondomini ?? 0}</strong><small>{stats?.conCoordinate ?? 0} con coordinate ({stats?.percentualeCoordinate ?? 0}%)</small></div>
        <div><span>CANTIERI ATTIVI</span><strong>{stats?.cantieriAttivi ?? 0}</strong><small>In corso</small></div>
        <div><span>CHIAMATE APERTE</span><strong>{stats?.chiamateAperte ?? 0}</strong><small>{stats?.chiamateAperte ? "Da gestire" : "Nessuna chiamata aperta"}</small></div>
        <div><span>PREVENTIVI IN CORSO</span><strong>{stats?.preventiviInCorso ?? 0}</strong><small>In lavorazione</small></div>
        <div><span>SENZA COORDINATE</span><strong>{stats?.senzaCoordinate ?? 0}</strong><small>Da geocodificare</small></div>
      </div>

      <div className="centro-grid">
        <aside className="centro-left">
          <section className="centro-card">
            <h2>FILTRI</h2>
            <input placeholder="Cerca condominio o ID cliente" value={filtri.search} onChange={(event) => aggiornaFiltro("search", event.target.value)} />
            <select value={filtri.comune} onChange={(event) => aggiornaFiltro("comune", event.target.value)}>
              <option value="">Comune</option>
              {filtersData.comuni?.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}
            </select>
            <select value={filtri.provincia} onChange={(event) => aggiornaFiltro("provincia", event.target.value)}>
              <option value="">Provincia</option>
              {filtersData.province?.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}
            </select>
            <select value={filtri.amministratore} onChange={(event) => aggiornaFiltro("amministratore", event.target.value)}>
              <option value="">Amministratore</option>
              {filtersData.amministratori?.map((item) => <option key={item.value} value={item.value}>{item.value} ({item.count})</option>)}
            </select>
            <label><input type="checkbox" checked={filtri.soloChiamateAperte} onChange={(event) => aggiornaFiltro("soloChiamateAperte", event.target.checked)} /> Solo chiamate aperte <b>{filtersData.counts?.soloChiamateAperte ?? 0}</b></label>
            <label><input type="checkbox" checked={filtri.soloCantieriAttivi} onChange={(event) => aggiornaFiltro("soloCantieriAttivi", event.target.checked)} /> Solo cantieri attivi <b>{filtersData.counts?.soloCantieriAttivi ?? 0}</b></label>
            <label><input type="checkbox" checked={filtri.soloPreventivi} onChange={(event) => aggiornaFiltro("soloPreventivi", event.target.checked)} /> Solo preventivi <b>{filtersData.counts?.soloPreventivi ?? 0}</b></label>
            <label><input type="checkbox" checked={filtri.soloSenzaCoordinate} onChange={(event) => aggiornaFiltro("soloSenzaCoordinate", event.target.checked)} /> Solo senza coordinate <b>{filtersData.counts?.soloSenzaCoordinate ?? 0}</b></label>
            <div className="centro-actions-row">
              <button onClick={caricaDati}>Applica filtri</button>
              <button className="secondary" onClick={resetFiltri}>Azzera</button>
            </div>
          </section>

          <section className="centro-card centro-list-card">
            <div className="centro-section-title">
              <h2>ELENCO CONDOMINI</h2>
              <span>{clienti.length}</span>
            </div>
            <div className="centro-list">
              {loading && <p>Caricamento...</p>}
              {!loading && visibleClienti.length === 0 && <p>Nessun cliente trovato.</p>}
              {visibleClienti.map((cliente) => (
                <button
                  key={cliente.id}
                  className={String(cliente.id) === String(selected?.id) ? "active" : ""}
                  onClick={() => {
                    setSelectedId(cliente.id);
                    setDetailOpen(true);
                  }}
                >
                  <i style={{ background: markerColors[cliente.marker] || markerColors.grigio }} />
                  <span>
                    <strong>{cliente.clienteCode || "SENZA ID"} - {cliente.ragioneSociale}</strong>
                    <small>{cliente.indirizzoCompleto || "Indirizzo da completare"} - {statusLabel(cliente.marker)}</small>
                  </span>
                </button>
              ))}
            </div>
            {visibleLimit < clienti.length && <button className="wide secondary" onClick={() => setVisibleLimit((value) => value + 80)}>Mostra altri...</button>}
          </section>
        </aside>

        <main className="centro-map-area">
          <section className="centro-map-card">
            <div>{GOOGLE_MAPS_API_KEY ? "Chiave rilevata" : "Chiave non rilevata"}</div>
            {mapsError && <div className="centro-map-error">{mapsError}</div>}
            <div className="centro-map-legend">
              <strong>LEGENDA</strong>
              <span><i style={{ background: markerColors.arancione }} /> Chiamata aperta</span>
              <span><i style={{ background: markerColors.verde }} /> Cantiere attivo</span>
              <span><i style={{ background: markerColors.blu }} /> Preventivo in corso</span>
              <span><i style={{ background: markerColors.grigio }} /> Nessuna attivita</span>
              <span><i style={{ background: markerColors.rosso }} /> Senza coordinate</span>
              <span><i style={{ background: markerColors.cluster }} /> Cluster</span>
            </div>
            <div ref={mapRef} className="centro-map-canvas" aria-label="Google Maps Centro Operativo" />

            {selected && detailOpen && (
              <article className="centro-detail-card">
                <button className="icon-close" onClick={() => setDetailOpen(false)} aria-label="Chiudi dettaglio">x</button>
                <h2>{selected.ragioneSociale}</h2>
                <p><b>ID Cliente:</b> {selected.clienteCode || "-"}</p>
                <p><b>Indirizzo:</b> {selected.indirizzoCompleto || "-"}</p>
                <p><b>Amministratore:</b> {selected.amministratore || "-"}</p>
                <p><b>Referente:</b> {selected.referente || "-"}</p>
                <p><b>Telefono:</b> {selected.telefono || "-"}</p>
                <p><b>Email:</b> {selected.emailPrincipale || selected.emailAmministratore || selected.emailReferente || "-"}</p>
                <div className="centro-pills">
                  <span>Preventivi {selected.preventiviCount}</span>
                  <span>Cantieri {selected.cantieriCount}</span>
                  <span>Chiamate {selected.chiamateAperte}</span>
                  <span>Rapportini {selected.rapportiniCount}</span>
                  <span>Foto {selected.fotoCount}</span>
                </div>
                <div className="centro-detail-actions">
                  <button onClick={() => apri(`/clienti?clienteId=${encodeURIComponent(selected.id)}`)}>Apri Cliente</button>
                  <button onClick={() => apri(`/preventivi?clienteId=${encodeURIComponent(selected.id)}&clienteCode=${encodeURIComponent(selected.clienteCode || "")}`)}>Preventivi</button>
                  <button onClick={() => apri(`/cantieri?clienteId=${encodeURIComponent(selected.id)}&clienteCode=${encodeURIComponent(selected.clienteCode || "")}`)}>Cantieri</button>
                  <button onClick={() => apri(`/chiamate-tecnici?clienteCode=${encodeURIComponent(selected.clienteCode || "")}`)}>Chiamate</button>
                  <button className="secondary" onClick={() => window.open(directionsUrl(selected), "_blank", "noopener,noreferrer")}>Indicazioni</button>
                  <button className="secondary" onClick={() => window.open(streetViewUrl(selected), "_blank", "noopener,noreferrer")}>Street View</button>
                  <button className="secondary" onClick={() => setAssignOpen(true)}>Invia Tecnico</button>
                </div>
                {assignOpen && (
                  <div className="centro-assign">
                    <select value={selectedSquadra} onChange={(event) => setSelectedSquadra(event.target.value)}>
                      <option value="">Seleziona squadra</option>
                      {squadre.map((squadra) => <option key={squadra.id} value={squadra.id}>{squadra.nome}</option>)}
                    </select>
                    <button onClick={assegnaSquadra}>Conferma</button>
                  </div>
                )}
              </article>
            )}
          </section>

          <section className="centro-live-section">
            <div className="centro-section-title">
              <h2>SQUADRE E TECNICI SUL TERRITORIO (LIVE)</h2>
              <button className="secondary" onClick={() => apri("/squadre")}>Vedi tutte le squadre</button>
            </div>
            <div className="centro-squadre">
              {squadre.length === 0 && <p>Nessuna squadra attiva disponibile.</p>}
              {squadre.map((squadra) => (
                <div key={squadra.id} className="centro-squadra-card">
                  <strong>{squadra.nome}</strong>
                  <span>{squadra.stato}</span>
                  <p>{squadra.destinazione || "Posizione non disponibile"}</p>
                  <small>{squadra.indirizzo || "Posizione non disponibile"}</small>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="centro-right">
          <section className="centro-card centro-timeline">
            <h2>TIMELINE ATTIVITA</h2>
            {timeline.length === 0 && <p>Nessuna attivita disponibile.</p>}
            {timeline.map((event, index) => (
              <div key={`${event.tipo}-${event.recordId || index}`} className="centro-event">
                <time>{event.dataOra ? new Date(event.dataOra).toLocaleString("it-IT") : "-"}</time>
                <strong>{event.titolo}</strong>
                <span>{event.descrizione || event.tipo}</span>
              </div>
            ))}
            <button className="wide secondary">Vedi tutte le attivita</button>
          </section>

          <section className="centro-card">
            <h2>AZIONI RAPIDE</h2>
            <button className="wide" onClick={() => apri(`/preventivi?clienteId=${encodeURIComponent(selected?.id || "")}`)}>Nuovo preventivo</button>
            <button className="wide" onClick={() => apri(`/chiamate-tecnici?clienteCode=${encodeURIComponent(selected?.clienteCode || "")}`)}>Nuova chiamata</button>
            <button className="wide" onClick={() => apri(`/cantieri?clienteId=${encodeURIComponent(selected?.id || "")}`)}>Nuovo cantiere</button>
            <button className="wide" onClick={() => apri(`/giornale-cantiere?clienteCode=${encodeURIComponent(selected?.clienteCode || "")}`)}>Nuovo rapportino</button>
          </section>

          <section className="centro-card">
            <h2>GEOCODIFICA</h2>
            <p>Clienti senza coordinate: {stats?.senzaCoordinate ?? 0}</p>
            <button className="wide" onClick={geocodificaMancanti} disabled={geocoding}>{geocoding ? "Geocodifica in corso..." : "Geocodifica tutti i mancanti"}</button>
            {geocodeResult && <small className="centro-note">{geocodeResult}</small>}
          </section>
        </aside>
      </div>

      <div className="centro-footer">
        Clienti caricati: {clienti.length} | Marker visibili: {markerCount} | Ultimo aggiornamento: {stats?.lastSync ? new Date(stats.lastSync).toLocaleString("it-IT") : "-"}
      </div>
    </div>
  );
}

export default CentroOperativo;
