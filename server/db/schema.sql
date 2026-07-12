CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clienti (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_code TEXT NOT NULL DEFAULT '',
  ragione_sociale TEXT NOT NULL,
  referente TEXT,
  associazione TEXT,
  telefono TEXT,
  email TEXT,
  email_referente TEXT,
  email_amministratore TEXT,
  indirizzo TEXT,
  cap TEXT,
  comune TEXT,
  provincia TEXT,
  note TEXT,
  tipologia_cliente TEXT,
  latitudine NUMERIC(10, 7),
  longitudine NUMERIC(10, 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  stato TEXT NOT NULL DEFAULT 'Bozza',
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
