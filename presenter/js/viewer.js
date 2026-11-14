/* 유캔 프리젠터 — 발표 화면 뷰어
 * ?role=audience  → 관객 화면: 내용만 (UI 0)
 * ?role=stage     → 연사 화면: 내용 + 타이머 + 다음 장 + 큐 메시지
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
$(isStage ? 'stage' : 'audience').hidden = false;

const canvas = $(isStage ? 'sCanvas' : 'aCanvas');
const video = $(isStage ? 'sVideo' : 'aVideo');
const renderer = new SlideRenderer(canvas);

const bus = new Bus(role);
let state = initialState();
let pdfDoc = null;
let loadedBlobUrl = '';
let drawnIndex = 0;
let nextThumbFor = 0;

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
  // 연사/관객 화면에서도 진행·타이머 조작 → 컨트롤 콘솔에 위임
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); bus.post('cmd', { name: 'next' }); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); bus.post('cmd', { name: 'prev' }); }
  else if (e.key === 't' || e.key === 'T') { bus.post('cmd', { name: 'timer' }); }
});
goFullscreen().finally(refreshHint);

/* ---------------- 라이브 스트림 수신 (컨트롤 콘솔이 직접 호출) ---------------- */
window.ycpReceiveStream = function (stream) {
  try {
    video.srcObject = stream;
    video.hidden = false;
    canvas.hidden = true;
    video.play().catch(() => {});
  } catch (err) {
    console.error('스트림 표시 실패', err);
  }
};

/* ---------------- 상태 수신 ---------------- */
bus.on('state', (m) => { state = m.state; apply(); });
bus.on('bye', () => { /* 컨트롤이 닫힘 — 마지막 화면 유지 */ });
bus.post('hello', {});
setInterval(() => bus.post('alive', {}), 1000);

async function apply() {
  const src = state.source;

  // 소스 종류 전환
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
    if (!video.srcObject) {
      // 직접 전달이 실패한 경우를 위한 안내
      $('waiting').hidden = false;
      $('waiting').querySelector('.in').innerHTML =
        '<b>라이브 소스 대기 중</b>컨트롤 콘솔에서 ‘발표 화면 열기’를 다시 누르거나, 캡처를 다시 시작하세요.';
    } else {
      video.hidden = false;
    }
  } else {
    pdfDoc = null;
    loadedBlobUrl = '';
  }

  const ready = (src.kind === 'pdf' && pdfDoc) || (src.kind === 'live' && !!video.srcObject);
  $('waiting').hidden = ready;

  if (isStage) {
    $('sCounter').textContent = state.deck.total ? `${state.deck.index} / ${state.deck.total}` : '– / –';
    $('sSource').textContent = src.kind === 'pdf' ? 'PDF' : src.kind === 'live' ? 'LIVE' : '—';
    const label = state.timer.mode === 'countup' ? '경과 시간' : '남은 시간';
    $('tLabel').textContent = label;
    const msg = $('msg');
    const has = !!(state.message && state.message.text);
    msg.textContent = has ? state.message.text : '';
    msg.className = 'msg' + (has ? ' show k-' + (state.message.kind || 'info') : '');
    updateNextThumb();
  } else {
    const a = $('audience');
    a.classList.toggle('blackout', !!state.output.blackout);
    a.classList.toggle('logo-on', !!state.output.logo);
  }

  relayout();
}

/* ---------------- 렌더 ---------------- */
function boxSize() {
  if (isStage) {
    const el = canvas.parentElement.getBoundingClientRect();
    return [el.width, el.height];
  }
  return [window.innerWidth, window.innerHeight];
}
function relayout() {
  if (state.source.kind !== 'pdf' || !pdfDoc) return;
  // 관객 화면 프리즈: 마지막으로 그린 장을 유지
  const freezeAudience = !isStage && state.output.freeze;
  const target = freezeAudience && drawnIndex ? drawnIndex : state.deck.index;
  const [w, h] = boxSize();
  renderer.render(target, w, h)
    .then(() => { drawnIndex = target; })
    .catch((err) => console.error(err));
}
window.addEventListener('resize', relayout);

/* 메시지 배너가 뜨고 사라지면 슬라이드 영역 크기가 바뀐다 → 창 리사이즈가 아니어도 다시 그려야 한다 */
if ('ResizeObserver' in window) {
  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(relayout);
  });
  ro.observe(canvas.parentElement);
}

async function updateNextThumb() {
  if (!isStage) return;
  if (state.source.kind !== 'pdf' || !pdfDoc) {
    $('nextThumb').hidden = true; $('nextNone').hidden = false;
    $('nextNone').textContent = state.source.kind === 'live' ? '라이브 모드' : '—';
    return;
  }
  const n = state.deck.index + 1;
  if (n > state.deck.total) {
    $('nextThumb').hidden = true; $('nextNone').hidden = false; $('nextNone').textContent = '마지막 장';
    return;
  }
  if (nextThumbFor === n) return;
  nextThumbFor = n;
  try {
    const url = await renderThumb(pdfDoc, n, 420);
    if (nextThumbFor !== n) return;
    $('nextThumb').src = url;
    $('nextThumb').hidden = false;
    $('nextNone').hidden = true;
  } catch (_) {}
}

/* ---------------- 타이머 표시 (창마다 독립 계산) ---------------- */
function tick() {
  if (isStage) {
    const now = Date.now();
    const { ms } = timerValue(state.timer, now);
    const lv = pacingLevel(state.timer, now);
    const val = $('tVal');
    val.textContent = formatMs(ms);
    val.className = 'val lv-' + lv;
    $('tClock').textContent = clockString(new Date(now));
    const p = $('pacing');
    p.className = 'pacing lv-' + lv;
    p.firstElementChild.style.width = Math.round(timerValue(state.timer, now).fraction * 100) + '%';
  }
  requestAnimationFrame(tick);
}
tick();
refreshHint();
