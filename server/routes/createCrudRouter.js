import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createCrudRouter(repository) {
  const router = Router();

  router.get("/", asyncHandler(async (req, res) => {
    res.json(await repository.findAll());
  }));

  router.get("/:id", asyncHandler(async (req, res) => {
    const item = await repository.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Elemento non trovato" });
    res.json(item);
  }));

  router.post("/", asyncHandler(async (req, res) => {
    const item = await repository.create(req.body);
    res.status(201).json(item);
  }));

  router.put("/:id", asyncHandler(async (req, res) => {
    const item = await repository.update(req.params.id, req.body);
    if (!item) return res.status(404).json({ message: "Elemento non trovato" });
    res.json(item);
  }));

  router.delete("/:id", asyncHandler(async (req, res) => {
    const item = await repository.remove(req.params.id);
    if (!item) return res.status(404).json({ message: "Elemento non trovato" });
    res.json({ deleted: true, item });
  }));

  return router;
}
