const { list, del } = require('@vercel/blob');
const { isAuthed } = require('../lib/auth');
const { isValidSlot, prefixForSlot } = require('../lib/slots');

function sortByNewest(blobs) {
  return blobs
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .map((b) => ({ url: b.url, pathname: b.pathname, uploadedAt: b.uploadedAt }));
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const slotsParam = req.query?.slots;

    if (slotsParam) {
      const slots = [...new Set(slotsParam.split(',').map((s) => s.trim()).filter(Boolean))];
      const invalid = slots.find((s) => !isValidSlot(s));
      if (invalid) {
        res.status(400).json({ error: `알 수 없는 slot입니다: ${invalid}` });
        return;
      }
      try {
        // One list() call for everything under photos/, then bucket by slot —
        // far fewer round trips to Blob than one list() per slot.
        const { blobs } = await list({ prefix: 'photos/' });
        const photosBySlot = {};
        for (const slot of slots) {
          const prefix = prefixForSlot(slot);
          photosBySlot[slot] = sortByNewest(blobs.filter((b) => b.pathname.startsWith(prefix)));
        }
        res.status(200).json({ photosBySlot });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    const slot = req.query?.slot || 'hero';
    if (!isValidSlot(slot)) {
      res.status(400).json({ error: '알 수 없는 slot입니다.' });
      return;
    }
    try {
      const { blobs } = await list({ prefix: prefixForSlot(slot) });
      res.status(200).json({ photos: sortByNewest(blobs) });
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
