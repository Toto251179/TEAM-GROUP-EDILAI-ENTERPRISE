CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clienti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
);

CREATE UNIQUE INDEX IF NOT EXISTS clienti_id_cliente_uidx
  ON clienti (LOWER(BTRIM(id_cliente)))
  WHERE BTRIM(id_cliente) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS clienti_cliente_code_uidx
  ON clienti (LOWER(BTRIM(cliente_code)))
  WHERE BTRIM(cliente_code) <> '';

CREATE TABLE IF NOT EXISTS indirizzi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  via TEXT NOT NULL,
  civico TEXT,
  cap TEXT,
  comune TEXT,
  principale BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS preventivi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES clienti(id) ON DELETE SET NULL,
  id_indirizzo UUID REFERENCES indirizzi(id) ON DELETE SET NULL,
  cliente_nome TEXT,
  cliente_via TEXT,
  cliente_code TEXT,
  numero TEXT NOT NULL UNIQUE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  cliente TEXT,
  descrizione TEXT NOT NULL,
  importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  imponibile NUMERIC(12, 2) NOT NULL DEFAULT 0,
  iva_percentuale NUMERIC(5, 2) NOT NULL DEFAULT 22,
  iva_importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  totale NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'Bozza',
  pdf_path TEXT,
  folder_path TEXT,
  pdf_file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cantieri (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preventivo_id UUID REFERENCES preventivi(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES clienti(id) ON DELETE SET NULL,
  cliente_code TEXT,
  nome TEXT NOT NULL,
  cliente TEXT,
  indirizzo TEXT,
  data_inizio DATE,
  data_fine_prevista DATE,
  importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'In Corso',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimenti_contabili (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cantiere_id UUID REFERENCES cantieri(id) ON DELETE SET NULL,
  cliente_code TEXT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL CHECK (tipo IN ('Entrata', 'Uscita')),
  cantiere TEXT,
  categoria TEXT NOT NULL DEFAULT 'Altro',
  descrizione TEXT NOT NULL,
  importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS materiali_magazzino (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codice TEXT NOT NULL UNIQUE,
  descrizione TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Materiali Edili',
  unita TEXT NOT NULL DEFAULT 'pz',
  quantita NUMERIC(12, 2) NOT NULL DEFAULT 0,
  costo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  scorta_minima NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimenti_magazzino (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materiale_id UUID NOT NULL REFERENCES materiali_magazzino(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('Carico', 'Scarico')),
  quantita NUMERIC(12, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rapportini (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cantiere_id UUID REFERENCES cantieri(id) ON DELETE SET NULL,
  cliente_code TEXT,
  cantiere TEXT NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  capocantiere TEXT,
  meteo TEXT,
  operai TEXT,
  ore NUMERIC(8, 2) NOT NULL DEFAULT 0,
  mezzi TEXT,
  materiali TEXT,
  attivita TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fatture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cantiere_id UUID REFERENCES cantieri(id) ON DELETE SET NULL,
  cliente_code TEXT,
  numero TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('Attiva', 'Passiva')),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  cantiere TEXT,
  soggetto TEXT NOT NULL,
  importo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  scadenza DATE,
  stato TEXT NOT NULL DEFAULT 'Da Pagare',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cantiere_id UUID REFERENCES cantieri(id) ON DELETE SET NULL,
  cliente_code TEXT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  cantiere TEXT NOT NULL,
  cliente TEXT,
  contratto NUMERIC(12, 2) NOT NULL DEFAULT 0,
  percentuale NUMERIC(5, 2) NOT NULL DEFAULT 0,
  maturato NUMERIC(12, 2) NOT NULL DEFAULT 0,
  residuo NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ordini_materiali (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cantiere_id UUID REFERENCES cantieri(id) ON DELETE SET NULL,
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
);


CREATE TABLE IF NOT EXISTS ddt_fornitori (
  id SERIAL PRIMARY KEY,
  ragione_sociale TEXT NOT NULL,
  partita_iva TEXT,
  indirizzo TEXT,
  email TEXT,
  telefono TEXT,
  categoria TEXT NOT NULL DEFAULT 'Materiali',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ddt_fornitori_partita_iva_uidx
  ON ddt_fornitori (partita_iva)
  WHERE BTRIM(COALESCE(partita_iva, '')) <> '';

CREATE TABLE IF NOT EXISTS ddt_articoli (
  id SERIAL PRIMARY KEY,
  fornitore_id INTEGER NOT NULL REFERENCES ddt_fornitori(id) ON DELETE CASCADE,
  codice_articolo TEXT,
  descrizione TEXT NOT NULL DEFAULT '',
  unita_misura TEXT NOT NULL DEFAULT '',
  ultimo_prezzo NUMERIC(14, 4) NOT NULL DEFAULT 0,
  prezzo_aggiornato_al TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ddt_articoli_fornitore_codice_uidx
  ON ddt_articoli (fornitore_id, LOWER(BTRIM(codice_articolo)))
  WHERE BTRIM(COALESCE(codice_articolo, '')) <> '';

CREATE TABLE IF NOT EXISTS ddt_materiali (
  id SERIAL PRIMARY KEY,
  numero_ddt TEXT NOT NULL,
  data_ddt DATE NOT NULL DEFAULT CURRENT_DATE,
  fornitore_id INTEGER REFERENCES ddt_fornitori(id) ON DELETE SET NULL,
  fornitore_nome TEXT NOT NULL DEFAULT '',
  partita_iva TEXT,
  numero_chiamata TEXT,
  codice_progetto TEXT,
  id_cliente TEXT,
  cliente TEXT,
  preventivo_id TEXT,
  preventivo_numero TEXT,
  consuntivo_id TEXT,
  magazzino TEXT,
  allegato_nome TEXT,
  allegato_mime_type TEXT,
  allegato_data_url TEXT,
  stato TEXT NOT NULL DEFAULT 'REGISTRATO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ddt_materiali_righe (
  id SERIAL PRIMARY KEY,
  ddt_id INTEGER NOT NULL REFERENCES ddt_materiali(id) ON DELETE CASCADE,
  articolo_id INTEGER REFERENCES ddt_articoli(id) ON DELETE SET NULL,
  codice_articolo TEXT,
  descrizione TEXT NOT NULL DEFAULT '',
  unita_misura TEXT NOT NULL DEFAULT '',
  quantita NUMERIC(14, 4) NOT NULL DEFAULT 0,
  prezzo_unitario NUMERIC(14, 4) NOT NULL DEFAULT 0,
  totale NUMERIC(14, 4) NOT NULL DEFAULT 0,
  prezzo_da_completare BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS analisi_costi (
  id SERIAL PRIMARY KEY,
  titolo TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  file_mime TEXT,
  file_data_url TEXT,
  cliente_id INTEGER,
  cliente_nome TEXT,
  preventivo_id INTEGER,
  cantiere_id INTEGER,
  sede TEXT NOT NULL DEFAULT 'Vicenza (VI)',
  destinazione TEXT,
  costo_manodopera_ora NUMERIC(12,2) NOT NULL DEFAULT 28,
  spese_generali_pct NUMERIC(6,2) NOT NULL DEFAULT 20,
  margine_pct NUMERIC(6,2) NOT NULL DEFAULT 10,
  km_andata_ritorno NUMERIC(12,2) NOT NULL DEFAULT 0,
  numero_viaggi NUMERIC(12,2) NOT NULL DEFAULT 0,
  costo_km NUMERIC(12,4) NOT NULL DEFAULT 0,
  pedaggi NUMERIC(12,2) NOT NULL DEFAULT 0,
  pasti_pernotti NUMERIC(12,2) NOT NULL DEFAULT 0,
  stato TEXT NOT NULL DEFAULT 'BOZZA',
  revisione INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analisi_costi_voci (
  id SERIAL PRIMARY KEY,
  analisi_id INTEGER NOT NULL REFERENCES analisi_costi(id) ON DELETE CASCADE,
  ordine INTEGER NOT NULL DEFAULT 0,
  codice TEXT,
  descrizione TEXT NOT NULL DEFAULT '',
  unita TEXT,
  quantita NUMERIC(14,4) NOT NULL DEFAULT 0,
  prezzo_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  importo NUMERIC(14,2) NOT NULL DEFAULT 0,
  tipo_costo TEXT NOT NULL DEFAULT 'Da classificare',
  fonte TEXT,
  fonte_titolo TEXT,
  fonte_url TEXT,
  fonte_data TEXT,
  stato TEXT NOT NULL DEFAULT 'Da verificare',
  componenti JSONB NOT NULL DEFAULT '{}'::jsonb,
  cronoprogramma JSONB NOT NULL DEFAULT '{}'::jsonb,
  criticita JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analisi_costi_voci_analisi_idx
  ON analisi_costi_voci (analisi_id);
