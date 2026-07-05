import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";

const repository = createCrudRepository({
  table: "clienti",
  allowedFields: ["ragioneSociale", "referente", "telefono", "email", "partitaIva", "indirizzo", "note"],
  defaultOrder: "ragione_sociale ASC",
});

export default createCrudRouter(repository);
