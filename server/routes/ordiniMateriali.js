import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";

const repository = createCrudRepository({
  table: "ordini_materiali",
  allowedFields: ["cantiereId", "numero", "data", "cantiere", "fornitore", "materiale", "quantita", "importo", "stato"],
});

export default createCrudRouter(repository);
