const router = require('express').Router();
const { db } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const run = (s, p = []) =>
  new Promise((r, j) =>
    db.run(s, p, function (e) {
      e ? j(e) : r({ id: this.lastID, changes: this.changes });
    })
  );

const all = (s, p = []) =>
  new Promise((r, j) =>
    db.all(s, p, (e, x) => (e ? j(e) : r(x)))
  );

function validateResource(b) {
  const title = String(b.title || '').trim();
  if (!title || title.length > 180) {
    throw Error('Note title is required (max 180 characters).');
  }
  const url = String(b.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) {
    throw Error('Resource URL must start with http:// or https://.');
  }
  return {
    title,
    url,
    notes: String(b.notes || '').slice(0, 5000),
    category: String(b.category || 'General').slice(0, 120)
  };
}

// GET /api/resources - List and search notes
router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    let sql = 'SELECT * FROM resources WHERE user_id=?';
    const p = [req.user.id];

    if (q) {
      sql += ' AND (title LIKE ? OR notes LIKE ? OR category LIKE ?)';
      p.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ' ORDER BY updated_at DESC';
    const resources = await all(sql, p);
    res.json({ resources });
  } catch (e) {
    res.status(500).json({ error: 'Could not load notes.' });
  }
});

// DELETE /api/resources/clear-all - Clear all notes with confirmation
router.delete('/clear-all', async (req, res) => {
  try {
    const r = await run('DELETE FROM resources WHERE user_id=?', [req.user.id]);
    res.json({ ok: true, cleared_count: r.changes, message: `Cleared ${r.changes} notes.` });
  } catch (e) {
    res.status(500).json({ error: 'Could not clear notes: ' + e.message });
  }
});

// POST /api/resources - Create note
router.post('/', async (req, res) => {
  try {
    const x = validateResource(req.body);
    const r = await run(
      'INSERT INTO resources(user_id,title,url,notes,category) VALUES(?,?,?,?,?)',
      [req.user.id, x.title, x.url, x.notes, x.category]
    );
    res.status(201).json({ resource: { id: r.id, ...x } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/resources/:id - Edit note
router.put('/:id', async (req, res) => {
  try {
    const x = validateResource(req.body);
    const r = await run(
      'UPDATE resources SET title=?,url=?,notes=?,category=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',
      [x.title, x.url, x.notes, x.category, req.params.id, req.user.id]
    );
    if (!r.changes) return res.status(404).json({ error: 'Note not found.' });
    res.json({ resource: { id: Number(req.params.id), ...x } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/resources/:id - Delete note
router.delete('/:id', async (req, res) => {
  try {
    const r = await run('DELETE FROM resources WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!r.changes) return res.status(404).json({ error: 'Note not found.' });
    res.json({ message: 'Note deleted.' });
  } catch (e) {
    res.status(500).json({ error: 'Could not delete note.' });
  }
});

module.exports = router;
