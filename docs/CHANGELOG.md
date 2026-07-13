# TEAM GROUP EDILAI
## CHANGELOG UFFICIALE

Tutte le modifiche del progetto devono essere registrate in questo file.

---

# Versione 1.0

## 2026-07-13

### Restyling Elenco Cantieri

Modifiche:

- Applicato layout Enterprise alla tabella Elenco Cantieri.
- Consolidate le azioni secondarie nel menu della riga.
- Aggiunti badge stato compatti e visualizzazione responsive a card su smartphone.

Test eseguiti:

- Ricerca.
- Filtro stato.
- Azioni Modifica, Rapportino, Dettaglio, Giornale Cantiere, Elimina.
- Esporta CSV.
- Paginazione.
- Browser test pagina /cantieri.
- Build frontend completata.

Risultato build:

Completata.

---

## 2026-07-12

### Sprint 1.1 - Clienti

Correzioni:

- Migrati i valori storici di referente in amministratore solo per clienti con amministratore vuoto.
- Mantenuta la compatibilita legacy in Elenco Clienti mostrando amministratore e, se assente, referente.
- Aggiornato il salvataggio frontend per inviare il nuovo amministratore nel campo ufficiale amministratore.

Test eseguiti:

- Conteggio clienti con referente valorizzato e amministratore vuoto.
- Migrazione sicura senza sovrascrivere amministratori gia valorizzati.
- Verifica clienti BERTI, CENTRO COMMERCIALE ARTIGIANALE CALDOGNO, CENTRO COMMERCIALE PIO X.
- Browser test pagina /clienti.
- Persistenza dopo riavvio backend.
- Build frontend completata.

---

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
