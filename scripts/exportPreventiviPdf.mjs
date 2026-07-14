import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getTipoRiga,
  getUnitaRiga,
  isRigaEconomica,
  numeroPreventivo,
} from "../server/utils/preventivoCalcoli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputDir = process.argv[2] || path.join(rootDir, "public", "preventivi");

const azienda = {
  ragioneSociale: "TEAM GROUP SRL",
  sede: "Via dell'Artigianato, 22 - 36050 Bolzano Vicentino (VI)",
};

function formatEuro(value) {
  const importo = Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [intero, decimali = "00"] = importo.split(",");
  const interoConMigliaia = intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `\u20ac ${interoConMigliaia},${decimali}`;
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

function formatViaCivico(indirizzo) {
  if (!indirizzo) return "";
  return [indirizzo.via, indirizzo.civico].filter(Boolean).join(" ");
}

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

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function numeroCampoApi(source, field, context) {
  if (!hasValue(source?.[field])) {
    const error = new Error(`Campo API mancante per PDF: ${context}.${field}`);
    error.code = "PDF_CAMPO_API_MANCANTE";
    throw error;
  }
  return numeroPreventivo(source[field]);
}

function getRigaPdfValori(riga = {}) {
  return {
    quantita: numeroCampoApi(riga, "quantita", "riga"),
    prezzoUnitario: numeroCampoApi(riga, "prezzoUnitario", "riga"),
    importoLordo: numeroCampoApi(riga, "importoLordo", "riga"),
    importo: numeroCampoApi(riga, "importo", "riga"),
    totale: numeroCampoApi(riga, "totale", "riga"),
  };
}

function getDescrizioneRigaPdf(riga = {}) {
  return normalizzaTestoPdf(riga.descrizione || "");
}

function normalizzaTestoPdf(value, { preservaRighe = false } = {}) {
  const normalizzaRiga = (testo) =>
    String(testo || "")
      .replace(/\s+/g, " ")
      .replace(/\s+,/g, ",")
      .replace(/,(\S)/g, ", $1")
      .replace(/\bCATIOIE\b/g, "CADITOIE")
      .replace(/\bPAVIMENTAZIONEESTERNA\b/g, "PAVIMENTAZIONE ESTERNA")
      .replace(/\bSUB\.(?=\d)/g, "SUB. ")
      .trim();

  if (preservaRighe) {
    return String(value || "")
      .split(/\r?\n/)
      .map((riga) => normalizzaRiga(riga))
      .filter(Boolean)
      .join("\n");
  }

  return normalizzaRiga(value);
}

function getTotaliPdf(preventivo = {}) {
  const lordo = numeroCampoApi(preventivo, "lordo", "preventivo");
  const sconto = numeroCampoApi(preventivo, "sconto", "preventivo");
  const imponibile = numeroCampoApi(preventivo, "imponibile", "preventivo");
  const ivaAliquota = numeroCampoApi(preventivo, "ivaPercentuale", "preventivo");
  const ivaImporto = numeroCampoApi(preventivo, "ivaImporto", "preventivo");
  const totale = numeroCampoApi(preventivo, "totale", "preventivo");

  return { lordo, sconto, imponibile, ivaAliquota, ivaImporto, totale };
}

function chiaveRigaPdfApi(riga = {}) {
  if (!isRigaEconomica(riga)) {
    return [
      getTipoRiga(riga),
      getDescrizioneRigaPdf(riga).replace(/\s+/g, " ").toLowerCase(),
      Boolean(riga.mostraSubtotaleCapitolo ?? riga.mostra_subtotale_capitolo),
    ].join("|");
  }

  const valori = getRigaPdfValori(riga);
  return [
    String(riga.codice ?? "").trim().toLowerCase(),
    String(riga.descrizione ?? "").trim().replace(/\s+/g, " ").toLowerCase(),
    String(riga.unita ?? "").trim().toLowerCase(),
    valori.quantita.toFixed(4),
    valori.prezzoUnitario.toFixed(4),
    valori.importoLordo.toFixed(4),
    valori.importo.toFixed(4),
    valori.totale.toFixed(4),
  ].join("|");
}

function deduplicaRighePdfApi(righe = []) {
  const risultato = [];
  let chiavePrecedente = null;

  for (const riga of Array.isArray(righe) ? righe : []) {
    const chiave = chiaveRigaPdfApi(riga);
    if (chiave && chiave === chiavePrecedente) continue;
    risultato.push(riga);
    chiavePrecedente = chiave;
  }

  return risultato;
}

function calcolaSubtotaleCapitoloPdf(righe = [], titoloIndex = 0) {
  let totale = 0;
  for (let index = titoloIndex + 1; index < righe.length; index += 1) {
    const riga = righe[index];
    if (getTipoRiga(riga) === "TITOLO") break;
    if (isRigaEconomica(riga)) totale += getRigaPdfValori(riga).importo;
  }
  return Number(totale.toFixed(2));
}

function creaDesignazionePdf({ titolo = "", note = [], descrizione = "", sommano = "" } = {}) {
  const titoloPdf = normalizzaTestoPdf(titolo);
  const notePdf = note.map((nota) => normalizzaTestoPdf(nota, { preservaRighe: true })).filter(Boolean);
  const descrizionePdf = normalizzaTestoPdf(descrizione);
  const sommanoPdf = normalizzaTestoPdf(sommano);
  const blocchi = [
    titoloPdf,
    ...notePdf,
    descrizionePdf,
    sommanoPdf,
  ].filter(Boolean);

  return {
    content: blocchi.join("\n\n"),
    styles: { fillColor: [255, 255, 255], halign: "left" },
    pdfDesignazione: {
      titolo: titoloPdf,
      note: notePdf,
      descrizione: descrizionePdf,
      sommano: sommanoPdf,
    },
  };
}

function calcolaAltezzaDesignazionePdf(doc, designazione = {}, maxWidth = 77.6) {
  let altezza = 3.4;
  if (designazione.titolo) {
    altezza += doc.splitTextToSize(designazione.titolo, maxWidth).length * 3.6 + 2.8;
  }
  if (designazione.note?.length) {
    designazione.note.forEach((nota) => {
      altezza += doc.splitTextToSize(nota, maxWidth).length * 3.3 + 2.2;
    });
  }
  if (designazione.descrizione) {
    altezza += doc.splitTextToSize(designazione.descrizione, maxWidth).length * 3.3;
  }
  if (designazione.sommano) {
    altezza += 4.2;
  }
  return Math.max(7, altezza + 1.5);
}

function formatMisuraPdf(riga, campo) {
  const snakeCampo = campo.replace(/[A-Z]/g, (lettera) => `_${lettera.toLowerCase()}`);
  const valore = numeroPreventivo(riga[campo] ?? riga[snakeCampo]);
  const valoriMisura = ["partiUguali", "lunghezza", "larghezza", "altezzaPeso"].map((nomeCampo) => {
    const snakeNome = nomeCampo.replace(/[A-Z]/g, (lettera) => `_${lettera.toLowerCase()}`);
    return numeroPreventivo(riga[nomeCampo] ?? riga[snakeNome]);
  });
  const sonoTuttiUno = valoriMisura.every((item) => item === 1);
  if (valore === 0 || sonoTuttiUno) return "";
  if (campo !== "partiUguali" && valore === 1) return "";
  return campo === "partiUguali" ? formatNumero(valore) : formatNumeroConDecimali(valore);
}

async function caricaLogoDataUrl() {
  const logoPath = path.join(rootDir, "public", "logo-team-group-clean.jpg");
  const buffer = await fs.readFile(logoPath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

function safeFileName(name) {
  return String(name || "preventivo").replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim();
}

async function rimuoviPdfPrecedenti(numero, fileNameFinale) {
  const prefissoNumero = safeFileName(numero);
  const files = await fs.readdir(outputDir).catch(() => []);

  await Promise.all(
    files
      .filter((file) => file.toLowerCase().endsWith(".pdf"))
      .filter((file) => file !== fileNameFinale)
      .filter((file) => file.startsWith(prefissoNumero))
      .map((file) => fs.unlink(path.join(outputDir, file))),
  );
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

async function generaPdf(preventivo, clientiArchivio = []) {
  const doc = new jsPDF();
  const righe = deduplicaRighePdfApi(preventivo.righe || []);
  const totaliPdf = getTotaliPdf(preventivo);
  let y = 18;

  await disegnaLogo(doc, y);
  disegnaRiquadroClienteCode(doc, getClienteCode(preventivo, clientiArchivio));
  y = 42;

  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.setTextColor(255, 0, 0);
  doc.text("PREVENTIVO", 105, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 10;

  const dettagli = [
    ["Cliente:", getClienteNome(preventivo, clientiArchivio)],
    ["Via:", getClienteVia(preventivo, clientiArchivio)],
    ["Oggetto:", preventivo.descrizione || ""],
    ["Commessa:", formatNumeroPreventivo(preventivo.numero)],
  ];
  doc.setFontSize(8.3);
  dettagli.forEach(([label, value]) => {
    const righeValore = doc.splitTextToSize(normalizzaTestoPdf(value), 164);
    doc.setFont(undefined, "bolditalic");
    doc.text(label, 8, y);
    doc.setFont(undefined, "bold");
    doc.text(righeValore, 28, y);
    y += Math.max(4.8, righeValore.length * 4.2);
  });
  doc.setFont(undefined, "normal");
  y += 5;

  const computoRows = [];
  let titoloSubtotaleAttivo = null;
  let titoloDesignazione = "";
  let noteDesignazione = [];

  const aggiungiSubtotaleCapitolo = () => {
    if (titoloSubtotaleAttivo === null) return;
    const titolo = righe[titoloSubtotaleAttivo];
    const subtotale = calcolaSubtotaleCapitoloPdf(righe, titoloSubtotaleAttivo);
    if ((titolo?.mostraSubtotaleCapitolo || titolo?.mostra_subtotale_capitolo) && subtotale > 0) {
      computoRows.push([{ content: `TOTALE CAPITOLO ${formatEuro(subtotale)}`, colSpan: 9, styles: { fontStyle: "bold", halign: "right", fillColor: [255, 247, 237] } }]);
    }
  };

  const aggiungiRigaDescrittivaSospesa = () => {
    if (!titoloDesignazione && noteDesignazione.length === 0) return;
    computoRows.push(["", creaDesignazionePdf({ titolo: titoloDesignazione, note: noteDesignazione }), "", "", "", "", "", "", ""]);
    titoloDesignazione = "";
    noteDesignazione = [];
  };

  righe.forEach((rigaPdf, index) => {
    const tipoRiga = getTipoRiga(rigaPdf);
    if (tipoRiga === "TITOLO") {
      aggiungiRigaDescrittivaSospesa();
      aggiungiSubtotaleCapitolo();
      titoloSubtotaleAttivo = index;
      titoloDesignazione = getDescrizioneRigaPdf(rigaPdf);
      noteDesignazione = [];
      return;
    }
    if (tipoRiga === "NOTA") {
      const nota = getDescrizioneRigaPdf(rigaPdf);
      if (nota) noteDesignazione.push(nota);
      return;
    }

    const valori = getRigaPdfValori(rigaPdf);
    computoRows.push(
      [
        rigaPdf.codice || index + 1,
        creaDesignazionePdf({
          titolo: titoloDesignazione,
          note: noteDesignazione,
          descrizione: rigaPdf.descrizione || "",
          sommano: `SOMMANO a ${getUnitaRiga(rigaPdf)}`,
        }),
        formatMisuraPdf(rigaPdf, "partiUguali"),
        formatMisuraPdf(rigaPdf, "lunghezza"),
        formatMisuraPdf(rigaPdf, "larghezza"),
        formatMisuraPdf(rigaPdf, "altezzaPeso"),
        formatNumeroConDecimali(valori.quantita),
        formatEuro(valori.prezzoUnitario),
        formatEuro(valori.importo),
      ],
    );
    titoloDesignazione = "";
    noteDesignazione = [];
  });
  aggiungiRigaDescrittivaSospesa();
  aggiungiSubtotaleCapitolo();

  autoTable(doc, {
    startY: y,
    head: [
      [
        { content: "Num.Ord.\nTARIFFA", rowSpan: 2 },
        { content: "DESIGNAZIONE DEI LAVORI", rowSpan: 2 },
        { content: "D I M E N S I O N I", colSpan: 4 },
        { content: "Quantit\u00e0", rowSpan: 2 },
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
    margin: { top: 14, left: 8, right: 8, bottom: 18 },
    pageBreak: "auto",
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didParseCell: (data) => {
      const rawRow = data.row.raw || [];
      const isSommano = typeof rawRow[1] === "string" && rawRow[1].startsWith("SOMMANO");
      const designazione = data.column.index === 1 && data.cell.raw?.pdfDesignazione;
      if (data.row.section === "body" && designazione) {
        data.cell.styles.fillColor = [255, 255, 255];
        data.cell.styles.halign = "left";
        data.cell.styles.minCellHeight = calcolaAltezzaDesignazionePdf(doc, designazione, 77.6);
        data.cell.text = [];
      }
      if (data.row.section === "body" && isSommano) {
        data.cell.styles.fontStyle = data.column.index === 1 ? "italic" : "normal";
        if (data.column.index === 1) data.cell.styles.halign = "right";
      }
      if (data.row.section === "body" && data.column.index >= 6) {
        data.cell.styles.valign = "bottom";
      }
      if (data.row.section === "body") {
        data.cell.styles.lineWidth = { top: 0, right: 0.12, bottom: 0, left: 0.12 };
      }
    },
    didDrawCell: (data) => {
      const designazione = data.column.index === 1 && data.cell.raw?.pdfDesignazione;
      if (data.row.section !== "body" || !designazione) return;

      const x = data.cell.x + 1.2;
      let textY = data.cell.y + 3.4;
      const maxWidth = data.cell.width - 2.4;

      if (designazione.titolo) {
        doc.setFont(undefined, "bold");
        doc.setFontSize(8.6);
        doc.setTextColor(0, 0, 0);
        const righeTitolo = doc.splitTextToSize(designazione.titolo, maxWidth);
        doc.text(righeTitolo, x, textY);
        textY += righeTitolo.length * 3.6 + 2.8;
      }

      if (designazione.note?.length) {
        doc.setFont(undefined, "normal");
        doc.setFontSize(7.4);
        doc.setTextColor(0, 0, 0);
        designazione.note.forEach((nota) => {
          const righeNota = doc.splitTextToSize(nota, maxWidth);
          doc.text(righeNota, x, textY);
          textY += righeNota.length * 3.3 + 2.2;
        });
      }

      if (designazione.descrizione) {
        doc.setFont(undefined, "normal");
        doc.setFontSize(7.2);
        doc.setTextColor(0, 0, 0);
        doc.text(doc.splitTextToSize(designazione.descrizione, maxWidth), x, textY);
      }

      if (designazione.sommano) {
        doc.setFont(undefined, "italic");
        doc.setFontSize(7.2);
        doc.setTextColor(0, 0, 0);
        doc.text(designazione.sommano, data.cell.x + data.cell.width - 1.2, data.cell.y + data.cell.height - 2.4, { align: "right" });
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
  doc.text("TOTALE", totaleImportoX - 3, totaleY + 3.7, { align: "right" });
  doc.text(formatEuro(totaliPdf.imponibile), totaleX + totaleWidth - 1.2, totaleY + 3.7, { align: "right" });

  y = totaleY + totaleHeight + 5;
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
    "- Validit\u00e0 offerta: 15 giorni",
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
    "- La Committente dovr\u00e0 mettere a disposizione dell'Impresa energia elettrica e acqua, ai fini dell'esecuzione delle opere.",
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
const clientiResponse = await fetch("http://127.0.0.1:3001/api/clienti");
const clienti = clientiResponse.ok ? await clientiResponse.json() : [];

await fs.mkdir(outputDir, { recursive: true });

for (const preventivo of preventivi) {
  const numero = formatNumeroPreventivo(preventivo.numero);
  const fileName = `${safeFileName(numero)}.pdf`;
  const filePath = path.join(outputDir, fileName);
  const buffer = await generaPdf(preventivo, clienti);
  await rimuoviPdfPrecedenti(numero, fileName);
  await fs.writeFile(filePath, buffer);
  console.log(filePath);
}

console.log(`Rigenerati ${preventivi.length} preventivi in ${outputDir}.`);
