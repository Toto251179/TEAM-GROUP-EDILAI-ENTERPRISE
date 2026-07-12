import { jsPDF } from "jspdf";
import { azienda } from "../config/azienda";
import { disegnaIntestazioneAzienda } from "./pdfAzienda";

function getClienteNome(preventivo, clientiArchivio = []) {
  const cliente = preventivo.cliente;
  const clienteId = preventivo.clienteId || preventivo.idCliente || cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));
  const nomeCliente = typeof cliente === "object" && cliente !== null
    ? cliente.ragioneSociale || cliente.ragione_sociale || cliente.nome || cliente.denominazione || ""
    : cliente;
  return String(
    nomeCliente ||
    preventivo.clienteNome ||
    preventivo.nomeCliente ||
    clienteDaArchivio?.ragioneSociale ||
    clienteDaArchivio?.ragione_sociale ||
    clienteDaArchivio?.nome ||
    "",
  ).replace(/^ID\s*\d+\s*-\s*/i, "").trim();
}

function formatViaCivico(indirizzo) {
  if (!indirizzo) return "";
  return [indirizzo.via, indirizzo.civico].filter(Boolean).join(" ");
}

function normalizzaViaPreventivo(value) {
  if (!value) return "";
  if (typeof value === "object") {
    return [value.via || value.indirizzo || "", value.civico || ""].filter(Boolean).join(" ");
  }
  return String(value).trim();
}

function getClienteVia(preventivo, clientiArchivio = []) {
  const clienteId = preventivo.clienteId || preventivo.idCliente || preventivo.cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));

  return (
    normalizzaViaPreventivo(preventivo.clienteVia) ||
    normalizzaViaPreventivo(preventivo.cliente?.via) ||
    normalizzaViaPreventivo(preventivo.cliente?.indirizzo) ||
    normalizzaViaPreventivo(preventivo.cliente?.address) ||
    normalizzaViaPreventivo(preventivo.cliente?.sede) ||
    normalizzaViaPreventivo(clienteDaArchivio?.via) ||
    normalizzaViaPreventivo(clienteDaArchivio?.indirizzo) ||
    normalizzaViaPreventivo(clienteDaArchivio?.address) ||
    normalizzaViaPreventivo(clienteDaArchivio?.sede) ||
    normalizzaViaPreventivo(preventivo.via) ||
    normalizzaViaPreventivo(preventivo.indirizzo)
  );
}

function getClienteCode(preventivo, clientiArchivio = []) {
  const clienteId = preventivo.clienteId || preventivo.idCliente || preventivo.cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));
  const nomePreventivo = String(preventivo.clienteNome || preventivo.cliente || "").trim().toLowerCase();
  const clienteDaNome = clientiArchivio.find(
    (item) => String(item.ragioneSociale || item.ragione_sociale || item.nome || "").trim().toLowerCase() === nomePreventivo,
  );

  return String(
    preventivo.clienteCode ||
    preventivo.cliente?.clienteCode ||
    clienteDaArchivio?.clienteCode ||
    clienteDaNome?.clienteCode ||
    "",
  ).trim();
}

function disegnaRiquadroClienteCode(doc, clienteCode) {
  if (!clienteCode) return;
  const x = 164;
  const y = 16;
  const width = 36;
  const height = 18;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.3);
  doc.rect(x, y, width, height);
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  doc.text(String(clienteCode), x + width / 2, y + height / 2 + 1, { align: "center" });
}

export const generaPDFPreventivo = async (preventivo, clientiArchivio = []) => {
  const doc = new jsPDF();

  const imponibile =
    Number(preventivo.importo || 0);

  const iva = imponibile * 0.22;

  const totale =
    imponibile + iva;

  await disegnaIntestazioneAzienda(doc, 20);
  disegnaRiquadroClienteCode(doc, getClienteCode(preventivo, clientiArchivio));

  doc.setFontSize(16);

  doc.text(
    "PREVENTIVO",
    20,
    45
  );

  doc.line(20, 50, 190, 50);

  doc.setFontSize(11);

  doc.text(
    `Data: ${new Date().toLocaleDateString("it-IT")}`,
    20,
    55
  );

  doc.text(
    `Cliente: ${getClienteNome(preventivo, clientiArchivio)}`,
    20,
    70
  );

  doc.text(
    `Via: ${getClienteVia(preventivo, clientiArchivio)}`,
    20,
    78
  );

  doc.text(
    `Oggetto: ${preventivo.descrizione}`,
    20,
    90
  );

  doc.line(20, 95, 190, 95);

  doc.text(
    `Imponibile: € ${imponibile.toLocaleString("it-IT")}`,
    20,
    120
  );

  doc.text(
    `IVA 22%: € ${iva.toLocaleString("it-IT")}`,
    20,
    135
  );

  doc.setFontSize(14);

  doc.text(
    `TOTALE: € ${totale.toLocaleString("it-IT")}`,
    20,
    155
  );

  doc.setFontSize(11);

  doc.text(
    "Pagamento: Bonifico Bancario 30 gg",
    20,
    190
  );

  doc.text(
    "Validità offerta: 30 giorni",
    20,
    205
  );

  doc.line(20, 240, 80, 240);

  doc.text(
    azienda.ragioneSociale,
    20,
    250
  );

  doc.save(
    `Preventivo_${preventivo.cliente}.pdf`
  );
};
