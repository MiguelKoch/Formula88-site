/* Fórmula 88: páginas do site. Lê os ficheiros em data/ e desenha tudo no browser. */
(function () {
  'use strict';

  var LIVERIES = [
    { id: 'escuro', name: 'Default', sw: ['#0F1214', '#F2C230', '#0F1214'] },
    { id: 'retro', name: 'Retro 88', sw: ['#14213D', '#FFC43D', '#FF7A66'] },
    { id: 'riscas', name: 'Martini Racing', sw: ['#FFFFFF', '#0B1F4B', '#D8232A'] },
    { id: 'azul-laranja', name: 'Gulf', sw: ['#9AD4EA', '#F26A1B', '#10244A'] },
    { id: 'preto-dourado', name: 'Lotus 72D', sw: ['#0A0A0A', '#C9A227', '#0A0A0A'] },
    { id: 'verde-amarelo', name: 'Lotus 49', sw: ['#0B3D2A', '#F7D417', '#0B3D2A'] },
    { id: 'vermelho-branco', name: 'McLaren Senna', sw: ['#D01F15', '#FFFFFF', '#D01F15'] },
    { id: 'prata', name: 'McLaren Hamilton', sw: ['#D5D9DD', '#E2231A', '#16181A'] },
    { id: 'fluo', name: 'Brawn GP', sw: ['#FFFFFF', '#D2F000', '#111111'] },
    { id: 'arcade', name: 'Arcade', sw: ['#0B0B14', '#FF4FA0', '#3CE6E6'] }
  ];
  var DEFAULT_LIVERY = 'escuro';

  var S = window.F88Scoring;
  var I = window.F88I18n, L = I.L, ord = I.ord;
  function SN(season) { return I.data(season.name); }
  var app = document.getElementById('app');
  var cfg = null;
  var cache = {};
  var current = null;        // temporada que está no ecrã, para a exportação
  var activeReplay = null;   // replay a correr, para o parar ao mudar de página

  // ---------- utilitários ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(L('Não foi possível ler ', 'Could not read ') + path);
      return r.json();
    });
  }
  function parts(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; }
  function fmtDate(iso) { var p = parts(iso); return p ? p.d + ' ' + I.months()[p.m] + ' ' + p.y : L('Data por anunciar', 'Date to be announced'); }
  function fmtLong(iso) { var p = parts(iso); return p ? (I.lang === 'en' ? p.d + ' ' + I.monthsLong()[p.m] + ' ' + p.y : p.d + ' de ' + I.monthsLong()[p.m] + ' de ' + p.y) : L('Data por anunciar', 'Date to be announced'); }
  function fmtShort(iso) { var p = parts(iso); return p ? p.d + ' ' + I.months()[p.m] : L('por anunciar', 'TBA'); }
  function posLabel(x) {
    if (!x.attended) return '—';
    if (x.status === 'DSQ') return 'DSQ';
    if (x.status === 'DNF') return 'DNF';
    return ord(x.pos);
  }
  function link(sid, parts) { return '#/' + [sid].concat(parts || []).join('/'); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function loadSeason(id) {
    if (cache[id]) return cache[id];
    cache[id] = getJSON('data/' + id + '/season.json').then(function (season) {
      return Promise.all(season.races.map(function (r) {
        if (!r.hasResults) return Object.assign({}, r, { results: null });
        return getJSON('data/' + id + '/races/' + r.id + '.json').then(function (f) {
          return Object.assign({}, r, f);
        });
      })).then(function (races) {
        return { season: season, races: races, calc: S.compute(season, races) };
      });
    });
    return cache[id];
  }
  function seasonName(id) {
    var s = cfg.seasons.filter(function (x) { return x.id === id; })[0];
    return s ? I.data(s.name) : id;
  }
  function previousSeasonId(id) {
    var ids = cfg.seasons.map(function (x) { return x.id; });
    var i = ids.indexOf(id);
    return i >= 0 && i + 1 < ids.length ? ids[i + 1] : null;
  }

  // ---------- peças comuns ----------
  function pageHead(eyebrow, title, extra) {
    return '<div class="page-head"><div><p class="eyebrow">' + esc(eyebrow) + '</p><h1>' + esc(title) + '</h1></div>' + (extra || '') + '</div>';
  }
  function back(href, label) { return '<a class="back" href="' + href + '">← ' + esc(label) + '</a>'; }
  function empty(msg) { return '<p class="empty">' + esc(msg) + '</p>'; }
  function statBoxes(items) {
    return '<div class="stats">' + items.map(function (s) {
      return '<div class="stat"><div class="stat-v' + (s.cls ? ' ' + s.cls : '') + '">' + esc(s.v) + '</div><div class="stat-l">' + esc(s.l) + '</div>' + (s.sub ? '<div class="stat-s">' + esc(s.sub) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function legend(D) {
    return '<ul class="legend"><li><span class="fl">' + L('Destaque', 'Highlighted') + '</span> = ' + L('volta mais rápida da prova (+' + D.season.points.fastestLap + ' ponto)', 'fastest lap of the race (+' + D.season.points.fastestLap + ' point)') + '</li>' +
      (D.calc.dropActive ? '<li><span class="dropped">' + L('Riscado', 'Struck out') + '</span> = ' + L('pior resultado, descontado no Geral', 'worst result, dropped from the overall total') + '</li>' : '') +
      '<li>— = ' + L('não participou (DNS)', 'did not take part (DNS)') + '</li></ul>';
  }

  // ---------- páginas ----------
  function home(D, sid) {
    var c = D.calc, held = c.held, h = '';
    var total = D.season.races.length;
    var status = held.length ? (I.lang === 'en' ? held.length + (total ? ' of ' + total : '') + (total === 1 || (!total && held.length === 1) ? ' race' : ' races') + ' run' : plural(held.length, 'prova disputada', 'provas disputadas') + (total ? ' de ' + total : '')) : L('A temporada ainda não arrancou', 'The season has not started yet');
    h += '<section class="hero"><p class="eyebrow accent">' + esc(SN(D.season)) + ' · ' + esc(status) + '</p>' +
      '<h1>' + L('A melhor liga de karts acima do Mondego', 'The best karting league north of the Mondego') + '</h1>' +
      '<p class="actions"><a class="btn" href="' + link(sid, ['classificacao']) + '">' + L('Ver classificação', 'See the standings') + '</a>' +
      '<a class="btn ghost" href="' + link(sid, ['regulamento']) + '">' + L('Ler o regulamento', 'Read the rules') + '</a>' +
      '<button type="button" class="btn ghost" data-install hidden>' + L('Instalar app', 'Install app') + '</button></p></section>';

    if (held.length) {
      h += '<div class="cards">' + podiumCards(D, sid) + '</div>';
      return Promise.resolve(h + calendarStrip(D, sid));
    }
    var prev = previousSeasonId(sid);
    if (!prev) return Promise.resolve(h + calendarStrip(D, sid));
    return loadSeason(prev).then(function (PD) {
      var ph = '';
      if (PD.calc.held.length) {
        ph = '<h2>' + (I.lang === 'en' ? 'How ' + esc(SN(PD.season)) + ' ended' : 'Como acabou a ' + esc(PD.season.name.toLowerCase())) + '</h2><div class="cards">' + podiumCards(PD, prev) + '</div>';
      }
      return h + calendarStrip(D, sid) + ph;
    });
  }

  function podiumCards(D, sid) {
    var c = D.calc, h = '';
    var top = c.drivers.filter(function (d) { return d.presences > 0; }).slice(0, 3);
    h += '<div class="card"><p class="card-k">' + L('Pilotos', 'Drivers') + ' · Top 3</p>' + top.map(function (d) {
      return '<a class="rowlink" href="' + link(sid, ['piloto', d.id]) + '"><span class="num">' + d.rank + '</span><span class="grow">' + esc(d.name) + '</span><span class="pts">' + d.geral + '</span></a>';
    }).join('') + '<a class="more" href="' + link(sid, ['classificacao']) + '">' + L('Classificação completa', 'Full standings') + ' →</a></div>';

    var last = c.held[c.held.length - 1];
    var pod = last.results.filter(function (e) { return e.pos && e.pos <= 3 && e.status !== 'DSQ'; }).sort(function (a, b) { return a.pos - b.pos; });
    h += '<div class="card"><p class="card-k">' + L('Última prova', 'Last race') + ' · ' + esc(fmtDate(last.date)) + '</p><p class="card-t">' + esc(last.name) + '</p>' + pod.map(function (e) {
      var d = c.driverById[e.driver];
      return '<div class="kv"><span>' + (e.pos === 1 ? L('Vencedor', 'Winner') : ord(e.pos)) + '</span><strong' + (e.pos === 1 ? ' class="accent"' : '') + '>' + esc(d ? d.name : e.driver) + '</strong></div>';
    }).join('') + '<a class="more" href="' + link(sid, ['prova', last.id]) + '">' + L('Resultados da prova', 'Race results') + ' →</a></div>';

    if (c.teams.length) {
      h += '<div class="card"><p class="card-k">' + L('Equipas', 'Teams') + ' · Top 3</p>' + c.teams.slice(0, 3).map(function (t) {
        return '<div class="rowlink"><span class="num">' + t.rank + '</span><span class="grow">' + esc(t.name) + '</span><span class="pts">' + t.pts + '</span></div>';
      }).join('') + '<a class="more" href="' + link(sid, ['equipas']) + '">' + L('Todas as equipas', 'All teams') + ' →</a></div>';
    }
    return h;
  }

  function calendarStrip(D, sid) {
    var h = '<h2>' + L('Calendário', 'Calendar') + '</h2>';
    if (!D.races.length) return h + empty(L('Calendário por anunciar.', 'Calendar to be announced.'));
    return h + '<div class="strip">' + D.races.map(function (r) {
      var note = L('Por disputar', 'Not raced yet');
      if (r.results) {
        var w = r.results.filter(function (e) { return e.pos === 1; })[0];
        var d = w && D.calc.driverById[w.driver];
        note = d ? d.name : L('Disputada', 'Raced');
      }
      return '<a class="chip' + (r.results ? ' done' : '') + '" href="' + link(sid, ['prova', r.id]) + '"><span class="chip-d">' + esc(fmtShort(r.date)) + '</span><span class="chip-n">' + esc(r.name) + '</span><span class="chip-s">' + esc(note) + '</span></a>';
    }).join('') + '</div>';
  }

  function standings(D, sid) {
    var c = D.calc, held = c.held;
    var total = D.season.races.length;
    var h = pageHead(SN(D.season) + (held.length ? ' · ' + held.length + (total ? L(' de ', ' of ') + total : '') + L(' provas', ' races') : ''), L('Classificação geral', 'Overall standings'),
      '<p class="tabs"><a class="tab on" href="' + link(sid, ['classificacao']) + '">' + L('Pilotos', 'Drivers') + '</a><a class="tab" href="' + link(sid, ['equipas']) + '">' + L('Equipas', 'Teams') + '</a></p>');
    if (!held.length) return h + empty(L('Ainda não há provas disputadas nesta temporada. A classificação aparece aqui depois da primeira prova.', 'No races have been run this season yet. The standings appear here after the first race.'));
    var rows = c.drivers.filter(function (d) { return d.presences > 0; });
    h += '<div class="table-wrap"><table class="grid standings"><thead><tr><th class="c-pos" scope="col">Pos</th><th class="c-name" scope="col">' + L('Piloto', 'Driver') + '</th>' +
      held.map(function (r) {
        return '<th scope="col"><a href="' + link(sid, ['prova', r.id]) + '">' + esc(r.name) + '<small>' + esc(fmtShort(r.date)) + '</small></a></th>';
      }).join('') + '<th class="c-num" scope="col">Total</th><th class="c-num c-geral" scope="col">' + L('Geral', 'Overall') + '</th></tr></thead><tbody>';
    rows.forEach(function (d) {
      h += '<tr><td class="c-pos' + (d.rank <= 3 ? ' top' : '') + '">' + d.rank + '</td><th class="c-name" scope="row"><a href="' + link(sid, ['piloto', d.id]) + '">' + esc(d.name) + '</a></th>' +
        d.races.map(function (x) {
          if (!x.attended) return '<td class="cell dns">—</td>';
          return '<td class="cell"><span class="p' + (x.fl ? ' fl' : '') + (x.pos === 1 && !x.status ? ' win' : '') + '">' + posLabel(x) + '</span><span class="s' + (x.dropped ? ' dropped' : '') + '">' + x.pts + ' pts</span></td>';
        }).join('') + '<td class="c-num muted">' + d.total + '</td><td class="c-num c-geral">' + d.geral + '</td></tr>';
    });
    h += '</tbody></table></div>' + legend(D) + '<p class="actions tight">' + '<button type="button" class="btn ghost small" data-export="season">' + L('Exportar .xlsx', 'Export .xlsx') + '</button>' + '</p><p class="hint">' + L('Toca num piloto ou numa prova para ver o detalhe. No telemóvel, desliza a tabela para o lado.', 'Tap a driver or a race for the details. On a phone, swipe the table sideways.') + '</p>';
    return h;
  }

  function teams(D, sid) {
    var c = D.calc;
    var h = pageHead(SN(D.season), L('Classificação de equipas', 'Team standings'),
      '<p class="tabs"><a class="tab" href="' + link(sid, ['classificacao']) + '">' + L('Pilotos', 'Drivers') + '</a><a class="tab on" href="' + link(sid, ['equipas']) + '">' + L('Equipas', 'Teams') + '</a></p>');
    if (!c.teams.length) return h + empty(L('Equipas por anunciar.', 'Teams to be announced.'));
    h += '<div class="table-wrap"><table class="grid"><thead><tr><th class="c-pos" scope="col">Pos</th><th scope="col" class="left">' + L('Equipa', 'Team') + '</th><th scope="col" class="left">' + L('Pilotos', 'Drivers') + '</th><th class="c-num c-geral" scope="col">' + L('Pontos', 'Points') + '</th></tr></thead><tbody>';
    c.teams.forEach(function (t) {
      h += '<tr><td class="c-pos' + (t.rank <= 3 && c.held.length ? ' top' : '') + '">' + (c.held.length ? t.rank : '·') + '</td><th scope="row" class="left strong">' + esc(t.name) + '</th><td class="left">' +
        t.members.map(function (m) { return '<a href="' + link(sid, ['piloto', m.id]) + '">' + esc(m.name) + '</a> <span class="muted">(' + m.geral + ')</span>'; }).join('<br>') +
        '</td><td class="c-num c-geral">' + t.pts + '</td></tr>';
    });
    return h + '</tbody></table></div>' + (c.held.length ? '<p class="actions tight">' + '<button type="button" class="btn ghost small" data-export="season">' + L('Exportar .xlsx', 'Export .xlsx') + '</button>' + '</p>' : '') + '<p class="hint">' + L('Os pontos de uma equipa são a soma dos pontos dos seus pilotos na classificação geral.', 'A team\'s points are the sum of its drivers\' overall points.') + '</p>';
  }

  function racesList(D, sid) {
    var h = pageHead(SN(D.season) + (D.races.length ? ' · ' + plural(D.races.length, L('prova', 'race'), L('provas', 'races')) : ''), L('Provas', 'Races'));
    if (!D.races.length) return h + empty(L('Calendário por anunciar.', 'Calendar to be announced.'));
    return h + '<div class="cards">' + D.races.map(function (r, i) {
      var w = r.results && r.results.filter(function (e) { return e.pos === 1; })[0];
      var d = w && D.calc.driverById[w.driver];
      var meta = [r.karts, r.surface ? I.data(r.surface).toLowerCase() : null].filter(Boolean).join(' · ');
      return '<a class="card card-link' + (r.image ? ' has-img' : '') + '" href="' + link(sid, ['prova', r.id]) + '">' + (r.image ? '<img class="card-img" src="' + esc(r.image) + '" alt="" loading="lazy">' : '') + '<p class="card-k"><span>' + L('Prova ', 'Race ') + (i + 1) + '</span><span>' + esc(fmtDate(r.date)) + '</span></p><p class="card-t">' + esc(r.name) + '</p><p class="muted">' + esc(meta || ' ') + '</p>' +
        '<div class="kv"><span>' + L('Vencedor', 'Winner') + '</span><strong' + (d ? ' class="accent"' : '') + '>' + esc(d ? d.name : L('Por disputar', 'Not raced yet')) + '</strong></div></a>';
    }).join('') + '</div>';
  }

  function racePage(D, sid, rid) {
    var idx = -1;
    D.races.forEach(function (r, i) { if (r.id === rid) idx = i; });
    if (idx < 0) return notFound(sid);
    var r = D.races[idx], c = D.calc;
    var h = back(link(sid, ['provas']), L('Todas as provas', 'All races')) +
      pageHead(L('Prova ', 'Race ') + (idx + 1) + L(' de ', ' of ') + D.races.length + ' · ' + fmtLong(r.date), r.track || r.name);
    var facts = [];
    if (r.results) {
      var w = r.results.filter(function (e) { return e.pos === 1; })[0];
      if (w && c.driverById[w.driver]) facts.push({ l: L('Vencedor', 'Winner'), v: c.driverById[w.driver].name, cls: 'accent sm', sub: w.grid ? L('partiu de ', 'started ') + ord(w.grid) : '' });
      var fl = r.fastestLap && c.driverById[r.fastestLap];
      var fle = fl && r.results.filter(function (e) { return e.driver === r.fastestLap; })[0];
      if (fl) facts.push({ l: L('Volta mais rápida', 'Fastest lap'), v: (fle && fle.bestLap) || fl.name, cls: 'fl sm', sub: fle && fle.bestLap ? fl.name : '' });
    }
    if (r.karts) facts.push({ l: 'Karts', v: r.karts, cls: 'sm', sub: r.duration ? L('corrida de ', 'race of ') + r.duration : '' });
    if (r.surface) facts.push({ l: L('Piso', 'Track'), v: I.data(r.surface), cls: 'sm', sub: r.ballast === true ? L('com lastro', 'with ballast') : (r.ballast === false ? L('sem lastro', 'no ballast') : '') });
    if (r.results) facts.push({ l: L('Pilotos', 'Drivers'), v: String(r.results.length), cls: 'sm', sub: L('em pista', 'on track') });
    h += statBoxes(facts);
    if (r.hasReplay) {
      h += '<h2>' + L('Replay da corrida', 'Race replay') + '</h2><div class="replay-mount" id="replay-mount"><button type="button" class="btn" data-replay="' + esc(sid + '/' + r.id) + '">' + L('Ver o replay', 'Watch the replay') + '</button>' +
        '<p class="hint">' + L('Reconstituição volta a volta, a partir dos tempos de cada piloto.', 'Lap-by-lap reconstruction from each driver\'s lap times.') + '</p></div>';
    }
    if (!r.results) return h + empty(L('Resultados por lançar.', 'Results not in yet.'));

    var rows = r.results.slice().sort(function (a, b) { return (a.pos || 999) - (b.pos || 999); });
    var hasGrid = rows.some(function (e) { return e.grid != null; });
    var hasLap = rows.some(function (e) { return e.bestLap; });
    var hasPen = rows.some(function (e) { return e.penalty; });
    var hasGap = rows.some(function (e) { return e.gap; });
    h += '<div class="h2-row"><h2>' + L('Classificação da prova', 'Race classification') + '</h2><button type="button" class="btn ghost small" data-export="race:' + esc(r.id) + '">' + L('Exportar .xlsx', 'Export .xlsx') + '</button></div><div class="table-wrap"><table class="grid race"><thead><tr><th class="c-pos" scope="col">Pos</th><th class="c-name" scope="col">' + L('Piloto', 'Driver') + '</th>' +
      (hasGrid ? '<th class="c-grid" scope="col">' + L('Grelha', 'Grid') + '</th><th class="c-grid" scope="col">' + L('Ganhas', 'Gained') + '</th>' : '') + (hasGap ? '<th class="c-num" scope="col">' + L('Diferença', 'Gap') + '</th>' : '') + (hasLap ? '<th class="c-num" scope="col">' + L('Melhor volta', 'Best lap') + '</th>' : '') +
      (hasPen ? '<th class="c-num" scope="col">' + L('Penalização', 'Penalty') + '</th>' : '') + '<th class="c-num c-geral" scope="col">' + L('Pontos', 'Points') + '</th></tr></thead><tbody>';
    rows.forEach(function (e) {
      var d = c.driverById[e.driver];
      var x = d ? d.races.filter(function (q) { return q.race === r.id; })[0] : null;
      var g = e.grid != null && e.pos ? e.grid - e.pos : null;
      var gCls = g > 0 ? 'up' : (g < 0 ? 'down' : 'muted'), gTxt = g == null ? '—' : (g > 0 ? '+' + g : (g < 0 ? '−' + (-g) : '='));
      // no telemóvel a grelha e as posições ganhas vão por baixo do nome, em vez de duas colunas
      var sub = hasGrid && e.grid != null ? '<small class="grid-sub">' + L('partiu de ', 'started ') + ord(e.grid) + (g ? ' · <b class="' + gCls + '">' + (g > 0 ? '▲' : '▼') + Math.abs(g) + '</b>' : '') + '</small>' : '';
      h += '<tr><td class="c-pos' + (e.pos <= 3 && !e.status ? ' top' : '') + '">' + (e.status === 'DSQ' ? 'DSQ' : (e.pos || '—')) + '</td><th class="c-name" scope="row"><a href="' + link(sid, ['piloto', e.driver]) + '">' + esc(d ? d.name : e.driver) + '</a>' + (e.status === 'DNF' ? ' <span class="tag">DNF</span>' : '') + sub + '</th>' +
        (hasGrid ? '<td class="c-grid muted">' + (e.grid != null ? ord(e.grid) : '—') + '</td><td class="c-grid ' + gCls + '">' + gTxt + '</td>' : '') +
        (hasGap ? '<td class="c-num muted">' + esc(I.data(e.gap) || (e.pos === 1 ? '–' : '—')) + '</td>' : '') +
        (hasLap ? '<td class="c-num' + (r.fastestLap === e.driver ? ' fl' : '') + '">' + esc(e.bestLap || '—') + '</td>' : '') +
        (hasPen ? '<td class="c-num muted">' + (e.penalty ? '+' + e.penalty + ' s' : '—') + '</td>' : '') +
        '<td class="c-num c-geral">' + (x ? x.pts : '—') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (r.note) h += '<p class="hint">' + esc(I.data(r.note)) + '</p>';
    if (r.sheet) h += '<h2>' + L('Folha de tempos', 'Timing sheet') + '</h2><a class="sheet" href="' + esc(r.sheet) + '" target="_blank" rel="noopener"><img src="' + esc(r.sheet) + '" alt="' + L('Folha de tempos oficial da prova, com os tempos de cada volta', 'Official timing sheet of the race, with every lap time') + '" loading="lazy"></a><p class="hint">' + L('Toca na folha para a ver em grande.', 'Tap the sheet to see it full size.') + '</p>';
    return h;
  }

  function driversList(D, sid) {
    var c = D.calc;
    var h = pageHead(SN(D.season) + (c.drivers.length ? ' · ' + plural(c.drivers.length, L('piloto', 'driver'), L('pilotos', 'drivers')) : ''), L('Pilotos', 'Drivers'));
    if (!c.drivers.length) return h + empty(L('Pilotos por anunciar.', 'Drivers to be announced.'));
    var racing = c.held.length > 0;
    return h + '<div class="cards tight">' + c.drivers.map(function (d) {
      var ranked = racing && d.presences > 0;
      return '<a class="card card-link driver" href="' + link(sid, ['piloto', d.id]) + '"><span class="num' + (ranked && d.rank <= 3 ? '' : ' dim') + '">' + (ranked ? d.rank : '·') + '</span>' + (d.photo ? '<img class="avatar" src="' + esc(d.photo) + '" alt="" loading="lazy">' : '') + '<span class="grow"><strong>' + esc(d.name) + '</strong><span class="muted">' + esc(d.team ? d.team.name : L('Sem equipa', 'No team')) + '</span></span>' +
        (racing ? '<span class="pts">' + d.geral + '<small>pts</small></span>' : '') + '</a>';
    }).join('') + '</div>';
  }

  function driverPage(D, sid, did) {
    var c = D.calc, d = c.driverById[did];
    if (!d) return notFound(sid);
    var racing = c.held.length > 0;
    var h = back(link(sid, ['pilotos']), L('Todos os pilotos', 'All drivers')) +
      pageHead((racing && d.presences ? ord(d.rank) + L(' na geral · ', ' overall · ') : '') + SN(D.season), d.name,
        racing ? '<div class="big"><span>' + d.geral + '</span><small>' + L('pontos na geral', 'overall points') + (d.total !== d.geral ? ' · ' + d.total + L(' no total', ' in total') : '') + '</small></div>' : '');
    if (racing) {
      h += statBoxes([
        { v: d.presences + ' / ' + c.held.length, l: L('Presenças', 'Races') },
        { v: String(d.wins), l: L('Vitórias', 'Wins') },
        { v: String(d.podiums), l: L('Pódios', 'Podiums') },
        { v: String(d.fastestLaps), l: L('Voltas mais rápidas', 'Fastest laps') },
        { v: d.gained == null ? '—' : (d.gained > 0 ? '+' + d.gained : String(d.gained).replace('-', '−')), l: L('Posições ganhas', 'Places gained') }
      ]);
    }
    h += '<h2>' + L('Equipa', 'Team') + '</h2>';
    if (d.team) {
      var t = c.teams.filter(function (x) { return x.id === d.team.id; })[0];
      h += '<div class="card team"><div><p class="card-t">' + esc(t.name) + '</p>' + (racing ? '<p class="muted">' + ord(t.rank) + L(' na classificação de equipas', ' in the team standings') + '</p>' : '') + '</div><div class="team-m">' +
        t.members.map(function (m) {
          return '<div><span class="muted">' + (m.id === d.id ? esc(m.name) : '<a href="' + link(sid, ['piloto', m.id]) + '">' + esc(m.name) + '</a>') + '</span><strong>' + m.geral + '</strong></div>';
        }).join('') + '<div><span class="muted">' + L('Pontos da equipa', 'Team points') + '</span><strong class="accent">' + t.pts + '</strong></div></div></div>';
    } else {
      h += empty(L('Sem equipa nesta temporada.', 'No team this season.'));
    }
    h += '<h2>' + L('Resultados por prova', 'Results by race') + '</h2>';
    if (!racing) return h + empty(L('Ainda não há provas disputadas nesta temporada.', 'No races have been run this season yet.'));
    h += '<div class="table-wrap"><table class="grid"><thead><tr><th class="c-name" scope="col">' + L('Prova', 'Race') + '</th><th scope="col">' + L('Grelha', 'Grid') + '</th><th scope="col">' + L('Posição', 'Position') + '</th><th scope="col">' + L('Ganhas', 'Gained') + '</th><th class="c-num" scope="col">' + L('Melhor volta', 'Best lap') + '</th><th class="c-num c-geral" scope="col">' + L('Pontos', 'Points') + '</th></tr></thead><tbody>';
    d.races.forEach(function (x) {
      var r = D.races.filter(function (q) { return q.id === x.race; })[0];
      var g = x.attended && x.grid != null && x.pos ? x.grid - x.pos : null;
      h += '<tr><th class="c-name" scope="row"><a href="' + link(sid, ['prova', r.id]) + '">' + esc(r.name) + '<small>' + esc(fmtDate(r.date)) + '</small></a></th>' +
        '<td class="muted">' + (x.attended && x.grid != null ? ord(x.grid) : '—') + '</td><td class="strong">' + posLabel(x) + '</td>' +
        '<td class="' + (g > 0 ? 'up' : (g < 0 ? 'down' : 'muted')) + '">' + (g == null ? '—' : (g > 0 ? '+' + g : (g < 0 ? '−' + (-g) : '='))) + '</td>' +
        '<td class="c-num' + (x.fl ? ' fl' : '') + '">' + esc(x.bestLap || '—') + '</td>' +
        '<td class="c-num c-geral' + (x.dropped ? ' dropped' : '') + '">' + (x.attended ? x.pts : '0') + '</td></tr>';
    });
    return h + '</tbody></table></div>' + legend(D);
  }

  function rules(D, sid) {
    return fetch(L('content/regulamento.html', 'content/regulamento.en.html'), { cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (html) {
      var P = D.season.points;
      var pts = '<div class="table-wrap narrow"><table class="grid"><thead><tr><th scope="col">' + L('Posição', 'Position') + '</th><th class="c-num" scope="col">' + L('Pontos de posição', 'Position points') + '</th><th class="c-num" scope="col">' + L('Presença', 'Attendance') + '</th><th class="c-num c-geral" scope="col">Total</th></tr></thead><tbody>' +
        P.positions.map(function (p, i) { return '<tr><td class="strong">' + ord(i + 1) + '</td><td class="c-num muted">' + p + '</td><td class="c-num muted">' + P.presence + '</td><td class="c-num c-geral">' + (p + P.presence) + '</td></tr>'; }).join('') +
        '<tr><td class="strong">' + ord(P.positions.length + 1) + L(' ou pior, DNF', ' or lower, DNF') + '</td><td class="c-num muted">0</td><td class="c-num muted">' + P.presence + '</td><td class="c-num c-geral">' + P.presence + '</td></tr>' +
        '<tr><td class="strong">DNS, DSQ</td><td class="c-num muted">0</td><td class="c-num muted">0</td><td class="c-num c-geral">0</td></tr></tbody></table></div>';
      html = html.replace('<!--PONTOS-->', pts).replace('<!--N_PROVAS-->', D.season.races.length ? String(D.season.races.length) : L('várias', 'several'));
      var prev = previousSeasonId(sid);
      var done = function (tost) {
        return pageHead(SN(D.season), L('Regulamento', 'Rules')) + '<div class="prose">' + html.replace('<!--TOSTOES-->', tost) + '</div>';
      };
      if (!prev) return done('');
      return loadSeason(prev).then(function (PD) {
        var top = PD.calc.drivers.filter(function (d) { return d.presences > 0; }).slice(0, 5);
        if (!top.length) return done('');
        return done('<p>' + (I.lang === 'en' ? 'Top 5 of ' + esc(SN(PD.season)) + ' (3 tostões each):' : 'Top 5 da ' + esc(PD.season.name.toLowerCase()) + ' (3 tostões cada):') + '</p><ul>' + top.map(function (d) { return '<li><strong>' + esc(d.name) + '</strong></li>'; }).join('') + '</ul><p>' + L('Restantes pilotos: 2 tostões.', 'All other drivers: 2 tostões.') + '</p>');
      });
    });
  }

  function notFound(sid) {
    return pageHead('Fórmula 88', L('Página não encontrada', 'Page not found')) + '<p><a class="btn" href="' + (sid ? link(sid, ['classificacao']) : '#/') + '">' + L('Ir para a classificação', 'Go to the standings') + '</a></p>';
  }

  // ---------- navegação ----------
  var PAGES = { classificacao: standings, equipas: teams, provas: racesList, prova: racePage, pilotos: driversList, piloto: driverPage, regulamento: rules };

  function renderNav(sid, page) {
    var items = [['classificacao', L('Classificação', 'Standings')], ['provas', L('Provas', 'Races')], ['pilotos', L('Pilotos', 'Drivers')], ['equipas', L('Equipas', 'Teams')], ['regulamento', L('Regulamento', 'Rules')]];
    var group = { prova: 'provas', piloto: 'pilotos' }[page] || page;
    document.getElementById('nav').innerHTML = items.map(function (it) {
      return '<a href="' + link(sid, [it[0]]) + '"' + (group === it[0] ? ' aria-current="page"' : '') + '>' + it[1] + '</a>';
    }).join('');
    var sel = document.getElementById('season-select');
    sel.innerHTML = cfg.seasons.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sid ? ' selected' : '') + '>' + esc(I.data(s.name)) + '</option>'; }).join('');
    sel.dataset.page = page || '';
  }

  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    var known = cfg.seasons.map(function (s) { return s.id; });
    var sid = known.indexOf(parts[0]) >= 0 ? parts[0] : cfg.current;
    var page = known.indexOf(parts[0]) >= 0 ? parts[1] : parts[0];
    var arg = known.indexOf(parts[0]) >= 0 ? parts[2] : parts[1];
    renderNav(sid, page);
    closeMenu();
    if (activeReplay) { activeReplay.destroy(); activeReplay = null; }
    loadSeason(sid).then(function (D) {
      current = { D: D, sid: sid };
      if (!page) return home(D, sid);
      var fn = PAGES[page];
      return fn ? fn(D, sid, arg) : notFound(sid);
    }).then(function (html) {
      app.innerHTML = html;
      syncInstall();
      var h1 = app.querySelector('h1');
      document.title = (h1 && page ? h1.textContent + ' · ' : '') + 'Fórmula 88';
      window.scrollTo(0, 0);
    }).catch(function (err) {
      app.innerHTML = pageHead('Fórmula 88', L('Algo correu mal', 'Something went wrong')) + '<p class="empty">' + esc(err.message) + '</p>';
    });
  }

  // Ligações internas do regulamento: deslizam até à secção sem mudar de página.
  app.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-scroll]');
    if (!a) return;
    e.preventDefault();
    var el = document.getElementById(a.getAttribute('href').slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- exportação para Excel ----------
  function raceSheet(D, r) {
    var c = D.calc, rows = [['Pos', L('Piloto', 'Driver'), L('Equipa', 'Team'), L('Grelha', 'Grid'), L('Diferença', 'Gap'), L('Melhor volta', 'Best lap'), L('Penalização (s)', 'Penalty (s)'), L('Estado', 'Status'), L('Pontos', 'Points')]];
    r.results.slice().sort(function (a, b) { return (a.pos || 999) - (b.pos || 999); }).forEach(function (e) {
      var d = c.driverById[e.driver], x = d ? d.races.filter(function (q) { return q.race === r.id; })[0] : null;
      rows.push([e.pos || '', d ? d.name : e.driver, d && d.team ? d.team.name : '', e.grid == null ? '' : e.grid, I.data(e.gap) || '', e.bestLap || '',
        e.penalty || '', e.status || (r.fastestLap === e.driver ? L('Volta mais rápida', 'Fastest lap') : ''), x ? x.pts : '']);
    });
    return { name: r.name, rows: rows, widths: [6, 24, 28, 8, 12, 13, 15, 18, 8] };
  }
  function seasonSheets(D) {
    var c = D.calc, held = c.held;
    var head = ['Pos', L('Piloto', 'Driver'), L('Equipa', 'Team')].concat(held.map(function (r) { return r.name; }), ['Total', L('Geral', 'Overall'), L('Presenças', 'Races'), L('Vitórias', 'Wins'), L('Pódios', 'Podiums'), L('Voltas mais rápidas', 'Fastest laps')]);
    var rows = [head];
    c.drivers.filter(function (d) { return d.presences > 0; }).forEach(function (d) {
      rows.push([d.rank, d.name, d.team ? d.team.name : ''].concat(d.races.map(function (x) { return x.attended ? x.pts : ''; }), [d.total, d.geral, d.presences, d.wins, d.podiums, d.fastestLaps]));
    });
    var sheets = [{ name: L('Pilotos', 'Drivers'), rows: rows, widths: [6, 24, 28].concat(held.map(function () { return 14; }), [8, 8, 11, 9, 8, 19]) }];
    if (c.teams.length) {
      sheets.push({ name: L('Equipas', 'Teams'), widths: [6, 30, 24, 10, 24, 10, 10], rows: [['Pos', L('Equipa', 'Team'), L('Piloto 1', 'Driver 1'), L('Pontos 1', 'Points 1'), L('Piloto 2', 'Driver 2'), L('Pontos 2', 'Points 2'), L('Pontos', 'Points')]].concat(c.teams.map(function (t) {
        var m = t.members;
        return [t.rank, t.name, m[0] ? m[0].name : '', m[0] ? m[0].geral : '', m[1] ? m[1].name : '', m[1] ? m[1].geral : '', t.pts];
      })) });
    }
    return sheets.concat(held.map(function (r) { return raceSheet(D, r); }));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-export]');
    if (b && current) {
      var what = b.dataset.export, D = current.D;
      if (what === 'season') window.F88Xlsx.download('formula88-' + current.sid + '.xlsx', seasonSheets(D));
      else {
        var r = D.races.filter(function (q) { return q.id === what.slice(5); })[0];
        if (r && r.results) window.F88Xlsx.download('formula88-' + current.sid + '-' + r.id + '.xlsx', [raceSheet(D, r)]);
      }
      return;
    }
    var rb = e.target.closest('[data-replay]');
    if (rb) {
      var mount = document.getElementById('replay-mount');
      rb.disabled = true; rb.textContent = L('A carregar…', 'Loading…');
      var parts = rb.dataset.replay.split('/');
      getJSON('data/' + parts[0] + '/replays/' + parts[1] + '.json').then(function (data) {
        if (!document.body.contains(mount)) return;
        activeReplay = window.F88Replay.mount(mount, data);
      }).catch(function (err) { mount.innerHTML = '<p class="empty">' + esc(err.message) + '</p>'; });
    }
  });

  // ---------- menu, temporada e pintura ----------
  var menuBtn = document.getElementById('menu-btn');
  var menu = document.getElementById('menu');
  function closeMenu() { menu.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', function () {
    var open = menu.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.getElementById('season-select').addEventListener('change', function (e) {
    var page = e.target.dataset.page;
    var keep = ['classificacao', 'equipas', 'provas', 'pilotos', 'regulamento'].indexOf(page) >= 0 ? page : (page === 'prova' ? 'provas' : (page === 'piloto' ? 'pilotos' : null));
    location.hash = keep ? link(e.target.value, [keep]) : (e.target.value === cfg.current ? '#/' : link(e.target.value, ['classificacao']));
  });

  function currentLivery() { return document.documentElement.getAttribute('data-livery') || DEFAULT_LIVERY; }
  function renderLiveries() {
    var cur = currentLivery();
    document.getElementById('liveries').innerHTML = LIVERIES.map(function (l) {
      return '<button type="button" class="swatch" data-id="' + l.id + '" aria-pressed="' + (l.id === cur) + '"><span class="sw" style="background:linear-gradient(90deg,' + l.sw[0] + ' 0 50%,' + l.sw[1] + ' 50% 80%,' + l.sw[2] + ' 80%)"></span>' + esc(l.name) + '</button>';
    }).join('');
  }
  document.getElementById('liveries').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]');
    if (!b) return;
    document.documentElement.setAttribute('data-livery', b.dataset.id);
    try { localStorage.setItem('f88-pintura', b.dataset.id); } catch (err) {}
    // O painel fica aberto depois de escolher, para se poder experimentar várias pinturas.
    Array.prototype.forEach.call(this.querySelectorAll('button[data-id]'), function (x) {
      x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
    });
  });
  if (!LIVERIES.some(function (l) { return l.id === currentLivery(); })) document.documentElement.setAttribute('data-livery', DEFAULT_LIVERY);
  renderLiveries();

  // O painel das pinturas fecha ao tocar fora dele ou ao carregar em Escape.
  var liveryPop = document.getElementById('livery-pop');
  document.addEventListener('click', function (e) {
    if (liveryPop.open && !liveryPop.contains(e.target)) liveryPop.open = false;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && liveryPop.open) { liveryPop.open = false; liveryPop.querySelector('summary').focus(); }
  });

  // ---------- língua: português ou inglês ----------
  var langBtn = document.getElementById('lang-btn');
  function applyStatic() {
    var skip = document.querySelector('.skip'); if (skip) skip.textContent = L('Saltar para o conteúdo', 'Skip to content');
    liveryPop.querySelector('summary').textContent = L('Pintura', 'Livery');
    document.getElementById('season-select').setAttribute('aria-label', L('Temporada', 'Season'));
    document.getElementById('liveries').setAttribute('aria-label', L('Escolher pintura', 'Choose a livery'));
    var foot = document.getElementById('foot-line'); if (foot) foot.textContent = 'Fórmula 88 · ' + L('A melhor liga de karts acima do Mondego', 'The best karting league north of the Mondego');
    var fi = document.querySelector('.site-foot [data-install]'); if (fi) fi.textContent = L('Instalar como app', 'Install as an app');
    // o botão mostra a OUTRA língua, na própria língua
    langBtn.textContent = I.lang === 'en' ? 'PT' : 'EN';
    langBtn.setAttribute('lang', I.lang === 'en' ? 'pt' : 'en');
    langBtn.setAttribute('aria-label', I.lang === 'en' ? 'Mudar para português' : 'Switch to English');
  }
  langBtn.addEventListener('click', function () {
    I.set(I.lang === 'en' ? 'pt' : 'en');
    applyStatic();
    if (cfg) route();
  });
  applyStatic();

  // ---------- instalar como app: botão discreto, só quando faz sentido ----------
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroidOther = /Android/.test(ua) && /Firefox/.test(ua);            // não deixa o site abrir a instalação
  var installDone = false;
  function installed() { return installDone || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function syncInstall() {
    var st = window.F88Install || {}, show = !installed() && (!!st.prompt || isIOS || isAndroidOther);
    Array.prototype.forEach.call(document.querySelectorAll('[data-install]'), function (b) { b.hidden = !show; });
  }
  function installHelp() {
    var d = document.getElementById('install-help');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'install-help'; d.className = 'help';
      document.body.appendChild(d);
    }
    d.innerHTML = '<h2>' + L('Instalar a Fórmula 88', 'Install Fórmula 88') + '</h2>' + (isIOS
      ? L('<ol><li>Toca em <strong>Partilhar</strong> (o quadrado com a seta para cima), na barra do browser.</li><li>Escolhe <strong>Adicionar ao ecrã principal</strong>.</li><li>Confirma em <strong>Adicionar</strong>.</li></ol>',
          '<ol><li>Tap <strong>Share</strong> (the square with the arrow pointing up) in the browser bar.</li><li>Choose <strong>Add to Home Screen</strong>.</li><li>Confirm with <strong>Add</strong>.</li></ol>')
      : L('<ol><li>Abre o <strong>menu do browser</strong> (os três pontos).</li><li>Escolhe <strong>Instalar</strong> ou <strong>Adicionar ao ecrã principal</strong>.</li></ol>',
          '<ol><li>Open the <strong>browser menu</strong> (the three dots).</li><li>Choose <strong>Install</strong> or <strong>Add to Home screen</strong>.</li></ol>')) +
      '<p class="muted">' + L('Fica com um ícone no telemóvel e abre em ecrã inteiro. Continua a ser o site: atualiza-se sozinho.', 'You get an icon on your phone and it opens full screen. It is still the website, so it updates by itself.') + '</p>' +
      '<form method="dialog"><button class="btn">' + L('Fechar', 'Close') + '</button></form>';
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-install]');
    if (!b) return;
    var st = window.F88Install || {};
    if (st.prompt) {
      var p = st.prompt; st.prompt = null;
      p.prompt();
      (p.userChoice || Promise.resolve({})).then(function (c) { if (c && c.outcome === 'accepted') installDone = true; syncInstall(); });
    } else installHelp();
  });
  window.addEventListener('f88-install', syncInstall);
  window.addEventListener('appinstalled', function () { installDone = true; syncInstall(); });

  syncInstall();
  getJSON('data/seasons.json').then(function (c) {
    cfg = c;
    window.addEventListener('hashchange', route);
    route();
  }).catch(function (err) {
    app.innerHTML = '<p class="empty">' + esc(err.message) + '</p>';
  });
})();
