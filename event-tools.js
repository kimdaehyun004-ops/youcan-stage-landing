(function () {
  'use strict';

  /* ---------- utils ---------- */
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* offline/storage disabled: ignore */ }
  }
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  /* ---------- short synthesized beep (no audio files, works offline) ---------- */
  let audioCtx = null;
  function beep(freq, duration, gain) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      g.gain.setValueAtTime(gain, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) { /* audio unsupported: ignore */ }
  }

  /* ---------- tab switching ---------- */
  const tabs = document.querySelectorAll('.tools-tab');
  const panels = document.querySelectorAll('.tool-panel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('panel-' + tab.dataset.tool);
      if (panel) panel.classList.add('active');
    });
  });

  /* ================= Roulette ================= */
  (function initRoulette() {
    const canvas = document.getElementById('roulette-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, radius = size / 2 - 8;
    const palette = ['#FFD400', '#FF6B6B', '#4ECDC4', '#7C6CF6', '#FF9F45', '#5AD8A6', '#FF5E9C', '#57B8FF', '#C9A400', '#B084F5'];

    const itemsEl = document.getElementById('roulette-items');
    const applyBtn = document.getElementById('roulette-apply');
    const spinBtn = document.getElementById('roulette-spin');
    const resultEl = document.getElementById('roulette-result');
    const soundEl = document.getElementById('roulette-sound');

    let items = [];
    let rotation = 0;
    let spinning = false;

    function parseItems() {
      return itemsEl.value.split('\n').map((s) => s.trim()).filter(Boolean);
    }

    function draw() {
      const n = items.length;
      ctx.clearRect(0, 0, size, size);
      if (n === 0) return;
      const sliceAngle = (Math.PI * 2) / n;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      for (let i = 0; i < n; i++) {
        const start = i * sliceAngle;
        const end = start + sliceAngle;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = palette[i % palette.length];
        ctx.fill();
        ctx.strokeStyle = 'rgba(10,9,16,.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        const midAngle = start + sliceAngle / 2;
        ctx.rotate(midAngle);
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#0A0910';
        ctx.font = '700 15px Pretendard, sans-serif';
        const label = items[i].length > 12 ? items[i].slice(0, 11) + '…' : items[i];
        const flip = midAngle > Math.PI / 2 && midAngle < Math.PI * 1.5;
        if (flip) {
          ctx.rotate(Math.PI);
          ctx.textAlign = 'left';
          ctx.fillText(label, -(radius - 16), 0);
        } else {
          ctx.textAlign = 'right';
          ctx.fillText(label, radius - 16, 0);
        }
        ctx.restore();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#0A0910';
      ctx.fill();
      ctx.strokeStyle = '#FFD400';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    function applyItems() {
      const parsed = parseItems();
      items = parsed.length ? parsed : ['항목을 입력하세요'];
      save('eventTools.rouletteItems', itemsEl.value);
      rotation = 0;
      resultEl.textContent = '';
      draw();
    }

    function sliceUnderPointer() {
      const n = items.length;
      if (!n) return -1;
      const sliceAngle = (Math.PI * 2) / n;
      const norm = ((-Math.PI / 2 - rotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      return Math.floor(norm / sliceAngle);
    }

    function spin() {
      if (spinning) return;
      if (items.length < 2) {
        resultEl.textContent = '항목을 2개 이상 입력해 주세요.';
        return;
      }
      spinning = true;
      spinBtn.disabled = true;
      resultEl.textContent = '';

      const n = items.length;
      const sliceAngle = (Math.PI * 2) / n;
      const winnerIndex = randInt(0, n - 1);
      const jitter = rand(-sliceAngle * 0.35, sliceAngle * 0.35);

      let targetMod = -Math.PI / 2 - (winnerIndex * sliceAngle + sliceAngle / 2) - jitter;
      targetMod = ((targetMod % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

      const extraTurns = 6 + randInt(0, 3);
      const startRotation = rotation;
      const currentMod = ((startRotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      let delta = targetMod - currentMod;
      if (delta < 0) delta += Math.PI * 2;
      const finalRotation = startRotation + extraTurns * Math.PI * 2 + delta;

      const duration = 5200;
      const start = performance.now();
      let lastTickSlice = sliceUnderPointer();

      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = easeOutQuint(t);
        rotation = startRotation + (finalRotation - startRotation) * eased;
        draw();

        const sliceNow = sliceUnderPointer();
        if (sliceNow !== lastTickSlice) {
          lastTickSlice = sliceNow;
          if (soundEl.checked) beep(320 + randInt(0, 40), 0.05, 0.05);
        }

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          spinning = false;
          spinBtn.disabled = false;
          resultEl.textContent = '당첨: ' + items[winnerIndex];
          if (soundEl.checked) beep(660, 0.35, 0.08);
        }
      }
      requestAnimationFrame(frame);
    }

    const savedItems = load('eventTools.rouletteItems', null);
    if (savedItems) itemsEl.value = savedItems;
    applyItems();

    applyBtn.addEventListener('click', applyItems);
    spinBtn.addEventListener('click', spin);
  })();

  /* ================= Slot machine ================= */
  (function initSlot() {
    const reelsWrap = document.getElementById('slot-reels');
    if (!reelsWrap) return;
    const symbolsInput = document.getElementById('slot-symbols');
    const reelCountInput = document.getElementById('slot-reel-count');
    const applyBtn = document.getElementById('slot-apply');
    const spinBtn = document.getElementById('slot-spin');
    const resultEl = document.getElementById('slot-result');

    const SYMBOL_HEIGHT = window.innerWidth <= 500 ? 76 : 96;
    const CYCLES = 10;
    let symbols = [];
    let spinning = false;

    function parseSymbols() {
      return symbolsInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    }

    function buildReels() {
      symbols = parseSymbols();
      if (symbols.length < 2) symbols = ['🍒', '🍋', '🍊', '⭐'];
      const reelCount = Math.min(5, Math.max(3, parseInt(reelCountInput.value, 10) || 3));
      reelCountInput.value = reelCount;
      save('eventTools.slotSymbols', symbolsInput.value);
      save('eventTools.slotReelCount', reelCount);

      reelsWrap.innerHTML = '';
      reelsWrap.classList.remove('jackpot');
      reelsWrap.style.setProperty('--reel-count', reelCount);
      for (let r = 0; r < reelCount; r++) {
        const reel = document.createElement('div');
        reel.className = 'slot-reel';
        const strip = document.createElement('div');
        strip.className = 'slot-strip';
        let html = '';
        for (let c = 0; c < CYCLES; c++) {
          symbols.forEach((s) => { html += '<div class="slot-symbol">' + s + '</div>'; });
        }
        strip.innerHTML = html;
        strip.style.transform = 'translateY(0px)';
        reel.appendChild(strip);
        reelsWrap.appendChild(reel);
      }
      resultEl.textContent = '';
    }

    function spinReel(strip, duration, landIndex) {
      return new Promise((resolve) => {
        const k = symbols.length;
        const loops = 3 + randInt(0, 2);
        const targetOffset = (loops * k + landIndex) * SYMBOL_HEIGHT;

        requestAnimationFrame(() => {
          strip.style.transition = 'transform ' + duration + 'ms cubic-bezier(.11,.79,.22,1)';
          strip.style.transform = 'translateY(-' + targetOffset + 'px)';
        });

        setTimeout(() => {
          strip.style.transition = 'none';
          strip.style.transform = 'translateY(-' + (landIndex * SYMBOL_HEIGHT) + 'px)';
          beep(300 + landIndex * 15, 0.07, 0.05);
          resolve();
        }, duration + 30);
      });
    }

    function spin() {
      if (spinning) return;
      spinning = true;
      spinBtn.disabled = true;
      resultEl.textContent = '';
      reelsWrap.classList.remove('jackpot');

      const strips = reelsWrap.querySelectorAll('.slot-strip');
      const landed = [];
      const promises = [];
      strips.forEach((strip, i) => {
        const idx = randInt(0, symbols.length - 1);
        landed.push(idx);
        const duration = 1700 + i * 500;
        promises.push(spinReel(strip, duration, idx));
      });

      Promise.all(promises).then(() => {
        spinning = false;
        spinBtn.disabled = false;
        const combo = landed.map((i) => symbols[i]).join(' ');
        const jackpot = landed.every((v) => v === landed[0]);
        reelsWrap.classList.toggle('jackpot', jackpot);
        resultEl.textContent = jackpot ? '🎉 잭팟! ' + combo : '결과: ' + combo;
        if (jackpot) beep(880, 0.4, 0.09);
      });
    }

    const savedSymbols = load('eventTools.slotSymbols', null);
    const savedCount = load('eventTools.slotReelCount', null);
    if (savedSymbols) symbolsInput.value = savedSymbols;
    if (savedCount) reelCountInput.value = savedCount;
    buildReels();

    applyBtn.addEventListener('click', buildReels);
    spinBtn.addEventListener('click', spin);
  })();

  /* ================= Lotto draw ================= */
  (function initLotto() {
    const ballsEl = document.getElementById('lotto-balls');
    if (!ballsEl) return;
    const drawBtn = document.getElementById('lotto-draw');
    const resetBtn = document.getElementById('lotto-reset');
    const resultEl = document.getElementById('lotto-result');
    const historyEl = document.getElementById('lotto-history');
    const modeSelect = document.getElementById('lotto-mode');
    const customFields = document.getElementById('lotto-custom-fields');
    const minInput = document.getElementById('lotto-min');
    const maxInput = document.getElementById('lotto-max');
    const countInput = document.getElementById('lotto-count');

    let drawing = false;
    let history = load('eventTools.lottoHistory', []);

    function ballClass(n, min, max) {
      const span = Math.max(1, max - min + 1);
      const ratio = (n - min) / span;
      if (ratio < 0.2) return 'ball-1';
      if (ratio < 0.4) return 'ball-2';
      if (ratio < 0.6) return 'ball-3';
      if (ratio < 0.8) return 'ball-4';
      return 'ball-5';
    }

    function renderHistory() {
      if (!history.length) { historyEl.innerHTML = ''; return; }
      historyEl.innerHTML = '<p class="lotto-history-title">지난 추첨 기록</p>' +
        history.map((h) => '<div class="lotto-history-row">' + h.map((n) => '<span>' + n + '</span>').join('') + '</div>').join('');
    }

    function currentRange() {
      if (modeSelect.value === 'lotto645') return { min: 1, max: 45, count: 6 };
      const min = parseInt(minInput.value, 10);
      const max = parseInt(maxInput.value, 10);
      const count = parseInt(countInput.value, 10);
      return {
        min: Number.isFinite(min) ? min : 1,
        max: Number.isFinite(max) ? max : 45,
        count: Number.isFinite(count) ? count : 6,
      };
    }

    function pickNumbers(min, max, count) {
      const pool = [];
      for (let i = min; i <= max; i++) pool.push(i);
      return shuffle(pool).slice(0, Math.min(count, pool.length)).sort((a, b) => a - b);
    }

    function animateBall(el, finalNum, min, max, delay) {
      return new Promise((resolve) => {
        setTimeout(() => {
          el.classList.add('show');
          let ticks = 0;
          const maxTicks = 10 + randInt(0, 6);
          const timer = setInterval(() => {
            el.textContent = randInt(min, max);
            ticks++;
            if (ticks >= maxTicks) {
              clearInterval(timer);
              el.textContent = finalNum;
              el.className = 'lotto-ball show ' + ballClass(finalNum, min, max);
              beep(520 + randInt(0, 60), 0.08, 0.05);
              resolve();
            }
          }, 45);
        }, delay);
      });
    }

    function draw() {
      if (drawing) return;
      const range = currentRange();
      const min = range.min, max = range.max, count = range.count;
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || count < 1 || count > (max - min + 1)) {
        resultEl.textContent = '범위와 추첨 개수를 확인해 주세요.';
        return;
      }
      drawing = true;
      drawBtn.disabled = true;
      resultEl.textContent = '';
      ballsEl.innerHTML = '';

      const numbers = pickNumbers(min, max, count);
      const els = numbers.map(() => {
        const el = document.createElement('div');
        el.className = 'lotto-ball';
        ballsEl.appendChild(el);
        return el;
      });

      Promise.all(els.map((el, i) => animateBall(el, numbers[i], min, max, i * 500))).then(() => {
        drawing = false;
        drawBtn.disabled = false;
        resultEl.textContent = '추첨 완료: ' + numbers.join(', ');
        history.unshift(numbers);
        history = history.slice(0, 10);
        save('eventTools.lottoHistory', history);
        renderHistory();
      });
    }

    modeSelect.addEventListener('change', () => {
      customFields.hidden = modeSelect.value !== 'custom';
    });

    drawBtn.addEventListener('click', draw);
    resetBtn.addEventListener('click', () => {
      ballsEl.innerHTML = '';
      resultEl.textContent = '';
      history = [];
      save('eventTools.lottoHistory', history);
      renderHistory();
    });

    renderHistory();
  })();
})();
