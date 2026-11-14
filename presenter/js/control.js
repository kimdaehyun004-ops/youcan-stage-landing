/* 유캔 프리젠터 — 컨트롤 콘솔 (3번 모니터)
 * 이 창이 상태의 유일한 소유자다. 뷰어 창은 받아 그리기만 한다.
 */
import { Bus, ROLE, initialState, timerValue, formatMs, pacingLevel, clockString } from './bus.js';
import { openPdf, SlideRenderer, renderThumb } from './pdf-source.js';

const $ = (id) => document.getElementById(id);
const state = initialState();
const bus = new Bus(ROLE.CONTROL);

/* 타이머 위치·크기는 이 브라우저에 저장해 다음 행사에도 그대로 쓴다 */
const SAVE_KEY = 'ycp-overlay-v1';
try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (saved && typeof saved === 'object') Object.assign(state.overlay, saved);
} catch (_) {}
function saveOverlay() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.overlay)); } catch (_) {}
}

let pdfDoc = null;
let pdfBlobUrl = '';
let liveStream = null;
let screenDetails = null;
let screensList = [];
const viewerWin = { audience: null, stage: null };
const lastSeen = { audience: 0, stage: 0 };
let thumbJob = 0;

/* ---------------- 상태 배포 ---------------- */
function publish() {
  state.rev++;
  bus.post('state', { state });
}

bus.on('hello', (m) => {
  publish();
  if (m.from === ROLE.STAGE) handOffStream();
});
bus.on('alive', (m) => { if (m.from in lastSeen) lastSeen[m.from] = Date.now(); });
bus.on('cmd', (m) => runCmd(m.name, m.arg));

function runCmd(name, arg) {
  switch (name) {
    case 'next': go(state.deck.index + 1); break;
    case 'prev': go(state.deck.index - 1); break;
    case 'goto': go(Number(arg)); break;
    case 'timer': toggleTimer(); break;
    case 'reset': resetTimer(); break;
    case 'blackout': toggleOutput('blackout'); break;
    case 'overlay': setOverlay(arg || {}, { fromViewer: true }); break;
  }
}

/* ---------------- 소스: PDF ---------------- */
$('pdfFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  await stopLive({ silent: true });
  try {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = URL.createObjectURL(file);
    pdfDoc = await openPdf(pdfBlobUrl);
    state.source = { kind: 'pdf', name: file.name, pageCount: pdfDoc.numPages, blobUrl: pdfBlobUrl };
    state.deck = { index: 1, total: pdfDoc.numPages };
    state.output = { blackout: false, logo: false, freeze: false };
    previewRenderer.setDoc(pdfDoc);
    $('srcInfo').innerHTML = `<strong>PDF</strong> · ${escapeHtml(file.name)} · ${pdfDoc.numPages}장`;
    publish();
    syncUi();
    drawPreview();
    buildThumbs();
  } catch (err) {
    console.error(err);
    $('srcInfo').textContent = 'PDF를 열 수 없습니다: ' + (err && err.message ? err.message : err);
  }
});

/* ---------------- 소스: 라이브 화면 캡처(PPT 애니메이션 보존) ---------------- */
$('btnLive').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: false,
      selfBrowserSurface: 'exclude',   // 자기 탭 선택 방지(피드백 루프 차단)
      surfaceSwitching: 'include',
      monitorTypeSurfaces: 'include',
    });
    liveStream = stream;
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => { stopLive(); });

    pdfDoc = null;
    state.source = { kind: 'live', name: track.label || '화면 캡처', pageCount: 0, blobUrl: '' };
    state.deck = { index: 1, total: 0 };
    state.output = { blackout: false, logo: false, freeze: false };

    const v = $('previewVideo');
    v.srcObject = stream;
    v.hidden = false;
    $('previewCanvas').hidden = true;
    $('previewPh').hidden = true;
    await v.play().catch(() => {});

    const s = track.getSettings ? track.getSettings() : {};
    $('srcInfo').innerHTML = `<strong>라이브 캡처</strong> · ${escapeHtml(track.label || '선택한 화면')}` +
      (s.width ? ` · ${s.width}×${s.height}@${Math.round(s.frameRate || 0)}fps` : '');

    // 라이브 모드에서 1번(관객) 모니터는 파워포인트가 전체화면으로 차지해야 한다 → 관객 창을 비켜준다.
    if (viewerWin.audience && !viewerWin.audience.closed) {
      try { viewerWin.audience.close(); } catch (_) {}
      viewerWin.audience = null;
      lastSeen.audience = 0;
    }

    publish();
    syncUi();
    clearThumbs();
    handOffStream();
  } catch (err) {
    if (err && err.name === 'NotAllowedError') return; // 사용자가 취소
    console.error(err);
    $('srcInfo').textContent = '화면 캡처 실패: ' + (err && err.message ? err.message : err);
  }
});

$('btnLiveStop').addEventListener('click', () => stopLive());

async function stopLive({ silent = false } = {}) {
  if (!liveStream) return;
  for (const t of liveStream.getTracks()) t.stop();
  liveStream = null;
  const v = $('previewVideo');
  v.srcObject = null;
  v.hidden = true;
  if (state.source.kind === 'live') {
    state.source = { kind: 'none', name: '', pageCount: 0, blobUrl: '' };
    state.deck = { index: 1, total: 0 };
    publish();
    if (!silent) $('srcInfo').textContent = '라이브 캡처를 중지했습니다.';
  }
  syncUi();
}

/** MediaStream은 postMessage로 복제되지 않는다 → 동일 출처 창에 직접 넘긴다. */
function handOffStream() {
  if (!liveStream) return;
  const w = viewerWin.stage;
  if (!w || w.closed) return;
  try {
    if (typeof w.ycpReceiveStream === 'function') w.ycpReceiveStream(liveStream);
  } catch (err) {
    console.warn('스트림 전달 실패 — 연사 화면에서 직접 캡처를 선택해야 합니다.', err);
  }
}

/* ---------------- 슬라이드 이동 ---------------- */
function go(n) {
  if (state.source.kind !== 'pdf' || !state.deck.total) return;
  const i = Math.max(1, Math.min(state.deck.total, Math.round(n) || 1));
  if (i === state.deck.index) return;
  state.deck.index = i;
  publish();
  syncUi();
  drawPreview();
}
$('btnPrev').addEventListener('click', () => go(state.deck.index - 1));
$('btnNext').addEventListener('click', () => go(state.deck.index + 1));
$('btnGoto').addEventListener('click', () => { const v = Number($('gotoInput').value); if (v) go(v); });
$('gotoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = Number(e.target.value); if (v) go(v); } });

/* ---------------- 썸네일 ---------------- */
function clearThumbs() { $('thumbs').innerHTML = ''; }
async function buildThumbs() {
  const host = $('thumbs');
  host.innerHTML = '';
  if (!pdfDoc) return;
  const job = ++thumbJob;
  const n = pdfDoc.numPages;
  const btns = [];
  for (let i = 1; i <= n; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<em>${i}</em>`;
    b.addEventListener('click', () => go(i));
    host.appendChild(b);
    btns.push(b);
  }
  for (let i = 1; i <= n; i++) {
    if (job !== thumbJob) return;
    try {
      const url = await renderThumb(pdfDoc, i, 200);
      if (job !== thumbJob) return;
      const img = document.createElement('img');
      img.src = url;
      btns[i - 1].prepend(img);
    } catch (_) {}
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}
function markThumb() {
  const kids = $('thumbs').children;
  for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('active', i + 1 === state.deck.index);
  const active = kids[state.deck.index - 1];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

/* ---------------- 컨트롤 콘솔 미리보기 ---------------- */
const previewRenderer = new SlideRenderer($('previewCanvas'), { maxDpr: 1 });
function drawPreview() {
  if (state.source.kind !== 'pdf' || !pdfDoc) return;
  const box = $('preview').getBoundingClientRect();
  $('previewCanvas').hidden = false;
  $('previewPh').hidden = true;
  previewRenderer.render(state.deck.index, box.width - 2, box.height - 2).catch(console.error);
}
window.addEventListener('resize', () => { if (state.source.kind === 'pdf') drawPreview(); });

/* ---------------- 화면 감지 / 배정 ---------------- */
$('btnDetect').addEventListener('click', detectScreens);

async function detectScreens() {
  try {
    if ('getScreenDetails' in window) {
      screenDetails = await window.getScreenDetails();
      screensList = screenDetails.screens;
      screenDetails.addEventListener('screenschange', () => {
        screensList = screenDetails.screens;
        renderScreens();
      });
    } else {
      screensList = [window.screen];
      $('screenNote').innerHTML =
        '이 브라우저는 <b>Window Management API</b>를 지원하지 않습니다(Chrome/Edge 권장). ' +
        '창은 열리지만 모니터 자동 배치는 되지 않습니다 — 창을 해당 모니터로 끌어다 놓고 클릭하세요.';
    }
    renderScreens();
  } catch (err) {
    console.error(err);
    $('screenNote').textContent = '화면 감지 실패(권한 거부?): ' + (err && err.message ? err.message : err);
  }
  syncUi();
}

function screenName(s, i) {
  const label = s.label && s.label.trim() ? s.label : `디스플레이 ${i + 1}`;
  return `${i + 1}. ${label}`;
}

function renderScreens() {
  const host = $('screenList');
  host.innerHTML = '';
  const cur = screenDetails ? screenDetails.currentScreen : null;
  screensList.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'screen-item';
    const tags = [];
    if (s === cur) tags.push('현재 창');
    if (s.isPrimary) tags.push('주 모니터');
    if (s.isInternal) tags.push('내장');
    row.innerHTML =
      `<div class="meta"><b>${escapeHtml(screenName(s, i))}</b>` +
      `<span>${s.width}×${s.height} · 배율 ${s.devicePixelRatio || 1}${tags.length ? ' · ' + tags.join(' · ') : ''}</span></div>` +
      `<div class="meta"><span>(${s.availLeft ?? s.left ?? 0}, ${s.availTop ?? s.top ?? 0})</span></div>`;
    host.appendChild(row);
  });

  const opts = screensList.map((s, i) => `<option value="${i}">${escapeHtml(screenName(s, i))}</option>`).join('');
  const others = screensList.map((s, i) => i).filter((i) => screensList[i] !== cur);
  $('selAudience').innerHTML = opts;
  $('selStage').innerHTML = opts;
  if (others.length >= 2) {
    $('selAudience').value = String(others[0]);
    $('selStage').value = String(others[1]);
  } else if (others.length === 1) {
    $('selAudience').value = String(others[0]);
    $('selStage').value = String(others[0]);
  }
}

function openViewer(role, idx) {
  const s = screensList[idx];
  let feat = 'popup=yes';
  if (s && (s.availWidth || s.width)) {
    const left = s.availLeft ?? s.left ?? 0;
    const top = s.availTop ?? s.top ?? 0;
    const w = s.availWidth ?? s.width;
    const h = s.availHeight ?? s.height;
    feat = `popup=yes,left=${left},top=${top},width=${w},height=${h}`;
  }
  const url = `screen.html?role=${role}&sw=${idx}`;
  const win = window.open(url, 'ycp-' + role, feat);
  if (win) {
    viewerWin[role] = win;
    try { win.focus(); } catch (_) {}
  }
  return win;
}

$('btnOpenAll').addEventListener('click', () => {
  const live = state.source.kind === 'live';
  if (!live) openViewer('audience', Number($('selAudience').value || 0));
  openViewer('stage', Number($('selStage').value || 0));
  if (live) {
    $('screenNote').innerHTML =
      '<b>라이브 모드:</b> 1번(관객) 모니터는 <b>파워포인트가 직접</b> 전체화면으로 차지합니다 — ' +
      '관객 화면 창은 열지 않습니다. 연사 화면 창만 열립니다.';
  }
  setTimeout(() => { publish(); handOffStream(); }, 600);
  window.focus();
});

$('btnCloseAll').addEventListener('click', () => {
  for (const k of ['audience', 'stage']) {
    const w = viewerWin[k];
    if (w && !w.closed) { try { w.close(); } catch (_) {} }
    viewerWin[k] = null;
    lastSeen[k] = 0;
  }
});

/* ---------------- 타이머 ---------------- */
function setTotal(ms) {
  const t = state.timer;
  t.totalMs = Math.max(0, ms);
  if (!t.running) { t.remainMs = t.totalMs; t.elapsedMs = 0; }
  publish(); syncUi();
}
function toggleTimer() {
  const t = state.timer, now = Date.now();
  if (t.running) {
    if (t.mode === 'countdown') t.remainMs = t.endAt - now; else t.elapsedMs = now - t.startAt;
    t.running = false;
  } else {
    if (t.mode === 'countdown') t.endAt = now + t.remainMs; else t.startAt = now - t.elapsedMs;
    t.running = true;
  }
  publish(); syncUi();
}
function resetTimer() {
  const t = state.timer;
  t.running = false;
  t.remainMs = t.totalMs;
  t.elapsedMs = 0;
  publish(); syncUi();
}
function adjust(ms) {
  const t = state.timer;
  if (t.mode === 'countdown') {
    if (t.running) t.endAt += ms; else t.remainMs = Math.max(0, t.remainMs + ms);
  } else {
    if (t.running) t.startAt -= ms; else t.elapsedMs = Math.max(0, t.elapsedMs + ms);
  }
  publish();
}
$('btnStart').addEventListener('click', toggleTimer);
$('btnReset').addEventListener('click', resetTimer);
$('btnPlus1').addEventListener('click', () => adjust(60000));
$('btnMinus1').addEventListener('click', () => adjust(-60000));
document.querySelectorAll('[data-min]').forEach((b) => {
  b.addEventListener('click', () => {
    const m = Number(b.dataset.min);
    $('tMin').value = String(m);
    $('tSec').value = '0';
    setTotal(m * 60000);
  });
});
function totalFromInputs() {
  const m = Math.max(0, Number($('tMin').value) || 0);
  const s = Math.max(0, Math.min(59, Number($('tSec').value) || 0));
  return (m * 60 + s) * 1000;
}
$('tMin').addEventListener('change', () => setTotal(totalFromInputs()));
$('tSec').addEventListener('change', () => setTotal(totalFromInputs()));
$('tMode').addEventListener('change', (e) => {
  state.timer.mode = e.target.value;
  resetTimer();
});

/* ---------------- 메시지 ---------------- */
function sendMsg(text, kind) {
  state.message = { text: String(text || ''), kind: kind || 'info', at: Date.now() };
  publish();
}
document.querySelectorAll('[data-msg]').forEach((b) => {
  b.addEventListener('click', () => sendMsg(b.dataset.msg, b.dataset.kind || 'info'));
});
$('btnSend').addEventListener('click', () => sendMsg($('msgText').value, $('msgKind').value));
$('msgText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { sendMsg(e.target.value, $('msgKind').value); e.target.select(); }
});
$('btnClearMsg').addEventListener('click', () => { sendMsg('', 'info'); $('msgText').value = ''; });

/* ---------------- 출력 제어 ---------------- */
function toggleOutput(key) {
  state.output[key] = !state.output[key];
  if (key === 'blackout' && state.output.blackout) state.output.logo = false;
  if (key === 'logo' && state.output.logo) state.output.blackout = false;
  publish(); syncUi();
}
$('btnBlack').addEventListener('click', () => toggleOutput('blackout'));
$('btnLogo').addEventListener('click', () => toggleOutput('logo'));
$('btnFreeze').addEventListener('click', () => toggleOutput('freeze'));

/* ---------------- 타이머 오버레이 배치 ---------------- */
function setOverlay(patch, { fromViewer = false } = {}) {
  Object.assign(state.overlay, patch);
  state.overlay.x = Math.max(0.02, Math.min(0.98, state.overlay.x));
  state.overlay.y = Math.max(0.03, Math.min(0.97, state.overlay.y));
  saveOverlay();
  publish();
  syncOverlayUi(fromViewer);
}

document.querySelectorAll('#posGrid button').forEach((b) => {
  b.addEventListener('click', () => setOverlay({ x: Number(b.dataset.x), y: Number(b.dataset.y) }));
});
document.querySelectorAll('[data-nudge]').forEach((b) => {
  b.addEventListener('click', () => {
    const d = b.dataset.nudge, step = 0.01, o = state.overlay;
    if (d === 'up') setOverlay({ y: o.y - step });
    else if (d === 'down') setOverlay({ y: o.y + step });
    else if (d === 'left') setOverlay({ x: o.x - step });
    else if (d === 'right') setOverlay({ x: o.x + step });
    else if (d === 'center') setOverlay({ x: 0.5, y: 0.5 });
  });
});
$('ovReset').addEventListener('click', () => setOverlay({ x: 0.5, y: 0.9, size: 0.13 }));
$('ovSize').addEventListener('input', (e) => setOverlay({ size: Number(e.target.value) / 100 }));
$('ovColor').addEventListener('change', (e) => setOverlay({ color: e.target.value }));
$('ovBg').addEventListener('change', (e) => setOverlay({ bg: e.target.value }));
[['ovOnStage', 'onStage'], ['ovOnAudience', 'onAudience'], ['ovShowClock', 'showClock'],
 ['ovShowNext', 'showNext'], ['ovShowCounter', 'showCounter'], ['ovShowPacing', 'showPacing'],
 ['ovLocked', 'locked']].forEach(([id, key]) => {
  $(id).addEventListener('change', (e) => setOverlay({ [key]: e.target.checked }));
});

/* 미리보기 위 핸들을 끌어서 바로 배치 */
const pvTimer = $('pvTimer');
let pvDrag = false;
pvTimer.addEventListener('pointerdown', (e) => {
  if (state.overlay.locked) return;
  pvDrag = true;
  pvTimer.classList.add('dragging');
  pvTimer.setPointerCapture(e.pointerId);
  e.preventDefault();
});
pvTimer.addEventListener('pointermove', (e) => {
  if (!pvDrag) return;
  const r = $('preview').getBoundingClientRect();
  let x = (e.clientX - r.left) / r.width;
  let y = (e.clientY - r.top) / r.height;
  for (const a of [0.08, 0.5, 0.92]) {
    if (Math.abs(x - a) < 0.02) x = a;
    if (Math.abs(y - a) < 0.02) y = a;
  }
  setOverlay({ x, y });
});
function pvEnd(e) {
  if (!pvDrag) return;
  pvDrag = false;
  pvTimer.classList.remove('dragging');
  try { pvTimer.releasePointerCapture(e.pointerId); } catch (_) {}
}
pvTimer.addEventListener('pointerup', pvEnd);
pvTimer.addEventListener('pointercancel', pvEnd);

function syncOverlayUi(skipInputs = false) {
  const o = state.overlay;
  if (!skipInputs) {
    $('ovSize').value = String(Math.round(o.size * 100));
    $('ovColor').value = o.color;
    $('ovBg').value = o.bg;
    $('ovOnStage').checked = o.onStage !== false;
    $('ovOnAudience').checked = !!o.onAudience;
    $('ovShowClock').checked = !!o.showClock;
    $('ovShowNext').checked = !!o.showNext;
    $('ovShowCounter').checked = !!o.showCounter;
    $('ovShowPacing').checked = !!o.showPacing;
    $('ovLocked').checked = !!o.locked;
  }
  $('ovSizeVal').textContent = Math.round(o.size * 100) + '%';
  document.querySelectorAll('#posGrid button').forEach((b) => {
    b.classList.toggle('active', Math.abs(Number(b.dataset.x) - o.x) < 0.001 && Math.abs(Number(b.dataset.y) - o.y) < 0.001);
  });
  const r = $('preview').getBoundingClientRect();
  pvTimer.style.left = (o.x * 100) + '%';
  pvTimer.style.top = (o.y * 100) + '%';
  pvTimer.style.fontSize = Math.max(8, o.size * r.height) + 'px';
  pvTimer.style.cursor = o.locked ? 'default' : 'move';
}
window.addEventListener('resize', () => syncOverlayUi(true));

/* ---------------- 단축키 ---------------- */
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
  switch (e.key) {
    case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); go(state.deck.index + 1); break;
    case 'ArrowLeft': case 'PageUp': e.preventDefault(); go(state.deck.index - 1); break;
    case 't': case 'T': e.preventDefault(); toggleTimer(); break;
    case 'r': case 'R': e.preventDefault(); resetTimer(); break;
    case 'b': case 'B': e.preventDefault(); toggleOutput('blackout'); break;
  }
});

/* ---------------- UI 동기화 ---------------- */
function syncUi() {
  const live = state.source.kind === 'live';
  const pdf = state.source.kind === 'pdf';

  $('btnLiveStop').disabled = !liveStream;
  $('btnPrev').disabled = !pdf;
  $('btnNext').disabled = !pdf;
  $('btnGoto').disabled = !pdf;
  $('liveNavNote').hidden = !live;

  $('btnBlack').disabled = !pdf;
  $('btnLogo').disabled = !pdf;
  $('btnFreeze').disabled = !pdf;
  $('outNote').textContent = live ? '라이브 모드에서는 사용 불가' : 'PDF 모드 전용';
  $('outHint').innerHTML = live
    ? '라이브 모드에서는 관객 화면이 <b>파워포인트</b>이므로 브라우저가 덮을 수 없습니다. ' +
      '파워포인트 자체 단축키(<kbd>B</kbd> 검은 화면 / <kbd>W</kbd> 흰 화면)를 쓰세요.'
    : '관객 화면만 덮습니다. 연사 화면은 계속 내용을 봅니다.';
  $('btnBlack').classList.toggle('on', state.output.blackout);
  $('btnLogo').classList.toggle('on', state.output.logo);
  $('btnFreeze').classList.toggle('on', state.output.freeze);

  $('btnStart').textContent = state.timer.running ? '일시정지' : '시작';
  $('slideCounter').textContent = state.deck.total ? `${state.deck.index} / ${state.deck.total}` : '– / –';
  markThumb();
}

/* ---------------- 체크리스트 / 상태 뱃지 ---------------- */
function setCheck(id, ok, extra) {
  const li = $(id);
  if (!li) return;
  li.className = ok === true ? 'ok' : ok === false ? 'no' : 'wait';
  li.querySelector('i').textContent = ok === true ? '✓' : ok === false ? '✕' : '•';
  if (extra) {
    let s = li.querySelector('.ex');
    if (!s) { s = document.createElement('span'); s.className = 'ex'; li.querySelector('span').appendChild(s); }
    s.textContent = ' — ' + extra;
  }
}
function badge(el, cls, text) {
  el.className = 'badge' + (cls ? ' ' + cls : '');
  el.textContent = text;
}

function tick() {
  const now = Date.now();
  $('clock').textContent = clockString(new Date(now));

  const { ms } = timerValue(state.timer, now);
  const lv = pacingLevel(state.timer, now);
  const big = $('timerBig');
  big.textContent = formatMs(ms);
  big.className = 'timer-big lv-' + lv;
  pvTimer.textContent = formatMs(ms);
  pvTimer.style.color = lv === 'over' ? 'var(--over)' : lv === 'danger' ? 'var(--danger)' : lv === 'warn' ? 'var(--warn)' : '#fff';
  const bar = $('timerBar');
  bar.className = 'bar lv-' + lv;
  bar.firstElementChild.style.width = Math.round(timerValue(state.timer, now).fraction * 100) + '%';

  // 하트비트만으로 판단한다: 수동으로 띄운 창이나 컨트롤 새로고침 후에도 정확하다.
  const aOn = now - lastSeen.audience < 3000;
  const sOn = now - lastSeen.stage < 3000;
  badge($('bgAudience'), aOn ? 'on' : '', aOn ? '관객 화면 연결' : '관객 화면 –');
  badge($('bgStage'), sOn ? 'on' : '', sOn ? '연사 화면 연결' : '연사 화면 –');

  const secure = window.isSecureContext;
  badge($('bgSecure'), secure ? 'on' : 'err', secure ? '보안 컨텍스트 OK' : '보안 컨텍스트 아님');
  const n = screensList.length;
  badge($('bgScreens'), n >= 3 ? 'on' : n > 0 ? 'warn' : '', n ? `화면 ${n}개` : '화면 미감지');

  setCheck('ckSecure', secure, secure ? null : 'http://localhost 또는 https 로 열어야 캡처·창관리가 됩니다');
  setCheck('ckScreens', n === 0 ? null : n >= 3, n ? `${n}개 감지` : null);
  setCheck('ckPerm', screenDetails ? true : null, screenDetails ? '허용됨' : '‘화면 감지’를 눌러 허용하세요');
  setCheck('ckSource', state.source.kind === 'none' ? null : true, state.source.kind === 'none' ? null : state.source.kind.toUpperCase());
  const need = state.source.kind === 'live' ? 1 : 2;
  const have = (aOn ? 1 : 0) + (sOn ? 1 : 0);
  setCheck('ckWindows', have === 0 ? null : have >= need, `${have}/${need} 연결`);
  setCheck('ckPpt', state.source.kind === 'live' ? null : true, state.source.kind === 'live' ? '수동 확인 필요' : '라이브 모드 아님');

  requestAnimationFrame(tick);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

window.addEventListener('beforeunload', () => {
  bus.post('bye');
  for (const k of ['audience', 'stage']) {
    const w = viewerWin[k];
    if (w && !w.closed) { try { w.close(); } catch (_) {} }
  }
});

syncOverlayUi();
setInterval(() => publish(), 2000); // 느린 하트비트: 늦게 연결된 창도 상태를 받는다
syncUi();
tick();
console.info('[유캔 프리젠터] 컨트롤 콘솔 준비. 보안 컨텍스트:', window.isSecureContext);
