import { query } from "../config/db.js";
import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const repository = createCrudRepository({
  table: "movimenti_contabili",
  allowedFields: ["cantiereId", "clienteCode", "data", "tipo", "cantiere", "categoria", "descrizione", "importo"],
  defaultOrder: "data DESC, created_at DESC",
});

const router = createCrudRouter(repository);

router.get("/riepilogo/totali", asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'Entrata' THEN importo ELSE 0 END), 0) AS entrate,
      COALESCE(SUM(CASE WHEN tipo = 'Uscita' THEN importo ELSE 0 END), 0) AS uscite
    FROM movimenti_contabili
  `);

  const entrate = Number(result.rows[0].entrate);
  const uscite = Number(result.rows[0].uscite);

  res.json({ entrate, uscite, saldo: entrate - uscite });
}));

export default router;
