# FIX BLOCCANTE — IL GESTIONALE NON SI APRE

## Contesto

Lavorare esclusivamente sulla copia di sviluppo del progetto, senza modificare o sovrascrivere il gestionale operativo.

Percorso locale previsto:

`C:\TEAM-GROUP-EDILAI-WORK`

Branch dedicato:

`codex/fix-avvio-gestionale`

NON fare merge su `main`.
NON cancellare dati.
NON inizializzare un database nuovo.
NON modificare la grafica.
NON rimuovere funzioni esistenti.

## Obiettivo

Fare in modo che il gestionale si avvii sempre correttamente con un unico comando e sia raggiungibile dal browser.

Comando finale richiesto:

`npm run start:all`

URL attesi:

- frontend: `http://127.0.0.1:5173` oppure `http://localhost:5173`
- backend: `http://localhost:3001`

## Verifiche iniziali obbligatorie

1. Controllare il branch attivo.
2. Controllare che la root del progetto sia corretta.
3. Eseguire `git status`.
4. Salvare eventuali modifiche non committate con un commit di sicurezza.
5. Verificare `package.json` e tutti gli script di avvio.
6. Verificare `scripts/start-all.js`.
7. Verificare `server/server.js`.
8. Verificare configurazione Vite.
9. Verificare caricamento file `.env`.
10. Verificare collegamento PostgreSQL senza cambiare database.

## Problemi da risolvere

### 1. Avvio dalla cartella sbagliata

Il backend e il frontend devono essere avviati sempre dalla root del progetto.

Correggere gli script affinché:

- determinino automaticamente la root del progetto;
- non dipendano dalla cartella corrente del terminale;
- non cerchino file `.env` in percorsi errati;
- non creino cartelle storage in posizioni casuali.

### 2. Porte occupate

Gestire in modo chiaro i casi:

- porta 5173 occupata;
- porta 3001 occupata;
- processi Node rimasti aperti.

Lo script deve:

- rilevare il conflitto;
- indicare il PID e la porta;
- evitare di aprire due istanze dello stesso servizio;
- mostrare un messaggio leggibile con il comando consigliato.

Non terminare processi estranei automaticamente senza controllo.

### 3. Backend che si chiude

Il backend non deve chiudersi in silenzio.

Registrare chiaramente:

- errore database;
- variabile ambiente mancante;
- cartella documenti non scrivibile;
- errore di import;
- modulo mancante;
- migrazione necessaria;
- errore SMTP non bloccante.

SMTP non configurato NON deve impedire l'avvio del gestionale.

### 4. Database

Usare il database già configurato.

Non eseguire:

- drop database;
- reset;
- seed distruttivi;
- creazione automatica di un nuovo database vuoto.

Verificare la connessione e mostrare nei log solo:

- host;
- porta;
- nome database;
- utente;
- stato connessione.

Non mostrare password.

Se il database non è raggiungibile, il messaggio deve essere:

`PostgreSQL non raggiungibile: verificare servizio, porta e credenziali.`

### 5. Vite

Verificare:

- `vite.config.*`;
- host corretto;
- porta 5173;
- proxy API verso backend 3001;
- import frontend senza errori;
- dipendenze mancanti;
- file recentemente aggiunti che bloccano il caricamento.

Il frontend deve essere accessibile sia da:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

### 6. Script start-all

Rendere `scripts/start-all.js` robusto.

Deve:

1. avviare backend;
2. attendere che il backend risponda;
3. avviare Vite;
4. attendere che Vite risponda;
5. mostrare gli URL finali;
6. mantenere entrambi i processi attivi;
7. chiudere entrambi con `Ctrl+C`;
8. propagare gli errori reali;
9. non nascondere stdout/stderr;
10. usare Windows PowerShell/Command Prompt senza problemi.

### 7. Controllo salute

Creare o verificare endpoint:

`GET /api/health`

Risposta attesa:

```json
{
  "ok": true,
  "database": "operativo",
  "service": "TEAM GROUP EDILAI"
}
```

Aggiungere uno script:

`npm run health`

che verifichi:

- backend;
- database;
- frontend.

### 8. Log chiari

All'avvio mostrare esattamente:

```text
Root progetto: C:\TEAM-GROUP-EDILAI-WORK
Database: team_group_edilai
Backend pronto: http://localhost:3001
Frontend pronto: http://127.0.0.1:5173
Gestionale disponibile.
```

In caso di errore mostrare:

- servizio fallito;
- file coinvolto;
- messaggio reale;
- azione correttiva.

## Funzioni da preservare

Non devono sparire o rompersi:

- Anagrafica Clienti;
- Elenco Preventivi;
- Nuovo Preventivo;
- salvataggio preventivo;
- aggiunta voci;
- PDF;
- Invia posta;
- trasformazione preventivo in cantiere;
- elenco cantieri;
- archivio esterno preventivi;
- collegamento PostgreSQL esistente.

## Test obbligatori

Eseguire realmente:

1. `npm install`;
2. `npm run start:all`;
3. apertura `http://127.0.0.1:5173`;
4. apertura `http://localhost:5173`;
5. chiamata `http://localhost:3001/api/health`;
6. apertura Anagrafica Clienti;
7. apertura Elenco Preventivi;
8. apertura di un preventivo esistente;
9. riavvio completo;
10. verifica persistenza dati;
11. chiusura con `Ctrl+C`;
12. nuovo avvio;
13. test con porta 5173 occupata;
14. test con backend non raggiungibile;
15. test con SMTP non configurato.

## Risultato finale richiesto

Al termine creare:

- `STARTUP_FIX_REPORT.md`
- `TROUBLESHOOTING_AVVIO.md`

Nel report indicare:

1. causa reale del mancato avvio;
2. file modificati;
3. comandi eseguiti;
4. output dei test;
5. URL funzionanti;
6. database collegato;
7. problemi ancora aperti;
8. comando unico definitivo per avviare tutto.

Non dichiarare risolto finché il browser non apre realmente il gestionale e `/api/health` non risponde correttamente.