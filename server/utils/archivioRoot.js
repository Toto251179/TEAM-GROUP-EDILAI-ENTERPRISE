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


/**
 * Include solo destinazioni esplicitamente configurate, non percorsi inventati.
 * archivePath resta la cartella principale di Team Group, archiveMirrors
 * identifica eventuali copie esterne aggiuntive.
 */
export async function risolviRadiciArchiviDocumentali() {
  const principale = await risolviRootArchivioDocumenti();
  let mirrors = [];
  try {
    const result = await query(
      "SELECT data->'archiveMirrors' AS mirrors FROM system_settings WHERE id = $1",
      ["system"],
    );
    mirrors = Array.isArray(result.rows[0]?.mirrors) ? result.rows[0].mirrors : [];
  } catch (error) {
    if (error.code !== "42P01") throw error;
  }

  const envMirrors = String(process.env.ARCHIVE_MIRROR_DIRS || "")
    .split(";").map((part) => part.trim()).filter(Boolean);
  const candidates = [principale, ...mirrors, ...envMirrors]
    .filter((value) => typeof value === "string" && value.trim() && !value.includes("<UTENTE>"))
    .map((value) => path.resolve(value.trim()));
  const unique = [...new Set(candidates.map((value) => process.platform === "win32" ? value.toLowerCase() : value))];
  const roots = unique.map((key) => candidates.find((value) =>
    (process.platform === "win32" ? value.toLowerCase() : value) === key));

  for (let i = 0; i < roots.length; i += 1) {
    for (let j = i + 1; j < roots.length; j += 1) {
      const rel = path.relative(roots[i], roots[j]);
      const inverse = path.relative(roots[j], roots[i]);
      const inside = (candidate) => candidate === "" ||
        (!candidate.startsWith("..") && !path.isAbsolute(candidate));
      if (inside(rel) || inside(inverse)) {
        const error = new Error("Le cartelle di archivio principale e repliche non possono essere una dentro l'altra.");
        error.status = 400;
        error.code = "ARCHIVI_ANNIDATI";
        throw error;
      }
    }
  }

  return roots;
}
