/* ByeBoer — offline beekeeping app: hives, harvests, quotes, invoices and money.
 * Everything is stored on this device only (IndexedDB in the browser). Nothing is uploaded.
 * Excel and PDF files (reports, quotes, invoices) are built on the device by export.js.
 */
(function () {
  'use strict';

  var VERSION = '2.9.0';
  var I18N = window.BB_I18N;
  var FX = window.FX;
  var app = document.getElementById('app');

  var D = null;          // all data
  var TAB = 'home';      // current main tab
  var V = 'home';        // current view (a tab, or a sub view)
  var F = null;          // state for the current form / sub view
  var LS = { money: { ym: null, dir: 'all' }, fuel: { ym: null }, diary: { n: 20, q: '' }, docs: { n: 15, f: 'all' }, honey: { n: 15 }, hist: { n: 20 }, trips: { n: 20 } };
  var confirmKey = '';   // "tap again" confirmations

  /* ================================================================ */
  /* Lists and categories                                              */
  /* ================================================================ */
  var CATS = {
    'in': [{ k: 'honey' }, { k: 'wax' }, { k: 'colonies' }, { k: 'queens' }, { k: 'pollination' }, { k: 'services_in' },
           { k: 'products' }, { k: 'training' }, { k: 'grants' }, { k: 'interest_in' }, { k: 'other_in' }],
    out: [{ k: 'equipment' }, { k: 'foundation' }, { k: 'feed' }, { k: 'meds' }, { k: 'gear' }, { k: 'packaging' }, { k: 'bees_buy' },
          { k: 'honey_buy' }, { k: 'transport' }, { k: 'site_rent' }, { k: 'repairs' }, { k: 'wages' }, { k: 'power' }, { k: 'insurance' }, { k: 'fees' },
          { k: 'marketing' }, { k: 'bank' }, { k: 'admin' }, { k: 'other_out' }]
  };
  var NO_VAT_DEFAULT = { wages: 1, bank: 1, insurance: 1, grants: 1, interest_in: 1, fees: 1 };
  var TAGS = ['weather', 'hives', 'harvest', 'swarms', 'flowering', 'clients', 'repairs', 'other'];
  var HIVE_TYPES = ['lang', 'topbar', 'nuc', 'catch', 'other'];
  var HIVE_SRC = ['swarm', 'removal', 'split', 'bought', 'other'];
  var HIVE_STATUS = ['active', 'dead', 'absconded', 'merged', 'sold'];
  var PROBS = ['afb', 'varroa', 'shb', 'waxmoth', 'queenless', 'qcells', 'laying', 'robbing', 'ants', 'badger', 'theft'];
  var BAD_PROBS = { afb: 1, queenless: 1, laying: 1, badger: 1, theft: 1 };
  var CARE_TYPES = ['feed', 'treat', 'requeen', 'split', 'other'];
  // What can be shown on a quote / invoice (the checklist when you make one)
  var SHOW_KEYS = ['logo', 'logo2', 'c_addr', 'c_town', 'c_postal', 'c_phone', 'c_email', 'c_vat', 'awr', 'job', 'site', 'dates2', 'paid', 'deposit', 'bank', 'info', 'vat_no', 'reg_no', 'notes', 'terms'];
  var SHOW_DEFAULT = ['logo', 'logo2', 'c_addr', 'c_town', 'c_postal', 'c_phone', 'c_email', 'c_vat', 'job', 'site', 'dates2', 'paid', 'deposit', 'bank', 'info', 'vat_no', 'notes', 'terms'];
  var PAY_METHODS = ['eft', 'cash', 'card', 'other'];
  var Q_STATUS = ['draft', 'sent', 'accepted', 'declined'];

  /* ================================================================ */
  /* Language                                                          */
  /* ================================================================ */
  function L() { return (D && D.settings.lang) || 'en'; }
  function t(key, vars) {
    var s = (I18N[L()] || I18N.en)[key];
    if (s == null) s = I18N.en[key];
    if (s == null) s = key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }
  function catLabel(k) { return !k ? '' : k.indexOf('c:') === 0 ? k.slice(2) : t('cat_' + k); }

  /* ================================================================ */
  /* Storage (IndexedDB, with localStorage fallback)                   */
  /* ================================================================ */
  var DB_NAME = 'byeboer', STORE = 'kv', PHOTOS = 'photos', LS_KEY = 'byeboer.data', useLS = false, dbp = null;
  function getDB() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function loadData() {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE, 'readonly').objectStore(STORE).get('data');
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
      });
    }).catch(function () {
      useLS = true;
      try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; }
    });
  }
  function save() {
    var copy = JSON.parse(JSON.stringify(D));
    if (useLS) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(copy)); return Promise.resolve(true); }
      catch (e) { toast(t('err_save') + ' ' + e.message); return Promise.resolve(false); }
    }
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(copy, 'data');
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    }).catch(function (e) { toast(t('err_save') + ' ' + (e && e.message || '')); return false; });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  /* Slip photos: kept in their own store, the records only hold the photo id */
  function photoTx(mode, fn) {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(PHOTOS, mode), st = tx.objectStore(PHOTOS), out;
        var q = fn(st);
        if (q) q.onsuccess = function () { out = q.result; };
        tx.oncomplete = function () { res(out); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function photoPut(id, blob) { return photoTx('readwrite', function (st) { st.put(blob, id); }); }
  function photoGet(id) { return photoTx('readonly', function (st) { return st.get(id); }); }
  function photoDel(id) { return id ? photoTx('readwrite', function (st) { st.delete(id); }).catch(function () {}) : Promise.resolve(); }
  function photoClear() { return photoTx('readwrite', function (st) { st.clear(); }).catch(function () {}); }
  function photoAll() {
    return getDB().then(function (db) {
      return new Promise(function (res, rej) {
        var out = {}, tx = db.transaction(PHOTOS, 'readonly'), q = tx.objectStore(PHOTOS).openCursor();
        q.onsuccess = function () { var c = q.result; if (c) { out[c.key] = c.value; c.continue(); } };
        tx.oncomplete = function () { res(out); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  var photoUrls = {};   // id -> object URL (cache for showing thumbnails)
  function photoUrl(id) {
    if (photoUrls[id]) return Promise.resolve(photoUrls[id]);
    return photoGet(id).then(function (b) { if (!b) return null; photoUrls[id] = URL.createObjectURL(b); return photoUrls[id]; });
  }
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('photo')); };
      img.src = url;
    });
  }
  // Shrink a camera photo to max 1600 px JPEG (~150-350 KB) so the phone doesn't fill up
  function shrinkPhoto(file) {
    return loadImage(file).then(function (img) {
      var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (resolve, reject) { c.toBlob(function (b) { b ? resolve(b) : reject(new Error('photo')); }, 'image/jpeg', 0.72); });
    });
  }
  // Logo: max 700 x 350 px, on a white background, as a JPEG data URL (works in the PDF too)
  function makeLogo(file) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 700 / w, 350 / h);
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      var g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return { url: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
    });
  }

  function blank() {
    var lang = /^af/i.test(navigator.language || '') ? 'af' : 'en';
    return {
      app: 'ByeBoer', v: 1,
      settings: { setup: false, lang: lang, biz: '', owner: '', phone: '', email: '', addr: '', regNo: '', regDue: '',
                  vat: false, vatRate: 15, vatNo: '', yearEnd: 2,
                  logo: '', logoW: 0, logoH: 0, logo2: '', logo2W: 0, logo2H: 0,
                  bankName: '', bankHolder: '', bankAcc: '', bankBranch: '', bankType: '',
                  qPrefix: 'Q', iPrefix: 'B', nextQ: 1, nextI: 1, show: SHOW_DEFAULT.slice(), payDays: 7, quoteDays: 30, deposit: 0, terms: '',
                  fuelOn: false, travelDefault: false, kmRate: 0,
                  remind: true, remindTime: '18:00', cats: { 'in': [], out: [] }, svcs: [], lastBackup: '' },
      money: [], fuel: [], diary: [], recur: [],
      hives: [], moves: [], supers: [], insp: [], harvests: [], care: [],
      process: [], products: [], bottling: [], buys: [], trips: [], activeTrip: null,
      clients: [], docs: []
    };
  }
  var LISTS = ['money', 'fuel', 'diary', 'recur', 'hives', 'moves', 'supers', 'insp', 'harvests', 'care', 'process', 'products', 'bottling', 'buys', 'trips', 'clients', 'docs'];
  var COLL = { money: 'money', fuel: 'fuel', diary: 'diary', recur: 'recur', hive: 'hives', move: 'moves', super: 'supers', insp: 'insp',
               harvest: 'harvests', care: 'care', process: 'process', product: 'products', bottle: 'bottling', buy: 'buys', trip: 'trips', client: 'clients', doc: 'docs' };
  function normalise(d) {
    var b = blank();
    if (!d || typeof d !== 'object') return b;
    d.settings = Object.assign(b.settings, d.settings || {});
    if (!d.settings.cats || !d.settings.cats.out) d.settings.cats = { 'in': [], out: [] };
    if (!Array.isArray(d.settings.svcs)) d.settings.svcs = [];
    if (!Array.isArray(d.settings.show)) d.settings.show = SHOW_DEFAULT.slice();
    if (d.settings.show.indexOf('logo2') < 0 && d.settings.show.indexOf('logo') > -1) d.settings.show.push('logo2');
    LISTS.forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
    if (Array.isArray(d.apiaries)) {   // version 1 kept hives in apiaries: the apiary becomes the hive's place
      d.hives.forEach(function (h) {
        var a = d.apiaries.filter(function (x) { return x.id === h.ap; })[0];
        if (a && !h.place) { h.place = a.name; h.gps = a.gps || ''; }
        delete h.ap;
      });
      delete d.apiaries;
    }
    d.hives.forEach(function (h) { if (h.supers0 == null) h.supers0 = 0; });
    d.harvests = d.harvests.filter(function (x) { return Array.isArray(x.takes); });
    if (!d.activeTrip || typeof d.activeTrip !== 'object') d.activeTrip = null;
    d.app = 'ByeBoer'; d.v = 1;
    return d;
  }

  /* ================================================================ */
  /* Helpers                                                           */
  /* ================================================================ */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dateStr(new Date()); }
  function parseD(s) { var p = String(s || '').split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function addMonths(ym, n) { var d = parseD(ym + '-01'); d.setMonth(d.getMonth() + n); return dateStr(d).slice(0, 7); }
  function addDays(d, n) { var x = parseD(d); x.setDate(x.getDate() + n); return dateStr(x); }
  function daysBetween(a, b) { return Math.round((parseD(b) - parseD(a)) / 864e5); }
  function monthName(m, short) { return t(short ? 'mon' : 'months').split(',')[m - 1]; }
  function ymLabel(ym) { var p = ym.split('-'); return monthName(+p[1]) + ' ' + p[0]; }
  function niceDate(s, noYear) {
    if (!s) return '';
    var d = parseD(s);
    return t('days').split(',')[d.getDay()] + ' ' + d.getDate() + ' ' + monthName(d.getMonth() + 1, true) + (noYear ? '' : ' ' + d.getFullYear());
  }
  function shortDate(s) { if (!s) return ''; var d = parseD(s); return d.getDate() + ' ' + monthName(d.getMonth() + 1, true) + ' ' + d.getFullYear(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) {
    var s = String(v == null ? '' : v).replace(/[\s R]/gi, '');
    if (!s) return NaN;
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function fmtNum(n, dec) {
    n = Number(n) || 0;
    var neg = n < 0, s = Math.abs(n).toFixed(dec).split('.');
    var i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '-' : '') + i + (dec ? (L() === 'af' ? ',' : '.') + s[1] : '');
  }
  function fmtR(n) { n = Number(n) || 0; return (n < 0 ? '-' : '') + 'R ' + fmtNum(Math.abs(n), 2); }
  function fmtL(n) { return fmtNum(n, n % 1 ? 1 : 0) + ' L'; }
  function fmtKg(n) { return fmtNum(n, n % 1 ? 1 : 0) + ' kg'; }
  function fmtQ(n) { return fmtNum(n, n % 1 ? (n * 10 % 1 ? 2 : 1) : 0); }
  function numIn(n) { return n == null || n === '' || isNaN(n) ? '' : (L() === 'af' ? String(n).replace('.', ',') : String(n)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clean(s, max) { return String(s == null ? '' : s).replace(/[ \t]+/g, ' ').trim().slice(0, max || 200); }
  function cleanMulti(s, max) { return String(s == null ? '' : s).replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max || 500); }
  function inRange(d, from, to) { return (!from || d >= from) && (!to || d <= to); }
  function byDateDesc(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.ts || 0) - (a.ts || 0); }
  function byDateAsc(a, b) { return -byDateDesc(a, b); }
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); }
  function uniq(list, max) {
    var seen = {}, out = [];
    list.forEach(function (x) {
      var s = String(x || '').trim(), k = s.toLowerCase();
      if (s && !seen[k] && out.length < max) { seen[k] = 1; out.push(s); }
    });
    return out;
  }
  function catsFor(dir, keep) {
    var list = CATS[dir].map(function (c) { return c.k; });
    (D.settings.cats[dir] || []).forEach(function (n) { list.push('c:' + n); });
    if (keep && list.indexOf(keep) < 0) list.push(keep);
    return list;
  }
  function vatRate() { return Number(D.settings.vatRate) || 15; }
  function vatOf(amt, incl) { var r = vatRate(); return incl ? r2(amt * r / (100 + r)) : 0; }

  var toastT;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('on'); }, 2800);
  }

  /* Periods ------------------------------------------------------------ */
  function taxYear(offset) {
    var m = Number(D.settings.yearEnd) || 2, now = new Date();
    var endY = (now.getMonth() + 1 <= m ? now.getFullYear() : now.getFullYear() + 1) + (offset || 0);
    var start = new Date(endY - 1, m, 1), end = new Date(endY, m, 0);
    return [dateStr(start), dateStr(end)];
  }
  function presets() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    var ty = taxYear(0), ly = taxYear(-1);
    return [
      ['p_this_month', dateStr(new Date(y, m, 1)), dateStr(new Date(y, m + 1, 0))],
      ['p_last_month', dateStr(new Date(y, m - 1, 1)), dateStr(new Date(y, m, 0))],
      ['p_this_tax', ty[0], ty[1]],
      ['p_last_tax', ly[0], ly[1]],
      ['p_last12', dateStr(new Date(y, m - 11, 1)), dateStr(new Date(y, m + 1, 0))],
      ['p_all', '', '']
    ];
  }
  function periodText(from, to) {
    if (!from && !to) return t('p_all');
    return (from ? shortDate(from) : '…') + ' – ' + (to ? shortDate(to) : '…');
  }

  /* Look-ups ------------------------------------------------------------ */
  function find(coll, id) { return id ? D[coll].filter(function (x) { return x.id === id; })[0] : null; }
  function hiveLabel(h) { return h ? t('hive_n', { n: h.no }) : ''; }
  function hiveName(id) { return hiveLabel(find('hives', id)); }
  function clientName(id) { var c = find('clients', id); return c ? c.name : ''; }
  function activeHives() { return D.hives.filter(function (h) { return h.status === 'active'; }); }
  function hiveSort(a, b) { return String(a.no).localeCompare(String(b.no), undefined, { numeric: true }); }
  function hiveOpts(none, keep) {
    var o = D.hives.filter(function (h) { return h.status === 'active' || h.id === keep; }).sort(hiveSort)
      .map(function (h) { return [h.id, hiveLabel(h) + (h.place ? ' · ' + h.place : '')]; });
    return none ? [['', none]].concat(o) : o;
  }
  // Supers on a hive now: starting count + supers put on - taken off - taken in harvests
  function superCount(hid, exceptHarvest, exceptSuper) {
    var h = find('hives', hid);
    if (!h) return 0;
    var n = Number(h.supers0) || 0;
    D.supers.forEach(function (x) { if (x.hive === hid && x.id !== exceptSuper) n += x.dir === 'off' ? -x.n : x.n; });
    D.harvests.forEach(function (x) { if (x.id !== exceptHarvest) x.takes.forEach(function (k) { if (k.hive === hid) n -= k.n; }); });
    return Math.max(0, n);
  }
  function supersOnHives() { return activeHives().reduce(function (s, h) { return s + superCount(h.id); }, 0); }
  // Places used so far (newest first), each with its last known GPS position
  function places() {
    var seen = {}, out = [];
    var all = D.moves.slice().sort(byDateDesc).map(function (m) { return { p: m.to, g: m.toGps }; })
      .concat(D.hives.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).map(function (h) { return { p: h.place, g: h.gps }; }));
    all.forEach(function (x) {
      var k = String(x.p || '').trim().toLowerCase();
      if (!k) return;
      if (!seen[k]) { seen[k] = { p: String(x.p).trim(), g: x.g || '' }; out.push(seen[k]); }
      else if (!seen[k].g && x.g) seen[k].g = x.g;
    });
    return out;
  }
  function gpsOf(s) {
    var m = /(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/.exec(String(s || ''));
    if (!m) return null;
    var la = +m[1].replace(',', '.'), lo = +m[2].replace(',', '.');
    return Math.abs(la) <= 90 && Math.abs(lo) <= 180 ? [la, lo] : null;
  }
  function distKm(a, b) {
    if (!a || !b) return null;
    var R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function fmtDist(km) { return km == null ? '' : km < 1 ? Math.round(km * 1000) + ' m' : fmtNum(km, km < 10 ? 1 : 0) + ' km'; }
  // Honey stock in litres: unprocessed (harvests - processing) and processed (processing - bottling)
  // Bulk honey can also be sold on invoices, by the litre: these two "products" stand for it
  var BULK = { __raw: 'bulk_raw', __done: 'bulk_done' };
  function prodLabel(id) { if (BULK[id]) return t(BULK[id]); var p = find('products', id); return p ? p.name : '?'; }
  function lineLitres(l) { if (l.prod === '__raw' || l.prod === '__done') return l.q; var p = find('products', l.prod); return p && p.size ? r2(l.q * p.size) : 0; }
  function honeyStock(exceptProcess, exceptBottle, exceptDoc, exceptBuy) {
    var raw = 0, done = 0;
    D.harvests.forEach(function (x) { raw += Number(x.litres) || 0; });
    D.buys.forEach(function (x) { if (x.id !== exceptBuy) raw += x.litres; });
    D.docs.forEach(function (d) { if (d.type === 'i' && !d.noStock && d.id !== exceptDoc) d.lines.forEach(function (l) { if (l.prod === '__raw') raw -= l.q; else if (l.prod === '__done') done -= l.q; }); });
    D.process.forEach(function (x) { if (x.id !== exceptProcess) { raw -= x.from; done += x.out; } });
    D.bottling.forEach(function (x) { if (x.id !== exceptBottle) done -= x.litres; });
    return { raw: r2(raw), done: r2(done) };
  }
  function productStock(pid, exceptDoc, exceptBottle) {
    var n = 0;
    D.bottling.forEach(function (x) { if (x.product === pid && x.id !== exceptBottle) n += x.n; });
    D.docs.forEach(function (d) { if (d.type === 'i' && !d.noStock && d.id !== exceptDoc) d.lines.forEach(function (l) { if (l.prod === pid) n -= l.q; }); });
    return n;
  }
  function bottlesInStock() { return D.products.reduce(function (s, p) { return s + Math.max(0, productStock(p.id)); }, 0); }
  function harvestSupers(x) { return x.takes.reduce(function (s, k) { return s + k.n; }, 0); }
  function noLitres() { return D.harvests.filter(function (x) { return x.litres == null || x.litres === ''; }).sort(byDateAsc); }
  function lastInsp(hid) { return D.insp.filter(function (x) { return x.hive === hid; }).sort(byDateDesc)[0]; }
  function hiveState(h) {
    var li = lastInsp(h.id), tdy = today();
    if (h.status !== 'active') return { cls: '', text: t('hs_' + h.status), li: li };
    if (!li) return { cls: 'wait', text: t('not_inspected'), li: li };
    var bad = (li.probs || []).filter(function (p) { return BAD_PROBS[p]; });
    if (bad.length) return { cls: 'bad', text: bad.map(function (p) { return t('pr_' + p); }).join(', '), li: li };
    if (li.stores === 'low') return { cls: 'bad', text: t('st_low'), li: li };
    var age = daysBetween(li.date, tdy);
    if ((li.next && li.next <= tdy) || age > 35) return { cls: 'wait', text: t('insp_days_ago', { n: age }), li: li };
    return { cls: 'ok', text: (li.probs || []).length ? li.probs.map(function (p) { return t('pr_' + p); }).join(', ') : t('insp_days_ago', { n: age }), li: li };
  }
  // Inspections / care with a "next" date that has not been followed up yet
  function dueList(days) {
    var lim = addDays(today(), days == null ? 7 : days), out = [];
    D.insp.forEach(function (x) {
      if (!x.next || x.next > lim) return;
      var h = find('hives', x.hive);
      if (!h || h.status !== 'active') return;
      if (D.insp.some(function (o) { return o !== x && o.hive === x.hive && o.date > x.date; })) return;
      out.push({ k: 'insp', x: x, date: x.next });
    });
    D.care.forEach(function (x) {
      if (!x.next || x.next > lim) return;
      var p = String(x.product || '').toLowerCase();
      if (D.care.some(function (o) { return o !== x && o.type === x.type && o.hive === x.hive && String(o.product || '').toLowerCase() === p && o.date > x.date; })) return;
      out.push({ k: 'care', x: x, date: x.next });
    });
    return out.sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function afbHives() {
    return activeHives().filter(function (h) { var li = lastInsp(h.id); return li && (li.probs || []).indexOf('afb') > -1; });
  }

  /* Quotes & invoices -------------------------------------------------- */
  function lineSum(lines) { return (lines || []).reduce(function (s, l) { return s + r2((Number(l.q) || 0) * (Number(l.p) || 0)); }, 0); }
  function docTotals(d) {
    var sub = r2(lineSum(d.lines) + (d.travel ? r2((Number(d.travel.km) || 0) * (Number(d.travel.rate) || 0)) : 0));
    var vat = d.vat ? r2(sub * (Number(d.vatRate) || 15) / 100) : 0, total = r2(sub + vat);
    var paid = r2((d.pays || []).reduce(function (s, p) { return s + p.amt; }, 0));
    return { sub: sub, vat: vat, total: total, paid: paid, bal: r2(total - paid) };
  }
  function docStatus(d) {
    if (d.type === 'q') return d.status || 'draft';
    var x = docTotals(d);
    if (x.total > 0 && x.bal <= 0.005) return 'paid';
    if (d.due && d.due < today()) return 'overdue';
    if (x.paid > 0) return 'part';
    return d.status === 'draft' ? 'draft' : 'unpaid';
  }
  var STATUS_CLS = { draft: '', sent: 'blue', accepted: 'ok', declined: 'bad', paid: 'ok', part: 'wait', unpaid: 'wait', overdue: 'bad' };
  function statusPill(d) { var s = docStatus(d); return '<span class="pill ' + (STATUS_CLS[s] || '') + '">' + esc(t('ds_' + s)) + '</span>'; }
  function docTitle(d) { return d.type === 'q' ? t('quote') : (d.vat ? t('tax_invoice') : t('invoice')); }
  function owing() { return D.docs.filter(function (d) { return d.type === 'i' && docTotals(d).bal > 0.005; }); }
  function openQuotes() { return D.docs.filter(function (d) { return d.type === 'q' && (d.status === 'sent' || d.status === 'draft' || !d.status); }); }
  // A number typed or imported (e.g. B75) moves the next number on (to B76) when it is higher
  function bumpNo(type, no) {
    var s = D.settings, pre = type === 'q' ? s.qPrefix : s.iPrefix, m = /^(.*?)(\d+)$/.exec(String(no || '').trim());
    if (!m || m[1].toLowerCase() !== String(pre || '').toLowerCase()) return;
    var n = +m[2] + 1;
    if (type === 'q') { if (n > s.nextQ) s.nextQ = n; } else if (n > s.nextI) s.nextI = n;
  }
  function nextNo(type) {
    var s = D.settings, n = type === 'q' ? s.nextQ : s.nextI, pre = type === 'q' ? s.qPrefix : s.iPrefix, no;
    var used = {}; D.docs.forEach(function (d) { used[d.no] = 1; });
    do { no = pre + n; n++; } while (used[no]);
    if (type === 'q') s.nextQ = n; else s.nextI = n;
    return no;
  }

  /* Totals for a period ------------------------------------------------ */
  function summary(from, to) {
    var s = { inT: 0, outT: 0, fuelT: 0, vatOut: 0, vatIn: 0, cin: {}, cout: {}, dL: 0, dAmt: 0, pL: 0, pAmt: 0,
              money: [], fuel: [], diary: [], insp: [], harvests: [], care: [], docs: [], pays: [], moves: [], supers: [], process: [], bottling: [],
              supersTaken: 0, rawL: 0, procIn: 0, procOut: 0, bottledL: 0, bottles: {}, invoiced: 0, quoted: 0, received: 0 };
    D.money.forEach(function (m) {
      if (!inRange(m.date, from, to)) return;
      s.money.push(m);
      if (m.dir === 'in') { s.inT += m.amt; s.cin[m.cat] = (s.cin[m.cat] || 0) + m.amt; s.vatOut += m.vat || 0; }
      else { s.outT += m.amt; s.cout[m.cat] = (s.cout[m.cat] || 0) + m.amt; s.vatIn += m.vat || 0; }
    });
    D.fuel.forEach(function (f) {
      if (!inRange(f.date, from, to)) return;
      s.fuel.push(f);
      s.fuelT += f.amt; s.vatIn += f.vat || 0;
      if (f.kind === 'petrol') { s.pL += f.l; s.pAmt += f.amt; } else { s.dL += f.l; s.dAmt += f.amt; }
    });
    D.diary.forEach(function (d) { if (inRange(d.date, from, to)) s.diary.push(d); });
    D.insp.forEach(function (x) { if (inRange(x.date, from, to)) s.insp.push(x); });
    D.care.forEach(function (x) { if (inRange(x.date, from, to)) s.care.push(x); });
    D.harvests.forEach(function (x) {
      if (!inRange(x.date, from, to)) return;
      s.harvests.push(x); s.supersTaken += harvestSupers(x); s.rawL += Number(x.litres) || 0;
    });
    D.moves.forEach(function (x) { if (inRange(x.date, from, to)) s.moves.push(x); });
    D.supers.forEach(function (x) { if (inRange(x.date, from, to)) s.supers.push(x); });
    s.buys = []; s.boughtL = 0; s.boughtR = 0;
    D.buys.forEach(function (x) { if (inRange(x.date, from, to)) { s.buys.push(x); s.boughtL += x.litres; s.boughtR += x.amt || 0; } });
    D.process.forEach(function (x) { if (inRange(x.date, from, to)) { s.process.push(x); s.procIn += x.from; s.procOut += x.out; } });
    D.bottling.forEach(function (x) { if (inRange(x.date, from, to)) { s.bottling.push(x); s.bottledL += x.litres; s.bottles[x.product] = (s.bottles[x.product] || 0) + x.n; } });
    D.docs.forEach(function (d) {
      if (inRange(d.date, from, to)) {
        s.docs.push(d);
        if (d.type === 'i') s.invoiced += docTotals(d).total;
        if (d.type === 'q') s.quoted += docTotals(d).total;
      }
      (d.pays || []).forEach(function (p) { if (inRange(p.date, from, to)) { s.pays.push({ d: d, p: p }); s.received += p.amt; } });
    });
    ['money', 'fuel', 'diary', 'insp', 'care', 'harvests', 'docs', 'moves', 'supers', 'process', 'bottling', 'buys'].forEach(function (k) { s[k].sort(byDateAsc); });
    s.pays.sort(function (a, b) { return a.p.date.localeCompare(b.p.date); });
    s.outAll = s.outT + s.fuelT;
    s.net = s.inT - s.outAll;
    return s;
  }
  function wroteDiaryToday() { var d = today(); return D.diary.some(function (x) { return x.date === d; }); }
  function totalEntries() { return LISTS.reduce(function (s, k) { return s + D[k].length; }, 0); }
  function needPhoto() { return D.money.concat(D.fuel).filter(function (x) { return x.photoLater && !x.photo; }); }

  /* ================================================================ */
  /* Icons                                                             */
  /* ================================================================ */
  function ico(p, s) {
    return '<svg width="' + (s || 22) + '" height="' + (s || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  var IC = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    hives: '<path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z"/><path d="M8 9.5h8M7.5 13h9"/>',
    work: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    diary: '<path d="M5 4a2 2 0 0 1 2-2h12v17H7a2 2 0 0 0-2 2z"/><path d="M5 21V4"/><path d="M9 7h6M9 11h6"/>',
    fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M7 8h5"/><path d="M15 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    reports: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
    down: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>',
    honey: '<path d="M8 3h8v3H8z"/><path d="M7 6h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M5 12h14"/>',
    move: '<path d="M5 12h14"/><path d="M15 6l6 6-6 6"/><circle cx="5" cy="12" r="2"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    bottle: '<path d="M10 2h4v4l2 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3z"/><path d="M8 13h8"/>',
    car: '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><path d="M5 12h14"/><circle cx="8" cy="17" r="1.8"/><circle cx="16" cy="17" r="1.8"/>',
    buy: '<path d="M3 4h2l2.5 11h11L21 7H6.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    jar: '<path d="M8 3h8v3H8z"/><path d="M7 6h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M5 12h14"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    quote: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h3"/>',
    invoice: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    clip: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    med: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M12 10v7M8.5 13.5h7"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21 19"/>',
    repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    badge: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h4M14 14h4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'
  };

  /* ================================================================ */
  /* Small HTML builders                                               */
  /* ================================================================ */
  function fld(label, inner, hint) {
    return '<div class="fw"><label class="f">' + esc(label) + '</label>' + inner + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  }
  function inp(k, o) {
    o = o || {};
    var v = F[k] == null ? '' : F[k];
    return '<input class="in' + (o.cls ? ' ' + o.cls : '') + '" data-k="' + k + '" type="' + (o.type || 'text') + '"' +
      (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (o.list ? ' list="' + o.list + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.focus ? ' data-focus="1"' : '') +
      (o.id ? ' id="' + o.id + '"' : '') + ' autocomplete="off" value="' + esc(v) + '">';
  }
  function area(k, ph, rows, focus) {
    return '<textarea class="in" data-k="' + k + '" rows="' + (rows || 5) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (focus ? ' data-focus="1"' : '') + '>' + esc(F[k] || '') + '</textarea>';
  }
  function sel(k, opts, rr) {
    return '<select class="in" data-k="' + k + '"' + (rr ? ' data-rr="1"' : '') + '>' + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(F[k] == null ? '' : F[k]) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function seg(k, opts, cls) {
    return '<div class="seg' + (cls ? ' ' + cls : '') + '">' + opts.map(function (o) {
      return '<button type="button" class="' + (String(F[k]) === String(o[0]) ? 'on' : '') + '" data-chip="' + k + '" data-v="' + esc(o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function chips(k, list, labelFn) {   // single value suggestions that fill a text field
    if (!list || !list.length) return '';
    return '<div class="chips">' + list.map(function (v) {
      var lab = labelFn ? labelFn(v) : v;
      var on = F[k] != null && String(F[k]).toLowerCase() === String(lab).toLowerCase();
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-chip="' + k + '" data-v="' + esc(lab) + '">' + esc(lab) + '</button>';
    }).join('') + '</div>';
  }
  function pick(k, list, labelFn) {   // single choice from fixed keys, shown as chips
    return '<div class="chips">' + list.map(function (v) {
      return '<button type="button" class="chip' + (String(F[k]) === String(v) ? ' on' : '') + '" data-chip="' + k + '" data-v="' + esc(v) + '">' + esc(labelFn(v)) + '</button>';
    }).join('') + '</div>';
  }
  function multi(k, list, labelFn) {
    var cur = F[k] || [];
    return '<div class="chips">' + list.map(function (v) {
      return '<button type="button" class="chip' + (cur.indexOf(v) > -1 ? ' on' : '') + '" data-multi="' + k + '" data-v="' + esc(v) + '">' + esc(labelFn(v)) + '</button>';
    }).join('') + '</div>';
  }
  function check(k, label) {
    return '<label class="chk"><input type="checkbox" data-k="' + k + '" data-rr="1"' + (F[k] ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }
  function msg(kind, text) { return text ? '<div class="msg ' + kind + '">' + text + '</div>' : ''; }
  function stat(label, value, cls) { return '<div class="stat"><span>' + esc(label) + '</span><b class="' + (cls || '') + '">' + value + '</b></div>'; }
  function empty(text) { return '<p class="muted" style="margin:10px 0 0">' + esc(text) + '</p>'; }
  function cardHead(title, btn) { return '<div class="row"><strong>' + esc(title) + '</strong>' + (btn || '') + '</div>'; }
  function addBtn(act, attrs, label) {
    return '<button class="secondary small" data-act="' + act + '" ' + (attrs || '') + '>' + ico(IC.plus, 18) + esc(label || t('add')) + '</button>';
  }
  function monthNav(view, ym) {
    return '<div class="mnav"><button class="icon" data-act="mprev" data-view="' + view + '" aria-label="' + esc(t('prev')) + '">' + ico(IC.back) + '</button>' +
      '<strong>' + esc(ymLabel(ym)) + '</strong>' +
      '<button class="icon" data-act="mnext" data-view="' + view + '" aria-label="' + esc(t('next')) + '"' + (ym >= today().slice(0, 7) ? ' disabled' : '') + '>' + ico(IC.next) + '</button></div>';
  }
  function confirmBtn(key, act, label, again) {
    return '<button class="text danger" data-act="' + act + '">' + esc(confirmKey === key ? again : label) + '</button>';
  }
  function moreBtn(view, total, shown) {
    return total > shown ? '<button class="text" data-act="more" data-view="' + view + '">' + esc(t('show_more')) + '</button>' : '';
  }

  /* ================================================================ */
  /* Navigation                                                        */
  /* ================================================================ */
  var TABS = ['home', 'hives', 'honey', 'work', 'money', 'diary'];
  var DETAIL = ['hive', 'client', 'doc', 'fuelv', 'pending', 'import', 'odo', 'tripend', 'tripx'];
  function isTab(v) { return TABS.indexOf(v) > -1; }
  function showTab(tab) {
    TAB = tab || TAB; V = TAB; F = null; confirmKey = '';
    render(); window.scrollTo(0, 0);
  }
  function openSub(view, state) {
    state = state || {};
    if ((view === 'form' || DETAIL.indexOf(view) > -1) && DETAIL.indexOf(V) > -1) state.back = { v: V, f: F };
    V = view; F = state; confirmKey = '';
    if (!(history.state && history.state.sub)) history.pushState({ sub: 1 }, '');
    render(); window.scrollTo(0, 0);
  }
  function closeSub() {
    if (F && F.back) { var b = F.back; V = b.v; F = b.f; confirmKey = ''; render(); window.scrollTo(0, 0); return; }
    if (history.state && history.state.sub) history.back();   // popstate -> showTab()
    else showTab();
  }
  function goView(view, state) {   // replace the current sub view (e.g. form -> document) without a new history step
    state = state || {};
    if (F && F.back) state.back = F.back;
    V = view; F = state; confirmKey = '';
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('popstate', function () {
    if (!D || isTab(V)) return;
    if (F && F.back) { history.pushState({ sub: 1 }, ''); closeSub(); }   // phone back button: one step back
    else showTab();
  });

  /* ================================================================ */
  /* Render                                                            */
  /* ================================================================ */
  function render() {
    document.documentElement.lang = L();
    var setup = !D.settings.setup;
    document.body.classList.toggle('nonav', setup);
    renderHeader(setup);
    renderNav(setup);
    if (setup) return setupScreen();
    switch (V) {
      case 'home': return home();
      case 'hives': return hivesScreen();
      case 'work': return workScreen();
      case 'money': return moneyList();
      case 'diary': return diaryList();
      case 'form': return formScreen();
      case 'hive': return hiveScreen();
      case 'honey': return honeyScreen();
      case 'import': return importScreen();
      case 'odo': return odoScreen();
      case 'tripend': return tripEndScreen();
      case 'tripx': return tripExportScreen();
      case 'client': return clientScreen();
      case 'doc': return docScreen();
      case 'fuelv': return fuelList();
      case 'pending': return pendingScreen();
      case 'reports': return reportsScreen();
      case 'settings': return settingsScreen();
    }
  }
  function renderHeader(setup) {
    var title = setup ? 'ByeBoer' : (isTab(V) ? (V === 'home' ? (D.settings.biz || 'ByeBoer') : t('tab_' + V)) : subTitle());
    var h = '';
    if (!isTab(V) && !setup) h += '<button class="icon" data-act="close" aria-label="' + esc(t('back')) + '">' + ico(IC.back) + '</button>';
    h += '<h1>' + esc(title) + '</h1><div class="hbtns">';
    h += '<button id="installBtn" class="secondary small' + (installEvt ? '' : ' hidden') + '" type="button" data-act="install">' + esc(t('install')) + '</button>';
    if (!setup && isTab(V)) {
      h += '<button class="secondary small" data-act="reports">' + ico(IC.reports, 18) + '<span class="hide-xs">' + esc(t('reports')) + '</span></button>';
      h += '<button class="icon" data-act="settings" aria-label="' + esc(t('settings')) + '">' + ico(IC.settings) + '</button>';
    }
    document.getElementById('hdr').innerHTML = h + '</div>';
  }
  function subTitle() {
    if (V === 'reports') return t('reports');
    if (V === 'settings') return t('settings');
    if (V === 'form') {
      var k = F.kind, suf = (k === 'money' || k === 'recur') ? '_' + F.dir : k === 'doc' ? '_' + F.dtype : '';
      if (k === 'doc' && F.id) { var dd = find('docs', F.id); return dd ? dd.no : t('edit_doc' + suf); }
      return t((F.id || F.pid ? 'edit_' : 'new_') + k + suf);
    }
    if (V === 'hive') return hiveName(F.id) || t('hives');
    if (V === 'client') return clientName(F.id) || t('clients');
    if (V === 'doc') { var d = find('docs', F.id); return d ? d.no : t('tab_work'); }
    if (V === 'fuelv') return t('fuel');
    if (V === 'pending') return t('slips_needed');
    if (V === 'import') return t('imp_title');
    if (V === 'odo' || V === 'tripend') return t(F && F.mode === 'end' ? 'lb_end' : 'lb_start');
    if (V === 'tripx') return t('lb_export_title');
    return 'ByeBoer';
  }
  function renderNav(setup) {
    var nav = document.getElementById('nav');
    if (setup) { nav.innerHTML = ''; return; }
    nav.innerHTML = '<div class="brand">ByeBoer</div>' + TABS.map(function (k) {
      return '<button data-act="tab" data-tab="' + k + '" class="' + (TAB === k ? 'on' : '') + '"' + (TAB === k ? ' aria-current="page"' : '') + '>' + ico(IC[k]) + '<span>' + esc(t('tab_' + k)) + '</span></button>';
    }).join('') + '<div class="side-extra"><button data-act="reports" class="' + (V === 'reports' ? 'on' : '') + '">' + ico(IC.reports) + '<span>' + esc(t('reports')) + '</span></button>' +
      '<button data-act="settings" class="' + (V === 'settings' ? 'on' : '') + '">' + ico(IC.settings) + '<span>' + esc(t('settings')) + '</span></button></div>';
  }

  /* ---------------- Setup (first run) ---------------- */
  function setupScreen() {
    if (!F || !F.setup) F = { setup: 1, lang: D.settings.lang, biz: D.settings.biz, owner: D.settings.owner, phone: D.settings.phone, vat: D.settings.vat ? '1' : '0', fuelOn: D.settings.fuelOn ? '1' : '0' };
    var h = '<div class="card hero"><div class="logo">' + ico(IC.hives, 34) + '</div>' +
      '<h2>' + esc(t('welcome')) + '</h2><p class="muted">' + esc(t('welcome_sub')) + '</p>' +
      fld(t('language'), seg('lang', [['en', 'English'], ['af', 'Afrikaans']])) +
      fld(t('biz_name'), inp('biz', { ph: t('biz_name_ph'), max: 60 }), esc(t('biz_name_hint'))) +
      fld(t('your_name'), inp('owner', { max: 60 })) +
      fld(t('phone'), inp('phone', { max: 20, mode: 'tel' })) +
      fld(t('vat_registered'), seg('vat', [['0', t('no')], ['1', t('yes')]]), esc(t('vat_hint'))) +
      fld(t('fuel_track_q'), seg('fuelOn', [['0', t('no')], ['1', t('yes')]]), esc(t('fuel_track_hint'))) +
      msg('err', F.err) +
      '<div style="margin-top:22px"><button class="primary" data-act="finishSetup">' + esc(t('start_using')) + '</button></div>' +
      '<p class="muted center" style="margin-top:16px">' + esc(t('stored_here')) + '</p>' +
      '<button class="text" data-act="restorePick">' + esc(t('restore_backup')) + '</button>' +
      '</div>';
    app.innerHTML = h;
  }
  function finishSetup() {
    if (!clean(F.biz) && !clean(F.owner)) { F.err = esc(t('err_biz')); return render(); }
    var s = D.settings;
    s.lang = F.lang; s.biz = clean(F.biz, 60); s.owner = clean(F.owner, 60); s.phone = clean(F.phone, 20);
    s.vat = F.vat === '1'; s.fuelOn = F.fuelOn === '1'; s.setup = true;
    if (!s.svcs.length) s.svcs = ['svc_d1', 'svc_d2', 'svc_d3', 'svc_d4', 'svc_d5', 'svc_d6'].map(function (k) { return { id: uid() + k.slice(-1), name: t(k), price: 0 }; });
    save(); F = null; TAB = 'home'; showTab('home');
    toast(t('ready'));
  }

  /* ---------------- Home ---------------- */
  function home() {
    var now = new Date(), ym = today().slice(0, 7);
    var m = summary(ym + '-01', dateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    var h = '';
    if (D.settings.remind && !wroteDiaryToday()) {
      h += '<div class="card nudge">' + ico(IC.diary, 26) + '<div class="grow"><strong>' + esc(t('diary_nudge')) + '</strong>' +
        '<div class="muted">' + esc(t('diary_nudge_sub')) + '</div></div>' +
        '<button class="primary small" data-act="new" data-kind="diary">' + esc(t('write')) + '</button></div>';
    }
    var last = D.settings.lastBackup, days = last ? Math.floor((Date.now() - parseD(last).getTime()) / 864e5) : 999;
    if (totalEntries() >= 10 && days > 30) {
      h += '<div class="card warnc"><div class="grow"><strong>' + esc(t('backup_nudge')) + '</strong><div class="muted">' +
        esc(last ? t('backup_last', { d: shortDate(last) }) : t('backup_never')) + '</div></div>' +
        '<button class="secondary small" data-act="backup">' + esc(t('backup_now')) + '</button></div>';
    }
    h += alertsHtml();
    h += '<div class="quick home">' +
      qa('insp', '', IC.search, t('q_insp')) + qa('harvest', '', IC.honey, t('q_harvest'), 'g') + qa('super', '', IC.layers, t('q_super')) + qa('move', '', IC.move, t('q_move')) +
      qa('doc', 'q', IC.quote, t('q_quote'), 'b') + qa('doc', 'i', IC.invoice, t('q_invoice'), 'b') +
      qa('money', 'in', IC.plus, t('q_income'), 'g') + qa('money', 'out', IC.minus, t('q_expense'), 'r') +
      '</div>';

    h += '<div class="grid">';
    var act = activeHives();
    var inspected = act.filter(function (hv) { var li = lastInsp(hv.id); return li && daysBetween(li.date, today()) <= 30; }).length;
    h += '<div class="card tap" data-act="tab" data-tab="hives"><div class="row"><span class="step">' + esc(t('hives')) + '</span><span class="pill">' + esc(t('tab_hives')) + '</span></div>' +
      (D.hives.length ? '<div class="stats">' + stat(t('active_hives'), String(act.length)) + stat(t('supers_on_hives'), String(supersOnHives())) + stat(t('inspected_30'), inspected + ' / ' + act.length) + '</div>'
        : '<p class="muted" style="margin:10px 0 0">' + esc(t('no_hives_short')) + '</p>') + '</div>';
    var st = honeyStock();
    h += '<div class="card tap" data-act="tab" data-tab="honey"><div class="row"><span class="step">' + esc(t('honey_stock')) + '</span><span class="pill">' + esc(t('tab_honey')) + '</span></div>' +
      '<div class="stats">' + stat(t('raw_honey'), fmtL(st.raw)) + stat(t('processed_honey'), fmtL(st.done)) + stat(t('bottles_stock'), String(bottlesInStock())) + '</div></div>';
    h += '<div class="card tap" data-act="tab" data-tab="money"><div class="row"><span class="step">' + esc(ymLabel(ym)) + '</span><span class="pill">' + esc(t('tab_money')) + '</span></div>' +
      '<div class="stats">' + stat(t('income'), fmtR(m.inT), 'pos') + stat(D.settings.fuelOn ? t('expenses_incl_fuel') : t('expenses'), fmtR(m.outAll), 'neg') +
      stat(t('net'), fmtR(m.net), m.net >= 0 ? 'pos' : 'neg') + '</div></div>';
    var ow = owing(), owR = ow.reduce(function (s, d) { return s + docTotals(d).bal; }, 0), oq = openQuotes();
    h += '<div class="card tap" data-act="tab" data-tab="work"><div class="row"><span class="step">' + esc(t('quotes_invoices')) + '</span><span class="pill">' + esc(t('tab_work')) + '</span></div>' +
      '<div class="stats">' + stat(t('owed_to_you'), fmtR(owR), owR ? 'neg' : '') + stat(t('unpaid_invoices'), String(ow.length)) + stat(t('open_quotes'), String(oq.length)) + '</div></div>';
    h += '</div>';

    var recent = [].concat(
      D.money.map(function (x) { return { k: 'money', x: x }; }), D.insp.map(function (x) { return { k: 'insp', x: x }; }),
      D.harvests.map(function (x) { return { k: 'harvest', x: x }; }), D.care.map(function (x) { return { k: 'care', x: x }; }),
      D.moves.map(function (x) { return { k: 'move', x: x }; }), D.supers.map(function (x) { return { k: 'super', x: x }; }),
      D.process.map(function (x) { return { k: 'process', x: x }; }), D.bottling.map(function (x) { return { k: 'bottle', x: x }; }),
      D.buys.map(function (x) { return { k: 'buy', x: x }; }), D.docs.map(function (x) { return { k: 'doc', x: x }; }), D.diary.map(function (x) { return { k: 'diary', x: x }; }),
      D.fuel.map(function (x) { return { k: 'fuel', x: x }; })
    ).sort(function (a, b) { return (b.x.ts || 0) - (a.x.ts || 0); }).slice(0, 6);
    h += '<div class="card"><strong>' + esc(t('recent')) + '</strong>';
    if (!recent.length) h += empty(t('recent_empty'));
    else h += '<div class="list">' + recent.map(function (r) { return itemHtml(r.k, r.x, true); }).join('') + '</div>';
    h += '</div>';
    h += '<p class="muted center foot">' + esc(t('stored_here')) + '</p>';
    app.innerHTML = h;
  }
  function qa(kind, dir, icon, label, color) {
    return '<button class="qa' + (color ? ' ' + color : '') + '" data-act="new" data-kind="' + kind + '"' + (dir ? ' data-dir="' + dir + '"' : '') + '>' +
      ico(icon, 24) + '<span>' + esc(label) + '</span></button>';
  }
  function careWhere(x) { return x.hive ? hiveName(x.hive) : t('all_hives_short'); }
  function alertsHtml() {
    var rows = [], tdy = today(), due = dueList(7), afb = afbHives(), ow = owing(), np = needPhoto(), nl = noLitres();
    if (D.activeTrip) rows.push(['tripEnd', '', IC.car, t('lb_alert', { f: D.activeTrip.from }), t('lb_alert_sub', { n: fmtKm(D.activeTrip.startOdo), tm: D.activeTrip.startTime }), '']);
    if (afb.length) rows.push(['hive', afb[0].id, IC.alert, t('alert_afb', { n: afb.length }), afb.slice(0, 3).map(function (x) { return hiveLabel(x) + (x.place ? ' · ' + x.place : ''); }).join(', '), 'r']);
    nl.slice(0, 3).forEach(function (x) {
      rows.push(['edit', 'harvest', IC.honey, t('alert_litres', { d: shortDate(x.date) }), t('alert_litres_sub', { n: harvestSupers(x), h: x.takes.length }), '', x.id]);
    });
    due.slice(0, 5).forEach(function (d) {
      var x = d.x, late = d.date < tdy;
      if (d.k === 'insp') rows.push(['hive', x.hive, IC.search, t(late ? 'alert_insp_late' : 'alert_insp', { h: hiveName(x.hive) }), ((find('hives', x.hive) || {}).place || '') + ' · ' + shortDate(d.date), late ? 'r' : '']);
      else rows.push(['careDone', x.id, IC.med, t(late ? 'alert_care_late' : 'alert_care', { what: t('ct_' + x.type).toLowerCase(), where: careWhere(x) }),
        (x.product ? x.product + ' · ' : '') + shortDate(d.date), late ? 'r' : '']);
    });
    if (due.length > 5) rows.push(['tab', 'hives', IC.hives, t('alert_more_due', { n: due.length - 5 }), '', '']);
    var late = ow.filter(function (d) { return docStatus(d) === 'overdue'; });
    if (late.length) rows.push(['tab', 'work', IC.invoice, t('alert_overdue', { n: late.length, r: fmtR(late.reduce(function (s, d) { return s + docTotals(d).bal; }, 0)) }),
      late.slice(0, 3).map(function (d) { return d.no + ' ' + clientName(d.client); }).join(', '), 'r']);
    var waitQ = openQuotes().filter(function (d) { return d.status === 'sent' && daysBetween(d.sent || d.date, tdy) >= 7; });
    if (waitQ.length) rows.push(['tab', 'work', IC.quote, t('alert_quotes', { n: waitQ.length }), waitQ.slice(0, 3).map(function (d) { return d.no + ' ' + clientName(d.client); }).join(', '), '']);
    var reg = D.settings.regDue;
    if (reg && reg <= addDays(tdy, 30)) rows.push(['settings', '', IC.badge, t(reg < tdy ? 'alert_reg_late' : 'alert_reg', { d: shortDate(reg) }), t('alert_reg_sub'), reg < tdy ? 'r' : '']);
    if (np.length) rows.push(['pending', '', IC.cam, t('alert_photos', { n: np.length }), t('alert_photos_sub'), '']);
    if (!rows.length) return '';
    return '<div class="card alerts">' + rows.map(function (r) {
      var attrs = r[0] === 'tab' ? 'data-act="tab" data-tab="' + r[1] + '"' : r[0] === 'hive' ? 'data-act="hive" data-id="' + esc(r[1]) + '"' :
        r[0] === 'careDone' ? 'data-act="careDone" data-id="' + esc(r[1]) + '"' : r[0] === 'edit' ? 'data-act="edit" data-kind="' + r[1] + '" data-id="' + esc(r[6]) + '"' : 'data-act="' + r[0] + '"';
      return '<button class="arow ' + r[5] + '" ' + attrs + '>' + ico(r[2], 22) + '<span class="grow"><b>' + esc(r[3]) + '</b><span class="muted">' + esc(r[4]) + '</span></span>' + ico(IC.next, 18) + '</button>';
    }).join('') + '</div>';
  }

  /* List items (shared) ------------------------------------------------ */
  function itemHtml(kind, x, withKind, ctxHive) {
    var title = '', sub = [], right = '', cls = '', act = 'edit', extra = '';
    if (kind === 'money') {
      title = x.desc || catLabel(x.cat);
      sub = [niceDate(x.date), x.desc ? catLabel(x.cat) : '', x.party];
      right = (x.dir === 'in' ? '+' : '−') + fmtR(x.amt); cls = x.dir === 'in' ? 'pos' : 'neg';
    } else if (kind === 'fuel') {
      title = fmtL(x.l) + ' ' + t(x.kind).toLowerCase();
      sub = [niceDate(x.date), x.mach, t('use_' + x.use)];
      right = fmtR(x.amt);
    } else if (kind === 'diary') {
      title = x.text.length > 70 ? x.text.slice(0, 70) + '…' : x.text; sub = [niceDate(x.date)];
    } else if (kind === 'insp') {
      var hv = find('hives', x.hive);
      title = (ctxHive ? '' : hiveLabel(hv) + ': ') + inspSummary(x);
      sub = [niceDate(x.date), !ctxHive && hv ? hv.place : '', x.next ? t('next_on', { d: shortDate(x.next) }) : ''];
      if ((x.probs || []).some(function (p) { return BAD_PROBS[p]; })) cls = 'neg';
    } else if (kind === 'harvest') {
      var mine = ctxHive ? x.takes.filter(function (k) { return k.hive === ctxHive; })[0] : null;
      title = mine ? t('supers_taken_n', { n: mine.n }) : t('harvest_line', { n: harvestSupers(x), h: x.takes.length });
      sub = [niceDate(x.date), mine ? '' : x.takes.map(function (k) { var hh = find('hives', k.hive); return t('hive_n', { n: hh ? hh.no : '?' }) + ' (' + k.n + ')'; }).join(', ')];
      right = x.litres == null || x.litres === '' ? t('litres_q') : fmtL(x.litres);
      cls = x.litres == null || x.litres === '' ? 'neg' : '';
    } else if (kind === 'care') {
      title = t('ct_' + x.type) + (x.product ? ': ' + x.product : '') + (x.qty ? ' (' + x.qty + ')' : '');
      sub = [niceDate(x.date), ctxHive ? '' : careWhere(x), x.next ? t('next_on', { d: shortDate(x.next) }) : ''];
    } else if (kind === 'move') {
      title = (ctxHive ? '' : hiveName(x.hive) + ': ') + (x.from || '?') + ' → ' + x.to;
      sub = [niceDate(x.date), x.notes];
    } else if (kind === 'super') {
      title = (ctxHive ? '' : hiveName(x.hive) + ': ') + t(x.dir === 'off' ? 'supers_off_n' : 'supers_on_n', { n: x.n });
      sub = [niceDate(x.date), x.notes];
    } else if (kind === 'buy') {
      title = t('buy_line', { l: fmtL(x.litres) });
      sub = [niceDate(x.date), x.supplier, x.notes];
      right = x.amt ? fmtR(x.amt) : '';
    } else if (kind === 'process') {
      title = t('process_line', { a: fmtL(x.from), b: fmtL(x.out) });
      sub = [niceDate(x.date), x.notes];
    } else if (kind === 'bottle') {
      var pr = find('products', x.product);
      title = t('bottle_line', { n: x.n, p: pr ? pr.name : '?' });
      sub = [niceDate(x.date), fmtL(x.litres), x.notes];
    } else if (kind === 'doc') {
      var tt = docTotals(x);
      title = x.no + ' · ' + (clientName(x.client) || '?');
      sub = [niceDate(x.date), x.job, x.type === 'i' && tt.paid && tt.bal > 0.005 ? t('bal_due', { r: fmtR(tt.bal) }) : ''];
      right = fmtR(tt.total); act = 'doc';
      extra = statusPill(x);
    }
    var label = withKind ? '<span class="kind">' + esc(t('kind_' + (kind === 'doc' ? (x.type === 'q' ? 'quote' : 'invoice') : kind))) + '</span>' : '';
    var mark = (kind === 'money' || kind === 'fuel') ? (x.photo ? '<span class="pmark" title="' + esc(t('has_photo')) + '">' + ico(IC.clip, 15) + '</span>'
      : x.photoLater ? '<span class="pmark need" title="' + esc(t('photo_needed')) + '">' + ico(IC.cam, 15) + '</span>' : '') : '';
    return '<button class="item" data-act="' + act + '" data-kind="' + kind + '" data-id="' + esc(x.id) + '"><div class="row"><span class="ttl">' + label + esc(title) + mark + '</span>' +
      (right ? '<span class="amt ' + cls + '">' + esc(right) + '</span>' : '') + '</div>' +
      '<div class="row"><span class="muted grow">' + esc(sub.filter(Boolean).join(' · ')) + '</span>' + extra + '</div></button>';
  }
  function inspSummary(x) {
    var bits = [];
    if (x.queen) bits.push(t('qs_' + x.queen));
    if (x.brood) bits.push(t('br_' + x.brood));
    if (x.stores) bits.push(t('st_' + x.stores));
    if (x.temper && x.temper !== 'calm') bits.push(t('tm_' + x.temper));
    (x.probs || []).forEach(function (p) { bits.push(t('pr_' + p)); });
    return bits.join(', ') || t('inspected');
  }

  /* ---------------- Hives ---------------- */
  function hivesScreen() {
    var any = activeHives().length;
    var h = '<div class="two-btn"><button class="primary" data-act="new" data-kind="insp"' + (any ? '' : ' disabled') + '>' + ico(IC.search) + esc(t('q_insp')) + '</button>' +
      '<button class="primary g" data-act="new" data-kind="harvest"' + (any ? '' : ' disabled') + '>' + ico(IC.honey) + esc(t('q_harvest')) + '</button></div>' +
      '<div class="two-btn"><button class="secondary" data-act="new" data-kind="super"' + (any ? '' : ' disabled') + '>' + ico(IC.layers, 20) + esc(t('q_super')) + '</button>' +
      '<button class="secondary" data-act="new" data-kind="move"' + (any ? '' : ' disabled') + '>' + ico(IC.move, 20) + esc(t('q_move')) + '</button></div>' +
      '<div class="two-btn"><button class="secondary" data-act="new" data-kind="care"' + (any ? '' : ' disabled') + '>' + ico(IC.med, 20) + esc(t('q_care')) + '</button>' +
      '<button class="secondary" data-act="new" data-kind="hive">' + ico(IC.plus, 20) + esc(t('add_hive')) + '</button></div>';
    if (!D.hives.length) {
      h += '<div class="card"><strong>' + esc(t('start_hives')) + '</strong><p class="muted">' + esc(t('start_hives_sub')) + '</p>' +
        '<button class="primary" data-act="new" data-kind="hive">' + ico(IC.plus) + esc(t('add_hive')) + '</button></div>';
      app.innerHTML = h; return;
    }
    var due = dueList(14), tdy = today();
    if (due.length) {
      h += '<div class="card"><strong>' + esc(t('coming_up')) + '</strong><div class="list">' + due.map(function (d) {
        var x = d.x, late = d.date < tdy;
        var ttl = d.k === 'insp' ? t('insp_of', { h: hiveName(x.hive) }) : t('ct_' + x.type) + ': ' + careWhere(x);
        return '<button class="item" data-act="' + (d.k === 'insp' ? 'inspAgain' : 'careDone') + '" data-id="' + esc(d.k === 'insp' ? x.hive : x.id) + '"><div class="row"><span class="ttl">' + esc(ttl) + '</span>' +
          '<span class="amt ' + (late ? 'neg' : '') + '">' + esc(shortDate(d.date)) + '</span></div><div class="muted">' +
          esc([d.k === 'care' ? x.product : (find('hives', x.hive) || {}).place, late ? t('overdue') : t('tap_when_done')].filter(Boolean).join(' · ')) + '</div></button>';
      }).join('') + '</div></div>';
    }
    // active hives, grouped by where they stand
    var groups = {}, order = [];
    activeHives().sort(hiveSort).forEach(function (x) {
      var k = x.place || t('no_place');
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(x);
    });
    order.sort(function (a, b) { return a.localeCompare(b); });
    h += '<div class="card">' + cardHead(t('hives_n', { n: activeHives().length }) + ' · ' + t('supers_n', { n: supersOnHives() })) +
      order.map(function (k) {
        return '<div class="dhead">' + esc(k) + ' · ' + esc(t('n_hives', { n: groups[k].length })) + '</div><div class="hivegrid">' + groups[k].map(hiveTile).join('') + '</div>';
      }).join('') + '</div>';
    var gone = D.hives.filter(function (x) { return x.status !== 'active'; }).sort(hiveSort);
    if (gone.length) h += '<div class="card"><strong>' + esc(t('hives_gone')) + '</strong><div class="list">' + gone.map(function (x) {
      return '<button class="item" data-act="hive" data-id="' + esc(x.id) + '"><div class="row"><span class="ttl">' + esc(hiveLabel(x)) + '</span><span class="pill">' + esc(t('hs_' + x.status)) + '</span></div>' +
        '<div class="muted">' + esc([x.place, x.ended ? shortDate(x.ended) : ''].filter(Boolean).join(' · ')) + '</div></button>';
    }).join('') + '</div></div>';
    app.innerHTML = h;
  }
  function hiveTile(x) {
    var st = hiveState(x), n = superCount(x.id);
    return '<button class="hv" data-act="hive" data-id="' + esc(x.id) + '"><b><span class="dot ' + st.cls + '"></span>' + esc(hiveLabel(x)) + '</b>' +
      '<span class="muted">' + esc(t('supers_n', { n: n })) + '</span><span class="muted">' + esc(st.text) + '</span></button>';
  }
  function hiveScreen() {
    var x = find('hives', F.id);
    if (!x) { app.innerHTML = ''; return closeSub(); }
    var st = hiveState(x), taken = 0;
    D.harvests.forEach(function (r) { r.takes.forEach(function (k) { if (k.hive === x.id) taken += k.n; }); });
    var h = '<div class="card"><div class="row"><span><span class="dot ' + st.cls + '"></span>' + esc(st.text) + '</span>' +
      '<button class="secondary small" data-act="edit" data-kind="hive" data-id="' + esc(x.id) + '">' + esc(t('edit')) + '</button></div>' +
      '<div class="stats">' + stat(t('supers_now'), String(superCount(x.id))) + stat(t('supers_harvested'), String(taken)) + stat(t('last_insp'), st.li ? shortDate(st.li.date) : '–') + '</div>' +
      '<table class="kv">' + [[t('place'), x.place || '–'], [t('gps'), x.gps], [t('hive_type'), t('ht_' + x.type)], [t('source'), t('hsrc_' + x.source)],
        [t('started'), shortDate(x.date)], [t('queen'), [x.queenYear, x.queenMark].filter(Boolean).join(' · ') || '–']].filter(function (r) { return r[1]; }).map(function (r) {
        return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
      }).join('') + '</table>' +
      (x.gps ? '<a class="btn secondary" style="margin-top:12px" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + encodeURIComponent(x.gps) + '">' + ico(IC.map, 20) + esc(t('open_map')) + '</a>' : '') +
      (x.notes ? '<p class="muted" style="margin:10px 0 0;white-space:pre-wrap">' + esc(x.notes) + '</p>' : '') + '</div>';
    if (st.li && (st.li.probs || []).indexOf('afb') > -1) h += msg('err', ico(IC.alert, 18) + ' ' + esc(t('afb_warn'))) + '<div style="height:14px"></div>';
    if (x.status === 'active') h += '<div class="quick">' +
      '<button class="qa" data-act="hiveNew" data-kind="insp" data-id="' + esc(x.id) + '">' + ico(IC.search, 22) + '<span>' + esc(t('q_insp')) + '</span></button>' +
      '<button class="qa" data-act="hiveNew" data-kind="super" data-id="' + esc(x.id) + '">' + ico(IC.layers, 22) + '<span>' + esc(t('q_super')) + '</span></button>' +
      '<button class="qa" data-act="hiveNew" data-kind="move" data-id="' + esc(x.id) + '">' + ico(IC.move, 22) + '<span>' + esc(t('q_move')) + '</span></button>' +
      '<button class="qa" data-act="hiveNew" data-kind="care" data-id="' + esc(x.id) + '">' + ico(IC.med, 22) + '<span>' + esc(t('q_care')) + '</span></button>' +
      '<button class="qa g" data-act="hiveNew" data-kind="harvest" data-id="' + esc(x.id) + '">' + ico(IC.honey, 22) + '<span>' + esc(t('q_harvest')) + '</span></button>' +
      '</div>';
    var hist = [].concat(
      D.insp.filter(function (r) { return r.hive === x.id; }).map(function (r) { return { k: 'insp', x: r }; }),
      D.care.filter(function (r) { return r.hive === x.id || (!r.hive && r.date >= (x.date || '')); }).map(function (r) { return { k: 'care', x: r }; }),
      D.moves.filter(function (r) { return r.hive === x.id; }).map(function (r) { return { k: 'move', x: r }; }),
      D.supers.filter(function (r) { return r.hive === x.id; }).map(function (r) { return { k: 'super', x: r }; }),
      D.harvests.filter(function (r) { return r.takes.some(function (k) { return k.hive === x.id; }); }).map(function (r) { return { k: 'harvest', x: r }; })
    ).sort(function (a, b) { return byDateDesc(a.x, b.x); });
    h += '<div class="card"><strong>' + esc(t('hive_log')) + '</strong>';
    h += hist.length ? '<div class="list">' + hist.slice(0, LS.hist.n).map(function (r) { return itemHtml(r.k, r.x, true, x.id); }).join('') + '</div>' + moreBtn('hist', hist.length, LS.hist.n) : empty(t('history_empty'));
    app.innerHTML = h + '</div>';
  }

  /* ---------------- Honey: harvest, processing, products ---------------- */
  function honeyScreen() {
    var st = honeyStock(), nl = noLitres();
    var h = '<div class="card"><strong>' + esc(t('honey_stock')) + '</strong><div class="stats">' + stat(t('raw_honey'), fmtL(st.raw)) + stat(t('processed_honey'), fmtL(st.done)) +
      stat(t('bottles_stock'), String(bottlesInStock())) + '</div><div class="hint">' + esc(t('honey_flow')) + '</div></div>';
    h += '<div class="two-btn"><button class="primary g" data-act="new" data-kind="harvest"' + (activeHives().length ? '' : ' disabled') + '>' + ico(IC.honey) + esc(t('q_harvest')) + '</button>' +
      '<button class="primary b" data-act="new" data-kind="buy">' + ico(IC.buy) + esc(t('q_buy')) + '</button></div>' +
      '<button class="primary" style="margin-bottom:14px" data-act="new" data-kind="process"' + (st.raw > 0 ? '' : ' disabled') + '>' + ico(IC.gear) + esc(t('q_process')) + '</button>';
    if (nl.length) h += '<div class="card warnc"><div class="grow"><strong>' + esc(t('litres_needed')) + '</strong><div class="muted">' + esc(t('litres_needed_sub')) + '</div>' +
      '<div class="list">' + nl.map(function (x) { return itemHtml('harvest', x); }).join('') + '</div></div></div>';
    var prods = D.products.slice().sort(byName);
    h += '<div class="card">' + cardHead(t('products'), addBtn('new', 'data-kind="product"')) + '<div class="hint">' + esc(t('products_hint')) + '</div>';
    if (prods.length) h += '<div class="list">' + prods.map(function (p) {
      var n = productStock(p.id);
      return '<div class="item static sickrow"><button class="plain grow" data-act="edit" data-kind="product" data-id="' + esc(p.id) + '"><span class="ttl">' + esc(p.name) + '</span>' +
        '<span class="muted">' + esc([t('in_stock_n', { n: n }), p.price ? fmtR(p.price) : '', p.size ? t('per_bottle', { l: fmtNum(p.size, p.size * 1000 % 10 ? 3 : 2) }) : ''].filter(Boolean).join(' · ')) + '</span></button>' +
        '<button class="secondary small" data-act="bottleNew" data-id="' + esc(p.id) + '">' + ico(IC.bottle, 18) + esc(t('bottle_btn')) + '</button></div>';
    }).join('') + '</div>';
    else h += empty(t('products_empty'));
    h += '</div>';
    var hist = [].concat(
      D.harvests.map(function (x) { return { k: 'harvest', x: x }; }), D.process.map(function (x) { return { k: 'process', x: x }; }),
      D.bottling.map(function (x) { return { k: 'bottle', x: x }; }), D.buys.map(function (x) { return { k: 'buy', x: x }; })
    ).sort(function (a, b) { return byDateDesc(a.x, b.x); });
    h += '<div class="card"><strong>' + esc(t('history')) + '</strong>' +
      (hist.length ? '<div class="list">' + hist.slice(0, LS.honey.n).map(function (r) { return itemHtml(r.k, r.x, true); }).join('') + '</div>' + moreBtn('honey', hist.length, LS.honey.n) : empty(t('honey_empty'))) + '</div>';
    app.innerHTML = h;
  }

  /* ---------------- Work: quotes, invoices, clients, services ---------------- */
  function workScreen() {
    var st = LS.docs;
    var h = '<div class="two-btn"><button class="primary b" data-act="new" data-kind="doc" data-dir="q">' + ico(IC.quote) + esc(t('q_quote')) + '</button>' +
      '<button class="primary" data-act="new" data-kind="doc" data-dir="i">' + ico(IC.invoice) + esc(t('q_invoice')) + '</button></div>' +
      '<div class="two-btn"><button class="secondary" data-act="oldDoc" data-dir="q">' + ico(IC.plus, 18) + esc(t('old_quote_btn')) + '</button>' +
      '<button class="secondary" data-act="oldDoc" data-dir="i">' + ico(IC.plus, 18) + esc(t('old_invoice_btn')) + '</button></div>' +
      '<button class="secondary" style="margin-bottom:14px" data-act="import">' + ico(IC.down, 18) + esc(t('imp_btn')) + '</button>';
    if (!D.settings.logo || !D.settings.bankAcc) {
      h += '<div class="card nudge">' + ico(IC.image, 26) + '<div class="grow"><strong>' + esc(t('setup_docs')) + '</strong><div class="muted">' +
        esc(!D.settings.logo ? t('setup_docs_logo') : t('setup_docs_bank')) + '</div></div><button class="secondary small" data-act="settings" data-to="docs">' + esc(t('set_up')) + '</button></div>';
    }
    var ow = owing().sort(function (a, b) { return (a.due || a.date).localeCompare(b.due || b.date); });
    var owR = ow.reduce(function (s, d) { return s + docTotals(d).bal; }, 0);
    h += '<div class="card">' + cardHead(t('owed_to_you')) + '<div class="stats">' + stat(t('total'), fmtR(owR), owR ? 'neg' : '') + stat(t('unpaid_invoices'), String(ow.length)) + '</div>';
    h += ow.length ? '<div class="list">' + ow.map(function (d) { return itemHtml('doc', d); }).join('') + '</div>' : empty(t('nothing_owed'));
    h += '</div>';
    var oq = openQuotes().sort(byDateDesc);
    if (oq.length) h += '<div class="card"><strong>' + esc(t('open_quotes')) + '</strong><div class="list">' + oq.map(function (d) { return itemHtml('doc', d); }).join('') + '</div></div>';
    var all = D.docs.filter(function (d) { return st.f === 'all' || d.type === st.f; }).sort(byDateDesc);
    h += '<div class="card"><strong>' + esc(t('all_docs')) + '</strong><div class="filter">' + [['all', t('all')], ['q', t('quotes')], ['i', t('invoices')]].map(function (o) {
      return '<button class="chip' + (st.f === o[0] ? ' on' : '') + '" data-act="dfilter" data-v="' + o[0] + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
    h += all.length ? '<div class="list">' + all.slice(0, st.n).map(function (d) { return itemHtml('doc', d); }).join('') + '</div>' + moreBtn('docs', all.length, st.n) : empty(t('docs_empty'));
    h += '</div>';
    var cl = D.clients.slice().sort(byName);
    h += '<div class="card">' + cardHead(t('clients'), addBtn('new', 'data-kind="client"')) +
      (cl.length ? '<div class="list">' + cl.map(function (c) {
        var ds = D.docs.filter(function (d) { return d.client === c.id; }), bal = ds.filter(function (d) { return d.type === 'i'; }).reduce(function (s, d) { return s + Math.max(0, docTotals(d).bal); }, 0);
        return '<button class="item" data-act="client" data-id="' + esc(c.id) + '"><div class="row"><span class="ttl">' + esc(c.name) + '</span>' + (bal > 0.005 ? '<span class="amt neg">' + esc(fmtR(bal)) + '</span>' : '') + '</div>' +
          '<div class="muted">' + esc([c.phone, c.email, t('n_docs', { n: ds.length })].filter(Boolean).join(' · ')) + '</div></button>';
      }).join('') + '</div>' : empty(t('clients_empty'))) + '</div>';
    var sv = D.settings.svcs;
    h += '<div class="card">' + cardHead(t('my_services'), addBtn('new', 'data-kind="svc"')) + '<div class="hint">' + esc(t('services_hint')) + '</div>' +
      (sv.length ? '<div class="list">' + sv.map(function (s) {
        return '<button class="item" data-act="edit" data-kind="svc" data-id="' + esc(s.id) + '"><div class="row"><span class="ttl">' + esc(s.name) + '</span><span class="amt' + (s.price ? '' : ' neg') + '">' +
          esc(s.price ? fmtR(s.price) : t('set_price')) + '</span></div></button>';
      }).join('') + '</div>' : '') + '</div>';
    app.innerHTML = h;
  }
  function clientScreen() {
    var c = find('clients', F.id);
    if (!c) { app.innerHTML = ''; return closeSub(); }
    var ds = D.docs.filter(function (d) { return d.client === c.id; }).sort(byDateDesc);
    var inv = ds.filter(function (d) { return d.type === 'i'; });
    var billed = inv.reduce(function (s, d) { return s + docTotals(d).total; }, 0), paid = inv.reduce(function (s, d) { return s + docTotals(d).paid; }, 0);
    var h = '<div class="card"><div class="row"><strong>' + esc(c.name) + '</strong><button class="secondary small" data-act="edit" data-kind="client" data-id="' + esc(c.id) + '">' + esc(t('edit')) + '</button></div>' +
      '<table class="kv">' + [[t('phone'), c.phone], [t('email'), c.email], [t('address'), c.addr], [t('town'), c.town], [t('town_code'), c.code], [t('postal'), c.postal], [t('vat_no'), c.vatNo]].filter(function (r) { return r[1]; }).map(function (r) {
        return '<tr><td>' + esc(r[0]) + '</td><td style="white-space:pre-wrap">' + esc(r[1]) + '</td></tr>';
      }).join('') + '</table>' +
      '<div class="stats">' + stat(t('invoiced'), fmtR(billed)) + stat(t('paid'), fmtR(paid), 'pos') + stat(t('owes'), fmtR(billed - paid), billed - paid > 0.005 ? 'neg' : '') + '</div>' +
      (c.phone ? '<div class="two" style="margin-top:12px"><a class="btn secondary" href="tel:' + esc(c.phone.replace(/[^\d+]/g, '')) + '">' + ico(IC.phone, 18) + esc(t('call')) + '</a>' +
        '<a class="btn secondary" target="_blank" rel="noopener" href="https://wa.me/' + esc(waNumber(c.phone)) + '">' + esc(t('whatsapp')) + '</a></div>' : '') + '</div>';
    h += '<div class="two-btn"><button class="primary b" data-act="clientDoc" data-dir="q" data-id="' + esc(c.id) + '">' + ico(IC.quote) + esc(t('q_quote')) + '</button>' +
      '<button class="primary" data-act="clientDoc" data-dir="i" data-id="' + esc(c.id) + '">' + ico(IC.invoice) + esc(t('q_invoice')) + '</button></div>';
    h += '<div class="card"><strong>' + esc(t('all_docs')) + '</strong>' + (ds.length ? '<div class="list">' + ds.map(function (d) { return itemHtml('doc', d); }).join('') + '</div>' : empty(t('docs_empty'))) + '</div>';
    app.innerHTML = h;
  }
  function waNumber(p) { var d = String(p || '').replace(/\D/g, ''); return d.charAt(0) === '0' ? '27' + d.slice(1) : d; }

  function docScreen() {
    var d = find('docs', F.id);
    if (!d) { app.innerHTML = ''; return closeSub(); }
    var x = docTotals(d), c = find('clients', d.client) || {}, s = docStatus(d), q = d.type === 'q';
    var h = '<div class="card"><div class="row"><span class="step">' + esc(docTitle(d)) + (d.old ? ' · ' + esc(t('added_later')) : '') + '</span>' + statusPill(d) + '</div>' +
      '<h2 style="margin:6px 0 2px">' + esc(c.name || '?') + '</h2>' +
      '<div class="muted">' + esc([d.job, d.site].filter(Boolean).join(' · ')) + '</div>' +
      '<table class="kv">' + [[t('date'), shortDate(d.date)], q ? [t('valid_until'), d.valid ? shortDate(d.valid) : '–'] : [t('due_date'), d.due ? shortDate(d.due) : '–']]
        .concat(d.awr ? [[t('order_no'), d.awr]] : [])
        .concat(d.from ? [[t('from_quote'), (find('docs', d.from) || {}).no || '–']] : [])
        .concat(d.inv ? [[t('invoice'), (find('docs', d.inv) || {}).no || '–']] : []).map(function (r) {
          return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
        }).join('') + '</table>';
    h += '<div class="list" style="margin-top:12px">' + d.lines.map(function (l) {
      return '<div class="item static"><div class="row"><span class="ttl" style="white-space:normal">' + esc(l.d) + '</span><span class="amt">' + esc(fmtR(r2(l.q * l.p))) + '</span></div>' +
        '<div class="muted">' + esc(fmtQ(l.q) + ' × ' + fmtR(l.p)) + '</div></div>';
    }).join('') + (d.travel ? '<div class="item static"><div class="row"><span class="ttl">' + esc(t('travel')) + '</span><span class="amt">' + esc(fmtR(r2(d.travel.km * d.travel.rate))) + '</span></div>' +
      '<div class="muted">' + esc(t('km_line', { km: fmtQ(d.travel.km), r: fmtR(d.travel.rate) })) + '</div></div>' : '') + '</div>';
    h += '<div class="totals">' + (d.vat ? '<div class="row"><span>' + esc(t('subtotal')) + '</span><b>' + esc(fmtR(x.sub)) + '</b></div><div class="row"><span>' + esc(t('vat_pct', { r: fmtNum(d.vatRate || 15, (d.vatRate || 15) % 1 ? 1 : 0) })) + '</span><b>' + esc(fmtR(x.vat)) + '</b></div>' : '') +
      '<div class="row big"><span>' + esc(t('total')) + '</span><span>' + esc(fmtR(x.total)) + '</span></div>' +
      (!q && x.paid ? '<div class="row"><span>' + esc(t('paid')) + '</span><b class="pos">' + esc(fmtR(x.paid)) + '</b></div><div class="row"><span>' + esc(t('balance_due')) + '</span><b class="' + (x.bal > 0.005 ? 'neg' : 'pos') + '">' + esc(fmtR(x.bal)) + '</b></div>' : '') +
      (q && Number(D.settings.deposit) > 0 ? '<div class="row muted"><span>' + esc(t('deposit_line', { p: D.settings.deposit })) + '</span><span>' + esc(fmtR(r2(x.total * D.settings.deposit / 100))) + '</span></div>' : '') +
      '</div>' + (d.notes ? '<p class="muted" style="white-space:pre-wrap;margin:12px 0 0">' + esc(d.notes) + '</p>' : '') + '</div>';

    // actions
    h += '<div class="card"><strong>' + esc(t('send_doc')) + '</strong><p class="muted" style="margin:6px 0 12px">' + esc(t('send_doc_sub')) + '</p><div class="stack">' +
      (canShare ? '<button class="primary" data-act="docShare">' + ico(IC.share) + esc(t('share_pdf_wa')) + '</button>' : '') +
      '<button class="' + (canShare ? 'secondary' : 'primary') + '" data-act="docPdf">' + ico(IC.down) + esc(t('save_pdf')) + '</button>' +
      (c.phone ? '<a class="btn secondary" target="_blank" rel="noopener" href="https://wa.me/' + esc(waNumber(c.phone)) + '?text=' + encodeURIComponent(waText(d, x)) + '">' + esc(t('wa_message')) + '</a>' : '') +
      '</div></div>';
    h += '<div class="card"><strong>' + esc(t('what_next')) + '</strong><div class="stack" style="margin-top:12px">';
    if (q) {
      if (d.status !== 'sent' && d.status !== 'accepted') h += '<button class="secondary" data-act="docStatus" data-v="sent">' + esc(t('mark_sent')) + '</button>';
      if (d.status !== 'accepted') h += '<button class="secondary g" data-act="docStatus" data-v="accepted">' + ico(IC.check, 20) + esc(t('mark_accepted')) + '</button>';
      if (d.status !== 'declined' && d.status !== 'accepted') h += '<button class="secondary" data-act="docStatus" data-v="declined">' + esc(t('mark_declined')) + '</button>';
      h += d.inv && find('docs', d.inv) ? '<button class="primary" data-act="doc" data-id="' + esc(d.inv) + '">' + esc(t('open_invoice')) + '</button>'
        : '<button class="primary" data-act="toInvoice">' + ico(IC.invoice) + esc(t('make_invoice')) + '</button><div class="hint">' + esc(t('make_invoice_hint')) + '</div>';
    } else {
      if (d.status === 'draft') h += '<button class="secondary" data-act="docStatus" data-v="sent">' + esc(t('mark_sent')) + '</button>';
      if (x.bal > 0.005) h += '<button class="primary g" data-act="payNew">' + ico(IC.plus) + esc(t('record_payment')) + '</button><div class="hint">' + esc(t('record_payment_hint')) + '</div>';
    }
    h += '<button class="secondary" data-act="edit" data-kind="doc" data-id="' + esc(d.id) + '">' + ico(IC.edit, 20) + esc(t('edit')) + '</button>' +
      '<button class="secondary" data-act="copyDoc">' + esc(t(q ? 'copy_quote' : 'copy_invoice')) + '</button></div></div>';
    if (!q && (d.pays || []).length) {
      h += '<div class="card"><strong>' + esc(t('payments')) + '</strong><div class="list">' + d.pays.slice().sort(byDateDesc).map(function (p) {
        return '<button class="item" data-act="payEdit" data-id="' + esc(p.id) + '"><div class="row"><span class="ttl">' + esc(t('pm_' + (p.method || 'eft'))) + '</span><span class="amt pos">' + esc(fmtR(p.amt)) + '</span></div>' +
          '<div class="muted">' + esc(niceDate(p.date)) + '</div></button>';
      }).join('') + '</div></div>';
    }
    if (c.id) h += '<button class="text" data-act="client" data-id="' + esc(c.id) + '">' + esc(t('open_client', { n: c.name })) + '</button>';
    app.innerHTML = h;
  }
  function waText(d, x) {
    var s = D.settings, bits = [t('wa_hello', { n: clientName(d.client) })];
    bits.push(t(d.type === 'q' ? 'wa_quote' : 'wa_invoice', { no: d.no, r: fmtR(d.type === 'q' ? x.total : x.bal), job: d.job || '' }).replace(' ()', ''));
    if (d.type === 'i' && s.bankAcc) bits.push(t('wa_bank', { bank: s.bankName, acc: s.bankAcc, br: s.bankBranch, ref: d.no }));
    bits.push(t('wa_thanks', { n: s.owner || s.biz }));
    return bits.join('\n\n');
  }

  /* ---------------- Money ---------------- */
  function moneyList() {
    var st = LS.money, ym = st.ym || (st.ym = today().slice(0, 7));
    var list = D.money.filter(function (m) { return m.date.slice(0, 7) === ym; }).sort(byDateDesc);
    var tin = 0, tout = 0;
    list.forEach(function (m) { if (m.dir === 'in') tin += m.amt; else tout += m.amt; });
    var shown = list.filter(function (m) { return st.dir === 'all' || m.dir === st.dir; });
    var h = '<div class="two-btn"><button class="primary g" data-act="new" data-kind="money" data-dir="in">' + ico(IC.plus) + esc(t('q_income')) + '</button>' +
      '<button class="primary r" data-act="new" data-kind="money" data-dir="out">' + ico(IC.minus) + esc(t('q_expense')) + '</button></div>';
    var np = needPhoto().length;
    h += '<div class="two-btn">' + (D.settings.fuelOn || D.fuel.length ? '<button class="secondary" data-act="fuelv">' + ico(IC.fuel, 20) + esc(t('fuel')) + '</button>' : '') +
      '<button class="secondary" data-act="pending"' + (np ? '' : ' disabled') + '>' + ico(IC.cam, 20) + esc(t('slips_needed')) + (np ? ' <span class="badge">' + np + '</span>' : '') + '</button></div>';
    h += '<div class="card">' + monthNav('money', ym) +
      '<div class="stats">' + stat(t('income'), fmtR(tin), 'pos') + stat(t('expenses'), fmtR(tout), 'neg') + stat(t('net'), fmtR(tin - tout), tin - tout >= 0 ? 'pos' : 'neg') + '</div>' +
      '<div class="filter">' + [['all', t('all')], ['in', t('income')], ['out', t('expenses')]].map(function (o) {
        return '<button class="chip' + (st.dir === o[0] ? ' on' : '') + '" data-act="mfilter" data-v="' + o[0] + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    h += shown.length ? '<div class="list">' + shown.map(function (m) { return itemHtml('money', m); }).join('') + '</div>' : empty(t('money_empty'));
    h += '</div>';
    var rules = D.recur.slice().sort(function (a, b) { return (b.on - a.on) || a.day - b.day; });
    h += '<div class="card">' + cardHead(t('repeating'), addBtn('new', 'data-kind="recur"')) + '<div class="hint">' + esc(t('repeating_hint')) + '</div>';
    if (rules.length) h += '<div class="list">' + rules.map(function (r) {
      return '<button class="item" data-act="edit" data-kind="recur" data-id="' + esc(r.id) + '"><div class="row"><span class="ttl">' + esc(r.desc || catLabel(r.cat)) + '</span>' +
        '<span class="amt ' + (r.dir === 'in' ? 'pos' : 'neg') + '">' + (r.dir === 'in' ? '+' : '−') + esc(fmtR(r.amt)) + '</span></div>' +
        '<div class="muted">' + esc((r.on ? t('every_month_on', { d: r.day }) : t('stopped')) + ' · ' + catLabel(r.cat) + (r.party ? ' · ' + r.party : '')) + '</div></button>';
    }).join('') + '</div>';
    h += '</div><p class="muted center foot">' + esc(t('invoice_money_note')) + '</p>';
    app.innerHTML = h;
  }

  /* ---------------- Fuel (optional) ---------------- */
  function fuelList() {
    var st = LS.fuel, ym = st.ym || (st.ym = today().slice(0, 7));
    var list = D.fuel.filter(function (f) { return f.date.slice(0, 7) === ym; }).sort(byDateDesc);
    var dl = 0, pl = 0, amt = 0;
    list.forEach(function (f) { if (f.kind === 'petrol') pl += f.l; else dl += f.l; amt += f.amt; });
    var h = '<button class="primary" data-act="new" data-kind="fuel">' + ico(IC.plus) + esc(t('fuel_bought_btn')) + '</button>';
    h += '<div class="card" style="margin-top:14px">' + monthNav('fuel', ym) +
      '<div class="stats">' + stat(t('diesel'), fmtL(dl)) + stat(t('petrol'), fmtL(pl)) + stat(t('spent'), fmtR(amt)) + '</div></div>';
    h += '<div class="card"><strong>' + esc(t('fuel_bought')) + '</strong>';
    h += list.length ? '<div class="list">' + list.map(function (f) { return itemHtml('fuel', f); }).join('') + '</div>' : empty(t('fuel_empty'));
    h += '</div><p class="muted center foot">' + esc(t('fuel_note')) + '</p>';
    app.innerHTML = h;
  }

  /* ---------------- Diary ---------------- */
  function diaryList() {
    var st = LS.diary, q = (st.q || '').toLowerCase();
    var tog = '<div class="seg big2" style="margin-bottom:14px"><button class="' + (st.mode !== 'log' ? 'on' : '') + '" data-act="dmode" data-v="diary">' + ico(IC.diary, 18) + ' ' + esc(t('tab_diary')) + '</button>' +
      '<button class="' + (st.mode === 'log' ? 'on' : '') + '" data-act="dmode" data-v="log">' + ico(IC.car, 18) + ' ' + esc(t('lb_tab')) + (D.activeTrip ? ' <span class="badge">1</span>' : '') + '</button></div>';
    if (st.mode === 'log') { app.innerHTML = tog + logScreen() + '<input type="file" id="tripFile" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" class="hidden">'; return; }
    var list = D.diary.filter(function (d) {
      return !q || d.text.toLowerCase().indexOf(q) > -1 || (d.tags || []).some(function (g) { return t('tag_' + g).toLowerCase().indexOf(q) > -1; });
    }).sort(byDateDesc);
    var h = tog + '<button class="primary" data-act="new" data-kind="diary">' + ico(IC.plus) + esc(t('write_today')) + '</button>';
    h += '<div class="card" style="margin-top:14px"><input class="in" id="dsearch" type="search" placeholder="' + esc(t('search_diary')) + '" value="' + esc(st.q || '') + '">';
    if (!list.length) h += '<p class="muted" style="margin:12px 0 0">' + esc(q ? t('no_results') : t('diary_empty')) + '</p>';
    else {
      var lastDate = '';
      h += '<div class="list">' + list.slice(0, st.n).map(function (d) {
        var head = d.date !== lastDate ? '<div class="dhead">' + esc(niceDate(d.date)) + '</div>' : '';
        lastDate = d.date;
        return head + '<button class="item diary" data-act="edit" data-kind="diary" data-id="' + esc(d.id) + '">' +
          '<div class="dtext">' + esc(d.text) + '</div>' +
          ((d.tags || []).length ? '<div class="tags">' + d.tags.map(function (g) { return '<span class="pill">' + esc(t('tag_' + g)) + '</span>'; }).join('') + '</div>' : '') +
          '</button>';
      }).join('') + '</div>' + moreBtn('diary', list.length, st.n);
    }
    h += '</div>';
    if (D.settings.remind) h += '<p class="muted center foot">' + esc(t('reminder_where')) + ' <a href="#" data-act="settings">' + esc(t('settings')) + '</a></p>';
    app.innerHTML = h;
  }

  /* ---------------- Slips still needing a photo ---------------- */
  function pendingScreen() {
    var list = needPhoto().map(function (x) { return { k: D.money.indexOf(x) > -1 ? 'money' : 'fuel', x: x }; }).sort(function (a, b) { return byDateDesc(a.x, b.x); });
    var h = '<div class="card"><p class="muted" style="margin:0">' + esc(t('pending_hint')) + '</p>';
    h += list.length ? '<div class="list">' + list.map(function (r) { return itemHtml(r.k, r.x); }).join('') + '</div>' : '<p>' + esc(t('pending_none')) + '</p>';
    app.innerHTML = h + '</div>';
  }

  /* ================================================================ */
  /* Forms                                                             */
  /* ================================================================ */
  function openNew(kind, opts) {
    opts = opts || {};
    var s = { kind: kind, date: today() };
    var hid = opts.hive || '';
    if (kind === 'money' || kind === 'recur') {
      s.dir = opts.dir || 'out'; s.cat = catsFor(s.dir)[0]; s.vatIncl = !NO_VAT_DEFAULT[s.cat];
      if (kind === 'recur') { s.day = String(Math.min(28, new Date().getDate())); s.on = true; }
    } else if (kind === 'fuel') {
      var lastF = D.fuel.slice().sort(byDateDesc)[0];
      s.fkind = lastF ? lastF.kind : 'diesel'; s.use = 'hives'; s.vatIncl = true; s.mach = lastF ? lastF.mach : '';
    } else if (kind === 'diary') { s.tags = []; }
    else if (kind === 'hive') {
      var maxNo = D.hives.reduce(function (m, x) { var n = parseInt(x.no, 10); return isNaN(n) ? m : Math.max(m, n); }, 0);
      var lastH = D.hives.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0];
      Object.assign(s, { no: String(maxNo + 1), htype: 'lang', source: opts.source || 'swarm', status: 'active', queenYear: '', supersNow: '0',
        place: opts.place != null ? opts.place : (lastH ? lastH.place : ''), gps: opts.gps != null ? opts.gps : (lastH ? lastH.gps : '') });
    } else if (kind === 'insp') {
      if (!hid) { var li = D.insp.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0]; var lh = li && find('hives', li.hive); if (lh && lh.status === 'active') hid = li.hive; }
      if (!hid) hid = (activeHives().sort(hiveSort)[0] || {}).id || '';
      Object.assign(s, { hive: hid, queen: 'seen', brood: 'good', stores: 'ok', temper: 'calm', probs: [] });
    } else if (kind === 'harvest') { s.takes = {}; s.first = ''; if (hid) { s.takes[hid] = 0; s.first = hid; } }
    else if (kind === 'care') {
      var lastC = D.care.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0];
      Object.assign(s, { hive: hid, ctype: lastC ? lastC.type : 'feed' });
    } else if (kind === 'move') { s.hives = hid ? [hid] : []; s.place = ''; s.gps = ''; }
    else if (kind === 'super') { s.hives = hid ? [hid] : []; s.sdir = 'on'; s.n = '1'; }
    else if (kind === 'process') { var hs = honeyStock(); s.from = numIn(hs.raw > 0 ? hs.raw : ''); s.out = ''; }
    else if (kind === 'product') { s.date = undefined; }
    else if (kind === 'buy') { s.litres = ''; s.amt = ''; s.supplier = ''; s.addMoney = true; s.vatIncl = !!D.settings.vat; }
    else if (kind === 'bottle') { s.product = opts.product || (D.products.slice().sort(byName)[0] || {}).id || ''; s.n = ''; s.litres = ''; }
    else if (kind === 'client') { s.date = undefined; }
    else if (kind === 'trip') { var lt = lastTrip(); Object.assign(s, { startTime: '', endTime: '', startOdo: lt ? String(lt.endOdo) : '', endOdo: '', from: lt ? lt.to : '', to: '', reason: '' }); }
    else if (kind === 'svc') { s.date = undefined; }
    else if (kind === 'doc') {
      var st = D.settings;
      Object.assign(s, { dtype: opts.dir === 'i' ? 'i' : 'q', client: opts.client || (D.clients.length ? '' : '__new'), n: 1, travelOn: !!st.travelDefault,
        km: '', kmRate: st.kmRate ? numIn(st.kmRate) : '', addVat: !!st.vat, cat: 'services_in', valid: addDays(today(), +st.quoteDays || 30), due: addDays(today(), +st.payDays || 7),
        show: (st.show || SHOW_DEFAULT).filter(function (k) { return k !== 'awr'; }), awr: '' });
      if (opts.old) Object.assign(s, { old: true, no: '', noStock: true, paidOld: false, paidDate: '', method: 'eft', oldStatus: 'accepted', travelOn: false });
      if (opts.copy) {
        var c = opts.copy;
        Object.assign(s, { client: c.client, job: c.job, site: c.site, notes: c.notes, cat: c.cat || 'services_in', addVat: !!c.vat, travelOn: !!c.travel,
          km: c.travel ? numIn(c.travel.km) : '', kmRate: c.travel ? numIn(c.travel.rate) : s.kmRate, show: (c.show || s.show).slice() });
        setLines(s, c.lines);
      }
    }
    openSub('form', s);
  }
  function setLines(s, lines) {
    s.n = Math.max(1, lines.length);
    lines.forEach(function (l, i) { s['l' + i + 'd'] = l.d; s['l' + i + 'q'] = numIn(l.q); s['l' + i + 'p'] = numIn(l.p); s['l' + i + 'r'] = l.prod || ''; });
  }
  function openEdit(kind, id) {
    if (kind === 'svc') {
      var sv = D.settings.svcs.filter(function (x) { return x.id === id; })[0];
      if (sv) openSub('form', { kind: 'svc', id: id, name: sv.name, price: numIn(sv.price || '') });
      return;
    }
    var x = find(COLL[kind], id);
    if (!x) return;
    var s = { kind: kind, id: id, date: x.date };
    if (kind === 'money') Object.assign(s, { dir: x.dir, amt: numIn(x.amt), cat: x.cat, desc: x.desc, party: x.party, ref: x.ref, vatIncl: !!x.vat,
      photo: x.photo || '', photoLater: !!x.photoLater, docLink: x.doc || '', buyLink: x.buy || '' });
    else if (kind === 'recur') Object.assign(s, { dir: x.dir, amt: numIn(x.amt), cat: x.cat, desc: x.desc, party: x.party, vatIncl: !!x.vatIncl, day: String(x.day), on: x.on !== false });
    else if (kind === 'fuel') Object.assign(s, { fkind: x.kind, l: numIn(x.l), amt: numIn(x.amt), use: x.use, mach: x.mach, sup: x.sup, ref: x.ref, vatIncl: !!x.vat,
      photo: x.photo || '', photoLater: !!x.photoLater });
    else if (kind === 'diary') Object.assign(s, { text: x.text, tags: (x.tags || []).slice() });
    else if (kind === 'hive') Object.assign(s, { no: x.no, place: x.place, gps: x.gps, supersNow: String(superCount(x.id)), htype: x.type, source: x.source, status: x.status,
      ended: x.ended || '', queenYear: x.queenYear, queenMark: x.queenMark, notes: x.notes });
    else if (kind === 'insp') Object.assign(s, { hive: x.hive, queen: x.queen, brood: x.brood, stores: x.stores, temper: x.temper, frames: numIn(x.frames || ''), probs: (x.probs || []).slice(), notes: x.notes, next: x.next || '' });
    else if (kind === 'harvest') {
      var tk = {}; x.takes.forEach(function (k) { tk[k.hive] = k.n; });
      Object.assign(s, { takes: tk, first: x.first || (x.takes[0] || {}).hive || '', litres: x.litres == null ? '' : numIn(x.litres), notes: x.notes });
    }
    else if (kind === 'care') Object.assign(s, { hive: x.hive || '', ctype: x.type, product: x.product, qty: x.qty, next: x.next || '', notes: x.notes });
    else if (kind === 'move') Object.assign(s, { hives: [x.hive], place: x.to, gps: x.toGps, notes: x.notes });
    else if (kind === 'super') Object.assign(s, { hives: [x.hive], sdir: x.dir, n: String(x.n), notes: x.notes });
    else if (kind === 'process') Object.assign(s, { from: numIn(x.from), out: numIn(x.out), notes: x.notes });
    else if (kind === 'buy') Object.assign(s, { supplier: x.supplier, litres: numIn(x.litres), amt: numIn(x.amt || ''), addMoney: !!x.mid, vatIncl: !!x.vatIncl, notes: x.notes });
    else if (kind === 'product') Object.assign(s, { name: x.name, size: numIn(x.size || ''), price: numIn(x.price || '') });
    else if (kind === 'bottle') Object.assign(s, { product: x.product, n: String(x.n), litres: numIn(x.litres), notes: x.notes });
    else if (kind === 'trip') Object.assign(s, { startTime: x.startTime || '', endTime: x.endTime || '', startOdo: String(x.startOdo), endOdo: String(x.endOdo), from: x.from, to: x.to, reason: x.reason });
    else if (kind === 'client') Object.assign(s, { name: x.name, phone: x.phone, email: x.email, addr: x.addr, town: x.town, code: x.code || '', postal: x.postal, vatNo: x.vatNo, notes: x.notes });
    else if (kind === 'doc') {
      Object.assign(s, { dtype: x.type, client: x.client, job: x.job, site: x.site, notes: x.notes, cat: x.cat || 'services_in', addVat: !!x.vat,
        travelOn: !!x.travel, km: x.travel ? numIn(x.travel.km) : '', kmRate: x.travel ? numIn(x.travel.rate) : numIn(D.settings.kmRate || ''),
        valid: x.valid || '', due: x.due || '', show: (x.show || D.settings.show || SHOW_DEFAULT).slice(), old: !!x.old, no: x.no, noStock: !!x.noStock, awr: x.awr || '' });
      setLines(s, x.lines);
    }
    openSub('form', s);
  }
  function payForm(docId, payId) {
    var d = find('docs', docId);
    if (!d) return;
    var p = payId ? (d.pays || []).filter(function (x) { return x.id === payId; })[0] : null;
    openSub('form', p ? { kind: 'pay', doc: d.id, pid: p.id, date: p.date, amt: numIn(p.amt), method: p.method || 'eft' }
      : { kind: 'pay', doc: d.id, date: today(), amt: numIn(docTotals(d).bal), method: 'eft' });
  }

  var FORMS = {};
  function formScreen() {
    var k = F.kind, h = '<div class="card form">';
    h += FORMS[k]();
    h += msg('err', F.err);
    h += '<div class="stack" style="margin-top:22px"><button class="primary" data-act="saveForm">' + esc(t(k === 'doc' && !F.id ? 'save_doc_' + F.dtype : 'save')) + '</button>';
    if (F.id || F.pid) h += confirmBtn('del', 'deleteForm', k === 'recur' ? t('delete_rule') : t('delete'), F.delAgain || t('delete_again'));
    else h += '<button class="text" data-act="close">' + esc(t('cancel')) + '</button>';
    h += '</div></div>';
    if (F.after) h = msg('info', F.after) + h;
    app.innerHTML = h;
    if (F.photo && !F.photoSrc) photoUrl(F.photo).then(function (u) { if (u && V === 'form' && F) { F.photoSrc = u; render(); } });
    var first = app.querySelector('[data-focus]');
    if (first && !F.id && window.matchMedia('(min-width: 900px)').matches) first.focus();
  }

  // Slip photo block for money & fuel purchases
  function photoBlock() {
    if (useLS) return '';
    var h = '<div class="fw"><label class="f">' + esc(t('slip_photo')) + '</label>';
    if (F.photoSrc && !F.photoRemoved) {
      h += '<div class="photo"><img src="' + F.photoSrc + '" alt="' + esc(t('slip_photo')) + '" data-act="viewPhoto"></div>' +
        '<div class="two" style="margin-top:8px"><label class="btn secondary small wide" for="camIn">' + ico(IC.cam, 18) + esc(t('retake')) + '</label>' +
        '<button class="text danger" data-act="rmPhoto">' + esc(t('remove_photo')) + '</button></div>';
    } else {
      h += '<div class="two"><label class="btn secondary" for="camIn">' + ico(IC.cam, 20) + esc(t('take_photo')) + '</label>' +
        '<label class="btn secondary" for="galIn">' + ico(IC.image, 20) + esc(t('choose_photo')) + '</label></div>' +
        '<div style="margin-top:12px">' + check('photoLater', t('photo_later')) + '</div>';
    }
    h += '<input type="file" accept="image/*" capture="environment" id="camIn" class="hidden"><input type="file" accept="image/*" id="galIn" class="hidden">';
    return h + '</div>';
  }
  function nextChips() {
    return '<div class="chips">' + [7, 14, 21, 30].map(function (n) {
      return '<button type="button" class="chip' + (F.next === addDays(F.date || today(), n) ? ' on' : '') + '" data-act="nextIn" data-v="' + n + '">' + esc(t('in_days', { n: n })) + '</button>';
    }).join('') + '</div>';
  }

  FORMS.money = function () { return moneyForm(); };
  FORMS.recur = function () { return moneyForm(); };
  function moneyForm() {
    var rec = F.kind === 'recur';
    var cats = catsFor(F.dir, F.cat).map(function (c) { return [c, catLabel(c)]; }).concat([['__new', t('new_category')]]);
    var amtN = num(F.amt), days = [];
    for (var d = 1; d <= 28; d++) days.push([String(d), String(d)]);
    var h = '';
    if (F.buyLink) h += msg('info', esc(t('money_from_buy')));
    if (F.docLink) { var dl = find('docs', F.docLink); if (dl) h += msg('info', esc(t('money_from_doc', { no: dl.no }))).replace('margin: 0 0 14px', ''); }
    h += seg('dir', [['in', t('income')], ['out', t('expense')]], 'big2') +
      '<div class="two">' + fld(t('amount'), inp('amt', { mode: 'decimal', ph: '0.00', cls: 'money', id: 'f-amt', focus: 1 })) +
      (rec ? fld(t('day_of_month'), sel('day', days)) : fld(t('date'), inp('date', { type: 'date' }))) + '</div>' +
      fld(t('category'), sel('cat', cats, true));
    if (F.cat === '__new') h += fld(t('new_category_name'), inp('newCat', { max: 40 }));
    h += fld(t('description'), inp('desc', { ph: t(rec ? 'desc_rec_ph' : F.dir === 'in' ? 'desc_in_ph' : 'desc_out_ph'), max: 120 }));
    var parties = uniq(D.money.slice().sort(byDateDesc).filter(function (m) { return m.dir === F.dir; }).map(function (m) { return m.party; }), 6);
    h += fld(t(F.dir === 'in' ? 'party_in' : 'party_out'), inp('party', { max: 80 }) + chips('party', parties));
    if (!rec) h += fld(t('reference'), inp('ref', { max: 40, ph: t('reference_ph') }));
    if (D.settings.vat) {
      h += '<div style="margin-top:16px">' + check('vatIncl', t('includes_vat', { r: D.settings.vatRate })) + '</div>' +
        '<div class="hint" id="live-vat">' + vatLine(amtN) + '</div>';
    }
    if (rec) {
      h += '<div style="margin-top:16px">' + check('on', t('repeat_on')) + '</div><div class="hint">' + esc(t('repeat_rule_hint')) + '</div>';
    } else {
      h += photoBlock();
      if (!F.id) h += '<div style="margin-top:16px">' + check('repeat', t('repeat_monthly')) + '</div>' +
        (F.repeat ? '<div class="hint">' + esc(t('repeat_monthly_hint', { d: Math.min(28, parseD(F.date || today()).getDate()) })) + '</div>' : '');
    }
    return h;
  }
  function vatLine(amtN) {
    if (!F.vatIncl) return esc(t('vat_none'));
    if (isNaN(amtN)) return '&nbsp;';
    var v = vatOf(amtN, true);
    return esc(t('vat_line', { v: fmtR(v), x: fmtR(amtN - v) }));
  }
  FORMS.fuel = function () {
    var lN = num(F.l), aN = num(F.amt);
    var mach = uniq(D.fuel.slice().sort(byDateDesc).map(function (f) { return f.mach; }), 6);
    var sup = uniq(D.fuel.slice().sort(byDateDesc).map(function (f) { return f.sup; }), 4);
    var h = seg('fkind', [['diesel', t('diesel')], ['petrol', t('petrol')]], 'big2') +
      '<div class="two">' + fld(t('litres'), inp('l', { mode: 'decimal', ph: '0', cls: 'money', id: 'f-l', focus: 1 })) +
      fld(t('total_paid'), inp('amt', { mode: 'decimal', ph: '0.00', cls: 'money', id: 'f-amt' })) + '</div>' +
      '<div class="hint" id="live-ppl">' + pplLine(lN, aN) + '</div>' +
      fld(t('date'), inp('date', { type: 'date' })) +
      fld(t('used_for'), seg('use', [['hives', t('use_hives')], ['jobs', t('use_jobs')], ['other', t('use_other')]], 'wrap3')) +
      fld(t('vehicle'), inp('mach', { max: 60, ph: t('vehicle_ph') }) + chips('mach', mach)) +
      fld(t('supplier'), inp('sup', { max: 60 }) + chips('sup', sup)) +
      fld(t('reference'), inp('ref', { max: 40, ph: t('reference_ph') }));
    if (D.settings.vat) h += '<div style="margin-top:16px">' + check('vatIncl', t('includes_vat', { r: D.settings.vatRate })) + '</div><div class="hint" id="live-vat">' + vatLine(aN) + '</div>';
    return h + photoBlock();
  };
  function pplLine(lN, aN) {
    if (isNaN(lN) || isNaN(aN) || !lN) return '&nbsp;';
    return esc(t('per_litre', { p: fmtR(aN / lN) }));
  }
  FORMS.diary = function () {
    return fld(t('date'), inp('date', { type: 'date' })) +
      fld(t('what_happened'), area('text', t('diary_ph'), 7, true)) +
      fld(t('tags'), multi('tags', TAGS, function (g) { return t('tag_' + g); }));
  };
  var MARKS = { 1: 'white', 6: 'white', 2: 'yellow', 7: 'yellow', 3: 'red', 8: 'red', 4: 'green', 9: 'green', 5: 'blue', 0: 'blue' };
  function placeFields() {
    var pl = places().slice(0, 10);
    return fld(t('place'), inp('place', { max: 80, ph: t('place_ph') }) + (pl.length ? '<div class="chips">' + pl.map(function (p, i) {
      return '<button type="button" class="chip' + (String(F.place || '').toLowerCase() === p.p.toLowerCase() ? ' on' : '') + '" data-act="pickPlace" data-v="' + i + '">' + esc(p.p) + '</button>';
    }).join('') + '</div>' : '')) +
      fld(t('gps'), '<div class="yield" style="grid-template-columns:minmax(0,1fr) auto">' + inp('gps', { max: 40, ph: '-26.71, 27.10' }) +
        '<button type="button" class="secondary small" data-act="gps">' + ico(IC.pin, 18) + esc(t('here')) + '</button></div>', esc(t('gps_hint')));
  }
  function hiveChips(k) {
    var hs = activeHives().sort(hiveSort);
    return '<div class="chips">' + hs.map(function (h) {
      return '<button type="button" class="chip' + ((F[k] || []).indexOf(h.id) > -1 ? ' on' : '') + '" data-multi="' + k + '" data-v="' + esc(h.id) + '">' + esc(h.no) + '</button>';
    }).join('') + '</div>';
  }
  FORMS.hive = function () {
    var yr = new Date().getFullYear(), years = [];
    for (var y = yr; y > yr - 4; y--) years.push(String(y));
    var mk = /^\d{4}$/.test(F.queenYear || '') ? MARKS[+F.queenYear.slice(-1)] : '';
    var h = '<div class="two">' + fld(t('hive_no'), inp('no', { max: 12, focus: 1 })) + fld(t('supers_now'), inp('supersNow', { mode: 'numeric', max: 2 })) + '</div>' +
      (F.id ? '<div class="hint">' + esc(t('supers_now_hint')) + '</div>' : '') +
      (F.id ? msg('info', esc(t('place_edit_hint'))) : placeFields()) +
      fld(t('hive_type'), seg('htype', HIVE_TYPES.map(function (k) { return [k, esc(t('ht_' + k))]; }), 'wrap3')) +
      fld(t('source'), seg('source', HIVE_SRC.map(function (k) { return [k, esc(t('hsrc_' + k))]; }), 'wrap3')) +
      fld(t('started'), inp('date', { type: 'date' })) +
      '<div class="two">' + fld(t('queen_year'), inp('queenYear', { max: 4, mode: 'numeric', ph: t('optional') }) + chips('queenYear', years)) +
      fld(t('queen_mark'), inp('queenMark', { max: 20, ph: t('optional') }) + (mk ? chips('queenMark', [t('mk_' + mk)]) : '')) + '</div>' +
      (mk ? '<div class="hint">' + esc(t('mark_hint', { y: F.queenYear, c: t('mk_' + mk).toLowerCase() })) + '</div>' : '');
    if (F.id) {
      h += fld(t('status'), seg('status', HIVE_STATUS.map(function (k) { return [k, esc(t('hs_' + k))]; }), 'wrap3'));
      if (F.status !== 'active') h += fld(t('ended'), inp('ended', { type: 'date' }));
    }
    return h + fld(t('notes'), area('notes', t('hive_notes_ph'), 3));
  };
  FORMS.move = function () {
    var h = '';
    if (!F.id) h += fld(t('which_hives'), hiveChips('hives'), esc(t('which_hives_hint')));
    else h += msg('info', esc(t('move_edit_hint', { h: hiveName(F.hives[0]) })));
    var from = uniq((F.hives || []).map(function (id) { var x = find('hives', id); return x ? x.place : ''; }), 4);
    if (!F.id && from.length) h += '<div class="hint">' + esc(t('now_at', { p: from.join(', ') })) + '</div>';
    h += fld(t('date'), inp('date', { type: 'date' }));
    h += F.id ? fld(t('moved_to'), inp('place', { max: 80 })) : placeFields().replace(esc(t('place')), esc(t('moved_to')));
    return h + fld(t('notes'), inp('notes', { max: 120, ph: t('optional') }));
  };
  FORMS.super = function () {
    var h = '';
    if (!F.id) h += fld(t('which_hives'), hiveChips('hives'));
    h += fld(t('what_done'), seg('sdir', [['on', t('supers_on')], ['off', t('supers_off')]], 'big2')) +
      '<div class="two">' + fld(t('how_many_supers'), inp('n', { mode: 'numeric', max: 2, cls: 'money' })) + fld(t('date'), inp('date', { type: 'date' })) + '</div>';
    var now = (F.hives || []).map(function (id) { return hiveName(id) + ': ' + superCount(id, '', F.id); });
    if (now.length) h += '<div class="hint">' + esc(t('supers_now_list', { l: now.join(' · ') })) + '</div>';
    h += '<div class="hint">' + esc(t('supers_harvest_hint')) + '</div>';
    return h + fld(t('notes'), inp('notes', { max: 120, ph: t('optional') }));
  };
  FORMS.insp = function () {
    var hs = hiveOpts('', F.hive);
    var h = fld(t('hive'), sel('hive', hs.length ? hs : [['', t('no_hives_short')]])) +
      fld(t('date'), inp('date', { type: 'date' })) +
      fld(t('queen'), seg('queen', [['seen', t('qs_seen')], ['eggs', t('qs_eggs')], ['no', t('qs_no')]], 'wrap3')) +
      fld(t('brood'), seg('brood', [['good', t('br_good')], ['patchy', t('br_patchy')], ['none', t('br_none')]], 'wrap3')) +
      fld(t('stores'), seg('stores', [['low', t('st_low')], ['ok', t('st_ok')], ['full', t('st_full')]], 'wrap3')) +
      fld(t('temper'), seg('temper', [['calm', t('tm_calm')], ['nervous', t('tm_nervous')], ['aggressive', t('tm_aggressive')]], 'wrap3')) +
      fld(t('frames_bees'), inp('frames', { mode: 'decimal', ph: t('optional'), max: 5 })) +
      fld(t('problems'), multi('probs', PROBS, function (p) { return t('pr_' + p); }), esc(t('problems_hint')));
    if ((F.probs || []).indexOf('afb') > -1) h += msg('err', ico(IC.alert, 18) + ' ' + esc(t('afb_warn')));
    if ((F.probs || []).indexOf('laying') > -1) h += msg('warn', ico(IC.alert, 18) + ' ' + esc(t('laying_warn')));
    h += fld(t('notes'), area('notes', t('insp_notes_ph'), 3)) +
      fld(t('next_insp'), inp('next', { type: 'date' }) + nextChips(), esc(t('next_hint')));
    return h;
  };
  // Harvest: one strip per hive, with a numbered square for every super on it. Tap 2 = take two supers.
  function harvestHives() {
    var first = F.first ? find('hives', F.first) : null, g0 = first ? gpsOf(first.gps) : null;
    var list = D.hives.filter(function (h) { return (h.status === 'active' && superCount(h.id, F.id) > 0) || F.takes[h.id] != null; }).map(function (h) {
      var g = gpsOf(h.gps);
      return { h: h, avail: superCount(h.id, F.id), d: h.id === F.first ? -1 : (g0 && g ? distKm(g0, g) : null) };
    });
    list.sort(function (a, b) {
      if (g0) { if (a.d == null && b.d != null) return 1; if (b.d == null && a.d != null) return -1; if (a.d != null && a.d !== b.d) return a.d - b.d; }
      return hiveSort(a.h, b.h);
    });
    return list;
  }
  FORMS.harvest = function () {
    var list = harvestHives(), tot = 0, nh = 0;
    Object.keys(F.takes).forEach(function (k) { if (F.takes[k]) { tot += F.takes[k]; nh++; } });
    var hidden = activeHives().filter(function (h) { return !superCount(h.id, F.id) && F.takes[h.id] == null; }).length;
    var h = fld(t('date'), inp('date', { type: 'date' })) +
      '<label class="f">' + esc(t('pick_supers')) + '</label><div class="hint" style="margin-top:0">' + esc(t(F.first ? 'pick_supers_sorted' : 'pick_supers_hint')) + '</div>';
    h += list.length ? list.map(function (r) {
      var n = F.takes[r.h.id] || 0, sq = '';
      for (var i = 1; i <= Math.max(r.avail, n); i++) {
        sq += '<button type="button" class="' + (i <= n ? 'on' : '') + '" data-act="take" data-id="' + esc(r.h.id) + '" data-v="' + i + '" aria-label="' + esc(t('take_n', { n: i, h: r.h.no })) + '">' + i + '</button>';
      }
      return '<div class="strip' + (n ? ' sel' : '') + '"><div class="no">' + esc(r.h.no) + '<small>' + esc(r.d === -1 ? t('first_pick') : r.d != null ? fmtDist(r.d) : (r.h.place || '')) + '</small></div>' +
        '<div class="sq">' + sq + '</div></div>';
    }).join('') : empty(t('no_supers_anywhere'));
    if (hidden) h += '<div class="hint">' + esc(t('hidden_no_supers', { n: hidden })) + '</div>';
    h += '<div class="totals card" style="margin:14px 0 0;background:var(--soft);border:0"><div class="row big"><span>' + esc(t('harvest_line', { n: tot, h: nh })) + '</span></div></div>';
    h += fld(t('raw_litres'), inp('litres', { mode: 'decimal', ph: t('later'), cls: 'money' }), esc(t('raw_litres_hint'))) +
      fld(t('notes'), area('notes', t('harvest_notes_ph'), 2));
    return h;
  };
  FORMS.care = function () {
    var prods = uniq(D.care.slice().sort(byDateDesc).filter(function (x) { return x.type === F.ctype; }).map(function (x) { return x.product; }), 8);
    var sugg = { feed: [t('sugar_syrup'), t('pollen_patty')] }[F.ctype] || [];
    var h = fld(t('what_done'), seg('ctype', CARE_TYPES.map(function (k) { return [k, esc(t('ct_' + k))]; }), 'wrap3')) +
      fld(t('hive'), sel('hive', hiveOpts(t('all_hives'), F.hive))) +
      fld(t('date'), inp('date', { type: 'date' }));
    if (['feed', 'treat', 'other'].indexOf(F.ctype) > -1) h += fld(t(F.ctype === 'feed' ? 'feed_what' : 'product'), inp('product', { max: 60, ph: t(F.ctype === 'treat' ? 'treat_ph' : 'optional') }) + chips('product', uniq(prods.concat(sugg), 8)));
    if (['feed', 'treat'].indexOf(F.ctype) > -1) h += fld(t('how_much'), inp('qty', { max: 40, ph: t(F.ctype === 'feed' ? 'qty_feed_ph' : 'qty_treat_ph') }));
    if (F.ctype === 'split') h += '<div class="hint">' + esc(t('split_hint')) + '</div>';
    if (F.ctype === 'requeen') h += '<div class="hint">' + esc(t('requeen_hint')) + '</div>';
    h += fld(t('notes'), area('notes', t('optional'), 2)) +
      fld(t('next_due'), inp('next', { type: 'date' }) + nextChips(), esc(t('next_hint')));
    return h;
  };
  FORMS.process = function () {
    var st = honeyStock(F.id);
    return msg('info', esc(t('raw_available', { l: fmtL(st.raw) }))) +
      fld(t('date'), inp('date', { type: 'date' })) +
      '<div class="two">' + fld(t('raw_used'), inp('from', { mode: 'decimal', cls: 'money', focus: 1 })) + fld(t('processed_got'), inp('out', { mode: 'decimal', cls: 'money' })) + '</div>' +
      '<div class="hint">' + esc(t('process_hint')) + '</div>' +
      fld(t('notes'), inp('notes', { max: 120, ph: t('optional') }));
  };
  FORMS.buy = function () {
    var sup = uniq(D.buys.slice().sort(byDateDesc).map(function (x) { return x.supplier; }), 8);
    return fld(t('date'), inp('date', { type: 'date' })) +
      fld(t('bought_from'), inp('supplier', { max: 80, ph: t('bought_from_ph'), focus: 1 }) + chips('supplier', sup)) +
      '<div class="two">' + fld(t('raw_litres'), inp('litres', { mode: 'decimal', cls: 'money' })) + fld(t('amount_paid'), inp('amt', { mode: 'decimal', cls: 'money', ph: t('optional') })) + '</div>' +
      '<div class="hint">' + esc(t('buy_hint')) + '</div>' +
      '<div style="margin-top:16px">' + check('addMoney', t('buy_money')) + '</div>' +
      (D.settings.vat && F.addMoney ? '<div style="margin-top:12px">' + check('vatIncl', t('includes_vat', { r: D.settings.vatRate })) + '</div>' : '') +
      fld(t('notes'), inp('notes', { max: 120, ph: t('optional') }));
  };
  FORMS.product = function () {
    return fld(t('product_name'), inp('name', { max: 60, ph: t('product_name_ph'), focus: 1 })) +
      '<div class="two">' + fld(t('litres_per_bottle'), inp('size', { mode: 'decimal', max: 8, ph: '0,375' })) +
      fld(t(D.settings.vat ? 'price_excl' : 'price'), inp('price', { mode: 'decimal', max: 10, ph: '0.00' })) + '</div>' +
      '<div class="hint">' + esc(t('product_hint')) + '</div>' +
      (F.id ? msg('info', esc(t('in_stock_n', { n: productStock(F.id) }))) : '');
  };
  FORMS.bottle = function () {
    var st = honeyStock('', F.id), prods = D.products.slice().sort(byName);
    if (!prods.length) return msg('info', esc(t('products_empty')));
    return msg('info', esc(t('processed_available', { l: fmtL(st.done) }))) +
      fld(t('product'), pick('product', prods.map(function (p) { return p.id; }), function (id) { return (find('products', id) || {}).name; })) +
      fld(t('date'), inp('date', { type: 'date' })) +
      '<div class="two">' + fld(t('bottles_n'), inp('n', { mode: 'numeric', cls: 'money', focus: 1, id: 'f-n' })) + fld(t('litres_used'), inp('litres', { mode: 'decimal', cls: 'money', id: 'f-litres' })) + '</div>' +
      '<div class="hint" id="live-bl">' + bottleCalc() + '</div>' +
      fld(t('notes'), inp('notes', { max: 120, ph: t('optional') }));
  };
  function bottleCalc() {
    var p = find('products', F.product), n = num(F.n);
    if (!p) return '';
    if (!p.size) return esc(t('bottle_no_size'));
    return esc(isNaN(n) ? t('bottle_size', { l: fmtNum(p.size, 3).replace(/[.,]?0+$/, '') }) : t('bottle_calc', { n: n, l: fmtNum(p.size, 3).replace(/[.,]?0+$/, ''), t: fmtNum(r2(n * p.size), 2) })) +
      ' ' + esc(t('bottle_hint'));
  }
  FORMS.client = function () {
    return fld(t('client_name'), inp('name', { max: 80, focus: 1 })) +
      '<div class="two">' + fld(t('phone'), inp('phone', { max: 20, mode: 'tel' })) + fld(t('email'), inp('email', { max: 80, type: 'email' })) + '</div>' +
      fld(t('address'), inp('addr', { max: 120, ph: t('address_ph') })) +
      '<div class="two">' + fld(t('town'), inp('town', { max: 60 })) + fld(t('town_code'), inp('code', { max: 10, mode: 'numeric', ph: t('town_code_ph') })) + '</div>' +
      fld(t('postal'), inp('postal', { max: 80, ph: t('optional') })) +
      fld(t('client_vat'), inp('vatNo', { max: 20, ph: t('optional') }), esc(t('client_vat_hint'))) +
      fld(t('notes'), area('notes', t('optional'), 2));
  };
  FORMS.svc = function () {
    return fld(t('service_name'), inp('name', { max: 120, focus: 1 })) +
      fld(t(D.settings.vat ? 'price_excl' : 'price'), inp('price', { mode: 'decimal', ph: '0.00', cls: 'money' }), esc(t('service_price_hint')));
  };
  FORMS.pay = function () {
    var d = find('docs', F.doc), x = d ? docTotals(d) : { bal: 0 };
    var old = d && F.pid ? (d.pays || []).filter(function (p) { return p.id === F.pid; })[0] : null;
    var room = r2(x.bal + (old ? old.amt : 0));
    return msg('info', esc(t('pay_for', { no: d ? d.no : '', c: d ? clientName(d.client) : '', r: fmtR(room) }))).replace('margin: 0 0 14px', '') +
      '<div class="two">' + fld(t('amount_received'), inp('amt', { mode: 'decimal', ph: '0.00', cls: 'money', focus: 1 })) + fld(t('date'), inp('date', { type: 'date' })) + '</div>' +
      fld(t('pay_method'), seg('method', PAY_METHODS.map(function (k) { return [k, esc(t('pm_' + k))]; }), 'wrap3')) +
      '<div class="hint">' + esc(t('pay_money_hint')) + '</div>';
  };
  FORMS.doc = function () {
    var q = F.dtype === 'q', st = D.settings;
    var cl = [['', t('choose_client')]].concat(D.clients.slice().sort(byName).map(function (c) { return [c.id, c.name]; })).concat([['__new', t('new_client')]]);
    var h = '';
    if (F.old) {
      var used = D.docs.filter(function (d) { return d.type === F.dtype && d.id !== F.id; }).map(function (d) { return d.no; }).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
      h += msg('info', esc(t(q ? 'old_quote_info' : 'old_invoice_info'))) +
        fld(t(q ? 'quote_no' : 'invoice_no'), inp('no', { max: 20, ph: t('optional'), focus: 1 }), esc(t('old_no_hint')) + (used.length ? ' ' + esc(t('nos_used', { l: used.slice(-6).join(', ') })) : ''));
    }
    h += '<div class="two">' + fld(t('date'), inp('date', { type: 'date', id: 'f-ddate' })) +
      (q ? fld(t('valid_until'), inp('valid', { type: 'date' })) : fld(t('due_date'), inp('due', { type: 'date' }))) + '</div>' +
      fld(t('client'), sel('client', cl, true));
    var orderFld = fld(t('awr_label'), inp('awr', { max: 60, ph: t('awr_ph') }), esc(t('awr_hint')));
    if (F.client === '__new') {
      h += '<div class="line">' + fld(t('client_name'), inp('cName', { max: 80, focus: 1 })) +
        '<div class="two">' + fld(t('phone'), inp('cPhone', { max: 20, mode: 'tel' })) + fld(t('email'), inp('cEmail', { max: 80, type: 'email' })) + '</div>' +
        fld(t('address'), inp('cAddr', { max: 120, ph: t('address_ph') })) +
        '<div class="two">' + fld(t('town'), inp('cTown', { max: 60 })) + fld(t('town_code'), inp('cCode', { max: 10, mode: 'numeric', ph: t('town_code_ph') })) + '</div>' +
        fld(t('postal'), inp('cPostal', { max: 80, ph: t('optional') })) +
        fld(t('client_vat'), inp('cVat', { max: 20, ph: t('optional') })) + '</div>';
    }
    h += orderFld;
    var jobs = uniq(D.docs.slice().sort(byDateDesc).map(function (d) { return d.job; }), 5);
    h += fld(t('job'), inp('job', { max: 100, ph: t('job_ph') }) + chips('job', jobs)) +
      fld(t('site'), inp('site', { max: 120, ph: t('site_ph') }));
    h += '<label class="f">' + esc(t(st.vat && F.addVat ? 'items_excl' : 'items')) + '</label>';
    for (var i = 0; i < F.n; i++) {
      var pid = F['l' + i + 'r'] || '', pr = pid ? find('products', pid) : null;
      var stk = pr ? t('in_stock_n', { n: productStock(pr.id, F.id) }) : pid === '__raw' ? t('in_stock_l', { l: fmtL(honeyStock('', '', F.id).raw) }) : pid === '__done' ? t('in_stock_l', { l: fmtL(honeyStock('', '', F.id).done) }) : '';
      h += '<div class="line"><div class="lhead"><b>' + esc(t('item_n', { n: i + 1 })) + (stk && !q ? ' · ' + esc(stk) : '') + '</b>' +
        (F.n > 1 ? '<button type="button" class="text small danger" data-act="rmLine" data-i="' + i + '">' + esc(t('remove')) + '</button>' : '') + '</div>' +
        fld(t('description'), inp('l' + i + 'd', { max: 200, ph: t('line_ph') })) +
        '<div class="qtyp">' + fld(t('qty'), inp('l' + i + 'q', { mode: 'decimal', ph: '1' })) + fld(t('unit_price'), inp('l' + i + 'p', { mode: 'decimal', ph: '0.00' })) +
        '<div class="lt" id="live-l' + i + '">' + esc(fmtR(lineVal(i))) + '</div></div></div>';
    }
    var sv = st.svcs, prods = D.products.slice().sort(byName);
    var hs = honeyStock('', '', F.id);
    h += '<div class="hint" style="margin-top:12px">' + esc(t('add_from_products')) + '</div><div class="chips">' + prods.map(function (p) {
      return '<button type="button" class="chip" data-act="addProd" data-id="' + esc(p.id) + '">+ ' + esc(p.name) + (p.price ? ' · ' + esc(fmtR(p.price)) : '') + ' (' + productStock(p.id, F.id) + ')</button>';
    }).join('') + '<button type="button" class="chip" data-act="addProd" data-id="__raw">+ ' + esc(t('bulk_raw')) + ' (' + esc(fmtL(hs.raw)) + ')</button>' +
      '<button type="button" class="chip" data-act="addProd" data-id="__done">+ ' + esc(t('bulk_done')) + ' (' + esc(fmtL(hs.done)) + ')</button></div>';
    h += '<div class="hint" style="margin-top:12px">' + esc(t(sv.length ? 'add_from_services' : 'no_services_yet')) + '</div><div class="chips">' + sv.map(function (s) {
      return '<button type="button" class="chip" data-act="addSvc" data-id="' + esc(s.id) + '">+ ' + esc(s.name) + (s.price ? ' · ' + esc(fmtR(s.price)) : '') + '</button>';
    }).join('') + '<button type="button" class="chip" data-act="addLine">+ ' + esc(t('blank_line')) + '</button></div>';
    h += '<div style="margin-top:18px">' + check('travelOn', t('charge_travel')) + '</div>';
    if (F.travelOn) h += '<div class="two">' + fld(t('km'), inp('km', { mode: 'decimal', ph: '0' })) + fld(t('rate_per_km'), inp('kmRate', { mode: 'decimal', ph: '0.00' })) + '</div>' +
      '<div class="hint">' + esc(t('travel_hint')) + '</div>';
    if (st.vat || F.addVat) h += '<div style="margin-top:16px">' + check('addVat', t('add_vat', { r: st.vatRate })) + '</div>';
    if (!q) h += fld(t('income_cat'), sel('cat', catsFor('in', F.cat).map(function (c) { return [c, catLabel(c)]; })), esc(t('income_cat_hint')));
    h += fld(t('doc_notes'), area('notes', t('doc_notes_ph'), 3));
    h += '<div class="totals card" style="margin:16px 0 0;background:var(--soft);border:0" id="live-tot">' + totalsHtml() + '</div>';
    if (F.old) {
      h += '<div class="line" style="margin-top:16px"><label class="f">' + esc(t('old_options')) + '</label>';
      if (q) h += fld(t('what_happened_quote'), seg('oldStatus', [['sent', t('ds_sent')], ['accepted', t('ds_accepted')], ['declined', t('ds_declined')]], 'wrap3'));
      else if (!F.id) {
        h += '<div style="margin-top:10px">' + check('paidOld', t('paid_in_full_old')) + '</div>';
        if (F.paidOld) h += '<div class="two">' + fld(t('paid_on'), inp('paidDate', { type: 'date' })) + fld(t('pay_method'), sel('method', PAY_METHODS.map(function (k) { return [k, t('pm_' + k)]; }))) + '</div>' +
          '<div class="hint">' + esc(t('paid_old_hint')) + '</div>';
      }
      if (!q) h += '<div style="margin-top:14px">' + check('noStock', t('no_stock_old')) + '</div><div class="hint">' + esc(t('no_stock_old_hint')) + '</div>';
      h += '</div>';
    }
    var keys = SHOW_KEYS.filter(function (k) { return !(q && k === 'paid') && !(!q && k === 'deposit') && !(k === 'vat_no' && !st.vat) && !(k === 'reg_no' && !st.regNo); });
    h += '<div class="line" style="margin-top:16px"><label class="f">' + esc(t('show_on_doc')) + '</label><div class="hint" style="margin-top:0">' + esc(t('show_on_doc_hint')) + '</div>' +
      multi('show', keys, function (k) { return t('sh_' + k + (k === 'dates2' ? '_' + F.dtype : '')); }) + '</div>';
    return h;
  };
  function lineVal(i) { var q = F['l' + i + 'q'] === '' || F['l' + i + 'q'] == null ? 1 : num(F['l' + i + 'q']), p = num(F['l' + i + 'p']); return isNaN(q) || isNaN(p) ? 0 : r2(q * p); }
  function totalsHtml() {
    var sub = 0;
    for (var i = 0; i < F.n; i++) sub += lineVal(i);
    if (F.travelOn) { var km = num(F.km), rt = num(F.kmRate); if (!isNaN(km) && !isNaN(rt)) sub += r2(km * rt); }
    sub = r2(sub);
    var vat = F.addVat ? r2(sub * vatRate() / 100) : 0;
    return (F.addVat ? '<div class="row"><span>' + esc(t('subtotal')) + '</span><b>' + esc(fmtR(sub)) + '</b></div><div class="row"><span>' + esc(t('vat_pct', { r: D.settings.vatRate })) + '</span><b>' + esc(fmtR(vat)) + '</b></div>' : '') +
      '<div class="row big"><span>' + esc(t('total')) + '</span><span>' + esc(fmtR(sub + vat)) + '</span></div>';
  }
  function addLine(d, p, prod) {
    var i = F.n - 1;
    var lastEmpty = !clean(F['l' + i + 'd']) && !clean(F['l' + i + 'p']);
    if (!lastEmpty) { F.n++; i = F.n - 1; }
    F['l' + i + 'd'] = d || ''; F['l' + i + 'q'] = d ? '1' : ''; F['l' + i + 'p'] = p ? numIn(p) : ''; F['l' + i + 'r'] = prod || '';
  }
  function rmLine(i) {
    for (var j = i; j < F.n - 1; j++) ['d', 'q', 'p', 'r'].forEach(function (c) { F['l' + j + c] = F['l' + (j + 1) + c]; });
    ['d', 'q', 'p', 'r'].forEach(function (c) { delete F['l' + (F.n - 1) + c]; });
    F.n = Math.max(1, F.n - 1);
  }

  /* Save ---------------------------------------------------------------- */
  function saveForm() {
    var k = F.kind;
    if (k === 'svc') return saveSvc();
    if (k === 'pay') return savePay();
    if ((k === 'move' || k === 'super') && !F.id) return saveMany();
    if (k === 'trip') return tripFormSave(F.id ? find('trips', F.id) : null);
    var rec = { id: F.id || uid(), ts: Date.now() }, e = '';
    var old = F.id ? find(COLL[k], F.id) : null;
    if (old) rec.ts = old.ts || rec.ts;
    if (['client', 'recur', 'product'].indexOf(k) < 0) { if (!F.date) e = t('err_date'); rec.date = F.date; }
    var extra = [], after = null;

    if (k === 'money' || k === 'recur') {
      var a = num(F.amt);
      if (isNaN(a) || a <= 0) e = t('err_amount');
      var cat = F.cat;
      if (cat === '__new') {
        var name = clean(F.newCat, 40);
        if (!name) e = t('err_newcat');
        else {
          cat = 'c:' + name;
          var list = D.settings.cats[F.dir];
          if (!list.some(function (n) { return n.toLowerCase() === name.toLowerCase(); })) list.push(name);
        }
      }
      Object.assign(rec, { dir: F.dir, amt: r2(a), cat: cat, desc: clean(F.desc, 120), party: clean(F.party, 80) });
      if (k === 'money') {
        Object.assign(rec, { ref: clean(F.ref, 40), vat: D.settings.vat ? vatOf(r2(a), !!F.vatIncl) : 0 });
        if (old && old.rid) rec.rid = old.rid;
        if (old && old.doc) { rec.doc = old.doc; rec.pay = old.pay; }
        if (old && old.buy) { rec.buy = old.buy; var ob = find('buys', old.buy); if (ob) ob.amt = rec.amt; }
      } else {
        var day = Math.max(1, Math.min(28, +F.day || 1)), cur = today().slice(0, 7);
        Object.assign(rec, { vatIncl: !!F.vatIncl, day: day, on: !!F.on,
          last: old ? old.last : (day < new Date().getDate() ? cur : addMonths(cur, -1)) });
      }
    } else if (k === 'fuel') {
      var l = num(F.l), amt = num(F.amt);
      if (isNaN(l) || l <= 0) e = t('err_litres');
      else if (isNaN(amt) || amt < 0) e = t('err_amount');
      Object.assign(rec, { kind: F.fkind, l: r2(l), amt: r2(amt), use: F.use, mach: clean(F.mach, 60), sup: clean(F.sup, 60), ref: clean(F.ref, 40),
        vat: D.settings.vat ? vatOf(r2(amt), !!F.vatIncl) : 0 });
    } else if (k === 'diary') {
      var tx = String(F.text || '').replace(/\r/g, '').trim().slice(0, 5000);
      if (!tx) e = t('err_text');
      Object.assign(rec, { text: tx, tags: (F.tags || []).slice() });
    } else if (k === 'hive') {
      var no = clean(F.no, 12), sn = clean(F.supersNow) ? num(F.supersNow) : 0;
      if (!no) e = t('err_hive_no');
      else if ((F.status || 'active') === 'active' && D.hives.some(function (x) { return x.id !== rec.id && x.status === 'active' && String(x.no).toLowerCase() === no.toLowerCase(); })) e = t('err_hive_dup', { n: no });
      else if (isNaN(sn) || sn < 0 || sn % 1 || sn > 20) e = t('err_supers');
      else if (F.queenYear && !/^\d{4}$/.test(F.queenYear)) e = t('err_year');
      else if (F.gps && !gpsOf(F.gps)) e = t('err_gps');
      Object.assign(rec, { no: no, type: F.htype || 'lang', source: F.source || 'other', status: F.status || 'active', queenYear: clean(F.queenYear, 4), queenMark: clean(F.queenMark, 20),
        ended: F.status && F.status !== 'active' ? (F.ended || today()) : '', notes: cleanMulti(F.notes, 500),
        place: old ? old.place : clean(F.place, 80), gps: old ? old.gps : clean(F.gps, 40), supers0: old ? old.supers0 : (sn || 0) });
      if (old && !e) rec.supers0 = (Number(old.supers0) || 0) + (sn - superCount(old.id));   // "supers now" corrected by hand
    } else if (k === 'move') {
      var pl = clean(F.place, 80);
      if (!pl) e = t('err_place');
      Object.assign(rec, { hive: old.hive, from: old.from, fromGps: old.fromGps, to: pl, toGps: old.toGps, notes: clean(F.notes, 120) });
      var hm = find('hives', old.hive), latest = D.moves.filter(function (m) { return m.hive === old.hive; }).sort(byDateDesc)[0];
      if (!e && hm && latest && latest.id === old.id) hm.place = pl;
    } else if (k === 'super') {
      var sn2 = num(F.n), have = superCount(old.hive, '', old.id);
      if (isNaN(sn2) || sn2 <= 0 || sn2 % 1) e = t('err_supers');
      else if (F.sdir === 'off' && sn2 > have) e = t('err_supers_off', { n: have });
      Object.assign(rec, { hive: old.hive, dir: F.sdir, n: sn2, notes: clean(F.notes, 120) });
    } else if (k === 'insp') {
      var fr = F.frames ? num(F.frames) : 0;
      if (!F.hive || !find('hives', F.hive)) e = t('err_hive');
      else if (isNaN(fr) || fr < 0 || fr > 100) e = t('err_frames');
      else if (F.next && F.next < F.date) e = t('err_next');
      Object.assign(rec, { hive: F.hive, queen: F.queen, brood: F.brood, stores: F.stores, temper: F.temper, frames: fr || 0, probs: (F.probs || []).slice(), notes: cleanMulti(F.notes, 500), next: F.next || '' });
    } else if (k === 'harvest') {
      var takes = [], lit = clean(F.litres) ? num(F.litres) : null;
      Object.keys(F.takes).forEach(function (hid) {
        var n = F.takes[hid] || 0;
        if (!n) return;
        if (n > superCount(hid, F.id)) e = e || t('err_take', { h: hiveName(hid), n: superCount(hid, F.id) });
        takes.push({ hive: hid, n: n });
      });
      if (!takes.length) e = e || t('err_takes');
      else if (lit != null && (isNaN(lit) || lit < 0)) e = e || t('err_litres');
      else if (lit != null && old && old.litres != null && lit < old.litres && honeyStock().raw - (old.litres - lit) < -0.005) e = e || t('err_litres_used');
      Object.assign(rec, { takes: takes, first: F.first || '', litres: lit == null ? null : r2(lit), notes: cleanMulti(F.notes, 300) });
    } else if (k === 'care') {
      if (F.next && F.next < F.date) e = t('err_next');
      Object.assign(rec, { hive: F.hive || '', type: F.ctype, product: clean(F.product, 60), qty: clean(F.qty, 40), next: F.next || '', notes: cleanMulti(F.notes, 300) });
    } else if (k === 'process') {
      var fl = num(F.from), ol = num(F.out), raw = honeyStock(F.id).raw;
      if (isNaN(fl) || fl <= 0) e = t('err_raw_used');
      else if (fl > raw + 0.005) e = t('err_raw_more', { l: fmtL(raw) });
      else if (isNaN(ol) || ol <= 0) e = t('err_processed');
      else if (old && honeyStock().done - old.out + ol < -0.005) e = t('err_litres_used');
      Object.assign(rec, { from: r2(fl), out: r2(ol), notes: clean(F.notes, 120) });
    } else if (k === 'buy') {
      var bl2 = num(F.litres), ba = clean(F.amt) ? num(F.amt) : 0;
      if (!clean(F.supplier)) e = t('err_supplier');
      else if (isNaN(bl2) || bl2 <= 0) e = t('err_litres');
      else if (isNaN(ba) || ba < 0) e = t('err_amount');
      else if (old && honeyStock('', '', '', old.id).raw + bl2 < -0.005) e = t('err_litres_used');
      Object.assign(rec, { supplier: clean(F.supplier, 80), litres: r2(bl2), amt: r2(ba || 0), vatIncl: !!F.vatIncl, notes: clean(F.notes, 120), mid: old ? old.mid || '' : '' });
      if (!e) {   // the purchase also goes into Money as an expense
        var mm = rec.mid ? find('money', rec.mid) : null;
        if (F.addMoney && rec.amt > 0) {
          var mrec = { id: rec.mid || uid(), ts: mm ? mm.ts : Date.now(), date: rec.date, dir: 'out', amt: rec.amt, cat: 'honey_buy', desc: t('buy_desc', { l: fmtL(rec.litres) }),
            party: rec.supplier, ref: mm ? mm.ref : '', vat: D.settings.vat ? vatOf(rec.amt, !!F.vatIncl) : 0, buy: rec.id, photo: mm ? mm.photo || '' : '', photoLater: mm ? !!mm.photoLater : false };
          rec.mid = mrec.id; extra.push(['money', mrec]);
        } else if (mm) { D.money = D.money.filter(function (m) { return m.id !== mm.id; }); rec.mid = ''; }
      }
    } else if (k === 'product') {
      var pn = clean(F.name, 60), ps = clean(F.size) ? num(F.size) : 0, pp = clean(F.price) ? num(F.price) : 0;
      if (!pn) e = t('err_name');
      else if (isNaN(ps) || ps < 0 || ps > 50) e = t('err_size');
      else if (isNaN(pp) || pp < 0) e = t('err_amount');
      Object.assign(rec, { name: pn, size: ps || 0, price: r2(pp || 0) });
    } else if (k === 'bottle') {
      var bn = num(F.n), bl = num(F.litres), done = honeyStock('', F.id).done;
      if (!find('products', F.product)) e = t('err_product');
      else if (isNaN(bn) || bn <= 0 || bn % 1) e = t('err_bottles');
      else if (isNaN(bl) || bl <= 0) e = t('err_litres');
      else if (bl > done + 0.005) e = t('err_done_more', { l: fmtL(done) });
      else if (old && productStock(old.product, '', old.id) + (old.product === F.product ? bn : 0) < 0) e = t('err_bottles_sold');
      Object.assign(rec, { product: F.product, n: bn, litres: r2(bl), notes: clean(F.notes, 120) });
    } else if (k === 'client') {
      if (!clean(F.name)) e = t('err_client_name');
      Object.assign(rec, { name: clean(F.name, 80), phone: clean(F.phone, 20), email: clean(F.email, 80), addr: clean(F.addr, 120), town: clean(F.town, 60), code: clean(F.code, 10), postal: clean(F.postal, 80),
        vatNo: clean(F.vatNo, 20), notes: cleanMulti(F.notes, 500) });
    } else if (k === 'doc') {
      var res = collectDoc(old);
      e = e || res.e; rec = Object.assign(res.rec, { id: rec.id, ts: rec.ts, date: F.date });
      if (res.client) extra.push(['client', res.client]);
    }
    if (e) { F.err = esc(e); render(); return; }

    // slip photo
    if (k === 'money' || k === 'fuel') {
      var oldPhoto = old ? old.photo || '' : '';
      rec.photo = F.photoRemoved ? '' : oldPhoto;
      if (F.newPhoto) {
        var pid = 'p' + uid();
        rec.photo = pid;
        photoPut(pid, F.newPhoto).catch(function () { toast(t('err_photo_save')); });
        photoUrls[pid] = F.photoSrc;
      }
      if (oldPhoto && oldPhoto !== rec.photo) photoDel(oldPhoto);
      rec.photoLater = !rec.photo && !!F.photoLater;
    }

    extra.forEach(function (x) { upsert(COLL[x[0]], x[1]); });
    if (k === 'doc' && !rec.no) rec.no = nextNo(rec.type);
    if (k === 'doc' && rec.old) bumpNo(rec.type, rec.no);
    if (k === 'doc') rec.showV = 2;
    if (k === 'doc' && !old && rec.old && rec.type === 'i' && F.paidOld) {   // an old invoice that was already paid: record the payment too
      var tot = docTotals(rec).total, pv = rec.vat ? r2(tot * (rec.vatRate || 15) / (100 + (rec.vatRate || 15))) : 0;
      var pay = { id: uid(), date: F.paidDate, amt: tot, method: F.method || 'eft', mid: uid() };
      rec.pays = [pay];
      if (tot > 0) D.money.push({ id: pay.mid, ts: Date.now(), date: pay.date, dir: 'in', amt: tot, cat: rec.cat || 'services_in', desc: t('pay_desc', { no: rec.no, job: rec.job || '' }).replace(/ – $/, ''),
        party: clientName(rec.client), ref: rec.no, vat: pv, doc: rec.id, pay: pay.id });
    }
    if (k === 'doc') D.settings.show = rec.show.slice();
    upsert(COLL[k], rec);

    // follow-ups
    if (k === 'money' && F.repeat && !F.id) {
      D.recur.push({ id: uid(), ts: Date.now(), dir: rec.dir, amt: rec.amt, cat: rec.cat, desc: rec.desc, party: rec.party,
        vatIncl: !!F.vatIncl, day: Math.min(28, parseD(rec.date).getDate()), on: true, last: rec.date.slice(0, 7) });
      rec.rid = D.recur[D.recur.length - 1].id;
    }
    if (k === 'money' && rec.doc) {   // keep the invoice payment in step
      var dd = find('docs', rec.doc), pp2 = dd && (dd.pays || []).filter(function (p) { return p.id === rec.pay; })[0];
      if (pp2) { pp2.amt = rec.amt; pp2.date = rec.date; }
    }
    if (k === 'care' && rec.type === 'requeen' && rec.hive && !old) {
      var hq = find('hives', rec.hive);
      if (hq) { hq.queenYear = rec.date.slice(0, 4); hq.queenMark = ''; }
    }
    if (k === 'care' && rec.type === 'split' && !old) { var hs = find('hives', rec.hive); after = { place: hs ? hs.place : '', gps: hs ? hs.gps : '' }; }
    save();
    toast(t('saved'));
    if (k === 'doc') { if (!old) LS.docs.f = 'all'; goView('doc', { id: rec.id }); return; }
    if (after) {
      var back = F.back;
      openNew('hive', { source: 'split', place: after.place, gps: after.gps });
      F.after = esc(t('split_new_hive')); F.back = back; render();
      return;
    }
    closeSub();
  }
  // New moves and super changes: one record per hive chosen
  function saveMany() {
    var k = F.kind, ids = (F.hives || []).filter(function (id) { return find('hives', id); }), e = '';
    if (!ids.length) e = t('err_hives');
    else if (!F.date) e = t('err_date');
    if (k === 'move' && !e) {
      var pl = clean(F.place, 80);
      if (!pl) e = t('err_place');
      else if (F.gps && !gpsOf(F.gps)) e = t('err_gps');
      if (!e) ids.forEach(function (id, i) {
        var h = find('hives', id);
        D.moves.push({ id: uid(), ts: Date.now() + i, date: F.date, hive: id, from: h.place || '', fromGps: h.gps || '', to: pl, toGps: clean(F.gps, 40), notes: clean(F.notes, 120) });
        if (!D.moves.some(function (m) { return m.hive === id && m.date > F.date; })) { h.place = pl; h.gps = clean(F.gps, 40); }
      });
    }
    if (k === 'super' && !e) {
      var n = num(F.n);
      if (isNaN(n) || n <= 0 || n % 1 || n > 20) e = t('err_supers');
      else if (F.sdir === 'off') ids.forEach(function (id) { if (!e && n > superCount(id)) e = t('err_supers_off_h', { h: hiveName(id), n: superCount(id) }); });
      if (!e) ids.forEach(function (id, i) { D.supers.push({ id: uid(), ts: Date.now() + i, date: F.date, hive: id, dir: F.sdir, n: n, notes: clean(F.notes, 120) }); });
    }
    if (e) { F.err = esc(e); return render(); }
    save(); toast(t('saved')); closeSub();
  }
  function collectDoc(old) {
    var e = '', lines = [], q = F.dtype === 'q';
    for (var i = 0; i < F.n; i++) {
      var d = clean(F['l' + i + 'd'], 200), qs = clean(F['l' + i + 'q']), ps = clean(F['l' + i + 'p']), pr = F['l' + i + 'r'] || '';
      if (!d && !ps && !qs) continue;
      var qn = qs ? num(qs) : 1, pn = num(ps);
      if (!d) e = e || t('err_line_desc', { n: i + 1 });
      else if (isNaN(qn) || qn <= 0) e = e || t('err_line_qty', { n: i + 1 });
      else if (isNaN(pn) || pn < 0) e = e || t('err_line_price', { n: i + 1 });
      var line = { d: d, q: Math.round(qn * 100) / 100, p: r2(pn || 0) };
      if (pr && (BULK[pr] || find('products', pr))) line.prod = pr;
      lines.push(line);
    }
    if (!lines.length) e = e || t('err_lines');
    if (F.old) {
      var no = clean(F.no, 20);
      if (no && D.docs.some(function (d) { return d.id !== (old ? old.id : '') && d.type === F.dtype && String(d.no).toLowerCase() === no.toLowerCase(); })) e = e || t('err_doc_no_used', { no: no });
      if (!F.id && F.paidOld && !F.paidDate) e = e || t('err_date');
    }
    if (!q && !e && !(F.old && F.noStock)) {   // bottles sold come off the stock: check there are enough
      var want = {};
      lines.forEach(function (l) { if (l.prod) want[l.prod] = (want[l.prod] || 0) + l.q; });
      var hs0 = honeyStock('', '', old ? old.id : '');
      Object.keys(want).forEach(function (pid) {
        var have = pid === '__raw' ? hs0.raw : pid === '__done' ? hs0.done : productStock(pid, old ? old.id : '');
        if (want[pid] > have + 0.005) e = e || (BULK[pid] ? t('err_stock_l', { p: prodLabel(pid), l: fmtL(have) }) : t('err_stock', { p: prodLabel(pid), n: have }));
      });
    }
    var client = null, cid = F.client;
    if (cid === '__new') {
      var nm = clean(F.cName, 80);
      if (!nm) e = e || t('err_client_name');
      else {
        var same = D.clients.filter(function (c) { return c.name.toLowerCase() === nm.toLowerCase(); })[0];
        if (same) cid = same.id;
        else {
          client = { id: uid(), ts: Date.now(), name: nm, phone: clean(F.cPhone, 20), email: clean(F.cEmail, 80), addr: clean(F.cAddr, 120), town: clean(F.cTown, 60), code: clean(F.cCode, 10),
            postal: clean(F.cPostal, 80), vatNo: clean(F.cVat, 20), notes: '' };
          cid = client.id;
        }
      }
    } else if (!cid || !find('clients', cid)) e = e || t('err_client');
    var travel = null;
    if (F.travelOn) {
      var km = num(F.km), rt = num(F.kmRate);
      if (isNaN(km) || km <= 0) e = e || t('err_km');
      else if (isNaN(rt) || rt < 0) e = e || t('err_km_rate');
      else { travel = { km: Math.round(km * 10) / 10, rate: r2(rt) }; if (!D.settings.kmRate) D.settings.kmRate = r2(rt); }
    }
    if (q && F.valid && F.valid < F.date) e = e || t('err_valid');
    if (!q && F.due && F.due < F.date) e = e || t('err_due');
    if (!e) lines.forEach(function (l) {   // learn prices for services that have none yet
      D.settings.svcs.forEach(function (s) { if (!s.price && l.p && s.name.toLowerCase() === l.d.toLowerCase()) s.price = l.p; });
    });
    var rec = { type: F.dtype, no: old ? old.no : '', client: cid, job: clean(F.job, 100), site: clean(F.site, 120), lines: lines, travel: travel,
      vat: !!F.addVat, vatRate: vatRate(), notes: cleanMulti(F.notes, 800), status: old ? old.status : 'draft', pays: old ? old.pays || [] : [],
      from: old ? old.from || '' : (F.from || ''), inv: old ? old.inv || '' : '', sent: old ? old.sent || '' : '', show: (F.show || []).slice(), awr: clean(F.awr, 60) };
    rec.show = rec.show.filter(function (k) { return k !== 'awr' || rec.awr; });   // no AWR typed: switched off on the checklist
    if (F.old) {
      rec.old = true; rec.no = clean(F.no, 20) || (old ? old.no : ''); rec.noStock = !q && !!F.noStock;
      if (!old) { rec.status = q ? F.oldStatus || 'sent' : 'sent'; rec.sent = F.date; }
    }
    if (q) rec.valid = F.valid || ''; else { rec.due = F.due || ''; rec.cat = F.cat || 'services_in'; }
    if (!q && old && old.cat && old.cat !== rec.cat) D.money.forEach(function (m) { if (m.doc === old.id) m.cat = rec.cat; });
    return { e: e, rec: rec, client: client };
  }
  function saveSvc() {
    var name = clean(F.name, 120), p = clean(F.price) ? num(F.price) : 0;
    if (!name) { F.err = esc(t('err_name')); return render(); }
    if (isNaN(p) || p < 0) { F.err = esc(t('err_amount')); return render(); }
    var list = D.settings.svcs, x = F.id ? list.filter(function (s) { return s.id === F.id; })[0] : null;
    if (x) { x.name = name; x.price = r2(p); } else list.push({ id: uid(), name: name, price: r2(p) });
    save(); toast(t('saved')); closeSub();
  }
  function savePay() {
    var d = find('docs', F.doc);
    if (!d) return closeSub();
    var a = num(F.amt), x = docTotals(d), old = F.pid ? d.pays.filter(function (p) { return p.id === F.pid; })[0] : null;
    var room = r2(x.bal + (old ? old.amt : 0));
    if (isNaN(a) || a <= 0) { F.err = esc(t('err_amount')); return render(); }
    if (a > room + 0.005) { F.err = esc(t('err_overpay', { r: fmtR(room) })); return render(); }
    if (!F.date) { F.err = esc(t('err_date')); return render(); }
    var vat = d.vat ? r2(a * (d.vatRate || 15) / (100 + (d.vatRate || 15))) : 0;
    if (old) {
      old.amt = r2(a); old.date = F.date; old.method = F.method;
      var m = find('money', old.mid);
      if (m) { m.amt = r2(a); m.date = F.date; m.vat = vat; }
    } else {
      var pay = { id: uid(), date: F.date, amt: r2(a), method: F.method || 'eft', mid: uid() };
      (d.pays = d.pays || []).push(pay);
      D.money.push({ id: pay.mid, ts: Date.now(), date: F.date, dir: 'in', amt: pay.amt, cat: d.cat || 'services_in', desc: t('pay_desc', { no: d.no, job: d.job || '' }).replace(/ – $/, ''),
        party: clientName(d.client), ref: d.no, vat: vat, doc: d.id, pay: pay.id });
      if (d.status === 'draft') d.status = 'sent';
    }
    save();
    toast(docTotals(d).bal <= 0.005 ? t('paid_in_full') : t('saved'));
    closeSub();
  }
  function upsert(coll, rec) {
    var list = D[coll], i = list.findIndex(function (r) { return r.id === rec.id; });
    if (i > -1) list[i] = rec; else list.push(rec);
  }

  /* Delete -------------------------------------------------------------- */
  function deleteForm() {
    var k = F.kind;
    if (k === 'svc') {
      if (confirmKey !== 'del') { confirmKey = 'del'; return render(); }
      D.settings.svcs = D.settings.svcs.filter(function (s) { return s.id !== F.id; });
      save(); toast(t('deleted')); return closeSub();
    }
    if (k === 'pay') {
      if (confirmKey !== 'del') { confirmKey = 'del'; return render(); }
      var d = find('docs', F.doc), p = d && d.pays.filter(function (x) { return x.id === F.pid; })[0];
      if (p) { d.pays = d.pays.filter(function (x) { return x !== p; }); D.money = D.money.filter(function (m) { return m.id !== p.mid; }); }
      save(); toast(t('deleted')); return closeSub();
    }
    var coll = COLL[k], x = find(coll, F.id), err = '';
    if (k === 'client' && D.docs.some(function (dd) { return dd.client === F.id; })) err = t('err_client_used');
    if (k === 'product' && (D.bottling.some(function (b) { return b.product === F.id; }) || D.docs.some(function (dd) { return dd.lines.some(function (l) { return l.prod === F.id; }); }))) err = t('err_product_used');
    if (k === 'super' && x && x.dir === 'on' && superCount(x.hive) < x.n) err = t('err_super_del');
    if (k === 'process' && x && honeyStock(x.id).done < -0.005) err = t('err_litres_used');
    if (k === 'harvest' && x && x.litres && honeyStock().raw - x.litres < -0.005) err = t('err_litres_used');
    if (k === 'bottle' && x && productStock(x.product, '', x.id) < 0) err = t('err_bottles_sold');
    if (k === 'buy' && x && honeyStock('', '', '', x.id).raw < -0.005) err = t('err_litres_used');
    if (k === 'move' && x && D.moves.filter(function (m) { return m.hive === x.hive; }).sort(byDateDesc)[0] !== x) err = t('err_move_old');
    if (err) { F.err = esc(err); return render(); }
    if (k === 'doc' && x && (x.pays || []).length) F.delAgain = t('delete_doc_again', { n: x.pays.length });
    if (k === 'hive') { var n = D.insp.filter(function (r) { return r.hive === F.id; }).length; if (n) F.delAgain = t('delete_hive_again', { n: n }); }
    if (confirmKey !== 'del') { confirmKey = 'del'; return render(); }
    D[coll] = D[coll].filter(function (r) { return r.id !== F.id; });
    if (x && x.photo) photoDel(x.photo);
    if (k === 'money' && x && x.doc) { var dd = find('docs', x.doc); if (dd) dd.pays = (dd.pays || []).filter(function (p) { return p.mid !== x.id; }); }
    if (k === 'doc' && x) {
      var mids = (x.pays || []).map(function (p) { return p.mid; });
      D.money = D.money.filter(function (m) { return mids.indexOf(m.id) < 0; });
      D.docs.forEach(function (o) { if (o.inv === x.id) o.inv = ''; if (o.from === x.id) o.from = ''; });
    }
    if (k === 'buy' && x && x.mid) D.money = D.money.filter(function (m) { return m.id !== x.mid; });
    if (k === 'money' && x && x.buy) { var bb = find('buys', x.buy); if (bb) bb.mid = ''; }
    if (k === 'move' && x) { var hm = find('hives', x.hive); if (hm) { hm.place = x.from; hm.gps = x.fromGps || ''; } }
    if (k === 'hive') {
      ['insp', 'moves', 'supers'].forEach(function (c) { D[c] = D[c].filter(function (r) { return r.hive !== F.id; }); });
      D.care.forEach(function (r) { if (r.hive === F.id) r.hive = ''; });
      D.harvests.forEach(function (r) { r.takes = r.takes.filter(function (k2) { return k2.hive !== F.id; }); });
    }
    save(); toast(t('deleted'));
    closeSub();
  }

  /* Repeating entries: add any that are due (runs when the app opens) */
  function runRecurring() {
    var cur = today().slice(0, 7), dnow = new Date().getDate(), added = 0;
    D.recur.forEach(function (r) {
      if (!r.on) return;
      var m = addMonths(r.last || addMonths(cur, -1), 1), guard = 0;
      while (m <= cur && guard++ < 60) {
        if (m === cur && r.day > dnow) break;
        D.money.push({ id: uid(), ts: Date.now() + added, date: m + '-' + pad(r.day), dir: r.dir, amt: r.amt, cat: r.cat, desc: r.desc, party: r.party,
          ref: '', vat: D.settings.vat ? vatOf(r.amt, !!r.vatIncl) : 0, rid: r.id });
        r.last = m; added++;
        m = addMonths(m, 1);
      }
    });
    if (added) { save(); toast(t('recur_added', { n: added })); }
    return added;
  }

  /* Quote / invoice actions -------------------------------------------- */
  function setDocStatus(v) {
    var d = find('docs', F.id);
    if (!d) return;
    d.status = v;
    if (v === 'sent' && !d.sent) d.sent = today();
    save(); toast(t('ds_' + v)); render();
  }
  function toInvoice() {
    var q = find('docs', F.id);
    if (!q) return;
    var inv = { id: uid(), ts: Date.now(), type: 'i', no: nextNo('i'), date: today(), client: q.client, job: q.job, site: q.site,
      lines: JSON.parse(JSON.stringify(q.lines)), travel: q.travel ? Object.assign({}, q.travel) : null, vat: q.vat, vatRate: q.vatRate,
      due: addDays(today(), +D.settings.payDays || 7), cat: 'services_in', notes: '', status: 'draft', pays: [], from: q.id, inv: '', sent: '' };
    D.docs.push(inv);
    q.inv = inv.id; q.status = 'accepted';
    save(); toast(t('invoice_made', { no: inv.no }));
    goView('doc', { id: inv.id });
  }

  /* Quote / invoice PDF (layout like a printed business form) ----------- */
  function buildDocPdf(d) {
    var s = D.settings, x = docTotals(d), c = find('clients', d.client) || {}, q = d.type === 'q';
    var show = {}; (d.show || s.show || SHOW_DEFAULT).forEach(function (k) { show[k] = 1; });
    var P = FX.PDF, ACC = P.ACCENT, MUT = P.MUTED, INK = P.INK, LINE = P.LINE;
    var doc = new P({ footer: [s.biz || s.owner, s.phone, s.email].filter(Boolean).join('  ·  '), pageLabel: t('page') });
    var M = doc.M, W = doc.W, top = M, colW = 330;   // the form is 330 pt wide, the number/date block sits to its right
    // header: logo (and name), document title, number and date
    var ly = top;
    if (show.logo && (d.show || []).indexOf('logo2') < 0 && !d.showV) show.logo2 = 1;   // documents from before there were two logos
    // logo 1 in the middle at the top, logo 2 halfway between the middle and the left margin; they never overlap
    var L1 = show.logo && s.logo && s.logoW ? { u: s.logo, w: s.logoW, h: s.logoH } : null, L2 = show.logo2 && s.logo2 && s.logo2W ? { u: s.logo2, w: s.logo2W, h: s.logo2H } : null;
    var cx1 = W / 2, cx2 = (M + W / 2) / 2, gap = 10, maxH = 90;
    function fitBox(L, maxW) { var k = Math.min(maxW / L.w, maxH / L.h); L.dw = L.w * k; L.dh = L.h * k; }
    if (L1) fitBox(L1, 2 * (M + colW + 14 - gap - cx1));            // must stay clear of the number/date block on the right
    if (L2) fitBox(L2, 2 * (cx2 - M));                               // must stay inside the left margin
    if (L1 && L2) {
      var room = cx1 - cx2 - gap, need = L1.dw / 2 + L2.dw / 2;
      if (need > room) { var f = room / need; [L1, L2].forEach(function (L) { L.dw *= f; L.dh *= f; }); }
    }
    var hTop = Math.max(L1 ? L1.dh : 0, L2 ? L2.dh : 0);   // both logos centred on the same line
    if (L1) doc.image(L1.u, L1.w, L1.h, cx1 - L1.dw / 2, top + (hTop - L1.dh) / 2, L1.dw, L1.dh);
    if (L2) doc.image(L2.u, L2.w, L2.h, cx2 - L2.dw / 2, top + (hTop - L2.dh) / 2, L2.dw, L2.dh);
    if (L1 || L2) {
      ly = top + Math.max(L1 ? L1.dh : 0, L2 ? L2.dh : 0) + 6;
    } else {
      doc.text(M, top + 24, s.biz || s.owner || '', 22, true, ACC, 'l', colW);
      ly = top + 34;
    }
    doc.text(W - M, top + 22, docTitle(d).toUpperCase(), 20, true, ACC, 'r');
    var rx = M + colW + 14, ry = Math.max(top + 46, ly - 34);
    var head = [[t(q ? 'quote_no' : 'invoice_no'), d.no], [t('date'), shortDate(d.date)]];
    if (show.dates2) head.push(q ? [t('valid_until'), shortDate(d.valid)] : [t('due_date'), shortDate(d.due)]);
    head.forEach(function (r) {
      if (!r[1]) return;
      doc.text(rx, ry, r[0], 9.5, false, MUT);
      doc.text(W - M, ry, r[1], 9.5, true, INK, 'r');
      doc.hline(rx, W - M, ry + 4, LINE, 0.6);
      ry += 16;
    });
    doc.y = Math.max(ly, ry) + 6;
    // client box: label | value rows
    var rows = [[t('client') + ':', c.name || '?', true]];
    if (show.c_addr && c.addr) rows.push([t('address') + ':', c.addr]);
    if (show.c_town && (c.town || c.code)) rows.push([t('town') + ':', [c.town, c.code].filter(Boolean).join('  ')]);
    if (show.c_postal && c.postal) rows.push([t('postal') + ':', c.postal]);
    if (show.c_phone && c.phone) rows.push([t('contact_no') + ':', c.phone]);
    if (show.c_email && c.email) rows.push([t('email') + ':', c.email]);
    if (show.c_vat && c.vatNo) rows.push([t('vat_no') + ':', c.vatNo]);
    if (show.awr && d.awr) rows.push([t('order_no') + ':', d.awr]);
    if (show.site && d.site) rows.push([t('site') + ':', d.site]);
    var lab = 90, y0 = doc.y;
    rows.forEach(function (r) {   // every value wraps onto more lines so nothing is cut off; the client's name is 2 pt bigger and bold
      var sz = r[2] ? 11.5 : 9.5, lh = r[2] ? 14 : 12, ls = P.wrap(String(r[1]), colW - lab - 10, sz, !!r[2]);
      var h = (r[2] ? 10 : 5) + ls.length * lh;
      doc.text(M + 5, doc.y + (r[2] ? 15 : 12), r[0], 9.5, false, INK);
      ls.forEach(function (l, i) { doc.text(M + lab + (colW - lab) / 2, doc.y + (r[2] ? 15 : 12) + i * lh, l, sz, !!r[2], INK, 'c'); });
      doc.y += h;
      doc.hline(M, M + colW, doc.y, INK, 0.5);
    });
    doc.hline(M, M + colW, y0, INK, 0.8);
    doc.vline(M, y0, doc.y, INK, 0.8); doc.vline(M + lab, y0, doc.y, INK, 0.5); doc.vline(M + colW, y0, doc.y, INK, 0.8);
    doc.y += 16;
    // job description
    if (show.job && d.job) {
      doc.text(M, doc.y + 10, t('job_desc') + ':', 9.5, false, INK);
      P.wrap(d.job, colW - lab, 9.5, false).forEach(function (l, i) { doc.text(M + lab + (colW - lab) / 2, doc.y + 10 + i * 12, l, 9.5, false, INK, 'c'); });
      doc.y += 10 + Math.max(1, P.wrap(d.job, colW - lab, 9.5, false).length) * 12 - 6;
      doc.hline(M, M + colW, doc.y, INK, 0.6); doc.hline(M, M + colW, doc.y + 2.5, INK, 0.6);
      doc.y += 16;
    }
    // items
    var items = d.lines.map(function (l) { return [l.d, fmtQ(l.q), fmtR(l.p), fmtR(r2(l.q * l.p))]; });
    if (d.travel) items.push([t('travel_line', { km: fmtQ(d.travel.km) }), fmtQ(d.travel.km), fmtR(d.travel.rate), fmtR(r2(d.travel.km * d.travel.rate))]);
    doc.table([{ h: t('description'), wrap: true }, { h: t('qty'), w: 50, a: 'r' }, { h: t(d.vat ? 'unit_price_excl' : 'price_r'), w: 92, a: 'r' }, { h: t('total_r'), w: 96, a: 'r' }], items, { size: 9.5 });
    function trow(label, val, bold) {
      doc.ensure(18);
      doc.text(W - M - 110, doc.y + 11, label, bold ? 11 : 9.5, !!bold, bold ? INK : MUT, 'r');
      doc.text(W - M, doc.y + 11, val, bold ? 11 : 9.5, !!bold, INK, 'r');
      doc.y += bold ? 19 : 15;
    }
    doc.y -= 4;
    trow(t('subtotal'), fmtR(x.sub));
    if (d.vat) trow(t('vat_pct', { r: fmtNum(d.vatRate || 15, (d.vatRate || 15) % 1 ? 1 : 0) }), fmtR(x.vat));
    doc.hline(W - M - 240, W - M, doc.y + 2, INK, 0.8); doc.y += 5;
    trow(t('total'), fmtR(x.total), true);
    if (!q && show.paid && x.paid) { trow(t('paid'), fmtR(x.paid)); trow(t('balance_due'), fmtR(x.bal), true); }
    if (q && show.deposit && Number(s.deposit) > 0) trow(t('deposit_line', { p: s.deposit }), fmtR(r2(x.total * s.deposit / 100)));
    doc.y += 8;
    function block(title, lines) {
      lines = lines.filter(function (l) { return l && l[0]; });
      if (!lines.length) return;
      doc.ensure(40 + lines.length * 13);
      doc.text(M + colW / 2, doc.y + 12, title, 12, false, INK, 'c');
      doc.y += 18;
      doc.hline(M, M + colW, doc.y, INK, 0.6); doc.hline(M, M + colW, doc.y + 2.5, INK, 0.6);
      doc.y += 4;
      lines.forEach(function (l) { doc.text(M, doc.y + 11, l[0], 9.5, !!l[1], INK, 'l', W - 2 * M); doc.y += 13.5; });
      doc.y += 10;
    }
    if (show.bank && s.bankAcc) block(t('banking_details'), [[s.bankHolder || s.biz, true], [[s.bankName, s.bankType].filter(Boolean).join(' – ')],
      [t('acc_no') + ': ' + s.bankAcc], [s.bankBranch ? t('branch_code') + ': ' + s.bankBranch : ''], [t('pay_ref') + ': ' + d.no]]);
    if (show.info) block(t('info'), [[[s.owner, s.phone].filter(Boolean).join('    '), true], [s.email], [String(s.addr || '').split('\n').map(clean).filter(Boolean).join(', ')],
      [show.vat_no && s.vat && s.vatNo ? t('vat_no') + ': ' + s.vatNo : ''], [show.reg_no && s.regNo ? t('reg_no_short') + ': ' + s.regNo : '']]);
    if (show.notes && d.notes) { doc.heading(t('notes')); String(d.notes).split('\n').forEach(function (l) { if (clean(l)) doc.note(l); }); }
    if (show.terms && s.terms) { doc.heading(t('terms')); String(s.terms).split('\n').forEach(function (l) { if (clean(l)) doc.note(l); }); }
    return doc.blob();
  }
  function docFile(d) {
    var nm = (clientName(d.client) || '').replace(/[\\\/:*?"<>|]+/g, ' ').trim();
    return (d.no + ' ' + nm).trim() + '.pdf';
  }
  function exportDoc(share) {
    var d = find('docs', F.id);
    if (!d) return;
    try {
      deliver(buildDocPdf(d), docFile(d), share);
      if (d.status === 'draft') { d.status = 'sent'; d.sent = today(); save(); render(); }
    } catch (e) { console.error(e); toast(t('export_failed') + ' ' + e.message); }
  }

  /* ================================================================ */
  /* Reports & export                                                  */
  /* ================================================================ */
  function openReports() {
    var p = presets()[2];
    openSub('reports', { preset: 2, from: p[1], to: p[2] });
  }
  function reportsScreen() {
    var s = summary(F.from, F.to), vat = D.settings.vat;
    var h = '<div class="card"><strong>' + esc(t('period')) + '</strong><div class="chips" style="margin-top:10px">' +
      presets().map(function (p, i) { return '<button class="chip' + (F.preset === i ? ' on' : '') + '" data-preset="' + i + '">' + esc(t(p[0])) + '</button>'; }).join('') + '</div>' +
      '<div class="two">' + fld(t('from'), inp('from', { type: 'date' })) + fld(t('to'), inp('to', { type: 'date' })) + '</div>' +
      '<div class="muted" style="margin-top:10px">' + esc(periodText(F.from, F.to)) + '</div></div>';
    h += '<div class="card" id="rsum">' + reportSummaryHtml(s, vat) + '</div>';
    h += honeyCard();
    var none = !hasAny(s);
    h += '<div class="card"><strong>' + esc(t('export')) + '</strong><p class="muted" style="margin:6px 0 14px">' + esc(t('export_sub')) + '</p><div class="stack">' +
      '<button class="primary" data-act="xls"' + (none ? ' disabled' : '') + '>' + ico(IC.down) + esc(t('save_excel')) + '</button>' +
      '<button class="primary" data-act="pdf"' + (none ? ' disabled' : '') + '>' + ico(IC.down) + esc(t('save_pdf')) + '</button>' +
      (canShare ? '<div class="two"><button class="secondary" data-act="shareXls"' + (none ? ' disabled' : '') + '>' + ico(IC.share, 18) + esc(t('share_excel')) + '</button>' +
        '<button class="secondary" data-act="sharePdf"' + (none ? ' disabled' : '') + '>' + ico(IC.share, 18) + esc(t('share_pdf')) + '</button></div>' : '') +
      '</div>' + (none ? '<p class="muted" style="margin:12px 0 0">' + esc(t('nothing_in_period')) + '</p>' : '') + '</div>';
    h += backupCard();
    app.innerHTML = h;
  }
  function backupCard() {
    return '<div class="card"><strong>' + esc(t('backup')) + '</strong><p class="muted" style="margin:6px 0 14px">' + esc(t('backup_sub')) + '</p>' +
      '<div class="two"><button class="secondary" data-act="backup">' + esc(t('backup_now')) + '</button><button class="secondary" data-act="restorePick">' + esc(t('restore_backup')) + '</button></div>' +
      '<div class="muted" style="margin-top:10px">' + esc(D.settings.lastBackup ? t('backup_last', { d: shortDate(D.settings.lastBackup) }) : t('backup_never')) + '</div></div>';
  }
  function hasAny(s) { return !!(tripsIn(F.from, F.to).length + s.money.length + s.fuel.length + s.diary.length + s.insp.length + s.harvests.length + s.care.length + s.docs.length + s.pays.length + s.moves.length + s.supers.length + s.process.length + s.bottling.length); }
  function photoMark(x) { return x.photo ? t('yes') : x.photoLater ? t('photo_later_short') : ''; }
  function owedNow() { return owing().reduce(function (a, d) { return a + docTotals(d).bal; }, 0); }
  function reportSummaryHtml(s, vat) {
    var h = '<strong>' + esc(t('summary')) + '</strong><div class="stats">' + stat(t('income'), fmtR(s.inT), 'pos') +
      stat(s.fuelT ? t('expenses_incl_fuel') : t('expenses'), fmtR(s.outAll), 'neg') + stat(t('net'), fmtR(s.net), s.net >= 0 ? 'pos' : 'neg') + '</div>';
    var rows = [];
    if (s.boughtL) rows.push([t('raw_bought_total'), fmtL(s.boughtL) + ' · ' + fmtR(s.boughtR)]);
    if (vat) rows.push([t('vat_out'), fmtR(s.vatOut)], [t('vat_in'), fmtR(s.vatIn)], [t('vat_net'), fmtR(s.vatOut - s.vatIn)]);
    var hs = honeyStock();
    rows.push([t('supers_harvested'), String(s.supersTaken)], [t('raw_harvested'), fmtL(s.rawL)], [t('processed_made'), fmtL(s.procOut)], [t('bottled_litres'), fmtL(s.bottledL)],
      [t('raw_honey') + ' (' + t('now') + ')', fmtL(hs.raw)], [t('processed_honey') + ' (' + t('now') + ')', fmtL(hs.done)],
      [t('active_hives_now'), String(activeHives().length)], [t('supers_on_hives'), String(supersOnHives())], [t('inspections'), String(s.insp.length)],
      [t('quoted'), fmtR(s.quoted)], [t('invoiced'), fmtR(s.invoiced)], [t('received_from_clients'), fmtR(s.received)], [t('owed_now'), fmtR(owedNow())]);
    if (s.fuel.length || D.settings.fuelOn) rows.push([t('diesel'), fmtL(s.dL) + ' · ' + fmtR(s.dAmt)], [t('petrol'), fmtL(s.pL) + ' · ' + fmtR(s.pAmt)]);
    rows.push([t('diary_entries'), String(s.diary.length)]);
    h += '<table class="kv">' + rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>';
    return h;
  }
  function fileBase() {
    var biz = (D.settings.biz || D.settings.owner || 'ByeBoer').replace(/[\\\/:*?"<>|]+/g, ' ').trim();
    return 'ByeBoer ' + biz + ' ' + (F.from || F.to ? (F.from || 'start') + ' to ' + (F.to || today()) : 'all ' + today());
  }
  function hiveTaken(hid, from, to) { var n = 0; D.harvests.forEach(function (r) { if (inRange(r.date, from, to)) r.takes.forEach(function (k) { if (k.hive === hid) n += k.n; }); }); return n; }
  function prodName(id) { var p = find('products', id); return p ? p.name : '?'; }

  function buildExcel() {
    var s = summary(F.from, F.to), vat = D.settings.vat;
    var M = function (v) { return { v: r2(v), f: 'money' }; }, N1 = function (v) { return { v: v, f: 'num1' }; };
    var sumRows = [];
    sumRows.push({ c: [D.settings.biz || 'ByeBoer'], sec: true });
    sumRows.push([t('period'), periodText(F.from, F.to)]);
    if (D.settings.owner) sumRows.push([t('your_name'), D.settings.owner]);
    if (D.settings.regNo) sumRows.push([t('reg_no'), D.settings.regNo]);
    if (vat && D.settings.vatNo) sumRows.push([t('vat_no'), D.settings.vatNo]);
    sumRows.push([t('generated'), shortDate(today())]);
    sumRows.push([]);
    sumRows.push({ c: [t('income')], sec: true });
    Object.keys(s.cin).sort().forEach(function (c) { sumRows.push([catLabel(c), M(s.cin[c])]); });
    sumRows.push({ c: [t('total_income'), M(s.inT)], b: true });
    sumRows.push([]);
    sumRows.push({ c: [t('expenses')], sec: true });
    Object.keys(s.cout).sort().forEach(function (c) { sumRows.push([catLabel(c), M(s.cout[c])]); });
    if (s.dAmt) sumRows.push([t('fuel_diesel'), M(s.dAmt)]);
    if (s.pAmt) sumRows.push([t('fuel_petrol'), M(s.pAmt)]);
    sumRows.push({ c: [t('total_expenses'), M(s.outAll)], b: true });
    sumRows.push([]);
    sumRows.push({ c: [t('net'), M(s.net)], b: true });
    if (vat) {
      sumRows.push([]);
      sumRows.push({ c: [t('vat')], sec: true });
      sumRows.push([t('vat_out'), M(s.vatOut)], [t('vat_in'), M(s.vatIn)], { c: [t('vat_net'), M(s.vatOut - s.vatIn)], b: true });
    }
    sumRows.push([]);
    sumRows.push({ c: [t('quotes_invoices')], sec: true });
    sumRows.push([t('quoted'), M(s.quoted)], [t('invoiced'), M(s.invoiced)], [t('received_from_clients'), M(s.received)], [t('owed_now'), M(owedNow())]);
    sumRows.push([]);
    sumRows.push({ c: [t('tab_honey')], sec: true });
    var hs = honeyStock();
    sumRows.push([t('harvests_n'), { v: s.harvests.length, f: 'int' }], [t('supers_harvested'), { v: s.supersTaken, f: 'int' }], [t('raw_harvested') + ' (L)', N1(s.rawL)],
      [t('raw_used') + ' (L)', N1(s.procIn)], [t('processed_made') + ' (L)', N1(s.procOut)], [t('bottled_litres') + ' (L)', N1(s.bottledL)],
      { c: [t('raw_honey') + ' – ' + t('now') + ' (L)', N1(hs.raw)], b: true }, { c: [t('processed_honey') + ' – ' + t('now') + ' (L)', N1(hs.done)], b: true });
    D.products.slice().sort(byName).forEach(function (p) { sumRows.push([p.name + ' – ' + t('bottled_n'), { v: s.bottles[p.id] || 0, f: 'int' }], [p.name + ' – ' + t('in_stock'), { v: productStock(p.id), f: 'int' }]); });
    sumRows.push([]);
    sumRows.push({ c: [t('hives')], sec: true });
    sumRows.push({ c: [t('active_hives_now'), { v: activeHives().length, f: 'int' }], b: true }, [t('supers_on_hives'), { v: supersOnHives(), f: 'int' }], [t('inspections'), { v: s.insp.length, f: 'int' }]);
    if (s.fuel.length) {
      sumRows.push([]);
      sumRows.push({ c: [t('fuel')], sec: true });
      sumRows.push([t('diesel_litres'), N1(s.dL)], [t('petrol_litres'), N1(s.pL)]);
    }
    var sheets = [{ name: t('summary'), plain: true, cols: [{ w: 44, f: 'text' }, { w: 24, f: 'money' }], rows: sumRows }];

    var mCols = [{ h: t('date'), w: 12, f: 'date' }, { h: t('type'), w: 10 }, { h: t('category'), w: 30 }, { h: t('description'), w: 34 }, { h: t('party_col'), w: 24 },
      { h: t('reference'), w: 14 }, { h: t('income_r'), w: 15, f: 'money' }, { h: t('expense_r'), w: 15, f: 'money' }];
    if (vat) mCols.push({ h: t('vat_r'), w: 13, f: 'money' }, { h: t('excl_vat_r'), w: 15, f: 'money' });
    mCols.push({ h: t('slip_photo'), w: 12 });
    sheets.push({ name: t('sheet_money'), cols: mCols, sumCols: vat ? [6, 7, 8, 9] : [6, 7], totalLabel: t('total'), rows: s.money.map(function (m) {
      var r = [m.date, m.dir === 'in' ? t('income') : t('expense'), catLabel(m.cat), m.desc, m.party, m.ref, m.dir === 'in' ? m.amt : null, m.dir === 'out' ? m.amt : null];
      if (vat) r.push(m.vat || 0, r2(m.amt - (m.vat || 0)));
      r.push(photoMark(m));
      return r;
    }) });
    if (s.fuel.length || D.settings.fuelOn) {
      var fCols = [{ h: t('date'), w: 12, f: 'date' }, { h: t('fuel'), w: 10 }, { h: t('litres'), w: 11, f: 'num2' }, { h: t('amount_r'), w: 15, f: 'money' },
        { h: t('r_per_litre'), w: 12, f: 'money' }, { h: t('used_for'), w: 22 }, { h: t('vehicle'), w: 22 }, { h: t('supplier'), w: 20 }, { h: t('reference'), w: 14 }];
      if (vat) fCols.push({ h: t('vat_r'), w: 13, f: 'money' });
      fCols.push({ h: t('slip_photo'), w: 12 });
      sheets.push({ name: t('fuel'), cols: fCols, sumCols: vat ? [2, 3, 9] : [2, 3], totalLabel: t('total'), rows: s.fuel.map(function (f) {
        var r = [f.date, t(f.kind), f.l, f.amt, f.l ? r2(f.amt / f.l) : null, t('use_' + f.use), f.mach, f.sup, f.ref];
        if (vat) r.push(f.vat || 0);
        r.push(photoMark(f));
        return r;
      }) });
    }
    sheets.push({ name: t('sheet_docs'), cols: [{ h: t('number'), w: 12 }, { h: t('type'), w: 12 }, { h: t('date'), w: 12, f: 'date' }, { h: t('client'), w: 24 }, { h: t('job'), w: 32 },
      { h: t('status'), w: 14 }, { h: t('subtotal'), w: 14, f: 'money' }, { h: t('vat_r'), w: 12, f: 'money' }, { h: t('total'), w: 14, f: 'money' }, { h: t('paid'), w: 14, f: 'money' },
      { h: t('balance_due'), w: 14, f: 'money' }, { h: t('due_valid'), w: 13, f: 'date' }, { h: t('order_no'), w: 14 }],
      rows: s.docs.map(function (d) { var x = docTotals(d); return [d.no, d.type === 'q' ? t('quote') : t('invoice'), d.date, clientName(d.client), d.job, t('ds_' + docStatus(d)), x.sub, x.vat, x.total,
        d.type === 'i' ? x.paid : null, d.type === 'i' ? x.bal : null, d.type === 'q' ? d.valid : d.due, d.awr || '']; }) });
    sheets.push({ name: t('payments'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('invoice'), w: 12 }, { h: t('client'), w: 26 }, { h: t('pay_method'), w: 14 }, { h: t('amount_r'), w: 15, f: 'money' }],
      sumCols: [4], totalLabel: t('total'), rows: s.pays.map(function (r) { return [r.p.date, r.d.no, clientName(r.d.client), t('pm_' + (r.p.method || 'eft')), r.p.amt]; }) });
    sheets.push({ name: t('clients'), cols: [{ h: t('client_name'), w: 26 }, { h: t('phone'), w: 16 }, { h: t('email'), w: 26 }, { h: t('address'), w: 36, f: 'wrap' }, { h: t('town'), w: 18 }, { h: t('town_code'), w: 9 }, { h: t('vat_no'), w: 14 },
      { h: t('invoiced'), w: 14, f: 'money' }, { h: t('owes'), w: 14, f: 'money' }],
      rows: D.clients.slice().sort(byName).map(function (c) {
        var inv = D.docs.filter(function (d) { return d.client === c.id && d.type === 'i'; });
        return [c.name, c.phone, c.email, c.addr, c.town || '', c.code || '', c.vatNo, inv.reduce(function (a, d) { return a + docTotals(d).total; }, 0), inv.reduce(function (a, d) { return a + Math.max(0, docTotals(d).bal); }, 0)];
      }) });
    sheets.push({ name: t('hives'), cols: [{ h: t('hive_no'), w: 10 }, { h: t('place'), w: 24 }, { h: t('gps'), w: 22 }, { h: t('supers_now'), w: 10, f: 'int' }, { h: t('hive_type'), w: 16 },
      { h: t('source'), w: 16 }, { h: t('started'), w: 12, f: 'date' }, { h: t('status'), w: 12 }, { h: t('queen'), w: 16 }, { h: t('last_insp'), w: 13, f: 'date' },
      { h: t('supers_harvested'), w: 12, f: 'int' }, { h: t('notes'), w: 30, f: 'wrap' }],
      rows: D.hives.slice().sort(hiveSort).map(function (x) { var li = lastInsp(x.id); return [x.no, x.place, x.gps, superCount(x.id), t('ht_' + x.type), t('hsrc_' + x.source), x.date, t('hs_' + x.status),
        [x.queenYear, x.queenMark].filter(Boolean).join(' '), li ? li.date : '', hiveTaken(x.id, F.from, F.to) || null, x.notes]; }) });
    sheets.push({ name: t('sheet_moves'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('hive'), w: 10 }, { h: t('moved_from'), w: 26 }, { h: t('moved_to'), w: 26 }, { h: t('gps'), w: 22 }, { h: t('notes'), w: 30, f: 'wrap' }],
      rows: s.moves.map(function (x) { return [x.date, (find('hives', x.hive) || {}).no, x.from, x.to, x.toGps, x.notes]; }) });
    sheets.push({ name: t('sheet_supers'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('hive'), w: 10 }, { h: t('what_done'), w: 22 }, { h: t('supers_col'), w: 10, f: 'int' }, { h: t('notes'), w: 30, f: 'wrap' }],
      rows: s.supers.map(function (x) { return [x.date, (find('hives', x.hive) || {}).no, t(x.dir === 'off' ? 'supers_off' : 'supers_on'), x.n, x.notes]; })
        .concat(s.harvests.reduce(function (a, r) { return a.concat(r.takes.map(function (k) { return [r.date, (find('hives', k.hive) || {}).no, t('kind_harvest'), k.n, '']; })); }, []))
        .sort(function (a, b) { return a[0].localeCompare(b[0]); }) });
    sheets.push({ name: t('inspections'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('hive'), w: 10 }, { h: t('place'), w: 18 }, { h: t('queen'), w: 14 }, { h: t('brood'), w: 13 },
      { h: t('stores'), w: 12 }, { h: t('temper'), w: 12 }, { h: t('frames_bees'), w: 10, f: 'num1' }, { h: t('problems'), w: 30, f: 'wrap' }, { h: t('notes'), w: 34, f: 'wrap' }, { h: t('next_insp'), w: 13, f: 'date' }],
      rows: s.insp.map(function (x) { var hv = find('hives', x.hive) || {}; return [x.date, hv.no, hv.place, t('qs_' + x.queen), t('br_' + x.brood), t('st_' + x.stores), t('tm_' + x.temper),
        x.frames || null, (x.probs || []).map(function (p) { return t('pr_' + p); }).join(', '), x.notes, x.next]; }) });
    sheets.push({ name: t('harvests'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('hives'), w: 40, f: 'wrap' }, { h: t('supers_col'), w: 10, f: 'int' }, { h: t('raw_litres'), w: 14, f: 'num1' },
      { h: t('notes'), w: 34, f: 'wrap' }], sumCols: [2, 3], totalLabel: t('total'),
      rows: s.harvests.map(function (x) { return [x.date, x.takes.map(function (k) { return (find('hives', k.hive) || {}).no + ' (' + k.n + ')'; }).join(', '), harvestSupers(x),
        x.litres == null ? null : x.litres, x.notes]; }) });
    sheets.push({ name: t('sheet_process'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('raw_used'), w: 16, f: 'num1' }, { h: t('processed_got'), w: 16, f: 'num1' }, { h: t('notes'), w: 34, f: 'wrap' }],
      sumCols: [1, 2], totalLabel: t('total'), rows: s.process.map(function (x) { return [x.date, x.from, x.out, x.notes]; }) });
    sheets.push({ name: t('sheet_bottling'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('product'), w: 24 }, { h: t('bottles_n'), w: 12, f: 'int' }, { h: t('litres_used'), w: 14, f: 'num1' }, { h: t('notes'), w: 30, f: 'wrap' }],
      sumCols: [2, 3], totalLabel: t('total'), rows: s.bottling.map(function (x) { return [x.date, prodName(x.product), x.n, x.litres, x.notes]; }) });
    sheets.push({ name: t('products'), cols: [{ h: t('product_name'), w: 24 }, { h: t('litres_per_bottle'), w: 14, f: 'num2' }, { h: t('price_r'), w: 12, f: 'money' }, { h: t('in_stock'), w: 12, f: 'int' }],
      rows: D.products.slice().sort(byName).map(function (p) { return [p.name, p.size || null, p.price || null, productStock(p.id)]; }) });
    sheets.push({ name: t('sheet_care'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('what_done'), w: 18 }, { h: t('hive'), w: 14 }, { h: t('product'), w: 22 },
      { h: t('how_much'), w: 16 }, { h: t('next_due'), w: 13, f: 'date' }, { h: t('notes'), w: 30, f: 'wrap' }],
      rows: s.care.map(function (x) { return [x.date, t('ct_' + x.type), x.hive ? (find('hives', x.hive) || {}).no : t('all_hives_short'), x.product, x.qty, x.next, x.notes]; }) });
    var tl = tripsIn(F.from, F.to);
    if (tl.length) sheets.push(tripSheet(tl));
    sheets.push({ name: t('tab_diary'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('tags'), w: 20, f: 'wrap' }, { h: t('entry'), w: 90, f: 'wrap' }],
      rows: s.diary.map(function (d) { return [d.date, (d.tags || []).map(function (g) { return t('tag_' + g); }).join(', '), d.text]; }) });
    return FX.xlsx(sheets);
  }

  function buildPdf() {
    var s = summary(F.from, F.to), vat = D.settings.vat;
    var doc = new FX.PDF({ footer: 'ByeBoer · ' + (D.settings.biz || '') + ' · ' + periodText(F.from, F.to), pageLabel: t('page') });
    var subs = [t('period') + ': ' + periodText(F.from, F.to)];
    if (D.settings.owner) subs.push(D.settings.owner + (vat && D.settings.vatNo ? ' · ' + t('vat_no') + ' ' + D.settings.vatNo : '') + (D.settings.regNo ? ' · ' + t('reg_no_short') + ' ' + D.settings.regNo : ''));
    subs.push(t('generated') + ': ' + shortDate(today()));
    if (D.settings.logo && D.settings.logoW) {
      var k = Math.min(110 / D.settings.logoW, 46 / D.settings.logoH);
      doc.image(D.settings.logo, D.settings.logoW, D.settings.logoH, doc.W - doc.M - D.settings.logoW * k, doc.M, D.settings.logoW * k, D.settings.logoH * k);
    }
    doc.title((D.settings.biz || 'ByeBoer') + ' – ' + t('biz_report'), subs);

    doc.heading(t('summary'));
    doc.kv([[t('total_income'), fmtR(s.inT)], [t('total_expenses'), fmtR(s.outAll)], [t('net'), fmtR(s.net), true]]);
    var cin = Object.keys(s.cin).sort(function (a, b) { return s.cin[b] - s.cin[a]; });
    doc.heading(t('income_by_cat'));
    doc.table([{ h: t('category') }, { h: t('amount_r'), w: 110, a: 'r' }], cin.map(function (c) { return [catLabel(c), fmtR(s.cin[c])]; }), { total: [t('total'), fmtR(s.inT)], empty: t('none') });
    var cout = Object.keys(s.cout).sort(function (a, b) { return s.cout[b] - s.cout[a]; }).map(function (c) { return [catLabel(c), s.cout[c]]; });
    if (s.dAmt) cout.push([t('fuel_diesel'), s.dAmt]);
    if (s.pAmt) cout.push([t('fuel_petrol'), s.pAmt]);
    doc.heading(t('expenses_by_cat'));
    doc.table([{ h: t('category') }, { h: t('amount_r'), w: 110, a: 'r' }], cout.map(function (c) { return [c[0], fmtR(c[1])]; }), { total: [t('total'), fmtR(s.outAll)], empty: t('none') });
    if (vat) {
      doc.heading(t('vat'));
      doc.kv([[t('vat_out'), fmtR(s.vatOut)], [t('vat_in'), fmtR(s.vatIn)], [t('vat_net'), fmtR(s.vatOut - s.vatIn), true]]);
      doc.note(t('vat_note'));
    }
    doc.heading(t('quotes_invoices'));
    doc.kv([[t('quoted'), fmtR(s.quoted)], [t('invoiced'), fmtR(s.invoiced)], [t('received_from_clients'), fmtR(s.received)], [t('owed_now'), fmtR(owedNow()), true]]);
    var ow = owing();
    if (ow.length) doc.table([{ h: t('invoice'), w: 70 }, { h: t('client') }, { h: t('date'), w: 66 }, { h: t('due_date'), w: 66 }, { h: t('balance_due'), w: 90, a: 'r' }],
      ow.sort(byDateAsc).map(function (d) { return [d.no, clientName(d.client), shortDate(d.date), shortDate(d.due), fmtR(docTotals(d).bal)]; }), { size: 8.5 });

    doc.heading(t('tab_honey'));
    var hs2 = honeyStock();
    doc.kv([[t('harvests_n'), String(s.harvests.length)], [t('supers_harvested'), String(s.supersTaken)], [t('raw_harvested'), fmtL(s.rawL)], [t('processed_made'), fmtL(s.procOut)],
      [t('bottled_litres'), fmtL(s.bottledL)], [t('raw_honey') + ' (' + t('now') + ')', fmtL(hs2.raw), true], [t('processed_honey') + ' (' + t('now') + ')', fmtL(hs2.done), true]]);
    if (D.products.length) doc.table([{ h: t('product') }, { h: t('bottled_n'), w: 90, a: 'r' }, { h: t('in_stock'), w: 90, a: 'r' }],
      D.products.slice().sort(byName).map(function (p) { return [p.name, String(s.bottles[p.id] || 0), String(productStock(p.id))]; }), { size: 8.5 });

    doc.heading(t('hives'));
    var byPlace = {};
    activeHives().forEach(function (h) { var k = h.place || t('no_place'); var b = byPlace[k] || (byPlace[k] = { n: 0, s: 0 }); b.n++; b.s += superCount(h.id); });
    doc.table([{ h: t('place') }, { h: t('active_hives'), w: 90, a: 'r' }, { h: t('supers_on_hives'), w: 100, a: 'r' }],
      Object.keys(byPlace).sort().map(function (k) { return [k, String(byPlace[k].n), String(byPlace[k].s)]; }),
      { total: [t('total'), String(activeHives().length), String(supersOnHives())], empty: t('none') });

    if (s.docs.length) {
      doc.heading(t('sheet_docs'));
      doc.table([{ h: t('number'), w: 62 }, { h: t('date'), w: 58 }, { h: t('client'), wrap: true }, { h: t('status'), w: 70 }, { h: t('total'), w: 78, a: 'r' }, { h: t('balance_due'), w: 78, a: 'r' }],
        s.docs.map(function (d) { var x = docTotals(d); return [d.no, shortDate(d.date), clientName(d.client) + (d.job ? ' – ' + d.job : ''), t('ds_' + docStatus(d)), fmtR(x.total), d.type === 'i' ? fmtR(x.bal) : '']; }), { size: 8 });
    }
    if (s.money.length) {
      doc.heading(t('sheet_money'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('description'), wrap: true }, { h: t('category'), w: 120 }, { h: t('income_r'), w: 72, a: 'r' }, { h: t('expense_r'), w: 72, a: 'r' }],
        s.money.map(function (m) { return [shortDate(m.date), (m.desc || catLabel(m.cat)) + (m.party ? ' – ' + m.party : ''), catLabel(m.cat), m.dir === 'in' ? fmtR(m.amt) : '', m.dir === 'out' ? fmtR(m.amt) : '']; }),
        { size: 8, total: [t('total'), '', '', fmtR(s.inT), fmtR(s.outT)] });
    }
    if (s.fuel.length) {
      doc.heading(t('fuel'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('fuel'), w: 58 }, { h: t('litres'), w: 50, a: 'r' }, { h: t('amount_r'), w: 72, a: 'r' }, { h: t('used_for'), w: 110 }, { h: t('vehicle') }],
        s.fuel.map(function (f) { return [shortDate(f.date), t(f.kind), fmtNum(f.l, f.l % 1 ? 1 : 0), fmtR(f.amt), t('use_' + f.use), f.mach]; }),
        { size: 8, total: [t('total'), '', fmtNum(s.dL + s.pL, (s.dL + s.pL) % 1 ? 1 : 0), fmtR(s.fuelT), '', ''] });
    }
    if (s.harvests.length) {
      doc.heading(t('harvest_list'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('hives'), wrap: true }, { h: t('supers_col'), w: 56, a: 'r' }, { h: t('raw_litres'), w: 80, a: 'r' }],
        s.harvests.map(function (x) { return [shortDate(x.date), x.takes.map(function (k) { return (find('hives', k.hive) || {}).no + ' (' + k.n + ')'; }).join(', '), String(harvestSupers(x)),
          x.litres == null ? '?' : fmtNum(x.litres, 1)]; }), { size: 8, total: [t('total'), '', String(s.supersTaken), fmtNum(s.rawL, 1)] });
    }
    if (s.moves.length) {
      doc.heading(t('sheet_moves'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('hive'), w: 60 }, { h: t('moved_from'), wrap: true }, { h: t('moved_to'), wrap: true }],
        s.moves.map(function (x) { return [shortDate(x.date), hiveName(x.hive), x.from, x.to]; }), { size: 8 });
    }
    if (s.insp.length) {
      doc.heading(t('inspections'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('hive'), w: 60 }, { h: t('place'), w: 90 }, { h: t('details'), wrap: true }],
        s.insp.map(function (x) { var hv = find('hives', x.hive) || {}; return [shortDate(x.date), hiveLabel(hv), hv.place, inspSummary(x) + (x.notes ? ' · ' + x.notes : '')]; }), { size: 8 });
    }
    if (s.care.length) {
      doc.heading(t('sheet_care'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('what_done'), w: 80 }, { h: t('where'), w: 130 }, { h: t('details'), wrap: true }],
        s.care.map(function (x) { return [shortDate(x.date), t('ct_' + x.type), careWhere(x), [x.product, x.qty, x.notes].filter(Boolean).join(' · ')]; }), { size: 8 });
    }
    var tl2 = tripsIn(F.from, F.to);
    if (tl2.length) {
      doc.heading(t('lb_tab'));
      doc.kv([[t('lb_trips'), String(tl2.length)], [t('lb_total_km'), fmtKm(kmOf(tl2)) + ' km', true]]);
      doc.table([{ h: t('date'), w: 58 }, { h: t('lb_from') + ' → ' + t('lb_to'), wrap: true }, { h: t('lb_reason'), w: 130 }, { h: 'km', w: 50, a: 'r' }],
        tl2.map(function (x) { return [shortDate(x.date), x.from + ' → ' + x.to, x.reason, fmtKm(x.endOdo - x.startOdo)]; }), { size: 8, total: [t('total'), '', '', fmtKm(kmOf(tl2))] });
    }
    if (s.diary.length) {
      doc.heading(t('tab_diary'));
      doc.table([{ h: t('date'), w: 62 }, { h: t('entry'), wrap: true }],
        s.diary.map(function (d) { return [shortDate(d.date), d.text + ((d.tags || []).length ? '  [' + d.tags.map(function (g) { return t('tag_' + g); }).join(', ') + ']' : '')]; }), { size: 8.5 });
    }
    return doc.blob();
  }

  function deliver(blob, name, share) {
    if (share && canShare) {
      var file = new File([blob], name, { type: blob.type });
      navigator.share({ files: [file], title: name }).catch(function (e) { if (e && e.name !== 'AbortError') toast(t('share_failed')); });
      return;
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    toast(t('file_saved'));
  }
  function exportFile(type, share) {
    try {
      var blob = type === 'pdf' ? buildPdf() : buildExcel();
      deliver(blob, fileBase() + (type === 'pdf' ? '.pdf' : '.xlsx'), share);
    } catch (e) {
      console.error(e);
      toast(t('export_failed') + ' ' + e.message);
    }
  }
  var canShare = (function () {
    try {
      var probe = new File([new Blob(['x'])], 'x.pdf', { type: 'application/pdf' });
      return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (e) { return false; }
  })();

  /* Backup / restore --------------------------------------------------- */
  function blobToDataUrl(b) {
    return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(null); }; r.readAsDataURL(b); });
  }
  function dataUrlToBlob(u) {
    var m = /^data:([^;,]+);base64,(.*)$/.exec(u || '');
    if (!m) return null;
    var bin = atob(m[2]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }
  function backup() {
    D.settings.lastBackup = today();
    save();
    var name = 'ByeBoer backup ' + (D.settings.biz || '').replace(/[\\\/:*?"<>|]+/g, ' ').trim() + ' ' + today() + '.json';
    var used = {};
    D.money.concat(D.fuel).forEach(function (x) { if (x.photo) used[x.photo] = 1; });
    var getPhotos = useLS || !Object.keys(used).length ? Promise.resolve({}) : photoAll();
    getPhotos.then(function (all) {
      var ids = Object.keys(all).filter(function (k) { return used[k]; });
      return Promise.all(ids.map(function (k) { return blobToDataUrl(all[k]); })).then(function (urls) {
        var photos = {}; ids.forEach(function (k, i) { if (urls[i]) photos[k] = urls[i]; });
        return photos;
      });
    }).catch(function () { return {}; }).then(function (photos) {
      var out = Object.assign({}, D, { photos: photos });
      deliver(new Blob([JSON.stringify(out)], { type: 'application/json' }), name);
      if (V === 'home' || V === 'reports' || V === 'settings') render();
    });
  }
  function restorePick() {
    var input = document.getElementById('restoreFile');
    input.value = ''; input.click();
  }
  var pendingRestore = null, pendingPhotos = {};
  function restoreFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var d;
      try { d = JSON.parse(reader.result); } catch (e) { d = null; }
      if (!d || d.app !== 'ByeBoer' || !d.settings) { toast(t('restore_bad')); return; }
      var photos = d.photos || {};
      delete d.photos;
      pendingRestore = normalise(d);
      pendingPhotos = photos;
      var n = LISTS.reduce(function (s2, k) { return s2 + pendingRestore[k].length; }, 0);
      if (!D.settings.setup || totalEntries() === 0) return applyRestore();
      openSub('settings', { restoreN: n, restoreBiz: pendingRestore.settings.biz });
      var el = document.getElementById('restoreBox');
      if (el) el.scrollIntoView({ block: 'center' });
    };
    reader.readAsText(file);
  }
  function applyRestore() {
    if (!pendingRestore) return;
    D = pendingRestore; pendingRestore = null;
    D.settings.setup = true;
    var photos = pendingPhotos; pendingPhotos = {};
    photoUrls = {};
    var ph = useLS ? Promise.resolve() : photoClear().then(function () {
      return Promise.all(Object.keys(photos).map(function (k) { var b = dataUrlToBlob(photos[k]); return b ? photoPut(k, b) : null; }));
    }).catch(function () {});
    Promise.all([save(), ph]).then(function () { toast(t('restored')); });
    if (history.state && history.state.sub) history.back();
    showTab('home');
  }

  /* Calendar reminder -------------------------------------------------- */
  function appUrl() { return location.href.split('#')[0].split('?')[0]; }
  function reminderIcs() {
    var blob = FX.ics({ time: D.settings.remindTime || '18:00', title: t('ics_title'), desc: t('ics_desc'), url: appUrl() });
    deliver(blob, 'ByeBoer diary reminder.ics');
  }
  function reminderGoogle() {
    var hm = (D.settings.remindTime || '18:00').split(':'), d = new Date();
    d.setHours(+hm[0], +hm[1] || 0, 0, 0);
    var e = new Date(d.getTime() + 10 * 60000);
    var f = function (x) { return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + 'T' + pad(x.getHours()) + pad(x.getMinutes()) + '00'; };
    var url = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(t('ics_title')) +
      '&details=' + encodeURIComponent(t('ics_desc') + '\n' + appUrl()) + '&dates=' + f(d) + '/' + f(e) +
      '&ctz=Africa/Johannesburg&recur=' + encodeURIComponent('RRULE:FREQ=DAILY');
    window.open(url, '_blank', 'noopener');
  }

  /* ================================================================ */
  /* Settings                                                          */
  /* ================================================================ */
  var SET_KEYS = ['lang', 'biz', 'owner', 'phone', 'email', 'addr', 'regNo', 'regDue', 'vat', 'vatNo', 'yearEnd', 'bankName', 'bankHolder', 'bankAcc', 'bankBranch', 'bankType',
    'qPrefix', 'iPrefix', 'terms', 'fuelOn', 'travelDefault', 'remind', 'remindTime'];
  function settingsScreen() {
    var s = D.settings;
    if (!F.loaded) {
      F.loaded = 1;
      SET_KEYS.forEach(function (k) { F[k] = s[k]; });
      Object.assign(F, { vatRate: numIn(s.vatRate), yearEnd: String(s.yearEnd), nextQ: String(s.nextQ), nextI: String(s.nextI), payDays: String(s.payDays),
        quoteDays: String(s.quoteDays), deposit: numIn(s.deposit || ''), kmRate: numIn(s.kmRate || '') });
    }
    var months = []; for (var m = 1; m <= 12; m++) months.push([String(m), monthName(m)]);
    var h = '';
    if (F.restoreN != null) {
      h += '<div class="card warnc" id="restoreBox"><div class="grow"><strong>' + esc(t('restore_confirm_title')) + '</strong><div class="muted">' +
        esc(t('restore_confirm', { n: F.restoreN, biz: F.restoreBiz || '–' })) + '</div>' +
        '<div class="two" style="margin-top:12px"><button class="primary" data-act="applyRestore">' + esc(t('restore_yes')) + '</button><button class="secondary" data-act="cancelRestore">' + esc(t('cancel')) + '</button></div></div></div>';
    }
    h += '<div class="card"><strong>' + esc(t('business')) + '</strong>' +
      fld(t('language'), seg('lang', [['en', 'English'], ['af', 'Afrikaans']])) +
      fld(t('biz_name'), inp('biz', { max: 60 })) + fld(t('your_name'), inp('owner', { max: 60 })) +
      '<div class="two">' + fld(t('phone'), inp('phone', { max: 20, mode: 'tel' })) + fld(t('email'), inp('email', { max: 80, type: 'email' })) + '</div>' +
      fld(t('address'), area('addr', t('address_ph'), 3), esc(t('biz_addr_hint'))) + '</div>';
    function logoRow(n) {
      var key = n === 1 ? 'logo' : 'logo2', has = s[key];
      return '<div class="step" style="margin-top:14px">' + esc(t('logo_n_' + n)) + '</div>' +
        '<div class="logobox">' + (has ? '<img src="' + has + '" alt="' + esc(t('logo_n_' + n)) + '">' : '<div class="empty">' + esc(t('no_logo')) + '</div>') +
        '<div class="grow stack"><label class="btn secondary small wide" for="' + key + 'In">' + ico(IC.image, 18) + esc(t(has ? 'change_logo' : 'upload_logo')) + '</label>' +
        (has ? confirmBtn(key, 'logoRm" data-v="' + n, t('remove_logo'), t('delete_again')) : '') + '</div></div>' +
        '<input type="file" accept="image/*" id="' + key + 'In" class="hidden">';
    }
    h += '<div class="card" id="sdocs"><strong>' + esc(t('logos')) + '</strong><p class="muted" style="margin:6px 0 0">' + esc(t('logos_sub')) + '</p>' +
      logoRow(1) + logoRow(2) + '</div>';
    h += '<div class="card"><strong>' + esc(t('quotes_invoices')) + '</strong>' +
      '<div class="two">' + fld(t('quote_prefix'), inp('qPrefix', { max: 8 })) + fld(t('next_quote_no'), inp('nextQ', { mode: 'numeric', max: 6 })) + '</div>' +
      '<div class="two">' + fld(t('invoice_prefix'), inp('iPrefix', { max: 8 })) + fld(t('next_invoice_no'), inp('nextI', { mode: 'numeric', max: 6 })) + '</div>' +
      '<div class="two">' + fld(t('pay_within'), inp('payDays', { mode: 'numeric', max: 3 })) + fld(t('quote_valid_days'), inp('quoteDays', { mode: 'numeric', max: 3 })) + '</div>' +
      fld(t('deposit_pct'), inp('deposit', { mode: 'decimal', max: 5, ph: '0' }), esc(t('deposit_hint'))) +
      '<div class="step" style="margin-top:18px">' + esc(t('banking_details')) + '</div>' +
      '<div class="two">' + fld(t('bank'), inp('bankName', { max: 40, ph: t('bank_ph') })) + fld(t('acc_holder'), inp('bankHolder', { max: 60 })) + '</div>' +
      '<div class="two">' + fld(t('acc_no'), inp('bankAcc', { max: 24, mode: 'numeric' })) + fld(t('branch_code'), inp('bankBranch', { max: 12, mode: 'numeric' })) + '</div>' +
      fld(t('acc_type'), inp('bankType', { max: 30, ph: t('acc_type_ph') })) +
      fld(t('terms'), area('terms', t('terms_ph'), 4), esc(t('terms_hint'))) + '</div>';
    h += '<div class="card"><strong>' + esc(t('fuel_travel')) + '</strong>' +
      '<div style="margin-top:12px">' + check('fuelOn', t('fuel_track')) + '</div><div class="hint">' + esc(t('fuel_track_hint')) + '</div>' +
      '<div style="margin-top:14px">' + check('travelDefault', t('travel_default')) + '</div><div class="hint">' + esc(t('travel_default_hint')) + '</div>' +
      fld(t('rate_per_km'), inp('kmRate', { mode: 'decimal', max: 8, ph: '0.00' }), esc(t('km_rate_hint'))) + '</div>';
    h += '<div class="card"><strong>' + esc(t('tax_vat')) + '</strong>' +
      '<div style="margin-top:12px">' + check('vat', t('vat_registered')) + '</div>' +
      (F.vat ? '<div class="two">' + fld(t('vat_no'), inp('vatNo', { max: 20, mode: 'numeric' })) + fld(t('vat_rate'), inp('vatRate', { mode: 'decimal', max: 5 })) + '</div>' : '') +
      fld(t('year_end'), sel('yearEnd', months), esc(t('year_end_hint'))) + '</div>';
    h += '<div class="card"><strong>' + esc(t('registration')) + '</strong><p class="muted" style="margin:6px 0 0">' + esc(t('registration_sub')) + '</p>' +
      '<div class="two">' + fld(t('reg_no'), inp('regNo', { max: 30, ph: t('optional') })) + fld(t('reg_due'), inp('regDue', { type: 'date' })) + '</div>' +
      '<div class="hint">' + esc(t('reg_due_hint')) + '</div></div>';
    h += '<div class="card"><strong>' + esc(t('diary_reminder')) + '</strong>' +
      '<div style="margin-top:12px">' + check('remind', t('remind_in_app')) + '</div>' +
      fld(t('remind_time'), inp('remindTime', { type: 'time' })) +
      '<p class="muted" style="margin:12px 0">' + esc(t('remind_calendar_sub')) + '</p>' +
      '<div class="two"><button class="secondary" data-act="icsGoogle">' + esc(t('remind_google')) + '</button><button class="secondary" data-act="icsFile">' + esc(t('remind_ics')) + '</button></div></div>';
    h += msg('err', F.err);
    h += '<div class="stack"><button class="primary" data-act="saveSettings">' + esc(t('save')) + '</button></div>';

    var cats = (s.cats['in'] || []).map(function (n) { return ['in', n]; }).concat((s.cats.out || []).map(function (n) { return ['out', n]; }));
    if (cats.length) {
      h += '<div class="card" style="margin-top:14px"><strong>' + esc(t('my_categories')) + '</strong><div class="list">' + cats.map(function (c) {
        return '<div class="item static"><div class="row"><span>' + esc(c[1]) + ' <span class="muted">· ' + esc(c[0] === 'in' ? t('income') : t('expense')) + '</span></span>' +
          '<button class="text small danger" data-act="delCat" data-dir="' + c[0] + '" data-v="' + esc(c[1]) + '">' + esc(confirmKey === 'cat:' + c[0] + c[1] ? t('delete_again') : t('remove')) + '</button></div></div>';
      }).join('') + '</div><div class="hint">' + esc(t('cat_remove_hint')) + '</div></div>';
    }
    h += '<div style="margin-top:14px">' + backupCard() + '</div>';
    h += clearCard();
    h += '<div class="card"><strong>' + esc(t('danger')) + '</strong><p class="muted" style="margin:6px 0 8px">' + esc(t('wipe_sub')) + '</p>' +
      confirmBtn('wipe', 'wipe', t('wipe'), t('wipe_again')) + '</div>';
    h += '<p class="muted center foot">ByeBoer ' + VERSION + ' · ' + esc(t('stored_here')) + '</p>';
    app.innerHTML = h;
    if (F.to) { var el = document.getElementById('s' + F.to); F.to = ''; if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 0); }
  }
  /* Clear income, expenses, invoices and/or quotes (all, or only in a date range) */
  function clearPick() {
    var from = F.clrFrom || '', to = F.clrTo || '9999-12-31';
    var inR = function (d) { return (d || '') >= from && (d || '') <= to; };
    return {
      inc: F.clrIn ? D.money.filter(function (m) { return m.dir === 'in' && inR(m.date); }) : [],
      out: F.clrOut ? D.money.filter(function (m) { return m.dir === 'out' && inR(m.date); }) : [],
      inv: F.clrInv ? D.docs.filter(function (d) { return d.type === 'i' && inR(d.date); }) : [],
      quo: F.clrQuo ? D.docs.filter(function (d) { return d.type === 'q' && inR(d.date); }) : []
    };
  }
  function clearCard() {
    var c = clearPick(), n = c.inc.length + c.out.length + c.inv.length + c.quo.length;
    var cnt = function (dir) { return D.money.filter(function (m) { return m.dir === dir; }).length; };
    var dc = function (ty) { return D.docs.filter(function (d) { return d.type === ty; }).length; };
    var parts = [];
    if (c.inc.length) parts.push(t('clr_n_in', { n: c.inc.length, r: fmtR(c.inc.reduce(function (a, m) { return a + m.amt; }, 0)) }));
    if (c.out.length) parts.push(t('clr_n_out', { n: c.out.length, r: fmtR(c.out.reduce(function (a, m) { return a + m.amt; }, 0)) }));
    if (c.inv.length) parts.push(t('clr_n_inv', { n: c.inv.length }));
    if (c.quo.length) parts.push(t('clr_n_quo', { n: c.quo.length }));
    var h = '<div class="card" id="sclear"><strong>' + esc(t('clr_title')) + '</strong><p class="muted" style="margin:6px 0 10px">' + esc(t('clr_sub')) + '</p>' +
      check('clrIn', t('clr_in') + ' (' + cnt('in') + ')') + check('clrOut', t('clr_out') + ' (' + cnt('out') + ')') +
      check('clrInv', t('clr_inv') + ' (' + dc('i') + ')') + check('clrQuo', t('clr_quo') + ' (' + dc('q') + ')') +
      '<div class="two" style="margin-top:10px">' + fld(t('clr_from'), inp('clrFrom', { type: 'date' })) + fld(t('clr_to'), inp('clrTo', { type: 'date' })) + '</div>' +
      '<div class="hint">' + esc(t('clr_dates_hint')) + '</div>';
    if (F.clrInv || F.clrQuo) h += '<div style="margin-top:10px">' + check('clrNos', t('clr_nos')) + '</div>';
    if (n) {
      h += '<div class="msg warn" style="margin-top:10px"><div>' + esc(t('clr_will', { what: parts.join(', ') })) +
        (c.inv.length && !F.clrIn ? '<br>' + esc(t('clr_keep_pays')) : '') +
        (c.inc.length && !F.clrInv && c.inc.some(function (m) { return m.doc; }) ? '<br>' + esc(t('clr_unpaid')) : '') +
        (c.inv.length ? '<br>' + esc(t('clr_stock')) : '') + '<br><b>' + esc(t('clr_backup_first')) + '</b></div></div>' +
        '<div class="two" style="margin-top:10px"><button class="secondary" data-act="backup">' + esc(t('backup_now')) + '</button>' +
        '<button class="primary r" data-act="clearRec">' + esc(confirmKey === 'clr' ? t('clr_again', { n: n }) : t('clr_go', { n: n })) + '</button></div>';
    } else if (F.clrIn || F.clrOut || F.clrInv || F.clrQuo) h += '<p class="muted" style="margin:10px 0 0">' + esc(t('clr_none')) + '</p>';
    return h + '</div>';
  }
  function clearRecords() {
    var c = clearPick(), n = c.inc.length + c.out.length + c.inv.length + c.quo.length;
    if (!n) return;
    if (confirmKey !== 'clr') { confirmKey = 'clr'; return render(); }
    confirmKey = '';
    var gone = {};
    c.inc.concat(c.out).forEach(function (m) { gone[m.id] = 1; if (m.photo) photoDel(m.photo); });
    var goneDoc = {};
    c.inv.concat(c.quo).forEach(function (d) { goneDoc[d.id] = 1; });
    D.money = D.money.filter(function (m) { return !gone[m.id]; });
    D.docs = D.docs.filter(function (d) { return !goneDoc[d.id]; });
    // Payments whose income was cleared come off their invoices; income whose invoice was cleared stays as plain income
    D.docs.forEach(function (d) {
      d.pays = (d.pays || []).filter(function (p) { return !gone[p.mid]; });
      if (goneDoc[d.inv]) d.inv = '';
      if (goneDoc[d.from]) d.from = '';
    });
    D.money.forEach(function (m) { if (m.doc && goneDoc[m.doc]) m.doc = ''; });
    D.buys.forEach(function (b) { if (b.mid && gone[b.mid]) b.mid = ''; });
    if (F.clrNos && (c.inv.length || c.quo.length)) {
      var hi = function (ty) {
        var pre = ty === 'q' ? D.settings.qPrefix : D.settings.iPrefix, top = 0;
        D.docs.forEach(function (d) { if (d.type !== ty) return; var m = String(d.no || '').match(/(\d+)\D*$/); if (m && +m[1] > top) top = +m[1]; });
        return top + 1;
      };
      if (c.inv.length) D.settings.nextI = hi('i');
      if (c.quo.length) D.settings.nextQ = hi('q');
      F.nextI = String(D.settings.nextI); F.nextQ = String(D.settings.nextQ);
    }
    F.clrIn = F.clrOut = F.clrInv = F.clrQuo = F.clrNos = false;
    save(); toast(t('clr_done', { n: n })); render();
  }
  function saveSettings() {
    var rate = num(F.vatRate), nq = parseInt(F.nextQ, 10), ni = parseInt(F.nextI, 10), pd = parseInt(F.payDays, 10), qd = parseInt(F.quoteDays, 10);
    var dep = clean(F.deposit) ? num(F.deposit) : 0, km = clean(F.kmRate) ? num(F.kmRate) : 0;
    var e = '';
    if (!clean(F.biz) && !clean(F.owner)) e = t('err_biz');
    else if (F.vat && (isNaN(rate) || rate <= 0 || rate > 50)) e = t('err_vat_rate');
    else if (!(nq > 0) || !(ni > 0)) e = t('err_next_no');
    else if (!(pd >= 0) || !(qd > 0)) e = t('err_days');
    else if (isNaN(dep) || dep < 0 || dep > 100) e = t('err_deposit');
    else if (isNaN(km) || km < 0) e = t('err_km_rate');
    if (e) { F.err = esc(e); return render(); }
    var s = D.settings;
    Object.assign(s, { lang: F.lang, biz: clean(F.biz, 60), owner: clean(F.owner, 60), phone: clean(F.phone, 20), email: clean(F.email, 80), addr: cleanMulti(F.addr, 300),
      regNo: clean(F.regNo, 30), regDue: F.regDue || '', vat: !!F.vat, vatNo: clean(F.vatNo, 20), vatRate: F.vat ? rate : s.vatRate, yearEnd: +F.yearEnd,
      bankName: clean(F.bankName, 40), bankHolder: clean(F.bankHolder, 60), bankAcc: clean(F.bankAcc, 24), bankBranch: clean(F.bankBranch, 12), bankType: clean(F.bankType, 30),
      qPrefix: clean(F.qPrefix, 8), iPrefix: clean(F.iPrefix, 8), nextQ: nq, nextI: ni, payDays: pd, quoteDays: qd, deposit: r2(dep), terms: cleanMulti(F.terms, 1200),
      fuelOn: !!F.fuelOn, travelDefault: !!F.travelDefault, kmRate: r2(km), remind: !!F.remind, remindTime: F.remindTime || '18:00' });
    save(); toast(t('saved')); closeSub();
  }
  function setLogo(file, n) {
    var key = n === 2 ? 'logo2' : 'logo';
    makeLogo(file).then(function (lg) {
      D.settings[key] = lg.url; D.settings[key + 'W'] = lg.w; D.settings[key + 'H'] = lg.h;
      save(); toast(t('logo_saved')); render();
    }).catch(function () { toast(t('err_photo')); });
  }

  /* ================================================================ */
  /* Honey in & out report                                             */
  /* ================================================================ */
  // Everything that happened to honey in a period: harvested, bought, processed, bottled and sold.
  function honeyReport(from, to) {
    var s = summary(from, to), r = { s: s, sup: {}, sales: [], outL: 0, outR: 0, byProd: {}, bottled: {} };
    s.buys.forEach(function (b) { var x = r.sup[b.supplier] || (r.sup[b.supplier] = { l: 0, r: 0, n: 0 }); x.l += b.litres; x.r += b.amt || 0; x.n++; });
    s.bottling.forEach(function (b) { var x = r.bottled[b.product] || (r.bottled[b.product] = { n: 0, l: 0 }); x.n += b.n; x.l += b.litres; });
    D.docs.forEach(function (d) {
      if (d.type !== 'i' || !inRange(d.date, from, to)) return;
      d.lines.forEach(function (l) {
        if (!l.prod) return;
        var row = { date: d.date, no: d.no, client: clientName(d.client) || '?', prod: l.prod, name: prodLabel(l.prod), q: l.q, bulk: !!BULK[l.prod], l: lineLitres(l), amt: r2(l.q * l.p) };
        r.sales.push(row); r.outL += row.l; r.outR += row.amt;
        var p = r.byProd[l.prod] || (r.byProd[l.prod] = { name: row.name, bulk: row.bulk, q: 0, l: 0, amt: 0 }); p.q += row.q; p.l += row.l; p.amt += row.amt;
      });
    });
    r.sales.sort(function (a, b) { return a.date.localeCompare(b.date); });
    r.stock = honeyStock();
    return r;
  }
  function qtyText(row) { return row.bulk ? fmtL(row.q) : t('bottles_x', { n: fmtQ(row.q) }); }
  // Group the sales: by client (rows per product), by product (rows per client), or totals per product only
  function salesGroups(r, by) {
    if (by === 'total') return [{ title: '', rows: Object.keys(r.byProd).map(function (k) { var p = r.byProd[k]; return { name: p.name, q: p.q, bulk: p.bulk, l: p.l, amt: p.amt }; }) }];
    var g = {}, order = [];
    r.sales.forEach(function (x) {
      var key = by === 'client' ? x.client : x.name, sub = by === 'client' ? x.name : x.client;
      if (!g[key]) { g[key] = {}; order.push(key); }
      var y = g[key][sub] || (g[key][sub] = { name: sub, q: 0, bulk: x.bulk, l: 0, amt: 0 });
      y.q += x.q; y.l += x.l; y.amt += x.amt;
    });
    order.sort(function (a, b) { return a.localeCompare(b); });
    return order.map(function (k) { return { title: k, rows: Object.keys(g[k]).map(function (n) { return g[k][n]; }) }; });
  }
  function honeyInRows(r) {
    var s = r.s, rows = [[t('raw_harvested'), fmtL(s.rawL) + ' · ' + t('harvest_line', { n: s.supersTaken, h: s.harvests.reduce(function (a, x) { return a + x.takes.length; }, 0) })]];
    Object.keys(r.sup).sort().forEach(function (k) { rows.push([t('bought_from_x', { s: k }), fmtL(r.sup[k].l) + (r.sup[k].r ? ' · ' + fmtR(r.sup[k].r) : '')]); });
    rows.push([t('raw_bought_total'), fmtL(s.boughtL)], [t('raw_used'), fmtL(s.procIn)], [t('processed_made'), fmtL(s.procOut)]);
    Object.keys(r.bottled).forEach(function (k) { rows.push([t('bottled_x', { p: prodLabel(k) }), t('bottles_x', { n: r.bottled[k].n }) + ' · ' + fmtL(r2(r.bottled[k].l))]); });
    return rows;
  }
  function honeyCard() {
    var r = honeyReport(F.from, F.to), by = F.hgroup || 'client';
    var h = '<div class="card" id="hrep"><strong>' + esc(t('honey_report')) + '</strong><p class="muted" style="margin:6px 0 12px">' + esc(t('honey_report_sub')) + '</p>' +
      seg('hgroup', [['client', t('per_client')], ['product', t('per_product')], ['total', t('total_only')]], 'wrap3');
    h += '<div class="step" style="margin-top:16px">' + esc(t('honey_in')) + '</div><table class="kv">' + honeyInRows(r).map(function (x) {
      return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>';
    h += '<div class="step" style="margin-top:16px">' + esc(t('honey_out')) + '</div>';
    var groups = salesGroups(r, by);
    if (!r.sales.length) h += empty(t('no_honey_sales'));
    else groups.forEach(function (g) {
      if (g.title) h += '<div class="dhead">' + esc(g.title) + '</div>';
      h += '<table class="kv">' + g.rows.map(function (x) { return '<tr><td>' + esc(x.name) + ' <span class="muted">· ' + esc(qtyText(x)) + (x.bulk || !x.l ? '' : ' · ' + esc(fmtL(r2(x.l)))) + '</span></td><td>' + esc(fmtR(x.amt)) + '</td></tr>'; }).join('') + '</table>';
    });
    if (r.sales.length) h += '<table class="kv"><tr><td><b>' + esc(t('honey_out_total')) + '</b></td><td>' + esc(fmtL(r2(r.outL)) + ' · ' + fmtR(r.outR)) + '</td></tr></table>';
    h += '<div class="step" style="margin-top:16px">' + esc(t('stock_now')) + '</div><table class="kv">' +
      [[t('raw_honey'), fmtL(r.stock.raw)], [t('processed_honey'), fmtL(r.stock.done)]].concat(D.products.slice().sort(byName).map(function (p) { return [p.name, t('bottles_x', { n: productStock(p.id) })]; }))
        .map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>'; }).join('') + '</table>';
    h += '<div class="two" style="margin-top:14px"><button class="secondary" data-act="hpdf">' + ico(IC.down, 18) + esc(t('save_pdf_short')) + '</button>' +
      '<button class="secondary" data-act="hxls">' + ico(IC.down, 18) + esc(t('save_excel_short')) + '</button></div>' +
      (canShare ? '<button class="text" data-act="hshare">' + esc(t('share_pdf')) + '</button>' : '') + '</div>';
    return h;
  }
  function honeyFile() {
    var biz = (D.settings.biz || D.settings.owner || 'ByeBoer').replace(/[\\\/:*?"<>|]+/g, ' ').trim();
    return t('honey_report') + ' ' + biz + ' ' + (F.from || F.to ? (F.from || 'start') + ' – ' + (F.to || today()) : today());
  }
  function buildHoneyPdf() {
    var r = honeyReport(F.from, F.to), by = F.hgroup || 'client';
    var doc = new FX.PDF({ footer: 'ByeBoer · ' + (D.settings.biz || '') + ' · ' + periodText(F.from, F.to), pageLabel: t('page') });
    doc.title((D.settings.biz || 'ByeBoer') + ' – ' + t('honey_report'), [t('period') + ': ' + periodText(F.from, F.to), t('grouped') + ': ' + t(by === 'client' ? 'per_client' : by === 'product' ? 'per_product' : 'total_only'), t('generated') + ': ' + shortDate(today())]);
    doc.heading(t('honey_in'));
    doc.kv(honeyInRows(r), 330);
    if (r.s.buys.length) doc.table([{ h: t('date'), w: 62 }, { h: t('bought_from') }, { h: t('litres'), w: 70, a: 'r' }, { h: t('amount_r'), w: 90, a: 'r' }],
      r.s.buys.map(function (b) { return [shortDate(b.date), b.supplier, fmtNum(b.litres, 1), b.amt ? fmtR(b.amt) : '']; }), { size: 8.5, total: [t('total'), '', fmtNum(r.s.boughtL, 1), fmtR(r.s.boughtR)] });
    doc.heading(t('honey_out'));
    if (!r.sales.length) doc.note(t('no_honey_sales'));
    salesGroups(r, by).forEach(function (g) {
      if (!g.rows.length) return;
      if (g.title) { doc.ensure(40); doc.text(doc.M, doc.y + 11, g.title, 10.5, true); doc.y += 16; }
      var tl = g.rows.reduce(function (a, x) { return a + x.l; }, 0), ta = g.rows.reduce(function (a, x) { return a + x.amt; }, 0);
      doc.table([{ h: by === 'product' ? t('client') : t('product') }, { h: t('qty'), w: 90, a: 'r' }, { h: t('litres'), w: 70, a: 'r' }, { h: t('amount_r'), w: 90, a: 'r' }],
        g.rows.map(function (x) { return [x.name, qtyText(x), x.l ? fmtNum(r2(x.l), 2) : '–', fmtR(x.amt)]; }), { size: 8.5, total: [t('total'), '', fmtNum(r2(tl), 2), fmtR(ta)] });
    });
    if (r.sales.length) doc.kv([[t('honey_out_total'), fmtL(r2(r.outL)) + '  ·  ' + fmtR(r.outR), true]], 330);
    doc.heading(t('stock_now'));
    doc.kv([[t('raw_honey'), fmtL(r.stock.raw)], [t('processed_honey'), fmtL(r.stock.done)]].concat(D.products.slice().sort(byName).map(function (p) { return [p.name, t('bottles_x', { n: productStock(p.id) })]; })), 330);
    if (r.sales.length && by !== 'total') {
      doc.heading(t('honey_sales_list'));
      doc.table([{ h: t('date'), w: 58 }, { h: t('invoice'), w: 50 }, { h: t('client') }, { h: t('product'), w: 110 }, { h: t('qty'), w: 70, a: 'r' }, { h: t('amount_r'), w: 74, a: 'r' }],
        r.sales.map(function (x) { return [shortDate(x.date), x.no, x.client, x.name, qtyText(x), fmtR(x.amt)]; }), { size: 8 });
    }
    return doc.blob();
  }
  function buildHoneyExcel() {
    var r = honeyReport(F.from, F.to), by = F.hgroup || 'client', N = function (v, f) { return { v: v, f: f || 'num1' }; };
    var sum = [{ c: [t('honey_report')], sec: true }, [t('period'), periodText(F.from, F.to)], [], { c: [t('honey_in')], sec: true }];
    sum.push([t('raw_harvested') + ' (L)', N(r.s.rawL)], [t('supers_harvested'), N(r.s.supersTaken, 'int')]);
    Object.keys(r.sup).sort().forEach(function (k) { sum.push([t('bought_from_x', { s: k }) + ' (L)', N(r.sup[k].l)]); });
    sum.push([t('raw_bought_total') + ' (L)', N(r.s.boughtL)], [t('raw_bought_total') + ' (R)', N(r.s.boughtR, 'money')], [t('raw_used') , N(r.s.procIn)], [t('processed_made') + ' (L)', N(r.s.procOut)]);
    Object.keys(r.bottled).forEach(function (k) { sum.push([t('bottled_x', { p: prodLabel(k) }), N(r.bottled[k].n, 'int')]); });
    sum.push([], { c: [t('honey_out')], sec: true });
    salesGroups(r, by).forEach(function (g) {
      if (g.title) sum.push({ c: [g.title], b: true });
      g.rows.forEach(function (x) { sum.push([(g.title ? '   ' : '') + x.name + ' – ' + qtyText(x), N(x.amt, 'money')]); });
    });
    sum.push({ c: [t('honey_out_total') + ' (L)', N(r2(r.outL))], b: true }, { c: [t('honey_out_total') + ' (R)', N(r.outR, 'money')], b: true });
    sum.push([], { c: [t('stock_now')], sec: true }, [t('raw_honey') + ' (L)', N(r.stock.raw)], [t('processed_honey') + ' (L)', N(r.stock.done)]);
    D.products.slice().sort(byName).forEach(function (p) { sum.push([p.name, N(productStock(p.id), 'int')]); });
    var sheets = [{ name: t('summary'), plain: true, cols: [{ w: 50, f: 'text' }, { w: 20, f: 'num1' }], rows: sum }];
    sheets.push({ name: t('honey_sales_list'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('invoice'), w: 10 }, { h: t('client'), w: 26 }, { h: t('product'), w: 24 },
      { h: t('qty'), w: 10, f: 'num2' }, { h: t('unit'), w: 10 }, { h: t('litres'), w: 10, f: 'num2' }, { h: t('amount_r'), w: 14, f: 'money' }], sumCols: [6, 7], totalLabel: t('total'),
      rows: r.sales.map(function (x) { return [x.date, x.no, x.client, x.name, x.q, x.bulk ? 'L' : t('bottles'), x.l || null, x.amt]; }) });
    sheets.push({ name: t('honey_in'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('type'), w: 16 }, { h: t('details'), w: 40, f: 'wrap' }, { h: t('litres'), w: 12, f: 'num1' }, { h: t('amount_r'), w: 14, f: 'money' }],
      sumCols: [3], totalLabel: t('total'),
      rows: r.s.harvests.map(function (x) { return [x.date, t('kind_harvest'), t('harvest_line', { n: harvestSupers(x), h: x.takes.length }), x.litres == null ? null : x.litres, null]; })
        .concat(r.s.buys.map(function (b) { return [b.date, t('kind_buy'), b.supplier, b.litres, b.amt || null]; })).sort(function (a, b) { return a[0].localeCompare(b[0]); }) });
    return FX.xlsx(sheets);
  }
  function exportHoney(type, share) {
    try { deliver(type === 'pdf' ? buildHoneyPdf() : buildHoneyExcel(), honeyFile() + (type === 'pdf' ? '.pdf' : '.xlsx'), share); }
    catch (e) { console.error(e); toast(t('export_failed') + ' ' + e.message); }
  }

  /* ================================================================ */
  /* Import quotes & invoices from a spreadsheet                       */
  /* ================================================================ */
  // Reads two kinds of sheets:
  //  1. an invoice form (one invoice per sheet, labels like "Kliënt:", "Faktuur:", "Datum:" and a table Beskrywing / Aantal / Prys / Totaal)
  //  2. a list with one row per item (columns like Nommer, Datum, Kliënt, Beskrywing, Aantal, Prys)
  function normT(v) {
    return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[():.#]/g, ' ').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function cellStr(v) { if (v == null) return ''; if (typeof v === 'object' && v.date) return v.date; if (typeof v === 'number') return String(Math.round(v * 100) / 100); return String(v).trim(); }
  function cellNum(v) { if (typeof v === 'number') return v; var n = num(String(v == null ? '' : v).replace(/^r\s*/i, '')); return n; }
  function cellDate(v) {
    if (v && typeof v === 'object' && v.date) return v.date;
    if (typeof v === 'number' && v > 20000 && v < 80000) return dateStr(new Date(Date.UTC(1899, 11, 30) + v * 864e5 + 43200000));
    var s = String(v || '').trim(), m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(s))) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    if ((m = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})/i.exec(s))) {
      var mo = ['jan', 'feb', 'ma', 'apr', 'me', 'jun', 'jul', 'aug', 'sep', 'o', 'nov', 'de'], k = normT(m[2]), idx = -1;
      ['jan', 'feb', 'mar|mrt|maa', 'apr', 'may|mei', 'jun', 'jul', 'aug', 'sep', 'oct|okt', 'nov', 'dec|des'].forEach(function (p, i) { if (new RegExp('^(' + p + ')').test(k)) idx = i; });
      if (idx > -1 && mo) return m[3] + '-' + pad(idx + 1) + '-' + pad(+m[1]);
    }
    return '';
  }
  function codeStr(v) {   // SA town codes are 4 digits; Excel drops the leading 0 of e.g. 0181
    if (typeof v === 'number' && v > 0 && v < 1000 && v % 1 === 0) return ('000' + v).slice(-4);
    return blank0(v).slice(0, 10);
  }
  function blank0(v) { var s = cellStr(v); return s === '0' || s === '-' ? '' : s; }
  var IMP = {
    client: ['klient', 'client', 'customer', 'faktuur aan', 'bill to', 'kwotasie vir', 'quote for', 'naam', 'name'],
    addr: ['adres', 'address', 'straatadres', 'straat adres', 'fisiese adres'],
    town: ['dorp', 'town', 'stad', 'city'],
    tcode: ['dorpkode', 'dorp kode', 'kode', 'poskode', 'pos kode', 'postal code', 'post code', 'postcode', 'town code', 'code', 'area code', 'zip'],
    postal: ['pos adres', 'posadres', 'postal address', 'postal'],
    phone: ['kontak no', 'kontak nr', 'kontaknommer', 'kontak', 'contact no', 'contact', 'telefoon', 'tel', 'tel no', 'phone', 'sel', 'cell', 'selfoon'],
    email: ['e pos', 'epos', 'email', 'e mail'],
    vat: ['vat no', 'btw no', 'vat nr', 'btw nr', 'btw nommer', 'vat number', 'vat', 'btw'],
    noI: ['faktuur', 'faktuur no', 'faktuur nr', 'faktuurnommer', 'belastingfaktuur', 'invoice', 'invoice no', 'invoice number', 'tax invoice'],
    noQ: ['kwotasie', 'kwotasie no', 'kwotasie nr', 'kwotasienommer', 'quote', 'quote no', 'quotation'],
    no: ['nommer', 'number', 'no', 'nr', 'dokument', 'document'],
    type: ['tipe', 'type', 'soort'],
    date: ['datum', 'date'],
    job: ['werk', 'job', 'beskrywing van werk'],
    d: ['beskrywing', 'description', 'item', 'items', 'produk', 'product', 'diens', 'service', 'wat gekoop', 'details'],
    awr: ['awr', 'bestelnommer', 'bestel no', 'bestel nr', 'order no', 'order nr', 'order nommer', 'ordernommer', 'order', 'order number', 'bestelling', 'po', 'po no', 'po number'],
    cat: ['kategorie', 'category', 'uitgawe', 'inkomste', 'soort uitgawe'],
    party: ['betaal aan', 'ontvang van', 'verskaffer', 'supplier', 'paid to', 'received from'],
    q: ['aantal', 'qty', 'quantity', 'hoeveelheid', 'getal'],
    p: ['prys', 'prys r', 'price', 'price r', 'eenheidsprys', 'unit price', 'prys per eenheid', 'tarief', 'rate'],
    pay: ['betaal met', 'betaalmetode', 'betaal metode', 'metode', 'betaling', 'betaal', 'payment', 'payment method', 'paid by', 'paid with'],
    t: ['totaal', 'totaal r', 'total', 'total r', 'bedrag', 'bedrag r', 'amount', 'amount r', 'lyntotaal']
  };
  function isLab(v, key) { var n = normT(v); return n && IMP[key].indexOf(n) > -1; }
  function parseFormSheet(sh) {
    var rows = sh.rows, hdr = -1, cols = {};
    for (var i = 0; i < rows.length && hdr < 0; i++) {
      var r = rows[i], c = {};
      r.forEach(function (v, j) { ['d', 'q', 'p', 't'].forEach(function (k) { if (c[k] == null && isLab(v, k)) c[k] = j; }); });
      if (c.d != null && c.q != null && (c.p != null || c.t != null)) { hdr = i; cols = c; }
    }
    if (hdr < 0) return null;
    var lab = {};
    rows.forEach(function (r, i) {
      if (i === hdr) return;
      r.forEach(function (v, j) {
        if (typeof v !== 'string') return;
        ['client', 'addr', 'town', 'tcode', 'postal', 'phone', 'email', 'vat', 'awr', 'noI', 'noQ', 'date'].concat(i < hdr ? ['d'] : []).forEach(function (k) {
          if (lab[k] != null || !isLab(v, k)) return;
          for (var x = j + 1; x < r.length; x++) if (r[x] != null && cellStr(r[x]) !== '') { lab[k] = r[x]; break; }
        });
      });
    });
    var lines = [], blanks = 0;
    for (i = hdr + 1; i < rows.length; i++) {
      var row = rows[i], stop = row.some(function (v, j) { return j !== cols.d && /^(sub ?totaal|subtotal|totaal|total|btw|vat)\b/.test(normT(v)); });
      if (stop && !cellStr(row[cols.d])) break;
      var d = cellStr(row[cols.d]), q = cellNum(row[cols.q]), p = cols.p != null ? cellNum(row[cols.p]) : NaN, tt = cols.t != null ? cellNum(row[cols.t]) : NaN;
      if (!d && isNaN(q)) { if (++blanks > 3) break; continue; }
      blanks = 0;
      if (isNaN(q) || q <= 0) q = 1;
      if (isNaN(p) && !isNaN(tt)) p = tt / q;
      if (!d || isNaN(p)) continue;
      lines.push({ d: d, q: Math.round(q * 100) / 100, p: r2(p) });
    }
    var name = blank0(lab.client);
    if (!name || !lines.length) return null;
    return [{ type: lab.noQ != null && lab.noI == null ? 'q' : 'i', no: blank0(lab.noI != null ? lab.noI : lab.noQ), date: cellDate(lab.date), cName: name,
      addr: blank0(lab.addr), town: blank0(lab.town), tcode: codeStr(lab.tcode), postal: blank0(lab.postal), phone: blank0(lab.phone), email: blank0(lab.email), vat: blank0(lab.vat),
      job: blank0(lab.d), awr: blank0(lab.awr), lines: lines, sheet: sh.name }];
  }
  function payMethod(v) {   // "EFT", "Kontant", "Kaart", "Ja" -> method; empty or "Nee" -> not paid
    var s = normT(v);
    if (!s || /^(nee|no|n|onbetaal|unpaid)$/.test(s)) return '';
    if (/eft|elektron|electron|bank|oorplas|transfer/.test(s)) return 'eft';
    if (/kontant|cash/.test(s)) return 'cash';
    if (/kaart|card|speedpoint/.test(s)) return 'card';
    return 'other';
  }
  function parseListSheet(sh) {
    var rows = sh.rows, hdr = -1, cols = {};
    for (var i = 0; i < Math.min(rows.length, 15) && hdr < 0; i++) {
      var c = {};
      rows[i].forEach(function (v, j) { Object.keys(IMP).forEach(function (k) { if (c[k] == null && isLab(v, k)) c[k] = j; }); });
      if (c.client != null && c.d != null && (c.p != null || c.t != null)) { hdr = i; cols = c; }
    }
    if (hdr < 0) return null;
    var nocol = cols.no != null ? cols.no : cols.noI != null ? cols.noI : cols.noQ;
    var groups = {}, order = [];
    for (i = hdr + 1; i < rows.length; i++) {
      var r = rows[i], g = function (k) { return cols[k] != null ? r[cols[k]] : null; };
      var name = blank0(g('client')), d = cellStr(g('d'));
      if (!name || !d) continue;
      var no = nocol != null ? blank0(r[nocol]) : '', date = cellDate(g('date'));
      var key = no ? 'n:' + no.toLowerCase() : 'k:' + date + '|' + name.toLowerCase();
      var q = cellNum(g('q')), p = cellNum(g('p')), tt = cellNum(g('t'));
      if (isNaN(q) || q <= 0) q = 1;
      if (isNaN(p) && !isNaN(tt)) p = tt / q;
      if (isNaN(p)) continue;
      if (!groups[key]) {
        var tp = normT(g('type')), isQ = /kwot|quot/.test(tp) || (cols.noQ != null && cols.noI == null && cols.no == null);
        groups[key] = { type: isQ ? 'q' : 'i', no: no, date: date, cName: name, addr: blank0(g('addr')), town: blank0(g('town')), tcode: codeStr(g('tcode')), postal: blank0(g('postal')),
          phone: blank0(g('phone')), email: blank0(g('email')), vat: blank0(g('vat')), job: blank0(g('job')), awr: blank0(g('awr')), lines: [], sheet: sh.name, payM: payMethod(g('pay')) };
        order.push(key);
      }
      groups[key].lines.push({ d: d, q: Math.round(q * 100) / 100, p: r2(p) });
    }
    return order.length ? order.map(function (k) { return groups[k]; }) : null;
  }
  // Income / expense lists: Date, Category, Description, Amount (and optional Paid with, Paid to, Type)
  function parseMoneySheet(sh) {
    var rows = sh.rows, hdr = -1, cols = {};
    for (var i = 0; i < Math.min(rows.length, 15) && hdr < 0; i++) {
      var c = {};
      rows[i].forEach(function (v, j) { ['date', 'cat', 'd', 't', 'pay', 'party', 'type', 'client'].forEach(function (k) { if (c[k] == null && isLab(v, k)) c[k] = j; }); });
      if (c.date != null && c.t != null && (c.cat != null || c.d != null) && c.client == null) { hdr = i; cols = c; }
    }
    if (hdr < 0) return null;
    var sdir = /inkomst|income|ontvang/i.test(sh.name) ? 'in' : 'out', out = [];
    for (i = hdr + 1; i < rows.length; i++) {
      var r = rows[i], g = function (k) { return cols[k] != null ? r[cols[k]] : null; };
      var date = cellDate(g('date')), amt = cellNum(g('t'));
      if (!date || isNaN(amt) || !amt) continue;
      var tp = normT(g('type')), dir = /inkomst|income|in$/.test(tp) ? 'in' : /uitgaw|expens|out$/.test(tp) ? 'out' : sdir;
      out.push({ kind: 'money', dir: dir, date: date, catText: cellStr(g('cat')), desc: cellStr(g('d')), party: cellStr(g('party')), amt: r2(Math.abs(amt)), payM: payMethod(g('pay')), sheet: sh.name });
    }
    return out.length ? out : null;
  }
  function moneyDup(x) {
    var d = normT(x.desc), c = normT(x.catText);
    return D.money.some(function (m) {
      return m.dir === x.dir && m.date === x.date && Math.abs(m.amt - x.amt) < 0.005 && (normT(m.desc) === d || normT(catLabel(m.cat)) === c || (!d && !c));
    });
  }
  function importFound(sheets) {
    var out = [];
    sheets.forEach(function (sh) { (parseFormSheet(sh) || parseListSheet(sh) || parseMoneySheet(sh) || []).forEach(function (x) { out.push(x); }); });
    var seen = {};
    out.forEach(function (x) {
      if (x.kind === 'money') {
        var mk = [x.dir, x.date, x.amt, normT(x.desc), normT(x.catText)].join('|');
        x.total = x.amt;
        x.dup = moneyDup(x) || !!seen[mk];
        seen[mk] = 1;
      } else {
        x.kind = 'doc';
        x.total = r2(x.lines.reduce(function (s, l) { return s + r2(l.q * l.p); }, 0));
        var k = x.type + ':' + String(x.no).toLowerCase();
        x.dup = !!x.no && (D.docs.some(function (d) { return d.type === x.type && String(d.no).toLowerCase() === String(x.no).toLowerCase(); }) || !!seen[k]);
        if (x.no) seen[k] = 1;
      }
      x.on = true;
    });
    return out;
  }
  function readImportFile(file) {
    if (!file) return;
    var isCsv = /\.(csv|txt)$/i.test(file.name);
    if (/\.xls$/i.test(file.name)) { F.found = null; F.impErr = esc(t('imp_xls_old')); return render(); }
    var rd = new FileReader();
    rd.onload = function () {
      var p = isCsv ? Promise.resolve(FX.readCsv(String(rd.result))) : FX.readXlsx(rd.result);
      p.then(function (sheets) {
        F.found = importFound(sheets); F.fileName = file.name; F.impErr = F.found.length ? '' : esc(t('imp_none'));
        render();
      }).catch(function (e) { console.error(e); F.found = null; F.impErr = esc(t('imp_bad')); render(); });
    };
    if (isCsv) rd.readAsText(file); else rd.readAsArrayBuffer(file);
  }
  function importScreen() {
    var h = '<div class="card"><strong>' + esc(t('imp_title')) + '</strong><p class="muted" style="margin:6px 0 12px">' + esc(t('imp_sub')) + '</p>' +
      '<label class="btn primary" for="importFile">' + ico(IC.down, 20) + esc(t(F.found ? 'imp_other_file' : 'imp_choose')) + '</label>' +
      '<input type="file" id="importFile" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" class="hidden">' +
      '<button class="text" data-act="impTemplate">' + esc(t('imp_template')) + '</button>' + msg('err', F.impErr) + '</div>';
    if (F.found && F.found.length) {
      var on = F.found.filter(function (x) { return x.on; }), nI = on.filter(function (x) { return x.kind === 'doc' && x.type === 'i'; }).length;
      var nDocs = F.found.filter(function (x) { return x.kind === 'doc'; }).length, nMoney = F.found.length - nDocs;
      h += '<div class="card"><div class="row"><strong>' + esc(t('imp_found', { n: F.found.length, f: F.fileName })) + '</strong></div>' +
        (nMoney ? '<div class="muted">' + esc(t('imp_found_split', { d: nDocs, m: nMoney })) + '</div>' : '') +
        '<div class="hint">' + esc(t('imp_found_hint')) + '</div><div class="list">' + F.found.map(function (x, i) {
          var money = x.kind === 'money';
          var sub = money ? [shortDate(x.date), x.catText, x.payM ? t('pm_' + x.payM) : '', x.dup ? t('imp_dup_money') : ''].filter(Boolean).join(' · ')
            : [x.date ? shortDate(x.date) : t('imp_no_date'), t('imp_lines', { n: x.lines.length }), x.job, x.payM && x.type === 'i' ? t('imp_paid_by', { m: t('pm_' + x.payM) }) : '', x.dup ? t('imp_dup') : ''].filter(Boolean).join(' · ');
          var ttl = money ? (x.dir === 'in' ? t('income') : t('expense')) + ' · ' + (x.desc || x.catText || '?')
            : (x.type === 'q' ? t('quote') : t('invoice')) + ' ' + (x.no || t('imp_new_no')) + ' · ' + x.cName;
          return '<button class="item" data-act="impToggle" data-i="' + i + '"><div class="row"><span class="ttl"><span class="dot ' + (x.on ? (x.dup ? 'wait' : 'ok') : '') + '"></span>' +
            esc(ttl) + '</span><span class="amt ' + (money && x.dir === 'out' ? 'neg' : '') + '">' + esc((money && x.dir === 'out' ? '−' : '') + fmtR(x.total)) + '</span></div>' +
            '<div class="muted' + (x.dup ? ' neg' : '') + '">' + esc(sub) + '</div></button>';
        }).join('') + '</div>' +
        '<div style="margin-top:14px">' + check('impPaid', t('imp_paid')) + '</div>' +
        (F.impPaid ? fld(t('pay_method'), sel('method', PAY_METHODS.map(function (k) { return [k, t('pm_' + k)]; }))) : '') +
        '<div class="hint">' + esc(t('imp_paid_hint')) + '</div>' +
        '<div style="margin-top:14px">' + check('impStock', t('imp_stock')) + '</div><div class="hint">' + esc(t('no_stock_old_hint')) + '</div>' +
        '<div style="margin-top:18px"><button class="primary" data-act="impGo"' + (on.length ? '' : ' disabled') + '>' + esc(t('imp_go', { n: on.length })) + '</button></div>' +
        (nI && !F.impPaid && on.some(function (x) { return x.kind === 'doc' && x.type === 'i' && !x.payM; }) ? '<div class="hint">' + esc(t('imp_unpaid_note')) + '</div>' : '') + '</div>';
    }
    if (F.askDup) {   // pop-up: some of the chosen items are already in the app
      var dups = F.found.filter(function (x) { return x.on && x.dup; });
      h += '<div class="modal" role="dialog" aria-modal="true"><div class="card"><strong>' + esc(t('imp_dup_title', { n: dups.length })) + '</strong>' +
        '<p class="muted" style="margin:8px 0 10px">' + esc(t('imp_dup_q')) + '</p><div class="list" style="max-height:200px;overflow:auto">' + dups.slice(0, 30).map(function (x) {
          return '<div class="item static"><div class="row"><span class="ttl">' + esc(x.kind === 'money' ? (x.desc || x.catText) : (x.no + ' · ' + x.cName)) + '</span><span class="amt">' + esc(fmtR(x.total)) + '</span></div>' +
            '<div class="muted">' + esc(shortDate(x.date)) + '</div></div>';
        }).join('') + (dups.length > 30 ? '<div class="muted">… +' + (dups.length - 30) + '</div>' : '') + '</div>' +
        '<div class="stack" style="margin-top:14px"><button class="primary" data-act="impOnce">' + esc(t('imp_once')) + '</button>' +
        '<button class="secondary" data-act="impTwice">' + esc(t('imp_twice')) + '</button>' +
        '<button class="text" data-act="impCancel">' + esc(t('cancel')) + '</button></div></div></div>';
    }
    app.innerHTML = h;
  }
  function startImport() {
    if (F.found.some(function (x) { return x.on && x.dup; })) { F.askDup = true; return render(); }
    doImport('once');
  }
  function catFromText(dir, text) {
    var s = normT(text);
    if (!s) return dir === 'in' ? 'other_in' : 'other_out';
    var hit = catsFor(dir).filter(function (c) {
      return normT(c.indexOf('c:') === 0 ? c.slice(2) : c) === s || normT(I18N.en['cat_' + c] || '') === s || normT(I18N.af['cat_' + c] || '') === s;
    })[0];
    if (hit) return hit;
    var name = clean(text, 40);
    D.settings.cats[dir].push(name);
    return 'c:' + name;
  }
  function doImport(mode) {
    var made = 0, st = D.settings, prods = {}, nMoney = 0;
    F.askDup = false;
    D.products.forEach(function (p) { prods[p.name.toLowerCase()] = p.id; });
    F.found.forEach(function (x) {
      if (!x.on || (x.dup && mode !== 'twice')) return;
      if (x.kind === 'money') {
        D.money.push({ id: uid(), ts: Date.now() + made, date: x.date, dir: x.dir, amt: x.amt, cat: catFromText(x.dir, x.catText), desc: clean(x.desc, 120) || clean(x.catText, 120),
          party: clean(x.party, 80), ref: x.payM ? t('pm_' + x.payM) : '', vat: 0, imported: true });
        made++; nMoney++;
        return;
      }
      if (!x.tcode && x.town) { var tm = String(x.town).match(/^(.*?)[\s,]+(\d{4})$/); if (tm) { x.town = tm[1]; x.tcode = tm[2]; } }   // "Potchefstroom 2531"
      var c = D.clients.filter(function (y) { return y.name.toLowerCase() === x.cName.toLowerCase(); })[0];
      if (!c) { c = { id: uid(), ts: Date.now(), name: x.cName, phone: '', email: '', addr: '', town: '', code: '', postal: '', vatNo: '', notes: '' }; D.clients.push(c); }
      [['addr', 'addr'], ['town', 'town'], ['tcode', 'code'], ['postal', 'postal'], ['phone', 'phone'], ['email', 'email'], ['vat', 'vatNo']].forEach(function (k) { if (!c[k[1]] && x[k[0]]) c[k[1]] = x[k[0]]; });
      var date = x.date || today(), honey = false;
      var lines = x.lines.map(function (l) {
        var ln = { d: l.d, q: l.q, p: l.p }, pid = prods[l.d.toLowerCase()];
        if (pid) ln.prod = pid;
        if (pid || /heuning|honey/i.test(l.d)) honey = true;
        return ln;
      });
      var no = x.no || nextNo(x.type);
      if (x.dup) { var base = no, k2 = 2; while (D.docs.some(function (d) { return d.type === x.type && String(d.no).toLowerCase() === String(no).toLowerCase(); })) no = base + '-' + k2++; }
      var doc = { id: uid(), ts: Date.now() + made, type: x.type, no: no, awr: x.awr || '', date: date, client: c.id, job: x.job, site: '', lines: lines, travel: null,
        vat: false, vatRate: vatRate(), notes: '', status: 'sent', pays: [], from: '', inv: '', sent: date, showV: 2,
        show: (st.show || SHOW_DEFAULT).filter(function (k) { return k !== 'awr'; }).concat(x.awr ? ['awr'] : []),
        old: true, imported: true, noStock: x.type === 'i' && !F.impStock };
      if (x.type === 'q') doc.valid = addDays(date, +st.quoteDays || 30);
      else { doc.due = addDays(date, +st.payDays || 7); doc.cat = honey ? 'honey' : 'services_in'; }
      if (x.type === 'i' && (F.impPaid || x.payM) && x.total > 0) {
        var pay = { id: uid(), date: date, amt: x.total, method: x.payM || F.method || 'eft', mid: uid() };
        doc.pays = [pay];
        D.money.push({ id: pay.mid, ts: Date.now() + made, date: date, dir: 'in', amt: x.total, cat: doc.cat, desc: t('pay_desc', { no: doc.no, job: doc.job || '' }).replace(/ – $/, ''),
          party: c.name, ref: doc.no, vat: 0, doc: doc.id, pay: pay.id });
      }
      bumpNo(doc.type, doc.no);
      D.docs.push(doc); made++;
    });
    save(); toast(nMoney ? t('imp_done_m', { n: made - nMoney, m: nMoney, next: st.iPrefix + st.nextI }) : t('imp_done', { n: made, next: st.iPrefix + st.nextI }));
    LS.docs.f = 'all';
    if (history.state && history.state.sub) { TAB = 'work'; history.back(); } else showTab('work');
  }
  function importTemplate() {
    var sheets = [{ name: t('imp_sheet'), cols: [{ h: t('number'), w: 10 }, { h: t('type'), w: 10 }, { h: t('date'), w: 12, f: 'date' }, { h: t('client'), w: 22 },
      { h: t('address'), w: 28 }, { h: t('town'), w: 16 }, { h: t('town_code'), w: 9 }, { h: t('contact_no'), w: 14 }, { h: t('email'), w: 22 }, { h: t('vat_no'), w: 12 }, { h: t('job'), w: 20 },
      { h: t('description'), w: 26 }, { h: t('qty'), w: 8, f: 'num2' }, { h: t('price'), w: 10, f: 'money' }, { h: t('imp_pay_col'), w: 12 }, { h: t('order_no'), w: 14 }],
      rows: [['B75', t('invoice'), '2026-10-06', 'Morvet', 'Hoewe 230 Vyfhoek', 'Potchefstroom', '2531', '018 285 1156', '', '', t('honey'), 'Heuning 500g', 24, 75, 'EFT', 'PO 4411'],
             ['B76', t('invoice'), '2026-10-07', 'Spar Potch', '', 'Potchefstroom', '2531', '', '', '', t('honey'), 'Heuning 1kg', 10, 140, ''],
             ['B76', t('invoice'), '2026-10-07', 'Spar Potch', '', 'Potchefstroom', '2531', '', '', '', t('honey'), 'Heuning 500g', 20, 75, ''],
             ['Q12', t('quote'), '2026-10-08', 'Mev. Botha', '12 Kerkstraat', 'Potchefstroom', '2520', '082 000 0000', '', '', t('swarm_removal'), t('svc_d2'), 1, 2500, '']] },
      { name: t('imp_exp_sheet'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('category'), w: 22 }, { h: t('description'), w: 30 }, { h: t('party_out'), w: 20 },
        { h: t('amount'), w: 12, f: 'money' }, { h: t('imp_pay_col'), w: 12 }],
        rows: [['2026-10-02', t('cat_feed'), '50 kg suiker', 'Spar', 1250, 'EFT'], ['2026-10-03', 'Brandstof', 'Diesel', 'Engen', 900, t('pm_cash')]] },
      { name: t('imp_help_sheet'), plain: true, cols: [{ w: 100, f: 'wrap' }], rows: t('imp_help').split('\n').map(function (l) { return [l]; }) }];
    deliver(FX.xlsx(sheets), t('imp_template_file') + '.xlsx');
  }

  /* ================================================================ */
  /* Logbook (the Odometer app, built in): trips with odometer photos  */
  /* ================================================================ */
  var TESS_JS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function fmtKm(n) { return n === '' || n == null || isNaN(n) ? '' : String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function timeNow() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function tripsSorted() {
    return D.trips.slice().sort(function (a, b) {
      return a.date.localeCompare(b.date) || a.startOdo - b.startOdo || (a.startTime || '').localeCompare(b.startTime || '');
    });
  }
  function lastTrip() { var s = tripsSorted(); return s.length ? s[s.length - 1] : null; }
  function tripReasons() { return uniq(tripsSorted().reverse().map(function (x) { return x.reason; }).concat([t('lb_r_hives'), t('lb_r_client'), t('lb_r_buy')]), 8); }
  function tripPlaces() { var l = []; tripsSorted().reverse().forEach(function (x) { l.push(x.to, x.from); }); return uniq(l, 8); }
  function tripsIn(from, to) { return tripsSorted().filter(function (x) { return inRange(x.date, from, to); }); }
  function kmOf(list) { return list.reduce(function (s, x) { return s + (x.endOdo - x.startOdo); }, 0); }

  function logScreen() {
    var h = '', last = lastTrip(), a = D.activeTrip;
    if (a) {
      h += '<div class="card"><span class="pill ok">' + esc(t('lb_in_progress')) + '</span>' +
        '<div class="muted" style="margin-top:12px">' + esc(t('lb_started', { d: niceDate(a.date), tm: a.startTime, f: a.from })) + '</div>' +
        '<div class="odobig">' + fmtKm(a.startOdo) + '<small>km</small></div>' +
        '<div class="stack" style="margin-top:14px"><button class="primary" data-act="tripEnd">' + ico(IC.cam) + esc(t('lb_end')) + '</button>' +
        confirmBtn('tripCancel', 'tripCancel', t('lb_cancel_trip'), t('lb_cancel_again')) + '</div></div>';
    } else {
      h += '<div class="card"><span class="pill">' + esc(t('lb_ready')) + '</span>' +
        (last ? '<div class="muted" style="margin-top:12px">' + esc(t('lb_last_reading')) + '</div><div class="odobig">' + fmtKm(last.endOdo) + '<small>km</small></div>'
          : '<p class="muted" style="margin:12px 0 4px">' + esc(t('lb_no_trips')) + '</p>') +
        '<div style="margin-top:14px"><button class="primary" data-act="tripStart">' + ico(IC.cam) + esc(t('lb_start')) + '</button></div></div>';
    }
    var ty = taxYear(0), mo = today().slice(0, 7), tyKm = kmOf(tripsIn(ty[0], ty[1])), moKm = kmOf(tripsIn(mo + '-01', mo + '-31'));
    var list = tripsSorted().reverse();
    h += '<div class="card"><div class="row"><strong>' + esc(t('lb_trips_n', { n: list.length })) + '</strong>' + addBtn('new', 'data-kind="trip"', t('lb_add_missed')) + '</div>' +
      (list.length ? '<div class="stats">' + stat(t('this_month'), fmtKm(moKm) + ' km') + stat(t('p_this_tax'), fmtKm(tyKm) + ' km') + '</div>' : '');
    if (!list.length) h += empty(t('lb_empty'));
    else h += '<div class="list">' + list.slice(0, LS.trips.n).map(function (x) {
      return '<button class="item" data-act="edit" data-kind="trip" data-id="' + esc(x.id) + '"><div class="row"><span class="ttl">' + esc(x.from + ' → ' + x.to) + '</span>' +
        '<span class="amt">' + fmtKm(x.endOdo - x.startOdo) + ' km</span></div><div class="muted">' + esc([niceDate(x.date), x.reason].filter(Boolean).join(' · ')) + '</div></button>';
    }).join('') + '</div>' + moreBtn('trips', list.length, LS.trips.n);
    h += '</div>';
    h += '<div class="two-btn"><button class="secondary" data-act="tripExport"' + (D.trips.length ? '' : ' disabled') + '>' + ico(IC.down, 18) + esc(t('lb_export')) + '</button>' +
      '<button class="secondary" data-act="tripImport">' + ico(IC.repeat, 18) + esc(t('lb_import')) + '</button></div>';
    var old = odoAppData();
    if (old && old.trips.length && !D.settings.odoImported) h += '<div class="card nudge">' + ico(IC.repeat, 26) + '<div class="grow"><strong>' + esc(t('lb_found_odo', { n: old.trips.length })) + '</strong>' +
      '<div class="muted">' + esc(t('lb_found_odo_sub')) + '</div></div><button class="primary small" data-act="tripTakeOver">' + esc(t('lb_take_over')) + '</button></div>';
    h += '<p class="muted center foot">' + esc(t('lb_foot')) + '</p>';
    return h;
  }

  /* Start / end a trip: odometer reading from a photo or typed */
  function tripBegin(mode) {
    var last = lastTrip();
    openSub('odo', { mode: mode, reading: '', from: mode === 'start' ? (last ? last.to : '') : '', to: '', reason: '', preview: '', candidates: [] });
  }
  function odoScreen() {
    var isEnd = F.mode === 'end', last = lastTrip();
    var h = '<div class="card"><div class="step">' + esc(t(isEnd ? 'lb_end_step1' : 'lb_start')) + '</div>' +
      '<h2 style="margin:4px 0 6px">' + esc(t(isEnd ? 'lb_odo_end' : 'lb_odo_start')) + '</h2>' +
      '<p class="muted" style="margin:0 0 14px">' + esc(t('lb_photo_hint')) + '</p>' +
      '<label class="btn ' + (F.preview ? 'secondary' : 'primary') + '">' + ico(IC.cam) + esc(t(F.preview ? 'retake' : 'take_photo')) +
      '<input id="odoCam" type="file" accept="image/*" capture="environment" class="hidden"></label>' +
      (F.preview ? '<img class="odophoto" src="' + F.preview + '" alt="">' : '');
    if (F.busy) h += '<div class="msg info" style="display:flex;gap:10px;align-items:center;margin-top:14px"><div class="spin"></div><span id="busyLabel">' + esc(F.busyLabel) + '</span></div>';
    else if (F.note) h += '<div class="msg ' + (F.noteKind || 'info') + '" style="margin-top:14px">' + esc(F.note) + '</div>';
    h += fld(t('lb_reading'), '<input class="in odoin" data-k="reading" inputmode="numeric" autocomplete="off" placeholder="123456" value="' + esc(F.reading) + '">');
    var sugg = (F.candidates || []).filter(function (c) { return String(c) !== digits(F.reading); });
    if (sugg.length) h += '<div class="hint">' + esc(t('lb_other_numbers')) + '</div>' + chips('reading', sugg.map(String));
    if (!isEnd && last && digits(F.reading) !== String(last.endOdo)) h += '<div class="hint">' + esc(t('lb_same_as_last')) + '</div>' + chips('reading', [String(last.endOdo)]);
    if (!isEnd) h += fld(t('lb_from_q'), inp('from', { max: 80, ph: t('lb_from_ph') }) + chips('from', tripPlaces()));
    if (F.warn) h += msg('warn', esc(F.warn));
    h += msg('err', F.err);
    h += '<div class="stack" style="margin-top:20px"><button class="primary" data-act="odoNext"' + (F.busy ? ' disabled' : '') + '>' +
      esc(t(isEnd ? 'next_step' : (F.warn ? 'lb_start_anyway' : 'lb_start'))) + '</button><button class="text" data-act="close">' + esc(t('back')) + '</button></div></div>';
    app.innerHTML = h;
  }
  function tripEndScreen() {
    var a = D.activeTrip, end = Number(digits(F.reading)), km = end - a.startOdo;
    var h = '<div class="card"><div class="step">' + esc(t('lb_end_step2')) + '</div>' +
      '<h2 style="margin:4px 0 6px">' + esc(t('lb_km_trip', { n: fmtKm(km) })) + '</h2>' +
      '<p class="muted" style="margin:0">' + esc(t('lb_from_to_odo', { f: a.from, a: fmtKm(a.startOdo), b: fmtKm(end) })) + '</p>' +
      fld(t('lb_reason_q'), inp('reason', { max: 120, ph: t('lb_reason_ph'), focus: 1 }) + chips('reason', tripReasons())) +
      fld(t('lb_to_q'), inp('to', { max: 80, ph: t('lb_to_ph') }) + chips('to', tripPlaces())) + msg('err', F.err) +
      '<div class="stack" style="margin-top:20px"><button class="primary" data-act="tripSave">' + esc(t('lb_save_trip')) + '</button>' +
      '<button class="text" data-act="tripBackToOdo">' + esc(t('back')) + '</button></div></div>';
    app.innerHTML = h;
  }
  function odoNext() {
    F.err = '';
    var n = Number(digits(F.reading)), last = lastTrip();
    if (!n) { F.err = esc(t('lb_err_reading')); return render(); }
    if (F.mode === 'end') {
      var a = D.activeTrip;
      if (n < a.startOdo) { F.err = esc(t('lb_err_lower', { n: fmtKm(a.startOdo) })); return render(); }
      if (n - a.startOdo > 2000 && !F.bigOk) { F.bigOk = true; F.err = esc(t('lb_err_big', { n: fmtKm(n - a.startOdo) })); return render(); }
      V = 'tripend'; render(); window.scrollTo(0, 0); return;
    }
    if (!clean(F.from)) { F.err = esc(t('lb_err_from')); return render(); }
    if (last && n < last.endOdo && !F.warn) { F.warn = t('lb_warn_lower', { n: fmtKm(last.endOdo) }); return render(); }
    D.activeTrip = { startOdo: n, from: clean(F.from, 80), date: today(), startTime: timeNow() };
    save(); toast(t('lb_started_toast')); closeSub();
  }
  function tripSave() {
    F.err = '';
    if (!clean(F.reason)) { F.err = esc(t('lb_err_reason')); return render(); }
    if (!clean(F.to)) { F.err = esc(t('lb_err_to')); return render(); }
    var a = D.activeTrip;
    D.trips.push({ id: uid(), ts: Date.now(), date: a.date, startTime: a.startTime, endTime: timeNow(), from: a.from, to: clean(F.to, 80), reason: clean(F.reason, 120),
      startOdo: a.startOdo, endOdo: Number(digits(F.reading)) });
    D.activeTrip = null;
    save(); toast(t('lb_saved')); closeSub();
  }

  /* Add / edit a trip (the generic form) */
  FORMS.trip = function () {
    return '<div class="two">' + fld(t('date'), inp('date', { type: 'date' })) + '<div></div>' +
      fld(t('lb_start_time'), inp('startTime', { type: 'time' })) + fld(t('lb_end_time'), inp('endTime', { type: 'time' })) +
      fld(t('lb_odo_start_short'), inp('startOdo', { mode: 'numeric', max: 9 })) + fld(t('lb_odo_end_short'), inp('endOdo', { mode: 'numeric', max: 9 })) + '</div>' +
      fld(t('lb_from'), inp('from', { max: 80 }) + chips('from', tripPlaces())) + fld(t('lb_to'), inp('to', { max: 80 }) + chips('to', tripPlaces())) +
      fld(t('lb_reason'), inp('reason', { max: 120 }) + chips('reason', tripReasons()));
  };
  function tripFormSave(old) {
    var so = Number(digits(F.startOdo)), eo = Number(digits(F.endOdo)), e = '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(F.date || '')) e = t('err_date');
    else if (!so || !eo) e = t('lb_err_both');
    else if (eo < so) e = t('lb_err_order');
    else if (!clean(F.from) || !clean(F.to)) e = t('lb_err_fromto');
    else if (!clean(F.reason)) e = t('lb_err_reason');
    if (e) { F.err = esc(e); return render(); }
    var rec = { id: F.id || uid(), ts: old ? old.ts : Date.now(), date: F.date, startTime: F.startTime || '', endTime: F.endTime || '', from: clean(F.from, 80), to: clean(F.to, 80),
      reason: clean(F.reason, 120), startOdo: so, endOdo: eo };
    upsert('trips', rec); save(); toast(t(old ? 'lb_updated' : 'lb_added')); closeSub();
  }

  /* Export (same columns as the Odometer app) */
  function tripExportScreen() {
    var list = tripsIn(F.from, F.to);
    var h = '<div class="card"><strong>' + esc(t('lb_export_title')) + '</strong><p class="muted" style="margin:6px 0 0">' + esc(t('lb_export_sub')) + '</p>' +
      '<div class="chips" style="margin-top:12px">' + presets().map(function (p, i) { return '<button class="chip' + (F.preset === i ? ' on' : '') + '" data-preset="' + i + '">' + esc(t(p[0])) + '</button>'; }).join('') + '</div>' +
      '<div class="two">' + fld(t('from'), inp('from', { type: 'date' })) + fld(t('to'), inp('to', { type: 'date' })) + '</div>' +
      '<div class="stats" id="tx-sum">' + stat(t('lb_trips'), String(list.length)) + stat('km', fmtKm(kmOf(list))) + '</div>' +
      '<div class="stack" style="margin-top:16px"><button class="primary" data-act="tripXls"' + (list.length ? '' : ' disabled') + '>' + ico(IC.down) + esc(t('save_excel')) + '</button>' +
      (canShare ? '<button class="secondary" data-act="tripShare"' + (list.length ? '' : ' disabled') + '>' + ico(IC.share, 18) + esc(t('share_excel')) + '</button>' : '') + '</div></div>';
    app.innerHTML = h;
  }
  function tripSheet(list) {
    return { name: t('lb_sheet'), cols: [{ h: t('date'), w: 12, f: 'date' }, { h: t('lb_from'), w: 24 }, { h: t('lb_to'), w: 24 }, { h: t('lb_reason'), w: 30 },
      { h: t('lb_odo_start_col'), w: 18, f: 'int' }, { h: t('lb_odo_end_col'), w: 18, f: 'int' }, { h: t('lb_distance_col'), w: 14, f: 'int' }, { h: t('lb_start_time'), w: 11 }, { h: t('lb_end_time'), w: 11 }],
      sumCols: [6], totalLabel: t('lb_total_km'),
      rows: list.map(function (x) { return [x.date, x.from, x.to, x.reason, x.startOdo, x.endOdo, x.endOdo - x.startOdo, x.startTime, x.endTime]; }) };
  }
  function tripExport(share) {
    var list = tripsIn(F.from, F.to);
    try { deliver(FX.xlsx([tripSheet(list)]), t('lb_file') + ' ' + (F.from || F.to ? (F.from || 'start') + ' – ' + (F.to || today()) : today()) + '.xlsx', share); }
    catch (e) { console.error(e); toast(t('export_failed') + ' ' + e.message); }
  }

  /* Bring trips over from the Odometer app (same website, so its saved trips can be read) or from its Excel file */
  function odoAppData() {
    try { var d = JSON.parse(localStorage.getItem('odo.v1')); return d && Array.isArray(d.trips) ? d : null; } catch (e) { return null; }
  }
  function tripKey(x) { return x.date + '|' + x.startOdo + '|' + x.endOdo; }
  function addTrips(list, active) {
    var have = {}, n = 0;
    D.trips.forEach(function (x) { have[tripKey(x)] = 1; });
    list.forEach(function (x) {
      var so = Number(digits(x.startOdo)), eo = Number(digits(x.endOdo));
      if (!x.date || !so || !eo || eo < so || have[tripKey({ date: x.date, startOdo: so, endOdo: eo })]) return;
      D.trips.push({ id: uid(), ts: Date.now() + n, date: x.date, startTime: x.startTime || '', endTime: x.endTime || '', from: clean(x.from, 80), to: clean(x.to, 80),
        reason: clean(x.reason, 120), startOdo: so, endOdo: eo });
      have[tripKey({ date: x.date, startOdo: so, endOdo: eo })] = 1; n++;
    });
    if (active && !D.activeTrip) D.activeTrip = { startOdo: Number(active.startOdo), from: active.from, date: active.date, startTime: active.startTime };
    return n;
  }
  function takeOverOdo() {
    var d = odoAppData();
    if (!d) return;
    var n = addTrips(d.trips, d.active);
    D.settings.odoImported = true; save();
    toast(t('lb_took_over', { n: n })); render();
  }
  function tripImportFile(file) {
    if (!file) return;
    var rd = new FileReader();
    rd.onload = function () {
      var p = /\.(csv|txt)$/i.test(file.name) ? Promise.resolve(FX.readCsv(String(rd.result))) : FX.readXlsx(rd.result);
      p.then(function (sheets) {
        var list = [];
        sheets.forEach(function (sh) {
          var hdr = -1, c = {};
          var KEYS = { date: ['date', 'datum'], from: ['from', 'van', 'vanaf'], to: ['to', 'na', 'tot'], reason: ['reason for trip', 'reason', 'rede', 'rede vir rit', 'doel'],
            so: ['odometer start km', 'odometer start', 'odo start', 'begin km', 'odometer begin'], eo: ['odometer end km', 'odometer end', 'odo end', 'eind km', 'odometer einde'],
            st: ['start time', 'begintyd'], et: ['end time', 'eindtyd'] };
          for (var i = 0; i < Math.min(sh.rows.length, 10) && hdr < 0; i++) {
            var cc = {};
            sh.rows[i].forEach(function (v, j) { Object.keys(KEYS).forEach(function (k) { if (cc[k] == null && KEYS[k].indexOf(normT(v)) > -1) cc[k] = j; }); });
            if (cc.date != null && cc.so != null && cc.eo != null) { hdr = i; c = cc; }
          }
          if (hdr < 0) return;
          sh.rows.slice(hdr + 1).forEach(function (r) {
            var tm = function (v) { return typeof v === 'number' && v < 1 ? pad(Math.floor(v * 24)) + ':' + pad(Math.round(v * 1440) % 60) : cellStr(v); };
            list.push({ date: cellDate(r[c.date]), from: cellStr(r[c.from]), to: cellStr(r[c.to]), reason: cellStr(r[c.reason]), startOdo: r[c.so], endOdo: r[c.eo],
              startTime: c.st != null ? tm(r[c.st]) : '', endTime: c.et != null ? tm(r[c.et]) : '' });
          });
        });
        if (!list.length) { toast(t('lb_import_none')); return; }
        var n = addTrips(list); save(); toast(t('lb_imported', { n: n, s: list.length - n })); render();
      }).catch(function (e) { console.error(e); toast(t('imp_bad')); });
    };
    if (/\.(csv|txt)$/i.test(file.name)) rd.readAsText(file); else rd.readAsArrayBuffer(file);
  }

  /* Photo → reading (Tesseract OCR on the phone, downloaded once and kept offline) */
  var ocrWorker = null, ocrLoading = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error(t('lb_ocr_offline'))); };
      document.head.appendChild(s);
    });
  }
  function ocrReady() { try { return localStorage.getItem('bb.ocrReady') === '1' || localStorage.getItem('odo.ocrReady') === '1'; } catch (e) { return false; } }
  function getOcr() {
    if (ocrWorker) return Promise.resolve(ocrWorker);
    if (!ocrLoading) {
      ocrLoading = (window.Tesseract ? Promise.resolve() : loadScript(TESS_JS)).then(function () {
        return window.Tesseract.createWorker('eng', 1, { workerPath: 'ocr-worker.js', workerBlobURL: false, logger: onOcrProgress });
      }).then(function (w) {
        return w.setParameters({ tessedit_char_whitelist: '0123456789.,', tessedit_pageseg_mode: '11' }).then(function () {
          ocrWorker = w; try { localStorage.setItem('bb.ocrReady', '1'); } catch (e) {}
          return w;
        });
      }).catch(function (e) { ocrLoading = null; throw e; });
    }
    return ocrLoading;
  }
  function onOcrProgress(m) {
    if (!F || !F.busy) return;
    var el = document.getElementById('busyLabel'); if (!el) return;
    var pct = m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '';
    if (/load|initializ/i.test(m.status) && !ocrReady()) el.textContent = t('lb_ocr_download') + pct;
    else if (/recogniz/i.test(m.status)) el.textContent = t('lb_ocr_reading') + pct;
  }
  function withTimeout(p, ms, m) {
    return new Promise(function (resolve, reject) {
      var tm = setTimeout(function () { reject(new Error(m)); }, ms);
      p.then(function (v) { clearTimeout(tm); resolve(v); }, function (e) { clearTimeout(tm); reject(e); });
    });
  }
  function prepPhoto(file) {
    return loadImage(file).then(function (img) {
      var max = 1600, w = img.naturalWidth, hh = img.naturalHeight, k = Math.min(1, max / Math.max(w, hh));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k);
      var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
      var preview = c.toDataURL('image/jpeg', 0.7);
      var id = ctx.getImageData(0, 0, c.width, c.height), px = id.data, lo = 255, hi = 0, i, g;   // grayscale + stretch contrast
      for (i = 0; i < px.length; i += 4) { g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = g; if (g < lo) lo = g; if (g > hi) hi = g; }
      var range = Math.max(1, hi - lo);
      for (i = 0; i < px.length; i += 4) { g = (px[i] - lo) * 255 / range; px[i] = px[i + 1] = px[i + 2] = g; }
      ctx.putImageData(id, 0, 0);
      return { preview: preview, canvas: c };
    });
  }
  function inverted(src) {
    var c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    var ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0);
    var id = ctx.getImageData(0, 0, c.width, c.height), px = id.data;
    for (var i = 0; i < px.length; i += 4) { px[i] = 255 - px[i]; px[i + 1] = 255 - px[i + 1]; px[i + 2] = 255 - px[i + 2]; }
    ctx.putImageData(id, 0, 0); return c;
  }
  function onOdoPhoto(file) {
    if (!file || !F) return;
    var flow = F, canvas, hint = flow.mode === 'end' ? D.activeTrip.startOdo : (lastTrip() ? lastTrip().endOdo : null);
    flow.note = ''; flow.err = ''; flow.warn = '';
    prepPhoto(file).then(function (p) {
      flow.preview = p.preview; canvas = p.canvas; flow.busy = true;
      flow.busyLabel = ocrReady() ? t('lb_ocr_reading') : t('lb_ocr_download');
      if (F === flow) render();
      return withTimeout(getOcr(), 120000, t('lb_ocr_slow'));
    }).then(function (w) {
      return w.recognize(canvas).then(function (r) {
        var pk = pickReading(r.data.text, hint);
        if (pk.best) return pk;
        return w.recognize(inverted(canvas)).then(function (r2) { return pickReading(r2.data.text, hint); });
      });
    }).then(function (pk) {
      flow.candidates = pk.candidates;
      if (pk.best) { flow.reading = String(pk.best); flow.note = t('lb_ocr_check'); flow.noteKind = 'info'; }
      else { flow.note = t('lb_ocr_fail'); flow.noteKind = 'warn'; }
    }).catch(function (e) {
      flow.note = (e && e.message ? e.message : '') + ' ' + t('lb_ocr_type'); flow.noteKind = 'warn';
    }).then(function () { flow.busy = false; if (F === flow) render(); });
  }
  // Picks the most likely odometer number from the photo text, using the last reading as a hint (from the Odometer app)
  function pickReading(text, hint) {
    var FIX = { O: '0', o: '0', D: '0', Q: '0', U: '0', I: '1', l: '1', '|': '1', i: '1', L: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9', T: '7' };
    var scores = {};
    function score(v, len, kmLine) {
      var s = 0;
      if (len === 5 || len === 6) s += 20; else if (len === 4 || len === 7) s += 10;
      if (kmLine) s += 15;
      if (hint) {
        if (v >= hint && v - hint <= 3000) s += 100 - (v - hint) / 30;
        else if (v >= hint && v - hint <= 20000) s += 40;
        else if (v < hint) s -= 30;
      }
      return s;
    }
    function add(d, bonus, kmLine) {
      d = String(d).replace(/^0+(?=\d)/, '');
      if (d.length < 3 || d.length > 7) return;
      var v = parseInt(d, 10); if (!v) return;
      var s = bonus + score(v, d.length, kmLine);
      if (!(v in scores) || scores[v] < s) scores[v] = s;
    }
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var kmLine = /km|odo|total/i.test(line);
      var toks = line.split(/\s+/).filter(Boolean).map(function (tk) {
        var dg = (tk.match(/\d/g) || []).length, an = tk.replace(/[^A-Za-z0-9|]/g, '').length;
        if (dg >= 2 && dg * 2 >= an) tk = tk.replace(/[ODQUIl|iLSsBZzGbgqT]/g, function (ch) { return FIX[ch]; });
        return tk;
      });
      toks.forEach(function (tk, i) {
        var bare = tk.replace(/km$/i, '');
        if (/^\d{1,3}([,.'’]\d{3})+$/.test(bare)) add(bare.replace(/\D/g, ''), 5, kmLine);
        else if (/^\d+[.,]\d$/.test(tk)) add(tk.split(/[.,]/)[0], -30, kmLine);
        else (tk.match(/\d+/g) || []).forEach(function (d) { add(d, 0, kmLine); });
        var nx = toks[i + 1];
        if (/^\d{1,3}$/.test(tk) && nx && /^\d{3}$/.test(nx.replace(/km$/i, ''))) add(tk + nx.replace(/km$/i, ''), 5, kmLine);
      });
      var run = '';
      toks.concat(['|end|']).forEach(function (tk) {
        if (/^\d$/.test(tk)) { run += tk; return; }
        if (run.length >= 4) add(run, 5, kmLine);
        run = '';
      });
    });
    var ranked = Object.keys(scores).map(function (k) { return { v: Number(k), s: scores[k] }; }).sort(function (a, b) { return b.s - a.s || b.v - a.v; });
    return { best: ranked.length ? ranked[0].v : null, candidates: ranked.slice(0, 5).map(function (x) { return x.v; }) };
  }

  /* ================================================================ */
  /* Events                                                            */
  /* ================================================================ */
  function liveUpdate(k) {
    if (V === 'form' && F) {
      var amtN = num(F.amt), el;
      if ((k === 'amt') && (el = document.getElementById('live-vat'))) el.innerHTML = vatLine(amtN);
      if ((k === 'amt' || k === 'l') && (el = document.getElementById('live-ppl'))) el.innerHTML = pplLine(num(F.l), amtN);
      if (F.kind === 'bottle' && k === 'n' && !F.litresTyped) {
        var bp = find('products', F.product), bn = num(F.n);
        if (bp && bp.size && !isNaN(bn) && (el = document.getElementById('f-litres'))) { F.litres = numIn(r2(bn * bp.size)); el.value = F.litres; }
      }
      if (F.kind === 'bottle' && k === 'litres') F.litresTyped = true;
      if (F.kind === 'bottle' && k === 'n' && (el = document.getElementById('live-bl'))) el.innerHTML = bottleCalc();
      if (F.kind === 'doc' && k === 'awr') {   // typing an AWR ticks it on the checklist, clearing it unticks it
        var has = !!clean(F.awr), sh = F.show || (F.show = []), ix = sh.indexOf('awr');
        if (has && ix < 0) sh.push('awr'); else if (!has && ix > -1) sh.splice(ix, 1);
        var chip = document.querySelector('[data-multi=show][data-v=awr]'); if (chip) chip.classList.toggle('on', has);
      }
      if (F.kind === 'doc') {
        var m = /^l(\d+)[qp]$/.exec(k);
        if (m && (el = document.getElementById('live-l' + m[1]))) el.textContent = fmtR(lineVal(+m[1]));
        if ((m || k === 'km' || k === 'kmRate') && (el = document.getElementById('live-tot'))) el.innerHTML = totalsHtml();
      }
    }
    if (V === 'tripx' && (k === 'from' || k === 'to')) {
      F.preset = -1;
      document.querySelectorAll('[data-preset]').forEach(function (b) { b.classList.remove('on'); });
      var tl = tripsIn(F.from, F.to);
      document.getElementById('tx-sum').innerHTML = stat(t('lb_trips'), String(tl.length)) + stat('km', fmtKm(kmOf(tl)));
      document.querySelectorAll('[data-act=tripXls],[data-act=tripShare]').forEach(function (b) { b.disabled = !tl.length; });
    }
    if (V === 'reports' && (k === 'from' || k === 'to')) {
      F.preset = -1;
      document.querySelectorAll('[data-preset]').forEach(function (b) { b.classList.remove('on'); });
      var s = summary(F.from, F.to);
      document.getElementById('rsum').innerHTML = reportSummaryHtml(s, D.settings.vat);
      document.getElementById('hrep').outerHTML = honeyCard();
      var none = !hasAny(s);
      document.querySelectorAll('[data-act=xls],[data-act=pdf],[data-act=shareXls],[data-act=sharePdf]').forEach(function (b) { b.disabled = none; });
    }
  }
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'dsearch') {
      LS.diary.q = el.value;
      var pos = el.selectionStart;
      diaryList();
      var n = document.getElementById('dsearch'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {}
      return;
    }
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !F || el.type === 'checkbox' || el.tagName === 'SELECT') return;
    F[k] = el.value;
    if (k === 'reading') { F.warn = ''; F.bigOk = false; }
    liveUpdate(k);
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'restoreFile') { restoreFile(el.files && el.files[0]); return; }
    if (el.id === 'odoCam') { onOdoPhoto(el.files && el.files[0]); el.value = ''; return; }
    if (el.id === 'tripFile') { tripImportFile(el.files && el.files[0]); el.value = ''; return; }
    if (el.id === 'importFile') { readImportFile(el.files && el.files[0]); el.value = ''; return; }
    if (el.id === 'logoIn' || el.id === 'logo2In') { if (el.files && el.files[0]) setLogo(el.files[0], el.id === 'logo2In' ? 2 : 1); return; }
    if ((el.id === 'camIn' || el.id === 'galIn') && F) {
      var file = el.files && el.files[0];
      if (!file) return;
      shrinkPhoto(file).then(function (b) {
        F.newPhoto = b; F.photoSrc = URL.createObjectURL(b); F.photoRemoved = false; F.photoLater = false;
        render(); toast(t('photo_added'));
      }).catch(function () { toast(t('err_photo')); });
      return;
    }
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !F) return;
    if (el.type === 'checkbox') F[k] = el.checked;
    else F[k] = el.value;
    if (k === 'cat' && F.kind === 'money' && F.cat !== '__new' && !F.id) F.vatIncl = !NO_VAT_DEFAULT[F.cat];
    if (F.kind === 'doc' && (k === 'due' || k === 'valid')) F.datesTyped = true;
    if (F.kind === 'doc' && k === 'date' && F.date && !F.datesTyped && !F.id) {
      F.due = addDays(F.date, +D.settings.payDays || 7); F.valid = addDays(F.date, +D.settings.quoteDays || 30);
      if (!F.paidDate || F.old) F.paidDate = F.paidDate || F.date;
      return render();
    }
    if (k === 'travelOn' && F.travelOn && !F.kmRate && D.settings.kmRate) F.kmRate = numIn(D.settings.kmRate);
    if (k.indexOf('clr') === 0) { confirmKey = ''; return render(); }
    if (el.getAttribute('data-rr')) render();
    else liveUpdate(k);
  });
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-chip]');
    if (chip && F) {
      var k = chip.getAttribute('data-chip');
      F[k] = chip.getAttribute('data-v');
      if (k === 'dir' && F.kind === 'money') { var cs = catsFor(F.dir); if (cs.indexOf(F.cat) < 0) F.cat = cs[0]; F.vatIncl = !NO_VAT_DEFAULT[F.cat]; }
      if (k === 'lang') { D.settings.lang = F.lang; if (D.settings.setup) save(); }
      if (k === 'reading') { F.warn = ''; F.bigOk = false; F.note = ''; }
      if (k === 'product' && F.kind === 'bottle' && !F.litresTyped) { var bp = find('products', F.product), bn = num(F.n); if (bp && bp.size && !isNaN(bn)) F.litres = numIn(r2(bn * bp.size)); }
      return render();
    }
    var mul = e.target.closest('[data-multi]');
    if (mul && F) {
      var mk = mul.getAttribute('data-multi'), v = mul.getAttribute('data-v'), arr = F[mk] || (F[mk] = []), i = arr.indexOf(v);
      if (i > -1) arr.splice(i, 1); else arr.push(v);
      return render();
    }
    var pre = e.target.closest('[data-preset]');
    if (pre && F) {
      var p = presets()[+pre.getAttribute('data-preset')];
      F.preset = +pre.getAttribute('data-preset'); F.from = p[1]; F.to = p[2];
      return render();
    }
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    if (btn.tagName === 'A' && !btn.getAttribute('href')) e.preventDefault();
    if (btn.tagName === 'A' && btn.getAttribute('href') === '#') e.preventDefault();
    var act = btn.getAttribute('data-act'), id = btn.getAttribute('data-id');
    var keepConfirm = act === 'deleteForm' || act === 'wipe' || act === 'clearRec' || act === 'delCat' || act === 'logoRm' || act === 'tripCancel';
    if (!keepConfirm) confirmKey = '';
    switch (act) {
      case 'tab': if (!isTab(V) && history.state && history.state.sub) { TAB = btn.getAttribute('data-tab'); history.back(); } else showTab(btn.getAttribute('data-tab')); break;
      case 'close': closeSub(); break;
      case 'new': openNew(btn.getAttribute('data-kind'), { dir: btn.getAttribute('data-dir') }); break;
      case 'hiveNew': openNew(btn.getAttribute('data-kind'), { hive: id }); break;
      case 'clientDoc': openNew('doc', { dir: btn.getAttribute('data-dir'), client: id }); break;
      case 'inspAgain': openNew('insp', { hive: id }); break;
      case 'careDone':
        var cx = find('care', id);
        if (!cx) break;
        openNew('care', { hive: cx.hive });
        Object.assign(F, { ctype: cx.type, product: cx.product, qty: cx.qty });
        render(); break;
      case 'hive': if (V === 'hive' && F.id === id) break; openSub('hive', { id: id }); break;
      case 'import': if (V !== 'import') openSub('import', {}); break;
      case 'impToggle': var ix = F.found[+btn.getAttribute('data-i')]; if (ix) { ix.on = !ix.on; render(); } break;
      case 'impGo': startImport(); break;
      case 'impOnce': doImport('once'); break;
      case 'impTwice': doImport('twice'); break;
      case 'impCancel': F.askDup = false; render(); break;
      case 'impTemplate': importTemplate(); break;
      case 'dmode':
        LS.diary.mode = btn.getAttribute('data-v'); render();
        if (LS.diary.mode === 'log' && navigator.onLine && !ocrReady()) setTimeout(function () { getOcr().catch(function () {}); }, 1500);   // fetch the photo reader once, while there is signal
        break;
      case 'tripStart': tripBegin('start'); break;
      case 'tripEnd': if (!D.activeTrip) break; if (V !== 'diary') { TAB = 'diary'; LS.diary.mode = 'log'; } tripBegin('end'); break;
      case 'tripCancel':
        if (confirmKey !== 'tripCancel') { confirmKey = 'tripCancel'; return render(); }
        confirmKey = ''; D.activeTrip = null; save(); toast(t('lb_discarded')); render(); break;
      case 'odoNext': odoNext(); break;
      case 'tripSave': tripSave(); break;
      case 'tripBackToOdo': V = 'odo'; F.err = ''; render(); break;
      case 'tripExport': var tp = presets()[2]; openSub('tripx', { preset: 2, from: tp[1], to: tp[2] }); break;
      case 'tripXls': tripExport(false); break;
      case 'tripShare': tripExport(true); break;
      case 'tripImport': document.getElementById('tripFile').click(); break;
      case 'tripTakeOver': takeOverOdo(); break;
      case 'oldDoc': openNew('doc', { dir: btn.getAttribute('data-dir'), old: true }); break;
      case 'bottleNew': openNew('bottle', { product: id }); break;
      case 'take':
        var tv = +btn.getAttribute('data-v');
        if (F.takes[id] === tv) delete F.takes[id]; else F.takes[id] = tv;
        if (!F.first && F.takes[id]) F.first = id;
        if (F.first && !F.takes[F.first]) F.first = Object.keys(F.takes).filter(function (h) { return F.takes[h]; })[0] || '';
        render(); break;
      case 'pickPlace':
        var pp = places()[+btn.getAttribute('data-v')];
        if (pp) { F.place = pp.p; if (pp.g) F.gps = pp.g; }
        render(); break;
      case 'addProd':
        if (BULK[id]) { addLine(t(BULK[id]), 0, id); F['l' + (F.n - 1) + 'q'] = ''; render(); break; }
        var pd = find('products', id);
        if (pd) { addLine(pd.name, pd.price, pd.id); render(); }
        break;
      case 'client': if (V === 'client' && F.id === id) break; openSub('client', { id: id }); break;
      case 'doc': if (V === 'doc' && F.id === id) break; openSub('doc', { id: id }); break;
      case 'fuelv': openSub('fuelv', {}); break;
      case 'pending': if (V !== 'pending') openSub('pending', {}); break;
      case 'dfilter': LS.docs.f = btn.getAttribute('data-v'); render(); break;
      case 'docStatus': setDocStatus(btn.getAttribute('data-v')); break;
      case 'toInvoice': toInvoice(); break;
      case 'copyDoc': var cd = find('docs', F.id); if (cd) openNew('doc', { dir: cd.type, copy: cd }); break;
      case 'docPdf': exportDoc(false); break;
      case 'docShare': exportDoc(true); break;
      case 'payNew': payForm(F.id); break;
      case 'payEdit': payForm(F.id, id); break;
      case 'addSvc':
        var sv = D.settings.svcs.filter(function (x) { return x.id === id; })[0];
        if (sv) { addLine(sv.name, sv.price); render(); }
        break;
      case 'addLine': addLine('', 0); render(); break;
      case 'rmLine': rmLine(+btn.getAttribute('data-i')); render(); break;
      case 'nextIn': F.next = addDays(F.date || today(), +btn.getAttribute('data-v')); render(); break;
      case 'gps':
        if (!navigator.geolocation) { toast(t('gps_failed')); break; }
        toast(t('gps_wait'));
        navigator.geolocation.getCurrentPosition(function (pos) {
          if (V !== 'form' || !F) return;
          F.gps = pos.coords.latitude.toFixed(5) + ', ' + pos.coords.longitude.toFixed(5); render(); toast(t('gps_ok'));
        }, function () { toast(t('gps_failed')); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
        break;
      case 'logoRm':
        var lk = btn.getAttribute('data-v') === '2' ? 'logo2' : 'logo';
        if (confirmKey !== lk) { confirmKey = lk; return render(); }
        confirmKey = ''; D.settings[lk] = ''; D.settings[lk + 'W'] = 0; D.settings[lk + 'H'] = 0; save(); render(); break;
      case 'rmPhoto': F.photoRemoved = true; F.newPhoto = null; F.photoSrc = null; render(); break;
      case 'viewPhoto': showPhoto(btn.getAttribute('src')); break;
      case 'edit': openEdit(btn.getAttribute('data-kind'), id); break;
      case 'saveForm': saveForm(); break;
      case 'deleteForm': deleteForm(); break;
      case 'finishSetup': finishSetup(); break;
      case 'mprev': case 'mnext':
        var view = btn.getAttribute('data-view');
        LS[view].ym = addMonths(LS[view].ym, act === 'mprev' ? -1 : 1); render(); break;
      case 'mfilter': LS.money.dir = btn.getAttribute('data-v'); render(); break;
      case 'more': LS[btn.getAttribute('data-view')].n += 30; render(); break;
      case 'reports': if (V !== 'reports') openReports(); break;
      case 'settings': if (V === 'settings') break; openSub('settings', { to: btn.getAttribute('data-to') || '' }); break;
      case 'saveSettings': saveSettings(); break;
      case 'xls': exportFile('xlsx'); break;
      case 'hpdf': exportHoney('pdf'); break;
      case 'hxls': exportHoney('xlsx'); break;
      case 'hshare': exportHoney('pdf', true); break;
      case 'pdf': exportFile('pdf'); break;
      case 'shareXls': exportFile('xlsx', true); break;
      case 'sharePdf': exportFile('pdf', true); break;
      case 'backup': backup(); break;
      case 'restorePick': restorePick(); break;
      case 'applyRestore': applyRestore(); break;
      case 'cancelRestore': pendingRestore = null; F.restoreN = null; render(); break;
      case 'icsFile': reminderIcs(); break;
      case 'icsGoogle': reminderGoogle(); break;
      case 'delCat':
        var key = 'cat:' + btn.getAttribute('data-dir') + btn.getAttribute('data-v');
        if (confirmKey !== key) { confirmKey = key; return render(); }
        var dir = btn.getAttribute('data-dir'), name = btn.getAttribute('data-v');
        D.settings.cats[dir] = D.settings.cats[dir].filter(function (n) { return n !== name; });
        confirmKey = ''; save(); render(); break;
      case 'wipe':
        if (confirmKey !== 'wipe') { confirmKey = 'wipe'; return render(); }
        D = blank(); save(); photoClear(); photoUrls = {}; confirmKey = '';
        if (history.state && history.state.sub) history.back();
        F = null; V = 'home'; TAB = 'home'; render(); break;
      case 'clearRec': clearRecords(); break;
      case 'install': doInstall(); break;
    }
  });

  function showPhoto(src) {
    var v = document.createElement('div');
    v.className = 'viewer';
    v.innerHTML = '<img src="' + src + '" alt=""><button class="icon close" aria-label="' + esc(t('close')) + '">✕</button>';
    v.addEventListener('click', function () { v.remove(); });
    document.body.appendChild(v);
  }

  /* Install button (Android Chrome / desktop Chrome & Edge) */
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e;
    var b = document.getElementById('installBtn'); if (b) b.classList.remove('hidden');
  });
  function doInstall() {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.finally(function () {
      installEvt = null;
      var b = document.getElementById('installBtn'); if (b) b.classList.add('hidden');
    });
  }
  window.addEventListener('appinstalled', function () { toast(t('installed')); });

  /* Offline support */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  /* Re-check reminders when the app comes back to the front */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !D || !D.settings.setup) return;
    var n = runRecurring();
    if (V === 'home' || (n && isTab(V))) render();
  });

  /* ================================================================ */
  /* Start                                                             */
  /* ================================================================ */
  loadData().then(function (d) {
    D = normalise(d);
    history.replaceState({ root: 1 }, '');
    if (D.settings.setup) runRecurring();
    render();
  });

  // for automated tests only
  window.__BB = { get: function () { return D; }, pdf: function (id) { return buildDocPdf(find('docs', id)); }, xlsx: function () { F = F || {}; return buildExcel(); }, report: function () { return buildPdf(); } };
})();
