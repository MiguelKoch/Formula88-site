# Fórmula 88

The league website. It is a plain static site: no build step, no database, no accounts.
Everything on screen (points, standings, team totals, driver stats) is calculated in the
browser from the small data files in `data/`.

## How the data is organised

```
data/
  seasons.json              list of seasons, and which one is current
  2027/
    season.json             drivers, teams, points system and calendar for the season
    races/<race-id>.json    one file per race that has been run
```

### Adding a race result

1. Create `data/<season>/races/<race-id>.json`:

   ```json
   {
     "race": "braga",
     "fastestLap": "pedro-gomes",
     "results": [
       { "driver": "pedro-gomes", "pos": 1, "grid": 12, "bestLap": "0:57.128" },
       { "driver": "bruno-silva", "pos": 2, "grid": 9, "bestLap": "0:57.858", "penalty": 5 },
       { "driver": "carlos-campos", "pos": 12, "status": "DNF" }
     ]
   }
   ```

   - `pos` is the final classification, after any penalties.
   - `grid`, `bestLap` and `penalty` (seconds) are optional.
   - `status` is optional: `"DNF"` or `"DSQ"`.
   - Drivers who did not race are simply left out (they count as DNS).

2. In `data/<season>/season.json`, set `"hasResults": true` on that race.

That is all. Points, the dropped worst result, tie-breaks and team totals update by themselves.

### Adding a race replay

The replay on a race page is rebuilt from lap times, so it needs every driver's time for every lap.

1. Create `data/<season>/replays/<race-id>.json`:

   ```json
   {
     "track": [[5.98, 1.10], [4.56, 1.10], [3.72, 1.06]],
     "drivers": [
       { "name": "David Santos", "laps": [65.394, 59.105, 57.903] },
       { "name": "Gonçalo Portugal", "laps": [68.159, 59.727, 58.141] }
     ]
   }
   ```

   - `track` is the outline of the circuit as a closed loop of control points (any scale); the
     first point is the start/finish line. About 30 to 60 points is enough.
   - Add `"yDown": true` when the outline was traced over an image (y grows downwards); without it y is
     taken to grow upwards.
   - `laps` are in seconds, in order. A driver who stopped early simply has fewer laps.
   - Drivers here are matched by nothing: guests who are not in the league can be included.

2. In `data/<season>/season.json`, set `"hasReplay": true` on that race.

### Pictures on the cards

Optional. Put the files in `assets/img/` and point to them from `data/<season>/season.json`:

- a race: `"image": "assets/img/pistas/viana.jpg"` (shown across the top of its card in Provas);
- a driver: `"photo": "assets/img/pilotos/pedro-gomes.jpg"` (shown as a circle on the card in Pilotos).

Without those fields the cards look as before. Keep the files small (about 600 px wide is plenty).

### Adding a driver, a team or a race to the calendar

Edit `data/<season>/season.json`:

- `drivers`: `{ "id": "nome-apelido", "name": "Nome Apelido" }`. The `id` is what race files refer to.
- `teams`: `{ "id": "nome-da-equipa", "name": "Nome da Equipa", "drivers": ["id-1", "id-2"] }`.
- `races`: `{ "id": "braga", "name": "Braga", "track": "Kartódromo de Braga", "date": "2027-03-14", "karts": "390cc", "duration": "15 min", "surface": "Seco", "ballast": true, "hasResults": false }`.
  Everything except `id` and `name` is optional.

### Changing the points system

`points` in `season.json`: points per finishing position, the presence bonus and the fastest-lap
bonus. `dropWorstFromRace` is the race number from which each driver's worst score is dropped.

### Starting a new season

Copy a season folder, empty its `races` list and `races/` folder, add it to the top of
`data/seasons.json` and set `current` to it. Older seasons stay available as an archive.

## Excel export

The "Exportar .xlsx" buttons on the standings and race pages build the spreadsheet in the
visitor's browser from the same data (`assets/xlsx.js`); nothing needs to be maintained.

## Other things

- `content/regulamento.html` is the rulebook text.
- `assets/app.js` has the list of liveries (`LIVERIES`) and the default one (`DEFAULT_LIVERY`);
  the colours for each are at the top of `assets/style.css`.
- The visitor's livery choice is kept in their own browser (local storage). The site sets no
  cookies and loads nothing from other websites; the fonts are in `assets/fonts/` (all under the
  SIL Open Font License).

## After changing the design or the code

`index.html` loads the stylesheet and the scripts in `assets/` with a version
tag (`?v=...`). Change that tag (on every line that has it) whenever one of those files changes, so visitors get the new
version on a normal page load instead of a cached copy. Data files in `data/` do not need this:
the site re-checks them on every visit.

## Running it locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk will not work, because
browsers block a page from reading data files that way.

## Publishing on GitHub Pages

Repository **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`,
folder `/ (root)`. The site appears at `https://<username>.github.io/<repository>/` a minute later.
