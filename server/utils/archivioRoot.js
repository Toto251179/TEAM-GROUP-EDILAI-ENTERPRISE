import path from "node:path";
import { query } from "../config/db.js";
import { env } from "../config/env.js";

/**
 * Radice unica dell'archivio documentale Team Group.
 * Il percorso scelto in Impostazioni prevale sul valore .env.
 * Non usa fallback silenziosi verso Desktop quando il percorso configurato
 * non esiste: gli errori di accesso devono essere visibili.
 */
export async function risolviRootArchivioDocumenti({ explicitRoot } = {}) {
  let archivePath = "";
  try {
    const result = await query("SELECT data->>'archivePath' AS archive_path FROM system_settings WHERE id = $1", ["system"]);
    archivePath = String(result.rows[0]?.archive_path || "").trim();
  } catch (error) {
    if (error.code !== "42P01") throw error;
  }

  const configured = String(
    explicitRoot || archivePath || env.preventivi.documentRoot || env.preventivi.outputDir || "",
  ).trim();

  if (!configured || configured.includes("<UTENTE>")) {
    const error = new Error("Percorso archivio Team Group non configurato o non valido.");
    error.status = 400;
    error.code = "ARCHIVIO_NON_CONFIGURATO";
    throw error;
  }

  return path.resolve(configured);
}
