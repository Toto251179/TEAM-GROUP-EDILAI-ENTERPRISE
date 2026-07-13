import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { env } from "../config/env.js";
import {
  getTipoRiga,
  getUnitaRiga,
  isRigaEconomica,
  numeroPreventivo,
} from "./preventivoCalcoli.js";

const rootDir = process.cwd();

function formatEuro(value) {
  return `${Number(value || 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EUR`.replace("EUR", "€");
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

function safeFileName(name) {
  return String(name || "preventivo")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

function parseNumeroRevisione(numero) {
  const formattato = formatNumeroPreventivo(numero);
  const baseMatch = formattato.match(/^(PREV-\d+)/i);
  const revMatch = formattato.match(/\bRev[._\s-]*(\d+)/i);
  return {
    base: baseMatch ? baseMatch[1].toUpperCase() : safeFileName(formattato.replace(/\bRev[._\s-]*\d+/i, "").trim()),
    revisione: `Rev${String(revMatch?.[1] || "00").padStart(2, "0")}`,
  };
}

async function findCartellaPreventivo(outputDir, numeroBase) {
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    return entries.find((entry) => entry.isDirectory() && entry.name.toUpperCase().startsWith(`${numeroBase.toUpperCase()} - `))?.name || "";
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePreventiviOutputDir(configuredDir = env.preventivi.outputDir) {
  const candidates = [];
  if (configuredDir && !String(configuredDir).includes("<UTENTE>")) candidates.push(path.resolve(configuredDir));

  const home = os.homedir();
  const oneDrive = process.env.OneDrive || process.env.OneDriveCommercial || process.env.OneDriveConsumer;
  candidates.push(path.join(home, "Desktop", "PREVENTIVI TEAM GROUP"));
  if (oneDrive) candidates.push(path.join(oneDrive, "Desktop", "PREVENTIVI TEAM GROUP"));

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await pathExists(candidate)) return candidate;
  }

  return uniqueCandidates[0] || path.join(home, "Desktop", "PREVENTIVI TEAM GROUP");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function findDirectoryByPrefix(parentDir, prefix) {
  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });
    return entries.find((entry) => entry.isDirectory() && entry.name.toUpperCase().startsWith(prefix.toUpperCase()))?.name || "";
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function moveDirectoryContent(sourceDir, targetDir) {
  await ensureDir(targetDir);
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (await pathExists(targetPath)) continue;
    await fs.rename(sourcePath, targetPath);
  }
  await fs.rmdir(sourceDir).catch(() => {});
}

async function ensureCanonicalDirectory(parentDir, desiredName, identityPrefix) {
  await ensureDir(parentDir);
  const desiredPath = path.join(parentDir, desiredName);
  const existingName = await findDirectoryByPrefix(parentDir, identityPrefix);
  const existingPath = existingName ? path.join(parentDir, existingName) : "";

  if (existingName && existingPath !== desiredPath) {
    try {
      await fs.rename(existingPath, desiredPath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await moveDirectoryContent(existingPath, desiredPath);
    }
  } else {
    await ensureDir(desiredPath);
  }

  return desiredPath;
}

async function ensureClienteDocumentFolders(clienteFolderPath) {
  await Promise.all(
    ["Preventivi", "Cantieri", "Rapportini", "Fatture", "Allegati"].map((folderName) =>
      ensureDir(path.join(clienteFolderPath, folderName)),
    ),
  );
}

function normalizzaViaPreventivo(value) {
  if (!value) return "";
  if (typeof value === "object") return [value.via || value.indirizzo || "", value.civico || ""].filter(Boolean).join(" ");
  return String(value).trim();
}

function getClienteNome(preventivo, clientiArchivio = []) {
  const clienteId = preventivo.clienteId || preventivo.idCliente || preventivo.cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));
  return String(
    preventivo.clienteNome ||
    preventivo.cliente ||
    clienteDaArchivio?.ragioneSociale ||
    clienteDaArchivio?.ragione_sociale ||
    clienteDaArchivio?.nome ||
    "",
  ).replace(/^ID\s*\d+\s*-\s*/i, "").trim();
}

function getClienteVia(preventivo, clientiArchivio = []) {
  const clienteId = preventivo.clienteId || preventivo.idCliente || preventivo.cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));
  return (
    normalizzaViaPreventivo(preventivo.clienteVia) ||
    normalizzaViaPreventivo(preventivo.indirizzo) ||
    normalizzaViaPreventivo(clienteDaArchivio?.indirizzo) ||
    ""
  );
}

function getClienteCode(preventivo, clientiArchivio = []) {
  const clienteId = preventivo.clienteId || preventivo.idCliente || preventivo.cliente?.id;
  const clienteDaArchivio = clientiArchivio.find((item) => String(item.id) === String(clienteId));
  return String(preventivo.clienteCode || clienteDaArchivio?.clienteCode || "").trim();
}

function getOggettoPreventivo(preventivo) {
  return String(preventivo.descrizione || preventivo.oggetto || "Preventivo").trim();
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
  return String(riga.descrizione || "").trim();
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

function getTotaleNettoPdf(preventivo = {}, righe = []) {
  const imponibile = numeroPreventivo(preventivo.imponibile);
  if (imponibile > 0) return imponibile;

  const totaleNetto = numeroPreventivo(preventivo.totaleNetto);
  if (totaleNetto > 0) return totaleNetto;

  return Number(
    (Array.isArray(righe) ? righe : [])
      .filter(isRigaEconomica)
      .reduce((somma, riga) => somma + getRigaPdfValori(riga).importo, 0)
      .toFixed(2),
  );
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

function formatMisuraPdf(riga, campo) {
  const valoriMisura = ["partiUguali", "lunghezza", "larghezza", "altezzaPeso"].map((nomeCampo) =>
    numeroPreventivo(riga[nomeCampo] ?? riga[nomeCampo.replace(/[A-Z]/g, (lettera) => `_${lettera.toLowerCase()}`)]),
  );
  const valore = numeroPreventivo(riga[campo] ?? riga[campo.replace(/[A-Z]/g, (lettera) => `_${lettera.toLowerCase()}`)]);
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

async function disegnaLogo(doc, y) {
  const logoDataUrl = await caricaLogoDataUrl();
  const props = doc.getImageProperties(logoDataUrl);
  const maxWidth = 52;
  const maxHeight = 24;
  const ratio = Math.min(maxWidth / props.width, maxHeight / props.height);
  doc.addImage(logoDataUrl, "JPEG", 14, y - props.height * ratio + 7, props.width * ratio, props.height * ratio);
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

export async function generaPdfPreventivoBuffer(preventivo, clientiArchivio = []) {
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

  [["Cliente:", getClienteNome(preventivo, clientiArchivio)], ["Via:", getClienteVia(preventivo, clientiArchivio)], ["Oggetto:", preventivo.descrizione || ""], ["Commessa:", formatNumeroPreventivo(preventivo.numero)]].forEach(([label, value]) => {
    const righeValore = doc.splitTextToSize(String(value), 164);
    doc.setFont(undefined, "bolditalic");
    doc.setFontSize(8.3);
    doc.text(label, 8, y);
    doc.setFont(undefined, "bold");
    doc.text(righeValore, 28, y);
    y += Math.max(4.8, righeValore.length * 4.2);
  });
  doc.setFont(undefined, "normal");
  y += 5;

  const computoRows = [];
  let titoloSubtotaleAttivo = null;
  const aggiungiSubtotaleCapitolo = () => {
    if (titoloSubtotaleAttivo === null) return;
    const titolo = righe[titoloSubtotaleAttivo];
    if (titolo?.mostraSubtotaleCapitolo || titolo?.mostra_subtotale_capitolo) {
      computoRows.push([{ content: `TOTALE CAPITOLO ${formatEuro(calcolaSubtotaleCapitoloPdf(righe, titoloSubtotaleAttivo))}`, colSpan: 9, styles: { fontStyle: "bold", halign: "right", fillColor: [255, 247, 237] } }]);
    }
  };

  righe.forEach((rigaPdf, index) => {
    const tipoRiga = getTipoRiga(rigaPdf);
    if (tipoRiga === "TITOLO") {
      aggiungiSubtotaleCapitolo();
      titoloSubtotaleAttivo = index;
      computoRows.push([{ content: getDescrizioneRigaPdf(rigaPdf), colSpan: 9, styles: { fontStyle: "bold", fontSize: 8.6, fillColor: [255, 247, 237], cellPadding: { top: 3, right: 1, bottom: 2.4, left: 1.5 } } }]);
      return;
    }
    if (tipoRiga === "NOTA") {
      computoRows.push([{ content: getDescrizioneRigaPdf(rigaPdf), colSpan: 9, styles: { fontStyle: "normal", fontSize: 7.6, fillColor: [248, 250, 252], cellPadding: { top: 2.2, right: 1, bottom: 2.2, left: 1.5 } } }]);
      return;
    }

    const valori = getRigaPdfValori(rigaPdf);
    computoRows.push(
      [rigaPdf.codice || index + 1, rigaPdf.descrizione || "", formatMisuraPdf(rigaPdf, "partiUguali"), formatMisuraPdf(rigaPdf, "lunghezza"), formatMisuraPdf(rigaPdf, "larghezza"), formatMisuraPdf(rigaPdf, "altezzaPeso"), "", "", ""],
      ["", `SOMMANO a ${getUnitaRiga(rigaPdf)}`, "", "", "", "", formatNumeroConDecimali(valori.quantita), formatEuro(valori.prezzoUnitario), formatEuro(valori.importo)],
    );
  });
  aggiungiSubtotaleCapitolo();

  autoTable(doc, {
    startY: y,
    head: [[{ content: "Num.Ord.\nTARIFFA", rowSpan: 2 }, { content: "DESIGNAZIONE DEI LAVORI", rowSpan: 2 }, { content: "D I M E N S I O N I", colSpan: 4 }, { content: "Quantita", rowSpan: 2 }, { content: "I M P O R T I", colSpan: 2 }], ["par.ug.", "lung.", "larg.", "H/peso", "unitario", "TOTALE"]],
    body: computoRows,
    theme: "grid",
    styles: { fontSize: 7.2, cellPadding: { top: 1.3, right: 0.8, bottom: 1.3, left: 0.8 }, overflow: "linebreak", valign: "top", textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: { top: 0, right: 0.12, bottom: 0, left: 0.12 } },
    headStyles: { fillColor: [244, 177, 131], textColor: [0, 0, 0], fontStyle: "bold", halign: "center", lineColor: [0, 0, 0], lineWidth: 0.15 },
    columnStyles: { 0: { cellWidth: 15, halign: "center" }, 1: { cellWidth: 80 }, 2: { cellWidth: 12, halign: "center" }, 3: { cellWidth: 12, halign: "right" }, 4: { cellWidth: 12, halign: "right" }, 5: { cellWidth: 12, halign: "right" }, 6: { cellWidth: 12, halign: "right" }, 7: { cellWidth: 15, halign: "right" }, 8: { cellWidth: 16, halign: "right" } },
    margin: { left: 8, right: 8 },
    didParseCell: (data) => {
      const rawRow = data.row.raw || [];
      const isSommano = typeof rawRow[1] === "string" && rawRow[1].startsWith("SOMMANO");
      if (data.row.section === "body" && isSommano) {
        data.cell.styles.fontStyle = data.column.index === 1 ? "italic" : "normal";
        if (data.column.index === 1) data.cell.styles.halign = "right";
      }
    },
  });

  y = doc.lastAutoTable.finalY;
  if (y > 235) {
    doc.addPage();
    y = 20;
  }
  const totaleY = y + 2;
  const totaleNettoPdf = getTotaleNettoPdf(preventivo, righe);
  doc.setFillColor(244, 177, 131);
  doc.rect(8, totaleY, 184, 5.2, "FD");
  doc.setFontSize(8);
  doc.setFont(undefined, "bold");
  doc.text("TOTALE", 171, totaleY + 3.7, { align: "right" });
  doc.text(formatEuro(totaleNettoPdf), 190.8, totaleY + 3.7, { align: "right" });
  y = totaleY + 10.2;

  [
    ["CONDIZIONI DI FORNITURA:", [`- Importi IVA esclusa. Aliquota IVA applicata: ${formatNumero(totaliPdf.ivaAliquota)}%`, "- Pagamento: da concordare.", "- Validita offerta: 15 giorni", "- Inizio lavori: da concordare."]],
    ["ESCLUSIONI:", ["- La stesura e presentazione agli Enti preposti delle pratiche necessarie all'esecuzione delle opere ed ogni altro annesso.", "- Oneri per richieste di allacciamenti agli enti competenti ed eventuali opere edili accessorie.", "- Eventuali opere aggiuntive e non espressamente indicate nella presente offerta, richieste dagli Enti interessati.", "- Tutto quanto non espressamente citato nella presente offerta."]],
    ["NOTE:", ["- Eventuali lavori extra eseguiti, non espressamente citati nella presente, saranno richiesti dalla Committente e regolarmente assegnati previa accettazione di relativo preventivo Extra dedicato.", '- I lavori oggetto del presente preventivo vengono affidati al Fornitore "A MISURA".', "- La Committente dovra mettere a disposizione dell'Impresa energia elettrica e acqua, ai fini dell'esecuzione delle opere."]],
  ].forEach(([titolo, righeTesto]) => {
    if (y > 245) {
      doc.addPage();
      y = 24;
    }
    doc.setFontSize(8.4);
    doc.setFont(undefined, "bold");
    doc.text(titolo, 14, y);
    doc.setFont(undefined, "normal");
    y += 7;
    righeTesto.forEach((riga) => {
      const split = doc.splitTextToSize(riga, 182);
      doc.text(split, 14, y);
      y += split.length * 4.4 + 1.4;
    });
    y += 4;
  });

  if (y > 276) {
    doc.addPage();
    y = 24;
  }
  doc.setFont(undefined, "bolditalic");
  doc.text("Vicenza,", 154, y);
  doc.text(formatDate(preventivo.data || new Date()), 178, y);
  y += 6;
  doc.setFont(undefined, "bold");
  doc.text("TEAM GROUP SRL", 178, y, { align: "center" });

  const pageCount = doc.internal.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    doc.setPage(pageIndex);
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont(undefined, "italic");
    doc.text(`Pagina ${pageIndex} di ${pageCount}`, 105, 286, { align: "center" });
    doc.setTextColor(40, 85, 155);
    doc.text("Via dell'Artigianato, 22 - 36050 Bolzano Vicentino (VI)", 105, 293, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");
  }

  return Buffer.from(doc.output("arraybuffer"));
}

export async function archiviaPdfPreventivo(preventivo, clientiArchivio = [], outputDir = env.preventivi.outputDir) {
  const rootOutputDir = await resolvePreventiviOutputDir(outputDir);
  await fs.mkdir(rootOutputDir, { recursive: true });
  const { base, revisione } = parseNumeroRevisione(preventivo.numero);
  const clienteNome = getClienteNome(preventivo, clientiArchivio) || "CLIENTE";
  const clienteCode = getClienteCode(preventivo, clientiArchivio) || "SENZA-ID";
  const clientiRoot = path.join(rootOutputDir, "Clienti");
  const clienteFolderName = safeFileName(`${clienteCode} - ${clienteNome}`);
  const clienteFolderPath = await ensureCanonicalDirectory(clientiRoot, clienteFolderName, `${safeFileName(clienteCode)} - `);
  await ensureClienteDocumentFolders(clienteFolderPath);
  const preventiviRoot = path.join(clienteFolderPath, "Preventivi");
  await ensureDir(preventiviRoot);

  const fileName = `${safeFileName(`${base}-${revisione}`)}.pdf`;
  const filePath = path.join(preventiviRoot, fileName);
  const buffer = await generaPdfPreventivoBuffer(preventivo, clientiArchivio);
  await fs.writeFile(filePath, buffer);
  return {
    buffer,
    fileName,
    filePath,
    rootPath: rootOutputDir,
    clientiRoot,
    clienteFolderName: path.basename(clienteFolderPath),
    clienteFolderPath,
    folderName: path.basename(preventiviRoot),
    folderPath: preventiviRoot,
  };
}

export async function trovaPdfPreventivoArchiviato(preventivo, clientiArchivio = [], outputDir = env.preventivi.outputDir) {
  const rootOutputDir = await resolvePreventiviOutputDir(outputDir);
  const { base, revisione } = parseNumeroRevisione(preventivo.numero);
  const clienteNome = getClienteNome(preventivo, clientiArchivio) || "CLIENTE";
  const clienteCode = getClienteCode(preventivo, clientiArchivio) || "SENZA-ID";
  const clientiRoot = path.join(rootOutputDir, "Clienti");
  const clienteFolderName =
    await findDirectoryByPrefix(clientiRoot, `${safeFileName(clienteCode)} - `) ||
    safeFileName(`${clienteCode} - ${clienteNome}`);
  const clienteFolderPath = path.join(clientiRoot, clienteFolderName);
  const preventiviRoot = path.join(clienteFolderPath, "Preventivi");
  const oggetto = getOggettoPreventivo(preventivo);
  const fileName = `${safeFileName(`${base}-${revisione}`)}.pdf`;
  const filePath = path.join(preventiviRoot, fileName);
  const legacyFolderName =
    await findDirectoryByPrefix(preventiviRoot, `${base} - `) ||
    safeFileName(`${base} - ${oggetto}`);
  const legacyFolderPath = path.join(preventiviRoot, legacyFolderName);
  const legacyFilePath = path.join(legacyFolderPath, fileName);
  const fileExists = await pathExists(filePath);
  const legacyExists = !fileExists && await pathExists(legacyFilePath);

  return {
    fileName,
    filePath: legacyExists ? legacyFilePath : filePath,
    rootPath: rootOutputDir,
    clientiRoot,
    clienteFolderName,
    clienteFolderPath,
    folderName: legacyExists ? legacyFolderName : "Preventivi",
    folderPath: legacyExists ? legacyFolderPath : preventiviRoot,
    exists: fileExists || legacyExists,
  };
}

export async function assicuraCartellaPreventiviCliente(preventivo, clientiArchivio = [], outputDir = env.preventivi.outputDir) {
  const rootOutputDir = await resolvePreventiviOutputDir(outputDir);
  await fs.mkdir(rootOutputDir, { recursive: true });
  const clienteNome = getClienteNome(preventivo, clientiArchivio) || "CLIENTE";
  const clienteCode = getClienteCode(preventivo, clientiArchivio) || "SENZA-ID";
  const clientiRoot = path.join(rootOutputDir, "Clienti");
  const clienteFolderName = safeFileName(`${clienteCode} - ${clienteNome}`);
  const clienteFolderPath = await ensureCanonicalDirectory(clientiRoot, clienteFolderName, `${safeFileName(clienteCode)} - `);
  await ensureClienteDocumentFolders(clienteFolderPath);
  const preventiviRoot = path.join(clienteFolderPath, "Preventivi");
  await ensureDir(preventiviRoot);

  return {
    rootPath: rootOutputDir,
    clientiRoot,
    clienteFolderName: path.basename(clienteFolderPath),
    clienteFolderPath,
    folderName: "Preventivi",
    folderPath: preventiviRoot,
    exists: await pathExists(preventiviRoot),
  };
}
