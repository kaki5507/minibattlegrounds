// 미니 배틀그라운드 - 권위 서버 (Node.js + ws)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const WebSocket = require('ws');
const S = require('./shared.js');
const ACC = require('./accounts.js');
const PORT = process.env.PORT || 3000;
const TICK = 1000 / 30;

const MAPS = { br: S.genMap(7, 'br'), ex: S.genMap(11, 'ex') };
const MAPSER = { br: S.serialize(MAPS.br), ex: S.serialize(MAPS.ex) };

// ───────── 정적 파일 ─────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (u === '/map/br' || u === '/map/ex') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); return res.end(MAPSER[u.slice(5)]); }
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
const ROLL_MS = 300, ROLL_CD = 3500, ROLL_SPD = 760;
const PEACE_MS = 60000, RAID_MS = 25 * 60000;

function newW(id, base) { const w = { id, att: {}, base: base || null, mag: 0 }; w.st = S.stats(w); w.mag = w.st.mag; return w; }
function restat(w) { w.st = S.stats(w); }
function wscore(w) { if (!w) return 0; const s = w.st; return s.dmg * s.pel * 1000 / s.iv * Math.min(1, s.rng / 700) * (s.scope ? 1.2 : 1); }
const AMCAP = { light: 300, rifle: 300, shell: 60, sniper: 40 };

// ───────── 루팅 테이블 ─────────
function rollWeapon(tier) {
  const id = wpick([{ pistol: 20, smg: 10, sg: 7, ar: 4, dmr: 1 }, { pistol: 4, smg: 9, sg: 6, ar: 9, dmr: 4, lmg: 2, sniper: 1 }, { smg: 4, sg: 4, ar: 9, dmr: 7, lmg: 5, sniper: 4 }, { ar: 6, dmr: 7, lmg: 6, sniper: 7 }][Math.min(3, tier)]);
  const w = newW(id); if (tier >= 2 && Math.random() < .35 * (tier - 1)) { const a = pick(Object.keys(S.ATT)); w.att[S.ATT[a].slot] = a; restat(w); w.mag = w.st.mag; } return w;
}
function ammoFor(w) { const t = w.st.am; return { k: 'am', d: t, n: t === 'sniper' ? randi(6, 12) : t === 'shell' ? randi(8, 16) : randi(25, 45) }; }
function rollLoot(tier, mode) {
  const ex = mode === 'ex', T = Math.min(3, tier);
  const cat = wpick([{ w: 16, am: 24, ar: 6, med: 4, band: 14, gren: 5, flash: 4, smoke: 3, fuel: 6, att: 8, val: ex ? 12 : 0 },
    { w: 20, am: 22, ar: 10, med: 7, band: 10, gren: 6, flash: 5, smoke: 4, fuel: 4, att: 12, val: ex ? 16 : 0 },
    { w: 24, am: 18, ar: 14, med: 8, band: 6, gren: 7, flash: 5, smoke: 4, fuel: 3, att: 16, val: ex ? 20 : 0 },
    { w: 24, am: 16, ar: 16, med: 9, band: 4, gren: 7, flash: 4, smoke: 4, fuel: 2, att: 18, val: ex ? 28 : 0 }][T]);
  if (cat === 'w') return { k: 'w', w: rollWeapon(T) };
  if (cat === 'am') { const t = pick(['light', 'light', 'rifle', 'rifle', 'shell', 'sniper']); return { k: 'am', d: t, n: t === 'sniper' ? randi(5, 10) : t === 'shell' ? randi(6, 14) : randi(20, 40) }; }
  if (cat === 'ar') { const r = Math.random(); const l = [r < .85 ? 1 : 2, r < .55 ? 1 : r < .85 ? 2 : 3, r < .5 ? 2 : 3, r < .3 ? 2 : 3][T]; return { k: 'ar', d: l, n: S.ARMOR[l].dur }; }
  if (cat === 'att') return { k: 'att', d: pick(Object.keys(S.ATT)) };
  if (cat === 'val') { const i = Math.min(S.VALUABLES.length - 1, Math.floor(Math.random() * Math.random() * (S.VALUABLES.length + T * 1.5))); return { k: 'val', d: i, n: S.VALUABLES[i][1] }; }
  return { k: cat, n: 1 };
}
function rollBox(k, tier, mode) {
  const out = [];
  if (k === 'weapon') { const w = rollWeapon(Math.max(1, tier)); out.push({ k: 'w', w }, ammoFor(w)); if (Math.random() < .5) out.push({ k: 'att', d: pick(Object.keys(S.ATT)) }); }
  else if (k === 'med') { out.push({ k: 'band', n: randi(1, 3) }); if (Math.random() < .6) out.push({ k: 'med', n: 1 }); if (Math.random() < .3) out.push({ k: 'smoke', n: 1 }); }
  else if (k === 'safe') { for (let i = 0; i < randi(2, 3); i++) { const v = Math.min(S.VALUABLES.length - 1, randi(2, S.VALUABLES.length - 1)); out.push(mode === 'ex' ? { k: 'val', d: v, n: S.VALUABLES[v][1] } : rollLoot(3, mode)); } if (Math.random() < .4) out.push({ k: 'w', w: rollWeapon(3) }); }
  else { const n = k === 'cabinet' ? randi(0, 2) : k === 'bag' ? randi(1, 3) : randi(1, 2); for (let i = 0; i < n; i++) { const it = rollLoot(tier, mode); out.push(it); if (it.k === 'w' && Math.random() < .6) out.push(ammoFor(it.w)); } }
  return out;
}

// ───────── 방 ─────────
let nextRoomId = 1;
const rooms = new Map(), clients = new Map();
const ZPH = [[90, 60, 3600], [70, 45, 2300], [55, 40, 1400], [45, 30, 800], [35, 25, 400], [25, 20, 150], [20, 25, 0]];
const ZDPS = [0.6, 1.2, 2.2, 4, 7, 11, 16, 22];
const GUARD = [null,
  { n: '공장 경비', hp: 80, w: ['pistol', 'smg', 'pistol'], ar: 0, err: .17, val: [40, 160] },
  { n: '항구 깡패', hp: 90, w: ['smg', 'sg'], ar: 1, err: .15, val: [80, 260] },
  { n: '벙커 병사', hp: 100, w: ['ar', 'sg', 'smg'], ar: 2, err: .13, val: [120, 380] },
  { n: '기지 특수병', hp: 110, w: ['ar', 'dmr'], ar: 2, err: .11, val: [180, 520] },
  { n: '연구소 경비', hp: 125, w: ['lmg', 'dmr', 'ar', 'sniper'], ar: 3, err: .09, val: [260, 800] }];

class Room {
  constructor(opts, host) {
    this.id = nextRoomId++; this.name = (opts.name || '미니 배그 방').slice(0, 20); this.mode = opts.world ? 'ex' : 'br'; this.world = !!opts.world;
    this.ts = [1, 2, 4].includes(+opts.ts) ? +opts.ts : 1; this.pw = String(opts.pw || '').slice(0, 16); this.host = host; this.members = new Set(); this.st = 'lobby'; this.created = Date.now(); this.cd = null;
  }
  humans() { return [...this.members].map(id => clients.get(id)).filter(Boolean); }
  info() {
    const h = this.humans();
    return { t: 'room', id: this.id, name: this.name, mode: this.mode, ts: this.ts, lk: this.pw ? 1 : 0, host: this.host, st: this.st, cd: this.cd ? Math.max(0, this.cd - Date.now()) : null, age: Date.now() - this.created, players: h.map(c => ({ id: c.id, name: c.name, skin: c.skin })) };
  }
  broadcastInfo() { if (this.world) return; const m = JSON.stringify(this.info()); for (const c of this.humans()) send(c, m); }
  lobbyTick() {
    const n = this.members.size, now = Date.now();
    if (n >= S.MINP && !this.cd) { this.cd = now + 15000; this.msgAll('5명 이상 모였습니다. 15초 후 자동 시작'); }
    if (n < S.MINP && this.cd && !this.botStart) this.cd = null;
    if (n > 0 && n < S.MINP && !this.cd && now - this.created > 90000) { this.cd = now + 10000; this.botStart = true; this.msgAll('인원이 부족해 10초 후 봇을 채워 시작합니다'); }
    if (this.cd && now >= this.cd) this.begin();
    this.broadcastInfo();
  }
  msgAll(txt) { const m = JSON.stringify({ t: 'msg', txt }); for (const c of this.humans()) send(c, m); }

  resetState() {
    this.M = MAPS[this.mode];
    this.time = 0; this.tick = 0; this.nid = 1; this.ents = []; this.bullets = []; this.grens = []; this.smokes = []; this.items = new Map(); this.veh = []; this.drops = []; this.evs = []; this.ended = false; this.boxes = new Map();
    for (const l of this.M.loot) this.addBox(l.x, l.y, l.f, l.k, l.tier, rollBox(l.k, l.tier, this.mode), null, true);
    for (const v of this.M.vehSpots) if (Math.random() < .8) this.veh.push({ id: this.nid++, x: v.x, y: v.y, a: v.a, v: 0, fuel: randi(25, 100), hp: 100, seats: [null, null, null, null], home: { x: v.x, y: v.y, a: v.a } });
  }
  startMsg(c) {
    return JSON.stringify({ t: 'start', mode: this.mode, world: this.world ? 1 : 0, ts: this.ts, you: c.eid, roster: this.ents.map(e => this.rosterOf(e)), items: [...this.items.values()].map(it => this.itemArr(it)), boxes: [...this.boxes.values()].map(b => this.boxArr(b)), veh: this.veh.map(v => this.vehArr(v)), exts: this.exts || null, pre: this.pre || 0 });
  }
  rosterOf(e) { return { id: e.id, name: e.name, team: e.team, skin: e.skin, bot: e.bot ? 1 : 0, g: e.ai && e.ai.kind === 'guard' ? 1 : 0 }; }

  // ───── 배그 시작 ─────
  begin() {
    this.st = 'play'; this.cd = null; this.botStart = false;
    this.resetState(); this.pre = 5000; this.peaceEnd = PEACE_MS;
    const humans = this.humans(), list = [];
    for (const c of humans) list.push({ c, name: c.name, skin: c.skin });
    while (list.length < 20) list.push({ name: pick(BOTNAMES) + randi(1, 99), skin: S.cleanSkin({ body: pick(Object.keys(S.BODIES).filter(b => b !== 'goldduck')), hat: pick(Object.keys(S.HATS)), col: pick(Object.keys(S.COLORS)), face: pick(Object.keys(S.FACES)), glove: pick(Object.keys(S.GLOVES)), bag: pick(Object.keys(S.BAGS)), gskin: pick(Object.keys(S.GSKINS)) }) });
    list.forEach((o, i) => {
      const e = this.mkEnt(o.name, !o.c, Math.floor(i / this.ts), o.skin);
      if (o.c) { o.c.eid = e.id; e.cid = o.c.id; if (o.c.acc) e.acc = o.c.acc; } else this.mkAI(e, 'br');
    });
    // 넓게 흩어진 스폰
    const used = [], teams = {}, M = this.M;
    for (const e of this.ents) {
      let p;
      if (teams[e.team]) { const b = teams[e.team]; p = { x: b.x + rand(-70, 70), y: b.y + rand(-70, 70) }; if (!this.freeSpot(p.x, p.y)) p = { x: b.x, y: b.y }; }
      else { p = this.randSpot(400, M.R * .9, used, 1250) || this.randSpot(400, M.R * .9, used, 700) || { x: M.CX, y: M.CY }; teams[e.team] = p; used.push(p); }
      e.x = p.x; e.y = p.y; e.a = Math.atan2(M.CY - p.y, M.CX - p.x);
    }
    this.z = { cx: M.CX, cy: M.CY, r: M.R * .98, ph: 0, st: 'wait', t: 0 }; this.nextZone();
    this.dropTimes = [100000, 230000, 360000, 480000];
    for (const c of humans) send(c, this.startMsg(c));
    this.broadcastInfo();
  }
  // ───── 탈출 월드 (상시) ─────
  initWorld() {
    this.st = 'play'; this.resetState(); this.pre = 0; this.peaceEnd = 0; this.z = null; this.exOpen = true;
    this.exts = this.M.extracts.slice(); this.dropTimes = [300000];
    this.M.spawns.forEach((sp, i) => { const e = this.mkGuard(sp, i === this.M.spawns.findIndex(q => q.tier === 5)); });
  }
  inSafe(x, y, pad) { const Z = this.M.safe; if (!Z) return false; for (const z of Z) if (Math.hypot(z.x - x, z.y - y) < z.r + (pad || 0)) return true; return false; }
  worldStatus() {
    const hum = this.ents.filter(e => !e.bot && this.alive(e)), M = this.M;
    const dg = M.dungeons.map(d => ({ name: d.name, tier: d.tier, n: hum.filter(h => Math.abs(h.x - d.x) < d.s / 2 && Math.abs(h.y - d.y) < d.s / 2).length, g: this.ents.filter(g => g.ai && g.ai.kind === 'guard' && this.alive(g) && Math.abs(g.x - d.x) < d.s / 2 && Math.abs(g.y - d.y) < d.s / 2).length }));
    return { n: hum.length, dg, out: hum.length - dg.reduce((a, d) => a + d.n, 0), up: Math.round(this.time / 1000), drops: this.drops.filter(d => !d.open).length };
  }
  mkGuard(sp, boss) {
    const g = GUARD[sp.tier];
    const e = this.mkEnt(boss ? '연구소 경비대장' : g.n, true, 9999, S.cleanSkin({ body: pick(['man', 'woman', 'dog', 'bear', 'robot']), hat: sp.tier >= 4 ? 'helmet' : pick(['cap', 'beret', 'beanie', 'none']), col: ['camo', 'black', 'green', 'black', 'white'][sp.tier - 1], face: pick(['mask', 'none', 'gasmask', 'nvg']), glove: 'tactical', bag: 'mil', gskin: 'none' }));
    e.home = { x: sp.x, y: sp.y }; e.tier = sp.tier; e.boss = !!boss; this.mkAI(e, 'guard'); this.gearGuard(e); return e;
  }
  gearGuard(e) {
    const g = GUARD[e.tier];
    Object.assign(e, { st: 'a', hp: e.boss ? 320 : g.hp, w: [newW(e.boss ? 'lmg' : pick(g.w)), null], cw: 0, am: { light: 90, rifle: 150, shell: 30, sniper: 20 }, it: { med: e.tier >= 3 ? 1 : 0, band: 1, gren: e.tier >= 3 && Math.random() < .5 ? 1 : 0, flash: 0, fuel: 0, smoke: 0 }, bag: [], val: randi(g.val[0], g.val[1]) * (e.boss ? 4 : 1), arL: e.boss ? 3 : g.ar, arD: (e.boss ? 3 : g.ar) ? S.ARMOR[e.boss ? 3 : g.ar].dur : 0, act: null, finished: false, x: e.home.x, y: e.home.y, f: 0, rlOn: false, rec: 0 });
    if (e.tier >= 4 && Math.random() < .5) { e.w[0].att.scope = 'scope'; restat(e.w[0]); }
    e.w[0].mag = e.w[0].st.mag; e.ai.err = e.boss ? .07 : g.err; e.ai.tgt = null; e.ai.goal = null;
  }
  addPlayer(c) {
    if (c.room && c.room !== this.id) leaveRoom(c, true);
    if (c.room === this.id) return;
    this.members.add(c.id); c.room = this.id;
    const e = this.mkEnt(c.name, false, 100000 + c.id, c.skin); e.cid = c.id; c.eid = e.id;
    if (c.acc) {
      e.acc = c.acc; const kit = c.acc.kit; c.acc.kit = []; ACC.persist(c.acc);
      if (kit.length) { e.w = [null, null]; e.am.light = 0; applyKit(e, kit); if (!e.w[0]) { e.w[0] = newW('pistol'); e.am.light += 12; e.w[0].mag = 0; this.reload(e, this.time); } }
      e.kitVal = kit.reduce((s, it) => s + S.itemPrice(it), 0);
    }
    // 다른 사람과 먼 입장 포탈
    const others = this.ents.filter(o => !o.bot && o !== e && this.alive(o));
    const ent = this.M.entries.map(p => ({ p, d: others.length ? Math.min(...others.map(o => hyp(o.x - p.x, o.y - p.y))) : rand(0, 1e4) })).sort((a, b) => b.d - a.d);
    const sp = (ent.slice(0, 4)[randi(0, Math.min(3, ent.length - 1))] || { p: { x: this.M.CX, y: this.M.CY } }).p;
    const q = { x: sp.x + rand(-40, 40), y: sp.y + rand(-40, 40) }; S.resolve(this.M, q, S.PR, 0); e.x = q.x; e.y = q.y; e.a = Math.atan2(this.M.CY - e.y, this.M.CX - e.x);
    e.raidEnd = this.time + RAID_MS; e.inv = this.time + 4000;
    this.evs.push({ e: 'join', r: this.rosterOf(e), g: 1 }, { e: 'tp', x: r1(e.x), y: r1(e.y), x2: r1(e.x), y2: r1(e.y) });
    send(c, this.startMsg(c));
  }
  worldTick() {
    const now = this.time, hum = this.ents.filter(e => !e.bot && this.alive(e));
    const nearH = (x, y, d) => hum.some(h => hyp(h.x - x, h.y - y) < d);
    for (const e of this.ents) {
      if (e.ai && e.ai.kind === 'guard' && e.st === 'x' && now >= (e.respawnAt || 0) && !nearH(e.home.x, e.home.y, 1500)) { this.gearGuard(e); }
      if (!e.bot && this.alive(e) && now >= e.raidEnd) { this.finish(e, 'mia'); this.kill(e, null, '시간 초과', true); }
    }
    for (const b of this.boxes.values()) {
      if (b.k === 'body') { if ((!b.items.length && now - b.t0 > 30000) || now - b.born > 600000) this.delBox(b); continue; }
      if (b.searched.size && now - b.t0 > 360000 && !nearH(b.x, b.y, 1200)) { b.items = rollBox(b.k, b.tier, this.mode); b.searched.clear(); b.t0 = 0; this.evs.push({ e: 'bx', id: b.id, g: 1 }); }
    }
    for (const v of this.veh) if ((v.dead || (!v.seats.some(Boolean) && v.fuel <= 0)) && v.home && !nearH(v.x, v.y, 1500) && !nearH(v.home.x, v.home.y, 1500)) Object.assign(v, { dead: false, x: v.home.x, y: v.home.y, a: v.home.a, v: 0, fuel: randi(30, 100), hp: 100 });
    this.ents = this.ents.filter(e => e.bot || e.cid != null || now - (e.deadT || now) < 15000);
    if (!this.dropTimes.length) this.dropTimes.push(now + 360000);
  }
  mkEnt(name, bot, team, skin) {
    const e = { id: this.nid++, name, bot, team, skin, x: 0, y: 0, f: 0, a: 0, hp: 100, arL: 0, arD: 0, st: 'a', w: [null, null], cw: 0, am: { light: 0, rifle: 0, shell: 0, sniper: 0 }, it: { med: 0, band: 1, gren: 0, flash: 0, fuel: 0, smoke: 0 }, bag: [], val: 0,
      mx: 0, my: 0, fire: false, pfire: false, ad: false, rec: 0, rb: 0, lastShot: -1e9, nextShot: 0, rlEnd: 0, rlOn: false, rollUntil: 0, rollCd: 0, rdx: 0, rdy: 0, act: null, car: null, flash: 0, kills: 0, place: 0, plock: -1, tpCd: 0, spec: null, exT: 0, moving: false, dmgT: 0, dmgDealt: 0, boxes: 0, spawnT: this.time, inv: 0 };
    e.w[0] = newW('pistol'); e.am.light = this.world ? 12 : 24;
    this.ents.push(e); return e;
  }
  mkAI(e, kind) {
    e.ai = { kind, nt: 0, goal: null, tgt: null, react: 0, fireUntil: 0, pauseUntil: 0, strafe: 1, flip: 0, last: { x: 0, y: 0 }, unstick: 0, ux: 0, uy: 0, err: .11, wait: 0 };
  }
  freeSpot(x, y, r) { const p = { x, y }; S.resolve(this.M, p, r || S.PR, 0); return hyp(p.x - x, p.y - y) < 1 && !S.inBld(this.M, x, y); }
  randSpot(rmin, rmax, avoid, md) {
    const M = this.M;
    for (let i = 0; i < 500; i++) {
      const a = rand(0, 6.283), d = rand(rmin, rmax), x = M.CX + Math.cos(a) * d, y = M.CY + Math.sin(a) * d;
      if (!this.freeSpot(x, y, 24)) continue;
      if (avoid && avoid.some(p => hyp(p.x - x, p.y - y) < md)) continue;
      return { x, y };
    }
    return null;
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

  // ───── 루팅 상자 ─────
  addBox(x, y, f, k, tier, items, name, silent) {
    const b = { id: this.nid++, x, y, f, k, tier, items, name: name || '', searched: new Set(), t0: 0, born: this.time };
    this.boxes.set(b.id, b); if (!silent) this.evs.push({ e: 'ba', b: this.boxArr(b), g: 1 }); return b;
  }
  delBox(b) { this.boxes.delete(b.id); this.evs.push({ e: 'bd', id: b.id, g: 1 }); }
  boxArr(b) { return [b.id, r1(b.x), r1(b.y), b.f, b.k, b.name]; }
  itemDesc(it) {
    if (it.k === 'w') { const s = it.w.st; return { k: 'w', nm: s.n, wid: it.w.id, c: s.c, sub: `피해 ${Math.round(s.dmg * s.pel)} · ${S.AMMO[s.am]}${Object.keys(it.w.att).length ? ' · 부착 ' + Object.keys(it.w.att).length : ''}` }; }
    const nm = S.itemName(it);
    if (it.k === 'ar') return { k: 'ar', d: it.d, nm, sub: `내구도 ${Math.round(it.n)}` };
    if (it.k === 'att') return { k: 'att', d: it.d, nm, sub: S.ATT[it.d].d };
    if (it.k === 'val') return { k: 'val', d: it.d, nm, sub: `가치 ${it.n}` };
    return { k: it.k, d: it.d, nm, sub: `${it.n}개` };
  }
  sendLoot(b) { for (const e of this.ents) if (!e.bot && e.lootBox === b.id) this.evs.push({ e: 'loot', to: e.id, b: b.id, k: b.k, nm: b.name || S.BOXKIND[b.k], items: b.items.map(it => this.itemDesc(it)) }); }
  searchTime(b, e) { return b.searched.has(e.id) ? 250 : ({ crate: 1400, cabinet: 1700, bag: 1100, weapon: 2200, med: 1300, safe: 3500, body: 1800, supply: 3000 }[b.k] || 1500); }
  // 아이템 받기: true=다 가져감, 'p'=일부, false=못 가져감
  giveItem(e, it, box) {
    const putBack = o => { if (box) box.items.push(o); else this.addItem(e.x + rand(-18, 18), e.y + rand(-18, 18), e.f, o); };
    switch (it.k) {
      case 'am': { const room = AMCAP[it.d] - e.am[it.d]; if (room <= 0) return false; const t = Math.min(room, it.n); e.am[it.d] += t; it.n -= t; return it.n <= 0 ? true : 'p'; }
      case 'val': e.val += it.n; e.vals = (e.vals || 0) + 1; return true;
      case 'ar': if (e.bot && (it.d < e.arL || (it.d === e.arL && it.n <= e.arD))) return false; if (e.arL && e.arD > 5) putBack({ k: 'ar', d: e.arL, n: Math.round(e.arD) }); e.arL = it.d; e.arD = it.n; return true;
      case 'att': return this.giveAtt(e, it.d);
      case 'w': {
        const empty = e.w.indexOf(null);
        if (empty >= 0) { e.w[empty] = it.w; if (!e.w[e.cw]) e.cw = empty; return true; }
        if (e.bot) { const wi = wscore(e.w[0]) < wscore(e.w[1]) ? 0 : 1; if (wscore(it.w) <= wscore(e.w[wi]) * 1.1) return false; putBack({ k: 'w', w: e.w[wi] }); e.w[wi] = it.w; return true; }
        putBack({ k: 'w', w: e.w[e.cw] }); e.w[e.cw] = it.w; e.rlOn = false; return true;
      }
      default: if (S.ITEMCAP[it.k]) { const room = S.ITEMCAP[it.k] - e.it[it.k]; if (room <= 0) return false; const t = Math.min(room, it.n); e.it[it.k] += t; it.n -= t; return it.n <= 0 ? true : 'p'; }
    }
    return false;
  }
  takeFromBox(e, b, i) {
    const it = b.items[i]; if (!it) return;
    const before = it.n, r = this.giveItem(e, it, b);
    if (r === true) b.items.splice(b.items.indexOf(it), 1);
    if (r) this.evs.push({ e: 'pick', to: e.id, k: it.k, d: it.k === 'w' ? it.w.st.n : it.d, n: it.k === 'am' || S.ITEMCAP[it.k] ? before - (r === 'p' ? it.n : 0) : it.n });
    else if (!e.bot) this.evs.push({ e: 'msg', txt: '더 들 수 없습니다', to: e.id });
    return r;
  }

  // ───── 자기장 ─────
  nextZone() {
    const z = this.z, p = ZPH[Math.min(z.ph, ZPH.length - 1)], M = this.M;
    const tr = p[2], maxOff = Math.max(0, z.r - tr) * .85;
    let tx = z.cx, ty = z.cy;
    for (let i = 0; i < 60; i++) { const a = rand(0, 6.283), d = Math.sqrt(Math.random()) * maxOff, x = z.cx + Math.cos(a) * d, y = z.cy + Math.sin(a) * d; if (hyp(x - M.CX, y - M.CY) < M.R - tr - 50 || tr < 100) { tx = x; ty = y; if (!M.lakes.some(l => hyp(l.x - x, l.y - y) < l.r)) break; } }
    Object.assign(z, { tcx: tx, tcy: ty, tr, fcx: z.cx, fcy: z.cy, fr: z.r, st: 'wait', t: this.time, wait: p[0] * 1000, shrink: p[1] * 1000 });
  }
  updZone() {
    const z = this.z; if (!z) return;
    const el = this.time - z.t;
    if (z.st === 'wait' && el >= z.wait) { z.st = 'shrink'; z.t = this.time; this.evs.push({ e: 'msg', txt: '자기장이 줄어듭니다', g: 1 }); }
    else if (z.st === 'shrink') {
      const k = Math.min(1, el / z.shrink);
      z.cx = z.fcx + (z.tcx - z.fcx) * k; z.cy = z.fcy + (z.tcy - z.fcy) * k; z.r = z.fr + (z.tr - z.fr) * k;
      if (k >= 1) { if (z.ph < ZPH.length - 1) { z.ph++; this.nextZone(); this.evs.push({ e: 'msg', txt: `다음 안전구역 표시 (${z.ph + 1}단계)`, g: 1 }); } else z.st = 'final'; }
    }
  }

  // ───── 메인 업데이트 ─────
  update(dt) {
    this.tick++;
    if (this.pre > 0) { this.pre -= dt * 1000; if (this.tick % 2 === 0) this.snapshot(); return; }
    this.time += dt * 1000; const now = this.time;
    if (this.peaceEnd && now >= this.peaceEnd && !this.peaceMsg) { this.peaceMsg = true; this.evs.push({ e: 'msg', txt: '교전 금지 해제. 이제부터 공격할 수 있습니다', g: 1 }); }
    this.updZone();
    while (this.dropTimes.length && now >= this.dropTimes[0]) { this.dropTimes.shift(); this.spawnDrop(); }
    if (this.world && this.tick % 30 === 0) this.worldTick();
    const hum = this.world ? this.ents.filter(e => !e.bot && this.alive(e)) : null;
    for (const e of this.ents) {
      if (!this.alive(e)) continue;
      if (hum && e.bot && !hum.some(h => Math.abs(h.x - e.x) < 2600 && Math.abs(h.y - e.y) < 2600)) { e.fire = false; continue; }
      this.updEnt(e, dt, now);
    }
    this.updVeh(dt, now); this.updGren(dt, now); this.updBullets(dt, now);
    this.smokes = this.smokes.filter(s => s.until > now);
    for (const d of this.drops) if (!d.landed && now >= d.land) {
      d.landed = true; const b = this.addBox(d.x, d.y, 0, 'supply', 3, this.dropLoot(), '보급 상자'); d.box = b.id;
      this.evs.push({ e: 'msg', txt: '보급 상자가 착지했습니다', g: 1 });
    }
    for (const d of this.drops) if (d.landed && !d.open) { const b = this.boxes.get(d.box); if (!b || b.searched.size) d.open = true; }
    if (this.world) this.drops = this.drops.filter(d => !d.open || now - d.land < 60000);
    if (!this.world) this.checkEnd(now);
    if (this.tick % 2 === 0) this.snapshot();
  }
  spawnDrop() {
    const M = this.M, z = this.z;
    let x = M.CX, y = M.CY;
    const cx = z ? z.tcx : M.CX, cy = z ? z.tcy : M.CY, rr = z ? Math.max(100, z.tr * .8) : M.R * .7;
    for (let i = 0; i < 300; i++) { const a = rand(0, 6.283), d = Math.sqrt(Math.random()) * rr; const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d; if (this.freeSpot(px, py, 40)) { x = px; y = py; break; } }
    const d = { id: this.nid++, x, y, land: this.time + 20000, landed: false, open: false };
    this.drops.push(d);
    const dir = S.dirName(Math.atan2(y - M.CY, x - M.CX));
    this.evs.push({ e: 'drop', x: r1(x), y: r1(y), g: 1 }, { e: 'msg', txt: `보급 투하: 지도 ${dir}쪽, 20초 후 착지`, g: 1 });
  }
  dropLoot() {
    const w = newW(pick(['sniper', 'lmg', 'dmr', 'sniper'])); w.att.scope = 'scope'; w.att.stock = 'stock'; restat(w); w.mag = w.st.mag;
    const loot = [{ k: 'w', w }, { k: 'ar', d: 3, n: S.ARMOR[3].dur }, { k: 'med', n: 2 }, { k: 'am', d: w.st.am, n: w.st.am === 'sniper' ? 20 : 90 }, { k: 'gren', n: 2 }, { k: 'att', d: pick(['comp', 'emag', 'lbar', 'sup']) }, { k: 'smoke', n: 1 }];
    if (this.mode === 'ex') loot.push({ k: 'val', d: 5, n: S.VALUABLES[5][1] });
    return loot;
  }

  zoneOut(e) { const z = this.z; return z && hyp(e.x - z.cx, e.y - z.cy) > z.r; }
  canSee(v, o) {
    if (o.f !== v.f) return false;
    const dx = o.x - v.x, dy = o.y - v.y, d = hyp(dx, dy);
    if (d < 50) return true;
    if (d > S.VIS) {
      if (!v.ad) return false;
      const st = v.w[v.cw] && v.w[v.cw].st; const R = st && st.scope ? S.VIS_SCOPE : S.VIS_ADS;
      if (d > R || Math.abs(angN(Math.atan2(dy, dx) - v.a)) > S.SCOPE_CONE) return false;
    }
    if (!S.los(this.M, v.x, v.y, o.x, o.y, v.f)) return false;
    for (const s of this.smokes) { if (hyp(v.x - s.x, v.y - s.y) < s.r && d > 90) return false; if (S.segCircle(v.x, v.y, o.x, o.y, s.x, s.y, s.r * .85) < 1) return false; }
    return true;
  }
  spMul(e, now) {
    if (e.act && e.act.k !== 'search') return 0;
    const st = e.w[e.cw] && e.w[e.cw].st; let s = S.SPEED * (st ? st.mv : 1);
    if (e.act) s *= .35; if (e.st === 'd') s *= .25; if (e.ad) s *= .6; if (now < e.flash) s *= .8;
    return s;
  }
  updEnt(e, dt, now) {
    if (e.ai) this.botThink(e, dt, now);
    if (e.car) { const v = this.veh.find(v => v.id === e.car); if (v) { e.x = v.x; e.y = v.y; } e.pfire = e.fire; return; }
    if (now < e.rollUntil) { const p = { x: e.x + e.rdx * ROLL_SPD * dt, y: e.y + e.rdy * ROLL_SPD * dt }; S.resolve(this.M, p, S.PR, e.f); e.x = p.x; e.y = p.y; e.moving = true; }
    else {
      let mx = e.mx, my = e.my; const m = hyp(mx, my); if (m > 1) { mx /= m; my /= m; }
      const sp = this.spMul(e, now);
      e.moving = m > .1 && sp > 0;
      if (sp > 0 && m > .05) { const p = { x: e.x + mx * sp * dt, y: e.y + my * sp * dt }; S.resolve(this.M, p, S.PR, e.f); e.x = p.x; e.y = p.y; }
    }
    // 수색 중 멀어지면 취소
    if (e.act && e.act.k === 'search') { const b = this.boxes.get(e.act.target); if (!b || hyp(b.x - e.x, b.y - e.y) > 80) e.act = null; }
    const w = e.w[e.cw];
    if (w && now - e.lastShot > 140) { e.rec = Math.max(0, e.rec - w.st.rr * dt); e.rb *= Math.pow(.1, dt); }
    if (e.rlOn && now >= e.rlEnd) { e.rlOn = false; if (w) { const need = w.st.mag - w.mag, take = Math.min(need, e.am[w.st.am]); w.mag += take; e.am[w.st.am] -= take; } }
    if (e.fire && e.st === 'a') this.tryFire(e, now);
    e.pfire = e.fire;
    if (e.act && now >= e.act.end) this.finishAct(e, now);
    if (!e.bot) this.portals(e, now);
    this.autoPick(e);
    if (e.lootBox) { const b = this.boxes.get(e.lootBox); if (!b || hyp(b.x - e.x, b.y - e.y) > 110 || b.f !== e.f) { e.lootBox = null; if (!e.bot) this.evs.push({ e: 'lootx', to: e.id }); } }
    if (this.zoneOut(e)) { e.zAcc = (e.zAcc || 0) + ZDPS[this.z.ph] * dt; if (e.zAcc >= 1) { const d = Math.floor(e.zAcc); e.zAcc -= d; this.damage(e, d, null, 'zone', true); } }
    if (e.st === 'd') { e.hp -= 1.3 * dt; if (e.hp <= 0) this.kill(e, e.downBy ? this.byId(e.downBy) : null, '출혈'); }
    if (this.world && this.exOpen && e.st === 'a' && !e.bot) {
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
    if (!this.items.size) return;
    for (const it of this.items.values()) {
      if (it.f !== e.f || Math.abs(it.x - e.x) > 30 || Math.abs(it.y - e.y) > 30 || it.k === 'w') continue;
      const before = it.n, r = this.giveItem(e, it, null);
      if (r === true) this.remItem(it);
      if (r && !e.bot) this.evs.push({ e: 'pick', to: e.id, k: it.k, d: it.d, n: r === 'p' ? before - it.n : before });
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
    const w = e.w[e.cw]; if (!w || (e.act && e.act.k !== 'search') || now < e.rollUntil || e.rlOn || now < e.nextShot) return;
    if (now < this.peaceEnd) { if (!e.bot && !e.pfire) this.evs.push({ e: 'msg', txt: `교전 금지 시간 (${Math.ceil((this.peaceEnd - now) / 1000)}초 남음)`, to: e.id }); return; }
    const st = w.st;
    if (!st.auto && e.pfire) return;
    if (w.mag <= 0) { this.reload(e, now); return; }
    if (e.act) e.act = null;
    w.mag--; e.nextShot = now + st.iv; e.lastShot = now;
    const adm = e.ad ? (st.scope ? .3 : .55) : 1;
    for (let i = 0; i < st.pel; i++) {
      const err = (st.sp * (st.pel > 1 ? Math.max(.7, adm) : adm) + e.rec * adm) * (Math.random() * 2 - 1) * Math.PI / 180;
      const a = e.a + err + e.rb * adm;
      this.bullets.push({ id: this.nid++, o: e.id, team: e.team, x: e.x + Math.cos(e.a) * 18, y: e.y + Math.sin(e.a) * 18, vx: Math.cos(a) * st.spd, vy: Math.sin(a) * st.spd, f: e.f, dmg: st.dmg, rng: st.rng * (e.ad ? 1.15 : 1), trav: 0, wn: st.n, h: e.bot ? 0 : 1 });
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
  roll(e, dx, dy, now) {
    if (e.st !== 'a' || e.car || now < e.rollCd) return;
    let l = hyp(dx, dy); if (!(l > .1)) { dx = Math.cos(e.a + Math.PI / 2); dy = Math.sin(e.a + Math.PI / 2); l = 1; }
    e.rdx = dx / l; e.rdy = dy / l; e.rollUntil = now + ROLL_MS; e.rollCd = now + ROLL_CD; if (e.act && e.act.k !== 'search') e.act = null; e.ad = false;
  }
  startAct(e, k, dur, target) { if (e.act || e.st !== 'a' || e.car) return; e.act = { k, end: this.time + dur, dur, target }; if (k !== 'search') e.rlOn = false; }
  finishAct(e, now) {
    const a = e.act; e.act = null;
    if (a.k === 'med' && e.it.med > 0) { e.it.med--; e.hp = Math.min(100, e.hp + 75); }
    else if (a.k === 'band' && e.it.band > 0) { e.it.band--; e.hp = Math.min(100, e.hp + 20); }
    else if (a.k === 'revive') { const t = this.byId(a.target); if (t && t.st === 'd' && hyp(t.x - e.x, t.y - e.y) < 80) { t.st = 'a'; t.hp = 35; this.evs.push({ e: 'msg', txt: `${e.name}님이 소생시켰습니다`, to: t.id }); } }
    else if (a.k === 'fuel') { const v = this.veh.find(v => v.id === a.target); if (v && e.it.fuel > 0) { e.it.fuel--; v.fuel = Math.min(100, v.fuel + 45); } }
    else if (a.k === 'search') {
      const b = this.boxes.get(a.target); if (!b || hyp(b.x - e.x, b.y - e.y) > 90) return;
      if (!b.searched.has(e.id)) { b.searched.add(e.id); e.boxes++; if (!b.t0) b.t0 = now; }
      if (e.bot) { for (let i = b.items.length - 1; i >= 0; i--) this.takeFromBox(e, b, i); if (b.k === 'body' && !b.items.length) this.delBox(b); }
      else { e.lootBox = b.id; this.sendLoot(b); }
    }
  }
  damage(v, amt, src, wn, zone, bx, by) {
    if (!this.alive(v)) return;
    const now = this.time;
    if (src && src !== v && !zone && (now < this.peaceEnd || now < v.inv)) return;
    if (!zone && v.arL > 0 && v.arD > 0) { const red = S.ARMOR[v.arL].red, ab = Math.min(v.arD, amt * red); v.arD -= ab; amt -= ab; if (v.arD <= 0) { v.arL = 0; v.arD = 0; } }
    v.hp -= amt; v.dmgT = now;
    if (src && src !== v) {
      if (src.team !== v.team) src.dmgDealt += Math.min(amt, Math.max(0, v.hp + amt));
      this.evs.push({ e: 'hit', to: src.id, d: Math.round(amt), x: r1(v.x), y: r1(v.y), k: v.hp <= 0 ? 1 : 0 }); v.lastHitBy = src.id;
      if (v.ai) { if (!v.ai.tgt) { v.ai.tgt = src.id; v.ai.react = now + 250; } if (now >= v.rollCd && Math.random() < .3) { const a = Math.atan2(src.y - v.y, src.x - v.x) + (Math.random() < .5 ? 1.57 : -1.57); this.roll(v, Math.cos(a), Math.sin(a), now); } }
    }
    if (bx !== undefined) this.evs.push({ e: 'hurt', to: v.id, x: r1(bx), y: r1(by) });
    if (v.act && v.act.k !== 'search' && v.act.k !== 'med') v.act = null;
    if (v.hp > 0) return;
    if (v.st === 'a' && this.ts > 1 && !this.world && this.ents.some(o => o !== v && o.team === v.team && o.st === 'a')) {
      v.st = 'd'; v.hp = 60; v.act = null; v.rlOn = false; v.downBy = src ? src.id : null;
      if (v.car) this.exitCar(v);
      this.evs.push({ e: 'kill', a: src ? src.name : '자기장', b: v.name, w: wn, down: 1, g: 1 });
      return;
    }
    this.kill(v, src, wn);
  }
  kill(v, src, wn, silent) {
    if (v.car) this.exitCar(v);
    v.st = 'x'; v.act = null; v.hp = 0; v.deadT = this.time; v.lootBox = null;
    if (src && src !== v && src.team !== v.team) src.kills++;
    if (!silent && (!this.world || !v.bot || (src && !src.bot))) this.evs.push({ e: 'kill', a: src ? src.name : (wn === 'zone' ? '자기장' : wn || '???'), b: v.name, w: wn === 'zone' ? '자기장' : wn, g: !this.world ? 1 : 0, x: r1(v.x), y: r1(v.y) });
    // 시체 상자
    const items = [];
    v.w.forEach(w => w && items.push({ k: 'w', w }));
    for (const k in v.am) if (v.am[k] > 0) items.push({ k: 'am', d: k, n: v.am[k] });
    for (const k in v.it) if (v.it[k] > 0) items.push({ k, n: v.it[k] });
    if (v.arL && v.arD > 5) items.push({ k: 'ar', d: v.arL, n: Math.round(v.arD) });
    if (v.val > 0) items.push({ k: 'val', d: 4, n: v.val });
    v.bag.forEach(a => items.push({ k: 'att', d: a }));
    if (items.length) { const p = { x: v.x, y: v.y }; S.resolve(this.M, p, 10, v.f); this.addBox(p.x, p.y, v.f, 'body', 0, items, v.name); }
    v.w = [null, null]; v.am = { light: 0, rifle: 0, shell: 0, sniper: 0 }; v.val = 0; v.bag = []; v.arL = 0; v.arD = 0;
    for (const k in v.it) v.it[k] = 0;
    if (v.ai && v.ai.kind === 'guard') v.respawnAt = this.time + 150000;
    if (!this.world) {
      const mates = this.ents.filter(o => o.team === v.team && o !== v);
      if (!mates.some(o => o.st === 'a')) for (const o of mates) if (o.st === 'd') this.kill(o, src, wn);
      if (!this.ents.some(o => o.team === v.team && this.alive(o))) { const place = this.aliveTeams().size + 1; for (const o of this.ents) if (o.team === v.team && !o.place) o.place = place; }
    }
    v.spec = src && this.alive(src) ? src.id : null;
    if (!v.bot) this.finish(v, 'dead');
  }
  calcXP(e, res) {
    const alive = Math.max(0, ((e.st === 'a' || e.st === 'd' ? this.time : (e.deadT || this.time)) - (e.spawnT || 0)) / 1000);
    let xp = e.kills * 120 + e.dmgDealt * .6 + Math.min(alive, 1500) * .4 + e.boxes * 15;
    if (res === 'win') xp += 600;
    if (!this.world && e.place) xp += Math.max(0, 20 - e.place) * 15;
    if (res === 'extract') xp += 400 + e.val * .05;
    return Math.round(xp);
  }
  finish(e, res) {
    if (e.finished) return; e.finished = true;
    if (res === 'mia') e.st = 'x';
    let saved = null;
    if (res === 'extract') { e.st = 'e'; if (e.car) this.exitCar(e); e.deadT = this.time; }
    const xp = this.calcXP(e, res), a = e.acc;
    if (a) {
      a.stats.games++; a.stats.kills += e.kills; a.xp = (a.xp || 0) + xp;
      if (res === 'win') a.stats.wins++;
      if (res === 'extract' && this.world) { a.stats.ext++; a.stats.val += e.val; a.money += e.val; saved = lootOf(e); for (const it of saved) ACC.addToStash(a, it); }
      ACC.persist(a);
    }
    const c = clients.get(e.cid); if (!c) return;
    send(c, JSON.stringify({ t: 'result', res, world: this.world ? 1 : 0, place: e.place || this.aliveTeams().size + 1, kills: e.kills, val: e.val, vals: e.vals || 0, time: Math.round(Math.max(0, this.time - (e.spawnT || 0)) / 1000), mode: this.mode, saved: saved ? saved.map(it => S.itemName(it) + (it.n > 1 && it.k !== 'ar' ? ' ×' + it.n : '')) : null, lost: this.world && res !== 'extract' ? Math.round(e.kitVal || 0) : 0, acct: !!a, xp, dmg: Math.round(e.dmgDealt), boxes: e.boxes, totalXp: a ? a.xp : null }));
    if (a && c.acc === a) sendAcc(c);
  }
  aliveTeams() { const s = new Set(); for (const e of this.ents) if (this.alive(e) && e.team !== 9999) s.add(e.team); return s; }
  checkEnd(now) {
    if (this.ended) return;
    const humansAlive = this.ents.some(e => !e.bot && this.alive(e));
    const teams = this.aliveTeams();
    if (teams.size <= 1) {
      this.ended = true;
      for (const e of this.ents) if (this.alive(e)) { e.place = 1; if (!e.bot) this.finish(e, 'win'); }
      const w = this.ents.find(e => this.alive(e));
      this.evs.push({ e: 'msg', txt: w ? `${w.name} 팀 최후의 생존` : '게임 종료', g: 1 });
      this.endAt = now + 6000;
    } else if (!humansAlive) { this.ended = true; this.endAt = now + 4000; }
  }

  // ───── 차량 ─────
  board(e, v) { const s = v.seats.indexOf(null); if (s < 0) return; v.seats[s] = e.id; e.car = v.id; e.act = null; e.rlOn = false; e.ad = false; }
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
          if (Math.abs(da) < 2.2) { const turn = 2.4 * dt * Math.min(1, Math.abs(v.v) / 140 + .25); v.a += Math.max(-turn, Math.min(turn, da)); v.v += 340 * dt * m * (Math.abs(da) < 1.3 ? 1 : .3); }
          else v.v -= 300 * dt * m;
        }
      }
      v.v *= Math.pow(.55, dt); const max = v.hp > 30 ? 620 : 380; v.v = Math.max(-160, Math.min(max, v.v));
      if (Math.abs(v.v) < 2) { v.v = 0; continue; }
      v.fuel = Math.max(0, v.fuel - Math.abs(v.v) / 620 * dt * .7);
      const nx = v.x + Math.cos(v.a) * v.v * dt, ny = v.y + Math.sin(v.a) * v.v * dt;
      const p = { x: nx, y: ny }; S.resolve(this.M, p, 30, 0);
      const off = hyp(p.x - nx, p.y - ny);
      if (off > 1.5 && Math.abs(v.v) > 150) { v.hp -= Math.abs(v.v) * .03; v.v *= .35; } else if (off > 1.5) v.v *= .7;
      v.x = p.x; v.y = p.y;
      if (Math.abs(v.v) > 110) for (const e of this.ents) {
        if (!this.alive(e) || e.car || e.f !== 0) continue; const d = hyp(e.x - v.x, e.y - v.y);
        if (d < 46) { if (drv && drv.team === e.team) continue; this.damage(e, Math.abs(v.v) * .11, drv || null, '차량', false, v.x, v.y); const q = { x: v.x + (e.x - v.x) / (d || 1) * 50, y: v.y + (e.y - v.y) / (d || 1) * 50 }; S.resolve(this.M, q, S.PR, 0); e.x = q.x; e.y = q.y; v.v *= .8; }
      }
      if (v.hp <= 0) this.explodeVeh(v, drv);
    }
    if (!this.world) this.veh = this.veh.filter(v => !v.dead || now - v.deadT < 15000);
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
    if (k !== 'smoke' && this.time < this.peaceEnd) return;
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
        if (now < e.rollUntil) continue; // 구르기 무적
        if (Math.abs(e.x - b.x) > 120 && Math.abs(e.x - nx) > 120) continue;
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
    const B = e.ai, guard = B.kind === 'guard';
    if (e.st === 'd') { e.fire = false; const mate = this.ents.find(o => o.team === e.team && o.st === 'a'); if (mate) { const a = Math.atan2(mate.y - e.y, mate.x - e.x); e.mx = Math.cos(a); e.my = Math.sin(a); } return; }
    const peace = now < this.peaceEnd;
    if (now >= B.nt) {
      B.nt = now + rand(180, 320);
      let best = null, bd = 1e9;
      if (!peace) for (const o of this.ents) {
        if (o === e || o.team === e.team || !this.alive(o) || o.f !== e.f || o.car) continue;
        const d = hyp(o.x - e.x, o.y - e.y); if (d > (guard ? 560 : 620) || d >= bd) continue;
        if (guard && this.inSafe(o.x, o.y)) continue;
        if (!this.canSee(e, o)) continue; best = o; bd = d;
      }
      if (best && (!B.tgt || B.tgt !== best.id)) { if (!B.tgt) B.react = now + rand(320, 680) * (guard ? 1.25 : 1); B.tgt = best.id; }
      if (!best && B.tgt) { const t = this.byId(B.tgt); if (!t || !this.alive(t) || hyp(t.x - e.x, t.y - e.y) > 900) B.tgt = null; else if (!this.canSee(e, t)) { B.goal = { x: t.x, y: t.y }; B.tgt = null; } }
      if (guard && e.home && (hyp(e.x - e.home.x, e.y - e.home.y) > 1100 || this.inSafe(e.x, e.y, 40))) { B.tgt = null; B.goal = { x: e.home.x, y: e.home.y }; B.wait = now + 3000; }
      if (guard && B.tgt) { const t0 = this.byId(B.tgt); if (t0 && this.inSafe(t0.x, t0.y)) { B.tgt = null; B.goal = { x: e.home.x, y: e.home.y }; } }
      if (!B.tgt && e.hp < 55 && !e.act) { if (e.it.med) this.startAct(e, 'med', 4000); else if (e.it.band && e.hp < 80) this.startAct(e, 'band', 1500); }
      const z = this.z;
      if (guard) {
        if (!B.tgt && (!B.goal || hyp(B.goal.x - e.x, B.goal.y - e.y) < 40) && now > B.wait) { for (let i = 0; i < 8; i++) { const a = rand(0, 6.283), d = rand(0, 320), gx = e.home.x + Math.cos(a) * d, gy = e.home.y + Math.sin(a) * d; if (!this.inSafe(gx, gy, 60)) { B.goal = { x: gx, y: gy }; break; } } B.wait = now + rand(1500, 5000); }
      } else if (z && (hyp(e.x - z.tcx, e.y - z.tcy) > z.tr * .9 && (z.st === 'shrink' || this.zoneOut(e) || hyp(e.x - z.cx, e.y - z.cy) > z.r - 300))) {
        if (!B.goal || !B.zg) { const a = rand(0, 6.283), d = Math.random() * z.tr * .6; B.goal = { x: z.tcx + Math.cos(a) * d, y: z.tcy + Math.sin(a) * d }; B.zg = true; B.box = null; }
      } else if (!B.goal || hyp(B.goal.x - e.x, B.goal.y - e.y) < 40) {
        B.zg = false; let bx = null, bdist = 650;
        for (const b of this.boxes.values()) { if (b.f !== 0 || b.searched.has(e.id) || (b.k === 'body' && !b.items.length)) continue; const d = hyp(b.x - e.x, b.y - e.y); if (d < bdist) { bx = b; bdist = d; } }
        if (bx && Math.random() < .85) { B.goal = { x: bx.x, y: bx.y }; B.box = bx.id; }
        else { const M = this.M; const t = pick(M.towns.filter(t => !z || hyp(t.x - z.tcx, t.y - z.tcy) < z.tr + 200).concat(z ? [{ x: z.tcx, y: z.tcy }] : [])) || { x: M.CX, y: M.CY }; B.goal = { x: t.x + rand(-400, 400), y: t.y + rand(-400, 400) }; B.box = null; }
      }
      if (!guard && B.box && !B.tgt && !e.act) { const b = this.boxes.get(B.box); if (!b || b.searched.has(e.id)) B.box = null; else if (hyp(b.x - e.x, b.y - e.y) < 50) { this.startAct(e, 'search', this.searchTime(b, e) * 1.2, b.id); B.goal = null; } }
      const moved = hyp(e.x - B.last.x, e.y - B.last.y); B.last = { x: e.x, y: e.y };
      if (moved < 4 && !e.act && !B.tgt && now > B.unstick && (!guard || B.goal)) { const a = rand(0, 6.283); B.ux = Math.cos(a); B.uy = Math.sin(a); B.unstick = now + rand(500, 1100); if (Math.random() < .3) B.goal = null; }
      if (now > B.flip) { B.strafe *= -1; B.flip = now + rand(600, 1500); }
    }
    const t = B.tgt && this.byId(B.tgt);
    e.fire = false;
    if (now < e.flash) { e.mx = Math.cos(now / 300); e.my = Math.sin(now / 300); return; }
    if (t && this.alive(t)) {
      const dx = t.x - e.x, dy = t.y - e.y, d = hyp(dx, dy), ang = Math.atan2(dy, dx);
      const w = e.w[e.cw];
      const lead = w ? d / w.st.spd : 0, sp = S.SPEED * .8;
      const aim = Math.atan2(dy + (t.moving ? t.my * sp * lead : 0), dx + (t.moving ? t.mx * sp * lead : 0));
      e.a = aim + (Math.random() - .5) * B.err * 2;
      const want = w ? Math.min(w.st.rng * .5, 380) : 0;
      const fwd = d > want + 60 ? 1 : d < want - 80 ? -1 : 0;
      e.mx = Math.cos(ang) * fwd + Math.cos(ang + Math.PI / 2) * B.strafe * .8; e.my = Math.sin(ang) * fwd + Math.sin(ang + Math.PI / 2) * B.strafe * .8;
      if (w && w.mag === 0 && e.am[w.st.am] === 0 && e.w[1 - e.cw]) { e.cw = 1 - e.cw; e.rlOn = false; }
      if (w && now > B.react && d < w.st.rng * .95) {
        if (now > B.pauseUntil) { B.fireUntil = now + rand(250, 600); B.pauseUntil = B.fireUntil + rand(350, 900) * (w.st.auto ? 1 : .4); }
        if (now < B.fireUntil) e.fire = w.st.auto ? true : !e.pfire;
      }
      if (e.it.gren && d > 150 && d < 380 && Math.random() < .003) this.throwG(e, 'gren');
      if (e.act) e.act = null;
      if (guard && this.inSafe(e.x + e.mx * 60, e.y + e.my * 60, 30)) { e.mx = 0; e.my = 0; }
    } else if (e.act && e.act.k === 'search') { e.mx = 0; e.my = 0; }
    else if (now < B.unstick) { e.mx = B.ux; e.my = B.uy; e.a = Math.atan2(e.my, e.mx); }
    else if (B.goal) { const dx = B.goal.x - e.x, dy = B.goal.y - e.y, d = hyp(dx, dy) || 1; const sl = guard && !B.tgt ? .55 : 1; e.mx = dx / d * sl; e.my = dy / d * sl; e.a = Math.atan2(dy, dx); if (guard && d < 40) { e.mx = 0; e.my = 0; } }
    else { e.mx = 0; e.my = 0; }
    const w = e.w[e.cw]; if (!t && w && w.mag < w.st.mag * .5) this.reload(e, now);
  }

  // ───── 스냅샷 ─────
  snapshot() {
    const z = this.z, now = this.time;
    const zs = z ? [r1(z.cx), r1(z.cy), r1(z.r), r1(z.tcx), r1(z.tcy), r1(z.tr), z.ph, z.st, Math.max(0, Math.round(((z.st === 'wait' ? z.wait : z.st === 'shrink' ? z.shrink : 0) - (now - z.t)) / 1000))] : null;
    const aliveN = this.world ? this.ents.filter(e => !e.bot && this.alive(e)).length : this.ents.filter(e => this.alive(e) && e.team !== 9999).length;
    const drs = this.drops.map(d => [d.id, r1(d.x), r1(d.y), d.landed ? 0 : Math.round((d.land - now) / 1000), d.open ? 1 : 0]);
    const peace = this.peaceEnd && now < this.peaceEnd ? Math.ceil((this.peaceEnd - now) / 1000) : 0;
    for (const c of this.humans()) {
      const e = this.byId(c.eid); if (!e) continue;
      let v = e;
      if (!this.alive(e)) {
        let s = e.spec && this.byId(e.spec);
        if (!s || !this.alive(s)) { s = this.ents.find(o => o.team === e.team && this.alive(o)) || (this.world ? null : (this.ents.find(o => this.alive(o) && !o.bot) || this.ents.find(o => this.alive(o)))); e.spec = s ? s.id : null; }
        if (s) v = s;
      }
      const ps = [];
      for (const o of this.ents) {
        if (o === e || !this.alive(o) || o.car) continue;
        if (Math.abs(o.x - v.x) > 1800 || Math.abs(o.y - v.y) > 1800) continue;
        const mate = o.team === e.team;
        if (!(mate && o.f === v.f) && o !== v && !this.canSee(v, o)) continue;
        const w = o.w[o.cw];
        ps.push([o.id, r1(o.x), r1(o.y), r2(o.a), o.f, Math.round(o.hp), o.st, w ? w.id : '', (now < o.rollUntil ? 1 : 0) | (o.rlOn ? 2 : 0) | (o.moving ? 4 : 0) | (o.act ? 8 : 0) | (mate ? 16 : 0) | (o.ad ? 32 : 0), o.arL, w ? (w.st.sil ? 1 : 0) | (w.st.scope ? 2 : 0) : 0]);
      }
      const bl = []; for (const b of this.bullets) if (b.f === v.f && Math.abs(b.x - v.x) < 1800 && Math.abs(b.y - v.y) < 1800) bl.push([b.id, r1(b.x), r1(b.y), r1(b.vx), r1(b.vy)]);
      const gr = []; for (const g of this.grens) if (g.f === v.f && hyp(g.x - v.x, g.y - v.y) < 1200) gr.push([g.id, r1(g.x), r1(g.y), g.k]);
      const sm = this.smokes.filter(s => s.f === v.f && hyp(s.x - v.x, s.y - v.y) < 1600).map(s => [s.id, r1(s.x), r1(s.y), s.r, Math.round((s.until - now) / 1000)]);
      const vh = []; if (v.f === 0) for (const k of this.veh) { const d = hyp(k.x - v.x, k.y - v.y); if (d < 140 || (d < 1200 && S.los(this.M, v.x, v.y, k.x, k.y, 0)) || k.id === e.car) vh.push(this.vehArr(k).concat([k.dead ? 1 : 0])); }
      const evs = [];
      for (const ev of this.evs) {
        if (ev.to !== undefined) { if (ev.to === e.id) evs.push(ev); continue; }
        if (ev.g) { evs.push(ev); continue; }
        if (ev.x !== undefined) { const d = hyp(ev.x - v.x, ev.y - v.y); if (ev.e === 'shot') { if (d < (ev.sil ? 220 : 1400) && ev.id !== e.id) evs.push(ev); } else if (d < 1500) evs.push(ev); }
      }
      const w = e.w;
      const me = { id: e.id, x: r2(e.x), y: r2(e.y), f: e.f, a: r2(e.a), hp: Math.round(e.hp), ar: e.arL, ad: Math.round(e.arD), st: e.st, cw: e.cw,
        w: w.map(x => x && { id: x.id, n: x.st.n, mag: x.mag, max: x.st.mag, am: x.st.am, att: x.att, c: x.st.c, auto: x.st.auto, sc: x.st.scope ? 1 : 0, sil: x.st.sil, dmg: Math.round(x.st.dmg * x.st.pel), iv: Math.round(x.st.iv), rng: Math.round(x.st.rng), rc: r2(x.st.rc), mv: r2(x.st.mv), sp: r2(x.st.sp), spd: Math.round(x.st.spd) }),
        am: e.am, it: e.it, bag: e.bag, val: e.val, rec: r2(e.rec), sp: this.spMul(e, now), rl: e.rlOn && w[e.cw] ? r2(1 - (e.rlEnd - now) / w[e.cw].st.rl) : -1,
        act: e.act ? [e.act.k, r2(1 - (e.act.end - now) / e.act.dur)] : null, rcd: Math.max(0, Math.round(e.rollCd - now)), rol: now < e.rollUntil ? 1 : 0, aim: e.ad ? 1 : 0, car: e.car, fl: Math.max(0, Math.round(e.flash - now)), kills: e.kills, ex: r2(e.exT), spec: v !== e ? v.id : null, vx: r1(v.x), vy: r1(v.y), vf: v.f, va: r2(v.a), xp: this.calcXP(e) };
      const msg = { t: 's', tm: Math.round(now / 1000), pre: this.pre > 0 ? Math.ceil(this.pre / 1000) : 0, peace, me, ps, bl, gr, sm, vh, z: zs, dr: drs, n: aliveN, ev: evs, exo: this.exOpen ? 1 : 0, tl: this.world && e.raidEnd ? Math.max(0, Math.round((e.raidEnd - now) / 1000)) : null };
      send(c, JSON.stringify(msg));
    }
    this.evs = [];
  }

  // ───── 입력 ─────
  input(c, m) {
    const e = this.byId(c.eid); if (!e || this.st !== 'play') return;
    if (m.t === 'i') {
      e.mx = +m.mx || 0; e.my = +m.my || 0; if (isFinite(+m.a)) e.a = +m.a; e.fire = !!m.f; e.ad = !!m.ad && e.st === 'a' && !e.car && this.time >= e.rollUntil; return;
    }
    if (m.t !== 'act' || this.pre > 0) return;
    const now = this.time, alive = e.st === 'a';
    switch (m.a) {
      case 'reload': if (alive) this.reload(e, now); break;
      case 'swap': if (alive && e.w[1 - e.cw]) { e.cw = 1 - e.cw; e.rlOn = false; e.nextShot = Math.max(e.nextShot, now + 250); } break;
      case 'slot': if (alive && e.w[m.i ? 1 : 0]) { e.cw = m.i ? 1 : 0; e.rlOn = false; } break;
      case 'roll': this.roll(e, +m.dx || 0, +m.dy || 0, now); break;
      case 'gren': case 'flash': case 'smoke': if (alive) this.throwG(e, m.a); break;
      case 'med': if (alive && e.it.med && e.hp < 100) { if (e.act) e.act = null; this.startAct(e, 'med', 4000); } break;
      case 'band': if (alive && e.it.band && e.hp < 100) { if (e.act) e.act = null; this.startAct(e, 'band', 1500); } break;
      case 'cancel': e.act = null; break;
      case 'fuel': if (alive && e.it.fuel) { const v = this.veh.find(v => !v.dead && hyp(v.x - e.x, v.y - e.y) < 85 && e.f === 0); if (v) this.startAct(e, 'fuel', 2000, v.id); } break;
      case 'interact': this.interact(e); break;
      case 'take': case 'takeall': {
        const b = this.boxes.get(+m.b); if (!alive || !b || e.lootBox !== b.id || hyp(b.x - e.x, b.y - e.y) > 110) break;
        if (m.a === 'take') this.takeFromBox(e, b, +m.i);
        else for (let i = b.items.length - 1; i >= 0; i--) this.takeFromBox(e, b, i);
        this.sendLoot(b); if (b.k === 'body' && !b.items.length) { this.delBox(b); e.lootBox = null; this.evs.push({ e: 'lootx', to: e.id }); }
        break;
      }
      case 'stash': { const b = this.boxes.get(e.lootBox); if (!alive || !b) break; // 들고 있는 것을 상자에 넣기
        if (m.k === 'w' && e.w[+m.i]) { b.items.push({ k: 'w', w: e.w[+m.i] }); e.w[+m.i] = null; if (e.cw === +m.i && e.w[1 - e.cw]) e.cw = 1 - e.cw; e.rlOn = false; this.sendLoot(b); } break; }
      case 'closeloot': e.lootBox = null; break;
      case 'dropw': if (alive) this.dropW(e, m.i ? 1 : 0); break;
      case 'craft': if (alive && e.w[0] && e.w[1]) {
        const base = S.hybrid(e.w[0], e.w[1]);
        for (const w of e.w) { e.am[w.st.am] += w.mag; for (const k in w.att) if (e.bag.length < 6) e.bag.push(w.att[k]); }
        const nw = newW('hyb', base); nw.mag = 0; e.w = [nw, null]; e.cw = 0; e.rlOn = false; this.reload(e, now);
        this.evs.push({ e: 'msg', txt: `조합 완료: ${base.n}`, to: e.id });
      } break;
      case 'equip': { const id = e.bag[m.b], w = e.w[m.i ? 1 : 0]; if (id && w) { const sl = S.ATT[id].slot; e.bag.splice(m.b, 1); if (w.att[sl]) e.bag.push(w.att[sl]); w.att[sl] = id; restat(w); w.mag = Math.min(w.mag, w.st.mag); } } break;
      case 'detach': { const w = e.w[m.i ? 1 : 0]; if (w && w.att[m.s] && e.bag.length < 6) { e.bag.push(w.att[m.s]); delete w.att[m.s]; restat(w); if (w.mag > w.st.mag) { e.am[w.st.am] += w.mag - w.st.mag; w.mag = w.st.mag; } } } break;
      case 'dropatt': { const id = e.bag[m.b]; if (id) { e.bag.splice(m.b, 1); this.addItem(e.x + rand(-20, 20), e.y + rand(-20, 20), e.f, { k: 'att', d: id }); } } break;
      case 'spec': if (!this.alive(e)) { const al = this.ents.filter(o => this.alive(o) && (!this.world || o.team === e.team)); if (al.length) { const i = al.findIndex(o => o.id === e.spec); e.spec = al[(i + 1) % al.length].id; } } break;
    }
  }
  interact(e) {
    if (e.car) { this.exitCar(e); return; }
    if (e.st !== 'a') return;
    if (e.act) { e.act = null; return; }
    const d = o => hyp(o.x - e.x, o.y - e.y);
    const mate = this.ents.find(o => o !== e && o.team === e.team && o.st === 'd' && o.f === e.f && d(o) < 65);
    if (mate) return this.startAct(e, 'revive', 4500, mate.id);
    let bb = null, bd = 64;
    for (const b of this.boxes.values()) if (b.f === e.f && Math.abs(b.x - e.x) < 70 && Math.abs(b.y - e.y) < 70 && d(b) < bd) { bb = b; bd = d(b); }
    let it = null, id = 56;
    for (const i of this.items.values()) if (i.k === 'w' && i.f === e.f && d(i) < id) { it = i; id = d(i); }
    if (bb && (!it || bd <= id)) { e.lootBox = null; return this.startAct(e, 'search', this.searchTime(bb, e), bb.id); }
    if (it) { const r = this.giveItem(e, it, null); if (r) { this.remItem(it); this.evs.push({ e: 'pick', to: e.id, k: 'w', d: it.w.st.n }); } return; }
    const v = this.veh.find(v => !v.dead && e.f === 0 && d(v) < 80 && v.seats.includes(null));
    if (v) return this.board(e, v);
  }
  leave(c) {
    this.members.delete(c.id);
    if (this.st === 'play' && this.ents) {
      const e = this.byId(c.eid);
      if (e) {
        if (this.world) { if (this.alive(e) && !e.finished) { e.finished = true; if (e.acc) { e.acc.stats.games++; ACC.persist(e.acc); } this.kill(e, null, '이탈', true); } e.cid = null; e.deadT = e.deadT || this.time; }
        else { e.cid = null; if (this.alive(e)) { e.bot = true; this.mkAIKeep(e); } }
      }
    }
    if (!this.world) { if (this.host === c.id) this.host = [...this.members][0] || null; if (this.members.size === 0) rooms.delete(this.id); else this.broadcastInfo(); }
    c.room = null; c.eid = null;
  }
  mkAIKeep(e) { const keep = { w: e.w, am: e.am, it: e.it, arL: e.arL, arD: e.arD, hp: e.hp }; this.mkAI(e, 'br'); Object.assign(e, keep); }
  backToLobby() {
    this.st = 'lobby'; this.ents = null; this.created = Date.now(); this.cd = null;
    for (const c of this.humans()) { c.eid = null; send(c, JSON.stringify({ t: 'lobby' })); }
    this.broadcastInfo();
  }
}
const WORLD = new Room({ name: '레이드 월드', world: 1 }, null);
rooms.set(WORLD.id, WORLD); WORLD.initWorld();

function send(c, m) { if (c.ws.readyState === 1) c.ws.send(m); }
function roomList() { return [...rooms.values()].map(r => r.world ? Object.assign({ id: r.id, name: r.name, mode: 'ex', world: 1, st: 'world', lk: 0 }, r.worldStatus()) : { id: r.id, name: r.name, mode: r.mode, ts: r.ts, n: r.members.size, st: r.st, lk: r.pw ? 1 : 0 }); }
function joinRoom(c, r, pw) {
  if (r.world) return r.addPlayer(c);
  if (r.pw && r.host !== c.id && String(pw || '') !== r.pw) return send(c, JSON.stringify({ t: 'err', code: 'pw', id: r.id, txt: pw ? '비밀번호가 틀렸습니다' : '비밀번호가 필요한 방입니다' }));
  if (c.room) leaveRoom(c);
  if (r.members.size >= S.MAXP) return send(c, JSON.stringify({ t: 'err', txt: '방이 가득 찼습니다 (최대 10명)' }));
  if (r.st !== 'lobby') return send(c, JSON.stringify({ t: 'err', txt: '이미 게임이 진행 중인 방입니다' }));
  r.members.add(c.id); c.room = r.id; if (!r.host) r.host = c.id; r.broadcastInfo();
}
function leaveRoom(c, quiet) { const r = rooms.get(c.room); if (r) r.leave(c); c.room = null; if (!quiet) send(c, JSON.stringify({ t: 'left' })); }

function sendAcc(c, token) { if (c.acc) send(c, JSON.stringify({ t: 'acct', acc: ACC.view(c.acc), token: token || undefined })); }
function setAcc(c, a, token) {
  for (const o of clients.values()) if (o !== c && o.acc === a) { o.acc = null; o.name = '손님' + randi(100, 999); send(o, JSON.stringify({ t: 'logout', txt: '다른 곳에서 로그인되어 로그아웃되었습니다' })); }
  c.acc = a; c.name = a.name; c.skin = S.cleanSkin(a.skin); sendAcc(c, token);
}
// 레이드 아이템 <-> 창고 아이템 변환
const wSer = w => ({ id: w.id, att: Object.assign({}, w.att), base: w.base || undefined });
function applyKit(e, kit) {
  let gotW = false;
  for (const it of kit) {
    if (it.k === 'w' && it.w) { const w = newW(it.w.id, it.w.base || null); w.att = Object.assign({}, it.w.att || {}); restat(w); w.mag = 0; const i = gotW ? 1 : 0; e.w[i] = w; gotW = true; }
    else if (it.k === 'ar') { e.arL = it.d; e.arD = it.n; }
    else if (it.k === 'am') e.am[it.d] = (e.am[it.d] || 0) + it.n;
    else if (it.k === 'att') e.bag.push(it.d);
    else if (S.ITEMN[it.k]) e.it[it.k] = (e.it[it.k] || 0) + it.n;
  }
  if (gotW) { if (e.w[0] && e.w[0].id === 'pistol' && !kit.some(x => x.k === 'w' && x.w.id === 'pistol')) {} e.cw = 0; for (const w of e.w) if (w) { const take = Math.min(w.st.mag, e.am[w.st.am] || 0); w.mag = take; e.am[w.st.am] -= take; } }
}
function lootOf(e) {
  const out = [];
  for (const w of e.w) if (w) { e.am[w.st.am] = (e.am[w.st.am] || 0) + w.mag; out.push({ k: 'w', w: wSer(w) }); }
  if (e.arL && e.arD > 5) out.push({ k: 'ar', d: e.arL, n: Math.round(e.arD) });
  for (const k in e.am) if (e.am[k] > 0) out.push({ k: 'am', d: k, n: e.am[k] });
  for (const k in e.it) if (e.it[k] > 0) out.push({ k, n: e.it[k] });
  for (const a of e.bag) out.push({ k: 'att', d: a });
  return out;
}
let nextCid = 1;
wss.on('connection', ws => {
  const c = { id: nextCid++, ws, name: '손님' + randi(100, 999), skin: S.cleanSkin({}), room: null, eid: null, acc: null, fails: 0, lockUntil: 0 };
  clients.set(c.id, c);
  send(c, JSON.stringify({ t: 'hi', id: c.id, rooms: roomList() }));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const r = c.room && rooms.get(c.room);
    if ((m.t === 'i' || m.t === 'act') && r) return r.input(c, m);
    switch (m.t) {
      case 'hello': {
        if (m.skin && typeof m.skin === 'object') { c.skin = S.cleanSkin(m.skin); if (c.acc) { c.acc.skin = c.skin; ACC.persist(c.acc); } }
        if (c.acc) { c.name = c.acc.name; break; }
        const want = ACC.validName(m.name) || c.name;
        if (ACC.isTaken(want)) { if (c.name === want || ACC.isTaken(c.name)) c.name = '손님' + randi(100, 999); send(c, JSON.stringify({ t: 'nametaken', name: c.name, txt: `'${want}'은(는) 등록된 계정입니다. 로그인하면 사용할 수 있어요` })); }
        else c.name = want;
        break;
      }
      case 'register': case 'login': {
        if (Date.now() < c.lockUntil) { send(c, JSON.stringify({ t: 'autherr', txt: '시도가 너무 많습니다. 잠시 후 다시 시도하세요' })); break; }
        const r = m.t === 'register' ? ACC.register(m.name, m.pw) : ACC.login(m.name, m.pw);
        if (r.err) { if (m.t === 'login' && ++c.fails >= 5) { c.lockUntil = Date.now() + 30000; c.fails = 0; } send(c, JSON.stringify({ t: 'autherr', txt: r.err })); break; }
        c.fails = 0; setAcc(c, r.acc, r.token); break;
      }
      case 'auth': { const a = ACC.byToken(m.token); if (a) setAcc(c, a, null); else send(c, JSON.stringify({ t: 'logout' })); break; }
      case 'logout': ACC.logout(c.acc, m.token); c.acc = null; c.name = '손님' + randi(100, 999); send(c, JSON.stringify({ t: 'logout' })); break;
      case 'stash': {
        if (!c.acc) break;
        const inRaid = r && r.st === 'play' && (!r.world || (r.byId(c.eid) && r.alive(r.byId(c.eid))));
        if (inRaid) { send(c, JSON.stringify({ t: 'err', txt: '게임 중에는 창고를 정리할 수 없습니다' })); break; }
        let err = null;
        if (m.op === 'kit') err = ACC.moveToKit(c.acc, +m.i);
        else if (m.op === 'unkit') err = ACC.moveToStash(c.acc, +m.i);
        else if (m.op === 'sell') err = ACC.sell(c.acc, +m.i, m.from);
        else if (m.op === 'buy') err = ACC.buy(c.acc, String(m.id));
        if (err) send(c, JSON.stringify({ t: 'err', txt: err }));
        sendAcc(c); break;
      }
      case 'list': send(c, JSON.stringify({ t: 'rooms', rooms: roomList() })); break;
      case 'create': { m.world = 0; if (m.pw && String(m.pw).length < 2) { send(c, JSON.stringify({ t: 'err', txt: '방 비밀번호는 2자 이상으로 입력하세요' })); break; } const nr = new Room(m, c.id); rooms.set(nr.id, nr); joinRoom(c, nr); break; }
      case 'join': { const jr = rooms.get(+m.id); if (jr) joinRoom(c, jr, m.pw); else send(c, JSON.stringify({ t: 'err', txt: '방을 찾을 수 없습니다' })); break; }
      case 'quick': { if (m.mode === 'ex') { WORLD.addPlayer(c); break; } let q = [...rooms.values()].find(x => !x.world && x.st === 'lobby' && !x.pw && x.members.size < S.MAXP); if (!q) { q = new Room({ name: '배그 빠른방', ts: 1 }, c.id); rooms.set(q.id, q); } joinRoom(c, q); break; }
      case 'leave': leaveRoom(c); break;
      case 'start': if (r && !r.world && r.host === c.id && r.st === 'lobby') { if (r.members.size >= S.MINP || Date.now() - r.created > 8000) r.begin(); else send(c, JSON.stringify({ t: 'err', txt: '방 생성 8초 후부터 봇과 시작할 수 있습니다' })); } break;
      case 'chat': if (r) { const txt = String(m.txt || '').slice(0, 60); if (txt) for (const h of r.humans()) send(h, JSON.stringify({ t: 'chat', name: c.name, txt })); } break;
      case 'ping': send(c, JSON.stringify({ t: 'pong', c: m.c })); break;
    }
  });
  ws.on('close', () => { if (c.room) { const r = rooms.get(c.room); if (r) r.leave(c); } clients.delete(c.id); });
});

// 메인 루프
if (process.env.SIM) { module.exports = { Room, clients, rooms, WORLD }; return; }
let last = Date.now();
setInterval(() => {
  const now = Date.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const r of rooms.values()) {
    if (r.st === 'play') { try { r.update(dt); if (!r.world && r.ended && r.time >= r.endAt) r.backToLobby(); } catch (err) { console.error('room error', err); if (!r.world) r.backToLobby(); } }
  }
}, TICK);
setInterval(() => {
  for (const r of rooms.values()) if (r.st === 'lobby' && !r.world) r.lobbyTick();
  const list = JSON.stringify({ t: 'rooms', rooms: roomList() });
  for (const c of clients.values()) if (!c.room) send(c, list);
}, 1000);

ACC.init().catch(err => console.error('[계정] 초기화 실패', err)).finally(() => server.listen(PORT, () => console.log('미니 배그 서버 실행중: http://localhost:' + PORT)));

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { try { await ACC.flush(); } catch (e) {} process.exit(0); });
