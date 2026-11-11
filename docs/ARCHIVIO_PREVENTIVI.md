# Archivio preventivi per cliente / condominio

## Struttura richiesta

```text
<cartella originale TEAMGROUP SERVER>/
└── Clienti/
    └── ID02201 - CONDOMINIO QUADRIFOGLIO/
        └── PREV-274 - Opere edili/
            ├── Analisi dei costi/
            ├── Allegati/
            ├── Preventivi/
            │   ├── PREV-274-Rev00.pdf
            │   └── PREV-274-Rev01.pdf
            └── Consuntivi/
```

La cartella identificativa del lavoro viene creata direttamente dentro il condominio, senza la cartella `Preventivi` intermedia. Le cartelle per condominio e per singolo preventivo vengono create dal backend
quando si archivia un PDF o si richiede la cartella di un preventivo.
Le revisioni dello stesso numero rimangono insieme.

## Percorso di destinazione

Non inserire nel codice un percorso immaginato. Identificare prima la cartella
**originale** denominata TEAMGROUP SERVER (su disco o condivisione), poi configurare
in **Impostazioni** del gestionale il campo `archivePath` con il suo percorso
assoluto (esempio indicativo: `D:\\TEAMGROUP SERVER`). Le API Clienti, Preventivi
e Apri cartella condividono questa stessa impostazione.

Il backend deve avere permessi di lettura e scrittura su quella cartella.
Non usare un percorso locale del PC utente se il backend gira su un altro host.

## Recupero dei documenti già archiviati

Eseguire prima un backup dei documenti e del database PostgreSQL.
Sul computer che esegue il backend Node.js, con i moduli installati e il
database raggiungibile:

**1. Anteprima (predefinita; nessun file viene scritto):**

```powershell
node scripts/migraArchivioPreventivi.mjs --origine "PERCORSO_ARCHIVIO_ESTERNO" --destinazione "PERCORSO_CARTELLA_ORIGINALE_TEAMGROUP_SERVER"
```

**2. Copia effettiva, soltanto dopo aver controllato l'anteprima:**

```powershell
node scripts/migraArchivioPreventivi.mjs --origine "PERCORSO_ARCHIVIO_ESTERNO" --destinazione "PERCORSO_CARTELLA_ORIGINALE_TEAMGROUP_SERVER" --esegui
```

Il comando **non elimina i sorgenti**, **non sovrascrive** i file che già
esistono e segnala i conflitti. Associa i file ai preventivi usando gli
identificativi presenti in PostgreSQL. I file con associazione incerta non
vengono spostati automaticamente.

Dopo la verifica campionaria di cartelle, revisioni e PDF, cambiare
`archivePath` al nuovo percorso. Ripetere un controllo degli endpoint
`GET /api/preventivi/:id/pdf` e `GET /api/preventivi/:id/cartella`.

## Limiti da verificare prima della messa in produzione

- I file già presenti vengono copiati; gli originali rimangono integri.
- La procedura migra documenti fisici presenti nelle cartelle, **non esporta
  automaticamente gli oggetti Analisi costi e Consuntivi conservati solo
  in PostgreSQL**. Per quelli va prevista una funzione di esportazione separata.
- La migrazione reale non si esegue da GitHub: richiede accesso al file system
  e al database del server.
- Occorre validare backend, PostgreSQL, frontend, API e build sulla copia
  operativa prima di distribuire.
