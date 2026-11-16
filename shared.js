// 공유 모듈: 서버(Node)와 브라우저 양쪽에서 사용
(function (root) {
'use strict';
const S = {};
S.W = 8000; S.H = 8000; S.CX = 4000; S.CY = 4000; S.ISLAND = 3900; S.CELL = 250;
S.PR = 16;          // 플레이어 반지름
S.SPEED = 190;      // 기본 이동속도 px/s
S.VIS = 620;        // 시야 반경
S.VIS_SCOPE = 1150; // 스코프 시야(조준 방향 원뿔)
S.SCOPE_CONE = 0.5; // 라디안(±약 28도)
S.MAXP = 10;        // 방 최대 인원
S.MINP = 5;         // 자동 시작 인원

S.rng = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

// ───────── 무기 ─────────
// dmg 피해, iv 연사간격ms, mag 탄창, rl 재장전ms, spd 탄속, rng 사거리, sp 기본 탄퍼짐(도), rc 발당 반동(도), rmax 최대반동, rr 반동회복(도/초), pel 산탄수, am 탄종, auto 연사, mv 이동배율
S.WEAPONS = {
  pistol: { n: '권총', dmg: 20, iv: 300, mag: 12, rl: 1100, spd: 1500, rng: 650, sp: 1.5, rc: 2.6, rmax: 10, rr: 16, pel: 1, am: 'light', auto: 0, mv: 1.0, c: '#cfd8dc' },
  smg: { n: '기관단총', dmg: 13, iv: 68, mag: 30, rl: 1500, spd: 1400, rng: 520, sp: 3, rc: 1.7, rmax: 14, rr: 14, pel: 1, am: 'light', auto: 1, mv: .98, c: '#90caf9' },
  ar: { n: '돌격소총', dmg: 21, iv: 105, mag: 30, rl: 1900, spd: 1700, rng: 820, sp: 1.3, rc: 2.5, rmax: 15, rr: 12, pel: 1, am: 'rifle', auto: 1, mv: .95, c: '#a5d6a7' },
  dmr: { n: '지정사수소총', dmg: 44, iv: 340, mag: 10, rl: 2200, spd: 2100, rng: 1150, sp: .5, rc: 4.5, rmax: 12, rr: 10, pel: 1, am: 'rifle', auto: 0, mv: .92, c: '#ffe082' },
  sg: { n: '샷건', dmg: 11, iv: 850, mag: 6, rl: 2400, spd: 1100, rng: 330, sp: 7, rc: 9, rmax: 16, rr: 10, pel: 8, am: 'shell', auto: 0, mv: .97, c: '#ffab91' },
  sniper: { n: '저격총', dmg: 110, iv: 1500, mag: 5, rl: 2900, spd: 2800, rng: 1700, sp: .1, rc: 12, rmax: 20, rr: 8, pel: 1, am: 'sniper', auto: 0, mv: .85, c: '#ce93d8', scope: 1 },
  lmg: { n: '경기관총', dmg: 19, iv: 82, mag: 60, rl: 4300, spd: 1600, rng: 760, sp: 2.5, rc: 1.3, rmax: 22, rr: 9, pel: 1, am: 'rifle', auto: 1, mv: .82, c: '#ef9a9a' },
};
S.AMMO = { light: '경량탄', rifle: '소총탄', shell: '산탄', sniper: '저격탄' };
S.ATT = {
  sup: { n: '소음기', slot: 'muzzle', m: { dmg: .92, rng: .9 }, sil: 1, d: '총소리 숨김 / 피해·사거리↓' },
  comp: { n: '보정기', slot: 'muzzle', m: { rc: .62, sp: 1.1 }, d: '반동↓↓ / 탄퍼짐↑' },
  lbar: { n: '장총열', slot: 'barrel', m: { rng: 1.35, dmg: 1.1, mv: .95, sp: .8, iv: 1.08 }, d: '사거리·피해↑ / 이동·연사↓' },
  sbar: { n: '단총열', slot: 'barrel', m: { rng: .8, sp: 1.2, mv: 1.06, iv: .9 }, d: '연사·이동↑ / 사거리↓' },
  emag: { n: '확장탄창', slot: 'mag', m: { mag: 1.5, rl: 1.25 }, d: '탄창↑ / 재장전↓' },
  qmag: { n: '퀵드로우탄창', slot: 'mag', m: { rl: .6, mag: .85 }, d: '재장전↑↑ / 탄창↓' },
  stock: { n: '개머리판', slot: 'stock', m: { rc: .8, sp: .85, mv: .96 }, d: '반동·퍼짐↓ / 이동↓' },
  scope: { n: '조준경', slot: 'scope', m: { sp: .7, iv: 1.1, rng: 1.15 }, scope: 1, d: '원거리 시야·정확도↑ / 연사↓' },
};
S.SLOTS = ['muzzle', 'barrel', 'mag', 'stock', 'scope'];
S.ARMOR = [null, { red: .3, dur: 50, n: '1레벨 방어구' }, { red: .45, dur: 85, n: '2레벨 방어구' }, { red: .6, dur: 120, n: '3레벨 방어구' }];
S.VALUABLES = [['USB', 150], ['손목시계', 300], ['노트북', 450], ['보석', 600], ['금괴', 900], ['오리 황금상', 1500]];
S.ITEMN = { med: '구급상자', band: '붕대', gren: '수류탄', flash: '섬광탄', fuel: '연료통', smoke: '연막탄' };
S.ITEMCAP = { med: 4, band: 8, gren: 4, flash: 4, fuel: 3, smoke: 3 };

S.stats = function (w) {
  if (!w) return null;
  const b = w.base || S.WEAPONS[w.id];
  const s = Object.assign({}, b);
  s.scope = b.scope || 0; s.sil = 0;
  for (const k of S.SLOTS) {
    const a = w.att && w.att[k] && S.ATT[w.att[k]]; if (!a) continue;
    for (const key in a.m) s[key] *= a.m[key];
    if (a.scope) s.scope = 1; if (a.sil) s.sil = 1;
  }
  s.mag = Math.max(1, Math.round(s.mag));
  return s;
};
// 두 무기를 조합해 새로운 무기 생성 (장단점 존재)
S.hybrid = function (a, b) {
  const A = S.stats(a), B = S.stats(b);
  const hi = A.dmg * A.pel >= B.dmg * B.pel ? A : B, lo = hi === A ? B : A;
  return {
    n: (A.n.slice(0, 2) + '+' + B.n.slice(0, 2)) + ' 개조총',
    dmg: hi.dmg * 1.15, pel: hi.pel, iv: (A.iv + B.iv) / 2 * 1.05, mag: Math.round((A.mag + B.mag) / 2),
    rl: (A.rl + B.rl) * 0.7, spd: Math.max(A.spd, B.spd), rng: Math.max(A.rng, B.rng) * 1.05,
    sp: Math.max(A.sp, B.sp) * 1.15, rc: Math.max(A.rc, B.rc) * 1.25, rmax: Math.max(A.rmax, B.rmax), rr: Math.min(A.rr, B.rr),
    am: hi.am, auto: lo.auto || hi.auto, mv: Math.min(A.mv, B.mv) * 0.95, c: '#ffd54f', scope: (A.scope || B.scope) ? 1 : 0, hyb: 1,
  };
};

// ───────── 치장 (효과 없음) ─────────
// req: w=1등 횟수, x=탈출 횟수, k=누적 킬, g=플레이 판수
S.BODIES = {
  duck: { n: '오리', req: {}, col: '#ffeb3b', sc: 1.0, bobF: 14, bobA: 2.5, waddle: .25 },
  man: { n: '남자', req: {}, col: '#ffcc80', sc: 1.05, bobF: 10, bobA: 1.5, waddle: .05 },
  woman: { n: '여자', req: {}, col: '#ffcc80', sc: .98, bobF: 11, bobA: 1.8, waddle: .08 },
  chick: { n: '병아리', req: { g: 3 }, col: '#fff176', sc: .85, bobF: 18, bobA: 3, waddle: .3 },
  cat: { n: '고양이', req: { w: 1 }, col: '#ffb74d', sc: .92, bobF: 13, bobA: 1.2, waddle: .1 },
  frog: { n: '개구리', req: { k: 10 }, col: '#7cb342', sc: .95, bobF: 7, bobA: 5, waddle: 0 },
  dog: { n: '강아지', req: { w: 2 }, col: '#a1887f', sc: 1.0, bobF: 15, bobA: 2.2, waddle: .12 },
  rabbit: { n: '토끼', req: { w: 3 }, col: '#f5f5f5', sc: .9, bobF: 8, bobA: 4.5, waddle: 0 },
  penguin: { n: '펭귄', req: { x: 2 }, col: '#37474f', sc: .95, bobF: 16, bobA: 1.5, waddle: .35 },
  panda: { n: '판다', req: { k: 30 }, col: '#fafafa', sc: 1.1, bobF: 9, bobA: 2, waddle: .18 },
  bear: { n: '곰', req: { w: 5 }, col: '#6d4c41', sc: 1.15, bobF: 8, bobA: 2, waddle: .15 },
  robot: { n: '로봇', req: { g: 20 }, col: '#90a4ae', sc: 1.02, bobF: 20, bobA: .8, waddle: 0 },
  fox: { n: '여우', req: { w: 8 }, col: '#ff7043', sc: .96, bobF: 13, bobA: 2, waddle: .06 },
  alien: { n: '외계인', req: { x: 6 }, col: '#69f0ae', sc: .97, bobF: 6, bobA: 3, waddle: .1 },
  goldduck: { n: '황금오리', req: { w: 15 }, col: '#ffc107', sc: 1.05, bobF: 14, bobA: 2.5, waddle: .25 },
};
S.HATS = {
  none: { n: '없음', req: {} }, cap: { n: '야구모자', req: {} }, band: { n: '머리띠', req: { g: 1 } },
  beanie: { n: '비니', req: { g: 2 } }, headset: { n: '헤드셋', req: { k: 5 } }, beret: { n: '베레모', req: { x: 1 } },
  party: { n: '파티모자', req: { g: 5 } }, chef: { n: '요리사모자', req: { g: 10 } }, helmet: { n: '군용헬멧', req: { w: 2 } },
  propeller: { n: '프로펠러', req: { k: 20 } }, pirate: { n: '해적모자', req: { k: 40 } }, cowboy: { n: '카우보이', req: { w: 4 } },
  santa: { n: '산타모자', req: { g: 30 } }, flower: { n: '꽃핀', req: { x: 3 } }, tophat: { n: '실크햇', req: { x: 5 } },
  viking: { n: '바이킹', req: { k: 80 } }, crown: { n: '왕관', req: { w: 10 } }, halo: { n: '천사링', req: { w: 20 } },
};
S.FACES = {
  none: { n: '없음', req: {} }, shades: { n: '선글라스', req: {} }, mask: { n: '마스크', req: { g: 2 } },
  round: { n: '동그란안경', req: { g: 4 } }, eyepatch: { n: '안대', req: { k: 15 } }, goggles: { n: '스키고글', req: { x: 1 } },
  clown: { n: '빨간코', req: { g: 15 } }, mustache: { n: '콧수염', req: { w: 1 } }, nvg: { n: '야간투시경', req: { k: 50 } },
  gasmask: { n: '방독면', req: { x: 4 } }, star: { n: '별안경', req: { w: 6 } },
};
S.GLOVES = {
  none: { n: '맨손', req: {} }, work: { n: '목장갑', c: '#f5f0dc', req: {} }, tactical: { n: '전술장갑', c: '#2b2b2b', req: { g: 2 } },
  latex: { n: '고무장갑', c: '#4fc3f7', req: { g: 6 } }, mitten: { n: '벙어리장갑', c: '#e53935', cuff: '#fff', req: { g: 12 } },
  boxing: { n: '권투글러브', c: '#d32f2f', big: 1, req: { k: 25 } }, skull: { n: '해골장갑', c: '#111', dots: '#eee', req: { k: 60 } },
  claw: { n: '발톱', c: '#5d4037', claw: 1, req: { x: 2 } }, fire: { n: '불꽃장갑', c: '#ff6d00', glow: '#ffd54f', req: { w: 3 } },
  gold: { n: '황금장갑', c: '#ffd600', glow: '#fff59d', req: { w: 12 } },
};
S.BAGS = {
  none: { n: '없음', req: {} }, school: { n: '책가방', c: '#e53935', req: {} }, duck: { n: '오리가방', c: '#ffeb3b', req: { g: 3 } },
  mil: { n: '군용배낭', c: '#556b2f', req: { k: 8 } }, guitar: { n: '기타케이스', c: '#3e2723', req: { g: 8 } },
  tank: { n: '산소통', c: '#b0bec5', req: { x: 2 } }, wings: { n: '천사날개', c: '#fff', req: { w: 5 } },
  jet: { n: '제트팩', c: '#607d8b', req: { k: 100 } }, cape: { n: '망토', c: '#7b1fa2', req: { w: 9 } },
};
S.GSKINS = {
  none: { n: '기본', req: {} }, black: { n: '블랙', c: '#212121', req: {} }, desert: { n: '데저트', c: '#c8a165', req: { g: 2 } },
  camo: { n: '위장', c: '#556b2f', c2: '#33401c', req: { k: 10 } }, pink: { n: '핑크', c: '#f48fb1', req: { g: 7 } },
  ice: { n: '아이스', c: '#b3e5fc', c2: '#fff', req: { x: 1 } }, dragon: { n: '드래곤', c: '#b71c1c', c2: '#ffc107', req: { w: 4 } },
  galaxy: { n: '갤럭시', c: '#311b92', c2: '#e1bee7', req: { k: 70 } }, gold: { n: '황금', c: '#ffc400', c2: '#fff8e1', req: { w: 8 } },
  rainbow: { n: '무지개', rb: 1, req: { w: 25 } },
};
S.COLORS = {
  green: { n: '국방', c: '#558b2f', req: {} }, blue: { n: '파랑', c: '#1e88e5', req: {} }, red: { n: '빨강', c: '#e53935', req: {} },
  orange: { n: '주황', c: '#fb8c00', req: { g: 1 } }, sky: { n: '하늘', c: '#4fc3f7', req: { g: 3 } }, black: { n: '블랙', c: '#263238', req: { w: 1 } },
  pink: { n: '핑크', c: '#ec407a', req: { w: 2 } }, camo: { n: '사막', c: '#c8a165', req: { x: 1 } }, mint: { n: '민트', c: '#4db6ac', req: { k: 12 } },
  purple: { n: '보라', c: '#8e24aa', req: { w: 3 } }, white: { n: '설원', c: '#eceff1', req: { x: 3 } }, gold: { n: '골드', c: '#ffb300', req: { w: 7 } },
};
// ───────── 경제 (타르코프식 창고/상인) ─────────
S.PRICE = { w: { pistol: 300, smg: 900, ar: 1800, dmr: 2400, sg: 1200, sniper: 3600, lmg: 3000, hyb: 3200 }, ar: [0, 600, 1500, 3200], am: { light: 4, rifle: 8, shell: 10, sniper: 30 },
  it: { med: 400, band: 80, gren: 350, flash: 250, smoke: 200, fuel: 150 }, att: 450 };
S.itemPrice = function (it) {
  if (!it) return 0;
  if (it.k === 'w') { const w = it.w || {}; return (S.PRICE.w[w.id] || 1000) + Object.keys(w.att || {}).length * S.PRICE.att; }
  if (it.k === 'ar') { const full = S.ARMOR[it.d] ? S.ARMOR[it.d].dur : 1; return Math.round(S.PRICE.ar[it.d] * (.4 + .6 * Math.min(1, (it.n || 0) / full))); }
  if (it.k === 'am') return (S.PRICE.am[it.d] || 5) * (it.n || 0);
  if (it.k === 'att') return S.PRICE.att;
  if (it.k === 'val') return (it.n || 0) * 2;
  return (S.PRICE.it[it.k] || 50) * (it.n || 1);
};
S.itemName = function (it) {
  if (it.k === 'w') { const w = it.w || {}; return (w.base && w.base.n) || (S.WEAPONS[w.id] ? S.WEAPONS[w.id].n : '무기'); }
  if (it.k === 'ar') return S.ARMOR[it.d] ? S.ARMOR[it.d].n : '방어구';
  if (it.k === 'am') return S.AMMO[it.d] || '탄약';
  if (it.k === 'att') return S.ATT[it.d] ? S.ATT[it.d].n : '부착물';
  if (it.k === 'val') return S.VALUABLES[it.d] ? S.VALUABLES[it.d][0] : '귀중품';
  return S.ITEMN[it.k] || it.k;
};
S.SHOP = [];
(function () {
  const add = (id, cat, item, mul) => S.SHOP.push({ id, cat, item, price: Math.round(S.itemPrice(item) * (mul || 1.2)) });
  for (const w of ['pistol', 'smg', 'sg', 'ar', 'dmr', 'lmg', 'sniper']) add('w_' + w, '무기', { k: 'w', w: { id: w, att: {} } });
  for (const l of [1, 2, 3]) add('ar_' + l, '방어구', { k: 'ar', d: l, n: S.ARMOR[l].dur });
  add('am_light', '탄약', { k: 'am', d: 'light', n: 60 }); add('am_rifle', '탄약', { k: 'am', d: 'rifle', n: 60 });
  add('am_shell', '탄약', { k: 'am', d: 'shell', n: 20 }); add('am_sniper', '탄약', { k: 'am', d: 'sniper', n: 10 });
  for (const k of ['med', 'band', 'gren', 'flash', 'smoke']) add('it_' + k, '소모품', { k, n: k === 'band' ? 3 : 1 });
  for (const a in S.ATT) add('att_' + a, '부착물', { k: 'att', d: a });
})();

S.SKINSLOTS = { body: S.BODIES, hat: S.HATS, face: S.FACES, glove: S.GLOVES, bag: S.BAGS, gskin: S.GSKINS, col: S.COLORS };
S.cleanSkin = function (k) {
  const o = {}; k = k || {};
  for (const sl in S.SKINSLOTS) o[sl] = S.SKINSLOTS[sl][k[sl]] ? k[sl] : Object.keys(S.SKINSLOTS[sl])[0];
  if (o.col === 'green' && !(k.col in S.COLORS)) o.col = 'green';
  return o;
};
S.unlocked = function (req, save) { return (save.wins || 0) >= (req.w || 0) && (save.ext || 0) >= (req.x || 0) && (save.kills || 0) >= (req.k || 0) && (save.games || 0) >= (req.g || 0); };

// ───────── 기하 ─────────
function segRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  if (Math.abs(dx) < 1e-9) { if (x1 < rx || x1 > rx + rw) return 2; }
  else { let a = (rx - x1) / dx, b = (rx + rw - x1) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2; }
  if (Math.abs(dy) < 1e-9) { if (y1 < ry || y1 > ry + rh) return 2; }
  else { let a = (ry - y1) / dy, b = (ry + rh - y1) / dy; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return 2; }
  return t0;
}
function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1, fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; if (a < 1e-9) return 2;
  const disc = b * b - 4 * a * c; if (disc < 0) return 2;
  const t = (-b - Math.sqrt(disc)) / (2 * a); return (t >= 0 && t <= 1) ? t : 2;
}
S.segRect = segRect; S.segCircle = segCircle;
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy; let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - x1 - dx * t, py - y1 - dy * t);
}
S.distSeg = distSeg;

// ───────── 맵 생성 (에란겔 느낌의 섬) ─────────
S.genMap = function (seed) {
  const R = S.rng(seed), rnd = (a, b) => a + (b - a) * R(), ri = (a, b) => Math.floor(rnd(a, b + 1));
  const M = { seed, walls: [], circles: [], lakes: [], towns: [], blds: [], portals: [], roads: [], vehSpots: [], loot: [], extracts: [], tps: [] };
  const T = 12;
  const inIsland = (x, y, m) => Math.hypot(x - S.CX, y - S.CY) < S.ISLAND - m;
  // 호수
  for (let i = 0; i < 40 && M.lakes.length < 6; i++) {
    const a = rnd(0, 6.283), d = rnd(600, 3200), x = S.CX + Math.cos(a) * d, y = S.CY + Math.sin(a) * d, r = rnd(180, 400);
    if (!inIsland(x, y, r + 150)) continue;
    if (M.lakes.some(l => Math.hypot(l.x - x, l.y - y) < l.r + r + 400)) continue;
    M.lakes.push({ x, y, r });
  }
  const nearLake = (x, y, m) => M.lakes.some(l => Math.hypot(l.x - x, l.y - y) < l.r + m);
  // 벽 헬퍼
  function side(x, y, len, horiz, gaps, f) {
    gaps.sort((a, b) => a.c - b.c); let pos = 0;
    const seg = (a, b, win) => { if (b - a < 2) return; M.walls.push(horiz ? { x: x + a, y: y - T / 2, w: b - a, h: T, f, win: win ? 1 : 0 } : { x: x - T / 2, y: y + a, w: T, h: b - a, f, win: win ? 1 : 0 }); };
    for (const g of gaps) { const s = g.c - g.w / 2, e = g.c + g.w / 2; if (s > pos) seg(pos, s); if (g.t === 'win') seg(s, e, 1); pos = e; }
    if (pos < len) seg(pos, len);
  }
  function building(bx, by, bw, bh, nf, tier, town) {
    const b = { x: bx, y: by, w: bw, h: bh, nf, town }; M.blds.push(b);
    const doorSides = [0, 1, 2, 3].sort(() => R() - .5).slice(0, ri(1, 2));
    for (let f = 0; f < nf; f++) {
      const sides = [[bx, by, bw, true], [bx, by + bh, bw, true], [bx, by, bh, false], [bx + bw, by, bh, false]];
      sides.forEach((s, i) => {
        const len = s[2], gaps = [];
        if (f === 0 && doorSides.includes(i)) gaps.push({ c: rnd(50, len - 50), w: 58, t: 'door' });
        else gaps.push({ c: len / 2 + rnd(-len / 5, len / 5), w: 56, t: 'win' });
        side(s[0], s[1], len, s[3], gaps, f);
      });
      // 내부 칸막이
      if (bw > bh) { const px = bx + bw * rnd(.38, .62); side(px, by, bh, false, [{ c: rnd(45, bh - 45), w: 56, t: 'door' }], f); }
      else { const py = by + bh * rnd(.38, .62); side(bx, py, bw, true, [{ c: rnd(45, bw - 45), w: 56, t: 'door' }], f); }
      // 루팅 위치
      const cnt = ri(2, 4);
      for (let k = 0; k < cnt; k++) M.loot.push({ x: rnd(bx + 30, bx + bw - 30), y: rnd(by + 30, by + bh - 30), f, tier: Math.min(2, tier + (f > 0 ? 1 : 0) * (R() < .5 ? 1 : 0)) });
    }
    // 계단 포탈
    const cs = [[bx + 32, by + 32], [bx + bw - 32, by + bh - 32]];
    for (let k = 0; k < nf - 1; k++) {
      const c = cs[k % 2];
      M.portals.push({ id: M.portals.length, x: c[0], y: c[1], f: k, tx: c[0], ty: c[1], tf: k + 1, r: 20, kind: 'up' });
      M.portals.push({ id: M.portals.length, x: c[0], y: c[1], f: k + 1, tx: c[0], ty: c[1], tf: k, r: 20, kind: 'down' });
    }
  }
  const overlapsB = (x, y, w, h, m) => M.blds.some(b => x < b.x + b.w + m && x + w > b.x - m && y < b.y + b.h + m && y + h > b.y - m);
  // 마을
  const kinds = ['mil', 'mil', 'big', 'big', 'big', 'big', 'small', 'small', 'small', 'small', 'small', 'small'];
  const names = { mil: ['북부 군사기지', '폐광산 기지'], big: ['오리시티', '호수마을', '항구도시', '중앙학교'], small: ['풍차농장', '시립병원', '등대마을', '송전소', '철강공장', '숲속산장'] };
  const used = { mil: 0, big: 0, small: 0 };
  for (const kind of kinds) {
    for (let tries = 0; tries < 300; tries++) {
      const a = rnd(0, 6.283), d = rnd(300, 3200), x = S.CX + Math.cos(a) * d, y = S.CY + Math.sin(a) * d;
      if (!inIsland(x, y, 600) || nearLake(x, y, 550)) continue;
      if (M.towns.some(t => Math.hypot(t.x - x, t.y - y) < 950)) continue;
      const town = { x, y, kind, name: names[kind][used[kind]++] }; M.towns.push(town);
      const tier = kind === 'mil' ? 2 : kind === 'big' ? 1 : 0;
      const nb = kind === 'big' ? ri(7, 9) : kind === 'mil' ? ri(4, 5) : ri(3, 5);
      let placed = 0;
      for (let k = 0; k < 200 && placed < nb; k++) {
        const big = kind === 'mil';
        const bw = big ? rnd(220, 300) : rnd(140, 250), bh = big ? rnd(180, 260) : rnd(130, 210);
        const bx = x + rnd(-430, 430) - bw / 2, by = y + rnd(-430, 430) - bh / 2;
        if (overlapsB(bx, by, bw, bh, 70)) continue;
        if (!inIsland(bx + bw / 2, by + bh / 2, 300)) continue;
        const r = R(); const nf = kind === 'small' ? (r < .6 ? 1 : 2) : (r < .35 ? 1 : r < .7 ? 2 : 3);
        building(bx, by, bw, bh, nf, tier, M.towns.length - 1); placed++;
      }
      if (kind === 'mil') { // 외곽 담장
        const fr = 560;
        side(x - fr, y - fr, fr * 2, true, [{ c: fr, w: 110, t: 'door' }], 0);
        side(x - fr, y + fr, fr * 2, true, [{ c: fr, w: 110, t: 'door' }], 0);
        side(x - fr, y - fr, fr * 2, false, [{ c: fr * .5, w: 90, t: 'door' }], 0);
        side(x + fr, y - fr, fr * 2, false, [{ c: fr * 1.5, w: 90, t: 'door' }], 0);
        for (let k = 0; k < 8; k++) { const cx = x + rnd(-480, 480), cy = y + rnd(-480, 480); if (!overlapsB(cx - 30, cy - 30, 60, 60, 20)) M.circles.push({ x: cx, y: cy, r: rnd(22, 34), t: 'crate' }); }
      }
      break;
    }
  }
  // 도로
  const pairs = new Set();
  M.towns.forEach((t, i) => {
    const near = M.towns.map((o, j) => [j, Math.hypot(o.x - t.x, o.y - t.y)]).filter(a => a[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
    for (const [j] of near) { const key = Math.min(i, j) + '-' + Math.max(i, j); if (pairs.has(key)) continue; pairs.add(key); const o = M.towns[j]; const mx = (t.x + o.x) / 2 + rnd(-200, 200), my = (t.y + o.y) / 2 + rnd(-200, 200); M.roads.push([t.x, t.y, mx, my], [mx, my, o.x, o.y]); }
  });
  const nearRoad = (x, y, m) => M.roads.some(r => distSeg(x, y, r[0], r[1], r[2], r[3]) < m);
  // 차량 위치
  for (const r of M.roads) { for (let k = 0; k < 1; k++) { const t = rnd(.2, .8), x = r[0] + (r[2] - r[0]) * t, y = r[1] + (r[3] - r[1]) * t; if (inIsland(x, y, 100) && !nearLake(x, y, 60) && !overlapsB(x - 40, y - 40, 80, 80, 10)) M.vehSpots.push({ x, y, a: Math.atan2(r[3] - r[1], r[2] - r[0]) }); } }
  // 순간이동 포탈 (먼 지역 연결)
  for (let p = 0, tries = 0; p < 3 && tries < 500; tries++) {
    const pts = [];
    for (let k = 0; k < 2; k++) { const a = rnd(0, 6.283), d = rnd(900, 3300); pts.push([S.CX + Math.cos(a) * d, S.CY + Math.sin(a) * d]); }
    const [A, B] = pts; if (Math.hypot(A[0] - B[0], A[1] - B[1]) < 2500) continue;
    if (pts.some(q => !inIsland(q[0], q[1], 200) || nearLake(q[0], q[1], 120) || overlapsB(q[0] - 60, q[1] - 60, 120, 120, 30) || M.tps.some(t => Math.hypot(t.x - q[0], t.y - q[1]) < 600))) continue;
    const ia = M.portals.length;
    M.portals.push({ id: ia, x: A[0], y: A[1], f: 0, tx: B[0], ty: B[1], tf: 0, r: 34, kind: 'tp', pair: p });
    M.portals.push({ id: ia + 1, x: B[0], y: B[1], f: 0, tx: A[0], ty: A[1], tf: 0, r: 34, kind: 'tp', pair: p });
    M.tps.push({ x: A[0], y: A[1], pair: p }, { x: B[0], y: B[1], pair: p }); p++;
  }
  // 나무/바위
  const forests = []; for (let i = 0; i < 12; i++) { const a = rnd(0, 6.283), d = rnd(400, 3500); forests.push([S.CX + Math.cos(a) * d, S.CY + Math.sin(a) * d, rnd(280, 480)]); }
  const okSpot = (x, y, r) => inIsland(x, y, r + 20) && !nearLake(x, y, r + 30) && !overlapsB(x - r, y - r, r * 2, r * 2, 35) && !nearRoad(x, y, 40 + r) && !M.tps.some(t => Math.hypot(t.x - x, t.y - y) < 90) && !M.towns.some(t => t.kind === 'mil' && Math.abs(t.x - x) < 600 && Math.abs(t.y - y) < 600 && (Math.abs(Math.abs(t.x - x) - 560) < 40 + r || Math.abs(Math.abs(t.y - y) - 560) < 40 + r));
  for (let i = 0; i < 3200; i++) {
    let x, y; if (R() < .6) { const fo = forests[ri(0, forests.length - 1)], a = rnd(0, 6.283), d = Math.sqrt(R()) * fo[2]; x = fo[0] + Math.cos(a) * d; y = fo[1] + Math.sin(a) * d; }
    else { const a = rnd(0, 6.283), d = Math.sqrt(R()) * S.ISLAND; x = S.CX + Math.cos(a) * d; y = S.CY + Math.sin(a) * d; }
    const r = rnd(16, 24); if (!okSpot(x, y, r)) continue;
    M.circles.push({ x, y, r, t: 'tree' });
  }
  for (let i = 0; i < 260; i++) { const a = rnd(0, 6.283), d = Math.sqrt(R()) * S.ISLAND, x = S.CX + Math.cos(a) * d, y = S.CY + Math.sin(a) * d, r = rnd(24, 48); if (okSpot(x, y, r)) M.circles.push({ x, y, r, t: 'rock' }); }
  // 야외 루팅
  for (let i = 0; i < 260; i++) { const a = rnd(0, 6.283), d = Math.sqrt(R()) * 3600, x = S.CX + Math.cos(a) * d, y = S.CY + Math.sin(a) * d; if (okSpot(x, y, 14)) M.loot.push({ x, y, f: 0, tier: 0 }); }
  // 탈출 지점 (해안가)
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + rnd(-.2, .2); for (let d = 3550; d > 2800; d -= 50) { const x = S.CX + Math.cos(a) * d, y = S.CY + Math.sin(a) * d; if (!nearLake(x, y, 150) && !overlapsB(x - 100, y - 100, 200, 200, 0)) { M.extracts.push({ x, y, r: 95, name: ['북','북동','남동','남','남서','북서'][0] }); break; } } }
  M.extracts.forEach((e, i) => { const ang = Math.atan2(e.y - S.CY, e.x - S.CX); e.name = S.dirName(ang) + ' 탈출구'; });
  S.buildGrid(M);
  return M;
};
S.dirName = function (ang) { const d = ['동', '남동', '남', '남서', '서', '북서', '북', '북동']; let i = Math.round(((ang % 6.283) + 6.283) % 6.283 / (Math.PI / 4)) % 8; return d[i]; };
S.serialize = function (M) {
  const r = n => Math.round(n);
  return JSON.stringify({ seed: M.seed, walls: M.walls.map(w => [r(w.x), r(w.y), r(w.w), r(w.h), w.f, w.win]), circles: M.circles.map(c => [r(c.x), r(c.y), r(c.r), c.t]), lakes: M.lakes, towns: M.towns, blds: M.blds, portals: M.portals, roads: M.roads, extracts: M.extracts, tps: M.tps });
};
S.hydrate = function (o) {
  const M = Object.assign({}, o);
  M.walls = o.walls.map(a => ({ x: a[0], y: a[1], w: a[2], h: a[3], f: a[4], win: a[5] }));
  M.circles = o.circles.map(a => ({ x: a[0], y: a[1], r: a[2], t: a[3] }));
  S.buildGrid(M); return M;
};
S.buildGrid = function (M) {
  const C = S.CELL, gw = Math.ceil(S.W / C); M.gw = gw; M.cells = new Array(gw * gw).fill(null);
  const add = (x0, y0, x1, y1, key, o) => {
    const a = Math.max(0, Math.floor(x0 / C)), b = Math.min(gw - 1, Math.floor(x1 / C)), c = Math.max(0, Math.floor(y0 / C)), d = Math.min(gw - 1, Math.floor(y1 / C));
    for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) { const i = cy * gw + cx; if (!M.cells[i]) M.cells[i] = { w: [], c: [] }; M.cells[i][key].push(o); }
  };
  for (const w of M.walls) add(w.x, w.y, w.x + w.w, w.y + w.h, 'w', w);
  for (const c of M.circles) add(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r, 'c', c);
};
// 원형 엔티티 충돌 해소. p={x,y}
S.resolve = function (M, p, r, f) {
  const dx = p.x - S.CX, dy = p.y - S.CY, d = Math.hypot(dx, dy), lim = S.ISLAND - r;
  if (d > lim) { p.x = S.CX + dx / d * lim; p.y = S.CY + dy / d * lim; }
  for (const l of M.lakes) { const ex = p.x - l.x, ey = p.y - l.y, dd = Math.hypot(ex, ey), m = l.r + r; if (dd < m) { if (dd > .01) { p.x = l.x + ex / dd * m; p.y = l.y + ey / dd * m; } else p.x += m; } }
  const C = S.CELL, gw = M.gw;
  for (let it = 0; it < 2; it++) {
    const a = Math.max(0, Math.floor((p.x - r) / C)), b = Math.min(gw - 1, Math.floor((p.x + r) / C)), c = Math.max(0, Math.floor((p.y - r) / C)), e = Math.min(gw - 1, Math.floor((p.y + r) / C));
    for (let cy = c; cy <= e; cy++) for (let cx = a; cx <= b; cx++) {
      const cell = M.cells[cy * gw + cx]; if (!cell) continue;
      for (const w of cell.w) {
        if (w.f !== f) continue;
        const qx = Math.max(w.x, Math.min(p.x, w.x + w.w)), qy = Math.max(w.y, Math.min(p.y, w.y + w.h));
        let ex = p.x - qx, ey = p.y - qy; const d2 = ex * ex + ey * ey;
        if (d2 >= r * r) continue;
        if (d2 > 1e-6) { const dd = Math.sqrt(d2); p.x += ex / dd * (r - dd); p.y += ey / dd * (r - dd); }
        else { const l = p.x - w.x, rr = w.x + w.w - p.x, t = p.y - w.y, bb = w.y + w.h - p.y, m = Math.min(l, rr, t, bb); if (m === l) p.x = w.x - r; else if (m === rr) p.x = w.x + w.w + r; else if (m === t) p.y = w.y - r; else p.y = w.y + w.h + r; }
      }
      if (f === 0) for (const o of cell.c) {
        const ex = p.x - o.x, ey = p.y - o.y, dd = Math.hypot(ex, ey), m = o.r * (o.t === 'tree' ? .55 : 1) + r;
        if (dd < m && dd > .01) { p.x = o.x + ex / dd * m; p.y = o.y + ey / dd * m; }
      }
    }
  }
  return p;
};
// 선분 레이캐스트: 벽(창문 제외)/바위/상자에 막히는 첫 t (없으면 1)
S.ray = function (M, x1, y1, x2, y2, f) {
  const C = S.CELL, gw = M.gw; let best = 1;
  const a = Math.max(0, Math.floor(Math.min(x1, x2) / C)), b = Math.min(gw - 1, Math.floor(Math.max(x1, x2) / C)), c = Math.max(0, Math.floor(Math.min(y1, y2) / C)), d = Math.min(gw - 1, Math.floor(Math.max(y1, y2) / C));
  for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) {
    const cell = M.cells[cy * gw + cx]; if (!cell) continue;
    for (const w of cell.w) { if (w.f !== f || w.win) continue; const t = segRect(x1, y1, x2, y2, w.x, w.y, w.w, w.h); if (t < best) best = t; }
    if (f === 0) for (const o of cell.c) { if (o.t === 'tree') continue; const t = segCircle(x1, y1, x2, y2, o.x, o.y, o.r); if (t < best) best = t; }
  }
  return best;
};
S.los = function (M, x1, y1, x2, y2, f) { return S.ray(M, x1, y1, x2, y2, f) >= 0.999; };
S.inBld = function (M, x, y) { for (const b of M.blds) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b; return null; };

if (typeof module !== 'undefined' && module.exports) module.exports = S; else root.S = S;
})(typeof window !== 'undefined' ? window : globalThis);
