const { generateClientTokenFromReadWriteToken } = require('@vercel/blob/client');
const { isAuthed } = require('../lib/auth');
const { SLOTS } = require('../lib/slots');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!isAuthed(req)) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  const { filename = 'photo', contentType = 'image/jpeg', slot = 'hero' } = req.body || {};
  if (!SLOTS[slot]) {
    res.status(400).json({ error: '알 수 없는 slot입니다.' });
    return;
  }
  if (!ALLOWED_TYPES.includes(contentType)) {
    res.status(400).json({ error: '지원하지 않는 이미지 형식입니다.' });
    return;
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const pathname = `${SLOTS[slot].prefix}${Date.now()}-${safeName}`;

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname,
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: 15 * 1024 * 1024,
      validUntil: Date.now() + 5 * 60 * 1000,
    });
    res.status(200).json({ clientToken, pathname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
