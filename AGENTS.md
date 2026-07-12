# TEAM GROUP EDILAI - REGOLE PER GLI AGENTI

## Progetto ufficiale

Il progetto ufficiale e TEAM GROUP EDILAI ENTERPRISE.

La versione operativa stabile deve essere sempre preservata.

## Moduli principali

1. Clienti
2. Preventivi Enterprise
3. Elenco Prezzi
4. Cantieri
5. Centro Operativo
6. Chiamate Tecnici
7. Rapportini
8. Operai e Squadre
9. Magazzino, in fase successiva

## Priorita attuale

Consolidare esclusivamente:

1. Clienti
2. Preventivi Enterprise
3. Elenco Prezzi
4. Cantieri

Non sviluppare nuove funzioni avanzate finche questi quattro moduli non risultano stabili.

## Database

PostgreSQL e l'unica fonte dati operativa.

E vietato usare come fonte principale:

- localStorage;
- file JSON;
- array statici;
- dati demo;
- mock;
- database alternativi.

Non cancellare dati esistenti.

Non eliminare o rinominare colonne senza autorizzazione esplicita.

## Regola di sviluppo

Lavorare sempre su un solo modulo alla volta.

Prima di ogni modifica:

1. controllare lo stato Git;
2. creare un commit di sicurezza;
3. creare un branch dedicato;
4. identificare i file strettamente necessari.

Dopo ogni modifica:

1. avviare backend;
2. avviare frontend;
3. verificare PostgreSQL;
4. testare API;
5. eseguire build;
6. verificare nel browser;
7. creare commit.

## Divieti

Non:

- modificare moduli non richiesti;
- eseguire refactoring generale;
- eliminare pagine senza verifica;
- sostituire moduli funzionanti;
- creare versioni duplicate;
- cambiare layout generale senza richiesta;
- dichiarare completato un lavoro non verificato;
- nascondere gli errori con messaggi generici;
- inventare dati o risultati di test.

## Test obbligatori

Quando il modulo usa operazioni CRUD, verificare:

- GET;
- POST;
- PUT oppure PATCH;
- DELETE;
- persistenza dopo ricarica;
- persistenza dopo riavvio;
- nessun errore console;
- build completata.

## Flusso principale

CLIENTE
-> PREVENTIVO
-> CANTIERE
-> CHIAMATA
-> RAPPORTINO
-> ARCHIVIO

Tutti i collegamenti devono usare identificativi stabili.

## Clienti

Campi ufficiali:

- id_cliente
- ragione_sociale
- referente
- amministratore
- telefono
- email_principale
- email_amministratore
- email_referente
- via
- cap
- comune
- provincia
- note_cliente
- tipologia_cliente
- latitudine
- longitudine

id_cliente deve essere persistente, univoco e salvato esattamente come inserito.

## Preventivi Enterprise

Il modulo ufficiale e la pagina:

/preventivi

Deve mantenere:

- collegamento al cliente;
- righe lavorazioni;
- categorie;
- quantita;
- prezzi;
- sconti;
- importi;
- revisioni;
- PDF;
- trasformazione in cantiere.

Non reintrodurre funzioni email.

## Interfaccia

Mantenere:

- stile TEAM GROUP;
- sidebar esistente;
- layout ampio;
- margini uniformi;
- etichette italiane corrette;
- nessun testo casuale o tradotto erroneamente.

## Risposta finale degli agenti

Ogni intervento deve terminare indicando solamente:

- causa del problema;
- file modificati;
- endpoint verificati;
- test eseguiti;
- risultato build;
- commit creato;
- eventuali problemi non risolti.
