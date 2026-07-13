import pg from "pg";
import { env } from "../config/env.js";

const adminUser = process.env.DB_ADMIN_USER || "postgres";
const adminPassword = process.env.DB_ADMIN_PASSWORD;

if (!adminPassword) {
  console.error("Imposta DB_ADMIN_PASSWORD prima di eseguire questo comando.");
  process.exit(1);
}

const pool = new pg.Pool({
  ...env.db,
  user: adminUser,
  password: adminPassword,
});

const statements = [
  "CREATE EXTENSION IF NOT EXISTS pgcrypto",
  "DROP TABLE IF EXISTS preventivo_invii",
  `CREATE TABLE IF NOT EXISTS clienti (
    id SERIAL PRIMARY KEY,
    id_cliente TEXT NOT NULL DEFAULT '',
    cliente_code TEXT NOT NULL DEFAULT '',
    ragione_sociale TEXT NOT NULL,
    referente TEXT,
    amministratore TEXT,
    associazione TEXT,
    telefono TEXT,
    email_principale TEXT,
    email TEXT,
    email_referente TEXT,
    email_amministratore TEXT,
    via TEXT,
    indirizzo TEXT,
    cap TEXT,
    comune TEXT,
    provincia TEXT,
    note_cliente TEXT,
    note TEXT,
    tipologia_cliente TEXT,
    latitudine NUMERIC(10, 7),
    longitudine NUMERIC(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS id_cliente TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS cliente_code TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS amministratore TEXT",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS associazione TEXT",
  "UPDATE clienti SET associazione = amministratore WHERE (associazione IS NULL OR BTRIM(associazione) = '') AND amministratore IS NOT NULL AND BTRIM(amministratore) <> ''",
  "UPDATE clienti SET amministratore = associazione WHERE (amministratore IS NULL OR BTRIM(amministratore) = '') AND associazione IS NOT NULL AND BTRIM(associazione) <> ''",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS email_principale TEXT",
  "UPDATE clienti SET email_principale = email WHERE (email_principale IS NULL OR BTRIM(email_principale) = '') AND email IS NOT NULL AND BTRIM(email) <> ''",
  "UPDATE clienti SET email = email_principale WHERE (email IS NULL OR BTRIM(email) = '') AND email_principale IS NOT NULL AND BTRIM(email_principale) <> ''",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS email_referente TEXT",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS email_amministratore TEXT",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS via TEXT",
  "UPDATE clienti SET via = indirizzo WHERE (via IS NULL OR BTRIM(via) = '') AND indirizzo IS NOT NULL AND BTRIM(indirizzo) <> ''",
  "UPDATE clienti SET indirizzo = via WHERE (indirizzo IS NULL OR BTRIM(indirizzo) = '') AND via IS NOT NULL AND BTRIM(via) <> ''",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS cap TEXT",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS comune TEXT",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS provincia TEXT",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS note_cliente TEXT",
  "UPDATE clienti SET note_cliente = note WHERE (note_cliente IS NULL OR BTRIM(note_cliente) = '') AND note IS NOT NULL AND BTRIM(note) <> ''",
  "UPDATE clienti SET note = note_cliente WHERE (note IS NULL OR BTRIM(note) = '') AND note_cliente IS NOT NULL AND BTRIM(note_cliente) <> ''",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS tipologia_cliente TEXT",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS latitudine NUMERIC(10, 7)",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS longitudine NUMERIC(10, 7)",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE clienti ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "UPDATE clienti SET id_cliente = cliente_code WHERE BTRIM(COALESCE(id_cliente, '')) = '' AND BTRIM(COALESCE(cliente_code, '')) <> ''",
  "UPDATE clienti SET cliente_code = id_cliente WHERE BTRIM(COALESCE(cliente_code, '')) = '' AND BTRIM(COALESCE(id_cliente, '')) <> ''",
  "CREATE UNIQUE INDEX IF NOT EXISTS clienti_id_cliente_uidx ON clienti (LOWER(BTRIM(id_cliente))) WHERE BTRIM(id_cliente) <> ''",
  "CREATE UNIQUE INDEX IF NOT EXISTS clienti_cliente_code_uidx ON clienti (LOWER(BTRIM(cliente_code))) WHERE BTRIM(cliente_code) <> ''",
  `CREATE TABLE IF NOT EXISTS indirizzi (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
    via TEXT NOT NULL,
    civico TEXT,
    cap TEXT,
    comune TEXT,
    principale BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS cliente_id INTEGER",
  "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS via TEXT",
  "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS civico TEXT",
  "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS cap TEXT",
  "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS comune TEXT",
  "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS principale BOOLEAN NOT NULL DEFAULT FALSE",
  "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE indirizzi ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `INSERT INTO indirizzi (cliente_id, via, principale)
   SELECT c.id, c.indirizzo, TRUE
   FROM clienti c
   WHERE c.indirizzo IS NOT NULL
     AND BTRIM(c.indirizzo) <> ''
     AND NOT EXISTS (SELECT 1 FROM indirizzi i WHERE i.cliente_id = c.id)`,
  `CREATE TABLE IF NOT EXISTS preventivi (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER,
    id_indirizzo INTEGER,
    cliente_nome TEXT,
    cliente_via TEXT,
    cliente_code TEXT,
    numero TEXT,
    data DATE DEFAULT CURRENT_DATE,
    cliente TEXT,
    cantiere TEXT,
    descrizione TEXT,
    importo NUMERIC(12, 2) DEFAULT 0,
    iva_aliquota NUMERIC(5, 2) NOT NULL DEFAULT 22,
    stato TEXT DEFAULT 'Bozza',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS cliente_id INTEGER",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS id_indirizzo INTEGER",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS cliente_nome TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS cliente_via TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  `UPDATE preventivi p
   SET cliente_code = COALESCE(NULLIF(p.cliente_code, ''), c.cliente_code),
       updated_at = NOW()
   FROM clienti c
   WHERE p.cliente_id = c.id
     AND BTRIM(COALESCE(c.cliente_code, '')) <> ''
     AND (p.cliente_code IS NULL OR BTRIM(p.cliente_code) = '')`,
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
     )`,
  `UPDATE preventivi p
   SET cliente_id = c.id,
       cliente = c.ragione_sociale,
       updated_at = NOW()
   FROM clienti c
   WHERE p.cliente_id IS NULL
     AND p.cliente IS NOT NULL
     AND LOWER(BTRIM(p.cliente)) = LOWER(BTRIM(c.ragione_sociale))`,
  `DO $$
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
   END $$`,
  `UPDATE preventivi p
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
     )`,
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS numero TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS data DATE DEFAULT CURRENT_DATE",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS cliente TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS cantiere TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS descrizione TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS pdf_path TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS folder_path TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS pdf_file_name TEXT",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS iva_aliquota NUMERIC(5, 2) NOT NULL DEFAULT 22",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "UPDATE preventivi SET numero = COALESCE(numero, numero_preventivo) WHERE numero_preventivo IS NOT NULL",
  "UPDATE preventivi SET data = COALESCE(data, data_preventivo) WHERE data_preventivo IS NOT NULL",
  `CREATE TABLE IF NOT EXISTS cantieri (
    id SERIAL PRIMARY KEY,
    preventivo_id INTEGER,
    cliente_id INTEGER,
    cliente_code TEXT,
    nome TEXT NOT NULL,
    cliente TEXT,
    indirizzo TEXT,
    data_inizio DATE,
    data_fine_prevista DATE,
    importo NUMERIC(12, 2) DEFAULT 0,
    stato TEXT DEFAULT 'In Corso',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS preventivo_id INTEGER",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS cliente_id INTEGER",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS nome TEXT",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS cliente TEXT",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS indirizzo TEXT",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS data_inizio DATE",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS data_fine_prevista DATE",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS importo NUMERIC(12, 2) DEFAULT 0",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS stato TEXT DEFAULT 'In Corso'",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS note TEXT",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `UPDATE cantieri ca
   SET cliente_code = COALESCE(NULLIF(ca.cliente_code, ''), p.cliente_code),
       updated_at = NOW()
   FROM preventivi p
   WHERE ca.preventivo_id = p.id
     AND BTRIM(COALESCE(p.cliente_code, '')) <> ''
     AND (ca.cliente_code IS NULL OR BTRIM(ca.cliente_code) = '')`,
  `UPDATE cantieri ca
   SET cliente_code = COALESCE(NULLIF(ca.cliente_code, ''), c.cliente_code),
       updated_at = NOW()
   FROM clienti c
   WHERE ca.cliente_id = c.id
     AND BTRIM(COALESCE(c.cliente_code, '')) <> ''
     AND (ca.cliente_code IS NULL OR BTRIM(ca.cliente_code) = '')`,
  `CREATE TABLE IF NOT EXISTS rapportini (
    id SERIAL PRIMARY KEY,
    cantiere_id INTEGER REFERENCES cantieri(id) ON DELETE SET NULL,
    cliente_code TEXT,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    cantiere TEXT,
    capocantiere TEXT,
    meteo TEXT DEFAULT 'Sereno',
    operai TEXT,
    ore NUMERIC(12, 2) NOT NULL DEFAULT 0,
    mezzi TEXT,
    materiali TEXT,
    attivita TEXT,
    note TEXT,
    ordine_numero TEXT,
    commessa_numero TEXT,
    cliente TEXT,
    localita TEXT,
    provincia TEXT,
    ora_inizio TIME,
    ora_fine TIME,
    importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
    stato TEXT NOT NULL DEFAULT 'In Corso',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS cantiere_id INTEGER",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS data DATE NOT NULL DEFAULT CURRENT_DATE",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS cantiere TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS capocantiere TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS meteo TEXT DEFAULT 'Sereno'",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS operai TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS ore NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS mezzi TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS materiali TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS attivita TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS note TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS ordine_numero TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS commessa_numero TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS cliente TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS localita TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS provincia TEXT",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS ora_inizio TIME",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS ora_fine TIME",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS importo NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'In Corso'",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE rapportini ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `UPDATE rapportini r
   SET cliente_code = ca.cliente_code,
       updated_at = NOW()
   FROM cantieri ca
   WHERE r.cantiere_id = ca.id
     AND BTRIM(COALESCE(ca.cliente_code, '')) <> ''
     AND (r.cliente_code IS NULL OR BTRIM(r.cliente_code) = '')`,
  `CREATE TABLE IF NOT EXISTS tecnici_squadre (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    codice_accesso TEXT NOT NULL UNIQUE,
    attiva BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE tecnici_squadre ADD COLUMN IF NOT EXISTS nome TEXT",
  "ALTER TABLE tecnici_squadre ADD COLUMN IF NOT EXISTS codice_accesso TEXT",
  "ALTER TABLE tecnici_squadre ADD COLUMN IF NOT EXISTS attiva BOOLEAN NOT NULL DEFAULT TRUE",
  "ALTER TABLE tecnici_squadre ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE tecnici_squadre ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `CREATE TABLE IF NOT EXISTS chiamate_tecnici (
    id SERIAL PRIMARY KEY,
    squadra_id INTEGER REFERENCES tecnici_squadre(id) ON DELETE SET NULL,
    numero_chiamata TEXT NOT NULL,
    cliente_code TEXT,
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
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS squadra_id INTEGER",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS numero_chiamata TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS cliente TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS rif_ticket_cliente TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS numero_biglietto TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS cod_prog TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS descrizione_lavori TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS posizione TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS indirizzo TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS link_google_maps TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'Assegnato'",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS note_ufficio TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS note_tecnico TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS materiale_utilizzato TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS rapportino_lingua TEXT NOT NULL DEFAULT 'Italiano'",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS rapportino_italiano TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS rapportino_pdf_data_url TEXT",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS ora_arrivo TIMESTAMPTZ",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS ora_fine TIMESTAMPTZ",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE chiamate_tecnici ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `CREATE TABLE IF NOT EXISTS chiamate_tecnici_foto (
    id SERIAL PRIMARY KEY,
    chiamata_id INTEGER NOT NULL REFERENCES chiamate_tecnici(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    nome_file TEXT,
    mime_type TEXT,
    data_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE chiamate_tecnici_foto ADD COLUMN IF NOT EXISTS chiamata_id INTEGER",
  "ALTER TABLE chiamate_tecnici_foto ADD COLUMN IF NOT EXISTS tipo TEXT",
  "ALTER TABLE chiamate_tecnici_foto ADD COLUMN IF NOT EXISTS nome_file TEXT",
  "ALTER TABLE chiamate_tecnici_foto ADD COLUMN IF NOT EXISTS mime_type TEXT",
  "ALTER TABLE chiamate_tecnici_foto ADD COLUMN IF NOT EXISTS data_url TEXT",
  "ALTER TABLE chiamate_tecnici_foto ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "DELETE FROM chiamate_tecnici WHERE numero_chiamata IN ('CH-2026-0001', 'TG-000001') AND cliente IN ('Cliente esempio', 'IP')",
  `CREATE TABLE IF NOT EXISTS elenco_prezzi (
    id SERIAL PRIMARY KEY,
    codice TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'Generale',
    descrizione TEXT NOT NULL,
    unita TEXT NOT NULL DEFAULT 'pz',
    prezzo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    costo_interno NUMERIC(12, 2) NOT NULL DEFAULT 0,
    note TEXT,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS codice TEXT",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Generale'",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS descrizione TEXT",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS unita TEXT NOT NULL DEFAULT 'pz'",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS prezzo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS costo_interno NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS note TEXT",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT TRUE",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE elenco_prezzi ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `CREATE TABLE IF NOT EXISTS preventivo_righe (
    id SERIAL PRIMARY KEY,
    preventivo_id INTEGER NOT NULL REFERENCES preventivi(id) ON DELETE CASCADE,
    elenco_prezzi_id INTEGER REFERENCES elenco_prezzi(id) ON DELETE SET NULL,
    codice TEXT,
    categoria TEXT NOT NULL DEFAULT 'Edili',
    descrizione TEXT NOT NULL,
    unita TEXT NOT NULL DEFAULT 'pz',
    parti_uguali NUMERIC(12, 2) NOT NULL DEFAULT 1,
    lunghezza NUMERIC(12, 2) NOT NULL DEFAULT 1,
    larghezza NUMERIC(12, 2) NOT NULL DEFAULT 1,
    altezza_peso NUMERIC(12, 2) NOT NULL DEFAULT 1,
    quantita NUMERIC(12, 2) NOT NULL DEFAULT 1,
    prezzo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sconto NUMERIC(5, 2) NOT NULL DEFAULT 0,
    totale NUMERIC(12, 2) NOT NULL DEFAULT 0,
    categoria_bloccata BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS preventivo_id INTEGER",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS elenco_prezzi_id INTEGER",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS codice TEXT",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Edili'",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS descrizione TEXT",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS unita TEXT NOT NULL DEFAULT 'pz'",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS parti_uguali NUMERIC(12, 2) NOT NULL DEFAULT 1",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS lunghezza NUMERIC(12, 2) NOT NULL DEFAULT 1",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS larghezza NUMERIC(12, 2) NOT NULL DEFAULT 1",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS altezza_peso NUMERIC(12, 2) NOT NULL DEFAULT 1",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS quantita NUMERIC(12, 2) NOT NULL DEFAULT 1",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS prezzo_unitario NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS sconto NUMERIC(5, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS totale NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS categoria_bloccata BOOLEAN NOT NULL DEFAULT TRUE",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE preventivo_righe ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `CREATE TABLE IF NOT EXISTS movimenti_contabili (
    id SERIAL PRIMARY KEY,
    cantiere_id INTEGER,
    cliente_code TEXT,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    tipo TEXT NOT NULL DEFAULT 'Entrata',
    cantiere TEXT,
    categoria TEXT NOT NULL DEFAULT 'Generale',
    descrizione TEXT NOT NULL,
    importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS cantiere_id INTEGER",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS data DATE NOT NULL DEFAULT CURRENT_DATE",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'Entrata'",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS cantiere TEXT",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Generale'",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS descrizione TEXT",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS importo NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE movimenti_contabili ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `UPDATE movimenti_contabili m
   SET cliente_code = ca.cliente_code,
       updated_at = NOW()
   FROM cantieri ca
   WHERE m.cantiere_id = ca.id
     AND BTRIM(COALESCE(ca.cliente_code, '')) <> ''
     AND (m.cliente_code IS NULL OR BTRIM(m.cliente_code) = '')`,
  `CREATE TABLE IF NOT EXISTS fatture (
    id SERIAL PRIMARY KEY,
    cantiere_id INTEGER REFERENCES cantieri(id) ON DELETE SET NULL,
    cliente_code TEXT,
    numero TEXT,
    tipo TEXT NOT NULL DEFAULT 'Attiva',
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    cantiere TEXT,
    soggetto TEXT,
    importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
    scadenza DATE,
    stato TEXT NOT NULL DEFAULT 'Da Pagare',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS cantiere_id INTEGER",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS numero TEXT",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'Attiva'",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS data DATE NOT NULL DEFAULT CURRENT_DATE",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS cantiere TEXT",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS soggetto TEXT",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS importo NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS scadenza DATE",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'Da Pagare'",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE fatture ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `UPDATE fatture f
   SET cliente_code = ca.cliente_code,
       updated_at = NOW()
   FROM cantieri ca
   WHERE f.cantiere_id = ca.id
     AND BTRIM(COALESCE(ca.cliente_code, '')) <> ''
     AND (f.cliente_code IS NULL OR BTRIM(f.cliente_code) = '')`,
  "UPDATE fatture SET numero = COALESCE(numero, numero_fattura) WHERE numero_fattura IS NOT NULL",
  "UPDATE fatture SET data = COALESCE(data, data_fattura) WHERE data_fattura IS NOT NULL",
  "UPDATE fatture SET soggetto = COALESCE(soggetto, 'Soggetto non indicato') WHERE soggetto IS NULL",
  `CREATE TABLE IF NOT EXISTS sal (
    id SERIAL PRIMARY KEY,
    cantiere_id INTEGER REFERENCES cantieri(id) ON DELETE SET NULL,
    cliente_code TEXT,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    cantiere TEXT,
    cliente TEXT,
    contratto NUMERIC(12, 2) NOT NULL DEFAULT 0,
    percentuale NUMERIC(5, 2) NOT NULL DEFAULT 0,
    maturato NUMERIC(12, 2) NOT NULL DEFAULT 0,
    residuo NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS cantiere_id INTEGER",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS data DATE NOT NULL DEFAULT CURRENT_DATE",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS cantiere TEXT",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS cliente TEXT",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS contratto NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS percentuale NUMERIC(5, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS maturato NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS residuo NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE sal ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `UPDATE sal s
   SET cliente_code = ca.cliente_code,
       updated_at = NOW()
   FROM cantieri ca
   WHERE s.cantiere_id = ca.id
     AND BTRIM(COALESCE(ca.cliente_code, '')) <> ''
     AND (s.cliente_code IS NULL OR BTRIM(s.cliente_code) = '')`,
  "UPDATE sal SET data = COALESCE(data, data_sal) WHERE data_sal IS NOT NULL",
  "UPDATE sal SET maturato = COALESCE(maturato, importo) WHERE importo IS NOT NULL",
  `CREATE TABLE IF NOT EXISTS referenti (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    ruolo TEXT,
    note TEXT,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE referenti ADD COLUMN IF NOT EXISTS nome TEXT",
  "ALTER TABLE referenti ADD COLUMN IF NOT EXISTS telefono TEXT",
  "ALTER TABLE referenti ADD COLUMN IF NOT EXISTS email TEXT",
  "ALTER TABLE referenti ADD COLUMN IF NOT EXISTS ruolo TEXT",
  "ALTER TABLE referenti ADD COLUMN IF NOT EXISTS note TEXT",
  "ALTER TABLE referenti ADD COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT TRUE",
  "ALTER TABLE referenti ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE referenti ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `CREATE TABLE IF NOT EXISTS clienti_referenti (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
    referente_id INTEGER NOT NULL REFERENCES referenti(id) ON DELETE CASCADE,
    attivo BOOLEAN NOT NULL DEFAULT TRUE,
    data_inizio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_fine TIMESTAMPTZ,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cliente_id, referente_id)
  )`,
  `CREATE TABLE IF NOT EXISTS inbox_lavori (
    id SERIAL PRIMARY KEY,
    numero_richiesta TEXT UNIQUE,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    cliente_id INTEGER REFERENCES clienti(id) ON DELETE SET NULL,
    cliente_code TEXT,
    cliente TEXT NOT NULL,
    referente_id INTEGER REFERENCES referenti(id) ON DELETE SET NULL,
    referente TEXT,
    telefono TEXT,
    email TEXT,
    indirizzo TEXT,
    tipo_richiesta TEXT NOT NULL DEFAULT 'Edilizia',
    provenienza TEXT NOT NULL DEFAULT 'Telefonata',
    descrizione TEXT,
    serve_sopralluogo BOOLEAN NOT NULL DEFAULT FALSE,
    priorita TEXT NOT NULL DEFAULT 'Media',
    stato TEXT NOT NULL DEFAULT 'Nuova',
    data_creazione TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    allegati JSONB NOT NULL DEFAULT '[]'::jsonb,
    storico JSONB NOT NULL DEFAULT '[]'::jsonb,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS numero_richiesta TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS data DATE NOT NULL DEFAULT CURRENT_DATE",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS cliente_id INTEGER",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS cliente TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS referente_id INTEGER",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS referente TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS telefono TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS email TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS indirizzo TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS tipo_richiesta TEXT NOT NULL DEFAULT 'Edilizia'",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS provenienza TEXT NOT NULL DEFAULT 'Telefonata'",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS descrizione TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS serve_sopralluogo BOOLEAN NOT NULL DEFAULT FALSE",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS priorita TEXT NOT NULL DEFAULT 'Media'",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'Nuova'",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS data_creazione TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS allegati JSONB NOT NULL DEFAULT '[]'::jsonb",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS storico JSONB NOT NULL DEFAULT '[]'::jsonb",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS note TEXT",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE inbox_lavori ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `UPDATE inbox_lavori i
   SET cliente_code = c.cliente_code,
       updated_at = NOW()
   FROM clienti c
   WHERE i.cliente_id = c.id
     AND BTRIM(COALESCE(c.cliente_code, '')) <> ''
     AND (i.cliente_code IS NULL OR BTRIM(i.cliente_code) = '')`,
  "CREATE UNIQUE INDEX IF NOT EXISTS inbox_lavori_numero_richiesta_uidx ON inbox_lavori (numero_richiesta)",
  `CREATE TABLE IF NOT EXISTS operai (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    mansione TEXT NOT NULL DEFAULT 'Operaio',
    costo_orario NUMERIC(12, 2) NOT NULL DEFAULT 0,
    telefono TEXT,
    data_assunzione DATE,
    data_inizio_lavoro DATE,
    data_fine_lavoro DATE,
    stato TEXT NOT NULL DEFAULT 'Attivo',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS nome TEXT",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS mansione TEXT NOT NULL DEFAULT 'Operaio'",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS costo_orario NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS telefono TEXT",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS data_assunzione DATE",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS data_inizio_lavoro DATE",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS data_fine_lavoro DATE",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'Attivo'",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS note TEXT",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE operai ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `CREATE TABLE IF NOT EXISTS materiali_magazzino (
    id SERIAL PRIMARY KEY,
    codice TEXT NOT NULL,
    descrizione TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'Materiali Edili',
    unita TEXT NOT NULL DEFAULT 'pz',
    quantita NUMERIC(12, 2) NOT NULL DEFAULT 0,
    costo NUMERIC(12, 2) NOT NULL DEFAULT 0,
    scorta_minima NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS codice TEXT",
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS descrizione TEXT",
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'Materiali Edili'",
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS unita TEXT NOT NULL DEFAULT 'pz'",
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS quantita NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS costo NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS scorta_minima NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE materiali_magazzino ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `CREATE TABLE IF NOT EXISTS movimenti_magazzino (
    id SERIAL PRIMARY KEY,
    materiale_id INTEGER NOT NULL REFERENCES materiali_magazzino(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'Carico',
    quantita NUMERIC(12, 2) NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE movimenti_magazzino ADD COLUMN IF NOT EXISTS materiale_id INTEGER",
  "ALTER TABLE movimenti_magazzino ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'Carico'",
  "ALTER TABLE movimenti_magazzino ADD COLUMN IF NOT EXISTS quantita NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE movimenti_magazzino ADD COLUMN IF NOT EXISTS note TEXT",
  "ALTER TABLE movimenti_magazzino ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `CREATE TABLE IF NOT EXISTS ordini_materiali (
    id SERIAL PRIMARY KEY,
    cantiere_id INTEGER REFERENCES cantieri(id) ON DELETE SET NULL,
    cliente_code TEXT,
    numero TEXT NOT NULL UNIQUE,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    cantiere TEXT,
    fornitore TEXT NOT NULL,
    materiale TEXT NOT NULL,
    quantita NUMERIC(12, 2) NOT NULL DEFAULT 0,
    importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
    stato TEXT NOT NULL DEFAULT 'Da Ordinare',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS cantiere_id INTEGER",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS cliente_code TEXT",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS numero TEXT",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS data DATE NOT NULL DEFAULT CURRENT_DATE",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS cantiere TEXT",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS fornitore TEXT",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS materiale TEXT",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS quantita NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS importo NUMERIC(12, 2) NOT NULL DEFAULT 0",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'Da Ordinare'",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  "ALTER TABLE ordini_materiali ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  `UPDATE ordini_materiali o
   SET cliente_code = ca.cliente_code,
       updated_at = NOW()
   FROM cantieri ca
   WHERE o.cantiere_id = ca.id
     AND BTRIM(COALESCE(ca.cliente_code, '')) <> ''
     AND (o.cliente_code IS NULL OR BTRIM(o.cliente_code) = '')`,
  `WITH duplicati AS (
     SELECT vuoto.id AS old_id, codificato.id AS keep_id
     FROM clienti vuoto
     JOIN clienti codificato
       ON LOWER(BTRIM(vuoto.ragione_sociale)) = LOWER(BTRIM(codificato.ragione_sociale))
      AND vuoto.id <> codificato.id
     WHERE BTRIM(COALESCE(vuoto.cliente_code, '')) = ''
       AND BTRIM(COALESCE(codificato.cliente_code, '')) <> ''
   )
   UPDATE preventivi p
   SET cliente_id = d.keep_id,
       updated_at = NOW()
   FROM duplicati d
   WHERE p.cliente_id = d.old_id`,
  `WITH duplicati AS (
     SELECT vuoto.id AS old_id, codificato.id AS keep_id
     FROM clienti vuoto
     JOIN clienti codificato
       ON LOWER(BTRIM(vuoto.ragione_sociale)) = LOWER(BTRIM(codificato.ragione_sociale))
      AND vuoto.id <> codificato.id
     WHERE BTRIM(COALESCE(vuoto.cliente_code, '')) = ''
       AND BTRIM(COALESCE(codificato.cliente_code, '')) <> ''
   )
   UPDATE cantieri ca
   SET cliente_id = d.keep_id,
       updated_at = NOW()
   FROM duplicati d
   WHERE ca.cliente_id = d.old_id`,
  `WITH duplicati AS (
     SELECT vuoto.id AS old_id, codificato.id AS keep_id
     FROM clienti vuoto
     JOIN clienti codificato
       ON LOWER(BTRIM(vuoto.ragione_sociale)) = LOWER(BTRIM(codificato.ragione_sociale))
      AND vuoto.id <> codificato.id
     WHERE BTRIM(COALESCE(vuoto.cliente_code, '')) = ''
       AND BTRIM(COALESCE(codificato.cliente_code, '')) <> ''
   )
   UPDATE inbox_lavori i
   SET cliente_id = d.keep_id,
       updated_at = NOW()
   FROM duplicati d
   WHERE i.cliente_id = d.old_id`,
  `WITH duplicati AS (
     SELECT vuoto.id AS old_id
     FROM clienti vuoto
     JOIN clienti codificato
       ON LOWER(BTRIM(vuoto.ragione_sociale)) = LOWER(BTRIM(codificato.ragione_sociale))
      AND vuoto.id <> codificato.id
     WHERE BTRIM(COALESCE(vuoto.cliente_code, '')) = ''
       AND BTRIM(COALESCE(codificato.cliente_code, '')) <> ''
   )
   DELETE FROM clienti c
   USING duplicati d
   WHERE c.id = d.old_id`,
  `UPDATE clienti
   SET cliente_code = 'AUTO-' || LPAD(id::TEXT, 5, '0'),
       updated_at = NOW()
   WHERE BTRIM(COALESCE(cliente_code, '')) = ''`,
  `UPDATE preventivi p
   SET cliente_code = c.cliente_code,
       cliente_nome = COALESCE(NULLIF(p.cliente_nome, ''), c.ragione_sociale),
       cliente = COALESCE(NULLIF(p.cliente, ''), c.ragione_sociale),
       cliente_via = COALESCE(NULLIF(p.cliente_via, ''), c.indirizzo),
       updated_at = NOW()
   FROM clienti c
   WHERE p.cliente_id = c.id
     AND (
       p.cliente_code IS DISTINCT FROM c.cliente_code
       OR p.cliente_code IS NULL
       OR BTRIM(p.cliente_code) = ''
     )`,
  `UPDATE cantieri ca
   SET cliente_code = c.cliente_code,
       cliente = COALESCE(NULLIF(ca.cliente, ''), c.ragione_sociale),
       indirizzo = COALESCE(NULLIF(ca.indirizzo, ''), c.indirizzo),
       updated_at = NOW()
   FROM clienti c
   WHERE ca.cliente_id = c.id
     AND (
       ca.cliente_code IS DISTINCT FROM c.cliente_code
       OR ca.cliente_code IS NULL
       OR BTRIM(ca.cliente_code) = ''
     )`,
  `UPDATE inbox_lavori i
   SET cliente_code = c.cliente_code,
       cliente = COALESCE(NULLIF(i.cliente, ''), c.ragione_sociale),
       indirizzo = COALESCE(NULLIF(i.indirizzo, ''), c.indirizzo),
       updated_at = NOW()
   FROM clienti c
   WHERE i.cliente_id = c.id
     AND (
       i.cliente_code IS DISTINCT FROM c.cliente_code
       OR i.cliente_code IS NULL
       OR BTRIM(i.cliente_code) = ''
     )`,
  `DELETE FROM chiamate_tecnici
   WHERE numero_chiamata IN ('CH-2026-0001', 'TG-000001')
     AND cliente IN ('Cliente esempio', 'IP')`,
  `DELETE FROM tecnici_operatori
   WHERE nome IN ('Amir', 'Shefi')
     AND cognome = ''
     AND telefono = ''
     AND email = ''
     AND qualifica = 'Tecnico'`,
  `GRANT USAGE ON SCHEMA public TO ${env.db.user}`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${env.db.user}`,
  `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${env.db.user}`,
];

try {
  for (const statement of statements) {
    await pool.query(statement);
  }

  console.log("Migrazione database completata correttamente.");
} finally {
  await pool.end();
}
