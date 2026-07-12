# TEAM GROUP EDILAI ENTERPRISE
## MASTER SPECIFICATION v1.0

### Stato

Documento ufficiale e vincolante del progetto.

### Obiettivo

Realizzare un gestionale stabile per TEAM GROUP ITALIA, destinato alla gestione operativa di clienti, preventivi, cantieri, chiamate tecniche e rapportini.

### Architettura ufficiale

- Frontend web esistente
- Backend Node.js esistente
- PostgreSQL come unica fonte dati
- Archivio documentale esterno, quando consolidato
- Applicazione tecnici collegata allo stesso backend, in fase successiva

### Moduli ufficiali

#### Clienti

E il centro del gestionale.

Ogni preventivo, cantiere, chiamata e rapportino deve essere collegato a un cliente.

#### Preventivi Enterprise

Permette di:

- creare preventivi;
- selezionare il cliente;
- inserire lavorazioni;
- usare l'Elenco Prezzi;
- calcolare importi;
- gestire revisioni;
- generare PDF;
- trasformare il preventivo in cantiere.

#### Elenco Prezzi

Contiene le lavorazioni usate dai preventivi.

#### Cantieri

Nascono preferibilmente da un preventivo accettato.

#### Centro Operativo

Sara consolidato solo dopo Clienti, Preventivi, Elenco Prezzi e Cantieri.

#### Chiamate Tecnici

Gestione interventi e ticket.

#### Rapportini

Registrazione dei lavori eseguiti.

#### Operai e Squadre

Gestione delle risorse operative.

### Flusso ufficiale

Cliente
-> Preventivo
-> Cantiere
-> Chiamata
-> Rapportino
-> Archivio

### Roadmap

#### Versione 1.0

- Clienti stabili
- Preventivi stabili
- Elenco Prezzi stabile
- Cantieri stabili

#### Versione 1.1

- Centro Operativo
- Mappa
- Coordinate clienti

#### Versione 1.2

- Chiamate Tecnici
- Rapportini
- Operai e Squadre

#### Versione 1.3

- Sincronizzazione Excel
- Archivio automatico PDF
- Backup

#### Versione 2.0

- App Tecnici
- Importazione da screenshot
- Traduzione rapportini
- Automazioni AI

### Funzioni escluse

Non fanno parte delle priorita:

- fatturazione elettronica;
- SDI;
- PEC;
- invio automatico email;
- contabilita fiscale;
- funzioni demo;
- pagine sperimentali duplicate.

### Regola di consolidamento

Un modulo e considerato stabile solamente quando:

- legge dati reali;
- salva dati reali;
- modifica dati reali;
- mantiene i dati dopo il riavvio;
- non presenta errori console;
- completa la build;
- dispone di test verificati.
