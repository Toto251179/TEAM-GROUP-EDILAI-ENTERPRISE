# TEAM GROUP EDILAI
## CHANGELOG UFFICIALE

Tutte le modifiche del progetto devono essere registrate in questo file.

---

# Versione 1.0

## 2026-07-13

### Capitoli e righe descrittive Preventivi

Correzioni:

- Aggiunti tipi riga `ECONOMICA`, `TITOLO` e `NOTA` al modulo Preventivi.
- Aggiunti Titoli capitolo e Note descrittive non contabilizzate nel gestionale e nel PDF.
- Aggiunto ordine persistente delle righe preventivo con comandi Sposta su e Sposta giu.
- Aggiunta opzione subtotale capitolo informativa, esclusa dal totale generale.
- Aggiunta funzione Comprimi/Espandi locale per i capitoli nel gestionale.
- Il backend ignora i valori economici ricevuti per Titoli e Note.

Test eseguiti:

- Migrazione sicura PostgreSQL per `tipo_riga`, `ordine_riga`, `gruppo_id` e `mostra_subtotale_capitolo`.
- Creazione preventivo reale con Titolo, Nota e due righe economiche da 4600,00 e 8500,00.
- Verifica imponibile 13100,00, IVA 22% e totale 15982,00 senza alterazioni da Titolo/Nota.
- Verifica salvataggio, ricarica, modifica ordine, duplicazione e cancellazione dati di test.
- Verifica PDF con Titolo, Nota, subtotale capitolo 13100,00 e totale generale non duplicato.
- Regressione preventivo con sole righe economiche: calcoli, IVA e PDF invariati.
- Verifica browser pagina /preventivi senza errori console.
- Build frontend completata.

---

### Semplificazione riga totale PDF Preventivi

Correzioni:

- Rimossa dal PDF Preventivi la tabella riepilogativa finale con Lordo, Sconto, Imponibile, IVA e Totale complessivo.
- Mantenuta una sola riga arancione sotto il computo con etichetta TOTALE e importo netto IVA esclusa.
- Avvicinata la scritta TOTALE all'importo finale, entrambi allineati a destra nella stessa riga.

Test eseguiti:

- Generazione PDF reale con quantita 1, prezzo unitario 1850,00 e totale riga 1850,00.
- Verifica PDF senza Lordo, Sconto, Imponibile separato, IVA separata e Totale complessivo.
- Verifica browser del PDF generato.
- Build frontend completata.

---

### Allineamento motore PDF ai dati Preventivi

Correzioni:

- Il motore PDF Preventivi usa solo i campi API `quantita`, `prezzoUnitario`, `importoLordo`, `importo`, `totale`, `imponibile`, `ivaPercentuale`, `ivaImporto`, `lordo` e `sconto`.
- Rimossi dal PDF i fallback che ricalcolavano totali riga, imponibile, IVA e totale complessivo.
- La deduplica PDF confronta i campi API gia normalizzati e non richiama il motore di calcolo.
- L'API Preventivi espone `lordo` e `sconto` per permettere al PDF di stampare il riepilogo senza formule interne.

Test eseguiti:

- Creazione preventivo reale temporaneo con righe a corpo, cad e mq.
- Confronto API, dati passati al PDF e PDF finale per quantita, prezzo unitario, importo lordo, importo, imponibile, IVA e totale.
- Verifica assenza righe duplicate nel PDF.
- Build frontend completata.

---

### Chiusura modulo Preventivi Enterprise 1.0

Correzioni:

- Consolidata la verifica finale del modulo Preventivi Enterprise senza introdurre nuove funzionalita.
- Confermati gestione preventivi, righe lavorazioni, motore di calcolo, PDF, archivio, collegamento cliente e trasformazione in cantiere.
- Aggiornata la ROADMAP con Sprint 2 - Preventivi completato.
- Congelato il modulo Preventivi in AGENTS.md per consentire solo bug fix approvati dal Product Owner.

Test eseguiti:

- Creazione preventivo reale temporaneo collegato a cliente PostgreSQL.
- Verifica API Preventivi: creazione, lettura, modifica, cartella archivio, generazione PDF, download PDF, trasformazione in cantiere ed eliminazione.
- Verifica PostgreSQL su testata preventivo, righe lavorazioni e cantiere generato.
- Verifica PDF testuale e visiva con righe non duplicate e totali identici al gestionale.
- Verifica frontend nel browser su /preventivi senza errori console.
- Build frontend completata.

---

### Sprint 3 - Consolidamento PDF Engine Preventivi

Correzioni:

- Sincronizzato il PDF Engine con i campi gia restituiti dall'API Preventivi.
- Rimosso dal PDF il ricalcolo di quantita, prezzo unitario e importo riga.
- Il PDF ora stampa `quantita`, `prezzoUnitario`, `importoLordo`, `importo` e `totale` normalizzati dal gestionale.
- Il riepilogo PDF riporta Lordo, Sconto, Imponibile, IVA e Totale complessivo.
- Allineati motore PDF backend, esportatore PDF batch e generatore PDF frontend legacy.
- Mantenuta la deduplica delle righe identiche consecutive.

Test eseguiti:

- Creazione preventivo reale temporaneo con 3 righe.
- Verifica API Preventivi, PostgreSQL e PDF sugli stessi valori.
- PDF generato via backend con HTTP 200 e Content-Type application/pdf.
- PDF renderizzato e verificato visivamente.
- Preventivo temporaneo eliminato con residuo zero.
- Browser test pagina /preventivi senza errori console.
- Build frontend completata.

---

### Correzione calcoli Preventivi Enterprise e PDF

Correzioni:

- Centralizzata la normalizzazione numerica per quantita, prezzi, sconti, imponibile, IVA e totale.
- Corretta la quantita per righe a corpo/cad usando la quantita manuale senza moltiplicare per misure a zero.
- Corretta la quantita a misura con formula par.ug. x lunghezza x larghezza x H/peso.
- Aggiunti salvataggio e restituzione di `imponibile`, `iva_percentuale`, `iva_importo`, `totale`, `importo_lordo` e `importo`.
- Impostata IVA predefinita 22% quando l'aliquota e mancante.
- Allineato il PDF ai valori normalizzati salvati da backend/PostgreSQL.
- Aggiunto riepilogo PDF con imponibile, IVA 22% e totale complessivo.
- Mantenuta la deduplica delle righe PDF identiche consecutive.

Test eseguiti:

- Riga corpo: quantita 1 x 1000,00 = 1000,00.
- Riga cad: quantita 2 x 250,00 con sconto 10% = 450,00.
- Riga mq: 1 x 10 x 5 x 1 x 130,53 = 6526,50.
- Totali: lordo 8026,50, sconto 50,00, imponibile 7976,50, IVA 1754,83, totale 9731,33.
- POST preventivo HTTP 201, GET dettaglio HTTP 200, PUT HTTP 200, GET PDF HTTP 200 application/pdf.
- Verifica database su testata e righe preventivo.
- Verifica persistenza dopo riavvio backend/frontend.
- PDF renderizzato e verificato senza righe duplicate.
- Preventivi, Clienti, Elenco Prezzi e Cantieri verificati nel browser senza errori console.
- Build frontend completata.

---

### Correzione PDF Preventivi: quantita, importi e cache

Correzioni:

- Normalizzati numeri italiani con virgola per quantita, prezzi e sconti.
- Corretto il calcolo PDF quando `partiUguali` vale 1 ma la quantita esplicita e diversa.
- Aggiunto recupero della quantita da misure, totale/prezzo e unita a corpo.
- Eliminata dal PDF la ripetizione consecutiva della stessa riga identica.
- Disabilitata la cache del PDF e aggiunto un parametro univoco all'apertura.
- Rimossa la risposta ingannevole che riapriva un PDF vecchio quando il file era bloccato.

Test eseguiti:

- Quantita 1 x 130,53 euro = 130,53 euro.
- Quantita 2,50 x 100,00 euro = 250,00 euro.
- Quantita 25 con `partiUguali` 1 mantenuta a 25.
- Riga duplicata consecutiva ridotta a una sola riga nel PDF.
- PDF di prova generato e verificato.
- Build frontend completata.
- Lint globale ancora bloccato da errori preesistenti fuori dal modulo Preventivi.

---

### Correzione azioni Clienti e cartella esterna

Correzioni:

- Corrette le azioni dell'Elenco Clienti in base alla funzione reale.
- Nuovo Preventivo apre la creazione preventivo collegata al cliente.
- Nuovo Cantiere crea un cantiere collegato al cliente.
- Aggiunto collegamento alla cartella esterna cliente da backend Windows.
- Consolidate Apri scheda cliente ed Elimina nel menu Altro.

Test eseguiti:

- Verifica assenza diciture errate Nuovo trattamento e Nuovo impiego.
- Verifica pulsanti Modifica, Nuovo Preventivo, Nuovo Cantiere, Apri Cartella.
- Verifica menu Altro con Apri scheda cliente ed Elimina.
- Verifica creazione/trovamento cartella cliente e sottocartelle.
- Verifica apertura cartella via backend.
- Browser test pagina /clienti senza errori console.
- Build frontend completata.

---

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
