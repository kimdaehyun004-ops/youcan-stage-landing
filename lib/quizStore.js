const crypto = require('crypto');
const { getRedis } = require('./redis');

const K = {
  game: 'quiz:game',
  questions: 'quiz:questions',
  questionOrder: 'quiz:questionOrder',
  players: 'quiz:players',
  tokens: 'quiz:tokens',
  scores: 'quiz:scores',
  prizes: 'quiz:prizes',
  prizeOrder: 'quiz:prizeOrder',
  answered: (qid) => `quiz:answered:${qid}`,
  buzz: (qid) => `quiz:buzz:${qid}`,
};

const DEFAULT_GAME = {
  phase: 'lobby', // lobby | question | reveal
  view: 'lobby', // lobby | question | leaderboard | roulette | final
  currentQuestionId: null,
  currentIndex: -1,
  questionStartedAt: null,
  rouletteSpin: null,
  finalRevealed: false,
};

function id() {
  return crypto.randomUUID();
}

async function getGame() {
  const redis = getRedis();
  const raw = await redis.hgetall(K.game);
  if (!raw) return { ...DEFAULT_GAME };
  return { ...DEFAULT_GAME, ...raw };
}

async function setGame(patch) {
  const redis = getRedis();
  await redis.hset(K.game, patch);
}

async function listQuestions() {
  const redis = getRedis();
  const ids = (await redis.lrange(K.questionOrder, 0, -1)) || [];
  if (ids.length === 0) return [];
  const map = await redis.hgetall(K.questions);
  return ids.map((qid) => map?.[qid]).filter(Boolean);
}

async function addQuestion({ text, choices, correctIndex, points, timeLimitSeconds }) {
  const redis = getRedis();
  const qid = id();
  const question = {
    id: qid,
    text: String(text).trim(),
    choices: choices.map((c) => String(c).trim()),
    correctIndex: Number(correctIndex),
    points: Number.isFinite(points) && points > 0 ? Math.round(points) : 10,
    timeLimitSeconds: Number.isFinite(timeLimitSeconds) && timeLimitSeconds > 0 ? Math.round(timeLimitSeconds) : 20,
  };
  await redis.hset(K.questions, { [qid]: question });
  await redis.rpush(K.questionOrder, qid);
  return question;
}

async function deleteQuestion(qid) {
  const redis = getRedis();
  await redis.hdel(K.questions, qid);
  await redis.lrem(K.questionOrder, 0, qid);
  await redis.del(K.answered(qid), K.buzz(qid));
}

async function listPrizes() {
  const redis = getRedis();
  const ids = (await redis.lrange(K.prizeOrder, 0, -1)) || [];
  if (ids.length === 0) return [];
  const map = await redis.hgetall(K.prizes);
  return ids.map((pid) => map?.[pid]).filter(Boolean);
}

async function addPrize({ label, stock }) {
  const redis = getRedis();
  const pid = id();
  const count = Number.isFinite(stock) && stock > 0 ? Math.round(stock) : 1;
  const prize = { id: pid, label: String(label).trim(), stock: count, remaining: count };
  await redis.hset(K.prizes, { [pid]: prize });
  await redis.rpush(K.prizeOrder, pid);
  return prize;
}

async function deletePrize(pid) {
  const redis = getRedis();
  await redis.hdel(K.prizes, pid);
  await redis.lrem(K.prizeOrder, 0, pid);
}

async function listPlayers() {
  const redis = getRedis();
  const map = await redis.hgetall(K.players);
  if (!map) return [];
  const players = Object.values(map);
  const withScores = await Promise.all(
    players.map(async (p) => ({ ...p, score: (await redis.zscore(K.scores, p.id)) || 0 }))
  );
  return withScores.sort((a, b) => b.score - a.score);
}

async function getLeaderboard(limit = 500) {
  const redis = getRedis();
  const flat = (await redis.zrange(K.scores, 0, limit - 1, { rev: true, withScores: true })) || [];
  const map = (await redis.hgetall(K.players)) || {};
  const board = [];
  for (let i = 0; i < flat.length; i += 2) {
    const playerId = flat[i];
    const score = Number(flat[i + 1]) || 0;
    const info = map[playerId];
    if (!info) continue;
    board.push({ id: playerId, team: info.team, name: info.name, score });
  }
  return board;
}

async function joinPlayer({ team, name }) {
  const redis = getRedis();
  const playerId = id();
  const token = id();
  const player = { id: playerId, team: String(team).trim().slice(0, 40), name: String(name).trim().slice(0, 40), joinedAt: Date.now() };
  await redis.hset(K.players, { [playerId]: player });
  await redis.hset(K.tokens, { [playerId]: token });
  await redis.zadd(K.scores, { score: 0, member: playerId });
  return { playerId, token, player };
}

async function verifyPlayer(playerId, token) {
  if (!playerId || !token) return false;
  const redis = getRedis();
  const stored = await redis.hget(K.tokens, playerId);
  return stored === token;
}

async function removePlayer(playerId) {
  const redis = getRedis();
  await redis.hdel(K.players, playerId);
  await redis.hdel(K.tokens, playerId);
  await redis.zrem(K.scores, playerId);
}

async function nextQuestion() {
  const redis = getRedis();
  const ids = (await redis.lrange(K.questionOrder, 0, -1)) || [];
  const game = await getGame();
  const nextIndex = game.currentIndex + 1;
  if (nextIndex >= ids.length) {
    return { error: '더 이상 등록된 문제가 없습니다.' };
  }
  const qid = ids[nextIndex];
  await setGame({
    phase: 'question',
    view: 'question',
    currentQuestionId: qid,
    currentIndex: nextIndex,
    questionStartedAt: Date.now(),
    rouletteSpin: null,
  });
  return { ok: true };
}

async function revealAnswer() {
  await setGame({ phase: 'reveal', view: 'question' });
  return { ok: true };
}

async function setView(view) {
  if (!['question', 'leaderboard', 'roulette', 'final'].includes(view)) {
    return { error: '알 수 없는 화면입니다.' };
  }
  await setGame({ view });
  return { ok: true };
}

async function submitAnswer({ playerId, token, questionId, choiceIndex }) {
  const redis = getRedis();
  const valid = await verifyPlayer(playerId, token);
  if (!valid) return { error: '참가 정보가 올바르지 않습니다. 다시 접속해주세요.' };

  const game = await getGame();
  if (game.phase !== 'question' || game.currentQuestionId !== questionId) {
    return { error: '지금은 답변을 제출할 수 없습니다.' };
  }

  const questionMap = await redis.hget(K.questions, questionId);
  const question = questionMap;
  if (!question) return { error: '문제를 찾을 수 없습니다.' };

  const elapsedMs = Date.now() - (game.questionStartedAt || 0);
  if (elapsedMs > question.timeLimitSeconds * 1000 + 1500) {
    return { error: '제출 시간이 종료되었습니다.' };
  }

  const claimed = await redis.hsetnx(K.answered(questionId), playerId, 1);
  if (!claimed) return { error: '이미 답변을 제출했습니다.' };

  const correct = Number(choiceIndex) === Number(question.correctIndex);
  let bonus = 0;
  if (correct) {
    const order = await redis.rpush(K.buzz(questionId), playerId);
    if (order === 1) bonus = 1;
    await redis.zincrby(K.scores, question.points + bonus, playerId);
  }

  await redis.hset(K.answered(questionId), {
    [playerId]: { choiceIndex: Number(choiceIndex), correct, bonus, answeredAt: Date.now() },
  });

  return { ok: true, correct, bonus };
}

async function spinRoulette({ playerId }) {
  const redis = getRedis();
  const prizes = await listPrizes();
  const available = prizes.filter((p) => p.remaining > 0);
  if (available.length === 0) return { error: '남은 상품이 없습니다.' };
  const playerMap = await redis.hget(K.players, playerId);
  if (!playerMap) return { error: '참가자를 찾을 수 없습니다.' };

  const winner = available[Math.floor(Math.random() * available.length)];
  winner.remaining -= 1;
  await redis.hset(K.prizes, { [winner.id]: winner });

  const spin = { playerId, playerName: playerMap.name, prizeId: winner.id, prizeLabel: winner.label, at: Date.now() };
  await setGame({ view: 'roulette', rouletteSpin: spin });
  return { ok: true, spin };
}

async function finalReveal() {
  await setGame({ view: 'final', finalRevealed: true });
  return { ok: true };
}

async function resetGame() {
  const redis = getRedis();
  const questionIds = (await redis.lrange(K.questionOrder, 0, -1)) || [];
  const keysToDelete = [K.players, K.tokens, K.scores];
  for (const qid of questionIds) {
    keysToDelete.push(K.answered(qid), K.buzz(qid));
  }
  await redis.del(...keysToDelete);

  const prizes = await listPrizes();
  for (const prize of prizes) {
    prize.remaining = prize.stock;
    await redis.hset(K.prizes, { [prize.id]: prize });
  }

  await redis.del(K.game);
  await setGame({ ...DEFAULT_GAME });
  return { ok: true };
}

async function getPublicState() {
  const game = await getGame();
  const questions = await listQuestions();
  const currentQuestion = questions.find((q) => q.id === game.currentQuestionId) || null;

  let questionPayload = null;
  if (currentQuestion) {
    questionPayload = {
      id: currentQuestion.id,
      text: currentQuestion.text,
      choices: currentQuestion.choices,
      points: currentQuestion.points,
      timeLimitSeconds: currentQuestion.timeLimitSeconds,
      questionStartedAt: game.questionStartedAt,
      correctIndex: game.phase === 'reveal' ? currentQuestion.correctIndex : null,
    };
  }

  let answerStats = null;
  if (currentQuestion && game.phase === 'reveal') {
    const redis = getRedis();
    const answers = (await redis.hgetall(K.answered(currentQuestion.id))) || {};
    const list = Object.values(answers).filter((a) => a && typeof a === 'object');
    const correctCount = list.filter((a) => a.correct).length;
    const buzzOrder = (await redis.lrange(K.buzz(currentQuestion.id), 0, 0)) || [];
    const playersMap = (await redis.hgetall(K.players)) || {};
    const firstCorrect = buzzOrder[0] ? playersMap[buzzOrder[0]] : null;
    answerStats = {
      totalAnswered: list.length,
      correctCount,
      firstCorrectName: firstCorrect ? `${firstCorrect.team} ${firstCorrect.name}` : null,
    };
  }

  const leaderboard = await getLeaderboard(300);
  const players = await listPlayers();
  const prizes = await listPrizes();

  return {
    phase: game.phase,
    view: game.view,
    questionNumber: game.currentIndex + 1,
    totalQuestions: questions.length,
    question: questionPayload,
    answerStats,
    leaderboard,
    totalPlayers: players.length,
    prizes: prizes.map((p) => ({ id: p.id, label: p.label, remaining: p.remaining, stock: p.stock })),
    rouletteSpin: game.view === 'roulette' ? game.rouletteSpin : null,
    finalRevealed: game.view === 'final' && game.finalRevealed,
  };
}

async function getAdminState() {
  const game = await getGame();
  const questions = await listQuestions();
  const players = await listPlayers();
  const prizes = await listPrizes();
  return { game, questions, players, prizes };
}

module.exports = {
  getGame,
  setGame,
  listQuestions,
  addQuestion,
  deleteQuestion,
  listPrizes,
  addPrize,
  deletePrize,
  listPlayers,
  getLeaderboard,
  joinPlayer,
  verifyPlayer,
  removePlayer,
  nextQuestion,
  revealAnswer,
  setView,
  submitAnswer,
  spinRoulette,
  finalReveal,
  resetGame,
  getPublicState,
  getAdminState,
};
