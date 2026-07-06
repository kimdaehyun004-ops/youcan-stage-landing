const crypto = require('crypto');

function sign(expiry) {
  return crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(`admin:${expiry}`)
    .digest('hex');
}

function parseCookies(req) {
  if (req.cookies) return req.cookies;
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  const cookie = cookies.admin_session || '';
  const dot = cookie.lastIndexOf('.');
  if (dot === -1) return false;
  const expiryStr = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expiry = Number(expiryStr);
  if (!expiry || expiry < Date.now()) return false;

  const expected = sign(expiry);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sessionCookie(req, expiry) {
  const sig = sign(expiry);
  const isHttps = req.headers['x-forwarded-proto'] === 'https';
  return [
    `admin_session=${expiry}.${sig}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${7 * 24 * 60 * 60}`,
    isHttps ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function clearCookie() {
  return 'admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}

module.exports = { isAuthed, sessionCookie, clearCookie };
