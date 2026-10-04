# CRUMB

Tracking alimentare quotidiano, mobile-first, a uso personale. Tutto in italiano.

**Deterministica e offline**: nessuna chiave API, nessuna chiamata di rete, nessun backend, nessun account.
Ogni numero, voto, media, alert e suggerimento è calcolato in JavaScript sui dati locali (localStorage).
Dove servirebbe un giudizio qualitativo, CRUMB esporta i dati come testo da incollare altrove.

## Schermate
- **Oggi**: barre kcal/proteine/carbo netti/fibra, voto, alert (sodio, fibra concentrata, olio e formaggi), range per le porzioni non pesate, suggerimento con ricette, "Cosa mangio stasera", "Copia giornata".
- **Peso**: pesata del mattino e media mobile a 7 giorni.
- **Settimana**: ultimi 7 giorni, medie con scarto dal target, deficit e grasso stimato (÷ 7700), giorni sotto 1800 kcal, regole per tag, "Copia settimana".
- **Storico** e **Impostazioni** (target, soglie del voto, regole, alimenti, ricette, backup JSON).

## File
- `index.html` — struttura e stile
- `app.js` — stato, parser, calcoli, viste
- `data.js` — database alimenti (valori per 100 g, carbo netti = totali − fibra)
- `ricette.js` — 190 ricette precaricate da 16 cucine del mondo, con varianti (ingredienti → valori calcolati); filtro per cucina in Aggiungi → Ricette
- `manifest.webmanifest`, `sw.js`, `icon.svg`, `icons/` — PWA

## Uso
Serve un qualsiasi server statico (il service worker non gira da `file://`):

    npx http-server -p 8080 .

Su iPhone: apri l'indirizzo in Safari → Condividi → "Aggiungi alla schermata Home".
Per usarla fuori casa pubblica la cartella su un hosting statico (es. GitHub Pages).
