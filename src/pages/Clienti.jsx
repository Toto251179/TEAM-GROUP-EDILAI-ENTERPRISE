import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const clienteVuoto = {
  id: null,
  clienteCode: "",
  ragioneSociale: "",
  referente: "",
  associazione: "",
  telefono: "",
  email: "",
  emailReferente: "",
  emailAmministratore: "",
  indirizzo: "",
  cap: "",
  comune: "",
  provincia: "",
  note: "",
  tipologiaCliente: "",
  latitudine: "",
  longitudine: "",
};

function valoreCliente(cliente, campoUfficiale, campoLegacy = campoUfficiale) {
  return cliente?.[campoUfficiale] ?? cliente?.[campoLegacy] ?? "";
}

function valoreNonVuoto(value) {
  const text = String(value ?? "").trim();
  return text || "";
}

function amministratoreVisibile(cliente) {
  return valoreNonVuoto(cliente?.amministratore) || valoreNonVuoto(cliente?.associazione) || valoreNonVuoto(cliente?.referente);
}

function normalizzaCoordinata(value) {
  const numero = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

function coordinateCliente(cliente) {
  const latitudine = normalizzaCoordinata(cliente?.latitudine);
  const longitudine = normalizzaCoordinata(cliente?.longitudine);

  if (latitudine === null || longitudine === null) return null;
  return { latitudine, longitudine };
}

function indirizzoMapsCliente(cliente) {
  return [
    valoreCliente(cliente, "via", "indirizzo"),
    cliente?.cap,
    cliente?.comune,
    cliente?.provincia,
    "Italia",
  ]
    .map((parte) => String(parte ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function posizioneMapsCliente(cliente) {
  const coordinate = coordinateCliente(cliente);
  if (coordinate) return `${coordinate.latitudine},${coordinate.longitudine}`;
  return indirizzoMapsCliente(cliente);
}

function isCondominioCliente(cliente) {
  const testo = [
    cliente?.tipologiaCliente,
    cliente?.ragioneSociale,
    valoreCliente(cliente, "noteCliente", "note"),
  ]
    .join(" ")
    .toLowerCase();

  return testo.includes("condominio") || testo.includes("condomini") || testo.includes("cond.");
}

function esportaCsv(nomeFile, intestazioni, righe) {
  const escapeCsv = (valore) => `"${String(valore ?? "").replaceAll('"', '""')}"`;
  const contenuto = [intestazioni, ...righe]
    .map((rigaCsv) => rigaCsv.map(escapeCsv).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${contenuto}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = nomeFile;
  link.click();
  URL.revokeObjectURL(url);
}

function Clienti() {
  const [clienti, setClienti] = useState([]);
  const [preventivi, setPreventivi] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [form, setForm] = useState(clienteVuoto);
  const [ricerca, setRicerca] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [importazione, setImportazione] = useState(null);
  const [fileImport, setFileImport] = useState(null);
  const [menuAltroClienteId, setMenuAltroClienteId] = useState(null);
  const [cartelleClienti, setCartelleClienti] = useState({});
  const [cartellaForm, setCartellaForm] = useState(null);

  useEffect(() => {
    let componenteAttivo = true;

    async function caricaClienti() {
      try {
        const [clientiDb, preventiviDb, cantieriDb] = await Promise.all([
          api.get("/clienti"),
          api.get("/preventivi"),
          api.get("/cantieri"),
        ]);

        if (componenteAttivo) {
          setClienti(clientiDb);
          setPreventivi(preventiviDb);
          setCantieri(cantieriDb);
        }
      } catch (error) {
        if (componenteAttivo) setErrore(error.message);
      } finally {
        if (componenteAttivo) setCaricamento(false);
      }
    }

    caricaClienti();

    return () => {
      componenteAttivo = false;
    };
  }, []);

  const clientiFiltrati = useMemo(
    () =>
      clienti.filter((cliente) =>
        [
          valoreCliente(cliente, "idCliente", "clienteCode"),
          cliente.ragioneSociale,
          cliente.referente,
          amministratoreVisibile(cliente),
          cliente.telefono,
          valoreCliente(cliente, "emailPrincipale", "email"),
          cliente.emailReferente,
          cliente.emailAmministratore,
          valoreCliente(cliente, "via", "indirizzo"),
          cliente.cap,
          cliente.comune,
          cliente.provincia,
          valoreCliente(cliente, "noteCliente", "note"),
          cliente.tipologiaCliente,
          cliente.latitudine,
          cliente.longitudine,
        ]
          .join(" ")
          .toLowerCase()
          .includes(ricerca.toLowerCase()),
      ),
    [clienti, ricerca],
  );

  const riepilogo = useMemo(
    () => ({
      totale: clienti.length,
      conEmail: clienti.filter((cliente) => valoreCliente(cliente, "emailPrincipale", "email")).length,
      conTelefono: clienti.filter((cliente) => cliente.telefono).length,
      cantieri: cantieri.length,
      preventivi: preventivi.length,
      filtrati: clientiFiltrati.length,
    }),
    [cantieri.length, clienti, clientiFiltrati, preventivi.length],
  );

  const clientiCondomini = useMemo(
    () => clientiFiltrati.filter((cliente) => isCondominioCliente(cliente)),
    [clientiFiltrati],
  );

  const condominiConCoordinate = useMemo(
    () =>
      clientiCondomini
        .map((cliente) => ({
          cliente,
          coordinate: coordinateCliente(cliente),
        }))
        .filter((item) => item.coordinate),
    [clientiCondomini],
  );

  const condominiSenzaCoordinate = useMemo(
    () => clientiCondomini.filter((cliente) => !coordinateCliente(cliente)),
    [clientiCondomini],
  );

  const confiniMappaCondomini = useMemo(() => {
    if (condominiConCoordinate.length === 0) return null;

    const latitudini = condominiConCoordinate.map((item) => item.coordinate.latitudine);
    const longitudini = condominiConCoordinate.map((item) => item.coordinate.longitudine);

    return {
      minLatitudine: Math.min(...latitudini),
      maxLatitudine: Math.max(...latitudini),
      minLongitudine: Math.min(...longitudini),
      maxLongitudine: Math.max(...longitudini),
    };
  }, [condominiConCoordinate]);

  const contaPreventiviCliente = (cliente) =>
    preventivi.filter(
      (preventivo) =>
        String(preventivo.clienteId || "") === String(cliente.id) ||
        preventivo.clienteCode === valoreCliente(cliente, "idCliente", "clienteCode") ||
        preventivo.cliente === cliente.ragioneSociale,
    ).length;

  const contaCantieriCliente = (cliente) =>
    cantieri.filter(
      (cantiere) =>
        String(cantiere.clienteId || "") === String(cliente.id) ||
        cantiere.clienteCode === valoreCliente(cliente, "idCliente", "clienteCode") ||
        cantiere.cliente === cliente.ragioneSociale,
    ).length;

  const aggiornaVistaDaDatabase = async () => {
    const [clientiDb, preventiviDb, cantieriDb] = await Promise.all([
      api.get("/clienti"),
      api.get("/preventivi"),
      api.get("/cantieri"),
    ]);

    setClienti(clientiDb);
    setPreventivi(preventiviDb);
    setCantieri(cantieriDb);
  };

  const aggiornaForm = (campo, valore) => {
    setForm((corrente) => ({ ...corrente, [campo]: valore }));
  };

  const resetForm = () => {
    setForm(clienteVuoto);
    setCartellaForm(null);
    setErrore("");
  };

  const salvaCliente = async () => {
    const idCliente = form.clienteCode.trim();
    if (!idCliente) {
      setErrore("Inserisci ID Cliente.");
      setMessaggio("");
      return;
    }
    if (idCliente.length > 20) {
      setErrore("ID Cliente massimo 20 caratteri.");
      setMessaggio("");
      return;
    }
    if (!form.ragioneSociale.trim()) {
      setErrore("Inserisci la ragione sociale del cliente.");
      setMessaggio("");
      return;
    }

    setErrore("");
    setMessaggio("");

    const payload = {
      idCliente,
      clienteCode: idCliente,
      ragioneSociale: form.ragioneSociale.trim(),
      referente: form.referente.trim(),
      amministratore: form.associazione.trim(),
      telefono: form.telefono.trim(),
      emailPrincipale: form.email.trim(),
      email: form.email.trim(),
      emailReferente: form.emailReferente.trim(),
      emailAmministratore: form.emailAmministratore.trim(),
      via: form.indirizzo.trim(),
      indirizzo: form.indirizzo.trim(),
      cap: form.cap.trim(),
      comune: form.comune.trim(),
      provincia: form.provincia.trim(),
      noteCliente: form.note.trim(),
      note: form.note.trim(),
      tipologiaCliente: form.tipologiaCliente.trim(),
      latitudine: form.latitudine === "" ? null : form.latitudine,
      longitudine: form.longitudine === "" ? null : form.longitudine,
    };

    try {
      if (form.id) {
        await api.put(`/clienti/${form.id}`, payload);
      } else {
        await api.post("/clienti", payload);
      }

      await aggiornaVistaDaDatabase();
      resetForm();
      setMessaggio("Cliente salvato correttamente");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const modificaCliente = (cliente) => {
    setForm({
      id: cliente.id,
      clienteCode: valoreCliente(cliente, "idCliente", "clienteCode"),
      ragioneSociale: cliente.ragioneSociale || "",
      referente: cliente.referente || "",
      associazione: amministratoreVisibile(cliente),
      telefono: cliente.telefono || "",
      email: valoreCliente(cliente, "emailPrincipale", "email"),
      emailReferente: cliente.emailReferente || "",
      emailAmministratore: cliente.emailAmministratore || "",
      indirizzo: valoreCliente(cliente, "via", "indirizzo"),
      cap: cliente.cap || "",
      comune: cliente.comune || "",
      provincia: cliente.provincia || "",
      note: valoreCliente(cliente, "noteCliente", "note"),
      tipologiaCliente: cliente.tipologiaCliente || "",
      latitudine: cliente.latitudine ?? "",
      longitudine: cliente.longitudine ?? "",
    });
    setErrore("");
    setMessaggio("");
    verificaCartellaCliente(cliente);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const eliminaCliente = async (cliente) => {
    const conferma = window.confirm(`Eliminare il cliente ${cliente.ragioneSociale}?`);
    if (!conferma) return;

    setErrore("");
    setMessaggio("");

    try {
      const response = await api.delete(`/clienti/${cliente.id}`);
      await aggiornaVistaDaDatabase();
      if (form.id === cliente.id) resetForm();
      setMessaggio(response?.message || "Cliente eliminato correttamente.");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const aggiornaInfoCartellaCliente = (cliente, info) => {
    setCartelleClienti((corrente) => ({ ...corrente, [cliente.id]: info }));
    if (form.id === cliente.id || cliente.id === info?.clienteId) setCartellaForm(info);
  };

  const verificaCartellaCliente = async (cliente) => {
    try {
      const info = await api.get(`/clienti/${cliente.id}/cartella`);
      aggiornaInfoCartellaCliente(cliente, { ...info, clienteId: cliente.id });
      return info;
    } catch (error) {
      const info = {
        clienteId: cliente.id,
        status: error.status === 400 ? "Percorso non configurato" : "Errore di accesso",
        message: error.message,
      };
      aggiornaInfoCartellaCliente(cliente, info);
      return info;
    }
  };

  const creaCartellaCliente = async (cliente) => {
    setErrore("");
    setMessaggio("");

    try {
      const response = await api.post(`/clienti/${cliente.id}/crea-cartella`, {});
      aggiornaInfoCartellaCliente(cliente, { ...response.archivio, clienteId: cliente.id });
      setMessaggio(`${response.message} ${response.archivio?.folderPath || ""}`.trim());
      return response;
    } catch (error) {
      setErrore(error.message);
      return null;
    }
  };

  const apriCartellaCliente = async (cliente) => {
    setMenuAltroClienteId(null);
    setErrore("");
    setMessaggio("");

    try {
      const response = await api.post(`/clienti/${cliente.id}/apri-cartella`, {});
      aggiornaInfoCartellaCliente(cliente, { ...response.archivio, clienteId: cliente.id });
      setMessaggio(`${response.message} ${response.archivio?.folderPath || ""}`.trim());
      return response;
    } catch (error) {
      setErrore(error.message);
      return null;
    }
  };

  const apriSchedaCliente = (cliente) => {
    setMenuAltroClienteId(null);
    modificaCliente(cliente);
  };

  const creaPreventivoCliente = (cliente) => {
    const params = new URLSearchParams({
      clienteId: String(cliente.id || ""),
      clienteCode: valoreCliente(cliente, "idCliente", "clienteCode"),
      cliente: cliente.ragioneSociale || "",
      idIndirizzo: Array.isArray(cliente.indirizzi) ? String(cliente.indirizzi[0]?.id || "") : "",
    });
    window.location.href = `/preventivi?${params.toString()}`;
  };

  const creaCantiereCliente = async (cliente) => {
    const nome = window.prompt(`Nome del nuovo cantiere per ${cliente.ragioneSociale}`);
    if (!nome) return;

    setErrore("");
    setMessaggio("");

    try {
      const creato = await api.post("/cantieri", {
        clienteId: cliente.id,
        clienteCode: valoreCliente(cliente, "idCliente", "clienteCode"),
        nome,
        cliente: cliente.ragioneSociale,
        indirizzo: valoreCliente(cliente, "via", "indirizzo"),
        importo: 0,
        stato: "In Corso",
        note: "",
      });
      setCantieri((attuali) => [creato, ...attuali]);
    } catch (error) {
      setErrore(error.message);
    }
  };

  const esportaClienti = () => {
    esportaCsv(
      `clienti-${new Date().toISOString().slice(0, 10)}.csv`,
      ["ID Cliente", "Ragione Sociale", "Referente", "Amministratore", "Telefono", "Email principale", "Email amministratore", "Email referente", "Via", "CAP", "Comune", "Provincia", "Tipo Cliente", "Latitudine", "Longitudine", "Note Cliente"],
      clientiFiltrati.map((cliente) => [
        valoreCliente(cliente, "idCliente", "clienteCode"),
        cliente.ragioneSociale,
        cliente.referente,
        valoreCliente(cliente, "amministratore", "associazione"),
        cliente.telefono,
        valoreCliente(cliente, "emailPrincipale", "email"),
        cliente.emailAmministratore,
        cliente.emailReferente,
        valoreCliente(cliente, "via", "indirizzo"),
        cliente.cap,
        cliente.comune,
        cliente.provincia,
        cliente.tipologiaCliente,
        cliente.latitudine,
        cliente.longitudine,
        valoreCliente(cliente, "noteCliente", "note"),
      ]),
    );
  };

  const posizionePinCondominio = (coordinate) => {
    if (!confiniMappaCondomini) return { left: "50%", top: "50%" };

    const rangeLatitudine = Math.max(
      confiniMappaCondomini.maxLatitudine - confiniMappaCondomini.minLatitudine,
      0.0001,
    );
    const rangeLongitudine = Math.max(
      confiniMappaCondomini.maxLongitudine - confiniMappaCondomini.minLongitudine,
      0.0001,
    );
    const left = 7 + ((coordinate.longitudine - confiniMappaCondomini.minLongitudine) / rangeLongitudine) * 86;
    const top = 12 + (1 - (coordinate.latitudine - confiniMappaCondomini.minLatitudine) / rangeLatitudine) * 76;

    return {
      left: `${Math.min(93, Math.max(7, left))}%`,
      top: `${Math.min(88, Math.max(12, top))}%`,
    };
  };

  const apriClientiGoogleMaps = () => {
    const clientiConPosizione = clientiFiltrati
      .map((cliente) => ({
        cliente,
        posizione: posizioneMapsCliente(cliente),
      }))
      .filter((item) => item.posizione);

    if (clientiConPosizione.length === 0) {
      setErrore("Nessun cliente con indirizzo o coordinate da aprire su Google Maps.");
      setMessaggio("");
      return;
    }

    const limiteTappe = 10;
    const tappe = clientiConPosizione.slice(0, limiteTappe);

    let url;
    if (tappe.length === 1) {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tappe[0].posizione)}`;
    } else {
      const [origine, ...resto] = tappe;
      const destinazione = resto[resto.length - 1];
      const intermedie = resto.slice(0, -1).map((item) => item.posizione).join("|");
      const params = new URLSearchParams({
        api: "1",
        origin: origine.posizione,
        destination: destinazione.posizione,
        travelmode: "driving",
      });

      if (intermedie) params.set("waypoints", intermedie);
      url = `https://www.google.com/maps/dir/?${params.toString()}`;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    setErrore("");
    setMessaggio(
      clientiConPosizione.length > limiteTappe
        ? `Google Maps aperto con i primi ${limiteTappe} clienti filtrati su ${clientiConPosizione.length}. Usa la ricerca per restringere la zona.`
        : `Google Maps aperto con ${clientiConPosizione.length} clienti.`,
    );
  };

  const apriCondominiGoogleMaps = (indiceGruppo = 0) => {
    const condominiConPosizione = clientiCondomini
      .map((cliente) => ({
        cliente,
        posizione: posizioneMapsCliente(cliente),
      }))
      .filter((item) => item.posizione);

    if (condominiConPosizione.length === 0) {
      setErrore("Nessun condominio con indirizzo o coordinate da aprire su Google Maps.");
      setMessaggio("");
      return;
    }

    const limiteTappe = 10;
    const inizio = indiceGruppo * limiteTappe;
    const gruppo = condominiConPosizione.slice(inizio, inizio + limiteTappe);

    if (gruppo.length === 0) {
      setErrore("Gruppo condomini non disponibile.");
      setMessaggio("");
      return;
    }

    let url;
    if (gruppo.length === 1) {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gruppo[0].posizione)}`;
    } else {
      const [origine, ...resto] = gruppo;
      const destinazione = resto[resto.length - 1];
      const intermedie = resto.slice(0, -1).map((item) => item.posizione).join("|");
      const params = new URLSearchParams({
        api: "1",
        origin: origine.posizione,
        destination: destinazione.posizione,
        travelmode: "driving",
      });

      if (intermedie) params.set("waypoints", intermedie);
      url = `https://www.google.com/maps/dir/?${params.toString()}`;
    }

    window.open(url, "_blank", "noopener,noreferrer");
    setErrore("");
    setMessaggio(`Google Maps aperto con condomini ${inizio + 1}-${inizio + gruppo.length} di ${condominiConPosizione.length}.`);
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",").pop());
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const anteprimaImportExcel = async (file) => {
    if (!file) return;
    setFileImport(file);
    setErrore("");
    setMessaggio("");
    setImportazione(null);

    try {
      const fileBase64 = await fileToBase64(file);
      const riepilogo = await api.post("/clienti/import-excel", { mode: "preview", fileBase64 });
      setImportazione(riepilogo);
    } catch (error) {
      setErrore(error.message);
    }
  };

  const confermaImportExcel = async () => {
    if (!fileImport) return;
    setErrore("");
    setMessaggio("");

    try {
      const fileBase64 = await fileToBase64(fileImport);
      const riepilogo = await api.post("/clienti/import-excel", { mode: "import", fileBase64 });
      setImportazione(riepilogo);
      await aggiornaVistaDaDatabase();
      setMessaggio("Importazione clienti completata.");
    } catch (error) {
      setErrore(error.message);
    }
  };

  const card = {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    textAlign: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  const actionButton = {
    height: "34px",
    minWidth: "128px",
    padding: "0 12px",
    borderRadius: "6px",
    whiteSpace: "nowrap",
  };

  const menuButton = {
    height: "34px",
    width: "38px",
    minWidth: "38px",
    padding: 0,
    borderRadius: "6px",
  };

  const numeroCondominiApribiliMaps = clientiCondomini.filter((cliente) => posizioneMapsCliente(cliente)).length;
  const numeroGruppiGoogleMapsCondomini = Math.ceil(numeroCondominiApribiliMaps / 10);

  return (
    <div className="clienti-page">
      <h1>Anagrafica Clienti</h1>

      <div
        className="clienti-dashboard"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: "20px",
          marginBottom: "25px",
        }}
      >
        <div style={card}>
          <h3>Totale Clienti</h3>
          <h2>{riepilogo.totale}</h2>
        </div>
        <div style={card}>
          <h3>Elenco Clienti</h3>
          <h2>{riepilogo.filtrati}</h2>
        </div>
        <div style={card}>
          <h3>Clienti con Email</h3>
          <h2>{riepilogo.conEmail}</h2>
        </div>
        <div style={card}>
          <h3>Clienti con Telefono</h3>
          <h2>{riepilogo.conTelefono}</h2>
        </div>
        <div style={card}>
          <h3>Preventivi</h3>
          <h2>{riepilogo.preventivi}</h2>
        </div>
        <div style={card}>
          <h3>Cantieri</h3>
          <h2>{riepilogo.cantieri}</h2>
        </div>
      </div>

      {errore && <p style={{ color: "crimson", marginBottom: "15px" }}>{errore}</p>}
      {messaggio && <p style={{ color: "green", marginBottom: "15px" }}>{messaggio}</p>}

      <div style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "14px" }}>
          <div>
            <h2 style={{ margin: 0 }}>Mappa condomini</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              {clientiCondomini.length} condomini trovati nei clienti filtrati, {condominiConCoordinate.length} con coordinate.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {Array.from({ length: numeroGruppiGoogleMapsCondomini }, (_, index) => (
              <button key={`maps-condomini-${index}`} type="button" onClick={() => apriCondominiGoogleMaps(index)}>
                Google Maps {index * 10 + 1}-{Math.min((index + 1) * 10, numeroCondominiApribiliMaps)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "16px", alignItems: "stretch" }}>
          <div
            style={{
              position: "relative",
              minHeight: "380px",
              overflow: "hidden",
              border: "1px solid #dbe3ef",
              borderRadius: "8px",
              background:
                "linear-gradient(90deg, rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(rgba(148,163,184,0.14) 1px, transparent 1px), #f8fafc",
              backgroundSize: "34px 34px",
            }}
          >
            <div style={{ position: "absolute", inset: "18px", border: "1px dashed #cbd5e1", borderRadius: "8px" }} />
            {condominiConCoordinate.length === 0 ? (
              <div style={{ display: "grid", height: "100%", minHeight: "380px", placeItems: "center", color: "#64748b", textAlign: "center", padding: "24px" }}>
                Nessun condominio con latitudine e longitudine. Inserisci le coordinate nelle anagrafiche per visualizzare i pin.
              </div>
            ) : (
              condominiConCoordinate.map((item, index) => {
                const posizione = posizionePinCondominio(item.coordinate);
                const cliente = item.cliente;

                return (
                  <button
                    key={`pin-condominio-${cliente.id}`}
                    type="button"
                    title={`${cliente.ragioneSociale || "Condominio"} - ${indirizzoMapsCliente(cliente)}`}
                    onClick={() => modificaCliente(cliente)}
                    style={{
                      position: "absolute",
                      left: posizione.left,
                      top: posizione.top,
                      transform: "translate(-50%, -50%)",
                      width: "34px",
                      height: "34px",
                      minWidth: "34px",
                      padding: 0,
                      borderRadius: "50%",
                      border: "2px solid white",
                      background: "#1d4ed8",
                      color: "white",
                      boxShadow: "0 10px 22px rgba(29,78,216,0.28)",
                      fontWeight: 800,
                    }}
                  >
                    {index + 1}
                  </button>
                );
              })
            )}
          </div>

          <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden", minHeight: "380px" }}>
            <div style={{ padding: "12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>
              Condomini indicati
            </div>
            <div style={{ maxHeight: "330px", overflowY: "auto" }}>
              {clientiCondomini.length === 0 ? (
                <p style={{ margin: 0, padding: "14px", color: "#64748b" }}>
                  Nessun condominio trovato. Verifica il campo Tipo Cliente o la ragione sociale.
                </p>
              ) : (
                clientiCondomini.map((cliente, index) => {
                  const coordinate = coordinateCliente(cliente);

                  return (
                    <button
                      key={`condominio-lista-${cliente.id}`}
                      type="button"
                      onClick={() => modificaCliente(cliente)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "34px 1fr",
                        gap: "10px",
                        width: "100%",
                        border: 0,
                        borderBottom: "1px solid #eef2f7",
                        background: "white",
                        color: "#0f172a",
                        padding: "11px 12px",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "50%", background: coordinate ? "#dbeafe" : "#f1f5f9", color: coordinate ? "#1d4ed8" : "#64748b", fontWeight: 800 }}>
                        {coordinate ? condominiConCoordinate.findIndex((item) => item.cliente.id === cliente.id) + 1 : "-"}
                      </span>
                      <span>
                        <strong style={{ display: "block" }}>{index + 1}. {cliente.ragioneSociale || "Condominio senza nome"}</strong>
                        <span style={{ display: "block", marginTop: "3px", color: "#64748b", fontSize: "12px" }}>
                          {indirizzoMapsCliente(cliente) || "Indirizzo non disponibile"}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {condominiSenzaCoordinate.length > 0 && (
              <p style={{ margin: 0, padding: "10px 12px", color: "#b45309", background: "#fff7ed", borderTop: "1px solid #fed7aa" }}>
                {condominiSenzaCoordinate.length} condomini sono in elenco ma senza pin perche mancano latitudine e longitudine.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="clienti-form-panel" style={{ background: "white", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
        <h2>{form.id ? "Modifica Cliente" : "Nuovo Cliente"}</h2>

        <div className="clienti-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "12px" }}>
          <input
            placeholder="ID Cliente *"
            value={form.clienteCode}
            maxLength={20}
            onChange={(e) => aggiornaForm("clienteCode", e.target.value)}
          />
          <input
            placeholder="Ragione Sociale"
            value={form.ragioneSociale}
            onChange={(e) => aggiornaForm("ragioneSociale", e.target.value)}
          />
          <input
            placeholder="Referente"
            value={form.referente}
            onChange={(e) => aggiornaForm("referente", e.target.value)}
          />
          <input
            placeholder="Amministratore"
            value={form.associazione}
            onChange={(e) => aggiornaForm("associazione", e.target.value)}
          />
          <input
            placeholder="Telefono"
            value={form.telefono}
            onChange={(e) => aggiornaForm("telefono", e.target.value)}
          />
          <input placeholder="Email principale" value={form.email} onChange={(e) => aggiornaForm("email", e.target.value)} />
          <input placeholder="Email amministratore" value={form.emailAmministratore} onChange={(e) => aggiornaForm("emailAmministratore", e.target.value)} />
          <input placeholder="Email referente" value={form.emailReferente} onChange={(e) => aggiornaForm("emailReferente", e.target.value)} />
          <input
            placeholder="Via"
            value={form.indirizzo}
            onChange={(e) => aggiornaForm("indirizzo", e.target.value)}
          />
          <input placeholder="CAP" value={form.cap} onChange={(e) => aggiornaForm("cap", e.target.value)} />
          <input placeholder="Comune" value={form.comune} onChange={(e) => aggiornaForm("comune", e.target.value)} />
          <input placeholder="Provincia" value={form.provincia} onChange={(e) => aggiornaForm("provincia", e.target.value)} />
          <input placeholder="Tipo Cliente" value={form.tipologiaCliente} onChange={(e) => aggiornaForm("tipologiaCliente", e.target.value)} />
          <input placeholder="Latitudine" value={form.latitudine} onChange={(e) => aggiornaForm("latitudine", e.target.value)} />
          <input placeholder="Longitudine" value={form.longitudine} onChange={(e) => aggiornaForm("longitudine", e.target.value)} />
        </div>

        <textarea
          placeholder="Note Cliente"
          value={form.note}
          onChange={(e) => aggiornaForm("note", e.target.value)}
          style={{ width: "100%", marginTop: "12px" }}
        />

        {form.id && (
          <div style={{ marginTop: "14px", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
            <strong>Cartella archivio:</strong>{" "}
            <span>{cartellaForm?.percorsoAbbreviato || cartellaForm?.folderPath || "Percorso non verificato"}</span>
            <p style={{ margin: "8px 0", color: cartellaForm?.exists ? "#15803d" : "#b45309" }}>
              {cartellaForm?.status || "Cartella non verificata"}
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => apriCartellaCliente({ id: form.id })}>Apri cartella</button>
              {cartellaForm && !cartellaForm.exists && (
                <button type="button" onClick={() => creaCartellaCliente({ id: form.id })}>Crea cartella</button>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "18px", flexWrap: "wrap" }}>
          <button onClick={salvaCliente}>{form.id ? "Salva Modifiche" : "Aggiungi Cliente"}</button>
          <button onClick={resetForm}>Nuovo / Annulla</button>
        </div>
      </div>

      <div className="clienti-table-panel" style={{ background: "white", padding: "20px", borderRadius: "8px" }}>
        <div className="clienti-list-toolbar" style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <h2>Elenco Clienti</h2>
          <div className="clienti-list-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              placeholder="Ricerca per ID cliente, cliente, referente, amministratore, telefono, email, comune"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              style={{ width: "500px" }}
            />
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <button type="button" onClick={() => document.getElementById("import-clienti-excel")?.click()}>
                Importa Excel
              </button>
              <input
                id="import-clienti-excel"
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={(e) => anteprimaImportExcel(e.target.files?.[0])}
              />
            </label>
            <button type="button" onClick={apriClientiGoogleMaps}>Google Maps</button>
            <button onClick={esportaClienti}>Esporta CSV</button>
          </div>
        </div>

        {importazione && (
          <div style={{ margin: "12px 0", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", textAlign: "left" }}>
            <strong>{importazione.mode === "import" ? "Importazione completata." : "Anteprima importazione"}</strong>
            <p style={{ margin: "8px 0" }}>
              Righe lette: {importazione.righeLette} | Nuovi clienti: {importazione.nuoviClienti} | Clienti aggiornati: {importazione.clientiAggiornati} | Righe incomplete: {importazione.righeIncomplete} | Duplicati rilevati: {importazione.duplicatiEvitati} | Righe saltate: {importazione.righeSaltate} | Errori: {importazione.errori}
            </p>
            {importazione.mode !== "import" && (
              <button onClick={confermaImportExcel}>Conferma importazione</button>
            )}
          </div>
        )}

        {caricamento ? (
          <p>Caricamento clienti...</p>
        ) : (
          <div className="clienti-table-wrap">
            <table width="100%" style={{ borderCollapse: "collapse", textAlign: "center" }}>
              <thead>
                <tr>
                  <th>ID Cliente</th>
                  <th>Ragione Sociale</th>
                  <th>Amministratore</th>
                  <th>Telefono</th>
                  <th>Email principale</th>
                  <th>Comune</th>
                  <th>Provincia</th>
                  <th>Tipo Cliente</th>
                  <th>Via</th>
                  <th>Note Cliente</th>
                  <th>Azioni</th>
                </tr>
              </thead>

              <tbody>
                {clientiFiltrati.length === 0 && (
                  <tr>
                    <td colSpan="11" style={{ padding: "22px", color: "#64748b" }}>
                      Nessun cliente trovato. Crea una nuova anagrafica o modifica la ricerca.
                    </td>
                  </tr>
                )}

                {clientiFiltrati.map((cliente) => (
                  <tr key={cliente.id}>
                    <td style={{ fontWeight: 800 }}>{valoreCliente(cliente, "idCliente", "clienteCode")}</td>
                    <td style={{ fontWeight: 800, textAlign: "left" }}>{cliente.ragioneSociale}</td>
                    <td>{amministratoreVisibile(cliente)}</td>
                    <td>{cliente.telefono}</td>
                    <td>{valoreCliente(cliente, "emailPrincipale", "email")}</td>
                    <td>{cliente.comune}</td>
                    <td>{cliente.provincia}</td>
                    <td>{cliente.tipologiaCliente}</td>
                    <td style={{ textAlign: "left" }}>{valoreCliente(cliente, "via", "indirizzo")}</td>
                    <td style={{ textAlign: "left" }}>{valoreCliente(cliente, "noteCliente", "note")}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "8px", minWidth: "610px", position: "relative", whiteSpace: "nowrap" }}>
                        <button style={actionButton} onClick={() => modificaCliente(cliente)}>Modifica</button>
                        <button style={actionButton} onClick={() => creaPreventivoCliente(cliente)}>Nuovo Preventivo</button>
                        <button style={actionButton} onClick={() => creaCantiereCliente(cliente)}>Nuovo Cantiere</button>
                        <button style={actionButton} onClick={() => apriCartellaCliente(cliente)}>Apri Cartella</button>
                        <button
                          style={menuButton}
                          aria-label={`Altro ${cliente.ragioneSociale || cliente.id}`}
                          onClick={() => setMenuAltroClienteId(menuAltroClienteId === cliente.id ? null : cliente.id)}
                        >
                          ⋮
                        </button>
                        {menuAltroClienteId === cliente.id && (
                          <div
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "40px",
                              zIndex: 10,
                              minWidth: "180px",
                              background: "white",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              boxShadow: "0 12px 30px rgba(15,23,42,0.14)",
                              overflow: "hidden",
                              textAlign: "left",
                            }}
                          >
                            <button type="button" onClick={() => apriSchedaCliente(cliente)} style={{ display: "block", width: "100%", border: 0, background: "white", padding: "10px 12px", textAlign: "left" }}>
                              Apri scheda cliente
                            </button>
                            <button type="button" onClick={() => { setMenuAltroClienteId(null); eliminaCliente(cliente); }} style={{ display: "block", width: "100%", border: 0, background: "white", color: "#b91c1c", padding: "10px 12px", textAlign: "left" }}>
                              Elimina
                            </button>
                          </div>
                        )}
                      </div>
                      <span style={{ display: "none" }}>
                        {contaPreventiviCliente(cliente)} {contaCantieriCliente(cliente)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Clienti;
