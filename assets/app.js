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
      if (!r.ok) throw new Error('Não foi possível ler ' + path);
      return r.json();
    });
  }
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function parts(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; }
  function fmtDate(iso) { var p = parts(iso); return p ? p.d + ' ' + MESES[p.m] + ' ' + p.y : 'Data por anunciar'; }
  function fmtLong(iso) { var p = parts(iso); return p ? p.d + ' de ' + MESES_LONGOS[p.m] + ' de ' + p.y : 'Data por anunciar'; }
  function fmtShort(iso) { var p = parts(iso); return p ? p.d + ' ' + MESES[p.m] : 'por anunciar'; }
  function posLabel(x) {
    if (!x.attended) return '—';
    if (x.status === 'DSQ') return 'DSQ';
    if (x.status === 'DNF') return 'DNF';
    return x.pos + 'º';
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
    return s ? s.name : id;
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
    return '<ul class="legend"><li><span class="fl">Destaque</span> = volta mais rápida da prova (+' + D.season.points.fastestLap + ' ponto)</li>' +
      (D.calc.dropActive ? '<li><span class="dropped">Riscado</span> = pior resultado, descontado no Geral</li>' : '') +
      '<li>— = não participou (DNS)</li></ul>';
  }

  // ---------- páginas ----------
  function home(D, sid) {
    var c = D.calc, held = c.held, h = '';
    var total = D.season.races.length;
    var status = held.length ? plural(held.length, 'prova disputada', 'provas disputadas') + (total ? ' de ' + total : '') : 'A temporada ainda não arrancou';
    h += '<section class="hero"><p class="eyebrow accent">' + esc(D.season.name) + ' · ' + esc(status) + '</p>' +
      '<h1>A melhor liga de karts acima do Mondego</h1>' +
      '<p class="actions"><a class="btn" href="' + link(sid, ['classificacao']) + '">Ver classificação</a>' +
      '<a class="btn ghost" href="' + link(sid, ['regulamento']) + '">Ler o regulamento</a></p></section>';

    if (held.length) {
      h += '<div class="cards">' + podiumCards(D, sid) + '</div>';
      return Promise.resolve(h + calendarStrip(D, sid));
    }
    var prev = previousSeasonId(sid);
    if (!prev) return Promise.resolve(h + calendarStrip(D, sid));
    return loadSeason(prev).then(function (PD) {
      var ph = '';
      if (PD.calc.held.length) {
        ph = '<h2>Como acabou a ' + esc(PD.season.name.toLowerCase()) + '</h2><div class="cards">' + podiumCards(PD, prev) + '</div>';
      }
      return h + calendarStrip(D, sid) + ph;
    });
  }

  function podiumCards(D, sid) {
    var c = D.calc, h = '';
    var top = c.drivers.filter(function (d) { return d.presences > 0; }).slice(0, 3);
    h += '<div class="card"><p class="card-k">Pilotos · Top 3</p>' + top.map(function (d) {
      return '<a class="rowlink" href="' + link(sid, ['piloto', d.id]) + '"><span class="num">' + d.rank + '</span><span class="grow">' + esc(d.name) + '</span><span class="pts">' + d.geral + '</span></a>';
    }).join('') + '<a class="more" href="' + link(sid, ['classificacao']) + '">Classificação completa →</a></div>';

    var last = c.held[c.held.length - 1];
    var pod = last.results.filter(function (e) { return e.pos && e.pos <= 3 && e.status !== 'DSQ'; }).sort(function (a, b) { return a.pos - b.pos; });
    h += '<div class="card"><p class="card-k">Última prova · ' + esc(fmtDate(last.date)) + '</p><p class="card-t">' + esc(last.name) + '</p>' + pod.map(function (e) {
      var d = c.driverById[e.driver];
      return '<div class="kv"><span>' + (e.pos === 1 ? 'Vencedor' : e.pos + 'º') + '</span><strong' + (e.pos === 1 ? ' class="accent"' : '') + '>' + esc(d ? d.name : e.driver) + '</strong></div>';
    }).join('') + '<a class="more" href="' + link(sid, ['prova', last.id]) + '">Resultados da prova →</a></div>';

    if (c.teams.length) {
      h += '<div class="card"><p class="card-k">Equipas · Top 3</p>' + c.teams.slice(0, 3).map(function (t) {
        return '<div class="rowlink"><span class="num">' + t.rank + '</span><span class="grow">' + esc(t.name) + '</span><span class="pts">' + t.pts + '</span></div>';
      }).join('') + '<a class="more" href="' + link(sid, ['equipas']) + '">Todas as equipas →</a></div>';
    }
    return h;
  }

  function calendarStrip(D, sid) {
    var h = '<h2>Calendário</h2>';
    if (!D.races.length) return h + empty('Calendário por anunciar.');
    return h + '<div class="strip">' + D.races.map(function (r) {
      var note = 'Por disputar';
      if (r.results) {
        var w = r.results.filter(function (e) { return e.pos === 1; })[0];
        var d = w && D.calc.driverById[w.driver];
        note = d ? d.name : 'Disputada';
      }
      return '<a class="chip' + (r.results ? ' done' : '') + '" href="' + link(sid, ['prova', r.id]) + '"><span class="chip-d">' + esc(fmtShort(r.date)) + '</span><span class="chip-n">' + esc(r.name) + '</span><span class="chip-s">' + esc(note) + '</span></a>';
    }).join('') + '</div>';
  }

  function standings(D, sid) {
    var c = D.calc, held = c.held;
    var total = D.season.races.length;
    var h = pageHead(D.season.name + (held.length ? ' · ' + held.length + (total ? ' de ' + total : '') + ' provas' : ''), 'Classificação geral',
      '<p class="tabs"><a class="tab on" href="' + link(sid, ['classificacao']) + '">Pilotos</a><a class="tab" href="' + link(sid, ['equipas']) + '">Equipas</a></p>');
    if (!held.length) return h + empty('Ainda não há provas disputadas nesta temporada. A classificação aparece aqui depois da primeira prova.');
    var rows = c.drivers.filter(function (d) { return d.presences > 0; });
    h += '<div class="table-wrap"><table class="grid standings"><thead><tr><th class="c-pos" scope="col">Pos</th><th class="c-name" scope="col">Piloto</th>' +
      held.map(function (r) {
        return '<th scope="col"><a href="' + link(sid, ['prova', r.id]) + '">' + esc(r.name) + '<small>' + esc(fmtShort(r.date)) + '</small></a></th>';
      }).join('') + '<th class="c-num" scope="col">Total</th><th class="c-num c-geral" scope="col">Geral</th></tr></thead><tbody>';
    rows.forEach(function (d) {
      h += '<tr><td class="c-pos' + (d.rank <= 3 ? ' top' : '') + '">' + d.rank + '</td><th class="c-name" scope="row"><a href="' + link(sid, ['piloto', d.id]) + '">' + esc(d.name) + '</a></th>' +
        d.races.map(function (x) {
          if (!x.attended) return '<td class="cell dns">—</td>';
          return '<td class="cell"><span class="p' + (x.fl ? ' fl' : '') + (x.pos === 1 && !x.status ? ' win' : '') + '">' + posLabel(x) + '</span><span class="s' + (x.dropped ? ' dropped' : '') + '">' + x.pts + ' pts</span></td>';
        }).join('') + '<td class="c-num muted">' + d.total + '</td><td class="c-num c-geral">' + d.geral + '</td></tr>';
    });
    h += '</tbody></table></div>' + legend(D) + '<p class="actions tight">' + '<button type="button" class="btn ghost small" data-export="season">Exportar .xlsx</button>' + '</p><p class="hint">Toca num piloto ou numa prova para ver o detalhe. No telemóvel, desliza a tabela para o lado.</p>';
    return h;
  }

  function teams(D, sid) {
    var c = D.calc;
    var h = pageHead(D.season.name, 'Classificação de equipas',
      '<p class="tabs"><a class="tab" href="' + link(sid, ['classificacao']) + '">Pilotos</a><a class="tab on" href="' + link(sid, ['equipas']) + '">Equipas</a></p>');
    if (!c.teams.length) return h + empty('Equipas por anunciar.');
    h += '<div class="table-wrap"><table class="grid"><thead><tr><th class="c-pos" scope="col">Pos</th><th scope="col" class="left">Equipa</th><th scope="col" class="left">Pilotos</th><th class="c-num c-geral" scope="col">Pontos</th></tr></thead><tbody>';
    c.teams.forEach(function (t) {
      h += '<tr><td class="c-pos' + (t.rank <= 3 && c.held.length ? ' top' : '') + '">' + (c.held.length ? t.rank : '·') + '</td><th scope="row" class="left strong">' + esc(t.name) + '</th><td class="left">' +
        t.members.map(function (m) { return '<a href="' + link(sid, ['piloto', m.id]) + '">' + esc(m.name) + '</a> <span class="muted">(' + m.geral + ')</span>'; }).join('<br>') +
        '</td><td class="c-num c-geral">' + t.pts + '</td></tr>';
    });
    return h + '</tbody></table></div>' + (c.held.length ? '<p class="actions tight">' + '<button type="button" class="btn ghost small" data-export="season">Exportar .xlsx</button>' + '</p>' : '') + '<p class="hint">Os pontos de uma equipa são a soma dos pontos dos seus pilotos na classificação geral.</p>';
  }

  function racesList(D, sid) {
    var h = pageHead(D.season.name + (D.races.length ? ' · ' + plural(D.races.length, 'prova', 'provas') : ''), 'Provas');
    if (!D.races.length) return h + empty('Calendário por anunciar.');
    return h + '<div class="cards">' + D.races.map(function (r, i) {
      var w = r.results && r.results.filter(function (e) { return e.pos === 1; })[0];
      var d = w && D.calc.driverById[w.driver];
      var meta = [r.karts, r.surface ? r.surface.toLowerCase() : null].filter(Boolean).join(' · ');
      return '<a class="card card-link' + (r.image ? ' has-img' : '') + '" href="' + link(sid, ['prova', r.id]) + '">' + (r.image ? '<img class="card-img" src="' + esc(r.image) + '" alt="" loading="lazy">' : '') + '<p class="card-k"><span>Prova ' + (i + 1) + '</span><span>' + esc(fmtDate(r.date)) + '</span></p><p class="card-t">' + esc(r.name) + '</p><p class="muted">' + esc(meta || ' ') + '</p>' +
        '<div class="kv"><span>Vencedor</span><strong' + (d ? ' class="accent"' : '') + '>' + esc(d ? d.name : 'Por disputar') + '</strong></div></a>';
    }).join('') + '</div>';
  }

  function racePage(D, sid, rid) {
    var idx = -1;
    D.races.forEach(function (r, i) { if (r.id === rid) idx = i; });
    if (idx < 0) return notFound(sid);
    var r = D.races[idx], c = D.calc;
    var h = back(link(sid, ['provas']), 'Todas as provas') +
      pageHead('Prova ' + (idx + 1) + ' de ' + D.races.length + ' · ' + fmtLong(r.date), r.track || r.name);
    var facts = [];
    if (r.results) {
      var w = r.results.filter(function (e) { return e.pos === 1; })[0];
      if (w && c.driverById[w.driver]) facts.push({ l: 'Vencedor', v: c.driverById[w.driver].name, cls: 'accent sm', sub: w.grid ? 'partiu de ' + w.grid + 'º' : '' });
      var fl = r.fastestLap && c.driverById[r.fastestLap];
      var fle = fl && r.results.filter(function (e) { return e.driver === r.fastestLap; })[0];
      if (fl) facts.push({ l: 'Volta mais rápida', v: (fle && fle.bestLap) || fl.name, cls: 'fl sm', sub: fle && fle.bestLap ? fl.name : '' });
    }
    if (r.karts) facts.push({ l: 'Karts', v: r.karts, cls: 'sm', sub: r.duration ? 'corrida de ' + r.duration : '' });
    if (r.surface) facts.push({ l: 'Piso', v: r.surface, cls: 'sm', sub: r.ballast === true ? 'com lastro' : (r.ballast === false ? 'sem lastro' : '') });
    if (r.results) facts.push({ l: 'Pilotos', v: String(r.results.length), cls: 'sm', sub: 'em pista' });
    h += statBoxes(facts);
    if (r.hasReplay) {
      h += '<h2>Replay da corrida</h2><div class="replay-mount" id="replay-mount"><button type="button" class="btn" data-replay="' + esc(sid + '/' + r.id) + '">Ver o replay</button>' +
        '<p class="hint">Reconstituição volta a volta, a partir dos tempos de cada piloto.</p></div>';
    }
    if (!r.results) return h + empty('Resultados por lançar.');

    var rows = r.results.slice().sort(function (a, b) { return (a.pos || 999) - (b.pos || 999); });
    var hasGrid = rows.some(function (e) { return e.grid != null; });
    var hasLap = rows.some(function (e) { return e.bestLap; });
    var hasPen = rows.some(function (e) { return e.penalty; });
    var hasGap = rows.some(function (e) { return e.gap; });
    h += '<div class="h2-row"><h2>Classificação da prova</h2><button type="button" class="btn ghost small" data-export="race:' + esc(r.id) + '">Exportar .xlsx</button></div><div class="table-wrap"><table class="grid race"><thead><tr><th class="c-pos" scope="col">Pos</th><th class="c-name" scope="col">Piloto</th>' +
      (hasGrid ? '<th class="c-grid" scope="col">Grelha</th><th class="c-grid" scope="col">Ganhas</th>' : '') + (hasGap ? '<th class="c-num" scope="col">Diferença</th>' : '') + (hasLap ? '<th class="c-num" scope="col">Melhor volta</th>' : '') +
      (hasPen ? '<th class="c-num" scope="col">Penalização</th>' : '') + '<th class="c-num c-geral" scope="col">Pontos</th></tr></thead><tbody>';
    rows.forEach(function (e) {
      var d = c.driverById[e.driver];
      var x = d ? d.races.filter(function (q) { return q.race === r.id; })[0] : null;
      var g = e.grid != null && e.pos ? e.grid - e.pos : null;
      var gCls = g > 0 ? 'up' : (g < 0 ? 'down' : 'muted'), gTxt = g == null ? '—' : (g > 0 ? '+' + g : (g < 0 ? '−' + (-g) : '='));
      // no telemóvel a grelha e as posições ganhas vão por baixo do nome, em vez de duas colunas
      var sub = hasGrid && e.grid != null ? '<small class="grid-sub">partiu de ' + e.grid + 'º' + (g ? ' · <b class="' + gCls + '">' + (g > 0 ? '▲' : '▼') + Math.abs(g) + '</b>' : '') + '</small>' : '';
      h += '<tr><td class="c-pos' + (e.pos <= 3 && !e.status ? ' top' : '') + '">' + (e.status === 'DSQ' ? 'DSQ' : (e.pos || '—')) + '</td><th class="c-name" scope="row"><a href="' + link(sid, ['piloto', e.driver]) + '">' + esc(d ? d.name : e.driver) + '</a>' + (e.status === 'DNF' ? ' <span class="tag">DNF</span>' : '') + sub + '</th>' +
        (hasGrid ? '<td class="c-grid muted">' + (e.grid != null ? e.grid + 'º' : '—') + '</td><td class="c-grid ' + gCls + '">' + gTxt + '</td>' : '') +
        (hasGap ? '<td class="c-num muted">' + esc(e.gap || (e.pos === 1 ? '–' : '—')) + '</td>' : '') +
        (hasLap ? '<td class="c-num' + (r.fastestLap === e.driver ? ' fl' : '') + '">' + esc(e.bestLap || '—') + '</td>' : '') +
        (hasPen ? '<td class="c-num muted">' + (e.penalty ? '+' + e.penalty + ' s' : '—') + '</td>' : '') +
        '<td class="c-num c-geral">' + (x ? x.pts : '—') + '</td></tr>';
    });
    h += '</tbody></table></div>';
    if (r.note) h += '<p class="hint">' + esc(r.note) + '</p>';
    if (r.sheet) h += '<h2>Folha de tempos</h2><a class="sheet" href="' + esc(r.sheet) + '" target="_blank" rel="noopener"><img src="' + esc(r.sheet) + '" alt="Folha de tempos oficial da prova, com os tempos de cada volta" loading="lazy"></a><p class="hint">Toca na folha para a ver em grande.</p>';
    return h;
  }

  function driversList(D, sid) {
    var c = D.calc;
    var h = pageHead(D.season.name + (c.drivers.length ? ' · ' + plural(c.drivers.length, 'piloto', 'pilotos') : ''), 'Pilotos');
    if (!c.drivers.length) return h + empty('Pilotos por anunciar.');
    var racing = c.held.length > 0;
    return h + '<div class="cards tight">' + c.drivers.map(function (d) {
      var ranked = racing && d.presences > 0;
      return '<a class="card card-link driver" href="' + link(sid, ['piloto', d.id]) + '"><span class="num' + (ranked && d.rank <= 3 ? '' : ' dim') + '">' + (ranked ? d.rank : '·') + '</span>' + (d.photo ? '<img class="avatar" src="' + esc(d.photo) + '" alt="" loading="lazy">' : '') + '<span class="grow"><strong>' + esc(d.name) + '</strong><span class="muted">' + esc(d.team ? d.team.name : 'Sem equipa') + '</span></span>' +
        (racing ? '<span class="pts">' + d.geral + '<small>pts</small></span>' : '') + '</a>';
    }).join('') + '</div>';
  }

  function driverPage(D, sid, did) {
    var c = D.calc, d = c.driverById[did];
    if (!d) return notFound(sid);
    var racing = c.held.length > 0;
    var h = back(link(sid, ['pilotos']), 'Todos os pilotos') +
      pageHead((racing && d.presences ? d.rank + 'º na geral · ' : '') + D.season.name, d.name,
        racing ? '<div class="big"><span>' + d.geral + '</span><small>pontos na geral' + (d.total !== d.geral ? ' · ' + d.total + ' no total' : '') + '</small></div>' : '');
    if (racing) {
      h += statBoxes([
        { v: d.presences + ' / ' + c.held.length, l: 'Presenças' },
        { v: String(d.wins), l: 'Vitórias' },
        { v: String(d.podiums), l: 'Pódios' },
        { v: String(d.fastestLaps), l: 'Voltas mais rápidas' },
        { v: d.gained == null ? '—' : (d.gained > 0 ? '+' + d.gained : String(d.gained).replace('-', '−')), l: 'Posições ganhas' }
      ]);
    }
    h += '<h2>Equipa</h2>';
    if (d.team) {
      var t = c.teams.filter(function (x) { return x.id === d.team.id; })[0];
      h += '<div class="card team"><div><p class="card-t">' + esc(t.name) + '</p>' + (racing ? '<p class="muted">' + t.rank + 'º na classificação de equipas</p>' : '') + '</div><div class="team-m">' +
        t.members.map(function (m) {
          return '<div><span class="muted">' + (m.id === d.id ? esc(m.name) : '<a href="' + link(sid, ['piloto', m.id]) + '">' + esc(m.name) + '</a>') + '</span><strong>' + m.geral + '</strong></div>';
        }).join('') + '<div><span class="muted">Pontos da equipa</span><strong class="accent">' + t.pts + '</strong></div></div></div>';
    } else {
      h += empty('Sem equipa nesta temporada.');
    }
    h += '<h2>Resultados por prova</h2>';
    if (!racing) return h + empty('Ainda não há provas disputadas nesta temporada.');
    h += '<div class="table-wrap"><table class="grid"><thead><tr><th class="c-name" scope="col">Prova</th><th scope="col">Grelha</th><th scope="col">Posição</th><th scope="col">Ganhas</th><th class="c-num" scope="col">Melhor volta</th><th class="c-num c-geral" scope="col">Pontos</th></tr></thead><tbody>';
    d.races.forEach(function (x) {
      var r = D.races.filter(function (q) { return q.id === x.race; })[0];
      var g = x.attended && x.grid != null && x.pos ? x.grid - x.pos : null;
      h += '<tr><th class="c-name" scope="row"><a href="' + link(sid, ['prova', r.id]) + '">' + esc(r.name) + '<small>' + esc(fmtDate(r.date)) + '</small></a></th>' +
        '<td class="muted">' + (x.attended && x.grid != null ? x.grid + 'º' : '—') + '</td><td class="strong">' + posLabel(x) + '</td>' +
        '<td class="' + (g > 0 ? 'up' : (g < 0 ? 'down' : 'muted')) + '">' + (g == null ? '—' : (g > 0 ? '+' + g : (g < 0 ? '−' + (-g) : '='))) + '</td>' +
        '<td class="c-num' + (x.fl ? ' fl' : '') + '">' + esc(x.bestLap || '—') + '</td>' +
        '<td class="c-num c-geral' + (x.dropped ? ' dropped' : '') + '">' + (x.attended ? x.pts : '0') + '</td></tr>';
    });
    return h + '</tbody></table></div>' + legend(D);
  }

  function rules(D, sid) {
    return fetch('content/regulamento.html', { cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (html) {
      var P = D.season.points;
      var pts = '<div class="table-wrap narrow"><table class="grid"><thead><tr><th scope="col">Posição</th><th class="c-num" scope="col">Pontos de posição</th><th class="c-num" scope="col">Presença</th><th class="c-num c-geral" scope="col">Total</th></tr></thead><tbody>' +
        P.positions.map(function (p, i) { return '<tr><td class="strong">' + (i + 1) + 'º</td><td class="c-num muted">' + p + '</td><td class="c-num muted">' + P.presence + '</td><td class="c-num c-geral">' + (p + P.presence) + '</td></tr>'; }).join('') +
        '<tr><td class="strong">' + (P.positions.length + 1) + 'º ou pior, DNF</td><td class="c-num muted">0</td><td class="c-num muted">' + P.presence + '</td><td class="c-num c-geral">' + P.presence + '</td></tr>' +
        '<tr><td class="strong">DNS, DSQ</td><td class="c-num muted">0</td><td class="c-num muted">0</td><td class="c-num c-geral">0</td></tr></tbody></table></div>';
      html = html.replace('<!--PONTOS-->', pts).replace('<!--N_PROVAS-->', D.season.races.length ? String(D.season.races.length) : 'várias');
      var prev = previousSeasonId(sid);
      var done = function (tost) {
        return pageHead(D.season.name, 'Regulamento') + '<div class="prose">' + html.replace('<!--TOSTOES-->', tost) + '</div>';
      };
      if (!prev) return done('');
      return loadSeason(prev).then(function (PD) {
        var top = PD.calc.drivers.filter(function (d) { return d.presences > 0; }).slice(0, 5);
        if (!top.length) return done('');
        return done('<p>Top 5 da ' + esc(PD.season.name.toLowerCase()) + ' (3 tostões cada):</p><ul>' + top.map(function (d) { return '<li><strong>' + esc(d.name) + '</strong></li>'; }).join('') + '</ul><p>Restantes pilotos: 2 tostões.</p>');
      });
    });
  }

  function notFound(sid) {
    return pageHead('Fórmula 88', 'Página não encontrada') + '<p><a class="btn" href="' + (sid ? link(sid, ['classificacao']) : '#/') + '">Ir para a classificação</a></p>';
  }

  // ---------- navegação ----------
  var PAGES = { classificacao: standings, equipas: teams, provas: racesList, prova: racePage, pilotos: driversList, piloto: driverPage, regulamento: rules };

  function renderNav(sid, page) {
    var items = [['classificacao', 'Classificação'], ['provas', 'Provas'], ['pilotos', 'Pilotos'], ['equipas', 'Equipas'], ['regulamento', 'Regulamento']];
    var group = { prova: 'provas', piloto: 'pilotos' }[page] || page;
    document.getElementById('nav').innerHTML = items.map(function (it) {
      return '<a href="' + link(sid, [it[0]]) + '"' + (group === it[0] ? ' aria-current="page"' : '') + '>' + it[1] + '</a>';
    }).join('');
    var sel = document.getElementById('season-select');
    sel.innerHTML = cfg.seasons.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sid ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
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
      var h1 = app.querySelector('h1');
      document.title = (h1 && page ? h1.textContent + ' · ' : '') + 'Fórmula 88';
      window.scrollTo(0, 0);
    }).catch(function (err) {
      app.innerHTML = pageHead('Fórmula 88', 'Algo correu mal') + '<p class="empty">' + esc(err.message) + '</p>';
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
    var c = D.calc, rows = [['Pos', 'Piloto', 'Equipa', 'Grelha', 'Diferença', 'Melhor volta', 'Penalização (s)', 'Estado', 'Pontos']];
    r.results.slice().sort(function (a, b) { return (a.pos || 999) - (b.pos || 999); }).forEach(function (e) {
      var d = c.driverById[e.driver], x = d ? d.races.filter(function (q) { return q.race === r.id; })[0] : null;
      rows.push([e.pos || '', d ? d.name : e.driver, d && d.team ? d.team.name : '', e.grid == null ? '' : e.grid, e.gap || '', e.bestLap || '',
        e.penalty || '', e.status || (r.fastestLap === e.driver ? 'Volta mais rápida' : ''), x ? x.pts : '']);
    });
    return { name: r.name, rows: rows, widths: [6, 24, 28, 8, 12, 13, 15, 18, 8] };
  }
  function seasonSheets(D) {
    var c = D.calc, held = c.held;
    var head = ['Pos', 'Piloto', 'Equipa'].concat(held.map(function (r) { return r.name; }), ['Total', 'Geral', 'Presenças', 'Vitórias', 'Pódios', 'Voltas mais rápidas']);
    var rows = [head];
    c.drivers.filter(function (d) { return d.presences > 0; }).forEach(function (d) {
      rows.push([d.rank, d.name, d.team ? d.team.name : ''].concat(d.races.map(function (x) { return x.attended ? x.pts : ''; }), [d.total, d.geral, d.presences, d.wins, d.podiums, d.fastestLaps]));
    });
    var sheets = [{ name: 'Pilotos', rows: rows, widths: [6, 24, 28].concat(held.map(function () { return 14; }), [8, 8, 11, 9, 8, 19]) }];
    if (c.teams.length) {
      sheets.push({ name: 'Equipas', widths: [6, 30, 24, 10, 24, 10, 10], rows: [['Pos', 'Equipa', 'Piloto 1', 'Pontos 1', 'Piloto 2', 'Pontos 2', 'Pontos']].concat(c.teams.map(function (t) {
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
      rb.disabled = true; rb.textContent = 'A carregar…';
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

  getJSON('data/seasons.json').then(function (c) {
    cfg = c;
    window.addEventListener('hashchange', route);
    route();
  }).catch(function (err) {
    app.innerHTML = '<p class="empty">' + esc(err.message) + '</p>';
  });
})();
