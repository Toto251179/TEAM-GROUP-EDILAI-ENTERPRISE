import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { query } from "./config/db.js";
import apiRoutes from "./routes/index.js";

export const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const isLocalDevOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    const allowedOrigins = [env.corsOrigin];

    if (isLocalDevOrigin || allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error("Origine non consentita da CORS"));
  },
}));
app.use(express.json({ limit: "30mb" }));

app.get("/api/health", async (req, res, next) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});

app.use("/api", apiRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Endpoint non trovato" });
});

app.use((error, req, res, _next) => {
  console.error(error);
  res.status(500).json({
    message: "Errore interno del server",
    detail: env.nodeEnv === "development" ? error.message : undefined,
  });
});
