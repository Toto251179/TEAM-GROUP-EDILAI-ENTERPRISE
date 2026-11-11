import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";

/**
 * Scrive il PDF attuale senza perdere alcuna versione precedente.
 * Una versione precedente viene copiata in "Preventivi/Superati" PRIMA
 * dell'aggiornamento; vengono toccati solo i PDF generati dal gestionale
 * della stessa commessa (PREFIX-RevXX.pdf), non i PDF allegati manualmente.
 *
 * Il file attuale resta sempre direttamente nella cartella Preventivi.
 */
const inCorso = new Map();

function nomeSicuroRegex(value) {
  return String(value).replace(/[.*+?^$`{}()|[\]\\]/g, "\\$&");
}

function nomeSuperato(fileName) {
  const dataOra = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Rome", hour12: false })
    .replace(" ", "_").replace(/:/g, "-");
  return `${path.parse(fileName).name}_SUPERATO_${dataOra}_${randomUUID().slice(0, 8)}.pdf`;
}

async function salvaConStorico({ filePath, buffer, base }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("PDF da salvare vuoto o non valido.");
  }
  const cartellaPreventivi = path.dirname(filePath);
  const cartellaSuperati = path.join(cartellaPreventivi, "Superati");
  await fs.mkdir(cartellaPreventivi, { recursive: true });
  await fs.mkdir(cartellaSuperati, { recursive: true });

  const filtro = new RegExp(`^${nomeSicuroRegex(base)}-Rev\\d+\\.pdf$`, "i");
  const contenuti = await fs.readdir(cartellaPreventivi, { withFileTypes: true });
  const filesAttivi = contenuti
    .filter((item) => item.isFile() && filtro.test(item.name))
    .map((item) => path.join(cartellaPreventivi, item.name));

  const originali = [];
  let stessoPdfGiaPresente = false;
  for (const precedente of filesAttivi) {
    const vecchioBuffer = await fs.readFile(precedente);
    if (precedente === filePath && vecchioBuffer.equals(buffer)) {
      stessoPdfGiaPresente = true;
      continue;
    }
    originali.push({ precedente, vecchioBuffer });
  }

  // Se non cambia il PDF e non ci sono altre revisioni in cartella,
  // non genera una nuova versione "Superato" a ogni click o riapertura.
  if (stessoPdfGiaPresente && originali.length === 0) {
    return { superati: [], invariato: true };
  }

  const temporaneo = path.join(cartellaPreventivi, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const superati = [];
  try {
    // Prepara il documento nuovo prima di toccare quello attualmente pubblicato.
    await fs.writeFile(temporaneo, buffer, { flag: "wx" });

    for (const { precedente, vecchioBuffer } of originali) {
      const copiaStorica = path.join(cartellaSuperati, nomeSuperato(path.basename(precedente)));
      await fs.copyFile(precedente, copiaStorica, constants.COPYFILE_EXCL);
      const copiaVerificata = await fs.readFile(copiaStorica);
      if (!copiaVerificata.equals(vecchioBuffer)) {
        throw new Error(`Verifica copia versione superata fallita: ${precedente}`);
      }
      superati.push({ da: precedente, a: copiaStorica });
    }

    // Solo dopo aver conservato tutti i vecchi PDF si pubblica il nuovo.
    if (!stessoPdfGiaPresente) {
      await fs.rename(temporaneo, filePath);
    }
    // Le vecchie revisioni con nomi diversi dal PDF attuale ora possono
    // lasciare la cartella principale; sono già conservate in Superati.
    for (const { precedente } of originali) {
      if (precedente !== filePath) await fs.unlink(precedente);
    }

    return { superati: superati.map((item) => item.a), invariato: stessoPdfGiaPresente };
  } finally {
    await fs.unlink(temporaneo).catch(() => {});
  }
}

/** Serializza le scritture concorrenti allo stesso documento nello stesso processo Node. */
export async function pubblicaPdfConStorico(options) {
  const chiave = path.resolve(options.filePath).toLowerCase();
  const precedente = inCorso.get(chiave) || Promise.resolve();
  const attuale = precedente.catch(() => {}).then(() => salvaConStorico(options));
  inCorso.set(chiave, attuale);
  try {
    return await attuale;
  } finally {
    if (inCorso.get(chiave) === attuale) inCorso.delete(chiave);
  }
}
