import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { env } from "../config/env.js";

function safeFileName(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
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
      await ensureDir(desiredPath);
    }
  } else {
    await ensureDir(desiredPath);
  }

  return desiredPath;
}

async function resolveDocumentRoot(configuredDir = env.preventivi.outputDir) {
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

function getClienteCode(chiamata = {}) {
  return String(chiamata.clienteCode || chiamata.cliente_code || chiamata.idCliente || chiamata.id_cliente || "SENZA-ID").trim() || "SENZA-ID";
}

function getClienteNome(chiamata = {}) {
  return String(chiamata.cliente || chiamata.clienteAssociato || chiamata.cliente_associato || "CLIENTE").trim() || "CLIENTE";
}

function getNumeroChiamata(chiamata = {}) {
  return String(chiamata.numeroChiamata || chiamata.numero_chiamata || chiamata.numero || `CHIAMATA-${chiamata.id || "SENZA-ID"}`).trim();
}

function getDescrizione(chiamata = {}) {
  return String(chiamata.descrizioneLavori || chiamata.descrizione_lavori || chiamata.descrizione || "").trim();
}

export async function assicuraCartellaConsuntivoChiamata(chiamata = {}, outputDir = env.preventivi.outputDir) {
  const rootPath = await resolveDocumentRoot(outputDir);
  const clientiRoot = path.join(rootPath, "Clienti");
  const clienteCode = getClienteCode(chiamata);
  const clienteNome = getClienteNome(chiamata);
  const clienteFolderName = safeFileName(`${clienteCode} - ${clienteNome}`);
  const clienteFolderPath = await ensureCanonicalDirectory(clientiRoot, clienteFolderName, `${safeFileName(clienteCode)} - `);

  const consuntiviRoot = path.join(clienteFolderPath, "Consuntivi");
  await ensureDir(consuntiviRoot);

  const numeroChiamata = getNumeroChiamata(chiamata);
  const descrizione = getDescrizione(chiamata);
  const lavoroFolderName = safeFileName([numeroChiamata, descrizione].filter(Boolean).join(" - ")) || safeFileName(numeroChiamata);
  const lavoroFolderPath = path.join(consuntiviRoot, lavoroFolderName);
  await ensureDir(lavoroFolderPath);

  return {
    rootPath,
    clientiRoot,
    clienteFolderName: path.basename(clienteFolderPath),
    clienteFolderPath,
    folderName: path.basename(consuntiviRoot),
    folderPath: consuntiviRoot,
    lavoroFolderName: path.basename(lavoroFolderPath),
    lavoroFolderPath,
    exists: await pathExists(lavoroFolderPath),
  };
}

export async function assicuraCartellaConsuntivoLavoro(lavoro = {}, outputDir = env.preventivi.outputDir) {
  const rootPath = await resolveDocumentRoot(outputDir);
  const clientiRoot = path.join(rootPath, "Clienti");
  const clienteCode = String(lavoro.clienteCode || lavoro.cliente_code || lavoro.idCliente || lavoro.id_cliente || "SENZA-ID").trim() || "SENZA-ID";
  const clienteNome = String(lavoro.cliente || lavoro.clienteAssociato || lavoro.cliente_associato || "CLIENTE").trim() || "CLIENTE";
  const clienteFolderName = safeFileName(`${clienteCode} - ${clienteNome}`);
  const clienteFolderPath = await ensureCanonicalDirectory(clientiRoot, clienteFolderName, `${safeFileName(clienteCode)} - `);

  const consuntiviRoot = path.join(clienteFolderPath, "Consuntivi");
  await ensureDir(consuntiviRoot);

  const codiceLavoro = String(lavoro.id ? `CANTIERE-${lavoro.id}` : lavoro.numero || lavoro.nome || "CANTIERE-SENZA-ID").trim();
  const descrizione = String(lavoro.nome || lavoro.descrizione || "").trim();
  const lavoroFolderName = safeFileName([codiceLavoro, descrizione].filter(Boolean).join(" - ")) || safeFileName(codiceLavoro);
  const lavoroFolderPath = path.join(consuntiviRoot, lavoroFolderName);
  await ensureDir(lavoroFolderPath);

  return {
    rootPath,
    clientiRoot,
    clienteFolderName: path.basename(clienteFolderPath),
    clienteFolderPath,
    folderName: path.basename(consuntiviRoot),
    folderPath: consuntiviRoot,
    lavoroFolderName: path.basename(lavoroFolderPath),
    lavoroFolderPath,
    exists: await pathExists(lavoroFolderPath),
  };
}
