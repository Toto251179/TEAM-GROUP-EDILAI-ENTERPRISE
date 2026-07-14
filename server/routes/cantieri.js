import { createCrudRepository } from "../utils/crud.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { assicuraCartellaConsuntivoLavoro } from "../utils/consuntiviArchivio.js";
import { createCrudRouter } from "./createCrudRouter.js";

const baseRepository = createCrudRepository({
  table: "cantieri",
  allowedFields: ["preventivoId", "clienteId", "clienteCode", "nome", "cliente", "indirizzo", "dataInizio", "dataFinePrevista", "importo", "stato", "note"],
  defaultOrder: "created_at DESC",
});

const repository = {
  ...baseRepository,
  async create(data) {
    const cantiere = await baseRepository.create(data);
    return { ...cantiere, consuntivoCartella: await assicuraCartellaConsuntivoLavoro(cantiere) };
  },
  async update(id, data) {
    const cantiere = await baseRepository.update(id, data);
    if (!cantiere) return null;
    return { ...cantiere, consuntivoCartella: await assicuraCartellaConsuntivoLavoro(cantiere) };
  },
};

const router = createCrudRouter(repository);

router.post("/consuntivi/cartelle", asyncHandler(async (_req, res) => {
  const cantieri = await baseRepository.findAll();
  const cartelle = [];

  for (const cantiere of cantieri) {
    cartelle.push(await assicuraCartellaConsuntivoLavoro(cantiere));
  }

  res.json({
    success: true,
    cantieri: cantieri.length,
    cartelleCreate: cartelle.length,
    cartelle,
  });
}));

export default router;
