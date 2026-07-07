const QRCode = require('qrcode');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const joinUrl = `${proto}://${host}/quiz/play.html`;

  try {
    const buffer = await QRCode.toBuffer(joinUrl, {
      type: 'png',
      width: 480,
      margin: 1,
      color: { dark: '#0A0910', light: '#F5F4F2' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
