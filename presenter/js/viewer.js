/* 유캔 프리젠터 — 발표 화면 뷰어
 * ?role=audience  → 관객 화면
 * ?role=stage     → 연사 화면
 * 두 화면 모두 "발표 내용이 화면 전체"이고, 타이머·다음장·메시지는 그 위에 얹히는 오버레이다.
 */
import { Bus, ROLE, initialState, timerValue, formatMs, pacingLevel, clockString } from './bus.js';
import { openPdf, SlideRenderer, renderThumb } from './pdf-source.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const role = params.get('role') === 'audience' ? ROLE.AUDIENCE : ROLE.STAGE;
const wantScreen = Number(params.get('sw'));
const isStage = role === ROLE.STAGE;

document.title = `유캔 프리젠터 — ${isStage ? '연사 화면' : '관객 화면'}`;
$('fsRole').textContent = isStage ? 'STAGE / 연사 화면' : 'AUDIENCE / 관객 화면';

const canvas = $('vCanvas');
const video = $('vVideo');
const renderer = new SlideRenderer(canvas);

const bus = new Bus(role);
let state = initialState();
let pdfDoc = null;
let loadedBlobUrl = '';
let drawnIndex = 0;
let nextThumbFor = 0;
let dragging = false;

/* ---------------- 전체화면 ---------------- */
async function goFullscreen() {
  if (document.fullscreenElement) return;
  const el = document.documentElement;
  try {
    if ('getScreenDetails' in window && Number.isInteger(wantScreen)) {
      const sd = await window.getScreenDetails();
      const target = sd.screens[wantScreen];
      if (target) { await el.requestFullscreen({ screen: target }); return; }
    }
    await el.requestFullscreen();
  } catch (_) {
    try { await el.requestFullscreen(); } catch (__) {}
  }
}
let hintUsed = false;
function refreshHint() {
  const fs = !!document.fullscreenElement;
  if (fs) hintUsed = true;
  const hint = $('fsHint');
  hint.hidden = fs;
  hint.classList.toggle('mini', hintUsed);
  if (hintUsed) hint.querySelector('h1').textContent = 'F = 전체화면';
  document.body.classList.toggle('show-cursor', !fs);
}
$('fsHint').addEventListener('click', () => { hintUsed = true; goFullscreen().finally(refreshHint); });
document.addEventListener('fullscreenchange', () => { refreshHint(); relayout(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') { goFullscreen(); return; }
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); bus.post('cmd', { name: 'next' }); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); bus.post('cmd', { name: 'prev' }); }
  else if (e.key === 't' || e.key === 'T') { bus.post('cmd', { name: 'timer' }); }
});
goFullscreen().finally(refreshHint);

/* ---------------- 타이머 오버레이 드래그 ---------------- */
const tOverlay = $('tOverlay');
const SAFE = 0.025;                 // 화면 가장자리 여백 (짧은 변의 2.5%)
let grabDX = 0, grabDY = 0, lastLen = -1;

/** 숫자를 화면 안에 완전히 들어오도록 픽셀 단위로 배치한다.
 *  x=0 왼쪽 끝 / 0.5 정가운데 / 1 오른쪽 끝 — 글자 크기가 커져도 잘리지 않는다. */
function positionOverlay() {
  const o = state.overlay;
  const vw = window.innerWidth, vh = window.innerHeight;
  const m = Math.round(Math.min(vw, vh) * SAFE);
  const ew = tOverlay.offsetWidth, eh = tOverlay.offsetHeight;
  tOverlay.style.left = Math.round(m + o.x * Math.max(0, vw - ew - 2 * m)) + 'px';
  tOverlay.style.top = Math.round(m + o.y * Math.max(0, vh - eh - 2 * m)) + 'px';
}

tOverlay.addEventListener('pointerdown', (e) => {
  if (state.overlay.locked) return;
  const r = tOverlay.getBoundingClientRect();
  grabDX = e.clientX - r.left;
  grabDY = e.clientY - r.top;
  dragging = true;
  tOverlay.classList.add('dragging');
  tOverlay.setPointerCapture(e.pointerId);
  document.body.classList.add('show-cursor');
  e.preventDefault();
});
tOverlay.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const m = Math.round(Math.min(vw, vh) * SAFE);
  const spanX = Math.max(1, vw - tOverlay.offsetWidth - 2 * m);
  const spanY = Math.max(1, vh - tOverlay.offsetHeight - 2 * m);
  let x = (e.clientX - grabDX - m) / spanX;
  let y = (e.clientY - grabDY - m) / spanY;
  for (const a of [0, 0.5, 1]) {            // 끝·가운데에 살짝 붙여준다
    if (Math.abs(x - a) < 0.035) x = a;
    if (Math.abs(y - a) < 0.035) y = a;
  }
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  state.overlay.x = x;
  state.overlay.y = y;
  positionOverlay();
  bus.post('cmd', { name: 'overlay', arg: { x, y } });
});
function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  tOverlay.classList.remove('dragging');
  try { tOverlay.releasePointerCapture(e.pointerId); } catch (_) {}
  if (document.fullscreenElement) document.body.classList.remove('show-cursor');
  bus.post('cmd', { name: 'overlay', arg: { x: state.overlay.x, y: state.overlay.y } });
}
tOverlay.addEventListener('pointerup', endDrag);
tOverlay.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', positionOverlay);

/* ---------------- 라이브 스트림 수신 ---------------- */
window.ycpReceiveStream = function (stream) {
  try {
    video.srcObject = stream;
    video.hidden = false;
    canvas.hidden = true;
    video.play().catch(() => {});
    $('waiting').hidden = true;
  } catch (err) {
    console.error('스트림 표시 실패', err);
  }
};

/* ---------------- 상태 수신 ---------------- */
bus.on('state', (m) => {
  const wasDragging = dragging;
  const keep = { x: state.overlay.x, y: state.overlay.y };
  state = m.state;
  if (wasDragging) { state.overlay.x = keep.x; state.overlay.y = keep.y; } // 드래그 중에는 내 손이 우선
  apply();
});
bus.post('hello', {});
setInterval(() => bus.post('alive', {}), 1000);

async function apply() {
  const src = state.source;

  if (src.kind === 'pdf') {
    video.hidden = true;
    canvas.hidden = false;
    if (src.blobUrl && src.blobUrl !== loadedBlobUrl) {
      loadedBlobUrl = src.blobUrl;
      try {
        pdfDoc = await openPdf(src.blobUrl);
        renderer.setDoc(pdfDoc);
        drawnIndex = 0;
        nextThumbFor = 0;
      } catch (err) {
        console.error('PDF 열기 실패(컨트롤 창이 닫혔을 수 있음)', err);
        pdfDoc = null;
      }
    }
  } else if (src.kind === 'live') {
    canvas.hidden = true;
    video.hidden = !video.srcObject;
  } else {
    pdfDoc = null;
    loadedBlobUrl = '';
  }

  const ready = (src.kind === 'pdf' && pdfDoc) || (src.kind === 'live' && !!video.srcObject);
  $('waiting').hidden = ready;

  const scr = $('screen');
  const isAudience = !isStage;
  scr.classList.toggle('blackout', isAudience && !!state.output.blackout);
  scr.classList.toggle('logo-on', isAudience && !!state.output.logo);

  const o = state.overlay;
  const showTimer = isStage ? o.onStage !== false : !!o.onAudience;
  tOverlay.hidden = !showTimer;
  $('tClock').hidden = !o.showClock;
  $('pacing').hidden = !o.showPacing;
  $('sCounter').hidden = !o.showCounter;
  if (o.showCounter) $('sCounter').textContent = state.deck.total ? `${state.deck.index} / ${state.deck.total}` : '';
  tOverlay.style.cursor = o.locked ? 'default' : 'move';
  placeOverlay();
  updateNext();

  const msg = $('msg');
  const has = !!(state.message && state.message.text);
  msg.textContent = has ? state.message.text : '';
  msg.className = 'msg-overlay' + (has ? ' show k-' + (state.message.kind || 'info') : '');

  relayout();
}

function placeOverlay() {
  const o = state.overlay;
  tOverlay.style.fontSize = (o.size * 100) + 'vh';
  tOverlay.classList.remove('bg-none', 'bg-shadow', 'bg-plate', 'bg-plate-light', 'c-auto', 'c-white', 'c-yellow');
  tOverlay.classList.add('bg-' + (o.bg || 'shadow'), 'c-' + (o.color || 'auto'));
  positionOverlay();
}

/* ---------------- 렌더 ---------------- */
function relayout() {
  if (state.source.kind !== 'pdf' || !pdfDoc) return;
  const freezeAudience = !isStage && state.output.freeze;
  const target = freezeAudience && drawnIndex ? drawnIndex : state.deck.index;
  renderer.render(target, window.innerWidth, window.innerHeight)
    .then(() => { drawnIndex = target; })
    .catch((err) => console.error(err));
}
window.addEventListener('resize', relayout);
if ('ResizeObserver' in window) {
  let raf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(relayout); }).observe($('content'));
}

async function updateNext() {
  const box = $('nextOverlay');
  if (!state.overlay.showNext || state.source.kind !== 'pdf' || !pdfDoc) { box.hidden = true; return; }
  const n = state.deck.index + 1;
  if (n > state.deck.total) { box.hidden = true; return; }
  if (nextThumbFor === n) { box.hidden = false; return; }
  nextThumbFor = n;
  try {
    const url = await renderThumb(pdfDoc, n, 420);
    if (nextThumbFor !== n) return;
    $('nextThumb').src = url;
    box.hidden = false;
  } catch (_) {}
}

/* ---------------- 타이머 표시 (창마다 독립 계산) ---------------- */
function tick() {
  const now = Date.now();
  const lv = pacingLevel(state.timer, now);
  if (!tOverlay.hidden) {
    const { ms } = timerValue(state.timer, now);
    const txt = formatMs(ms);
    $('tVal').textContent = txt;
    if (txt.length !== lastLen) { lastLen = txt.length; if (!dragging) positionOverlay(); }
    tOverlay.classList.remove('lv-ok', 'lv-warn', 'lv-danger', 'lv-over');
    tOverlay.classList.add('lv-' + lv);
    if (state.overlay.showClock) $('tClock').textContent = clockString(new Date(now));
  }
  const p = $('pacing');
  if (!p.hidden) {
    p.className = 'pacing lv-' + lv;
    p.firstElementChild.style.width = Math.round(timerValue(state.timer, now).fraction * 100) + '%';
  }
}
/* rAF 는 창이 가려지거나 최소화되면 멈춘다 → 타이머 표시는 인터벌로 돌린다.
   (백그라운드에서는 브라우저가 1초로 늦추지만 초 단위 표시에는 충분하다) */
placeOverlay();
tick();
setInterval(tick, 200);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); positionOverlay(); } });
refreshHint();
