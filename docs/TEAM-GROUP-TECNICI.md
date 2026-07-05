# TEAM GROUP TECNICI

App separata mobile-first per le squadre tecniche in cantiere.

## Avvio

1. Avvia il backend del gestionale:

```bash
npm run server
```

2. Avvia l'app tecnici:

```bash
npm run dev:tecnici
```

3. Apri:

```text
http://localhost:5180/tecnici.html
```

## Accesso demo

Codice squadra iniziale:

```text
TEAMGROUP1
```

## Dati salvati

Le chiamate e i dati tecnici vengono salvati nelle tabelle:

- `tecnici_squadre`
- `chiamate_tecnici`
- `chiamate_tecnici_foto`

Alla chiusura intervento vengono salvati:

- stato `Completato`
- note tecnico
- materiale utilizzato
- ora arrivo
- ora fine
- foto prima/dopo

## Sicurezza funzionale

L'app tecnici usa solo endpoint `/api/tecnici`.
Non espone preventivi, contabilità, clienti completi o dati amministrativi.
