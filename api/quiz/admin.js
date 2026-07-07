const { isAuthed } = require('../../lib/auth');
const store = require('../../lib/quizStore');

module.exports = async (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const state = await store.getAdminState();
      res.status(200).json(state);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { action, payload } = req.body || {};

  try {
    switch (action) {
      case 'add_question': {
        const { text, choices, correctIndex, points, timeLimitSeconds } = payload || {};
        if (!text || !Array.isArray(choices) || choices.length < 2 || correctIndex === undefined) {
          res.status(400).json({ error: '문제, 보기(2개 이상), 정답을 모두 입력해주세요.' });
          return;
        }
        const question = await store.addQuestion({ text, choices, correctIndex, points, timeLimitSeconds });
        res.status(200).json({ ok: true, question });
        return;
      }
      case 'delete_question': {
        await store.deleteQuestion(payload?.id);
        res.status(200).json({ ok: true });
        return;
      }
      case 'add_prize': {
        const { label, stock } = payload || {};
        if (!label || !String(label).trim()) {
          res.status(400).json({ error: '상품명을 입력해주세요.' });
          return;
        }
        const prize = await store.addPrize({ label, stock });
        res.status(200).json({ ok: true, prize });
        return;
      }
      case 'delete_prize': {
        await store.deletePrize(payload?.id);
        res.status(200).json({ ok: true });
        return;
      }
      case 'remove_player': {
        await store.removePlayer(payload?.id);
        res.status(200).json({ ok: true });
        return;
      }
      case 'next_question': {
        const result = await store.nextQuestion();
        if (result.error) {
          res.status(400).json(result);
          return;
        }
        res.status(200).json(result);
        return;
      }
      case 'reveal_answer': {
        const result = await store.revealAnswer();
        res.status(200).json(result);
        return;
      }
      case 'set_view': {
        const result = await store.setView(payload?.view);
        if (result.error) {
          res.status(400).json(result);
          return;
        }
        res.status(200).json(result);
        return;
      }
      case 'spin_roulette': {
        const result = await store.spinRoulette({ playerId: payload?.playerId });
        if (result.error) {
          res.status(400).json(result);
          return;
        }
        res.status(200).json(result);
        return;
      }
      case 'final_reveal': {
        const result = await store.finalReveal();
        res.status(200).json(result);
        return;
      }
      case 'reset_game': {
        const result = await store.resetGame();
        res.status(200).json(result);
        return;
      }
      default:
        res.status(400).json({ error: '알 수 없는 action입니다.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
