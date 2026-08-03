# Ripristino completo gestionale TEAM GROUP EdilAI

## Obiettivo
Ripristinare tutte le funzioni operative presenti nella versione stabile più recente, mantenendo anche la correzione dell'errore `HTTP 500 - Archiviazione preventivo non riuscita`.

## Regole di sicurezza
- Lavorare esclusivamente sul branch `codex/ripristino-completo-gestionale`.
- Non modificare o sovrascrivere il database reale.
- Non eliminare clienti, preventivi, cantieri o file PDF esistenti.
- Non fare merge in `main` finché non sono completati i test manuali.
- Non rimuovere funzioni già presenti nella versione stabile.

## Funzioni da ripristinare e verificare

### Preventivi
- Salvataggio intestazione preventivo senza perdita di cliente, condominio, oggetto, commessa, cantiere, stato, data, IVA e indirizzo.
- Aggiunta voci senza cancellazione dei dati generali.
- Elenco preventivi con dati esistenti.
- Duplicazione preventivo.
- Generazione PDF.
- Apertura PDF.
- Creazione e apertura cartella esterna.
- Copia del percorso della cartella.
- Sostituzione del PDF nella stessa cartella quando il preventivo viene modificato.
- Conversione del preventivo accettato in cantiere.
- Righe descrittive non contabilizzate.
- Titoli di gara e categorie.

### Invio posta
- Ripristinare il pulsante `Invia`.
- Ripristinare la finestra `Invia preventivo`.
- Campi: mittente, destinatario, CC, oggetto, testo email.
- Precompilare destinatario e CC dai dati del cliente/amministratore.
- Allegare il PDF corretto del preventivo.
- Se SMTP non è configurato, mostrare un messaggio chiaro senza nascondere la funzione e senza bloccare il salvataggio.
- Il mancato invio email non deve causare HTTP 500 sul preventivo.

### Archiviazione preventivi
Integrare e mantenere la correzione già sviluppata nel branch `fix/preventivi-archiviazione-http500`:
- controllo e creazione cartella esterna;
- verifica permessi di scrittura;
- gestione percorso Windows;
- creazione automatica cartella `numero preventivo + nome condominio`;
- errori backend dettagliati e leggibili;
- nessun errore generico quando il problema è solo la cartella o il PDF.

### Clienti
- Elenco clienti esistente.
- ID cliente visibile come codice senza scritta superflua sul PDF.
- Anagrafica clienti al posto di `Consiglio`.
- Mappa condomini.
- Importazione Excel ed esportazione CSV.
- Ricerca e modifica clienti.

### Cantieri
- Creazione cantiere da preventivo accettato.
- Elenco cantieri.
- Collegamento corretto tra cliente, preventivo e cantiere.
- Nessuna duplicazione involontaria.

### Database
- Usare il database configurato da `.env`.
- Non eseguire seed, reset o migrazioni distruttive.
- Verificare l'esistenza delle colonne runtime necessarie con migrazione non distruttiva.
- Non sostituire il database con una versione demo o vuota.

## Test obbligatori
1. Avvio con `npm run start:all`.
2. Apertura anagrafica clienti con dati esistenti.
3. Apertura elenco preventivi con dati esistenti.
4. Creazione di un preventivo di prova.
5. Salvataggio intestazione.
6. Aggiunta di almeno due voci.
7. Nuovo salvataggio senza perdita dati.
8. Generazione PDF.
9. Apertura PDF.
10. Apertura cartella esterna.
11. Apertura finestra `Invia`.
12. Verifica destinatario, CC e allegato.
13. Gestione SMTP mancante con messaggio non bloccante.
14. Impostazione stato `Accettato`.
15. Trasformazione in cantiere.
16. Verifica che il cantiere compaia nell'elenco.

## Risultato atteso
Il branch deve contenere una versione completa e coerente del gestionale, con tutte le funzioni recenti della versione stabile e con la correzione dell'archiviazione preventivi, senza regressioni e senza perdita dati.
