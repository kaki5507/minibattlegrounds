// 계정 / 창고 저장소
// DATABASE_URL 이 있으면 Postgres(jsonb 한 테이블), 없으면 data/accounts.json 파일에 저장
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const S = require('./shared.js');

const accounts = new Map(); // key(소문자 이름) -> 계정
const tokens = new Map();   // 토큰 해시 -> key
let pool = null;
const FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'accounts.json');
const STASH_MAX = 80;

const keyOf = n => String(n || '').trim().toLowerCase();
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');

async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, max: 3 });
    await pool.query('CREATE TABLE IF NOT EXISTS accounts (k TEXT PRIMARY KEY, data JSONB NOT NULL, updated TIMESTAMPTZ DEFAULT now())');
    const r = await pool.query('SELECT data FROM accounts');
    for (const row of r.rows) load(row.data);
    console.log(`[계정] Postgres 연결, ${accounts.size}개 계정 로드`);
  } else {
    try { const arr = JSON.parse(fs.readFileSync(FILE, 'utf8')); arr.forEach(load); } catch (e) {}
    console.log(`[계정] 파일 저장소 사용 (${FILE}), ${accounts.size}개 계정 로드 — 서버가 재시작되면 지워질 수 있으니 DATABASE_URL 을 설정하세요`);
  }
}
function load(a) { accounts.set(keyOf(a.name), a); for (const t of a.tokens || []) tokens.set(t, keyOf(a.name)); }

let fileTimer = null;
const dirty = new Set();
function persist(a) {
  dirty.add(keyOf(a.name));
  if (fileTimer) return;
  fileTimer = setTimeout(flush, 400);
}
async function flush() {
  fileTimer = null;
  const keys = [...dirty]; dirty.clear();
  if (pool) {
    for (const k of keys) { const a = accounts.get(k); if (!a) continue; try { await pool.query('INSERT INTO accounts (k, data, updated) VALUES ($1, $2, now()) ON CONFLICT (k) DO UPDATE SET data = $2, updated = now()', [k, a]); } catch (e) { console.error('[계정] 저장 실패', e.message); dirty.add(k); } }
  } else {
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify([...accounts.values()])); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('[계정] 파일 저장 실패', e.message); }
  }
}

function validName(n) { n = String(n || '').trim(); return n.length >= 2 && n.length <= 12 && !/[<>"'&\s]/.test(n) ? n : null; }
function isTaken(n) { return accounts.has(keyOf(n)); }
function newToken(a) { const t = crypto.randomBytes(24).toString('hex'); a.tokens = (a.tokens || []).slice(-4).concat(sha(t)); for (const [h, k] of tokens) if (k === keyOf(a.name) && !a.tokens.includes(h)) tokens.delete(h); tokens.set(sha(t), keyOf(a.name)); return t; }

const STARTER = () => [
  { k: 'w', w: { id: 'smg', att: {} } }, { k: 'am', d: 'light', n: 90 }, { k: 'ar', d: 1, n: S.ARMOR[1].dur },
  { k: 'med', n: 1 }, { k: 'band', n: 3 }, { k: 'gren', n: 1 },
];
function register(name, pw) {
  name = validName(name);
  if (!name) return { err: '닉네임은 2~12자, 공백·특수문자(<>"\'&) 없이 입력하세요' };
  if (String(pw || '').length < 4 || String(pw).length > 32) return { err: '비밀번호는 4~32자로 입력하세요' };
  if (isTaken(name)) return { err: '이미 사용 중인 닉네임입니다' };
  const salt = crypto.randomBytes(16).toString('hex');
  const a = { name, salt, hash: hashPw(pw, salt), created: Date.now(), xp: 0, stats: { wins: 0, ext: 0, kills: 0, games: 0, val: 0 }, money: 3000, stash: STARTER(), kit: [], skin: S.cleanSkin({}), tokens: [] };
  accounts.set(keyOf(name), a);
  const token = newToken(a); persist(a);
  return { acc: a, token };
}
function login(name, pw) {
  const a = accounts.get(keyOf(name));
  if (!a) return { err: '닉네임 또는 비밀번호가 틀렸습니다' };
  const h = hashPw(pw, a.salt);
  if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(a.hash, 'hex'))) return { err: '닉네임 또는 비밀번호가 틀렸습니다' };
  const token = newToken(a); persist(a);
  return { acc: a, token };
}
function byToken(t) { const k = tokens.get(sha(String(t || ''))); return k ? accounts.get(k) : null; }
function logout(a, t) { if (!a) return; const h = sha(String(t || '')); a.tokens = (a.tokens || []).filter(x => x !== h); tokens.delete(h); persist(a); }

// 공개용 계정 정보 (비밀번호/토큰 제외)
function view(a) { return { name: a.name, xp: a.xp || 0, stats: a.stats, money: a.money, stash: a.stash, kit: a.kit, skin: a.skin, max: STASH_MAX }; }

// ───── 창고 조작 ─────
const STACK = { am: 1, med: 1, band: 1, gren: 1, flash: 1, smoke: 1, fuel: 1 };
function addToStash(a, it) {
  if (STACK[it.k]) { const s = a.stash.find(x => x.k === it.k && (it.k !== 'am' || x.d === it.d)); if (s) { s.n += it.n; return true; } }
  if (a.stash.length >= STASH_MAX) { a.money += Math.floor(S.itemPrice(it) * .5); return false; }
  a.stash.push(it); return true;
}
function kitCount(a, k) { return a.kit.filter(x => x.k === k).length; }
function moveToKit(a, i) {
  const it = a.stash[i]; if (!it) return '아이템이 없습니다';
  if (it.k === 'w' && kitCount(a, 'w') >= 2) return '무기는 2개까지 가져갈 수 있습니다';
  if (it.k === 'ar' && kitCount(a, 'ar') >= 1) return '방어구는 1개만 가져갈 수 있습니다';
  if (it.k === 'val') return '귀중품은 레이드에 가져갈 수 없습니다 (판매하세요)';
  a.stash.splice(i, 1);
  if (STACK[it.k]) { const s = a.kit.find(x => x.k === it.k && (it.k !== 'am' || x.d === it.d)); if (s) { s.n += it.n; persist(a); return null; } }
  a.kit.push(it); persist(a); return null;
}
// 탈출 후 장비 유지: 무기 2·방어구 1·탄약·소모품·부착물은 장착(반입) 상태로, 넘치는 건 창고로
function equipFromRaid(a, items) {
  const kept = [], stored = [];
  for (const it of items) {
    let ok = false;
    if (it.k === 'w') ok = kitCount(a, 'w') < 2;
    else if (it.k === 'ar') ok = kitCount(a, 'ar') < 1;
    else if (it.k !== 'val') ok = true;
    if (ok) {
      if (STACK[it.k]) { const s = a.kit.find(x => x.k === it.k && (it.k !== 'am' || x.d === it.d)); if (s) s.n += it.n; else a.kit.push(it); }
      else a.kit.push(it);
      kept.push(it);
    } else { addToStash(a, it); stored.push(it); }
  }
  persist(a); return { kept, stored };
}
function moveToStash(a, i) { const it = a.kit[i]; if (!it) return '아이템이 없습니다'; a.kit.splice(i, 1); addToStash(a, it); persist(a); return null; }
function sell(a, i, from) {
  const list = from === 'kit' ? a.kit : a.stash, it = list[i]; if (!it) return '아이템이 없습니다';
  list.splice(i, 1); a.money += Math.floor(S.itemPrice(it) * .5); persist(a); return null;
}
function buy(a, id) {
  const p = S.SHOP.find(x => x.id === id); if (!p) return '없는 상품입니다';
  if (a.money < p.price) return '돈이 부족합니다';
  const it = JSON.parse(JSON.stringify(p.item));
  if (!STACK[it.k] && a.stash.length >= STASH_MAX) return '창고가 가득 찼습니다';
  a.money -= p.price; addToStash(a, it); persist(a); return null;
}

// ───── 랭킹 ─────
let rankCache = null, rankAt = 0;
function touchRank() { rankAt = 0; }
function ranking() {
  if (rankCache && Date.now() - rankAt < 10000) return rankCache;
  const all = [...accounts.values()];
  const top = (f, keep0) => all.map(a => ({ name: a.name, v: f(a), l: S.levelOf(a.xp || 0).l, c: a.created || 0 })).filter(r => keep0 || r.v > 0).sort((x, y) => y.v - x.v || x.c - y.c).slice(0, 30).map(({ c, ...r }) => r);
  rankCache = { total: all.length, xp: top(a => a.xp || 0, true), wins: top(a => a.stats.wins), ext: top(a => a.stats.ext), val: top(a => a.stats.val), kills: top(a => a.stats.kills) };
  rankAt = Date.now(); return rankCache;
}
module.exports = { ranking, touchRank, equipFromRaid, init, register, login, byToken, logout, view, isTaken, validName, persist, addToStash, moveToKit, moveToStash, sell, buy, keyOf, flush, STASH_MAX };
