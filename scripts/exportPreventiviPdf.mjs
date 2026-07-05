import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = process.argv[2];

const azienda = {
  ragioneSociale: "TEAM GROUP SRL",
  sede: "Via dell'Artigianato, 22 - 36050 Bolzano Vicentino (VI)",
};

if (!outputDir) {
  throw new Error("Indica la cartella di destinazione.");
}

function formatEuro(value) {
  const importo = Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${importo} EUR`.replace("EUR", "€");
}

function formatNumero(value) {
  return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

function formatNumeroConDecimali(value) {
  return Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("it-IT");
}

function formatNumeroPreventivo(numero) {
  const valore = String(numero || "").trim();
  const match = valore.match(/PREV-(?:\d{4}-)?(\d+)/);
  if (!match) return valore;
  const revisioneTrovata = valore.match(/\bRev[._\s-]*(\d+)/i)?.[1];
  const revisione = revisioneTrovata && revisioneTrovata.length <= 2 ? revisioneTrovata : "00";
  return `PREV-${match[1]} -Rev${String(revisione).padStart(2, "0")}`;
}

function calcolaQuantitaRiga(riga) {
  const campiMisura = [riga.partiUguali, riga.lunghezza, riga.larghezza, riga.altezzaPeso];
  const usaMisure = campiMisura.some((valore) => valore !== undefined && valore !== "" && Number(valore || 0) !== 0);
  if (!usaMisure) return Number(riga.quantita || 0);
  const [partiUguali, lunghezza, larghezza, altezzaPeso] = campiMisura.map((valore) => Number(valore || 1));
  return Number((partiUguali * lunghezza * larghezza * altezzaPeso).toFixed(2));
}

function calcolaImportoRiga(riga) {
  const quantita = calcolaQuantitaRiga(riga);
  const prezzoUnitario = Number(riga.prezzoUnitario || 0);
  const sconto = Number(riga.sconto || 0);
  return Number((quantita * prezzoUnitario * (1 - sconto / 100)).toFixed(2));
}

function calcolaTotali(righe = [], ivaAliquota = 22) {
  const imponibile = Number(righe.reduce((totale, riga) => totale + calcolaImportoRiga(riga), 0).toFixed(2));
  const aliquota = Number.isFinite(Number(ivaAliquota)) ? Number(ivaAliquota) : 22;
  const iva = Number((imponibile * (aliquota / 100)).toFixed(2));
  return { imponibile, ivaAliquota: aliquota, totale: Number((imponibile + iva).toFixed(2)) };
}

function formatMisuraPdf(riga, campo) {
  const campiMisura = ["partiUguali", "lunghezza", "larghezza", "altezzaPeso"];
  const valoriMisura = campiMisura.map((nomeCampo) => riga[nomeCampo]);
  const sonoTuttiUno = valoriMisura.every((valore) => Number(valore || 0) === 1);
  if (riga[campo] === "" || riga[campo] === null || riga[campo] === undefined) return "";
  if (Number(riga[campo] || 0) === 0) return "";
  if (sonoTuttiUno) return "";
  if (campo !== "partiUguali" && Number(riga[campo] || 0) === 1) return "";
  return campo === "partiUguali" ? formatNumero(riga[campo]) : formatNumeroConDecimali(riga[campo]);
}

async function caricaLogoDataUrl() {
  const logoPath = path.join(rootDir, "public", "logo-team-group-clean.jpg");
  const buffer = await fs.readFile(logoPath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

function safeFileName(name) {
  return String(name || "preventivo").replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim();
}

async function disegnaLogo(doc, y) {
  const logoDataUrl = await caricaLogoDataUrl();
  const props = doc.getImageProperties(logoDataUrl);
  const maxWidth = 52;
  const maxHeight = 24;
  const ratio = Math.min(maxWidth / props.width, maxHeight / props.height);
  const width = props.width * ratio;
  const height = props.height * ratio;
  doc.addImage(logoDataUrl, "JPEG", 14, y - height + 7, width, height);
}

async function generaPdf(preventivo) {
  const doc = new jsPDF();
  const righe = preventivo.righe || [];
  const totaliPdf = calcolaTotali(righe, preventivo.ivaAliquota);
  let y = 18;

  await disegnaLogo(doc, y);
  y = 42;

  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.setTextColor(255, 0, 0);
  doc.text("PREVENTIVO", 105, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 10;

  const dettagli = [
    ["Cliente:", preventivo.cliente || ""],
    ["Indirizzo:", preventivo.cantiere || ""],
    ["Oggetto:", preventivo.descrizione || ""],
    ["Commessa:", formatNumeroPreventivo(preventivo.numero)],
  ];
  doc.setFontSize(8.3);
  dettagli.forEach(([label, value]) => {
    const righeValore = doc.splitTextToSize(String(value), 164);
    doc.setFont(undefined, "bolditalic");
    doc.text(label, 8, y);
    doc.setFont(undefined, "bold");
    doc.text(righeValore, 28, y);
    y += Math.max(4.8, righeValore.length * 4.2);
  });
  doc.setFont(undefined, "normal");
  y += 5;

  const computoRows = [];
  righe.forEach((rigaPdf, index) => {
    const quantita = formatNumeroConDecimali(calcolaQuantitaRiga(rigaPdf));
    const prezzo = formatEuro(rigaPdf.prezzoUnitario);
    const importo = formatEuro(calcolaImportoRiga(rigaPdf));
    computoRows.push(
      [
        rigaPdf.codice || index + 1,
        rigaPdf.descrizione || "",
        formatMisuraPdf(rigaPdf, "partiUguali"),
        formatMisuraPdf(rigaPdf, "lunghezza"),
        formatMisuraPdf(rigaPdf, "larghezza"),
        formatMisuraPdf(rigaPdf, "altezzaPeso"),
        "",
        "",
        "",
      ],
      ["", `SOMMANO a ${rigaPdf.unita || ""}`, "", "", "", "", quantita, prezzo, importo],
    );
  });

  autoTable(doc, {
    startY: y,
    head: [
      [
        { content: "Num.Ord.\nTARIFFA", rowSpan: 2 },
        { content: "DESIGNAZIONE DEI LAVORI", rowSpan: 2 },
        { content: "D I M E N S I O N I", colSpan: 4 },
        { content: "Quantita", rowSpan: 2 },
        { content: "I M P O R T I", colSpan: 2 },
      ],
      ["par.ug.", "lung.", "larg.", "H/peso", "unitario", "TOTALE"],
    ],
    body: computoRows,
    theme: "grid",
    styles: {
      fontSize: 7.2,
      cellPadding: { top: 1.3, right: 0.8, bottom: 1.3, left: 0.8 },
      overflow: "linebreak",
      valign: "top",
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: { top: 0, right: 0.12, bottom: 0, left: 0.12 },
    },
    headStyles: {
      fillColor: [244, 177, 131],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 15, halign: "center" },
      1: { cellWidth: 80 },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 12, halign: "right" },
      4: { cellWidth: 12, halign: "right" },
      5: { cellWidth: 12, halign: "right" },
      6: { cellWidth: 12, halign: "right" },
      7: { cellWidth: 15, halign: "right" },
      8: { cellWidth: 16, halign: "right" },
    },
    margin: { left: 8, right: 8 },
    didParseCell: (data) => {
      const rawRow = data.row.raw || [];
      const isSommano = typeof rawRow[1] === "string" && rawRow[1].startsWith("SOMMANO");
      if (data.row.section === "body" && isSommano) {
        data.cell.styles.fontStyle = data.column.index === 1 ? "italic" : "normal";
        if (data.column.index === 1) data.cell.styles.halign = "right";
      }
      if (data.row.section === "body") {
        data.cell.styles.lineWidth = { top: 0, right: 0.12, bottom: 0, left: 0.12 };
      }
    },
  });

  const tabellaComputo = doc.lastAutoTable;
  y = tabellaComputo.finalY;
  if (y > 235) {
    doc.addPage();
    y = 20;
  }

  const larghezzaTabella = tabellaComputo?.columns?.reduce((somma, colonna) => somma + Number(colonna.width || 0), 0);
  const totaleX = tabellaComputo?.settings?.margin?.left || 8;
  const totaleY = y + 2;
  const totaleWidth = larghezzaTabella || 184;
  const totaleHeight = 5.2;
  const totaleImportoWidth = 20;
  const totaleImportoX = totaleX + totaleWidth - totaleImportoWidth;

  doc.setFillColor(244, 177, 131);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.rect(totaleX, totaleY, totaleWidth, totaleHeight, "FD");
  doc.line(totaleImportoX, totaleY, totaleImportoX, totaleY + totaleHeight);
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  doc.text("TOTALE", totaleImportoX - 7, totaleY + 3.7, { align: "right" });
  doc.text(formatEuro(totaliPdf.imponibile), totaleX + totaleWidth - 1.2, totaleY + 3.7, { align: "right" });

  y = totaleY + totaleHeight + 10;
  if (y > 235) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(8.4);
  doc.setFont(undefined, "bold");
  doc.text("CONDIZIONI DI FORNITURA:", 14, y);
  doc.setFont(undefined, "normal");
  y += 6;
  [
    `- Importi IVA esclusa. Aliquota IVA applicata: ${formatNumero(totaliPdf.ivaAliquota)}%`,
    "- Pagamento: da concordare.",
    "- Validita offerta: 15 giorni",
    "- Inizio lavori: da concordare.",
  ].forEach((rigaCondizione) => {
    doc.text(rigaCondizione, 14, y);
    y += 4.4;
  });

  if (y > 245) {
    doc.addPage();
    y = 24;
  } else {
    y += 4;
  }

  doc.setFont(undefined, "bold");
  doc.text("ESCLUSIONI:", 14, y);
  doc.setFont(undefined, "normal");
  y += 7;
  [
    "- La stesura e presentazione agli Enti preposti delle pratiche necessarie all'esecuzione delle opere ed ogni altro annesso.",
    "- Oneri per richieste di allacciamenti agli enti competenti ed eventuali opere edili accessorie.",
    "- Eventuali opere aggiuntive e non espressamente indicate nella presente offerta, richieste dagli Enti interessati.",
    "- Tutto quanto non espressamente citato nella presente offerta.",
  ].forEach((rigaEsclusione) => {
    const split = doc.splitTextToSize(rigaEsclusione, 182);
    doc.text(split, 14, y);
    y += split.length * 4.4 + 1.4;
  });

  y += 2;
  if (y > 245) {
    doc.addPage();
    y = 24;
  }

  doc.setFont(undefined, "bold");
  doc.text("NOTE:", 14, y);
  doc.setFont(undefined, "normal");
  y += 7;
  [
    "- Eventuali lavori extra eseguiti, non espressamente citati nella presente, saranno richiesti dalla Committente e regolarmente assegnati previa accettazione di relativo preventivo Extra dedicato.",
    '- I lavori oggetto del presente preventivo vengono affidati al Fornitore "A MISURA".',
    "- La Committente dovra mettere a disposizione dell'Impresa energia elettrica e acqua, ai fini dell'esecuzione delle opere.",
  ].forEach((rigaNota) => {
    const split = doc.splitTextToSize(rigaNota, 182);
    doc.text(split, 14, y);
    y += split.length * 4.4 + 1.4;
  });

  y += 2;
  if (y > 276) {
    doc.addPage();
    y = 24;
  }
  doc.setFont(undefined, "bolditalic");
  doc.text("Vicenza,", 154, y);
  doc.text(formatDate(preventivo.data || new Date()), 178, y);
  y += 6;
  doc.setFont(undefined, "bold");
  doc.text(azienda.ragioneSociale, 178, y, { align: "center" });
  doc.setFont(undefined, "normal");

  const pageCount = doc.internal.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    doc.setPage(pageIndex);
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont(undefined, "italic");
    doc.text(`Pagina ${pageIndex} di ${pageCount}`, 105, 286, { align: "center" });
    doc.setTextColor(40, 85, 155);
    doc.text(azienda.sede, 105, 293, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");
  }

  return Buffer.from(doc.output("arraybuffer"));
}

const response = await fetch("http://127.0.0.1:3001/api/preventivi");
if (!response.ok) throw new Error(`Impossibile leggere i preventivi: ${response.status}`);
const preventivi = await response.json();

await fs.mkdir(outputDir, { recursive: true });

for (const preventivo of preventivi) {
  const numero = formatNumeroPreventivo(preventivo.numero);
  const cliente = preventivo.cliente ? ` - ${preventivo.cliente}` : "";
  const filePath = path.join(outputDir, `${safeFileName(numero + cliente)}.pdf`);
  const buffer = await generaPdf(preventivo);
  try {
    await fs.writeFile(filePath, buffer);
    console.log(filePath);
  } catch (error) {
    if (error.code !== "EBUSY") throw error;
    const fallbackPath = path.join(outputDir, `${safeFileName(numero + cliente)} - aggiornato.pdf`);
    await fs.writeFile(fallbackPath, buffer);
    console.log(`${fallbackPath} (file originale aperto/bloccato)`);
  }
}

console.log(`Esportati ${preventivi.length} preventivi.`);
