const router = require('express').Router();
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const all = (s, p = []) =>
  new Promise((r, j) => db.all(s, p, (e, x) => (e ? j(e) : r(x))));

const run = (s, p = []) =>
  new Promise((r, j) =>
    db.run(s, p, function (e) {
      e ? j(e) : r({ changes: this.changes });
    })
  );

router.get('/', async (req, res) => {
  try {
    const items = await all(
      'SELECT id, title, message, type, read_at, created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100',
      [req.user.id]
    );
    res.json({
      notifications: items,
      unread: items.filter((n) => !n.read_at).length
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not load notifications.' });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    await run(
      'UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not update notification.' });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    await run(
      'UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not update notifications.' });
  }
});

router.post('/broadcast', async (req, res) => {
  if (
    !process.env.ADMIN_EMAIL ||
    req.user.email.toLowerCase() !== process.env.ADMIN_EMAIL.toLowerCase()
  ) {
    return res.status(403).json({ error: 'Admin access required. Set ADMIN_EMAIL in .env.' });
  }

  const title = String(req.body.title || '').trim().slice(0, 160);
  const message = String(req.body.message || '').trim().slice(0, 2000);

  if (!title || !message) {
    return res.status(400).json({ error: 'Announcement title and message are required.' });
  }

  try {
    await new Promise((resolve, reject) =>
      db.run(
        "INSERT INTO notifications(user_id, title, message, type) SELECT id, ?, ?, 'announcement' FROM users",
        [title, message],
        (e) => (e ? reject(e) : resolve())
      )
    );
    res.status(201).json({ ok: true, message: 'Announcement sent to all users.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not send announcement.' });
  }
});

module.exports = router;
