const { sessionCookie } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { password } = req.body || {};
  if (password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    return;
  }

  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  res.setHeader('Set-Cookie', sessionCookie(req, expiry));
  res.status(200).json({ ok: true });
};
