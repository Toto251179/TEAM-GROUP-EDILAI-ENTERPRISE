import { query } from "../server/config/db.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS tecnici_squadre (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    codice_accesso TEXT NOT NULL UNIQUE,
    attiva BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS chiamate_tecnici (
    id SERIAL PRIMARY KEY,
    squadra_id INTEGER REFERENCES tecnici_squadre(id) ON DELETE SET NULL,
    numero_chiamata TEXT NOT NULL,
    cliente TEXT NOT NULL,
    rif_ticket_cliente TEXT,
    numero_biglietto TEXT,
    cod_prog TEXT,
    descrizione_lavori TEXT,
    posizione TEXT,
    indirizzo TEXT,
    link_google_maps TEXT,
    stato TEXT NOT NULL DEFAULT 'Assegnato',
    note_ufficio TEXT,
    note_tecnico TEXT,
    materiale_utilizzato TEXT,
    rapportino_lingua TEXT NOT NULL DEFAULT 'Italiano',
    rapportino_italiano TEXT,
    rapportino_pdf_data_url TEXT,
    ora_arrivo TIMESTAMPTZ,
    ora_fine TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS rif_ticket_cliente TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS cod_prog TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS indirizzo TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS note_ufficio TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS rapportino_lingua TEXT NOT NULL DEFAULT 'Italiano'",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS rapportino_italiano TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS rapportino_pdf_data_url TEXT",
  `CREATE TABLE IF NOT EXISTS chiamate_tecnici_foto (
    id SERIAL PRIMARY KEY,
    chiamata_id INTEGER NOT NULL REFERENCES chiamate_tecnici(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    nome_file TEXT,
    mime_type TEXT,
    data_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `INSERT INTO tecnici_squadre (nome, codice_accesso)
   VALUES ('Squadra 1', 'TEAMGROUP1')
   ON CONFLICT (codice_accesso) DO NOTHING`,
  `INSERT INTO chiamate_tecnici
   (squadra_id, numero_chiamata, cliente, numero_biglietto, cod_prog, descrizione_lavori, posizione, indirizzo, link_google_maps, note_ufficio, stato)
   SELECT s.id, 'CH-2026-0001', 'IP', 'BIG-0001', 'PRG-001', 'Verifica intervento assegnato alla squadra', 'Bolzano Vicentino (VI)', 'Via dell''Artigianato, 22 - Bolzano Vicentino (VI)', 'https://www.google.com/maps/search/?api=1&query=Bolzano+Vicentino+VI', 'Controllare accesso area e inviare foto prima di iniziare.', 'Assegnato'
   FROM tecnici_squadre s
   WHERE s.codice_accesso = 'TEAMGROUP1'
     AND NOT EXISTS (SELECT 1 FROM chiamate_tecnici WHERE numero_chiamata = 'CH-2026-0001')`,
  `UPDATE chiamate_tecnici
   SET cliente = 'IP',
       rif_ticket_cliente = COALESCE(rif_ticket_cliente, 'RIF-IP-0001'),
       numero_biglietto = COALESCE(numero_biglietto, 'BIG-0001'),
       cod_prog = COALESCE(cod_prog, 'PRG-001'),
       indirizzo = COALESCE(indirizzo, 'Via dell''Artigianato, 22 - Bolzano Vicentino (VI)'),
       note_ufficio = COALESCE(note_ufficio, 'Controllare accesso area e inviare foto prima di iniziare.')
   WHERE numero_chiamata = 'CH-2026-0001'`,
];

for (const statement of statements) {
  await query(statement);
}

console.log("TEAM GROUP TECNICI: tabelle e dati iniziali pronti.");
process.exit(0);
