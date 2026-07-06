const { list, del } = require('@vercel/blob');
const { isAuthed } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: 'event-photos/' });
      const photos = blobs
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
        .map((b) => ({ url: b.url, pathname: b.pathname, uploadedAt: b.uploadedAt }));
      res.status(200).json({ photos });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    if (!isAuthed(req)) {
      res.status(401).json({ error: '로그인이 필요합니다.' });
      return;
    }
    const { url } = req.body || {};
    if (!url) {
      res.status(400).json({ error: 'url이 필요합니다.' });
      return;
    }
    try {
      await del(url);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
