# DEPREZZATI-watchlist
Ogni lunedì alle 7:00 (ora italiana) una GitHub Action esegue `screen.py` e apre una issue con il report; la precedente viene chiusa.
**Aggiungere un titolo:** in `watchlist.yml` copia il blocco di GOOGL e cambia ticker, data_aggiunta, prezzo_riferimento, perche, obiettivo, smentita e le 3 tranche. Commit.
**Cambiare le soglie:** modifica i numeri in `config.yml` (calo minimo, numero candidati, criteri del semaforo, mesi da rivedere, ETF di confronto). Commit.
**Lanciarlo a mano:** tab Actions → "Report settimanale" → Run workflow.
La lista S&P 500 è in cache in `universo_sp500.csv` e si aggiorna da sola ogni 30 giorni; `stato.json` ricorda i candidati della settimana prima.
Dati: Yahoo Finance via yfinance. Dato mancante = "n.d.". Se lo script fallisce si apre una issue "⚠️ ERRORE".
