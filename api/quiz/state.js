const { getPublicState } = require('../../lib/quizStore');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const state = await getPublicState();
    res.status(200).json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
