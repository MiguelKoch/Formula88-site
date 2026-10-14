/* Fórmula 88: português ou inglês. A escolha fica guardada só neste browser.
   Uso: F88I18n.L('Vencedor', 'Winner') devolve o texto na língua escolhida. */
(function (root) {
  'use strict';

  var lang = 'pt';
  try { var s = localStorage.getItem('f88-lang'); if (s === 'en' || s === 'pt') lang = s; } catch (e) {}
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt';

  function L(pt, en) { return lang === 'en' ? en : pt; }

  // 1º 2º 3º  ·  1st 2nd 3rd
  function ord(n) {
    if (lang !== 'en') return n + 'º';
    var t = n % 100, u = n % 10;
    return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
  }

  var MONTHS = {
    pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  };
  var MONTHS_LONG = {
    pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };
  function months() { return MONTHS[lang]; }
  function monthsLong() { return MONTHS_LONG[lang]; }

  // Textos que vêm dos ficheiros de dados (escritos em português)
  var DATA = {
    'Seco': 'Dry', 'Molhado': 'Wet', 'Chuva': 'Rain', 'Humido': 'Damp', 'Húmido': 'Damp',
    'Grelha definida pela qualificação.': 'Grid set by qualifying.',
    'Grelha definida pelos tempos de treino.': 'Grid set by practice times.'
  };
  function data(text) {
    if (lang !== 'en' || text == null) return text;
    var t = String(text);
    if (DATA[t]) return DATA[t];
    var m = /^Temporada (.+)$/.exec(t);
    if (m) return 'Season ' + m[1];
    m = /^\+(\d+) voltas?$/.exec(t);
    if (m) return '+' + m[1] + (m[1] === '1' ? ' lap' : ' laps');
    return t;
  }

  function set(l) {
    lang = l === 'en' ? 'en' : 'pt';
    document.documentElement.lang = lang;
    try { localStorage.setItem('f88-lang', lang); } catch (e) {}
  }

  root.F88I18n = { L: L, ord: ord, months: months, monthsLong: monthsLong, data: data, set: set, get lang() { return lang; } };
})(window);
