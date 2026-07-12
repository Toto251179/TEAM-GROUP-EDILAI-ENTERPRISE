import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";

const repository = createCrudRepository({
  table: "cantieri",
  allowedFields: ["preventivoId", "clienteId", "clienteCode", "nome", "cliente", "indirizzo", "dataInizio", "dataFinePrevista", "importo", "stato", "note"],
  defaultOrder: "created_at DESC",
});

export default createCrudRouter(repository);
