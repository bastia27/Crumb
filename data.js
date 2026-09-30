// CRUMB — database alimenti precaricato.
// Valori per 100 g di parte edibile (fonti: tabelle CREA / USDA, arrotondati).
// cn = carboidrati NETTI (totali − fibra). na = sodio in mg.
// unita: grammi per misura casalinga specifica dell'alimento (sovrascrive i default).
'use strict';

const ALIMENTI_BASE = [
  // — Carne bianca
  { id: 'pollo', nome: 'Petto di pollo', alias: ['pollo', 'petto pollo', 'petto di pollo'], kcal: 100, p: 23.3, cn: 0, f: 0, na: 60, porz: 150, tag: ['carne-bianca'], unita: { fetta: 100 } },
  { id: 'tacchino', nome: 'Fesa di tacchino', alias: ['tacchino', 'fesa tacchino', 'petto di tacchino'], kcal: 107, p: 24, cn: 0, f: 0, na: 50, porz: 150, tag: ['carne-bianca'], unita: { fetta: 100 } },
  { id: 'uova', nome: 'Uova', alias: ['uovo', 'uova', 'uova intere'], kcal: 128, p: 12.4, cn: 0, f: 0, na: 137, porz: 110, tag: [], unita: { pezzo: 55 } },
  { id: 'albume', nome: 'Albume', alias: ['albume', 'albumi', 'chiara d uovo'], kcal: 43, p: 10.7, cn: 0.7, f: 0, na: 179, porz: 100, tag: [], unita: { pezzo: 33 } },

  // — Pesce
  { id: 'merluzzo', nome: 'Merluzzo', alias: ['merluzzo', 'nasello', 'baccala dissalato'], kcal: 71, p: 17, cn: 0, f: 0, na: 77, porz: 200, tag: ['pesce'] },
  { id: 'platessa', nome: 'Platessa', alias: ['platessa', 'filetti di platessa'], kcal: 86, p: 18.8, cn: 0, f: 0, na: 100, porz: 200, tag: ['pesce'] },
  { id: 'branzino', nome: 'Branzino', alias: ['branzino', 'spigola'], kcal: 97, p: 18.4, cn: 0, f: 0, na: 70, porz: 250, tag: ['pesce'] },
  { id: 'orata', nome: 'Orata', alias: ['orata'], kcal: 121, p: 19.7, cn: 0, f: 0, na: 70, porz: 250, tag: ['pesce'] },
  { id: 'sgombro', nome: 'Sgombro', alias: ['sgombro', 'maccarello'], kcal: 170, p: 17, cn: 0, f: 0, na: 100, porz: 200, tag: ['pesce', 'pesce-azzurro'] },
  { id: 'alici', nome: 'Alici fresche', alias: ['alici', 'acciughe', 'acciuga', 'alice'], kcal: 96, p: 16.8, cn: 1.5, f: 0, na: 104, porz: 150, tag: ['pesce', 'pesce-azzurro'] },
  { id: 'sardine', nome: 'Sardine', alias: ['sardine', 'sarde', 'sardina'], kcal: 129, p: 20.8, cn: 0, f: 0, na: 100, porz: 150, tag: ['pesce', 'pesce-azzurro'] },
  { id: 'salmone-affumicato', nome: 'Salmone affumicato', alias: ['salmone affumicato', 'affumicato'], kcal: 147, p: 25.4, cn: 0, f: 0, na: 1880, porz: 100, tag: ['pesce', 'processato'], unita: { fetta: 15, confezione: 100 } },
  { id: 'salmone', nome: 'Salmone fresco', alias: ['salmone', 'salmone fresco', 'trancio di salmone'], kcal: 185, p: 20, cn: 0, f: 0, na: 59, porz: 150, tag: ['pesce'] },
  { id: 'tonno-naturale', nome: 'Tonno al naturale', alias: ['tonno', 'tonno al naturale', 'tonno in scatola'], kcal: 103, p: 23.3, cn: 0, f: 0, na: 320, porz: 80, tag: ['pesce', 'processato'], unita: { scatoletta: 56 } },
  { id: 'gamberi', nome: 'Gamberi', alias: ['gamberi', 'gamberetti', 'mazzancolle'], kcal: 71, p: 13.6, cn: 0.9, f: 0, na: 146, porz: 150, tag: ['pesce'] },

  // — Carne rossa
  { id: 'macinato-manzo', nome: 'Macinato di manzo', alias: ['macinato', 'macinato di manzo', 'carne macinata', 'hamburger', 'burger'], kcal: 176, p: 20, cn: 0, f: 0, na: 66, porz: 150, tag: ['carne-rossa'] },
  { id: 'manzo', nome: 'Manzo magro (bistecca)', alias: ['manzo', 'bistecca', 'fettina di manzo', 'tagliata', 'filetto di manzo'], kcal: 129, p: 21.5, cn: 0, f: 0, na: 60, porz: 180, tag: ['carne-rossa'], unita: { fetta: 120 } },

  // — Salumi (processati)
  { id: 'bresaola', nome: 'Bresaola', alias: ['bresaola'], kcal: 151, p: 32, cn: 0.4, f: 0, na: 1597, porz: 60, tag: ['carne-rossa', 'processato'], unita: { fetta: 8 } },
  { id: 'crudo', nome: 'Prosciutto crudo', alias: ['crudo', 'prosciutto crudo', 'prosciutto'], kcal: 224, p: 25.5, cn: 0, f: 0, na: 2578, porz: 50, tag: ['carne-rossa', 'processato'], unita: { fetta: 12 } },
  { id: 'cotto', nome: 'Prosciutto cotto', alias: ['cotto', 'prosciutto cotto'], kcal: 215, p: 19.8, cn: 0.9, f: 0, na: 648, porz: 50, tag: ['carne-rossa', 'processato'], unita: { fetta: 15 } },
  { id: 'speck', nome: 'Speck', alias: ['speck'], kcal: 303, p: 28.3, cn: 0.5, f: 0, na: 1810, porz: 50, tag: ['carne-rossa', 'processato'], unita: { fetta: 10 } },
  { id: 'mortadella', nome: 'Mortadella', alias: ['mortadella'], kcal: 317, p: 14.7, cn: 0.5, f: 0, na: 1000, porz: 50, tag: ['carne-rossa', 'processato'], unita: { fetta: 15 } },
  { id: 'salame', nome: 'Salame', alias: ['salame', 'salamino'], kcal: 392, p: 26.7, cn: 1.5, f: 0, na: 1500, porz: 40, tag: ['carne-rossa', 'processato'], unita: { fetta: 8 } },
  { id: 'salsiccia', nome: 'Salsiccia', alias: ['salsiccia', 'salsicce'], kcal: 304, p: 15.4, cn: 0.6, f: 0, na: 800, porz: 150, tag: ['carne-rossa', 'processato'], unita: { pezzo: 100 } },

  // — Latticini
  { id: 'parmigiano', nome: 'Parmigiano', alias: ['parmigiano', 'parmigiano reggiano', 'grana', 'grana padano'], kcal: 392, p: 33.5, cn: 0, f: 0, na: 600, porz: 30, tag: ['latticino'], unita: { cucchiaio: 5, cucchiaino: 2 } },
  { id: 'pecorino', nome: 'Pecorino', alias: ['pecorino', 'pecorino romano'], kcal: 387, p: 28.5, cn: 0.2, f: 0, na: 1800, porz: 30, tag: ['latticino'], unita: { cucchiaio: 5, cucchiaino: 2 } },
  { id: 'asiago', nome: 'Asiago', alias: ['asiago'], kcal: 360, p: 30, cn: 0.5, f: 0, na: 1000, porz: 40, tag: ['latticino'], unita: { fetta: 20 } },
  { id: 'scamorza', nome: 'Scamorza', alias: ['scamorza', 'scamorza affumicata', 'provola'], kcal: 334, p: 25, cn: 1, f: 0, na: 800, porz: 80, tag: ['latticino'], unita: { fetta: 20 } },
  { id: 'mozzarella', nome: 'Mozzarella', alias: ['mozzarella', 'fior di latte'], kcal: 253, p: 18.7, cn: 0.7, f: 0, na: 196, porz: 125, tag: ['latticino'], unita: { pezzo: 125, fetta: 25 } },
  { id: 'bufala', nome: 'Mozzarella di bufala', alias: ['bufala', 'mozzarella di bufala', 'mozzarella bufala'], kcal: 288, p: 16.7, cn: 0.4, f: 0, na: 180, porz: 125, tag: ['latticino'], unita: { pezzo: 125, fetta: 25 } },
  { id: 'ricotta', nome: 'Ricotta', alias: ['ricotta', 'ricotta vaccina'], kcal: 146, p: 8.8, cn: 3.5, f: 0, na: 78, porz: 100, tag: ['latticino'], unita: { cucchiaio: 25 } },
  { id: 'stracchino', nome: 'Stracchino', alias: ['stracchino', 'crescenza'], kcal: 300, p: 18.5, cn: 0, f: 0, na: 600, porz: 80, tag: ['latticino'] },
  { id: 'jocca', nome: 'Jocca (fiocchi di latte)', alias: ['jocca', 'fiocchi di latte', 'cottage cheese', 'cottage'], kcal: 100, p: 11.5, cn: 3.3, f: 0, na: 350, porz: 175, tag: ['latticino'], unita: { vasetto: 175, pezzo: 175 } },
  { id: 'yogurt-greco', nome: 'Yogurt greco 2%', alias: ['yogurt greco', 'greco', 'yogurt', 'fage', 'yogurt greco 2'], kcal: 73, p: 9.9, cn: 3, f: 0, na: 37, porz: 170, tag: ['latticino'], unita: { vasetto: 170, pezzo: 170, cucchiaio: 20 } },
  { id: 'latte', nome: 'Latte parzialmente scremato', alias: ['latte', 'latte ps', 'latte parzialmente scremato'], kcal: 46, p: 3.5, cn: 5, f: 0, na: 44, porz: 200, tag: ['latticino'], unita: { tazza: 250, bicchiere: 200 } },
  { id: 'burro', nome: 'Burro', alias: ['burro'], kcal: 758, p: 0.8, cn: 1.1, f: 0, na: 7, porz: 10, tag: ['latticino', 'grasso'], unita: { cucchiaio: 12, cucchiaino: 5, noce: 10 } },

  // — Grassi, frutta secca
  { id: 'olio-evo', nome: 'Olio EVO', alias: ['olio', 'olio evo', 'evo', 'olio d oliva', 'olio extravergine', 'olio di oliva'], kcal: 899, p: 0, cn: 0, f: 0, na: 0, porz: 10, tag: ['grasso'], unita: { cucchiaio: 10, cucchiaino: 4, filo: 5 } },
  { id: 'avocado', nome: 'Avocado', alias: ['avocado'], kcal: 160, p: 2, cn: 1.8, f: 6.7, na: 7, porz: 100, tag: ['grasso'], unita: { pezzo: 150 } },
  { id: 'mandorle', nome: 'Mandorle', alias: ['mandorle', 'mandorla'], kcal: 579, p: 21.2, cn: 9.1, f: 12.5, na: 1, porz: 30, tag: ['frutta-secca'], unita: { pezzo: 1.2 } },
  { id: 'noci', nome: 'Noci', alias: ['noci', 'noce', 'gherigli'], kcal: 654, p: 15.2, cn: 7, f: 6.7, na: 2, porz: 30, tag: ['frutta-secca'], unita: { pezzo: 5 } },
  { id: 'burro-arachidi', nome: 'Burro di arachidi', alias: ['burro di arachidi', 'arachidi', 'peanut butter'], kcal: 588, p: 25, cn: 14, f: 6, na: 17, porz: 20, tag: ['frutta-secca', 'grasso'], unita: { cucchiaio: 16, cucchiaino: 6 } },
  { id: 'olive', nome: 'Olive', alias: ['olive', 'oliva', 'olive verdi', 'olive nere'], kcal: 145, p: 1, cn: 0.5, f: 3.3, na: 1556, porz: 30, tag: ['grasso', 'processato'], unita: { pezzo: 4 } },

  // — Verdure
  { id: 'zucchine', nome: 'Zucchine', alias: ['zucchine', 'zucchina', 'zucchini'], kcal: 17, p: 1.2, cn: 2.1, f: 1, na: 8, porz: 200, tag: ['verdura'], unita: { pezzo: 200 } },
  { id: 'melanzane', nome: 'Melanzane', alias: ['melanzane', 'melanzana'], kcal: 25, p: 1, cn: 2.9, f: 3, na: 2, porz: 200, tag: ['verdura'], unita: { pezzo: 300 } },
  { id: 'cicoria', nome: 'Cicoria', alias: ['cicoria', 'catalogna', 'puntarelle'], kcal: 23, p: 1.7, cn: 0.7, f: 4, na: 45, porz: 200, tag: ['verdura'] },
  { id: 'spinaci', nome: 'Spinaci', alias: ['spinaci', 'spinacio'], kcal: 23, p: 2.9, cn: 1.4, f: 2.2, na: 79, porz: 200, tag: ['verdura'] },
  { id: 'broccoli', nome: 'Broccoli', alias: ['broccoli', 'broccolo', 'cime di rapa'], kcal: 34, p: 2.8, cn: 4.4, f: 2.6, na: 33, porz: 200, tag: ['verdura'] },
  { id: 'cavolfiore', nome: 'Cavolfiore', alias: ['cavolfiore', 'cavolfiori'], kcal: 25, p: 1.9, cn: 3, f: 2, na: 30, porz: 200, tag: ['verdura'] },
  { id: 'misticanza', nome: 'Misticanza', alias: ['misticanza', 'insalata', 'insalata mista', 'lattuga', 'rucola', 'valeriana', 'songino'], kcal: 17, p: 1.4, cn: 1.2, f: 1.8, na: 28, porz: 80, tag: ['verdura'] },
  { id: 'finocchio', nome: 'Finocchio', alias: ['finocchio', 'finocchi'], kcal: 31, p: 1.2, cn: 4.2, f: 3.1, na: 52, porz: 200, tag: ['verdura'], unita: { pezzo: 250 } },
  { id: 'pomodori', nome: 'Pomodori', alias: ['pomodori', 'pomodoro', 'pomodorini', 'ciliegini'], kcal: 19, p: 1, cn: 2.7, f: 1.2, na: 5, porz: 150, tag: ['verdura'], unita: { pezzo: 120 } },
  { id: 'peperoni', nome: 'Peperoni', alias: ['peperoni', 'peperone'], kcal: 26, p: 1, cn: 3.9, f: 2.1, na: 4, porz: 200, tag: ['verdura'], unita: { pezzo: 200 } },
  { id: 'funghi', nome: 'Funghi champignon', alias: ['funghi', 'fungo', 'champignon'], kcal: 22, p: 3.1, cn: 2.3, f: 1, na: 5, porz: 150, tag: ['verdura'] },
  { id: 'cavolo-nero', nome: 'Cavolo nero', alias: ['cavolo nero', 'cavolo', 'verza', 'cavoli'], kcal: 35, p: 2.9, cn: 4.4, f: 4.1, na: 53, porz: 200, tag: ['verdura'] },
  { id: 'asparagi', nome: 'Asparagi', alias: ['asparagi', 'asparago'], kcal: 20, p: 2.2, cn: 1.8, f: 2.1, na: 2, porz: 200, tag: ['verdura'] },
  { id: 'cetrioli', nome: 'Cetrioli', alias: ['cetrioli', 'cetriolo'], kcal: 15, p: 0.7, cn: 3.1, f: 0.5, na: 2, porz: 150, tag: ['verdura'], unita: { pezzo: 200 } },

  // — Legumi
  { id: 'lenticchie', nome: 'Lenticchie (cotte)', alias: ['lenticchie', 'lenticchie cotte', 'lenticchia'], kcal: 116, p: 9, cn: 12.2, f: 7.9, na: 2, porz: 150, tag: ['legume'] },
  { id: 'lenticchie-secche', nome: 'Lenticchie secche', alias: ['lenticchie secche', 'lenticchie crude'], kcal: 352, p: 24.6, cn: 52.7, f: 10.7, na: 6, porz: 50, tag: ['legume'] },
  { id: 'ceci', nome: 'Ceci (cotti)', alias: ['ceci', 'ceci cotti', 'cece'], kcal: 164, p: 8.9, cn: 19.8, f: 7.6, na: 7, porz: 150, tag: ['legume'] },
  { id: 'fagioli', nome: 'Fagioli (cotti)', alias: ['fagioli', 'fagioli cotti', 'borlotti', 'cannellini', 'fagiolo'], kcal: 127, p: 8.7, cn: 16.4, f: 6.4, na: 2, porz: 150, tag: ['legume'] },

  // — Cereali e sostituti
  { id: 'pasta', nome: 'Pasta (secca)', alias: ['pasta', 'spaghetti', 'penne', 'fusilli', 'rigatoni'], kcal: 353, p: 12, cn: 71, f: 2.7, na: 3, porz: 80, tag: ['cereale'] },
  { id: 'riso', nome: 'Riso (crudo)', alias: ['riso', 'riso basmati', 'risotto'], kcal: 360, p: 7, cn: 78.7, f: 1.3, na: 5, porz: 80, tag: ['cereale'] },
  { id: 'pane-integrale', nome: 'Pane integrale', alias: ['pane integrale', 'pane', 'fetta di pane'], kcal: 224, p: 7.5, cn: 42, f: 6.5, na: 530, porz: 50, tag: ['cereale'], unita: { fetta: 35 } },
  { id: 'shirataki', nome: 'Konjac / shirataki', alias: ['konjac', 'shirataki', 'pasta konjac', 'pasta di konjac', 'noodles konjac'], kcal: 9, p: 0, cn: 0, f: 3, na: 5, porz: 200, tag: [], unita: { confezione: 200 } },

  // — Frutta e altro
  { id: 'mela', nome: 'Mela', alias: ['mela', 'mele'], kcal: 52, p: 0.3, cn: 11.4, f: 2.4, na: 1, porz: 180, tag: [], unita: { pezzo: 180 } },
  { id: 'frutti-bosco', nome: 'Frutti di bosco', alias: ['frutti di bosco', 'mirtilli', 'lamponi', 'fragole', 'more'], kcal: 43, p: 0.9, cn: 6.5, f: 3.5, na: 1, porz: 100, tag: [], unita: { manciata: 50 } },
  { id: 'fondente', nome: 'Cioccolato fondente 85%', alias: ['cioccolato', 'fondente', 'cioccolato fondente', 'cioccolata'], kcal: 580, p: 12.5, cn: 19, f: 11, na: 20, porz: 20, tag: [], unita: { quadratino: 5, pezzo: 5 } },
  { id: 'proteine-whey', nome: 'Proteine whey', alias: ['whey', 'proteine', 'proteine in polvere', 'shake', 'misurino'], kcal: 380, p: 78, cn: 6, f: 0, na: 200, porz: 30, tag: ['latticino'], unita: { misurino: 30, pezzo: 30 } },
];

// Grammi per le misure casalinghe quando l'alimento non ne definisce una propria.
const MISURE_DEFAULT = {
  cucchiaio: 15,
  cucchiaino: 5,
  fetta: 30,
  manciata: 30,
  tazza: 200,
  bicchiere: 200,
  vasetto: 125,
  scatoletta: 80,
  confezione: 100,
  filo: 5,
  noce: 10,
  quadratino: 5,
  misurino: 30,
};

const TAG_DISPONIBILI = ['pesce', 'pesce-azzurro', 'carne-bianca', 'carne-rossa', 'processato', 'latticino', 'verdura', 'legume', 'frutta-secca', 'cereale', 'grasso'];
