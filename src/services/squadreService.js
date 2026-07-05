import { operaiService } from "./operaiService.js";

const SQUADRE_KEY = "teamGroup.squadre";

const squadraDemo = {
  id: "squadra-amir-shefi",
  nomeSquadra: "AMIR - SHEFI",
  tecnici: ["tec-amir", "tec-shefi"],
  attiva: true,
};

function readSquadre() {
  operaiService.lista();
  const saved = localStorage.getItem(SQUADRE_KEY);
  if (saved) return JSON.parse(saved);
  localStorage.setItem(SQUADRE_KEY, JSON.stringify([squadraDemo]));
  return [squadraDemo];
}

function writeSquadre(squadre) {
  localStorage.setItem(SQUADRE_KEY, JSON.stringify(squadre));
  window.dispatchEvent(new Event("teamGroupDataChanged"));
  return squadre;
}

function creaId() {
  return `squadra-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const squadreService = {
  lista() {
    return readSquadre();
  },

  salva(squadra) {
    const squadre = readSquadre();
    const normalizzata = {
      id: squadra.id || creaId(),
      nomeSquadra: squadra.nomeSquadra?.trim() || "Nuova squadra",
      tecnici: Array.isArray(squadra.tecnici) ? squadra.tecnici : [],
      attiva: squadra.attiva !== false,
    };

    const aggiornate = squadre.some((item) => item.id === normalizzata.id)
      ? squadre.map((item) => (item.id === normalizzata.id ? normalizzata : item))
      : [...squadre, normalizzata];

    return writeSquadre(aggiornate);
  },

  elimina(id) {
    return writeSquadre(readSquadre().filter((squadra) => squadra.id !== id));
  },
};
