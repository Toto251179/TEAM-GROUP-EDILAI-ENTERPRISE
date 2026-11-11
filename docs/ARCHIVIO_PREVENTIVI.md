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
            │   ├── PREV-274-Rev01.pdf             # documento attuale
            │   └── Superati/
            │       └── PREV-274-Rev00_SUPERATO_2026-11-11_15-50-00_a1b2c3d4.pdf
            └── Consuntivi/
```

La cartella identificativa del lavoro viene creata direttamente dentro il condominio, senza la cartella `Preventivi` intermedia. Le cartelle per condominio e per singolo preventivo vengono create dal backend
quando si archivia un PDF o si richiede la cartella di un preventivo.
Le revisioni dello stesso numero rimangono insieme.

## Sincronizzazione immediata alla creazione e modifica

Il salvataggio di un preventivo (POST `/api/preventivi`) e le modifiche (PUT
`/api/preventivi/:id`) generano immediatamente il PDF e lo salvano nella
cartella della relativa commessa, senza premere `Archivia PDF`.

Anche l'accettazione e l'azione di archiviazione manuale richiamano la
sincronizzazione. Le revisioni PDF conservano il loro numero; un nuovo
salvataggio della **stessa** revisione aggiorna il PDF omonimo.

La cartella principale è definita da `archivePath` in **Impostazioni >
Configurazione Sistema > Archivio Preventivi**. Nella stessa schermata si
possono inserire ulteriori `archiveMirrors`, uno per riga, da mantenere
allineati. In alternativa, il backend supporta `ARCHIVE_MIRROR_DIRS`
(percorso multiplo delimitato da punto e virgola).

Sono sincronizzate automaticamente **le destinazioni espressamente
configurate e raggiungibili dal backend**, non cartelle a cui il server non
ha accesso. Ogni destinazione ha la medesima struttura
`Clienti/<cliente>/<lavoro>/Preventivi/<PDF>` e le altre tre cartelle.

Le API di creazione, modifica e accettazione includono `archivioSync`,
con il risultato per ogni destinazione. Se un archivio non è raggiungibile,
il preventivo rimane salvato in PostgreSQL; il gestionale mostra
`DA_VERIFICARE` e non dichiara la sincronizzazione riuscita. Per riprovare
è disponibile `POST /api/preventivi/:id/sincronizza-archivi`.

L'avvio del backend non retro-sincronizza automaticamente preventivi vecchi:
per quelli è prevista la procedura di migrazione già documentata sotto.

## Versioni Superate

Al primo salvataggio, il preventivo corrente viene pubblicato in `Preventivi`.
Ogni successiva modifica **del contenuto del preventivo**, prima di
pubblicare il nuovo PDF, conserva una copia del precedente in
`Preventivi/Superati`. Il nome storico include il numero del preventivo,
la revisione, data/ora (Europe/Rome) e un identificativo univoco.

In `Preventivi` resta una sola versione corrente del PDF generato
automaticamente; gli altri PDF delle precedenti revisioni vengono
conservati in `Superati`. I PDF allegati manualmente, con nomi diversi
dal formato del gestionale, non vengono rimossi.

La modifica viene replicata in ogni archivio esterno configurato,
mantenendo anche lo storico in ciascuno di essi. Se un archivio
non è scrivibile, l'operazione viene segnalata come `DA_VERIFICARE`
senza dichiarare erroneamente completata la sincronizzazione.
Le copie precedenti vengono salvate e controllate *prima* di
sostituire il PDF corrente. Se il contenuto non è cambiato, il
gestionale riutilizza la versione PDF già pubblicata e non crea
un nuovo file superato solo per effetto della rigenerazione tecnica.

Gli originali esistenti non vengono cancellati durante la migrazione
iniziale tra i server: quella procedura resta separata.

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
