import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Router } from "express";
import { risolviRootArchivioDocumenti } from "../utils/archivioRoot.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

async function assertPathAutorizzato(requestedPath) {
  if (!requestedPath) {
    const error = new Error("Percorso cartella mancante.");
    error.status = 400;
    error.code = "PERCORSO_MANCANTE";
    throw error;
  }

  const allowedRoot = await risolviRootArchivioDocumenti();
  const resolvedPath = path.resolve(String(requestedPath));
  const relative = path.relative(allowedRoot, resolvedPath);
  const internoRoot = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (!internoRoot) {
    const error = new Error("Percorso non autorizzato.");
    error.status = 403;
    error.code = "PERCORSO_NON_AUTORIZZATO";
    throw error;
  }

  return { allowedRoot, resolvedPath };
}

router.post("/apri", asyncHandler(async (req, res) => {
  const { resolvedPath } = await assertPathAutorizzato(req.body?.path);

  await fs.mkdir(resolvedPath, { recursive: true });
  if (!fsSync.existsSync(resolvedPath)) {
    return res.status(404).json({
      code: "CARTELLA_NON_TROVATA",
      message: "Cartella non trovata.",
    });
  }

  spawn("explorer.exe", [resolvedPath], { detached: true, stdio: "ignore" }).unref();

  res.json({
    success: true,
    path: resolvedPath,
  });
}));

export default router;
