"""
DEPREZZATI · report settimanale.

Esegue tre sezioni e scrive in out/ i file usati dalla GitHub Action:
  out/titolo.txt  titolo della issue
  out/label.txt   "AZIONE" oppure "settimanale"
  out/report.md   corpo della issue
Aggiorna inoltre stato.json (candidati e semafori della settimana, per i confronti).

Regola d'oro: ogni numero arriva dai dati scaricati da Yahoo Finance (yfinance).
Se un dato manca si scrive "n.d.", mai stime.
"""

import io
import json
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import yaml
import yfinance as yf

QUI = Path(__file__).parent
OUT = QUI / "out"
CACHE_UNIVERSO = QUI / "universo_sp500.csv"
STATO = QUI / "stato.json"
ROMA = ZoneInfo("Europe/Rome")
ND = "n.d."
UA = {"User-Agent": "DEPREZZATI-watchlist/1.0 (report settimanale; python-requests)"}


# ---------------------------------------------------------------- formattazione

def num_ok(x):
    """True se x è un numero vero (non None, non NaN, non infinito)."""
    try:
        return x is not None and math.isfinite(float(x))
    except (TypeError, ValueError):
        return False


def fmt_num(x, dec=2):
    """Numero in formato italiano: 1.234,56"""
    if not num_ok(x):
        return ND
    s = f"{float(x):,.{dec}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def fmt_usd(x, dec=2):
    return ND if not num_ok(x) else "$" + fmt_num(x, dec)


def fmt_pct(x, dec=1, segno=True):
    """x è una frazione (0,25 = 25%)."""
    if not num_ok(x):
        return ND
    s = fmt_num(abs(x) * 100, dec) + "%"
    if not segno:
        return s
    return ("+" if x > 0 else "−" if x < 0 else "") + s


def oggi_roma():
    return datetime.now(ROMA)


# ---------------------------------------------------------------- universo

def scarica_lista_sp500():
    """Lista componenti S&P 500: Wikipedia, con un dataset pubblico come riserva."""
    try:
        html = requests.get(
            "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", headers=UA, timeout=30
        ).text
        df = pd.read_html(io.StringIO(html), attrs={"id": "constituents"})[0]
        df = df.rename(columns={"Symbol": "simbolo", "Security": "nome", "GICS Sector": "settore"})
    except Exception as e:  # noqa: BLE001
        print(f"Wikipedia non disponibile ({e}), uso il dataset di riserva")
        csv = requests.get(
            "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
            headers=UA, timeout=30,
        ).text
        df = pd.read_csv(io.StringIO(csv))
        df = df.rename(columns={"Symbol": "simbolo", "Security": "nome", "GICS Sector": "settore"})
    df = df[["simbolo", "nome", "settore"]].dropna()
    if len(df) < 450:  # controllo di sanità: l'S&P 500 ha ~500 titoli
        raise RuntimeError(f"Lista S&P 500 sospetta: solo {len(df)} titoli")
    df["simbolo"] = df["simbolo"].str.replace(".", "-", regex=False)  # BRK.B -> BRK-B (Yahoo)
    df["aggiornata_il"] = date.today().isoformat()
    return df.sort_values("simbolo").reset_index(drop=True)


def carica_universo(cfg):
    """Usa la cache nel repo; la riscarica se è più vecchia della soglia. Se il download
    fallisce ma la cache esiste, continua con la cache."""
    giorni = cfg["universo"]["aggiorna_lista_ogni_giorni"]
    if CACHE_UNIVERSO.exists():
        cache = pd.read_csv(CACHE_UNIVERSO)
        eta = (date.today() - date.fromisoformat(cache["aggiornata_il"].iloc[0])).days
        if eta < giorni:
            return cache
    try:
        df = scarica_lista_sp500()
        df.to_csv(CACHE_UNIVERSO, index=False)
        return df
    except Exception as e:  # noqa: BLE001
        if CACHE_UNIVERSO.exists():
            print(f"Aggiornamento lista fallito ({e}), uso la cache")
            return pd.read_csv(CACHE_UNIVERSO)
        raise


# ---------------------------------------------------------------- dati Yahoo

def con_riprova(funzione, tentativi=3, pausa=3):
    """Richiama funzione() fino a 'tentativi' volte (Yahoo a volte risponde 429/401)."""
    for i in range(tentativi):
        try:
            return funzione()
        except Exception:  # noqa: BLE001
            if i == tentativi - 1:
                raise
            time.sleep(pausa * (i + 1))


def info_titolo(simbolo):
    """Dati di sintesi di Yahoo (capitalizzazione, P/E forward, FCF). {} se non disponibili."""
    try:
        return con_riprova(lambda: yf.Ticker(simbolo).info) or {}
    except Exception:  # noqa: BLE001
        return {}


def scarica_prezzi(simboli, inizio):
    """Prezzi giornalieri non rettificati (Close, High, Low) dal giorno 'inizio'."""
    dati = con_riprova(lambda: yf.download(
        simboli, start=inizio, auto_adjust=False, progress=False, threads=True, group_by="column"
    ))
    if dati is None or dati.empty:
        raise RuntimeError("Download prezzi vuoto: Yahoo Finance non ha risposto")
    return dati


def serie(prezzi, campo, simbolo):
    try:
        return prezzi[campo][simbolo].dropna()
    except KeyError:
        return pd.Series(dtype=float)


def riga(df, *nomi):
    """Valori di una voce di bilancio, dal più recente al più vecchio, senza anni vuoti."""
    if df is None or df.empty:
        return []
    for nome in nomi:
        if nome in df.index:
            s = df.loc[nome]
            s = s[sorted(s.index, reverse=True)]
            return [float(v) for v in s.values if num_ok(v)]
    return []


# ---------------------------------------------------------------- semaforo trappola

def semaforo_trappola(simbolo, cfg):
    """Restituisce (emoji, criteri falliti, criteri n.d.) dai bilanci annuali."""
    t = cfg["trappola"]
    tk = yf.Ticker(simbolo)
    try:
        cf = con_riprova(lambda: tk.cashflow)
        ce = con_riprova(lambda: tk.income_stmt)
        sp = con_riprova(lambda: tk.balance_sheet)
    except Exception:  # noqa: BLE001
        cf = ce = sp = None
    falliti, nd = [], []

    # 1) FCF positivo in almeno N degli ultimi 4 anni
    fcf = riga(cf, "Free Cash Flow")[:4]
    if len(fcf) < 4:
        nd.append("FCF ultimi 4 anni")
    elif sum(v > 0 for v in fcf) < t["fcf_anni_positivi_min"]:
        falliti.append(f"FCF positivo {sum(v > 0 for v in fcf)}/4 anni")

    # 2) ricavi non in calo per N anni di fila
    n = t["ricavi_anni_calo_max"]
    ric = riga(ce, "Total Revenue", "Operating Revenue")[: n + 1]
    if len(ric) < n + 1:
        nd.append("ricavi")
    elif all(ric[i] < ric[i + 1] for i in range(n)):
        falliti.append(f"ricavi in calo da {n} anni")

    # 3) debito netto / EBITDA sotto la soglia
    debito_netto = (riga(sp, "Net Debt") or [None])[0]
    if not num_ok(debito_netto):
        debito = (riga(sp, "Total Debt") or [None])[0]
        cassa = (riga(sp, "Cash Cash Equivalents And Short Term Investments",
                      "Cash And Cash Equivalents") or [None])[0]
        debito_netto = debito - cassa if num_ok(debito) and num_ok(cassa) else None
    ebitda = (riga(ce, "EBITDA", "Normalized EBITDA") or [None])[0]
    if not num_ok(debito_netto):
        nd.append("debito netto")
    elif debito_netto <= 0:
        pass  # cassa netta: criterio superato
    elif not num_ok(ebitda):
        nd.append("EBITDA")
    elif ebitda <= 0 or debito_netto / ebitda >= t["debito_netto_ebitda_max"]:
        rapp = fmt_num(debito_netto / ebitda, 1) if ebitda > 0 else "EBITDA negativo"
        falliti.append(f"debito netto/EBITDA {rapp}")

    # 4) azioni in circolazione non in crescita oltre la soglia annua
    az = riga(sp, "Ordinary Shares Number", "Share Issued")[:2]
    if len(az) < 2:
        az = riga(ce, "Diluted Average Shares", "Basic Average Shares")[:2]
    if len(az) < 2 or az[1] <= 0:
        nd.append("azioni in circolazione")
    elif az[0] / az[1] - 1 > t["crescita_azioni_max"] / 100:
        falliti.append(f"azioni +{fmt_num((az[0] / az[1] - 1) * 100, 1)}% in un anno")

    emoji = "🔴" if len(falliti) >= 2 else "🟡" if (falliti or nd) else "🟢"
    return emoji, falliti, nd


def testo_criteri(falliti, nd):
    parti = []
    if falliti:
        parti.append("falliti: " + "; ".join(falliti))
    if nd:
        parti.append("n.d.: " + ", ".join(nd))
    return " · ".join(parti) if parti else "tutti i criteri superati"


# ---------------------------------------------------------------- sezione 1

def sezione_candidati(cfg, universo, prezzi, infos, stato_prec):
    cap_min = cfg["universo"]["cap_minima_miliardi"] * 1e9
    calo_min = cfg["candidati"]["calo_minimo_dal_massimo"] / 100
    inizio_52s = pd.Timestamp(date.today() - timedelta(weeks=52))

    righe = []
    for _, r in universo.iterrows():
        s, inf = r["simbolo"], infos.get(r["simbolo"], {})
        cap = inf.get("marketCap")
        if not num_ok(cap) or cap <= cap_min:
            continue
        close = serie(prezzi, "Close", s)
        high = serie(prezzi, "High", s)
        high = high[high.index >= inizio_52s]
        if close.empty or high.empty:
            continue
        ultimo, massimo = float(close.iloc[-1]), float(high.max())
        pe = inf.get("forwardPE")
        fcf = inf.get("freeCashflow")
        righe.append({
            "simbolo": s, "settore": r["settore"], "prezzo": ultimo,
            "calo": ultimo / massimo - 1,
            "pe": float(pe) if num_ok(pe) and pe > 0 else None,
            "pfcf": cap / fcf if num_ok(fcf) and fcf > 0 else None,
        })
    df = pd.DataFrame(righe)
    n_universo = len(df)

    # mediane di settore (solo valori positivi disponibili)
    med_pe = df.groupby("settore")["pe"].median()
    med_pfcf = df.groupby("settore")["pfcf"].median()
    df["pe_sotto"] = df.apply(lambda x: num_ok(x.pe) and x.pe < med_pe.get(x.settore, float("nan")), axis=1)
    df["pfcf_sotto"] = df.apply(lambda x: num_ok(x.pfcf) and x.pfcf < med_pfcf.get(x.settore, float("nan")), axis=1)

    filtrati = df[(df["calo"] <= -calo_min) & (df["pe_sotto"] | df["pfcf_sotto"])].sort_values("calo")

    # semaforo solo finché non ho N candidati 🟢/🟡 (risparmia richieste a Yahoo)
    scelti = []
    for _, x in filtrati.iterrows():
        emoji, falliti, nd = semaforo_trappola(x.simbolo, cfg)
        if emoji == "🔴":
            continue
        scelti.append({**x.to_dict(), "emoji": emoji, "criteri": testo_criteri(falliti, nd)})
        if len(scelti) >= cfg["candidati"]["quanti"]:
            break

    prima_volta = stato_prec is None
    prec = set((stato_prec or {}).get("candidati", []))
    for c in scelti:
        c["nuovo"] = (not prima_volta) and c["simbolo"] not in prec

    # tabella: 5 colonne strette
    md = [f"## 1 · Candidati deprezzati",
          f"Calo ≥ {fmt_num(calo_min * 100, 0)}% dal massimo a 52 sett. e P/E fwd o P/FCF sotto la mediana del settore. "
          f"Universo: {n_universo} titoli S&P 500 > {cfg['universo']['cap_minima_miliardi']} mld $; "
          f"{len(filtrati)} superano i filtri. 🆕 = nuovo rispetto alla settimana scorsa.", ""]
    if not scelti:
        md.append("Nessun candidato 🟢 o 🟡 questa settimana.")
    else:
        md += ["| Titolo | Prezzo | Calo | P/E · P/FCF | 🚦 |", "|---|--:|--:|--:|:-:|"]
        for c in scelti:
            nome = ("🆕 " if c["nuovo"] else "") + c["simbolo"]
            pe = fmt_num(c["pe"], 1) + ("↓" if c["pe_sotto"] else "")
            pf = fmt_num(c["pfcf"], 1) + ("↓" if c["pfcf_sotto"] else "")
            md.append(f"| {nome} | {fmt_usd(c['prezzo'])} | {fmt_pct(c['calo'], 0)} | {pe} · {pf} | {c['emoji']} |")
        md += ["", "↓ = sotto la mediana del settore. Criteri trappola:", ""]
        for c in scelti:
            md.append(f"- **{c['simbolo']}** {c['emoji']} {c['criteri']}")
    if prima_volta:
        md += ["", "_Prima esecuzione: nessun confronto con la settimana precedente._"]
    return scelti, md, prima_volta


# ---------------------------------------------------------------- sezione 2

def sezione_watchlist(cfg, watchlist, prezzi, infos, stato_prec):
    oggi = date.today()
    giorni_fin = cfg["watchlist"]["giorni_finestra_tranche"]
    mesi = cfg["watchlist"]["mesi_da_rivedere"]
    semafori_prec = (stato_prec or {}).get("semafori_watchlist", {})
    eventi, semafori, righe = [], {}, []

    for w in watchlist:
        s = str(w["ticker"]).upper()
        aggiunta = pd.Timestamp(w["data_aggiunta"])
        rif = w.get("prezzo_riferimento")
        obiettivo = w.get("obiettivo")
        tranche = [float(t) for t in (w.get("tranche") or []) if num_ok(t)]

        close = serie(prezzi, "Close", s)
        low = serie(prezzi, "Low", s)
        prezzo = float(close.iloc[-1]) if not close.empty else None
        var = prezzo / rif - 1 if num_ok(prezzo) and num_ok(rif) and rif > 0 else None

        # tranche più profonda toccata dalla data di aggiunta (minimo giornaliero)
        low_dal = low[low.index >= aggiunta]
        minimo = float(low_dal.min()) if not low_dal.empty else None
        toccate = [i for i, t in enumerate(tranche, 1) if num_ok(minimo) and minimo <= t]
        txt_tranche = f"T{toccate[-1]}" if toccate else ("—" if num_ok(minimo) else ND)

        # evento: tranche toccata negli ultimi N giorni
        low_fin = low[low.index >= pd.Timestamp(oggi - timedelta(days=giorni_fin))]
        min_fin = float(low_fin.min()) if not low_fin.empty else None
        toccate_fin = [i for i, t in enumerate(tranche, 1) if num_ok(min_fin) and min_fin <= t]
        if toccate_fin:
            n = toccate_fin[-1]
            eventi.append((f"{s} tranche {n} toccata",
                           f"🚨 {s} ha toccato la tranche {n} ({fmt_usd(tranche[n - 1], 0)}), minimo {fmt_usd(min_fin)}"))

        # semaforo aggiornato; evento se passa a 🔴
        emoji, falliti, nd = semaforo_trappola(s, cfg)
        semafori[s] = emoji
        if emoji == "🔴" and semafori_prec.get(s) != "🔴":
            eventi.append((f"{s} semaforo rosso",
                           f"🚨 {s} semaforo passato a 🔴 ({testo_criteri(falliti, nd)})"))

        # obiettivo
        if num_ok(obiettivo) and num_ok(prezzo):
            dist = obiettivo / prezzo - 1
            if prezzo >= obiettivo:
                eventi.append((f"{s} obiettivo raggiunto",
                               f"🚨 {s} ha raggiunto l'obiettivo {fmt_usd(obiettivo)} (prezzo {fmt_usd(prezzo)})"))
        else:
            dist = None

        # in watchlist da più di N mesi
        giorni = (oggi - aggiunta.date()).days
        if giorni > mesi * 30.44:
            eventi.append((f"{s} da rivedere",
                           f"🚨 {s} è in watchlist da {giorni} giorni (oltre {mesi} mesi): da rivedere"))

        righe.append({"s": s, "prezzo": prezzo, "var": var, "tranche": txt_tranche, "emoji": emoji,
                      "obiettivo": obiettivo, "dist": dist, "giorni": giorni,
                      "criteri": testo_criteri(falliti, nd), "rif": rif, "aggiunta": aggiunta})

    md = ["## 2 · Watchlist", ""]
    if not righe:
        md.append("watchlist.yml è vuota.")
        return eventi, semafori, righe, md
    md += ["| Titolo | Prezzo | Δ rif. | Tranche | 🚦 |", "|---|--:|--:|:-:|:-:|"]
    for r in righe:
        md.append(f"| {r['s']} | {fmt_usd(r['prezzo'])} | {fmt_pct(r['var'])} | {r['tranche']} | {r['emoji']} |")
    md += ["", "| Titolo | Obiettivo | Distanza | Giorni |", "|---|--:|--:|--:|"]
    for r in righe:
        md.append(f"| {r['s']} | {fmt_usd(r['obiettivo'])} | {fmt_pct(r['dist'])} | {r['giorni']} |")
    md.append("")
    for r in righe:
        md.append(f"- **{r['s']}** {r['emoji']} {r['criteri']}")
    md.append("")
    md.append("Tranche = la più profonda toccata dal minimo giornaliero dalla data di aggiunta. "
              "Distanza = quanto manca all'obiettivo dal prezzo attuale.")
    return eventi, semafori, righe, md


# ---------------------------------------------------------------- sezione 3

def sezione_confronto(cfg, righe_wl, prezzi):
    bench = cfg["benchmark"]
    b_close = serie(prezzi, "Close", bench)
    rend_wl, rend_b = [], []
    for r in righe_wl:
        if not num_ok(r["var"]):
            continue
        dal = b_close[b_close.index >= r["aggiunta"]]
        if dal.empty:
            continue
        rend_wl.append(r["var"])
        rend_b.append(float(b_close.iloc[-1]) / float(dal.iloc[0]) - 1)
    md = ["## 3 · Confronto", ""]
    if not rend_wl:
        md.append(f"Watchlist e {bench}: {ND}")
        return md
    m_wl, m_b = sum(rend_wl) / len(rend_wl), sum(rend_b) / len(rend_b)
    md += ["| Media dalla data di aggiunta | Rendimento |", "|---|--:|",
           f"| Watchlist (titoli: {len(rend_wl)}) | {fmt_pct(m_wl)} |",
           f"| {bench} stesso periodo | {fmt_pct(m_b)} |",
           f"| Differenza | {fmt_pct(m_wl - m_b)} |", "",
           f"Solo variazione di prezzo, dividendi esclusi. {bench} parte dalla chiusura della data di aggiunta di ogni titolo."]
    return md


# ---------------------------------------------------------------- main

def main():
    cfg = yaml.safe_load((QUI / "config.yml").read_text())
    watchlist = yaml.safe_load((QUI / "watchlist.yml").read_text()) or []
    stato_prec = json.loads(STATO.read_text()) if STATO.exists() else None

    universo = carica_universo(cfg)
    simboli_wl = [str(w["ticker"]).upper() for w in watchlist]
    simboli = sorted(set(universo["simbolo"]) | set(simboli_wl) | {cfg["benchmark"]})

    inizio = min([date.today() - timedelta(weeks=53)] + [pd.Timestamp(w["data_aggiunta"]).date() for w in watchlist])
    prezzi = scarica_prezzi(simboli, (inizio - timedelta(days=5)).isoformat())
    estratti = oggi_roma()

    with ThreadPoolExecutor(max_workers=6) as ex:
        infos = dict(zip(universo["simbolo"], ex.map(info_titolo, universo["simbolo"])))
    validi = sum(1 for v in infos.values() if num_ok(v.get("marketCap")))
    if validi < 0.8 * len(universo):
        raise RuntimeError(f"Dati Yahoo incompleti: capitalizzazione disponibile solo per {validi}/{len(universo)} titoli")

    scelti, md1, prima_volta = sezione_candidati(cfg, universo, prezzi, infos, stato_prec)
    eventi, semafori, righe_wl, md2 = sezione_watchlist(cfg, watchlist, prezzi, infos, stato_prec)
    md3 = sezione_confronto(cfg, righe_wl, prezzi)

    # ---- riassunto (prime 3 righe: anteprima della mail) e titolo
    verdi = [c for c in scelti if c["emoji"] == "🟢"]
    if eventi:
        riga1 = eventi[0][1] + (f" (+{len(eventi) - 1} altri eventi)" if len(eventi) > 1 else "")
    else:
        riga1 = "✅ Watchlist: nessun evento importante"
    if prima_volta:
        riga2 = f"🟢 {len(verdi)} candidati verdi, 🟡 {len(scelti) - len(verdi)} gialli (prima esecuzione)"
    else:
        riga2 = f"🟢 {sum(c['nuovo'] for c in verdi)} nuovi candidati verdi, 🟡 {sum(c['nuovo'] for c in scelti if c['emoji'] == '🟡')} nuovi gialli"
    riga3 = f"Dati estratti il {estratti:%d/%m/%Y alle %H:%M} (ora italiana)"

    gg_mm = f"{estratti:%d/%m}"
    if eventi:
        parole = eventi[0][0].split()
        if len(eventi) > 1:
            parole = parole[:4] + [f"+{len(eventi) - 1}", "eventi"]
        titolo = f"🚨📉 DEPREZZATI | AZIONE: {' '.join(parole[:6])} | {gg_mm}"
        label = "AZIONE"
    else:
        titolo = f"📉 DEPREZZATI | nessuna novità | {gg_mm}"
        label = "settimanale"

    corpo = [riga1, riga2, riga3, ""]
    if eventi:
        corpo += ["## 🚨 Eventi importanti", ""] + [f"- {e[1]}" for e in eventi] + [""]
    corpo += md2 + [""] + md1 + [""] + md3 + [
        "", "---",
        f"Fonte: Yahoo Finance (yfinance), estrazione {estratti:%d/%m/%Y %H:%M}. "
        "🚦 rischio trappola: 🟢 nessun criterio fallito · 🟡 1 fallito o dati mancanti · 🔴 2 o più. "
        "n.d. = dato non disponibile.",
    ]

    OUT.mkdir(exist_ok=True)
    (OUT / "titolo.txt").write_text(titolo)
    (OUT / "label.txt").write_text(label)
    (OUT / "report.md").write_text("\n".join(corpo) + "\n")
    STATO.write_text(json.dumps({
        "data": estratti.isoformat(timespec="minutes"),
        "candidati": [c["simbolo"] for c in scelti],
        "semafori_watchlist": semafori,
    }, ensure_ascii=False, indent=2) + "\n")
    print(titolo)
    print("\n".join(corpo))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # l'Action apre una issue di errore se l'uscita è != 0
        import traceback
        traceback.print_exc()
        sys.exit(f"ERRORE: {e}")
