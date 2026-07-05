import { jsPDF } from "jspdf";
import { azienda } from "../config/azienda";
import { disegnaIntestazioneAzienda } from "./pdfAzienda";

function formatEuro(value) {
  return `EUR ${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const generaPDFSAL = async (sal) => {
  const doc = new jsPDF();

  await disegnaIntestazioneAzienda(doc, 20);

  doc.setFontSize(16);
  doc.text("CERTIFICATO DI PAGAMENTO SAL", 20, 45);

  doc.setFontSize(11);
  doc.text(`Data: ${sal.data || ""}`, 20, 55);
  doc.text(`Cantiere: ${sal.cantiere || ""}`, 20, 70);
  doc.text(`Cliente: ${sal.cliente || ""}`, 20, 80);

  doc.line(20, 90, 190, 90);

  doc.text(`Importo Contratto: ${formatEuro(sal.contratto)}`, 20, 110);
  doc.text(`Avanzamento: ${Number(sal.percentuale || 0).toLocaleString("it-IT")}%`, 20, 125);
  doc.text(`Importo Maturato: ${formatEuro(sal.maturato)}`, 20, 140);
  doc.text(`Importo Residuo: ${formatEuro(sal.residuo)}`, 20, 155);

  doc.line(20, 180, 190, 180);

  doc.text(`Firma ${azienda.ragioneSociale}`, 20, 210);
  doc.text("Firma Cliente", 130, 210);

  doc.save(`SAL_${sal.id}.pdf`);
};
