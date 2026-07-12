<?php

$host = getenv('DB_HOST') ?: 'localhost';
$port = getenv('DB_PORT') ?: '5432';
$database = getenv('DB_NAME') ?: 'team_group_edilai';
$user = getenv('DB_USER') ?: 'postgres';
$password = getenv('DB_PASSWORD') ?: '';

$pdo = new PDO(
    "pgsql:host={$host};port={$port};dbname={$database}",
    $user,
    $password,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
);

$statements = [
    "CREATE TABLE IF NOT EXISTS indirizzi (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
      via TEXT NOT NULL,
      civico TEXT,
      cap TEXT,
      comune TEXT,
      principale BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS cliente_id INTEGER",
    "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS via TEXT",
    "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS civico TEXT",
    "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS cap TEXT",
    "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS comune TEXT",
    "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS principale BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS id_indirizzo INTEGER",
    "DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'preventivi_id_indirizzo_fkey'
       ) THEN
         ALTER TABLE preventivi
         ADD CONSTRAINT preventivi_id_indirizzo_fkey
         FOREIGN KEY (id_indirizzo) REFERENCES indirizzi(id) ON DELETE SET NULL;
       END IF;
     END $$",
    "INSERT INTO indirizzi (cliente_id, via, principale)
     SELECT c.id, c.indirizzo, TRUE
     FROM clienti c
     WHERE c.indirizzo IS NOT NULL
       AND BTRIM(c.indirizzo) <> ''
       AND NOT EXISTS (
         SELECT 1
         FROM indirizzi i
         WHERE i.cliente_id = c.id
       )",
    "UPDATE preventivi p
     SET cliente_id = c.id,
         cliente = c.ragione_sociale,
         updated_at = NOW()
     FROM clienti c
     WHERE p.cliente_id IS NULL
       AND p.cliente IS NOT NULL
       AND LOWER(BTRIM(p.cliente)) = LOWER(BTRIM(c.ragione_sociale))",
    "UPDATE preventivi p
     SET id_indirizzo = scelto.id,
         updated_at = NOW()
     FROM (
       SELECT DISTINCT ON (cliente_id) id, cliente_id
       FROM indirizzi
       ORDER BY cliente_id, principale DESC, id ASC
     ) scelto
     WHERE scelto.cliente_id = p.cliente_id
       AND (
         p.id_indirizzo IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM indirizzi i_ok
           WHERE i_ok.id = p.id_indirizzo
             AND i_ok.cliente_id = p.cliente_id
         )
       )",
];

$pdo->beginTransaction();

try {
    foreach ($statements as $statement) {
        $pdo->exec($statement);
    }

    $summary = $pdo
        ->query("SELECT
          COUNT(*) AS preventivi_totali,
          COUNT(*) FILTER (WHERE p.id_indirizzo IS NOT NULL) AS preventivi_con_indirizzo,
          COUNT(*) FILTER (WHERE p.id_indirizzo IS NULL) AS preventivi_da_verificare
        FROM preventivi p")
        ->fetch();

    $remaining = $pdo
        ->query("SELECT p.id, p.numero, p.cliente, p.cliente_id
          FROM preventivi p
          WHERE p.id_indirizzo IS NULL
          ORDER BY p.id")
        ->fetchAll();

    $pdo->commit();

    echo "Preventivi totali: {$summary['preventivi_totali']}\n";
    echo "Preventivi con indirizzo: {$summary['preventivi_con_indirizzo']}\n";
    echo "Preventivi da verificare: {$summary['preventivi_da_verificare']}\n";

    if ($remaining) {
        echo "Preventivi rimasti senza id_indirizzo:\n";
        foreach ($remaining as $row) {
            echo "- {$row['id']} {$row['numero']} {$row['cliente']} cliente_id={$row['cliente_id']}\n";
        }
    }
} catch (Throwable $error) {
    $pdo->rollBack();
    throw $error;
}
