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
const prog = () => acct ? { wins: acct.stats.wins, ext: acct.stats.ext, kills: acct.stats.kills, games: acct.stats.games, val: acct.stats.val, xp: acct.xp || 0 } : save;

function show(id) { $('conn').style.display = id === 'game' ? 'none' : ''; for (const s of ['menu', 'room']) $(s).classList.toggle('on', s === id); $('game').classList.toggle('on', id === 'game'); $('bgc').style.display = id === 'game' ? 'none' : ''; }

function onMsg(m) {
  switch (m.t) {
    case 'hi': myCid = m.id; renderRooms(m.rooms); break;
    case 'rooms': renderRooms(m.rooms); break;
    case 'room': curRoom = m; if (!G) { if (!$('room').classList.contains('on')) closeModal('pwm'); show('room'); renderRoom(); } break;
    case 'left': curRoom = null; G = null; closeLoot(); show('menu'); break;
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
$('qEX').onclick = () => { renderRaid(); $('raidm').classList.add('on'); };
const DGCOL = ['', '#cddc39', '#4fc3f7', '#b39ddb', '#ffb74d', '#ef5350'];
let worldInfo = null;
function fmtUp(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60; return h ? `${h}시간 ${m}분` : `${m}분`; }
function renderRaid() {
  const w = worldInfo, box = $('raidBox'); if (!box) return;
  const kitN = acct ? acct.kit.length : 0, kitV = acct ? acct.kit.reduce((a, it) => a + S.itemPrice(it), 0) : 0;
  box.innerHTML = `<div class="row" style="justify-content:space-between"><div class="rlive">LIVE · 상시 운영 중</div><button class="g" id="raidX" style="padding:6px 12px">닫기</button></div>
   <div class="rbig"><b>${w ? w.n : '-'}</b><span>명이 지금 레이드 중</span></div>
   <div style="font-size:12px;color:var(--tx3)">${w ? `서버 가동 ${fmtUp(w.up)} · 입장 지점 16곳 · 고정 탈출구 5곳${w.drops ? ` · 보급 ${w.drops}개 투하됨` : ''}` : '현황을 불러오는 중'}</div>
   <div class="dgl">${w ? w.dg.map(d => `<div class="dgr" style="--c:${DGCOL[d.tier]}"><div><b>${esc(d.name)}</b><small>위험도 ${'■'.repeat(d.tier)}${'□'.repeat(5 - d.tier)}</small></div><span class="gn">경비 ${d.g}</span><span class="pn">${d.n}<i>명</i></span></div>`).join('') + `<div class="dgr" style="--c:#5c656d"><div><b>던전 밖 (야외·오두막)</b><small>입장 지점과 포탈 주변은 몬스터가 오지 않는 안전지대</small></div><span class="gn"></span><span class="pn">${w.out}<i>명</i></span></div>` : ''}</div>
   <div class="rkit">${acct ? (kitN ? `반입 장비 ${kitN}개 · ${kitV.toLocaleString()}원 상당 · 죽으면 모두 잃습니다` : '반입 장비가 없습니다. 권총 한 자루로 들어갑니다.') + ' <a href="#" id="raidKit" style="color:var(--acc)">창고에서 챙기기</a>' : '손님은 기본 권총으로 들어가고, 탈출해도 아이템이 저장되지 않습니다. <a href="#" id="raidLogin" style="color:var(--acc)">로그인</a>'}</div>
   <button class="y" id="raidGo" style="width:100%;padding:14px;font-size:15px">지금 바로 입장</button>`;
  $('raidX').onclick = () => closeModal('raidm');
  $('raidGo').onclick = () => { closeModal('raidm'); hello(); sendM({ t: 'quick', mode: 'ex' }); };
  const k = $('raidKit'); if (k) k.onclick = e => { e.preventDefault(); closeModal('raidm'); openStash(); };
  const l = $('raidLogin'); if (l) l.onclick = e => { e.preventDefault(); closeModal('raidm'); openAuth('login'); };
}
$('mk').onclick = () => { hello(); sendM({ t: 'create', name: $('rname').value.trim() || ((acct ? acct.name : save.name) + '의 방'), ts: radio('rts'), pw: $('rpw').value }); };
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
  const L = S.levelOf(P.xp || 0); $('lvl').innerHTML = `<span>Lv.${L.l}</span><div class="xpbar"><i style="width:${Math.round(L.cur / L.need * 100)}%"></i></div><small>${L.cur} / ${L.need} XP</small>`;
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
const MODEN = { br: '배틀로얄', ex: '레이드' }, TSN = { 1: '솔로', 2: '듀오', 4: '스쿼드' };
let lastRooms = [];
function renderRooms(list) {
  lastRooms = list; const el = $('roomList');
  const wd = list.find(r => r.world); list = list.filter(r => !r.world);
  if (wd) { worldInfo = wd; $('qEXn').textContent = `지금 ${wd.n}명 레이드 중 · 상시 운영`; if ($('raidm').classList.contains('on')) renderRaid(); }
  const wHtml = wd ? `<div class="ri world"><div style="min-width:0"><div class="nm">레이드 월드 <span class="tag acc">상시 운영</span></div><div class="sub">상시 운영 · 던전 5개 · 아무 때나 입장${wd.n ? ` · ${wd.dg.filter(d => d.n).map(d => d.name + ' ' + d.n).join(', ') || '야외 ' + wd.out}` : ''}</div></div><div class="cnt">${wd.n}<i>명</i></div><button class="b" data-world="1">입장</button></div>` : '';
  if (!list.length) { el.innerHTML = wHtml + '<div class="empty">열린 배틀로얄 방이 없습니다.<br>빠른 입장을 누르거나 방을 직접 만들어 보세요.</div>'; const wb = el.querySelector('[data-world]'); if (wb) wb.onclick = () => $('qEX').onclick(); return; }
  el.innerHTML = list.map(r => `<div class="ri"><div style="min-width:0"><div class="nm">${r.lk ? '<span class="lock"></span>' : ''}${esc(r.name)}</div><div class="sub">배틀로얄 · ${TSN[r.ts]}${r.lk ? ' · 비공개' : ''}</div></div>
    <div class="cnt">${r.n}<i>/10</i></div>${r.st === 'play' ? '<span class="tag live">진행중</span>' : `<button class="${r.lk ? 'g' : ''}" data-j="${r.id}" data-lk="${r.lk}">입장</button>`}</div>`).join('');
  el.innerHTML = wHtml + el.innerHTML; const wb = el.querySelector('[data-world]'); if (wb) wb.onclick = () => $('qEX').onclick();
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
  const M = S.hydrate(o), sz = 1400, c = document.createElement('canvas'); c.width = c.height = sz; const x = c.getContext('2d'), k = sz / M.W;
  x.fillStyle = '#07090b'; x.fillRect(0, 0, sz, sz);
  x.fillStyle = '#11161a'; x.beginPath(); x.arc(M.CX * k, M.CY * k, M.R * k, 0, 6.283); x.fill();
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
  closeModals(); closeLoot();
  G = { mode: m.mode, world: !!m.world, ts: m.ts, you: m.you, roster: new Map(m.roster.map(r => [r.id, r])), items: new Map(), boxes: new Map(), searched: new Set(), others: new Map(), bullets: [], snapT: 0, grens: [], smokes: [], vehs: [], drops: [], z: null, me: null, M: null,
    feed: [], msgs: [], hits: [], hurts: [], sounds: [], booms: [], sparks: [], tps: [], local: null, exts: m.exts, result: null, t0: performance.now(), visPoly: null, visKey: '', pre: m.pre, peace: 0, ads: false, roll: null, rollCdUntil: 0, hitMark: 0 };
  for (const it of m.items) addItem(it);
  for (const b of m.boxes || []) addBox(b);
  show('game'); resize();
  try {
    if (!mapCache[m.mode]) { const r = await fetch('/map/' + m.mode); mapCache[m.mode] = S.hydrate(await r.json()); mapCache[m.mode].mini = renderMini(mapCache[m.mode]); }
    if (G) G.M = mapCache[m.mode];
  } catch (e) { toast('맵 로딩 실패'); }
}
function addItem(a) { G.items.set(a[0], { id: a[0], x: a[1], y: a[2], f: a[3], k: a[4], d: a[5], n: a[6], nm: a[7], c: a[8], na: a[9] }); }
function addBox(a) { G.boxes.set(a[0], { id: a[0], x: a[1], y: a[2], f: a[3], k: a[4], name: a[5] }); }
function onSnap(m) {
  const now = performance.now();
  const me = m.me, prevMe = G.me;
  if (prevMe && prevMe.w[prevMe.cw] && me.w[me.cw] && me.cw === prevMe.cw && me.w[me.cw].mag < prevMe.w[prevMe.cw].mag) G.myFireT = now;
  G.me = me; G.pre = m.pre; G.peace = m.peace; G.tm = m.tm; G.n = m.n; G.tl = m.tl; G.exo = m.exo;
  G.z = m.z; G.drops = m.dr; G.smokes = m.sm; G.grens = m.gr;
  const alive = me.st === 'a' || me.st === 'd';
  const rolling = G.roll && now < G.roll.until + 120;
  if (!G.local || !alive || me.car || !prevMe || prevMe.f !== me.f || hyp(G.local.x - me.x, G.local.y - me.y) > (rolling || me.rol ? 260 : 90)) G.local = { x: me.x, y: me.y };
  else if (!G.inputMoving && !rolling) { G.local.x += (me.x - G.local.x) * .3; G.local.y += (me.y - G.local.y) * .3; }
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
const nameOf = id => { const r = G.roster.get(id); return r ? r.name : ''; };
function handleEv(ev, now) {
  const me = G.me, vx = me.vx, vy = me.vy;
  const dist = ev.x !== undefined ? hyp(ev.x - vx, ev.y - vy) : 0;
  switch (ev.e) {
    case 'ia': addItem(ev.it); break;
    case 'ir': G.items.delete(ev.id); break;
    case 'ba': addBox(ev.b); break;
    case 'bd': G.boxes.delete(ev.id); if (G.loot && G.loot.b === ev.id) closeLoot(); break;
    case 'bx': G.searched.delete(ev.id); break;
    case 'join': G.roster.set(ev.r.id, ev.r); break;
    case 'loot': G.searched.add(ev.b); openLoot(ev); break;
    case 'lootx': closeLoot(); break;
    case 'kill': G.feed.push({ a: ev.a, b: ev.b, w: ev.w, down: ev.down, until: now + 6000, mine: ev.a === nameOf(me.id), me: ev.b === nameOf(me.id) }); if (G.feed.length > 6) G.feed.shift(); break;
    case 'msg': G.msgs.push({ t: ev.txt, until: now + 4500 }); break;
    case 'drop': break;
    case 'shot': { const so = G.others.get(ev.id); if (so) so.kickT = now; if (!so) G.sounds.push({ x: ev.x, y: ev.y, until: now + 1300, sil: ev.sil }); sfx(ev.sil ? 'sil' : ev.w === 'sniper' ? 'sniper' : 'shot', 1 - dist / 1400); break; }
    case 'hit': G.hits.push({ until: now + 450, d: ev.d, x: ev.x, y: ev.y, k: ev.k }); G.hitMark = now; break;
    case 'hurt': G.hurts.push({ x: ev.x, y: ev.y, until: now + 900 }); if (navigator.vibrate) navigator.vibrate(25); break;
    case 'boom': G.booms.push({ x: ev.x, y: ev.y, r: ev.r, t0: now, f: ev.f }); sfx('boom', 1 - dist / 1500); break;
    case 'flashb': G.booms.push({ x: ev.x, y: ev.y, r: 120, t0: now, f: ev.f, flash: 1 }); sfx('shot', .6); break;
    case 'spark': G.sparks.push({ x: ev.x, y: ev.y, until: now + 150 }); break;
    case 'tp': G.tps.push({ x: ev.x, y: ev.y, until: now + 600 }, { x: ev.x2, y: ev.y2, until: now + 600 }); break;
    case 'pick': { const n = ev.k === 'w' ? ev.d : ev.k === 'am' ? `${S.AMMO[ev.d]} +${ev.n}` : ev.k === 'att' ? S.ATT[ev.d].n : ev.k === 'ar' ? S.ARMOR[ev.d].n : ev.k === 'val' ? `${S.VALUABLES[ev.d] ? S.VALUABLES[ev.d][0] : '귀중품'} (${ev.n})` : `${S.ITEMN[ev.k]}${ev.n > 1 ? ' +' + ev.n : ''}`; G.msgs.push({ t: '+ ' + n, until: now + 1800, small: 1 }); break; }
  }
}
// ───────── 루팅 창 ─────────
const LCOL = { w: '#c9a24a', ar: '#4a8fc9', am: '#8a9aa6', att: '#7aa36a', val: '#d4b14a', med: '#c94a3b', band: '#c97a6b', gren: '#6b8f4a', flash: '#d8d8d8', smoke: '#8c959e', fuel: '#c98a3b' };
function openLoot(ev) {
  G.loot = { b: ev.b };
  const p = $('lootp');
  p.innerHTML = `<div class="lh"><div><div class="lbl" style="margin:0">${ev.k === 'body' ? 'Body' : 'Container'}</div><b>${esc(ev.nm)}</b></div><button class="g" id="lootX">닫기</button></div>
    <div class="ll">${ev.items.map((it, i) => `<div class="lit" style="--c:${it.c || LCOL[it.k] || '#3a444e'}" data-i="${i}"><div style="min-width:0"><b>${esc(it.nm)}</b><small>${esc(it.sub || '')}</small></div><span>가져가기</span></div>`).join('') || '<div class="empty" style="padding:22px 6px">비어 있습니다</div>'}</div>
    ${ev.items.length ? '<button class="y" id="lootAll" style="width:100%;margin-top:8px">모두 가져가기</button>' : ''}`;
  p.classList.add('on');
  const stop = e => e.stopPropagation();
  p.ontouchstart = stop; p.onmousedown = stop;
  $('lootX').onclick = () => { sendM({ t: 'act', a: 'closeloot' }); closeLoot(); };
  p.querySelectorAll('[data-i]').forEach(d => d.onclick = () => sendM({ t: 'act', a: 'take', b: ev.b, i: +d.dataset.i }));
  const all = $('lootAll'); if (all) all.onclick = () => sendM({ t: 'act', a: 'takeall', b: ev.b });
}
function closeLoot() { if (G) G.loot = null; $('lootp').classList.remove('on'); }

function onResult(m) {
  if (!G) return;
  G.result = m; closeLoot();
  const prevXp = m.acct ? (m.totalXp - m.xp) : (save.xp || 0), newXp = prevXp + m.xp;
  if (!m.acct) { save.games++; save.kills += m.kills; save.xp = newXp; if (m.res === 'win') save.wins++; if (m.res === 'extract') { save.ext++; save.val += m.val; } persist(); }
  updStats();
  const L0 = S.levelOf(prevXp), L1 = S.levelOf(newXp);
  const T = { win: ['WINNER', '최후의 생존자'], dead: ['ELIMINATED', '사망'], extract: ['EXTRACTED', '탈출 성공'], mia: ['MISSING IN ACTION', '시간 초과'] }[m.res];
  let body = '';
  if (m.world) {
    if (m.res === 'extract') body = `<p class="rp">전리품 <b style="color:var(--acc)">${m.val.toLocaleString()}원</b>${m.acct ? ' 획득' : ''}</p>${m.saved && m.saved.length ? `<div class="rp2">창고에 저장: ${m.saved.map(esc).join(', ')}</div>` : !m.acct ? '<div class="rp2">로그인하면 아이템이 창고에 저장됩니다</div>' : ''}`;
    else body = `<p class="rp" style="color:#e08a7f">들고 들어간 장비${m.lost ? ` (${m.lost.toLocaleString()}원 상당)` : ''}와 전리품을 모두 잃었습니다</p>`;
  }
  const xpBar = `<div class="xpbox"><div class="xprow"><b>+${m.xp.toLocaleString()} XP</b><span>${L1.l > L0.l ? `<em>LEVEL UP</em> ` : ''}Lv.${L1.l}</span></div><div class="xpbar"><i style="width:${Math.round(L1.cur / L1.need * 100)}%"></i></div><div class="xpsub">킬 ${m.kills} · 피해 ${m.dmg} · 수색 ${m.boxes}${m.res === 'win' ? ' · 우승 보너스' : m.res === 'extract' ? ' · 탈출 보너스' : ''}</div></div>`;
  $('resBox').innerHTML = `<div class="rk">${T[0]}</div><h2>${T[1]}</h2>
   <div class="rs"><div><b>${!m.world ? '#' + m.place : (m.res === 'extract' ? 'OK' : '—')}</b><small>${!m.world ? '순위' : '탈출'}</small></div><div><b>${m.kills}</b><small>킬</small></div><div><b>${Math.floor(m.time / 60)}:${String(m.time % 60).padStart(2, '0')}</b><small>생존 시간</small></div></div>
   ${body}${xpBar}
   <div class="row" style="margin-top:18px">${m.world ? '<button class="g" id="specB" style="flex:1">계속 보기</button><button class="y" id="toMenu" style="flex:2">메인으로</button>' : '<button class="g" id="specB" style="flex:1">관전</button><button class="y" id="toLobby" style="flex:1">대기실로</button><button class="r" id="toMenu" style="flex:1">나가기</button>'}</div>`;
  $('res').classList.add('on');
  $('specB').onclick = () => $('res').classList.remove('on');
  if ($('toLobby')) $('toLobby').onclick = () => { $('res').classList.remove('on'); toast('게임이 끝나면 대기실로 돌아갑니다'); };
  $('toMenu').onclick = () => { $('res').classList.remove('on'); sendM({ t: 'leave' }); };
}
function closeModals() { for (const id of ['inv', 'res', 'bm', 'shop', 'stashm', 'authm', 'pwm', 'raidm']) $(id).classList.remove('on'); }

// ───────── 입력 ─────────
const cv = $('cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const keys = {}; let mouse = { x: 0, y: 0, down: false, rdown: false, on: false };
const sticks = { move: null, aim: null };
let lastAim = 0;
const fireTouch = new Map(); // 발사 버튼 터치 (id -> {el, ox, oy})
let SAFE = { t: 0, r: 0, b: 0, l: 0 };
function readSafe() { const cs = getComputedStyle($('safe')); SAFE = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; }
function resize() { readSafe(); DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; layoutBtns(); }
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 300));
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
cv.addEventListener('mousedown', e => { if (inMini(e.clientX, e.clientY)) return openMap(); if (e.button === 2) mouse.rdown = true; else mouse.down = true; if (isTouch) { isTouch = false; layoutBtns(); } });
addEventListener('mouseup', e => { if (e.button === 2) mouse.rdown = false; else mouse.down = false; });
const KEYACT = { KeyR: 'reload', KeyQ: 'swap', Space: 'roll', ShiftLeft: 'roll', KeyF: 'interact', KeyE: 'interact', KeyG: 'gren', KeyV: 'flash', KeyT: 'smoke', KeyH: 'med', KeyB: 'band', KeyX: 'fuel', Tab: 'inv', KeyI: 'inv', KeyM: 'map', Digit1: 'slot0', Digit2: 'slot1', Escape: 'esc', KeyZ: 'ads' };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (!G) return;
  if (KEYACT[e.code]) { e.preventDefault(); if (!e.repeat) doAct(KEYACT[e.code]); }
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
function doRoll() {
  const me = G.me, now = performance.now(); if (!me || me.st !== 'a' || me.car || me.rcd > 0 || now < G.rollCdUntil) return;
  const inp = getInput(); let dx = inp.mx, dy = inp.my;
  if (hyp(dx, dy) < .2) { dx = Math.cos(lastAim + Math.PI / 2); dy = Math.sin(lastAim + Math.PI / 2); }
  const l = hyp(dx, dy); dx /= l; dy /= l;
  G.roll = { until: now + 300, dx, dy }; G.rollCdUntil = now + 3500; G.ads = false;
  sendM({ t: 'act', a: 'roll', dx: +dx.toFixed(3), dy: +dy.toFixed(3) });
}
function doAct(a) {
  if (!G) return;
  if (a === 'inv') { if ($('inv').classList.contains('on')) $('inv').classList.remove('on'); else openInv(); return; }
  if (a === 'map') { if ($('bm').classList.contains('on')) $('bm').classList.remove('on'); else openMap(); return; }
  if (a === 'esc') { closeModals(); if (G.loot) { sendM({ t: 'act', a: 'closeloot' }); closeLoot(); } return; }
  if (a === 'ads') { G.ads = !G.ads; return; }
  if (a === 'slot0' || a === 'slot1') return sendM({ t: 'act', a: 'slot', i: a === 'slot1' ? 1 : 0 });
  if (G.me && G.me.st !== 'a' && G.me.st !== 'd') { sendM({ t: 'act', a: 'spec' }); return; }
  if (a === 'roll') return doRoll();
  if ((a === 'med' || a === 'band') && G.me && G.me.act && (G.me.act[0] === 'med' || G.me.act[0] === 'band')) a = 'cancel';
  sendM({ t: 'act', a });
}
// 화면 버튼 (r/b: 오른쪽·아래 기준, l: 왼쪽 기준)
const BTN = [
  { a: 'fire', l: '발사', cls: 'fire', r: 22, b: 100 },
  { a: 'roll', l: '구르기', r: 134, b: 112 },
  { a: 'ads', l: '조준', cls: 'tog', r: 110, b: 176 },
  { a: 'reload', l: '장전', r: 51, b: 210 },
  { a: 'gren', l: '수류탄', r: 12, b: 276 },
  { a: 'flash', l: '섬광', r: 74, b: 276 },
  { a: 'smoke', l: '연막', r: 136, b: 276 },
  { a: 'swap', l: '교체', r: 198, b: 276 },
  { a: 'interact', l: '', cls: 'big', r: 198, b: 36 },
  { a: 'fire2', l: '발사', cls: 'fire sm', l0: 26, b: 206 },
];
const btnEls = {};
(function mkBtns() {
  const wrap = $('btnwrap');
  for (const b of BTN) { const d = document.createElement('div'); d.className = 'hb' + (b.cls ? ' ' + b.cls : ''); d.innerHTML = `<span>${b.l}</span><div class="cdv" style="transform:scaleY(0)"></div>`; d.dataset.a = b.a; wrap.appendChild(d); btnEls[b.a] = d; }
  document.querySelectorAll('#game .hb').forEach(d => {
    const a = d.dataset.a;
    if (a === 'fire' || a === 'fire2') {
      const down = e => { e.preventDefault(); e.stopPropagation(); const r = d.getBoundingClientRect(); for (const t of (e.changedTouches || [{ identifier: 'm', clientX: e.clientX, clientY: e.clientY }])) fireTouch.set(t.identifier, { ox: r.left + r.width / 2, oy: r.top + r.height / 2, x: t.clientX, y: t.clientY }); d.classList.add('on'); };
      const move = e => { e.preventDefault(); for (const t of e.changedTouches) { const f = fireTouch.get(t.identifier); if (f) { f.x = t.clientX; f.y = t.clientY; } } };
      const up = e => { e.preventDefault(); for (const t of (e.changedTouches || [{ identifier: 'm' }])) fireTouch.delete(t.identifier); if (![...fireTouch.keys()].length) { document.querySelectorAll('.hb.fire').forEach(x => x.classList.remove('on')); } };
      d.addEventListener('touchstart', down, { passive: false }); d.addEventListener('touchmove', move, { passive: false }); d.addEventListener('touchend', up, { passive: false }); d.addEventListener('touchcancel', up, { passive: false });
      d.addEventListener('mousedown', down); addEventListener('mouseup', e => { if (fireTouch.has('m')) up(e); });
      return;
    }
    const fire = e => { e.preventDefault(); e.stopPropagation(); doAct(a); d.style.transform = 'scale(.9)'; setTimeout(() => d.style.transform = '', 120); };
    d.addEventListener('touchstart', fire, { passive: false }); d.addEventListener('mousedown', fire);
    if (!btnEls[a]) btnEls[a] = d;
  });
})();
function layoutBtns() {
  const sc = Math.min(1, Math.max(.84, H / 560));
  for (const b of BTN) {
    const d = btnEls[b.a];
    if (b.l0 !== undefined) { d.style.left = `calc(${b.l0 * sc}px + env(safe-area-inset-left))`; d.style.right = ''; } else d.style.right = `calc(${b.r * sc}px + env(safe-area-inset-right))`;
    d.style.bottom = `calc(${b.b * sc}px + env(safe-area-inset-bottom))`; d.style.transform = ''; d.style.zoom = H < 480 ? .84 : 1;
    d.style.display = isTouch || b.a === 'interact' ? '' : 'none';
  }
  $('topbtn').style.display = isTouch ? '' : 'none';
  $('hint').textContent = isTouch ? '' : 'WASD 이동 · 클릭 사격 · 우클릭/Z 조준 · Space 구르기 · R 장전 · Q 교체 · F 수색/상호작용 · G V T 투척 · H B 치료 · Tab 가방 · M 지도';
}
setInterval(() => {
  if (!G || !G.me) return;
  const inp = getInput();
  sendM({ t: 'i', mx: +inp.mx.toFixed(2), my: +inp.my.toFixed(2), a: +inp.a.toFixed(3), f: inp.f ? 1 : 0, ad: inp.ad ? 1 : 0 });
}, 33);
function getInput() {
  let mx = 0, my = 0, f = false;
  if (keys.KeyW || keys.ArrowUp) my -= 1; if (keys.KeyS || keys.ArrowDown) my += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  const mv = stickVec(sticks.move); if (mv.m > .1) { mx = mv.x; my = mv.y; }
  const l = hyp(mx, my); if (l > 1) { mx /= l; my /= l; }
  const av = stickVec(sticks.aim);
  if (sticks.aim) { if (av.m > .2) lastAim = Math.atan2(av.y, av.x); }
  else if (!isTouch && mouse.on) { const p = G.screenMe || { x: W / 2, y: H / 2 }; lastAim = Math.atan2(mouse.y - p.y, mouse.x - p.x); f = mouse.down; }
  else if (l > .2 && !fireTouch.size) lastAim = Math.atan2(my, mx);
  for (const t of fireTouch.values()) { f = true; const dx = t.x - t.ox, dy = t.y - t.oy; if (hyp(dx, dy) > 22 && !sticks.aim) lastAim = Math.atan2(dy, dx); }
  G.inputMoving = l > .1;
  if ($('inv').classList.contains('on') || $('bm').classList.contains('on')) f = false;
  return { mx, my, a: lastAim, f, ad: G.ads || mouse.rdown };
}

// ───────── 지도 ─────────
function renderMini(M) {
  const s = 640, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'); const k = s / M.W;
  x.fillStyle = '#16303f'; x.fillRect(0, 0, s, s);
  x.fillStyle = '#b9a87a'; x.beginPath(); x.arc(M.CX * k, M.CY * k, (M.R + 40) * k, 0, 6.283); x.fill();
  x.fillStyle = '#4f6f3e'; x.beginPath(); x.arc(M.CX * k, M.CY * k, M.R * k, 0, 6.283); x.fill();
  x.fillStyle = '#3c5a2f'; for (const t of M.circles) if (t.t === 'tree') x.fillRect(t.x * k - 1, t.y * k - 1, 2, 2);
  x.fillStyle = '#285e82'; for (const l of M.lakes) { x.beginPath(); x.arc(l.x * k, l.y * k, l.r * k, 0, 6.283); x.fill(); }
  for (const d of M.dungeons || []) { x.fillStyle = 'rgba(30,30,32,.85)'; x.fillRect((d.x - d.s / 2) * k, (d.y - d.s / 2) * k, d.s * k, d.s * k); x.strokeStyle = ['', '#9e9d24', '#4a8fc9', '#8e6bbf', '#c97a3b', '#c94a3b'][d.tier]; x.lineWidth = 2; x.strokeRect((d.x - d.s / 2) * k, (d.y - d.s / 2) * k, d.s * k, d.s * k); }
  x.strokeStyle = '#8a866c'; x.lineWidth = 2.5; for (const r of M.roads) { x.beginPath(); x.moveTo(r[0] * k, r[1] * k); x.lineTo(r[2] * k, r[3] * k); x.stroke(); }
  x.fillStyle = 'rgba(200,190,170,.35)'; for (const w of M.walls) if (w.f === 0 && (M.dungeons || []).length) x.fillRect(w.x * k, w.y * k, Math.max(1, w.w * k), Math.max(1, w.h * k));
  x.fillStyle = '#7d6355'; for (const b of M.blds) x.fillRect(b.x * k, b.y * k, b.w * k, b.h * k);
  x.fillStyle = '#b388ff'; for (const t of M.tps) { x.beginPath(); x.arc(t.x * k, t.y * k, 4, 0, 6.283); x.fill(); }
  x.fillStyle = '#e2a03f'; for (const t of M.entries || []) { x.save(); x.translate(t.x * k, t.y * k); x.rotate(.785); x.fillRect(-3, -3, 6, 6); x.restore(); }
  return c;
}
function miniRect() { const s = Math.min(160, Math.max(96, Math.min(W, H) * .25)); return { x: 10 + SAFE.l, y: 10 + SAFE.t, s }; }
function openMap() {
  if (!G || !G.M) return;
  const M = G.M, c = $('bmc'), s = Math.min(innerWidth, innerHeight) * .94 * DPR; c.width = c.height = s; c.style.width = c.style.height = (s / DPR) + 'px';
  const x = c.getContext('2d'), k = s / M.W, fs = Math.round(12 * DPR);
  x.drawImage(M.mini, 0, 0, s, s);
  x.textAlign = 'center';
  const label = (t, px, py, col, size) => { x.font = `700 ${size || fs}px 'Noto Sans KR',sans-serif`; x.fillStyle = 'rgba(0,0,0,.75)'; x.fillText(t, px + 1, py + 1); x.fillStyle = col || '#fff'; x.fillText(t, px, py); };
  for (const t of M.towns) label(t.name, t.x * k, t.y * k - 8, t.kind === 'mil' ? '#e8a090' : '#e6e9ec');
  for (const d of M.dungeons || []) { label(d.name, d.x * k, (d.y - d.s / 2) * k - 6, '#fff', fs * 1.15); label('위험도 ' + '■'.repeat(d.tier) + '□'.repeat(5 - d.tier), d.x * k, (d.y - d.s / 2) * k + fs * 1.2, ['', '#cddc39', '#4fc3f7', '#b39ddb', '#ffb74d', '#ef5350'][d.tier], fs * .8); }
    drawMapOverlay(x, k, s, true);
  $('bm').classList.add('on');
  $('bm').onclick = () => $('bm').classList.remove('on');
}
function drawMapOverlay(x, k, s, big) {
  const z = G.z, D = big ? DPR : 1;
  if (z) {
    x.strokeStyle = '#fff'; x.lineWidth = 2 * D; x.setLineDash([6, 4]); x.beginPath(); x.arc(z[3] * k, z[4] * k, Math.max(1, z[5] * k), 0, 6.283); x.stroke(); x.setLineDash([]);
    x.strokeStyle = '#4fa3e0'; x.beginPath(); x.arc(z[0] * k, z[1] * k, Math.max(1, z[2] * k), 0, 6.283); x.stroke();
  }
  x.font = `700 ${Math.round(11 * D)}px 'Noto Sans KR',sans-serif`; x.textAlign = 'center';
  if (G.exts) for (const e of G.exts) { x.fillStyle = e.risky ? '#ff8a65' : '#5ee08a'; x.beginPath(); x.arc(e.x * k, e.y * k, big ? 7 * D : 4, 0, 6.283); x.fill(); if (big) { x.fillStyle = '#000a'; x.fillText(e.name, e.x * k + 1, e.y * k + 21 * D); x.fillStyle = '#d6ffe2'; x.fillText(e.name, e.x * k, e.y * k + 20 * D); } }
  for (const d of G.drops) if (!d[4]) { x.fillStyle = '#ff4d4d'; x.fillRect(d[1] * k - 4, d[2] * k - 4, 8, 8); if (big) { x.fillStyle = '#fff'; x.fillText('보급' + (d[3] > 0 ? ` ${d[3]}초` : ''), d[1] * k, d[2] * k - 9); } }
  for (const o of G.others.values()) if (o.fl & 16) { x.fillStyle = '#4fc3f7'; x.beginPath(); x.arc(o.x * k, o.y * k, big ? 5 * D : 3, 0, 6.283); x.fill(); }
  const me = G.me; if (me) { const px = (G.local && me.st === 'a' ? G.local.x : me.vx) * k, py = (G.local && me.st === 'a' ? G.local.y : me.vy) * k; x.fillStyle = '#ffd54f'; x.beginPath(); x.arc(px, py, big ? 6 * D : 3.5, 0, 6.283); x.fill(); x.strokeStyle = '#ffd54f'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(lastAim) * 12, py + Math.sin(lastAim) * 12); x.stroke(); }
}

// ───────── 가방 ─────────
function openInv() {
  if (!G || !G.me) return; const me = G.me;
  const wcard = (w, i) => {
    if (!w) return `<div class="wcard" style="opacity:.5">${i + 1}번 슬롯 · 비어 있음</div>`;
    return `<div class="wcard" style="border-color:${me.cw === i ? 'var(--acc)' : 'var(--line)'}"><div class="row" style="justify-content:space-between"><b style="color:${w.c}">${i + 1}. ${esc(w.n)}</b><span>${me.cw === i ? '<span class="tag acc">사용 중</span>' : `<button data-sl="${i}" style="padding:4px 10px">들기</button>`} <button class="r" data-dw="${i}" style="padding:4px 10px">버리기</button>${G.loot ? ` <button class="g" data-st="${i}" style="padding:4px 10px">상자에 넣기</button>` : ''}</span></div>
      <div style="font-size:12px;color:var(--tx2);margin:6px 0">피해 ${w.dmg} · ${Math.round(60000 / w.iv)}RPM · 사거리 ${w.rng} · 탄속 ${w.spd} · 반동 ${w.rc} · 이동 ${Math.round(w.mv * 100)}% · ${w.auto ? '연발' : '단발'} · ${S.AMMO[w.am]} ${w.mag}/${w.max}</div>
      <div>${S.SLOTS.map(sl => { const a = w.att[sl]; return a ? `<span class="att on" data-det="${i}:${sl}">${S.ATT[a].n} ✕</span>` : `<span class="att">${{ muzzle: '총구', barrel: '총열', mag: '탄창', stock: '개머리', scope: '조준경' }[sl]} -</span>`; }).join('')}</div></div>`;
  };
  $('invBox').innerHTML = `<div class="row" style="justify-content:space-between"><h3>가방 <small>무기·부착물·소모품</small></h3><button class="g" id="invX">닫기</button></div>
   ${me.w.map(wcard).join('')}
   <div class="wcard"><b>무기 조합</b><div style="font-size:12px;color:var(--tx2);margin:4px 0 8px">두 무기를 합쳐 개조총을 만듭니다. 피해·사거리는 오르고 반동·퍼짐·재장전이 나빠집니다. 부착물은 가방으로 옮겨집니다.</div><button class="y" id="craftB" ${me.w[0] && me.w[1] ? '' : 'disabled'}>조합하기</button></div>
   <div class="wcard"><b>부착물 ${me.bag.length}/6</b><div style="font-size:12px;color:var(--tx3);margin-bottom:4px">누르면 들고 있는 무기에 장착</div>${me.bag.map((a, i) => `<div style="margin:3px 0"><span class="att on" data-eq="${i}">${S.ATT[a].n}</span><small style="color:var(--tx3)"> ${S.ATT[a].d}</small> <button class="g" data-da="${i}" style="padding:3px 8px">버리기</button></div>`).join('') || '<div style="color:var(--tx3)">없음</div>'}</div>
   <div class="wcard" style="font-size:13px;line-height:1.8;color:var(--tx2)">${me.ar ? `${me.ar}레벨 방어구 · 내구 ${me.ad}` : '방어구 없음'}<br>탄약: ${Object.entries(me.am).map(([k, v]) => `${S.AMMO[k]} ${v}`).join(' · ')}<br>소모품: ${Object.entries(me.it).map(([k, v]) => `${S.ITEMN[k]} ${v}`).join(' · ')}${G.world ? `<br>전리품 가치: <b style="color:var(--acc)">${me.val}</b>` : ''}</div>`;
  $('inv').classList.add('on');
  $('invX').onclick = () => $('inv').classList.remove('on');
  const q = (s, f) => $('invBox').querySelectorAll(s).forEach(el => el.onclick = () => { f(el); setTimeout(openInv, 150); });
  q('[data-sl]', el => sendM({ t: 'act', a: 'slot', i: +el.dataset.sl }));
  q('[data-dw]', el => sendM({ t: 'act', a: 'dropw', i: +el.dataset.dw }));
  q('[data-st]', el => sendM({ t: 'act', a: 'stash', k: 'w', i: +el.dataset.st }));
  q('[data-det]', el => { const [i, s] = el.dataset.det.split(':'); sendM({ t: 'act', a: 'detach', i: +i, s }); });
  q('[data-eq]', el => sendM({ t: 'act', a: 'equip', b: +el.dataset.eq, i: me.cw }));
  q('[data-da]', el => sendM({ t: 'act', a: 'dropatt', b: +el.dataset.da }));
  const cb = $('craftB'); if (cb) cb.onclick = () => { sendM({ t: 'act', a: 'craft' }); setTimeout(openInv, 200); };
}

// ───────── 시야 다각형 ─────────
function visPolygon(M, x, y, f, a, far) {
  const N = isTouch ? 120 : 170, pts = [];
  for (let i = 0; i < N; i++) {
    const an = i / N * 6.2832; let R = S.VIS;
    if (far) { let d = an - a; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) < S.SCOPE_CONE) R = far; }
    const ex = x + Math.cos(an) * R, ey = y + Math.sin(an) * R;
    const t = S.ray(M, x, y, ex, ey, f);
    pts.push(x + (ex - x) * t, y + (ey - y) * t);
  }
  return pts;
}

// ───────── 렌더 ─────────
const FONT = "'Noto Sans KR',system-ui,sans-serif";
let lastFrame = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now;
  if (!G) { drawBg(now); if ($('menu').classList.contains('on')) drawPreview(now); return; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!G.M || !G.me) { ctx.fillStyle = '#0a0c0e'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#8b959e'; ctx.font = `500 16px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('맵 불러오는 중', W / 2, H / 2); return; }
  const M = G.M, me = G.me;
  const alive = me.st === 'a' || me.st === 'd';
  const inp = getInput();
  if (G.roll && now < G.roll.until && alive && !me.car) { const p = { x: G.local.x + G.roll.dx * 760 * dt, y: G.local.y + G.roll.dy * 760 * dt }; S.resolve(M, p, S.PR, me.f); G.local = p; }
  else if (alive && !me.car && G.pre === 0 && G.local && me.sp > 0) { const sp = me.sp * (inp.ad && !me.aim ? .6 : 1); const p = { x: G.local.x + inp.mx * sp * dt, y: G.local.y + inp.my * sp * dt }; S.resolve(M, p, S.PR, me.f); G.local = p; }
  const vx = alive && !me.car ? G.local.x : me.vx, vy = alive && !me.car ? G.local.y : me.vy, vf = alive ? me.f : me.vf;
  const k = 1 - Math.exp(-dt * 14);
  G.myKick = G.myFireT && now - G.myFireT < 70 ? 2.5 : 0;
  for (const o of G.others.values()) { o.kick = o.kickT && now - o.kickT < 70 ? 2.5 : 0; o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; let da = o.ta - o.a; da = Math.atan2(Math.sin(da), Math.cos(da)); o.a += da * k; }
  const cw = me.w[me.cw], ads = alive && inp.ad && cw && !me.car, scoped = ads && cw.sc;
  const far = ads ? (scoped ? S.VIS_SCOPE : S.VIS_ADS) : 0;
  // 카메라
  const base = Math.min(W, H) / (isTouch ? 640 : 760);
  G.camOff = G.camOff || { x: 0, y: 0 }; G.zoom = G.zoom || 1;
  const offT = ads ? (scoped ? 520 : 230) : 0, zT = ads ? (scoped ? .6 : .82) : 1;
  G.camOff.x += (Math.cos(lastAim) * offT - G.camOff.x) * k * .6; G.camOff.y += (Math.sin(lastAim) * offT - G.camOff.y) * k * .6; G.zoom += (zT - G.zoom) * k * .6;
  const camx = vx + G.camOff.x, camy = vy + G.camOff.y, sc = base * G.zoom;
  G.screenMe = { x: W / 2 + (vx - camx) * sc, y: H / 2 + (vy - camy) * sc };
  const view = { x0: camx - W / 2 / sc - 60, y0: camy - H / 2 / sc - 60, x1: camx + W / 2 / sc + 60, y1: camy + H / 2 / sc + 60 };
  const inV = (x, y, m) => x > view.x0 - (m || 0) && x < view.x1 + (m || 0) && y > view.y0 - (m || 0) && y < view.y1 + (m || 0);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-camx, -camy);
  // 바다/섬
  ctx.fillStyle = '#17465f'; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ctx.fillStyle = '#c9b580'; ctx.beginPath(); ctx.arc(M.CX, M.CY, M.R + 45, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#5f8a46'; ctx.beginPath(); ctx.arc(M.CX, M.CY, M.R, 0, 6.283); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.045)'; const gs = 120; for (let gx = Math.floor(view.x0 / gs) * gs; gx < view.x1; gx += gs) for (let gy = Math.floor(view.y0 / gs) * gs; gy < view.y1; gy += gs) if (((gx + gy) / gs) % 2 === 0) ctx.fillRect(gx, gy, gs, gs);
  for (const d of M.dungeons || []) if (inV(d.x, d.y, d.s)) { ctx.fillStyle = ['', '#77756a', '#6f7478', '#6a6670', '#73685c', '#5f5f66'][d.tier]; ctx.fillRect(d.x - d.s / 2, d.y - d.s / 2, d.s, d.s); ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; for (let gx = d.x - d.s / 2; gx < d.x + d.s / 2; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, d.y - d.s / 2); ctx.lineTo(gx, d.y + d.s / 2); ctx.stroke(); } for (let gy = d.y - d.s / 2; gy < d.y + d.s / 2; gy += 80) { ctx.beginPath(); ctx.moveTo(d.x - d.s / 2, gy); ctx.lineTo(d.x + d.s / 2, gy); ctx.stroke(); } }
  for (const l of M.lakes) if (inV(l.x, l.y, l.r)) { ctx.fillStyle = '#c9b580'; ctx.beginPath(); ctx.arc(l.x, l.y, l.r + 14, 0, 6.283); ctx.fill(); ctx.fillStyle = '#2a6f9c'; ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, 6.283); ctx.fill(); }
  ctx.strokeStyle = '#87826a'; ctx.lineWidth = 46; ctx.lineCap = 'round'; ctx.beginPath(); for (const r of M.roads) { ctx.moveTo(r[0], r[1]); ctx.lineTo(r[2], r[3]); } ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.setLineDash([24, 24]); ctx.beginPath(); for (const r of M.roads) { ctx.moveTo(r[0], r[1]); ctx.lineTo(r[2], r[3]); } ctx.stroke(); ctx.setLineDash([]);
  // 탈출구
  if (G.exts) for (const e of G.exts) if (inV(e.x, e.y, 140)) { const p = .5 + Math.sin(now / 400) * .5; ctx.fillStyle = e.risky ? 'rgba(255,138,101,.18)' : 'rgba(94,224,138,.18)'; ctx.strokeStyle = e.risky ? '#ff8a65' : '#5ee08a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.globalAlpha = .4 * p; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 14 * p, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = `700 17px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('EXTRACT', e.x, e.y - 4); ctx.font = `500 13px ${FONT}`; ctx.fillText(e.name, e.x, e.y + 16); }
  // 입장 포탈 (월드)
  for (const p of M.entries || []) if (vf === 0 && inV(p.x, p.y, 60)) { ctx.strokeStyle = 'rgba(226,160,63,.6)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.arc(p.x, p.y, 46, now / 900, now / 900 + 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(226,160,63,.8)'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('입장 지점', p.x, p.y - 54); }
  // 순간이동 포탈
  for (const p of M.portals) if (p.kind === 'tp' && vf === 0 && inV(p.x, p.y, 50)) { const t = now / 400; ctx.strokeStyle = '#b388ff'; ctx.lineWidth = 5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r - i * 9, t + i, t + i + 4); ctx.stroke(); } ctx.fillStyle = 'rgba(179,136,255,.22)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); ctx.fillStyle = '#e6dcff'; ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(p.to ? '→ ' + p.to : '포탈', p.x, p.y - p.r - 8); }
  // 건물 바닥
  const myB = S.inBld(M, vx, vy);
  for (const b of M.blds) { if (!inV(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue; if (vf > 0 && b !== myB) continue; ctx.fillStyle = ['#b3a389', '#a38c70', '#93806b'][vf] || '#b3a389'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; for (let yy = b.y + 20; yy < b.y + b.h; yy += 20) { ctx.beginPath(); ctx.moveTo(b.x, yy); ctx.lineTo(b.x + b.w, yy); ctx.stroke(); } }
  if (vf > 0) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); if (myB) { ctx.fillStyle = ['#b3a389', '#a38c70', '#93806b'][vf]; ctx.fillRect(myB.x, myB.y, myB.w, myB.h); } }
  for (const p of M.portals) if (p.kind !== 'tp' && p.f === vf && inV(p.x, p.y)) { ctx.fillStyle = p.kind === 'up' ? '#4f5aa8' : '#2a8f86'; ctx.fillRect(p.x - 18, p.y - 18, 36, 36); ctx.fillStyle = '#fff'; ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(p.kind === 'up' ? `▲ ${p.tf + 1}F` : `▼ ${p.tf + 1}F`, p.x, p.y + 4); }
  // 상자 / 아이템
  ctx.textAlign = 'center';
  for (const b of G.boxes.values()) if (b.f === vf && inV(b.x, b.y)) drawBox(b, now);
  for (const it of G.items.values()) if (it.f === vf && inV(it.x, it.y)) drawItem(it, now);
  // 벽
  const C = S.CELL, gw = M.gw;
  const cx0 = Math.max(0, Math.floor(view.x0 / C)), cx1 = Math.min(gw - 1, Math.floor(view.x1 / C)), cy0 = Math.max(0, Math.floor(view.y0 / C)), cy1 = Math.min(gw - 1, Math.floor(view.y1 / C));
  const drawnW = new Set(), trees = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const cell = M.cells[cy * gw + cx]; if (!cell) continue;
    for (const w of cell.w) { if (w.f !== vf || drawnW.has(w)) continue; drawnW.add(w); ctx.fillStyle = w.win ? 'rgba(160,210,240,.7)' : '#3d322a'; ctx.fillRect(w.x, w.y, w.w, w.h); }
    if (vf === 0) for (const o of cell.c) { if (drawnW.has(o)) continue; drawnW.add(o); if (o.t === 'tree') trees.push(o); else if (o.t === 'rock') { ctx.fillStyle = '#6f7275'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.283); ctx.fill(); ctx.fillStyle = '#8b8e90'; ctx.beginPath(); ctx.arc(o.x - o.r * .25, o.y - o.r * .25, o.r * .6, 0, 6.283); ctx.fill(); } else { ctx.fillStyle = '#7a5f38'; ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2); ctx.strokeStyle = '#4e3c22'; ctx.lineWidth = 3; ctx.strokeRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2); ctx.beginPath(); ctx.moveTo(o.x - o.r, o.y - o.r); ctx.lineTo(o.x + o.r, o.y + o.r); ctx.stroke(); } }
  }
  if (vf === 0) for (const b of M.blds) { if (b === myB || !inV(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue; ctx.fillStyle = ['#7f5442', '#664a3e', '#543d34'][b.nf - 1]; ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3; ctx.beginPath(); if (b.w > b.h) { ctx.moveTo(b.x, b.y + b.h / 2); ctx.lineTo(b.x + b.w, b.y + b.h / 2); } else { ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w / 2, b.y + b.h); } ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `700 13px ${FONT}`; ctx.fillText(b.nf + 'F', b.x + b.w / 2, b.y + b.h / 2 + 5); }
  // 보급 (떨어지는 중)
  for (const d of G.drops) { if (vf !== 0 || d[3] <= 0 || !inV(d[1], d[2], 200)) continue; const s = 1 + d[3] / 10; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(d[1], d[2], 20, 0, 6.283); ctx.fill(); ctx.fillStyle = '#d9483b'; ctx.beginPath(); ctx.arc(d[1], d[2] - d[3] * 8, 28 * s, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#795548'; ctx.fillRect(d[1] - 12, d[2] - d[3] * 8, 24, 24); }
  // 차량
  for (const v of G.vehs) {
    if (vf !== 0) break;
    ctx.save(); ctx.translate(v[1], v[2]); ctx.rotate(v[3]);
    ctx.fillStyle = v[8] ? '#2a2a2a' : '#9c2b23'; roundRect(-34, -19, 68, 38, 8); ctx.fillStyle = v[8] ? '#1c1c1c' : '#86b8dc'; ctx.fillRect(4, -14, 16, 28); ctx.fillStyle = '#111'; for (const [a, b] of [[-22, -21], [16, -21], [-22, 17], [16, 17]]) ctx.fillRect(a, b, 12, 5);
    ctx.restore();
    if (!v[8]) { ctx.fillStyle = '#000a'; ctx.fillRect(v[1] - 26, v[2] - 34, 52, 5); ctx.fillStyle = '#e2a03f'; ctx.fillRect(v[1] - 26, v[2] - 34, 52 * v[4] / 100, 5); if (v[6]) { ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.fillText(v[6] + '명 탑승', v[1], v[2] + 40); } }
  }
  for (const g of G.grens) { ctx.fillStyle = g[3] === 'gren' ? '#33691e' : g[3] === 'flash' ? '#eee' : '#90a4ae'; ctx.beginPath(); ctx.arc(g[1], g[2], 6, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); }
  const t = now / 1000;
  for (const o of G.others.values()) { if (o.f !== vf) continue; const r = G.roster.get(o.id); if (!r) continue; drawPlayer(o.x, o.y, o.a, r, o, t, o.fl & 16); }
  const rollingMe = (G.roll && now < G.roll.until) || me.rol;
  if (alive && !me.car) { const r = G.roster.get(me.id); drawPlayer(vx, vy, inp.a, r, { st: me.st, fl: (rollingMe ? 1 : 0) | (G.inputMoving || rollingMe ? 4 : 0) | (me.rl >= 0 ? 2 : 0), w: cw ? cw.id : '', hp: me.hp, ar: me.ar, am: cw ? (cw.sil ? 1 : 0) | (cw.sc ? 2 : 0) : 0, kick: G.myKick || 0, rollT: G.roll ? (G.roll.until - now) / 300 : 0 }, t, false, true); }
  // 조준선
  if (alive && cw && me.st === 'a' && !me.car) {
    const adm = ads ? (cw.sc ? .3 : .55) : 1, spread = (cw.sp + me.rec) * adm * Math.PI / 180, L = Math.min(cw.rng * (ads ? 1.15 : 1), ads ? far : 440);
    ctx.fillStyle = me.rec > 6 ? 'rgba(255,90,80,.14)' : ads ? 'rgba(226,160,63,.12)' : 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.moveTo(vx, vy); ctx.arc(vx, vy, L, inp.a - spread, inp.a + spread); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = me.rec > 6 ? 'rgba(255,100,90,.6)' : ads ? 'rgba(226,160,63,.75)' : 'rgba(255,255,255,.3)'; ctx.lineWidth = ads ? 2 : 1.5; ctx.beginPath(); ctx.moveTo(vx + Math.cos(inp.a) * 30, vy + Math.sin(inp.a) * 30); ctx.lineTo(vx + Math.cos(inp.a) * L, vy + Math.sin(inp.a) * L); ctx.stroke();
    if (ads) { const ex = vx + Math.cos(inp.a) * L * .7, ey = vy + Math.sin(inp.a) * L * .7, rr = 10 + spread * L * .7; ctx.beginPath(); ctx.arc(ex, ey, rr, 0, 6.283); ctx.stroke(); }
  }
  // 총알 (느린 탄 - 궤적 보이게)
  const bt = (now - G.snapT) / 1000;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,190,90,.28)'; ctx.lineWidth = 7; ctx.beginPath();
  for (const b of G.bullets) { const x = b[1] + b[3] * bt, y = b[2] + b[4] * bt; ctx.moveTo(x - b[3] * .05, y - b[4] * .05); ctx.lineTo(x, y); } ctx.stroke();
  ctx.strokeStyle = '#fff2c2'; ctx.lineWidth = 2.5; ctx.beginPath();
  for (const b of G.bullets) { const x = b[1] + b[3] * bt, y = b[2] + b[4] * bt; ctx.moveTo(x - b[3] * .03, y - b[4] * .03); ctx.lineTo(x, y); } ctx.stroke();
  if (vf === 0) { for (const o of trees) { const near = hyp(o.x - vx, o.y - vy) < o.r * 2.1 + 12; ctx.globalAlpha = near ? .35 : 1; ctx.fillStyle = '#4e3a2c'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * .35, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(40,96,36,.9)'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 2.1, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(70,130,56,.5)'; ctx.beginPath(); ctx.arc(o.x - o.r * .5, o.y - o.r * .5, o.r * 1.2, 0, 6.283); ctx.fill(); } ctx.globalAlpha = 1; }
  for (const s of G.smokes) { for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + now / 3000; ctx.fillStyle = 'rgba(200,205,210,.55)'; ctx.beginPath(); ctx.arc(s[1] + Math.cos(a) * s[3] * .45, s[2] + Math.sin(a) * s[3] * .45, s[3] * .62, 0, 6.283); ctx.fill(); } }
  G.booms = G.booms.filter(b => now - b.t0 < 600); for (const b of G.booms) { const p = (now - b.t0) / 600; ctx.fillStyle = b.flash ? `rgba(255,255,255,${1 - p})` : `rgba(255,${150 - p * 100},0,${.8 - p * .8})`; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (.4 + p * .8), 0, 6.283); ctx.fill(); }
  G.sparks = G.sparks.filter(s => s.until > now); ctx.fillStyle = '#fff59d'; for (const s of G.sparks) { ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 6.283); ctx.fill(); }
  G.tps = G.tps.filter(s => s.until > now); for (const s of G.tps) { ctx.strokeStyle = `rgba(179,136,255,${(s.until - now) / 600})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(s.x, s.y, 60 - (s.until - now) / 15, 0, 6.283); ctx.stroke(); }
  G.hits = G.hits.filter(h => h.until > now); for (const h of G.hits) { const p = 1 - (h.until - now) / 450; ctx.globalAlpha = 1 - p * .6; ctx.fillStyle = h.k ? '#ff6b5a' : '#fff'; ctx.font = `800 ${h.k ? 20 : 16}px ${FONT}`; ctx.fillText(h.d, h.x + 14, h.y - 22 - p * 22); ctx.globalAlpha = 1; }
  // 시야 안개
  const key = Math.round(vx) + ',' + Math.round(vy) + ',' + vf + ',' + (far ? far + ':' + Math.round(lastAim * 20) : 0);
  if (key !== G.visKey) { G.visPoly = visPolygon(M, vx, vy, vf, lastAim, far); G.visKey = key; }
  ctx.fillStyle = 'rgba(4,7,12,.64)'; ctx.beginPath(); ctx.rect(view.x0 - 100, view.y0 - 100, view.x1 - view.x0 + 200, view.y1 - view.y0 + 200);
  const vp = G.visPoly; ctx.moveTo(vp[0], vp[1]); for (let i = vp.length - 2; i >= 2; i -= 2) ctx.lineTo(vp[i], vp[i + 1]); ctx.closePath(); ctx.fill('evenodd');
  if (G.z) {
    const z = G.z; ctx.fillStyle = 'rgba(40,80,200,.26)'; ctx.beginPath(); ctx.rect(view.x0 - 100, view.y0 - 100, view.x1 - view.x0 + 200, view.y1 - view.y0 + 200); ctx.moveTo(z[0] + Math.max(1, z[2]), z[1]); ctx.arc(z[0], z[1], Math.max(1, z[2]), 0, 6.283); ctx.fill('evenodd');
    ctx.strokeStyle = '#4fa3e0'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(z[0], z[1], Math.max(1, z[2]), 0, 6.283); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.setLineDash([30, 20]); ctx.beginPath(); ctx.arc(z[3], z[4], Math.max(1, z[5]), 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
  if (scoped) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .32, W / 2, H / 2, Math.max(W, H) * .7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  drawHUD(now, vx, vy, sc, camx, camy);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); }
function drawBox(b, now) {
  const x = b.x, y = b.y, done = G.searched.has(b.id);
  ctx.save(); ctx.translate(x, y); if (done) ctx.globalAlpha = .55;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(2, 4, 22, 14, 0, 0, 6.283); ctx.fill();
  switch (b.k) {
    case 'crate': ctx.fillStyle = '#8a6a3e'; ctx.fillRect(-13, -13, 26, 26); ctx.strokeStyle = '#5a4426'; ctx.lineWidth = 2.5; ctx.strokeRect(-13, -13, 26, 26); ctx.beginPath(); ctx.moveTo(-13, -4); ctx.lineTo(13, -4); ctx.moveTo(-13, 5); ctx.lineTo(13, 5); ctx.stroke(); break;
    case 'cabinet': ctx.fillStyle = '#6d6258'; ctx.fillRect(-16, -11, 32, 22); ctx.strokeStyle = '#3e3630'; ctx.lineWidth = 2; ctx.strokeRect(-16, -11, 32, 22); ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke(); ctx.fillStyle = '#c9b48a'; ctx.fillRect(-3, -7, 6, 2); ctx.fillRect(-3, 4, 6, 2); break;
    case 'bag': ctx.fillStyle = '#3f5232'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 11, .2, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#26321e'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#26321e'; ctx.fillRect(-2, -11, 4, 22); break;
    case 'weapon': ctx.fillStyle = '#3c4a34'; ctx.fillRect(-22, -9, 44, 18); ctx.strokeStyle = '#222b1e'; ctx.lineWidth = 2; ctx.strokeRect(-22, -9, 44, 18); ctx.fillStyle = '#e2a03f'; ctx.fillRect(-22, -2, 44, 4); break;
    case 'med': ctx.fillStyle = '#e8e8e8'; ctx.fillRect(-13, -11, 26, 22); ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.strokeRect(-13, -11, 26, 22); ctx.fillStyle = '#d23b2e'; ctx.fillRect(-2.5, -7, 5, 14); ctx.fillRect(-7, -2.5, 14, 5); break;
    case 'safe': ctx.fillStyle = '#3a3f45'; ctx.fillRect(-15, -15, 30, 30); ctx.strokeStyle = '#1e2226'; ctx.lineWidth = 2.5; ctx.strokeRect(-15, -15, 30, 30); ctx.strokeStyle = '#e2a03f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.283); ctx.stroke(); break;
    case 'supply': ctx.fillStyle = '#1d4f8c'; ctx.fillRect(-24, -24, 48, 48); ctx.strokeStyle = '#e2c13f'; ctx.lineWidth = 3; ctx.strokeRect(-24, -24, 48, 48); ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(24, 24); ctx.moveTo(24, -24); ctx.lineTo(-24, 24); ctx.stroke(); if (!done) { ctx.fillStyle = 'rgba(255,60,50,.3)'; for (let i = 0; i < 5; i++) { const tt = (now / 1000 + i * .4) % 2; ctx.beginPath(); ctx.arc(Math.sin(i * 3 + now / 700) * 18, -tt * 90, 12 + tt * 16, 0, 6.283); ctx.fill(); } } break;
    case 'body': ctx.fillStyle = '#4a2a26'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 12, .4, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#c94a3b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke(); break;
  }
  if (done) { ctx.globalAlpha = .9; ctx.fillStyle = '#8b959e'; ctx.font = `700 10px ${FONT}`; ctx.fillText('수색함', 0, -18); }
  else if (b.k === 'body' && b.name) { ctx.fillStyle = '#e6c2bd'; ctx.font = `700 10px ${FONT}`; ctx.fillText(b.name, 0, -18); }
  ctx.restore();
}
const IABBR = { am: '탄', ar: '방', med: '구', band: '붕', gren: '수', flash: '섬', smoke: '연', fuel: '유', att: '부', val: '귀' };
function drawItem(it, now) {
  const x = it.x, y = it.y;
  if (it.k === 'w') { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x, y, 17, 0, 6.283); ctx.fill(); ctx.fillStyle = it.c || '#ffd54f'; ctx.fillRect(x - 15, y - 3, 30, 7); ctx.fillStyle = '#222'; ctx.fillRect(x - 15, y + 3, 7, 6); ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.fillText(it.nm + (it.na ? ' +' + it.na : ''), x, y - 12); return; }
  ctx.fillStyle = LCOL[it.k] || '#555'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.283); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `800 11px ${FONT}`; ctx.fillText(IABBR[it.k] || '?', x, y + 4);
  const lb = it.k === 'ar' ? 'Lv' + it.d : it.k === 'am' ? S.AMMO[it.d] : it.k === 'att' ? S.ATT[it.d].n : '';
  if (lb) { ctx.font = `600 10px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(lb, x, y - 15); }
}
function drawPlayer(x, y, a, r, o, t, mate, isMe) {
  const down = o.st === 'd', rolling = o.fl & 1;
  if (down) { ctx.save(); ctx.globalAlpha = .7; }
  if (rolling) { ctx.save(); ctx.globalAlpha = .45; ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(x, y, 22, 0, 6.283); ctx.fill(); ctx.restore(); }
  const ra = rolling ? a + (isMe ? (1 - Math.max(0, o.rollT || 0)) : (t * 3 % 1)) * 6.283 : a;
  drawChar(ctx, x, y, ra, r.skin, t + r.id, !!(o.fl & 4), rolling ? 1 : 0, down ? '' : o.w, undefined, { am: o.am, rl: !!(o.fl & 2), kick: o.kick || 0 });
  if (down) { ctx.restore(); ctx.fillStyle = '#ff6b5a'; ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('기절', x, y + 32); }
  if (o.fl & 8) { ctx.strokeStyle = '#5ee08a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 24, 0, 6.283); ctx.stroke(); }
  if (o.ar) { ctx.strokeStyle = ['', '#bdbdbd', '#42a5f5', '#ab47bc'][o.ar]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 19, 0, 6.283); ctx.stroke(); }
  if (!isMe) {
    const guard = r.g, boss = guard && /대장/.test(r.name);
    ctx.textAlign = 'center'; ctx.font = `700 ${boss ? 13 : 11}px ${FONT}`; ctx.fillStyle = mate ? '#7cc7f0' : guard ? (boss ? '#ff6b5a' : '#e8a090') : '#fff'; ctx.fillText(r.name, x, y - 30);
    ctx.fillStyle = '#000a'; ctx.fillRect(x - 18, y - 26, 36, 4); ctx.fillStyle = down ? '#ff6b5a' : mate ? '#4fc3f7' : '#e0533f'; ctx.fillRect(x - 18, y - 26, 36 * Math.max(0, Math.min(100, o.hp)) / 100, 4);
  }
}
function pill(x, y, w, h, fill, stroke) { ctx.fillStyle = fill; roundRect(x, y, w, h, Math.min(8, h / 2)); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
function drawHUD(now, vx, vy, sc, camx, camy) {
  const me = G.me, alive = me.st === 'a' || me.st === 'd', cw = me.w[me.cw];
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  G.hurts = G.hurts.filter(h => h.until > now);
  for (const h of G.hurts) { const a = Math.atan2(h.y - vy, h.x - vx), p = (h.until - now) / 900; ctx.strokeStyle = `rgba(255,60,40,${p})`; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(G.screenMe.x, G.screenMe.y, 72, a - .32, a + .32); ctx.stroke(); }
  G.sounds = G.sounds.filter(s => s.until > now);
  for (const s of G.sounds) { const a = Math.atan2(s.y - vy, s.x - vx), p = (s.until - now) / 1300; const rx = G.screenMe.x + Math.cos(a) * 100, ry = G.screenMe.y + Math.sin(a) * 100; ctx.save(); ctx.translate(rx, ry); ctx.rotate(a); ctx.fillStyle = s.sil ? `rgba(180,190,200,${p * .7})` : `rgba(255,200,80,${p})`; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.fill(); ctx.restore(); }
  // 히트마커
  if (now - G.hitMark < 160) { const m = G.screenMe, ax = m.x + Math.cos(lastAim) * 60, ay = m.y + Math.sin(lastAim) * 60; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(ax + dx * 4, ay + dy * 4); ctx.lineTo(ax + dx * 10, ay + dy * 10); } ctx.stroke(); }
  for (const d of G.drops) if (!d[4]) { const dx = d[1] - vx, dy = d[2] - vy, dist = hyp(dx, dy); if (dist < 320) continue; const a = Math.atan2(dy, dx), R = Math.min(W, H) * .42; const x = W / 2 + Math.cos(a) * R, y = H / 2 + Math.sin(a) * R; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.fill(); ctx.restore(); ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(`보급 ${Math.round(dist / 10)}m${d[3] > 0 ? ' · ' + d[3] + 's' : ''}`, x, y + 22); }
  // 미니맵
  const M = G.M, mr = miniRect(), span = Math.min(M.W * .22, 3000), k = mr.s / span;
  ctx.save(); pill(mr.x - 2, mr.y - 2, mr.s + 4, mr.s + 4, 'rgba(10,12,14,.75)', 'rgba(255,255,255,.15)'); ctx.beginPath(); ctx.rect(mr.x, mr.y, mr.s, mr.s); ctx.clip();
  const mk = M.mini.width / M.W;
  ctx.drawImage(M.mini, (vx - span / 2) * mk, (vy - span / 2) * mk, span * mk, span * mk, mr.x, mr.y, mr.s, mr.s);
  ctx.translate(mr.x - (vx - span / 2) * k, mr.y - (vy - span / 2) * k);
  drawMapOverlay(ctx, k, mr.s, false);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText('MAP', mr.x + 5, mr.y + mr.s - 5);
  // 상단 정보 바
  const chips = [];
  chips.push([G.world ? '레이더' : '생존', G.n]); chips.push(['킬', me.kills]);
  if (G.z) chips.push([G.z[7] === 'wait' ? '축소까지' : G.z[7] === 'shrink' ? '축소 중' : '자기장', G.z[8] + 's']);
  if (G.tl != null) chips.push(['남은 시간', `${Math.floor(G.tl / 60)}:${String(G.tl % 60).padStart(2, '0')}`]);
  if (me.f > 0) chips.push(['층', (me.f + 1) + 'F']);
  if (G.world) chips.push(['전리품', me.val]);
  const ty = 10 + SAFE.t, cf = isTouch && W < 900 ? 10 : 11, vf2 = isTouch && W < 900 ? 13 : 14; let cx = W - 10 - SAFE.r;
  for (let i = chips.length - 1; i >= 0; i--) { const [l, v] = chips[i]; ctx.font = `500 ${cf}px ${FONT}`; const lw = ctx.measureText(l).width; ctx.font = `800 ${vf2}px ${FONT}`; const vw = ctx.measureText(String(v)).width; const w = lw + vw + 20; cx -= w; pill(cx, ty, w, 26, 'rgba(10,12,14,.72)', 'rgba(255,255,255,.1)'); ctx.textAlign = 'left'; ctx.font = `500 ${cf}px ${FONT}`; ctx.fillStyle = '#8b959e'; ctx.fillText(l, cx + 8, ty + 17); ctx.font = `800 ${vf2}px ${FONT}`; ctx.fillStyle = l === '남은 시간' && G.tl < 120 ? '#ff6b5a' : '#e6e9ec'; ctx.fillText(String(v), cx + 12 + lw, ty + 18); cx -= 5; }
  // 킬피드
  G.feed = G.feed.filter(f => f.until > now); ctx.textAlign = 'right';
  const fy0 = (isTouch ? 104 : 54) + SAFE.t;
  G.feed.forEach((f, i) => { const y = fy0 + i * 20; ctx.font = `600 12px ${FONT}`; const txt = `${f.a}  ${f.down ? '기절' : '▸'}  ${f.b}`; const w = ctx.measureText(txt).width + 16; pill(W - 10 - SAFE.r - w, y - 13, w, 18, f.mine ? 'rgba(226,160,63,.25)' : f.me ? 'rgba(200,60,50,.3)' : 'rgba(10,12,14,.55)'); ctx.fillStyle = f.mine ? '#f0c27a' : '#e6e9ec'; ctx.fillText(txt, W - 18 - SAFE.r, y); });
  // 메시지
  G.msgs = G.msgs.filter(m => m.until > now);
  ctx.textAlign = 'center';
  G.msgs.slice(-4).forEach((m, i) => { ctx.font = `${m.small ? 600 : 700} ${m.small ? 13 : 15}px ${FONT}`; const w = ctx.measureText(m.t).width + 24, y = H * .2 + i * 30; pill(W / 2 - w / 2, y - 17, w, 24, m.small ? 'rgba(20,40,28,.7)' : 'rgba(10,12,14,.75)', m.small ? 'rgba(94,224,138,.3)' : 'rgba(226,160,63,.35)'); ctx.fillStyle = m.small ? '#a6e8bb' : '#f0d8a8'; ctx.fillText(m.t, W / 2, y); });
  if (G.pre > 0) { ctx.font = `900 56px ${FONT}`; ctx.fillStyle = '#e2a03f'; ctx.fillText(`${G.pre}`, W / 2, H * .42); ctx.font = `600 15px ${FONT}`; ctx.fillStyle = '#e6e9ec'; ctx.fillText('곧 시작합니다 · 시작 후 60초 동안은 교전 금지', W / 2, H * .42 + 32); }
  if (G.peace > 0 && G.pre <= 0) { const w = 210, py = SAFE.t; ctx.save(); ctx.translate(0, py); pill(W / 2 - w / 2, 46, w, 30, 'rgba(10,12,14,.78)', 'rgba(94,224,138,.45)'); ctx.font = `600 11px ${FONT}`; ctx.fillStyle = '#8be0a6'; ctx.textAlign = 'center'; ctx.fillText('교전 금지', W / 2 - 40, 66); ctx.font = `800 16px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(`0:${String(G.peace).padStart(2, '0')}`, W / 2 + 34, 67); ctx.restore(); }
  // 하단 상태 패널
  const compact = isTouch && H < 520, bw = compact ? Math.min(250, W * .3) : Math.min(320, W * .38), bx = W / 2 - bw / 2 - (compact ? W * .04 : 0), by = H - (compact ? 14 : 26);
  pill(bx - 10, by - (compact ? 50 : 58), bw + 20, compact ? 62 : 76, 'rgba(10,12,14,.7)', 'rgba(255,255,255,.08)');
  ctx.fillStyle = '#1c2126'; ctx.fillRect(bx, by, bw, 10);
  ctx.fillStyle = me.st === 'd' ? '#ff6b5a' : me.hp > 60 ? '#e6e9ec' : me.hp > 30 ? '#f0b95c' : '#ff6b5a'; ctx.fillRect(bx, by, bw * Math.max(0, me.hp) / 100, 10);
  if (me.ar) { ctx.fillStyle = ['', '#bdbdbd', '#4a8fc9', '#9b6bc9'][me.ar]; ctx.fillRect(bx, by - 6, bw * me.ad / S.ARMOR[me.ar].dur, 3); }
  ctx.textAlign = 'left'; ctx.font = `700 11px ${FONT}`; ctx.fillStyle = '#8b959e'; ctx.fillText(`HP ${Math.max(0, Math.round(me.hp))}${me.ar ? `  ·  방어구 Lv${me.ar}` : ''}`, bx, by - 10);
  ctx.textAlign = 'right'; ctx.fillText(compact ? `구급${me.it.med} 붕대${me.it.band} 투척${me.it.gren + me.it.flash + me.it.smoke}` : `구급 ${me.it.med} · 붕대 ${me.it.band} · 수류탄 ${me.it.gren} · 섬광 ${me.it.flash} · 연막 ${me.it.smoke}${me.it.fuel ? ' · 연료 ' + me.it.fuel : ''}`, bx + bw, by - 10);
  if (cw) {
    ctx.textAlign = 'left'; ctx.font = `800 16px ${FONT}`; ctx.fillStyle = cw.mag === 0 ? '#ff6b5a' : '#e6e9ec'; ctx.fillText(cw.n, bx, by - 30);
    ctx.textAlign = 'right'; ctx.font = `800 18px ${FONT}`; ctx.fillText(`${cw.mag}`, bx + bw - 62, by - 30); ctx.font = `600 12px ${FONT}`; ctx.fillStyle = '#8b959e'; ctx.fillText(`/ ${cw.max}  ·  ${me.am[cw.am]}`, bx + bw, by - 30);
    const other = me.w[1 - me.cw]; if (other && !compact) { ctx.textAlign = 'left'; ctx.font = `600 11px ${FONT}`; ctx.fillStyle = '#5c656d'; ctx.fillText(`보조: ${other.n} ${other.mag}/${other.max}`, bx, by - 47); }
    if (me.rec > 6) { ctx.textAlign = 'center'; ctx.font = `700 12px ${FONT}`; ctx.fillStyle = '#ff8a7a'; ctx.fillText('반동 누적 · 끊어 쏘세요', W / 2, by - 66); }
  } else if (alive) { ctx.textAlign = 'center'; ctx.font = `700 14px ${FONT}`; ctx.fillStyle = '#ff8a7a'; ctx.fillText('무기 없음 · 상자를 수색하세요', W / 2, by - 30); }
  // 진행 원
  const prog = me.act ? me.act[1] : me.rl >= 0 ? me.rl : me.ex > 0 ? me.ex / 7 : -1;
  if (prog >= 0) { const label = me.act ? { med: '구급상자 사용 중', band: '붕대 감는 중', revive: '소생 중', fuel: '주유 중', search: '수색 중' }[me.act[0]] : me.rl >= 0 ? '재장전' : '탈출 중'; const cx = W / 2, cy = H / 2 + 74; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, 6.283); ctx.stroke(); ctx.strokeStyle = me.act && me.act[0] === 'search' ? '#e2a03f' : '#5ee08a'; ctx.beginPath(); ctx.arc(cx, cy, 20, -Math.PI / 2, -Math.PI / 2 + prog * 6.283); ctx.stroke(); ctx.textAlign = 'center'; ctx.font = `700 12px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(label, cx, cy + 40); }
  // 상호작용 버튼
  const lab = interactLabel(); const ib = btnEls.interact;
  ib.classList.toggle('hide', !lab); if (lab && ib.dataset.l !== lab) { ib.dataset.l = lab; ib.innerHTML = `<span>${lab}</span><div class="cdv" style="transform:scaleY(0)"></div>`; }
  if (!isTouch && lab) { ctx.textAlign = 'center'; ctx.font = `700 13px ${FONT}`; const t = 'F  ' + lab.replace(/<[^>]+>/g, ' '); const w = ctx.measureText(t).width + 22; pill(W / 2 - w / 2, H / 2 + 108, w, 24, 'rgba(10,12,14,.75)', 'rgba(226,160,63,.5)'); ctx.fillStyle = '#f0d8a8'; ctx.fillText(t, W / 2, H / 2 + 125); }
  // 버튼 상태
  const rcd = Math.max(me.rcd, G.rollCdUntil - now); btnEls.roll.querySelector('.cdv').style.transform = `scaleY(${Math.min(1, Math.max(0, rcd) / 3500)})`;
  btnEls.ads.classList.toggle('on', !!G.ads);
  if (btnEls.ads.dataset.sc !== String(cw && cw.sc)) { btnEls.ads.dataset.sc = String(cw && cw.sc); btnEls.ads.querySelector('span').textContent = cw && cw.sc ? '스코프' : '조준'; }
  const fb = $('topbtn').querySelector('[data-a=fuel]'); if (fb) fb.classList.toggle('hide', !me.it.fuel);
  if (me.fl > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, me.fl / 1500)})`; ctx.fillRect(0, 0, W, H); }
  ctx.textAlign = 'center';
  const banner = (t, col) => { ctx.font = `700 16px ${FONT}`; const w = ctx.measureText(t).width + 28; pill(W / 2 - w / 2, H * .3 - 20, w, 28, 'rgba(10,12,14,.8)', col); ctx.fillStyle = '#fff'; ctx.fillText(t, W / 2, H * .3); };
  if (me.st === 'd') banner('기절 · 팀원에게 이동해 소생을 기다리세요', '#ff6b5a');
  else if (!alive && me.spec) { const r = G.roster.get(me.spec); banner(`관전 중 · ${r ? r.name : ''}`, 'rgba(255,255,255,.3)'); }
  else if (me.st === 'e') banner('탈출 완료', '#5ee08a');
  else if (G.z && alive && hyp(vx - G.z[0], vy - G.z[1]) > G.z[2]) banner('자기장 밖 · 안전구역으로 이동하세요', '#4fa3e0');
  // 조이스틱
  if (isTouch) {
    for (const [s, dx, dy, lbl] of [[sticks.move, 116, H - 116, '이동'], [sticks.aim, W * .6, H * .52, '']]) {
      if (!s && !lbl) { ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(dx, dy, STICK_R, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = `600 11px ${FONT}`; ctx.fillText('오른쪽 화면 드래그로 조준', dx, dy + 4); continue; }
      const ox = s ? s.ox : dx, oy = s ? s.oy : dy, kx = s ? s.x : dx, ky = s ? s.y : dy;
      ctx.fillStyle = 'rgba(10,12,14,.32)'; ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ox, oy, STICK_R, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = s ? 'rgba(226,160,63,.75)' : 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(kx, ky, 22, 0, 6.283); ctx.fill();
      if (!s) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = `600 11px ${FONT}`; ctx.fillText(lbl, ox, oy + STICK_R + 16); }
    }
  }
}
function interactLabel() {
  const me = G.me; if (!me) return null;
  if (me.car) return '하차';
  if (me.st !== 'a') return null;
  if (me.act) return '취소';
  const x = G.local.x, y = G.local.y;
  for (const o of G.others.values()) if ((o.fl & 16) && o.st === 'd' && hyp(o.x - x, o.y - y) < 65) return '소생';
  let bb = null, bd = 64; for (const b of G.boxes.values()) if (b.f === me.f && Math.abs(b.x - x) < 70 && Math.abs(b.y - y) < 70) { const d = hyp(b.x - x, b.y - y); if (d < bd) { bd = d; bb = b; } }
  let best = null, wd = 56; for (const it of G.items.values()) if (it.k === 'w' && it.f === me.f) { const d = hyp(it.x - x, it.y - y); if (d < wd) { wd = d; best = it; } }
  if (bb && (!best || bd <= wd)) return `${G.searched.has(bb.id) ? '열기' : '수색'}<small>${esc(bb.k === 'body' ? bb.name || '시체' : S.BOXKIND[bb.k])}</small>`;
  if (best) return `줍기<small>${esc(best.nm)}</small>`;
  for (const v of G.vehs) if (!v[8] && me.f === 0 && v[6] < 4 && hyp(v[1] - x, v[2] - y) < 80) return '탑승';
  return null;
}
window.__dbg = () => G;
requestAnimationFrame(frame);
connect();
})();
