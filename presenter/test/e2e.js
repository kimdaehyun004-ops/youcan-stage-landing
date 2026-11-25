/* 유캔 프리젠터 자동 테스트
 *
 *   1) 서버를 먼저 띄운다:  presenter/start.bat  (또는 ./presenter/serve.sh)
 *   2) 다른 창에서:         node presenter/test/e2e.js
 *
 * 준비물: npm i -D playwright@1.63.0 && npx playwright install chromium
 * 다른 포트면: BASE=http://localhost:9000/presenter node presenter/test/e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const BASE = process.env.BASE || 'http://localhost:8123/presenter';
const log = [];
const ok = (n, c, extra = '') => log.push(`${c ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function painted(page, sel) {
  return page.evaluate((s) => {
    const c = document.querySelector(s);
    if (!c || !c.width) return { w: 0, nonBlack: 0 };
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
    return { w: c.width, h: c.height, nonBlack: n };
  }, sel);
}
const vis = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e || e.hidden) return false;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
}, sel);

const rectOf = (page, sel) => page.evaluate((x) => {
  const r = document.querySelector(x).getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, vw: innerWidth, vh: innerHeight };
}, sel);
const inside = (r) => r.l >= -0.5 && r.t >= -0.5 && r.r <= r.vw + 0.5 && r.b <= r.vh + 0.5;
const fracOf = (page) => page.evaluate(() => {
  const e = document.getElementById('tOverlay');
  const m = Math.round(Math.min(innerWidth, innerHeight) * 0.025);
  const sx = Math.max(1, innerWidth - e.offsetWidth - 2 * m), sy = Math.max(1, innerHeight - e.offsetHeight - 2 * m);
  return { x: (e.offsetLeft - m) / sx, y: (e.offsetTop - m) / sy };
});

const DECK = path.join(DIR, 'demo.pdf');

(async () => {
  if (!fs.existsSync(DECK)) {
    console.log('데모 PDF 생성 중...');
    await new Promise((res, rej) => require('child_process')
      .execFile(process.execPath, [path.join(DIR, 'make-demo-deck.js')], (e) => (e ? rej(e) : res())));
  }
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  const control = await ctx.newPage();
  control.on('console', (m) => { if (m.type() === 'error') errors.push('[control] ' + m.text()); });
  control.on('pageerror', (e) => errors.push('[control:pageerror] ' + e.message));
  await control.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await control.evaluate(() => localStorage.removeItem('ycp-overlay-v1'));
  await control.reload({ waitUntil: 'networkidle' });

  await control.setInputFiles('#pdfFile', DECK);
  await control.waitForFunction(() => /^1 \/ [1-9]\d*$/.test(document.getElementById('slideCounter').textContent.trim()), null, { timeout: 20000 });
  const pages = await control.evaluate(() => document.getElementById('slideCounter').textContent.trim());
  ok('PDF 인식', true, pages);
  await control.waitForFunction(() => document.querySelectorAll('#thumbs img').length >= 2, null, { timeout: 30000 });
  ok('썸네일 렌더', true);

  // ---- 연사 화면 ----
  const stage = await ctx.newPage();
  stage.on('pageerror', (e) => errors.push('[stage:pageerror] ' + e.message));
  stage.on('console', (m) => { if (m.type() === 'error') errors.push('[stage] ' + m.text()); });
  await stage.setViewportSize({ width: 1920, height: 1080 });
  await stage.goto(BASE + '/screen.html?role=stage&sw=1', { waitUntil: 'networkidle' });
  await stage.evaluate(() => { document.getElementById('fsHint').hidden = true; });
  await stage.waitForFunction(() => !document.getElementById('waiting').hidden === false, null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);

  const sp = await painted(stage, '#vCanvas');
  ok('연사 화면: 슬라이드가 화면 전체', sp.nonBlack > 20, JSON.stringify(sp));
  ok('연사 화면: 타이머 오버레이 표시', await vis(stage, '#tOverlay'));
  ok('연사 화면: 사이드 패널 없음(숫자만)', await stage.evaluate(() => !document.querySelector('.side') && !document.querySelector('.tcard')));
  ok('기본값에서 다음장/번호/진행바 숨김', await stage.evaluate(() =>
    document.getElementById('nextOverlay').hidden && document.getElementById('sCounter').hidden && document.getElementById('pacing').hidden));

  // 슬라이드가 화면 전체를 쓰는지 (레터박스 외 여백 없음)
  const fill = await stage.evaluate(() => {
    const c = document.getElementById('vCanvas').getBoundingClientRect();
    return { w: Math.round(c.width), h: Math.round(c.height), vw: innerWidth, vh: innerHeight };
  });
  ok('슬라이드가 화면 폭을 꽉 채움', fill.w === fill.vw, JSON.stringify(fill));

  // ---- 위치 프리셋 ----
  await control.click('#posGrid button[data-x="1"][data-y="0"]');
  await sleep(600);
  let r = await rectOf(stage, '#tOverlay');
  ok('위치 프리셋(우상) 반영', r.r > r.vw * 0.6 && r.t < r.vh * 0.2, `right=${Math.round(r.r)}/${r.vw} top=${Math.round(r.t)}`);
  ok('프리셋에서 화면 밖으로 안 나감', inside(r));

  // ---- 크기 ----
  await control.evaluate(() => { const e = document.getElementById('ovSize'); e.value = '22'; e.dispatchEvent(new Event('input')); });
  await stage.waitForFunction(() => document.getElementById('tOverlay').style.fontSize === '22vh', null, { timeout: 4000 });
  ok('크기 조절 반영 (22vh)', true);

  // ---- 큰 글자 + 네 모서리에서도 잘리지 않는지 (회귀 테스트) ----
  await control.evaluate(() => { const e = document.getElementById('ovSize'); e.value = '40'; e.dispatchEvent(new Event('input')); });
  await sleep(400);
  let allIn = true, worst = '';
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
    await control.click(`#posGrid button[data-x="${x}"][data-y="${y}"]`);
    await sleep(350);
    const rr = await rectOf(stage, '#tOverlay');
    if (!inside(rr)) { allIn = false; worst = `(${x},${y}) l=${Math.round(rr.l)} r=${Math.round(rr.r)}/${rr.vw} t=${Math.round(rr.t)} b=${Math.round(rr.b)}/${rr.vh}`; }
  }
  ok('글자 40%에서도 네 모서리 모두 화면 안', allIn, worst);
  await control.evaluate(() => { const e = document.getElementById('ovSize'); e.value = '14'; e.dispatchEvent(new Event('input')); });
  await sleep(400);

  // ---- 연사 화면에서 직접 드래그 ----
  const b0 = await rectOf(stage, '#tOverlay');
  await stage.mouse.move(b0.cx, b0.cy);
  await stage.mouse.down();
  await stage.mouse.move(480, 540, { steps: 10 });
  await stage.mouse.up();
  await sleep(500);
  r = await rectOf(stage, '#tOverlay');
  ok('연사 화면에서 드래그로 이동', Math.abs(r.cx - 480) < 25 && Math.abs(r.cy - 540) < 25, `center=(${Math.round(r.cx)},${Math.round(r.cy)}) 목표=(480,540)`);
  const fStage = await fracOf(stage);
  const fCtl = await control.evaluate(() => JSON.parse(localStorage.getItem('ycp-overlay-v1') || '{}'));
  ok('드래그 결과가 컨트롤 콘솔에 반영', Math.abs(fStage.x - fCtl.x) < 0.03 && Math.abs(fStage.y - fCtl.y) < 0.03,
     `stage=(${fStage.x.toFixed(2)},${fStage.y.toFixed(2)}) control=(${(fCtl.x||0).toFixed(2)},${(fCtl.y||0).toFixed(2)})`);

  // ---- 컨트롤 미리보기에서 드래그 ----
  const pvBox = await control.evaluate(() => {
    const r2 = document.getElementById('pvTimer').getBoundingClientRect();
    const p = document.getElementById('preview').getBoundingClientRect();
    return { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2, pl: p.left, pt: p.top, pw: p.width, ph: p.height };
  });
  await control.mouse.move(pvBox.x, pvBox.y);
  await control.mouse.down();
  await control.mouse.move(pvBox.pl + pvBox.pw * 0.5, pvBox.pt + pvBox.ph * 0.08, { steps: 10 });
  await control.mouse.up();
  await sleep(500);
  const f2 = await fracOf(stage);
  ok('콘솔 미리보기에서 드래그 → 연사 화면 이동', f2.y < 0.25 && Math.abs(f2.x - 0.5) < 0.12, `stage frac=(${f2.x.toFixed(2)},${f2.y.toFixed(2)})`);

  // ---- 관객 화면 ----
  const aud = await ctx.newPage();
  aud.on('pageerror', (e) => errors.push('[audience:pageerror] ' + e.message));
  await aud.setViewportSize({ width: 1280, height: 720 });
  await aud.goto(BASE + '/screen.html?role=audience&sw=0', { waitUntil: 'networkidle' });
  await aud.evaluate(() => { document.getElementById('fsHint').hidden = true; });
  await sleep(2000);
  ok('관객 화면: 슬라이드 렌더', (await painted(aud, '#vCanvas')).nonBlack > 20);
  ok('관객 화면: 타이머 기본 숨김', !(await vis(aud, '#tOverlay')));
  await control.click('#ovOnAudience');
  await aud.waitForFunction(() => !document.getElementById('tOverlay').hidden, null, { timeout: 4000 });
  ok('관객 화면에도 표시 옵션 동작', true);
  await control.click('#ovOnAudience');

  // ---- 옵션 토글 ----
  await control.click('#ovShowNext');
  await stage.waitForFunction(() => !document.getElementById('nextOverlay').hidden, null, { timeout: 6000 });
  ok('다음 장 썸네일 토글', true);
  await control.click('#ovShowPacing');
  await stage.waitForFunction(() => !document.getElementById('pacing').hidden, null, { timeout: 4000 });
  ok('진행 바 토글', true);

  // ---- 타이머 / 메시지 / 블랙아웃 ----
  await control.click('[data-min="5"]');
  await control.click('#btnStart');
  await sleep(1800);
  const t1 = (await stage.textContent('#tVal')).trim();
  ok('타이머 동기화', /^04:5[0-9]$/.test(t1), t1);
  // ---- 창이 가려져 있어도 타이머가 계속 가는지 (rAF 정지 회귀 테스트) ----
  await control.bringToFront();
  await sleep(300);
  const tHiddenA = (await stage.textContent('#tVal')).trim();
  await sleep(3000);
  const tHiddenB = (await stage.textContent('#tVal')).trim();
  ok('연사 화면이 가려져도 타이머 진행', tHiddenA !== tHiddenB, `${tHiddenA} → ${tHiddenB}`);
  const cHiddenA = (await control.evaluate(() => document.getElementById('timerBig').textContent.trim()));
  await stage.bringToFront();
  await sleep(2500);
  const cHiddenB = (await control.evaluate(() => document.getElementById('timerBig').textContent.trim()));
  ok('컨트롤 콘솔이 가려져도 타이머 진행', cHiddenA !== cHiddenB, `${cHiddenA} → ${cHiddenB}`);
  await control.bringToFront();

  await control.click('[data-msg="마무리해 주세요"]');
  await stage.waitForFunction(() => document.getElementById('msg').classList.contains('show'), null, { timeout: 4000 });
  ok('큐 메시지', true);
  await control.click('#btnBlack');
  await aud.waitForFunction(() => document.getElementById('screen').classList.contains('blackout'), null, { timeout: 4000 });
  ok('블랙아웃(관객 전용)', await vis(stage, '#vCanvas'));
  await control.click('#btnBlack');

  // ---- 설정 저장 ----
  const savedOk = await control.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('ycp-overlay-v1') || '{}');
    return typeof o.x === 'number' && typeof o.size === 'number';
  });
  ok('위치·크기 저장(localStorage)', savedOk);

  await control.click('#btnClearMsg');
  await sleep(600);
  await stage.screenshot({ path: path.join(DIR, 'shot-stage.png') });
  await control.screenshot({ path: path.join(DIR, 'shot-control.png'), fullPage: true });

  ok('콘솔 에러 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  console.log(log.join('\n'));
  console.log('\n' + log.filter((l) => l.startsWith('FAIL')).length + ' FAIL / ' + log.filter((l) => l.startsWith('PASS')).length + ' PASS');
})().catch((e) => { console.log(log.join('\n')); console.error('\nTEST CRASH:', e.message); process.exit(1); });
