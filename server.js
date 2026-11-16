// 미니 배틀그라운드 - 권위 서버 (Node.js + ws)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const WebSocket = require('ws');
const S = require('./shared.js');
const PORT = process.env.PORT || 3000;
const TICK = 1000 / 30;

const MAPS = { br: S.genMap(7), ex: S.genMap(11) };
const MAPSER = { br: S.serialize(MAPS.br), ex: S.serialize(MAPS.ex) };

// ───────── 정적 파일 ─────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (u === '/map/br' || u === '/map/ex') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }); return res.end(MAPSER[u.slice(5)]); }
  if (u === '/') u = '/index.html';
  const file = u === '/shared.js' ? path.join(__dirname, 'shared.js') : path.join(__dirname, 'public', path.normalize(u).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server, perMessageDeflate: { threshold: 1024 } });

// ───────── 유틸 ─────────
const rand = (a, b) => a + Math.random() * (b - a), randi = (a, b) => Math.floor(rand(a, b + 1)), pick = a => a[Math.floor(Math.random() * a.length)];
const angN = a => { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; };
const hyp = Math.hypot;
const r1 = n => Math.round(n), r2 = n => Math.round(n * 100) / 100;
const wpick = tbl => { let s = 0; for (const k in tbl) s += tbl[k]; let r = Math.random() * s; for (const k in tbl) { r -= tbl[k]; if (r <= 0) return k; } return Object.keys(tbl)[0]; };
const BOTNAMES = ['꽥꽥이', '오리왕', '치킨러버', '뉴비오리', '저격장인', '풀숲매복', '배낭털이', '야생오리', '총알피함', '급식오리', '자기장러너', '구급상자', '보급헌터', '산책중', '삼층집', '포탈러', '창문킬러', '샷건맨', '연막도사', '섬광탄싫어'];

function newW(id, base) { const w = { id, att: {}, base: base || null, mag: 0 }; w.st = S.stats(w); w.mag = w.st.mag; return w; }
function restat(w) { w.st = S.stats(w); }
function wscore(w) { if (!w) return 0; const s = w.st; return s.dmg * s.pel * 1000 / s.iv * Math.min(1, s.rng / 700) * (s.scope ? 1.2 : 1); }

// 루팅 테이블
function rollLoot(tier, mode) {
  const ex = mode === 'ex';
  const cat = wpick(tier === 0 ? { w: 18, am: 22, ar: 6, med: 4, band: 14, gren: 5, flash: 4, smoke: 3, fuel: 6, att: 8, val: ex ? 10 : 0 }
    : tier === 1 ? { w: 22, am: 22, ar: 10, med: 7, band: 10, gren: 6, flash: 5, smoke: 4, fuel: 4, att: 12, val: ex ? 14 : 0 }
      : { w: 26, am: 18, ar: 14, med: 8, band: 6, gren: 7, flash: 5, smoke: 4, fuel: 3, att: 16, val: ex ? 18 : 0 });
  if (cat === 'w') {
    const id = wpick(tier === 0 ? { pistol: 20, smg: 10, sg: 7, ar: 4, dmr: 1 } : tier === 1 ? { pistol: 4, smg: 9, sg: 6, ar: 9, dmr: 4, lmg: 2, sniper: 1 } : { smg: 4, sg: 4, ar: 9, dmr: 7, lmg: 5, sniper: 4 });
    return { k: 'w', w: newW(id) };
  }
  if (cat === 'am') { const t = pick(['light', 'light', 'rifle', 'rifle', 'shell', 'sniper']); return { k: 'am', d: t, n: t === 'sniper' ? randi(5, 10) : t === 'shell' ? randi(6, 14) : randi(20, 40) }; }
  if (cat === 'ar') { const l = tier === 0 ? (Math.random() < .85 ? 1 : 2) : tier === 1 ? (Math.random() < .55 ? 1 : Math.random() < .85 ? 2 : 3) : (Math.random() < .5 ? 2 : 3); return { k: 'ar', d: l, n: S.ARMOR[l].dur }; }
  if (cat === 'att') return { k: 'att', d: pick(Object.keys(S.ATT)) };
  if (cat === 'val') { const i = Math.min(S.VALUABLES.length - 1, Math.floor(Math.random() * Math.random() * (S.VALUABLES.length + tier))); return { k: 'val', d: i, n: S.VALUABLES[i][1] }; }
  return { k: cat, n: 1 };
}

// ───────── 방 ─────────
let nextRoomId = 1;
const rooms = new Map(), clients = new Map();
const ZPH = [[100, 50, 2400], [70, 40, 1500], [55, 35, 900], [40, 30, 500], [30, 25, 240], [20, 20, 60], [20, 25, 0]];
const ZDPS = [0.6, 1.2, 2.2, 4, 7, 11, 16, 22];

class Room {
  constructor(opts, host) {
    this.id = nextRoomId++; this.name = (opts.name || '미니 배그 방').slice(0, 20); this.mode = opts.mode === 'ex' ? 'ex' : 'br';
    this.ts = [1, 2, 4].includes(+opts.ts) ? +opts.ts : 1; this.host = host; this.members = new Set(); this.st = 'lobby'; this.created = Date.now(); this.cd = null;
  }
  humans() { return [...this.members].map(id => clients.get(id)).filter(Boolean); }
  info() {
    const h = this.humans();
    return { t: 'room', id: this.id, name: this.name, mode: this.mode, ts: this.ts, host: this.host, st: this.st, cd: this.cd ? Math.max(0, this.cd - Date.now()) : null, age: Date.now() - this.created, players: h.map(c => ({ id: c.id, name: c.name, skin: c.skin })) };
  }
  broadcastInfo() { const m = JSON.stringify(this.info()); for (const c of this.humans()) send(c, m); }
  lobbyTick() {
    const n = this.members.size, now = Date.now();
    if (n >= S.MINP && !this.cd) { this.cd = now + 15000; this.msgAll('5명 이상 모였습니다! 15초 후 자동 시작'); }
    if (n < S.MINP && this.cd && !this.botStart) this.cd = null;
    if (n > 0 && n < S.MINP && !this.cd && now - this.created > 90000) { this.cd = now + 10000; this.botStart = true; this.msgAll('인원이 부족해 10초 후 봇을 채워 시작합니다'); }
    if (this.cd && now >= this.cd) this.begin();
    this.broadcastInfo();
  }
  msgAll(txt) { const m = JSON.stringify({ t: 'msg', txt }); for (const c of this.humans()) send(c, m); }

  // ───── 게임 시작 ─────
  begin() {
    this.st = 'play'; this.cd = null; this.botStart = false;
    const M = this.M = MAPS[this.mode]; const ex = this.mode === 'ex';
    this.time = 0; this.pre = 5000; this.tick = 0; this.nid = 1; this.ents = []; this.bullets = []; this.grens = []; this.smokes = []; this.items = new Map(); this.veh = []; this.drops = []; this.evs = []; this.ended = false;
    const humans = this.humans();
    const list = [];
    for (const c of humans) list.push({ c, name: c.name, skin: c.skin, bot: false });
    const total = ex ? humans.length + 6 : 20;
    while (list.length < total) list.push({ bot: true, name: pick(BOTNAMES) + randi(1, 99), skin: S.cleanSkin({ body: pick(Object.keys(S.BODIES).filter(b => b !== 'goldduck')), hat: pick(Object.keys(S.HATS)), col: pick(Object.keys(S.COLORS)), face: pick(Object.keys(S.FACES)), glove: pick(Object.keys(S.GLOVES)), bag: pick(Object.keys(S.BAGS)), gskin: pick(Object.keys(S.GSKINS)) }), kind: ex ? 'pmc' : 'br' });
    list.forEach((o, i) => {
      const e = this.mkEnt(o.name, o.bot, Math.floor(i / this.ts), o.skin);
      if (o.c) { o.c.eid = e.id; e.cid = o.c.id; } else this.mkAI(e, o.kind);
    });
    if (ex) for (let i = 0; i < 18; i++) { const e = this.mkEnt('스캐브' + (i + 1), true, 9999, S.cleanSkin({ body: pick(['man', 'woman', 'dog', 'bear']), hat: pick(['cap', 'beret', 'beanie', 'none']), col: 'camo', face: pick(['mask', 'none', 'gasmask']), glove: 'tactical', bag: 'mil', gskin: 'none' })); this.mkAI(e, 'scav'); }
    this.spawnAll();
    // 아이템
    for (const l of M.loot) { if (Math.random() < (ex ? .8 : .7)) this.addItem(l.x, l.y, l.f, rollLoot(l.tier, this.mode), true); }
    // 차량
    for (const v of M.vehSpots) if (Math.random() < .75) this.veh.push({ id: this.nid++, x: v.x, y: v.y, a: v.a, v: 0, fuel: randi(25, 100), hp: 100, seats: [null, null, null, null] });
    // 자기장
    if (!ex) { this.z = { cx: S.CX, cy: S.CY, r: 3700, ph: 0, st: 'wait', t: 0 }; this.nextZone(); }
    else { this.z = null; this.exOpen = false; this.exts = M.extracts.slice().sort(() => Math.random() - .5).slice(0, 3); this.dropTimes = [240000]; }
    if (!ex) this.dropTimes = [80000, 190000, 300000, 400000];
    const roster = this.ents.map(e => ({ id: e.id, name: e.name, team: e.team, skin: e.skin, bot: e.bot ? 1 : 0 }));
    const items = [...this.items.values()].map(it => this.itemArr(it));
    for (const c of humans) send(c, JSON.stringify({ t: 'start', mode: this.mode, ts: this.ts, you: c.eid, roster, items, veh: this.veh.map(v => this.vehArr(v)), exts: this.exts || null, pre: this.pre }));
    this.broadcastInfo();
  }
  mkEnt(name, bot, team, skin) {
    const e = { id: this.nid++, name, bot, team, skin, x: 0, y: 0, f: 0, a: 0, hp: 100, arL: 0, arD: 0, st: 'a', w: [null, null], cw: 0, am: { light: 0, rifle: 0, shell: 0, sniper: 0 }, it: { med: 0, band: 1, gren: 0, flash: 0, fuel: 0, smoke: 0 }, bag: [], val: 0,
      mx: 0, my: 0, fire: false, pfire: false, aim: false, rec: 0, rb: 0, lastShot: -1e9, nextShot: 0, rlEnd: 0, rlOn: false, crUntil: 0, crCd: 0, act: null, car: null, flash: 0, kills: 0, place: 0, plock: -1, tpCd: 0, spec: null, exT: 0, moving: false, dmgT: 0 };
    e.w[0] = newW('pistol'); e.am.light = this.mode === 'ex' ? 12 : 24;
    this.ents.push(e); return e;
  }
  mkAI(e, kind) {
    e.ai = { kind, nt: 0, goal: null, tgt: null, react: 0, fireUntil: 0, pauseUntil: 0, strafe: 1, flip: 0, last: { x: 0, y: 0 }, unstick: 0, ux: 0, uy: 0, err: kind === 'scav' ? .15 : kind === 'pmc' ? .07 : .11 };
    if (kind === 'scav') { e.hp = 80; e.w[0] = newW(pick(['pistol', 'smg', 'sg', 'pistol'])); e.am.light = 60; e.am.shell = 20; e.it.band = 1; }
    if (kind === 'pmc') { e.w[0] = newW(pick(['ar', 'dmr', 'smg', 'lmg'])); e.w[0].att.stock = 'stock'; restat(e.w[0]); e.arL = 2; e.arD = S.ARMOR[2].dur; e.am.rifle = 120; e.am.light = 60; e.it.med = 1; e.it.gren = 1; e.val = randi(200, 900); }
  }
  freeSpot(x, y, r) { const p = { x, y }; S.resolve(this.M, p, r || S.PR, 0); return hyp(p.x - x, p.y - y) < 1 && !S.inBld(this.M, x, y); }
  randSpot(rmin, rmax, avoid, md) {
    for (let i = 0; i < 400; i++) {
      const a = rand(0, 6.283), d = rand(rmin, rmax), x = S.CX + Math.cos(a) * d, y = S.CY + Math.sin(a) * d;
      if (!this.freeSpot(x, y, 24)) continue;
      if (avoid && avoid.some(p => hyp(p.x - x, p.y - y) < md)) continue;
      return { x, y };
    }
    return { x: S.CX, y: S.CY };
  }
  spawnAll() {
    const ex = this.mode === 'ex', used = [], teams = {};
    for (const e of this.ents) {
      let p;
      if (e.ai && e.ai.kind === 'scav') { const t = pick(this.M.towns); p = this.randSpot(0, 1, null); for (let i = 0; i < 100; i++) { const x = t.x + rand(-500, 500), y = t.y + rand(-500, 500); if (this.freeSpot(x, y, 24)) { p = { x, y }; break; } } }
      else if (teams[e.team]) { const b = teams[e.team]; p = { x: b.x + rand(-70, 70), y: b.y + rand(-70, 70) }; if (!this.freeSpot(p.x, p.y)) p = { x: b.x, y: b.y }; }
      else { p = ex ? this.randSpot(3000, 3500, used, 900) : this.randSpot(300, 3400, used, 500); teams[e.team] = p; used.push(p); }
      e.x = p.x; e.y = p.y; e.a = Math.atan2(S.CY - p.y, S.CX - p.x);
    }
  }
  addItem(x, y, f, o, silent) {
    const it = { id: this.nid++, x, y, f, k: o.k, d: o.d, n: o.n || 1, w: o.w || null };
    this.items.set(it.id, it); if (!silent) this.evs.push({ e: 'ia', it: this.itemArr(it), g: 1 }); return it;
  }
  remItem(it) { this.items.delete(it.id); this.evs.push({ e: 'ir', id: it.id, g: 1 }); }
  itemArr(it) { return it.k === 'w' ? [it.id, r1(it.x), r1(it.y), it.f, 'w', it.w.id, 1, it.w.st.n, it.w.st.c, Object.values(it.w.att).length] : [it.id, r1(it.x), r1(it.y), it.f, it.k, it.d === undefined ? null : it.d, it.n]; }
  vehArr(v) { return [v.id, r1(v.x), r1(v.y), r2(v.a), r1(v.fuel), r1(v.hp), v.seats.filter(Boolean).length, r1(v.v)]; }
  byId(id) { return this.ents.find(e => e.id === id); }
  alive(e) { return e && (e.st === 'a' || e.st === 'd'); }

  // ───── 자기장 ─────
  nextZone() {
    const z = this.z, p = ZPH[Math.min(z.ph, ZPH.length - 1)];
    const tr = p[2], maxOff = Math.max(0, z.r - tr) * .85;
    let tx = z.cx, ty = z.cy;
    for (let i = 0; i < 50; i++) { const a = rand(0, 6.283), d = Math.sqrt(Math.random()) * maxOff, x = z.cx + Math.cos(a) * d, y = z.cy + Math.sin(a) * d; if (hyp(x - S.CX, y - S.CY) < S.ISLAND - tr - 50 || tr < 100) { tx = x; ty = y; if (!this.M.lakes.some(l => hyp(l.x - x, l.y - y) < l.r)) break; } }
    Object.assign(z, { tcx: tx, tcy: ty, tr, fcx: z.cx, fcy: z.cy, fr: z.r, st: 'wait', t: this.time, wait: p[0] * 1000, shrink: p[1] * 1000 });
  }
  updZone() {
    const z = this.z; if (!z) return;
    const el = this.time - z.t;
    if (z.st === 'wait' && el >= z.wait) { z.st = 'shrink'; z.t = this.time; this.evs.push({ e: 'msg', txt: '⚠ 자기장이 줄어듭니다!', g: 1 }); }
    else if (z.st === 'shrink') {
      const k = Math.min(1, el / z.shrink);
      z.cx = z.fcx + (z.tcx - z.fcx) * k; z.cy = z.fcy + (z.tcy - z.fcy) * k; z.r = z.fr + (z.tr - z.fr) * k;
      if (k >= 1) { if (z.ph < ZPH.length - 1) { z.ph++; this.nextZone(); this.evs.push({ e: 'msg', txt: `다음 안전구역 표시됨 (페이즈 ${z.ph + 1})`, g: 1 }); } else z.st = 'final'; }
    }
  }

  // ───── 메인 업데이트 ─────
  update(dt) {
    this.tick++;
    if (this.pre > 0) { this.pre -= dt * 1000; if (this.tick % 2 === 0) this.snapshot(); return; }
    this.time += dt * 1000; const now = this.time;
    this.updZone();
    // 보급
    while (this.dropTimes.length && now >= this.dropTimes[0]) { this.dropTimes.shift(); this.spawnDrop(); }
    if (this.mode === 'ex') {
      if (!this.exOpen && now >= 120000) { this.exOpen = true; this.evs.push({ e: 'msg', txt: '🚁 탈출 지점이 열렸습니다! (지도 확인)', g: 1 }); }
      if (now >= 600000) { for (const e of this.ents) if (this.alive(e) && !e.bot) this.finish(e, 'mia'); }
    }
    for (const e of this.ents) if (this.alive(e)) this.updEnt(e, dt, now);
    this.updVeh(dt, now); this.updGren(dt, now); this.updBullets(dt, now);
    this.smokes = this.smokes.filter(s => s.until > now);
    for (const d of this.drops) if (!d.landed && now >= d.land) { d.landed = true; this.evs.push({ e: 'msg', txt: '📦 보급 상자가 착지했습니다!', g: 1 }); }
    this.checkEnd(now);
    if (this.tick % 2 === 0) this.snapshot();
  }
  spawnDrop() {
    let x = S.CX, y = S.CY;
    const z = this.z, cx = z ? z.tcx : S.CX, cy = z ? z.tcy : S.CY, rr = z ? Math.max(100, z.tr * .8) : 2500;
    for (let i = 0; i < 200; i++) { const a = rand(0, 6.283), d = Math.sqrt(Math.random()) * rr; const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d; if (this.freeSpot(px, py, 40)) { x = px; y = py; break; } }
    const d = { id: this.nid++, x, y, land: this.time + 20000, landed: false, open: false };
    this.drops.push(d);
    const dir = S.dirName(Math.atan2(y - S.CY, x - S.CX));
    this.evs.push({ e: 'drop', x: r1(x), y: r1(y), g: 1 }, { e: 'msg', txt: `✈ 보급 투하! 지도 ${dir}쪽 (20초 후 착지)`, g: 1 });
  }
  openDrop(d) {
    d.open = true;
    const gid = pick(['sniper', 'lmg', 'dmr', 'sniper']); const w = newW(gid); w.att.scope = 'scope'; w.att.stock = 'stock'; restat(w); w.mag = w.st.mag;
    const loot = [{ k: 'w', w }, { k: 'ar', d: 3, n: S.ARMOR[3].dur }, { k: 'med', n: 2 }, { k: 'am', d: w.st.am, n: w.st.am === 'sniper' ? 20 : 90 }, { k: 'gren', n: 2 }, { k: 'att', d: pick(['comp', 'emag', 'lbar', 'sup']) }, { k: 'smoke', n: 1 }];
    if (this.mode === 'ex') loot.push({ k: 'val', d: 5, n: S.VALUABLES[5][1] });
    loot.forEach((o, i) => { const a = i / loot.length * 6.283; this.addItem(d.x + Math.cos(a) * 45, d.y + Math.sin(a) * 45, 0, o); });
  }

  zoneOut(e) { const z = this.z; return z && hyp(e.x - z.cx, e.y - z.cy) > z.r; }
  canSee(v, o) {
    if (o.f !== v.f) return false;
    const dx = o.x - v.x, dy = o.y - v.y, d = hyp(dx, dy);
    if (d < 50) return true;
    if (d > S.VIS) { const st = v.w[v.cw] && v.w[v.cw].st; if (!(st && st.scope && d < S.VIS_SCOPE && Math.abs(angN(Math.atan2(dy, dx) - v.a)) < S.SCOPE_CONE)) return false; }
    if (!S.los(this.M, v.x, v.y, o.x, o.y, v.f)) return false;
    for (const s of this.smokes) { if (hyp(v.x - s.x, v.y - s.y) < s.r && d > 90) return false; if (S.segCircle(v.x, v.y, o.x, o.y, s.x, s.y, s.r * .85) < 1) return false; }
    return true;
  }
  spMul(e, now) {
    if (e.act) return 0;
    const st = e.w[e.cw] && e.w[e.cw].st; let s = S.SPEED * (st ? st.mv : 1);
    if (e.st === 'd') s *= .25; if (now < e.crUntil) s *= .55; if (now < e.flash) s *= .8;
    return s;
  }
  updEnt(e, dt, now) {
    if (e.ai) this.botThink(e, dt, now);
    if (e.car) { const v = this.veh.find(v => v.id === e.car); if (v) { e.x = v.x; e.y = v.y; } e.pfire = e.fire; return; }
    // 이동
    let mx = e.mx, my = e.my; const m = hyp(mx, my); if (m > 1) { mx /= m; my /= m; }
    const sp = this.spMul(e, now);
    e.moving = m > .1 && sp > 0;
    if (sp > 0 && m > .05) { const p = { x: e.x + mx * sp * dt, y: e.y + my * sp * dt }; S.resolve(this.M, p, S.PR, e.f); e.x = p.x; e.y = p.y; }
    if (e.act && m > .3 && e.act.k !== 'med' && e.act.k !== 'band') { /* 이동 입력은 무시 (가만히) */ }
    // 반동 회복
    const w = e.w[e.cw];
    if (w && now - e.lastShot > 140) { e.rec = Math.max(0, e.rec - w.st.rr * dt); e.rb *= Math.pow(.1, dt); }
    // 재장전 완료
    if (e.rlOn && now >= e.rlEnd) { e.rlOn = false; if (w) { const need = w.st.mag - w.mag, take = Math.min(need, e.am[w.st.am]); w.mag += take; e.am[w.st.am] -= take; } }
    // 사격
    if (e.fire && e.st === 'a') this.tryFire(e, now);
    e.pfire = e.fire;
    // 행동 완료
    if (e.act && now >= e.act.end) this.finishAct(e, now);
    // 포탈
    if (!e.bot) this.portals(e, now);
    // 자동 줍기
    this.autoPick(e);
    // 자기장
    if (this.zoneOut(e)) { e.zAcc = (e.zAcc || 0) + ZDPS[this.z.ph] * dt; if (e.zAcc >= 1) { const d = Math.floor(e.zAcc); e.zAcc -= d; this.damage(e, d, null, 'zone', true); } }
    // 기절 출혈
    if (e.st === 'd') { e.hp -= 1.3 * dt; if (e.hp <= 0) this.kill(e, e.downBy ? this.byId(e.downBy) : null, '출혈'); }
    // 탈출
    if (this.mode === 'ex' && this.exOpen && e.st === 'a' && !e.bot) {
      const x = this.exts.find(x => hyp(x.x - e.x, x.y - e.y) < x.r);
      if (x) { e.exT += dt; if (e.exT >= 7) this.finish(e, 'extract'); } else e.exT = 0;
    }
  }
  portals(e, now) {
    let on = -1;
    for (const p of this.M.portals) {
      if (p.f !== e.f || hyp(p.x - e.x, p.y - e.y) > p.r) continue;
      on = p.id;
      if (e.plock === p.id) break;
      if (p.kind === 'tp' && now < e.tpCd) break;
      e.x = p.tx; e.y = p.ty; e.f = p.tf; if (e.act) e.act = null;
      const dest = this.M.portals.find(q => q.f === p.tf && hyp(q.x - p.tx, q.y - p.ty) < 2);
      e.plock = dest ? dest.id : -1; on = e.plock;
      if (p.kind === 'tp') { e.tpCd = now + 5000; this.evs.push({ e: 'tp', x: r1(p.x), y: r1(p.y), x2: r1(p.tx), y2: r1(p.ty) }); }
      return;
    }
    if (on === -1) e.plock = -1;
  }
  autoPick(e) {
    for (const it of this.items.values()) {
      if (it.f !== e.f || Math.abs(it.x - e.x) > 30 || Math.abs(it.y - e.y) > 30) continue;
      if (it.k === 'am') { const cap = it.d === 'sniper' ? 40 : it.d === 'shell' ? 60 : 300; if (e.am[it.d] >= cap) continue; e.am[it.d] += it.n; }
      else if (S.ITEMCAP[it.k]) { if (e.it[it.k] >= S.ITEMCAP[it.k]) continue; e.it[it.k] = Math.min(S.ITEMCAP[it.k], e.it[it.k] + it.n); }
      else if (it.k === 'val') { e.val += it.n; e.vals = (e.vals || 0) + 1; }
      else if (it.k === 'ar') { if (it.d < e.arL || (it.d === e.arL && it.n <= e.arD)) continue; if (e.arL > 0 && e.arD > 5) this.addItem(e.x + rand(-20, 20), e.y + rand(-20, 20), e.f, { k: 'ar', d: e.arL, n: e.arD }); e.arL = it.d; e.arD = it.n; }
      else if (it.k === 'att') { if (!this.giveAtt(e, it.d)) continue; }
      else if (it.k === 'w') { if (!e.bot) continue; const empty = e.w.indexOf(null); if (empty >= 0) e.w[empty] = it.w; else { const wi = wscore(e.w[0]) < wscore(e.w[1]) ? 0 : 1; if (wscore(it.w) <= wscore(e.w[wi]) * 1.1) continue; this.dropW(e, wi); e.w[wi] = it.w; } }
      else continue;
      this.remItem(it); if (!e.bot) this.evs.push({ e: 'pick', to: e.id, k: it.k, d: it.d, n: it.n });
    }
  }
  giveAtt(e, id) {
    const a = S.ATT[id];
    for (const i of [e.cw, 1 - e.cw]) { const w = e.w[i]; if (w && !w.att[a.slot]) { w.att[a.slot] = id; restat(w); return true; } }
    if (e.bot) return false;
    if (e.bag.length >= 6) return false; e.bag.push(id); return true;
  }
  dropW(e, i) {
    const w = e.w[i]; if (!w) return; e.w[i] = null;
    this.addItem(e.x + rand(-15, 15), e.y + rand(-15, 15), e.f, { k: 'w', w });
    if (e.cw === i && e.w[1 - i]) e.cw = 1 - i; e.rlOn = false;
  }
  tryFire(e, now) {
    const w = e.w[e.cw]; if (!w || e.act || now < e.crUntil || e.rlOn || now < e.nextShot) return;
    const st = w.st;
    if (!st.auto && e.pfire) return;
    if (w.mag <= 0) { this.reload(e, now); return; }
    w.mag--; e.nextShot = now + st.iv; e.lastShot = now;
    for (let i = 0; i < st.pel; i++) {
      const err = (st.sp + e.rec) * (Math.random() * 2 - 1) * Math.PI / 180;
      const a = e.a + err + e.rb;
      this.bullets.push({ id: this.nid++, o: e.id, team: e.team, x: e.x + Math.cos(e.a) * 18, y: e.y + Math.sin(e.a) * 18, vx: Math.cos(a) * st.spd, vy: Math.sin(a) * st.spd, f: e.f, dmg: st.dmg, rng: st.rng, trav: 0, wn: st.n });
    }
    e.rec = Math.min(st.rmax, e.rec + st.rc);
    e.rb = Math.max(-.06, Math.min(.06, e.rb + (Math.random() - .45) * st.rc * .004));
    this.evs.push({ e: 'shot', x: r1(e.x), y: r1(e.y), f: e.f, sil: st.sil, id: e.id, w: w.id });
    if (w.mag <= 0) this.reload(e, now);
  }
  reload(e, now) {
    const w = e.w[e.cw]; if (!w || e.rlOn || w.mag >= w.st.mag || e.am[w.st.am] <= 0) return;
    e.rlOn = true; e.rlEnd = now + w.st.rl;
  }
  startAct(e, k, dur, target) { if (e.act || e.st !== 'a' || e.car) return; e.act = { k, end: this.time + dur, dur, target }; e.rlOn = false; }
  finishAct(e, now) {
    const a = e.act; e.act = null;
    if (a.k === 'med' && e.it.med > 0) { e.it.med--; e.hp = Math.min(100, e.hp + 75); }
    else if (a.k === 'band' && e.it.band > 0) { e.it.band--; e.hp = Math.min(100, e.hp + 20); }
    else if (a.k === 'revive') { const t = this.byId(a.target); if (t && t.st === 'd' && hyp(t.x - e.x, t.y - e.y) < 80) { t.st = 'a'; t.hp = 35; this.evs.push({ e: 'msg', txt: `${e.name} → ${t.name} 소생!`, to: t.id }); } }
    else if (a.k === 'open') { const d = this.drops.find(d => d.id === a.target); if (d && !d.open) this.openDrop(d); }
    else if (a.k === 'fuel') { const v = this.veh.find(v => v.id === a.target); if (v && e.it.fuel > 0) { e.it.fuel--; v.fuel = Math.min(100, v.fuel + 45); } }
  }
  damage(v, amt, src, wn, zone, bx, by) {
    if (!this.alive(v)) return;
    if (!zone && v.arL > 0 && v.arD > 0) { const red = S.ARMOR[v.arL].red, ab = Math.min(v.arD, amt * red); v.arD -= ab; amt -= ab; if (v.arD <= 0) { v.arL = 0; v.arD = 0; } }
    v.hp -= amt; v.dmgT = this.time;
    if (src && src !== v) { this.evs.push({ e: 'hit', to: src.id, d: Math.round(amt), x: r1(v.x), y: r1(v.y) }); v.lastHitBy = src.id; if (v.ai && !v.ai.tgt) { v.ai.tgt = src.id; v.ai.react = this.time + 250; } }
    if (bx !== undefined) this.evs.push({ e: 'hurt', to: v.id, x: r1(bx), y: r1(by) });
    if (v.act && (v.act.k === 'revive' || v.act.k === 'open')) v.act = null;
    if (v.hp > 0) return;
    if (v.st === 'a' && this.ts > 1 && this.ents.some(o => o !== v && o.team === v.team && o.st === 'a')) {
      v.st = 'd'; v.hp = 60; v.act = null; v.rlOn = false; v.downBy = src ? src.id : null;
      if (v.car) this.exitCar(v);
      this.evs.push({ e: 'kill', a: src ? src.name : '자기장', b: v.name, w: wn, down: 1, g: 1 });
      return;
    }
    this.kill(v, src, wn);
  }
  kill(v, src, wn) {
    if (v.car) this.exitCar(v);
    v.st = 'x'; v.act = null; v.hp = 0;
    if (src && src !== v && src.team !== v.team) src.kills++;
    this.evs.push({ e: 'kill', a: src ? src.name : (wn === 'zone' ? '자기장' : '???'), b: v.name, w: wn === 'zone' ? '자기장' : wn, g: 1 });
    // 루팅 드랍
    const drops = [];
    v.w.forEach(w => w && drops.push({ k: 'w', w }));
    for (const k in v.am) if (v.am[k] > 0) drops.push({ k: 'am', d: k, n: v.am[k] });
    for (const k in v.it) if (v.it[k] > 0) drops.push({ k, n: v.it[k] });
    if (v.arL && v.arD > 5) drops.push({ k: 'ar', d: v.arL, n: Math.round(v.arD) });
    if (v.val > 0) drops.push({ k: 'val', d: 4, n: v.val });
    v.bag.forEach(a => drops.push({ k: 'att', d: a }));
    drops.forEach((o, i) => { const a = i / drops.length * 6.283; const p = { x: v.x + Math.cos(a) * 30, y: v.y + Math.sin(a) * 30 }; S.resolve(this.M, p, 8, v.f); this.addItem(p.x, p.y, v.f, o); });
    v.w = [null, null]; v.am = { light: 0, rifle: 0, shell: 0, sniper: 0 }; v.val = 0; v.bag = [];
    for (const k in v.it) v.it[k] = 0;
    // 팀 전멸 처리 (기절 팀원도 사망)
    const mates = this.ents.filter(o => o.team === v.team && o !== v);
    if (!mates.some(o => o.st === 'a')) for (const o of mates) if (o.st === 'd') this.kill(o, src, wn);
    if (!this.ents.some(o => o.team === v.team && this.alive(o))) {
      const place = this.aliveTeams().size + 1;
      for (const o of this.ents) if (o.team === v.team && !o.place) o.place = place;
    }
    v.spec = src && this.alive(src) ? src.id : null;
    if (!v.bot) this.finish(v, 'dead');
  }
  finish(e, res) {
    if (res === 'mia') { e.st = 'x'; }
    if (res === 'extract') { e.st = 'e'; if (e.car) this.exitCar(e); }
    const c = clients.get(e.cid); if (!c) return;
    send(c, JSON.stringify({ t: 'result', res, place: e.place || this.aliveTeams().size + 1, kills: e.kills, val: e.val, vals: e.vals || 0, time: Math.round(this.time / 1000), mode: this.mode }));
  }
  aliveTeams() { const s = new Set(); for (const e of this.ents) if (this.alive(e) && e.team !== 9999) s.add(e.team); return s; }
  checkEnd(now) {
    if (this.ended) return;
    const humansAlive = this.ents.some(e => !e.bot && this.alive(e));
    if (this.mode === 'br') {
      const teams = this.aliveTeams();
      if (teams.size <= 1) {
        this.ended = true;
        for (const e of this.ents) if (this.alive(e)) { e.place = 1; if (!e.bot) this.finish(e, 'win'); }
        const w = this.ents.find(e => this.alive(e));
        this.evs.push({ e: 'msg', txt: w ? `🏆 ${w.name} 팀 치킨 획득!` : '게임 종료', g: 1 });
        this.endAt = now + 6000;
      } else if (!humansAlive) { this.ended = true; this.endAt = now + 4000; }
    } else if (!humansAlive) { this.ended = true; this.endAt = now + 4000; }
  }

  // ───── 차량 ─────
  board(e, v) { const s = v.seats.indexOf(null); if (s < 0) return; v.seats[s] = e.id; e.car = v.id; e.act = null; e.rlOn = false; }
  exitCar(e) {
    const v = this.veh.find(v => v.id === e.car); e.car = null; if (!v) return;
    const s = v.seats.indexOf(e.id); if (s >= 0) v.seats[s] = null;
    const side = v.a + (s % 2 ? -1 : 1) * Math.PI / 2; const p = { x: v.x + Math.cos(side) * 45, y: v.y + Math.sin(side) * 45 }; S.resolve(this.M, p, S.PR, 0); e.x = p.x; e.y = p.y; e.f = 0;
  }
  updVeh(dt, now) {
    for (const v of this.veh) {
      if (v.dead) continue;
      const drv = v.seats[0] && this.byId(v.seats[0]);
      if (drv && v.fuel > 0) {
        const m = Math.min(1, hyp(drv.mx, drv.my));
        if (m > .2) {
          const ta = Math.atan2(drv.my, drv.mx), da = angN(ta - v.a);
          if (Math.abs(da) < 2.2) { const turn = 2.4 * dt * Math.min(1, Math.abs(v.v) / 140 + .25); v.a += Math.max(-turn, Math.min(turn, da)); v.v += 320 * dt * m * (Math.abs(da) < 1.3 ? 1 : .3); }
          else v.v -= 300 * dt * m;
        }
      }
      v.v *= Math.pow(.55, dt); const max = v.hp > 30 ? 560 : 360; v.v = Math.max(-160, Math.min(max, v.v));
      if (Math.abs(v.v) < 2) { v.v = 0; continue; }
      v.fuel = Math.max(0, v.fuel - Math.abs(v.v) / 560 * dt * .9);
      const nx = v.x + Math.cos(v.a) * v.v * dt, ny = v.y + Math.sin(v.a) * v.v * dt;
      const p = { x: nx, y: ny }; S.resolve(this.M, p, 30, 0);
      const off = hyp(p.x - nx, p.y - ny);
      if (off > 1.5 && Math.abs(v.v) > 150) { v.hp -= Math.abs(v.v) * .03; v.v *= .35; } else if (off > 1.5) v.v *= .7;
      v.x = p.x; v.y = p.y;
      // 치기
      if (Math.abs(v.v) > 110) for (const e of this.ents) {
        if (!this.alive(e) || e.car || e.f !== 0) continue; const d = hyp(e.x - v.x, e.y - v.y);
        if (d < 46) { const drv2 = drv; if (drv2 && drv2.team === e.team) continue; this.damage(e, Math.abs(v.v) * .11, drv2 || null, '차량', false, v.x, v.y); const q = { x: v.x + (e.x - v.x) / (d || 1) * 50, y: v.y + (e.y - v.y) / (d || 1) * 50 }; S.resolve(this.M, q, S.PR, 0); e.x = q.x; e.y = q.y; v.v *= .8; }
      }
      if (v.hp <= 0) this.explodeVeh(v, drv);
    }
    this.veh = this.veh.filter(v => !v.dead || now - v.deadT < 15000);
  }
  explodeVeh(v, by) {
    v.dead = true; v.deadT = this.time; v.v = 0;
    for (const id of v.seats) if (id) { const e = this.byId(id); if (e) { this.exitCar(e); this.damage(e, 70, by, '차량 폭발', true); } }
    this.explosion(v.x, v.y, 0, 150, 80, by, '차량 폭발');
  }
  explosion(x, y, f, rad, dmg, src, wn) {
    this.evs.push({ e: 'boom', x: r1(x), y: r1(y), f, r: rad });
    for (const e of this.ents) { if (!this.alive(e) || e.f !== f) continue; const d = hyp(e.x - x, e.y - y); if (d < rad && S.los(this.M, x, y, e.x, e.y, f)) this.damage(e, dmg * (1 - d / rad) + 10, src, wn, false, x, y); }
    for (const v of this.veh) if (!v.dead && f === 0 && hyp(v.x - x, v.y - y) < rad) { v.hp -= dmg * .5; if (v.hp <= 0) this.explodeVeh(v, src); }
  }
  // ───── 투척물 ─────
  throwG(e, k) {
    if (e.it[k] <= 0 || e.st !== 'a' || e.car || e.act) return;
    e.it[k]--;
    const sp = 520;
    this.grens.push({ id: this.nid++, k, x: e.x + Math.cos(e.a) * 20, y: e.y + Math.sin(e.a) * 20, vx: Math.cos(e.a) * sp, vy: Math.sin(e.a) * sp, f: e.f, t: this.time + (k === 'smoke' ? 1500 : 2200), o: e.id });
  }
  updGren(dt, now) {
    for (const g of this.grens) {
      const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt; const t = S.ray(this.M, g.x, g.y, nx, ny, g.f);
      if (t < 1) { g.x += (nx - g.x) * t * .8; g.y += (ny - g.y) * t * .8; g.vx *= -.35; g.vy *= -.35; } else { g.x = nx; g.y = ny; }
      const p = { x: g.x, y: g.y }; S.resolve(this.M, p, 5, g.f); g.x = p.x; g.y = p.y;
      const fr = Math.pow(.18, dt); g.vx *= fr; g.vy *= fr;
      if (now >= g.t) {
        g.done = true; const src = this.byId(g.o);
        if (g.k === 'gren') this.explosion(g.x, g.y, g.f, 175, 115, src, '수류탄');
        else if (g.k === 'flash') {
          this.evs.push({ e: 'flashb', x: r1(g.x), y: r1(g.y), f: g.f });
          for (const e of this.ents) { if (!this.alive(e) || e.f !== g.f) continue; const d = hyp(e.x - g.x, e.y - g.y); if (d < 430 && S.los(this.M, g.x, g.y, e.x, e.y, g.f)) { const facing = Math.abs(angN(Math.atan2(g.y - e.y, g.x - e.x) - e.a)) < 1.3; e.flash = now + (facing ? 3800 : 1800) * (1 - d / 430 * .5); } }
        } else if (g.k === 'smoke') this.smokes.push({ id: g.id, x: g.x, y: g.y, r: 150, f: g.f, until: now + 14000 });
      }
    }
    this.grens = this.grens.filter(g => !g.done);
  }
  updBullets(dt, now) {
    for (const b of this.bullets) {
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      let best = S.ray(this.M, b.x, b.y, nx, ny, b.f), hit = null, hv = null;
      for (const e of this.ents) {
        if (e.id === b.o || e.f !== b.f || !this.alive(e) || e.car || e.team === b.team) continue;
        if (now < e.crUntil) continue; // 숙이기 회피
        const t = S.segCircle(b.x, b.y, nx, ny, e.x, e.y, S.PR + 2); if (t < best) { best = t; hit = e; hv = null; }
      }
      if (b.f === 0) for (const v of this.veh) { if (v.dead) continue; const t = S.segCircle(b.x, b.y, nx, ny, v.x, v.y, 28); if (t < best) { best = t; hv = v; hit = null; } }
      const seg = hyp(nx - b.x, ny - b.y);
      const travAt = b.trav + seg * Math.min(1, best);
      let dmg = b.dmg; if (travAt > b.rng * .6) dmg *= 1 - .45 * Math.min(1, (travAt - b.rng * .6) / (b.rng * .4));
      if (hit) { const src = this.byId(b.o); this.damage(hit, dmg, src, b.wn, false, b.x, b.y); b.dead = true; }
      else if (hv) { hv.hp -= dmg * .5; if (hv.hp <= 0) this.explodeVeh(hv, this.byId(b.o)); else { const rid = hv.seats.find(Boolean); if (rid && Math.random() < .3) { const r = this.byId(rid); r && r.team !== b.team && this.damage(r, dmg * .5, this.byId(b.o), b.wn); } } b.dead = true; }
      else if (best < 1) { b.dead = true; this.evs.push({ e: 'spark', x: r1(b.x + (nx - b.x) * best), y: r1(b.y + (ny - b.y) * best), f: b.f }); }
      b.x = nx; b.y = ny; b.trav += seg; if (b.trav > b.rng) b.dead = true;
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  // ───── 봇 AI ─────
  botThink(e, dt, now) {
    const B = e.ai;
    if (e.st === 'd') { e.fire = false; const mate = this.ents.find(o => o.team === e.team && o.st === 'a'); if (mate) { const a = Math.atan2(mate.y - e.y, mate.x - e.x); e.mx = Math.cos(a); e.my = Math.sin(a); } return; }
    if (now >= B.nt) {
      B.nt = now + rand(180, 320);
      let best = null, bd = 1e9;
      for (const o of this.ents) {
        if (o === e || o.team === e.team || !this.alive(o) || o.f !== e.f || o.car) continue;
        const d = hyp(o.x - e.x, o.y - e.y); if (d > 620 || d >= bd) continue;
        if (!this.canSee(e, o)) continue; best = o; bd = d;
      }
      if (best && (!B.tgt || B.tgt !== best.id)) { if (!B.tgt) B.react = now + rand(300, 650) * (B.kind === 'scav' ? 1.4 : 1); B.tgt = best.id; }
      if (!best && B.tgt) { const t = this.byId(B.tgt); if (!t || !this.alive(t) || hyp(t.x - e.x, t.y - e.y) > 900) B.tgt = null; else if (!this.canSee(e, t)) { B.goal = { x: t.x, y: t.y }; B.tgt = null; } }
      // 치료
      if (!B.tgt && e.hp < 55 && !e.act) { if (e.it.med) this.startAct(e, 'med', 4000); else if (e.it.band && e.hp < 80) this.startAct(e, 'band', 1500); }
      // 목표 결정
      const z = this.z;
      if (z && (hyp(e.x - z.tcx, e.y - z.tcy) > z.tr * .9 && (z.st === 'shrink' || this.zoneOut(e) || hyp(e.x - z.cx, e.y - z.cy) > z.r - 300))) {
        if (!B.goal || !B.zg) { const a = rand(0, 6.283), d = Math.random() * z.tr * .6; B.goal = { x: z.tcx + Math.cos(a) * d, y: z.tcy + Math.sin(a) * d }; B.zg = true; }
      } else if (!B.goal || hyp(B.goal.x - e.x, B.goal.y - e.y) < 40) {
        B.zg = false; let it = null, id = 420;
        for (const i of this.items.values()) { if (i.f !== 0) continue; const d = hyp(i.x - e.x, i.y - e.y); if (d < id && (i.k !== 'w' || e.w.indexOf(null) >= 0 || wscore(i.w) > wscore(e.w[0]) * 1.2)) { it = i; id = d; } }
        if (it && Math.random() < .8) B.goal = { x: it.x, y: it.y };
        else if (B.kind === 'scav') { const t = this.M.towns.reduce((a, t) => hyp(t.x - e.x, t.y - e.y) < hyp(a.x - e.x, a.y - e.y) ? t : a); B.goal = { x: t.x + rand(-450, 450), y: t.y + rand(-450, 450) }; }
        else { const t = pick(this.M.towns.filter(t => !z || hyp(t.x - z.tcx, t.y - z.tcy) < z.tr + 200).concat(z ? [{ x: z.tcx, y: z.tcy }] : [])) || { x: S.CX, y: S.CY }; B.goal = { x: t.x + rand(-400, 400), y: t.y + rand(-400, 400) }; }
      }
      // 끼임 해소
      const moved = hyp(e.x - B.last.x, e.y - B.last.y); B.last = { x: e.x, y: e.y };
      if (moved < 4 && !e.act && !B.tgt && now > B.unstick) { const a = rand(0, 6.283); B.ux = Math.cos(a); B.uy = Math.sin(a); B.unstick = now + rand(500, 1100); if (Math.random() < .3) B.goal = null; }
      if (now > B.flip) { B.strafe *= -1; B.flip = now + rand(600, 1500); }
    }
    const t = B.tgt && this.byId(B.tgt);
    e.fire = false;
    if (now < e.flash) { e.mx = Math.cos(now / 300); e.my = Math.sin(now / 300); return; }
    if (t && this.alive(t)) {
      const dx = t.x - e.x, dy = t.y - e.y, d = hyp(dx, dy), ang = Math.atan2(dy, dx);
      const w = e.w[e.cw];
      const lead = w ? d / w.st.spd : 0;
      const aim = Math.atan2(dy + (t.moving ? t.my * 120 * lead : 0), dx + (t.moving ? t.mx * 120 * lead : 0));
      e.a = aim + (Math.random() - .5) * B.err * 2;
      const want = w ? Math.min(w.st.rng * .5, 380) : 0;
      const fwd = d > want + 60 ? 1 : d < want - 80 ? -1 : 0;
      e.mx = Math.cos(ang) * fwd + Math.cos(ang + Math.PI / 2) * B.strafe * .8; e.my = Math.sin(ang) * fwd + Math.sin(ang + Math.PI / 2) * B.strafe * .8;
      if (w && w.mag === 0 && e.am[w.st.am] === 0 && e.w[1 - e.cw]) { e.cw = 1 - e.cw; e.rlOn = false; }
      if (w && now > B.react && d < w.st.rng * .95) {
        if (now > B.pauseUntil) { B.fireUntil = now + rand(250, 600); B.pauseUntil = B.fireUntil + rand(350, 900) * (w.st.auto ? 1 : .4); }
        if (now < B.fireUntil) e.fire = w.st.auto ? true : !e.pfire;
      }
      if (e.it.gren && d > 150 && d < 380 && Math.random() < .003) { this.throwG(e, 'gren'); }
      if (e.act && (e.act.k === 'med' || e.act.k === 'band')) e.act = null;
    } else if (now < B.unstick) { e.mx = B.ux; e.my = B.uy; e.a = Math.atan2(e.my, e.mx); }
    else if (B.goal) { const dx = B.goal.x - e.x, dy = B.goal.y - e.y, d = hyp(dx, dy) || 1; e.mx = dx / d; e.my = dy / d; e.a = Math.atan2(dy, dx); }
    else { e.mx = 0; e.my = 0; }
    const w = e.w[e.cw]; if (!t && w && w.mag < w.st.mag * .5) this.reload(e, now);
  }

  // ───── 스냅샷 ─────
  snapshot() {
    const z = this.z, now = this.time;
    const zs = z ? [r1(z.cx), r1(z.cy), r1(z.r), r1(z.tcx), r1(z.tcy), r1(z.tr), z.ph, z.st, Math.max(0, Math.round(((z.st === 'wait' ? z.wait : z.st === 'shrink' ? z.shrink : 0) - (now - z.t)) / 1000))] : null;
    const aliveN = this.ents.filter(e => this.alive(e) && e.team !== 9999).length;
    const drs = this.drops.map(d => [d.id, r1(d.x), r1(d.y), d.landed ? 0 : Math.round((d.land - now) / 1000), d.open ? 1 : 0]);
    for (const c of this.humans()) {
      const e = this.byId(c.eid); if (!e) continue;
      let v = e;
      if (!this.alive(e)) {
        let s = e.spec && this.byId(e.spec);
        if (!s || !this.alive(s)) { s = this.ents.find(o => o.team === e.team && this.alive(o)) || this.ents.find(o => this.alive(o) && !o.bot) || this.ents.find(o => this.alive(o)); e.spec = s ? s.id : null; }
        if (s) v = s;
      }
      const ps = [];
      for (const o of this.ents) {
        if (o === e || !this.alive(o) || o.car) continue;
        const mate = o.team === e.team;
        if (!(mate && o.f === v.f) && o !== v && !this.canSee(v, o)) continue;
        const w = o.w[o.cw];
        ps.push([o.id, r1(o.x), r1(o.y), r2(o.a), o.f, Math.round(o.hp), o.st, w ? w.id : '', (now < o.crUntil ? 1 : 0) | (o.rlOn ? 2 : 0) | (o.moving ? 4 : 0) | (o.act ? 8 : 0) | (mate ? 16 : 0), o.arL, w ? (w.st.sil ? 1 : 0) | (w.st.scope ? 2 : 0) : 0]);
      }
      const bl = []; for (const b of this.bullets) if (b.f === v.f && Math.abs(b.x - v.x) < 1000 && Math.abs(b.y - v.y) < 1000) bl.push([b.id, r1(b.x), r1(b.y), r1(b.vx), r1(b.vy)]);
      const gr = []; for (const g of this.grens) if (g.f === v.f && hyp(g.x - v.x, g.y - v.y) < 900) gr.push([g.id, r1(g.x), r1(g.y), g.k]);
      const sm = this.smokes.filter(s => s.f === v.f && hyp(s.x - v.x, s.y - v.y) < 1300).map(s => [s.id, r1(s.x), r1(s.y), s.r, Math.round((s.until - now) / 1000)]);
      const vh = []; if (v.f === 0) for (const k of this.veh) { const d = hyp(k.x - v.x, k.y - v.y); if (d < 140 || (d < 1000 && S.los(this.M, v.x, v.y, k.x, k.y, 0)) || k.id === e.car) vh.push(this.vehArr(k).concat([k.dead ? 1 : 0])); }
      const evs = [];
      for (const ev of this.evs) {
        if (ev.to !== undefined) { if (ev.to === e.id) evs.push(ev); continue; }
        if (ev.g) { evs.push(ev); continue; }
        if (ev.x !== undefined) { const d = hyp(ev.x - v.x, ev.y - v.y); if (ev.e === 'shot') { if (d < (ev.sil ? 220 : 1300) && ev.id !== e.id) evs.push(ev); } else if (d < 1200) evs.push(ev); }
      }
      const w = e.w;
      const me = { id: e.id, x: r2(e.x), y: r2(e.y), f: e.f, a: r2(e.a), hp: Math.round(e.hp), ar: e.arL, ad: Math.round(e.arD), st: e.st, cw: e.cw,
        w: w.map(x => x && { id: x.id, n: x.st.n, mag: x.mag, max: x.st.mag, am: x.st.am, att: x.att, c: x.st.c, auto: x.st.auto, sc: x.st.scope ? 1 : 0, sil: x.st.sil, dmg: Math.round(x.st.dmg * x.st.pel), iv: Math.round(x.st.iv), rng: Math.round(x.st.rng), rc: r2(x.st.rc), mv: r2(x.st.mv), sp: r2(x.st.sp) }),
        am: e.am, it: e.it, bag: e.bag, val: e.val, rec: r2(e.rec), sp: this.spMul(e, now), rl: e.rlOn && w[e.cw] ? r2(1 - (e.rlEnd - now) / w[e.cw].st.rl) : -1,
        act: e.act ? [e.act.k, r2(1 - (e.act.end - now) / e.act.dur)] : null, cr: Math.max(0, Math.round(e.crCd - now)), cro: now < e.crUntil ? 1 : 0, car: e.car, fl: Math.max(0, Math.round(e.flash - now)), kills: e.kills, ex: r2(e.exT), spec: v !== e ? v.id : null, vx: r1(v.x), vy: r1(v.y), vf: v.f, va: r2(v.a) };
      const msg = { t: 's', tm: Math.round(now / 1000), pre: this.pre > 0 ? Math.ceil(this.pre / 1000) : 0, me, ps, bl, gr, sm, vh, z: zs, dr: drs, n: aliveN, ev: evs, exo: this.exOpen ? 1 : 0, tl: this.mode === 'ex' ? Math.max(0, Math.round((600000 - now) / 1000)) : null };
      send(c, JSON.stringify(msg));
    }
    this.evs = [];
  }

  // ───── 입력 ─────
  input(c, m) {
    const e = this.byId(c.eid); if (!e || this.st !== 'play') return;
    if (m.t === 'i') {
      e.mx = +m.mx || 0; e.my = +m.my || 0; if (isFinite(+m.a)) e.a = +m.a; e.fire = !!m.f; return;
    }
    if (m.t !== 'act' || this.pre > 0) return;
    const now = this.time, alive = e.st === 'a';
    switch (m.a) {
      case 'reload': if (alive) this.reload(e, now); break;
      case 'swap': if (alive && e.w[1 - e.cw]) { e.cw = 1 - e.cw; e.rlOn = false; e.nextShot = Math.max(e.nextShot, now + 250); } break;
      case 'slot': if (alive && e.w[m.i ? 1 : 0]) { e.cw = m.i ? 1 : 0; e.rlOn = false; } break;
      case 'crouch': if (alive && now >= e.crCd && !e.car) { e.crUntil = now + 1100; e.crCd = now + 5500; e.act = null; } break;
      case 'gren': case 'flash': case 'smoke': if (alive) this.throwG(e, m.a); break;
      case 'med': if (alive && e.it.med && e.hp < 100) this.startAct(e, 'med', 4000); break;
      case 'band': if (alive && e.it.band && e.hp < 100) this.startAct(e, 'band', 1500); break;
      case 'cancel': e.act = null; break;
      case 'fuel': if (alive && e.it.fuel) { const v = this.veh.find(v => !v.dead && hyp(v.x - e.x, v.y - e.y) < 85 && e.f === 0); if (v) this.startAct(e, 'fuel', 2000, v.id); } break;
      case 'interact': this.interact(e); break;
      case 'dropw': if (alive) this.dropW(e, m.i ? 1 : 0); break;
      case 'craft': if (alive && e.w[0] && e.w[1]) {
        const base = S.hybrid(e.w[0], e.w[1]);
        for (const w of e.w) { e.am[w.st.am] += w.mag; for (const k in w.att) if (e.bag.length < 6) e.bag.push(w.att[k]); }
        const nw = newW('hyb', base); nw.mag = 0; e.w = [nw, null]; e.cw = 0; e.rlOn = false; this.reload(e, now);
        this.evs.push({ e: 'msg', txt: `🔧 조합 완료: ${base.n}`, to: e.id });
      } break;
      case 'equip': { const id = e.bag[m.b], w = e.w[m.i ? 1 : 0]; if (id && w) { const sl = S.ATT[id].slot; e.bag.splice(m.b, 1); if (w.att[sl]) e.bag.push(w.att[sl]); w.att[sl] = id; restat(w); w.mag = Math.min(w.mag, w.st.mag); } } break;
      case 'detach': { const w = e.w[m.i ? 1 : 0]; if (w && w.att[m.s] && e.bag.length < 6) { e.bag.push(w.att[m.s]); delete w.att[m.s]; restat(w); if (w.mag > w.st.mag) { e.am[w.st.am] += w.mag - w.st.mag; w.mag = w.st.mag; } } } break;
      case 'dropatt': { const id = e.bag[m.b]; if (id) { e.bag.splice(m.b, 1); this.addItem(e.x + rand(-20, 20), e.y + rand(-20, 20), e.f, { k: 'att', d: id }); } } break;
      case 'spec': if (!this.alive(e)) { const al = this.ents.filter(o => this.alive(o)); if (al.length) { const i = al.findIndex(o => o.id === e.spec); e.spec = al[(i + 1) % al.length].id; } } break;
    }
  }
  interact(e) {
    if (e.car) { this.exitCar(e); return; }
    if (e.st !== 'a') return;
    if (e.act) { e.act = null; return; }
    const d = o => hyp(o.x - e.x, o.y - e.y);
    const mate = this.ents.find(o => o !== e && o.team === e.team && o.st === 'd' && o.f === e.f && d(o) < 65);
    if (mate) return this.startAct(e, 'revive', 4500, mate.id);
    const drop = this.drops.find(o => o.landed && !o.open && e.f === 0 && d(o) < 75);
    if (drop) return this.startAct(e, 'open', 3000, drop.id);
    let it = null, id = 62;
    for (const i of this.items.values()) if (i.k === 'w' && i.f === e.f && d(i) < id) { it = i; id = d(i); }
    if (it) {
      const empty = e.w.indexOf(null);
      if (empty >= 0) { e.w[empty] = it.w; if (!e.w[e.cw]) e.cw = empty; }
      else { const old = e.w[e.cw]; e.w[e.cw] = it.w; e.rlOn = false; this.addItem(e.x + rand(-15, 15), e.y + rand(-15, 15), e.f, { k: 'w', w: old }); }
      this.remItem(it); this.evs.push({ e: 'pick', to: e.id, k: 'w', d: it.w.st.n }); return;
    }
    const v = this.veh.find(v => !v.dead && e.f === 0 && d(v) < 80 && v.seats.includes(null));
    if (v) return this.board(e, v);
  }
  leave(c) {
    this.members.delete(c.id);
    if (this.st === 'play' && this.ents) { const e = this.byId(c.eid); if (e) { e.cid = null; if (this.alive(e)) { e.bot = true; this.mkAIKeep(e); } } }
    if (this.host === c.id) this.host = [...this.members][0] || null;
    if (this.members.size === 0) rooms.delete(this.id); else this.broadcastInfo();
    c.room = null; c.eid = null;
  }
  mkAIKeep(e) { const keep = { w: e.w, am: e.am, it: e.it, arL: e.arL, arD: e.arD, hp: e.hp }; this.mkAI(e, 'br'); Object.assign(e, keep); }
  backToLobby() {
    this.st = 'lobby'; this.ents = null; this.created = Date.now(); this.cd = null;
    for (const c of this.humans()) { c.eid = null; send(c, JSON.stringify({ t: 'lobby' })); }
    this.broadcastInfo();
  }
}

function send(c, m) { if (c.ws.readyState === 1) c.ws.send(m); }
function roomList() { return [...rooms.values()].map(r => ({ id: r.id, name: r.name, mode: r.mode, ts: r.ts, n: r.members.size, st: r.st })); }
function joinRoom(c, r) {
  if (c.room) leaveRoom(c);
  if (r.members.size >= S.MAXP) return send(c, JSON.stringify({ t: 'err', txt: '방이 가득 찼습니다 (최대 10명)' }));
  if (r.st !== 'lobby') return send(c, JSON.stringify({ t: 'err', txt: '이미 게임이 진행 중인 방입니다' }));
  r.members.add(c.id); c.room = r.id; if (!r.host) r.host = c.id; r.broadcastInfo();
}
function leaveRoom(c) { const r = rooms.get(c.room); if (r) r.leave(c); c.room = null; send(c, JSON.stringify({ t: 'left' })); }

let nextCid = 1;
wss.on('connection', ws => {
  const c = { id: nextCid++, ws, name: '오리' + randi(100, 999), skin: S.cleanSkin({}), room: null, eid: null };
  clients.set(c.id, c);
  send(c, JSON.stringify({ t: 'hi', id: c.id, rooms: roomList() }));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const r = c.room && rooms.get(c.room);
    if ((m.t === 'i' || m.t === 'act') && r) return r.input(c, m);
    switch (m.t) {
      case 'hello': c.name = String(m.name || c.name).slice(0, 12) || c.name; if (m.skin && typeof m.skin === 'object') c.skin = S.cleanSkin(m.skin); break;
      case 'list': send(c, JSON.stringify({ t: 'rooms', rooms: roomList() })); break;
      case 'create': { const nr = new Room(m, c.id); rooms.set(nr.id, nr); joinRoom(c, nr); break; }
      case 'join': { const jr = rooms.get(+m.id); if (jr) joinRoom(c, jr); else send(c, JSON.stringify({ t: 'err', txt: '방을 찾을 수 없습니다' })); break; }
      case 'quick': { const mode = m.mode === 'ex' ? 'ex' : 'br'; let q = [...rooms.values()].find(x => x.mode === mode && x.st === 'lobby' && x.members.size < S.MAXP); if (!q) { q = new Room({ name: (mode === 'ex' ? '탈출 ' : '배그 ') + '빠른방', mode, ts: 1 }, c.id); rooms.set(q.id, q); } joinRoom(c, q); break; }
      case 'leave': leaveRoom(c); break;
      case 'start': if (r && r.host === c.id && r.st === 'lobby') { if (r.members.size >= S.MINP || Date.now() - r.created > 8000) r.begin(); else send(c, JSON.stringify({ t: 'err', txt: '방 생성 8초 후부터 봇과 시작할 수 있습니다' })); } break;
      case 'chat': if (r) { const txt = String(m.txt || '').slice(0, 60); if (txt) for (const h of r.humans()) send(h, JSON.stringify({ t: 'chat', name: c.name, txt })); } break;
      case 'ping': send(c, JSON.stringify({ t: 'pong', c: m.c })); break;
    }
  });
  ws.on('close', () => { if (c.room) { const r = rooms.get(c.room); if (r) r.leave(c); } clients.delete(c.id); });
});

// 메인 루프
if (process.env.SIM) { module.exports = { Room, clients, rooms }; return; }
let last = Date.now();
setInterval(() => {
  const now = Date.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const r of rooms.values()) {
    if (r.st === 'play') { try { r.update(dt); if (r.ended && r.time >= r.endAt) r.backToLobby(); } catch (err) { console.error('room error', err); r.backToLobby(); } }
  }
}, TICK);
setInterval(() => {
  for (const r of rooms.values()) if (r.st === 'lobby') r.lobbyTick();
  const list = JSON.stringify({ t: 'rooms', rooms: roomList() });
  for (const c of clients.values()) if (!c.room) send(c, list);
}, 1000);

server.listen(PORT, () => console.log('미니 배그 서버 실행중: http://localhost:' + PORT));
