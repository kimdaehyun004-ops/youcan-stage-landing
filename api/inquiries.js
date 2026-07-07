const { put, list, get, del } = require('@vercel/blob');
const { isAuthed } = require('../lib/auth');
const { sendInquiryEmail } = require('../lib/notify');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const { eventType, date, location, budget, contact, message } = req.body || {};
    if (!eventType || !contact) {
      res.status(400).json({ error: '행사 종류와 연락처는 필수입니다.' });
      return;
    }

    const inquiry = {
      eventType,
      date: date || '',
      location: location || '',
      budget: budget || '',
      contact,
      message: message || '',
      createdAt: new Date().toISOString(),
    };
    const pathname = `inquiries/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;

    try {
      await put(pathname, JSON.stringify(inquiry), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      await sendInquiryEmail(inquiry);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'GET') {
    if (!isAuthed(req)) {
      res.status(401).json({ error: '로그인이 필요합니다.' });
      return;
    }
    try {
      const { blobs } = await list({ prefix: 'inquiries/' });
      const inquiries = await Promise.all(
        blobs.map(async (b) => {
          const result = await get(b.pathname, { access: 'public' });
          const text = await new Response(result.stream).text();
          return { pathname: b.pathname, ...JSON.parse(text) };
        })
      );
      inquiries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.status(200).json({ inquiries });
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
    const { pathname } = req.body || {};
    if (!pathname) {
      res.status(400).json({ error: 'pathname이 필요합니다.' });
      return;
    }
    try {
      await del(pathname);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
