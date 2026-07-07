const { submitAnswer } = require('../../lib/quizStore');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { playerId, token, questionId, choiceIndex } = req.body || {};
  if (!playerId || !token || !questionId || choiceIndex === undefined) {
    res.status(400).json({ error: '잘못된 요청입니다.' });
    return;
  }
  try {
    const result = await submitAnswer({ playerId, token, questionId, choiceIndex });
    if (result.error) {
      res.status(400).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
