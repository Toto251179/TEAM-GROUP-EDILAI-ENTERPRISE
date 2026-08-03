# Task Codex — Ripristino casella "Invia posta" nei preventivi

## Obiettivo
Ripristinare nella pagina di creazione/modifica preventivo il pulsante **Invia** e la relativa finestra di invio email, senza rimuovere le correzioni già presenti per l'errore `HTTP 500 - Archiviazione preventivo non riuscita`.

## Requisiti funzionali
- Mostrare nuovamente il pulsante **Invia** accanto a **Salva**, **Duplica** e **Genera PDF**.
- Aprire una finestra/modale con i campi:
  - Mittente
  - Destinatario
  - CC
  - Oggetto
  - Testo email
  - Allegato PDF del preventivo
- Precompilare il destinatario con l'email del cliente/amministratore quando disponibile.
- Precompilare oggetto e testo mantenendo il modello già usato dal gestionale.
- Non impedire il salvataggio del preventivo se la configurazione SMTP non è completa.
- In caso di SMTP non configurato, mostrare un messaggio chiaro senza nascondere il pulsante o bloccare il preventivo.

## Vincoli
- Conservare integralmente le modifiche del branch `fix/preventivi-archiviazione-http500`.
- Non modificare o cancellare i dati PostgreSQL esistenti.
- Non eliminare le funzioni di cartella esterna e generazione PDF.
- Non unire automaticamente in `main`: la modifica deve restare su branch separato fino a verifica manuale.

## Verifiche richieste
1. Avviare frontend e backend con `npm run start:all`.
2. Creare o aprire un preventivo salvato.
3. Generare il PDF.
4. Verificare che il pulsante **Invia** sia visibile.
5. Aprire la finestra email e controllare tutti i campi.
6. Verificare che l'assenza di SMTP produca solo un avviso leggibile.
7. Verificare che il salvataggio e l'archiviazione continuino a funzionare senza HTTP 500.
