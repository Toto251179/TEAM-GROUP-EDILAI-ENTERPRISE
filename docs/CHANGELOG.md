# TEAM GROUP EDILAI
## CHANGELOG UFFICIALE

Tutte le modifiche del progetto devono essere registrate in questo file.

---

# Versione 1.0

## 2026-07-12

### Sprint 1 - Clienti

Correzioni:

- Allineato il flusso Clienti tra frontend, API, backend e PostgreSQL.
- Aggiunta gestione campi ufficiali cliente.
- Aggiunta validazione di id_cliente e ragione_sociale.
- Aggiunto rifiuto duplicati id_cliente con HTTP 409.
- Aggiunto blocco eliminazione per clienti collegati a preventivi o cantieri.
- Migliorati messaggi errore con codice HTTP, codice backend e campo coinvolto.

Test eseguiti:

- GET clienti: HTTP 200.
- GET dettaglio cliente: HTTP 200.
- POST cliente TEST001: HTTP 201.
- PUT cliente TEST001: HTTP 200.
- DELETE cliente TEST001: HTTP 200.
- Duplicato TEST001: HTTP 409.
- Validazione campi obbligatori: HTTP 400.
- Persistenza dopo riavvio backend: verificata.
- Build frontend: completata.
- Lint mirato sui file Clienti/API: completato.

Risultato:

IN VERIFICA.

Limiti ancora presenti:

- Verifica browser/console non completata per blocco policy del browser in-app sull'URL di test isolato.
- Lint globale ancora bloccato da errori preesistenti fuori dal modulo Clienti.

---

### Documentazione

- Creato AGENTS.md
- Creato MASTER_SPECIFICATION.md
- Creato ROADMAP.md
- Aggiornato README

Commit:
048a3c7

---

## Stato attuale

### Clienti

Stato:
IN CONSOLIDAMENTO

Obiettivi:

- salvataggio
- modifica
- eliminazione
- import Excel
- collegamento preventivi

---

### Preventivi Enterprise

Stato:
DA CONSOLIDARE

---

### Elenco Prezzi

Stato:
DA CONSOLIDARE

---

### Cantieri

Stato:
DA CONSOLIDARE

---

### Centro Operativo

Stato:
BLOCCATO

Motivo:

Attendere consolidamento Versione 1.0.

---

## Regola

Ogni modifica futura deve aggiungere una nuova voce cronologica.

Mai eliminare le voci precedenti.
