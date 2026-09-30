// CRUMB — logica dell'app. Tutto locale, tutto deterministico:
// nessuna rete, nessuna chiave, nessun backend. Ogni numero nasce da qui.
'use strict';

/* ================================================================
   STATO E PERSISTENZA
   ================================================================ */

const LS_KEY = 'crumb:v1';
const PASTI = [
  { id: 'colazione', nome: 'Colazione' },
  { id: 'pranzo', nome: 'Pranzo' },
  { id: 'spuntini', nome: 'Spuntini' },
  { id: 'cena', nome: 'Cena' },
];

const DEFAULT_SETTINGS = {
  altezza: 178,
  peso: null,
  fabbisogno: 2500,
  kcalMin: 2000,
  kcalMax: 2200,
  protMin: 150,
  protMax: 180,
  carboMax: 30,
  fibraMin: 25,
  fibraMax: 30,
  // Soglie del voto (modificabili, i default sono quelli della specifica).
  kcalSoglia: 1800,     // sotto: −2 e tetto al voto
  protDura: 120,        // sotto: tetto al voto
  votoTetto: 7,
  fibraBassa: 15,
  fibraAlta: 35,
  sodioMax: 3000,
  // Regole settimanali (ultimi 7 giorni). "@colazione" = giorni con colazione registrata.
  regole: [
    { tag: 'pesce', tipo: 'min', n: 3 },
    { tag: 'pesce-azzurro', tipo: 'min', n: 2 },
    { tag: 'legume', tipo: 'min', n: 3 },
    { tag: 'carne-rossa', tipo: 'max', n: 1 },
    { tag: 'processato', tipo: 'max', n: 2 },
    { tag: '@colazione', tipo: 'min', n: 5 },
  ],
};
// Default della prima versione: se l'utente non li ha toccati, passano ai nuovi.
const REGOLE_V1 = '[{"tag":"pesce","tipo":"min","n":3},{"tag":"pesce-azzurro","tipo":"min","n":2},{"tag":"carne-rossa","tipo":"max","n":3},{"tag":"processato","tipo":"max","n":3},{"tag":"verdura","tipo":"min","n":10}]';

function emptyState() {
  return {
    v: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    giorni: {},          // 'YYYY-MM-DD' → { pasti: { colazione: [voce], ... } }
    pesi: {},            // 'YYYY-MM-DD' → kg
    alimenti: [],        // alimenti creati dall'utente
    override: {},        // id alimento base → campi modificati
    nascosti: [],        // id di alimenti/ricette base nascosti
    ricette: [],         // ricette create dall'utente
    preset: [],          // { id, nome, voci: [voce] }
    recenti: [],         // [{ fid, g }] più recente per primo
  };
}

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    return emptyState();
  }
}

function migrate(data) {
  const base = emptyState();
  const s = Object.assign(base, data || {});
  s.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), s.settings || {});
  if (!Array.isArray(s.settings.regole) || JSON.stringify(s.settings.regole) === REGOLE_V1) s.settings.regole = structuredClone(DEFAULT_SETTINGS.regole);
  return s;
}

function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(S));
  } catch (e) {
    toast('Memoria piena: esporta un backup');
  }
}

/* ================================================================
   UTILITÀ
   ================================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n, d = 0) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
};

function dkey(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}
function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dkey(d);
}
const todayKey = () => dkey(new Date());
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
function labelDay(k, long = true) {
  const d = parseKey(k);
  const base = `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
  if (!long) return base;
  const t = todayKey();
  if (k === t) return 'Oggi';
  if (k === addDays(t, -1)) return 'Ieri';
  return base.charAt(0).toUpperCase() + base.slice(1);
}
function weekStart(k) {
  const d = parseKey(k);
  const dow = (d.getDay() + 6) % 7; // lunedì = 0
  return addDays(k, -dow);
}

/* ================================================================
   ALIMENTI E RICETTE
   ================================================================ */

function allFoods() {
  const hidden = new Set(S.nascosti);
  const base = ALIMENTI_BASE.filter((a) => !hidden.has(a.id)).map((a) => (S.override[a.id] ? { ...a, ...S.override[a.id], base: true } : { ...a, base: true }));
  return base.concat(S.alimenti);
}
let _foodIndex = null;
function foodById(id) {
  if (!_foodIndex) _foodIndex = new Map(allFoods().map((a) => [a.id, a]));
  return _foodIndex.get(id) || S.alimenti.find((a) => a.id === id) || ALIMENTI_BASE.find((a) => a.id === id);
}
function invalidateFoods() {
  _foodIndex = null;
  _matchIndex = null;
}

function allRecipes() {
  const hidden = new Set(S.nascosti);
  return RICETTE_BASE.filter((r) => !hidden.has(r.id)).map((r) => ({ ...r, base: true })).concat(S.ricette);
}
const recipeById = (id) => allRecipes().find((r) => r.id === id);

// Valori per 100 g di una ricetta, più peso di una porzione e tag.
function recipeInfo(r) {
  let g = 0;
  const t = { kcal: 0, p: 0, cn: 0, f: 0, na: 0 };
  const tags = new Set();
  for (const ing of r.ingredienti) {
    const a = foodById(ing.fid);
    if (!a) continue;
    g += ing.g;
    for (const k in t) t[k] += (a[k] || 0) * ing.g / 100;
    (a.tag || []).forEach((x) => tags.add(x));
  }
  const per = {};
  for (const k in t) per[k] = g ? (t[k] * 100) / g : 0;
  return { per, pesoTot: g, porzG: g / (r.porzioni || 1), tag: [...tags], tot: t };
}

function perOf(a) {
  return { kcal: a.kcal, p: a.p, cn: a.cn, f: a.f, na: a.na };
}

function makeVoce(food, g) {
  return { id: uid('v'), fid: food.id, nome: food.nome, g: r0(g), per: perOf(food), tag: [...(food.tag || [])] };
}
function makeVoceRicetta(r, g) {
  const info = recipeInfo(r);
  return { id: uid('v'), rid: r.id, nome: r.nome, g: r0(g), per: info.per, tag: info.tag };
}

function voceNutr(v) {
  const k = v.g / 100;
  return { kcal: v.per.kcal * k, p: v.per.p * k, cn: v.per.cn * k, f: v.per.f * k, na: v.per.na * k };
}
function sumN(list) {
  const t = { kcal: 0, p: 0, cn: 0, f: 0, na: 0 };
  for (const n of list) for (const k in t) t[k] += n[k] || 0;
  return t;
}

function pushRecent(fid, g, inc = 0) {
  S.recenti = [{ fid, g, ...(inc ? { inc } : {}) }, ...S.recenti.filter((x) => x.fid !== fid)].slice(0, 10);
}

// Range di kcal di un gruppo di voci: le voci non pesate allargano la forchetta.
function kcalRange(voci) {
  let lo = 0, hi = 0, unc = false;
  for (const v of voci) {
    const k = voceNutr(v).kcal, i = v.inc || 0;
    lo += k * (1 - i);
    hi += k * (1 + i);
    if (i && k >= 5) unc = true;
  }
  return { lo, hi, unc };
}
const r10 = (n) => Math.round(n / 10) * 10;
const fmtRange = (r) => `${fmt(r10(r.lo))}–${fmt(r10(r.hi))}`;

// Kcal da olio/grassi da condimento e formaggi (anche dentro le ricette): le voci più incerte.
function isFatOrCheese(a) {
  return (a.tag || []).includes('grasso') || ((a.tag || []).includes('latticino') && a.kcal >= 200);
}
function fatCheeseKcal(v) {
  if (v.rid) {
    const r = recipeById(v.rid);
    if (!r) return 0;
    const info = recipeInfo(r);
    if (!info.tot.kcal) return 0;
    let fk = 0;
    for (const ing of r.ingredienti) {
      const a = foodById(ing.fid);
      if (a && isFatOrCheese(a)) fk += (a.kcal * ing.g) / 100;
    }
    return voceNutr(v).kcal * (fk / info.tot.kcal);
  }
  const a = v.fid ? foodById(v.fid) : null;
  return (a ? isFatOrCheese(a) : isFatOrCheese({ tag: v.tag, kcal: v.per.kcal })) ? voceNutr(v).kcal : 0;
}

// Alimento che da solo fornisce più della metà della fibra del giorno.
function fiberConcentration(k) {
  const voci = dayVoci(S.giorni[k]);
  const tot = sumN(voci.map(voceNutr)).f;
  if (tot < S.settings.fibraBassa) return null;
  const by = new Map();
  for (const v of voci) {
    const key = v.fid || v.rid || v.nome;
    const e = by.get(key) || { nome: v.nome, f: 0 };
    e.f += voceNutr(v).f;
    by.set(key, e);
  }
  const top = [...by.values()].sort((a, b) => b.f - a.f)[0];
  return top && top.f > tot * 0.5 ? { ...top, tot } : null;
}

/* ================================================================
   GIORNI E CALCOLI
   ================================================================ */

function getDay(k, create = false) {
  let d = S.giorni[k];
  if (!d && create) {
    d = S.giorni[k] = { pasti: { colazione: [], pranzo: [], spuntini: [], cena: [] } };
  }
  return d;
}
function dayVoci(d) {
  if (!d) return [];
  return PASTI.flatMap((p) => d.pasti[p.id] || []);
}
function dayTotals(k) {
  return sumN(dayVoci(S.giorni[k]).map(voceNutr));
}
function dayHasData(k) {
  return dayVoci(S.giorni[k]).length > 0;
}
function cleanupDay(k) {
  if (S.giorni[k] && !dayHasData(k)) delete S.giorni[k];
}

// VOTO 1–10 secondo le regole della specifica.
function voto(t, st = S.settings) {
  let v = 10;
  const pen = [];
  if (t.p < st.protMin * 0.7) pen.push(['Proteine sotto il 70% del target', 2]);
  else if (t.p < st.protMin * 0.9) pen.push(['Proteine sotto il 90% del target', 1]);
  if (t.kcal < st.kcalSoglia) pen.push([`Calorie sotto ${st.kcalSoglia}`, 2]);
  else if (t.kcal < st.kcalMin) pen.push(['Calorie sotto il target minimo', 1]);
  if (t.cn > st.carboMax) pen.push(['Carbo netti oltre il tetto', 1]);
  if (t.f < st.fibraBassa) pen.push([`Fibra sotto ${st.fibraBassa} g`, 1]);
  else if (t.f > st.fibraAlta) pen.push([`Fibra sopra ${st.fibraAlta} g`, 1]);
  for (const [, n] of pen) v -= n;
  let tetto = false;
  if ((t.p < st.protDura || t.kcal < st.kcalSoglia) && v > st.votoTetto) {
    v = st.votoTetto;
    tetto = true;
  }
  v = clamp(v, 1, 10);
  return { v, pen, tetto };
}
const votoClass = (v) => (v >= 8 ? 'v-good' : v >= 6 ? 'v-mid' : 'v-bad');

// Media mobile a 7 giorni del peso (media delle pesate disponibili nella finestra).
function weightMA(k) {
  const vals = [];
  for (let i = 0; i < 7; i++) {
    const w = S.pesi[addDays(k, -i)];
    if (w != null) vals.push(w);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function latestWeightKey(until = todayKey()) {
  const keys = Object.keys(S.pesi).filter((k) => k <= until).sort();
  return keys[keys.length - 1] || null;
}

/* ================================================================
   PARSER TESTO LIBERO
   ================================================================ */

const STOP = new Set(['di', 'de', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'd', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'a', 'il', 'lo', 'la', 'i', 'gli', 'le', 'l', 'in', 'ed', 'circa', 'tipo', 'ho', 'mangiato', 'po', 'poco', 'qualche', 'x', 'da']);
const NUM_WORDS = { un: 1, uno: 1, una: 1, mezzo: 0.5, mezza: 0.5, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, paio: 2, doppio: 2, doppia: 2 };
const UNIT_WORDS = {
  g: 'g', gr: 'g', grammi: 'g', grammo: 'g', grm: 'g', kg: 'kg', chilo: 'kg', chili: 'kg', hg: 'hg', etto: 'hg', etti: 'hg', ml: 'ml', cl: 'cl', dl: 'dl',
  cucchiaio: 'cucchiaio', cucchiai: 'cucchiaio', cucchiaiata: 'cucchiaio', cucchiaiate: 'cucchiaio', cucchiaino: 'cucchiaino', cucchiaini: 'cucchiaino',
  fetta: 'fetta', fette: 'fetta', fettina: 'fetta', fettine: 'fetta', porzione: 'porzione', porzioni: 'porzione', pezzo: 'pezzo', pezzi: 'pezzo',
  vasetto: 'vasetto', vasetti: 'vasetto', vaschetta: 'vasetto', scatoletta: 'scatoletta', scatolette: 'scatoletta', scatola: 'scatoletta',
  manciata: 'manciata', manciate: 'manciata', pugno: 'manciata', tazza: 'tazza', tazze: 'tazza', bicchiere: 'bicchiere', bicchieri: 'bicchiere',
  confezione: 'confezione', confezioni: 'confezione', busta: 'confezione', bustina: 'bustina', bustine: 'bustina',
  pizzico: 'pizzico', pizzichi: 'pizzico', tazzina: 'tazzina', tazzine: 'tazzina', bottiglia: 'bottiglia', bottiglie: 'bottiglia', lattina: 'lattina', lattine: 'lattina',
  calice: 'calice', calici: 'calice', bicchierino: 'bicchierino', bicchierini: 'bicchierino', pinta: 'pinta', pinte: 'pinta', pallina: 'pallina', palline: 'pallina', filo: 'filo', noce: 'noce', noci_u: 'noce',
  quadratino: 'quadratino', quadratini: 'quadratino', misurino: 'misurino', misurini: 'misurino',
};

function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, ' ').replace(/(\d)\s*([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9.,/%\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Stem rozzo ma efficace per l'italiano: toglie le vocali finali (pollo/polli, zucchina/zucchine, uovo/uova).
function stem(t) {
  if (t.length <= 3) return t;
  let s = t.replace(/[aeiou]+$/, '');
  if (s.length < 3) s = t.slice(0, 3);
  return s;
}
// Parole utili al nome: niente stopword; i numeri restano (servono a "greco 0%", "farina 00").
function rawTokens(s) {
  return norm(s).split(' ').map((t) => t.replace(/%$/, '')).filter((t) => t && !STOP.has(t) && !/^[.,/]+$/.test(t))
    .map((t) => (/^\d+([.,]\d+)?$/.test(t) ? String(parseFloat(t.replace(',', '.'))) : t));
}
// Coppie [parola, radice]: la radice aggancia plurali e femminili, la parola intera distingue i refusi.
function tokens(s) {
  return rawTokens(s).map((t) => [t, stem(t)]);
}
// Distanza di Damerau-Levenshtein (variante OSA): tollera refusi e lettere invertite.
function dist(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
function tokSim([ra, sa], [rb, sb]) {
  if (ra === rb) return 1;
  if (/^\d/.test(ra) || /^\d/.test(rb)) return 0;
  if (sa === sb) return 0.95;
  if (Math.abs(ra.length - rb.length) > ra.length / 3) return 0;
  const s = 1 - dist(ra, rb) / Math.max(ra.length, rb.length);
  return s >= 0.75 ? s : 0;
}
function phraseScore(q, a) {
  if (!q.length || !a.length) return 0;
  const best = (xs, ys) => xs.reduce((acc, x) => acc + Math.max(...ys.map((y) => tokSim(x, y))), 0) / xs.length;
  const covA = best(a, q);
  const covQ = best(q, a);
  return (covA + covQ) / 2;
}

let _matchIndex = null;
function matchIndex() {
  if (_matchIndex) return _matchIndex;
  const idx = [];
  for (const a of allFoods()) {
    const names = new Set([a.nome, ...(a.alias || [])]);
    idx.push({ kind: 'food', item: a, keys: [...names].map(tokens).filter((t) => t.length), raw: new Set([...names].map((n) => rawTokens(n).join(' '))) });
  }
  for (const r of allRecipes()) {
    const names = [r.nome, ...(r.alias || [])];
    idx.push({ kind: 'recipe', item: r, keys: names.map(tokens).filter((t) => t.length), raw: new Set(names.map((n) => rawTokens(n).join(' '))) });
  }
  return (_matchIndex = idx);
}

function findCandidates(query) {
  const q = tokens(query);
  if (!q.length) return [];
  const qRaw = rawTokens(query).join(' ');
  const out = [];
  for (const e of matchIndex()) {
    // Corrispondenza letterale con nome o alias: vince su qualsiasi somiglianza.
    if (e.raw.has(qRaw)) {
      out.push({ ...e, score: 1.01, exact: true });
      continue;
    }
    let s = 0;
    for (const k of e.keys) s = Math.max(s, phraseScore(q, k));
    if (s > 0.3) out.push({ ...e, score: Math.min(s, 1) });
  }
  out.sort((x, y) => y.score - x.score || (x.kind === 'food' ? -1 : 1) || x.item.nome.localeCompare(y.item.nome));
  return out;
}

// Estrae quantità e unità da un segmento di testo.
function extractQty(seg) {
  const toks = norm(seg).split(' ');
  const qty = [];
  const rest = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    let n = null;
    if (/^\d+([.,]\d+)?%$/.test(t) || /^0+$/.test(t)) {
      rest.push(t);
      continue;
    }
    if (/^\d+([.,]\d+)?$/.test(t)) n = parseFloat(t.replace(',', '.'));
    else if (/^\d+\/\d+$/.test(t)) {
      const [a, b] = t.split('/').map(Number);
      n = b ? a / b : null;
    } else if (t in NUM_WORDS && (i + 1 < toks.length)) n = NUM_WORDS[t];
    if (n != null) {
      let unit = null;
      let j = i + 1;
      // "1 e mezzo"
      if (toks[j] === 'e' && (toks[j + 1] === 'mezzo' || toks[j + 1] === 'mezza')) {
        n += 0.5;
        j += 2;
      }
      if (toks[j] && UNIT_WORDS[toks[j]]) {
        unit = UNIT_WORDS[toks[j]];
        j++;
      }
      qty.push({ n, unit });
      i = j - 1;
      continue;
    }
    if (UNIT_WORDS[t] && !['noce', 'filo'].includes(UNIT_WORDS[t]) && qty.length === 0 && /^(di|d|de|del|dello|della|dell|dei|delle)$/.test(toks[i + 1] || '')) {
      // "cucchiaio di olio" senza numero → 1 cucchiaio
      qty.push({ n: 1, unit: UNIT_WORDS[t] });
      continue;
    }
    if (t === 'filo' && toks[i + 1] && /^(d|di|olio)$/.test(toks[i + 1])) {
      qty.push({ n: 1, unit: 'filo' });
      continue;
    }
    rest.push(t);
  }
  return { qty, query: rest.join(' ') };
}

const PLURALI = { cucchiaio: 'cucchiai', cucchiaino: 'cucchiaini', fetta: 'fette', porzione: 'porzioni', pezzo: 'pezzi', vasetto: 'vasetti', scatoletta: 'scatolette', manciata: 'manciate', tazza: 'tazze', bicchiere: 'bicchieri', confezione: 'confezioni', quadratino: 'quadratini', misurino: 'misurini', bustina: 'bustine', pizzico: 'pizzichi', tazzina: 'tazzine', bottiglia: 'bottiglie', lattina: 'lattine', calice: 'calici', bicchierino: 'bicchierini', pinta: 'pinte', pallina: 'palline' };

function unitGrams(food, unit) {
  if (unit === 'porzione') return food.porz;
  if (unit === 'pezzo') return food.unita?.pezzo ?? food.porz;
  return food.unita?.[unit] ?? MISURE_DEFAULT[unit] ?? food.porz;
}

// Incertezza (±) delle quantità non pesate: le misure a cucchiaio sono le più ballerine.
const INC = { pezzo: 0.1, vasetto: 0.05, scatoletta: 0.05, confezione: 0.05, lattina: 0.05, bottiglia: 0.1, misurino: 0.1, bustina: 0.1,
  cucchiaio: 0.4, cucchiaino: 0.4, filo: 0.5, noce: 0.4, pizzico: 0.5, manciata: 0.3, fetta: 0.25, porzione: 0.25 };

// Risolve le grammature per un alimento o ricetta. Ritorna { g, nota, dubbio }.
function resolveGrams(entry, qty) {
  const isRecipe = entry.kind === 'recipe';
  const target = isRecipe ? { porz: recipeInfo(entry.item).porzG, unita: { pezzo: recipeInfo(entry.item).porzG } } : entry.item;
  const pezzo = isRecipe ? target.porz : entry.item.unita?.pezzo;
  const grams = qty.find((q) => ['g', 'kg', 'hg', 'ml', 'cl', 'dl'].includes(q.unit));
  if (grams) {
    const mult = { g: 1, kg: 1000, hg: 100, ml: 1, cl: 10, dl: 100 }[grams.unit];
    return { g: grams.n * mult, nota: '', inc: 0 };
  }
  const q = qty[0];
  if (!q) {
    return { g: pezzo ?? target.porz, nota: pezzo ? '1 pezzo' : 'porzione standard', stimato: true, inc: pezzo ? INC.pezzo : INC.porzione };
  }
  if (q.unit) {
    return { g: q.n * unitGrams(target, q.unit), nota: `${fmt(q.n, q.n % 1 ? 1 : 0)} ${q.n > 1 ? PLURALI[q.unit] || q.unit : q.unit}`, inc: INC[q.unit] ?? INC.porzione };
  }
  // numero senza unità
  if (q.n >= 15 || (!pezzo && q.n >= 5)) return { g: q.n, nota: '', inc: 0 };
  if (pezzo) return { g: q.n * pezzo, nota: `${fmt(q.n, q.n % 1 ? 1 : 0)} × ${fmt(pezzo)} g`, inc: INC.pezzo };
  return { g: q.n * target.porz, nota: `${fmt(q.n, q.n % 1 ? 1 : 0)} porzioni?`, dubbio: true, inc: INC.porzione };
}

// Divide il testo in segmenti: virgole, punto e virgola, a capo, "+".
// " e " / " con " dividono solo se la frase intera non corrisponde già a qualcosa.
function segments(text) {
  const out = [];
  for (const raw of String(text).split(/(?<!\d),|,(?!\d)|[;\n+]+|\s\.\s|\.$/)) {
    const seg = raw.trim();
    if (!seg) continue;
    if (/\s(e|con|ed)\s/i.test(seg)) {
      const whole = findCandidates(extractQty(seg).query)[0];
      if (!whole || whole.score < 0.9) {
        seg.split(/\s(?:e|con|ed)\s/i).map((s) => s.trim()).filter(Boolean).forEach((s) => out.push(s));
        continue;
      }
    }
    out.push(seg);
  }
  return out;
}

function parseInput(text) {
  const rows = [];
  for (const seg of segments(text)) {
    const { qty, query } = extractQty(seg);
    const cands = findCandidates(query);
    const best = cands[0];
    const row = { src: seg, query, qty, cands: cands.slice(0, 5), pick: null, g: null, nota: '', stato: 'ok' };
    if (!best || best.score < 0.5) {
      row.stato = 'miss';
      row.cands = cands.filter((c) => c.score >= 0.35).slice(0, 4);
    } else {
      const second = cands.find((c) => c.item.id !== best.item.id);
      const confident = best.exact
        ? !second || !second.exact
        : (best.score >= 0.8 && (!second || best.score - second.score >= 0.08)) || (best.score >= 0.7 && (!second || second.score < best.score - 0.3));
      if (confident) {
        row.pick = best;
      } else {
        row.stato = 'amb';
        row.cands = cands.filter((c) => c.score >= best.score - 0.25).slice(0, 4);
      }
    }
    if (row.pick) {
      const res = resolveGrams(row.pick, qty);
      row.g = r0(res.g);
      row.inc = res.inc;
      row.nota = res.nota;
      if (res.dubbio) row.stato = 'amb-qty';
    }
    rows.push(row);
  }
  return rows;
}

function rowToVoci(row) {
  const e = row.pick;
  if (!e || !row.g) return [];
  if (e.kind === 'recipe') {
    const r = e.item;
    const f = row.g / recipeInfo(r).pesoTot;
    return r.ingredienti.map((ing) => {
      const a = foodById(ing.fid);
      if (!a) return null;
      const v = makeVoce(a, ing.g * f);
      v.from = r.nome;
      if (row.inc) v.inc = row.inc;
      return v;
    }).filter(Boolean);
  }
  const v = makeVoce(e.item, row.g);
  if (row.inc) v.inc = row.inc;
  return [v];
}

/* ================================================================
   SUGGERIMENTI DETERMINISTICI
   ================================================================ */

function remaining(k) {
  const st = S.settings;
  const t = dayTotals(k);
  return {
    t,
    kcalMin: st.kcalMin - t.kcal,
    kcalMax: st.kcalMax - t.kcal,
    pMin: st.protMin - t.p,
    cn: st.carboMax - t.cn,
  };
}

// Le ultime 7 date che finiscono in endKey (incluso).
function last7(endKey) {
  return [...Array(7)].map((_, i) => addDays(endKey, i - 6));
}

// Regole settimanali sugli ultimi 7 giorni. "@colazione" conta i giorni con colazione registrata,
// gli altri tag contano i pasti che contengono almeno un alimento con quel tag.
function ruleCount(days, tag) {
  let n = 0;
  for (const k of days) {
    const d = S.giorni[k];
    if (!d) continue;
    if (tag === '@colazione') {
      if ((d.pasti.colazione || []).length) n++;
      continue;
    }
    for (const p of PASTI) if ((d.pasti[p.id] || []).some((v) => (v.tag || []).includes(tag))) n++;
  }
  return n;
}
function ruleStatus(endKey) {
  const days = last7(endKey);
  return S.settings.regole.map((r) => {
    const count = ruleCount(days, r.tag);
    const ok = r.tipo === 'min' ? count >= r.n : count <= r.n;
    return { ...r, count, ok };
  });
}
const RULE_LABELS = { '@colazione': 'Colazione registrata', pesce: 'Pesce', 'pesce-azzurro': 'Pesce azzurro', legume: 'Legumi', 'carne-rossa': 'Carne rossa', 'carne-bianca': 'Carne bianca', processato: 'Processati', latticino: 'Latticini', verdura: 'Verdura', 'frutta-secca': 'Frutta secca', cereale: 'Cereali', grasso: 'Grassi' };
const ruleLabel = (tag) => RULE_LABELS[tag] || tagLabel(tag);
function ruleText(r) {
  if (r.tag === '@colazione') return `fatto ${r.count} su ${r.n} giorni`;
  return r.tipo === 'min' ? `fatto ${r.count} su ${r.n}` : `fatto ${r.count}, massimo ${r.n}`;
}

// Scarto della media dal target: negativo = sotto, positivo = sopra, 0 = dentro.
function scarto(avg, min, max) {
  if (avg == null) return 0;
  if (min != null && avg < min) return avg - min;
  if (max != null && avg > max) return avg - max;
  return 0;
}

// Statistiche degli ultimi 7 giorni (solo giorni con dati). Con includeToday=false oggi conta
// solo quando la giornata è piena, per non abbassare le medie la mattina.
function weekStats(endKey, includeToday = true) {
  const st = S.settings;
  const days = last7(endKey).filter((k) => dayHasData(k) && (includeToday || k !== todayKey() || dayTotals(k).kcal >= st.kcalSoglia));
  const tots = days.map(dayTotals);
  const n = days.length;
  const avg = (key) => (n ? tots.reduce((a, t) => a + t[key], 0) / n : null);
  const a = { kcal: avg('kcal'), p: avg('p'), cn: avg('cn'), f: avg('f'), na: avg('na') };
  const deficit = tots.reduce((s, t) => s + (st.fabbisogno - t.kcal), 0);
  const ma = weightMA(endKey), maPrev = weightMA(addDays(endKey, -7));
  return {
    days, tots, n, avg: a,
    voto: n ? tots.reduce((s, t) => s + voto(t).v, 0) / n : null,
    scarti: {
      kcal: scarto(a.kcal, st.kcalMin, st.kcalMax),
      p: scarto(a.p, st.protMin, null),
      cn: scarto(a.cn, null, st.carboMax),
      f: scarto(a.f, st.fibraMin, st.fibraMax),
    },
    deficit,
    grasso: deficit / 7700,
    sotto: tots.filter((t) => t.kcal < st.kcalSoglia).length,
    ma, maPrev, maDelta: ma != null && maPrev != null ? ma - maPrev : null,
  };
}

/* ——— Ricette: porzione, tag calcolati ——— */

const RICETTA_SOGLIE = { proteico: 35, fibraAlta: 8, sodioBasso: 300, veloce: 15 };
const RECIPE_TAGS = ['proteico', 'fibra-alta', 'sodio-basso', 'pesce-azzurro', 'legumi', 'veloce', 'batch', 'senza-cottura'];

function recipePortion(r) {
  const info = recipeInfo(r);
  return nutrPer(info.per, info.porzG);
}
function recipeTags(r) {
  const n = recipePortion(r);
  const tags = new Set(r.tag || []);
  if (n.p > RICETTA_SOGLIE.proteico) tags.add('proteico');
  if (n.f >= RICETTA_SOGLIE.fibraAlta) tags.add('fibra-alta');
  if (n.na <= RICETTA_SOGLIE.sodioBasso) tags.add('sodio-basso');
  if (r.tempo && r.tempo < RICETTA_SOGLIE.veloce) tags.add('veloce');
  for (const ing of r.ingredienti) {
    const a = foodById(ing.fid);
    if (!a) continue;
    if (a.tag.includes('pesce-azzurro')) tags.add('pesce-azzurro');
    if (a.tag.includes('legume')) tags.add('legumi');
  }
  return RECIPE_TAGS.filter((t) => tags.has(t));
}
// Una ricetta "contiene" un tag alimento se almeno un ingrediente lo ha.
function recipeHasFoodTag(r, tag) {
  return r.ingredienti.some((ing) => (foodById(ing.fid)?.tag || []).includes(tag));
}

// "Cosa mangio stasera": filtro sulle ricette che stanno nel residuo di kcal,
// ordinate per quanto colmano il gap proteico.
function stasera(k) {
  const rem = remaining(k);
  const gap = Math.max(0, rem.pMin);
  const list = allRecipes()
    .map((r) => ({ r, n: recipePortion(r) }))
    .filter((x) => x.n.kcal <= rem.kcalMax)
    .sort((a, b) => {
      if (gap > 0) {
        const ca = Math.min(a.n.p, gap), cb = Math.min(b.n.p, gap);
        if (Math.abs(ca - cb) > 0.5) return cb - ca;
      }
      return a.n.kcal - b.n.kcal || a.r.nome.localeCompare(b.r.nome);
    });
  return { rem, gap, list };
}

// Suggerimento proattivo: un solo gap, nell'ordine di priorità della specifica, con 2-3 ricette.
function dailyTip(k) {
  const st = S.settings;
  const ws = weekStats(k, false);
  const rem = remaining(k);
  const fits = (x) => rem.kcalMax < 300 || x.n.kcal <= rem.kcalMax;
  const pool = allRecipes().map((r) => ({ r, n: recipePortion(r), tags: recipeTags(r) }));
  const pick = (filter, sort) => pool.filter((x) => filter(x) && fits(x)).sort(sort).slice(0, 3).map((x) => x.r);
  const byP = (a, b) => b.n.p - a.n.p;

  if (!ws.n && !dayHasData(k)) {
    return { text: 'Nessun giorno registrato. Scrivi cosa hai mangiato, anche tutto insieme: «pollo 300, 3 uova, cicoria 200».', recipes: [] };
  }
  // 1. proteine sotto il 90% del target
  if (ws.n && ws.avg.p < st.protMin * 0.9) {
    return {
      text: `Proteine: media ${fmt(ws.avg.p)} g negli ultimi ${ws.n} giorni, ${fmt(st.protMin - ws.avg.p)} g al giorno sotto il minimo.`,
      recipes: pick((x) => x.tags.includes('proteico'), byP),
    };
  }
  // 2. regola settimanale non rispettata (quella con lo scarto relativo più grande)
  const broken = ruleStatus(k).filter((r) => !r.ok)
    .map((r) => ({ ...r, gap: r.tipo === 'min' ? (r.n - r.count) / Math.max(r.n, 1) : (r.count - r.n) / Math.max(r.n, 1) }))
    .sort((a, b) => b.gap - a.gap);
  if (broken.length) {
    const r = broken[0];
    if (r.tag === '@colazione') {
      return { text: `Colazione registrata ${r.count} giorni su 7, l'obiettivo è ${r.n}.`, recipes: pick((x) => x.tags.includes('veloce'), byP) };
    }
    if (r.tipo === 'min') {
      return {
        text: `${ruleLabel(r.tag)}: ${r.count} volte negli ultimi 7 giorni, l'obiettivo è almeno ${r.n}.`,
        recipes: pick((x) => recipeHasFoodTag(x.r, r.tag), byP),
      };
    }
    return {
      text: `${ruleLabel(r.tag)}: ${r.count} volte negli ultimi 7 giorni, il massimo è ${r.n}. Nei prossimi pasti niente.`,
      recipes: pick((x) => !recipeHasFoodTag(x.r, r.tag) && x.tags.includes('proteico'), byP),
    };
  }
  // 3. fibra media sotto la soglia bassa
  if (ws.n && ws.avg.f < st.fibraBassa) {
    return {
      text: `Fibra: media ${fmt(ws.avg.f)} g negli ultimi ${ws.n} giorni, sotto i ${fmt(st.fibraBassa)} g.`,
      recipes: pick((x) => x.tags.includes('fibra-alta'), (a, b) => b.n.f - a.n.f),
    };
  }
  // 4. tre o più giorni sotto la soglia kcal
  if (ws.sotto >= 3) {
    return {
      text: `${ws.sotto} giorni su ${ws.n} sotto ${fmt(st.kcalSoglia)} kcal: mangiare troppo poco è un errore.`,
      recipes: pick((x) => x.tags.includes('batch'), (a, b) => b.n.kcal - a.n.kcal),
    };
  }
  return { text: `Nessun gap negli ultimi ${ws.n || 1} giorni: voto medio ${fmt(ws.voto ?? voto(dayTotals(k)).v, 1)}.`, recipes: [] };
}

function nutr(a, g) {
  return nutrPer(a, g);
}
function nutrPer(per, g) {
  const k = g / 100;
  return { kcal: per.kcal * k, p: per.p * k, cn: per.cn * k, f: per.f * k, na: per.na * k };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const tagLabel = (t) => cap(t.replace(/-/g, ' '));

/* ================================================================
   EXPORT TESTUALE (per analisi esterna)
   ================================================================ */

function vociLine(voci) {
  return voci.map((v) => `${v.nome} ${v.inc ? '~' : ''}${fmt(v.g)} g`).join(', ');
}
function targetLine() {
  const st = S.settings;
  return `Target: ${fmt(st.kcalMin)}–${fmt(st.kcalMax)} kcal · proteine ${st.protMin}–${st.protMax} g · carbo netti max ${st.carboMax} g · fibra ${st.fibraMin}–${st.fibraMax} g`;
}
function pesoLine(k) {
  const w = S.pesi[k], ma = weightMA(k), prev = weightMA(addDays(k, -7));
  if (ma == null) return null;
  const delta = prev != null ? ` (${ma - prev <= 0 ? '−' : '+'}${fmt(Math.abs(ma - prev), 1)} kg rispetto a 7 giorni prima)` : '';
  return `Peso: ${w != null ? `${fmt(w, 1)} kg · ` : ''}media 7 gg ${fmt(ma, 1)} kg${delta}`;
}

// "Copia giornata": riassunto compatto da incollare in una chat esterna.
function exportDay(k) {
  const d = S.giorni[k];
  const t = dayTotals(k);
  const L = [`CRUMB · ${labelDay(k, false)} ${parseKey(k).getFullYear()}`];
  for (const p of PASTI) {
    const voci = d?.pasti[p.id] || [];
    if (voci.length) L.push(`${p.nome}: ${vociLine(voci)}`);
  }
  if (dayHasData(k)) {
    const kr = kcalRange(dayVoci(d));
    const vv = voto(t);
    L.push(`Totale: ${fmt(t.kcal)} kcal${kr.unc ? ` (stima ${fmtRange(kr)})` : ''} · P ${fmt(t.p)} g · C netti ${fmt(t.cn)} g · fibra ${fmt(t.f)} g · sodio ${fmt(t.na)} mg`);
    L.push(`Voto: ${vv.v}/10${vv.pen.length ? ` (${vv.pen.map(([x, n]) => `${x.toLowerCase()} −${n}`).join('; ')})` : ''}`);
  } else L.push('Nessun alimento registrato.');
  const pl = pesoLine(k);
  if (pl) L.push(pl);
  L.push(targetLine());
  return L.join('\n');
}

// "Copia settimana": ultimi 7 giorni fino a endKey.
function exportWeek(endKey) {
  const st = S.settings;
  const ws = weekStats(endKey, false);
  const days = last7(endKey);
  const L = [`CRUMB · 7 giorni dal ${labelDay(days[0], false)} al ${labelDay(endKey, false)} ${parseKey(endKey).getFullYear()}`];
  for (const k of days) {
    const w = S.pesi[k];
    if (!dayHasData(k)) {
      if (w != null) L.push(`${labelDay(k, false)} · nessun pasto · peso ${fmt(w, 1)} kg`);
      continue;
    }
    const t = dayTotals(k);
    L.push(`${labelDay(k, false)} · ${fmt(t.kcal)} kcal · P ${fmt(t.p)} · C ${fmt(t.cn)} · F ${fmt(t.f)} · voto ${voto(t).v}${w != null ? ` · peso ${fmt(w, 1)}` : ''}`);
    L.push(`  ${vociLine(dayVoci(S.giorni[k]))}`);
  }
  if (ws.n) {
    L.push(`Medie (${ws.n} giorni${ws.days.includes(endKey) || !dayHasData(endKey) ? '' : ', oggi escluso perché incompleto'}): ${fmt(ws.avg.kcal)} kcal (${fmtScarto(ws.scarti.kcal, 'kcal')}) · P ${fmt(ws.avg.p)} g (${fmtScarto(ws.scarti.p, 'g')}) · C netti ${fmt(ws.avg.cn)} g (${fmtScarto(ws.scarti.cn, 'g')}) · fibra ${fmt(ws.avg.f)} g (${fmtScarto(ws.scarti.f, 'g')})`);
    L.push(`${ws.deficit >= 0 ? 'Deficit' : 'Surplus'} cumulativo: ${fmt(Math.abs(ws.deficit))} kcal su fabbisogno ${fmt(st.fabbisogno)} · grasso stimato ${ws.deficit >= 0 ? '−' : '+'}${fmt(Math.abs(ws.grasso), 2)} kg`);
    L.push(`Giorni sotto ${fmt(st.kcalSoglia)} kcal: ${ws.sotto}`);
  }
  L.push(`Regole: ${ruleStatus(endKey).map((r) => `${ruleLabel(r.tag).toLowerCase()} ${ruleText(r)} ${r.ok ? '✓' : '✗'}`).join('; ')}`);
  if (ws.maDelta != null) L.push(`Media mobile peso: ${fmt(ws.ma, 1)} kg (${ws.maDelta <= 0 ? '−' : '+'}${fmt(Math.abs(ws.maDelta), 1)} kg sulla settimana precedente)`);
  L.push(targetLine());
  return L.join('\n');
}
const fmtScarto = (x, unit) => (Math.abs(x) < 0.5 ? 'in target' : `${x < 0 ? '−' : '+'}${fmt(Math.abs(x))} ${unit}/giorno`);

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiato negli appunti');
    return;
  } catch (e) { /* fallback sotto */ }
  openSheet(`<h2>Copia il testo</h2><p class="muted small">Seleziona tutto e copia.</p><textarea class="inp" rows="14" readonly>${esc(text)}</textarea>
    <div class="sheet-actions"><button class="btn" data-close>Chiudi</button></div>`, (el) => {
    const ta = $('textarea', el);
    ta.focus();
    ta.select();
  });
}

/* ================================================================
   UI: SHEET, TOAST, NAVIGAZIONE
   ================================================================ */

const ui = { tab: 'oggi', day: todayKey(), weekEnd: todayKey(), pasto: defaultPasto(), pesoRange: 30, quick: 'recenti', recipeTag: '' };

function defaultPasto() {
  const h = new Date().getHours();
  if (h < 11) return 'colazione';
  if (h < 15) return 'pranzo';
  if (h < 18) return 'spuntini';
  return 'cena';
}

let sheetOnClose = null;
function openSheet(html, onMount, onClose) {
  const bd = $('#backdrop');
  const sh = $('#sheet');
  sh.innerHTML = '<div class="grip"></div>' + html;
  sh.scrollTop = 0;
  bd.classList.add('open');
  sheetOnClose = onClose || null;
  $$('[data-close]', sh).forEach((b) => b.addEventListener('click', closeSheet));
  if (onMount) onMount(sh);
}
function closeSheet() {
  $('#backdrop').classList.remove('open');
  if (document.activeElement) document.activeElement.blur();
  const cb = sheetOnClose;
  sheetOnClose = null;
  if (cb) cb();
}
$('#backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'backdrop') closeSheet();
});

let toastTimer = null;
function toast(msg, action, fn) {
  const el = $('#toast');
  $('#toastMsg').textContent = msg;
  const b = $('#toastBtn');
  b.textContent = action || '';
  b.classList.toggle('hide', !action);
  b.onclick = () => {
    el.classList.remove('show');
    if (fn) fn();
  };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2200);
}

// Undo: fotografa un giorno prima di modificarlo.
function snapshotDay(k) {
  const prev = S.giorni[k] ? structuredClone(S.giorni[k]) : null;
  const prevRecent = structuredClone(S.recenti);
  return () => {
    if (prev) S.giorni[k] = prev;
    else delete S.giorni[k];
    S.recenti = prevRecent;
    save();
    render();
  };
}

function setTab(t) {
  ui.tab = t;
  $$('.tabs button').forEach((b) => (b.dataset.tab === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  window.scrollTo(0, 0);
  render();
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('#fab').addEventListener('click', () => openAddSheet());
$('#prevDay').addEventListener('click', () => shiftNav(-1));
$('#nextDay').addEventListener('click', () => shiftNav(1));

function shiftNav(dir) {
  if (ui.tab === 'oggi') {
    const n = addDays(ui.day, dir);
    if (n > todayKey()) return;
    ui.day = n;
  } else if (ui.tab === 'settimana') {
    const n = addDays(ui.weekEnd, dir * 7);
    ui.weekEnd = n > todayKey() ? todayKey() : n;
  }
  render();
}

function header(title, sub, nav) {
  $('#title').innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  $('#prevDay').classList.toggle('hide', !nav);
  $('#nextDay').classList.toggle('hide', !nav);
  if (nav) $('#nextDay').disabled = nav === 'last';
}

function render() {
  const main = $('#app');
  $('#fab').hidden = ui.tab !== 'oggi';
  if (ui.tab === 'oggi') main.innerHTML = viewOggi();
  else if (ui.tab === 'peso') main.innerHTML = viewPeso();
  else if (ui.tab === 'settimana') main.innerHTML = viewSettimana();
  else if (ui.tab === 'storico') main.innerHTML = viewStorico();
  else main.innerHTML = viewImpostazioni();
  bindView(main);
}

/* ================================================================
   VISTA: OGGI
   ================================================================ */

function barHtml(label, val, min, max, unit, kind, extra = '') {
  // kind: 'range' (kcal/fibra: min–max), 'min' (proteine: almeno), 'cap' (carbo: tetto)
  const scale = (kind === 'cap' ? max : max) * 1.15;
  const pct = clamp((val / scale) * 100, 0, 100);
  let cls = '';
  let foot = '';
  if (kind === 'cap') {
    const left = max - val;
    cls = val > max ? 'bad' : val > max * 0.8 ? 'warn' : 'good';
    foot = left >= 0 ? `ti restano ${fmt(left)} ${unit}` : `oltre il tetto di ${fmt(-left)} ${unit}`;
  } else {
    const leftMin = min - val;
    const leftMax = max - val;
    if (val > max) {
      cls = kind === 'range' ? 'warn' : 'good';
      foot = `oltre il massimo di ${fmt(-leftMax)} ${unit}`;
    } else if (val >= min) {
      cls = 'good';
      foot = `in target · ti restano ${fmt(leftMax)} ${unit} al massimo`;
    } else {
      cls = val >= min * 0.9 ? 'warn' : '';
      foot = `ti restano ${fmt(leftMin)} ${unit} (${fmt(leftMax)} al massimo)`;
    }
  }
  const tickMin = kind !== 'cap' ? `<div class="tick" style="left:${(min / scale) * 100}%"></div>` : '';
  const tickMax = `<div class="tick" style="left:${(max / scale) * 100}%"></div>`;
  const tgt = kind === 'cap' ? `max ${fmt(max)}` : `${fmt(min)}–${fmt(max)}`;
  return `<div>
    <div class="bar-head"><b>${label}</b><span class="val num">${fmt(val)} <span>/ ${tgt} ${unit}</span></span></div>
    <div class="track"><div class="fill ${cls}" style="width:${pct}%"></div>${tickMin}${tickMax}</div>
    <div class="bar-foot ${cls === 'bad' ? 'bad' : ''}">${extra ? `${extra} · ` : ''}${foot}</div>
  </div>`;
}

function viewOggi() {
  const k = ui.day;
  const st = S.settings;
  const d = getDay(k);
  const t = dayTotals(k);
  const has = dayHasData(k);
  header(labelDay(k), labelDay(k) === 'Oggi' || labelDay(k) === 'Ieri' ? labelDay(k, false) : '', k === todayKey() ? 'last' : true);

  let h = '';
  if (t.na > st.sodioMax) {
    h += `<div class="alert bad"><div><b>Sodio a ${fmt(t.na)} mg (soglia ${fmt(st.sodioMax)})</b>Domani la bilancia segnerà acqua, non grasso.</div></div>`;
  }
  const fc = fiberConcentration(k);
  if (fc) {
    h += `<div class="alert warn"><div><b>${esc(fc.nome)}: ${fmt(fc.f)} dei ${fmt(fc.tot)} g di fibra di oggi (${fmt((fc.f / fc.tot) * 100)}%)</b>Tanta fibra da un solo alimento è la causa tipica di gonfiore.</div></div>`;
  }
  const kr = kcalRange(dayVoci(d));
  h += `<section class="card"><div class="bars">
    ${barHtml('Calorie', t.kcal, st.kcalMin, st.kcalMax, 'kcal', 'range', kr.unc ? `stima ${fmtRange(kr)} kcal` : '')}
    ${barHtml('Proteine', t.p, st.protMin, st.protMax, 'g', 'min')}
    ${barHtml('Carbo netti', t.cn, 0, st.carboMax, 'g', 'cap')}
    ${barHtml('Fibra', t.f, st.fibraMin, st.fibraMax, 'g', 'range')}
  </div></section>`;

  if (has) {
    const vv = voto(t);
    h += `<section class="card"><div class="score"><div class="voto ${votoClass(vv.v)} num">${vv.v}</div><div>
      <b>${k === todayKey() ? 'Voto provvisorio' : 'Voto del giorno'}</b>
      ${vv.pen.length ? `<ul class="pen">${vv.pen.map(([txt, n]) => `<li>${esc(txt)} (−${n})</li>`).join('')}${vv.tetto ? `<li>Tetto a ${st.votoTetto}: mangiare troppo poco è un errore</li>` : ''}</ul>` : '<div class="small muted">Nessuna penalità</div>'}
      <div class="small muted num">Sodio ${fmt(t.na)} mg</div>
    </div></div></section>`;
  }

  const tip = dailyTip(k);
  h += `<section class="card"><div class="suggest"><div class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/></svg></div><p>${esc(tip.text)}</p></div>
    ${tip.recipes.length ? `<div class="tip-recipes">${tip.recipes.map((r) => `<button class="chip" data-open-recipe="${esc(r.id)}">${esc(r.nome)} · P ${fmt(recipePortion(r).p)}</button>`).join('')}</div>` : ''}
    <button class="btn primary block" style="margin-top:14px" data-act="stasera">Cosa mangio stasera</button></section>`;

  for (const p of PASTI) {
    const voci = d?.pasti[p.id] || [];
    const tp = sumN(voci.map(voceNutr));
    const mr = kcalRange(voci);
    h += `<section class="card meal"><div class="meal-head"><h3>${p.nome}</h3>${voci.length ? `<div class="tot num">${mr.unc ? fmtRange(mr) : fmt(tp.kcal)} kcal · P ${fmt(tp.p)} · C ${fmt(tp.cn)} · F ${fmt(tp.f)}</div>` : ''}</div>`;
    const fk = voci.reduce((a, v) => a + fatCheeseKcal(v), 0);
    if (tp.kcal > 0 && fk > tp.kcal * 0.2) {
      h += `<div class="meal-note num">Olio e formaggi: ${fmt(fk)} kcal, il ${fmt((fk / tp.kcal) * 100)}% del pasto. Sono le voci più incerte: pesale.</div>`;
    }
    if (!voci.length) {
      h += `<button class="item" data-act="add-to" data-pasto="${p.id}"><span class="nm muted">+ Aggiungi a ${p.nome.toLowerCase()}</span></button>`;
    } else {
      for (const v of voci) {
        const n = voceNutr(v);
        const vr = kcalRange([v]);
        h += `<button class="item" data-act="edit-voce" data-pasto="${p.id}" data-id="${v.id}">
          <span class="nm"><b>${esc(v.nome)}</b><small class="num">${v.from ? `${esc(v.from)} · ` : ''}${v.inc ? '~' : ''}${fmt(v.g)} g · P ${fmt(n.p)} · C ${fmt(n.cn, n.cn < 10 && n.cn % 1 ? 1 : 0)} · F ${fmt(n.f)}</small></span>
          <span class="kc num">${vr.unc ? fmtRange(vr) : fmt(n.kcal)}</span></button>`;
      }
      h += `<div class="meal-foot"><button class="linkbtn" data-act="add-to" data-pasto="${p.id}">+ Aggiungi</button><span class="spacer"></span><button class="linkbtn" data-act="save-preset" data-pasto="${p.id}">Salva come preset</button></div>`;
    }
    h += '</section>';
  }
  h += `<button class="btn ghost block" data-act="export-day">Copia giornata</button>`;
  return h;
}

/* ——— Sheet di inserimento ——— */

function openAddSheet(pasto) {
  if (pasto) ui.pasto = pasto;
  const quick = quickHtml();
  openSheet(`
    <h2>Aggiungi — ${esc(labelDay(ui.day))}</h2>
    <div class="seg" id="pastoSeg">${PASTI.map((p) => `<button data-p="${p.id}" aria-pressed="${p.id === ui.pasto}">${p.nome}</button>`).join('')}</div>
    <textarea class="inp" id="freeText" rows="3" placeholder="pollo 300, 3 uova, cicoria 200, olio 1 cucchiaio" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"></textarea>
    <button class="btn primary block" id="parseBtn" style="margin-top:10px">Aggiungi</button>
    <div style="margin-top:18px">
      <div class="seg" id="quickSeg">
        <button data-q="recenti" aria-pressed="${ui.quick === 'recenti'}">Recenti</button>
        <button data-q="ricette" aria-pressed="${ui.quick === 'ricette'}">Ricette</button>
        <button data-q="preset" aria-pressed="${ui.quick === 'preset'}">Pasti salvati</button>
      </div>
      <div id="quickBox">${quick}</div>
    </div>
  `, (el) => {
    const ta = $('#freeText', el);
    setTimeout(() => ta.focus(), 60);
    $$('#pastoSeg button', el).forEach((b) => b.addEventListener('click', () => {
      ui.pasto = b.dataset.p;
      $$('#pastoSeg button', el).forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
    $$('#quickSeg button', el).forEach((b) => b.addEventListener('click', () => {
      ui.quick = b.dataset.q;
      $$('#quickSeg button', el).forEach((x) => x.setAttribute('aria-pressed', x === b));
      $('#quickBox', el).innerHTML = quickHtml();
    }));
    $('#parseBtn', el).addEventListener('click', () => handleFreeText(ta.value));
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleFreeText(ta.value);
      }
    });
    $('#quickBox', el).addEventListener('click', onQuickClick);
  });
}

function quickHtml() {
  if (ui.quick === 'recenti') {
    const rec = S.recenti.map((r) => ({ ...r, a: foodById(r.fid) })).filter((r) => r.a);
    if (!rec.length) return '<p class="muted small">Qui compariranno gli ultimi 10 alimenti usati.</p>';
    return `<div class="chips">${rec.map((r) => `<button class="chip" data-quick="food" data-id="${esc(r.fid)}" data-g="${r.g}">${esc(r.a.nome)} · ${fmt(r.g)} g</button>`).join('')}</div>`;
  }
  if (ui.quick === 'ricette') {
    const rs = allRecipes().filter((r) => !ui.recipeTag || recipeTags(r).includes(ui.recipeTag));
    const filt = `<div class="chips tagfilter">${['', ...RECIPE_TAGS].map((t) => `<button class="chip sm" data-rtag="${t}" aria-pressed="${ui.recipeTag === t}">${t || 'tutte'}</button>`).join('')}</div>`;
    if (!rs.length) return filt + '<p class="muted small">Nessuna ricetta con questo tag.</p>';
    return filt + `<div class="list">${rs.map((r) => `<button class="li" data-quick="recipe" data-id="${esc(r.id)}"><span class="nm">${esc(r.nome)}<small class="num">${recipeMeta(r)}</small></span><span class="muted">›</span></button>`).join('')}</div>`;
  }
  if (!S.preset.length) return '<p class="muted small">Nessun pasto salvato. Da un pasto di Oggi tocca "Salva come preset".</p>';
  return `<div class="chips">${S.preset.map((p) => `<button class="chip" data-quick="preset" data-id="${esc(p.id)}">${esc(p.nome)} · ${fmt(sumN(p.voci.map(voceNutr)).kcal)} kcal</button>`).join('')}</div>`;
}

function onQuickClick(e) {
  const tf = e.target.closest('[data-rtag]');
  if (tf) {
    ui.recipeTag = tf.dataset.rtag;
    e.currentTarget.innerHTML = quickHtml();
    return;
  }
  const b = e.target.closest('[data-quick]');
  if (!b) return;
  const kind = b.dataset.quick;
  if (kind === 'food') {
    const a = foodById(b.dataset.id);
    const rec = S.recenti.find((x) => x.fid === a.id);
    openQtySheet({ title: a.nome, g: num(b.dataset.g) || a.porz, food: a, inc: rec ? rec.inc || 0 : INC.porzione });
  } else if (kind === 'recipe') {
    openRecipeSheet(recipeById(b.dataset.id), null, () => openAddSheet());
  } else if (kind === 'preset') {
    const p = S.preset.find((x) => x.id === b.dataset.id);
    const undo = snapshotDay(ui.day);
    const d = getDay(ui.day, true);
    for (const v of p.voci) d.pasti[ui.pasto].push({ ...structuredClone(v), id: uid('v') });
    save();
    closeSheet();
    render();
    toast(`${p.nome} aggiunto a ${pastoNome(ui.pasto)}`, 'Annulla', undo);
  }
}
const pastoNome = (id) => PASTI.find((p) => p.id === id).nome.toLowerCase();

function openQtySheet({ title, g, food, recipe, porzG, inc = 0 }) {
  openSheet(`<h2>${esc(title)}</h2>
    <div class="seg" id="pastoSeg2">${PASTI.map((p) => `<button data-p="${p.id}" aria-pressed="${p.id === ui.pasto}">${p.nome}</button>`).join('')}</div>
    <label class="f"><span>Grammi</span><input class="inp num" id="qg" inputmode="decimal" value="${r0(g)}"></label>
    ${recipe ? `<div class="chips">${[0.5, 1, 1.5, 2].map((x) => `<button class="chip" data-porz="${x}">${fmt(x, x % 1 ? 1 : 0)} porz. · ${fmt(porzG * x)} g</button>`).join('')}</div>` : ''}
    ${food && food.unita?.pezzo ? `<div class="chips">${[1, 2, 3, 4].map((x) => `<button class="chip" data-pz="${x}">${x} pz · ${fmt(food.unita.pezzo * x)} g</button>`).join('')}</div>` : ''}
    <p class="small muted num" id="qprev"></p>
    <div class="sheet-actions"><button class="btn" data-close>Annulla</button><button class="btn primary" id="qok">Aggiungi</button></div>`, (el) => {
    const inp = $('#qg', el);
    const per = food ? perOf(food) : recipeInfo(recipe).per;
    const upd = () => {
      const n = nutrPer(per, num(inp.value) || 0);
      $('#qprev', el).textContent = `${fmt(n.kcal)} kcal · P ${fmt(n.p)} g · C netti ${fmt(n.cn, 1)} g · fibra ${fmt(n.f, 1)} g`;
    };
    upd();
    inp.addEventListener('input', () => { inc = 0; upd(); });
    $$('#pastoSeg2 button', el).forEach((b) => b.addEventListener('click', () => {
      ui.pasto = b.dataset.p;
      $$('#pastoSeg2 button', el).forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
    $$('[data-porz]', el).forEach((b) => b.addEventListener('click', () => { inp.value = r0(porzG * num(b.dataset.porz)); inc = INC.porzione; upd(); }));
    $$('[data-pz]', el).forEach((b) => b.addEventListener('click', () => { inp.value = r0(food.unita.pezzo * num(b.dataset.pz)); inc = INC.pezzo; upd(); }));
    $('#qok', el).addEventListener('click', () => {
      const grams = num(inp.value);
      if (!grams || grams <= 0) return;
      const undo = snapshotDay(ui.day);
      const v = food ? makeVoce(food, grams) : makeVoceRicetta(recipe, grams);
      if (inc) v.inc = inc;
      getDay(ui.day, true).pasti[ui.pasto].push(v);
      if (food) pushRecent(food.id, grams, inc);
      save();
      closeSheet();
      render();
      toast(`${v.nome} aggiunto`, 'Annulla', undo);
    });
  });
}

function handleFreeText(text) {
  if (!text.trim()) return;
  const rows = parseInput(text);
  if (!rows.length) return;
  const allOk = rows.every((r) => r.stato === 'ok');
  if (allOk) {
    commitRows(rows);
    return;
  }
  openConfirmSheet(rows);
}

function commitRows(rows) {
  const undo = snapshotDay(ui.day);
  const d = getDay(ui.day, true);
  let n = 0;
  for (const row of rows) {
    const voci = rowToVoci(row);
    for (const v of voci) d.pasti[ui.pasto].push(v);
    if (voci.length === 1) pushRecent(voci[0].fid, voci[0].g, voci[0].inc);
    n += voci.length;
  }
  cleanupDay(ui.day);
  save();
  closeSheet();
  render();
  if (n) toast(`${n} ${n === 1 ? 'voce aggiunta' : 'voci aggiunte'} a ${pastoNome(ui.pasto)}`, 'Annulla', undo);
}

function openConfirmSheet(rows) {
  const draw = () => rows.map((r, i) => {
    const cls = r.stato === 'miss' && !r.pick ? 'miss' : r.stato !== 'ok' ? 'amb' : '';
    let body = '';
    if (r.pick) {
      const per = r.pick.kind === 'recipe' ? recipeInfo(r.pick.item).per : perOf(r.pick.item);
      const n = nutrPer(per, r.g || 0);
      body += `<div class="row"><div style="flex:1;min-width:0"><b>${esc(r.pick.item.nome)}</b>${r.pick.kind === 'recipe' ? ' <span class="badge">ricetta</span>' : ''}
        <div class="small muted num">${fmt(n.kcal)} kcal · P ${fmt(n.p)} g${r.nota ? ` · ${esc(r.nota)}` : ''}</div></div>
        <input class="inp g num" data-g="${i}" inputmode="decimal" value="${r.g ?? ''}" aria-label="grammi"><span class="small muted">g</span></div>`;
    } else {
      body += `<div class="small" style="color:var(--${r.stato === 'miss' ? 'bad' : 'warn'})">${r.stato === 'miss' ? 'Non riconosciuto' : 'Quale intendi?'}</div>`;
    }
    if (r.stato === 'amb-qty') body += `<div class="small" style="color:var(--warn);margin-top:6px">Quantità interpretata come porzioni: controlla i grammi.</div>`;
    if ((r.stato === 'amb' || r.stato === 'miss') && r.cands.length) {
      body += `<div class="chips">${r.cands.map((c, j) => `<button class="chip" data-row="${i}" data-cand="${j}" aria-pressed="${r.pick && r.pick.item.id === c.item.id}">${esc(c.item.nome)}</button>`).join('')}</div>`;
    }
    body += `<div class="row" style="margin-top:6px"><button class="linkbtn small" data-search="${i}">Cerca…</button>${r.stato === 'miss' ? `<button class="linkbtn small" data-create="${i}">Crea alimento</button>` : ''}<span class="spacer"></span><button class="linkbtn small" data-drop="${i}" style="color:var(--muted)">Ignora</button></div>`;
    return `<div class="parse-row ${cls}"><div class="src">«${esc(r.src)}»</div>${body}</div>`;
  }).join('');

  openSheet(`<h2>Controlla</h2><p class="small muted">${rows.filter((r) => r.stato !== 'ok').length} da sistemare, ${rows.filter((r) => r.stato === 'ok').length} già pronte.</p>
    <div id="rows"></div>
    <div class="sheet-actions"><button class="btn" data-close>Annulla</button><button class="btn primary" id="rowsOk">Aggiungi</button></div>`, (el) => {
    const box = $('#rows', el);
    const refresh = () => {
      box.innerHTML = draw();
      const ready = rows.length && rows.every((r) => r.pick && r.g > 0);
      $('#rowsOk', el).disabled = !ready;
      $('#rowsOk', el).textContent = ready ? `Aggiungi ${rows.length}` : 'Scegli le voci evidenziate';
    };
    refresh();
    box.addEventListener('input', (e) => {
      const i = e.target.dataset.g;
      if (i == null) return;
      rows[i].g = num(e.target.value);
      rows[i].inc = 0; // grammi scritti a mano = pesati
      const ready = rows.every((r) => r.pick && r.g > 0);
      $('#rowsOk', el).disabled = !ready;
    });
    box.addEventListener('change', () => refresh());
    box.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cand]');
      if (c) {
        const r = rows[c.dataset.row];
        r.pick = r.cands[c.dataset.cand];
        const res = resolveGrams(r.pick, r.qty);
        r.g = r0(res.g);
        r.inc = res.inc;
        r.nota = res.nota;
        r.stato = res.dubbio ? 'amb-qty' : r.stato;
        return refresh();
      }
      const d = e.target.closest('[data-drop]');
      if (d) {
        rows.splice(Number(d.dataset.drop), 1);
        if (!rows.length) return closeSheet();
        return refresh();
      }
      const s = e.target.closest('[data-search]');
      if (s) {
        const r = rows[s.dataset.search];
        return pickFood(r.query, (entry) => {
          r.pick = entry;
          r.cands = [entry, ...r.cands.filter((x) => x.item.id !== entry.item.id)].slice(0, 4);
          const res = resolveGrams(entry, r.qty);
          r.g = r0(res.g);
          r.inc = res.inc;
        r.inc = res.inc;
          r.nota = res.nota;
          r.stato = 'amb';
          openConfirmSheet(rows);
        }, () => openConfirmSheet(rows));
      }
      const cr = e.target.closest('[data-create]');
      if (cr) {
        const r = rows[cr.dataset.create];
        return openFoodEditor(null, { nome: cap(r.query) }, (food) => {
          const entry = { kind: 'food', item: food, score: 1 };
          r.pick = entry;
          r.cands = [entry];
          const res = resolveGrams(entry, r.qty);
          r.g = r0(res.g);
          r.inc = res.inc;
        r.inc = res.inc;
          r.stato = 'amb';
          openConfirmSheet(rows);
        }, () => openConfirmSheet(rows));
      }
    });
    $('#rowsOk', el).addEventListener('click', () => commitRows(rows));
  });
}

// Selettore alimento con ricerca (usato dal parser e dalle ricette).
function pickFood(initial, onPick, onCancel, foodsOnly = false) {
  openSheet(`<h2>Cerca alimento</h2>
    <input class="inp" id="fq" placeholder="Cerca…" value="${esc(initial || '')}" autocapitalize="off" autocomplete="off" spellcheck="false">
    <div class="list" id="fres" style="margin-top:10px"></div>
    <div class="sheet-actions"><button class="btn" id="fcancel">Indietro</button></div>`, (el) => {
    const inp = $('#fq', el);
    const res = $('#fres', el);
    let items = [];
    const run = () => {
      const q = inp.value.trim();
      items = q ? findCandidates(q).filter((c) => c.score >= 0.35) : allFoods().map((a) => ({ kind: 'food', item: a, score: 1 })).sort((a, b) => a.item.nome.localeCompare(b.item.nome));
      if (foodsOnly) items = items.filter((c) => c.kind === 'food');
      items = items.slice(0, 40);
      res.innerHTML = items.map((c, i) => `<button class="li" data-i="${i}"><span class="nm">${esc(c.item.nome)}<small>${c.kind === 'recipe' ? 'ricetta' : `${fmt(c.item.kcal)} kcal · P ${fmt(c.item.p, 1)} · C ${fmt(c.item.cn, 1)} per 100 g`}</small></span></button>`).join('') || '<p class="muted small">Nessun risultato.</p>';
    };
    run();
    inp.addEventListener('input', run);
    res.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) onPick(items[b.dataset.i]);
    });
    $('#fcancel', el).addEventListener('click', () => (onCancel ? onCancel() : closeSheet()));
    setTimeout(() => inp.focus(), 60);
  });
}

function openVoceEditor(pasto, id) {
  const d = getDay(ui.day);
  const list = d.pasti[pasto];
  const v = list.find((x) => x.id === id);
  if (!v) return;
  openSheet(`<h2>${esc(v.nome)}</h2>
    ${v.inc ? `<p class="small muted num">Quantità stimata (±${r0(v.inc * 100)}%). Se la pesi e correggi i grammi, la forchetta sparisce.</p>` : ''}
    <label class="f"><span>Grammi</span><input class="inp num" id="eg" inputmode="decimal" value="${v.g}"></label>
    <label class="f"><span>Pasto</span><select class="inp" id="ep">${PASTI.map((p) => `<option value="${p.id}" ${p.id === pasto ? 'selected' : ''}>${p.nome}</option>`).join('')}</select></label>
    <p class="small muted num" id="eprev"></p>
    <div class="sheet-actions"><button class="btn danger" id="edel">Elimina</button><button class="btn primary" id="eok">Salva</button></div>`, (el) => {
    const inp = $('#eg', el);
    const upd = () => {
      const n = nutrPer(v.per, num(inp.value) || 0);
      $('#eprev', el).textContent = `${fmt(n.kcal)} kcal · P ${fmt(n.p)} g · C netti ${fmt(n.cn, 1)} g · fibra ${fmt(n.f, 1)} g · sodio ${fmt(n.na)} mg`;
    };
    upd();
    inp.addEventListener('input', upd);
    $('#edel', el).addEventListener('click', () => {
      const undo = snapshotDay(ui.day);
      d.pasti[pasto] = list.filter((x) => x.id !== id);
      cleanupDay(ui.day);
      save();
      closeSheet();
      render();
      toast(`${v.nome} eliminato`, 'Annulla', undo);
    });
    $('#eok', el).addEventListener('click', () => {
      const g = num(inp.value);
      if (!g || g <= 0) return;
      const undo = snapshotDay(ui.day);
      if (r0(g) !== v.g) delete v.inc;
      v.g = r0(g);
      const np = $('#ep', el).value;
      if (np !== pasto) {
        d.pasti[pasto] = list.filter((x) => x.id !== id);
        d.pasti[np].push(v);
      }
      save();
      closeSheet();
      render();
      toast('Modificato', 'Annulla', undo);
    });
  });
}

function savePreset(pasto) {
  const voci = getDay(ui.day)?.pasti[pasto] || [];
  if (!voci.length) return;
  const def = `${PASTI.find((p) => p.id === pasto).nome}: ${voci.map((v) => v.nome).slice(0, 3).join(', ')}`;
  openSheet(`<h2>Salva come preset</h2>
    <label class="f"><span>Nome</span><input class="inp" id="pn" value="${esc(def)}"></label>
    <p class="small muted">${voci.map((v) => `${esc(v.nome)} ${v.g} g`).join(' · ')}</p>
    <div class="sheet-actions"><button class="btn" data-close>Annulla</button><button class="btn primary" id="pok">Salva</button></div>`, (el) => {
    $('#pok', el).addEventListener('click', () => {
      const nome = $('#pn', el).value.trim() || def;
      S.preset.push({ id: uid('p'), nome, voci: structuredClone(voci) });
      save();
      closeSheet();
      toast('Preset salvato');
    });
  });
}

/* ================================================================
   VISTA: PESO
   ================================================================ */

function viewPeso() {
  header('Peso', 'La media a 7 giorni è il dato che conta', false);
  const k = todayKey();
  const ma = weightMA(k);
  const maPrev = weightMA(addDays(k, -7));
  const last = latestWeightKey();
  const oggi = S.pesi[k];
  let h = `<section class="card">
    <h2>Media mobile 7 giorni</h2>
    <div class="stat-big num">${ma != null ? fmt(ma, 1) : '–'} <small>kg</small></div>
    <div class="small muted num" style="margin-top:6px">${ma != null && maPrev != null ? `${ma - maPrev <= 0 ? '▼' : '▲'} ${fmt(Math.abs(ma - maPrev), 1)} kg rispetto a 7 giorni fa` : 'Servono almeno due settimane di pesate per il confronto.'}</div>
    ${last ? `<div class="small muted num">Ultima pesata: ${fmt(S.pesi[last], 1)} kg (${labelDay(last, false)}) — è rumore, guarda la media.</div>` : ''}
  </section>
  <section class="card">
    <h2>Peso di stamattina</h2>
    <div class="row"><input class="inp num" id="wIn" inputmode="decimal" placeholder="es. 82,4" value="${oggi != null ? String(oggi).replace('.', ',') : ''}" style="flex:1"><button class="btn primary" id="wSave">${oggi != null ? 'Aggiorna' : 'Salva'}</button></div>
    <div class="row" style="margin-top:8px"><span class="small muted">Data</span><input class="inp" type="date" id="wDate" value="${k}" max="${k}" style="flex:1;min-height:40px"></div>
  </section>`;
  h += `<section class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Andamento</h2><span class="spacer"></span></div>
    <div class="seg" id="rangeSeg">${[[30, '30 gg'], [90, '90 gg'], [365, '1 anno'], [0, 'Tutto']].map(([v, l]) => `<button data-r="${v}" aria-pressed="${ui.pesoRange === v}">${l}</button>`).join('')}</div>
    ${weightChart(ui.pesoRange)}
    <div class="legend"><span><i style="background:var(--accent);height:4px"></i>Media 7 gg</span><span><i style="background:var(--muted);opacity:.5"></i>Pesata del giorno</span></div>
  </section>`;
  const keys = Object.keys(S.pesi).sort().reverse().slice(0, 30);
  if (keys.length) {
    h += `<section class="card"><h2>Pesate</h2><div class="list">${keys.map((kk) => `<button class="li" data-wdel="${kk}"><span class="nm">${labelDay(kk, false)}<small class="num">media 7 gg ${fmt(weightMA(kk), 1)} kg</small></span><b class="num">${fmt(S.pesi[kk], 1)}</b></button>`).join('')}</div></section>`;
  }
  return h;
}

function weightChart(range) {
  const all = Object.keys(S.pesi).sort();
  if (all.length < 2) return '<p class="muted small center" style="padding:30px 0">Il grafico compare dopo due pesate.</p>';
  const end = todayKey();
  const start = range ? addDays(end, -range + 1) : all[0];
  const days = [];
  for (let k = start < all[0] ? all[0] : start; k <= end; k = addDays(k, 1)) days.push(k);
  const pts = days.map((k, i) => ({ i, k, w: S.pesi[k], ma: weightMA(k) }));
  const vals = pts.flatMap((p) => [p.w, p.ma]).filter((x) => x != null);
  if (!vals.length) return '<p class="muted small center" style="padding:30px 0">Nessuna pesata in questo periodo.</p>';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
  lo = Math.floor(lo * 2) / 2 - 0.5; hi = Math.ceil(hi * 2) / 2 + 0.5;
  const W = 340, H = 200, L = 34, R = 8, T = 10, B = 22;
  const x = (i) => L + (days.length === 1 ? 0 : (i / (days.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = (key) => {
    let d = '', pen = false;
    for (const p of pts) {
      if (p[key] == null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p[key]).toFixed(1)} `;
      pen = true;
    }
    return d;
  };
  const steps = 4;
  let grid = '';
  for (let s = 0; s <= steps; s++) {
    const v = lo + ((hi - lo) * s) / steps;
    grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${fmt(v, 1)}</text>`;
  }
  const lbl = (k) => { const d = parseKey(k); return `${d.getDate()} ${MESI[d.getMonth()]}`; };
  grid += `<text class="axis" x="${L}" y="${H - 6}">${lbl(days[0])}</text><text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${lbl(days[days.length - 1])}</text>`;
  const dots = pts.filter((p) => p.w != null).map((p) => `<circle class="pt" cx="${x(p.i).toFixed(1)}" cy="${y(p.w).toFixed(1)}" r="${days.length > 120 ? 1.5 : 2.5}"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafico del peso con media mobile a 7 giorni">${grid}<path class="raw" d="${line('w')}"/>${dots}<path class="ma" d="${line('ma')}"/></svg>`;
}

function recipeMeta(r) {
  const n = recipePortion(r);
  return `${r.tempo ? `${r.tempo} min · ` : ''}${fmt(n.kcal)} kcal · P ${fmt(n.p)} · C ${fmt(n.cn)} · F ${fmt(n.f)}`;
}
function tagChips(tags) {
  return tags.length ? `<div class="tags">${tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}</div>` : '';
}

// Scheda ricetta: ingredienti con grammature previste (per le porzioni scelte), modificabili.
function openRecipeSheet(r, pasto, back) {
  if (pasto) ui.pasto = pasto;
  let mult = 1;
  const perPorz = (ing) => ing.g / (r.porzioni || 1);
  const draw = () => r.ingredienti.map((ing, i) => {
    const a = foodById(ing.fid);
    return `<div class="row ing"><span class="nm">${esc(a?.nome || ing.fid)}</span><input class="inp g num" data-ing="${i}" inputmode="decimal" value="${r0(perPorz(ing) * mult)}" aria-label="grammi di ${esc(a?.nome || '')}"><span class="small muted">g</span></div>`;
  }).join('');
  openSheet(`<h2>${esc(r.nome)}</h2>
    <p class="small muted num">${recipeMeta(r)} a porzione${r.porzioni > 1 ? ` · la ricetta fa ${r.porzioni} porzioni` : ''}</p>
    ${tagChips(recipeTags(r))}
    ${r.procedimento?.length ? `<ol class="steps">${r.procedimento.slice(0, 4).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    <div class="seg" id="rPasto">${PASTI.map((p) => `<button data-p="${p.id}" aria-pressed="${p.id === ui.pasto}">${p.nome}</button>`).join('')}</div>
    <div class="seg" id="rMult">${[0.5, 1, 1.5, 2].map((x) => `<button data-m="${x}" aria-pressed="${x === 1}">${fmt(x, x % 1 ? 1 : 0)} porz.</button>`).join('')}</div>
    <div id="rIng">${draw()}</div>
    <p class="small num" id="rTot"></p>
    <div class="sheet-actions"><button class="btn" id="rBack">${back ? 'Indietro' : 'Chiudi'}</button><button class="btn primary" id="rAdd">Aggiungi</button></div>`, (el) => {
    const grams = () => $$('[data-ing]', el).map((inp) => num(inp.value) || 0);
    const upd = () => {
      const t = sumN(r.ingredienti.map((ing, i) => { const a = foodById(ing.fid); return a ? nutr(a, grams()[i]) : sumN([]); }));
      const end = sumN([dayTotals(ui.day), t]);
      $('#rTot', el).innerHTML = `<b>${fmt(t.kcal)} kcal · P ${fmt(t.p)} g · C ${fmt(t.cn, 1)} g · F ${fmt(t.f, 1)} g</b><br><span class="muted">La giornata arriverebbe a ${fmt(end.kcal)} kcal e ${fmt(end.p)} g di proteine.</span>`;
    };
    upd();
    $('#rIng', el).addEventListener('input', upd);
    $$('#rPasto button', el).forEach((b) => b.addEventListener('click', () => {
      ui.pasto = b.dataset.p;
      $$('#rPasto button', el).forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
    $$('#rMult button', el).forEach((b) => b.addEventListener('click', () => {
      mult = num(b.dataset.m);
      $$('#rMult button', el).forEach((x) => x.setAttribute('aria-pressed', x === b));
      $('#rIng', el).innerHTML = draw();
      upd();
    }));
    $('#rBack', el).addEventListener('click', () => (back ? back() : closeSheet()));
    $('#rAdd', el).addEventListener('click', () => {
      const g = grams();
      const undo = snapshotDay(ui.day);
      const d = getDay(ui.day, true);
      let n = 0;
      r.ingredienti.forEach((ing, i) => {
        const a = foodById(ing.fid);
        if (!a || !(g[i] > 0)) return;
        const v = makeVoce(a, g[i]);
        v.from = r.nome;
        d.pasti[ui.pasto].push(v);
        n++;
      });
      cleanupDay(ui.day);
      save();
      closeSheet();
      render();
      toast(`${r.nome}: ${n} ingredienti aggiunti a ${pastoNome(ui.pasto)}`, 'Annulla', undo);
    });
  });
}

function openStasera() {
  const { rem, gap, list } = stasera(ui.day);
  const st = S.settings;
  const t0 = rem.t;
  let intro;
  if (rem.kcalMax <= 0) intro = `Sei a ${fmt(t0.kcal)} kcal, già oltre il massimo di ${fmt(st.kcalMax)}. Nessuna ricetta ci sta.`;
  else if (rem.kcalMin < 300) intro = `Ti restano ${fmt(Math.max(0, rem.kcalMin))} kcal per il minimo (${fmt(rem.kcalMax)} al massimo): è meno di un pasto.`;
  else if (rem.kcalMin > 1200) intro = `Hai mangiato troppo poco finora: ti restano ${fmt(rem.kcalMin)} kcal per un pasto solo.`;
  else intro = `Ti restano ${fmt(rem.kcalMin)}–${fmt(rem.kcalMax)} kcal e ${fmt(gap)} g di proteine per il minimo.`;
  const shown = list.slice(0, 8);
  const cards = shown.map((x, i) => {
    const end = sumN([t0, x.n]);
    const overC = x.n.cn > Math.max(0, rem.cn);
    return `<button class="opt" data-i="${i}">
      <div class="row"><h3 style="flex:1">${esc(x.r.nome)}</h3><span class="num small muted">${x.r.tempo ? `${x.r.tempo} min` : ''}</span></div>
      <div class="small num">${fmt(x.n.kcal)} kcal · P ${fmt(x.n.p)} g · C ${fmt(x.n.cn, 1)} g · F ${fmt(x.n.f, 1)} g</div>
      <div class="why num">Chiuderesti a ${fmt(end.kcal)} kcal e ${fmt(end.p)} g di proteine${overC ? ` · <span style="color:var(--bad)">carbo oltre il tetto di ${fmt(end.cn - st.carboMax)} g</span>` : ''}</div>
      ${tagChips(recipeTags(x.r))}</button>`;
  }).join('');
  openSheet(`<h2>Cosa mangio stasera</h2><p>${intro}</p>
    ${cards || ''}
    ${list.length > shown.length ? `<p class="small muted">Altre ${list.length - shown.length} ricette ci stanno: le trovi in Aggiungi → Ricette.</p>` : ''}
    <p class="small muted">Ricette con una porzione entro ${fmt(Math.max(0, rem.kcalMax))} kcal, ordinate per quante proteine mancanti coprono.</p>
    <div class="sheet-actions"><button class="btn" data-close>Chiudi</button></div>`, (el) => {
    $$('[data-i]', el).forEach((b) => b.addEventListener('click', () => openRecipeSheet(shown[b.dataset.i].r, 'cena', openStasera)));
  });
}

/* ================================================================
   VISTA: SETTIMANA (ultimi 7 giorni)
   ================================================================ */

function mediaRow(label, avg, sc, unit, target, n) {
  let cls = 'good', txt = 'in target';
  if (Math.abs(sc) >= 0.5) {
    cls = 'bad';
    const tot = Math.abs(sc) * n;
    txt = sc < 0
      ? `−${fmt(-sc)} ${unit} al giorno, cioè ${fmt(tot)} ${unit} ${unit === 'kcal' ? 'in meno' : 'persi'} in ${n} ${n === 1 ? 'giorno' : 'giorni'}`
      : `+${fmt(sc)} ${unit} al giorno, cioè ${fmt(tot)} ${unit} di troppo in ${n} ${n === 1 ? 'giorno' : 'giorni'}`;
  }
  return `<div class="mrow"><div class="row"><b style="flex:1">${label}</b><span class="num"><b>${fmt(avg)}</b> ${unit} <span class="muted small">/ ${target}</span></span></div>
    <div class="small num ${cls === 'bad' ? 'txt-bad' : 'txt-good'}">${txt}</div></div>`;
}

function viewSettimana() {
  const end = ui.weekEnd;
  const st = S.settings;
  const days = last7(end);
  const isNow = end === todayKey();
  header(isNow ? 'Ultimi 7 giorni' : '7 giorni', `${labelDay(days[0], false)} – ${labelDay(end, false)}`, isNow ? 'last' : true);
  const ws = weekStats(end, false);
  const oggiEscluso = isNow && dayHasData(end) && !ws.days.includes(end);

  let h = `<section class="card"><div class="week-days">${days.map((k) => {
    const d = parseKey(k);
    const v = dayHasData(k) ? voto(dayTotals(k)).v : null;
    return `<button data-goto="${k}"><div class="d">${GIORNI[d.getDay()]} ${d.getDate()}</div><div class="voto sm ${v ? votoClass(v) : ''} num">${v ?? '·'}</div></button>`;
  }).join('')}</div></section>`;

  if (ws.sotto >= 3) {
    h += `<div class="alert bad"><div><b>${ws.sotto} giorni su ${ws.n} sotto ${fmt(st.kcalSoglia)} kcal</b>È un pattern da correggere: mangiare troppo poco è un errore, non un merito.</div></div>`;
  }

  if (!ws.n) {
    h += '<div class="card empty">Nessun giorno registrato in questi 7 giorni.</div>';
  } else {
    h += `<section class="card"><h2>Medie giornaliere · ${ws.n} ${ws.n === 1 ? 'giorno' : 'giorni'} registrati</h2><div class="mrows">
      ${mediaRow('Calorie', ws.avg.kcal, ws.scarti.kcal, 'kcal', `${fmt(st.kcalMin)}–${fmt(st.kcalMax)}`, ws.n)}
      ${mediaRow('Proteine', ws.avg.p, ws.scarti.p, 'g', `min ${st.protMin}`, ws.n)}
      ${mediaRow('Carbo netti', ws.avg.cn, ws.scarti.cn, 'g', `max ${st.carboMax}`, ws.n)}
      ${mediaRow('Fibra', ws.avg.f, ws.scarti.f, 'g', `${st.fibraMin}–${st.fibraMax}`, ws.n)}
    </div>${oggiEscluso ? `<p class="small muted num" style="margin:12px 0 0">Oggi è escluso finché non supera ${fmt(st.kcalSoglia)} kcal: ora è a ${fmt(dayTotals(end).kcal)}.</p>` : ''}</section>`;

    const def = ws.deficit >= 0;
    h += `<section class="card"><h2>Bilancio energetico</h2><div class="kv">
      <div><b class="num">${def ? '−' : '+'}${fmt(Math.abs(ws.deficit))}</b><span>kcal ${def ? 'di deficit' : 'di surplus'} in ${ws.n} giorni, su fabbisogno ${fmt(st.fabbisogno)}</span></div>
      <div><b class="num">${def ? '−' : '+'}${fmt(Math.abs(ws.grasso), 2)} kg</b><span>grasso stimato (deficit ÷ 7.700)</span></div>
    </div><p class="small muted num" style="margin:10px 0 0">Giorni sotto ${fmt(st.kcalSoglia)} kcal: ${ws.sotto}</p></section>`;
  }

  const rs = ruleStatus(end);
  h += `<section class="card"><h2>Regole · ultimi 7 giorni</h2>${rs.length ? rs.map((r) => `<div class="rule"><div class="ok ${r.ok ? 'y' : 'n'}">${r.ok ? '✓' : '✕'}</div><div style="flex:1"><b>${esc(ruleLabel(r.tag))}</b><div class="small muted">${r.tag === '@colazione' ? `almeno ${r.n} giorni` : `${r.tipo === 'min' ? 'almeno' : 'al massimo'} ${r.n} ${r.n === 1 ? 'volta' : 'volte'}`}</div></div><b class="num small">${ruleText(r)}</b></div>`).join('') : '<p class="muted small">Nessuna regola. Aggiungile in Impostazioni.</p>'}</section>`;

  h += `<section class="card"><h2>Peso · media mobile 7 giorni</h2><div class="row"><div><div class="stat-big num" style="font-size:32px">${ws.ma != null ? fmt(ws.ma, 1) : '–'} <small>kg</small></div></div><span class="spacer"></span>
    <div class="right"><div class="num" style="font-size:20px;font-weight:700">${ws.maDelta != null ? `${ws.maDelta <= 0 ? '−' : '+'}${fmt(Math.abs(ws.maDelta), 1)} kg` : '–'}</div><div class="small muted">sulla settimana precedente</div></div></div></section>`;

  h += `<button class="btn ghost block" data-act="export-week">Copia settimana</button>`;
  return h;
}

/* ================================================================
   VISTA: STORICO
   ================================================================ */

function viewStorico() {
  header('Storico', `${Object.keys(S.giorni).filter(dayHasData).length} giorni registrati`, false);
  const keys = Object.keys(S.giorni).filter(dayHasData).sort().reverse();
  if (!keys.length) return '<div class="card empty">Ancora nessun giorno registrato.</div>';
  const st = S.settings;
  let h = '<section class="card" style="padding:4px 16px">';
  let lastWeek = null;
  for (const k of keys) {
    const ws = weekStart(k);
    if (ws !== lastWeek) {
      h += `<div class="small muted" style="padding:12px 0 4px;font-weight:600">Settimana del ${labelDay(ws, false)}</div>`;
      lastWeek = ws;
    }
    const t = dayTotals(k);
    const vv = voto(t);
    h += `<button class="li" data-goto="${k}"><div class="voto sm ${votoClass(vv.v)} num">${vv.v}</div>
      <span class="nm">${labelDay(k)}${t.na > st.sodioMax ? ' <span class="badge bad">sodio</span>' : ''}<small class="num">${fmt(t.kcal)} kcal · P ${fmt(t.p)} g · C ${fmt(t.cn)} g · F ${fmt(t.f)} g</small></span>
      <span class="muted">›</span></button>`;
  }
  h += '</section>';
  return h;
}

/* ================================================================
   VISTA: IMPOSTAZIONI
   ================================================================ */

function field(id, label, val, unit = '') {
  return `<label class="f"><span>${label}${unit ? ` (${unit})` : ''}</span><input class="inp num" data-set="${id}" inputmode="decimal" value="${val ?? ''}"></label>`;
}

function viewImpostazioni() {
  header('Impostazioni', '', false);
  const st = S.settings;
  const last = latestWeightKey();
  return `
  <details class="sec" open><summary>Dati personali</summary><div class="body">
    <div class="grid2">${field('altezza', 'Altezza', st.altezza, 'cm')}${field('peso', 'Peso attuale', st.peso ?? (last ? S.pesi[last] : ''), 'kg')}</div>
    ${field('fabbisogno', 'Fabbisogno calorico stimato', st.fabbisogno, 'kcal')}
    ${st.peso || last ? `<p class="small muted num">Deficit al centro del target: ${fmt(st.fabbisogno - (st.kcalMin + st.kcalMax) / 2)} kcal/giorno</p>` : ''}
  </div></details>

  <details class="sec"><summary>Target giornalieri</summary><div class="body">
    <div class="grid2">${field('kcalMin', 'Kcal minimo', st.kcalMin)}${field('kcalMax', 'Kcal massimo', st.kcalMax)}</div>
    <div class="grid2">${field('protMin', 'Proteine minimo', st.protMin, 'g')}${field('protMax', 'Proteine massimo', st.protMax, 'g')}</div>
    ${field('carboMax', 'Carbo netti massimo', st.carboMax, 'g')}
    <div class="grid2">${field('fibraMin', 'Fibra minimo', st.fibraMin, 'g')}${field('fibraMax', 'Fibra massimo', st.fibraMax, 'g')}</div>
    ${field('sodioMax', 'Soglia alert sodio', st.sodioMax, 'mg')}
  </div></details>

  <details class="sec"><summary>Regole del voto</summary><div class="body">
    <p class="small muted">Si parte da 10. −2 proteine &lt;70% del minimo, −1 &lt;90%. −2 kcal sotto la soglia bassa, −1 sotto il minimo. −1 carbo netti oltre il tetto. −1 fibra fuori dall'intervallo. Con proteine o kcal sotto le soglie dure il voto non supera il tetto.</p>
    <div class="grid2">${field('kcalSoglia', 'Soglia kcal bassa', st.kcalSoglia)}${field('protDura', 'Soglia dura proteine', st.protDura, 'g')}</div>
    <div class="grid3">${field('fibraBassa', 'Fibra bassa', st.fibraBassa, 'g')}${field('fibraAlta', 'Fibra alta', st.fibraAlta, 'g')}${field('votoTetto', 'Tetto voto', st.votoTetto)}</div>
  </div></details>

  <details class="sec"><summary>Regole settimanali</summary><div class="body">
    <p class="small muted">Contano gli ultimi 7 giorni. Per un tag: quanti pasti contengono almeno un alimento con quel tag. Colazione: quanti giorni ce l'hanno registrata.</p>
    <div id="rules">${st.regole.map((r, i) => `<div class="row" style="margin-bottom:8px">
      <select class="inp" data-rule="${i}" data-k="tag" style="flex:2">${['@colazione', ...TAG_DISPONIBILI].map((t) => `<option value="${t}" ${t === r.tag ? 'selected' : ''}>${esc(ruleLabel(t).toLowerCase())}</option>`).join('')}</select>
      <select class="inp" data-rule="${i}" data-k="tipo" style="flex:1.4"><option value="min" ${r.tipo === 'min' ? 'selected' : ''}>almeno</option><option value="max" ${r.tipo === 'max' ? 'selected' : ''}>al massimo</option></select>
      <input class="inp num" data-rule="${i}" data-k="n" inputmode="numeric" value="${r.n}" style="flex:.8;min-width:0">
      <button class="iconbtn" data-rule-del="${i}" aria-label="Rimuovi regola">✕</button></div>`).join('')}</div>
    <button class="btn ghost sm" data-act="rule-add">+ Aggiungi regola</button>
  </div></details>

  <details class="sec"><summary>Alimenti <span class="muted small" style="margin-left:8px">${allFoods().length}</span></summary><div class="body">
    <button class="btn primary block" data-act="food-new" style="margin-bottom:10px">+ Nuovo alimento</button>
    <input class="inp" id="foodSearch" placeholder="Cerca negli alimenti" autocapitalize="off" autocomplete="off" spellcheck="false">
    <div class="list" id="foodList" style="margin-top:10px">${foodListHtml('')}</div>
  </div></details>

  <details class="sec"><summary>Ricette <span class="muted small" style="margin-left:8px">${allRecipes().length}</span></summary><div class="body">
    <button class="btn primary block" data-act="recipe-new" style="margin-bottom:10px">+ Nuova ricetta</button>
    <div class="list">${allRecipes().map((r) => {
      return `<button class="li" data-recipe="${esc(r.id)}"><span class="nm">${esc(r.nome)}<small class="num">${recipeMeta(r)}</small>${tagChips(recipeTags(r))}</span>${r.base ? '' : '<span class="badge">tua</span>'}</button>`;
    }).join('')}</div>
  </div></details>

  <details class="sec"><summary>Pasti salvati <span class="muted small" style="margin-left:8px">${S.preset.length}</span></summary><div class="body">
    ${S.preset.length ? `<div class="list">${S.preset.map((p) => `<div class="li"><span class="nm">${esc(p.nome)}<small>${p.voci.map((v) => `${esc(v.nome)} ${v.g} g`).join(', ')}</small></span><button class="btn danger sm" data-preset-del="${esc(p.id)}">Elimina</button></div>`).join('')}</div>` : '<p class="small muted">Nessuno. In Oggi, sotto un pasto, tocca "Salva come preset".</p>'}
  </div></details>

  <details class="sec"><summary>Backup e dati</summary><div class="body">
    <p class="small muted">I dati vivono solo su questo dispositivo. Esporta un backup ogni tanto.</p>
    <div class="grid2"><button class="btn" data-act="export-json">Esporta JSON</button><button class="btn" data-act="import-json">Importa JSON</button></div>
    <input type="file" id="importFile" accept="application/json,.json" class="hide">
    <button class="btn danger block" data-act="reset" style="margin-top:10px">Cancella tutti i dati</button>
  </div></details>

  <p class="small muted center" style="margin-top:20px">CRUMB · offline, senza account, senza rete.<br>Ogni numero è calcolato sul dispositivo.</p>`;
}

function foodListHtml(q) {
  const list = q ? findCandidates(q).filter((c) => c.kind === 'food' && c.score >= 0.4).map((c) => c.item) : allFoods().slice().sort((a, b) => a.nome.localeCompare(b.nome));
  return list.map((a) => `<button class="li" data-food="${esc(a.id)}"><span class="nm">${esc(a.nome)}<small class="num">${fmt(a.kcal)} kcal · P ${fmt(a.p, 1)} · C ${fmt(a.cn, 1)} · F ${fmt(a.f, 1)} · Na ${fmt(a.na)}</small></span>${!a.base ? '<span class="badge">tuo</span>' : S.override[a.id] ? '<span class="badge">mod.</span>' : ''}</button>`).join('') || '<p class="small muted">Nessun risultato.</p>';
}

function openFoodEditor(id, preset = {}, onSaved, onBack) {
  const a = id ? foodById(id) : null;
  const isBase = a?.base;
  const v = a || { nome: '', alias: [], kcal: '', p: '', cn: '', f: '', na: 0, porz: 100, tag: [], unita: {}, ...preset };
  const ctot = a ? r1(a.cn + a.f) : '';
  openSheet(`<h2>${a ? 'Modifica alimento' : 'Nuovo alimento'}</h2>
    ${isBase ? '<p class="small muted">Alimento precaricato: le modifiche restano sul dispositivo e si possono annullare.</p>' : ''}
    <label class="f"><span>Nome</span><input class="inp" id="fn" value="${esc(v.nome)}"></label>
    <label class="f"><span>Altri nomi (separati da virgola, aiutano il riconoscimento)</span><input class="inp" id="fa" value="${esc((v.alias || []).join(', '))}" autocapitalize="off"></label>
    <p class="small muted" style="margin:0 0 8px">Valori per 100 g</p>
    <div class="grid2">
      <label class="f"><span>Kcal</span><input class="inp num" id="fk" inputmode="decimal" value="${v.kcal}"></label>
      <label class="f"><span>Proteine (g)</span><input class="inp num" id="fp" inputmode="decimal" value="${v.p}"></label>
      <label class="f"><span>Carboidrati totali (g)</span><input class="inp num" id="fc" inputmode="decimal" value="${ctot}"></label>
      <label class="f"><span>Fibra (g)</span><input class="inp num" id="ff" inputmode="decimal" value="${v.f}"></label>
    </div>
    <p class="small num" id="fnet" style="margin:-4px 0 12px"></p>
    <div class="grid2">
      <label class="f"><span>Sodio (mg)</span><input class="inp num" id="fna" inputmode="decimal" value="${v.na}"></label>
      <label class="f"><span>Porzione tipica (g)</span><input class="inp num" id="fpz" inputmode="decimal" value="${v.porz}"></label>
    </div>
    <label class="f"><span>Peso di un pezzo (g, opzionale: per "3 uova", "2 vasetti")</span><input class="inp num" id="fpc" inputmode="decimal" value="${v.unita?.pezzo ?? ''}"></label>
    <div class="f"><span class="small muted">Tag</span><div class="chips" style="margin-top:6px">${TAG_DISPONIBILI.map((t) => `<label class="chip tagchk"><input type="checkbox" value="${t}" ${v.tag.includes(t) ? 'checked' : ''}>${t}</label>`).join('')}</div></div>
    <div class="sheet-actions">${a ? (isBase ? (S.override[a.id] ? '<button class="btn" id="freset">Ripristina</button>' : '<button class="btn danger" id="fhide">Nascondi</button>') : '<button class="btn danger" id="fdel">Elimina</button>') : '<button class="btn" id="fback">Annulla</button>'}<button class="btn primary" id="fok">Salva</button></div>`, (el) => {
    const net = () => {
      const c = num($('#fc', el).value), f = num($('#ff', el).value) || 0;
      $('#fnet', el).textContent = c != null ? `Carboidrati netti: ${fmt(Math.max(0, c - f), 1)} g (totali − fibra)` : '';
    };
    net();
    $('#fc', el).addEventListener('input', net);
    $('#ff', el).addEventListener('input', net);
    $('#fback', el)?.addEventListener('click', () => (onBack ? onBack() : closeSheet()));
    $('#fok', el).addEventListener('click', () => {
      const nome = $('#fn', el).value.trim();
      const kcal = num($('#fk', el).value);
      if (!nome || kcal == null) return toast('Servono almeno nome e kcal');
      const f = num($('#ff', el).value) || 0;
      const c = num($('#fc', el).value) || 0;
      const pezzo = num($('#fpc', el).value);
      const data = {
        nome,
        alias: $('#fa', el).value.split(',').map((s) => s.trim()).filter(Boolean),
        kcal,
        p: num($('#fp', el).value) || 0,
        cn: r1(Math.max(0, c - f)),
        f,
        na: num($('#fna', el).value) || 0,
        porz: num($('#fpz', el).value) || 100,
        tag: $$('.tagchk input:checked', el).map((x) => x.value),
        unita: { ...(v.unita || {}), ...(pezzo ? { pezzo } : {}) },
      };
      if (!pezzo) delete data.unita.pezzo;
      let saved;
      if (isBase) {
        S.override[a.id] = data;
        saved = { ...a, ...data };
      } else if (a) {
        Object.assign(a, data);
        saved = a;
      } else {
        saved = { id: uid('u'), ...data };
        S.alimenti.push(saved);
      }
      invalidateFoods();
      save();
      if (onSaved) onSaved(saved);
      else { closeSheet(); render(); }
      toast('Alimento salvato');
    });
    $('#freset', el)?.addEventListener('click', () => {
      delete S.override[a.id];
      invalidateFoods(); save(); closeSheet(); render();
      toast('Valori originali ripristinati');
    });
    $('#fhide', el)?.addEventListener('click', () => {
      S.nascosti.push(a.id);
      invalidateFoods(); save(); closeSheet(); render();
      toast(`${a.nome} nascosto`, 'Annulla', () => { S.nascosti = S.nascosti.filter((x) => x !== a.id); invalidateFoods(); save(); render(); });
    });
    $('#fdel', el)?.addEventListener('click', () => {
      S.alimenti = S.alimenti.filter((x) => x.id !== a.id);
      invalidateFoods(); save(); closeSheet(); render();
      toast(`${a.nome} eliminato`);
    });
  });
}

function openRecipeEditor(id) {
  const r = id ? recipeById(id) : null;
  const text = r ? r.ingredienti.map((i) => `${foodById(i.fid)?.nome || i.fid} ${i.g}g`).join(', ') : '';
  let resolved = [];
  openSheet(`<h2>${r ? esc(r.nome) : 'Nuova ricetta'}</h2>
    ${r?.base ? '<p class="small muted">Ricetta precaricata: salvando ne crei una tua copia.</p>' : ''}
    <label class="f"><span>Nome</span><input class="inp" id="rn" value="${esc(r?.nome || '')}"></label>
    <div class="grid2"><label class="f"><span>Porzioni</span><input class="inp num" id="rp" inputmode="numeric" value="${r?.porzioni || 1}"></label>
    <label class="f"><span>Tempo (minuti)</span><input class="inp num" id="rt" inputmode="numeric" value="${r?.tempo || ''}"></label></div>
    <label class="f"><span>Ingredienti (testo libero, come per i pasti)</span><textarea class="inp" id="ri" rows="4" autocapitalize="off" spellcheck="false" placeholder="uova 3, zucchine 200, parmigiano 15, olio 1 cucchiaino">${esc(text)}</textarea></label>
    <div id="rprev" class="small"></div>
    <label class="f"><span>Procedimento (max 4 righe)</span><textarea class="inp" id="rproc" rows="4">${esc((r?.procedimento || []).join('\n'))}</textarea></label>
    <div class="f"><span class="small muted">Tag manuali (gli altri li calcola l'app dai numeri)</span><div class="chips" style="margin-top:6px">${['batch', 'senza-cottura'].map((t) => `<label class="chip tagchk"><input type="checkbox" value="${t}" ${(r?.tag || []).includes(t) ? 'checked' : ''}>${t}</label>`).join('')}</div></div>
    ${r ? `<p class="small muted">Tag calcolati: ${recipeTags(r).join(', ') || 'nessuno'}. Proteico &gt;${RICETTA_SOGLIE.proteico} g proteine, fibra-alta ≥${RICETTA_SOGLIE.fibraAlta} g, sodio-basso ≤${RICETTA_SOGLIE.sodioBasso} mg a porzione, veloce &lt;${RICETTA_SOGLIE.veloce} min.</p>` : ''}
    <div class="sheet-actions">${r ? (r.base ? '<button class="btn danger" id="rhide">Nascondi</button>' : '<button class="btn danger" id="rdel">Elimina</button>') : '<button class="btn" data-close>Annulla</button>'}<button class="btn primary" id="rok">Salva</button></div>`, (el) => {
    const upd = () => {
      const rows = parseInput($('#ri', el).value).filter((x) => x.src);
      resolved = rows.map((x) => {
        const pick = x.pick || (x.cands[0]?.kind === 'food' ? x.cands[0] : x.cands.find((c) => c.kind === 'food'));
        if (!pick || pick.kind !== 'food') return { src: x.src, miss: true };
        const g = x.g ?? r0(resolveGrams(pick, x.qty).g);
        return { fid: pick.item.id, nome: pick.item.nome, g, dubbio: !x.pick };
      });
      const ok = resolved.filter((x) => !x.miss);
      const tot = sumN(ok.map((x) => nutr(foodById(x.fid), x.g)));
      const porz = Math.max(1, num($('#rp', el).value) || 1);
      $('#rprev', el).innerHTML = resolved.length ? `<ul style="padding-left:18px;margin:0 0 8px">${resolved.map((x) => x.miss ? `<li style="color:var(--bad)">«${esc(x.src)}» non riconosciuto</li>` : `<li${x.dubbio ? ' style="color:var(--warn)"' : ''}>${esc(x.nome)} ${fmt(x.g)} g${x.dubbio ? ' (incerto: precisa il nome)' : ''}</li>`).join('')}</ul>
        <div class="num">Per porzione: ${fmt(tot.kcal / porz)} kcal · P ${fmt(tot.p / porz)} g · C netti ${fmt(tot.cn / porz, 1)} g · fibra ${fmt(tot.f / porz, 1)} g</div>` : '';
    };
    upd();
    $('#ri', el).addEventListener('input', upd);
    $('#rp', el).addEventListener('input', upd);
    $('#rok', el).addEventListener('click', () => {
      const nome = $('#rn', el).value.trim();
      const ing = resolved.filter((x) => !x.miss).map((x) => ({ fid: x.fid, g: x.g }));
      if (!nome || !ing.length) return toast('Servono nome e almeno un ingrediente');
      const data = {
        nome,
        porzioni: Math.max(1, num($('#rp', el).value) || 1),
        tempo: Math.max(0, Math.round(num($('#rt', el).value) || 0)) || null,
        procedimento: $('#rproc', el).value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4),
        tag: $$('.tagchk input:checked', el).map((x) => x.value),
        ingredienti: ing,
      };
      if (r && !r.base) Object.assign(S.ricette.find((x) => x.id === r.id), data);
      else {
        S.ricette.push({ id: uid('r'), ...data });
        if (r?.base) S.nascosti.push(r.id);
      }
      invalidateFoods(); save(); closeSheet(); render();
      toast('Ricetta salvata');
    });
    $('#rhide', el)?.addEventListener('click', () => {
      S.nascosti.push(r.id);
      invalidateFoods(); save(); closeSheet(); render();
      toast(`${r.nome} nascosta`, 'Annulla', () => { S.nascosti = S.nascosti.filter((x) => x !== r.id); invalidateFoods(); save(); render(); });
    });
    $('#rdel', el)?.addEventListener('click', () => {
      S.ricette = S.ricette.filter((x) => x.id !== r.id);
      invalidateFoods(); save(); closeSheet(); render();
      toast('Ricetta eliminata');
    });
  });
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({ app: 'crumb', esportato: new Date().toISOString(), ...S }, null, 2)], { type: 'application/json' });
  const name = `crumb-backup-${todayKey()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importJSON(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const data = JSON.parse(fr.result);
      if (!data || typeof data !== 'object' || !('giorni' in data) || !('settings' in data)) throw new Error('formato');
      const nDays = Object.keys(data.giorni || {}).length;
      openSheet(`<h2>Importa backup</h2><p>Il file contiene ${nDays} giorni e ${Object.keys(data.pesi || {}).length} pesate. I dati attuali verranno sostituiti.</p>
        <div class="sheet-actions"><button class="btn" data-close>Annulla</button><button class="btn primary" id="iok">Sostituisci</button></div>`, (el) => {
        $('#iok', el).addEventListener('click', () => {
          delete data.app; delete data.esportato;
          S = migrate(data);
          invalidateFoods(); save(); closeSheet(); render();
          toast('Backup importato');
        });
      });
    } catch (e) {
      toast('File non valido');
    }
  };
  fr.readAsText(file);
}

/* ================================================================
   EVENTI DELLE VISTE
   ================================================================ */

function bindView(main) {
  main.onclick = (e) => {
    const t = e.target.closest('[data-act],[data-goto],[data-food],[data-recipe],[data-open-recipe],[data-preset-del],[data-rule-del],[data-wdel],[data-r]');
    if (!t) return;
    const act = t.dataset.act;
    if (t.dataset.goto) { ui.day = t.dataset.goto; setTab('oggi'); return; }
    if (t.dataset.food) return openFoodEditor(t.dataset.food);
    if (t.dataset.recipe) return openRecipeEditor(t.dataset.recipe);
    if (t.dataset.openRecipe) return openRecipeSheet(recipeById(t.dataset.openRecipe));
    if (t.dataset.r != null && t.closest('#rangeSeg')) { ui.pesoRange = Number(t.dataset.r); return render(); }
    if (t.dataset.presetDel) {
      const p = S.preset.find((x) => x.id === t.dataset.presetDel);
      S.preset = S.preset.filter((x) => x !== p);
      save(); render();
      return toast('Preset eliminato', 'Annulla', () => { S.preset.push(p); save(); render(); });
    }
    if (t.dataset.ruleDel) { S.settings.regole.splice(Number(t.dataset.ruleDel), 1); save(); return render(); }
    if (t.dataset.wdel) {
      const k = t.dataset.wdel, w = S.pesi[k];
      return openSheet(`<h2>Pesata del ${labelDay(k, false)}</h2><p class="num">${fmt(w, 1)} kg</p><div class="sheet-actions"><button class="btn" data-close>Chiudi</button><button class="btn danger" id="wd">Elimina</button></div>`, (el) => {
        $('#wd', el).addEventListener('click', () => { delete S.pesi[k]; save(); closeSheet(); render(); toast('Pesata eliminata', 'Annulla', () => { S.pesi[k] = w; save(); render(); }); });
      });
    }
    switch (act) {
      case 'stasera': return openStasera();
      case 'add-to': return openAddSheet(t.dataset.pasto);
      case 'edit-voce': return openVoceEditor(t.dataset.pasto, t.dataset.id);
      case 'save-preset': return savePreset(t.dataset.pasto);
      case 'export-day': return copyText(exportDay(ui.day));
      case 'export-week': return copyText(exportWeek(ui.weekEnd));
      case 'export-json': return exportJSON();
      case 'import-json': return $('#importFile').click();
      case 'food-new': return openFoodEditor(null);
      case 'recipe-new': return openRecipeEditor(null);
      case 'rule-add': S.settings.regole.push({ tag: 'verdura', tipo: 'min', n: 7 }); save(); return render();
      case 'reset':
        return openSheet(`<h2>Cancellare tutto?</h2><p>Giorni, pesate, alimenti, ricette e impostazioni verranno eliminati da questo dispositivo. Esporta prima un backup se ti serve.</p>
          <div class="sheet-actions"><button class="btn" data-close>Annulla</button><button class="btn danger" id="rs">Cancella</button></div>`, (el) => {
          $('#rs', el).addEventListener('click', () => { S = emptyState(); invalidateFoods(); save(); closeSheet(); render(); toast('Dati cancellati'); });
        });
    }
  };

  // Impostazioni: salvataggio immediato dei campi numerici.
  $$('[data-set]', main).forEach((inp) => inp.addEventListener('change', () => {
    const k = inp.dataset.set;
    const v = num(inp.value);
    if (v == null && k !== 'peso') { inp.value = S.settings[k]; return; }
    S.settings[k] = v;
    save();
    toast('Salvato');
  }));
  $$('[data-rule]', main).forEach((inp) => inp.addEventListener('change', () => {
    const r = S.settings.regole[inp.dataset.rule];
    r[inp.dataset.k] = inp.dataset.k === 'n' ? Math.max(0, Math.round(num(inp.value) || 0)) : inp.value;
    save();
  }));
  const fs = $('#foodSearch', main);
  if (fs) fs.addEventListener('input', () => { $('#foodList', main).innerHTML = foodListHtml(fs.value.trim()); });
  const imp = $('#importFile', main);
  if (imp) imp.addEventListener('change', () => { if (imp.files[0]) importJSON(imp.files[0]); imp.value = ''; });

  const wSave = $('#wSave', main);
  if (wSave) {
    const doSave = () => {
      const w = num($('#wIn', main).value);
      const k = $('#wDate', main).value || todayKey();
      if (!w || w < 25 || w > 350) return toast('Peso non valido');
      S.pesi[k] = r1(w);
      if (k >= (latestWeightKey() || '')) S.settings.peso = r1(w);
      save(); render();
      toast('Peso salvato');
    };
    wSave.addEventListener('click', doSave);
    $('#wIn', main).addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
    $('#wDate', main).addEventListener('change', (e) => {
      const w = S.pesi[e.target.value];
      $('#wIn', main).value = w != null ? String(w).replace('.', ',') : '';
    });
  }
}

/* ================================================================
   AVVIO
   ================================================================ */

// Se l'app resta aperta a cavallo della mezzanotte, "Oggi" segue il calendario.
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayKey();
  if (t !== lastToday) {
    if (ui.day === lastToday) ui.day = t;
    if (ui.weekEnd === lastToday) ui.weekEnd = t;
    ui.pasto = defaultPasto();
    lastToday = t;
    render();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();

// Esposto per i test in console / headless.
window.CRUMB = { parseInput, voto, stasera, dailyTip, weekStats, ruleStatus, recipeTags, recipePortion, weightMA, findCandidates, exportDay, exportWeek, get state() { return S; } };
