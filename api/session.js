const { isAuthed } = require('../lib/auth');

module.exports = (req, res) => {
  res.status(200).json({ authed: isAuthed(req) });
};
