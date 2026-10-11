/* Fórmula 88: replay de uma corrida, volta a volta.
   Tudo o que se vê é função pura do tempo de corrida, calculado a partir dos tempos por volta.
   Uso: F88Replay.mount(elemento, { track: [[x, y], ...], drivers: [{ name, laps: [segundos, ...] }, ...] }) */
(function (root) {
  'use strict';

  var GAP_EVERY = 2000;                                     // ms entre atualizações dos intervalos
  var STRAIGHT_SPEED = 0.4;   // mais baixo = travam mais nas curvas; mais alto = ritmo mais constante
  var CURV_SIGMA = 14;        // suavização da curvatura (em amostras; a pista tem 720)
  var FOLLOW_ZOOM = 2.6;      // quanto a câmara aproxima ao seguir um piloto
  var COLORS = ['#FF5A5A', '#4FE08A', '#FFE14A', '#FF7DE6', '#4FE3E3', '#FF9A4A', '#B08CFF', '#FFB3CC',
    '#C9E265', '#5CB8FF', '#FF6FB0', '#8FE0B0', '#FFC08A', '#D0B8FF', '#7FD6C4', '#E8A0FF', '#A8D8FF', '#FFD9A0'];

  function fmtLap(s) { return (s == null || !isFinite(s)) ? '–' : (s < 60 ? s.toFixed(3) : Math.floor(s / 60) + ':' + (s % 60).toFixed(3).padStart(6, '0')); }
  function fmtClock(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
  function fmtGap(sec, laps) { return laps >= 1 ? '+' + laps + (laps === 1 ? ' volta' : ' voltas') : '+' + (sec < 10 ? sec.toFixed(3) : sec.toFixed(1)); }
  function shortName(name) { var p = name.split(' ').filter(Boolean); return p.length < 2 ? name : p[0][0] + '. ' + p.slice(1).join(' '); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- pista: spline Catmull-Rom centrípeta fechada, reamostrada a passo constante ----------
  function buildTrack(raw, yDown) {       // yDown: y cresce para baixo, como num desenho feito sobre uma imagem
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    raw.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    var s = 1000 / ((maxX - minX) || 1);
    var scaled = raw.map(function (p) { return { x: (p.x - minX) * s, y: (yDown ? p.y - minY : maxY - p.y) * s }; });
    var pts = [];
    scaled.forEach(function (p) { var q = pts[pts.length - 1]; if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 0.5) pts.push(p); });
    if (pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.5) pts.pop();
    var n = pts.length;
    if (n < 4) return pts;
    function knot(t, a, b) { return t + Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-4); }
    function mix(a, b, t0, t1, t) { var f = t1 === t0 ? 0 : (t - t0) / (t1 - t0); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; }
    var dense = [], SUB = 24, i, k;
    for (i = 0; i < n; i++) {
      var P0 = pts[(i - 1 + n) % n], P1 = pts[i], P2 = pts[(i + 1) % n], P3 = pts[(i + 2) % n];
      var t0 = 0, t1 = knot(t0, P0, P1), t2 = knot(t1, P1, P2), t3 = knot(t2, P2, P3);
      for (k = 0; k < SUB; k++) {
        var t = t1 + (t2 - t1) * (k / SUB);
        var A1 = mix(P0, P1, t0, t1, t), A2 = mix(P1, P2, t1, t2, t), A3 = mix(P2, P3, t2, t3, t);
        dense.push(mix(mix(A1, A2, t0, t2, t), mix(A2, A3, t1, t3, t), t1, t2, t));
      }
    }
    var m = dense.length, len = [0];
    for (i = 1; i <= m; i++) { var a = dense[i - 1], b = dense[i % m]; len.push(len[i - 1] + Math.hypot(b.x - a.x, b.y - a.y)); }
    var N = 720, out = [];
    for (k = 0; k < N; k++) {
      var target = len[m] * k / N, lo = 1, hi = m;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (len[mid] < target) lo = mid + 1; else hi = mid; }
      var f = (target - len[lo - 1]) / ((len[lo] - len[lo - 1]) || 1), c = dense[(lo - 1) % m], d = dense[lo % m];
      out.push({ x: c.x + (d.x - c.x) * f, y: c.y + (d.y - c.y) * f });
    }
    return out;
  }

  // curvatura -> fração do TEMPO de volta gasta até cada ponto da pista
  function buildTimeCDF(track) {
    var N = track.length, k = new Array(N), i, d;
    for (i = 0; i < N; i++) {
      var a = track[(i - 1 + N) % N], b = track[i], c = track[(i + 1) % N];
      var v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
      var ds = (Math.hypot(v1x, v1y) + Math.hypot(v2x, v2y)) / 2 || 1;
      k[i] = Math.atan2(Math.abs(v1x * v2y - v1y * v2x), v1x * v2x + v1y * v2y) / ds;
    }
    var r = Math.ceil(CURV_SIGMA * 3), ker = [], ks = 0;
    for (d = -r; d <= r; d++) { var g = Math.exp(-(d * d) / (2 * CURV_SIGMA * CURV_SIGMA)); ker.push(g); ks += g; }
    var sm = k.map(function (_, j) { var acc = 0; for (var e = -r; e <= r; e++) acc += k[((j + e) % N + N) % N] * ker[e + r]; return acc / ks; });
    var maxK = Math.max.apply(null, sm) || 1, w = sm.map(function (v) { return v + STRAIGHT_SPEED * maxK; });
    var T = new Float64Array(N + 1);
    for (i = 0; i < N; i++) T[i + 1] = T[i] + (w[i] + w[(i + 1) % N]) / 2;
    for (i = 0; i <= N; i++) T[i] /= T[N] || 1;
    return T;
  }

  // ---------- modelo da corrida ----------
  function Race(data) {
    this.track = buildTrack(data.track.map(function (p) { return { x: +p[0], y: +p[1] }; }), data.yDown === true);
    this.cdf = buildTimeCDF(this.track);
    // menor distância entre dois troços diferentes da pista (para a faixa desenhada nunca se sobrepor a si própria)
    var T = this.track, N = T.length, far = Math.round(N * 0.07), sep = Infinity;
    for (var a = 0; a < N; a += 2) for (var c = a + far; c < N; c += 2) {
      if (N - (c - a) < far) break;
      var dx = T[a].x - T[c].x, dy = T[a].y - T[c].y, dd = dx * dx + dy * dy;
      if (dd < sep) sep = dd;
    }
    this.minSep = isFinite(sep) ? Math.sqrt(sep) : 1000;
    this.drivers = data.drivers.map(function (d, i) {
      var laps = [];
      for (var j = 0; j < d.laps.length; j++) { var v = +d.laps[j]; if (!isFinite(v) || v <= 0) break; laps.push(v); }
      var s0 = +d.start; if (!isFinite(s0) || s0 < 0) s0 = 0;     // "volta 0": quando cruzou a meta pela primeira vez
      var cum = [s0];
      laps.forEach(function (t) { cum.push(cum[cum.length - 1] + t); });
      return { name: d.name, color: COLORS[i % COLORS.length], laps: laps, cum: cum, n: laps.length, total: cum[cum.length - 1] };
    }).filter(function (d) { return d.n > 0; });
    this.totalLaps = Math.max.apply(null, this.drivers.map(function (d) { return d.n; }));
    this.duration = Math.max.apply(null, this.drivers.map(function (d) { return d.total; }));
    var ev = [], self = this;
    this.drivers.forEach(function (d) { d.laps.forEach(function (t, l) { ev.push({ at: d.cum[l + 1], driver: d, lap: l + 1, time: t }); }); });
    ev.sort(function (a, b) { return a.at - b.at; });
    this.records = []; var best = Infinity;
    ev.forEach(function (e) { if (e.time < best - 1e-9) { best = e.time; self.records.push(e); } });
    this.box = this.track.reduce(function (b, p) { return { x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y) }; }, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  }
  Race.prototype.distAt = function (d, t) {
    if (t >= d.total) return d.n;
    if (t < d.cum[0]) return (t - d.cum[0]) / d.laps[0];          // ainda a caminho da meta, na fila de partida
    var L = 0; while (L < d.n && d.cum[L + 1] <= t) L++;
    return L + (t - d.cum[L]) / d.laps[L];
  };
  Race.prototype.timeAt = function (d, dist) { if (dist < 0) return d.cum[0] + dist * d.laps[0]; var L = Math.floor(dist); return L >= d.n ? d.total : d.cum[L] + (dist - L) * d.laps[L]; };
  Race.prototype.pointAt = function (dist) {
    var T = this.cdf, N = T.length - 1, p = dist - Math.floor(dist), lo = 0, hi = N;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (T[mid] <= p) lo = mid + 1; else hi = mid; }
    var i = Math.max(0, lo - 1), a = i + (p - T[i]) / ((T[i + 1] - T[i]) || 1);
    var i0 = Math.floor(a) % N, f = a - Math.floor(a), A = this.track[i0], B = this.track[(i0 + 1) % N];
    return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f };
  };
  Race.prototype.gapBetween = function (ahead, behind, t) { return Math.max(0, Math.min(t, behind.d.total) - this.timeAt(ahead.d, behind.dist)); };
  Race.prototype.stateAt = function (t) {
    var self = this;
    var st = this.drivers.map(function (d) {
      var dist = self.distAt(d, t), finished = t >= d.total, done = finished ? d.n : Math.max(0, Math.floor(dist));
      return {
        d: d, dist: dist, finished: finished, done: done, pos: self.pointAt(dist),
        last: done > 0 ? d.laps[done - 1] : null,
        pb: done > 0 ? Math.min.apply(null, d.laps.slice(0, done)) : null,
        fade: finished ? Math.max(0, 1 - Math.max(0, t - d.total - 2) / 1.5) : 1
      };
    });
    var order = st.slice().sort(function (a, b) { return (b.dist - a.dist) || (a.d.total - b.d.total); });
    order.forEach(function (s, i) {
      s.order = i + 1;
      s.gap = i === 0 ? 0 : self.gapBetween(order[0], s, t);
      s.gapLaps = i === 0 ? 0 : Math.floor(order[0].dist - s.dist);
      s.int = i === 0 ? 0 : self.gapBetween(order[i - 1], s, t);
      s.intLaps = i === 0 ? 0 : Math.floor(order[i - 1].dist - s.dist);
    });
    var record = null;
    for (var k = 0; k < this.records.length; k++) { if (this.records[k].at <= t) record = this.records[k]; else break; }
    var byName = {};
    st.forEach(function (s) { byName[s.d.name] = s; });
    return { t: t, order: order, byName: byName, record: record, complete: t >= this.duration };
  };

  // ---------- interface ----------
  var ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>';
  var ICON_RESTART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';

  var TEMPLATE =
    '<div class="rp-main">' +
      '<div class="rp-stage"><canvas></canvas>' +
        '<div class="rp-tools"><button type="button" class="rp-chip rp-follow" aria-pressed="false" hidden>Seguir</button><button type="button" class="rp-chip rp-fit" hidden>Ver pista toda</button></div>' +
        '<div class="rp-toast" role="status"></div>' +
        '<p class="rp-hint"><span class="rp-full">Toca num piloto para o destacar, ou em dois para ver o duelo.</span><span class="rp-short">Toca num piloto, ou em dois para o duelo.</span></p>' +
        '<div class="rp-card" hidden><button type="button" class="rp-x" aria-label="Limpar seleção">×</button><div class="rp-card-body"></div></div>' +
      '</div>' +
      '<div class="rp-tower">' +
        '<div class="rp-head"><div class="rp-lap"><b class="rp-lap-now">Volta 1</b><span class="rp-lap-total"></span><em class="rp-state"></em></div><div class="rp-best"></div></div>' +
        '<div class="rp-cols"><div>Pos</div><div></div><div>Piloto</div><div>Última</div><div>Int.</div><div>Líder</div></div>' +
        '<div class="rp-rows"><div class="rp-rows-inner"></div></div>' +
      '</div>' +
    '</div>' +
    '<div class="rp-transport">' +
      '<button type="button" class="rp-icon rp-primary rp-play" aria-label="Pausa"></button>' +
      '<button type="button" class="rp-icon rp-restart" aria-label="Recomeçar">' + ICON_RESTART + '</button>' +
      '<div class="rp-scrub"><div class="rp-ticks"></div><input type="range" min="0" max="1000" step="1" value="0" aria-label="Tempo de corrida"></div>' +
      '<div class="rp-clock"><b class="rp-now">0:00</b> <span class="rp-end"></span></div>' +
      '<div class="rp-speeds" role="group" aria-label="Velocidade"><button type="button" data-speed="1">1×</button><button type="button" data-speed="2">2×</button><button type="button" data-speed="5">5×</button><button type="button" data-speed="10">10×</button></div>' +
    '</div>';

  function hexToRgb(h) {
    h = (h || '').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return isFinite(n) && h.length === 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null;
  }
  function mixHex(a, b, f) {
    var A = hexToRgb(a), B = hexToRgb(b);
    if (!A || !B) return '#4A545A';
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * f); }).join(',') + ')';
  }

  function Replay(el, data) {
    var self = this;
    this.el = el; el.classList.add('rp'); el.innerHTML = TEMPLATE;
    this.q = function (s) { return el.querySelector(s); };
    this.race = new Race(data);
    this.t = 0; this.playing = true; this.scrubbing = false; this.speed = 2;
    this.selected = []; this.follow = false; this.cam = null;
    this.prevOrder = {}; this.arrows = {}; this.lastRecord = null; this.toastUntil = 0; this.prevDuel = null; this.duelTrend = 0;
    this.alive = true; this.rowH = 40; this.theme = null; this.themeAt = 0;
    this.canvas = this.q('canvas'); this.ctx = this.canvas.getContext('2d');
    this.buildStatic(); this.bind();
    this.ro = new ResizeObserver(function () { self.resize(); });
    this.ro.observe(this.q('.rp-stage')); this.ro.observe(this.q('.rp-rows'));
    this.resize();
    this.state = this.race.stateAt(0);
    this.last = performance.now();
    requestAnimationFrame(function (now) { self.frame(now); });
  }
  var P = Replay.prototype;

  P.destroy = function () { this.alive = false; if (this.ro) this.ro.disconnect(); this.el.innerHTML = ''; this.el.classList.remove('rp'); };

  P.buildStatic = function () {
    var r = this.race, self = this, inner = this.q('.rp-rows-inner');
    this.q('.rp-lap-total').textContent = '/ ' + r.totalLaps;
    this.q('.rp-end').textContent = '/ ' + fmtClock(r.duration);
    this.rows = {};
    r.drivers.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'rp-row'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', d.name);
      b.innerHTML = '<span class="rp-p"></span><span class="rp-a"></span><span class="rp-n"><span class="rp-dot" style="background:' + d.color + '"></span><span><span class="rp-full">' + esc(d.name) + '</span><span class="rp-short">' + esc(shortName(d.name)) + '</span></span></span><span class="rp-t"></span><span class="rp-t rp-dim"></span><span class="rp-t"></span>';
      b.addEventListener('click', function () { self.toggleSelect(d.name); });
      inner.appendChild(b);
      var c = b.children;
      self.rows[d.name] = { el: b, p: c[0], a: c[1], last: c[3], int: c[4], gap: c[5], cache: {} };
    });
    var ref = r.drivers.slice().sort(function (a, b) { return (b.n - a.n) || (a.total - b.total); })[0];
    this.q('.rp-ticks').innerHTML = ref.cum.slice(1, -1).map(function (c, i) { return '<i class="' + ((i + 1) % 5 === 0 ? 'rp-major' : '') + '" style="left:' + (c / r.duration * 100) + '%"></i>'; }).join('');
    this.syncPlay(); this.syncSpeed();
  };

  P.bind = function () {
    var self = this, s = this.q('input[type="range"]');
    this.slider = s;
    this.q('.rp-play').onclick = function () { self.togglePlay(); };
    this.q('.rp-restart').onclick = function () { self.seek(0); self.playing = true; self.syncPlay(); };
    Array.prototype.forEach.call(this.el.querySelectorAll('.rp-speeds button'), function (b) { b.onclick = function () { self.speed = +b.dataset.speed; self.syncSpeed(); }; });
    s.addEventListener('input', function () { self.scrubbing = true; self.seek(s.value / 1000 * self.race.duration); });
    s.addEventListener('change', function () { self.scrubbing = false; });
    this.q('.rp-follow').onclick = function () { self.follow = !self.follow; self.syncTools(); };
    this.q('.rp-fit').onclick = function () { self.follow = false; self.syncTools(); };
    this.q('.rp-x').onclick = function () { self.selected = []; self.follow = false; self.syncSelection(); };
    this.canvas.addEventListener('click', function (e) { self.pick(e); });
    // atalhos de teclado, só quando o foco está dentro do replay
    this.el.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      var k = e.key.toLowerCase();
      if (k === 'r') self.q('.rp-restart').click();
      else if (k === 'f' && self.selected.length) self.q('.rp-follow').click();
      else if (e.key === 'Escape') self.q('.rp-x').click();
      else if (e.key === 'ArrowRight') { e.preventDefault(); self.seek(self.t + 5); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); self.seek(self.t - 5); }
      else if (['1', '2', '3', '4'].indexOf(k) >= 0) { self.speed = [1, 2, 5, 10][+k - 1]; self.syncSpeed(); }
    });
  };

  P.togglePlay = function () { if (!this.playing && this.t >= this.race.duration) this.seek(0); this.playing = !this.playing; this.syncPlay(); };
  P.seek = function (t) {
    this.t = Math.min(Math.max(t, 0), this.race.duration);
    this.prevOrder = {}; this.arrows = {}; this.prevDuel = null; this.duelTrend = 0; this.gapAt = 0;
    this.lastRecord = this.race.stateAt(this.t).record;       // não anuncia recordes antigos ao saltar
  };
  P.toggleSelect = function (name) {
    var i = this.selected.indexOf(name);
    if (i >= 0) this.selected.splice(i, 1);
    else { this.selected.push(name); if (this.selected.length > 2) this.selected.shift(); }
    if (!this.selected.length) this.follow = false;
    this.prevDuel = null; this.duelTrend = 0; this.cardKey = null;
    this.syncSelection();
  };
  P.syncPlay = function () { var b = this.q('.rp-play'); b.innerHTML = this.playing ? ICON_PAUSE : ICON_PLAY; b.setAttribute('aria-label', this.playing ? 'Pausa' : 'Reproduzir'); };
  P.syncSpeed = function () { var sp = this.speed; Array.prototype.forEach.call(this.el.querySelectorAll('.rp-speeds button'), function (b) { b.setAttribute('aria-pressed', String(+b.dataset.speed === sp)); }); };
  P.syncTools = function () {
    var has = this.selected.length > 0, f = this.q('.rp-follow');
    f.hidden = !has; f.setAttribute('aria-pressed', String(this.follow));
    this.q('.rp-fit').hidden = !(has && this.follow);
  };
  P.syncSelection = function () {
    var sel = this.selected, rows = this.rows;
    Object.keys(rows).forEach(function (n) { rows[n].el.setAttribute('aria-pressed', String(sel.indexOf(n) >= 0)); });
    this.q('.rp-card').hidden = !sel.length; this.q('.rp-hint').hidden = sel.length > 0;
    this.syncTools();
  };

  P.frame = function (now) {
    if (!this.alive || !document.body.contains(this.el)) { this.alive = false; return; }
    var self = this, dt = Math.min(now - this.last, 100) / 1000; this.last = now;
    if (this.playing && !this.scrubbing) {
      this.t = Math.min(this.t + dt * this.speed, this.race.duration);
      if (this.t >= this.race.duration) { this.playing = false; this.syncPlay(); }
    }
    this.state = this.race.stateAt(this.t);
    this.updateTower(now); this.updateCard(); this.updateTransport();
    this.draw(dt, now);
    requestAnimationFrame(function (n) { self.frame(n); });
  };

  P.set = function (row, key, el, text, cls) {              // só toca no DOM quando algo muda
    var v = text + '|' + (cls || '');
    if (row.cache[key] === v) return;
    row.cache[key] = v; el.textContent = text; if (cls !== undefined) el.className = cls;
  };

  P.updateTower = function (now) {
    var self = this, st = this.state, lead = st.order[0], rec = st.record;
    // os intervalos só são refrescados de GAP_EVERY em GAP_EVERY ms enquanto a corrida corre; parado ou a arrastar, é imediato
    var fresh = this.gapFresh = !this.playing || this.scrubbing || !this.gapAt || now - this.gapAt >= GAP_EVERY;
    if (fresh) this.gapAt = now;
    this.q('.rp-lap-now').textContent = 'Volta ' + Math.min(lead.finished ? lead.d.n : lead.done + 1, this.race.totalLaps);
    this.q('.rp-state').textContent = st.complete ? 'TERMINADA' : '';
    var best = rec ? 'Volta mais rápida: <b>' + fmtLap(rec.time) + '</b> · ' + esc(rec.driver.name) + ' (V' + rec.lap + ')' : 'Volta mais rápida: –';
    if (best !== this.bestHtml) { this.bestHtml = best; this.q('.rp-best').innerHTML = best; }
    st.order.forEach(function (s) {
      var row = self.rows[s.d.name], prev = self.prevOrder[s.d.name];
      if (prev && prev !== s.order && self.playing && !self.scrubbing) self.arrows[s.d.name] = { up: s.order < prev, until: now + 2500 };
      self.prevOrder[s.d.name] = s.order;
      var arrow = self.arrows[s.d.name], show = arrow && arrow.until > now, y = (s.order - 1) * self.rowH;
      if (row.cache.y !== y) { row.cache.y = y; row.el.style.transform = 'translateY(' + y + 'px)'; }
      var cls = 'rp-row' + (s.order === 1 ? ' rp-lead' : '') + (s.finished ? ' rp-done' : '');
      if (row.cache.cls !== cls) { row.cache.cls = cls; row.el.className = cls; }
      self.set(row, 'p', row.p, String(s.order));
      self.set(row, 'a', row.a, show ? (arrow.up ? '▲' : '▼') : '', 'rp-a' + (show ? (arrow.up ? ' rp-up' : ' rp-down') : ''));
      var isFl = rec && s.last != null && Math.abs(s.last - rec.time) < 1e-6, isPb = s.last != null && Math.abs(s.last - s.pb) < 1e-6;
      self.set(row, 'last', row.last, fmtLap(s.last), 'rp-t' + (isFl ? ' rp-fl' : isPb ? ' rp-pb' : ''));
      if (fresh || row.cache.gapOrder !== s.order) {          // quem muda de posição acerta logo os seus números
        row.cache.gapOrder = s.order;
        self.set(row, 'int', row.int, s.order === 1 ? '' : fmtGap(s.int, s.intLaps));
        self.set(row, 'gap', row.gap, s.order === 1 ? 'Líder' : fmtGap(s.gap, s.gapLaps));
      }
    });
    var toast = this.q('.rp-toast');
    if (rec !== this.lastRecord) {
      if (rec && this.playing && !this.scrubbing) {
        toast.innerHTML = 'Nova volta mais rápida<small>' + esc(rec.driver.name) + ' · ' + fmtLap(rec.time) + ' · volta ' + rec.lap + '</small>';
        this.toastUntil = now + 3500;
      }
      this.lastRecord = rec;
    }
    toast.classList.toggle('rp-show', now < this.toastUntil);
  };

  P.updateCard = function () {
    if (!this.selected.length) return;
    var st = this.state, S = this.selected.map(function (n) { return st.byName[n]; }), html;
    var key = S.map(function (s) { return s.d.name + s.order + '.' + s.done; }).join('|');
    if (!this.gapFresh && key === this.cardKey) return;
    this.cardKey = key;
    function nameEl(s) { return '<div class="rp-card-name"><span class="rp-dot" style="background:' + s.d.color + '"></span><span>' + s.order + 'º ' + esc(s.d.name) + '</span></div>'; }
    if (S.length === 2) {
      var pair = S[0].dist >= S[1].dist ? S : [S[1], S[0]], ahead = pair[0], behind = pair[1];
      var laps = Math.floor(ahead.dist - behind.dist), gap = this.race.gapBetween(ahead, behind, st.t);
      if (this.prevDuel != null && this.playing && Math.abs(gap - this.prevDuel) > 1e-4) this.duelTrend = gap > this.prevDuel ? 1 : -1;
      this.prevDuel = gap;
      var trend = this.duelTrend > 0 ? '<span class="rp-opening">a abrir ▲</span>' : this.duelTrend < 0 ? '<span class="rp-closing">a fechar ▼</span>' : '';
      html = '<div class="rp-card-k">Duelo</div><div class="rp-card-row"><div class="rp-card-names">' + nameEl(ahead) + nameEl(behind) +
        '</div><div class="rp-card-gap"><div class="rp-card-big">' + (laps >= 1 ? '+' + laps + 'V' : gap.toFixed(3) + 's') + '</div><div class="rp-card-trend">' + trend + '</div></div></div>';
    } else {
      var s = S[0];
      html = '<div class="rp-card-k">Piloto</div>' + nameEl(s) + '<div class="rp-card-stats"><div>Última<b>' + fmtLap(s.last) + '</b></div><div>Melhor<b>' + fmtLap(s.pb) + '</b></div><div>Ao líder<b>' +
        (s.order === 1 ? 'Líder' : fmtGap(s.gap, s.gapLaps)) + '</b></div><div>Voltas<b>' + s.done + '/' + s.d.n + '</b></div></div>';
    }
    if (html !== this.cardHtml) { this.cardHtml = html; this.q('.rp-card-body').innerHTML = html; }
  };

  P.updateTransport = function () {
    var pct = this.t / this.race.duration;
    if (!this.scrubbing) this.slider.value = Math.round(pct * 1000);
    this.slider.style.setProperty('--pct', pct * 100 + '%');
    this.q('.rp-now').textContent = fmtClock(this.t);
  };

  P.resize = function () {
    var r = this.q('.rp-stage').getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(r.width, 50); this.h = Math.max(r.height, 50); this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    // em ecrãs largos, as linhas da torre encolhem para caberem todas sem deslizar
    var n = this.race.drivers.length, rowsEl = this.q('.rp-rows'), inner = this.q('.rp-rows-inner');
    var wide = window.matchMedia('(min-width: 901px)').matches, avail = rowsEl.clientHeight;
    var rh = wide ? (avail > 0 ? Math.min(40, Math.max(28, Math.floor(avail / n))) : 40) : 36;   // no telemóvel, linhas mais baixas
    if (rh !== this.rowH || !inner.style.height) {
      this.rowH = rh; inner.style.height = n * rh + 'px'; this.el.style.setProperty('--rp-rh', rh + 'px');
      var rows = this.rows; Object.keys(rows).forEach(function (k) { rows[k].cache.y = null; });
    }
  };

  P.readTheme = function (now) {                 // cores da pintura atual, para o desenho da pista
    if (this.theme && now - this.themeAt < 500) return this.theme;
    var cs = getComputedStyle(this.el), bg = cs.getPropertyValue('--panel'), text = cs.getPropertyValue('--text');
    this.themeAt = now;
    this.theme = { track: mixHex(bg, text, 0.24), text: text.trim() || '#EDEFEA', label: mixHex(bg, bg, 0) };
    return this.theme;
  };
  P.fitView = function () {
    var b = this.race.box, small = this.w < 500, sel = this.selected.length > 0;
    // em ecrãs pequenos a pista usa quase toda a área; só se guarda espaço para o que está mesmo por cima
    var padX = small ? 20 : 36, padTop = small ? (sel ? 44 : 20) : 68;
    var card = sel ? this.q('.rp-card') : this.q('.rp-hint'), ch = card && !card.hidden ? card.offsetHeight : 0;
    var padBottom = small ? ch + 26 : (sel ? 120 : 52);
    var z = Math.min((this.w - 2 * padX) / (b.x1 - b.x0), (this.h - padTop - padBottom) / (b.y1 - b.y0));
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 - (padTop - padBottom) / 2 / z, z: z };
  };
  P.targetView = function () {
    var fit = this.fitView(), st = this.state;
    if (!this.follow || !this.selected.length) return fit;
    var pts = this.selected.map(function (n) { return st.byName[n].pos; });
    var x = pts.reduce(function (a, p) { return a + p.x; }, 0) / pts.length, y = pts.reduce(function (a, p) { return a + p.y; }, 0) / pts.length;
    var z = fit.z * FOLLOW_ZOOM;
    if (pts.length === 2) {                         // mantém os dois no enquadramento
      var span = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) + 160;
      z = Math.max(fit.z, Math.min(z, Math.min(this.w, this.h) / span));
    }
    return { x: x, y: y + 30 / z, z: z };
  };
  P.toScreen = function (p) { return { x: (p.x - this.cam.x) * this.cam.z + this.w / 2, y: (p.y - this.cam.y) * this.cam.z + this.h / 2 }; };

  P.draw = function (dt, now) {
    var self = this, ctx = this.ctx, tv = this.targetView(), th = this.readTheme(now);
    if (!this.cam) this.cam = tv;
    var k = 1 - Math.exp(-dt * 6);
    this.cam = { x: this.cam.x + (tv.x - this.cam.x) * k, y: this.cam.y + (tv.y - this.cam.y) * k, z: this.cam.z + (tv.z - this.cam.z) * k };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    var T = this.race.track, path = new Path2D();
    T.forEach(function (p, i) { var s = self.toScreen(p); if (i) path.lineTo(s.x, s.y); else path.moveTo(s.x, s.y); });
    path.closePath();
    var width = Math.max(5, Math.min(Math.max(16, 22 * this.cam.z), this.race.minSep * this.cam.z * 0.72));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = th.track; ctx.lineWidth = width; ctx.stroke(path);
    var a = this.toScreen(T[0]), b = this.toScreen(T[1]), m = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    var nx = -(b.y - a.y) / m, ny = (b.x - a.x) / m, half = width / 2 + 5;
    ctx.strokeStyle = th.text; ctx.lineWidth = 4; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(a.x - nx * half, a.y - ny * half); ctx.lineTo(a.x + nx * half, a.y + ny * half); ctx.stroke();

    var sel = this.selected;
    var order = this.state.order.slice().reverse().sort(function (p, q) { return (sel.indexOf(p.d.name) >= 0) - (sel.indexOf(q.d.name) >= 0); });
    this.hit = [];
    var labels = [];
    order.forEach(function (s) {
      if (s.fade <= 0) return;
      var p = self.toScreen(s.pos), isSel = sel.indexOf(s.d.name) >= 0, dim = sel.length && !isSel, r = isSel ? 14 : 11;
      ctx.globalAlpha = s.fade * (dim ? 0.45 : 1);
      if (isSel) { ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2); ctx.strokeStyle = th.text; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = s.d.color; ctx.fill();
      ctx.strokeStyle = '#0F1214'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#0F1214'; ctx.font = '700 ' + (isSel ? 14 : 12) + "px 'Space Grotesk', system-ui, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(s.order), p.x, p.y + 0.5);
      if (isSel) {
        ctx.font = "700 13px 'Space Grotesk', system-ui, sans-serif";
        var tw = ctx.measureText(s.d.name).width + 16, lx = Math.min(Math.max(p.x - tw / 2, 6), self.w - tw - 6), ly = p.y - r - 34;
        // se a etiqueta chocar com a do outro piloto selecionado, passa para baixo do kart
        if (labels.some(function (q) { return lx < q.x + q.w && q.x < lx + tw && ly < q.y + 24 && q.y < ly + 24; })) ly = p.y + r + 10;
        labels.push({ x: lx, y: ly, w: tw });
        ctx.fillStyle = '#0F1214'; ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(lx, ly, tw, 24, 6); else ctx.rect(lx, ly, tw, 24);
        ctx.fill();
        ctx.fillStyle = s.d.color; ctx.fillText(s.d.name, lx + tw / 2, ly + 12.5);
      }
      ctx.globalAlpha = 1;
      self.hit.push({ name: s.d.name, x: p.x, y: p.y });
    });
  };

  P.pick = function (e) {                          // tocar num kart na pista seleciona-o
    var r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 24;
    (this.hit || []).forEach(function (h) { var d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } });
    if (best) this.toggleSelect(best.name);
  };

  root.F88Replay = { mount: function (el, data) { return new Replay(el, data); } };
})(window);
