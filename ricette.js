// CRUMB — ricette precaricate.
// Ogni ricetta è un elenco di ingredienti (id del database alimenti + grammi)
// per il numero di porzioni indicato. I valori nutrizionali sono calcolati,
// mai scritti a mano.
'use strict';

const RICETTE_BASE = [
  {
    id: 'r-frittata-zucchine',
    nome: 'Frittata di zucchine',
    porzioni: 1,
    ingredienti: [
      { fid: 'uova', g: 165 },
      { fid: 'zucchine', g: 200 },
      { fid: 'parmigiano', g: 15 },
      { fid: 'olio-evo', g: 5 },
    ],
  },
  {
    id: 'r-pollo-cicoria',
    nome: 'Pollo alla piastra con cicoria',
    porzioni: 1,
    ingredienti: [
      { fid: 'pollo', g: 250 },
      { fid: 'cicoria', g: 250 },
      { fid: 'olio-evo', g: 10 },
    ],
  },
  {
    id: 'r-sgombro-finocchi',
    nome: 'Sgombro al forno con finocchi',
    porzioni: 1,
    ingredienti: [
      { fid: 'sgombro', g: 200 },
      { fid: 'finocchio', g: 250 },
      { fid: 'olio-evo', g: 5 },
    ],
  },
  {
    id: 'r-alici-gratinate',
    nome: 'Alici gratinate con spinaci',
    porzioni: 1,
    ingredienti: [
      { fid: 'alici', g: 200 },
      { fid: 'parmigiano', g: 10 },
      { fid: 'spinaci', g: 250 },
      { fid: 'olio-evo', g: 10 },
    ],
  },
  {
    id: 'r-bresaola-rucola',
    nome: 'Bresaola, rucola e grana',
    porzioni: 1,
    ingredienti: [
      { fid: 'bresaola', g: 80 },
      { fid: 'misticanza', g: 60 },
      { fid: 'parmigiano', g: 20 },
      { fid: 'olio-evo', g: 10 },
    ],
  },
  {
    id: 'r-shirataki-tonno',
    nome: 'Shirataki con tonno e zucchine',
    porzioni: 1,
    ingredienti: [
      { fid: 'shirataki', g: 200 },
      { fid: 'tonno-naturale', g: 112 },
      { fid: 'zucchine', g: 150 },
      { fid: 'olio-evo', g: 10 },
    ],
  },
  {
    id: 'r-polpette-manzo',
    nome: 'Polpette di manzo al sugo',
    porzioni: 2,
    ingredienti: [
      { fid: 'macinato-manzo', g: 400 },
      { fid: 'uova', g: 55 },
      { fid: 'parmigiano', g: 30 },
      { fid: 'pomodori', g: 300 },
      { fid: 'olio-evo', g: 10 },
    ],
  },
  {
    id: 'r-zuppa-lenticchie',
    nome: 'Zuppa di lenticchie e cavolo nero',
    porzioni: 2,
    ingredienti: [
      { fid: 'lenticchie-secche', g: 120 },
      { fid: 'cavolo-nero', g: 300 },
      { fid: 'olio-evo', g: 15 },
    ],
  },
  {
    id: 'r-greco-noci',
    nome: 'Yogurt greco con noci e frutti di bosco',
    porzioni: 1,
    ingredienti: [
      { fid: 'yogurt-greco', g: 170 },
      { fid: 'noci', g: 15 },
      { fid: 'frutti-bosco', g: 50 },
    ],
  },
  {
    id: 'r-uova-avocado',
    nome: 'Uova strapazzate e avocado',
    porzioni: 1,
    ingredienti: [
      { fid: 'uova', g: 165 },
      { fid: 'avocado', g: 75 },
      { fid: 'burro', g: 5 },
    ],
  },
];
