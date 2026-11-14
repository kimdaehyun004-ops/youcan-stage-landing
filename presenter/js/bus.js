/* 유캔 프리젠터 — 창 간 상태 버스 (BroadcastChannel)
 *
 * 구조: 컨트롤 창이 유일한 상태 소유자(master). 뷰어 창은 상태를 받아 그리기만 하고,
 * 조작은 cmd 메시지로 컨트롤에 위임한다. 이렇게 하면 창이 몇 개든 상태가 갈라지지 않는다.
 */

export const CHANNEL_NAME = 'yc-presenter-v1';

export const ROLE = {
  CONTROL: 'control',
  AUDIENCE: 'audience',
  STAGE: 'stage',
};

/** 소스 종류: none(없음) | pdf(브라우저가 직접 렌더) | live(화면 캡처 미러) */
export function initialState() {
  return {
    rev: 0,
    source: { kind: 'none', name: '', pageCount: 0, blobUrl: '' },
    deck: { index: 1, total: 0 },
    timer: {
      mode: 'countdown',   // 'countdown' | 'countup'
      running: false,
      totalMs: 15 * 60000,
      endAt: 0,            // running && countdown
      remainMs: 15 * 60000,// paused && countdown
      startAt: 0,          // running && countup
      elapsedMs: 0,        // paused && countup
    },
    message: { text: '', kind: 'info', at: 0 },
    /* 타이머 오버레이: 위치(x,y)는 화면 대비 비율이라 해상도가 달라도 같은 자리에 찍힌다 */
    overlay: {
      x: 0.5,            // 0(왼쪽) ~ 1(오른쪽), 숫자의 중심
      y: 0.9,            // 0(위) ~ 1(아래)
      size: 0.13,        // 화면 높이 대비 글자 크기
      color: 'auto',     // auto(페이싱 색) | white | yellow
      bg: 'shadow',      // none | shadow | plate | plate-light
      onStage: true,     // 연사 화면에 표시
      onAudience: false, // 관객 화면에도 표시
      showClock: false,  // 현재 시각 같이 표시
      showNext: false,   // 다음 장 썸네일
      showCounter: false,// 슬라이드 번호
      showPacing: false, // 상단 진행 바
      locked: false,     // 드래그 잠금
    },
    output: { blackout: false, logo: false, freeze: false },
    notes: '',             // 연사 화면에 띄울 메모(선택)
  };
}

export class Bus {
  constructor(role) {
    this.role = role;
    this.ch = new BroadcastChannel(CHANNEL_NAME);
    this.listeners = new Map();
    this.ch.onmessage = (e) => {
      const msg = e.data;
      if (!msg || typeof msg.type !== 'string') return;
      const fns = this.listeners.get(msg.type);
      if (fns) for (const fn of fns) fn(msg);
    };
  }
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type).delete(fn);
  }
  post(type, payload = {}) {
    this.ch.postMessage({ type, from: this.role, at: Date.now(), ...payload });
  }
  close() { try { this.ch.close(); } catch (_) {} }
}

/* ---------- 타이머 계산 (순수 함수, 창마다 독립 계산 → 드리프트 없음) ---------- */

/** 현재 타이머 값. { ms, over } — countdown에서 ms<0 이면 초과. */
export function timerValue(t, now = Date.now()) {
  if (t.mode === 'countup') {
    const ms = t.running ? now - t.startAt : t.elapsedMs;
    return { ms, over: false, fraction: t.totalMs > 0 ? Math.min(1, ms / t.totalMs) : 0 };
  }
  const ms = t.running ? t.endAt - now : t.remainMs;
  const fraction = t.totalMs > 0 ? Math.max(0, Math.min(1, ms / t.totalMs)) : 0;
  return { ms, over: ms < 0, fraction };
}

/** mm:ss (1시간 이상이면 h:mm:ss), 초과분은 앞에 - */
export function formatMs(ms) {
  const neg = ms < 0;
  let s = Math.floor((Math.abs(ms) + 999) / 1000); // 올림: 1초 남았을 때 0:01 유지
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const pad = (n) => String(n).padStart(2, '0');
  const body = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return (neg ? '-' : '') + body;
}

/** 남은 비율 → 신호 단계. 연사 화면 상단 바 색상에 쓴다. */
export function pacingLevel(t, now = Date.now()) {
  const { ms, over, fraction } = timerValue(t, now);
  if (over) return 'over';
  if (t.mode === 'countup') return fraction >= 1 ? 'over' : fraction > 0.75 ? 'warn' : 'ok';
  if (ms <= 60000) return 'danger';
  if (fraction <= 0.25) return 'warn';
  return 'ok';
}

export function clockString(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
