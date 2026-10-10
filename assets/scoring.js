/* Fórmula 88: cálculo de pontuações e classificações.
   Tudo o que aparece no site é calculado aqui a partir dos ficheiros em data/. */
(function (root) {
  'use strict';

  function compute(season, races) {
    var P = season.points;
    var held = races.filter(function (r) { return Array.isArray(r.results); });
    var dropActive = held.length >= (season.dropWorstFromRace || Infinity);

    var teamOf = {};
    (season.teams || []).forEach(function (t) {
      t.drivers.forEach(function (d) { teamOf[d] = t; });
    });

    var drivers = season.drivers.map(function (d) {
      var rs = held.map(function (r) {
        var e = r.results.filter(function (x) { return x.driver === d.id; })[0];
        if (!e) return { race: r.id, attended: false, status: 'DNS', base: 0, fl: 0, pts: 0, dropped: false };
        var dsq = e.status === 'DSQ';
        var base = dsq ? 0 : ((e.pos ? (P.positions[e.pos - 1] || 0) : 0) + P.presence);
        var fl = (!dsq && r.fastestLap === d.id) ? P.fastestLap : 0;
        return {
          race: r.id, attended: true, pos: e.pos || null, status: e.status || null,
          grid: e.grid == null ? null : e.grid, bestLap: e.bestLap || null,
          penalty: e.penalty || 0, base: base, fl: fl, pts: base + fl, dropped: false
        };
      });

      var total = rs.reduce(function (s, x) { return s + x.pts; }, 0);
      var droppedPts = 0;
      if (dropActive) {
        // Subtrai-se a pior pontuação; um DSQ não pode ser subtraído.
        // O ponto da volta mais rápida mantém-se mesmo na prova subtraída.
        var worst = null;
        rs.forEach(function (x) {
          if (x.status === 'DSQ') return;
          if (worst === null || x.base < worst.base) worst = x;
        });
        if (worst) { worst.dropped = true; droppedPts = worst.base; }
      }

      var finishes = {};
      var gained = 0, gainedKnown = false;
      rs.forEach(function (x) {
        if (!x.attended || x.status === 'DSQ' || !x.pos) return;
        finishes[x.pos] = (finishes[x.pos] || 0) + 1;
        if (x.grid != null) { gained += x.grid - x.pos; gainedKnown = true; }
      });
      var classified = rs.filter(function (x) { return x.attended && x.pos && x.status !== 'DSQ' && x.status !== 'DNF'; });

      return {
        id: d.id, name: d.name, team: teamOf[d.id] || null, races: rs,
        total: total, geral: total - droppedPts,
        presences: rs.filter(function (x) { return x.attended; }).length,
        wins: classified.filter(function (x) { return x.pos === 1; }).length,
        podiums: classified.filter(function (x) { return x.pos <= 3; }).length,
        fastestLaps: rs.filter(function (x) { return x.fl > 0; }).length,
        gained: gainedKnown ? gained : null,
        finishes: finishes
      };
    });

    var maxPos = 0;
    drivers.forEach(function (d) { Object.keys(d.finishes).forEach(function (k) { maxPos = Math.max(maxPos, +k); }); });

    drivers.sort(function (a, b) {
      if (b.geral !== a.geral) return b.geral - a.geral;
      // Desempate: mais 1ºs lugares, depois 2ºs, 3ºs, ...
      for (var p = 1; p <= maxPos; p++) {
        var fa = a.finishes[p] || 0, fb = b.finishes[p] || 0;
        if (fa !== fb) return fb - fa;
      }
      return a.name.localeCompare(b.name, 'pt');
    });
    drivers.forEach(function (d, i) { d.rank = i + 1; });

    var byId = {};
    drivers.forEach(function (d) { byId[d.id] = d; });

    var teams = (season.teams || []).map(function (t) {
      var members = t.drivers.map(function (id) { return byId[id]; }).filter(Boolean);
      return { id: t.id, name: t.name, members: members, pts: members.reduce(function (s, m) { return s + m.geral; }, 0) };
    });
    teams.sort(function (a, b) { return b.pts - a.pts || a.name.localeCompare(b.name, 'pt'); });
    teams.forEach(function (t, i) { t.rank = i + 1; });

    return { drivers: drivers, driverById: byId, teams: teams, held: held, dropActive: dropActive };
  }

  var api = { compute: compute };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.F88Scoring = api;
})(typeof window !== 'undefined' ? window : this);
