import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";

const repository = createCrudRepository({
  table: "sal",
  allowedFields: ["cantiereId", "clienteCode", "data", "cantiere", "cliente", "contratto", "percentuale", "maturato", "residuo"],
});

export default createCrudRouter(repository);
