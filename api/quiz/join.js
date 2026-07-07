const { joinPlayer } = require('../../lib/quizStore');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { team, name } = req.body || {};
  if (!team || !String(team).trim() || !name || !String(name).trim()) {
    res.status(400).json({ error: '소속과 이름을 입력해주세요.' });
    return;
  }
  try {
    const { playerId, token, player } = await joinPlayer({ team, name });
    res.status(200).json({ playerId, token, player });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
