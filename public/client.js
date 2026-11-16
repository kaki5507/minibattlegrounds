// 미니 배틀그라운드 클라이언트
'use strict';
(() => {
const $ = id => document.getElementById(id);
const hyp = Math.hypot;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// ───────── 저장 ─────────
const SAVE_KEY = 'duckbg_save';
let save = { name: '', wins: 0, ext: 0, kills: 0, games: 0, val: 0, sel: {} };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
save.sel = S.cleanSkin(save.sel);
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
if (!save.name) save.name = '플레이어' + Math.floor(100 + Math.random() * 900);

// ───────── 확대(더블탭/핀치) 방지 ─────────
let lastTouchEnd = 0;
document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouchEnd < 350 && $('game').classList.contains('on') && !e.target.closest('.modal')) e.preventDefault(); lastTouchEnd = n; }, { passive: false });
['gesturestart', 'gesturechange', 'gestureend', 'dblclick'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || $('game').classList.contains('on')) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

// ───────── 네트워크 ─────────
let ws, myCid = null, curRoom = null, acct = null, pendingJoin = null, myName = null;
const TOKEN_KEY = 'mbg_token';
const getTok = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
const setTok = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
function setConn(t, cls) { const c = $('conn'); c.textContent = t; c.className = cls || ''; }
function connect() {
  setConn('CONNECTING');
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { setConn('ONLINE', 'ok'); const t = getTok(); if (t) sendM({ t: 'auth', token: t }); hello(); };
  ws.onclose = () => { setConn('RECONNECTING', 'bad'); setTimeout(connect, 2000); if (G) { G = null; show('menu'); } };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } onMsg(m); };
}
const sendM = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
function hello() { sendM({ t: 'hello', name: acct ? acct.name : save.name, skin: save.sel }); }
// 로그인 상태면 서버 전적, 아니면 이 기기 전적
const prog = () => acct ? { wins: acct.stats.wins, ext: acct.stats.ext, kills: acct.stats.kills, games: acct.stats.games, val: acct.stats.val } : save;

function show(id) { $('conn').style.display = id === 'game' ? 'none' : ''; for (const s of ['menu', 'room']) $(s).classList.toggle('on', s === id); $('game').classList.toggle('on', id === 'game'); $('bgc').style.display = id === 'game' ? 'none' : ''; }

function onMsg(m) {
  switch (m.t) {
    case 'hi': myCid = m.id; renderRooms(m.rooms); break;
    case 'rooms': renderRooms(m.rooms); break;
    case 'room': curRoom = m; if (!G) { if (!$('room').classList.contains('on')) closeModal('pwm'); show('room'); renderRoom(); } break;
    case 'left': curRoom = null; G = null; show('menu'); break;
    case 'lobby': G = null; closeModals(); show('room'); if (curRoom) renderRoom(); break;
    case 'err': if (m.code === 'pw') return askPw(m.id, m.txt); toast(m.txt); break;
    case 'msg': toast(m.txt); break;
    case 'nametaken': myName = m.name; toast(m.txt); break;
    case 'acct': acct = m.acc; if (m.token) setTok(m.token); if (acct.skin) { save.sel = S.cleanSkin(acct.skin); } closeModal('authm'); updStats(); if ($('stashm').classList.contains('on')) renderStash(); break;
    case 'autherr': { const e = $('aErr'); e.textContent = m.txt; $('authBox').classList.remove('shake'); void $('authBox').offsetWidth; $('authBox').classList.add('shake'); break; }
    case 'logout': acct = null; setTok(null); updStats(); closeModal('stashm'); if (m.txt) toast(m.txt); hello(); break;
    case 'start': startGame(m); break;
    case 's': if (G) onSnap(m); break;
    case 'result': onResult(m); break;
  }
}
function toast(t) { if (G) { G.msgs.push({ t, until: performance.now() + 4000 }); return; } const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(el.tm); el.tm = setTimeout(() => el.style.display = 'none', 3200); }
const closeModal = id => $(id).classList.remove('on');

// ───────── 메뉴 ─────────
$('nm').value = save.name;
$('nm').onchange = () => { save.name = $('nm').value.trim().slice(0, 12) || save.name; persist(); hello(); };
const radio = n => (document.querySelector(`input[name=${n}]:checked`) || {}).value;
$('qBR').onclick = () => { hello(); sendM({ t: 'quick', mode: 'br' }); };
$('qEX').onclick = () => { hello(); if (!acct) toast('로그인하면 탈출에 성공한 아이템이 창고에 저장됩니다'); sendM({ t: 'quick', mode: 'ex' }); };
$('mk').onclick = () => { hello(); sendM({ t: 'create', name: $('rname').value.trim() || ((acct ? acct.name : save.name) + '의 방'), mode: radio('rmode'), ts: radio('rts'), pw: $('rpw').value }); };
$('startBtn').onclick = () => sendM({ t: 'start' });
$('leaveBtn').onclick = () => sendM({ t: 'leave' });
$('shopBtn').onclick = openShop;
document.querySelectorAll('[data-eye]').forEach(b => b.onclick = () => { const i = $(b.dataset.eye); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? '숨김' : '보기'; });
// 방 비밀번호 입력
function askPw(id, msg) {
  pendingJoin = id; const r = lastRooms.find(x => x.id === id);
  $('pwTitle').textContent = r ? r.name : '비밀번호 입력';
  const open = $('pwm').classList.contains('on');
  $('pwErr').textContent = open ? msg : ''; $('pwm').classList.add('on');
  if (open) { $('pwBox').classList.remove('shake'); void $('pwBox').offsetWidth; $('pwBox').classList.add('shake'); $('pwIn').select(); }
  else { $('pwIn').value = ''; setTimeout(() => $('pwIn').focus(), 50); }
}
$('pwOk').onclick = () => { if (pendingJoin == null) return; hello(); sendM({ t: 'join', id: pendingJoin, pw: $('pwIn').value }); };
$('pwIn').onkeydown = e => { if (e.key === 'Enter') $('pwOk').onclick(); };
$('pwCancel').onclick = () => { pendingJoin = null; closeModal('pwm'); };
// 계정
function openAuth(mode) { const r = document.querySelector(`input[name=amode][value=${mode || 'login'}]`); r.checked = true; authMode(); $('aErr').textContent = ''; $('aPw').value = ''; $('aPw2').value = ''; if (!$('aName').value) $('aName').value = save.name.startsWith('손님') ? '' : save.name; $('authm').classList.add('on'); setTimeout(() => ($('aName').value ? $('aPw') : $('aName')).focus(), 50); }
function authMode() { const reg = radio('amode') === 'register'; $('aPw2Row').style.display = reg ? '' : 'none'; $('aOk').textContent = reg ? '가입하고 시작' : '로그인'; $('aPw').autocomplete = reg ? 'new-password' : 'current-password'; $('aErr').textContent = ''; }
document.querySelectorAll('input[name=amode]').forEach(r => r.onchange = authMode);
$('aCancel').onclick = () => closeModal('authm');
$('aOk').onclick = () => {
  const reg = radio('amode') === 'register', name = $('aName').value.trim(), pw = $('aPw').value;
  if (name.length < 2) return ($('aErr').textContent = '닉네임을 2자 이상 입력하세요');
  if (pw.length < 4) return ($('aErr').textContent = '비밀번호를 4자 이상 입력하세요');
  if (reg && pw !== $('aPw2').value) return ($('aErr').textContent = '비밀번호 확인이 일치하지 않습니다');
  if (reg) save.sel = S.cleanSkin(save.sel);
  sendM({ t: reg ? 'register' : 'login', name, pw });
};
['aName', 'aPw', 'aPw2'].forEach(id => $(id).onkeydown = e => { if (e.key === 'Enter') $('aOk').onclick(); });
function updStats() {
  const P = prog();
  $('stats').innerHTML = [['1등', P.wins], ['탈출', P.ext], ['킬', P.kills], ['판', P.games]].map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('');
  const bar = $('acctBar');
  if (acct) {
    $('nm').style.display = 'none'; $('nmLocked').className = 'nmlock on'; $('nmLocked').innerHTML = `${esc(acct.name)}<i>VERIFIED</i>`;
    bar.innerHTML = `<div class="money">${acct.money.toLocaleString()}<small>원</small></div><button class="y" id="stashBtn">창고 · 상인</button><button class="g" id="logoutBtn">로그아웃</button>`;
    $('stashBtn').onclick = openStash; $('logoutBtn').onclick = () => sendM({ t: 'logout', token: getTok() });
  } else {
    $('nm').style.display = ''; $('nmLocked').className = 'nmlock';
    bar.innerHTML = `<div class="guest">손님으로 플레이 중<br>기록·창고는 이 기기에만 남습니다</div><button class="y" id="loginBtn">로그인</button><button class="g" id="regBtn">회원가입</button>`;
    $('loginBtn').onclick = () => openAuth('login'); $('regBtn').onclick = () => openAuth('register');
  }
}
updStats();
const MODEN = { br: '배틀로얄', ex: '탈출' }, TSN = { 1: '솔로', 2: '듀오', 4: '스쿼드' };
let lastRooms = [];
function renderRooms(list) {
  lastRooms = list; const el = $('roomList');
  if (!list.length) { el.innerHTML = '<div class="empty">열린 방이 없습니다.<br>빠른 입장을 누르거나 방을 직접 만들어 보세요.</div>'; return; }
  el.innerHTML = list.map(r => `<div class="ri"><div style="min-width:0"><div class="nm">${r.lk ? '<span class="lock"></span>' : ''}${esc(r.name)}</div><div class="sub">${MODEN[r.mode]} · ${TSN[r.ts]}${r.lk ? ' · 비공개' : ''}</div></div>
    <div class="cnt">${r.n}<i>/10</i></div>${r.st === 'play' ? '<span class="tag live">진행중</span>' : `<button class="${r.lk ? 'g' : ''}" data-j="${r.id}" data-lk="${r.lk}">입장</button>`}</div>`).join('');
  el.querySelectorAll('[data-j]').forEach(b => b.onclick = () => { hello(); if (+b.dataset.lk) askPw(+b.dataset.j, ''); else sendM({ t: 'join', id: +b.dataset.j }); });
}
function renderRoom() {
  const r = curRoom; if (!r) return;
  $('rtitle').innerHTML = `${r.lk ? '<span class="lock" style="display:inline-block;width:16px;height:20px;background:var(--acc);-webkit-mask:var(--lockm);mask:var(--lockm)"></span>' : ''}${esc(r.name)}`;
  $('rinfo').textContent = `${MODEN[r.mode]} · ${TSN[r.ts]} · ${r.players.length}/10명${r.lk ? ' · 비공개방' : ''}`;
  const cd = $('cd'); cd.className = r.cd != null ? 'hot' : '';
  cd.textContent = r.st === 'play' ? '게임 진행 중' : r.cd != null ? `${Math.ceil(r.cd / 1000)}초 후 시작` : r.players.length < 5 ? `대기 중 · ${5 - r.players.length}명 더 필요` : '곧 시작';
  $('slots').innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < r.players.length ? 'on' : ''}"></i>`).join('');
  $('plist').innerHTML = r.players.map((p, i) => `<div class="ri"><div class="av ${r.host === p.id ? 'host' : ''}">${i + 1}</div><div style="min-width:0"><div class="nm">${esc(p.name)}</div><div class="sub">${S.BODIES[p.skin.body] ? S.BODIES[p.skin.body].n : ''}</div></div><div>${r.host === p.id ? '<span class="tag acc">방장</span>' : ''}${p.id === myCid ? '<span class="tag">나</span>' : ''}</div></div>`).join('');
  const isHost = r.host === myCid;
  $('startBtn').style.display = isHost ? '' : 'none';
  $('startBtn').textContent = r.players.length >= 5 ? '지금 시작' : '봇 채우고 시작';
}
setInterval(() => { if (curRoom && curRoom.cd != null && !G) { curRoom.cd = Math.max(0, curRoom.cd - 250); renderRoom(); } }, 250);

// ───────── 창고 · 상인 ─────────
let stTab = 'stash', stOpen = null;
const ICOL = { w: '#c9a24a', ar: '#4a8fc9', am: '#8a9aa6', att: '#7aa36a', val: '#d4b14a', med: '#c94a3b', band: '#c97a6b', gren: '#6b8f4a', flash: '#d8d8d8', smoke: '#8c959e', fuel: '#c98a3b' };
function itemSub(it) {
  if (it.k === 'w') { const w = it.w || {}; const st = S.stats({ id: w.id, att: w.att || {}, base: w.base || null }); const at = Object.values(w.att || {}).map(a => S.ATT[a] ? S.ATT[a].n : a); return `피해 ${Math.round(st.dmg * st.pel)} · ${S.AMMO[st.am]}${at.length ? ' · ' + at.join(', ') : ''}`; }
  if (it.k === 'ar') return `내구도 ${Math.round(it.n)} / ${S.ARMOR[it.d].dur}`;
  if (it.k === 'att') return S.ATT[it.d] ? S.ATT[it.d].d : '';
  return `${it.n}개`;
}
function itemCard(it, i, from, acts) {
  const key = from + ':' + i;
  return `<div class="itm ${stOpen === key ? 'open' : ''}" style="--c:${ICOL[it.k] || '#3a444e'}" data-it="${key}"><span class="pr">${S.itemPrice(it).toLocaleString()}</span><b>${esc(S.itemName(it))}</b><small>${esc(itemSub(it))}</small><div class="act">${acts}</div></div>`;
}
function openStash() { if (!acct) return openAuth('login'); stOpen = null; renderStash(); $('stashm').classList.add('on'); }
function renderStash() {
  if (!acct) return;
  const A = acct, kitW = A.kit.filter(x => x.k === 'w').length, kitA = A.kit.filter(x => x.k === 'ar').length;
  const kitVal = A.kit.reduce((s, it) => s + S.itemPrice(it), 0);
  let left;
  if (stTab === 'stash') {
    left = `<div class="lbl"><span>창고 ${A.stash.length} / ${A.max}</span><span>누르면 메뉴</span></div><div class="items">${A.stash.map((it, i) => itemCard(it, i, 'stash', `${it.k !== 'val' ? '<button class="y" data-op="kit">반입</button>' : ''}<button class="g" data-op="sell">판매 ${Math.floor(S.itemPrice(it) * .5).toLocaleString()}</button>`)).join('') || '<div class="empty">창고가 비었습니다. 상인에게 사거나 탈출에 성공해 채우세요.</div>'}</div>`;
  } else {
    const cats = {}; S.SHOP.forEach(p => (cats[p.cat] = cats[p.cat] || []).push(p));
    left = `<div class="lbl"><span>상인</span><span>구매한 물건은 창고로</span></div>${Object.entries(cats).map(([c, ps]) => `<div class="ccat">${c}</div><div class="items">${ps.map(p => `<div class="itm" style="--c:${ICOL[p.item.k]}" data-buy="${p.id}"><span class="pr" style="color:${A.money >= p.price ? 'var(--acc)' : 'var(--red)'}">${p.price.toLocaleString()}</span><b>${esc(S.itemName(p.item))}</b><small>${esc(itemSub(p.item))}</small></div>`).join('')}</div>`).join('')}`;
  }
  $('stashBox').innerHTML = `<div class="sthead"><h3>창고</h3><div class="segs" style="width:220px"><label class="seg"><input type="radio" name="sttab" value="stash" ${stTab === 'stash' ? 'checked' : ''}><span>내 창고</span></label><label class="seg"><input type="radio" name="sttab" value="shop" ${stTab === 'shop' ? 'checked' : ''}><span>상인</span></label></div><div class="money">${A.money.toLocaleString()}원</div><button class="g" id="stX">닫기</button></div>
  <div class="stgrid"><div class="stcol">${left}</div>
  <div class="stcol"><div class="lbl"><span>레이드 반입 장비</span><span>${kitVal.toLocaleString()}</span></div>
    <div class="items">${A.kit.map((it, i) => itemCard(it, i, 'kit', '<button class="g" data-op="unkit">창고로</button>')).join('') || '<div class="empty" style="padding:20px 6px">반입할 장비가 없습니다.<br>창고에서 아이템을 눌러 반입하세요.</div>'}</div>
    <div class="kitnote">무기 ${kitW}/2 · 방어구 ${kitA}/1<br>탈출 모드에 들어가면 이 장비를 들고 시작합니다. <b style="color:var(--tx2)">탈출하면</b> 들고 나온 모든 것이 창고에 들어가고 귀중품은 돈이 됩니다. <b style="color:#e08a7f">죽거나 시간 초과면</b> 반입한 장비를 모두 잃습니다.</div>
  </div></div>`;
  $('stX').onclick = () => closeModal('stashm');
  document.querySelectorAll('input[name=sttab]').forEach(r => r.onchange = () => { stTab = r.value; stOpen = null; renderStash(); });
  $('stashBox').querySelectorAll('[data-it]').forEach(d => d.onclick = e => {
    const op = e.target.dataset && e.target.dataset.op, [from, i] = d.dataset.it.split(':');
    if (op === 'kit') sendM({ t: 'stash', op: 'kit', i: +i });
    else if (op === 'unkit') sendM({ t: 'stash', op: 'unkit', i: +i });
    else if (op === 'sell') sendM({ t: 'stash', op: 'sell', i: +i, from });
    else { stOpen = stOpen === d.dataset.it ? null : d.dataset.it; renderStash(); return; }
    stOpen = null;
  });
  $('stashBox').querySelectorAll('[data-buy]').forEach(d => d.onclick = () => sendM({ t: 'stash', op: 'buy', id: d.dataset.buy }));
}

// ───────── 메뉴 배경 (어두운 섬 + 줄어드는 자기장) ─────────
const bgc = $('bgc'), bgx = bgc.getContext('2d'); let bgMap = null;
fetch('/map/br').then(r => r.json()).then(o => {
  const M = S.hydrate(o), sz = 1400, c = document.createElement('canvas'); c.width = c.height = sz; const x = c.getContext('2d'), k = sz / S.W;
  x.fillStyle = '#07090b'; x.fillRect(0, 0, sz, sz);
  x.fillStyle = '#11161a'; x.beginPath(); x.arc(S.CX * k, S.CY * k, S.ISLAND * k, 0, 6.283); x.fill();
  x.fillStyle = '#0a0e12'; for (const l of M.lakes) { x.beginPath(); x.arc(l.x * k, l.y * k, l.r * k, 0, 6.283); x.fill(); }
  x.fillStyle = '#151c19'; for (const t of M.circles) if (t.t === 'tree') { x.beginPath(); x.arc(t.x * k, t.y * k, 2.2, 0, 6.283); x.fill(); }
  x.strokeStyle = '#1e2429'; x.lineWidth = 3; for (const r of M.roads) { x.beginPath(); x.moveTo(r[0] * k, r[1] * k); x.lineTo(r[2] * k, r[3] * k); x.stroke(); }
  x.fillStyle = '#232a30'; for (const b of M.blds) x.fillRect(b.x * k, b.y * k, b.w * k, b.h * k);
  x.strokeStyle = 'rgba(255,255,255,.025)'; x.lineWidth = 1; for (let i = 0; i < sz; i += 70) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, sz); x.moveTo(0, i); x.lineTo(sz, i); x.stroke(); }
  bgMap = c;
}).catch(() => {});
function drawBg(now) {
  const w = innerWidth, h = innerHeight, d = Math.min(2, devicePixelRatio || 1);
  if (bgc.width !== w * d) { bgc.width = w * d; bgc.height = h * d; }
  bgx.setTransform(d, 0, 0, d, 0, 0); bgx.fillStyle = '#07090b'; bgx.fillRect(0, 0, w, h);
  const t = now / 1000, S2 = Math.max(w, h) * 1.5;
  const ox = w * .62 - S2 / 2 + Math.sin(t * .03) * 60, oy = h * .5 - S2 / 2 + Math.cos(t * .025) * 40;
  if (bgMap) { bgx.globalAlpha = .9; bgx.drawImage(bgMap, ox, oy, S2, S2); bgx.globalAlpha = 1; }
  // 자기장 (30초 주기로 줄어듦)
  const ph = (t % 30) / 30, R = S2 * (.42 - ph * .3), cx = ox + S2 * .52, cy = oy + S2 * .48;
  bgx.save(); bgx.beginPath(); bgx.rect(0, 0, w, h); bgx.arc(cx, cy, R, 0, 6.283, true); bgx.fillStyle = 'rgba(40,70,120,.10)'; bgx.fill(); bgx.restore();
  bgx.strokeStyle = 'rgba(110,160,220,.35)'; bgx.lineWidth = 1.5; bgx.beginPath(); bgx.arc(cx, cy, R, 0, 6.283); bgx.stroke();
  bgx.strokeStyle = 'rgba(226,160,63,.25)'; bgx.setLineDash([6, 8]); bgx.beginPath(); bgx.arc(cx + S2 * .03, cy - S2 * .02, S2 * .12, 0, 6.283); bgx.stroke(); bgx.setLineDash([]);
  // 보급기 경로
  const pp = (t % 18) / 18, px = -100 + (w + 200) * pp, py = h * .22 + pp * h * .2;
  bgx.strokeStyle = 'rgba(255,255,255,.06)'; bgx.beginPath(); bgx.moveTo(-100, h * .22); bgx.lineTo(px, py); bgx.stroke();
  bgx.fillStyle = 'rgba(226,160,63,.7)'; bgx.beginPath(); bgx.arc(px, py, 2.5, 0, 6.283); bgx.fill();
  // 비네트
  const g = bgx.createRadialGradient(w * .55, h * .5, Math.min(w, h) * .2, w * .5, h * .5, Math.max(w, h) * .8);
  g.addColorStop(0, 'rgba(7,9,11,0)'); g.addColorStop(1, 'rgba(7,9,11,.92)'); bgx.fillStyle = g; bgx.fillRect(0, 0, w, h);
  const g2 = bgx.createLinearGradient(0, 0, w * .6, 0); g2.addColorStop(0, 'rgba(7,9,11,.85)'); g2.addColorStop(1, 'rgba(7,9,11,0)'); bgx.fillStyle = g2; bgx.fillRect(0, 0, w, h);
}

// ───────── 치장 상점 ─────────
let shopTab = 'body', shopGun = 'ar', shopRAF = 0;
const SHOPTABS = { body: '캐릭터', hat: '모자', face: '얼굴', glove: '장갑', bag: '등', gskin: '총 스킨', col: '옷 색상' };
function reqText(r) { const a = []; if (r.w) a.push(`1등 ${r.w}회`); if (r.x) a.push(`탈출 ${r.x}회`); if (r.k) a.push(`킬 ${r.k}`); if (r.g) a.push(`${r.g}판 플레이`); return a.join(' + ') || '기본'; }
function shopCount() { let n = 0, t = 0; for (const sl in S.SKINSLOTS) for (const k in S.SKINSLOTS[sl]) { t++; if (S.unlocked(S.SKINSLOTS[sl][k].req, prog())) n++; } return `${n}/${t}`; }
function openShop() {
  save.sel = S.cleanSkin(save.sel);
  const tbl = S.SKINSLOTS[shopTab];
  $('shopBox').innerHTML = `<div class="row" style="justify-content:space-between"><h3 style="margin:4px 0">치장 <small style="opacity:.6">해금 ${shopCount()} · 능력치 효과 없음</small></h3><button class="g" id="shX">닫기</button></div>
  <div class="row" style="align-items:stretch;flex-wrap:nowrap;gap:10px">
    <div style="flex:0 0 auto;text-align:center"><canvas id="shopPv" width="200" height="200" style="width:150px;height:150px;background:radial-gradient(#3a5a32,#0c140c);border-radius:14px"></canvas>
      <div class="row" style="justify-content:center;gap:3px;margin-top:4px">${['', 'pistol', 'ar', 'sg', 'sniper', 'lmg'].map(w => `<button class="${w === shopGun ? 'y' : 'g'}" data-gun="${w}" style="padding:3px 6px;font-size:11px">${w ? S.WEAPONS[w].n.slice(0, 3) : '맨손'}</button>`).join('')}</div>
      <button class="b" id="shRand" style="margin-top:6px;padding:6px 10px;font-size:12px">랜덤 코디</button></div>
    <div style="flex:1;min-width:0">
      <div class="row" style="gap:4px">${Object.entries(SHOPTABS).map(([k, v]) => `<button class="${k === shopTab ? 'y' : 'g'}" data-tab="${k}" style="padding:6px 9px;font-size:13px">${v}</button>`).join('')}</div>
      <div class="grid" style="margin-top:8px;grid-template-columns:repeat(auto-fill,minmax(88px,1fr))">${Object.entries(tbl).map(([k, v]) => { const ok = S.unlocked(v.req, prog()), sel = save.sel[shopTab] === k; return `<div class="sk ${sel ? 'sel' : ''} ${ok ? '' : 'lock'}" data-k="${k}"><canvas width="160" height="140" style="width:80px;height:70px" data-pv="${k}"></canvas><div><b>${v.n}</b></div><div style="opacity:.7;font-size:11px">${ok ? (sel ? '착용중' : '착용') : '잠김 · ' + reqText(v.req)}</div></div>`; }).join('')}</div>
    </div></div>`;
  $('shop').classList.add('on');
  $('shX').onclick = () => { $('shop').classList.remove('on'); cancelAnimationFrame(shopRAF); };
  $('shopBox').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { shopTab = b.dataset.tab; openShop(); });
  $('shopBox').querySelectorAll('[data-gun]').forEach(b => b.onclick = () => { shopGun = b.dataset.gun; openShop(); });
  $('shRand').onclick = () => { for (const sl in S.SKINSLOTS) { const ok = Object.keys(S.SKINSLOTS[sl]).filter(k => S.unlocked(S.SKINSLOTS[sl][k].req, prog())); save.sel[sl] = ok[Math.floor(Math.random() * ok.length)]; } persist(); hello(); openShop(); };
  $('shopBox').querySelectorAll('[data-k]').forEach(d => d.onclick = () => { const v = tbl[d.dataset.k]; if (!S.unlocked(v.req, prog())) return toast('잠김 · ' + reqText(v.req) + ' 필요'); save.sel[shopTab] = d.dataset.k; persist(); hello(); openShop(); });
  const pvGun = shopTab === 'gskin' && !shopGun ? 'ar' : shopGun;
  $('shopBox').querySelectorAll('[data-pv]').forEach(cv2 => {
    const k = cv2.dataset.pv, x = cv2.getContext('2d'); x.translate(0, 2); x.scale(1.33, 1.13);
    if (shopTab === 'gskin') { x.translate(-6, 56); x.scale(2.6, 2.6); drawGun(x, 'ar', k, 2, 10); return; }
    if (shopTab === 'glove') { x.translate(60, 60); x.scale(3.4, 3.4); drawHand(x, -7, 0, k, (S.BODIES[save.sel.body] || S.BODIES.duck).col, 0); drawHand(x, 7, 0, k, (S.BODIES[save.sel.body] || S.BODIES.duck).col, 0); return; }
    const base = { body: save.sel.body, col: save.sel.col, hat: 'none', face: 'none', glove: 'none', bag: 'none', gskin: 'none' };
    const sk = Object.assign(base, { [shopTab]: k });
    const ang = shopTab === 'bag' ? Math.PI * .8 : shopTab === 'hat' ? -Math.PI / 2 : -.35;
    const sz = shopTab === 'body' || shopTab === 'col' ? 1.85 : shopTab === 'face' ? 2.8 : 2.3;
    x.translate(shopTab === 'body' || shopTab === 'col' ? 38 : shopTab === 'face' ? 46 : 60, shopTab === 'body' || shopTab === 'col' ? 70 : 62); x.scale(sz, sz);
    drawChar(x, 0, 0, ang, sk, 0, false, 0, shopTab === 'body' || shopTab === 'col' ? 'smg' : '', undefined, {});
  });
  // 큰 미리보기 (회전 + 걷기)
  cancelAnimationFrame(shopRAF);
  const pc = $('shopPv').getContext('2d');
  const loop = tm => { if (!$('shop').classList.contains('on')) return; pc.setTransform(1, 0, 0, 1, 0, 0); pc.clearRect(0, 0, 200, 200); pc.translate(100, 102); pc.scale(2.5, 2.5);
    const walk = Math.floor(tm / 2500) % 2 === 0; drawChar(pc, 0, 0, tm / 1400, save.sel, tm / 1000, walk, 0, pvGun, undefined, { kick: walk ? 0 : (Math.sin(tm / 90) > .7 ? 2 : 0) }); shopRAF = requestAnimationFrame(loop); };
  shopRAF = requestAnimationFrame(loop);
}
// 미리보기 애니메이션
const pvx = $('pv').getContext('2d');
function drawPreview(t) { pvx.setTransform(1, 0, 0, 1, 0, 0); pvx.clearRect(0, 0, 168, 168); pvx.translate(72, 92); pvx.scale(1.9, 1.9); drawChar(pvx, 0, 0, -Math.PI / 2 + Math.sin(t / 900) * .4, save.sel, t / 1000, true, 0, 'ar'); }

// ───────── 캐릭터 그리기 ─────────
// 총 모양: L 길이, w 두께, st 개머리, mg 탄창, sc 기본스코프, pump, box(탄통), two 양손권총형
const GUNS = {
  pistol: { L: 19, w: 6, st: 0, mg: 5, two: 1 }, smg: { L: 30, w: 7, st: 6, mg: 10 }, ar: { L: 40, w: 6.5, st: 9, mg: 9 },
  dmr: { L: 46, w: 6, st: 10, mg: 6, sc: 1 }, sg: { L: 40, w: 7.5, st: 10, mg: 0, pump: 1 }, sniper: { L: 56, w: 6, st: 11, mg: 5, sc: 1 },
  lmg: { L: 46, w: 9, st: 10, mg: 0, box: 1 }, hyb: { L: 50, w: 8, st: 10, mg: 9, sc: 1 },
};
function gunCol(gs, wid, x0, len, c) {
  const G = S.GSKINS[gs] || S.GSKINS.none;
  if (G.rb) { const g = c.createLinearGradient(x0, 0, x0 + len, 0); ['#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#2196f3', '#9c27b0'].forEach((cl, i) => g.addColorStop(i / 5, cl)); return g; }
  if (G.c2) { const g = c.createLinearGradient(x0, -4, x0 + len, 4); g.addColorStop(0, G.c); g.addColorStop(.5, G.c2); g.addColorStop(1, G.c); return g; }
  if (G.c) return G.c;
  return '#3a3f44';
}
function drawGun(c, wid, gs, am, kick) {
  const g = GUNS[wid] || GUNS.ar; const W = S.WEAPONS[wid];
  const x0 = (g.two ? 16 : 10) - kick, y0 = g.two ? 0 : 6, L = g.L, w = g.w;
  // 개머리판
  if (g.st) { c.fillStyle = '#4e342e'; c.fillRect(x0 - g.st, y0 - w * .4, g.st + 1, w * .8); }
  // 탄창/탄통/펌프
  if (g.mg) { c.fillStyle = '#222'; c.fillRect(x0 + L * .32, y0 + w * .5, 4, g.mg); }
  if (g.box) { c.fillStyle = '#33691e'; c.fillRect(x0 + L * .25, y0 + w * .4, 11, 10); }
  // 본체
  c.fillStyle = gunCol(gs, wid, x0, L, c); c.fillRect(x0, y0 - w / 2, L * .62, w); c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 1; c.strokeRect(x0, y0 - w / 2, L * .62, w);
  // 총열
  c.fillStyle = '#1b1b1b'; c.fillRect(x0 + L * .6, y0 - w * .22, L * .42, w * .44);
  if (g.pump) { c.fillStyle = '#6d4c41'; c.fillRect(x0 + L * .62, y0 - w * .45, L * .2, w * .9); }
  // 무기 색 띠 (구분용)
  c.fillStyle = W ? W.c : '#ffd54f'; c.fillRect(x0 + 2, y0 - w / 2, 2.5, w);
  // 소음기 / 스코프
  if (am & 1) { c.fillStyle = '#111'; c.fillRect(x0 + L * 1.0, y0 - w * .38, 9, w * .76); }
  if ((am & 2) || g.sc) { c.fillStyle = '#111'; c.fillRect(x0 + L * .18, y0 - 2.5, L * .3, 5); c.fillStyle = '#4fc3f7'; c.fillRect(x0 + L * .46, y0 - 2, 2.5, 4); }
  return { x0, y0, L, two: g.two };
}
function drawHand(c, x, y, glove, skinCol, t) {
  const G = S.GLOVES[glove] || S.GLOVES.none; const r = G.big ? 6.2 : 4.6;
  if (G.glow) { c.fillStyle = G.glow; c.globalAlpha *= .5; circ(c, x, y, r + 2.5 + Math.sin(t * 8) * .8); c.globalAlpha *= 2; }
  c.fillStyle = G.c || skinCol; circ(c, x, y, r);
  c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.stroke();
  if (G.cuff) { c.fillStyle = G.cuff; c.fillRect(x - r - 1.5, y - r * .7, 2.5, r * 1.4); }
  if (G.dots) { c.fillStyle = G.dots; circ(c, x + 1.5, y - 1.5, 1); circ(c, x + 1.5, y + 1.5, 1); circ(c, x - 1, y, 1); }
  if (G.claw) { c.strokeStyle = '#eee'; c.lineWidth = 1.3; for (const d of [-2.5, 0, 2.5]) { c.beginPath(); c.moveTo(x + r - 1, y + d); c.lineTo(x + r + 3.5, y + d * 1.2); c.stroke(); } }
}
function drawBag(c, bag, t, moving) {
  const B = S.BAGS[bag]; if (!B || bag === 'none') return;
  c.fillStyle = B.c; c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1.5;
  if (bag === 'wings') { const f = Math.sin(t * (moving ? 14 : 4)) * .25; for (const sd of [-1, 1]) { c.save(); c.rotate(sd * (.5 + f)); c.beginPath(); c.ellipse(-14, sd * 12, 7, 15, 0, 0, 6.283); c.fill(); c.stroke(); c.restore(); } return; }
  if (bag === 'cape') { c.beginPath(); c.moveTo(-6, -14); c.quadraticCurveTo(-30 - Math.sin(t * 9) * 3 * (moving ? 1 : .3), 0, -6, 14); c.closePath(); c.fill(); c.stroke(); return; }
  if (bag === 'guitar') { c.save(); c.rotate(.5); c.beginPath(); c.ellipse(-16, 0, 9, 7, 0, 0, 6.283); c.fill(); c.fillRect(-16, -2.5, 30, 5); c.restore(); return; }
  if (bag === 'tank' || bag === 'jet') { for (const sd of [-6, 6]) { c.beginPath(); c.ellipse(-15, sd, 7, 5, 0, 0, 6.283); c.fill(); c.stroke(); }
    if (bag === 'jet' && moving) { c.fillStyle = `rgba(255,${120 + Math.random() * 100 | 0},0,.85)`; for (const sd of [-6, 6]) { c.beginPath(); c.moveTo(-21, sd - 3); c.lineTo(-30 - Math.random() * 8, sd); c.lineTo(-21, sd + 3); c.fill(); } } return; }
  const w = bag === 'mil' ? 13 : 10, h = bag === 'mil' ? 24 : 20;
  c.beginPath(); c.roundRect ? c.roundRect(-13 - w, -h / 2, w + 4, h, 4) : c.rect(-13 - w, -h / 2, w + 4, h); c.fill(); c.stroke();
  if (bag === 'duck') { c.fillStyle = '#ff9800'; ell(c, -13 - w - 2, 0, 3, 2.5); c.fillStyle = '#111'; circ(c, -13 - w + 3, -3, 1.2); circ(c, -13 - w + 3, 3, 1.2); }
  if (bag === 'mil') { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-13 - w + 2, -h / 2 + 3, w - 2, 5); c.fillRect(-13 - w + 2, h / 2 - 8, w - 2, 5); }
  if (bag === 'school') { c.fillStyle = '#ffeb3b'; c.fillRect(-13 - w + 2, -2, w - 2, 4); }
}
function drawFace(c, face) {
  switch (face) {
    case 'shades': c.fillStyle = '#111'; c.fillRect(4, -7, 5, 5); c.fillRect(4, 2, 5, 5); c.fillRect(5, -2, 2, 4); break;
    case 'round': c.strokeStyle = '#6d4c41'; c.lineWidth = 1.3; for (const y of [-4.5, 4.5]) { c.beginPath(); c.arc(6.5, y, 3, 0, 6.283); c.stroke(); } break;
    case 'mask': c.fillStyle = '#e0f7fa'; c.beginPath(); c.arc(4, 0, 9, -1.1, 1.1); c.lineTo(4, 0); c.fill(); break;
    case 'eyepatch': c.strokeStyle = '#111'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-6, -9); c.lineTo(9, 3); c.stroke(); c.fillStyle = '#111'; circ(c, 6.5, -4, 3); break;
    case 'goggles': c.fillStyle = '#ff9800'; c.fillRect(4, -9, 5, 18); c.fillStyle = 'rgba(100,220,255,.85)'; c.fillRect(5, -8, 3.5, 16); break;
    case 'clown': c.fillStyle = '#f44336'; circ(c, 11, 0, 3.5); break;
    case 'mustache': c.fillStyle = '#3e2723'; ell(c, 9, -3, 2, 4); ell(c, 9, 3, 2, 4); break;
    case 'nvg': c.fillStyle = '#263238'; c.fillRect(3, -6, 10, 12); c.fillStyle = '#76ff03'; circ(c, 12, -3, 2); circ(c, 12, 3, 2); break;
    case 'gasmask': c.fillStyle = '#37474f'; circ(c, 6, 0, 7); c.fillStyle = '#90a4ae'; circ(c, 11, 0, 3); c.fillStyle = 'rgba(150,220,255,.8)'; circ(c, 5, -4, 2.2); circ(c, 5, 4, 2.2); break;
    case 'star': c.fillStyle = '#ff4081'; for (const y of [-4.5, 4.5]) star(c, 6.5, y, 4.2); break;
  }
}
function star(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r, an = i / 10 * 6.283 - Math.PI / 2; c.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } c.fill(); }
function drawHat(c, h, col, t) {
  switch (h) {
    case 'cap': c.fillStyle = col; circ(c, 0, 0, 9); c.fillStyle = '#222'; ell(c, 8, 0, 4, 7); break;
    case 'band': c.strokeStyle = '#e53935'; c.lineWidth = 2.5; c.beginPath(); c.arc(1, 0, 9, 0, 6.283); c.stroke(); c.fillStyle = '#e53935'; tri(c, -9, 0, -15, -4, -15, 4); break;
    case 'beanie': c.fillStyle = '#5c6bc0'; circ(c, 0, 0, 10); c.fillStyle = '#fff'; circ(c, -2, 0, 3.5); break;
    case 'headset': c.strokeStyle = '#212121'; c.lineWidth = 2.5; c.beginPath(); c.arc(1, 0, 10, -1.6, 1.6, true); c.stroke(); c.fillStyle = '#212121'; ell(c, 1, -10.5, 4, 3); ell(c, 1, 10.5, 4, 3); c.fillStyle = '#69f0ae'; circ(c, 1, -10.5, 1.3); break;
    case 'beret': c.fillStyle = '#b71c1c'; ell(c, -1, 2, 9, 8); break;
    case 'party': c.fillStyle = '#ab47bc'; tri(c, 8, 0, -6, -7, -6, 7); c.fillStyle = '#ffeb3b'; circ(c, 8, 0, 2.5); break;
    case 'chef': c.fillStyle = '#fafafa'; circ(c, -1, -4, 6); circ(c, -1, 4, 6); circ(c, 3, 0, 6); break;
    case 'helmet': c.fillStyle = '#556b2f'; circ(c, 0, 0, 11.5); c.strokeStyle = '#33401c'; c.lineWidth = 1.5; c.stroke(); break;
    case 'propeller': { c.fillStyle = '#1e88e5'; circ(c, 0, 0, 8); c.fillStyle = '#ffeb3b'; c.save(); c.rotate(t * 25); c.fillRect(-11, -1.5, 22, 3); c.restore(); c.fillStyle = '#e53935'; circ(c, 0, 0, 2); break; }
    case 'pirate': c.fillStyle = '#212121'; ell(c, 0, 0, 9, 14); c.fillStyle = '#fff'; circ(c, 2, 0, 2.5); break;
    case 'cowboy': c.fillStyle = '#8d6e63'; ell(c, 0, 0, 14, 12); c.fillStyle = '#6d4c41'; circ(c, 0, 0, 7); break;
    case 'santa': c.fillStyle = '#d32f2f'; tri(c, 7, -8, 7, 8, -12, 3); c.fillStyle = '#fff'; c.fillRect(5, -9, 3, 18); circ(c, -12, 3, 3); break;
    case 'flower': c.fillStyle = '#ff80ab'; for (let i = 0; i < 5; i++) { const an = i / 5 * 6.283; circ(c, -3 + Math.cos(an) * 3, -7 + Math.sin(an) * 3, 2.3); } c.fillStyle = '#ffeb3b'; circ(c, -3, -7, 1.6); break;
    case 'tophat': c.fillStyle = '#111'; circ(c, 0, 0, 10); c.fillStyle = '#333'; circ(c, 0, 0, 6.5); c.strokeStyle = '#c62828'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 7.5, 0, 6.283); c.stroke(); break;
    case 'viking': c.fillStyle = '#9e9e9e'; circ(c, 0, 0, 10); c.fillStyle = '#fff8e1'; tri(c, -2, -9, 4, -9, -4, -18); tri(c, -2, 9, 4, 9, -4, 18); break;
    case 'crown': c.fillStyle = '#ffd600'; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 9, an = i / 10 * 6.283; c.lineTo(Math.cos(an) * r, Math.sin(an) * r); } c.fill(); c.fillStyle = '#e53935'; circ(c, 0, 0, 2); break;
    case 'halo': c.strokeStyle = '#fff59d'; c.lineWidth = 2.5; c.beginPath(); c.arc(-3, 0, 12, 0, 6.283); c.stroke(); break;
  }
}
// opt: { am: 부착물 비트, rl: 재장전중, kick: 사격반동 }
function drawChar(c, x, y, a, skin, t, moving, flags, wid, alpha, opt) {
  opt = opt || {};
  const B = S.BODIES[skin.body] || S.BODIES.duck, col = (S.COLORS[skin.col] || S.COLORS.green).c;
  const sc = B.sc * (flags & 1 ? .8 : 1);
  const ph = t * B.bobF, mv = moving ? 1 : 0;
  c.save(); c.translate(x, y);
  if (alpha !== undefined) c.globalAlpha = alpha; else if (flags & 1) c.globalAlpha = .65;
  c.rotate(a + Math.sin(ph) * B.waddle * mv * .5);
  const bob = 1 + Math.abs(Math.sin(ph)) * B.bobA * .025 * mv;
  c.scale(sc * bob, sc * bob);
  const kind = skin.body, hc = B.col;
  // 가방 (등 뒤)
  drawBag(c, skin.bag, t, moving);
  // 발
  const fo = Math.sin(ph) * 6 * mv;
  c.fillStyle = ['duck', 'goldduck', 'penguin', 'chick'].includes(kind) ? '#ff9800' : kind === 'frog' ? '#558b2f' : kind === 'robot' ? '#546e7a' : '#4e342e';
  ell(c, -4 + fo, -9, 5, 3.5); ell(c, -4 - fo, 9, 5, 3.5);
  // 손 + 총
  const handCol = ['man', 'woman'].includes(kind) ? '#ffcc80' : hc;
  if (wid) {
    const g = drawGun(c, wid, skin.gskin, opt.am || 0, opt.kick || 0);
    if (g.two) { drawHand(c, g.x0 + 1, -2.5, skin.glove, handCol, t); drawHand(c, g.x0 + 1, 3.5, skin.glove, handCol, t); }
    else { drawHand(c, g.x0 + 3, g.y0 + 1, skin.glove, handCol, t); const fx = opt.rl ? g.x0 + g.L * .34 : g.x0 + g.L * .55, fy = opt.rl ? g.y0 + 8 + Math.sin(t * 12) * 2 : g.y0 - 1; drawHand(c, fx, fy, skin.glove, handCol, t); }
  } else {
    const sw = Math.sin(ph) * 5 * mv;
    drawHand(c, 6 + sw, -15, skin.glove, handCol, t); drawHand(c, 6 - sw, 15, skin.glove, handCol, t);
  }
  // 몸통
  c.fillStyle = col; c.beginPath(); c.arc(0, 0, 15, 0, 6.283); c.fill(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 2; c.stroke();
  // 머리 부속 (귀 등)
  if (kind === 'rabbit') { c.fillStyle = '#eee'; ell(c, -12, -5, 9, 3); ell(c, -12, 5, 9, 3); c.fillStyle = '#f8bbd0'; ell(c, -12, -5, 6, 1.5); ell(c, -12, 5, 6, 1.5); }
  if (kind === 'cat' || kind === 'fox') { c.fillStyle = hc; tri(c, -6, -9, -1, -4, -9, -2); tri(c, -6, 9, -1, 4, -9, 2); }
  if (kind === 'dog') { c.fillStyle = '#5d4037'; ell(c, -1, -10, 6, 3.5); ell(c, -1, 10, 6, 3.5); }
  if (kind === 'bear') { c.fillStyle = hc; circ(c, -6, -8, 4); circ(c, -6, 8, 4); }
  if (kind === 'panda') { c.fillStyle = '#212121'; circ(c, -6, -8, 4); circ(c, -6, 8, 4); }
  if (kind === 'alien') { c.strokeStyle = '#69f0ae'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-3, -6); c.lineTo(-10, -12); c.moveTo(-3, 6); c.lineTo(-10, 12); c.stroke(); c.fillStyle = '#69f0ae'; circ(c, -10, -12, 2); circ(c, -10, 12, 2); }
  // 머리
  c.fillStyle = hc;
  if (kind === 'robot') { c.fillRect(-8, -9, 18, 18); c.strokeStyle = '#455a64'; c.lineWidth = 1.5; c.strokeRect(-8, -9, 18, 18); c.fillStyle = '#ff1744'; circ(c, -4, 0, 1.8 + Math.sin(t * 6) * .6); }
  else { circ(c, 1, 0, 10); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.stroke(); }
  if (kind === 'duck' || kind === 'goldduck') { c.fillStyle = '#ff9800'; ell(c, 12, 0, 5, 4); }
  if (kind === 'chick') { c.fillStyle = '#ff9800'; tri(c, 10, -2.5, 10, 2.5, 15, 0); c.fillStyle = '#fff176'; ell(c, -7, 0, 3, 2); }
  if (kind === 'penguin') { c.fillStyle = '#fff'; ell(c, 5, 0, 5, 6); c.fillStyle = '#ffb300'; ell(c, 12, 0, 3, 2); }
  if (kind === 'fox') { c.fillStyle = '#fff'; ell(c, 8, 0, 4, 4); c.fillStyle = '#222'; circ(c, 12, 0, 1.6); }
  if (kind === 'dog' || kind === 'bear' || kind === 'cat') { c.fillStyle = '#222'; circ(c, 10, 0, 2); }
  if (kind === 'panda') { c.fillStyle = '#212121'; ell(c, 5.5, -4, 2.8, 2.2); ell(c, 5.5, 4, 2.8, 2.2); circ(c, 10.5, 0, 1.8); }
  if (kind === 'frog') { c.fillStyle = '#7cb342'; circ(c, 4, -6, 4); circ(c, 4, 6, 4); c.fillStyle = '#fff'; circ(c, 5, -6, 2.6); circ(c, 5, 6, 2.6); }
  if (kind === 'man') { c.fillStyle = '#3e2723'; c.beginPath(); c.arc(1, 0, 10, 1.9, 4.4); c.fill(); }
  if (kind === 'woman') { c.fillStyle = '#5d4037'; c.beginPath(); c.arc(1, 0, 10.5, 1.6, 4.7); c.fill(); circ(c, -11, 0, 5); }
  if (kind === 'goldduck') { c.fillStyle = 'rgba(255,255,255,.7)'; circ(c, -2, -4, 2); }
  // 눈
  if (kind === 'robot') { c.fillStyle = '#00e5ff'; c.fillRect(6, -6, 3, 4); c.fillRect(6, 2, 3, 4); }
  else if (kind === 'alien') { c.fillStyle = '#111'; ell(c, 6, -4, 2.5, 3.5); ell(c, 6, 4, 2.5, 3.5); }
  else if (kind === 'frog') { c.fillStyle = '#111'; circ(c, 5.5, -6, 1.4); circ(c, 5.5, 6, 1.4); }
  else if (kind !== 'panda') { c.fillStyle = '#111'; circ(c, 6, -4, 1.5); circ(c, 6, 4, 1.5); }
  else { c.fillStyle = '#fff'; circ(c, 6, -4, 1); circ(c, 6, 4, 1); }
  drawFace(c, skin.face);
  drawHat(c, skin.hat, col, t);
  c.restore();
}
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }
function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 6.283); c.fill(); }
function tri(c, a, b, d, e, f, g) { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.lineTo(f, g); c.fill(); }

// ───────── 사운드 ─────────
let AC = null, noiseBuf = null;
function audio() { if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); noiseBuf = AC.createBuffer(1, AC.sampleRate * .5, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); } catch (e) {} }
function sfx(kind, vol) {
  if (!AC || vol <= 0.01) return;
  const src = AC.createBufferSource(); src.buffer = noiseBuf; const g = AC.createGain(); const f = AC.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = kind === 'boom' ? 500 : kind === 'sil' ? 1500 : kind === 'sniper' ? 2500 : 3500;
  g.gain.value = Math.min(1, vol) * (kind === 'boom' ? 1 : .35); src.playbackRate.value = kind === 'boom' ? .5 : kind === 'sniper' ? .7 : 1.1;
  src.connect(f); f.connect(g); g.connect(AC.destination); src.start(); src.stop(AC.currentTime + (kind === 'boom' ? .5 : .18));
}
['pointerdown', 'keydown', 'touchstart'].forEach(t => document.addEventListener(t, () => { audio(); if (AC && AC.state === 'suspended') AC.resume(); }, { once: false, passive: true }));

// ───────── 게임 상태 ─────────
let G = null;
const mapCache = {};
async function startGame(m) {
  closeModals();
  G = { mode: m.mode, ts: m.ts, you: m.you, roster: new Map(m.roster.map(r => [r.id, r])), items: new Map(), others: new Map(), bullets: [], snapT: 0, grens: [], smokes: [], vehs: [], drops: [], z: null, me: null, M: null,
    feed: [], msgs: [], hits: [], hurts: [], sounds: [], booms: [], sparks: [], tps: [], local: null, exts: m.exts, result: null, t0: performance.now(), visPoly: null, visKey: '', pre: m.pre };
  for (const it of m.items) addItem(it);
  show('game'); resize();
  try {
    if (!mapCache[m.mode]) { const r = await fetch('/map/' + m.mode); mapCache[m.mode] = S.hydrate(await r.json()); mapCache[m.mode].mini = renderMini(mapCache[m.mode]); }
    if (G) G.M = mapCache[m.mode];
  } catch (e) { toast('맵 로딩 실패'); }
}
function addItem(a) { G.items.set(a[0], { id: a[0], x: a[1], y: a[2], f: a[3], k: a[4], d: a[5], n: a[6], nm: a[7], c: a[8], na: a[9] }); }
function onSnap(m) {
  const now = performance.now();
  const me = m.me, prevMe = G.me;
  if (prevMe && prevMe.w[prevMe.cw] && me.w[me.cw] && me.cw === prevMe.cw && me.w[me.cw].mag < prevMe.w[prevMe.cw].mag) G.myFireT = now; G.me = me; G.pre = m.pre; G.tm = m.tm; G.n = m.n; G.tl = m.tl; G.exo = m.exo;
  G.z = m.z; G.drops = m.dr; G.smokes = m.sm; G.grens = m.gr;
  // 내 위치 예측 보정
  const alive = me.st === 'a' || me.st === 'd';
  if (!G.local || !alive || me.car || !prevMe || prevMe.f !== me.f || hyp(G.local.x - me.x, G.local.y - me.y) > 90) G.local = { x: me.x, y: me.y };
  else if (!G.inputMoving) { G.local.x += (me.x - G.local.x) * .3; G.local.y += (me.y - G.local.y) * .3; }
  // 다른 플레이어
  const seen = new Set();
  for (const p of m.ps) {
    seen.add(p[0]); let o = G.others.get(p[0]);
    if (!o) { o = { id: p[0], x: p[1], y: p[2], a: p[3] }; G.others.set(p[0], o); }
    o.tx = p[1]; o.ty = p[2]; o.ta = p[3]; o.f = p[4]; o.hp = p[5]; o.st = p[6]; o.w = p[7]; o.fl = p[8]; o.ar = p[9]; o.am = p[10] || 0; o.last = now;
  }
  for (const id of [...G.others.keys()]) if (!seen.has(id)) G.others.delete(id);
  G.bullets = m.bl; G.snapT = now;
  G.vehs = m.vh;
  for (const ev of m.ev) handleEv(ev, now);
}
function handleEv(ev, now) {
  const me = G.me, vx = me.vx, vy = me.vy;
  const dist = ev.x !== undefined ? hyp(ev.x - vx, ev.y - vy) : 0;
  switch (ev.e) {
    case 'ia': addItem(ev.it); break;
    case 'ir': G.items.delete(ev.id); break;
    case 'kill': G.feed.push({ t: `${ev.a} ${ev.down ? '🔻' : '💀'} ${ev.b}`, w: ev.w, until: now + 6000, mine: ev.a === G.roster.get(me.id).name }); if (G.feed.length > 6) G.feed.shift(); break;
    case 'msg': G.msgs.push({ t: ev.txt, until: now + 4500 }); break;
    case 'drop': G.msgs.push({ t: '✈ 보급 투하 위치가 지도에 표시되었습니다', until: now + 3000 }); break;
    case 'shot': { const so = G.others.get(ev.id); if (so) so.kickT = now; const vis = [...G.others.values()].some(o => o.id === ev.id); if (!vis) G.sounds.push({ x: ev.x, y: ev.y, until: now + 1200, sil: ev.sil }); sfx(ev.sil ? 'sil' : ev.w === 'sniper' ? 'sniper' : 'shot', 1 - dist / 1300); break; }
    case 'hit': G.hits.push({ until: now + 250, d: ev.d, x: ev.x, y: ev.y }); break;
    case 'hurt': G.hurts.push({ x: ev.x, y: ev.y, until: now + 900 }); if (navigator.vibrate) navigator.vibrate(30); break;
    case 'boom': G.booms.push({ x: ev.x, y: ev.y, r: ev.r, t0: now, f: ev.f }); sfx('boom', 1 - dist / 1500); break;
    case 'flashb': G.booms.push({ x: ev.x, y: ev.y, r: 120, t0: now, f: ev.f, flash: 1 }); sfx('shot', .6); break;
    case 'spark': G.sparks.push({ x: ev.x, y: ev.y, until: now + 150 }); break;
    case 'tp': G.tps.push({ x: ev.x, y: ev.y, until: now + 600 }, { x: ev.x2, y: ev.y2, until: now + 600 }); break;
    case 'pick': { const n = ev.k === 'w' ? ev.d : ev.k === 'am' ? `${S.AMMO[ev.d]} +${ev.n}` : ev.k === 'att' ? S.ATT[ev.d].n : ev.k === 'ar' ? S.ARMOR[ev.d].n : ev.k === 'val' ? `💰 ${S.VALUABLES[ev.d] ? S.VALUABLES[ev.d][0] : '전리품'} (${ev.n})` : S.ITEMN[ev.k]; G.msgs.push({ t: '+ ' + n, until: now + 1800, small: 1 }); break; }
  }
}
function onResult(m) {
  if (!G) return;
  G.result = m;
  if (!m.acct) { save.games++; save.kills += m.kills; if (m.res === 'win') save.wins++; if (m.res === 'extract') { save.ext++; save.val += m.val; } persist(); }
  updStats();
  const T = { win: ['WINNER', '최후의 생존자'], dead: ['ELIMINATED', '사망'], extract: ['EXTRACTED', '탈출 성공'], mia: ['MISSING IN ACTION', '시간 초과'] }[m.res];
  let body = '';
  if (m.mode === 'ex') {
    if (m.res === 'extract') body = `<p style="color:var(--tx2);font-size:13px;margin:0 0 6px">전리품 <b style="color:var(--acc)">${m.val.toLocaleString()}원</b>${m.acct ? ' 획득' : ''}</p>${m.saved && m.saved.length ? `<div style="font-size:12px;color:var(--tx3);line-height:1.7">창고에 저장: ${m.saved.map(esc).join(', ')}</div>` : !m.acct ? '<div style="font-size:12px;color:var(--tx3)">로그인하면 아이템이 창고에 저장됩니다</div>' : ''}`;
    else body = `<p style="color:#e08a7f;font-size:13px;margin:0">들고 들어간 장비${m.lost ? ` (${m.lost.toLocaleString()}원 상당)` : ''}와 전리품을 모두 잃었습니다</p>`;
  }
  $('resBox').innerHTML = `<div class="rk">${T[0]}</div><h2>${T[1]}</h2>
   <div class="rs"><div><b>${m.mode === 'br' ? '#' + m.place : (m.res === 'extract' ? 'OK' : '—')}</b><small>${m.mode === 'br' ? '순위' : '탈출'}</small></div><div><b>${m.kills}</b><small>킬</small></div><div><b>${Math.floor(m.time / 60)}:${String(m.time % 60).padStart(2, '0')}</b><small>생존 시간</small></div></div>
   ${body}
   <div class="row" style="margin-top:18px"><button class="g" id="specB" style="flex:1">관전</button><button class="y" id="toLobby" style="flex:1">대기실로</button><button class="r" id="toMenu" style="flex:1">나가기</button></div>`;
  $('res').classList.add('on');
  $('specB').onclick = () => $('res').classList.remove('on');
  $('toLobby').onclick = () => { $('res').classList.remove('on'); toast('게임이 끝나면 대기실로 돌아갑니다'); };
  $('toMenu').onclick = () => { $('res').classList.remove('on'); sendM({ t: 'leave' }); };
}
function closeModals() { for (const id of ['inv', 'res', 'bm', 'shop', 'stashm', 'authm', 'pwm']) $(id).classList.remove('on'); }

// ───────── 입력 ─────────
const cv = $('cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const keys = {}; let mouse = { x: 0, y: 0, down: false, rdown: false, on: false };
const sticks = { move: null, aim: null };
let lastAim = 0, aimFire = false;
function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; layoutBtns(); }
addEventListener('resize', resize);
const STICK_R = 58;
function inMini(x, y) { const m = miniRect(); return x > m.x && x < m.x + m.s && y > m.y && y < m.y + m.s; }
cv.addEventListener('touchstart', e => {
  e.preventDefault(); isTouch = true;
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    if (inMini(x, y)) { openMap(); continue; }
    if (x < W * .45 && !sticks.move) sticks.move = { id: t.identifier, ox: x, oy: y, x, y };
    else if (x >= W * .45 && !sticks.aim) sticks.aim = { id: t.identifier, ox: x, oy: y, x, y };
  }
}, { passive: false });
cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) for (const k of ['move', 'aim']) { const s = sticks[k]; if (s && s.id === t.identifier) { s.x = t.clientX; s.y = t.clientY; } } }, { passive: false });
const tend = e => { e.preventDefault(); for (const t of e.changedTouches) for (const k of ['move', 'aim']) { const s = sticks[k]; if (s && s.id === t.identifier) sticks[k] = null; } };
cv.addEventListener('touchend', tend, { passive: false }); cv.addEventListener('touchcancel', tend, { passive: false });
function stickVec(s) { if (!s) return { x: 0, y: 0, m: 0 }; let dx = s.x - s.ox, dy = s.y - s.oy; const d = hyp(dx, dy); if (d > STICK_R) { s.ox = s.x - dx / d * STICK_R; s.oy = s.y - dy / d * STICK_R; dx = s.x - s.ox; dy = s.y - s.oy; } return { x: dx / STICK_R, y: dy / STICK_R, m: Math.min(1, d / STICK_R) }; }
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true; });
cv.addEventListener('mousedown', e => { if (inMini(e.clientX, e.clientY)) return openMap(); if (e.button === 2) mouse.rdown = true; else mouse.down = true; isTouch = false; layoutBtns(); });
addEventListener('mouseup', e => { if (e.button === 2) mouse.rdown = false; else mouse.down = false; });
const KEYACT = { KeyR: 'reload', KeyQ: 'swap', Space: 'crouch', ControlLeft: 'crouch', KeyC: 'crouch', KeyF: 'interact', KeyE: 'interact', KeyG: 'gren', KeyV: 'flash', KeyT: 'smoke', KeyH: 'med', KeyB: 'band', KeyX: 'fuel', Tab: 'inv', KeyI: 'inv', KeyM: 'map', Digit1: 'slot0', Digit2: 'slot1', Escape: 'esc' };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (!G) return;
  if (KEYACT[e.code]) { e.preventDefault(); if (!e.repeat) doAct(KEYACT[e.code]); }
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
function doAct(a) {
  if (!G) return;
  if (a === 'inv') { if ($('inv').classList.contains('on')) $('inv').classList.remove('on'); else openInv(); return; }
  if (a === 'map') { if ($('bm').classList.contains('on')) $('bm').classList.remove('on'); else openMap(); return; }
  if (a === 'esc') { closeModals(); return; }
  if (a === 'slot0' || a === 'slot1') return sendM({ t: 'act', a: 'slot', i: a === 'slot1' ? 1 : 0 });
  if (G.me && G.me.st !== 'a' && G.me.st !== 'd') { sendM({ t: 'act', a: 'spec' }); return; }
  if ((a === 'med' || a === 'band') && G.me && G.me.act) a = 'cancel';
  sendM({ t: 'act', a });
}
// 화면 버튼
const BTN = [
  { a: 'interact', l: '상호작용', big: 1, r: 150, b: 150 },
  { a: 'reload', l: '🔄<small>장전</small>', r: 14, b: 168 },
  { a: 'swap', l: '🔁<small>교체</small>', r: 14, b: 226 },
  { a: 'crouch', l: '🦆<small>숙이기</small>', r: 72, b: 196 },
  { a: 'gren', l: '💣<small>수류탄</small>', r: 14, b: 284 },
  { a: 'flash', l: '✨<small>섬광</small>', r: 72, b: 254 },
  { a: 'smoke', l: '☁<small>연막</small>', r: 72, b: 312 },
];
const btnEls = {};
(function mkBtns() {
  const wrap = $('btnwrap');
  for (const b of BTN) { const d = document.createElement('div'); d.className = 'hb' + (b.big ? ' big' : ''); d.innerHTML = b.l + '<div class="cdv" style="transform:scaleY(0)"></div>'; d.dataset.a = b.a; wrap.appendChild(d); btnEls[b.a] = d; }
  document.querySelectorAll('#game .hb').forEach(d => {
    const fire = e => { e.preventDefault(); e.stopPropagation(); doAct(d.dataset.a); d.style.transform = 'scale(.9)'; setTimeout(() => d.style.transform = '', 120); };
    d.addEventListener('touchstart', fire, { passive: false }); d.addEventListener('mousedown', fire);
    if (!btnEls[d.dataset.a]) btnEls[d.dataset.a] = d;
  });
})();
function layoutBtns() {
  const sc = Math.min(1, H / 520);
  for (const b of BTN) { const d = btnEls[b.a]; d.style.right = `calc(${b.r * sc}px + env(safe-area-inset-right))`; d.style.bottom = `calc(${(b.b - 140) * sc + 14}px + env(safe-area-inset-bottom))`; d.style.transform = ''; d.style.zoom = sc < .8 ? .85 : 1; }
  btnEls.interact.style.right = `calc(${140 * sc}px + env(safe-area-inset-right))`; btnEls.interact.style.bottom = `${18 * sc + 8}px`;
  $('hint').textContent = isTouch ? '' : 'WASD 이동 · 마우스 조준/사격 · R 장전 · Q 교체 · Space 숙이기 · F 상호작용 · G/V/T 투척 · H/B 치료 · Tab 가방 · M 지도';
}
// 입력 전송
setInterval(() => {
  if (!G || !G.me) return;
  const inp = getInput();
  sendM({ t: 'i', mx: +inp.mx.toFixed(2), my: +inp.my.toFixed(2), a: +inp.a.toFixed(3), f: inp.f ? 1 : 0 });
}, 33);
function getInput() {
  let mx = 0, my = 0, f = false;
  if (keys.KeyW || keys.ArrowUp) my -= 1; if (keys.KeyS || keys.ArrowDown) my += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  const mv = stickVec(sticks.move); if (mv.m > .1) { mx = mv.x; my = mv.y; }
  const l = hyp(mx, my); if (l > 1) { mx /= l; my /= l; }
  const av = stickVec(sticks.aim);
  if (sticks.aim) { if (av.m > .2) lastAim = Math.atan2(av.y, av.x); f = av.m > .55; }
  else if (!isTouch && mouse.on) { const p = G.screenMe || { x: W / 2, y: H / 2 }; lastAim = Math.atan2(mouse.y - p.y, mouse.x - p.x); f = mouse.down; }
  else if (l > .2) lastAim = Math.atan2(my, mx);
  G.inputMoving = l > .1;
  if ($('inv').classList.contains('on') || $('bm').classList.contains('on')) { f = false; }
  return { mx, my, a: lastAim, f };
}

// ───────── 미니맵 ─────────
function renderMini(M) {
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'); const k = s / S.W;
  x.fillStyle = '#21557a'; x.fillRect(0, 0, s, s);
  x.fillStyle = '#d7c48f'; x.beginPath(); x.arc(S.CX * k, S.CY * k, (S.ISLAND + 40) * k, 0, 6.283); x.fill();
  x.fillStyle = '#5d8a45'; x.beginPath(); x.arc(S.CX * k, S.CY * k, S.ISLAND * k, 0, 6.283); x.fill();
  x.fillStyle = '#3f6f30'; for (const t of M.circles) if (t.t === 'tree') { x.fillRect(t.x * k - 1, t.y * k - 1, 2, 2); }
  x.fillStyle = '#2f76a6'; for (const l of M.lakes) { x.beginPath(); x.arc(l.x * k, l.y * k, l.r * k, 0, 6.283); x.fill(); }
  x.strokeStyle = '#9e9a7e'; x.lineWidth = 2.5; for (const r of M.roads) { x.beginPath(); x.moveTo(r[0] * k, r[1] * k); x.lineTo(r[2] * k, r[3] * k); x.stroke(); }
  x.fillStyle = '#8d6e63'; for (const b of M.blds) x.fillRect(b.x * k, b.y * k, b.w * k, b.h * k);
  x.fillStyle = '#b388ff'; for (const t of M.tps) { x.beginPath(); x.arc(t.x * k, t.y * k, 4, 0, 6.283); x.fill(); }
  return c;
}
function miniRect() { const s = Math.min(150, Math.max(100, Math.min(W, H) * .26)); return { x: 8, y: 8, s }; }
function openMap() {
  if (!G || !G.M) return;
  const c = $('bmc'), s = Math.min(innerWidth, innerHeight) * .92 * DPR; c.width = c.height = s; c.style.width = c.style.height = (s / DPR) + 'px';
  const x = c.getContext('2d'), k = s / S.W;
  x.drawImage(G.M.mini, 0, 0, s, s);
  x.font = `bold ${Math.round(12 * DPR)}px sans-serif`; x.textAlign = 'center';
  for (const t of G.M.towns) { x.fillStyle = '#000a'; x.fillText(t.name, t.x * k + 1, t.y * k - 7); x.fillStyle = t.kind === 'mil' ? '#ff8a80' : '#fff'; x.fillText(t.name, t.x * k, t.y * k - 8); }
  drawMapOverlay(x, k, s, true);
  $('bm').classList.add('on');
  $('bm').onclick = () => $('bm').classList.remove('on');
}
function drawMapOverlay(x, k, s, big) {
  const z = G.z;
  if (z) {
    x.strokeStyle = '#fff'; x.lineWidth = 2 * (big ? DPR : 1); x.setLineDash([6, 4]); x.beginPath(); x.arc(z[3] * k, z[4] * k, Math.max(1, z[5] * k), 0, 6.283); x.stroke(); x.setLineDash([]);
    x.strokeStyle = '#4fc3f7'; x.beginPath(); x.arc(z[0] * k, z[1] * k, Math.max(1, z[2] * k), 0, 6.283); x.stroke();
  }
  if (G.exts) for (const e of G.exts) { x.fillStyle = G.exo ? '#00e676' : '#777'; x.beginPath(); x.arc(e.x * k, e.y * k, big ? 7 * DPR : 4, 0, 6.283); x.fill(); if (big) { x.fillStyle = '#fff'; x.fillText(e.name + (G.exo ? '' : ' (2분 후 개방)'), e.x * k, e.y * k + 20 * DPR); } }
  for (const d of G.drops) if (!d[4]) { x.fillStyle = '#ff1744'; x.fillRect(d[1] * k - 4, d[2] * k - 4, 8, 8); if (big) { x.fillStyle = '#fff'; x.fillText('📦 보급' + (d[3] > 0 ? ` ${d[3]}초` : ''), d[1] * k, d[2] * k - 8); } }
  // 팀원
  for (const o of G.others.values()) if (o.fl & 16) { x.fillStyle = '#4fc3f7'; x.beginPath(); x.arc(o.x * k, o.y * k, big ? 5 * DPR : 3, 0, 6.283); x.fill(); }
  const me = G.me; if (me) { const px = (G.local && me.st === 'a' ? G.local.x : me.vx) * k, py = (G.local && me.st === 'a' ? G.local.y : me.vy) * k; x.fillStyle = '#ffeb3b'; x.beginPath(); x.arc(px, py, big ? 6 * DPR : 3.5, 0, 6.283); x.fill(); x.strokeStyle = '#ffeb3b'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(me.va) * 12, py + Math.sin(me.va) * 12); x.stroke(); }
}

// ───────── 가방 ─────────
function openInv() {
  if (!G || !G.me) return; const me = G.me;
  const wcard = (w, i) => {
    if (!w) return `<div class="wcard" style="opacity:.5">${i + 1}번 슬롯: 비어있음</div>`;
    return `<div class="wcard" style="border-color:${me.cw === i ? '#ffd54f' : '#444'}"><b style="color:${w.c}">${i + 1}. ${esc(w.n)}</b> ${me.cw === i ? '<span class="tag">사용중</span>' : `<button data-sl="${i}" style="padding:4px 8px">들기</button>`} <button class="r" data-dw="${i}" style="padding:4px 8px">버리기</button>
      <div style="font-size:12px;opacity:.85;margin:4px 0">피해 ${w.dmg} · 연사 ${Math.round(60000 / w.iv)}RPM · 사거리 ${w.rng} · 반동 ${w.rc} · 퍼짐 ${w.sp}° · 이동 ${Math.round(w.mv * 100)}% · ${w.auto ? '연발' : '단발'} · ${S.AMMO[w.am]} ${w.mag}/${w.max}</div>
      <div>${S.SLOTS.map(sl => { const a = w.att[sl]; return a ? `<span class="att on" data-det="${i}:${sl}">${S.ATT[a].n} ✕</span>` : `<span class="att">${{ muzzle: '총구', barrel: '총열', mag: '탄창', stock: '개머리', scope: '조준경' }[sl]} -</span>`; }).join('')}</div></div>`;
  };
  $('invBox').innerHTML = `<div class="row" style="justify-content:space-between"><h3 style="margin:4px 0">🎒 가방</h3><button class="g" id="invX">닫기</button></div>
   ${me.w.map(wcard).join('')}
   <div class="wcard"><b>🔧 무기 조합</b><div style="font-size:12px;opacity:.8;margin:4px 0">두 무기를 합쳐 더 강한 개조총을 만듭니다. (피해·사거리↑ / 반동·퍼짐·재장전↓ 단점) 부착물은 가방으로 이동</div><button class="y" id="craftB" ${me.w[0] && me.w[1] ? '' : 'disabled'}>조합하기</button></div>
   <div class="wcard"><b>부착물 (${me.bag.length}/6)</b><div style="font-size:12px;opacity:.7">누르면 들고 있는 무기에 장착</div>${me.bag.map((a, i) => `<div style="margin:3px 0"><span class="att on" data-eq="${i}">${S.ATT[a].n}</span><small style="opacity:.7"> ${S.ATT[a].d}</small> <button class="g" data-da="${i}" style="padding:3px 7px">버리기</button></div>`).join('') || '<div style="opacity:.5">없음</div>'}</div>
   <div class="wcard" style="font-size:13px">🛡 ${me.ar ? `${me.ar}레벨 방어구 (내구 ${me.ad})` : '방어구 없음'}<br>탄약: ${Object.entries(me.am).map(([k, v]) => `${S.AMMO[k]} ${v}`).join(' · ')}<br>소모품: ${Object.entries(me.it).map(([k, v]) => `${S.ITEMN[k]} ${v}`).join(' · ')}${G.mode === 'ex' ? `<br>💰 전리품 가치: ${me.val}` : ''}</div>`;
  $('inv').classList.add('on');
  $('invX').onclick = () => $('inv').classList.remove('on');
  const q = (s, f) => $('invBox').querySelectorAll(s).forEach(el => el.onclick = () => { f(el); setTimeout(openInv, 150); });
  q('[data-sl]', el => sendM({ t: 'act', a: 'slot', i: +el.dataset.sl }));
  q('[data-dw]', el => sendM({ t: 'act', a: 'dropw', i: +el.dataset.dw }));
  q('[data-det]', el => { const [i, s] = el.dataset.det.split(':'); sendM({ t: 'act', a: 'detach', i: +i, s }); });
  q('[data-eq]', el => sendM({ t: 'act', a: 'equip', b: +el.dataset.eq, i: me.cw }));
  q('[data-da]', el => sendM({ t: 'act', a: 'dropatt', b: +el.dataset.da }));
  const cb = $('craftB'); if (cb) cb.onclick = () => { sendM({ t: 'act', a: 'craft' }); setTimeout(openInv, 200); };
}

// ───────── 시야 다각형 ─────────
function visPolygon(M, x, y, f, a, scoped) {
  const N = isTouch ? 110 : 160, pts = [];
  for (let i = 0; i < N; i++) {
    const an = i / N * 6.2832; let R = S.VIS;
    if (scoped) { let d = an - a; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < S.SCOPE_CONE) R = S.VIS_SCOPE; }
    const ex = x + Math.cos(an) * R, ey = y + Math.sin(an) * R;
    const t = S.ray(M, x, y, ex, ey, f);
    pts.push(x + (ex - x) * t, y + (ey - y) * t);
  }
  return pts;
}

// ───────── 렌더 ─────────
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now;
  if (!G) { drawBg(now); if ($('menu').classList.contains('on')) drawPreview(now); return; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!G.M || !G.me) { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('맵 불러오는 중…', W / 2, H / 2); return; }
  const M = G.M, me = G.me;
  const alive = me.st === 'a' || me.st === 'd';
  // 예측 이동
  const inp = getInput();
  if (alive && !me.car && G.pre === 0 && G.local && me.sp > 0) { const p = { x: G.local.x + inp.mx * me.sp * dt, y: G.local.y + inp.my * me.sp * dt }; S.resolve(M, p, S.PR, me.f); G.local = p; }
  const vx = alive && !me.car ? G.local.x : me.vx, vy = alive && !me.car ? G.local.y : me.vy, vf = alive ? me.f : me.vf;
  // 다른 플레이어 보간
  const k = 1 - Math.exp(-dt * 14);
  G.myKick = G.myFireT && now - G.myFireT < 70 ? 2.5 : 0;
  for (const o of G.others.values()) { o.kick = o.kickT && now - o.kickT < 70 ? 2.5 : 0; o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; let da = o.ta - o.a; da = Math.atan2(Math.sin(da), Math.cos(da)); o.a += da * k; }
  const cw = me.w[me.cw], scoped = !!(cw && cw.sc) && alive;
  // 카메라
  const base = Math.min(W, H) / (isTouch ? 640 : 760);
  let camx = vx, camy = vy;
  if (scoped) { const aiming = sticks.aim || (!isTouch && mouse.on); if (aiming) { G.camOff = G.camOff || { x: 0, y: 0 }; const tx = Math.cos(lastAim) * 260, ty = Math.sin(lastAim) * 260; G.camOff.x += (tx - G.camOff.x) * k * .5; G.camOff.y += (ty - G.camOff.y) * k * .5; } }
  if (!scoped && G.camOff) { G.camOff.x *= .9; G.camOff.y *= .9; }
  if (G.camOff) { camx += G.camOff.x; camy += G.camOff.y; }
  const sc = base * (scoped ? .82 : 1);
  G.screenMe = { x: W / 2 + (vx - camx) * sc, y: H / 2 + (vy - camy) * sc };
  const view = { x0: camx - W / 2 / sc - 60, y0: camy - H / 2 / sc - 60, x1: camx + W / 2 / sc + 60, y1: camy + H / 2 / sc + 60 };
  const inV = (x, y, m) => x > view.x0 - (m || 0) && x < view.x1 + (m || 0) && y > view.y0 - (m || 0) && y < view.y1 + (m || 0);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-camx, -camy);
  // 바다/섬
  ctx.fillStyle = '#1f5f86'; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ctx.fillStyle = '#d9c48c'; ctx.beginPath(); ctx.arc(S.CX, S.CY, S.ISLAND + 45, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#6a9a4c'; ctx.beginPath(); ctx.arc(S.CX, S.CY, S.ISLAND, 0, 6.283); ctx.fill();
  // 잔디 무늬
  ctx.fillStyle = 'rgba(0,0,0,.05)'; const gs = 120; for (let gx = Math.floor(view.x0 / gs) * gs; gx < view.x1; gx += gs) for (let gy = Math.floor(view.y0 / gs) * gs; gy < view.y1; gy += gs) if (((gx + gy) / gs) % 2 === 0) ctx.fillRect(gx, gy, gs, gs);
  for (const l of M.lakes) if (inV(l.x, l.y, l.r)) { ctx.fillStyle = '#d9c48c'; ctx.beginPath(); ctx.arc(l.x, l.y, l.r + 14, 0, 6.283); ctx.fill(); ctx.fillStyle = '#2f7fb0'; ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, 6.283); ctx.fill(); }
  ctx.strokeStyle = '#8f8a70'; ctx.lineWidth = 46; ctx.lineCap = 'round'; ctx.beginPath(); for (const r of M.roads) { ctx.moveTo(r[0], r[1]); ctx.lineTo(r[2], r[3]); } ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([24, 24]); ctx.beginPath(); for (const r of M.roads) { ctx.moveTo(r[0], r[1]); ctx.lineTo(r[2], r[3]); } ctx.stroke(); ctx.setLineDash([]);
  // 탈출구
  if (G.exts) for (const e of G.exts) if (inV(e.x, e.y, 120)) { ctx.fillStyle = G.exo ? 'rgba(0,230,118,.25)' : 'rgba(150,150,150,.2)'; ctx.strokeStyle = G.exo ? '#00e676' : '#999'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🚁 ' + e.name, e.x, e.y + 6); }
  // 순간이동 포탈
  for (const p of M.portals) if (p.kind === 'tp' && vf === 0 && inV(p.x, p.y, 50)) { const t = now / 400; ctx.strokeStyle = '#b388ff'; ctx.lineWidth = 5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r - i * 9, t + i, t + i + 4); ctx.stroke(); } ctx.fillStyle = 'rgba(179,136,255,.25)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('포탈', p.x, p.y - p.r - 6); }
  // 건물 바닥
  const myB = S.inBld(M, vx, vy);
  for (const b of M.blds) { if (!inV(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue; if (vf > 0 && b !== myB) continue; ctx.fillStyle = vf === 0 ? '#b9a88c' : ['#b9a88c', '#a99070', '#97806a'][vf]; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; for (let yy = b.y + 20; yy < b.y + b.h; yy += 20) { ctx.beginPath(); ctx.moveTo(b.x, yy); ctx.lineTo(b.x + b.w, yy); ctx.stroke(); } }
  if (vf > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); if (myB) { ctx.fillStyle = ['#b9a88c', '#a99070', '#97806a'][vf]; ctx.fillRect(myB.x, myB.y, myB.w, myB.h); } }
  // 계단
  for (const p of M.portals) if (p.kind !== 'tp' && p.f === vf && inV(p.x, p.y)) { ctx.fillStyle = p.kind === 'up' ? '#5c6bc0' : '#26a69a'; ctx.fillRect(p.x - 18, p.y - 18, 36, 36); ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.kind === 'up' ? `▲${p.tf + 1}층` : `▼${p.tf + 1}층`, p.x, p.y + 5); }
  // 아이템
  ctx.textAlign = 'center';
  for (const it of G.items.values()) {
    if (it.f !== vf || !inV(it.x, it.y)) continue;
    drawItem(it, now);
  }
  // 벽
  const C = S.CELL, gw = M.gw;
  const cx0 = Math.max(0, Math.floor(view.x0 / C)), cx1 = Math.min(gw - 1, Math.floor(view.x1 / C)), cy0 = Math.max(0, Math.floor(view.y0 / C)), cy1 = Math.min(gw - 1, Math.floor(view.y1 / C));
  const drawnW = new Set(), trees = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const cell = M.cells[cy * gw + cx]; if (!cell) continue;
    for (const w of cell.w) { if (w.f !== vf || drawnW.has(w)) continue; drawnW.add(w); ctx.fillStyle = w.win ? 'rgba(170,220,255,.7)' : '#4b3b30'; ctx.fillRect(w.x, w.y, w.w, w.h); }
    if (vf === 0) for (const o of cell.c) { if (drawnW.has(o)) continue; drawnW.add(o); if (o.t === 'tree') trees.push(o); else if (o.t === 'rock') { ctx.fillStyle = '#7d7d7d'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.283); ctx.fill(); ctx.fillStyle = '#9e9e9e'; ctx.beginPath(); ctx.arc(o.x - o.r * .25, o.y - o.r * .25, o.r * .6, 0, 6.283); ctx.fill(); } else { ctx.fillStyle = '#8d6e3f'; ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2); ctx.strokeStyle = '#5d4627'; ctx.lineWidth = 3; ctx.strokeRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2); } }
  }
  // 지붕 (밖에서 볼 때)
  if (vf === 0) for (const b of M.blds) { if (b === myB || !inV(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue; ctx.fillStyle = ['#8d5a44', '#6d4c41', '#5d4037'][b.nf - 1]; ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3; ctx.beginPath(); if (b.w > b.h) { ctx.moveTo(b.x, b.y + b.h / 2); ctx.lineTo(b.x + b.w, b.y + b.h / 2); } else { ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w / 2, b.y + b.h); } ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(b.nf + 'F', b.x + b.w / 2, b.y + b.h / 2 + 5); }
  // 보급
  for (const d of G.drops) {
    if (vf !== 0 || !inV(d[1], d[2], 100)) continue;
    if (d[3] > 0) { const s = 1 + d[3] / 10; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(d[1], d[2], 20, 0, 6.283); ctx.fill(); ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(d[1], d[2] - d[3] * 8, 28 * s, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#795548'; ctx.fillRect(d[1] - 12, d[2] - d[3] * 8, 24, 24); }
    else { ctx.fillStyle = d[4] ? '#5d4037' : '#1565c0'; ctx.fillRect(d[1] - 24, d[2] - 24, 48, 48); ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 3; ctx.strokeRect(d[1] - 24, d[2] - 24, 48, 48); if (!d[4]) { ctx.fillStyle = 'rgba(255,40,40,.35)'; for (let i = 0; i < 5; i++) { const t = (now / 1000 + i * .4) % 2; ctx.beginPath(); ctx.arc(d[1] + Math.sin(i * 3 + now / 700) * 20, d[2] - t * 90, 14 + t * 18, 0, 6.283); ctx.fill(); } } }
  }
  // 차량
  for (const v of G.vehs) {
    if (vf !== 0) break;
    ctx.save(); ctx.translate(v[1], v[2]); ctx.rotate(v[3]);
    ctx.fillStyle = v[8] ? '#333' : '#c62828'; roundRect(-34, -19, 68, 38, 8); ctx.fillStyle = v[8] ? '#222' : '#90caf9'; ctx.fillRect(4, -14, 16, 28); ctx.fillStyle = '#111'; for (const [a, b] of [[-22, -21], [16, -21], [-22, 17], [16, 17]]) ctx.fillRect(a, b, 12, 5);
    ctx.restore();
    if (!v[8]) { ctx.fillStyle = '#000a'; ctx.fillRect(v[1] - 26, v[2] - 34, 52, 6); ctx.fillStyle = '#ffb300'; ctx.fillRect(v[1] - 26, v[2] - 34, 52 * v[4] / 100, 6); if (v[6]) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('👤' + v[6], v[1], v[2] + 40); } }
  }
  // 투척물
  for (const g of G.grens) { ctx.fillStyle = g[3] === 'gren' ? '#33691e' : g[3] === 'flash' ? '#eee' : '#90a4ae'; ctx.beginPath(); ctx.arc(g[1], g[2], 6, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
  // 다른 플레이어
  const t = now / 1000;
  for (const o of G.others.values()) {
    if (o.f !== vf) continue;
    const r = G.roster.get(o.id); if (!r) continue;
    drawPlayer(o.x, o.y, o.a, r, o, t, o.fl & 16);
  }
  // 나
  if (alive && !me.car) { const r = G.roster.get(me.id); drawPlayer(vx, vy, inp.a, r, { st: me.st, fl: (me.cro ? 1 : 0) | (G.inputMoving ? 4 : 0) | (me.rl >= 0 ? 2 : 0), w: cw ? cw.id : '', hp: me.hp, ar: me.ar, am: cw ? (cw.sil ? 1 : 0) | (cw.sc ? 2 : 0) : 0, kick: G.myKick || 0 }, t, false, true); }
  // 조준 퍼짐 표시 (반동)
  if (alive && cw && me.st === 'a' && !me.car) {
    const spread = (cw.sp + me.rec) * Math.PI / 180, L = Math.min(cw.rng, 420);
    ctx.fillStyle = me.rec > 6 ? 'rgba(255,80,80,.16)' : 'rgba(255,255,255,.1)';
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.arc(vx, vy, L, inp.a - spread, inp.a + spread); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = me.rec > 6 ? 'rgba(255,90,90,.6)' : 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(vx + Math.cos(inp.a) * 30, vy + Math.sin(inp.a) * 30); ctx.lineTo(vx + Math.cos(inp.a) * L, vy + Math.sin(inp.a) * L); ctx.stroke();
  }
  // 총알
  const bt = (now - G.snapT) / 1000;
  ctx.strokeStyle = '#ffe082'; ctx.lineWidth = 3; ctx.beginPath();
  for (const b of G.bullets) { const x = b[1] + b[3] * bt, y = b[2] + b[4] * bt; ctx.moveTo(x - b[3] * .018, y - b[4] * .018); ctx.lineTo(x, y); }
  ctx.stroke();
  // 나무
  if (vf === 0) for (const o of trees) { const near = hyp(o.x - vx, o.y - vy) < o.r * 2.1 + 12; ctx.globalAlpha = near ? .35 : 1; ctx.fillStyle = '#5d4037'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * .35, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(46,110,40,.88)'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.1, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(80,150,60,.5)'; ctx.beginPath(); ctx.arc(o.x - o.r * .5, o.y - o.r * .5, o.r * 1.2, 0, 6.283); ctx.fill(); } ctx.globalAlpha = 1;
  // 연막
  for (const s of G.smokes) { for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + now / 3000; ctx.fillStyle = 'rgba(200,205,210,.55)'; ctx.beginPath(); ctx.arc(s[1] + Math.cos(a) * s[3] * .45, s[2] + Math.sin(a) * s[3] * .45, s[3] * .62, 0, 6.283); ctx.fill(); } }
  // 이펙트
  G.booms = G.booms.filter(b => now - b.t0 < 600); for (const b of G.booms) { const p = (now - b.t0) / 600; ctx.fillStyle = b.flash ? `rgba(255,255,255,${1 - p})` : `rgba(255,${150 - p * 100},0,${.8 - p * .8})`; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (.4 + p * .8), 0, 6.283); ctx.fill(); }
  G.sparks = G.sparks.filter(s => s.until > now); ctx.fillStyle = '#fff59d'; for (const s of G.sparks) { ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 6.283); ctx.fill(); }
  G.tps = G.tps.filter(s => s.until > now); for (const s of G.tps) { ctx.strokeStyle = `rgba(179,136,255,${(s.until - now) / 600})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(s.x, s.y, 60 - (s.until - now) / 15, 0, 6.283); ctx.stroke(); }
  G.hits = G.hits.filter(h => h.until > now); for (const h of G.hits) { ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(h.d, h.x + 12, h.y - 20 - (250 - (h.until - now)) / 10); }
  // 시야 안개
  const key = Math.round(vx) + ',' + Math.round(vy) + ',' + vf + ',' + (scoped ? Math.round(lastAim * 20) : 0);
  if (key !== G.visKey) { G.visPoly = visPolygon(M, vx, vy, vf, lastAim, scoped); G.visKey = key; }
  ctx.fillStyle = 'rgba(5,10,20,.62)'; ctx.beginPath(); ctx.rect(view.x0 - 100, view.y0 - 100, view.x1 - view.x0 + 200, view.y1 - view.y0 + 200);
  const vp = G.visPoly; ctx.moveTo(vp[0], vp[1]); for (let i = vp.length - 2; i >= 2; i -= 2) ctx.lineTo(vp[i], vp[i + 1]); ctx.closePath(); ctx.fill('evenodd');
  // 자기장
  if (G.z) {
    const z = G.z; ctx.fillStyle = 'rgba(40,80,255,.28)'; ctx.beginPath(); ctx.rect(view.x0 - 100, view.y0 - 100, view.x1 - view.x0 + 200, view.y1 - view.y0 + 200); ctx.moveTo(z[0] + Math.max(1, z[2]), z[1]); ctx.arc(z[0], z[1], Math.max(1, z[2]), 0, 6.283); ctx.fill('evenodd');
    ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(z[0], z[1], Math.max(1, z[2]), 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.setLineDash([30, 20]); ctx.beginPath(); ctx.arc(z[3], z[4], Math.max(1, z[5]), 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
  drawHUD(now, vx, vy, sc, camx, camy);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); }
const ITEMICON = { am: '🔸', ar: '🛡', med: '💊', band: '🩹', gren: '💣', flash: '✨', smoke: '☁', fuel: '⛽', att: '🔧', val: '💰' };
function drawItem(it, now) {
  const x = it.x, y = it.y;
  if (it.k === 'w') { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x, y, 17, 0, 6.283); ctx.fill(); ctx.fillStyle = it.c || '#ffd54f'; ctx.fillRect(x - 15, y - 3, 30, 7); ctx.fillStyle = '#222'; ctx.fillRect(x - 15, y + 3, 7, 6); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(it.nm + (it.na ? ' +' + it.na : ''), x, y - 12); return; }
  const glow = it.k === 'ar' && it.d === 3 || it.k === 'val';
  ctx.fillStyle = glow ? 'rgba(255,215,0,.45)' : 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(x, y, 13, 0, 6.283); ctx.fill();
  ctx.font = '15px sans-serif'; ctx.fillText(ITEMICON[it.k] || '?', x, y + 5);
  if (it.k === 'ar') { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('Lv' + it.d, x, y - 14); }
  if (it.k === 'am') { ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.fillText(S.AMMO[it.d], x, y - 14); }
  if (it.k === 'att') { ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.fillText(S.ATT[it.d].n, x, y - 14); }
}
function drawPlayer(x, y, a, r, o, t, mate, isMe) {
  const down = o.st === 'd';
  if (down) { ctx.save(); ctx.globalAlpha = .7; }
  drawChar(ctx, x, y, a, r.skin, t + r.id, !!(o.fl & 4), o.fl & 1, down ? '' : o.w, undefined, { am: o.am, rl: !!(o.fl & 2), kick: o.kick || 0 });
  if (down) { ctx.restore(); ctx.fillStyle = '#ff5252'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('기절 (소생 필요)', x, y + 32); }
  if (o.fl & 8) { ctx.strokeStyle = '#69f0ae'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 24, 0, 6.283); ctx.stroke(); }
  if (o.ar) { ctx.strokeStyle = ['', '#bdbdbd', '#42a5f5', '#ab47bc'][o.ar]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 19, 0, 6.283); ctx.stroke(); }
  if (!isMe) {
    ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = mate ? '#4fc3f7' : '#fff'; ctx.fillText(r.name, x, y - 30);
    ctx.fillStyle = '#000a'; ctx.fillRect(x - 18, y - 26, 36, 4); ctx.fillStyle = down ? '#ff5252' : mate ? '#4fc3f7' : '#e53935'; ctx.fillRect(x - 18, y - 26, 36 * Math.max(0, Math.min(100, o.hp)) / 100, 4);
  }
}
function drawHUD(now, vx, vy, sc, camx, camy) {
  const me = G.me, alive = me.st === 'a' || me.st === 'd', cw = me.w[me.cw];
  ctx.textAlign = 'left';
  // 피격 방향
  G.hurts = G.hurts.filter(h => h.until > now);
  for (const h of G.hurts) { const a = Math.atan2(h.y - vy, h.x - vx), p = (h.until - now) / 900; ctx.strokeStyle = `rgba(255,30,30,${p})`; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(G.screenMe.x, G.screenMe.y, 70, a - .35, a + .35); ctx.stroke(); }
  // 총소리 방향
  G.sounds = G.sounds.filter(s => s.until > now);
  for (const s of G.sounds) { const a = Math.atan2(s.y - vy, s.x - vx), p = (s.until - now) / 1200; ctx.fillStyle = `rgba(255,200,0,${p})`; const rx = G.screenMe.x + Math.cos(a) * 95, ry = G.screenMe.y + Math.sin(a) * 95; ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(s.sil ? '🔇' : '💥', rx, ry + 6); }
  // 보급 방향 화살표
  for (const d of G.drops) if (!d[4]) { const dx = d[1] - vx, dy = d[2] - vy, dist = hyp(dx, dy); if (dist < 300) continue; const a = Math.atan2(dy, dx), R = Math.min(W, H) * .42; const x = W / 2 + Math.cos(a) * R, y = H / 2 + Math.sin(a) * R; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#ff1744'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill(); ctx.restore(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`📦${Math.round(dist / 10)}m${d[3] > 0 ? ' ' + d[3] + 's' : ''}`, x, y + 22); }
  // 미니맵
  const mr = miniRect(); const k = mr.s / (S.W * .25);
  ctx.save(); ctx.beginPath(); ctx.rect(mr.x, mr.y, mr.s, mr.s); ctx.clip();
  ctx.fillStyle = '#21557a'; ctx.fillRect(mr.x, mr.y, mr.s, mr.s);
  const mini = G.M.mini, mk = 512 / S.W;
  const span = S.W * .25; const sx = (vx - span / 2) * mk, sy = (vy - span / 2) * mk;
  ctx.drawImage(mini, sx, sy, span * mk, span * mk, mr.x, mr.y, mr.s, mr.s);
  ctx.translate(mr.x - (vx - span / 2) * k, mr.y - (vy - span / 2) * k);
  drawMapOverlay(ctx, k, mr.s, false);
  ctx.restore();
  ctx.strokeStyle = '#fff8'; ctx.lineWidth = 2; ctx.strokeRect(mr.x, mr.y, mr.s, mr.s);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('탭: 전체지도', mr.x + 3, mr.y + mr.s - 4);
  // 상단 정보
  ctx.textAlign = 'right'; ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#fff';
  let info = `👥 ${G.n}  💀 ${me.kills}`;
  if (G.z) info += `  ⏱ ${G.z[7] === 'wait' ? '축소까지 ' : G.z[7] === 'shrink' ? '축소중 ' : ''}${G.z[8]}s`;
  if (G.tl != null) info += `  ⏱ ${Math.floor(G.tl / 60)}:${String(G.tl % 60).padStart(2, '0')}`;
  if (me.f > 0) info += `  🏢 ${me.f + 1}층`;
  shadowText(info, W - 10, 22);
  if (G.mode === 'ex') { ctx.font = 'bold 13px sans-serif'; shadowText(`💰 ${me.val}`, W - 10, 42); }
  // 킬피드
  G.feed = G.feed.filter(f => f.until > now); ctx.font = '12px sans-serif';
  G.feed.forEach((f, i) => { ctx.fillStyle = f.mine ? '#ffd54f' : '#fff'; shadowText(`${f.t} [${f.w}]`, W - 10, 64 + i * 16, f.mine ? '#ffd54f' : '#fff'); });
  // 메시지
  G.msgs = G.msgs.filter(m => m.until > now);
  ctx.textAlign = 'center';
  G.msgs.slice(-4).forEach((m, i) => { ctx.font = m.small ? 'bold 13px sans-serif' : 'bold 17px sans-serif'; shadowText(m.t, W / 2, H * .2 + i * 24, m.small ? '#b9f6ca' : '#ffeb3b'); });
  if (G.pre > 0) { ctx.font = 'bold 48px sans-serif'; shadowText(`${G.pre}`, W / 2, H * .42, '#ffd54f'); ctx.font = 'bold 18px sans-serif'; shadowText(G.mode === 'ex' ? '탈출 작전 시작 준비! 전리품을 챙겨 탈출구로!' : '곧 시작합니다! 자기장을 조심하세요', W / 2, H * .42 + 34); }
  // 체력/방어구
  const bw = Math.min(300, W * .36), bx = W / 2 - bw / 2, by = H - 30;
  ctx.fillStyle = '#000a'; ctx.fillRect(bx - 2, by - 2, bw + 4, 16);
  ctx.fillStyle = me.st === 'd' ? '#ff5252' : me.hp > 60 ? '#eee' : me.hp > 30 ? '#ffb74d' : '#ff5252'; ctx.fillRect(bx, by, bw * Math.max(0, me.hp) / 100, 12);
  if (me.ar) { ctx.fillStyle = ['', '#bdbdbd', '#42a5f5', '#ab47bc'][me.ar]; ctx.fillRect(bx, by - 7, bw * me.ad / S.ARMOR[me.ar].dur, 4); ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; shadowText(`🛡Lv${me.ar}`, bx, by - 10); }
  // 무기
  if (cw) {
    ctx.textAlign = 'center'; ctx.font = 'bold 15px sans-serif';
    shadowText(`${cw.n}  ${cw.mag}/${cw.max}  (${me.am[cw.am]})`, W / 2, by - 16, cw.mag === 0 ? '#ff5252' : '#fff');
    const other = me.w[1 - me.cw]; if (other) { ctx.font = '11px sans-serif'; shadowText(`[Q] ${other.n} ${other.mag}/${other.max}`, W / 2, by - 34, '#bbb'); }
    if (me.rec > 6) { ctx.font = 'bold 13px sans-serif'; shadowText('반동 과다! 점사하세요', W / 2, by - 52, '#ff8a80'); }
  } else if (alive) { ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif'; shadowText('무기 없음 - 무기를 주우세요', W / 2, by - 16, '#ff8a80'); }
  // 아이템 개수
  ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
  shadowText(`💊${me.it.med} 🩹${me.it.band} 💣${me.it.gren} ✨${me.it.flash} ☁${me.it.smoke} ⛽${me.it.fuel}`, 10, mr.y + mr.s + 18);
  // 진행바
  const prog = me.act ? me.act[1] : me.rl >= 0 ? me.rl : me.ex > 0 ? me.ex / 7 : -1;
  if (prog >= 0) { const label = me.act ? { med: '구급상자 사용중 (가만히)', band: '붕대 감는중', revive: '소생중', open: '보급 여는중', fuel: '주유중' }[me.act[0]] : me.rl >= 0 ? '재장전' : '탈출중…'; const cx = W / 2, cy = H / 2 + 70; ctx.strokeStyle = '#0008'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 6.283); ctx.stroke(); ctx.strokeStyle = '#69f0ae'; ctx.beginPath(); ctx.arc(cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + prog * 6.283); ctx.stroke(); ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif'; shadowText(label, cx, cy + 42); }
  // 상호작용 버튼 라벨
  const lab = interactLabel(); const ib = btnEls.interact;
  ib.classList.toggle('hide', !lab); if (lab && ib.dataset.l !== lab) { ib.dataset.l = lab; ib.innerHTML = lab + '<div class="cdv" style="transform:scaleY(0)"></div>'; }
  if (!isTouch && lab) { ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif'; shadowText('[F] ' + lab.replace(/<[^>]+>/g, ' '), W / 2, H / 2 + 120, '#ffd54f'); }
  // 숙이기 쿨타임
  const cd = btnEls.crouch.querySelector('.cdv'); cd.style.transform = `scaleY(${Math.min(1, me.cr / 5500)})`;
  btnEls.fuel && btnEls.fuel.classList.toggle('hide', !me.it.fuel);
  // 섬광
  if (me.fl > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, me.fl / 1500)})`; ctx.fillRect(0, 0, W, H); }
  // 기절/관전
  if (me.st === 'd') { ctx.textAlign = 'center'; ctx.font = 'bold 20px sans-serif'; shadowText('기절! 팀원에게 기어가세요 (소생 대기)', W / 2, H * .3, '#ff5252'); }
  if (!alive && me.spec) { const r = G.roster.get(me.spec); ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif'; shadowText(`👀 관전중: ${r ? r.name : ''} (아무 버튼: 다음)`, W / 2, H * .3, '#fff'); }
  if (me.st === 'e') { ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; shadowText('🚁 탈출 완료!', W / 2, H * .3, '#69f0ae'); }
  if (G.z && alive) { const z = G.z; if (hyp(vx - z[0], vy - z[1]) > z[2]) { ctx.textAlign = 'center'; ctx.font = 'bold 18px sans-serif'; shadowText('⚠ 자기장 밖! 안전구역으로 이동하세요', W / 2, H * .3 + 26, '#4fc3f7'); } }
  // 조이스틱
  if (isTouch) {
    for (const [s, dx, dy, lbl] of [[sticks.move, 110, H - 110, '이동'], [sticks.aim, W - 300, H - 110, '조준·사격']]) {
      const ox = s ? s.ox : dx, oy = s ? s.oy : dy, kx = s ? s.x : dx, ky = s ? s.y : dy;
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox, oy, STICK_R, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = s === sticks.aim && s && stickVec(s).m > .55 ? 'rgba(255,82,82,.7)' : 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(kx, ky, 24, 0, 6.283); ctx.fill();
      if (!s) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lbl, ox, oy + STICK_R + 14); }
    }
  }
}
function shadowText(t, x, y, col) { ctx.fillStyle = '#000c'; ctx.fillText(t, x + 1, y + 1); ctx.fillStyle = col || '#fff'; ctx.fillText(t, x, y); }
function interactLabel() {
  const me = G.me; if (!me) return null;
  if (me.car) return '🚗<small>하차</small>';
  if (me.st !== 'a') return null;
  if (me.act) return '✋<small>취소</small>';
  const x = G.local.x, y = G.local.y;
  for (const o of G.others.values()) if ((o.fl & 16) && o.st === 'd' && hyp(o.x - x, o.y - y) < 65) return '❤️<small>소생</small>';
  for (const d of G.drops) if (d[3] <= 0 && !d[4] && me.f === 0 && hyp(d[1] - x, d[2] - y) < 75) return '📦<small>보급열기</small>';
  let best = null, bd = 62; for (const it of G.items.values()) if (it.k === 'w' && it.f === me.f) { const d = hyp(it.x - x, it.y - y); if (d < bd) { bd = d; best = it; } }
  if (best) return `🔫<small>${esc(best.nm)}</small>`;
  for (const v of G.vehs) if (!v[8] && me.f === 0 && v[6] < 4 && hyp(v[1] - x, v[2] - y) < 80) return '🚗<small>탑승</small>';
  return null;
}
window.__dbg = () => G;
requestAnimationFrame(frame);
connect();
})();
