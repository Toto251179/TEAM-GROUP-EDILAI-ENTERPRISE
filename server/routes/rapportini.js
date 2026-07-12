import { createCrudRepository } from "../utils/crud.js";
import { createCrudRouter } from "./createCrudRouter.js";

const repository = createCrudRepository({
  table: "rapportini",
  allowedFields: [
    "cantiereId",
    "clienteCode",
    "cantiere",
    "data",
    "capocantiere",
    "meteo",
    "operai",
    "ore",
    "mezzi",
    "materiali",
    "attivita",
    "note",
    "ordineNumero",
    "commessaNumero",
    "cliente",
    "localita",
    "provincia",
    "oraInizio",
    "oraFine",
    "importo",
    "stato",
  ],
  defaultOrder: "data DESC, created_at DESC",
});

export default createCrudRouter(repository);
