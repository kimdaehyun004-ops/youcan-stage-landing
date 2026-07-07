(function () {
  const COLORS = ['#E53935', '#1E88E5', '#FDD835', '#43A047', '#8E24AA', '#FB8C00', '#00ACC1', '#D81B60'];

  const views = {
    lobby: document.getElementById('view-lobby'),
    question: document.getElementById('view-question'),
    leaderboard: document.getElementById('view-leaderboard'),
    roulette: document.getElementById('view-roulette'),
    final: document.getElementById('view-final'),
  };

  let currentView = 'lobby';
  let lastQuestionId = null;
  let lastRevealPhase = null;
  let lastSpinAt = null;
  let lastFinal = false;
  let wheelPrizeIds = [];
  let tickTimer = null;
  let latestState = null;

  function setView(name) {
    if (currentView === name) return;
    Object.values(views).forEach((v) => v.classList.remove('active'));
    views[name].classList.add('active');
    currentView = name;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function poll() {
    try {
      const res = await fetch('/api/quiz/state');
      const state = await res.json();
      latestState = state;
      render(state);
    } catch (err) {
      // keep last known view on transient network errors
    }
  }

  function render(state) {
    document.getElementById('players-badge').textContent = `참가자 ${state.totalPlayers}명`;

    if (state.view === 'lobby') {
      document.getElementById('lobby-count').textContent = `${state.totalPlayers}명 참가중`;
      setView('lobby');
      return;
    }
    if (state.view === 'leaderboard') {
      renderLeaderboard(state);
      setView('leaderboard');
      return;
    }
    if (state.view === 'roulette') {
      renderRoulette(state);
      setView('roulette');
      return;
    }
    if (state.view === 'final') {
      renderFinal(state);
      setView('final');
      return;
    }
    renderQuestion(state);
    setView('question');
  }

  function renderQuestion(state) {
    const q = state.question;
    if (!q) return;
    document.getElementById('q-number').textContent = `문제 ${state.questionNumber} / ${state.totalQuestions}`;
    document.getElementById('q-text').textContent = q.text;

    const choicesEl = document.getElementById('q-choices');
    if (lastQuestionId !== q.id) {
      choicesEl.innerHTML = q.choices
        .map((c, i) => `<div class="choice-btn" data-idx="${i}">${escapeHtml(c)}</div>`)
        .join('');
      lastQuestionId = q.id;
      lastRevealPhase = null;
    }

    const isReveal = q.correctIndex !== null && q.correctIndex !== undefined;
    if (isReveal !== lastRevealPhase) {
      choicesEl.querySelectorAll('.choice-btn').forEach((el) => {
        const idx = Number(el.dataset.idx);
        el.classList.toggle('correct', isReveal && idx === q.correctIndex);
        el.classList.toggle('wrong', isReveal && idx !== q.correctIndex);
      });
      lastRevealPhase = isReveal;
    }

    const statsEl = document.getElementById('reveal-stats');
    if (isReveal && state.answerStats) {
      statsEl.innerHTML = `정답자 <b>${state.answerStats.correctCount}</b>명 / 제출 ${state.answerStats.totalAnswered}명${
        state.answerStats.firstCorrectName ? ` · ⚡ 최초 정답: <b>${escapeHtml(state.answerStats.firstCorrectName)}</b>` : ''
      }`;
    } else {
      statsEl.textContent = '';
    }

    startTimer(q, isReveal);
  }

  function startTimer(q, isReveal) {
    if (tickTimer) clearInterval(tickTimer);
    const numEl = document.getElementById('q-timer-num');
    const fillEl = document.getElementById('timer-fill');
    if (isReveal) {
      numEl.textContent = '정답 공개';
      fillEl.style.width = '100%';
      fillEl.classList.remove('urgent');
      return;
    }
    const totalMs = q.timeLimitSeconds * 1000;
    function tick() {
      const elapsed = Date.now() - q.questionStartedAt;
      const remain = Math.max(0, totalMs - elapsed);
      const pct = Math.max(0, Math.min(100, (remain / totalMs) * 100));
      fillEl.style.width = `${pct}%`;
      fillEl.classList.toggle('urgent', remain < totalMs * 0.25);
      numEl.textContent = `${Math.ceil(remain / 1000)}초`;
      if (remain <= 0) clearInterval(tickTimer);
    }
    tick();
    tickTimer = setInterval(tick, 150);
  }

  function renderLeaderboard(state) {
    const el = document.getElementById('board-list');
    el.innerHTML = state.leaderboard
      .slice(0, 10)
      .map(
        (p, i) => `
      <div class="leaderboard-row ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">
        <div class="rank">${i + 1}</div>
        <div class="who"><div class="team">${escapeHtml(p.team)}</div><div class="name">${escapeHtml(p.name)}</div></div>
        <div class="score">${p.score}점</div>
      </div>`
      )
      .join('');
  }

  function buildWheel(prizes) {
    const svg = document.getElementById('wheel-svg');
    wheelPrizeIds = prizes.map((p) => p.id);
    const n = prizes.length;
    if (n === 0) {
      svg.innerHTML = '<circle cx="100" cy="100" r="96" fill="#1B1826" stroke="#FFD400" stroke-width="4"/>';
      return;
    }
    const slice = 360 / n;
    let html = '';
    prizes.forEach((p, i) => {
      const start = i * slice;
      const end = start + slice;
      html += arcPath(start, end, COLORS[i % COLORS.length]);
    });
    svg.innerHTML = html;
    svg.style.transition = 'none';
    svg.style.transform = 'rotate(0deg)';
  }

  function arcPath(startDeg, endDeg, fill) {
    const toXY = (deg) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return [100 + 96 * Math.cos(rad), 100 + 96 * Math.sin(rad)];
    };
    const [x1, y1] = toXY(startDeg);
    const [x2, y2] = toXY(endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `<path d="M100,100 L${x1},${y1} A96,96 0 ${largeArc} 1 ${x2},${y2} Z" fill="${fill}" stroke="#0A0910" stroke-width="1"/>`;
  }

  let wheelRotation = 0;
  function renderRoulette(state) {
    const prizes = state.prizes || [];
    if (wheelPrizeIds.join(',') !== prizes.map((p) => p.id).join(',')) {
      buildWheel(prizes);
      wheelRotation = 0;
    }

    const spin = state.rouletteSpin;
    const resultEl = document.getElementById('roulette-result');
    if (!spin) {
      resultEl.classList.remove('show');
      return;
    }
    if (spin.at === lastSpinAt) return;
    lastSpinAt = spin.at;
    resultEl.classList.remove('show');

    const idx = wheelPrizeIds.indexOf(spin.prizeId);
    const n = wheelPrizeIds.length || 1;
    const slice = 360 / n;
    const centerAngle = idx >= 0 ? idx * slice + slice / 2 : 0;
    const svg = document.getElementById('wheel-svg');

    svg.style.transition = 'none';
    svg.style.transform = `rotate(${wheelRotation % 360}deg)`;
    void svg.offsetWidth;

    const targetRotation = wheelRotation - (wheelRotation % 360) + 360 * 5 + (360 - centerAngle);
    wheelRotation = targetRotation;
    svg.style.transition = 'transform 4.5s cubic-bezier(.17,.67,.16,1.01)';
    svg.style.transform = `rotate(${targetRotation}deg)`;

    setTimeout(() => {
      resultEl.innerHTML = `🎉 ${escapeHtml(spin.playerName)}님 → <span class="prize">${escapeHtml(spin.prizeLabel)}</span>`;
      resultEl.classList.add('show');
    }, 4600);
  }

  function renderFinal(state) {
    const el = document.getElementById('final-podium');
    const top3 = state.leaderboard.slice(0, 3);
    if (top3.length === 0) {
      el.innerHTML = '<div style="color:var(--muted);">참가자가 없습니다.</div>';
      return;
    }
    const order = [top3[1], top3[0], top3[2]].filter(Boolean);
    const rankOf = (p) => top3.indexOf(p) + 1;
    el.innerHTML = order
      .map((p) => {
        const rank = rankOf(p);
        return `
        <div class="slot rank${rank}">
          ${rank === 1 ? '<div class="crown">👑</div>' : ''}
          <div class="box">
            <div class="team">${escapeHtml(p.team)}</div>
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="score">${p.score}점</div>
          </div>
        </div>`;
      })
      .join('');

    if (!lastFinal) {
      lastFinal = true;
      launchConfetti();
    }
  }

  function launchConfetti() {
    for (let i = 0; i < 80; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.left = `${Math.random() * 100}vw`;
      el.style.background = COLORS[i % COLORS.length];
      el.style.animationDuration = `${2.5 + Math.random() * 2}s`;
      el.style.animationDelay = `${Math.random() * 1.5}s`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 6000);
    }
  }

  poll();
  setInterval(poll, 1000);
})();
