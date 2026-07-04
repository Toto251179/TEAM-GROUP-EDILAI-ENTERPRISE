const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "team_group_edilai",
  user: "edilai_user",
  password: "edilai_user"
});

app.get("/api/preventivi", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM preventivi ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Errore preventivi:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log("BACKEND AVVIATO SU http://localhost:3001");
});