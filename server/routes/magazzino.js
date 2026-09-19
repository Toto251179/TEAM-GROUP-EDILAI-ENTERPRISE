import { query } from "../config/db.js";
import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const repository = createCrudRepository({
  table: "materiali_magazzino",
  allowedFields: ["codice", "descrizione", "categoria", "unita", "quantita", "costo", "scortaMinima"],
  defaultOrder: "codice ASC",
});

const router = createCrudRouter(repository);

function toMateriale(row) {
  return {
    id: row.id,
    codice: row.codice,
    descrizione: row.descrizione,
    categoria: row.categoria,
    unita: row.unita,
    quantita: Number(row.quantita || 0),
    costo: Number(row.costo || 0),
    scortaMinima: Number(row.scorta_minima || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.post("/:id/movimenti", asyncHandler(async (req, res) => {
  const { tipo, quantita, note } = req.body;
  const qta = Number(quantita);

  if (!["Carico", "Scarico"].includes(tipo) || !qta) {
    return res.status(400).json({ message: "Tipo o quantita non validi" });
  }

  await query("BEGIN");

  try {
    const segno = tipo === "Carico" ? 1 : -1;

    const materiale = await query(
      `UPDATE materiali_magazzino
       SET quantita = GREATEST(0, quantita + $2), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, segno * qta],
    );

    if (!materiale.rows[0]) {
      await query("ROLLBACK");
      return res.status(404).json({ message: "Materiale non trovato" });
    }

    const movimento = await query(
      `INSERT INTO movimenti_magazzino (materiale_id, tipo, quantita, note)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.id, tipo, qta, note || null],
    );

    await query("COMMIT");
    res.status(201).json({ materiale: toMateriale(materiale.rows[0]), movimento: movimento.rows[0] });
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}));

export default router;
