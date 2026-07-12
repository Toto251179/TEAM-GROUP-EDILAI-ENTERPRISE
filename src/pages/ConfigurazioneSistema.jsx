import { useEffect, useState } from "react";
import { api } from "../services/api";

const syncKeys = [
  ["fornitori", "Fornitori"],
  ["operai", "Operai"],
  ["elencoPrezzi", "Elenco Prezzi"],
  ["magazzino", "Magazzino"],
];

function Stato({ ok, text }) {
  return <span className={ok ? "config-status ok" : "config-status error"}>{text}</span>;
}

function ConfigurazioneSistema() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [showKey, setShowKey] = useState(false);
  const [googleKey, setGoogleKey] = useState("");
  const [message, setMessage] = useState("");
  const [tests, setTests] = useState(null);

  const carica = async () => {
    const data = await api.get("/system-settings");
    setSettings(data);
    setForm(data);
  };

  useEffect(() => {
    carica().catch((error) => setMessage(error.message));
  }, []);

  const salva = async (extra = {}) => {
    const body = {
      archivePath: form.archivePath,
      excelClienti: form.excelClienti,
      sync: form.sync,
      backup: form.backup,
      ...extra,
    };
    const res = await api.put("/system-settings", body);
    setMessage(res.message);
    setGoogleKey("");
    await carica();
  };

  const runTest = async (path, body = {}) => {
    try {
      const res = await api.post(path, body);
      setMessage(res.message || "Test completato");
      await carica();
      return res;
    } catch (error) {
      setMessage(error.message);
      throw error;
    }
  };

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const updateNested = (section, field, value) => setForm((current) => ({ ...current, [section]: { ...(current[section] || {}), [field]: value } }));
  const updateSync = (key, field, value) => setForm((current) => ({ ...current, sync: { ...(current.sync || {}), [key]: { ...(current.sync?.[key] || {}), [field]: value } } }));

  if (!settings) return <div className="config-page"><h1>Configurazione Sistema</h1><p>Caricamento configurazione...</p></div>;

  return (
    <div className="config-page">
      <div className="config-heading">
        <div>
          <h1>Configurazione Sistema</h1>
          <p>Chiavi, cartelle, sincronizzazioni e connessioni del gestionale.</p>
        </div>
        <button onClick={async () => setTests(await api.post("/system-settings/test-all", {}))}>Testa tutte le connessioni</button>
      </div>

      {message && <p className="config-message">{message}</p>}
      {tests && (
        <div className="config-card">
          <h2>Riepilogo connessioni</h2>
          <div className="config-result-grid">
            {Object.entries(tests).map(([key, value]) => <Stato key={key} ok={value.ok} text={`${key}: ${value.ok ? "OK" : "Errore"} - ${value.message}`} />)}
          </div>
        </div>
      )}

      <div className="config-grid">
        <section className="config-card">
          <h2>Google Maps</h2>
          <Stato ok={settings.googleMaps.configured} text={settings.googleMaps.status} />
          <label>Chiave API Google Maps</label>
          <div className="config-inline">
            <input
              type={showKey ? "text" : "password"}
              placeholder={settings.googleMaps.maskedKey || "Inserisci chiave Google Maps"}
              value={googleKey}
              onChange={(event) => setGoogleKey(event.target.value)}
            />
            <button onClick={() => setShowKey((value) => !value)}>{showKey ? "Nascondi" : "Mostra"}</button>
          </div>
          <p>Data ultimo test: {settings.googleMaps.lastTest ? new Date(settings.googleMaps.lastTest).toLocaleString("it-IT") : "-"}</p>
          <div className="config-actions">
            <button onClick={() => salva({ googleMapsApiKey: googleKey })}>Salva chiave</button>
            <button onClick={() => runTest("/system-settings/test-google-maps", googleKey ? { googleMapsApiKey: googleKey } : {})}>Testa collegamento</button>
          </div>
        </section>

        <section className="config-card">
          <h2>Archivio Preventivi</h2>
          <label>Percorso cartella principale</label>
          <input value={form.archivePath || ""} onChange={(event) => update("archivePath", event.target.value)} />
          <p>Percorso attuale: {settings.archivePath}</p>
          <p>Ultimo PDF archiviato: {settings.logs?.archive?.lastPdf || "-"}</p>
          <p>Data ultimo salvataggio: {settings.logs?.archive?.date ? new Date(settings.logs.archive.date).toLocaleString("it-IT") : "-"}</p>
          <div className="config-actions">
            <button onClick={() => setMessage("Selezione cartella dal browser non disponibile: incollare il percorso completo.")}>Seleziona cartella</button>
            <button onClick={() => salva()}>Salva percorso</button>
            <button onClick={() => runTest("/system-settings/test-archive", { archivePath: form.archivePath })}>Verifica cartella</button>
            <button onClick={() => window.open(`file:///${String(form.archivePath || settings.archivePath).replaceAll("\\", "/")}`)}>Apri cartella</button>
          </div>
        </section>

        <section className="config-card">
          <h2>Sincronizzazione Clienti</h2>
          <label>Percorso file Excel clienti</label>
          <input value={form.excelClienti?.path || ""} onChange={(event) => updateNested("excelClienti", "path", event.target.value)} />
          <label>Nome foglio Excel</label>
          <input value={form.excelClienti?.sheetName || ""} onChange={(event) => updateNested("excelClienti", "sheetName", event.target.value)} />
          <label>Intervallo sincronizzazione in minuti</label>
          <input type="number" value={form.excelClienti?.intervalMinutes || 10} onChange={(event) => updateNested("excelClienti", "intervalMinutes", Number(event.target.value))} />
          <label><input type="checkbox" checked={Boolean(form.excelClienti?.autoSync)} onChange={(event) => updateNested("excelClienti", "autoSync", event.target.checked)} /> Sincronizzazione automatica attiva</label>
          <p>Ultima sincronizzazione: {settings.logs?.excelClienti?.date ? new Date(settings.logs.excelClienti.date).toLocaleString("it-IT") : "-"}</p>
          <p>Righe lette: {settings.logs?.excelClienti?.rows ?? "-"}</p>
          <div className="config-actions">
            <button onClick={() => setMessage("Selezione file dal browser non disponibile: incollare il percorso completo.")}>Seleziona file Excel</button>
            <button onClick={() => runTest("/system-settings/test-excel", { excelClienti: form.excelClienti })}>Testa lettura</button>
            <button onClick={() => setMessage("Sincronizzazione clienti predisposta: motore generico da collegare allo step import Excel.")}>Sincronizza adesso</button>
            <button onClick={() => setTests({ excelClienti: settings.logs?.excelClienti || { ok: false, message: "Nessun log disponibile" } })}>Visualizza ultimo log</button>
          </div>
        </section>

        <section className="config-card">
          <h2>Backup</h2>
          <label>Percorso cartella backup</label>
          <input value={form.backup?.path || ""} onChange={(event) => updateNested("backup", "path", event.target.value)} />
          <label>Numero giorni di conservazione</label>
          <input type="number" value={form.backup?.retentionDays || 30} onChange={(event) => updateNested("backup", "retentionDays", Number(event.target.value))} />
          <label>Ora backup giornaliero</label>
          <input value={form.backup?.time || "23:00"} onChange={(event) => updateNested("backup", "time", event.target.value)} />
          <label><input type="checkbox" checked={Boolean(form.backup?.autoBackup)} onChange={(event) => updateNested("backup", "autoBackup", event.target.checked)} /> Backup automatico attivo</label>
          <p>Ultimo backup: {settings.logs?.backup?.date ? new Date(settings.logs.backup.date).toLocaleString("it-IT") : "-"}</p>
          <div className="config-actions">
            <button onClick={() => salva()}>Salva backup</button>
            <button onClick={() => runTest("/system-settings/backup-now", {})}>Esegui backup adesso</button>
            <button onClick={() => setMessage(settings.logs?.backup?.message || "Nessun backup disponibile")}>Verifica ultimo backup</button>
            <button onClick={() => window.open(`file:///${String(form.backup?.path || settings.backup?.path || "").replaceAll("\\", "/")}`)}>Apri cartella backup</button>
          </div>
        </section>

        <section className="config-card">
          <h2>Database</h2>
          <p>Tipo: {settings.database.type}</p>
          <p>Host: {settings.database.host}</p>
          <p>Porta: {settings.database.port}</p>
          <p>Nome database: {settings.database.name}</p>
          <button onClick={() => runTest("/system-settings/test-database", {})}>Testa database</button>
        </section>

        <section className="config-card">
          <h2>Server Centrale</h2>
          <p>URL backend: {settings.server.url}</p>
          <p>Porta: {settings.server.port}</p>
          <p>Versione: {settings.server.version}</p>
          <p>Tempo di attivita: {Math.round(settings.server.uptime)} sec</p>
          <div className="config-actions">
            <button onClick={() => runTest("/system-settings/test-server", {})}>Testa server</button>
            <button onClick={() => runTest("/system-settings/test-all", {}).then(setTests)}>Testa API</button>
            <button onClick={carica}>Ricarica configurazione</button>
          </div>
        </section>
      </div>

      <section className="config-card">
        <h2>Altre sincronizzazioni</h2>
        <div className="config-sync-grid">
          {syncKeys.map(([key, label]) => (
            <div key={key}>
              <h3>{label}</h3>
              <input placeholder="Percorso file" value={form.sync?.[key]?.path || ""} onChange={(event) => updateSync(key, "path", event.target.value)} />
              <input placeholder="Nome foglio" value={form.sync?.[key]?.sheetName || ""} onChange={(event) => updateSync(key, "sheetName", event.target.value)} />
              <input type="number" placeholder="Intervallo" value={form.sync?.[key]?.intervalMinutes || 10} onChange={(event) => updateSync(key, "intervalMinutes", Number(event.target.value))} />
              <label><input type="checkbox" checked={Boolean(form.sync?.[key]?.autoSync)} onChange={(event) => updateSync(key, "autoSync", event.target.checked)} /> Attiva</label>
              <button onClick={() => setMessage(`Sincronizzazione ${label} predisposta.`)}>Sincronizza adesso</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default ConfigurazioneSistema;
