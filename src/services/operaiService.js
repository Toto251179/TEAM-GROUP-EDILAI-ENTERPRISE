const OPERAI_KEY = "teamGroup.operai";

function readOperai() {
  const saved = localStorage.getItem(OPERAI_KEY);
  if (saved) return JSON.parse(saved);
  return [];
}

function writeOperai(operai) {
  localStorage.setItem(OPERAI_KEY, JSON.stringify(operai));
  window.dispatchEvent(new Event("teamGroupDataChanged"));
  return operai;
}

function creaId() {
  return `tec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const operaiService = {
  lista() {
    return readOperai();
  },

  salva(operaio) {
    const operai = readOperai();
    const normalizzato = {
      id: operaio.id || creaId(),
      nome: operaio.nome?.trim() || "",
      cognome: operaio.cognome?.trim() || "",
      telefono: operaio.telefono?.trim() || "",
      ruolo: operaio.ruolo || "Tecnico",
      squadra: operaio.squadra?.trim() || "",
      costoOrarioInterno: Number(operaio.costoOrarioInterno || operaio.costoOrario || 0),
      costoOrarioVendita: Number(operaio.costoOrarioVendita || 0),
      attivo: operaio.attivo !== false,
    };

    const aggiornati = operai.some((item) => item.id === normalizzato.id)
      ? operai.map((item) => (item.id === normalizzato.id ? normalizzato : item))
      : [...operai, normalizzato];

    return writeOperai(aggiornati);
  },

  elimina(id) {
    return writeOperai(readOperai().filter((operaio) => operaio.id !== id));
  },
};
