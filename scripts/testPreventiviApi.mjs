import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:3001/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${response.status}: ${data?.message || text}`);
  }

  return data;
}

const clienti = await request("/clienti");
const cliente = clienti.find((item) => item.id && item.ragioneSociale);
if (!cliente) throw new Error("Nessun cliente reale disponibile per il test.");

const numero = `PREV-CODEX-${Date.now()}`;
const baseRighe = [
  {
    codice: "TEST-CODEX",
    categoria: "Edili",
    categoriaBloccata: true,
    categoriaModificataManualmente: false,
    descrizione: "Voce test consolidamento Preventivi Enterprise",
    unita: "cad",
    partiUguali: "",
    lunghezza: "",
    larghezza: "",
    altezzaPeso: "",
    quantita: 2,
    prezzoUnitario: 100,
    sconto: 10,
  },
];

const creato = await request("/preventivi", {
  method: "POST",
  body: JSON.stringify({
    numero,
    data: new Date().toISOString().slice(0, 10),
    clienteId: cliente.id,
    idIndirizzo: cliente.indirizzi?.[0]?.id || "",
    cliente: cliente.ragioneSociale,
    cantiere: "",
    descrizione: "TEST CODEX - consolidamento Preventivi Enterprise",
    stato: "Bozza",
    ivaAliquota: 22,
    righe: baseRighe,
  }),
});

const dettaglio = await request(`/preventivi/${creato.id}`);
const modificato = await request(`/preventivi/${creato.id}`, {
  method: "PUT",
  body: JSON.stringify({
    ...dettaglio,
    descrizione: "TEST CODEX - consolidamento Preventivi Enterprise - modificato",
    righe: dettaglio.righe,
  }),
});
const ricaricato = await request(`/preventivi/${creato.id}`);
const pdf = await request(`/preventivi/${creato.id}/archivia-pdf`, {
  method: "POST",
  body: JSON.stringify({}),
});

const elenco = await request("/preventivi");

console.log(JSON.stringify({
  clienteUsato: { id: cliente.id, clienteCode: cliente.clienteCode, ragioneSociale: cliente.ragioneSociale },
  creato: { id: creato.id, numero: creato.numero, importo: creato.importo, righe: creato.righe?.length || 0 },
  modificato: { id: modificato.id, descrizione: modificato.descrizione },
  persistente: ricaricato.descrizione === modificato.descrizione,
  pdf: { message: pdf.message, fileName: pdf.archivio?.fileName, filePath: pdf.archivio?.filePath },
  preventiviTotaliDopoTest: elenco.length,
}, null, 2));
