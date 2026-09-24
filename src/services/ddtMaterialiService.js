import { api } from "./api";

const DDT_INBOX_KEY = "teamGroup.ddtMateriali.inbox";

function readInbox() {
  try {
    return JSON.parse(localStorage.getItem(DDT_INBOX_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeInbox(value) {
  localStorage.setItem(DDT_INBOX_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event("teamGroupDataChanged"));
  return value;
}

function localId(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function allegatoDaFile(file) {
  return {
    nomeFile: file.name,
    tipo: file.type || "application/octet-stream",
    dimensione: file.size,
    dataUrl: await fileToDataUrl(file),
    caricatoIl: new Date().toISOString(),
  };
}

export const ddtMaterialiService = {
  lista() {
    return readInbox();
  },

  registroMateriali() {
    return [];
  },

  cercaMateriale() {
    return null;
  },

  async listaDb() {
    const registrati = await api.get("/ddt-materiali");
    return [...readInbox(), ...registrati];
  },

  async registroMaterialiDb() {
    return api.get("/ddt-materiali/articoli");
  },

  async preparaDaFile(file) {
    const allegato = await allegatoDaFile(file);
    const letto = await api.post("/ddt-materiali/analizza", {
      fileName: allegato.nomeFile,
      mimeType: allegato.tipo,
      dataUrl: allegato.dataUrl,
    });

    return {
      ...letto,
      allegato,
      letturaAi: letto.letturaAi || {
        esito: "OK",
        messaggio: "DDT letto. Verifica i dati prima della registrazione.",
      },
    };
  },

  async leggiConAi(bozza = {}) {
    if (!bozza.allegato?.dataUrl) {
      throw new Error("Allegato DDT non disponibile.");
    }

    const letto = await api.post("/ddt-materiali/analizza", {
      fileName: bozza.allegato.nomeFile || "ddt",
      mimeType: bozza.allegato.tipo || "application/octet-stream",
      dataUrl: bozza.allegato.dataUrl,
    });

    return {
      ...bozza,
      ...letto,
      allegato: bozza.allegato,
      id: bozza.id,
      fonte: bozza.fonte,
      ricevutoIl: bozza.ricevutoIl,
    };
  },

  async inviaDaTecnico(file, chiamata = {}) {
    const letto = await this.preparaDaFile(file);
    const bozza = {
      ...letto,
      id: localId("ddt-tecnico"),
      numeroChiamata: letto.numeroChiamata || chiamata.numeroChiamata || chiamata.numero || "",
      codiceProgetto: letto.codiceProgetto || chiamata.codProg || chiamata.codiceProgramma || "",
      idCliente: chiamata.idCliente || "",
      cliente: chiamata.cliente || "Cliente da associare",
      preventivoId: chiamata.preventivoId || "",
      preventivoNumero: chiamata.preventivoNumero || "",
      stato: "DA VERIFICARE",
      fonte: "APP TECNICI",
      ricevutoIl: new Date().toISOString(),
    };

    writeInbox([bozza, ...readInbox()]);
    return bozza;
  },

  async conferma(bozza) {
    const registrato = await api.post("/ddt-materiali", bozza);
    if (bozza.id && String(bozza.id).startsWith("ddt-tecnico-")) {
      writeInbox(readInbox().filter((item) => item.id !== bozza.id));
    }
    return registrato;
  },

  async elimina(idDdt) {
    if (String(idDdt).startsWith("ddt-tecnico-")) {
      writeInbox(readInbox().filter((item) => item.id !== idDdt));
      return;
    }
    return api.delete("/ddt-materiali/" + idDdt);
  },
};
