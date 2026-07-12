import { query, pool } from "../server/config/db.js";

await query("ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS cliente_nome TEXT");
await query("ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS cliente_via TEXT");

const result = await query(
  `UPDATE preventivi p
   SET cliente_nome = COALESCE(NULLIF(p.cliente_nome, ''), c.ragione_sociale),
       cliente_via = COALESCE(NULLIF(p.cliente_via, ''), c.indirizzo),
       updated_at = NOW()
   FROM clienti c
   WHERE p.cliente_id = c.id
     AND (
       p.cliente_nome IS NULL
       OR BTRIM(p.cliente_nome) = ''
       OR p.cliente_via IS NULL
       OR BTRIM(p.cliente_via) = ''
     )
   RETURNING p.id, p.numero, p.cliente_nome, p.cliente_via`,
);

console.log(JSON.stringify(result.rows, null, 2));
await pool.end();
