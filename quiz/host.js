(function () {
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const logoutBtn = document.getElementById('logout-btn');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');

  let pollTimer = null;
  let latestState = null;

  async function api(path, opts) {
    const res = await fetch(path, {
      method: opts?.method || 'GET',
      headers: opts?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
    return data;
  }

  async function checkSession() {
    const { authed } = await api('/api/session');
    if (authed) {
      showApp();
    } else {
      loginView.style.display = 'block';
      appView.style.display = 'none';
      logoutBtn.style.display = 'none';
    }
  }

  loginBtn.addEventListener('click', async () => {
    loginError.textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: { password: passwordInput.value } });
      showApp();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  logoutBtn.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    clearInterval(pollTimer);
    loginView.style.display = 'block';
    appView.style.display = 'none';
    logoutBtn.style.display = 'none';
  });

  function showApp() {
    loginView.style.display = 'none';
    appView.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    document.getElementById('join-url').textContent = `${location.origin}/quiz/play.html`;
    resetQuestionForm();
    refresh();
    pollTimer = setInterval(refresh, 2000);
  }

  // ---- tabs ----
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // ---- refresh / render ----
  async function refresh() {
    try {
      latestState = await api('/api/quiz/admin');
      render(latestState);
    } catch (err) {
      // session may have expired
    }
  }

  const PHASE_LABEL = { lobby: '대기중', question: '문제 진행중', reveal: '정답 공개' };
  const VIEW_LABEL = { lobby: '대기 화면', question: '문제 화면', leaderboard: '순위 화면', roulette: '룰렛 화면', final: '최종 발표' };

  function render(state) {
    const { game, questions, players, prizes } = state;

    document.getElementById('stat-players').textContent = players.length;
    document.getElementById('stat-qnum').textContent = game.currentIndex >= 0 ? `${game.currentIndex + 1} / ${questions.length}` : `- / ${questions.length}`;
    document.getElementById('stat-phase').textContent = PHASE_LABEL[game.phase] || game.phase;
    document.getElementById('stat-view').textContent = VIEW_LABEL[game.view] || game.view;

    renderCurrentQuestion(game, questions, players);
    renderQuestionList(questions);
    renderPrizeList(prizes);
    renderPlayerList(players);
    renderRouletteSelect(players);
  }

  function renderCurrentQuestion(game, questions, players) {
    const box = document.getElementById('current-question-box');
    const q = questions.find((x) => x.id === game.currentQuestionId);
    if (!q) {
      box.innerHTML = '<div style="color:var(--muted);font-size:14px;">아직 출제 전입니다.</div>';
      return;
    }
    const answeredCount = players.length; // fallback display; exact count comes from state endpoint stats on reveal
    box.innerHTML = `
      <div style="font-weight:700;font-size:16px;margin-bottom:8px;">${escapeHtml(q.text)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${q.choices.map((c, i) => `<span class="pill${i === q.correctIndex && game.phase === 'reveal' ? ' live' : ''}">${i + 1}. ${escapeHtml(c)}</span>`).join('')}
      </div>
      <div style="margin-top:10px;font-size:12px;color:var(--muted);">배점 ${q.points}점 · 제한시간 ${q.timeLimitSeconds}초 · 정답 ${q.correctIndex + 1}번</div>
    `;
  }

  function renderQuestionList(questions) {
    const el = document.getElementById('question-list');
    if (questions.length === 0) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 문제가 없습니다.</div>';
      return;
    }
    el.innerHTML = questions
      .map(
        (q, idx) => `
      <div class="list-item">
        <div>
          <div>${idx + 1}. ${escapeHtml(q.text)}</div>
          <div class="meta">정답: ${escapeHtml(q.choices[q.correctIndex] || '')} · ${q.points}점 · ${q.timeLimitSeconds}초</div>
        </div>
        <button class="danger" data-del-question="${q.id}">삭제</button>
      </div>`
      )
      .join('');
    el.querySelectorAll('[data-del-question]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 문제를 삭제할까요?')) return;
        await api('/api/quiz/admin', { method: 'POST', body: { action: 'delete_question', payload: { id: btn.dataset.delQuestion } } });
        refresh();
      });
    });
  }

  function renderPrizeList(prizes) {
    const el = document.getElementById('prize-list');
    if (prizes.length === 0) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">등록된 상품이 없습니다.</div>';
      return;
    }
    el.innerHTML = prizes
      .map(
        (p) => `
      <div class="list-item">
        <div>
          <div>${escapeHtml(p.label)}</div>
          <div class="meta">남은 수량 ${p.remaining} / ${p.stock}</div>
        </div>
        <button class="danger" data-del-prize="${p.id}">삭제</button>
      </div>`
      )
      .join('');
    el.querySelectorAll('[data-del-prize]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 상품을 삭제할까요?')) return;
        await api('/api/quiz/admin', { method: 'POST', body: { action: 'delete_prize', payload: { id: btn.dataset.delPrize } } });
        refresh();
      });
    });
  }

  function renderPlayerList(players) {
    const el = document.getElementById('player-list');
    if (players.length === 0) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;">아직 참가자가 없습니다.</div>';
      return;
    }
    el.innerHTML = players
      .map(
        (p) => `
      <div class="list-item">
        <div>
          <div>${escapeHtml(p.team)} · ${escapeHtml(p.name)}</div>
          <div class="meta">${p.score}점</div>
        </div>
        <button class="danger" data-del-player="${p.id}">내보내기</button>
      </div>`
      )
      .join('');
    el.querySelectorAll('[data-del-player]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('이 참가자를 내보낼까요?')) return;
        await api('/api/quiz/admin', { method: 'POST', body: { action: 'remove_player', payload: { id: btn.dataset.delPlayer } } });
        refresh();
      });
    });
  }

  function renderRouletteSelect(players) {
    const select = document.getElementById('roulette-player');
    const current = select.value;
    select.innerHTML = players.map((p) => `<option value="${p.id}">${escapeHtml(p.team)} · ${escapeHtml(p.name)} (${p.score}점)</option>`).join('');
    if (current) select.value = current;
  }

  // ---- question form ----
  let choiceCount = 0;
  function resetQuestionForm() {
    document.getElementById('q-text').value = '';
    document.getElementById('q-choices').innerHTML = '';
    document.getElementById('q-points').value = 10;
    document.getElementById('q-time').value = 20;
    document.getElementById('q-error').textContent = '';
    choiceCount = 0;
    addChoiceRow();
    addChoiceRow();
  }

  function addChoiceRow() {
    if (choiceCount >= 6) return;
    const idx = choiceCount++;
    const wrap = document.getElementById('q-choices');
    const row = document.createElement('div');
    row.className = 'choice-row';
    row.innerHTML = `
      <input type="radio" name="q-correct" value="${idx}" ${idx === 0 ? 'checked' : ''}>
      <input type="text" placeholder="보기 ${idx + 1}">
    `;
    wrap.appendChild(row);
  }

  document.getElementById('btn-add-choice').addEventListener('click', addChoiceRow);

  document.getElementById('btn-add-question').addEventListener('click', async () => {
    const errorEl = document.getElementById('q-error');
    errorEl.textContent = '';
    const text = document.getElementById('q-text').value.trim();
    const rows = Array.from(document.querySelectorAll('#q-choices .choice-row'));
    const choices = rows.map((r) => r.querySelector('input[type=text]').value.trim());
    const correctRadio = document.querySelector('input[name=q-correct]:checked');
    const points = Number(document.getElementById('q-points').value) || 10;
    const timeLimitSeconds = Number(document.getElementById('q-time').value) || 20;

    if (!text || choices.some((c) => !c) || choices.length < 2 || !correctRadio) {
      errorEl.textContent = '문제와 모든 보기를 입력해주세요.';
      return;
    }

    try {
      await api('/api/quiz/admin', {
        method: 'POST',
        body: { action: 'add_question', payload: { text, choices, correctIndex: Number(correctRadio.value), points, timeLimitSeconds } },
      });
      resetQuestionForm();
      refresh();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  // ---- prize form ----
  document.getElementById('btn-add-prize').addEventListener('click', async () => {
    const errorEl = document.getElementById('prize-error');
    errorEl.textContent = '';
    const label = document.getElementById('prize-label').value.trim();
    const stock = Number(document.getElementById('prize-stock').value) || 1;
    if (!label) {
      errorEl.textContent = '상품명을 입력해주세요.';
      return;
    }
    try {
      await api('/api/quiz/admin', { method: 'POST', body: { action: 'add_prize', payload: { label, stock } } });
      document.getElementById('prize-label').value = '';
      document.getElementById('prize-stock').value = 1;
      refresh();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById('btn-spin').addEventListener('click', async () => {
    const resultEl = document.getElementById('roulette-result');
    const playerId = document.getElementById('roulette-player').value;
    if (!playerId) {
      resultEl.textContent = '참가자를 선택해주세요.';
      return;
    }
    try {
      const { spin } = await api('/api/quiz/admin', { method: 'POST', body: { action: 'spin_roulette', payload: { playerId } } });
      resultEl.textContent = `🎉 ${spin.playerName}님 → ${spin.prizeLabel} 당첨!`;
      refresh();
    } catch (err) {
      resultEl.textContent = err.message;
    }
  });

  // ---- control buttons ----
  document.getElementById('btn-next-question').addEventListener('click', async () => {
    try {
      await api('/api/quiz/admin', { method: 'POST', body: { action: 'next_question' } });
      refresh();
    } catch (err) {
      alert(err.message);
    }
  });
  document.getElementById('btn-reveal').addEventListener('click', async () => {
    await api('/api/quiz/admin', { method: 'POST', body: { action: 'reveal_answer' } });
    refresh();
  });
  document.getElementById('btn-view-leaderboard').addEventListener('click', async () => {
    await api('/api/quiz/admin', { method: 'POST', body: { action: 'set_view', payload: { view: 'leaderboard' } } });
    refresh();
  });
  document.getElementById('btn-view-question').addEventListener('click', async () => {
    await api('/api/quiz/admin', { method: 'POST', body: { action: 'set_view', payload: { view: 'question' } } });
    refresh();
  });
  document.getElementById('btn-view-final').addEventListener('click', async () => {
    await api('/api/quiz/admin', { method: 'POST', body: { action: 'final_reveal' } });
    refresh();
  });
  document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('참가자와 점수, 진행 상태를 모두 초기화합니다. 계속할까요?')) return;
    await api('/api/quiz/admin', { method: 'POST', body: { action: 'reset_game' } });
    refresh();
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  checkSession();
})();
