import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "./env.js";

function candidateDirectories() {
  const home = os.homedir();
  const oneDrive = process.env.OneDrive || process.env.OneDriveCommercial || process.env.OneDriveConsumer;
  const configured = env.preventivi.outputDir;

  return [
    configured && !String(configured).includes("<UTENTE>") ? path.resolve(configured) : "",
    oneDrive ? path.join(oneDrive, "Desktop", "PREVENTIVI TEAM GROUP") : "",
    path.join(home, "Desktop", "PREVENTIVI TEAM GROUP"),
    path.join(process.cwd(), "storage", "PREVENTIVI TEAM GROUP"),
  ].filter(Boolean);
}

async function verifyWritableDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  const probePath = path.join(directory, `.team-group-write-test-${process.pid}-${Date.now()}.tmp`);

  try {
    await fs.writeFile(probePath, "ok", "utf8");
  } finally {
    await fs.unlink(probePath).catch(() => {});
  }
}

export async function ensurePreventiviStorage() {
  const candidates = [...new Set(candidateDirectories())];
  const failures = [];

  for (const candidate of candidates) {
    try {
      await verifyWritableDirectory(candidate);
      env.preventivi.outputDir = candidate;
      env.preventivi.documentRoot = candidate;
      console.info(`Archivio preventivi disponibile: ${candidate}`);
      return candidate;
    } catch (error) {
      failures.push(`${candidate}: ${error.code || error.message}`);
    }
  }

  const error = new Error(
    `Nessuna cartella scrivibile disponibile per l'archivio preventivi. ${failures.join(" | ")}`,
  );
  error.code = "PREVENTIVI_STORAGE_NON_SCRIVIBILE";
  throw error;
}
