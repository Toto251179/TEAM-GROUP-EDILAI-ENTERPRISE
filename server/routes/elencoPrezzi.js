import { Router } from "express";
import { query } from "../config/db.js";
import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const repository = createCrudRepository({
  table: "elenco_prezzi",
  allowedFields: [
    "codice",
    "categoria",
    "descrizione",
    "unita",
    "prezzoUnitario",
    "costoInterno",
    "note",
    "attivo",
  ],
  defaultOrder: "categoria ASC, codice ASC",
});

function toCamel(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const search = String(req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit || 500), 2000);
  const soloVeneto = ["1", "true", "yes"].includes(String(req.query.veneto || "").toLowerCase());
  const soloAziendale = ["1", "true", "yes"].includes(String(req.query.aziendale || "").toLowerCase());
  const categoria = String(req.query.categoria || "").trim();

  const params = [];
  const whereParts = [];

  if (soloVeneto) {
    whereParts.push("(codice ILIKE 'VEN25-%' OR note ILIKE '%Regione Veneto%')");
  }

  if (soloAziendale) {
    whereParts.push("(codice ILIKE 'TG-%' OR note ILIKE '%preventivi TEAM GROUP%' OR note ILIKE '%proprietario TEAM GROUP%')");
  }

  if (categoria && categoria !== "Tutte") {
    params.push(categoria);
    whereParts.push(`categoria = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    whereParts.push(`(codice ILIKE $${params.length} OR categoria ILIKE $${params.length} OR descrizione ILIKE $${params.length})`);
  }

  params.push(limit);

  const result = await query(
    `SELECT *
     FROM elenco_prezzi
     ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
     ORDER BY categoria ASC, codice ASC
     LIMIT $${params.length}`,
    params,
  );

  res.json(result.rows.map(toCamel));
}));

router.use("/", createCrudRouter(repository));

export default router;
