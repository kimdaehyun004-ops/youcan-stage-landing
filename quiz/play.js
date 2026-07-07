(function () {
  const joinView = document.getElementById('join-view');
  const playView = document.getElementById('play-view');

  let playerId = localStorage.getItem('quiz_player_id');
  let token = localStorage.getItem('quiz_player_token');
  let team = localStorage.getItem('quiz_player_team');
  let name = localStorage.getItem('quiz_player_name');

  let answeredQuestionId = null;
  let myChoiceIndex = null;
  let myAnswerResult = null;
  let tickTimer = null;
  let submitting = false;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
    return data;
  }

  document.getElementById('join-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('join-error');
    errorEl.textContent = '';
    const teamVal = document.getElementById('join-team').value.trim();
    const nameVal = document.getElementById('join-name').value.trim();
    if (!teamVal || !nameVal) {
      errorEl.textContent = '소속과 이름을 모두 입력해주세요.';
      return;
    }
    try {
      const data = await api('/api/quiz/join', { team: teamVal, name: nameVal });
      playerId = data.playerId;
      token = data.token;
      team = data.player.team;
      name = data.player.name;
      localStorage.setItem('quiz_player_id', playerId);
      localStorage.setItem('quiz_player_token', token);
      localStorage.setItem('quiz_player_team', team);
      localStorage.setItem('quiz_player_name', name);
      enterPlay();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  function enterPlay() {
    joinView.style.display = 'none';
    playView.style.display = 'flex';
    document.getElementById('me-team').textContent = team;
    document.getElementById('me-name').textContent = name;
    poll();
    setInterval(poll, 1000);
  }

  const panels = {
    lobby: document.getElementById('panel-lobby'),
    question: document.getElementById('panel-question'),
    leaderboard: document.getElementById('panel-leaderboard'),
    roulette: document.getElementById('panel-roulette'),
    final: document.getElementById('panel-final'),
  };
  function showPanel(name) {
    Object.values(panels).forEach((p) => p.classList.remove('active'));
    panels[name].classList.add('active');
  }

  async function poll() {
    try {
      const res = await fetch('/api/quiz/state');
      const state = await res.json();
      render(state);
    } catch (err) {
      // ignore transient errors
    }
  }

  function render(state) {
    const me = state.leaderboard.find((p) => p.id === playerId);
    document.getElementById('me-score').textContent = `${me ? me.score : 0}점`;

    if (state.view === 'lobby') {
      showPanel('lobby');
      return;
    }
    if (state.view === 'leaderboard') {
      renderLeaderboardPanel(state, me);
      showPanel('leaderboard');
      return;
    }
    if (state.view === 'roulette') {
      renderRoulettePanel(state);
      showPanel('roulette');
      return;
    }
    if (state.view === 'final') {
      renderFinalPanel(state, me);
      showPanel('final');
      return;
    }
    renderQuestionPanel(state);
    showPanel('question');
  }

  function renderLeaderboardPanel(state, me) {
    const rank = me ? state.leaderboard.findIndex((p) => p.id === playerId) + 1 : '-';
    document.getElementById('my-rank').textContent = rank ? `${rank}위` : '-';
    document.getElementById('my-rank-score').textContent = `${me ? me.score : 0}점`;
  }

  function renderRoulettePanel(state) {
    const spin = state.rouletteSpin;
    if (spin && spin.playerId === playerId) {
      document.getElementById('roulette-title').textContent = '🎉 당첨되셨습니다!';
      document.getElementById('roulette-desc').textContent = `${spin.prizeLabel} 을(를) 받으세요`;
    } else {
      document.getElementById('roulette-title').textContent = '상품 룰렛 진행중';
      document.getElementById('roulette-desc').textContent = '큰 화면을 확인해주세요';
    }
  }

  function renderFinalPanel(state, me) {
    const rank = me ? state.leaderboard.findIndex((p) => p.id === playerId) + 1 : null;
    document.getElementById('final-rank').textContent = rank ? `${rank}위` : '-';
    document.getElementById('final-score').textContent = `${me ? me.score : 0}점`;
    const emojiEl = document.getElementById('final-emoji');
    const titleEl = document.getElementById('final-title');
    if (rank === 1) {
      emojiEl.textContent = '🥇';
      titleEl.textContent = '축하합니다! 최종 1등입니다';
    } else if (rank === 2) {
      emojiEl.textContent = '🥈';
      titleEl.textContent = '최종 2등입니다';
    } else if (rank === 3) {
      emojiEl.textContent = '🥉';
      titleEl.textContent = '최종 3등입니다';
    } else {
      emojiEl.textContent = '🎉';
      titleEl.textContent = '수고하셨습니다';
    }
  }

  function renderQuestionPanel(state) {
    const q = state.question;
    if (!q) return;

    if (answeredQuestionId !== q.id) {
      answeredQuestionId = null;
      myChoiceIndex = null;
      myAnswerResult = null;
      submitting = false;
      document.getElementById('submitted-banner').style.display = 'none';
      document.getElementById('result-banner').style.display = 'none';
    }

    document.getElementById('q-number').textContent = `문제 ${state.questionNumber} / ${state.totalQuestions}`;
    document.getElementById('q-text').textContent = q.text;

    const isReveal = q.correctIndex !== null && q.correctIndex !== undefined;
    const choicesEl = document.getElementById('q-choices');
    if (choicesEl.dataset.qid !== q.id) {
      choicesEl.dataset.qid = q.id;
      choicesEl.innerHTML = q.choices
        .map((c, i) => `<button type="button" class="choice-btn" data-idx="${i}">${escapeHtml(c)}</button>`)
        .join('');
      choicesEl.querySelectorAll('.choice-btn').forEach((btn) => {
        btn.addEventListener('click', () => submitAnswer(q, Number(btn.dataset.idx)));
      });
    }

    choicesEl.querySelectorAll('.choice-btn').forEach((btn) => {
      const idx = Number(btn.dataset.idx);
      btn.disabled = isReveal || answeredQuestionId === q.id;
      btn.classList.toggle('picked', myChoiceIndex === idx);
      btn.classList.toggle('correct', isReveal && idx === q.correctIndex);
      btn.classList.toggle('wrong', isReveal && idx !== q.correctIndex);
    });

    document.getElementById('submitted-banner').style.display = answeredQuestionId === q.id && !isReveal ? 'block' : 'none';

    const resultEl = document.getElementById('result-banner');
    if (isReveal) {
      if (answeredQuestionId === q.id && myAnswerResult) {
        if (myAnswerResult.correct) {
          const earned = q.points + (myAnswerResult.bonus || 0);
          resultEl.className = 'result-banner correct';
          resultEl.textContent = myAnswerResult.bonus ? `⚡ 정답! 가장 빨랐어요 +${earned}점` : `정답입니다! +${earned}점`;
        } else {
          resultEl.className = 'result-banner wrong';
          resultEl.textContent = '아쉽지만 오답입니다';
        }
      } else {
        resultEl.className = 'result-banner wrong';
        resultEl.textContent = '제출 시간이 지났습니다';
      }
      resultEl.style.display = 'block';
    } else {
      resultEl.style.display = 'none';
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

  async function submitAnswer(q, idx) {
    if (submitting || answeredQuestionId === q.id) return;
    submitting = true;
    myChoiceIndex = idx;
    answeredQuestionId = q.id;
    document.getElementById('submitted-banner').style.display = 'block';
    document.querySelectorAll('#q-choices .choice-btn').forEach((btn) => {
      btn.disabled = true;
      btn.classList.toggle('picked', Number(btn.dataset.idx) === idx);
    });
    try {
      const result = await api('/api/quiz/answer', { playerId, token, questionId: q.id, choiceIndex: idx });
      myAnswerResult = result;
    } catch (err) {
      document.getElementById('submitted-banner').textContent = err.message;
    }
  }

  if (playerId && token) {
    enterPlay();
  }
})();
