import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";

const repository = createCrudRepository({
  table: "fatture",
  allowedFields: ["cantiereId", "clienteCode", "numero", "tipo", "data", "cantiere", "soggetto", "importo", "scadenza", "stato"],
});

export default createCrudRouter(repository);
