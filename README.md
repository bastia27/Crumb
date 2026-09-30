# CRUMB

Tracking alimentare quotidiano, mobile-first, a uso personale. Tutto in italiano.

**Deterministica e offline**: nessuna chiave API, nessuna chiamata di rete, nessun backend, nessun account.
Ogni numero, voto, media, alert e suggerimento è calcolato in JavaScript sui dati locali (localStorage).
Dove servirebbe un giudizio qualitativo, CRUMB esporta i dati come testo da incollare altrove.

## File
- `index.html` — struttura e stile
- `app.js` — stato, parser, calcoli, viste
- `data.js` — database alimenti (valori per 100 g, carbo netti = totali − fibra)
- `ricette.js` — ricette precaricate (ingredienti → valori calcolati)
- `manifest.webmanifest`, `sw.js`, `icon.svg`, `icons/` — PWA

## Uso
Serve un qualsiasi server statico (il service worker non gira da `file://`):

    npx http-server -p 8080 .

Su iPhone: apri l'indirizzo in Safari → Condividi → "Aggiungi alla schermata Home".
Per usarla fuori casa pubblica la cartella su un hosting statico (es. GitHub Pages).
