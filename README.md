# Crumb

## Simulatore “lascia o raddoppia” su turbo long

`simulatore-turbo.html` è una singola pagina statica (HTML + JS, nessun backend) che simula con il metodo Monte Carlo una strategia di giocate ripetute con piccole cifre su certificati turbo long open-end.

- Si apre direttamente dal file o da qualsiasi hosting statico. Il calcolo gira in un Web Worker; se il worker non è disponibile, gira nel thread principale.
- Facoltativo: stima la volatilità da prezzi storici reali (Twelve Data o Alpha Vantage con una tua chiave API gratuita, oppure incollando i prezzi).
- Le ipotesi del modello sono descritte nella pagina stessa (sezione “Ipotesi del modello”).

Simulazione didattica: non è una previsione né una consulenza finanziaria.
