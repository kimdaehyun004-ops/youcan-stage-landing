const { put, list, get, del } = require('@vercel/blob');
const { isAuthed } = require('../lib/auth');
const { isValidSlot } = require('../lib/slots');

// Each photo's caption is its own blob (keyed by a deterministic filename
// derived from the photo's pathname), so setting one caption never requires
// reading and rewriting a shared JSON file — avoiding lost-update races.
function captionPathFor(slot, photoPathname) {
  const key = Buffer.from(photoPathname).toString('base64url');
  return `captions/${slot}/${key}.json`;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const slot = req.query?.slot;
    if (!isValidSlot(slot)) {
      res.status(400).json({ error: '알 수 없는 slot입니다.' });
      return;
    }
    try {
      const { blobs } = await list({ prefix: `captions/${slot}/` });
      const entries = await Promise.all(
        blobs.map(async (b) => {
          try {
            const result = await get(b.pathname, { access: 'public' });
            const text = await new Response(result.stream).text();
            const { pathname, caption } = JSON.parse(text);
            return [pathname, caption];
          } catch (err) {
            return null;
          }
        })
      );
      const captions = Object.fromEntries(entries.filter(Boolean));
      res.status(200).json({ captions });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!isAuthed(req)) {
      res.status(401).json({ error: '로그인이 필요합니다.' });
      return;
    }
    const { slot, pathname, caption } = req.body || {};
    if (!isValidSlot(slot) || !pathname) {
      res.status(400).json({ error: 'slot과 pathname이 필요합니다.' });
      return;
    }
    const captionPath = captionPathFor(slot, pathname);
    try {
      if (caption) {
        await put(captionPath, JSON.stringify({ pathname, caption }), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: true,
        });
      } else {
        await del(captionPath);
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
