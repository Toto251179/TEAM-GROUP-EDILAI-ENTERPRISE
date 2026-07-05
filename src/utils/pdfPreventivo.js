import { jsPDF } from "jspdf";
import { azienda } from "../config/azienda";
import { disegnaIntestazioneAzienda } from "./pdfAzienda";

export const generaPDFPreventivo = async (preventivo) => {
  const doc = new jsPDF();

  const imponibile =
    Number(preventivo.importo || 0);

  const iva = imponibile * 0.22;

  const totale =
    imponibile + iva;

  await disegnaIntestazioneAzienda(doc, 20);

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
    `Cliente: ${preventivo.cliente}`,
    20,
    70
  );

  doc.text(
    `Oggetto: ${preventivo.descrizione}`,
    20,
    85
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
