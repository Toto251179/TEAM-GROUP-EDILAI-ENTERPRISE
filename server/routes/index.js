import { Router } from "express";
import clienti from "./clienti.js";
import preventivi from "./preventivi.js";
import cantieri from "./cantieri.js";
import elencoPrezzi from "./elencoPrezzi.js";
import cartelle from "./cartelle.js";
import systemSettings from "./systemSettings.js";

const router = Router();

router.use("/clienti", clienti);
router.use("/preventivi", preventivi);
router.use("/cantieri", cantieri);
router.use("/elenco-prezzi", elencoPrezzi);
router.use("/cartelle", cartelle);
router.use("/system-settings", systemSettings);

export default router;
